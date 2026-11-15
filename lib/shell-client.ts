import { getApiUrl } from '@/lib/query-client';

export type ShellOutputHandler = (data: string) => void;
export type ShellExitHandler = (exitCode: number) => void;
export type ShellReadyHandler = () => void;

export interface ShellClientOptions {
  sessionId: string;
  token: string;
  onData: ShellOutputHandler;
  onReady: ShellReadyHandler;
  onExit: ShellExitHandler;
  onDisconnect: () => void;
}

export class ShellClient {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private token: string;
  private opts: ShellClientOptions;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private dead = false;
  private connected = false;

  constructor(opts: ShellClientOptions) {
    this.opts = opts;
    this.sessionId = opts.sessionId;
    this.token = opts.token;
  }

  connect() {
    if (this.dead) return;
    try {
      const apiUrl = getApiUrl();
      const wsUrl = apiUrl
        .replace(/^https?:\/\//, (m) => (m.startsWith('https') ? 'wss://' : 'ws://'))
        .replace(/\/$/, '');
      const url = `${wsUrl}/ws/shell?sessionId=${encodeURIComponent(this.sessionId)}`;

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.ws?.send(JSON.stringify({ type: 'auth', token: this.token }));
        this.pingInterval = setInterval(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20_000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            this.connected = true;
            this.opts.onReady();
          } else if (msg.type === 'data') {
            this.opts.onData(msg.data);
          } else if (msg.type === 'exit') {
            this.opts.onExit(msg.exitCode ?? 0);
          }
        } catch {}
      };

      this.ws.onclose = (event) => {
        this.connected = false;
        this._clearPing();
        this.opts.onDisconnect();
        if (event.code === 4503) {
          this.opts.onData('\r\nRemote shell is unavailable until isolated execution is configured. Use the local terminal.\r\n');
        }
        if (!this.dead && ![4400, 4401, 4403, 4503].includes(event.code)) {
          this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

      this.ws.onerror = () => {
        this.ws?.close();
      };
    } catch (e) {
      if (!this.dead) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  send(input: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'input', data: input }));
    }
  }

  resize(cols: number, rows: number) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  get isConnected() {
    return this.connected;
  }

  dispose() {
    this.dead = true;
    this._clearPing();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private _clearPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }
}
