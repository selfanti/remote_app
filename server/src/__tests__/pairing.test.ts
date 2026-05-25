import { describe, it, expect, beforeEach } from "vitest";

function capturingWs(): any {
  return {
    readyState: 1,
    sentMessages: [] as string[],
    send(this: any, msg: string) { this.sentMessages.push(msg); },
  };
}

describe("PairingManager", () => {
  let Database: any, SessionManager: any, PairingManager: any;
  let db: any, sessions: any, pairing: any;

  beforeEach(async () => {
    const dbMod = await import("../db.js");
    const sessMod = await import("../session.js");
    const pairMod = await import("../pairing.js");
    Database = dbMod.Database;
    SessionManager = sessMod.SessionManager;
    PairingManager = pairMod.PairingManager;
    db = new Database(":memory:");
    sessions = new SessionManager(db);
    pairing = new PairingManager(sessions, db);
  });

  describe("handlePairRequest", () => {
    it("generates pair code and sends to CLI", () => {
      const ws = capturingWs();
      pairing.handlePairRequest(ws, { cliPublicKey: "cli_pk", cols: 80, rows: 24 });

      const msg = JSON.parse(ws.sentMessages[0]);
      expect(msg.type).toBe("pair.code");
      expect(msg.payload.code).toMatch(/^\d{6}$/);
      expect(msg.payload.sessionId).toBeTruthy();
      expect(msg.payload.expiresIn).toBe(300);
    });
  });

  describe("handlePairSubmit", () => {
    it("rejects invalid pair code", () => {
      const appWs = capturingWs();
      pairing.handlePairSubmit(appWs, { code: "000000", appPublicKey: "app_pk" });

      const msg = JSON.parse(appWs.sentMessages[0]);
      expect(msg.type).toBe("pair.rejected");
      expect(msg.payload.code).toBe("INVALID_CODE");
    });

    it("rejects expired pair code", () => {
      // Create a real session first to satisfy FK constraint
      const cliWs = capturingWs();
      pairing.handlePairRequest(cliWs, { cliPublicKey: "cli_pk", cols: 80, rows: 24 });
      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const sessionId = codeMsg.payload.sessionId;

      // Insert an already-expired pair code for that session
      db.createPairCode("999000", sessionId, -1);

      const appWs = capturingWs();
      pairing.handlePairSubmit(appWs, { code: "999000", appPublicKey: "app_pk" });
      const msg = JSON.parse(appWs.sentMessages[0]);
      expect(msg.type).toBe("pair.rejected");
    });

    it("successfully pairs app with CLI", () => {
      const cliWs = capturingWs();
      pairing.handlePairRequest(cliWs, { cliPublicKey: "cli_pk", cols: 80, rows: 24 });

      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const code = codeMsg.payload.code;
      const sessionId = codeMsg.payload.sessionId;

      const appWs = capturingWs();
      pairing.handlePairSubmit(appWs, { code, appPublicKey: "app_pk" });

      // App should get pair.confirmed with CLI's public key
      const appMsg = JSON.parse(appWs.sentMessages[0]);
      expect(appMsg.type).toBe("pair.confirmed");
      expect(appMsg.payload.peerPublicKey).toBe("cli_pk");
      expect(appMsg.payload.sessionId).toBe(sessionId);

      // CLI should get pair.confirmed with app's public key
      const cliPairMsg = cliWs.sentMessages.find(
        (m: string) => JSON.parse(m).type === "pair.confirmed"
      );
      expect(cliPairMsg).toBeDefined();
      const cliMsg = JSON.parse(cliPairMsg!);
      expect(cliMsg.payload.peerPublicKey).toBe("app_pk");
    });

    it("pair code is single-use", () => {
      const cliWs = capturingWs();
      pairing.handlePairRequest(cliWs, { cliPublicKey: "cli_pk", cols: 80, rows: 24 });

      const codeMsg = JSON.parse(cliWs.sentMessages[0]);
      const code = codeMsg.payload.code;

      // First use succeeds
      const appWs1 = capturingWs();
      pairing.handlePairSubmit(appWs1, { code, appPublicKey: "app_pk1" });

      // Second use fails
      const appWs2 = capturingWs();
      pairing.handlePairSubmit(appWs2, { code, appPublicKey: "app_pk2" });
      const msg = JSON.parse(appWs2.sentMessages[0]);
      expect(msg.type).toBe("pair.rejected");
    });
  });
});
