export type WeatherCategory =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'snow'
  | 'storm';

export interface DailyForecast {
  date: string;
  condition: string;
  category: WeatherCategory;
  tempMaxC: number;
  tempMinC: number;
  rainChance: number;
  windMaxKmh: number;
}

export interface WeatherReport {
  location: string;
  timezone: string;
  observedAt: string;
  current: {
    tempC: number;
    feelsLikeC: number;
    humidity: number;
    windKmh: number;
    precipitationMm: number;
    rainChanceToday: number;
    condition: string;
    category: WeatherCategory;
  };
  daily: DailyForecast[];
  sourceName: string;
  sourceUrl: string;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
}

export interface QueryIntent {
  prompt: string;
  isWeather: boolean;
  newsQuery: { topic: string; query: string } | null;
  needsGoogleSearch: boolean;
}

export interface LiveWebResult {
  snippets: string[];
  sources: Array<{ title: string; url: string }>;
  newsItems: NewsItem[];
}

export function fetchWeatherForLocation(locationQuery: string): Promise<WeatherReport | null>;
export function fetchNewsFeed(opts?: {
  topic?: string;
  query?: string;
  limit?: number;
}): Promise<NewsItem[]>;
export function fetchLiveWebResults(prompt: string): Promise<LiveWebResult>;
export function extractWeatherLocations(prompt: string, timezoneHint?: string): string[];
export function classifyQueryIntent(
  messages: Array<{ role: string; content: string }>,
  forceWebSearch?: boolean
): QueryIntent;
export function formatWeatherContext(reports: WeatherReport[]): string;
export function formatNewsContext(items: NewsItem[]): string;
export function formatWebContext(webResult: LiveWebResult): string;
