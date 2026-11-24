export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export interface GeneratedImageResult {
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio: ImageAspectRatio;
  style?: string;
  url: string;
  dataUrl?: string;
  seed: number;
}

export const ASPECT_DIMENSIONS: Record<
  ImageAspectRatio,
  { width: number; height: number; hordeWidth: number; hordeHeight: number }
> ;

export const STYLE_MODIFIERS: Record<string, string>;

export class ImageGenerationError extends Error {
  status: number;
  constructor(message: string, status?: number);
}

export function detectImageGenerationIntent(prompt: string): string | null;
export function mightBeVisualRequest(prompt: string, hasPreviousGeneratedImage?: boolean): boolean;

export function generateImageAsset(opts: {
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: ImageAspectRatio | string;
  style?: string;
  seed?: number;
}): Promise<GeneratedImageResult>;
