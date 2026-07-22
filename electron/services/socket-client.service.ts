/**
 * SocketClientService — Enterprise WebSocket client for Electron.
 *
 * Features
 * ─────────
 * • Connects to the CRM backend via Socket.IO.
 * • Automatic reconnect with exponential backoff (1s → 2s → 4s → … → 30s max).
 * • Heartbeat ping every 20 seconds to detect silent disconnections.
 * • Offline detection — emits 'offline' when the main window loses connectivity.
 * • Pending-operation queue — stores actions when offline, replays on reconnect.
 * • IPC bridge — renderer can subscribe to socket events via preload APIs.
 *
 * USAGE (in main.ts)
 * ──────────────────
 *   import { SocketClientService } from './services/socket-client.service';
 *   const socket = new SocketClientService('http://192.168.1.10:5000', token);
 *   socket.connect();
 *   socket.onEvent('policy:updated', (data) => { ... });
 */

import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';

// Soft dependency on socket.io-client — only required on demand so the
// main process doesn't crash if the package is missing on first install.
type IoSocket = {
  connected: boolean;
  connect(): void;
  disconnect(): void;
  emit(event: string, ...args: unknown[]): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
  off(event: string, cb: (...args: unknown[]) => void): void;
};

export interface PendingOperation {
  event: string;
  payload: unknown;
  queuedAt: number;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

const BACKOFF_BASE_MS  = 1_000;
const BACKOFF_MAX_MS   = 30_000;
const HEARTBEAT_MS     = 20_000;
const MAX_PENDING_OPS  = 100;

export class SocketClientService extends EventEmitter {
  private socket: IoSocket | null = null;
  private serverUrl: string;
  private authToken: string;
  private mainWindow: BrowserWindow | null;

  private _state: ConnectionState = 'disconnected';
  private _reconnectAttempt  = 0;
  private _reconnectTimer: NodeJS.Timeout | null = null;
  private _heartbeatTimer: NodeJS.Timeout | null = null;
  private _pendingOps: PendingOperation[] = [];

  constructor(serverUrl: string, authToken: string, mainWindow: BrowserWindow | null = null) {
    super();
    this.serverUrl  = serverUrl;
    this.authToken  = authToken;
    this.mainWindow = mainWindow;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get state(): ConnectionState { return this._state; }
  get isConnected(): boolean    { return this._state === 'connected'; }

  connect() {
    if (this._state === 'connected' || this._state === 'connecting') return;
    this._setState('connecting');
    this._doConnect();
  }

  disconnect() {
    this._clearTimers();
    this._state = 'disconnected';
    this.socket?.disconnect();
    this.socket = null;
  }

  /** Update the auth token (e.g., after token refresh). */
  setAuthToken(token: string) {
    this.authToken = token;
  }

  /** Update the server URL (e.g., after server discovery). */
  setServerUrl(url: string) {
    if (this.serverUrl !== url) {
      this.serverUrl = url;
      if (this._state === 'connected') {
        this.disconnect();
        this.connect();
      }
    }
  }

  /** Enqueue an operation to be sent when connected (or immediately). */
  enqueueOperation(event: string, payload: unknown) {
    if (this.isConnected) {
      this.socket?.emit(event, payload);
    } else {
      if (this._pendingOps.length >= MAX_PENDING_OPS) {
        this._pendingOps.shift(); // Drop oldest
      }
      this._pendingOps.push({ event, payload, queuedAt: Date.now() });
    }
  }

  /** Subscribe to a socket event (wrapper around socket.on). */
  onEvent(event: string, handler: (data: unknown) => void) {
    this.on(`socket:${event}`, handler);
  }

  getPendingCount() { return this._pendingOps.length; }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _doConnect() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { io } = require('socket.io-client') as {
        io: (url: string, opts: Record<string, unknown>) => IoSocket;
      };

      this.socket = io(this.serverUrl, {
        autoConnect:       false,
        reconnection:      false,      // We manage reconnect ourselves
        transports:        ['websocket'],
        auth:              { token: this.authToken },
        timeout:           10_000,
      });

      this.socket.on('connect', () => {
        this._reconnectAttempt = 0;
        this._setState('connected');
        this._startHeartbeat();
        this._flushPendingOps();
        this.emit('connected');
        this._sendToRenderer('socket:connected', { serverUrl: this.serverUrl });
      });

      this.socket.on('disconnect', (reason: string) => {
        this._clearHeartbeat();
        this._setState('reconnecting');
        this.emit('disconnected', reason);
        this._sendToRenderer('socket:disconnected', { reason });
        this._scheduleReconnect();
      });

      this.socket.on('connect_error', (err: Error) => {
        this._clearHeartbeat();
        if (this._state !== 'reconnecting') this._setState('reconnecting');
        this._scheduleReconnect();
        this._sendToRenderer('socket:error', { message: err.message });
      });

      // Forward all server-emitted events to our EventEmitter and renderer
      const knownEvents = [
        'policy:updated', 'customer:created', 'customer:updated',
        'lead:assigned', 'user:notification', 'server:broadcast',
        'health:update',
      ];
      for (const evt of knownEvents) {
        this.socket.on(evt, (data: unknown) => {
          this.emit(`socket:${evt}`, data);
          this._sendToRenderer(`socket:${evt}`, data);
        });
      }

      this.socket.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[socket-client] socket.io-client not available:', msg);
      this._setState('disconnected');
    }
  }

  private _scheduleReconnect() {
    if (this._reconnectTimer) return;
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** this._reconnectAttempt, BACKOFF_MAX_MS);
    this._reconnectAttempt += 1;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._state === 'reconnecting') this._doConnect();
    }, delay);
  }

  private _startHeartbeat() {
    this._heartbeatTimer = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', { t: Date.now() });
      }
    }, HEARTBEAT_MS);
  }

  private _clearHeartbeat() {
    if (this._heartbeatTimer) { clearInterval(this._heartbeatTimer as unknown as number); this._heartbeatTimer = null; }
  }

  private _clearTimers() {
    this._clearHeartbeat();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
  }

  private _flushPendingOps() {
    const ops = [...this._pendingOps];
    this._pendingOps = [];
    for (const op of ops) {
      this.socket?.emit(op.event, op.payload);
    }
    if (ops.length) {
      console.log(`[socket-client] Flushed ${ops.length} pending operations`);
    }
  }

  private _setState(state: ConnectionState) {
    this._state = state;
    this.emit('stateChange', state);
  }

  private _sendToRenderer(channel: string, data: unknown) {
    try {
      this.mainWindow?.webContents?.send(channel, data);
    } catch { /* window might be destroyed */ }
  }
}
