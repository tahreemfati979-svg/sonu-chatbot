import type { GoogleGenAI } from '@google/genai';
import type { GeneratedImageResult, ImageAspectRatio } from './imageService.mjs';
import type { NewsItem, WeatherReport } from './liveServices.mjs';

export const PRIMARY_MODEL: string;
export const GROUNDED_MODEL: string;

export interface AttachmentPayload {
  kind: 'image' | 'pdf' | 'text';
  name: string;
  mimeType: string;
  base64Data?: string;
  textContent?: string;
}

export interface ChatMessageInput {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentPayload[];
}

export interface UserPreferencesPayload {
  name?: string;
  role?: string;
  responseStyle?: 'balanced' | 'concise' | 'detailed' | 'creative';
  customInstructions?: string;
  askClarifyingQuestions?: boolean;
  showSuggestions?: boolean;
}

export interface ImageOptionsPayload {
  forceImageMode?: boolean;
  aspectRatio?: ImageAspectRatio;
  style?: string;
}

export interface GroundedSource {
  title: string;
  url: string;
}

export interface ChatStreamEvent {
  status?: string;
  weather?: WeatherReport[];
  news?: NewsItem[];
  sources?: GroundedSource[];
  image?: GeneratedImageResult;
  suggestions?: string[];
  text?: string;
}

export function getAiClient(): GoogleGenAI | null;
export function parseApiError(err: unknown): { status: number; message: string; code: string };
export function validateMessages(raw: unknown): ChatMessageInput[] | null;
export function runLiveChat(opts: {
  ai: GoogleGenAI;
  messages: ChatMessageInput[];
  timezone?: string;
  forceWebSearch?: boolean;
  preferences?: UserPreferencesPayload;
  imageOptions?: ImageOptionsPayload;
  isAborted?: () => boolean;
  emitEvent: (event: ChatStreamEvent) => void;
}): Promise<void>;
