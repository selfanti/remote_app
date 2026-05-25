import { createInnerMessage } from "../../shared/protocol.js";
import { E2ECrypto } from "./crypto.js";
import { Transport } from "./transport.js";

interface PendingPermission {
  id: string;
  prompt: string;
  tool: string;
  detail: string;
}

export class PermissionHandler {
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private outputBuffer = "";
  private permissionIdCounter = 0;
  private crypto: E2ECrypto;
  private transport: Transport;

  // Line-oriented patterns for Claude Code permission prompts.
  // Claude Code outputs prompts like:
  //   "⏺ Allow Bash tool to run: rm -rf /tmp/test [Y/n]"
  //   "Allow read access to /path/file"
  //   "Do you want to allow this action? [Y/n]"
  // We match on line boundaries to avoid false positives from streaming chunks.
  private static readonly PROMPT_LINE_PATTERNS = [
    /\[Y\/n\]/,
    /\[y\/N\]/,
    /\[yes\/no\]/i,
    /^.*Allow\s+\w+\s*(tool\s+)?(to\s+)?/im,
  ];

  private static readonly TOOL_PATTERNS = [
    /Allow\s+(\w+)\s+tool/i,
    /(\w+)\s+tool\s+to\s+(?:run|execute|write|read|edit|create|delete)/i,
    /tool:\s*(\w+)/i,
  ];

  private static readonly DETAIL_PATTERNS = [
    /(?:run|execute|to run|to execute):\s*(.+)/i,
    /(?:write|edit|create|modify):\s*(.+)/i,
    /(?:read|access):\s*(.+)/i,
    /Allow\s+\w+\s+(?:tool\s+)?(?:to\s+)?(?:.+)/im,
  ];

  private lastDetectedLine = 0;

  constructor(crypto: E2ECrypto, transport: Transport) {
    this.crypto = crypto;
    this.transport = transport;
  }

  processOutput(data: string): string {
    this.outputBuffer += data;

    // Process complete lines only
    const lines = this.outputBuffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.outputBuffer = lines.pop() || "";

    for (let i = this.lastDetectedLine; i < lines.length; i++) {
      const line = lines[i];
      for (const pattern of PermissionHandler.PROMPT_LINE_PATTERNS) {
        if (pattern.test(line)) {
          this.handlePermissionDetected(line, lines.slice(Math.max(0, i - 3), i + 1));
          this.lastDetectedLine = i + 1;
          break;
        }
      }
    }

    // Safety: trim buffer if it grows too large
    if (this.outputBuffer.length > 5000) {
      this.outputBuffer = this.outputBuffer.slice(-1000);
    }
    this.lastDetectedLine = Math.max(0, this.lastDetectedLine - lines.length);

    return data;
  }

  respondToPermission(permissionId: string, approved: boolean, input?: string) {
    this.pendingPermissions.delete(permissionId);
  }

  private handlePermissionDetected(line: string, context: string[]) {
    const id = `perm_${++this.permissionIdCounter}_${Date.now()}`;

    // Extract tool name
    let tool = "unknown";
    for (const pattern of PermissionHandler.TOOL_PATTERNS) {
      const match = pattern.exec(line);
      if (match) {
        tool = match[1];
        break;
      }
    }

    // Extract detail
    let detail = line.trim();
    for (const pattern of PermissionHandler.DETAIL_PATTERNS) {
      const match = pattern.exec(line);
      if (match?.[1]) {
        detail = match[1].trim();
        break;
      }
    }

    const prompt = context.join("\n").trim();

    const innerMsg = createInnerMessage("permission.request", {
      id,
      tool,
      detail,
      prompt,
    });

    const encrypted = this.crypto.encrypt(JSON.stringify(innerMsg));
    this.transport.send({
      type: "encrypted",
      payload: { ciphertext: encrypted },
      timestamp: Date.now(),
    });

    this.pendingPermissions.set(id, { id, prompt, tool, detail });
  }

  reset() {
    this.outputBuffer = "";
    this.lastDetectedLine = 0;
  }
}
