import { describe, it, expect, beforeEach } from "vitest";

function mockWs(): any {
  return {
    readyState: 1, // WebSocket.OPEN
    send: (msg: string) => {},
    sentMessages: [] as string[],
  };
}

// Patch send to capture messages
function capturingWs(): any {
  const ws = mockWs();
  ws.send = (msg: string) => ws.sentMessages.push(msg);
  return ws;
}

describe("SessionManager", () => {
  let SessionManager: any, Database: any;
  let db: any, sessions: any;

  beforeEach(async () => {
    const dbMod = await import("../db.js");
    const sessMod = await import("../session.js");
    Database = dbMod.Database;
    SessionManager = sessMod.SessionManager;
    db = new Database(":memory:");
    sessions = new SessionManager(db);
  });

  it("createSession registers CLI client", () => {
    const ws = capturingWs();
    sessions.createSession("s1", "cli_pk", ws);
    const client = sessions.getClient(ws);
    expect(client).toBeDefined();
    expect(client.type).toBe("cli");
    expect(client.sessionId).toBe("s1");
  });

  it("joinSession registers app client", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);

    const appWs = capturingWs();
    const result = sessions.joinSession("s1", "app_pk", appWs);
    expect(result).toBe(true);

    const client = sessions.getClient(appWs);
    expect(client).toBeDefined();
    expect(client.type).toBe("app");
  });

  it("joinSession returns false for nonexistent session", () => {
    const appWs = capturingWs();
    const result = sessions.joinSession("nonexistent", "app_pk", appWs);
    expect(result).toBe(false);
  });

  it("getClientsInSession returns all clients", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);

    const appWs = capturingWs();
    sessions.joinSession("s1", "app_pk", appWs);

    const clients = sessions.getClientsInSession("s1");
    expect(clients).toHaveLength(2);
  });

  it("removeClient sends client.left to peers", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);
    const appWs = capturingWs();
    sessions.joinSession("s1", "app_pk", appWs);

    // App leaves
    sessions.removeClient(appWs);
    // CLI should have received client.left
    const leftMsg = cliWs.sentMessages.find((m: string) => m.includes("client.left"));
    expect(leftMsg).toBeDefined();
  });

  it("CLI disconnect destroys session and notifies apps", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);
    const appWs = capturingWs();
    sessions.joinSession("s1", "app_pk", appWs);

    sessions.removeClient(cliWs);
    const destroyMsg = appWs.sentMessages.find((m: string) => m.includes("session.destroy"));
    expect(destroyMsg).toBeDefined();
    expect(sessions.getClientsInSession("s1")).toHaveLength(0);
  });

  it("getSessionCli returns CLI WebSocket", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);
    expect(sessions.getSessionCli("s1")).toBe(cliWs);
  });

  it("getSessionCli returns undefined when no CLI", () => {
    expect(sessions.getSessionCli("s1")).toBeUndefined();
  });

  it("getClientsInSession filters out closed connections", () => {
    const cliWs = capturingWs();
    sessions.createSession("s1", "cli_pk", cliWs);
    cliWs.readyState = 3; // CLOSED
    const clients = sessions.getClientsInSession("s1");
    expect(clients).toHaveLength(0);
  });
});
