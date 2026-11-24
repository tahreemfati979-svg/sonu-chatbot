export const ASPECT_DIMENSIONS = {
  '1:1': { width: 768, height: 768, hordeWidth: 512, hordeHeight: 512 },
  '16:9': { width: 1024, height: 576, hordeWidth: 768, hordeHeight: 448 },
  '9:16': { width: 576, height: 1024, hordeWidth: 448, hordeHeight: 768 },
  '4:3': { width: 896, height: 672, hordeWidth: 640, hordeHeight: 512 },
};

export const STYLE_MODIFIERS = {
  realistic:
    'photorealistic photography, natural lighting, sharp focus, authentic textures, realistic depth of field',
  photorealistic:
    'photorealistic photography, natural lighting, sharp focus, authentic textures, realistic depth of field',
  '3d': '3D digital render, volumetric studio lighting, smooth materials, crisp shadows, high-detail 3D CGI',
  cartoon:
    'vibrant cartoon illustration, expressive stylized shapes, clean outlines, rich playful colors',
  anime:
    'high-quality anime illustration, crisp linework, expressive cel-shaded lighting, vibrant atmosphere',
  artistic:
    'fine art painterly illustration, expressive brushwork, evocative color harmony, gallery-quality composition',
  illustration:
    'editorial digital illustration, expressive linework, balanced composition, cohesive color palette',
  'digital-art':
    'high-detail digital concept art, atmospheric lighting, cohesive color palette',
  minimalist:
    'clean minimalist graphic design, crisp geometric forms, balanced negative space, modern flat composition',
  professional:
    'sleek modern commercial design, polished studio composition, refined color palette, crisp visual hierarchy',
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

  const verbWithPrepositionMatch =
    /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:generate|create|make|draw|paint|sketch|render|design|illustrate|produce|build)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|pic|photo|photograph|illustration|artwork|art|drawing|painting|portrait|wallpaper|logo|icon|poster|banner|flyer|thumbnail|avatar|mascot|sticker|mockup|scene)\s+(?:of|showing|with|depicting|featuring|for|about)\s+(.+)/i.exec(
      trimmed
    );
  if (verbWithPrepositionMatch && verbWithPrepositionMatch[1].trim().length >= 2) {
    return verbWithPrepositionMatch[1].trim();
  }

  const directVisualActionMatch =
    /^(?:please\s+|can you\s+|could you\s+|would you\s+)?(?:draw|paint|sketch|render|illustrate|visualize)\s+(?:me\s+)?(.+)/i.exec(
      trimmed
    );
  if (
    directVisualActionMatch &&
    directVisualActionMatch[1].trim().length >= 3 &&
    !/^(?:how|what|why|when|where|a conclusion|attention|up a plan|out a schedule)\b/i.test(
      directVisualActionMatch[1].trim()
    )
  ) {
    return directVisualActionMatch[1].trim();
  }

  const designArtifactMatch =
    /^(?:please\s+|can you\s+|could you\s+|i want\s+|i need\s+|make me\s+|create me\s+|generate me\s+|design me\s+)?(?:(?:generate|create|make|design)\s+)?(?:an?\s+)?(?:[\w-]+\s+){0,3}(?:logo|wallpaper|poster|banner|avatar|mascot|illustration|portrait|artwork|sticker|thumbnail|picture|image)\s+(?:of|for|with|featuring|showing)\s+(.+)/i.exec(
      trimmed
    );
  if (designArtifactMatch && designArtifactMatch[1].trim().length >= 2) {
    return trimmed;
  }

  return null;
}

export function mightBeVisualRequest(prompt, hasPreviousGeneratedImage = false) {
  if (!prompt || typeof prompt !== 'string') return false;
  const trimmed = prompt.trim();
  if (!trimmed) return false;
  if (/^\/imagine\b/i.test(trimmed)) return true;

  if (
    /\b(image|images|picture|pictures|pic|pics|photo|photos|photograph|illustration|draw|drawing|paint|painting|sketch|render|artwork|portrait|wallpaper|logo|icon|poster|banner|flyer|thumbnail|avatar|mascot|sticker|mockup|visual|cartoon|anime|3d|pixel art|concept art)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  if (
    hasPreviousGeneratedImage &&
    /\b(change|make|use|turn|add|remove|replace|edit|modify|update|redo|regenerate|try|give|put|switch|more|less|brighter|darker|warmer|cooler|background|foreground|color|colors|colour|colours|style|realistic|photorealistic|3d|cartoon|anime|minimalist|artistic|professional|landscape|portrait|widescreen|square|version|variation|different|instead|same)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

async function generateViaPollinations({
  finalPrompt,
  displayPrompt,
  enhancedPrompt,
  ratio,
  styleKey,
  width,
  height,
  finalSeed,
}) {
  const remoteUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    finalPrompt
  )}?width=${width}&height=${height}&seed=${finalSeed}&nologo=true`;

  const res = await fetch(remoteUrl, {
    signal: AbortSignal.timeout(14000),
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
  const buf = Buffer.from(arrayBuffer);
  if (buf.length < 2500) {
    throw new Error('Pollinations returned undersized image payload');
  }

  const mime = contentType.split(';')[0].trim();
  return {
    prompt: displayPrompt,
    enhancedPrompt,
    aspectRatio: ratio,
    style: styleKey || undefined,
    url: remoteUrl,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
    seed: finalSeed,
  };
}

async function generateViaAiHorde({
  finalPrompt,
  displayPrompt,
  enhancedPrompt,
  ratio,
  styleKey,
  hordeWidth,
  hordeHeight,
  finalSeed,
}) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: '0000000000',
    'Client-Agent': 'LuminaChat:1.0:assistant',
  };

  const payloadBody = JSON.stringify({
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
  });

  let submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(9000),
    body: payloadBody,
  });

  if (submitRes.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1300));
    submitRes = await fetch('https://aihorde.net/api/v2/generate/async', {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(9000),
      body: payloadBody,
    });
  }

  if (!submitRes.ok) {
    throw new ImageGenerationError(
      `Image generation queue is busy (status ${submitRes.status}). Please try again shortly.`,
      502
    );
  }

  const submitData = await submitRes.json();
  const jobId = submitData?.id;
  if (!jobId) {
    throw new ImageGenerationError('Unable to start image generation job.', 502);
  }

  const deadline = Date.now() + 30000;
  let done = false;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
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
    throw new ImageGenerationError(
      'Image generation timed out in the queue. Please try again.',
      504
    );
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
    const imgRes = await fetch(imgUrl, { signal: AbortSignal.timeout(9000) });
    if (imgRes.ok) {
      const mime = (imgRes.headers.get('content-type') || 'image/webp').split(';')[0].trim();
      const buf = Buffer.from(await imgRes.arrayBuffer());
      if (buf.length > 2000) {
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
  } catch {
    // Keep remote URL if inline fetch fails
  }

  return {
    prompt: displayPrompt,
    enhancedPrompt,
    aspectRatio: ratio,
    style: styleKey || undefined,
    url: imgUrl,
    dataUrl,
    seed: Number(gen?.seed) || finalSeed,
  };
}

export async function generateImageAsset({
  prompt,
  enhancedPrompt,
  aspectRatio = '1:1',
  style = '',
  seed,
}) {
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 600) : '';
  const cleanEnhanced =
    typeof enhancedPrompt === 'string' && enhancedPrompt.trim()
      ? enhancedPrompt.trim().slice(0, 750)
      : cleanPrompt;

  if (!cleanPrompt && !cleanEnhanced) {
    throw new ImageGenerationError('Please describe the image you want to generate.', 400);
  }

  const displayPrompt = cleanPrompt || cleanEnhanced;
  const ratio = ASPECT_DIMENSIONS[aspectRatio] ? aspectRatio : '1:1';
  const dims = ASPECT_DIMENSIONS[ratio];
  const styleKey = typeof style === 'string' ? style.trim().toLowerCase() : '';
  const modifier = STYLE_MODIFIERS[styleKey] || '';
  const finalPrompt =
    modifier && !cleanEnhanced.toLowerCase().includes(styleKey)
      ? `${cleanEnhanced}, ${modifier}`
      : cleanEnhanced;

  const finalSeed =
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.abs(Math.floor(seed))
      : Math.floor(Math.random() * 2147483647);

  if (Date.now() >= pollinationsBlockedUntil) {
    try {
      return await generateViaPollinations({
        finalPrompt,
        displayPrompt,
        enhancedPrompt: cleanEnhanced,
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
    displayPrompt,
    enhancedPrompt: cleanEnhanced,
    ratio,
    styleKey,
    hordeWidth: dims.hordeWidth,
    hordeHeight: dims.hordeHeight,
    finalSeed,
  });
}
