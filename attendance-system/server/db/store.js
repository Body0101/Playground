/**
 * db/store.js
 * ─────────────────────────────────────────────
 * Single entry point that:
 *  1. Opens the DB connection
 *  2. Runs pending migrations automatically
 *  3. Instantiates all repositories
 *  4. Exports them as a unified `store` object
 *
 * Usage in server.js:
 *   const store = require('./db/store');
 *   const user  = store.users.findByEmail('...');
 * ─────────────────────────────────────────────
 */

'use strict';

const { db }               = require('./index');
const { migrate }          = require('./migrate');
const UserRepository       = require('./repositories/UserRepository');
const SessionRepository    = require('./repositories/SessionRepository');
const AttendanceRepository = require('./repositories/AttendanceRepository');
const QuizRepository       = require('./repositories/QuizRepository');
const { HandRepository, ComplaintRepository, AuditRepository } = require('./repositories/misc');

// ─── Run migrations on startup ────────────────────────────────────────────────
migrate();

// ─── Instantiate repositories ─────────────────────────────────────────────────
const store = {
  db,                                           // raw db handle (escape hatch)
  users:       new UserRepository(db),
  sessions:    new SessionRepository(db),
  attendance:  new AttendanceRepository(db),
  quizzes:     new QuizRepository(db),
  hands:       new HandRepository(db),
  complaints:  new ComplaintRepository(db),
  audit:       new AuditRepository(db),

  /**
   * Convenience: wrap arbitrary operations in a transaction.
   *
   * Example:
   *   store.transaction(() => {
   *     store.sessions.endAllForTa(taId);
   *     const s = store.sessions.start({ taId, section });
   *     store.audit.log({ userId: taId, action: 'session_start', entityId: s.id });
   *   });
   */
  transaction(fn) {
    return db.transaction(fn)();
  },
};

module.exports = store;
