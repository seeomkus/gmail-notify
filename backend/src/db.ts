import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "app.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    to_addr    TEXT NOT NULL,
    cc         TEXT NOT NULL DEFAULT '',
    bcc        TEXT NOT NULL DEFAULT '',
    subject    TEXT NOT NULL,
    message    TEXT NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('sent','failed')),
    error      TEXT,
    message_id TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs (created_at DESC);
`);

// migrasi ringan: kolom template_id untuk database lama
const cols = db.prepare("PRAGMA table_info(email_logs)").all() as { name: string }[];
if (!cols.some((c) => c.name === "template_id")) {
  db.exec("ALTER TABLE email_logs ADD COLUMN template_id TEXT");
}
