import React from 'react';
import { ExternalLink, Globe, Newspaper } from 'lucide-react';
import type { GroundedSource, NewsItem } from '../types/chat';

interface NewsCardsProps {
  news?: NewsItem[];
  sources?: GroundedSource[];
}

function formatPubDate(raw: string): string {
  if (!raw) return '';
  try {
    const dt = new Date(raw);
    if (Number.isNaN(dt.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(dt);
  } catch {
    return '';
  }
}

export const NewsCards: React.FC<NewsCardsProps> = React.memo(({ news, sources }) => {
  const hasNews = Array.isArray(news) && news.length > 0;
  const hasSources = Array.isArray(sources) && sources.length > 0;

  if (!hasNews && !hasSources) return null;

  return (
    <div className="mt-3.5 space-y-3 border-t border-slate-200/80 pt-3 dark:border-slate-800">
      {hasNews && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Newspaper className="h-3.5 w-3.5" />
            <span>Latest Headlines</span>
          </div>
          <ul className="divide-y divide-slate-200/70 rounded-lg border border-slate-200 bg-slate-50/70 dark:divide-slate-800 dark:border-slate-800 dark:bg-[#0E1420]">
            {news.map((item, idx) => {
              const formattedDate = formatPubDate(item.publishedAt);
              return (
                <li key={`${item.url}-${idx}`}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group/link flex items-start justify-between gap-3 px-3.5 py-2.5 transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-snug text-slate-800 group-hover/link:text-blue-600 dark:text-slate-200 dark:group-hover/link:text-blue-400">
                        {item.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        <span>{item.source}</span>
                        {formattedDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formattedDate}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 group-hover/link:text-blue-500" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {hasSources && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Globe className="h-3.5 w-3.5" />
            <span>Verified Web Sources</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {sources.map((src, idx) => (
              <a
                key={`${src.url}-${idx}`}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex max-w-[260px] items-center gap-1 text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <span className="truncate">{src.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

NewsCards.displayName = 'NewsCards';
