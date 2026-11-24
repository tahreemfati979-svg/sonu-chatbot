export type ImageAspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export interface GeneratedImageResult {
  prompt: string;
  aspectRatio: ImageAspectRatio;
  style?: string;
  url: string;
  dataUrl: string;
  seed: number;
}

export const ASPECT_DIMENSIONS: Record<ImageAspectRatio, { width: number; height: number }>;

export function detectImageGenerationIntent(prompt: string): string | null;

export function generateImageAsset(opts: {
  prompt: string;
  aspectRatio?: ImageAspectRatio | string;
  style?: string;
  seed?: number;
}): Promise<GeneratedImageResult>;
