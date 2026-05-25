import WebSocket from "ws";
import { createMessage } from "./protocol.js";

type MessageHandler = (msg: any) => void;

const MAX_OFFLINE_QUEUE = 1000;

export class Transport {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: MessageHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;
  private offlineQueue: string[] = [];
  private intentionallyClosed = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(url: string, onMessage: MessageHandler) {
    this.url = url;
    this.onMessage = onMessage;
  }

  connect(): Promise<void> {
    this.intentionallyClosed = false;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      const connectTimeout = setTimeout(() => {
        if (!this._isConnected) {
          this.ws?.terminate();
          reject(new Error("Connection timeout"));
        }
      }, 15_000);

      this.ws.on("open", () => {
        clearTimeout(connectTimeout);
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();
        this.flushOfflineQueue();
        resolve();
      });

      this.ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          this.onMessage(msg);
        } catch (e) {
          console.error("Failed to parse message:", e);
        }
      });

      this.ws.on("close", (code, reason) => {
        clearTimeout(connectTimeout);
        this._isConnected = false;
        this.stopPing();
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        clearTimeout(connectTimeout);
        console.error("WebSocket error:", err.message);
        if (!this._isConnected) {
          reject(err);
        }
      });
    });
  }

  send(msg: any) {
    const serialized = JSON.stringify(msg);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      // Queue message for later delivery
      if (this.offlineQueue.length < MAX_OFFLINE_QUEUE) {
        this.offlineQueue.push(serialized);
      }
    }
  }

  close() {
    this.intentionallyClosed = true;
    this._isConnected = false;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close(1000, "Client disconnecting");
    this.ws = null;
    this.offlineQueue = [];
  }

  private flushOfflineQueue() {
    while (this.offlineQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.offlineQueue.shift()!;
      this.ws.send(msg);
    }
    if (this.offlineQueue.length > 0) {
      console.log(`Flushed offline queue, ${this.offlineQueue.length} messages remaining`);
    }
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        this.send(createMessage("ping"));
      }
    }, 30_000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.intentionallyClosed) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached. Giving up.");
      process.exit(1);
    }

    // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    this.reconnectAttempts++;

    console.log(
      `Reconnecting in ${(delay / 1000).toFixed(1)}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((err) => {
        console.error("Reconnect failed:", err.message);
      });
    }, delay);
  }
}
