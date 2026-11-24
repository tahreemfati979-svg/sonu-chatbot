import React, { useEffect, useState } from 'react';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import type { ResponseStyle, UserPreferences } from '../types/chat';
import { DEFAULT_PREFERENCES } from '../utils/storage';

interface SettingsModalProps {
  isOpen: boolean;
  preferences: UserPreferences;
  onSave: (next: UserPreferences) => void;
  onClose: () => void;
}

const STYLE_OPTIONS: Array<{ value: ResponseStyle; label: string }> = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'concise', label: 'Concise' },
  { value: 'detailed', label: 'Detailed' },
  { value: 'creative', label: 'Creative' },
];

const SPEECH_RATES = [0.85, 1.0, 1.15, 1.3];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  preferences,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<UserPreferences>(preferences);

  useEffect(() => {
    if (isOpen) {
      setDraft(preferences);
    }
  }, [isOpen, preferences]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#111827]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h2
                id="settings-modal-title"
                className="font-display text-base font-semibold text-slate-900 dark:text-white"
              >
                Personalization &amp; Voice Settings
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tailor how Lumina responds, asks questions, and speaks.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="pref-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Your Name (optional)
              </label>
              <input
                id="pref-name"
                type="text"
                maxLength={60}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Alex"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label
                htmlFor="pref-role"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Role or Focus (optional)
              </label>
              <input
                id="pref-role"
                type="text"
                maxLength={80}
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
                placeholder="e.g. Software engineer, student"
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Response Style
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-lg bg-slate-100 p-1 sm:grid-cols-4 dark:bg-[#0B0F17]">
              {STYLE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDraft({ ...draft, responseStyle: opt.value })}
                  className={`min-h-[34px] rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                    draft.responseStyle === opt.value
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="pref-instructions"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Custom Instructions
            </label>
            <textarea
              id="pref-instructions"
              rows={3}
              maxLength={800}
              value={draft.customInstructions}
              onChange={(e) => setDraft({ ...draft, customInstructions: e.target.value })}
              placeholder="e.g. Prefer TypeScript examples, metric units, and concise bullet summaries."
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <div className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Ask clarifying questions
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Prompt for missing details when requests are ambiguous instead of guessing.
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.askClarifyingQuestions}
                onChange={(e) =>
                  setDraft({ ...draft, askClarifyingQuestions: e.target.checked })
                }
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Smart follow-up suggestions
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Show quick follow-up prompt ideas below assistant replies.
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.showSuggestions}
                onChange={(e) => setDraft({ ...draft, showSuggestions: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  Auto-read responses aloud
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Automatically speak completed answers using browser text-to-speech.
                </div>
              </div>
              <input
                type="checkbox"
                checked={draft.autoSpeak}
                onChange={(e) => setDraft({ ...draft, autoSpeak: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Voice playback speed
              </span>
              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-[#0B0F17]">
                {SPEECH_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setDraft({ ...draft, speechRate: rate })}
                    className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                      Math.abs(draft.speechRate - rate) < 0.01
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_PREFERENCES)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSave(draft);
                onClose();
              }}
              className="min-h-[38px] rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 whitespace-nowrap"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
