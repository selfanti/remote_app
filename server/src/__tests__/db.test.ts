import { describe, it, expect, beforeEach } from "vitest";

describe("Database", () => {
  // Use dynamic import to load TS directly via vitest
  let Database: any;
  it("should import", async () => {
    const mod = await import("../db.js");
    Database = mod.Database;
  });

  it("creates in-memory database and runs migrations", async () => {
    const db = new Database(":memory:");
    expect(db).toBeDefined();
    db.createSession("sess1", "pubkey1");
    const session = db.getSession("sess1");
    expect(session).toBeDefined();
    expect(session.id).toBe("sess1");
    expect(session.cli_public_key).toBe("pubkey1");
  });

  describe("session management", () => {
    let db: any;
    beforeEach(async () => {
      if (!Database) {
        const mod = await import("../db.js");
        Database = mod.Database;
      }
      db = new Database(":memory:");
    });

    it("getSession returns undefined for nonexistent session", () => {
      expect(db.getSession("nonexistent")).toBeUndefined();
    });

    it("createSession and getSession round trip", () => {
      db.createSession("s1", "pk1", 3600);
      const s = db.getSession("s1");
      expect(s).toBeDefined();
      expect(s.cli_public_key).toBe("pk1");
    });

    it("deleteSession removes session and cascades", () => {
      db.createSession("s2", "pk2");
      db.createPairCode("123456", "s2");
      db.addPairedApp("s2", "app_pk");
      db.deleteSession("s2");
      expect(db.getSession("s2")).toBeUndefined();
      expect(db.consumePairCode("123456")).toBeNull();
    });
  });

  describe("pair codes", () => {
    let db: any;
    beforeEach(async () => {
      if (!Database) {
        const mod = await import("../db.js");
        Database = mod.Database;
      }
      db = new Database(":memory:");
    });

    it("createPairCode and consumePairCode round trip", () => {
      db.createSession("s1", "pk1");
      db.createPairCode("654321", "s1");
      const row = db.consumePairCode("654321");
      expect(row).toBeDefined();
      expect(row.code).toBe("654321");
      expect(row.session_id).toBe("s1");
    });

    it("consumePairCode is one-time use", () => {
      db.createSession("s1", "pk1");
      db.createPairCode("111111", "s1");
      expect(db.consumePairCode("111111")).toBeDefined();
      expect(db.consumePairCode("111111")).toBeNull();
    });

    it("consumePairCode returns null for invalid code", () => {
      expect(db.consumePairCode("000000")).toBeNull();
    });

    it("consumePairCode returns null for expired code", () => {
      db.createSession("s1", "pk1");
      db.createPairCode("999999", "s1", -1); // already expired
      expect(db.consumePairCode("999999")).toBeNull();
    });
  });

  describe("paired apps", () => {
    let db: any;
    beforeEach(async () => {
      if (!Database) {
        const mod = await import("../db.js");
        Database = mod.Database;
      }
      db = new Database(":memory:");
    });

    it("addPairedApp and getPairedApps", () => {
      db.createSession("s1", "pk1");
      db.addPairedApp("s1", "app_pk_1");
      db.addPairedApp("s1", "app_pk_2");
      const apps = db.getPairedApps("s1");
      expect(apps).toHaveLength(2);
      expect(apps.map((a: any) => a.app_public_key)).toContain("app_pk_1");
      expect(apps.map((a: any) => a.app_public_key)).toContain("app_pk_2");
    });

    it("addPairedApp ignores duplicates", () => {
      db.createSession("s1", "pk1");
      db.addPairedApp("s1", "app_pk_1");
      db.addPairedApp("s1", "app_pk_1");
      expect(db.getPairedApps("s1")).toHaveLength(1);
    });
  });

  describe("cleanExpired", () => {
    let db: any;
    beforeEach(async () => {
      if (!Database) {
        const mod = await import("../db.js");
        Database = mod.Database;
      }
      db = new Database(":memory:");
    });

    it("cleans expired sessions and codes", () => {
      db.createSession("s1", "pk1", -1); // expired
      db.createSession("s2", "pk2", 3600); // valid
      const count = db.cleanExpired();
      expect(count).toBe(1);
      expect(db.getSession("s1")).toBeUndefined();
      expect(db.getSession("s2")).toBeDefined();
    });
  });
});
