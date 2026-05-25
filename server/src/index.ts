import { WebSocketServer, WebSocket } from "ws";
import { SessionManager } from "./session.js";
import { PairingManager } from "./pairing.js";
import { MessageRouter } from "./router.js";
import { Database } from "./db.js";

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number.parseInt(process.env.PORT || "8080", 10);

if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error(`Invalid PORT: ${process.env.PORT}`);
  process.exit(1);
}

const db = new Database();
const sessions = new SessionManager(db);
const pairing = new PairingManager(sessions, db);
const router = new MessageRouter(sessions, pairing);

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on("listening", () => {
  console.log(`RemoteClaude relay server listening on ${HOST}:${PORT}`);
});

wss.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Set PORT to another value or stop the process using it.`);
  } else if (err.code === "EACCES") {
    console.error(`Cannot listen on ${HOST}:${PORT}. Check Windows firewall, administrator rights, or choose another PORT/HOST.`);
  } else {
    console.error(`Failed to start relay server: ${err.message}`);
  }
  db.close();
  process.exit(1);
});

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

function shutdown(signal: NodeJS.Signals) {
  console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down`);
  wss.close(() => {
    db.close();
    process.exit(0);
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => shutdown(signal));
}
