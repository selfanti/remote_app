import { describe, it, expect, beforeEach } from "vitest";

function capturingWs(): any {
  return {
    readyState: 1,
    sentMessages: [] as string[],
    send(this: any, msg: string) { this.sentMessages.push(msg); },
  };
}

describe("MessageRouter", () => {
  let Database: any, SessionManager: any, PairingManager: any, MessageRouter: any;
  let db: any, sessions: any, pairing: any, router: any;

  beforeEach(async () => {
    const dbMod = await import("../db.js");
    const sessMod = await import("../session.js");
    const pairMod = await import("../pairing.js");
    const routerMod = await import("../router.js");
    Database = dbMod.Database;
    SessionManager = sessMod.SessionManager;
    PairingManager = pairMod.PairingManager;
    MessageRouter = routerMod.MessageRouter;
    db = new Database(":memory:");
    sessions = new SessionManager(db);
    pairing = new PairingManager(sessions, db);
    router = new MessageRouter(sessions, pairing);
  });

  describe("ping", () => {
    it("responds with pong", () => {
      const ws = capturingWs();
      router.handle(ws, { type: "ping", timestamp: Date.now() });
      const msg = JSON.parse(ws.sentMessages[0]);
      expect(msg.type).toBe("pong");
    });
  });

  describe("unknown type", () => {
    it("responds with error", () => {
      const ws = capturingWs();
      router.handle(ws, { type: "foobar", timestamp: Date.now() });
      const msg = JSON.parse(ws.sentMessages[0]);
      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("UNKNOWN_TYPE");
    });
  });

  describe("encrypted routing", () => {
    it("sends error for unpaired client", () => {
      const ws = capturingWs();
      router.handle(ws, {
        type: "encrypted",
        payload: { ciphertext: "AAA" },
        timestamp: Date.now(),
      });
      const msg = JSON.parse(ws.sentMessages[0]);
      expect(msg.type).toBe("error");
      expect(msg.payload.code).toBe("NOT_PAIRED");
    });

    it("forwards encrypted message to peers in session", () => {
      const cliWs = capturingWs();
      router.handle(cliWs, {
        type: "pair.request",
        payload: { cliPublicKey: "cli_pk", cols: 80, rows: 24 },
        timestamp: Date.now(),
      });
      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const code = codeMsg.payload.code;

      const appWs = capturingWs();
      router.handle(appWs, {
        type: "pair.submit",
        payload: { code, appPublicKey: "app_pk" },
        timestamp: Date.now(),
      });

      // Clear previous messages
      cliWs.sentMessages = [];
      appWs.sentMessages = [];

      // App sends encrypted message
      const encryptedPayload = { ciphertext: "ENCRYPTED_DATA" };
      router.handle(appWs, {
        type: "encrypted",
        payload: encryptedPayload,
        timestamp: Date.now(),
      });

      // CLI should receive the forwarded message
      expect(cliWs.sentMessages).toHaveLength(1);
      const fwdMsg = JSON.parse(cliWs.sentMessages[0]);
      expect(fwdMsg.type).toBe("encrypted");
      expect(fwdMsg.payload.ciphertext).toBe("ENCRYPTED_DATA");
    });

    it("does not echo back to sender", () => {
      const cliWs = capturingWs();
      router.handle(cliWs, {
        type: "pair.request",
        payload: { cliPublicKey: "cli_pk", cols: 80, rows: 24 },
        timestamp: Date.now(),
      });
      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const code = codeMsg.payload.code;

      const appWs = capturingWs();
      router.handle(appWs, {
        type: "pair.submit",
        payload: { code, appPublicKey: "app_pk" },
        timestamp: Date.now(),
      });

      cliWs.sentMessages = [];
      appWs.sentMessages = [];

      // CLI sends encrypted
      router.handle(cliWs, {
        type: "encrypted",
        payload: { ciphertext: "FROM_CLI" },
        timestamp: Date.now(),
      });

      // App receives, CLI does NOT receive its own message
      expect(appWs.sentMessages).toHaveLength(1);
      expect(cliWs.sentMessages).toHaveLength(0);
    });
  });

  describe("session.destroy", () => {
    it("destroys session when CLI requests it", () => {
      const cliWs = capturingWs();
      router.handle(cliWs, {
        type: "pair.request",
        payload: { cliPublicKey: "cli_pk", cols: 80, rows: 24 },
        timestamp: Date.now(),
      });
      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const code = codeMsg.payload.code;

      const appWs = capturingWs();
      router.handle(appWs, {
        type: "pair.submit",
        payload: { code, appPublicKey: "app_pk" },
        timestamp: Date.now(),
      });

      cliWs.sentMessages = [];
      appWs.sentMessages = [];

      // CLI destroys session
      router.handle(cliWs, {
        type: "session.destroy",
        timestamp: Date.now(),
      });

      // App should have received session.destroy
      const destroyMsg = appWs.sentMessages.find(
        (m: string) => JSON.parse(m).type === "session.destroy"
      );
      expect(destroyMsg).toBeDefined();
    });
  });
});
