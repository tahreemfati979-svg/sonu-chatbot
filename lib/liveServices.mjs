const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NEWS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const WEB_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 200;

const geocodeCache = new Map();
const weatherCache = new Map();
const newsCache = new Map();
const webSearchCache = new Map();
const inflightRequests = new Map();

function getCached(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(cache, key, value, ttlMs) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function dedupeInflight(key, fn) {
  const existing = inflightRequests.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => {
    inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

export function mapWeatherCode(code) {
  if (code === 0) return { label: 'Clear sky', category: 'clear' };
  if (code === 1) return { label: 'Mainly clear', category: 'clear' };
  if (code === 2) return { label: 'Partly cloudy', category: 'partly-cloudy' };
  if (code === 3) return { label: 'Overcast', category: 'cloudy' };
  if (code === 45 || code === 48) return { label: 'Foggy', category: 'fog' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', category: 'rain' };
  if (code >= 61 && code <= 67) return { label: 'Rain', category: 'rain' };
  if (code >= 71 && code <= 77) return { label: 'Snow', category: 'snow' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', category: 'rain' };
  if (code === 85 || code === 86) return { label: 'Snow showers', category: 'snow' };
  if (code >= 95 && code <= 99) return { label: 'Thunderstorm', category: 'storm' };
  return { label: 'Mixed conditions', category: 'cloudy' };
}

export async function geocodeLocation(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  const cached = getCached(geocodeCache, normalized);
  if (cached) return cached;

  return dedupeInflight(`geo:${normalized}`, async () => {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        query.trim()
      )}&count=1&language=en&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
      if (!res.ok) return null;
      const data = await res.json();
      const first = data?.results?.[0];
      if (!first) return null;

      const place = {
        name: first.name,
        admin1: first.admin1 || '',
        country: first.country || '',
        latitude: Number(first.latitude),
        longitude: Number(first.longitude),
        timezone: first.timezone || 'auto',
      };
      setCached(geocodeCache, normalized, place, GEOCODE_CACHE_TTL_MS);
      return place;
    } catch {
      return null;
    }
  });
}

export async function fetchWeatherForLocation(locationQuery) {
  const place = await geocodeLocation(locationQuery);
  if (!place) return null;

  const coordKey = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  const cached = getCached(weatherCache, coordKey);
  if (cached) return cached;

  return dedupeInflight(`weather:${coordKey}`, async () => {
    try {
      const params = new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        current:
          'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        daily:
          'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max',
        forecast_days: '7',
        timezone: 'auto',
      });

      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.current || !data?.daily) return null;

      const currentCode = Number(data.current.weather_code ?? 0);
      const currentMapped = mapWeatherCode(currentCode);

      const dates = Array.isArray(data.daily.time) ? data.daily.time : [];
      const daily = dates.slice(0, 7).map((dateStr, idx) => {
        const code = Number(data.daily.weather_code?.[idx] ?? 0);
        const mapped = mapWeatherCode(code);
        return {
          date: dateStr,
          condition: mapped.label,
          category: mapped.category,
          tempMaxC: Math.round(Number(data.daily.temperature_2m_max?.[idx] ?? 0)),
          tempMinC: Math.round(Number(data.daily.temperature_2m_min?.[idx] ?? 0)),
          rainChance: Math.round(Number(data.daily.precipitation_probability_max?.[idx] ?? 0)),
          windMaxKmh: Math.round(Number(data.daily.wind_speed_10m_max?.[idx] ?? 0)),
        };
      });

      const report = {
        location: [place.name, place.admin1, place.country]
          .filter((part, index, arr) => part && arr.indexOf(part) === index)
          .slice(0, 2)
          .join(', '),
        timezone: data.timezone || place.timezone,
        observedAt: data.current.time || new Date().toISOString(),
        current: {
          tempC: Math.round(Number(data.current.temperature_2m ?? 0)),
          feelsLikeC: Math.round(Number(data.current.apparent_temperature ?? data.current.temperature_2m ?? 0)),
          humidity: Math.round(Number(data.current.relative_humidity_2m ?? 0)),
          windKmh: Math.round(Number(data.current.wind_speed_10m ?? 0)),
          precipitationMm: Number(data.current.precipitation ?? 0),
          rainChanceToday: daily[0]?.rainChance ?? 0,
          condition: currentMapped.label,
          category: currentMapped.category,
        },
        daily,
        sourceName: 'Open-Meteo',
        sourceUrl: 'https://open-meteo.com/',
      };

      setCached(weatherCache, coordKey, report, WEATHER_CACHE_TTL_MS);
      return report;
    } catch {
      return null;
    }
  });
}

function decodeXmlEntities(text) {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(xml);
  return match ? decodeXmlEntities(match[1]) : '';
}

export async function fetchNewsFeed({ topic = '', query = '', limit = 6 } = {}) {
  const cacheKey = `news:${topic.toLowerCase()}:${query.toLowerCase()}:${limit}`;
  const cached = getCached(newsCache, cacheKey);
  if (cached) return cached;

  return dedupeInflight(cacheKey, async () => {
    try {
      let url = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
      if (query) {
        url = `https://news.google.com/rss/search?q=${encodeURIComponent(
          query
        )}&hl=en-US&gl=US&ceid=US:en`;
      } else if (topic) {
        url = `https://news.google.com/rss/headlines/section/topic/${encodeURIComponent(
          topic
        )}?hl=en-US&gl=US&ceid=US:en`;
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(2500),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LuminaAssistant/1.0)',
        },
      });
      if (!res.ok) return [];
      const xml = await res.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
      const items = [];
      let match;

      while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
        const block = match[1];
        const rawTitle = extractTag(block, 'title');
        const link = extractTag(block, 'link');
        const pubDate = extractTag(block, 'pubDate');
        const sourceTag = extractTag(block, 'source');

        let title = rawTitle;
        let source = sourceTag;
        if (!source && rawTitle.includes(' - ')) {
          const lastDash = rawTitle.lastIndexOf(' - ');
          title = rawTitle.slice(0, lastDash).trim();
          source = rawTitle.slice(lastDash + 3).trim();
        }

        if (title && link) {
          items.push({
            title,
            url: link,
            source: source || 'Google News',
            publishedAt: pubDate || '',
          });
        }
      }

      if (items.length > 0) {
        setCached(newsCache, cacheKey, items, NEWS_CACHE_TTL_MS);
      }
      return items;
    } catch {
      return [];
    }
  });
}

function buildSearchKeywords(prompt) {
  const cleaned = prompt
    .replace(
      /\b(what is|what are|what's|whats|who is|who won|when is|when did|where is|tell me|give me|explain|can you|please|the weather in|weather in|latest|most recent|current|right now|today)\b/gi,
      ' '
    )
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 3 ? cleaned.slice(0, 100) : prompt.trim().slice(0, 100);
}

export async function fetchLiveWebResults(prompt) {
  const keywords = buildSearchKeywords(prompt);
  if (!keywords) return { snippets: [], sources: [], newsItems: [] };

  const cacheKey = `web:${keywords.toLowerCase()}`;
  const cached = getCached(webSearchCache, cacheKey);
  if (cached) return cached;

  return dedupeInflight(cacheKey, async () => {
    const newsPromise = fetchNewsFeed({ query: keywords, limit: 5 });

    const wikiPromise = (async () => {
      try {
        const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
          keywords
        )}&gsrlimit=2&prop=extracts|info&exintro=1&explaintext=1&exchars=950&inprop=url&format=json`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2200),
          headers: { 'User-Agent': 'LuminaAssistant/1.0 (https://github.com)' },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
        return pages
          .sort((a, b) => (a.index ?? 99) - (b.index ?? 99))
          .filter((p) => p?.title && p?.extract)
          .map((p) => ({
            title: `${p.title} - Wikipedia`,
            extract: String(p.extract).trim(),
            url: p.canonicalurl || p.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
          }));
      } catch {
        return [];
      }
    })();

    const ddgPromise = (async () => {
      try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(
          keywords
        )}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2000),
          headers: { 'User-Agent': 'LuminaAssistant/1.0' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        const abstract = typeof data?.AbstractText === 'string' ? data.AbstractText.trim() : '';
        const absUrl = typeof data?.AbstractURL === 'string' ? data.AbstractURL.trim() : '';
        const heading = typeof data?.Heading === 'string' ? data.Heading.trim() : '';
        if (!abstract) return null;
        return {
          title: heading ? `${heading} (${data.AbstractSource || 'Instant Answer'})` : 'DuckDuckGo Summary',
          extract: abstract,
          url: absUrl || '',
        };
      } catch {
        return null;
      }
    })();

    const [newsItems, wikiItems, ddgItem] = await Promise.all([newsPromise, wikiPromise, ddgPromise]);

    const snippets = [];
    const sourceMap = new Map();

    if (ddgItem) {
      snippets.push(`[${ddgItem.title}]: ${ddgItem.extract}`);
      if (ddgItem.url && ddgItem.url.startsWith('http')) {
        sourceMap.set(ddgItem.url, { title: ddgItem.title, url: ddgItem.url });
      }
    }

    for (const w of wikiItems) {
      snippets.push(`[${w.title}]: ${w.extract}`);
      if (w.url && w.url.startsWith('http') && !sourceMap.has(w.url)) {
        sourceMap.set(w.url, { title: w.title, url: w.url });
      }
    }

    for (const n of newsItems) {
      snippets.push(
        `[News: ${n.source}${n.publishedAt ? ` | ${n.publishedAt}` : ''}]: ${n.title} (${n.url})`
      );
      if (n.url && n.url.startsWith('http') && !sourceMap.has(n.url)) {
        sourceMap.set(n.url, { title: `${n.title} — ${n.source}`, url: n.url });
      }
    }

    const result = {
      snippets,
      sources: Array.from(sourceMap.values()).slice(0, 8),
      newsItems,
    };

    if (snippets.length > 0) {
      setCached(webSearchCache, cacheKey, result, WEB_CACHE_TTL_MS);
    }
    return result;
  });
}

function cleanLocationCandidate(raw) {
  return raw
    .replace(
      /\b(right now|today|tomorrow|tonight|this week|next week|7-day|7 day|5-day|weekly|daily|forecast|weather|temperature|climate|please|for me|going to)\b/gi,
      ' '
    )
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const NON_LOCATION_WORD_RE =
  /^(what|whats|what's|how|hows|how's|will|is|are|was|were|can|could|should|would|do|does|did|it|there|here|give|show|tell|get|check|find|need|want|know|current|today|todays|today's|tomorrow|tonight|weekly|local|my|our|the|a|an)$/i;

export function extractWeatherLocations(prompt, timezoneHint = '') {
  const lower = prompt.toLowerCase();

  // Pattern 1: "compare weather between X and Y" / "weather in X vs Y"
  const compareMatch =
    /(?:between|compare(?:\s+the)?\s+weather\s+(?:in|of|between|for)?)\s+([a-zA-Z\s,.-]{2,40}?)\s+(?:and|vs\.?|versus|with)\s+([a-zA-Z\s,.-]{2,40})/i.exec(
      prompt
    ) ||
    /([a-zA-Z\s,.-]{2,35}?)\s+(?:vs\.?|versus)\s+([a-zA-Z\s,.-]{2,35})/i.exec(prompt);

  if (compareMatch) {
    const loc1 = cleanLocationCandidate(compareMatch[1]);
    const loc2 = cleanLocationCandidate(compareMatch[2]);
    const list = [loc1, loc2].filter((s) => s.length >= 2);
    if (list.length > 0) return list.slice(0, 2);
  }

  // Pattern 2: "weather in London", "rain in Tokyo tomorrow", "temperature of New York"
  const inMatch =
    /\b(?:in|for|at|of)\s+([a-zA-Z][a-zA-Z\s,.-]{1,40}?)(?=\s+(?:today|tomorrow|tonight|right now|this week|next|forecast|weather|temperature|on\s+\w+)|[?!.,]|$)/i.exec(
      prompt
    );
  if (inMatch) {
    const candidate = cleanLocationCandidate(inMatch[1]);
    if (
      candidate.length >= 2 &&
      !/^(the|my|this|a|an|two|cities)$/i.test(candidate) &&
      !/\b(capital|city|town|country|state|province|biggest|largest|smallest|northernmost|southernmost|hottest|coldest|nearest|where)\b/i.test(
        candidate
      )
    ) {
      return [candidate];
    }
    if (
      /\b(capital|city|biggest|largest|smallest|northernmost|southernmost|hottest|coldest|nearest|where)\b/i.test(
        inMatch[1]
      )
    ) {
      return [];
    }
  }

  // Pattern 3: "<City> weather" (e.g., "karachi weather today?", "London 7-day forecast")
  const prefixMatch =
    /^([a-zA-Z][a-zA-Z0-9\s.-]{1,40}?)\s+(?:weather|forecast|temperature|rain|climate)\b/i.exec(
      prompt.trim()
    );
  if (prefixMatch) {
    const candidate = cleanLocationCandidate(prefixMatch[1]);
    const words = candidate.split(/\s+/).filter(Boolean);
    const hasNonLocationWord = words.some((w) => NON_LOCATION_WORD_RE.test(w));
    if (candidate.length >= 2 && !hasNonLocationWord) {
      return [candidate];
    }
  }

  // Pattern 4: Fallback from browser timezone if user asked generic "what's the weather today?" or "will it rain tomorrow?"
  if (
    timezoneHint &&
    timezoneHint.includes('/') &&
    !lower.includes('northernmost') &&
    !lower.includes('capital of')
  ) {
    const cityFromTz = timezoneHint.split('/').pop()?.replace(/_/g, ' ').trim();
    if (cityFromTz && cityFromTz.length >= 2 && cityFromTz.toLowerCase() !== 'utc') {
      return [cityFromTz];
    }
  }

  return [];
}

function detectNewsQuery(prompt) {
  const lower = prompt.toLowerCase();
  const isNews =
    /\b(news|headline|headlines|breaking|current events|what happened|updates? (?:on|in|about|from)|trending)\b/i.test(
      lower
    );
  if (!isNews) return null;

  let topic = '';
  if (/\b(tech|technology|ai|artificial intelligence|software|gadgets?|apple|google|openai|microsoft)\b/i.test(lower)) {
    topic = 'TECHNOLOGY';
  } else if (/\b(sport|sports|cricket|football|soccer|nba|nfl|tennis|f1|ipl|psl|fifa|match|score)\b/i.test(lower)) {
    topic = 'SPORTS';
  } else if (/\b(business|economy|stock|stocks|market|finance|crypto|bitcoin)\b/i.test(lower)) {
    topic = 'BUSINESS';
  } else if (/\b(science|space|nasa|climate|research|physics|health)\b/i.test(lower)) {
    topic = 'SCIENCE';
  } else if (/\b(entertainment|movie|movies|music|film|celebrity|oscars)\b/i.test(lower)) {
    topic = 'ENTERTAINMENT';
  } else if (/\b(world|global|international|geopolitics|war|election)\b/i.test(lower)) {
    topic = 'WORLD';
  }

  // Check if user specified a specific city, country, or subject query
  const subjectMatch =
    /\b(?:in|from|about|on|for)\s+([a-zA-Z0-9\s,.-]{2,45}?)(?:[?!.]|$)/i.exec(prompt);
  const cleanedSubject = subjectMatch
    ? subjectMatch[1]
        .replace(/\b(today|right now|this week|latest|recent|world|global|the|a|an)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  return {
    topic,
    query: cleanedSubject.length >= 2 ? cleanedSubject : '',
  };
}

export function classifyQueryIntent(messages, forceWebSearch = false) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = lastUser?.content || '';
  const lower = prompt.toLowerCase();

  const isWeather =
    /\b(weather|forecast|temperature|rain|raining|humidity|wind speed|uv index|sunny|cloudy|snow|storm|celsius|fahrenheit)\b/i.test(
      lower
    );

  const newsQuery = detectNewsQuery(prompt);

  const isTimeSensitive =
    forceWebSearch ||
    Boolean(newsQuery) ||
    /\b(today|tonight|tomorrow|yesterday|latest|breaking|current|currently|right now|recent|recently|this week|this month|this year|live|score|scores|match|fixture|fixtures|standings|who won|winner|price|stock|bitcoin|crypto|exchange rate|president|prime minister|election|released|release date|trending|2025|2026|2027)\b/i.test(
      lower
    );

  return {
    prompt,
    isWeather,
    newsQuery,
    needsGoogleSearch: isTimeSensitive && !isWeather ? true : forceWebSearch || Boolean(newsQuery),
  };
}

export function formatWeatherContext(reports) {
  if (!reports || reports.length === 0) return '';
  return reports
    .map((r) => {
      const forecastLines = r.daily
        .map(
          (d) =>
            `  - ${d.date}: ${d.condition}, High ${d.tempMaxC}°C / Low ${d.tempMinC}°C, Rain chance ${d.rainChance}%, Max wind ${d.windMaxKmh} km/h`
        )
        .join('\n');
      return [
        `LIVE WEATHER REPORT for ${r.location} (Timezone: ${r.timezone}, Observed: ${r.observedAt}, Source: Open-Meteo):`,
        `- Current: ${r.current.tempC}°C (feels like ${r.current.feelsLikeC}°C), ${r.current.condition}`,
        `- Humidity: ${r.current.humidity}%, Wind: ${r.current.windKmh} km/h, Today's rain probability: ${r.current.rainChanceToday}%`,
        `- 7-Day Forecast:\n${forecastLines}`,
      ].join('\n');
    })
    .join('\n\n');
}

export function formatNewsContext(items) {
  if (!items || items.length === 0) return '';
  const lines = items.map(
    (item, idx) =>
      `${idx + 1}. "${item.title}" — ${item.source}${
        item.publishedAt ? ` (${item.publishedAt})` : ''
      } [Link: ${item.url}]`
  );
  return `LIVE NEWS HEADLINES (Retrieved just now):\n${lines.join('\n')}`;
}

export function formatWebContext(webResult) {
  if (!webResult || !Array.isArray(webResult.snippets) || webResult.snippets.length === 0) {
    return '';
  }
  return `LIVE WEB & ENCYCLOPEDIA SEARCH RESULTS (Retrieved just now):\n${webResult.snippets
    .map((s, idx) => `${idx + 1}. ${s}`)
    .join('\n')}`;
}
