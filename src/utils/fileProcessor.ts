import type { ChatAttachment } from '../types/chat';
import { generateId } from './storage';

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'html',
  'htm',
  'css',
  'scss',
  'xml',
  'yaml',
  'yml',
  'sql',
  'log',
  'sh',
  'env',
  'java',
  'go',
  'rs',
  'c',
  'cpp',
  'h',
  'php',
  'rb',
  'swift',
  'kt',
]);

const MAX_PDF_BYTES = 3.5 * 1024 * 1024; // Fits safely inside Vercel 4.5MB serverless limit after base64
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_IMAGE_RAW_BYTES = 12 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.readAsText(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to decode image file.'));
    img.src = dataUrl;
  });
}

async function compressImage(
  file: File
): Promise<{ apiDataUrl: string; thumbDataUrl: string; mimeType: string }> {
  const rawUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawUrl);

  const renderScaled = (maxDim: number, quality: number, forceJpeg: boolean) => {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return rawUrl;
    ctx.drawImage(img, 0, 0, width, height);
    const outMime =
      forceJpeg || file.type === 'image/jpeg' || file.type === 'image/webp'
        ? 'image/jpeg'
        : 'image/png';
    return canvas.toDataURL(outMime, quality);
  };

  let apiDataUrl = rawUrl;
  if (img.width > 1600 || img.height > 1600 || file.size > 1_200_000) {
    apiDataUrl = renderScaled(1600, 0.84, true);
  }
  const thumbDataUrl = renderScaled(360, 0.72, true);
  const mimeMatch = /^data:([^;]+);base64,/.exec(apiDataUrl);

  return {
    apiDataUrl,
    thumbDataUrl,
    mimeType: mimeMatch?.[1] || file.type || 'image/jpeg',
  };
}

export async function processSelectedFile(file: File): Promise<ChatAttachment> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = file.type.toLowerCase();

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
    if (file.size > MAX_IMAGE_RAW_BYTES) {
      throw new Error(`${file.name} is too large (max 12 MB for images).`);
    }
    const { apiDataUrl, thumbDataUrl, mimeType } = await compressImage(file);
    const base64Data = apiDataUrl.split(',')[1] || '';
    return {
      id: generateId(),
      name: file.name,
      mimeType,
      size: file.size,
      kind: 'image',
      dataUrl: thumbDataUrl.length <= 75_000 ? thumbDataUrl : apiDataUrl,
      base64Data,
    };
  }

  if (mime === 'application/pdf' || ext === 'pdf') {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(`${file.name} exceeds the 3.5 MB PDF limit.`);
    }
    const dataUrl = await readFileAsDataUrl(file);
    const base64Data = dataUrl.split(',')[1] || '';
    return {
      id: generateId(),
      name: file.name,
      mimeType: 'application/pdf',
      size: file.size,
      kind: 'pdf',
      base64Data,
    };
  }

  if (mime.startsWith('text/') || mime === 'application/json' || TEXT_EXTENSIONS.has(ext)) {
    if (file.size > MAX_TEXT_BYTES) {
      throw new Error(`${file.name} exceeds the 512 KB text/code file limit.`);
    }
    const textContent = (await readFileAsText(file)).slice(0, 60000);
    return {
      id: generateId(),
      name: file.name,
      mimeType: file.type || 'text/plain',
      size: file.size,
      kind: 'text',
      textContent,
    };
  }

  throw new Error(
    `Unsupported file type for "${file.name}". Supported: Images (PNG/JPG/WebP), PDFs, and text/code/CSV/JSON files.`
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
