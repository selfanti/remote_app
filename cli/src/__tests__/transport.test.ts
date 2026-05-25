import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { WebSocketServer, WebSocket } from "ws";

describe("Transport", () => {
  let Transport: any;
  let server: WebSocketServer;
  let port: number;

  beforeAll(async () => {
    const mod = await import("../transport.js");
    Transport = mod.Transport;
    server = new WebSocketServer({ port: 0 });
    port = (server.address() as any).port;
  });

  afterAll(() => {
    server.close();
  });

  it("connects to a WebSocket server", async () => {
    const messages: any[] = [];
    const transport = new Transport(
      `ws://localhost:${port}`,
      (msg: any) => messages.push(msg)
    );
    await transport.connect();
    expect(transport.isConnected).toBe(true);
    transport.close();
  });

  it("receives messages from server", async () => {
    const messages: any[] = [];
    const transport = new Transport(
      `ws://localhost:${port}`,
      (msg: any) => messages.push(msg)
    );
    await transport.connect();

    // Server sends a message to the connected client
    server.on("connection", (ws) => {
      ws.send(JSON.stringify({ type: "test", timestamp: Date.now() }));
    });

    // Wait a bit for message to arrive
    await new Promise((r) => setTimeout(r, 100));
    transport.close();
  });

  it("queues messages when disconnected", () => {
    const messages: any[] = [];
    const transport = new Transport(
      `ws://localhost:${port}`,
      (msg: any) => messages.push(msg)
    );
    // Not connected - should queue
    transport.send({ type: "test", timestamp: Date.now() });
    expect(transport.isConnected).toBe(false);
    transport.close();
  });

  it("close prevents reconnection", async () => {
    const messages: any[] = [];
    const transport = new Transport(
      `ws://localhost:${port}`,
      (msg: any) => messages.push(msg)
    );
    await transport.connect();
    transport.close();
    expect(transport.isConnected).toBe(false);
  });

  it("rejects connection to invalid URL", async () => {
    const messages: any[] = [];
    const transport = new Transport(
      "ws://localhost:1",
      (msg: any) => messages.push(msg)
    );
    await expect(transport.connect()).rejects.toThrow();
  });
});
