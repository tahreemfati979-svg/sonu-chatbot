import type { IncomingMessage, ServerResponse } from 'node:http';
import { ImageGenerationError, generateImageAsset } from '../lib/imageService.mjs';

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown> | null> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: ServerResponse): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', error: 'Method not allowed. Use POST.' });
    return;
  }

  const body = await readJsonBody(req);
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const enhancedPrompt = typeof body?.enhancedPrompt === 'string' ? body.enhancedPrompt : undefined;
  const aspectRatio = typeof body?.aspectRatio === 'string' ? body.aspectRatio : '1:1';
  const style = typeof body?.style === 'string' ? body.style : '';
  const seed = typeof body?.seed === 'number' ? body.seed : undefined;

  if (!prompt.trim() && !enhancedPrompt?.trim()) {
    sendJson(res, 400, { code: 'INVALID_PROMPT', error: 'Please provide an image prompt.' });
    return;
  }

  try {
    const image = await generateImageAsset({ prompt, enhancedPrompt, aspectRatio, style, seed });
    sendJson(res, 200, { image });
  } catch (err) {
    const status = err instanceof ImageGenerationError ? err.status : 502;
    sendJson(res, status, {
      code: 'IMAGE_GENERATION_FAILED',
      error: err instanceof Error ? err.message : 'Unable to generate image right now.',
    });
  }
}
