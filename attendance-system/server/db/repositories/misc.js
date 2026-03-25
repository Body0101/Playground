/**
 * db/repositories/HandRepository.js
 * db/repositories/ComplaintRepository.js
 * db/repositories/AuditRepository.js
 * ────────────────────────────────────────
 * Exported individually at the bottom.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  HandRepository  (raised_hands)
// ═══════════════════════════════════════════════════════════════
class HandRepository {
  constructor(db) {
    this.db = db;

    this._findPending     = db.prepare(
      'SELECT * FROM raised_hands WHERE session_id = ? AND student_id = ? AND responded = 0 LIMIT 1'
    );
    this._insert          = db.prepare(
      'INSERT INTO raised_hands (session_id, student_id) VALUES (?,?)'
    );
    this._delete          = db.prepare('DELETE FROM raised_hands WHERE id = ?');
    this._respond         = db.prepare(
      'UPDATE raised_hands SET responded = 1, bonus = @bonus, penalty = @penalty, ta_note = @note WHERE id = @id'
    );
    this._countPending    = db.prepare(
      'SELECT COUNT(*) as c FROM raised_hands WHERE session_id = ? AND responded = 0'
    );
    this._listPending     = db.prepare(`
      SELECT rh.id, rh.raised_at, rh.bonus, rh.penalty, u.name, u.student_id as sid, u.id as user_id
      FROM raised_hands rh JOIN users u ON rh.student_id = u.id
      WHERE rh.session_id = ? AND rh.responded = 0
      ORDER BY rh.raised_at
    `);
    this._findById        = db.prepare('SELECT * FROM raised_hands WHERE id = ?');

    this._gradesBySession = db.prepare(`
      SELECT u.name, u.student_id as sid,
        SUM(rh.bonus)   as total_bonus,
        SUM(rh.penalty) as total_penalty,
        COUNT(rh.id)    as total_raises
      FROM raised_hands rh JOIN users u ON rh.student_id = u.id
      WHERE rh.session_id = ?
      GROUP BY rh.student_id
    `);
  }

  findPending(sessionId, studentId) { return this._findPending.get(sessionId, studentId); }
  findById(id)                      { return this._findById.get(id);                      }
  listPending(sessionId)            { return this._listPending.all(sessionId);            }
  countPending(sessionId)           { return this._countPending.get(sessionId).c;         }
  gradesBySession(sessionId)        { return this._gradesBySession.all(sessionId);        }

  /** Toggle raise / lower hand. Returns { raised, count }. */
  toggle(sessionId, studentId) {
    const existing = this.findPending(sessionId, studentId);
    if (existing) {
      this._delete.run(existing.id);
    } else {
      this._insert.run(sessionId, studentId);
    }
    const count = this.countPending(sessionId);
    return { raised: !existing, count };
  }

  respond({ id, action, amount = 1, note = null }) {
    const bonus   = action === 'bonus'   ? amount : 0;
    const penalty = action === 'penalty' ? amount : 0;
    this._respond.run({ id, bonus, penalty, note });
  }
}

// ═══════════════════════════════════════════════════════════════
//  ComplaintRepository  (complaints)
// ═══════════════════════════════════════════════════════════════
class ComplaintRepository {
  constructor(db) {
    this.db = db;

    this._insert   = db.prepare(
      'INSERT INTO complaints (student_id, session_id, content) VALUES (@studentId, @sessionId, @content)'
    );
    this._listAll  = db.prepare(`
      SELECT c.*, u.name as student_name, u.student_id as sid
      FROM complaints c JOIN users u ON c.student_id = u.id
      ORDER BY c.created_at DESC
    `);
    this._listUnread = db.prepare(`
      SELECT c.*, u.name as student_name
      FROM complaints c JOIN users u ON c.student_id = u.id
      WHERE c.is_read = 0 ORDER BY c.created_at DESC
    `);
    this._markRead = db.prepare('UPDATE complaints SET is_read = 1 WHERE id = ?');
    this._reply    = db.prepare('UPDATE complaints SET ta_reply = ? WHERE id = ?');
    this._countUnread = db.prepare('SELECT COUNT(*) as c FROM complaints WHERE is_read = 0');
  }

  create({ studentId, sessionId = null, content }) {
    const res = this._insert.run({ studentId, sessionId, content });
    return res.lastInsertRowid;
  }

  listAll()           { return this._listAll.all();     }
  listUnread()        { return this._listUnread.all();  }
  countUnread()       { return this._countUnread.get().c; }
  markRead(id)        { this._markRead.run(id);         }
  reply(id, text)     { this._reply.run(text, id);      }
}

// ═══════════════════════════════════════════════════════════════
//  AuditRepository  (audit_log)
// ═══════════════════════════════════════════════════════════════
class AuditRepository {
  constructor(db) {
    this.db = db;

    this._insert = db.prepare(`
      INSERT INTO audit_log (user_id, action, entity, entity_id, meta, ip)
      VALUES (@userId, @action, @entity, @entityId, @meta, @ip)
    `);
    this._list = db.prepare(`
      SELECT al.*, u.name as user_name
      FROM audit_log al LEFT JOIN users u ON al.user_id = u.id
      ORDER BY al.created_at DESC LIMIT ?
    `);
    this._listByUser = db.prepare(
      'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    );
  }

  log({ userId = null, action, entity = null, entityId = null, meta = null, ip = null }) {
    this._insert.run({
      userId,
      action,
      entity:   entity   || null,
      entityId: entityId || null,
      meta:     meta ? JSON.stringify(meta) : null,
      ip:       ip   || null,
    });
  }

  list(limit = 100)         { return this._list.all(limit);         }
  listByUser(userId, limit = 50) { return this._listByUser.all(userId, limit); }
}

module.exports = { HandRepository, ComplaintRepository, AuditRepository };
