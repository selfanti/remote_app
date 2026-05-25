import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";

export class Database {
  private db: BetterSqlite3.Database;

  constructor(path?: string) {
    const dbPath = path || process.env.DB_PATH || "./data/relay.db";
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.migrate();
  }

  close() {
    this.db.close();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cli_public_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS pair_codes (
        code TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS paired_apps (
        session_id TEXT NOT NULL REFERENCES sessions(id),
        app_public_key TEXT NOT NULL,
        paired_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, app_public_key)
      );
    `);
  }

  createSession(id: string, cliPublicKey: string, ttlSeconds: number = 86400) {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO sessions (id, cli_public_key, created_at, expires_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, cliPublicKey, now, now + ttlSeconds * 1000);
  }

  getSession(id: string) {
    return this.db
      .prepare("SELECT * FROM sessions WHERE id = ? AND expires_at > ?")
      .get(id, Date.now()) as
      | { id: string; cli_public_key: string; created_at: number; expires_at: number }
      | undefined;
  }

  deleteSession(id: string) {
    this.db.prepare("DELETE FROM paired_apps WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM pair_codes WHERE session_id = ?").run(id);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  }

  createPairCode(code: string, sessionId: string, ttlSeconds: number = 300) {
    const now = Date.now();
    this.db
      .prepare(
        "INSERT INTO pair_codes (code, session_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
      )
      .run(code, sessionId, now, now + ttlSeconds * 1000);
  }

  consumePairCode(code: string) {
    const row = this.db
      .prepare("SELECT * FROM pair_codes WHERE code = ? AND expires_at > ?")
      .get(code, Date.now()) as
      | { code: string; session_id: string; created_at: number; expires_at: number }
      | undefined;
    if (!row) return null;
    this.db.prepare("DELETE FROM pair_codes WHERE code = ?").run(code);
    return row;
  }

  addPairedApp(sessionId: string, appPublicKey: string) {
    this.db
      .prepare(
        "INSERT OR IGNORE INTO paired_apps (session_id, app_public_key, paired_at) VALUES (?, ?, ?)"
      )
      .run(sessionId, appPublicKey, Date.now());
  }

  getPairedApps(sessionId: string) {
    return this.db
      .prepare("SELECT app_public_key FROM paired_apps WHERE session_id = ?")
      .all(sessionId) as Array<{ app_public_key: string }>;
  }

  cleanExpired() {
    const now = Date.now();
    this.db.prepare("DELETE FROM pair_codes WHERE expires_at <= ?").run(now);
    const expired = this.db
      .prepare("SELECT id FROM sessions WHERE expires_at <= ?")
      .all(now) as Array<{ id: string }>;
    for (const s of expired) {
      this.deleteSession(s.id);
    }
    return expired.length;
  }
}
