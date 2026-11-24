import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  ImageGenerationError,
  detectImageGenerationIntent,
  generateImageAsset,
} from './imageService.mjs';
import {
  classifyQueryIntent,
  extractWeatherLocations,
  fetchLiveWebResults,
  fetchNewsFeed,
  fetchWeatherForLocation,
  formatNewsContext,
  formatWeatherContext,
  formatWebContext,
} from './liveServices.mjs';

export const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
export const GROUNDED_MODEL = 'gemini-4-hydrogen';

const SUGGESTIONS_MARKER = '<<<SUGGESTIONS>>>';

// Remembers for 10 minutes if Gemini Search Grounding tool is unavailable/quota-limited (429/400/404)
let searchGroundingBlockedUntil = 0;

const BASE_SYSTEM_INSTRUCTION =
  'You are Lumina, a fast, accurate, helpful all-in-one AI assistant. Give clear, well-structured answers using clean Markdown (including code blocks and tables when helpful). Never fabricate breaking news, live scores, weather conditions, dates, or URLs. When live data, search results, or attached files are provided, base your answer strictly on them and clearly mention if anything cannot be verified.';

const getWeatherDeclaration = {
  name: 'getWeatherForecast',
  description:
    'Get real-time current weather conditions and a 7-day forecast for a city, region, or country.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      locations: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description:
          'One or more city/location names to check or compare (e.g. ["London"] or ["London", "Dubai"]).',
      },
    },
    required: ['locations'],
  },
};

export function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function parseApiError(err) {
  if (err instanceof ImageGenerationError || err?.name === 'ImageGenerationError') {
    return {
      status: typeof err.status === 'number' ? err.status : 502,
      code: 'IMAGE_GENERATION_FAILED',
      message: err.message,
    };
  }
  const errObj = err || {};
  const statusCode = typeof errObj.status === 'number' ? errObj.status : 0;
  const rawMessage = err instanceof Error ? err.message : String(err);
  const lower = rawMessage.toLowerCase();

  console.error('[Gemini API Error]', { statusCode, message: rawMessage.slice(0, 300) });

  if (
    statusCode === 429 ||
    lower.includes('429') ||
    lower.includes('resource_exhausted') ||
    lower.includes('quota') ||
    lower.includes('rate')
  ) {
    return {
      status: 429,
      code: 'RATE_LIMIT',
      message: 'Rate limit reached on the free Gemini tier. Please wait a moment and try again.',
    };
  }

  if (
    statusCode === 401 ||
    statusCode === 403 ||
    lower.includes('api_key_invalid') ||
    lower.includes('api key not valid') ||
    lower.includes('permission_denied') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return {
      status: 403,
      code: 'AUTH_ERROR',
      message: 'Gemini API authentication failed. Please verify your GEMINI_API_KEY configuration.',
    };
  }

  if (statusCode === 404 || lower.includes('not_found') || lower.includes('404')) {
    return {
      status: 404,
      code: 'MODEL_NOT_FOUND',
      message: 'The configured AI model is currently unavailable. Please try again shortly.',
    };
  }

  if (statusCode === 400 || lower.includes('invalid_argument')) {
    return {
      status: 400,
      code: 'BAD_REQUEST',
      message: 'The request could not be processed. Please rephrase and try again.',
    };
  }

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  ) {
    return {
      status: 503,
      code: 'NETWORK_ERROR',
      message: 'Unable to reach the AI service due to a temporary network issue. Please retry.',
    };
  }

  return {
    status: 500,
    code: 'UPSTREAM_ERROR',
    message: 'Something went wrong while generating a response. Please try again.',
  };
}

async function withRetry(fn, maxRetries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const isTransient =
        msg.includes('503') ||
        msg.includes('unavailable') ||
        msg.includes('etimedout') ||
        msg.includes('econnreset');

      if (!isTransient || attempt === maxRetries) {
        throw err;
      }

      const delayMs = 150 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function sanitizeAttachments(rawAttachments) {
  if (!Array.isArray(rawAttachments)) return [];
  const valid = [];
  for (const att of rawAttachments.slice(0, 4)) {
    if (!att || typeof att !== 'object') continue;
    const kind = att.kind;
    const name = typeof att.name === 'string' ? att.name.slice(0, 140) : 'file';
    const mimeType = typeof att.mimeType === 'string' ? att.mimeType.slice(0, 100) : 'application/octet-stream';

    if (kind === 'image' || kind === 'pdf') {
      const base64Data = typeof att.base64Data === 'string' ? att.base64Data.trim() : '';
      if (!base64Data || base64Data.length > 5_500_000) continue;
      valid.push({
        kind,
        name,
        mimeType:
          kind === 'pdf'
            ? 'application/pdf'
            : mimeType.startsWith('image/')
            ? mimeType
            : 'image/jpeg',
        base64Data,
      });
    } else if (kind === 'text') {
      const textContent = typeof att.textContent === 'string' ? att.textContent.slice(0, 60000) : '';
      if (!textContent) continue;
      valid.push({
        kind: 'text',
        name,
        mimeType,
        textContent,
      });
    }
  }
  return valid;
}

export function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const sanitized = [];
  for (const item of raw.slice(-12)) {
    if (!item || typeof item !== 'object') return null;
    const role = item.role;
    const content = typeof item.content === 'string' ? item.content : '';
    if (role !== 'user' && role !== 'assistant') {
      return null;
    }
    const trimmed = content.trim();
    const attachments = role === 'user' ? sanitizeAttachments(item.attachments) : [];
    if (!trimmed && attachments.length === 0) continue;
    sanitized.push({
      role,
      content: trimmed.slice(0, 32000),
      attachments,
    });
  }

  if (sanitized.length === 0 || sanitized[sanitized.length - 1].role !== 'user') {
    return null;
  }

  return sanitized;
}

function sanitizePreferences(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      name: '',
      role: '',
      responseStyle: 'balanced',
      customInstructions: '',
      askClarifyingQuestions: true,
      showSuggestions: true,
    };
  }
  const allowedStyles = new Set(['balanced', 'concise', 'detailed', 'creative']);
  return {
    name: typeof raw.name === 'string' ? raw.name.trim().slice(0, 60) : '',
    role: typeof raw.role === 'string' ? raw.role.trim().slice(0, 80) : '',
    responseStyle: allowedStyles.has(raw.responseStyle) ? raw.responseStyle : 'balanced',
    customInstructions:
      typeof raw.customInstructions === 'string' ? raw.customInstructions.trim().slice(0, 800) : '',
    askClarifyingQuestions: raw.askClarifyingQuestions !== false,
    showSuggestions: raw.showSuggestions !== false,
  };
}

function buildPreferenceInstructions(prefs) {
  const lines = [];
  if (prefs.name || prefs.role) {
    const who = [prefs.name ? `Name: ${prefs.name}` : '', prefs.role ? `Role: ${prefs.role}` : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`User Profile (${who}).`);
  }

  if (prefs.responseStyle === 'concise') {
    lines.push('Style Preference: Keep answers crisp, direct, and scannable with minimal fluff.');
  } else if (prefs.responseStyle === 'detailed') {
    lines.push('Style Preference: Provide thorough explanations, edge cases, and step-by-step clarity.');
  } else if (prefs.responseStyle === 'creative') {
    lines.push('Style Preference: Use engaging, expressive, imaginative prose when writing or brainstorming.');
  }

  if (prefs.customInstructions) {
    lines.push(`Custom User Preferences: ${prefs.customInstructions}`);
  }

  if (prefs.askClarifyingQuestions) {
    lines.push(
      'Clarifying Questions Guideline: If the user request is genuinely ambiguous or underspecified (e.g., "write an email", "build me an app", "plan a trip", or "fix my code" without key details), briefly ask 1-3 focused clarifying questions so you can tailor the exact output instead of making blind assumptions. If the request is already clear, factual, or includes attached files, answer directly.'
    );
  }

  if (prefs.showSuggestions) {
    lines.push(
      `Follow-up Suggestions Guideline: At the very end of your response, on a new line outside any code block, append ${SUGGESTIONS_MARKER} followed immediately by a JSON array of 2 to 3 short, useful next prompts or follow-up questions tailored to the user (each under 48 characters), e.g. ${SUGGESTIONS_MARKER}["Explain with an example","Write unit tests"].`
    );
  }

  return lines.join('\n');
}

function buildGeminiContents(messages) {
  return messages.map((msg, idx) => {
    const isRecent = idx >= messages.length - 2;
    const parts = [];

    if (msg.role === 'user' && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      for (const att of msg.attachments) {
        if ((att.kind === 'image' || att.kind === 'pdf') && att.base64Data && isRecent) {
          parts.push({
            inlineData: {
              mimeType: att.mimeType,
              data: att.base64Data,
            },
          });
        } else if (att.kind === 'text' && att.textContent) {
          parts.push({
            text: `[Attached file: ${att.name}]\n\`\`\`\n${
              isRecent ? att.textContent : att.textContent.slice(0, 1200)
            }\n\`\`\``,
          });
        } else {
          parts.push({ text: `[Previously attached ${att.kind}: ${att.name}]` });
        }
      }
    }

    const text =
      msg.content ||
      (msg.attachments && msg.attachments.length > 0
        ? 'Please analyze the attached file(s) and summarize the key insights.'
        : '');
    if (text) {
      parts.push({ text });
    }

    return {
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });
}

function collectSourcesFromChunk(chunk, sourceMap) {
  const groundingChunks = chunk?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!Array.isArray(groundingChunks)) return;
  for (const gc of groundingChunks) {
    const uri = gc?.web?.uri;
    const title = gc?.web?.title;
    if (typeof uri === 'string' && uri.startsWith('http') && !sourceMap.has(uri)) {
      sourceMap.set(uri, {
        title: typeof title === 'string' && title.trim() ? title.trim() : new URL(uri).hostname,
        url: uri,
      });
    }
  }
}

function createSuggestionStreamExtractor(enabled, onVisibleText) {
  if (!enabled) {
    return {
      push: (chunk) => {
        if (chunk) onVisibleText(chunk);
      },
      finish: () => [],
    };
  }

  let pendingTail = '';
  let foundMarker = false;
  let suggestionsBuffer = '';

  const getTrailingPrefixLength = (str) => {
    const maxCheck = Math.min(str.length, SUGGESTIONS_MARKER.length - 1);
    for (let len = maxCheck; len > 0; len--) {
      if (SUGGESTIONS_MARKER.startsWith(str.slice(-len))) {
        return len;
      }
    }
    return 0;
  };

  return {
    push(chunk) {
      if (!chunk) return;
      if (foundMarker) {
        suggestionsBuffer += chunk;
        return;
      }

      pendingTail += chunk;
      const markerIdx = pendingTail.indexOf(SUGGESTIONS_MARKER);
      if (markerIdx !== -1) {
        const visible = pendingTail.slice(0, markerIdx).replace(/\s+$/, '');
        if (visible) onVisibleText(visible);
        foundMarker = true;
        suggestionsBuffer = pendingTail.slice(markerIdx + SUGGESTIONS_MARKER.length);
        pendingTail = '';
        return;
      }

      const prefixLen = getTrailingPrefixLength(pendingTail);
      const safeCutoff = pendingTail.length - prefixLen;
      if (safeCutoff > 0) {
        onVisibleText(pendingTail.slice(0, safeCutoff));
        pendingTail = pendingTail.slice(safeCutoff);
      }
    },
    finish() {
      if (!foundMarker && pendingTail) {
        onVisibleText(pendingTail);
        pendingTail = '';
      }
      if (!suggestionsBuffer) return [];
      const arrMatch = /\[[\s\S]*?\]/.exec(suggestionsBuffer);
      if (!arrMatch) return [];
      try {
        const parsed = JSON.parse(arrMatch[0]);
        if (!Array.isArray(parsed)) return [];
        return parsed
          .filter((item) => typeof item === 'string' && item.trim().length > 1)
          .map((item) => item.trim().slice(0, 64))
          .slice(0, 3);
      } catch {
        return [];
      }
    },
  };
}

function buildFallbackSuggestions({ intent, weatherReports, newsItems, hasAttachments }) {
  if (weatherReports.length > 0) {
    return [
      'Will it rain this weekend?',
      'What should I wear for this weather?',
      'Show hourly or wind details',
    ];
  }
  if (newsItems.length > 0) {
    return [
      'Summarize the top story in detail',
      'What are the key takeaways?',
      'Any related updates today?',
    ];
  }
  if (hasAttachments) {
    return [
      'Summarize the key points',
      'Extract any action items',
      'Explain any technical details',
    ];
  }
  if (/\b(code|bug|error|function|react|typescript|python|sql|css|api)\b/i.test(intent.prompt)) {
    return [
      'Add error handling & edge cases',
      'Explain this step by step',
      'Write unit tests for this',
    ];
  }
  return [];
}

async function streamWithFallback(ai, contents, systemInstruction, useSearch, isAborted, onChunk, sourceMap) {
  const trySearchTool = useSearch && Date.now() >= searchGroundingBlockedUntil;

  let stream;
  if (trySearchTool) {
    try {
      stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: PRIMARY_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            tools: [{ googleSearch: {} }],
          },
        })
      );
    } catch (searchErr) {
      const parsed = parseApiError(searchErr);
      if (parsed.status === 429 || parsed.status === 400 || parsed.status === 404) {
        searchGroundingBlockedUntil = Date.now() + 10 * 60 * 1000;
      } else {
        throw searchErr;
      }
    }
  }

  if (!stream) {
    try {
      stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: PRIMARY_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        })
      );
    } catch (primaryErr) {
      const parsed = parseApiError(primaryErr);
      if (parsed.status !== 404) {
        throw primaryErr;
      }
      stream = await withRetry(() =>
        ai.models.generateContentStream({
          model: GROUNDED_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        })
      );
    }
  }

  for await (const chunk of stream) {
    if (isAborted()) break;
    collectSourcesFromChunk(chunk, sourceMap);
    const text = chunk.text;
    if (text) {
      onChunk(text);
    }
  }
}

export async function runLiveChat({
  ai,
  messages,
  timezone = '',
  forceWebSearch = false,
  preferences: rawPreferences,
  imageOptions,
  isAborted = () => false,
  emitEvent,
}) {
  const preferences = sanitizePreferences(rawPreferences);
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
  const lastPrompt = lastUserMsg?.content || '';
  const hasAttachments = Array.isArray(lastUserMsg?.attachments) && lastUserMsg.attachments.length > 0;

  // Dedicated Image Generation path (explicit Image Mode OR natural-language image request without attachments)
  const detectedImagePrompt = !hasAttachments
    ? imageOptions?.forceImageMode
      ? lastPrompt
      : detectImageGenerationIntent(lastPrompt)
    : null;

  if (detectedImagePrompt) {
    emitEvent({ status: 'Generating image...' });
    const generated = await generateImageAsset({
      prompt: detectedImagePrompt,
      aspectRatio: imageOptions?.aspectRatio || '1:1',
      style: imageOptions?.style || '',
    });
    if (isAborted()) return;

    emitEvent({ image: generated });
    emitEvent({
      text: `Here is the generated image for **"${generated.prompt}"** (${generated.aspectRatio}${
        generated.style ? `, ${generated.style}` : ''
      }).`,
    });
    if (preferences.showSuggestions) {
      emitEvent({
        suggestions: [
          'Generate a new variation',
          'Try this in 16:9 landscape',
          'Make an illustration version',
        ],
      });
    }
    return;
  }

  const intent = classifyQueryIntent(messages, forceWebSearch);

  let weatherReports = [];
  let newsItems = [];
  let webResult = { snippets: [], sources: [], newsItems: [] };
  let weatherLookupAttempted = false;

  const weatherLocations = intent.isWeather
    ? extractWeatherLocations(intent.prompt, timezone)
    : [];
  const needsIndirectWeather = intent.isWeather && weatherLocations.length === 0;
  const shouldFetchWeb = !intent.newsQuery && (intent.needsGoogleSearch || needsIndirectWeather);

  if (intent.isWeather || intent.newsQuery || shouldFetchWeb) {
    if (intent.isWeather && intent.newsQuery) {
      emitEvent({ status: 'Fetching live weather & news...' });
    } else if (intent.isWeather) {
      emitEvent({ status: 'Fetching live weather forecast...' });
    } else if (intent.newsQuery) {
      emitEvent({ status: 'Fetching latest news & web updates...' });
    } else {
      emitEvent({ status: 'Searching live web sources...' });
    }
  } else if (hasAttachments) {
    emitEvent({ status: 'Analyzing attached file(s)...' });
  }

  const weatherPromise =
    weatherLocations.length > 0
      ? (async () => {
          weatherLookupAttempted = true;
          const results = await Promise.all(
            weatherLocations.slice(0, 3).map((loc) => fetchWeatherForLocation(loc))
          );
          return results.filter(Boolean);
        })()
      : Promise.resolve([]);

  const newsPromise = intent.newsQuery
    ? fetchNewsFeed({
        topic: intent.newsQuery.topic,
        query: intent.newsQuery.query,
        limit: 6,
      })
    : Promise.resolve([]);

  const webPromise = shouldFetchWeb
    ? fetchLiveWebResults(intent.prompt)
    : Promise.resolve({ snippets: [], sources: [], newsItems: [] });

  [weatherReports, newsItems, webResult] = await Promise.all([
    weatherPromise,
    newsPromise,
    webPromise,
  ]);

  if (isAborted()) return;

  if (weatherReports.length > 0) {
    emitEvent({ weather: weatherReports });
  }
  if (newsItems.length > 0) {
    emitEvent({ news: newsItems });
  }

  const nowStr = new Date().toUTCString();
  const contextSections = [`Current UTC time: ${nowStr}`];
  if (timezone) {
    contextSections.push(`User timezone: ${timezone}`);
  }
  const prefBlock = buildPreferenceInstructions(preferences);
  if (prefBlock) {
    contextSections.push(prefBlock);
  }
  if (weatherReports.length > 0) {
    contextSections.push(formatWeatherContext(weatherReports));
  } else if (weatherLookupAttempted) {
    contextSections.push(
      `Weather lookup notice: Live weather data could not be retrieved for "${weatherLocations.join(
        ', '
      )}". Do NOT fabricate temperatures or forecasts; clearly let the user know the location could not be resolved or the weather service is unavailable.`
    );
  }
  if (newsItems.length > 0) {
    contextSections.push(formatNewsContext(newsItems));
  }
  if (webResult.snippets.length > 0) {
    contextSections.push(formatWebContext(webResult));
  } else if (shouldFetchWeb && !needsIndirectWeather) {
    contextSections.push(
      'Live search notice: No real-time web results were returned for this query. Only state facts you are certain of, and clearly mention if current/live verification was unavailable.'
    );
  }

  const systemInstruction = `${BASE_SYSTEM_INSTRUCTION}\n\n${contextSections.join('\n\n')}`;
  const contents = buildGeminiContents(messages);

  const sourceMap = new Map();
  for (const s of webResult.sources) {
    if (s?.url && !sourceMap.has(s.url)) {
      sourceMap.set(s.url, s);
    }
  }

  const suggestionStream = createSuggestionStreamExtractor(
    preferences.showSuggestions,
    (visibleText) => {
      if (visibleText && !isAborted()) {
        emitEvent({ text: visibleText });
      }
    }
  );

  if (needsIndirectWeather) {
    try {
      const tools = [{ functionDeclarations: [getWeatherDeclaration] }];
      const turn1 = await withRetry(() =>
        ai.models.generateContent({
          model: PRIMARY_MODEL,
          contents,
          config: {
            systemInstruction,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            tools,
          },
        })
      );

      if (isAborted()) return;

      const previousContent = turn1.candidates?.[0]?.content;
      const weatherCalls = (turn1.functionCalls || []).filter(
        (fc) => fc.name === 'getWeatherForecast'
      );

      if (previousContent && weatherCalls.length > 0) {
        const requestedLocs = weatherCalls.flatMap((fc) =>
          Array.isArray(fc.args?.locations) ? fc.args.locations.map(String) : []
        );
        const fetched = (
          await Promise.all(requestedLocs.slice(0, 3).map((loc) => fetchWeatherForLocation(loc)))
        ).filter(Boolean);

        if (fetched.length > 0) {
          sourceMap.clear();
          weatherReports = fetched;
          emitEvent({ weather: fetched });
        }

        const functionResponses = weatherCalls.map((fc) => ({
          functionResponse: {
            id: fc.id,
            name: fc.name,
            response: {
              report:
                fetched.length > 0
                  ? formatWeatherContext(fetched)
                  : 'Weather data unavailable for the requested location.',
            },
          },
        }));

        const followUpContents = [
          ...contents,
          previousContent,
          { role: 'user', parts: functionResponses },
        ];

        const stream2 = await withRetry(() =>
          ai.models.generateContentStream({
            model: PRIMARY_MODEL,
            contents: followUpContents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
              tools,
            },
          })
        );

        for await (const chunk of stream2) {
          if (isAborted()) break;
          const text = chunk.text;
          if (text) suggestionStream.push(text);
        }
      } else if (turn1.text) {
        suggestionStream.push(turn1.text);
      }
    } catch {
      await streamWithFallback(
        ai,
        contents,
        systemInstruction,
        false,
        isAborted,
        (text) => suggestionStream.push(text),
        sourceMap
      );
    }
  } else {
    const useGoogleSearch = intent.needsGoogleSearch;

    await streamWithFallback(
      ai,
      contents,
      systemInstruction,
      useGoogleSearch,
      isAborted,
      (text) => suggestionStream.push(text),
      sourceMap
    );
  }

  if (!isAborted()) {
    const modelSuggestions = suggestionStream.finish();
    const sources = Array.from(sourceMap.values()).slice(0, 8);
    if (sources.length > 0) {
      emitEvent({ sources });
    }
    if (preferences.showSuggestions) {
      const suggestions =
        modelSuggestions.length > 0
          ? modelSuggestions
          : buildFallbackSuggestions({ intent, weatherReports, newsItems, hasAttachments });
      if (suggestions.length > 0) {
        emitEvent({ suggestions });
      }
    }
  }
}
