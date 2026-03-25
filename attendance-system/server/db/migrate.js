/**
 * db/migrate.js
 * ─────────────────────────────────────────────
 * Versioned migration runner.
 *
 * • Reads migration files from db/migrations/*.js
 * • Tracks applied migrations in `schema_migrations` table
 * • Each migration runs inside a single transaction
 * • Supports both `up` (apply) and `down` (rollback) functions
 *
 * Usage:
 *   node db/migrate.js          → apply all pending
 *   node db/migrate.js rollback → rollback last batch
 *   node db/migrate.js status   → print migration status
 * ─────────────────────────────────────────────
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { db } = require('./index');

// ─── Bootstrap tracking table ─────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    version    TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    batch      INTEGER NOT NULL DEFAULT 1,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMigrationFiles() {
  const dir = path.join(__dirname, 'migrations');
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.js'))
    .sort()  // lexicographic = chronological if named NNN_name.js
    .map(f => ({
      file:    f,
      version: f.replace('.js', ''),
      name:    f.replace(/^\d+_/, '').replace('.js', '').replace(/_/g, ' '),
      module:  require(path.join(dir, f)),
    }));
}

function getApplied() {
  return new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
  );
}

function getLastBatch() {
  const row = db.prepare('SELECT MAX(batch) as b FROM schema_migrations').get();
  return row?.b || 0;
}

// ─── Apply pending migrations ─────────────────────────────────────────────────
function migrate() {
  const files   = getMigrationFiles();
  const applied = getApplied();
  const pending = files.filter(f => !applied.has(f.version));

  if (!pending.length) {
    console.log('[migrate] Nothing to migrate — database is up to date.');
    return;
  }

  const batch = getLastBatch() + 1;
  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, batch) VALUES (?,?,?)'
  );

  for (const migration of pending) {
    console.log(`[migrate] Applying ${migration.version} — "${migration.name}"`);
    const run = db.transaction(() => {
      migration.module.up(db);
      insert.run(migration.version, migration.name, batch);
    });
    try {
      run();
      console.log(`[migrate] ✓ Applied ${migration.version}`);
    } catch (err) {
      console.error(`[migrate] ✗ Failed on ${migration.version}:`, err.message);
      process.exit(1);
    }
  }

  console.log(`[migrate] Done — ${pending.length} migration(s) applied (batch ${batch}).`);
}

// ─── Rollback last batch ──────────────────────────────────────────────────────
function rollback() {
  const batch = getLastBatch();
  if (!batch) { console.log('[migrate] Nothing to rollback.'); return; }

  const toRollback = db.prepare(
    'SELECT * FROM schema_migrations WHERE batch = ? ORDER BY id DESC'
  ).all(batch);

  const del = db.prepare('DELETE FROM schema_migrations WHERE version = ?');

  for (const row of toRollback) {
    const filePath = path.join(__dirname, 'migrations', `${row.version}.js`);
    if (!fs.existsSync(filePath)) {
      console.warn(`[migrate] File not found for rollback: ${row.version}`);
      continue;
    }
    const mod = require(filePath);
    if (typeof mod.down !== 'function') {
      console.warn(`[migrate] No down() for ${row.version}, skipping.`);
      continue;
    }
    console.log(`[migrate] Rolling back ${row.version}`);
    const run = db.transaction(() => { mod.down(db); del.run(row.version); });
    try {
      run();
      console.log(`[migrate] ✓ Rolled back ${row.version}`);
    } catch (err) {
      console.error(`[migrate] ✗ Rollback failed on ${row.version}:`, err.message);
      process.exit(1);
    }
  }

  console.log(`[migrate] Batch ${batch} rolled back.`);
}

// ─── Status report ────────────────────────────────────────────────────────────
function status() {
  const files   = getMigrationFiles();
  const applied = getApplied();

  console.log('\n Migration Status\n' + '─'.repeat(50));
  if (!files.length) { console.log(' No migration files found.'); return; }

  for (const f of files) {
    const tick = applied.has(f.version) ? '✓' : '○';
    console.log(` ${tick}  ${f.version}  —  ${f.name}`);
  }
  console.log('─'.repeat(50) + '\n');
}

// ─── CLI ──────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const cmd = process.argv[2] || 'up';
  if      (cmd === 'up'       || cmd === 'migrate')  migrate();
  else if (cmd === 'rollback' || cmd === 'down')     rollback();
  else if (cmd === 'status')                         status();
  else {
    console.error(`Unknown command: ${cmd}`);
    console.log('Usage: node db/migrate.js [up|rollback|status]');
    process.exit(1);
  }
  process.exit(0);
}

module.exports = { migrate, rollback, status };
