import { describe, it, expect, beforeEach } from "vitest";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { E2ECrypto } from "../crypto.js";

const keysFile = join(homedir(), ".remote-claude", "keys.json");

describe("E2ECrypto", () => {
  let cli: E2ECrypto;
  let app: E2ECrypto;

  beforeEach(() => {
    // Remove existing key file so each instance generates fresh keys
    if (existsSync(keysFile)) unlinkSync(keysFile);
    cli = new E2ECrypto();
    if (existsSync(keysFile)) unlinkSync(keysFile);
    app = new E2ECrypto();
  });

  it("generates a base64 public key", () => {
    const pk = cli.publicKey;
    expect(pk).toBeTruthy();
    expect(typeof pk).toBe("string");
    // base64 of 32 bytes = 44 chars
    expect(pk.length).toBe(44);
  });

  it("each instance has a unique key pair", () => {
    expect(cli.publicKey).not.toBe(app.publicKey);
  });

  it("throws when encrypting without peer key", () => {
    expect(() => cli.encrypt("hello")).toThrow("Peer public key not set");
  });

  it("throws when decrypting without peer key", () => {
    expect(() => cli.decrypt("AAAA")).toThrow("Peer public key not set");
  });

  it("throws when decrypting garbage ciphertext", () => {
    cli.setPeerPublicKey(app.publicKey);
    expect(() => cli.decrypt("AAAA")).toThrow();
  });

  it("encrypt → decrypt round trip between two parties", () => {
    // CLI encrypts for App, App decrypts
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const plaintext = "Hello from CLI!";
    const encrypted = cli.encrypt(plaintext);
    const decrypted = app.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("App encrypt → CLI decrypt round trip", () => {
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const plaintext = "Hello from App!";
    const encrypted = app.encrypt(plaintext);
    const decrypted = cli.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("handles empty string", () => {
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const encrypted = cli.encrypt("");
    const decrypted = app.decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("handles unicode / Chinese characters", () => {
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const plaintext = "你好世界 🎉 emoji test";
    const encrypted = cli.encrypt(plaintext);
    const decrypted = app.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("handles large payloads", () => {
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const plaintext = "A".repeat(100_000);
    const encrypted = cli.encrypt(plaintext);
    const decrypted = app.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("multiple sequential messages all decrypt correctly", () => {
    cli.setPeerPublicKey(app.publicKey);
    app.setPeerPublicKey(cli.publicKey);

    const messages = ["msg1", "msg2", "msg3", "msg4", "msg5"];
    const encrypted = messages.map((m) => cli.encrypt(m));
    const decrypted = encrypted.map((e) => app.decrypt(e));
    expect(decrypted).toEqual(messages);
  });

  it("cannot decrypt with wrong key", () => {
    cli.setPeerPublicKey(app.publicKey);
    const encrypted = cli.encrypt("secret");

    // Create a third party with different keys
    if (existsSync(keysFile)) unlinkSync(keysFile);
    const eve = new E2ECrypto();
    eve.setPeerPublicKey(cli.publicKey);
    expect(() => eve.decrypt(encrypted)).toThrow();
  });

  it("ciphertext is base64 encoded", () => {
    cli.setPeerPublicKey(app.publicKey);
    const encrypted = cli.encrypt("test");
    // Valid base64
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
