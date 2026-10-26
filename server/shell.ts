import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import type { Server } from 'node:http';
import { setInterval } from 'node:timers';
import { verifyJwtToken } from './auth';

interface ShellSession {
  pty: pty.IPty;
  sockets: Set<WebSocket>;
  lastActivity: number;
}

const sessions = new Map<string, ShellSession>();

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const SHELL_ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'SHELL',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'TERM',
  'COLORTERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_MESSAGES',
  'LC_NUMERIC',
  'LC_TIME',
  'LANGUAGE',
] as const;

function getShellEnvironment(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of SHELL_ENV_ALLOWLIST) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.lastActivity > IDLE_TIMEOUT_MS && session.sockets.size === 0) {
      try { session.pty.kill(); } catch {}
      sessions.delete(id);
    }
  }
}
const staleSessionCleanup = setInterval(cleanupStaleSessions, 60_000);
(staleSessionCleanup as unknown as { unref: () => void }).unref();

function getOrCreateSession(sessionId: string): ShellSession {
  if (sessions.has(sessionId)) {
    const s = sessions.get(sessionId)!;
    s.lastActivity = Date.now();
    return s;
  }

  const shell = process.env.SHELL || '/bin/bash';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.env.HOME || '/home/runner',
    env: {
      ...getShellEnvironment(),
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      LC_CTYPE: 'en_US.UTF-8',
      LC_MESSAGES: 'en_US.UTF-8',
      LC_NUMERIC: 'en_US.UTF-8',
      LC_TIME: 'en_US.UTF-8',
      LANGUAGE: 'en_US:en',
    },
  });

  const session: ShellSession = {
    pty: ptyProcess,
    sockets: new Set(),
    lastActivity: Date.now(),
  };

  ptyProcess.onData((data: string) => {
    session.lastActivity = Date.now();
    const msg = JSON.stringify({ type: 'data', data });
    for (const ws of session.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    const msg = JSON.stringify({ type: 'exit', exitCode });
    for (const ws of session.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
        ws.close();
      }
    }
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  return session;
}

export function attachShellWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/shell' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const rawSessionId = url.searchParams.get('sessionId') || 'default';
    let session: ShellSession | null = null;
    let authTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      ws.close(4401, 'Unauthorized');
    }, 10_000);

    const authenticate = (token: string) => {
      if (session || ws.readyState !== WebSocket.OPEN) return;
      const claims = verifyJwtToken(token);
      if (!claims) {
        ws.close(4401, 'Unauthorized');
        return;
      }
      if (claims.platform === 'ios') {
        ws.close(4403, 'Shell not available on iOS');
        return;
      }

      if (authTimeout) clearTimeout(authTimeout);
      authTimeout = null;
      const userId = claims.userId || claims.appleId || '';
      const sessionId = `${userId}:${rawSessionId}`;
      session = getOrCreateSession(sessionId);
      session.sockets.add(ws);
      ws.send(JSON.stringify({ type: 'ready' }));
    };

    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (!session) {
          if (msg.type === 'auth' && typeof msg.token === 'string') {
            authenticate(msg.token);
          } else {
            ws.close(4401, 'Unauthorized');
          }
          return;
        }

        session.lastActivity = Date.now();
        if (msg.type === 'input') {
          session.pty.write(msg.data);
        } else if (msg.type === 'resize') {
          session.pty.resize(
            Math.max(1, Math.min(300, msg.cols || 80)),
            Math.max(1, Math.min(100, msg.rows || 24)),
          );
        } else if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {}
    });

    ws.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout);
      session?.sockets.delete(ws);
    });

    ws.on('error', () => {
      if (authTimeout) clearTimeout(authTimeout);
      session?.sockets.delete(ws);
    });
  });

  console.log('Shell WebSocket server attached at /ws/shell');
}
