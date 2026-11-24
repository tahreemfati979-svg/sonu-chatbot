import type { IncomingMessage, ServerResponse } from 'node:http';

export default function handler(_req: IncomingMessage, res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(
    JSON.stringify({
      ok: true,
      model: 'gemini-3.1-flash-lite',
      hasApiKey: Boolean(
        process.env.GEMINI_API_KEY?.trim() &&
          process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
      ),
    })
  );
}
