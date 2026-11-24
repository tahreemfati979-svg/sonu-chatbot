import React, { useEffect, useState } from 'react';
import { Download, ImageOff, Maximize2, RefreshCw, X } from 'lucide-react';
import type { GeneratedImage } from '../types/chat';

interface GeneratedImageCardProps {
  image: GeneratedImage;
  onRegenerateVariation?: (image: GeneratedImage) => Promise<void> | void;
}

export const GeneratedImageCard: React.FC<GeneratedImageCardProps> = ({
  image,
  onRegenerateVariation,
}) => {
  const [imgSrc, setImgSrc] = useState(image.dataUrl || image.url);
  const [hasError, setHasError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    setImgSrc(image.dataUrl || image.url);
    setHasError(false);
  }, [image.dataUrl, image.url]);

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
      .slice(0, 40) || 'generated-image'}.jpg`;

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
      // Fallback: nothing to download if remote fetch blocked
    }
  };

  const handleVariation = async () => {
    if (!onRegenerateVariation || isRegenerating) return;
    setIsRegenerating(true);
    try {
      await onRegenerateVariation(image);
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <>
      <div className="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-[#0B0F17]">
        {hasError ? (
          <div className="flex aspect-square max-h-[360px] w-full flex-col items-center justify-center gap-2 bg-slate-100 p-6 text-center text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <ImageOff className="h-7 w-7" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Image preview unavailable
            </p>
            <p className="max-w-xs text-xs">{image.prompt}</p>
          </div>
        ) : (
          <div className="relative group/img">
            <img
              src={imgSrc}
              alt={image.prompt}
              referrerPolicy="no-referrer"
              onError={() => {
                if (imgSrc !== image.url && image.url) {
                  setImgSrc(image.url);
                } else {
                  setHasError(true);
                }
              }}
              onClick={() => setIsLightboxOpen(true)}
              className="max-h-[440px] w-full cursor-zoom-in object-contain bg-slate-100 dark:bg-[#090D14]"
            />
            <button
              type="button"
              onClick={() => setIsLightboxOpen(true)}
              className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/65 text-white opacity-90 transition-opacity hover:bg-slate-950/85 md:opacity-0 md:group-hover/img:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Expand generated image"
              title="View full size"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-3.5 py-2.5 text-xs dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-700 dark:text-slate-200">
              {image.prompt}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5 text-slate-500 tabular-nums dark:text-slate-400">
              <span>{image.aspectRatio}</span>
              {image.style && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{image.style.replace('-', ' ')}</span>
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
                <span>{isRegenerating ? 'Generating...' : 'Variation'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download</span>
            </button>
          </div>
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
