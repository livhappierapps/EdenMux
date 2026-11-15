import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { verifyJwtToken } from './auth';

export function attachShellWebSocket(httpServer: Server) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/shell',
    maxPayload: 4096,
  });

  wss.on('connection', (ws) => {
    let authTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      ws.close(4401, 'Unauthorized');
    }, 10_000);

    const authenticate = (token: string) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const claims = verifyJwtToken(token);
      if (!claims) {
        ws.close(4401, 'Unauthorized');
        return;
      }
      if (claims.platform === 'ios') {
        ws.close(4403, 'Shell not available on iOS');
        return;
      }

      // A PTY running as the backend OS user can read backend files and
      // /proc even with a filtered environment. Authentication is not
      // isolation. Fail closed until execution moves to an isolated service.
      if (authTimeout) clearTimeout(authTimeout);
      authTimeout = null;
      ws.close(4503, 'Remote shell unavailable: isolated execution required');
    };

    ws.on('message', (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString());
        if (msg?.type === 'auth' && typeof msg.token === 'string') {
          authenticate(msg.token);
        } else {
          ws.close(4401, 'Unauthorized');
        }
      } catch {
        ws.close(4400, 'Invalid message');
      }
    });

    ws.on('close', () => {
      if (authTimeout) clearTimeout(authTimeout);
    });

    ws.on('error', () => {
      if (authTimeout) clearTimeout(authTimeout);
    });
  });

  console.log('Shell WebSocket server attached at /ws/shell');
}
