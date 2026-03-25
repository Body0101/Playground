/**
 * db/index.js
 * ─────────────────────────────────────────────
 * Singleton SQLite connection with full PRAGMA
 * tuning and graceful-shutdown handling.
 * ─────────────────────────────────────────────
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ─── Resolve DB path ─────────────────────────────────────────────────────────
const DB_DIR  = process.env.DB_DIR  || path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || 'attendance.db';
const DB_PATH = path.join(DB_DIR, DB_FILE);

// Ensure data directory exists
fs.mkdirSync(DB_DIR, { recursive: true });

// ─── Open connection ──────────────────────────────────────────────────────────
const db = new Database(DB_PATH, {
  // verbose: process.env.NODE_ENV === 'development' ? console.log : null,
});

// ─── PRAGMA tuning ────────────────────────────────────────────────────────────
db.pragma('journal_mode  = WAL');     // concurrent reads while writing
db.pragma('synchronous   = NORMAL');  // safe + fast (WAL makes FULL redundant)
db.pragma('cache_size    = -32000');  // 32 MB page cache
db.pragma('temp_store    = MEMORY');  // temp tables in RAM
db.pragma('foreign_keys  = ON');      // enforce FK constraints
db.pragma('busy_timeout  = 5000');    // wait 5 s before SQLITE_BUSY

// ─── Graceful shutdown ────────────────────────────────────────────────────────
function closeDb() {
  if (db.open) {
    db.close();
    console.log('[DB] Connection closed.');
  }
}
process.on('exit',    closeDb);
process.on('SIGINT',  () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });

module.exports = { db, DB_PATH, DB_DIR };
