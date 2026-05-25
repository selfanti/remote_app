import chalk from "chalk";
import { E2ECrypto } from "./crypto.js";
import { Transport } from "./transport.js";
import { PtyManager } from "./pty.js";
import { createMessage, InnerPayload } from "./protocol.js";

export class RemoteClaudeApp {
  private crypto: E2ECrypto;
  private transport: Transport;
  private pty: PtyManager;
  private sessionId: string | null = null;

  constructor(serverUrl: string) {
    this.crypto = new E2ECrypto();
    this.transport = new Transport(serverUrl, (msg) => this.handleMessage(msg));
    this.pty = new PtyManager(this.crypto, this.transport);
  }

  async start() {
    console.log(chalk.cyan("RemoteClaude CLI"));
    console.log(chalk.dim("Connecting to relay server..."));

    try {
      await this.transport.connect();
    } catch (e) {
      console.error(chalk.red("Failed to connect to relay server."));
      console.error(chalk.dim("Make sure the server is running and the URL is correct."));
      console.error(chalk.dim("Configure with: remote-claude config --server <url>"));
      process.exit(1);
    }

    console.log(chalk.green("Connected!"));

    // Request pairing
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 24;

    this.transport.send(
      createMessage("pair.request", {
        cliPublicKey: this.crypto.publicKey,
        cols,
        rows,
      })
    );
  }

  private handleMessage(msg: any) {
    switch (msg.type) {
      case "pair.code":
        this.handlePairCode(msg);
        break;

      case "pair.confirmed":
        this.handlePairConfirmed(msg);
        break;

      case "pair.rejected":
        console.error(chalk.red("Pairing failed:" + (msg.payload?.message || "Unknown error")));
        break;

      case "encrypted":
        this.handleEncryptedMessage(msg);
        break;

      case "pong":
        break;

      case "error":
        console.error(chalk.red(`Error: ${msg.payload?.message || "Unknown"}`));
        break;

      case "session.destroy":
        console.log(chalk.yellow("Session destroyed"));
        process.exit(0);
    }
  }

  private handlePairCode(msg: any) {
    this.sessionId = msg.sessionId;
    const { code, expiresIn } = msg.payload;

    console.log();
    console.log(chalk.bgCyan.black(" ─── RemoteClaude 配对 ─── "));
    console.log();
    console.log(chalk.white("  在手机 App 中输入配对码:"));
    console.log();
    console.log(chalk.bold.yellow(`    ${code}`));
    console.log();
    console.log(chalk.dim(`  配对码 ${Math.floor(expiresIn / 60)} 分钟后过期`));
    console.log(chalk.dim(`  Session: ${this.sessionId}`));
    console.log();
    console.log(chalk.dim("  等待手机连接..."));

    // Start PTY immediately - output goes to local terminal
    this.pty.start();
  }

  private handlePairConfirmed(msg: any) {
    const { peerPublicKey, sessionId } = msg.payload;
    this.crypto.setPeerPublicKey(peerPublicKey);
    this.sessionId = sessionId;

    console.log(chalk.green("\n[RemoteClaude] 手机已连接! 远程控制已启用。"));
    console.log(chalk.dim("  在电脑上按任意键可夺回本地控制权。\n"));

    this.pty.enableRemoteControl();
  }

  private handleEncryptedMessage(msg: any) {
    try {
      const decrypted = this.crypto.decrypt(msg.payload.ciphertext);
      const inner: InnerPayload = JSON.parse(decrypted);

      switch (inner.type) {
        case "terminal.input":
          this.pty.handleRemoteInput((inner.data as any).input);
          break;

        case "terminal.resize":
          this.pty.handleRemoteResize(
            (inner.data as any).cols,
            (inner.data as any).rows
          );
          break;

        case "permission.response":
          const resp = inner.data as any;
          this.pty.handlePermissionResponse(resp.id, resp.approved, resp.input);
          break;

        case "voice.transcript":
          this.pty.handleRemoteInput((inner.data as any).text + "\n");
          break;
      }
    } catch (e) {
      console.error("Failed to decrypt message:", e);
    }
  }
}
