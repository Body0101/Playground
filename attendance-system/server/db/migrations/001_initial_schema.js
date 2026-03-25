/**
 * db/migrations/001_initial_schema.js
 * ─────────────────────────────────────
 * Initial schema: all core tables.
 */

'use strict';

// ─── UP ───────────────────────────────────────────────────────────────────────
function up(db) {
  db.exec(`
    /* ── Users ─────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      email       TEXT    UNIQUE NOT NULL,
      password    TEXT    NOT NULL,
      role        TEXT    NOT NULL DEFAULT 'student'
                          CHECK(role IN ('student','ta','admin')),
      student_id  TEXT,
      section     TEXT,
      rfid_uid    TEXT    UNIQUE,
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* ── Sessions ───────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      ta_id       INTEGER NOT NULL,
      section     TEXT,
      date        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ended_at    DATETIME,
      active      INTEGER  NOT NULL DEFAULT 1,
      FOREIGN KEY (ta_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ── Attendance ─────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS attendance (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id     INTEGER NOT NULL,
      student_id     INTEGER NOT NULL,
      rfid_uid       TEXT,
      check_in_time  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      client_ip      TEXT,
      user_agent     TEXT,
      is_vpn         INTEGER  NOT NULL DEFAULT 0,
      is_incognito   INTEGER  NOT NULL DEFAULT 0,
      UNIQUE(session_id, student_id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)  ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id)     ON DELETE CASCADE
    );

    /* ── Raised Hands ───────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS raised_hands (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id   INTEGER NOT NULL,
      student_id   INTEGER NOT NULL,
      raised_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded    INTEGER  NOT NULL DEFAULT 0,
      bonus        REAL     NOT NULL DEFAULT 0,
      penalty      REAL     NOT NULL DEFAULT 0,
      ta_note      TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id)  ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id)     ON DELETE CASCADE
    );

    /* ── RFID Cards ─────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS rfid_cards (
      uid         TEXT    PRIMARY KEY,
      student_id  INTEGER,
      label       TEXT,
      registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE SET NULL
    );

    /* ── Quizzes ────────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS quizzes (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      ta_id        INTEGER NOT NULL,
      session_id   INTEGER,
      title        TEXT    NOT NULL,
      active       INTEGER  NOT NULL DEFAULT 0,
      time_limit   INTEGER,          -- seconds, NULL = no limit
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ta_id)      REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    /* ── Quiz Questions ─────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id        INTEGER NOT NULL,
      question       TEXT    NOT NULL,
      option_a       TEXT    NOT NULL,
      option_b       TEXT    NOT NULL,
      option_c       TEXT,
      option_d       TEXT,
      correct_answer TEXT    NOT NULL CHECK(correct_answer IN ('A','B','C','D')),
      order_num      INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
    );

    /* ── Quiz Answers ───────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS quiz_answers (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      quiz_id      INTEGER NOT NULL,
      question_id  INTEGER NOT NULL,
      student_id   INTEGER NOT NULL,
      answer       TEXT,
      is_correct   INTEGER  NOT NULL DEFAULT 0,
      submitted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(question_id, student_id),
      FOREIGN KEY (quiz_id)    REFERENCES quizzes(id)        ON DELETE CASCADE,
      FOREIGN KEY (question_id)REFERENCES quiz_questions(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id)          ON DELETE CASCADE
    );

    /* ── Complaints ─────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS complaints (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      session_id INTEGER,
      content    TEXT    NOT NULL,
      is_read    INTEGER  NOT NULL DEFAULT 0,
      ta_reply   TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (student_id) REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    /* ── Feedback (TA → Developer) ──────────────────────────── */
    CREATE TABLE IF NOT EXISTS feedback (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      ta_id      INTEGER NOT NULL,
      content    TEXT    NOT NULL,
      rating     INTEGER CHECK(rating BETWEEN 1 AND 5),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ta_id) REFERENCES users(id) ON DELETE CASCADE
    );

    /* ── Audit Log ──────────────────────────────────────────── */
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER,
      action     TEXT    NOT NULL,
      entity     TEXT,
      entity_id  INTEGER,
      meta       TEXT,            -- JSON blob
      ip         TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);
}

// ─── DOWN ─────────────────────────────────────────────────────────────────────
function down(db) {
  db.exec(`
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS feedback;
    DROP TABLE IF EXISTS complaints;
    DROP TABLE IF EXISTS quiz_answers;
    DROP TABLE IF EXISTS quiz_questions;
    DROP TABLE IF EXISTS quizzes;
    DROP TABLE IF EXISTS rfid_cards;
    DROP TABLE IF EXISTS raised_hands;
    DROP TABLE IF EXISTS attendance;
    DROP TABLE IF EXISTS sessions;
    DROP TABLE IF EXISTS users;
  `);
}

module.exports = { up, down };
