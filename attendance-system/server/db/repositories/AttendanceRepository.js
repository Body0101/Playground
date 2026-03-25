/**
 * db/repositories/AttendanceRepository.js
 */

'use strict';

class AttendanceRepository {
  constructor(db) {
    this.db = db;

    this._insert = db.prepare(`
      INSERT INTO attendance (session_id, student_id, rfid_uid, client_ip, user_agent, is_vpn, is_incognito)
      VALUES (@sessionId, @studentId, @rfidUid, @clientIp, @userAgent, @isVpn, @isIncognito)
    `);

    this._findBySessionAndStudent = db.prepare(
      'SELECT * FROM attendance WHERE session_id = ? AND student_id = ?'
    );

    this._listBySession = db.prepare(`
      SELECT a.*, u.name, u.student_id as sid, u.email, u.rfid_uid as card_uid
      FROM attendance a JOIN users u ON a.student_id = u.id
      WHERE a.session_id = ? ORDER BY a.check_in_time
    `);

    this._listByStudent = db.prepare(`
      SELECT a.check_in_time, a.is_vpn, a.is_incognito, s.date, s.section
      FROM attendance a JOIN sessions s ON a.session_id = s.id
      WHERE a.student_id = ? ORDER BY s.date DESC
    `);

    this._countBySession     = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE session_id = ?');
    this._countVpnBySession  = db.prepare('SELECT COUNT(*) as c FROM attendance WHERE session_id = ? AND is_vpn = 1');
    this._countIncogBySession= db.prepare('SELECT COUNT(*) as c FROM attendance WHERE session_id = ? AND is_incognito = 1');

    this._suspiciousBySession = db.prepare(`
      SELECT a.*, u.name, u.student_id as sid
      FROM attendance a JOIN users u ON a.student_id = u.id
      WHERE a.session_id = ? AND (a.is_vpn = 1 OR a.is_incognito = 1)
      ORDER BY a.check_in_time
    `);
  }

  /**
   * Register attendance. Throws on duplicate (UNIQUE constraint).
   * Returns the new row id.
   */
  register({ sessionId, studentId, rfidUid = null, clientIp = null, userAgent = null, isVpn = false, isIncognito = false }) {
    const result = this._insert.run({
      sessionId,
      studentId,
      rfidUid:    rfidUid   || null,
      clientIp:   clientIp  || null,
      userAgent:  userAgent || null,
      isVpn:      isVpn      ? 1 : 0,
      isIncognito: isIncognito ? 1 : 0,
    });
    return result.lastInsertRowid;
  }

  isRegistered(sessionId, studentId) {
    return !!this._findBySessionAndStudent.get(sessionId, studentId);
  }

  listBySession(sessionId)  { return this._listBySession.all(sessionId);  }
  listByStudent(studentId)  { return this._listByStudent.all(studentId);  }
  countBySession(sessionId) { return this._countBySession.get(sessionId).c; }
  suspiciousBySession(sessionId) { return this._suspiciousBySession.all(sessionId); }

  /**
   * Returns { present: [], absent: [] } for a given session.
   * `allStudents` = array of user rows to check against.
   */
  absenceReport(sessionId, allStudents) {
    const present = this._listBySession.all(sessionId);
    const presentIds = new Set(present.map(p => p.student_id));
    const absent = allStudents.filter(s => !presentIds.has(s.id));
    return { present, absent };
  }

  /**
   * Aggregate stats for one session.
   */
  sessionStats(sessionId) {
    return {
      present:   this._countBySession.get(sessionId).c,
      vpn:       this._countVpnBySession.get(sessionId).c,
      incognito: this._countIncogBySession.get(sessionId).c,
    };
  }

  /**
   * Attendance rate per student across all sessions in a section.
   */
  studentAttendanceRate(studentId) {
    const row = this.db.prepare(`
      SELECT
        COUNT(a.id)              AS attended,
        COUNT(DISTINCT s.id)     AS total_sessions
      FROM sessions s
      LEFT JOIN attendance a ON a.session_id = s.id AND a.student_id = ?
      WHERE s.section = (SELECT section FROM users WHERE id = ?)
    `).get(studentId, studentId);

    if (!row || !row.total_sessions) return { attended: 0, total: 0, rate: 0 };
    return {
      attended: row.attended,
      total:    row.total_sessions,
      rate:     Math.round((row.attended / row.total_sessions) * 100),
    };
  }
}

module.exports = AttendanceRepository;
