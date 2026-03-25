/**
 * db/migrations/003_triggers.js
 * ─────────────────────────────────────
 * Triggers:
 *  • Auto-update `updated_at` on users table
 *  • Auto-end sessions when a new one starts for same TA
 *  • Prevent a student registering twice in same session (belt+suspenders)
 */

'use strict';

function up(db) {
  db.exec(`
    /* ── Auto-update updated_at on users ───────────────── */
    CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
    AFTER UPDATE ON users
    FOR EACH ROW
    BEGIN
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
    END;

    /* ── When a session is inserted, close prior active
         sessions of the same TA ──────────────────────── */
    CREATE TRIGGER IF NOT EXISTS trg_sessions_one_active
    AFTER INSERT ON sessions
    FOR EACH ROW
    BEGIN
      UPDATE sessions
      SET    active = 0, ended_at = CURRENT_TIMESTAMP
      WHERE  ta_id  = NEW.ta_id
        AND  active = 1
        AND  id    != NEW.id;
    END;

    /* ── Record ended_at when session is deactivated ───── */
    CREATE TRIGGER IF NOT EXISTS trg_sessions_ended_at
    AFTER UPDATE OF active ON sessions
    FOR EACH ROW
    WHEN NEW.active = 0 AND OLD.active = 1
    BEGIN
      UPDATE sessions
      SET ended_at = CURRENT_TIMESTAMP
      WHERE id = NEW.id AND ended_at IS NULL;
    END;
  `);
}

function down(db) {
  db.exec(`
    DROP TRIGGER IF EXISTS trg_users_updated_at;
    DROP TRIGGER IF EXISTS trg_sessions_one_active;
    DROP TRIGGER IF EXISTS trg_sessions_ended_at;
  `);
}

module.exports = { up, down };
