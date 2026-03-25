/**
 * db/migrations/002_indexes.js
 * ─────────────────────────────────────
 * Performance indexes on all hot-path columns.
 */

'use strict';

function up(db) {
  db.exec(`
    /* ── users ────────────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_rfid     ON users(rfid_uid);
    CREATE INDEX IF NOT EXISTS idx_users_section  ON users(section);

    /* ── sessions ─────────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_sessions_ta     ON sessions(ta_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(active);
    CREATE INDEX IF NOT EXISTS idx_sessions_date   ON sessions(date);

    /* ── attendance ───────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_att_session   ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_att_student   ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_att_time      ON attendance(check_in_time);
    CREATE INDEX IF NOT EXISTS idx_att_vpn       ON attendance(is_vpn);
    CREATE INDEX IF NOT EXISTS idx_att_incog     ON attendance(is_incognito);

    /* ── raised_hands ─────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_rh_session    ON raised_hands(session_id);
    CREATE INDEX IF NOT EXISTS idx_rh_student    ON raised_hands(student_id);
    CREATE INDEX IF NOT EXISTS idx_rh_responded  ON raised_hands(responded);

    /* ── rfid_cards ───────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_rfid_student  ON rfid_cards(student_id);

    /* ── quizzes ──────────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_quiz_ta       ON quizzes(ta_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_active   ON quizzes(active);
    CREATE INDEX IF NOT EXISTS idx_quiz_session  ON quizzes(session_id);

    /* ── quiz_questions ───────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_qq_quiz       ON quiz_questions(quiz_id);

    /* ── quiz_answers ─────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_qa_quiz       ON quiz_answers(quiz_id);
    CREATE INDEX IF NOT EXISTS idx_qa_student    ON quiz_answers(student_id);
    CREATE INDEX IF NOT EXISTS idx_qa_question   ON quiz_answers(question_id);

    /* ── complaints ───────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_comp_student  ON complaints(student_id);
    CREATE INDEX IF NOT EXISTS idx_comp_read     ON complaints(is_read);
    CREATE INDEX IF NOT EXISTS idx_comp_session  ON complaints(session_id);

    /* ── audit_log ────────────────────────────────────── */
    CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_time    ON audit_log(created_at);
  `);
}

function down(db) {
  const indexes = [
    'idx_users_email','idx_users_role','idx_users_rfid','idx_users_section',
    'idx_sessions_ta','idx_sessions_active','idx_sessions_date',
    'idx_att_session','idx_att_student','idx_att_time','idx_att_vpn','idx_att_incog',
    'idx_rh_session','idx_rh_student','idx_rh_responded',
    'idx_rfid_student',
    'idx_quiz_ta','idx_quiz_active','idx_quiz_session',
    'idx_qq_quiz',
    'idx_qa_quiz','idx_qa_student','idx_qa_question',
    'idx_comp_student','idx_comp_read','idx_comp_session',
    'idx_audit_user','idx_audit_action','idx_audit_time',
  ];
  for (const idx of indexes) db.exec(`DROP INDEX IF EXISTS ${idx};`);
}

module.exports = { up, down };
