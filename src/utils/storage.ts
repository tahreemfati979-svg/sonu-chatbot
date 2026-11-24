import type {
  ChatAttachment,
  Conversation,
  Message,
  ThemeMode,
  UserPreferences,
} from '../types/chat';

const CONVERSATIONS_KEY = 'lumina_chat_conversations_v1';
const ACTIVE_CHAT_KEY = 'lumina_chat_active_id_v1';
const THEME_KEY = 'lumina_chat_theme_v1';
const PREFERENCES_KEY = 'lumina_chat_preferences_v1';

export const DEFAULT_PREFERENCES: UserPreferences = {
  name: '',
  role: '',
  responseStyle: 'balanced',
  customInstructions: '',
  askClarifyingQuestions: true,
  showSuggestions: true,
  autoSpeak: false,
  speechRate: 1.0,
};

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveTitleFromMessage(content: string, attachments?: ChatAttachment[]): string {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    if (attachments && attachments.length > 0) {
      return `Analyze ${attachments[0].name}`.slice(0, 42);
    }
    return 'New Chat';
  }
  if (cleaned.length <= 42) return cleaned;
  return `${cleaned.slice(0, 42).trimEnd()}...`;
}

export function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg.id !== 'string' || seen.has(msg.id)) continue;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    if (typeof msg.content !== 'string') continue;
    seen.add(msg.id);
    result.push({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: typeof msg.createdAt === 'number' ? msg.createdAt : Date.now(),
      updatedAt: typeof msg.updatedAt === 'number' ? msg.updatedAt : undefined,
      attachments: Array.isArray(msg.attachments) ? msg.attachments : undefined,
      weather: Array.isArray(msg.weather) ? msg.weather : undefined,
      news: Array.isArray(msg.news) ? msg.news : undefined,
      sources: Array.isArray(msg.sources) ? msg.sources : undefined,
      generatedImage:
        msg.generatedImage && typeof msg.generatedImage === 'object'
          ? msg.generatedImage
          : undefined,
      suggestions: Array.isArray(msg.suggestions) ? msg.suggestions : undefined,
    });
  }
  return result;
}

function sanitizeForStorage(conversations: Conversation[], stripThumbnails = false): Conversation[] {
  return conversations.map((conv) => ({
    ...conv,
    messages: conv.messages.map((msg) => ({
      ...msg,
      attachments: msg.attachments?.map((att) => ({
        id: att.id,
        name: att.name,
        mimeType: att.mimeType,
        size: att.size,
        kind: att.kind,
        dataUrl:
          !stripThumbnails && att.dataUrl && att.dataUrl.length <= 80_000
            ? att.dataUrl
            : undefined,
        textContent:
          !stripThumbnails && att.textContent ? att.textContent.slice(0, 1500) : undefined,
      })),
      generatedImage: msg.generatedImage
        ? {
            ...msg.generatedImage,
            dataUrl:
              !stripThumbnails &&
              msg.generatedImage.dataUrl &&
              msg.generatedImage.dataUrl.length <= 480_000
                ? msg.generatedImage.dataUrl
                : undefined,
          }
        : undefined,
    })),
  }));
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const seenIds = new Set<string>();
    const valid: Conversation[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.id !== 'string' || seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      valid.push({
        id: item.id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : 'New Chat',
        messages: Array.isArray(item.messages) ? deduplicateMessages(item.messages) : [],
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
      });
    }

    return valid.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') return { ok: true };
  try {
    const compact = sanitizeForStorage(conversations, false);
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(compact));
    return { ok: true };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      try {
        const stripped = sanitizeForStorage(conversations, true);
        window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(stripped));
        return { ok: true };
      } catch {
        return {
          ok: false,
          error: 'Browser storage is full. Consider deleting older conversations.',
        };
      }
    }
    return { ok: false, error: 'Unable to save conversations to browser storage.' };
  }
}

export function loadActiveConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_KEY);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_CHAT_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_KEY);
    }
  } catch {
    // Ignore storage write failure for active pointer
  }
}

export function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage read error
  }
  return 'dark';
}

export function saveTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage write error
  }
}

export function loadPreferences(): UserPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFERENCES;
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      responseStyle:
        parsed.responseStyle === 'concise' ||
        parsed.responseStyle === 'detailed' ||
        parsed.responseStyle === 'creative'
          ? parsed.responseStyle
          : 'balanced',
      customInstructions:
        typeof parsed.customInstructions === 'string' ? parsed.customInstructions : '',
      askClarifyingQuestions: parsed.askClarifyingQuestions !== false,
      showSuggestions: parsed.showSuggestions !== false,
      autoSpeak: parsed.autoSpeak === true,
      speechRate:
        typeof parsed.speechRate === 'number' && parsed.speechRate >= 0.7 && parsed.speechRate <= 1.5
          ? parsed.speechRate
          : 1.0,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: UserPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage write failure
  }
}

export function exportConversationAsMarkdown(conversation: Conversation): void {
  const lines: string[] = [`# ${conversation.title}`, ''];
  for (const msg of conversation.messages) {
    const speaker = msg.role === 'user' ? 'You' : 'Lumina';
    lines.push(`## ${speaker} (${formatTime(msg.createdAt)})`);
    if (msg.attachments && msg.attachments.length > 0) {
      lines.push(`_Attachments: ${msg.attachments.map((a) => a.name).join(', ')}_`);
    }
    if (msg.content) {
      lines.push(msg.content);
    }
    if (msg.generatedImage) {
      lines.push(`![${msg.generatedImage.prompt}](${msg.generatedImage.url})`);
    }
    lines.push('');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${conversation.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48) || 'chat'}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
}

export function formatRelativeDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;

  const isSameDay =
    now.getFullYear() === date.getFullYear() &&
    now.getMonth() === date.getMonth() &&
    now.getDate() === date.getDate();

  if (isSameDay) {
    return formatTime(timestamp);
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    yesterday.getFullYear() === date.getFullYear() &&
    yesterday.getMonth() === date.getMonth() &&
    yesterday.getDate() === date.getDate();

  if (isYesterday) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date);
}
