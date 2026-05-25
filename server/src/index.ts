import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "./session.js";
import { PairingManager } from "./pairing.js";
import { MessageRouter } from "./router.js";
import { Database } from "./db.js";

const PORT = parseInt(process.env.PORT || "8080", 10);

const db = new Database();
const sessions = new SessionManager(db);
const pairing = new PairingManager(sessions, db);
const router = new MessageRouter(sessions, pairing);

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws, req) => {
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  console.log(`[${new Date().toISOString()}] Connected: ${clientIp}`);

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      router.handle(ws, msg);
    } catch (e) {
      sendError(ws, "INVALID_MESSAGE", "Failed to parse message");
    }
  });

  ws.on("close", () => {
    sessions.removeClient(ws);
    console.log(`[${new Date().toISOString()}] Disconnected`);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error:`, err.message);
  });
});

function sendError(ws: WebSocket, code: string, message: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(
      JSON.stringify({
        type: "error",
        payload: { code, message },
        timestamp: Date.now(),
      })
    );
  }
}

console.log(`RemoteClaude relay server listening on port ${PORT}`);
