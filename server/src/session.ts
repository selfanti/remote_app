import { WebSocket } from "ws";
import { Database } from "./db.js";

interface Client {
  ws: WebSocket;
  type: "cli" | "app";
  sessionId: string;
  publicKey: string;
}

export class SessionManager {
  private clients: Map<WebSocket, Client> = new Map();
  private sessionClients: Map<string, Set<WebSocket>> = new Map();
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    // Clean expired sessions every 5 minutes
    setInterval(() => this.cleanExpired(), 5 * 60 * 1000);
  }

  createSession(sessionId: string, cliPublicKey: string, cliWs: WebSocket) {
    this.db.createSession(sessionId, cliPublicKey);
    this.clients.set(cliWs, {
      ws: cliWs,
      type: "cli",
      sessionId,
      publicKey: cliPublicKey,
    });
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(cliWs);
  }

  joinSession(sessionId: string, appPublicKey: string, appWs: WebSocket): boolean {
    const session = this.db.getSession(sessionId);
    if (!session) return false;

    this.db.addPairedApp(sessionId, appPublicKey);
    this.clients.set(appWs, {
      ws: appWs,
      type: "app",
      sessionId,
      publicKey: appPublicKey,
    });
    if (!this.sessionClients.has(sessionId)) {
      this.sessionClients.set(sessionId, new Set());
    }
    this.sessionClients.get(sessionId)!.add(appWs);
    return true;
  }

  removeClient(ws: WebSocket) {
    const client = this.clients.get(ws);
    if (!client) return;

    const { sessionId, type } = client;
    this.clients.delete(ws);

    const sessionSet = this.sessionClients.get(sessionId);
    if (sessionSet) {
      sessionSet.delete(ws);
      // Notify remaining clients
      for (const peerWs of sessionSet) {
        if (peerWs.readyState === WebSocket.OPEN) {
          peerWs.send(
            JSON.stringify({
              type: "client.left",
              payload: { clientId: type, clientType: type },
              sessionId,
              timestamp: Date.now(),
            })
          );
        }
      }
      // If CLI disconnects, destroy session
      if (type === "cli") {
        for (const peerWs of sessionSet) {
          if (peerWs.readyState === WebSocket.OPEN) {
            peerWs.send(
              JSON.stringify({
                type: "session.destroy",
                sessionId,
                timestamp: Date.now(),
              })
            );
          }
        }
        this.db.deleteSession(sessionId);
        this.sessionClients.delete(sessionId);
      }
    }
  }

  getClientsInSession(sessionId: string): WebSocket[] {
    return [...(this.sessionClients.get(sessionId) || [])].filter(
      (ws) => ws.readyState === WebSocket.OPEN
    );
  }

  getSession(sessionId: string) {
    return this.db.getSession(sessionId);
  }

  getClient(ws: WebSocket): Client | undefined {
    return this.clients.get(ws);
  }

  getSessionCli(sessionId: string): WebSocket | undefined {
    const clients = this.sessionClients.get(sessionId);
    if (!clients) return undefined;
    for (const ws of clients) {
      const client = this.clients.get(ws);
      if (client?.type === "cli" && ws.readyState === WebSocket.OPEN) {
        return ws;
      }
    }
    return undefined;
  }

  private cleanExpired() {
    const count = this.db.cleanExpired();
    if (count > 0) {
      console.log(`Cleaned ${count} expired sessions`);
    }
  }
}
