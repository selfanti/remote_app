import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocketServer, WebSocket } from "ws";

describe("Integration: Full server flow", () => {
  let wss: WebSocketServer;
  let port: number;

  beforeAll(async () => {
    const { Database } = await import("../db.js");
    const { SessionManager } = await import("../session.js");
    const { PairingManager } = await import("../pairing.js");
    const { MessageRouter } = await import("../router.js");

    const db = new Database(":memory:");
    const sessions = new SessionManager(db);
    const pairing = new PairingManager(sessions, db);
    const router = new MessageRouter(sessions, pairing);

    wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise<void>((resolve, reject) => {
      wss.once("listening", resolve);
      wss.once("error", reject);
    });
    const address = wss.address();
    if (!address || typeof address === "string") {
      throw new Error("WebSocket server did not bind to a TCP port");
    }
    port = address.port;

    wss.on("connection", (ws) => {
      ws.on("message", (raw) => {
        try {
          router.handle(ws, JSON.parse(raw.toString()));
        } catch {
          ws.send(JSON.stringify({ type: "error", payload: { code: "PARSE_ERROR" }, timestamp: Date.now() }));
        }
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      ws.on("open", () => resolve(ws));
      ws.on("error", reject);
    });
  }

  /** Collect all messages of the given type */
  function collectMessages(ws: WebSocket): any[] {
    const msgs: any[] = [];
    ws.on("message", (raw: Buffer) => {
      msgs.push(JSON.parse(raw.toString()));
    });
    return msgs;
  }

  function waitForType(msgs: any[], type: string, timeout = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
      const check = () => msgs.find((m) => m.type === type);

      const existing = check();
      if (existing) {
        resolve(existing);
        return;
      }

      let interval: ReturnType<typeof setInterval>;
      const timer = setTimeout(() => {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for ${type}. Got: ${msgs.map((m) => m.type)}`));
      }, timeout);
      interval = setInterval(() => {
        const found = check();
        if (found) {
          clearTimeout(timer);
          clearInterval(interval);
          resolve(found);
        }
      }, 50);
    });
  }

  it("full pairing and encrypted message flow", async () => {
    // 1. CLI connects
    const cliWs = await connect();
    const cliMsgs = collectMessages(cliWs);

    // Request pair code
    cliWs.send(JSON.stringify({
      type: "pair.request",
      payload: { cliPublicKey: "cli_pk_base64", cols: 80, rows: 24 },
      timestamp: Date.now(),
    }));

    const codeMsg = await waitForType(cliMsgs, "pair.code");
    expect(codeMsg.payload.code).toMatch(/^\d{6}$/);
    const code = codeMsg.payload.code;

    // 2. App connects and submits pair code
    const appWs = await connect();
    const appMsgs = collectMessages(appWs);

    appWs.send(JSON.stringify({
      type: "pair.submit",
      payload: { code, appPublicKey: "app_pk_base64" },
      timestamp: Date.now(),
    }));

    const cliConfirmed = await waitForType(cliMsgs, "pair.confirmed");
    expect(cliConfirmed.payload.peerPublicKey).toBe("app_pk_base64");

    const appConfirmed = await waitForType(appMsgs, "pair.confirmed");
    expect(appConfirmed.payload.peerPublicKey).toBe("cli_pk_base64");

    // 3. App sends encrypted message to CLI
    appWs.send(JSON.stringify({
      type: "encrypted",
      payload: { ciphertext: "ENCRYPTED_HELLO" },
      timestamp: Date.now(),
    }));

    const cliReceived = await waitForType(cliMsgs, "encrypted");
    expect(cliReceived.payload.ciphertext).toBe("ENCRYPTED_HELLO");

    // 4. CLI sends encrypted message to App
    cliWs.send(JSON.stringify({
      type: "encrypted",
      payload: { ciphertext: "ENCRYPTED_RESPONSE" },
      timestamp: Date.now(),
    }));

    const appReceived = await waitForType(appMsgs, "encrypted");
    expect(appReceived.payload.ciphertext).toBe("ENCRYPTED_RESPONSE");

    cliWs.close();
    appWs.close();
  });

  it("ping/pong", async () => {
    const ws = await connect();
    const msgs = collectMessages(ws);
    ws.send(JSON.stringify({ type: "ping", timestamp: Date.now() }));
    const msg = await waitForType(msgs, "pong");
    expect(msg.type).toBe("pong");
    ws.close();
  });

  it("unknown message type returns error", async () => {
    const ws = await connect();
    const msgs = collectMessages(ws);
    ws.send(JSON.stringify({ type: "invalid_type", timestamp: Date.now() }));
    const msg = await waitForType(msgs, "error");
    expect(msg.payload.code).toBe("UNKNOWN_TYPE");
    ws.close();
  });

  it("invalid pair code returns rejection", async () => {
    const ws = await connect();
    const msgs = collectMessages(ws);
    ws.send(JSON.stringify({
      type: "pair.submit",
      payload: { code: "000000", appPublicKey: "pk" },
      timestamp: Date.now(),
    }));
    const msg = await waitForType(msgs, "pair.rejected");
    expect(msg.payload.code).toBe("INVALID_CODE");
    ws.close();
  });

  it("encrypted without pairing returns error", async () => {
    const ws = await connect();
    const msgs = collectMessages(ws);
    ws.send(JSON.stringify({
      type: "encrypted",
      payload: { ciphertext: "AAA" },
      timestamp: Date.now(),
    }));
    const msg = await waitForType(msgs, "error");
    expect(msg.payload.code).toBe("NOT_PAIRED");
    ws.close();
  });
});
