import WebSocket from "ws";
import { createMessage } from "../../shared/protocol.js";

type MessageHandler = (msg: any) => void;

export class Transport {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: MessageHandler;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(url: string, onMessage: MessageHandler) {
    this.url = url;
    this.onMessage = onMessage;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      this.ws.on("open", () => {
        this._isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();
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

      this.ws.on("close", () => {
        this._isConnected = false;
        this.stopPing();
        this.scheduleReconnect();
      });

      this.ws.on("error", (err) => {
        console.error("WebSocket error:", err.message);
        if (!this._isConnected) {
          reject(err);
        }
      });
    });
  }

  send(msg: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }

  private startPing() {
    this.pingInterval = setInterval(() => {
      this.send(createMessage("ping"));
    }, 30_000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnect attempts reached. Giving up.");
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    this.reconnectAttempts++;
    console.log(
      `Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
    );
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {});
    }, delay);
  }
}
