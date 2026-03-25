/**
 * ╔═══════════════════════════════════════════════╗
 * ║        Smart Attendance System v2.0           ║
 * ║    ESP32 + RFID + HC-SR501 + Web App          ║
 * ╚═══════════════════════════════════════════════╝
 *
 * Run:    npm start
 * Dev:    npm run dev
 * Setup:  npm run setup
 */

'use strict';

// ── Load .env FIRST before anything else ──────────────────────────────────────
require('dotenv').config();

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const path       = require('path');
const os         = require('os');
const cors       = require('cors');
const http       = require('http');
const { Server } = require('socket.io');
const QRCode     = require('qrcode');

// ── DB Store — runs migrations automatically ───────────────────────────────────
const store = require('./db/store');

// ── Optional scheduled backup ─────────────────────────────────────────────────
if (process.env.AUTO_BACKUP === 'true') {
  require('./db/backup').startSchedule();
}

// ── Express + Socket.io ────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST','PATCH','DELETE'] },
  pingTimeout:  60000,
  pingInterval: 25000,
});

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  console.warn('\n⚠️  JWT_SECRET not set — using insecure default. Set it in .env!\n');
  return 'INSECURE_DEFAULT_CHANGE_IN_PRODUCTION';
})();

const PORT = parseInt(process.env.PORT || '3000', 10);

// ══════════════════════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ══════════════════════════════════════════════════════════════════════════════
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Simple request logger in dev
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api')) console.log(`[${req.method}] ${req.path}`);
    next();
  });
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

function only(...roles) {
  return (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: 'Access denied' });
}

function ip(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress
      || '?';
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEVICE STATE  (ESP32 reports here)
// ══════════════════════════════════════════════════════════════════════════════
let deviceState = {
  active:         false,
  activationTime: null,
  deviceIp:       null,
  lastSeen:       null,
};

// ══════════════════════════════════════════════════════════════════════════════
//  HEALTH  (used by setup script + monitoring)
// ══════════════════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => {
  res.json({
    status:   'ok',
    uptime:   process.uptime(),
    version:  '2.0.0',
    device:   deviceState.active,
    session:  !!(store.sessions.findActive()),
    time:     new Date().toISOString(),
  });
});

// QR code image for the current server URL
app.get('/qr', async (req, res) => {
  const baseUrl = `http://${getLocalIp()}:${PORT}`;
  try {
    const png = await QRCode.toBuffer(baseUrl, { width: 300, margin: 2 });
    res.set('Content-Type', 'image/png');
    res.send(png);
  } catch {
    res.status(500).send('QR error');
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role, studentId, section, rfidUid } = req.body;

    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'الاسم والإيميل وكلمة المرور مطلوبة' });

    if (password.length < 6)
      return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });

    // College email check
    const emailL        = email.toLowerCase().trim();
    const collegeDomain = ['.edu', '.ac.', 'university', 'univ', 'college', 'institute'];
    if (!collegeDomain.some(d => emailL.includes(d)))
      return res.status(400).json({ error: 'يجب استخدام إيميل الكلية فقط (.edu / .ac)' });

    const hashed   = await bcrypt.hash(password, 10);
    const safeRole = ['student','ta','admin'].includes(role) ? role : 'student';

    const userId = store.users.create({
      name: name.trim(), email: emailL, password: hashed,
      role: safeRole,
      studentId: studentId?.trim() || null,
      section:   section?.trim()   || null,
      rfidUid:   rfidUid?.trim()   || null,
    });

    if (rfidUid?.trim()) {
      store.users.rfidUpsert({ uid: rfidUid.trim(), studentId: userId, label: name.trim() });
    }

    store.audit.log({ userId, action: 'register', entity: 'users', entityId: userId, ip: ip(req) });

    const token = jwt.sign({ id: userId, name: name.trim(), email: emailL, role: safeRole }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: userId, name: name.trim(), email: emailL, role: safeRole } });

  } catch (err) {
    if (err.message?.includes('UNIQUE'))
      return res.status(409).json({ error: 'هذا الإيميل مسجل بالفعل' });
    console.error('[register]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'الإيميل وكلمة المرور مطلوبة' });

    const user = store.users.findByEmail(email.toLowerCase().trim());
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });

    if (!user.is_active)
      return res.status(403).json({ error: 'الحساب موقوف. تواصل مع الإدارة' });

    store.audit.log({ userId: user.id, action: 'login', ip: ip(req) });

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET, { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });

  } catch (err) {
    console.error('[login]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/me', auth, (req, res) => {
  const user = store.users.publicById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ══════════════════════════════════════════════════════════════════════════════
//  ESP32 DEVICE  (no auth — internal LAN only)
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/rfid-scan', (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: 'No UID' });

  const uidUpper = uid.toUpperCase();
  const user = store.users.findByRfidUid(uidUpper);

  if (!user) {
    const card    = store.users.rfidFindByUid(uidUpper);
    const payload = { found: false, uid: uidUpper, label: card?.label || uidUpper };
    io.emit('rfid_scan', payload);
    return res.json(payload);
  }

  const activeSession = store.sessions.findActive();
  const registered    = activeSession
    ? store.attendance.isRegistered(activeSession.id, user.id)
    : false;

  const payload = {
    found: true, uid: uidUpper,
    name: user.name, studentId: user.student_id, section: user.section,
    registered,
  };
  io.emit('rfid_scan', payload);
  res.json(payload);
});

app.post('/api/device-event', (req, res) => {
  const { event, deviceIp } = req.body;

  deviceState.lastSeen = new Date().toISOString();
  deviceState.deviceIp = deviceIp || ip(req);

  if (event === 'motion_detected') {
    deviceState.active         = true;
    deviceState.activationTime = new Date().toISOString();
    io.emit('device_activated', deviceState);
    console.log('[ESP32] 🔴 Motion detected from', deviceState.deviceIp);

  } else if (event === 'session_timeout') {
    deviceState.active = false;
    io.emit('device_timeout', deviceState);
    console.log('[ESP32] ⚪ Session window closed');

  } else if (event === 'heartbeat') {
    io.emit('device_heartbeat', deviceState);
  }

  res.json({ ok: true, serverTime: new Date().toISOString() });
});

app.get('/api/device-state', auth, (_req, res) => res.json(deviceState));

// ══════════════════════════════════════════════════════════════════════════════
//  SESSIONS
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/sessions/start', auth, only('ta','admin'), (req, res) => {
  const { section } = req.body;
  try {
    const session = store.transaction(() => {
      store.sessions.endAllForTa(req.user.id);
      const s = store.sessions.start({ taId: req.user.id, section: section?.trim() || null });
      store.audit.log({ userId: req.user.id, action: 'session_start', entity: 'sessions', entityId: s.id, ip: ip(req) });
      return s;
    });
    io.emit('session_started', { session, taName: req.user.name });
    res.status(201).json({ session });
  } catch (err) {
    console.error('[session/start]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/sessions/end', auth, only('ta','admin'), (req, res) => {
  store.sessions.endAllForTa(req.user.id);
  deviceState.active = false;
  io.emit('session_ended');
  store.audit.log({ userId: req.user.id, action: 'session_end', ip: ip(req) });
  res.json({ ok: true });
});

app.get('/api/sessions/active',       (_req, res) => res.json({ session: store.sessions.findActive() || null }));
app.get('/api/sessions', auth, only('ta','admin'), (req, res) => res.json({ sessions: store.sessions.listByTa(req.user.id) }));

// ══════════════════════════════════════════════════════════════════════════════
//  ATTENDANCE
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/attendance/register', auth, only('student'), (req, res) => {
  const { sessionId, isVpn, isIncognito } = req.body;

  const session = store.sessions.findActive();
  if (!session)
    return res.status(400).json({ error: 'لا توجد جلسة نشطة حالياً' });
  if (session.id !== parseInt(sessionId, 10))
    return res.status(400).json({ error: 'رقم الجلسة غير مطابق' });

  try {
    store.attendance.register({
      sessionId:   session.id,
      studentId:   req.user.id,
      clientIp:    ip(req),
      userAgent:   req.headers['user-agent'] || null,
      isVpn:       !!isVpn,
      isIncognito: !!isIncognito,
    });

    const payload = {
      studentName: req.user.name, studentId: req.user.id,
      clientIp: ip(req), isVpn: !!isVpn, isIncognito: !!isIncognito,
      time: new Date().toISOString(),
    };
    io.emit('student_checked_in', payload);
    if (isVpn || isIncognito)
      io.emit('suspicious_activity', { ...payload, type: isVpn ? 'VPN' : 'Incognito' });

    store.audit.log({ userId: req.user.id, action: 'attendance_register', entity: 'sessions', entityId: session.id, ip: ip(req) });
    res.json({ ok: true, message: '✅ تم تسجيل حضورك بنجاح!' });

  } catch (err) {
    if (err.message?.includes('UNIQUE'))
      return res.status(409).json({ error: 'تم تسجيل حضورك مسبقاً في هذه الجلسة' });
    console.error('[attendance/register]', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/attendance/:sessionId',    auth, only('ta','admin'), (req, res) => res.json({ attendance: store.attendance.listBySession(req.params.sessionId) }));
app.get('/api/attendance/student/me',    auth, only('student'),    (req, res) => res.json({ records:    store.attendance.listByStudent(req.user.id) }));

// ══════════════════════════════════════════════════════════════════════════════
//  RAISED HANDS
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/raise-hand', auth, only('student'), (req, res) => {
  const session = store.sessions.findActive();
  if (!session) return res.status(400).json({ error: 'لا توجد جلسة نشطة' });

  const { raised, count } = store.hands.toggle(session.id, req.user.id);
  io.emit('hand_update', { count, action: raised ? 'raised' : 'lowered', studentId: req.user.id, studentName: req.user.name });
  res.json({ raised, count });
});

app.get('/api/raised-hands', auth, only('ta','admin'), (_req, res) => {
  const session = store.sessions.findActive();
  res.json({ hands: session ? store.hands.listPending(session.id) : [] });
});

app.post('/api/raised-hands/:id/respond', auth, only('ta','admin'), (req, res) => {
  const { action, amount } = req.body;
  const hand = store.hands.findById(req.params.id);
  if (!hand) return res.status(404).json({ error: 'Not found' });

  store.hands.respond({ id: hand.id, action, amount: parseFloat(amount) || 1 });
  io.emit('hand_responded', { studentId: hand.student_id, action, amount });
  io.emit('hand_update', { count: store.hands.countPending(hand.session_id) });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//  QUIZZES
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/quizzes', auth, only('ta','admin'), (req, res) => {
  const { title, questions } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'عنوان الكويز مطلوب' });
  if (!Array.isArray(questions) || !questions.length) return res.status(400).json({ error: 'يجب إضافة سؤال واحد على الأقل' });

  const session = store.sessions.findActive();
  const quizId  = store.quizzes.create({ taId: req.user.id, sessionId: session?.id || null, title: title.trim(), questions });
  store.audit.log({ userId: req.user.id, action: 'quiz_create', entity: 'quizzes', entityId: quizId });
  res.status(201).json({ quizId });
});

app.post('/api/quizzes/:id/toggle', auth, only('ta','admin'), (req, res) => {
  const quiz = store.quizzes.findById(req.params.id);
  if (!quiz || quiz.ta_id !== req.user.id) return res.status(404).json({ error: 'Quiz not found' });
  const active = store.quizzes.toggle(req.params.id);
  io.emit(active ? 'quiz_activated' : 'quiz_deactivated', { quizId: quiz.id, title: quiz.title });
  res.json({ active });
});

app.get('/api/quizzes/active', auth, (_req, res) => res.json({ quiz: store.quizzes.findActiveWithQuestions() || null }));
app.get('/api/quizzes',        auth, only('ta','admin'), (req, res) => res.json({ quizzes: store.quizzes.listByTa(req.user.id) }));
app.get('/api/quizzes/:id/results', auth, only('ta','admin'), (req, res) => res.json({ results: store.quizzes.getResults(req.params.id) }));

app.post('/api/quizzes/:id/submit', auth, only('student'), (req, res) => {
  try {
    const result = store.quizzes.submitAnswers({ quizId: req.params.id, studentId: req.user.id, answers: req.body.answers });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  COMPLAINTS
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/complaints', auth, only('student'), (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'اكتب نص الشكوى' });

  const session = store.sessions.findActive();
  const id = store.complaints.create({ studentId: req.user.id, sessionId: session?.id || null, content: content.trim() });
  io.emit('new_complaint', { studentName: req.user.name, preview: content.slice(0, 60), time: new Date().toISOString() });
  res.status(201).json({ ok: true, id, message: '✅ تم إرسال شكواك بنجاح' });
});

app.get('/api/complaints',            auth, only('ta','admin'), (_req, res) => res.json({ complaints: store.complaints.listAll() }));
app.patch('/api/complaints/:id/read', auth, only('ta','admin'), (req, res) => { store.complaints.markRead(req.params.id); res.json({ ok: true }); });
app.patch('/api/complaints/:id/reply',auth, only('ta','admin'), (req, res) => {
  const { reply } = req.body;
  if (!reply?.trim()) return res.status(400).json({ error: 'اكتب الرد' });
  store.complaints.reply(req.params.id, reply.trim());
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//  FEEDBACK
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/feedback', auth, only('ta','admin'), (req, res) => {
  const { content, rating } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'اكتب الفيدباك' });
  store.db.prepare('INSERT INTO feedback (ta_id, content, rating) VALUES (?,?,?)')
    .run(req.user.id, content.trim(), rating ? parseInt(rating) : null);
  res.status(201).json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
//  STATS
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/stats/current', auth, only('ta','admin'), (_req, res) => {
  const session = store.sessions.findActive();
  if (!session) return res.json({ present: 0, vpn: 0, incognito: 0, handsRaised: 0, unreadComplaints: store.complaints.countUnread(), session: null });

  const stats = store.attendance.sessionStats(session.id);
  res.json({ ...stats, handsRaised: store.hands.countPending(session.id), unreadComplaints: store.complaints.countUnread(), session });
});

app.get('/api/stats/absence/:sessionId', auth, only('ta','admin'), (req, res) => {
  const session = store.db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const allStudents = session.section ? store.users.listBySection(session.section) : store.users.listStudents();
  const { present, absent } = store.attendance.absenceReport(req.params.sessionId, allStudents);
  res.json({ present, absent, total: allStudents.length });
});

// ══════════════════════════════════════════════════════════════════════════════
//  RFID ADMIN
// ══════════════════════════════════════════════════════════════════════════════
app.post('/api/rfid/assign', auth, only('ta','admin'), (req, res) => {
  const { uid, studentId, label } = req.body;
  if (!uid) return res.status(400).json({ error: 'UID required' });
  store.users.rfidUpsert({ uid: uid.toUpperCase(), studentId: studentId || null, label: label || uid });
  if (studentId) store.users.assignRfid(studentId, uid.toUpperCase());
  res.json({ ok: true });
});

app.get('/api/rfid/cards', auth, only('ta','admin'), (_req, res) => res.json({ cards: store.users.rfidList() }));

// ══════════════════════════════════════════════════════════════════════════════
//  AUDIT
// ══════════════════════════════════════════════════════════════════════════════
app.get('/api/audit', auth, only('admin'), (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  res.json({ logs: store.audit.list(limit) });
});

// ══════════════════════════════════════════════════════════════════════════════
//  SOCKET.IO
// ══════════════════════════════════════════════════════════════════════════════
io.on('connection', (socket) => {
  // Send current state immediately on connect
  socket.emit('init', {
    device:  deviceState,
    session: store.sessions.findActive() || null,
    time:    new Date().toISOString(),
  });

  socket.on('disconnect', () => {});
});

// ══════════════════════════════════════════════════════════════════════════════
//  SPA CATCH-ALL
// ══════════════════════════════════════════════════════════════════════════════
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ══════════════════════════════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

// ══════════════════════════════════════════════════════════════════════════════
//  START
// ══════════════════════════════════════════════════════════════════════════════
server.listen(PORT, '0.0.0.0', async () => {
  const localIp  = getLocalIp();
  const appUrl   = `http://${localIp}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;

  console.log('\n' + '═'.repeat(52));
  console.log('  🎓  Smart Attendance System  v2.0');
  console.log('═'.repeat(52));
  console.log(`  Local  : ${localUrl}`);
  console.log(`  Network: ${appUrl}   ← share this with students`);
  console.log(`  QR code: ${appUrl}/qr`);
  console.log('─'.repeat(52));
  console.log(`  DB     : ${require('./db/index').DB_PATH}`);
  console.log(`  Env    : ${process.env.NODE_ENV || 'development'}`);
  console.log('═'.repeat(52) + '\n');

  // Print QR in terminal (nice for Pi setups)
  try {
    const qr = await QRCode.toString(appUrl, { type: 'terminal', small: true });
    console.log('  Scan to open on phone:\n');
    console.log(qr);
  } catch {}
});
