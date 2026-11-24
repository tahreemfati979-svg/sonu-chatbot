import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  getAiClient,
  parseApiError,
  runLiveChat,
  validateMessages,
} from '../lib/chatHandler.mjs';

interface ChatStreamEvent {
  status?: string;
  weather?: unknown[];
  news?: unknown[];
  sources?: Array<{ title: string; url: string }>;
  image?: unknown;
  suggestions?: string[];
  text?: string;
}

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

  const ai = getAiClient();
  if (!ai) {
    sendJson(res, 503, {
      code: 'MISSING_API_KEY',
      error:
        'GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in Vercel Project Settings > Environment Variables and redeploy.',
    });
    return;
  }

  const body = await readJsonBody(req);
  if (!body) {
    sendJson(res, 400, { code: 'INVALID_JSON', error: 'Invalid JSON request body.' });
    return;
  }

  const messages = validateMessages(body.messages);
  if (!messages) {
    sendJson(res, 400, {
      code: 'INVALID_REQUEST',
      error: 'Please provide a valid non-empty message or attachment ending with a user turn.',
    });
    return;
  }

  const useStream = body.stream !== false;
  const timezone = typeof body.timezone === 'string' ? body.timezone.slice(0, 80) : '';
  const forceWebSearch = body.forceWebSearch === true;
  const preferences =
    body.preferences && typeof body.preferences === 'object' ? body.preferences : undefined;
  const imageOptions =
    body.imageOptions && typeof body.imageOptions === 'object' ? body.imageOptions : undefined;

  if (!useStream) {
    try {
      let text = '';
      let weather: ChatStreamEvent['weather'];
      let news: ChatStreamEvent['news'];
      let sources: ChatStreamEvent['sources'];
      let image: ChatStreamEvent['image'];
      let suggestions: ChatStreamEvent['suggestions'];

      await runLiveChat({
        ai,
        messages,
        timezone,
        forceWebSearch,
        preferences: preferences as Record<string, unknown> | undefined,
        imageOptions: imageOptions as Record<string, unknown> | undefined,
        emitEvent: (ev: ChatStreamEvent) => {
          if (ev.text) text += ev.text;
          if (ev.weather) weather = ev.weather;
          if (ev.news) news = ev.news;
          if (ev.sources) sources = ev.sources;
          if (ev.image) image = ev.image;
          if (ev.suggestions) suggestions = ev.suggestions;
        },
      });

      sendJson(res, 200, { text, weather, news, sources, image, suggestions });
    } catch (err) {
      const parsed = parseApiError(err);
      sendJson(res, parsed.status, { code: parsed.code, error: parsed.message });
    }
    return;
  }

  let clientClosed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  res.socket?.setNoDelay(true);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  try {
    await runLiveChat({
      ai,
      messages,
      timezone,
      forceWebSearch,
      preferences: preferences as Record<string, unknown> | undefined,
      imageOptions: imageOptions as Record<string, unknown> | undefined,
      isAborted: () => clientClosed,
      emitEvent: (event: ChatStreamEvent) => {
        if (!clientClosed) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      },
    });

    if (!clientClosed) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    const parsed = parseApiError(err);
    if (!clientClosed) {
      res.write(`data: ${JSON.stringify({ error: parsed.message, code: parsed.code })}\n\n`);
      res.end();
    }
  }
}
