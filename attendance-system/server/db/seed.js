/**
 * db/seed.js
 * ─────────────────────────────────────────────
 * Populate the database with realistic sample data
 * for development and testing.
 *
 * ⚠️  NEVER run in production — it wipes existing data first.
 *
 * Usage:
 *   node db/seed.js
 *   NODE_ENV=development node db/seed.js
 * ─────────────────────────────────────────────
 */

'use strict';

if (process.env.NODE_ENV === 'production') {
  console.error('[seed] Refused: NODE_ENV=production');
  process.exit(1);
}

const bcrypt = require('bcryptjs');
const store  = require('./store');
const { db } = require('./index');

// ─── Wipe ─────────────────────────────────────────────────────────────────────
console.log('[seed] Wiping existing data...');
db.exec(`
  DELETE FROM audit_log;
  DELETE FROM feedback;
  DELETE FROM complaints;
  DELETE FROM quiz_answers;
  DELETE FROM quiz_questions;
  DELETE FROM quizzes;
  DELETE FROM rfid_cards;
  DELETE FROM raised_hands;
  DELETE FROM attendance;
  DELETE FROM sessions;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;      -- reset AUTOINCREMENT counters
`);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const HASH = bcrypt.hashSync('password123', 10);  // all seed accounts use same password

// ─── Users ────────────────────────────────────────────────────────────────────
console.log('[seed] Creating users...');

const adminId = store.users.create({
  name: 'Admin النظام', email: 'admin@university.edu', password: HASH,
  role: 'admin', studentId: null, section: null, rfidUid: null,
});

const ta1Id = store.users.create({
  name: 'د. محمد السيد', email: 'ta1@university.edu', password: HASH,
  role: 'ta', studentId: null, section: null, rfidUid: null,
});

const ta2Id = store.users.create({
  name: 'أ. سارة أحمد', email: 'ta2@university.edu', password: HASH,
  role: 'ta', studentId: null, section: null, rfidUid: null,
});

const students = [
  { name: 'أحمد محمود',    email: 's001@university.edu', sid: '20210001', section: 'A1', rfid: 'AABB1122' },
  { name: 'فاطمة علي',     email: 's002@university.edu', sid: '20210002', section: 'A1', rfid: 'AABB3344' },
  { name: 'عمر خالد',      email: 's003@university.edu', sid: '20210003', section: 'A1', rfid: 'AABB5566' },
  { name: 'نور الهدى',     email: 's004@university.edu', sid: '20210004', section: 'A1', rfid: 'AABB7788' },
  { name: 'كريم حسن',      email: 's005@university.edu', sid: '20210005', section: 'A1', rfid: 'AABB99AA' },
  { name: 'ياسمين مصطفى', email: 's006@university.edu', sid: '20210006', section: 'A1', rfid: null       },
  { name: 'عبدالله رمضان', email: 's007@university.edu', sid: '20210007', section: 'B2', rfid: 'BBCC1122' },
  { name: 'مريم الشافعي',  email: 's008@university.edu', sid: '20210008', section: 'B2', rfid: 'BBCC3344' },
];

const studentIds = students.map(s =>
  store.users.create({
    name: s.name, email: s.email, password: HASH,
    role: 'student', studentId: s.sid, section: s.section, rfidUid: s.rfid,
  })
);

// Register RFID cards
students.forEach((s, i) => {
  if (s.rfid) {
    store.users.rfidUpsert({ uid: s.rfid, studentId: studentIds[i], label: s.name });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────
console.log('[seed] Creating sessions...');

// Past session 1 (closed)
const sess1 = store.sessions.start({ taId: ta1Id, section: 'A1' });
store.sessions.endById(sess1.id);

// Past session 2 (closed)
const sess2 = store.sessions.start({ taId: ta1Id, section: 'A1' });

// Attendance for sess1: students 0-3 attended
[0,1,2,3].forEach(i => {
  store.attendance.register({
    sessionId: sess1.id, studentId: studentIds[i],
    clientIp: `192.168.1.${10+i}`, isVpn: false, isIncognito: false,
  });
});

// Attendance for sess2: students 0-4, one with VPN
[0,1,2,3,4].forEach(i => {
  store.attendance.register({
    sessionId: sess2.id, studentId: studentIds[i],
    clientIp: `192.168.1.${10+i}`,
    isVpn: i === 4, isIncognito: false,
  });
});
store.sessions.endById(sess2.id);

// Active session
const activeSess = store.sessions.start({ taId: ta1Id, section: 'A1' });

// One student already checked in
store.attendance.register({
  sessionId: activeSess.id, studentId: studentIds[0],
  clientIp: '192.168.1.10', isVpn: false, isIncognito: false,
});

// ─── Raised hands ─────────────────────────────────────────────────────────────
console.log('[seed] Adding raised hands...');
store.hands.toggle(activeSess.id, studentIds[1]);
store.hands.toggle(activeSess.id, studentIds[2]);

// ─── Quiz ─────────────────────────────────────────────────────────────────────
console.log('[seed] Creating quiz...');
const quizId = store.quizzes.create({
  taId: ta1Id, sessionId: activeSess.id,
  title: 'كويز الوحدة الأولى — البرمجة الكائنية',
  questions: [
    { question: 'ما هو مفهوم التغليف (Encapsulation)؟',
      a: 'إخفاء التفاصيل الداخلية', b: 'الوراثة بين الكلاسات',
      c: 'تعدد الأشكال', d: 'التجريد', correct: 'A' },
    { question: 'أي من التالي يمثل تعدد الأشكال (Polymorphism)؟',
      a: 'class B extends A', b: 'private int x',
      c: 'method overriding', d: 'interface', correct: 'C' },
    { question: 'ما الفرق بين interface و abstract class؟',
      a: 'لا يوجد فرق', b: 'interface لا تحتوي تنفيذاً',
      c: 'abstract class لا يمكن توارثها', d: 'interface تحتوي constructors', correct: 'B' },
  ],
});

// Submit answers for student 0
store.quizzes.submitAnswers({
  quizId, studentId: studentIds[0],
  answers: { 1: 'A', 2: 'C', 3: 'B' },
});

// ─── Complaints ───────────────────────────────────────────────────────────────
console.log('[seed] Adding complaints...');
store.complaints.create({
  studentId: studentIds[1], sessionId: activeSess.id,
  content: 'الصوت في القاعة منخفض جداً ولا نسمع الشرح بوضوح.',
});
store.complaints.create({
  studentId: studentIds[3], sessionId: activeSess.id,
  content: 'يرجى إعادة شرح جزء التعدد الشكلي مرة أخرى.',
});

// ─── Feedback ─────────────────────────────────────────────────────────────────
db.prepare('INSERT INTO feedback (ta_id, content, rating) VALUES (?,?,?)').run(
  ta1Id, 'النظام ممتاز! فقط أتمنى إضافة خاصية تصدير كشف الحضور لـ Excel.', 5
);

// ─── Audit log ────────────────────────────────────────────────────────────────
store.audit.log({ userId: ta1Id, action: 'session_start', entity: 'sessions', entityId: activeSess.id });
store.audit.log({ userId: studentIds[0], action: 'attendance_register', entity: 'attendance', entityId: 1 });

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log('\n[seed] ✓ Done!\n');
console.log('─'.repeat(50));
console.log(' Accounts (password: password123)');
console.log('─'.repeat(50));
console.log(` Admin   : admin@university.edu`);
console.log(` TA 1    : ta1@university.edu`);
console.log(` TA 2    : ta2@university.edu`);
students.forEach(s => console.log(` Student : ${s.email} (${s.name})`));
console.log('─'.repeat(50));
console.log(` Active session ID: ${activeSess.id}  (section A1, TA: ta1)`);
console.log(` Active quiz ID:    ${quizId}`);
console.log('─'.repeat(50) + '\n');

process.exit(0);
