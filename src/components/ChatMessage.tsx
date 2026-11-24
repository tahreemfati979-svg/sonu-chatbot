import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  FileCode,
  FileText,
  Pencil,
  RotateCcw,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { GeneratedImage, Message } from '../types/chat';
import { formatFileSize } from '../utils/fileProcessor';
import { formatTime } from '../utils/storage';
import { GeneratedImageCard } from './GeneratedImageCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { NewsCards } from './NewsCards';
import { WeatherCard } from './WeatherCard';

interface ChatMessageProps {
  message: Message;
  isLatestAssistant: boolean;
  isStreaming: boolean;
  liveStatus?: string | null;
  isSpeaking?: boolean;
  onEdit: (messageId: string, newContent: string, regenerate: boolean) => void;
  onDelete: (messageId: string) => void;
  onRegenerate: () => void;
  onToggleSpeak?: (message: Message) => void;
  onSelectSuggestion?: (prompt: string) => void;
  onRegenerateVariation?: (messageId: string, image: GeneratedImage) => Promise<void> | void;
}

export const ChatMessage: React.FC<ChatMessageProps> = React.memo(({
  message,
  isLatestAssistant,
  isStreaming,
  liveStatus,
  isSpeaking = false,
  onEdit,
  onDelete,
  onRegenerate,
  onToggleSpeak,
  onSelectSuggestion,
  onRegenerateVariation,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isUser = message.role === 'user';
  const hasAttachments = Array.isArray(message.attachments) && message.attachments.length > 0;
  const hasRichCards =
    Boolean(message.generatedImage) ||
    (Array.isArray(message.weather) && message.weather.length > 0) ||
    (Array.isArray(message.news) && message.news.length > 0);
  const isWaitingForFirstToken =
    !isUser && isStreaming && isLatestAssistant && message.content.length === 0 && !message.generatedImage;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleCopy = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleStartEdit = () => {
    setDraft(message.content);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setDraft(message.content);
    setIsEditing(false);
  };

  const handleSaveEdit = (regenerate: boolean) => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setIsEditing(false);
    onEdit(message.id, trimmed, regenerate);
  };

  return (
    <div
      className={`group flex w-full gap-3 ${
        isUser ? 'justify-end' : 'justify-start'
      }`}
    >
      {!isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-600 dark:border-slate-800 dark:bg-[#161E2E] dark:text-blue-400">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div
        className={`flex max-w-[90%] flex-col sm:max-w-[82%] ${
          isUser ? 'items-end' : 'items-start'
        }`}
      >
        <div
          className={`w-full rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-blue-600 text-white'
              : 'border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-100'
          }`}
        >
          {isEditing ? (
            <div className="space-y-3 min-w-[240px] sm:min-w-[340px]">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancelEdit();
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSaveEdit(isUser);
                  }
                }}
                rows={2}
                aria-label="Edit message"
                className={`w-full resize-none rounded-lg border p-2.5 text-[15px] leading-relaxed focus:outline-none ${
                  isUser
                    ? 'border-blue-400/50 bg-blue-700/60 text-white placeholder:text-blue-200 focus:border-white'
                    : 'border-slate-300 bg-slate-50 text-slate-900 focus:border-blue-500 dark:border-slate-700 dark:bg-[#0B0F17] dark:text-slate-100'
                }`}
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    isUser
                      ? 'bg-blue-700/70 text-blue-100 hover:bg-blue-800'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <X className="h-3.5 w-3.5" />
                  <span>Cancel</span>
                </button>
                {isUser && (
                  <button
                    type="button"
                    onClick={() => handleSaveEdit(false)}
                    disabled={!draft.trim()}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-blue-800/70 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-900 disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSaveEdit(isUser)}
                  disabled={!draft.trim()}
                  className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                    isUser
                      ? 'bg-white text-blue-700 hover:bg-blue-50'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>{isUser ? 'Save & Regenerate' : 'Save'}</span>
                </button>
              </div>
            </div>
          ) : isUser ? (
            <div className="space-y-2.5">
              {hasAttachments && (
                <div className="flex flex-wrap gap-2">
                  {message.attachments!.map((att) =>
                    att.kind === 'image' && att.dataUrl ? (
                      <div
                        key={att.id}
                        className="overflow-hidden rounded-lg border border-white/20 bg-blue-700/40"
                      >
                        <img
                          src={att.dataUrl}
                          alt={att.name}
                          className="max-h-40 max-w-[220px] object-cover"
                        />
                        <div className="truncate px-2 py-1 text-[11px] text-blue-100 max-w-[220px]">
                          {att.name}
                        </div>
                      </div>
                    ) : (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 rounded-lg border border-white/20 bg-blue-700/50 px-2.5 py-1.5 text-xs text-white"
                      >
                        {att.kind === 'pdf' ? (
                          <FileText className="h-4 w-4 shrink-0 text-blue-100" />
                        ) : (
                          <FileCode className="h-4 w-4 shrink-0 text-blue-100" />
                        )}
                        <div className="min-w-0">
                          <div className="truncate max-w-[180px] font-medium">{att.name}</div>
                          <div className="text-[11px] text-blue-200 tabular-nums">
                            {formatFileSize(att.size)}
                          </div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {message.content && (
                <p className="whitespace-pre-wrap text-[15px] leading-relaxed break-words">
                  {message.content}
                </p>
              )}
            </div>
          ) : (
            <div>
              {message.generatedImage && (
                <GeneratedImageCard
                  image={message.generatedImage}
                  onRegenerateVariation={
                    onRegenerateVariation
                      ? (img) => onRegenerateVariation(message.id, img)
                      : undefined
                  }
                />
              )}

              {message.weather && message.weather.length > 0 && (
                <WeatherCard reports={message.weather} />
              )}

              {isWaitingForFirstToken ? (
                <div className="flex items-center gap-2 py-1 text-sm text-slate-500 dark:text-slate-400">
                  <span className="inline-flex gap-1" aria-hidden="true">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                  </span>
                  <span>
                    {liveStatus || (hasRichCards ? 'Summarizing live data...' : 'Thinking...')}
                  </span>
                </div>
              ) : (
                message.content && <MarkdownRenderer content={message.content} />
              )}

              {(!isWaitingForFirstToken || hasRichCards) && (
                <NewsCards news={message.news} sources={message.sources} />
              )}
            </div>
          )}
        </div>

        {/* Smart Follow-up Suggestions */}
        {!isUser &&
          !isEditing &&
          !isStreaming &&
          isLatestAssistant &&
          Array.isArray(message.suggestions) &&
          message.suggestions.length > 0 &&
          onSelectSuggestion && (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested follow-ups">
              {message.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => onSelectSuggestion(suggestion)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-left text-xs font-medium text-slate-700 transition-colors hover:border-blue-500/60 hover:bg-blue-50/60 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-[#131A26] dark:text-slate-300 dark:hover:border-blue-500/60 dark:hover:bg-blue-500/10 dark:hover:text-blue-300"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

        {/* Timestamp & message actions */}
        {!isEditing && !isWaitingForFirstToken && (
          <div
            className={`mt-1.5 flex items-center gap-2 px-1 text-xs text-slate-400 dark:text-slate-500 ${
              isUser ? 'flex-row-reverse' : 'flex-row'
            }`}
          >
            <span className="tabular-nums">{formatTime(message.createdAt)}</span>
            {message.updatedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span>Edited</span>
              </>
            )}

            <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              {!isUser && message.content && onToggleSpeak && (
                <button
                  type="button"
                  onClick={() => onToggleSpeak(message)}
                  className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    isSpeaking
                      ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                  }`}
                  aria-label={isSpeaking ? 'Stop reading aloud' : 'Read response aloud'}
                  title={isSpeaking ? 'Stop speaking' : 'Listen'}
                >
                  {isSpeaking ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleCopy}
                className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Copy message"
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>

              {!isStreaming && (
                <>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Edit message"
                    title="Edit message"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>

                  {!isUser && isLatestAssistant && (
                    <button
                      type="button"
                      onClick={onRegenerate}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label="Regenerate response"
                      title="Regenerate response"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDelete(message.id)}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                    aria-label="Delete message"
                    title="Delete message"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {isUser && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
});

ChatMessage.displayName = 'ChatMessage';
