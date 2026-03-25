/**
 * db/repositories/UserRepository.js
 * ─────────────────────────────────────
 * All database operations for users + rfid_cards.
 */

'use strict';

class UserRepository {
  constructor(db) {
    this.db = db;

    /* ── Prepared statements ─────────────────────────── */
    this._findById    = db.prepare('SELECT * FROM users WHERE id = ?');
    this._findByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
    this._findByRfid  = db.prepare('SELECT * FROM users WHERE rfid_uid = ?');

    this._insert = db.prepare(`
      INSERT INTO users (name, email, password, role, student_id, section, rfid_uid)
      VALUES (@name, @email, @password, @role, @studentId, @section, @rfidUid)
    `);

    this._updateRfid = db.prepare('UPDATE users SET rfid_uid = ? WHERE id = ?');

    this._listByRole    = db.prepare('SELECT id,name,email,role,student_id,section,rfid_uid,created_at FROM users WHERE role = ?');
    this._listBySection = db.prepare('SELECT id,name,email,role,student_id,section,rfid_uid FROM users WHERE role = ? AND section = ?');

    this._setActive = db.prepare('UPDATE users SET is_active = ? WHERE id = ?');
    this._updateProfile = db.prepare(`
      UPDATE users SET name=@name, section=@section, student_id=@studentId WHERE id=@id
    `);

    // RFID cards
    this._rfidFindByUid  = db.prepare('SELECT * FROM rfid_cards WHERE uid = ?');
    this._rfidUpsert     = db.prepare(`
      INSERT INTO rfid_cards (uid, student_id, label)
      VALUES (@uid, @studentId, @label)
      ON CONFLICT(uid) DO UPDATE SET student_id=excluded.student_id, label=excluded.label
    `);
    this._rfidList       = db.prepare(`
      SELECT r.uid, r.label, r.registered_at, u.name, u.student_id as sid, u.id as user_id
      FROM rfid_cards r LEFT JOIN users u ON r.student_id = u.id
    `);
    this._rfidDelete     = db.prepare('DELETE FROM rfid_cards WHERE uid = ?');
  }

  // ─── READ ────────────────────────────────────────────────────────────────
  findById(id)       { return this._findById.get(id);      }
  findByEmail(email) { return this._findByEmail.get(email); }
  findByRfidUid(uid) { return this._findByRfid.get(uid);   }

  /**
   * Return a user without the password field.
   */
  publicById(id) {
    const u = this.findById(id);
    if (!u) return null;
    const { password: _, ...rest } = u;
    return rest;
  }

  listByRole(role)              { return this._listByRole.all(role);           }
  listBySection(section)        { return this._listBySection.all('student', section); }
  listStudents()                { return this.listByRole('student');            }

  countByRole(role) {
    return this.db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get(role).c;
  }

  // ─── WRITE ───────────────────────────────────────────────────────────────
  create({ name, email, password, role = 'student', studentId = null, section = null, rfidUid = null }) {
    const result = this._insert.run({ name, email, password, role, studentId, section, rfidUid });
    return result.lastInsertRowid;
  }

  updateProfile({ id, name, section, studentId }) {
    this._updateProfile.run({ id, name, section: section || null, studentId: studentId || null });
  }

  setActive(id, active) { this._setActive.run(active ? 1 : 0, id); }

  assignRfid(userId, uid) {
    this.db.transaction(() => {
      this._updateRfid.run(uid, userId);
      this._rfidUpsert.run({ uid, studentId: userId, label: null });
    })();
  }

  // ─── RFID CARDS ──────────────────────────────────────────────────────────
  rfidFindByUid(uid)     { return this._rfidFindByUid.get(uid); }
  rfidList()             { return this._rfidList.all();         }
  rfidUpsert({ uid, studentId, label }) {
    this._rfidUpsert.run({ uid, studentId: studentId || null, label: label || uid });
  }
  rfidDelete(uid)        { this._rfidDelete.run(uid); }
}

module.exports = UserRepository;
