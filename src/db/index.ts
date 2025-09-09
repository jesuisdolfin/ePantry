import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("pantry.db"); // sync API (SDK 51+)

export function ensureTables() {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      upc TEXT,
      name TEXT NOT NULL,
      brand TEXT,
      qty REAL NOT NULL,
      unit TEXT NOT NULL,
      location TEXT,
      expiry_date TEXT,
      updated_at TEXT NOT NULL
    );
  `);
}
