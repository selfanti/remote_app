import { WebSocket } from "ws";
import { SessionManager } from "./session.js";
import { PairingManager } from "./pairing.js";

interface WireMessage {
  type: string;
  sessionId?: string;
  payload?: unknown;
  timestamp: number;
}

export class MessageRouter {
  private sessions: SessionManager;
  private pairing: PairingManager;

  constructor(sessions: SessionManager, pairing: PairingManager) {
    this.sessions = sessions;
    this.pairing = pairing;
  }

  handle(ws: WebSocket, msg: WireMessage) {
    switch (msg.type) {
      case "pair.request":
        this.pairing.handlePairRequest(
          ws,
          msg.payload as { cliPublicKey: string; cols: number; rows: number }
        );
        break;

      case "pair.submit":
        this.pairing.handlePairSubmit(
          ws,
          msg.payload as { code: string; appPublicKey: string }
        );
        break;

      case "encrypted":
        this.routeEncrypted(ws, msg);
        break;

      case "ping":
        ws.send(
          JSON.stringify({ type: "pong", timestamp: Date.now() })
        );
        break;

      case "session.destroy":
        this.handleSessionDestroy(ws, msg);
        break;

      default:
        ws.send(
          JSON.stringify({
            type: "error",
            payload: { code: "UNKNOWN_TYPE", message: `Unknown message type: ${msg.type}` },
            timestamp: Date.now(),
          })
        );
    }
  }

  private routeEncrypted(ws: WebSocket, msg: WireMessage) {
    const client = this.sessions.getClient(ws);
    if (!client) {
      ws.send(
        JSON.stringify({
          type: "error",
          payload: { code: "NOT_PAIRED", message: "Client not in any session" },
          timestamp: Date.now(),
        })
      );
      return;
    }

    const sessionId = client.sessionId;
    const peers = this.sessions.getClientsInSession(sessionId).filter(
      (peerWs) => peerWs !== ws && peerWs.readyState === WebSocket.OPEN
    );

    // Forward encrypted message to all peers in session
    // Server does NOT touch the payload — it's opaque ciphertext
    const forwardMsg = JSON.stringify({
      type: "encrypted",
      sessionId,
      payload: msg.payload,
      timestamp: msg.timestamp,
    });

    for (const peerWs of peers) {
      peerWs.send(forwardMsg);
    }
  }

  private handleSessionDestroy(ws: WebSocket, msg: WireMessage) {
    const client = this.sessions.getClient(ws);
    if (!client || client.type !== "cli") return;

    this.sessions.removeClient(ws);
    console.log(
      `[${new Date().toISOString()}] Session ${client.sessionId} destroyed by CLI`
    );
  }
}
