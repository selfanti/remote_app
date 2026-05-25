import { WebSocket } from "ws";
import { SessionManager } from "./session.js";
import { Database } from "./db.js";
import { nanoid } from "nanoid";

export class PairingManager {
  private sessions: SessionManager;
  private db: Database;

  constructor(sessions: SessionManager, db: Database) {
    this.sessions = sessions;
    this.db = db;
  }

  handlePairRequest(
    ws: WebSocket,
    payload: { cliPublicKey: string; cols: number; rows: number }
  ) {
    const sessionId = nanoid(16);
    const code = this.generateCode();

    this.sessions.createSession(sessionId, payload.cliPublicKey, ws);
    this.db.createPairCode(code, sessionId, 300); // 5 min TTL

    ws.send(
      JSON.stringify({
        type: "pair.code",
        sessionId,
        payload: { code, sessionId, expiresIn: 300 },
        timestamp: Date.now(),
      })
    );

    console.log(
      `[${new Date().toISOString()}] Pair code generated: ${code} for session ${sessionId}`
    );
  }

  handlePairSubmit(
    ws: WebSocket,
    payload: { code: string; appPublicKey: string }
  ) {
    const pairRow = this.db.consumePairCode(payload.code);
    if (!pairRow) {
      ws.send(
        JSON.stringify({
          type: "pair.rejected",
          payload: { code: "INVALID_CODE", message: "Invalid or expired pair code" },
          timestamp: Date.now(),
        })
      );
      return;
    }

    const { session_id: sessionId } = pairRow;
    const session = this.db.getSession(sessionId);
    if (!session) {
      ws.send(
        JSON.stringify({
          type: "pair.rejected",
          payload: { code: "SESSION_EXPIRED", message: "Session has expired" },
          timestamp: Date.now(),
        })
      );
      return;
    }

    const joined = this.sessions.joinSession(
      sessionId,
      payload.appPublicKey,
      ws
    );
    if (!joined) {
      ws.send(
        JSON.stringify({
          type: "pair.rejected",
          payload: { code: "JOIN_FAILED", message: "Failed to join session" },
          timestamp: Date.now(),
        })
      );
      return;
    }

    // Notify app with CLI's public key
    ws.send(
      JSON.stringify({
        type: "pair.confirmed",
        sessionId,
        payload: { peerPublicKey: session.cli_public_key, sessionId },
        timestamp: Date.now(),
      })
    );

    // Notify CLI with app's public key
    const cliWs = this.sessions.getSessionCli(sessionId);
    if (cliWs && cliWs.readyState === WebSocket.OPEN) {
      cliWs.send(
        JSON.stringify({
          type: "pair.confirmed",
          sessionId,
          payload: { peerPublicKey: payload.appPublicKey, sessionId },
          timestamp: Date.now(),
        })
      );
    }

    // Notify session members about new client
    for (const peerWs of this.sessions.getClientsInSession(sessionId)) {
      if (peerWs !== ws && peerWs.readyState === WebSocket.OPEN) {
        peerWs.send(
          JSON.stringify({
            type: "client.joined",
            sessionId,
            payload: {
              clientId: "app",
              clientType: "app",
            },
            timestamp: Date.now(),
          })
        );
      }
    }

    console.log(
      `[${new Date().toISOString()}] App paired with session ${sessionId}`
    );
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
