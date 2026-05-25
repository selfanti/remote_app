import { spawn, IPty } from "node-pty";
import { encodeBase64 } from "tweetnacl-util";
import { E2ECrypto } from "./crypto.js";
import { Transport } from "./transport.js";
import { createInnerMessage } from "./protocol.js";
import { PermissionHandler } from "./permission.js";

export class PtyManager {
  private pty: IPty | null = null;
  private crypto: E2ECrypto;
  private transport: Transport;
  private permission: PermissionHandler;
  private isRemoteControlled = false;
  private stdinHandler?: (data: Buffer) => void;

  constructor(crypto: E2ECrypto, transport: Transport) {
    this.crypto = crypto;
    this.transport = transport;
    this.permission = new PermissionHandler(crypto, transport);
  }

  start(cols: number = process.stdout.columns || 80, rows: number = process.stdout.rows || 24) {
    this.pty = spawn("claude", [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: process.cwd(),
      env: { ...process.env } as Record<string, string>,
    });

    this.pty.onData((data) => {
      // Always output to local terminal
      process.stdout.write(data);

      // If remote is connected, send encrypted output to app
      if (this.isRemoteControlled) {
        const processed = this.permission.processOutput(data);
        this.sendEncryptedOutput(processed);
      }
    });

    this.pty.onExit(({ exitCode }) => {
      console.log(`\nClaude Code exited with code ${exitCode}`);
      if (this.isRemoteControlled) {
        this.sendStatusUpdate("disconnected");
      }
      this.cleanup();
      process.exit(exitCode);
    });

    // Local keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    this.stdinHandler = (data: Buffer) => {
      if (!this.pty) return;

      // If remote is controlling, take back control on any key
      if (this.isRemoteControlled) {
        this.isRemoteControlled = false;
        console.log("\n[RemoteClaude] Local control resumed");
      }

      this.pty.write(data.toString());
    };
    process.stdin.on("data", this.stdinHandler);
  }

  enableRemoteControl() {
    this.isRemoteControlled = true;
    console.log("[RemoteClaude] Remote control enabled - press any key to resume local control");
    this.sendStatusUpdate("active");
  }

  handleRemoteInput(input: string) {
    if (!this.pty) return;
    this.isRemoteControlled = true;
    this.pty.write(input);
  }

  handleRemoteResize(cols: number, rows: number) {
    if (!this.pty) return;
    this.pty.resize(cols, rows);
  }

  handlePermissionResponse(id: string, approved: boolean, input?: string) {
    this.permission.respondToPermission(id, approved, input);
    if (approved && input) {
      this.handleRemoteInput(input);
    } else if (approved) {
      this.handleRemoteInput("y\n");
    } else {
      this.handleRemoteInput("n\n");
    }
  }

  private sendEncryptedOutput(data: string) {
    const innerMsg = createInnerMessage("terminal.output", {
      output: Buffer.from(data).toString("base64"),
    });
    const encrypted = this.crypto.encrypt(JSON.stringify(innerMsg));
    this.transport.send({
      type: "encrypted",
      payload: { ciphertext: encrypted },
      timestamp: Date.now(),
    });
  }

  private sendStatusUpdate(status: string) {
    const innerMsg = createInnerMessage("status", { status });
    const encrypted = this.crypto.encrypt(JSON.stringify(innerMsg));
    this.transport.send({
      type: "encrypted",
      payload: { ciphertext: encrypted },
      timestamp: Date.now(),
    });
  }

  private cleanup() {
    if (this.stdinHandler) {
      process.stdin.off("data", this.stdinHandler);
      this.stdinHandler = undefined;
    }
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    this.transport.close();
    this.pty = null;
  }
}
