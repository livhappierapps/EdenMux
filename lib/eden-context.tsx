import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { apiRequest } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';

export interface EdenMessage {
  id: string;
  role: 'user' | 'eden';
  content: string;
  timestamp: number;
}

export interface ModerationStatus {
  banned: boolean;
  permanent: boolean;
  banUntil: string | null;
  remainingMs: number;
  warningCount: number;
  banCount: number;
}

export type EdenMode = 'sugar' | 'spice';

const FREE_DAILY_LIMIT = 15;
const DAILY_COUNT_KEY = '@eden_daily_count';
const DAILY_DATE_KEY = '@eden_daily_date';
const CHAT_HISTORY_KEY = '@eden_chat_history';

interface EdenContextType {
  messages: EdenMessage[];
  isOpen: boolean;
  isThinking: boolean;
  moderation: ModerationStatus | null;
  deviceId: string | null;
  edenMode: EdenMode;
  isHidden: boolean;
  isAutoSpeak: boolean;
  pendingGreeting: string | null;
  dailyCount: number;
  isAtDailyLimit: boolean;
  sendMessage: (text: string) => Promise<void>;
  openEden: () => void;
  closeEden: () => void;
  toggleEden: () => void;
  clearChat: () => void;
  setEdenMode: (v: EdenMode) => void;
  setHidden: (v: boolean) => void;
  setAutoSpeak: (v: boolean) => void;
  triggerError: () => void;
  clearPendingGreeting: () => void;
  setCoreUnlocked: (v: boolean) => void;
}

const EdenContext = createContext<EdenContextType | null>(null);

const STORAGE_KEYS = {
  deviceId: '@eden_device_id',
  moderation: '@eden_moderation',
  edenMode: '@eden_mode',
  hidden: '@eden_hidden',
  autoSpeak: '@eden_auto_speak',
  firstOpen: '@eden_first_open',
};

function generateDeviceId(): string {
  return 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 12);
}

function genId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 6);
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EdenProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<EdenMessage[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [moderation, setModeration] = useState<ModerationStatus | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [edenMode, setEdenModeState] = useState<EdenMode>('spice');
  const [isHidden, setIsHiddenState] = useState(false);
  const [isAutoSpeak, setIsAutoSpeakState] = useState(true);
  const [pendingGreeting, setPendingGreetingState] = useState<string | null>(null);
  const [dailyCount, setDailyCount] = useState(0);
  const [coreUnlocked, setCoreUnlockedState] = useState(false);
  const errorCooldown = useRef(false);

  const isAtDailyLimit = !coreUnlocked && !user?._p && dailyCount >= FREE_DAILY_LIMIT;

  const setCoreUnlocked = useCallback((v: boolean) => {
    setCoreUnlockedState(v);
  }, []);

  const isPrivileged = coreUnlocked || !!user?._p;

  useEffect(() => {
    initEden();
  }, []);

  async function saveChatHistory(msgs: EdenMessage[]) {
    try {
      const toSave = msgs.slice(-50);
      await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
    } catch {}
  }

  async function loadChatHistory(): Promise<EdenMessage[]> {
    try {
      const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as EdenMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  }

  async function loadDailyCount() {
    try {
      const [storedCount, storedDate] = await Promise.all([
        AsyncStorage.getItem(DAILY_COUNT_KEY),
        AsyncStorage.getItem(DAILY_DATE_KEY),
      ]);
      const today = todayString();
      if (storedDate === today && storedCount) {
        setDailyCount(parseInt(storedCount, 10) || 0);
      } else {
        await Promise.all([
          AsyncStorage.setItem(DAILY_COUNT_KEY, '0'),
          AsyncStorage.setItem(DAILY_DATE_KEY, today),
        ]);
        setDailyCount(0);
      }
    } catch {}
  }

  async function incrementDailyCount() {
    try {
      const today = todayString();
      const storedDate = await AsyncStorage.getItem(DAILY_DATE_KEY);
      let count = 0;
      if (storedDate === today) {
        const stored = await AsyncStorage.getItem(DAILY_COUNT_KEY);
        count = parseInt(stored ?? '0', 10) || 0;
      }
      count += 1;
      await Promise.all([
        AsyncStorage.setItem(DAILY_COUNT_KEY, String(count)),
        AsyncStorage.setItem(DAILY_DATE_KEY, today),
      ]);
      setDailyCount(count);
    } catch {}
  }

  async function initEden() {
    try {
      let id = await AsyncStorage.getItem(STORAGE_KEYS.deviceId);
      if (!id) {
        id = generateDeviceId();
        await AsyncStorage.setItem(STORAGE_KEYS.deviceId, id);
      }
      setDeviceId(id);

      const savedMode = await AsyncStorage.getItem(STORAGE_KEYS.edenMode);
      if (savedMode === 'sugar' || savedMode === 'spice') setEdenModeState(savedMode);

      const hidden = await AsyncStorage.getItem(STORAGE_KEYS.hidden);
      if (hidden === 'true') setIsHiddenState(true);

      const autoSpeak = await AsyncStorage.getItem(STORAGE_KEYS.autoSpeak);
      if (autoSpeak !== null) setIsAutoSpeakState(autoSpeak === 'true');

      const firstOpen = await AsyncStorage.getItem(STORAGE_KEYS.firstOpen);

      const history = await loadChatHistory();
      if (history.length > 0) {
        setMessages(history);
      } else {
        const greetingContent = firstOpen
          ? "Hello again! I'm always here to walk you through my garden. Let me know if you need anything."
          : "Hello, I'm Eden. The Goddess in charge of this garden. I'm here to walk you through my garden and explain the rules according to Apple, answer all your questions, assist you with errors you encounter, and anything else you could possibly ever need in the EdenMux app. Just tap my icon if you ever need me. Let's jump in!";
        if (!firstOpen) {
          await AsyncStorage.setItem(STORAGE_KEYS.firstOpen, 'true');
        }
        const welcome: EdenMessage = {
          id: genId(),
          role: 'eden',
          content: greetingContent,
          timestamp: Date.now(),
        };
        setMessages([welcome]);
        setPendingGreetingState(greetingContent);
      }

      await Promise.all([
        checkModeration(id),
        loadDailyCount(),
      ]);
    } catch {}
  }

  async function checkModeration(id: string) {
    try {
      const res = await apiRequest('GET', `/api/eden/moderation/${id}`);
      const data = await res.json();
      setModeration(data);
      await AsyncStorage.setItem(STORAGE_KEYS.moderation, JSON.stringify(data));
    } catch {}
  }

  const setEdenMode = useCallback((v: EdenMode) => {
    setEdenModeState(v);
    AsyncStorage.setItem(STORAGE_KEYS.edenMode, v);
  }, []);

  const setHidden = useCallback((v: boolean) => {
    setIsHiddenState(v);
    AsyncStorage.setItem(STORAGE_KEYS.hidden, v ? 'true' : 'false');
  }, []);

  const setAutoSpeak = useCallback((v: boolean) => {
    setIsAutoSpeakState(v);
    AsyncStorage.setItem(STORAGE_KEYS.autoSpeak, v ? 'true' : 'false');
  }, []);

  const clearPendingGreeting = useCallback(() => {
    setPendingGreetingState(null);
  }, []);

  const triggerError = useCallback(() => {
    if (edenMode === 'sugar' || isHidden || errorCooldown.current) return;
    errorCooldown.current = true;
    setTimeout(() => { errorCooldown.current = false; }, 8000);

    const helpMsg: EdenMessage = {
      id: genId(),
      role: 'eden',
      content: "Can I help?",
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, helpMsg]);
    setIsOpen(true);
  }, [edenMode, isHidden]);

  const sendMessage = useCallback(async (text: string) => {
    if (!deviceId || !text.trim() || isThinking) return;

    if (isAtDailyLimit) return;

    const userMsg: EdenMessage = {
      id: genId(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setIsThinking(true);

    try {
      const apiHistory = updatedMessages
        .slice(-20)
        .filter(m => m.role === 'user' || m.role === 'eden')
        .map(m => ({ role: m.role === 'eden' ? 'assistant' : 'user', content: m.content }));

      const authHeaders: Record<string, string> = user?.token
        ? { Authorization: `Bearer ${user.token}` }
        : {};
      const res = await apiRequest('POST', '/api/eden/chat', {
        messages: apiHistory,
        deviceId,
        platform: Platform.OS,
      }, authHeaders);
      const data = await res.json();

      const reply: string = data.reply || "I'm having a moment. Try again?";

      const edenMsg: EdenMessage = {
        id: genId(),
        role: 'eden',
        content: reply,
        timestamp: Date.now(),
      };

      const finalMessages = [...updatedMessages, edenMsg];
      setMessages(finalMessages);

      if (!coreUnlocked && !user?._p) {
        await incrementDailyCount();
      }
      if (coreUnlocked || user?._p) {
        await saveChatHistory(finalMessages);
      }
    } catch {
      const errorMsg: EdenMessage = {
        id: genId(),
        role: 'eden',
        content: "I had a little hiccup connecting. Try again in a moment.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsThinking(false);
    }
  }, [deviceId, messages, isThinking, user, isAtDailyLimit, coreUnlocked]);

  const openEden = useCallback(() => setIsOpen(true), []);
  const closeEden = useCallback(() => setIsOpen(false), []);
  const toggleEden = useCallback(() => setIsOpen(prev => !prev), []);
  const clearChat = useCallback(() => {
    const welcome: EdenMessage = {
      id: genId(),
      role: 'eden',
      content: "A fresh start — always welcome in my garden. What can I help you with?",
      timestamp: Date.now(),
    };
    setMessages([welcome]);
  }, []);

  return (
    <EdenContext.Provider value={{
      messages,
      isOpen,
      isThinking,
      moderation,
      deviceId,
      edenMode,
      isHidden,
      isAutoSpeak,
      pendingGreeting,
      dailyCount,
      isAtDailyLimit,
      sendMessage,
      openEden,
      closeEden,
      toggleEden,
      clearChat,
      setEdenMode,
      setHidden,
      setAutoSpeak,
      triggerError,
      clearPendingGreeting,
      setCoreUnlocked,
    }}>
      {children}
    </EdenContext.Provider>
  );
}

export function useEden() {
  const ctx = useContext(EdenContext);
  if (!ctx) throw new Error('useEden must be used within EdenProvider');
  return ctx;
}
