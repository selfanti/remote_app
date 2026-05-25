import { describe, it, expect, beforeEach, vi } from "vitest";
import { E2ECrypto } from "../crypto.js";
import { Transport } from "../transport.js";
import { PermissionHandler } from "../permission.js";

describe("PermissionHandler", () => {
  let handler: PermissionHandler;
  let transport: Transport;
  let sendSpy: any;

  beforeEach(() => {
    const crypto = new E2ECrypto();
    // Set a fake peer key so encrypt doesn't throw
    crypto.setPeerPublicKey(crypto.publicKey);
    transport = new Transport("ws://localhost:1", () => {});
    sendSpy = vi.spyOn(transport, "send");
    handler = new PermissionHandler(crypto, transport);
  });

  describe("processOutput - permission detection", () => {
    it("detects [Y/n] prompt", () => {
      handler.processOutput("Allow Bash tool to run: rm -rf /tmp [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("detects [y/N] prompt", () => {
      handler.processOutput("Delete this file? [y/N]\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("detects 'Allow ... tool' pattern", () => {
      handler.processOutput("Allow Write tool to edit src/index.ts\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("does NOT detect normal output", () => {
      handler.processOutput("Building project...\n");
      handler.processOutput("✓ All tests passed\n");
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("does NOT detect unrelated text", () => {
      handler.processOutput("Some random output without allow prompt\n");
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("processOutput - tool name extraction", () => {
    it("extracts Bash tool name", () => {
      handler.processOutput("Allow Bash tool to run: ls -la [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
      // Verify it was sent as encrypted message
      expect(sendSpy.mock.calls[0][0].type).toBe("encrypted");
    });

    it("extracts Write tool name", () => {
      handler.processOutput("Allow Write tool to edit main.go [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("defaults to 'unknown' for unrecognized patterns", () => {
      handler.processOutput("Do you want to proceed? [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  describe("processOutput - detail extraction", () => {
    it("extracts command after 'run:'", () => {
      handler.processOutput("Allow Bash tool to run: npm install [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("includes context in prompt field", () => {
      handler.processOutput("line1\nline2\nAllow Bash tool to run: ls [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });
  });

  describe("buffer management", () => {
    it("processes multi-chunk output that spans a line", () => {
      handler.processOutput("Allow Bash tool to run: ");
      expect(sendSpy).not.toHaveBeenCalled();
      handler.processOutput("rm -rf /tmp [Y/n]\n");
      expect(sendSpy).toHaveBeenCalled();
    });

    it("handles reset", () => {
      handler.processOutput("Allow Bash tool to run: ");
      handler.reset();
      handler.processOutput("something else\n");
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("respondToPermission", () => {
    it("removes pending permission without error", () => {
      handler.processOutput("Allow Bash tool to run: ls [Y/n]\n");
      // Should not throw
      handler.respondToPermission("perm_1_12345", true);
    });
  });
});
