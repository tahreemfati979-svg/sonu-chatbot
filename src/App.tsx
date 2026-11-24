import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Download,
  FileCode,
  FileText,
  Globe,
  Image as ImageIcon,
  Menu,
  MessageSquarePlus,
  Mic,
  MicOff,
  Paperclip,
  RefreshCw,
  Square,
  Upload,
  X,
} from 'lucide-react';
import { ChatMessage } from './components/ChatMessage';
import { ConfirmModal } from './components/ConfirmModal';
import { EmptyState } from './components/EmptyState';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { generateImageRequest, streamChatCompletion } from './services/chatApi';
import type {
  ChatAttachment,
  ChatError,
  Conversation,
  GeneratedImage,
  GroundedSource,
  ImageAspectRatio,
  Message,
  NewsItem,
  ThemeMode,
  UserPreferences,
  WeatherReport,
} from './types/chat';
import { formatFileSize, processSelectedFile } from './utils/fileProcessor';
import {
  deriveTitleFromMessage,
  exportConversationAsMarkdown,
  generateId,
  loadActiveConversationId,
  loadConversations,
  loadPreferences,
  loadTheme,
  saveActiveConversationId,
  saveConversations,
  savePreferences,
  saveTheme,
} from './utils/storage';

type DeleteTarget =
  | { type: 'single'; conversation: Conversation }
  | { type: 'all' }
  | null;

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [subIndex: number]: { transcript: string };
    };
  };
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const ASPECT_RATIOS: ImageAspectRatio[] = ['1:1', '16:9', '9:16', '4:3'];
const IMAGE_STYLES = [
  { value: '', label: 'Auto' },
  { value: 'realistic', label: 'Realistic' },
  { value: '3d', label: '3D' },
  { value: 'cartoon', label: 'Cartoon' },
  { value: 'anime', label: 'Anime' },
  { value: 'artistic', label: 'Artistic' },
  { value: 'minimalist', label: 'Minimalist' },
  { value: 'professional', label: 'Professional' },
];

function stripMarkdownForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code snippet omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = loadConversations();
    const savedActiveId = loadActiveConversationId();
    if (savedActiveId && saved.some((c) => c.id === savedActiveId)) {
      return savedActiveId;
    }
    return saved[0]?.id ?? null;
  });
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [preferences, setPreferences] = useState<UserPreferences>(() => loadPreferences());
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [forceWebSearch, setForceWebSearch] = useState(false);
  const [isImageMode, setIsImageMode] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState<ImageAspectRatio>('1:1');
  const [imageStyle, setImageStyle] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<ChatError | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);

  const isSendingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechBaseInputRef = useRef<string>('');

  const activeConversation =
    conversations.find((c) => c.id === activeId) ?? null;

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveTheme(theme);
  }, [theme]);

  // Persist user preferences
  useEffect(() => {
    savePreferences(preferences);
  }, [preferences]);

  // Persist conversations to Local Storage (debounced during active streaming)
  useEffect(() => {
    const delay = isStreaming ? 500 : 0;
    const timer = window.setTimeout(() => {
      const res = saveConversations(conversations);
      if (!res.ok && res.error) {
        setStorageWarning(res.error);
      } else {
        setStorageWarning(null);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [conversations, isStreaming]);

  // Persist active conversation pointer
  useEffect(() => {
    saveActiveConversationId(activeId);
  }, [activeId]);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages.length, isStreaming]);

  // Stop speech & mic on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingMessageId(null);
  }, []);

  const speakText = useCallback(
    (messageId: string, rawText: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setError({ message: 'Text-to-speech is not supported in this browser.' });
        return;
      }

      const clean = stripMarkdownForSpeech(rawText);
      if (!clean) return;

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = preferences.speechRate || 1.0;
      utterance.onend = () => setSpeakingMessageId(null);
      utterance.onerror = () => setSpeakingMessageId(null);
      setSpeakingMessageId(messageId);
      window.speechSynthesis.speak(utterance);
    },
    [preferences.speechRate]
  );

  const handleToggleSpeak = useCallback(
    (message: Message) => {
      if (speakingMessageId === message.id) {
        stopSpeaking();
      } else {
        speakText(message.id, message.content);
      }
    },
    [speakingMessageId, speakText, stopSpeaking]
  );

  const stopVoiceInput = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      stopVoiceInput();
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setError({
        message: 'Voice input (SpeechRecognition) is not supported in this browser. Try Chrome, Edge, or Safari.',
      });
      return;
    }

    setError(null);
    stopSpeaking();

    const recognition = new SpeechRec();
    recognition.lang = navigator.language || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    speechBaseInputRef.current = input.trim();

    recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const prefix = speechBaseInputRef.current;
      const combined = prefix ? `${prefix} ${transcript.trim()}` : transcript.trim();
      setInput(combined);
      if (composerRef.current) {
        composerRef.current.style.height = 'auto';
        composerRef.current.style.height = `${Math.min(composerRef.current.scrollHeight, 180)}px`;
      }
    };

    recognition.onerror = (ev) => {
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        setError({
          message:
            ev.error === 'not-allowed'
              ? 'Microphone access was denied. Please allow microphone permissions to use voice input.'
              : `Voice input error (${ev.error}).`,
        });
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
    }
  }, [input, isListening, stopSpeaking, stopVoiceInput]);

  const handleFilesAdded = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setError(null);

    const remainingSlots = Math.max(0, 4 - pendingAttachments.length);
    if (remainingSlots === 0) {
      setError({ message: 'Maximum of 4 files can be attached per message.' });
      return;
    }

    const processed: ChatAttachment[] = [];
    for (const file of files.slice(0, remainingSlots)) {
      try {
        const item = await processSelectedFile(file);
        processed.push(item);
      } catch (err) {
        setError({
          message: err instanceof Error ? err.message : `Could not attach ${file.name}.`,
        });
      }
    }

    if (processed.length > 0) {
      setPendingAttachments((prev) => [...prev, ...processed].slice(0, 4));
    }
  }, [pendingAttachments.length]);

  const abortOngoingStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isSendingRef.current = false;
    setIsStreaming(false);
    setLiveStatus(null);
  }, []);

  const resizeComposer = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  };

  const runCompletion = useCallback(
    async (
      conversationId: string,
      historyForApi: Message[],
      assistantMessageId: string,
      useImageMode = false
    ) => {
      if (isSendingRef.current) return;
      isSendingRef.current = true;
      setIsStreaming(true);
      setLiveStatus(
        useImageMode
          ? 'Generating image...'
          : forceWebSearch
          ? 'Searching live web sources...'
          : null
      );
      setError(null);
      stopSpeaking();

      const controller = new AbortController();
      abortControllerRef.current = controller;

      let receivedAnyToken = false;
      let receivedRichData = false;
      let accumulatedText = '';
      let pendingBuffer = '';
      let rafId: number | null = null;

      const patchAssistantMessage = (patch: Partial<Message>, touchUpdatedAt = false) => {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              updatedAt: touchUpdatedAt ? Date.now() : conv.updatedAt,
              messages: conv.messages.map((msg) =>
                msg.id === assistantMessageId ? { ...msg, ...patch } : msg
              ),
            };
          })
        );
      };

      const flushPendingChunks = (touchUpdatedAt = false) => {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (!pendingBuffer && !touchUpdatedAt) return;
        const textToAppend = pendingBuffer;
        pendingBuffer = '';

        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== conversationId) return conv;
            return {
              ...conv,
              updatedAt: touchUpdatedAt ? Date.now() : conv.updatedAt,
              messages: textToAppend
                ? conv.messages.map((msg) =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: msg.content + textToAppend }
                      : msg
                  )
                : conv.messages,
            };
          })
        );
      };

      try {
        const apiMessages = historyForApi
          .filter(
            (m) =>
              m.content.trim().length > 0 ||
              (m.attachments && m.attachments.length > 0) ||
              Boolean(m.generatedImage)
          )
          .map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map((a) => ({
              kind: a.kind,
              name: a.name,
              mimeType: a.mimeType,
              base64Data: a.base64Data,
              textContent: a.textContent,
            })),
            generatedImageMeta: m.generatedImage
              ? {
                  prompt: m.generatedImage.prompt,
                  enhancedPrompt: m.generatedImage.enhancedPrompt,
                  style: m.generatedImage.style,
                  aspectRatio: m.generatedImage.aspectRatio,
                }
              : undefined,
          }));

        await streamChatCompletion(
          apiMessages,
          {
            onStatus: (status) => {
              setLiveStatus(status);
            },
            onWeather: (weather: WeatherReport[]) => {
              receivedRichData = true;
              patchAssistantMessage({ weather });
            },
            onNews: (news: NewsItem[]) => {
              receivedRichData = true;
              patchAssistantMessage({ news });
            },
            onSources: (sources: GroundedSource[]) => {
              receivedRichData = true;
              patchAssistantMessage({ sources });
            },
            onImage: (generatedImage: GeneratedImage) => {
              receivedRichData = true;
              setLiveStatus(null);
              patchAssistantMessage({ generatedImage });
            },
            onSuggestions: (suggestions: string[]) => {
              patchAssistantMessage({ suggestions });
            },
            onChunk: (chunkText) => {
              receivedAnyToken = true;
              accumulatedText += chunkText;
              setLiveStatus(null);
              pendingBuffer += chunkText;
              if (rafId === null) {
                rafId = window.requestAnimationFrame(() => flushPendingChunks(false));
              }
            },
          },
          {
            signal: controller.signal,
            forceWebSearch,
            preferences,
            imageOptions: useImageMode
              ? {
                  forceImageMode: true,
                  aspectRatio: imageAspectRatio,
                  style: imageStyle,
                }
              : undefined,
          }
        );

        flushPendingChunks(receivedAnyToken || receivedRichData);

        if (!receivedAnyToken && !receivedRichData) {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === conversationId
                ? {
                    ...conv,
                    messages: conv.messages.filter(
                      (m) => m.id !== assistantMessageId
                    ),
                  }
                : conv
            )
          );
        } else if (preferences.autoSpeak && accumulatedText.trim()) {
          speakText(assistantMessageId, accumulatedText);
        }
      } catch (err) {
        flushPendingChunks(receivedAnyToken || receivedRichData);
        if (err instanceof Error && err.name === 'AbortError') {
          if (!receivedAnyToken && !receivedRichData) {
            setConversations((prev) =>
              prev.map((conv) =>
                conv.id === conversationId
                  ? {
                      ...conv,
                      messages: conv.messages.filter(
                        (m) => m.id !== assistantMessageId
                      ),
                    }
                  : conv
              )
            );
          }
          return;
        }

        if (!receivedAnyToken && !receivedRichData) {
          setConversations((prev) =>
            prev.map((conv) =>
              conv.id === conversationId
                ? {
                    ...conv,
                    messages: conv.messages.filter(
                      (m) => m.id !== assistantMessageId
                    ),
                  }
                : conv
            )
          );
        }

        setError({
          message:
            err instanceof Error
              ? err.message
              : 'Unable to get a response. Please try again.',
        });
      } finally {
        abortControllerRef.current = null;
        isSendingRef.current = false;
        setIsStreaming(false);
        setLiveStatus(null);
      }
    },
    [forceWebSearch, imageAspectRatio, imageStyle, preferences, speakText, stopSpeaking]
  );

  const handleSendMessage = useCallback(
    async (overrideText?: string) => {
      if (isListening) {
        stopVoiceInput();
      }
      const textToSend = (overrideText ?? input).trim();
      const attachmentsToSend = overrideText ? [] : pendingAttachments;

      if ((!textToSend && attachmentsToSend.length === 0) || isSendingRef.current) return;

      const useImageModeNow = !overrideText && isImageMode && attachmentsToSend.length === 0;
      const now = Date.now();
      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: textToSend,
        createdAt: now,
        attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
      };
      const assistantPlaceholder: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt: now + 1,
      };

      if (!overrideText) {
        setInput('');
        setPendingAttachments([]);
        if (composerRef.current) {
          composerRef.current.style.height = 'auto';
        }
      }

      let targetConversationId = activeId;
      let historyForApi: Message[] = [];

      if (
        !targetConversationId ||
        !conversations.some((c) => c.id === targetConversationId)
      ) {
        targetConversationId = generateId();
        const newConv: Conversation = {
          id: targetConversationId,
          title: deriveTitleFromMessage(textToSend, attachmentsToSend),
          messages: [userMessage, assistantPlaceholder],
          createdAt: now,
          updatedAt: now,
        };
        historyForApi = [userMessage];
        setConversations((prev) => [newConv, ...prev]);
        setActiveId(targetConversationId);
      } else {
        const existing = conversations.find((c) => c.id === targetConversationId)!;
        historyForApi = [...existing.messages, userMessage];
        const nextTitle =
          existing.messages.length === 0 && existing.title === 'New Chat'
            ? deriveTitleFromMessage(textToSend, attachmentsToSend)
            : existing.title;

        setConversations((prev) => {
          const updated = prev.map((conv) => {
            if (conv.id !== targetConversationId) return conv;
            return {
              ...conv,
              title: nextTitle,
              updatedAt: now,
              messages: [...conv.messages, userMessage, assistantPlaceholder],
            };
          });
          return [...updated].sort((a, b) => b.updatedAt - a.updatedAt);
        });
      }

      await runCompletion(
        targetConversationId,
        historyForApi,
        assistantPlaceholder.id,
        useImageModeNow
      );
    },
    [
      activeId,
      conversations,
      input,
      isImageMode,
      isListening,
      pendingAttachments,
      runCompletion,
      stopVoiceInput,
    ]
  );

  const handleRegenerateVariation = useCallback(
    async (messageId: string, image: GeneratedImage) => {
      if (!activeConversation) return;
      setError(null);
      try {
        const updated = await generateImageRequest({
          prompt: image.prompt,
          enhancedPrompt: image.enhancedPrompt,
          aspectRatio: image.aspectRatio,
          style: image.style,
        });
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== activeConversation.id) return conv;
            return {
              ...conv,
              updatedAt: Date.now(),
              messages: conv.messages.map((m) =>
                m.id === messageId ? { ...m, generatedImage: updated } : m
              ),
            };
          })
        );
      } catch (err) {
        setError({
          message:
            err instanceof Error ? err.message : 'Unable to generate image variation.',
        });
      }
    },
    [activeConversation]
  );

  const handleNewChat = useCallback(() => {
    abortOngoingStream();
    stopSpeaking();
    setError(null);
    setPendingAttachments([]);

    const existingEmpty = conversations.find((c) => c.messages.length === 0);
    if (existingEmpty) {
      setActiveId(existingEmpty.id);
      composerRef.current?.focus();
      return;
    }

    const now = Date.now();
    const newChat: Conversation = {
      id: generateId(),
      title: 'New Chat',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [newChat, ...prev]);
    setActiveId(newChat.id);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, [abortOngoingStream, conversations, stopSpeaking]);

  const handleSelectChat = useCallback(
    (id: string) => {
      if (id === activeId) return;
      abortOngoingStream();
      stopSpeaking();
      setError(null);
      setActiveId(id);
    },
    [abortOngoingStream, activeId, stopSpeaking]
  );

  const handleRenameChat = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === id
          ? { ...conv, title: trimmed, updatedAt: Date.now() }
          : conv
      )
    );
  }, []);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    abortOngoingStream();
    stopSpeaking();
    setError(null);

    if (deleteTarget.type === 'all') {
      setConversations([]);
      setActiveId(null);
      setDeleteTarget(null);
      return;
    }

    const targetId = deleteTarget.conversation.id;
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== targetId);
      if (activeId === targetId) {
        setActiveId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
    setDeleteTarget(null);
  }, [abortOngoingStream, activeId, deleteTarget, stopSpeaking]);

  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string, regenerate: boolean) => {
      if (!activeConversation || isSendingRef.current) return;
      const msgIndex = activeConversation.messages.findIndex(
        (m) => m.id === messageId
      );
      if (msgIndex === -1) return;

      const now = Date.now();
      const targetMsg = activeConversation.messages[msgIndex];

      if (!regenerate || targetMsg.role !== 'user') {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== activeConversation.id) return conv;
            return {
              ...conv,
              updatedAt: now,
              messages: conv.messages.map((m) =>
                m.id === messageId
                  ? { ...m, content: newContent, updatedAt: now }
                  : m
              ),
            };
          })
        );
        return;
      }

      const updatedUserMsg: Message = {
        ...targetMsg,
        content: newContent,
        updatedAt: now,
      };
      const truncatedHistory = [
        ...activeConversation.messages.slice(0, msgIndex),
        updatedUserMsg,
      ];
      const assistantPlaceholder: Message = {
        id: generateId(),
        role: 'assistant',
        content: '',
        createdAt: now + 1,
      };

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversation.id) return conv;
          return {
            ...conv,
            updatedAt: now,
            messages: [...truncatedHistory, assistantPlaceholder],
          };
        })
      );

      await runCompletion(
        activeConversation.id,
        truncatedHistory,
        assistantPlaceholder.id
      );
    },
    [activeConversation, runCompletion]
  );

  const handleDeleteMessage = useCallback(
    (messageId: string) => {
      if (!activeConversation || isSendingRef.current) return;
      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== activeConversation.id) return conv;
          return {
            ...conv,
            updatedAt: Date.now(),
            messages: conv.messages.filter((m) => m.id !== messageId),
          };
        })
      );
    },
    [activeConversation]
  );

  const handleRegenerate = useCallback(async () => {
    if (!activeConversation || isSendingRef.current) return;

    const msgs = activeConversation.messages;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') {
        lastUserIdx = i;
        break;
      }
    }
    if (lastUserIdx === -1) return;

    const historyUpToLastUser = msgs.slice(0, lastUserIdx + 1);
    const hadGeneratedImage = msgs
      .slice(lastUserIdx + 1)
      .some((m) => m.role === 'assistant' && Boolean(m.generatedImage));
    const now = Date.now();
    const assistantPlaceholder: Message = {
      id: generateId(),
      role: 'assistant',
      content: '',
      createdAt: now,
    };

    setConversations((prev) =>
      prev.map((conv) => {
        if (conv.id !== activeConversation.id) return conv;
        return {
          ...conv,
          updatedAt: now,
          messages: [...historyUpToLastUser, assistantPlaceholder],
        };
      })
    );

    await runCompletion(
      activeConversation.id,
      historyUpToLastUser,
      assistantPlaceholder.id,
      hadGeneratedImage || isImageMode
    );
  }, [activeConversation, isImageMode, runCompletion]);

  const handleRetryError = useCallback(() => {
    setError(null);
    handleRegenerate();
  }, [handleRegenerate]);

  const lastAssistantId = (() => {
    if (!activeConversation) return null;
    for (let i = activeConversation.messages.length - 1; i >= 0; i--) {
      if (activeConversation.messages[i].role === 'assistant') {
        return activeConversation.messages[i].id;
      }
    }
    return null;
  })();

  const handleCloseSidebar = useCallback(() => setIsSidebarOpen(false), []);
  const handleRequestDeleteChat = useCallback((conv: Conversation) => {
    setDeleteTarget({ type: 'single', conversation: conv });
  }, []);
  const handleRequestClearAll = useCallback(() => {
    setDeleteTarget({ type: 'all' });
  }, []);
  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);
  const handleOpenSettings = useCallback(() => {
    setIsSettingsOpen(true);
  }, []);

  const canSend =
    (input.trim().length > 0 || pendingAttachments.length > 0) && !isStreaming;

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50 text-slate-900 dark:bg-[#0B0F17] dark:text-slate-100">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={isSidebarOpen}
        theme={theme}
        onClose={handleCloseSidebar}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onRequestDeleteChat={handleRequestDeleteChat}
        onRequestClearAll={handleRequestClearAll}
        onToggleTheme={handleToggleTheme}
        onOpenSettings={handleOpenSettings}
      />

      <main
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes('Files')) {
            e.preventDefault();
            setIsDraggingFiles(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDraggingFiles(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFiles(false);
          if (e.dataTransfer?.files?.length) {
            handleFilesAdded(e.dataTransfer.files);
          }
        }}
      >
        {isDraggingFiles && (
          <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-blue-500 bg-blue-600/10 backdrop-blur-xs">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Upload className="h-6 w-6" />
            </div>
            <p className="font-display text-base font-semibold text-blue-700 dark:text-blue-300">
              Drop images, PDFs, or code files to analyze
            </p>
          </div>
        )}

        {/* Top Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xs dark:border-slate-800/90 dark:bg-[#0B0F17]/90">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Open chat history"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0">
              <h2 className="truncate font-display text-sm font-semibold text-slate-900 sm:text-base dark:text-white">
                {activeConversation ? activeConversation.title : 'Lumina Chat'}
              </h2>
            </div>

            {activeConversation && activeConversation.messages.length > 0 && (
              <div className="hidden items-center gap-1.5 text-xs text-slate-400 tabular-nums sm:flex dark:text-slate-500">
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">
                  {activeConversation.messages.length}{' '}
                  {activeConversation.messages.length === 1
                    ? 'message'
                    : 'messages'}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeConversation && activeConversation.messages.length > 0 && (
              <button
                type="button"
                onClick={() => exportConversationAsMarkdown(activeConversation)}
                className="flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Export chat as Markdown"
                aria-label="Export conversation"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Start new chat"
              title="New chat"
            >
              <MessageSquarePlus className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Storage quota warning if applicable */}
        {storageWarning && (
          <div
            role="status"
            className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300"
          >
            <span>{storageWarning}</span>
            <button
              type="button"
              onClick={() => setStorageWarning(null)}
              className="rounded p-1 hover:bg-amber-500/20"
              aria-label="Dismiss warning"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Chat Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          {!activeConversation || activeConversation.messages.length === 0 ? (
            <EmptyState onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
          ) : (
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
              {activeConversation.messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  isLatestAssistant={message.id === lastAssistantId}
                  isStreaming={isStreaming}
                  liveStatus={
                    message.id === lastAssistantId ? liveStatus : null
                  }
                  isSpeaking={speakingMessageId === message.id}
                  onEdit={handleEditMessage}
                  onDelete={handleDeleteMessage}
                  onRegenerate={handleRegenerate}
                  onToggleSpeak={handleToggleSpeak}
                  onSelectSuggestion={(prompt) => handleSendMessage(prompt)}
                  onRegenerateVariation={handleRegenerateVariation}
                />
              ))}

              {error && (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
                >
                  <div className="flex items-center gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error.message}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleRetryError}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-700 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Retry</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setError(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-500/15 dark:text-red-300"
                      aria-label="Dismiss error"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Message Composer */}
        <div className="shrink-0 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xs sm:px-6 sm:py-4 dark:border-slate-800/90 dark:bg-[#0B0F17]/95">
          <div className="mx-auto w-full max-w-3xl">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.xml,.yaml,.yml,.sql,.log"
              onChange={(e) => {
                if (e.target.files) {
                  handleFilesAdded(e.target.files);
                }
                e.target.value = '';
              }}
              className="hidden"
            />

            {/* Pending attachments preview strip */}
            {pendingAttachments.length > 0 && (
              <div className="mb-2.5 flex flex-wrap gap-2">
                {pendingAttachments.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-[#131A26]"
                  >
                    {att.kind === 'image' && att.dataUrl ? (
                      <img
                        src={att.dataUrl}
                        alt={att.name}
                        className="h-8 w-8 rounded-md object-cover"
                      />
                    ) : att.kind === 'pdf' ? (
                      <FileText className="h-4 w-4 shrink-0 text-red-500" />
                    ) : (
                      <FileCode className="h-4 w-4 shrink-0 text-blue-500" />
                    )}
                    <div className="min-w-0 max-w-[150px]">
                      <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                        {att.name}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums dark:text-slate-400">
                        {formatFileSize(att.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAttachments((prev) => prev.filter((item) => item.id !== att.id))
                      }
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      aria-label={`Remove ${att.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Image Generation Controls Bar (only when Image Mode is toggled on) */}
            {isImageMode && (
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-[#131A26]">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-slate-600 dark:text-slate-400">Ratio:</span>
                  {ASPECT_RATIOS.map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setImageAspectRatio(ratio)}
                      className={`rounded-md px-2 py-1 font-medium tabular-nums transition-colors ${
                        imageAspectRatio === ratio
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  <span className="font-medium text-slate-600 dark:text-slate-400 mr-1">Style:</span>
                  {IMAGE_STYLES.map((st) => (
                    <button
                      key={st.label}
                      type="button"
                      onClick={() => setImageStyle(st.value)}
                      className={`rounded-md px-2 py-1 font-medium transition-colors whitespace-nowrap ${
                        imageStyle === st.value
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-2 transition-colors focus-within:border-blue-500 focus-within:bg-white dark:border-slate-800 dark:bg-[#131A26] dark:focus-within:border-blue-500"
            >
              <textarea
                ref={composerRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeComposer(e.target);
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const pastedFiles: File[] = [];
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].kind === 'file') {
                      const f = items[i].getAsFile();
                      if (f) pastedFiles.push(f);
                    }
                  }
                  if (pastedFiles.length > 0) {
                    e.preventDefault();
                    handleFilesAdded(pastedFiles);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  isImageMode
                    ? 'Describe the image you want to generate...'
                    : isListening
                    ? 'Listening... speak naturally'
                    : 'Ask anything, drop files/images, or use voice...'
                }
                rows={1}
                aria-label="Message input"
                className="max-h-[180px] min-h-[42px] w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
              />

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    title="Attach images, PDFs, or text/code files"
                    aria-label="Attach files"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  >
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Attach</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsImageMode((prev) => !prev);
                      if (forceWebSearch) setForceWebSearch(false);
                    }}
                    aria-pressed={isImageMode}
                    title="Toggle image generation mode"
                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap ${
                      isImageMode
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <ImageIcon className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setForceWebSearch((prev) => !prev);
                      if (isImageMode) setIsImageMode(false);
                    }}
                    aria-pressed={forceWebSearch}
                    title={
                      forceWebSearch
                        ? 'Live web search forced for all messages'
                        : 'Auto live web search enabled (click to force for every message)'
                    }
                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap ${
                      forceWebSearch
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <Globe className="h-4 w-4 shrink-0" />
                    <span className="hidden sm:inline">
                      {forceWebSearch ? 'Web On' : 'Auto Live'}
                    </span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    disabled={isStreaming}
                    aria-pressed={isListening}
                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 ${
                      isListening
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {isListening ? (
                      <MicOff className="h-4 w-4" />
                    ) : (
                      <Mic className="h-4 w-4" />
                    )}
                  </button>

                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={abortOngoingStream}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-700 dark:hover:bg-slate-600"
                      aria-label="Stop generating"
                      title="Stop generating"
                    >
                      <Square className="h-4 w-4 fill-current" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!canSend}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                      aria-label="Send message"
                      title="Send message"
                    >
                      <ArrowUp className="h-5 w-5" />
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className="mt-2 hidden items-center justify-between px-1 text-xs text-slate-400 sm:flex dark:text-slate-500">
              <span>Enter to send · Shift + Enter for new line · Drag or paste files</span>
              <span>Voice, Vision, PDFs, Images &amp; Live Web</span>
            </div>
          </div>
        </div>
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        preferences={preferences}
        onSave={setPreferences}
        onClose={() => setIsSettingsOpen(false)}
      />

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={
          deleteTarget?.type === 'all'
            ? 'Clear all conversations?'
            : 'Delete conversation?'
        }
        description={
          deleteTarget?.type === 'all'
            ? 'This will permanently remove all saved chat history from your browser. This action cannot be undone.'
            : deleteTarget?.type === 'single'
            ? `Are you sure you want to delete "${deleteTarget.conversation.title}"? This action cannot be undone.`
            : ''
        }
        confirmLabel={deleteTarget?.type === 'all' ? 'Clear All' : 'Delete'}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
