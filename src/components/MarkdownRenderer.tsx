import React, { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';

interface CodeBlockProps {
  language: string;
  code: string;
}

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: 'js',
  js: 'js',
  typescript: 'ts',
  ts: 'ts',
  tsx: 'tsx',
  jsx: 'jsx',
  python: 'py',
  py: 'py',
  html: 'html',
  css: 'css',
  json: 'json',
  sql: 'sql',
  bash: 'sh',
  sh: 'sh',
  markdown: 'md',
  md: 'md',
  yaml: 'yml',
  yml: 'yml',
};

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleDownload = () => {
    const ext = LANGUAGE_EXTENSIONS[language.toLowerCase()] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `snippet.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 text-slate-100 dark:border-slate-700/80 dark:bg-[#090D14]">
      <div className="flex items-center justify-between border-b border-slate-800 px-3.5 py-2 text-xs text-slate-400">
        <span className="font-mono">{language || 'code'}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Download code snippet"
            title="Download snippet"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={key} className="font-semibold text-slate-900 dark:text-white">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      tokens.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code
          key={key}
          className="rounded bg-slate-200/70 px-1.5 py-0.5 text-[0.875em] font-mono text-slate-900 dark:bg-slate-800 dark:text-slate-100"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith('[')) {
      const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      if (linkMatch) {
        tokens.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline decoration-blue-600/40 underline-offset-2 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

function parseTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false;
  const cells = parseTableCells(trimmed);
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function renderProseBlock(block: string, blockIdx: number): React.ReactNode {
  const lines = block.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Markdown table detection
    if (
      trimmed.includes('|') &&
      i + 1 < lines.length &&
      isTableSeparatorLine(lines[i + 1])
    ) {
      const headers = parseTableCells(trimmed);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes('|')) {
        rows.push(parseTableCells(lines[i]));
        i++;
      }

      elements.push(
        <div
          key={`tbl-${blockIdx}-${i}`}
          className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800"
        >
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-200">
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx} className="px-3 py-2 font-semibold whitespace-nowrap">
                    {renderInline(h, `th-${blockIdx}-${i}-${hIdx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {rows.map((row, rIdx) => (
                <tr key={rIdx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                  {headers.map((_, cIdx) => (
                    <td
                      key={cIdx}
                      className="px-3 py-2 text-slate-700 tabular-nums dark:text-slate-300"
                    >
                      {renderInline(row[cIdx] || '', `td-${blockIdx}-${i}-${rIdx}-${cIdx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3
          key={`h3-${blockIdx}-${i}`}
          className="mt-4 mb-1.5 text-base font-semibold text-slate-900 dark:text-white first:mt-0"
        >
          {renderInline(trimmed.slice(4), `h3-${blockIdx}-${i}`)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      elements.push(
        <h2
          key={`h2-${blockIdx}-${i}`}
          className="mt-4 mb-2 text-lg font-semibold text-slate-900 dark:text-white first:mt-0"
        >
          {renderInline(trimmed.slice(3), `h2-${blockIdx}-${i}`)}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      elements.push(
        <h1
          key={`h1-${blockIdx}-${i}`}
          className="mt-4 mb-2 text-xl font-bold text-slate-900 dark:text-white first:mt-0"
        >
          {renderInline(trimmed.slice(2), `h1-${blockIdx}-${i}`)}
        </h1>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${blockIdx}-${i}`}
          className="my-2.5 rounded-lg border border-slate-200 bg-slate-100/70 px-3.5 py-2.5 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300"
        >
          {quoteLines.map((qLine, qIdx) => (
            <p key={qIdx} className={qIdx > 0 ? 'mt-1' : ''}>
              {renderInline(qLine, `bq-${blockIdx}-${i}-${qIdx}`)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${blockIdx}-${i}`} className="my-2 list-disc space-y-1 pl-5">
          {listItems.map((item, liIdx) => (
            <li key={liIdx} className="leading-relaxed">
              {renderInline(item, `ul-${blockIdx}-${i}-${liIdx}`)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${blockIdx}-${i}`} className="my-2 list-decimal space-y-1 pl-5">
          {listItems.map((item, liIdx) => (
            <li key={liIdx} className="leading-relaxed">
              {renderInline(item, `ol-${blockIdx}-${i}-${liIdx}`)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('> ') &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !(lines[i].trim().includes('|') && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1]))
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    elements.push(
      <p key={`p-${blockIdx}-${i}`} className="my-2 leading-relaxed first:mt-0 last:mb-0">
        {paragraphLines.map((pLine, pIdx) => (
          <React.Fragment key={pIdx}>
            {pIdx > 0 && <br />}
            {renderInline(pLine, `p-${blockIdx}-${i}-${pIdx}`)}
          </React.Fragment>
        ))}
      </p>
    );
  }

  return elements;
}

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = React.memo(({ content }) => {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-[15px] leading-relaxed break-words">
      {segments.map((segment, index) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const language = firstNewline !== -1 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;
          return <CodeBlock key={`code-${index}`} language={language} code={code.replace(/\n$/, '')} />;
        }

        if (!segment.trim()) return null;
        return <React.Fragment key={`prose-${index}`}>{renderProseBlock(segment, index)}</React.Fragment>;
      })}
    </div>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
