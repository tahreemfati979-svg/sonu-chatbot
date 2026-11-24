import type {
  ChatAttachment,
  GeneratedImage,
  GroundedSource,
  ImageAspectRatio,
  NewsItem,
  Role,
  UserPreferences,
  WeatherReport,
} from '../types/chat';

export interface ApiMessagePayload {
  role: Role;
  content: string;
  attachments?: Array<{
    kind: ChatAttachment['kind'];
    name: string;
    mimeType: string;
    base64Data?: string;
    textContent?: string;
  }>;
  generatedImageMeta?: {
    prompt: string;
    enhancedPrompt?: string;
    style?: string;
    aspectRatio?: ImageAspectRatio;
  };
}

export interface StreamCallbacks {
  onStatus?: (status: string) => void;
  onWeather?: (weather: WeatherReport[]) => void;
  onNews?: (news: NewsItem[]) => void;
  onSources?: (sources: GroundedSource[]) => void;
  onImage?: (image: GeneratedImage) => void;
  onSuggestions?: (suggestions: string[]) => void;
  onChunk: (chunkText: string) => void;
}

export async function generateImageRequest(opts: {
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: ImageAspectRatio;
  style?: string;
  seed?: number;
  signal?: AbortSignal;
}): Promise<GeneratedImage> {
  const response = await fetch('/api/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: opts.prompt,
      enhancedPrompt: opts.enhancedPrompt,
      aspectRatio: opts.aspectRatio || '1:1',
      style: opts.style || '',
      seed: opts.seed,
    }),
    signal: opts.signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.image) {
    throw new Error(
      typeof data?.error === 'string' ? data.error : `Image generation failed (${response.status}).`
    );
  }
  return data.image as GeneratedImage;
}

export async function streamChatCompletion(
  messages: ApiMessagePayload[],
  callbacks: StreamCallbacks,
  options?: {
    signal?: AbortSignal;
    forceWebSearch?: boolean;
    preferences?: UserPreferences;
    imageOptions?: {
      forceImageMode?: boolean;
      aspectRatio?: ImageAspectRatio;
      style?: string;
    };
  }
): Promise<string> {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages,
      stream: true,
      timezone,
      forceWebSearch: Boolean(options?.forceWebSearch),
      preferences: options?.preferences,
      imageOptions: options?.imageOptions,
    }),
    signal: options?.signal,
  });

  if (!response.ok) {
    let errorMessage =
      response.status === 404
        ? 'Chat API endpoint not found (404). Make sure the server is running and try again.'
        : `Request failed (${response.status})`;
    try {
      const data = await response.json();
      if (data && typeof data.error === 'string') {
        errorMessage = data.error;
      }
    } catch {
      // Fallback to HTTP status message
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    const data = await response.json();
    if (data?.error) {
      throw new Error(data.error);
    }
    if (Array.isArray(data?.weather)) callbacks.onWeather?.(data.weather);
    if (Array.isArray(data?.news)) callbacks.onNews?.(data.news);
    if (Array.isArray(data?.sources)) callbacks.onSources?.(data.sources);
    if (data?.image) callbacks.onImage?.(data.image);
    if (Array.isArray(data?.suggestions)) callbacks.onSuggestions?.(data.suggestions);
    const text = typeof data?.text === 'string' ? data.text : '';
    if (text) callbacks.onChunk(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;

        let parsed: {
          text?: string;
          status?: string;
          weather?: WeatherReport[];
          news?: NewsItem[];
          sources?: GroundedSource[];
          image?: GeneratedImage;
          suggestions?: string[];
          error?: string;
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }

        if (parsed.error) {
          throw new Error(parsed.error);
        }

        if (typeof parsed.status === 'string') {
          callbacks.onStatus?.(parsed.status);
        }
        if (Array.isArray(parsed.weather) && parsed.weather.length > 0) {
          callbacks.onWeather?.(parsed.weather);
        }
        if (Array.isArray(parsed.news) && parsed.news.length > 0) {
          callbacks.onNews?.(parsed.news);
        }
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          callbacks.onSources?.(parsed.sources);
        }
        if (parsed.image) {
          callbacks.onImage?.(parsed.image);
        }
        if (Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
          callbacks.onSuggestions?.(parsed.suggestions);
        }
        if (typeof parsed.text === 'string' && parsed.text.length > 0) {
          fullText += parsed.text;
          callbacks.onChunk(parsed.text);
        }
      }
    }
  }

  return fullText;
}
