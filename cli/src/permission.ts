// Permission prompt detection for Claude Code
// Claude Code shows permission prompts like:
//   "Allow Bash tool to run: rm -rf /tmp/test? [Y/n]"
//   "Allow Write tool to edit src/index.ts? [Y/n]"

import { encodeBase64 } from "tweetnacl-util";
import { createInnerMessage } from "../../shared/protocol.js";
import { E2ECrypto } from "./crypto.js";
import { Transport } from "./transport.js";

interface PendingPermission {
  id: string;
  prompt: string;
  tool: string;
  detail: string;
  resolve: (approved: boolean, input?: string) => void;
}

export class PermissionHandler {
  private pendingPermissions: Map<string, PendingPermission> = new Map();
  private outputBuffer = "";
  private permissionIdCounter = 0;
  private crypto: E2ECrypto;
  private transport: Transport;

  // Patterns for detecting Claude Code permission prompts
  private static readonly PERMISSION_PATTERNS = [
    /\[Y\/n\]/,
    /\[y\/N\]/,
    /\[yes\/no\]/i,
    /Allow.*tool.*\?/i,
    /Do you want to/i,
    /Would you like to/i,
  ];

  // Patterns for extracting tool name
  private static readonly TOOL_PATTERN = /Allow\s+(\w+)\s+tool/i;
  private static readonly COMMAND_PATTERN = /(?:run|execute|to run|to execute):\s*(.+)/i;

  constructor(crypto: E2ECrypto, transport: Transport) {
    this.crypto = crypto;
    this.transport = transport;
  }

  processOutput(data: string): string {
    this.outputBuffer += data;

    // Check if buffer contains a permission prompt
    for (const pattern of PermissionHandler.PERMISSION_PATTERNS) {
      if (pattern.test(this.outputBuffer)) {
        this.handlePermissionDetected();
        break;
      }
    }

    // Trim buffer to prevent unbounded growth
    if (this.outputBuffer.length > 10000) {
      this.outputBuffer = this.outputBuffer.slice(-2000);
    }

    return data;
  }

  respondToPermission(permissionId: string, approved: boolean, input?: string) {
    const pending = this.pendingPermissions.get(permissionId);
    if (pending) {
      pending.resolve(approved, input);
      this.pendingPermissions.delete(permissionId);
    }
  }

  private handlePermissionDetected() {
    const id = `perm_${++this.permissionIdCounter}`;
    const toolMatch = PermissionHandler.TOOL_PATTERN.exec(this.outputBuffer);
    const cmdMatch = PermissionHandler.COMMAND_PATTERN.exec(this.outputBuffer);

    const tool = toolMatch?.[1] || "unknown";
    const detail = cmdMatch?.[1] || this.outputBuffer.trim().slice(-200);
    const prompt = this.outputBuffer.trim().slice(-500);

    // Send encrypted permission request to mobile app
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

    this.pendingPermissions.set(id, {
      id,
      prompt,
      tool,
      detail,
      resolve: () => {}, // Will be resolved when response comes from app
    });

    // Clear the buffer after processing
    this.outputBuffer = "";
  }

  reset() {
    this.outputBuffer = "";
  }
}
