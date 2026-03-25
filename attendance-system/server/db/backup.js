/**
 * db/backup.js
 * ─────────────────────────────────────────────
 * Hot-backup the SQLite database using the
 * built-in `.backup()` API (no locks, safe while
 * server is running).
 *
 * Features
 * ─────────
 * • Creates timestamped copies in  data/backups/
 * • Keeps only the N most recent copies (rotation)
 * • Can be run as a cron job or imported as a module
 * • Logs backup size and duration
 *
 * CLI:
 *   node db/backup.js              → single backup now
 *   node db/backup.js --schedule   → backup every 6 h
 *   node db/backup.js --list       → list existing backups
 *   node db/backup.js --restore <file> → restore from file
 * ─────────────────────────────────────────────
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const { DB_PATH, DB_DIR } = require('./index');

// ─── Config ───────────────────────────────────────────────────────────────────
const BACKUP_DIR    = path.join(DB_DIR, 'backups');
const MAX_BACKUPS   = parseInt(process.env.MAX_BACKUPS  || '10',  10);  // keep last N
const SCHEDULE_MS   = parseInt(process.env.BACKUP_EVERY || '21600000'); // 6 hours

fs.mkdirSync(BACKUP_DIR, { recursive: true });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function listBackups() {
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .sort()
    .map(f => ({
      file: f,
      path: path.join(BACKUP_DIR, f),
      size: fs.statSync(path.join(BACKUP_DIR, f)).size,
      mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtime,
    }));
}

function rotateBackups() {
  const backups = listBackups();
  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(0, backups.length - MAX_BACKUPS);
    for (const b of toDelete) {
      fs.unlinkSync(b.path);
      console.log(`[backup] Deleted old backup: ${b.file}`);
    }
  }
}

// ─── Core backup ──────────────────────────────────────────────────────────────
async function backup() {
  const now       = new Date();
  const stamp     = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const destFile  = `attendance_${stamp}.db`;
  const destPath  = path.join(BACKUP_DIR, destFile);

  console.log(`[backup] Starting backup → ${destFile}`);
  const t0 = Date.now();

  // Use better-sqlite3's built-in hot backup (safe under concurrent reads/writes)
  const srcDb = new Database(DB_PATH, { readonly: true });
  await srcDb.backup(destPath);
  srcDb.close();

  const elapsed = Date.now() - t0;
  const size    = fs.statSync(destPath).size;

  console.log(`[backup] ✓ Done in ${elapsed}ms — ${formatBytes(size)} → ${destPath}`);

  rotateBackups();
  return destPath;
}

// ─── Restore ──────────────────────────────────────────────────────────────────
function restore(backupFile) {
  if (!fs.existsSync(backupFile)) {
    console.error(`[backup] File not found: ${backupFile}`);
    process.exit(1);
  }

  // Make a safety copy of current DB before overwriting
  const safetyStamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T','_').slice(0,19);
  const safetyPath  = path.join(BACKUP_DIR, `pre_restore_${safetyStamp}.db`);
  fs.copyFileSync(DB_PATH, safetyPath);
  console.log(`[backup] Safety copy saved → ${safetyPath}`);

  fs.copyFileSync(backupFile, DB_PATH);
  console.log(`[backup] ✓ Restored from ${backupFile}`);
}

// ─── Scheduled backups ────────────────────────────────────────────────────────
function startSchedule() {
  console.log(`[backup] Scheduled every ${SCHEDULE_MS / 3600000}h`);
  backup(); // immediate first run
  setInterval(backup, SCHEDULE_MS);
}

// ─── Export for programmatic use ──────────────────────────────────────────────
module.exports = { backup, restore, listBackups, startSchedule };

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--schedule')) {
    startSchedule();
  } else if (args.includes('--list')) {
    const backups = listBackups();
    if (!backups.length) { console.log('[backup] No backups found.'); process.exit(0); }
    console.log(`\n Backups in ${BACKUP_DIR}\n` + '─'.repeat(60));
    backups.forEach((b, i) => {
      console.log(` ${(i+1).toString().padStart(2)}. ${b.file}  ${formatBytes(b.size)}  ${b.mtime.toLocaleString()}`);
    });
    console.log('─'.repeat(60) + `\n Total: ${backups.length}\n`);
    process.exit(0);
  } else if (args.includes('--restore')) {
    const idx = args.indexOf('--restore');
    const file = args[idx + 1];
    if (!file) { console.error('Usage: node db/backup.js --restore <path>'); process.exit(1); }
    restore(file);
    process.exit(0);
  } else {
    backup().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
  }
}
