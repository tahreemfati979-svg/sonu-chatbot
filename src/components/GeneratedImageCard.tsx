import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  ImageOff,
  Loader2,
  Maximize2,
  RefreshCw,
  X,
} from 'lucide-react';
import type { GeneratedImage } from '../types/chat';

interface GeneratedImageCardProps {
  image: GeneratedImage;
  onRegenerateVariation?: (image: GeneratedImage) => Promise<void> | void;
}

const ASPECT_CLASS_MAP: Record<string, string> = {
  '1:1': 'aspect-square',
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16] max-h-[440px]',
  '4:3': 'aspect-[4/3]',
};

export const GeneratedImageCard: React.FC<GeneratedImageCardProps> = ({
  image,
  onRegenerateVariation,
}) => {
  const [imgSrc, setImgSrc] = useState(image.dataUrl || image.url);
  const [isLoaded, setIsLoaded] = useState(Boolean(image.dataUrl));
  const [hasError, setHasError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPromptDetails, setShowPromptDetails] = useState(false);

  useEffect(() => {
    const nextSrc = image.dataUrl || image.url;
    setImgSrc(nextSrc);
    setHasError(!nextSrc);
    setIsLoaded(Boolean(image.dataUrl));
  }, [image.dataUrl, image.url, image.seed]);

  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLightboxOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLightboxOpen]);

  const handleDownload = async () => {
    const filename = `${image.prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40) || 'generated-image'}.png`;

    if (image.dataUrl) {
      const a = document.createElement('a');
      a.href = image.dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    try {
      const res = await fetch(image.url);
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch {
      // Fallback: remote fetch blocked
    }
  };

  const handleVariation = async () => {
    if (!onRegenerateVariation || isRegenerating) return;
    setIsRegenerating(true);
    setHasError(false);
    try {
      await onRegenerateVariation(image);
    } finally {
      setIsRegenerating(false);
    }
  };

  const aspectClass = ASPECT_CLASS_MAP[image.aspectRatio] || 'aspect-square';
  const hasEnhanced =
    Boolean(image.enhancedPrompt) &&
    image.enhancedPrompt!.trim().toLowerCase() !== image.prompt.trim().toLowerCase();

  return (
    <>
      <div className="mb-3 w-full max-w-[460px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0B0F17]">
        {hasError ? (
          <div
            className={`flex w-full flex-col items-center justify-center gap-3 bg-slate-100 p-6 text-center text-slate-500 dark:bg-slate-900 dark:text-slate-400 ${aspectClass} max-h-[340px]`}
          >
            <ImageOff className="h-7 w-7 text-slate-400" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Could not display this image
              </p>
              <p className="max-w-xs text-xs leading-relaxed">
                The temporary image preview is unavailable or expired.
              </p>
            </div>
            {onRegenerateVariation && (
              <button
                type="button"
                onClick={handleVariation}
                disabled={isRegenerating}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                <span>{isRegenerating ? 'Regenerating...' : 'Regenerate Image'}</span>
              </button>
            )}
          </div>
        ) : (
          <div className="relative group/img bg-slate-100 dark:bg-[#090D14]">
            {(!isLoaded || isRegenerating) && (
              <div
                className={`flex w-full flex-col items-center justify-center gap-2.5 bg-slate-100/90 text-slate-500 dark:bg-[#090D14]/90 dark:text-slate-400 ${
                  isRegenerating ? 'absolute inset-0 z-10 backdrop-blur-xs' : `${aspectClass} max-h-[400px]`
                }`}
              >
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                <span className="text-xs font-medium">
                  {isRegenerating ? 'Generating new variation...' : 'Loading image...'}
                </span>
              </div>
            )}

            <img
              src={imgSrc}
              alt={image.prompt}
              referrerPolicy="no-referrer"
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                if (imgSrc !== image.url && image.url) {
                  setImgSrc(image.url);
                } else {
                  setIsLoaded(true);
                  setHasError(true);
                }
              }}
              onClick={() => isLoaded && setIsLightboxOpen(true)}
              className={`max-h-[440px] w-full cursor-zoom-in object-contain transition-opacity duration-200 ${
                isLoaded ? 'opacity-100' : 'opacity-0 h-0'
              }`}
            />

            {isLoaded && !isRegenerating && (
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/65 text-white opacity-90 transition-opacity hover:bg-slate-950/85 md:opacity-0 md:group-hover/img:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Expand generated image"
                title="View full size"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        <div className="border-t border-slate-200 px-3.5 py-2.5 text-xs dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                {image.prompt}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-slate-500 tabular-nums dark:text-slate-400">
                <span>{image.aspectRatio}</span>
                {image.style && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="capitalize">{image.style.replace('-', ' ')}</span>
                  </>
                )}
                {hasEnhanced && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setShowPromptDetails((prev) => !prev)}
                      className="inline-flex items-center gap-0.5 font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <span>Prompt</span>
                      {showPromptDetails ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {onRegenerateVariation && (
                <button
                  type="button"
                  onClick={handleVariation}
                  disabled={isRegenerating}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                  <span>{isRegenerating ? 'Generating...' : 'Regenerate'}</span>
                </button>
              )}
              {!hasError && (
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
              )}
            </div>
          </div>

          {showPromptDetails && image.enhancedPrompt && (
            <p className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-300">
              {image.enhancedPrompt}
            </p>
          )}
        </div>
      </div>

      {isLightboxOpen && !hasError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-xl border border-slate-700 bg-[#0B0F17]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/80 text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
            <img
              src={imgSrc}
              alt={image.prompt}
              referrerPolicy="no-referrer"
              className="max-h-[82vh] w-auto max-w-full object-contain"
            />
            <div className="flex items-center justify-between gap-4 border-t border-slate-800 px-4 py-2.5 text-xs text-slate-300">
              <span className="truncate">{image.prompt}</span>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 whitespace-nowrap shrink-0"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
