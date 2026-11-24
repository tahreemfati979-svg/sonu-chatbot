export const ASPECT_DIMENSIONS = {
  '1:1': { width: 768, height: 768, hordeWidth: 512, hordeHeight: 512 },
  '16:9': { width: 1024, height: 576, hordeWidth: 768, hordeHeight: 448 },
  '9:16': { width: 576, height: 1024, hordeWidth: 448, hordeHeight: 768 },
  '4:3': { width: 896, height: 672, hordeWidth: 640, hordeHeight: 512 },
};

const STYLE_MODIFIERS = {
  photorealistic: 'photorealistic, natural lighting, sharp focus, rich detail',
  illustration: 'editorial digital illustration, expressive linework, balanced composition',
  'digital-art': 'high-detail digital concept art, atmospheric lighting, cohesive color palette',
  minimalist: 'clean minimalist graphic design, crisp forms, balanced negative space',
};

let pollinationsBlockedUntil = 0;

export class ImageGenerationError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ImageGenerationError';
    this.status = status;
  }
}

export function detectImageGenerationIntent(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;
  const trimmed = prompt.trim();
  if (!trimmed) return null;

  const slashMatch = /^\/imagine\s+(.+)/i.exec(trimmed);
  if (slashMatch && slashMatch[1].trim().length >= 2) {
    return slashMatch[1].trim();
  }

  const verbMatch =
    /^(?:please\s+|can you\s+|could you\s+)?(?:generate|create|make|draw|paint|sketch|render|design|illustrate)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|photograph|illustration|artwork|drawing|painting|portrait|wallpaper|logo|icon|poster|banner|scene)\s+(?:of|showing|with|depicting|featuring|for|about)\s+(.+)/i.exec(
      trimmed
    );
  if (verbMatch && verbMatch[1].trim().length >= 2) {
    return verbMatch[1].trim();
  }

  return null;
}

async function generateViaPollinations({ finalPrompt, cleanPrompt, ratio, styleKey, width, height, finalSeed }) {
  const remoteUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    finalPrompt
  )}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true`;

  const res = await fetch(remoteUrl, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'LuminaAssistant/1.0' },
  });

  if (!res.ok) {
    if (res.status === 429 || res.status === 503 || res.status === 500) {
      pollinationsBlockedUntil = Date.now() + 2 * 60 * 1000;
    }
    throw new Error(`Pollinations returned ${res.status}`);
  }

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  if (!contentType.startsWith('image/')) {
    throw new Error('Pollinations returned non-image payload');
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  if (!base64 || base64.length < 200) {
    throw new Error('Pollinations returned empty image');
  }

  const mime = contentType.split(';')[0].trim();
  return {
    prompt: cleanPrompt,
    aspectRatio: ratio,
    style: styleKey || undefined,
    url: remoteUrl,
    dataUrl: `data:${mime};base64,${base64}`,
    seed: finalSeed,
  };
}

async function generateViaAiHorde({ finalPrompt, cleanPrompt, ratio, styleKey, hordeWidth, hordeHeight, finalSeed }) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: '0000000000',
    'Client-Agent': 'LuminaChat:1.0:assistant',
  };

  const submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      prompt: finalPrompt,
      params: {
        width: hordeWidth,
        height: hordeHeight,
        steps: 18,
        n: 1,
        seed: String(finalSeed),
      },
      nsfw: false,
      r2: true,
    }),
  });

  if (!submitRes.ok) {
    throw new ImageGenerationError(`Image generation queue returned status ${submitRes.status}.`, 502);
  }

  const submitData = await submitRes.json();
  const jobId = submitData?.id;
  if (!jobId) {
    throw new ImageGenerationError('Unable to start image generation job.', 502);
  }

  const deadline = Date.now() + 24000;
  let done = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const checkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${jobId}`, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Client-Agent': 'LuminaChat:1.0:assistant' },
    });
    if (!checkRes.ok) continue;
    const check = await checkRes.json();
    if (check.faulted) {
      throw new ImageGenerationError('Image worker encountered an error. Please try again.', 502);
    }
    if (check.done) {
      done = true;
      break;
    }
  }

  if (!done) {
    throw new ImageGenerationError('Image generation timed out in the free queue. Please try again.', 504);
  }

  const statusRes = await fetch(`https://aihorde.net/api/v2/generate/status/${jobId}`, {
    signal: AbortSignal.timeout(6000),
    headers: { 'Client-Agent': 'LuminaChat:1.0:assistant' },
  });
  if (!statusRes.ok) {
    throw new ImageGenerationError('Could not retrieve generated image result.', 502);
  }
  const statusData = await statusRes.json();
  const gen = statusData?.generations?.[0];
  const imgUrl = gen?.img;
  if (!imgUrl || typeof imgUrl !== 'string') {
    throw new ImageGenerationError('No image was returned for this prompt.', 502);
  }

  let dataUrl;
  try {
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(8000) });
    if (imgRes.ok) {
      const mime = (imgRes.headers.get('content-type') || 'image/webp').split(';')[0].trim();
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length > 200) {
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
  } catch {
    // Keep remote URL if inline fetch fails
  }

  return {
    prompt: cleanPrompt,
    aspectRatio: ratio,
    style: styleKey || undefined,
    url: imgUrl,
    dataUrl,
    seed: Number(gen?.seed) || finalSeed,
  };
}

export async function generateImageAsset({
  prompt,
  aspectRatio = '1:1',
  style = '',
  seed,
}) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 600) : '';
  if (!cleanPrompt) {
    throw new ImageGenerationError('Please describe the image you want to generate.', 400);
  }

  const ratio = ASPECT_DIMENSIONS[aspectRatio] ? aspectRatio : '1:1';
  const dims = ASPECT_DIMENSIONS[ratio];
  const styleKey = typeof style === 'string' ? style.trim().toLowerCase() : '';
  const modifier = STYLE_MODIFIERS[styleKey] || '';
  const finalPrompt = modifier ? `${cleanPrompt}, ${modifier}` : cleanPrompt;
  const finalSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.abs(Math.floor(seed))
      : Math.floor(Math.random() * 2147483647);

  if (Date.now() >= pollinationsBlockedUntil) {
    try {
      return await generateViaPollinations({
        finalPrompt,
        cleanPrompt,
        ratio,
        styleKey,
        width: dims.width,
        height: dims.height,
        finalSeed,
      });
    } catch {
      // Fall through cleanly to AI Horde free cluster
    }
  }

  return await generateViaAiHorde({
    finalPrompt,
    cleanPrompt,
    ratio,
    styleKey,
    hordeWidth: dims.hordeWidth,
    hordeHeight: dims.hordeHeight,
    finalSeed,
  });
}
