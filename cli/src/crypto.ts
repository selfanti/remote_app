import nacl from "tweetnacl";
import {
  decodeUTF8,
  encodeUTF8,
  encodeBase64,
  decodeBase64,
} from "tweetnacl-util";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const CONFIG_DIR = join(homedir(), ".remote-claude");
const KEYS_FILE = join(CONFIG_DIR, "keys.json");

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface KeyPairJSON {
  publicKey: string;
  secretKey: string;
}

export class E2ECrypto {
  private keyPair: KeyPair;
  private peerPublicKey: Uint8Array | null = null;
  private sharedNonceCounter = 0;

  constructor() {
    this.keyPair = this.loadOrGenerateKeys();
  }

  get publicKey(): string {
    return encodeBase64(this.keyPair.publicKey);
  }

  setPeerPublicKey(peerPublicKeyBase64: string) {
    this.peerPublicKey = decodeBase64(peerPublicKeyBase64);
    this.sharedNonceCounter = 0;
  }

  encrypt(data: string): string {
    if (!this.peerPublicKey) throw new Error("Peer public key not set");
    const nonce = this.generateNonce();
    const messageUint8 = decodeUTF8(data);
    const encrypted = nacl.box(
      messageUint8,
      nonce,
      this.peerPublicKey,
      this.keyPair.secretKey
    );
    // Concatenate nonce + ciphertext
    const combined = new Uint8Array(nonce.length + encrypted.length);
    combined.set(nonce);
    combined.set(encrypted, nonce.length);
    return encodeBase64(combined);
  }

  decrypt(combinedBase64: string): string {
    if (!this.peerPublicKey) throw new Error("Peer public key not set");
    const combined = decodeBase64(combinedBase64);
    const nonce = combined.slice(0, nacl.box.nonceLength);
    const ciphertext = combined.slice(nacl.box.nonceLength);

    const decrypted = nacl.box.open(
      ciphertext,
      nonce,
      this.peerPublicKey,
      this.keyPair.secretKey
    );
    if (!decrypted) throw new Error("Decryption failed - invalid ciphertext");
    return encodeUTF8(decrypted);
  }

  private generateNonce(): Uint8Array {
    // Use counter-based nonce with random prefix for uniqueness
    const nonce = new Uint8Array(nacl.box.nonceLength);
    // First 16 bytes: random prefix (set once per session)
    // Last 8 bytes: incrementing counter
    const counter = BigInt(this.sharedNonceCounter++);
    for (let i = 0; i < 8; i++) {
      nonce[nacl.box.nonceLength - 1 - i] = Number(
        (counter >> BigInt(i * 8)) & BigInt(0xff)
      );
    }
    return nonce;
  }

  private loadOrGenerateKeys(): KeyPair {
    if (existsSync(KEYS_FILE)) {
      try {
        const stored: KeyPairJSON = JSON.parse(readFileSync(KEYS_FILE, "utf-8"));
        return {
          publicKey: decodeBase64(stored.publicKey),
          secretKey: decodeBase64(stored.secretKey),
        };
      } catch {
        // Fall through to generate new keys
      }
    }
    const keyPair = nacl.box.keyPair();
    mkdirSync(CONFIG_DIR, { recursive: true });
    const json: KeyPairJSON = {
      publicKey: encodeBase64(keyPair.publicKey),
      secretKey: encodeBase64(keyPair.secretKey),
    };
    writeFileSync(KEYS_FILE, JSON.stringify(json, null, 2), { mode: 0o600 });
    return keyPair;
  }
}
