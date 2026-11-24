export type Role = 'user' | 'assistant';

export type ThemeMode = 'dark' | 'light';

export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export type ResponseStyle = 'balanced' | 'concise' | 'detailed' | 'creative';

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

export interface GroundedSource {
  title: string;
  url: string;
}

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'pdf' | 'text';
  dataUrl?: string;
  base64Data?: string;
  textContent?: string;
}

export interface GeneratedImage {
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio: ImageAspectRatio;
  style?: string;
  url: string;
  dataUrl?: string;
  seed: number;
}

export interface UserPreferences {
  name: string;
  role: string;
  responseStyle: ResponseStyle;
  customInstructions: string;
  askClarifyingQuestions: boolean;
  showSuggestions: boolean;
  autoSpeak: boolean;
  speechRate: number;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  updatedAt?: number;
  attachments?: ChatAttachment[];
  weather?: WeatherReport[];
  news?: NewsItem[];
  sources?: GroundedSource[];
  generatedImage?: GeneratedImage;
  suggestions?: string[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ChatError {
  message: string;
  code?: string;
}
