import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type { Conversation, ThemeMode } from '../types/chat';
import { formatRelativeDate } from '../utils/storage';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  theme: ThemeMode;
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, newTitle: string) => void;
  onRequestDeleteChat: (conversation: Conversation) => void;
  onRequestClearAll: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
  conversations,
  activeId,
  isOpen,
  theme,
  onClose,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onRequestDeleteChat,
  onRequestClearAll,
  onToggleTheme,
  onOpenSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [editingId]);

  const startEditing = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditingTitle(conv.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    const trimmed = editingTitle.trim();
    if (trimmed) {
      onRenameChat(editingId, trimmed);
    }
    setEditingId(null);
    setEditingTitle('');
  };

  const cancelRename = () => {
    setEditingId(null);
    setEditingTitle('');
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredConversations = normalizedQuery
    ? conversations.filter(
        (conv) =>
          conv.title.toLowerCase().includes(normalizedQuery) ||
          conv.messages.some((m) => m.content.toLowerCase().includes(normalizedQuery))
      )
    : conversations;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out md:static md:w-[272px] md:translate-x-0 dark:border-slate-800/90 dark:bg-[#111827] ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Chat history"
      >
        {/* Top brand & New Chat button */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3.5 dark:border-slate-800/90">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <MessageSquare className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-semibold tracking-tight text-slate-900 truncate dark:text-white">
              Lumina Chat
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>New Chat</span>
          </button>

          {conversations.length > 0 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
                aria-label="Search conversations"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pr-8 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-[#0B0F17] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-500 dark:focus:bg-[#0B0F17]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1/2 right-2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto px-2.5 pb-3">
          {conversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                No conversations yet
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Start a chat to save it automatically in your browser.
              </p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No matching chats
              </p>
            </div>
          ) : (
            <ul className="space-y-1" role="list">
              {filteredConversations.map((conv) => {
                const isActive = conv.id === activeId;
                const isEditing = editingId === conv.id;

                return (
                  <li key={conv.id}>
                    {isEditing ? (
                      <div className="flex items-center gap-1.5 rounded-lg border border-blue-500 bg-slate-50 p-1.5 dark:bg-[#0B0F17]">
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitRename();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRename();
                            }
                          }}
                          maxLength={80}
                          aria-label="Rename conversation"
                          className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-slate-900 focus:outline-none dark:text-white"
                        />
                        <button
                          type="button"
                          onClick={commitRename}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                          aria-label="Save title"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-label="Cancel rename"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        className={`group flex items-center gap-1 rounded-lg border transition-colors ${
                          isActive
                            ? 'border-slate-200 bg-slate-100 text-slate-900 dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-white'
                            : 'border-transparent text-slate-700 hover:bg-slate-100/70 dark:text-slate-300 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectChat(conv.id);
                            onClose();
                          }}
                          className="min-w-0 flex-1 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
                        >
                          <div className="truncate text-sm font-medium">{conv.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                            <span>
                              {conv.messages.length}{' '}
                              {conv.messages.length === 1 ? 'msg' : 'msgs'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{formatRelativeDate(conv.updatedAt)}</span>
                          </div>
                        </button>

                        <div
                          className={`flex shrink-0 items-center gap-0.5 pr-1.5 transition-opacity ${
                            isActive
                              ? 'opacity-100'
                              : 'opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => startEditing(conv, e)}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-200/80 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                            aria-label={`Rename ${conv.title}`}
                            title="Rename chat"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRequestDeleteChat(conv);
                            }}
                            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
                            aria-label={`Delete ${conv.title}`}
                            title="Delete chat"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer controls */}
        <div className="border-t border-slate-200 p-3 space-y-1 dark:border-slate-800/90">
          <button
            type="button"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
            className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800/70"
          >
            <SlidersHorizontal className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <span>Personalization &amp; Voice</span>
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="flex min-h-[40px] w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-300 dark:hover:bg-slate-800/70"
          >
            <span className="flex items-center gap-2.5">
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-600" />
              )}
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </span>
          </button>

          {conversations.length > 1 && (
            <button
              type="button"
              onClick={onRequestClearAll}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All Chats</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
});

Sidebar.displayName = 'Sidebar';
