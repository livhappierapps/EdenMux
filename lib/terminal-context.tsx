import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { TerminalSession, TerminalLine, createSession, executeCommand, initHomeDirectory } from './terminal-engine';
import { ShellClient } from './shell-client';
import { stripAnsi, splitLines } from './ansi-strip';
import { useAuth } from './auth-context';

const STORAGE_KEY = '@edenmux_sessions';
const ACTIVE_KEY = '@edenmux_active';
const SHELL_MODE_KEY = '@edenmux_shell_mode';

interface TerminalContextValue {
  sessions: TerminalSession[];
  activeSessionId: string;
  activeSession: TerminalSession;
  createNewSession: () => void;
  closeSession: (id: string) => void;
  setActiveSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  runCommand: (input: string) => Promise<void>;
  clearTerminal: () => void;
  navigateHistory: (direction: 'up' | 'down') => string;
  isProcessing: boolean;
  shellMode: boolean;
  setShellMode: (v: boolean) => void;
  shellConnected: boolean;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

function generateId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function makeLine(content: string, type: TerminalLine['type'] = 'output'): TerminalLine {
  return { id: generateId(), type, content, timestamp: Date.now() };
}

// ── iOS Apple compliance command review ─────────────────────────────────────
// Intercepts commands that Apple's Guideline 2.5.2 prohibits before they reach
// the engine, and returns an Eden-voiced explanation. Returns null for allowed
// commands so they pass through normally.
function reviewIOSCommand(input: string): string | null {
  if (Platform.OS !== 'ios') return null;

  const trimmed = input.trim();
  const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() ?? '';

  // Commands that are genuinely blocked by Apple 2.5.2
  const blocked: Record<string, string> = {
    node: "Okay, you absolutely have the right instinct — node is exactly what you'd reach for here. Apple's Guideline 2.5.2 blocks runtime code execution in the sandbox, which means I can't let it through on iOS. Genuinely frustrating. The full Node experience is waiting on Android or PC though. 🌿",
    nodejs: "node.js is off-limits in Apple's sandbox (Guideline 2.5.2 — no executing code not compiled with the app). Same answer on Android though: full Node, no restrictions.",
    python: "I love that you went straight for python — that's the right call. Apple draws a hard line at interpreted code execution (Guideline 2.5.2), so this one's sandboxed out on iOS. Not an EdenMux limit — an Apple one. Android has the full python experience.",
    python3: "python3 falls under Apple's Guideline 2.5.2 — no interpreted runtimes that weren't compiled into the app binary at build time. On Android you'd have it. I can still walk you through python concepts here if that helps.",
    ruby: "Ruby's blocked by Apple's sandbox rules (2.5.2 — interpreted code execution). The logic you're thinking about is sound though — want me to explain the concept? Or if you're on Android later, it'll work.",
    perl: "Perl won't run here — Apple 2.5.2 covers interpreted scripting runtimes. Same solid instinct, wrong sandbox. I can still help you think through what you're trying to do.",
    lua: "Lua is blocked under Apple's Guideline 2.5.2. Good reach for a lightweight scripting runtime though — that's exactly the right tool for the job in most contexts.",
    php: "PHP requires a runtime Apple won't allow in the sandbox (2.5.2). If you're building something server-side, I can still talk through the logic with you.",
    eval: "Bold move — and I see exactly what you're trying to do. eval is explicitly covered by Apple 2.5.2 (dynamic code execution is a hard no in the sandbox). Clever angle though. On Android this would work.",
    ssh: "ssh can't initiate arbitrary TCP connections from inside Apple's sandbox — it's locked down at the network layer. On Android or PC you'd get the real thing. Want me to explain what the connection sequence would look like?",
    nmap: "Network scanning requires raw socket access that Apple's sandbox doesn't allow. nmap won't work here, but I can walk you through what it would find and how to read the output for when you're on an open platform.",
    nc: "netcat needs socket access that Apple walls off in iOS apps. On Android or PC this would fly. What were you trying to connect to? I can help you think through it.",
    netcat: "netcat is blocked in Apple's sandbox — same reason as nc. Open socket access isn't permitted. Android/PC is where this one lives.",
    pip: "pip needs Python to run — and Python's blocked under Apple 2.5.2. On Android you'd have both. I can still help you figure out the right packages for whatever you're building.",
    gem: "Ruby gems need the Ruby runtime, which Apple's sandbox blocks (2.5.2). Good instinct for dependency management though.",
    cargo: "cargo needs Rust's runtime, which falls under Apple's 2.5.2 restrictions. On an open platform you'd have it. Want to talk through what you're building?",
    gcc: "gcc needs to compile and potentially execute code — Apple's sandbox blocks that at the execution stage (2.5.2). I can still help you write and reason through C code though.",
    'g++': "g++ compilation and execution isn't allowed in Apple's sandbox (2.5.2). I can help with C++ logic and syntax even if I can't compile here.",
    make: "make would invoke compilers and potentially execute output — both blocked under 2.5.2 in Apple's sandbox. I can walk through Makefiles and build logic with you.",
    rustc: "Rust compilation isn't permitted in Apple's sandbox (2.5.2 covers code execution). On Android or PC you'd have the full toolchain.",
    wget: "wget makes real network requests that Apple's sandbox doesn't allow for arbitrary URLs. On Android or PC you'd get the full thing. Want me to explain what the request would look like?",
  };

  if (blocked[firstWord]) {
    return `\x1b[35m[Eden]\x1b[0m ${blocked[firstWord]}`;
  }

  // curl is a special case — simulated curl exists, but real curl calls are blocked.
  // The terminal engine handles simulated curl, so we don't intercept here.

  return null;
}

export function TerminalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const initial = createSession('main');
  const [sessions, setSessions] = useState<TerminalSession[]>([initial]);
  const [activeSessionId, setActiveSessionId] = useState(initial.id);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [shellMode, setShellModeState] = useState(false);
  const [shellConnected, setShellConnected] = useState(false);

  const shellClientRef = useRef<ShellClient | null>(null);
  const shellOutputBufferRef = useRef('');
  const activeSessionIdRef = useRef(activeSessionId);
  useEffect(() => { activeSessionIdRef.current = activeSessionId; }, [activeSessionId]);

  useEffect(() => {
    (async () => {
      try {
        await initHomeDirectory();
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const activeStored = await AsyncStorage.getItem(ACTIVE_KEY);
        const shellStored = await AsyncStorage.getItem(SHELL_MODE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as TerminalSession[];
          if (parsed.length > 0) {
            const defaults = createSession();
            const migrated = parsed.map(s => ({
              ...s,
              aliases: s.aliases || defaults.aliases,
              installedPackages: s.installedPackages || defaults.installedPackages,
            }));
            setSessions(migrated);
            if (activeStored && migrated.find(s => s.id === activeStored)) {
              setActiveSessionId(activeStored);
            } else {
              setActiveSessionId(migrated[0].id);
            }
          }
        }
        if (shellStored !== null) {
          setShellModeState(shellStored === 'true');
        } else if (Platform.OS === 'android') {
          setShellModeState(true);
        }
      } catch {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const timeout = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)).catch(() => {});
      AsyncStorage.setItem(ACTIVE_KEY, activeSessionId).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [sessions, activeSessionId, loaded]);

  const setShellMode = useCallback((v: boolean) => {
    setShellModeState(v);
    AsyncStorage.setItem(SHELL_MODE_KEY, String(v)).catch(() => {});
  }, []);

  const flushShellBuffer = useCallback((sessionId: string) => {
    const raw = shellOutputBufferRef.current;
    if (!raw) return;
    shellOutputBufferRef.current = '';

    const stripped = stripAnsi(raw);
    const parts = splitLines(stripped);
    const newLines = parts
      .map(p => p.trimEnd())
      .filter(p => p.length > 0)
      .map(p => makeLine(p, 'output'));

    if (newLines.length === 0) return;

    setSessions(prev => prev.map(s => {
      if (s.id !== sessionId) return s;
      return { ...s, lines: [...s.lines, ...newLines] };
    }));
  }, []);

  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFlush = useCallback((sessionId: string) => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushShellBuffer(sessionId);
      setIsProcessing(false);
    }, 80);
  }, [flushShellBuffer]);

  useEffect(() => {
    if (!loaded) return;

    if (shellMode) {
      // If already connected with a live socket, no need to recreate.
      if (shellClientRef.current?.isConnected) return;

      // No token yet — wait for auth to finish before attempting.
      if (!user?.token) return;

      // Dispose any stale / 4401-dead client before creating a fresh one.
      if (shellClientRef.current) {
        shellClientRef.current.dispose();
        shellClientRef.current = null;
      }

      const client = new ShellClient({
        sessionId: activeSessionId,
        token: user.token,
        onReady: () => {
          setShellConnected(true);
          setSessions(prev => prev.map(s => {
            if (s.id !== activeSessionIdRef.current) return s;
            return {
              ...s,
              lines: [...s.lines, makeLine('── Linux shell connected (bash) ──', 'system')],
            };
          }));
        },
        onData: (data: string) => {
          shellOutputBufferRef.current += data;
          scheduleFlush(activeSessionIdRef.current);
        },
        onExit: () => {
          setShellConnected(false);
          setSessions(prev => prev.map(s => {
            if (s.id !== activeSessionIdRef.current) return s;
            return { ...s, lines: [...s.lines, makeLine('Shell session ended.', 'system')] };
          }));
        },
        onDisconnect: () => {
          setShellConnected(false);
        },
      });

      shellClientRef.current = client;
      client.connect();
    } else {
      if (shellClientRef.current) {
        shellClientRef.current.dispose();
        shellClientRef.current = null;
        setShellConnected(false);
      }
    }

    return () => {};
  }, [shellMode, loaded, user?.token]);

  useEffect(() => {
    return () => {
      shellClientRef.current?.dispose();
      shellClientRef.current = null;
    };
  }, []);

  const activeSession = useMemo(
    () => sessions.find(s => s.id === activeSessionId) || sessions[0],
    [sessions, activeSessionId]
  );

  const createNewSession = useCallback(() => {
    const num = sessions.length + 1;
    const newSession = createSession(`session ${num}`);
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  }, [sessions.length]);

  const closeSession = useCallback((id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        const newSession = createSession('main');
        setActiveSessionId(newSession.id);
        return [newSession];
      }
      if (activeSessionId === id) {
        setActiveSessionId(filtered[0].id);
      }
      return filtered;
    });
  }, [activeSessionId]);

  const renameSession = useCallback((id: string, name: string) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, name } : s));
  }, []);

  const runCommand = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    setIsProcessing(true);

    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      const inputLine: TerminalLine = {
        id: generateId(),
        type: 'input',
        content: trimmed,
        timestamp: Date.now(),
      };
      return {
        ...s,
        lines: [...s.lines, inputLine],
        history: [...s.history, trimmed],
        historyIndex: -1,
      };
    }));

    if (shellMode && shellClientRef.current?.isConnected) {
      shellClientRef.current.send(trimmed + '\n');
      return;
    }

    // ── iOS compliance intercept ─────────────────────────────────────────────
    // Check if this command is blocked by Apple's Guideline 2.5.2 before
    // it reaches the engine. Returns Eden-voiced output, not an error.
    const iosReview = reviewIOSCommand(trimmed);
    if (iosReview !== null) {
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          lines: [...s.lines, makeLine(iosReview, 'output')],
        };
      }));
      setIsProcessing(false);
      return;
    }

    try {
      const session = sessions.find(s => s.id === activeSessionId);
      if (!session) { setIsProcessing(false); return; }

      const updatedSession = { ...session, history: [...session.history, trimmed] };
      const { lines: outputLines, newCwd, newEnv, newAliases, newInstalledPackages } = await executeCommand(trimmed, updatedSession);

      const hasClear = outputLines.some(l => l.content === '__CLEAR__');
      const hasExit = outputLines.some(l => l.content === '__EXIT__');
      const hasClearHistory = outputLines.some(l => l.content === '__CLEAR_HISTORY__');

      if (hasExit) {
        closeSession(activeSessionId);
        setIsProcessing(false);
        return;
      }

      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        const filteredOutput = outputLines.filter(l =>
          l.content !== '__CLEAR__' && l.content !== '__EXIT__' && l.content !== '__CLEAR_HISTORY__'
        );
        return {
          ...s,
          lines: hasClear ? filteredOutput : [...s.lines, ...filteredOutput],
          cwd: newCwd,
          env: newEnv,
          aliases: newAliases || s.aliases,
          installedPackages: newInstalledPackages || s.installedPackages,
          history: hasClearHistory ? [] : s.history,
        };
      }));
    } catch (error: any) {
      setSessions(prev => prev.map(s => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          lines: [...s.lines, {
            id: generateId(),
            type: 'error' as const,
            content: `Fatal: ${error.message}`,
            timestamp: Date.now(),
          }],
        };
      }));
    }

    setIsProcessing(false);
  }, [activeSessionId, sessions, closeSession, shellMode]);

  const clearTerminal = useCallback(() => {
    setSessions(prev => prev.map(s => {
      if (s.id !== activeSessionId) return s;
      return { ...s, lines: [] };
    }));
    if (shellMode && shellClientRef.current?.isConnected) {
      shellClientRef.current.send('clear\n');
    }
  }, [activeSessionId, shellMode]);

  const navigateHistory = useCallback((direction: 'up' | 'down'): string => {
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session || session.history.length === 0) return '';

    let newIndex = session.historyIndex;
    if (direction === 'up') {
      if (newIndex === -1) {
        newIndex = session.history.length - 1;
      } else if (newIndex > 0) {
        newIndex--;
      }
    } else {
      if (newIndex === -1) return '';
      if (newIndex < session.history.length - 1) {
        newIndex++;
      } else {
        newIndex = -1;
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, historyIndex: -1 } : s
        ));
        return '';
      }
    }

    setSessions(prev => prev.map(s =>
      s.id === activeSessionId ? { ...s, historyIndex: newIndex } : s
    ));

    return session.history[newIndex] || '';
  }, [sessions, activeSessionId]);

  const value = useMemo(() => ({
    sessions,
    activeSessionId,
    activeSession,
    createNewSession,
    closeSession,
    setActiveSession: setActiveSessionId,
    renameSession,
    runCommand,
    clearTerminal,
    navigateHistory,
    isProcessing,
    shellMode,
    setShellMode,
    shellConnected,
  }), [sessions, activeSessionId, activeSession, createNewSession, closeSession, renameSession, runCommand, clearTerminal, navigateHistory, isProcessing, shellMode, setShellMode, shellConnected]);

  return (
    <TerminalContext.Provider value={value}>
      {children}
    </TerminalContext.Provider>
  );
}

export function useTerminal() {
  const context = useContext(TerminalContext);
  if (!context) {
    throw new Error('useTerminal must be used within a TerminalProvider');
  }
  return context;
}
