/**
 * db/repositories/SessionRepository.js
 */

'use strict';

class SessionRepository {
  constructor(db) {
    this.db = db;

    this._findById    = db.prepare('SELECT * FROM sessions WHERE id = ?');
    this._findActive  = db.prepare(`
      SELECT s.*, u.name as ta_name
      FROM sessions s JOIN users u ON s.ta_id = u.id
      WHERE s.active = 1 ORDER BY s.date DESC LIMIT 1
    `);

    this._insert      = db.prepare(
      'INSERT INTO sessions (ta_id, section) VALUES (@taId, @section)'
    );

    this._endAll      = db.prepare(`
      UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP
      WHERE ta_id = ? AND active = 1
    `);
    this._endById     = db.prepare(`
      UPDATE sessions SET active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?
    `);

    this._listByTa    = db.prepare(`
      SELECT
        s.*,
        (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id)               AS present_count,
        (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.is_vpn=1) AS vpn_count,
        (SELECT COUNT(*) FROM attendance a WHERE a.session_id = s.id AND a.is_incognito=1) AS incognito_count
      FROM sessions s
      WHERE s.ta_id = ?
      ORDER BY s.date DESC
    `);

    this._countActive = db.prepare('SELECT COUNT(*) as c FROM sessions WHERE active = 1');
  }

  findById(id)  { return this._findById.get(id);   }
  findActive()  { return this._findActive.get();   }
  listByTa(taId){ return this._listByTa.all(taId); }
  countActive() { return this._countActive.get().c;}

  start({ taId, section }) {
    const result = this._insert.run({ taId, section: section || null });
    return this.findById(result.lastInsertRowid);
  }

  endAllForTa(taId) { this._endAll.run(taId);  }
  endById(id)       { this._endById.run(id);   }

  /**
   * Duration of a session in minutes (null if still active).
   */
  durationMinutes(sessionId) {
    const row = this.db.prepare(`
      SELECT CAST((julianday(COALESCE(ended_at, CURRENT_TIMESTAMP)) - julianday(date)) * 1440 AS INTEGER) as dur
      FROM sessions WHERE id = ?
    `).get(sessionId);
    return row?.dur ?? null;
  }
}

module.exports = SessionRepository;
