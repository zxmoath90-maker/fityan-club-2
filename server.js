'use strict';
/* نادي فتيان أبها — الخادم الرئيسي
   Express + تخزين JSON دائم + LiveKit للصوت والفيديو + SSE للتحديث الفوري */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const lk = require('livekit-server-sdk');

const PORT = process.env.PORT || 3000;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOADS = path.join(DATA, 'uploads');
try { fs.mkdirSync(UPLOADS, { recursive: true }); } catch (e) { console.error('تعذر إنشاء مجلد البيانات:', e.message); }

const LK_URL = process.env.LIVEKIT_URL || '';
const LK_KEY = process.env.LIVEKIT_API_KEY || '';
const LK_SECRET = process.env.LIVEKIT_API_SECRET || '';
const LK_READY = !!(LK_URL && LK_KEY && LK_SECRET);
const roomClient = LK_READY
  ? new lk.RoomServiceClient(LK_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), LK_KEY, LK_SECRET)
  : null;

/* ---------- السر الخاص بالجلسات (يُحدَّد عند التشغيل) ---------- */
let SECRET = process.env.SESSION_SECRET || '';

/* ---------- قاعدة البيانات ---------- */
const uid = () => crypto.randomBytes(8).toString('hex');
function hashCode(code, salt) {
  salt = salt || crypto.randomBytes(8).toString('hex');
  return { salt, hash: crypto.scryptSync(String(code), salt, 32).toString('hex') };
}
function checkCode(code, rec) {
  if (!rec) return false;
  const h = crypto.scryptSync(String(code), rec.salt, 32);
  const b = Buffer.from(rec.hash, 'hex');
  return h.length === b.length && crypto.timingSafeEqual(h, b);
}
const DEFAULTS = () => ({
  settings: {
    clubName: 'نادي فتيان أبها',
    welcome: 'أهلاً بكم في مساحتكم',
    allowCamera: true,
    allowMic: true,
    ataa: { enabled: true, opacity: 5, hasLogo: false },
    assistantPerms: { meetings: true, students: true, items: true, moderation: true },
    codes: {
      supervisor: hashCode(process.env.SUPERVISOR_CODE || '1001'),
      assistant: hashCode(process.env.ASSISTANT_CODE || '1001'),
    },
  },
  students: [], meetings: [], items: [], attendance: [], archivedPhotos: [], staff: [], chats: [], chatReads: {},
});
let db = DEFAULTS();

/* التخزين: إذا وُجد DATABASE_URL (مثل Neon المجاني) تُحفظ البيانات والصور هناك فلا تضيع عند إعادة تشغيل الاستضافة.
   وإلا تُحفظ في مجلد DATA_DIR على القرص. */
const DATABASE_URL = process.env.DATABASE_URL || '';
let pool = null;
if (DATABASE_URL) { const { Pool } = require('pg'); pool = new Pool({ connectionString: DATABASE_URL, max: 3, idleTimeoutMillis: 30000 }); }
const DB_FILE = path.join(DATA, 'db.json');
const DEFAULT_LOGO = path.join(__dirname, 'public', 'assets', 'ataa-logo.png');

async function putFile(name, buf) {
  if (pool) await pool.query('INSERT INTO files(name,data) VALUES($1,$2) ON CONFLICT (name) DO UPDATE SET data=EXCLUDED.data', [name, buf]);
  else fs.writeFileSync(path.join(UPLOADS, name), buf);
}
async function getFile(name) {
  if (pool) { const r = await pool.query('SELECT data FROM files WHERE name=$1', [name]); return r.rows[0] ? r.rows[0].data : null; }
  const p = path.join(UPLOADS, name); return fs.existsSync(p) ? fs.readFileSync(p) : null;
}
async function delFile(name) {
  try { if (pool) await pool.query('DELETE FROM files WHERE name=$1', [name]); else fs.unlinkSync(path.join(UPLOADS, name)); } catch {}
}
async function logoBuf() {
  const b = await getFile('ataa-logo.png'); if (b) return b;
  return fs.existsSync(DEFAULT_LOGO) ? fs.readFileSync(DEFAULT_LOGO) : null;
}

let saveTimer = null, saving = false;
async function flush() {
  saveTimer = null;
  if (saving) { saveTimer = setTimeout(flush, 300); return; }
  saving = true;
  try { await pool.query("INSERT INTO kv(key,value) VALUES('db',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [JSON.stringify(db)]); }
  catch (e) { console.error('تعذر حفظ البيانات:', e.message); if (!saveTimer) saveTimer = setTimeout(flush, 3000); }
  saving = false;
}
function save() {
  if (!pool) { const tmp = DB_FILE + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(db)); fs.renameSync(tmp, DB_FILE); return; }
  if (!saveTimer) saveTimer = setTimeout(flush, 300);
}
async function shutdown() {
  try { if (pool) { if (saveTimer) clearTimeout(saveTimer); await flush(); await pool.end(); } } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

async function init() {
  let loaded = null;
  if (pool) {
    await pool.query('CREATE TABLE IF NOT EXISTS kv(key text PRIMARY KEY, value jsonb)');
    await pool.query('CREATE TABLE IF NOT EXISTS files(name text PRIMARY KEY, data bytea)');
    const r = await pool.query("SELECT value FROM kv WHERE key='db'"); if (r.rows[0]) loaded = r.rows[0].value;
    if (!SECRET) {
      const k = await pool.query("SELECT value FROM kv WHERE key='secret'");
      if (k.rows[0]) SECRET = k.rows[0].value.s;
      else { SECRET = crypto.randomBytes(48).toString('hex'); await pool.query("INSERT INTO kv(key,value) VALUES('secret',$1)", [JSON.stringify({ s: SECRET })]); }
    }
  } else {
    if (fs.existsSync(DB_FILE)) loaded = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!SECRET) {
      const sf = path.join(DATA, 'secret.key');
      if (!fs.existsSync(sf)) fs.writeFileSync(sf, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
      SECRET = fs.readFileSync(sf, 'utf8');
    }
  }
  if (loaded) {
    const d = DEFAULTS();
    db = { ...d, ...loaded, settings: { ...d.settings, ...loaded.settings,
      ataa: { ...d.settings.ataa, ...(loaded.settings || {}).ataa },
      assistantPerms: { ...d.settings.assistantPerms, ...(loaded.settings || {}).assistantPerms },
      codes: { ...d.settings.codes, ...(loaded.settings || {}).codes } } };
  }
  db.settings.ataa.hasLogo = !!(await logoBuf());
  save();
}

/* ---------- الحضور الحي (منفصل عن سجل الحضور) ---------- */
const presence = new Map(); // meetingId -> Map(key -> {...})
const STALE_MS = 35000;
function pres(mid) { if (!presence.has(mid)) presence.set(mid, new Map()); return presence.get(mid); }
function presentNow() { let n = 0; presence.forEach(m => { n += m.size; }); return n; }
function endAttendance(mid, key) {
  const rec = [...db.attendance].reverse().find(a => a.meetingId === mid && a.key === key && !a.leftAt);
  if (rec) { rec.leftAt = new Date().toISOString(); save(); }
}
setInterval(() => {
  const now = Date.now(); let changed = false;
  presence.forEach((m, mid) => m.forEach((p, key) => {
    if (now - p.lastSeen > STALE_MS) { m.delete(key); endAttendance(mid, key); changed = true; }
  }));
  if (changed) broadcast();
}, 10000);

/* ---------- SSE ---------- */
const clients = new Set();
function broadcast() { clients.forEach(res => res.write('data: sync\n\n')); }
setInterval(() => clients.forEach(res => res.write(': ping\n\n')), 25000);

/* ---------- جلسات موقّعة ---------- */
const b64 = s => Buffer.from(s).toString('base64url');
function sign(obj) {
  const body = b64(JSON.stringify(obj));
  return body + '.' + crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}
function verify(tok) {
  if (!tok || typeof tok !== 'string' || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const exp = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const o = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (o.exp && o.exp < Date.now()) return null;
    return o;
  } catch { return null; }
}
function parseCookies(req) {
  const o = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > 0) o[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return o;
}
function setCookie(req, res, name, val, days) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(val)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(days * 86400)}${req.secure ? '; Secure' : ''}`);
}
function clearCookie(res, name) { res.append('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); }

/* ---------- تحديد المحاولات ---------- */
const hits = new Map();
function limited(req, res, max = 8, windowMs = 10 * 60 * 1000) {
  const k = req.ip + req.path; const now = Date.now();
  const arr = (hits.get(k) || []).filter(t => now - t < windowMs);
  if (arr.length >= max) { res.status(429).json({ error: 'محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.' }); return true; }
  arr.push(now); hits.set(k, arr); return false;
}
setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (!v.some(t => now - t < 600000)) hits.delete(k); }); }, 60000);

/* ---------- التطبيق ---------- */
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  const c = parseCookies(req);
  const s = verify(c.sid);
  req.user = null;
  if (s) {
    if (s.role === 'student') {
      const st = db.students.find(x => x.id === s.studentId);
      if (st && st.devices.includes(s.devId)) req.user = { role: 'student', studentId: st.id, name: st.name, sidKey: s.studentId };
    } else if (s.role === 'supervisor' || s.role === 'assistant') {
      const sf = db.staff.find(x => x.id === s.staffId && x.role === s.role);
      if (sf) req.user = { role: s.role, staffId: sf.id, name: sf.name, sidKey: sf.id };
    }
  }
  next();
});

const userKey = u => u.role === 'student' ? 'student:' + u.studentId : u.role + ':' + u.sidKey;
const isStaff = u => u && (u.role === 'supervisor' || u.role === 'assistant');
function can(req, key) {
  const u = req.user; if (!u) return false;
  if (u.role === 'supervisor') return true;
  if (u.role === 'assistant') return !!db.settings.assistantPerms[key];
  return false;
}
const need = key => (req, res, next) => can(req, key) ? next() : res.status(403).json({ error: 'ليست لديك صلاحية لهذا الإجراء.' });
const needLogin = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'سجّل دخولك أولاً.' });
const needSupervisor = (req, res, next) => req.user && req.user.role === 'supervisor' ? next() : res.status(403).json({ error: 'هذا الإجراء للمشرف فقط.' });

const clean = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const normName = s => clean(s, 60).toLowerCase();

/* ---------- عام ---------- */
function publicSettings() {
  const s = db.settings;
  return { clubName: s.clubName, welcome: s.welcome, allowCamera: s.allowCamera, allowMic: s.allowMic,
    ataa: s.ataa, livekit: LK_READY };
}
app.get('/api/public', (req, res) => res.json(publicSettings()));
app.get('/api/students/public', (req, res) =>
  res.json(db.students.map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, 'ar'))));

app.get('/api/me', (req, res) => {
  const u = req.user;
  if (!u) return res.json({ role: null });
  res.json({
    role: u.role, studentId: u.studentId || null, name: u.name || null,
    unread: unreadTotal(u),
    perms: u.role === 'supervisor'
      ? { meetings: true, students: true, items: true, moderation: true, settings: true }
      : u.role === 'assistant' ? { ...db.settings.assistantPerms, settings: false } : {},
  });
});

/* ---------- الدخول ---------- */
function loginStaff(role) {
  return (req, res) => {
    if (limited(req, res)) return;
    const code = clean(req.body.code, 40);
    if (!code || !checkCode(code, db.settings.codes[role])) return res.status(401).json({ error: 'رمز الدخول غير صحيح. تأكد منه وأعد المحاولة.' });
    let sf;
    if (req.body.staffId) {
      sf = db.staff.find(x => x.id === req.body.staffId && x.role === role);
      if (!sf) return res.status(404).json({ error: 'لم نجد هذا الاسم. اختره من القائمة أو أضف اسماً جديداً.' });
    } else {
      const name = clean(req.body.name, 60);
      if (name.length < 2) return res.status(400).json({ error: 'اكتب اسمك، أو اضغط «إظهار القائمة» واختر اسمك.' });
      if (db.staff.some(x => x.role === role && normName(x.name) === normName(name)))
        return res.status(409).json({ error: 'هذا الاسم مسجّل من قبل. اضغط «إظهار القائمة» واختر اسمك.' });
      sf = { id: uid(), role, name, createdAt: new Date().toISOString() };
      db.staff.push(sf); save();
    }
    clearCookie(res, 'sid');
    setCookie(req, res, 'sid', sign({ role, staffId: sf.id, exp: Date.now() + 12 * 3600e3, n: uid() }), 0.5);
    res.json({ ok: true, role });
  };
}
app.post('/api/login/supervisor', loginStaff('supervisor'));
app.post('/api/login/assistant', loginStaff('assistant'));

function issueStudent(req, res, st) {
  const cookies = parseCookies(req);
  const dev = verify(cookies.dev) || { devs: {} };
  let devId = dev.devs[st.id];
  if (!devId || !st.devices.includes(devId)) {
    devId = uid(); st.devices.push(devId); dev.devs[st.id] = devId; save();
  }
  setCookie(req, res, 'dev', sign({ devs: dev.devs }), 365);
  setCookie(req, res, 'sid', sign({ role: 'student', studentId: st.id, devId, exp: Date.now() + 365 * 864e5 }), 365);
}
app.get('/api/staff/public', (req, res) => {
  const role = req.query.role === 'assistant' ? 'assistant' : 'supervisor';
  res.json(db.staff.filter(s => s.role === role).map(s => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, 'ar')));
});
app.get('/api/staff', needSupervisor, (req, res) => res.json(db.staff.map(s => ({ id: s.id, name: s.name, role: s.role }))));
app.delete('/api/staff/:id', needSupervisor, (req, res) => {
  if (req.params.id === req.user.staffId) return res.status(400).json({ error: 'لا يمكنك حذف اسمك وأنت داخل به.' });
  const i = db.staff.findIndex(x => x.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'الاسم غير موجود.' });
  const fk = db.staff[i].role + ':' + db.staff[i].id;
  db.chats.filter(c => (c.fromKey === fk || c.toKey === fk) && c.image).forEach(c => delFile(c.image));
  db.chats = db.chats.filter(c => c.fromKey !== fk && c.toKey !== fk);
  db.staff.splice(i, 1); save(); res.json({ ok: true });
});
app.post('/api/login/student', (req, res) => {
  if (limited(req, res, 15)) return;
  const st = db.students.find(s => s.id === req.body.studentId);
  if (!st) return res.status(404).json({ error: 'لم نجد هذا الاسم. اختر اسمك من القائمة.' });
  const dev = verify(parseCookies(req).dev) || { devs: {} };
  const known = dev.devs[st.id] && st.devices.includes(dev.devs[st.id]);
  if (!known && st.devices.length > 0) {
    const lc = st.linkCode, given = clean(req.body.linkCode, 10);
    const ok = lc && lc.exp > Date.now() && given && given.length === lc.code.length &&
      crypto.timingSafeEqual(Buffer.from(given), Buffer.from(lc.code));
    if (!ok) return res.status(403).json({ code: 'NEEDS_LINK', error: 'هذا الاسم مسجّل على جهاز آخر. اطلب من المشرف رمز ربط جهاز جديد ثم أدخله هنا.' });
    st.linkCode = null;
  }
  issueStudent(req, res, st);
  res.json({ ok: true });
});
app.post('/api/login/student/new', (req, res) => {
  if (limited(req, res, 10)) return;
  const name = clean(req.body.name, 60);
  if (name.length < 2) return res.status(400).json({ error: 'اكتب اسمك (حرفان على الأقل).' });
  if (db.students.some(s => normName(s.name) === normName(name)))
    return res.status(409).json({ error: 'يوجد طالب بنفس هذا الاسم. إن كنت أنت فاختر اسمك من القائمة، وإلا أضف حرفاً أو لقباً يميّزك.' });
  const st = { id: uid(), name, devices: [], linkCode: null, createdAt: new Date().toISOString() };
  db.students.push(st); save();
  issueStudent(req, res, st); broadcast();
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { clearCookie(res, 'sid'); res.json({ ok: true }); });

/* ---------- الإعدادات ---------- */
app.put('/api/settings', needSupervisor, (req, res) => {
  const b = req.body, s = db.settings;
  if (b.clubName !== undefined) { const v = clean(b.clubName, 60); if (!v) return res.status(400).json({ error: 'اسم المجموعة مطلوب.' }); s.clubName = v; }
  if (b.welcome !== undefined) s.welcome = clean(b.welcome, 120);
  if (b.allowCamera !== undefined) s.allowCamera = !!b.allowCamera;
  if (b.allowMic !== undefined) s.allowMic = !!b.allowMic;
  if (b.ataa) {
    if (b.ataa.enabled !== undefined) s.ataa.enabled = !!b.ataa.enabled;
    if (b.ataa.opacity !== undefined) s.ataa.opacity = Math.min(7, Math.max(3, Number(b.ataa.opacity) || 5));
  }
  if (b.assistantPerms) for (const k of ['meetings', 'students', 'items', 'moderation'])
    if (b.assistantPerms[k] !== undefined) s.assistantPerms[k] = !!b.assistantPerms[k];
  save(); applyPermsToLiveRooms(); broadcast(); res.json(publicSettings());
});
/* تسمية المجموعة: للمشرف والمساعد فقط، ويتغير عند الجميع فوراً */
app.put('/api/group-name', (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'تغيير اسم المجموعة للمشرف والمساعد فقط.' });
  const v = clean(req.body.clubName, 60);
  if (v.length < 2) return res.status(400).json({ error: 'اكتب اسماً للمجموعة (حرفان على الأقل).' });
  db.settings.clubName = v; save(); broadcast(); res.json(publicSettings());
});
app.get('/api/settings/admin', needSupervisor, (req, res) => res.json({ assistantPerms: db.settings.assistantPerms }));
app.put('/api/settings/codes', needSupervisor, (req, res) => {
  if (limited(req, res, 10)) return;
  const { role, current, newCode } = req.body;
  if (!['supervisor', 'assistant'].includes(role)) return res.status(400).json({ error: 'دور غير صالح.' });
  if (!checkCode(clean(current, 40), db.settings.codes.supervisor)) return res.status(401).json({ error: 'رمز المشرف الحالي غير صحيح.' });
  const n = clean(newCode, 40);
  if (n.length < 4) return res.status(400).json({ error: 'الرمز الجديد يجب ألا يقل عن 4 خانات.' });
  db.settings.codes[role] = hashCode(n); save(); res.json({ ok: true });
});
const imgUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, f, cb) => ['image/jpeg', 'image/png', 'image/webp'].includes(f.mimetype) ? cb(null, true) : cb(new Error('BADTYPE')) });
function uploadMw(req, res, next) {
  imgUpload.single('image')(req, res, err => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'الصورة كبيرة جداً. الحد الأقصى 8 ميجابايت.' });
    if (err.message === 'BADTYPE') return res.status(415).json({ error: 'الصيغ المقبولة: JPEG أو PNG أو WebP.' });
    res.status(400).json({ error: 'تعذر قراءة الملف المرفوع.' });
  });
}
app.post('/api/settings/logo', needSupervisor, uploadMw, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'اختر ملف الشعار.' });
  try {
    const out = await sharp(req.file.buffer).rotate().resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
    await putFile('ataa-logo.png', out);
    db.settings.ataa.hasLogo = true; save(); broadcast(); res.json(publicSettings());
  } catch { res.status(400).json({ error: 'الملف ليس صورة صالحة.' }); }
});
app.delete('/api/settings/logo', needSupervisor, async (req, res) => {
  await delFile('ataa-logo.png');
  db.settings.ataa.hasLogo = !!(await logoBuf()); save(); broadcast(); res.json(publicSettings());
});
app.get('/api/logo', async (req, res) => {
  const b = await logoBuf();
  if (!b) return res.status(404).end();
  res.set('Cache-Control', 'public, max-age=300').type('png').send(b);
});

/* ---------- الطلاب ---------- */
function studentRow(s, req) {
  const items = db.items.filter(i => i.studentId === s.id);
  const att = db.attendance.filter(a => a.key === 'student:' + s.id);
  let here = false; presence.forEach(m => { if (m.has('student:' + s.id)) here = true; });
  return { id: s.id, name: s.name, items: items.map(i => ({ id: i.id, name: i.name, badge: i.badge })),
    attended: new Set(att.map(a => a.meetingId)).size, lastSeen: att.length ? att[att.length - 1].joinedAt : null,
    here, linked: s.devices.length > 0, unread: unreadFrom(userKey(req.user), 'student:' + s.id) };
}
app.get('/api/students', needLogin, (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'غير مسموح.' });
  res.json(db.students.map(s => studentRow(s, req)).sort((a, b) => a.name.localeCompare(b.name, 'ar')));
});
app.post('/api/students', need('students'), (req, res) => {
  const name = clean(req.body.name, 60);
  if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم الطالب (حرفان على الأقل).' });
  if (db.students.some(s => normName(s.name) === normName(name)))
    return res.status(409).json({ error: 'يوجد طالب بنفس الاسم. أضف لقباً أو حرفاً يميّزه.' });
  db.students.push({ id: uid(), name, devices: [], linkCode: null, createdAt: new Date().toISOString() });
  save(); broadcast(); res.json({ ok: true });
});
app.put('/api/students/:id', need('students'), (req, res) => {
  const s = db.students.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'الطالب غير موجود.' });
  const name = clean(req.body.name, 60);
  if (name.length < 2) return res.status(400).json({ error: 'اكتب اسم الطالب (حرفان على الأقل).' });
  if (db.students.some(x => x.id !== s.id && normName(x.name) === normName(name))) return res.status(409).json({ error: 'يوجد طالب بنفس الاسم.' });
  s.name = name; save(); broadcast(); res.json({ ok: true });
});
function archivePhoto(item) {
  if (item.photo) { db.archivedPhotos.push({ file: item.photo.file, ownerStudentId: item.photo.ownerStudentId, itemId: item.id, at: new Date().toISOString() }); item.photo = null; }
}
app.delete('/api/students/:id', needSupervisor, (req, res) => {
  const i = db.students.findIndex(x => x.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'الطالب غير موجود.' });
  db.items.forEach(it => { if (it.studentId === req.params.id) { archivePhoto(it); it.studentId = null; it.allowPhoto = false; } });
  const sk = 'student:' + req.params.id;
  db.chats.filter(c => (c.fromKey === sk || c.toKey === sk) && c.image).forEach(c => delFile(c.image));
  db.chats = db.chats.filter(c => c.fromKey !== sk && c.toKey !== sk);
  db.students.splice(i, 1); save(); broadcast(); res.json({ ok: true });
});
app.post('/api/students/:id/link-code', need('students'), (req, res) => {
  const s = db.students.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'الطالب غير موجود.' });
  const code = String(crypto.randomInt(100000, 999999));
  s.linkCode = { code, exp: Date.now() + 3600e3 }; save();
  res.json({ code, minutes: 60 });
});
app.post('/api/students/:id/reset-devices', need('students'), (req, res) => {
  const s = db.students.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'الطالب غير موجود.' });
  s.devices = []; s.linkCode = null; save(); broadcast(); res.json({ ok: true });
});

/* ---------- الرسائل الفردية: لا يراها إلا الطرفان ---------- */
const pairOf = (a, b) => [a, b].sort().join('~');
function personByKey(k) {
  if (k.startsWith('student:')) { const s = db.students.find(x => x.id === k.slice(8)); return s ? { key: k, name: s.name, role: 'student' } : null; }
  const [role, id] = k.split(':'); const f = db.staff.find(x => x.id === id && x.role === role);
  return f ? { key: k, name: f.name, role } : null;
}
function unreadFrom(me, other) {
  const last = db.chatReads[me + '|' + other] || '';
  return db.chats.filter(c => c.pair === pairOf(me, other) && c.fromKey === other && c.at > last).length;
}
function unreadTotal(u) {
  if (!u) return 0; const me = userKey(u); let n = 0;
  const seen = new Set(); db.chats.forEach(c => { if (c.toKey === me && !seen.has(c.fromKey)) { seen.add(c.fromKey); n += unreadFrom(me, c.fromKey); } });
  return n;
}
app.get('/api/chat/contacts', needLogin, (req, res) => {
  const me = userKey(req.user);
  const all = [...db.students.map(s => ({ key: 'student:' + s.id, name: s.name, role: 'student' })),
    ...db.staff.map(f => ({ key: f.role + ':' + f.id, name: f.name, role: f.role }))].filter(p => p.key !== me);
  res.json(all.map(p => {
    const last = db.chats.filter(c => c.pair === pairOf(me, p.key)).slice(-1)[0];
    return { ...p, unread: unreadFrom(me, p.key), lastAt: last ? last.at : null };
  }).sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || '') || a.name.localeCompare(b.name, 'ar')));
});
app.get('/api/chat/with/:key', needLogin, (req, res) => {
  const me = userKey(req.user), other = req.params.key;
  if (!personByKey(other) || other === me) return res.status(404).json({ error: 'الشخص غير موجود.' });
  db.chatReads[me + '|' + other] = new Date().toISOString(); save();
  res.json(db.chats.filter(c => c.pair === pairOf(me, other)).slice(-200).map(c => ({ id: c.id, text: c.text, at: c.at, mine: c.fromKey === me, image: c.image ? '/api/chat-images/' + c.image : null })));
});
app.post('/api/chat/with/:key', needLogin, (req, res, next) => {
  const me = userKey(req.user), other = req.params.key;
  if (!personByKey(other) || other === me) return res.status(404).json({ error: 'الشخص غير موجود.' });
  if (limited(req, res, 40, 60000)) return;
  next();
}, uploadMw, async (req, res) => {
  const text = clean(req.body && req.body.text, 1000);
  if (!text && !req.file) return res.status(400).json({ error: 'اكتب رسالة أو أرفق صورة.' });
  let image = null;
  if (req.file) {
    try {
      const out = await sharp(req.file.buffer, { failOn: 'error' }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      image = uid() + uid() + '.webp'; await putFile(image, out);
    } catch { return res.status(400).json({ error: 'الملف ليس صورة صالحة.' }); }
  }
  const me = userKey(req.user), other = req.params.key, now = new Date().toISOString();
  db.chats.push({ id: uid(), pair: pairOf(me, other), fromKey: me, toKey: other, text, image, at: now });
  db.chatReads[me + '|' + other] = now; save(); broadcast(); res.json({ ok: true });
});
app.get('/api/chat-images/:file', needLogin, async (req, res) => {
  const f = req.params.file; if (!/^[a-f0-9]{32}\.webp$/.test(f)) return res.status(404).end();
  const me = userKey(req.user), c = db.chats.find(x => x.image === f);
  if (!c || (c.fromKey !== me && c.toKey !== me)) return res.status(404).end();
  const buf = await getFile(f); if (!buf) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=3600').type('image/webp').send(buf);
});

/* ---------- الأغراض ---------- */
const itemView = (i, withStudent = true) => {
  const st = db.students.find(s => s.id === i.studentId);
  return { id: i.id, name: i.name, studentId: i.studentId, studentName: st ? st.name : null, badge: i.badge, notes: i.notes,
    allowPhoto: i.allowPhoto, photo: i.photo ? '/api/photos/' + i.photo.file : null };
};
app.get('/api/items', needLogin, (req, res) => {
  if (isStaff(req.user)) return res.json(db.items.map(itemView));
  res.json(db.items.filter(i => i.studentId === req.user.studentId).map(itemView));
});
app.get('/api/items/summary', needLogin, (req, res) =>
  res.json(db.items.map(i => { const st = db.students.find(s => s.id === i.studentId); return { name: i.name, badge: i.badge, studentId: i.studentId, studentName: st ? st.name : null }; })));

function readItemBody(req, res) {
  const name = clean(req.body.name, 80);
  if (!name) { res.status(400).json({ error: 'اسم الغرض مطلوب.' }); return null; }
  let studentId = req.body.studentId || null;
  if (studentId && !db.students.some(s => s.id === studentId)) { res.status(400).json({ error: 'الطالب المختار غير موجود.' }); return null; }
  return { name, studentId, badge: clean(req.body.badge, 40), notes: clean(req.body.notes, 300), allowPhoto: !!req.body.allowPhoto && !!studentId };
}
app.post('/api/items', need('items'), (req, res) => {
  const b = readItemBody(req, res); if (!b) return;
  db.items.push({ id: uid(), ...b, photo: null, createdAt: new Date().toISOString() });
  save(); broadcast(); res.json({ ok: true });
});
app.put('/api/items/:id', need('items'), (req, res) => {
  const it = db.items.find(x => x.id === req.params.id); if (!it) return res.status(404).json({ error: 'الغرض غير موجود.' });
  const b = readItemBody(req, res); if (!b) return;
  if (b.studentId !== it.studentId) archivePhoto(it); // نقل المسؤولية لا يمنح الطالب الجديد حق التعديل على الصورة القديمة
  Object.assign(it, b); save(); broadcast(); res.json({ ok: true });
});
app.delete('/api/items/:id', need('items'), (req, res) => {
  const i = db.items.findIndex(x => x.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'الغرض غير موجود.' });
  archivePhoto(db.items[i]); db.items.splice(i, 1); save(); broadcast(); res.json({ ok: true });
});

/* صور الأغراض: الطالب المسؤول فقط (يُفحص في الخادم) */
function ownerItem(req, res) {
  if (!req.user || req.user.role !== 'student') { res.status(403).json({ error: 'رفع صورة الغرض متاح للطالب المسؤول عنه فقط.' }); return null; }
  const it = db.items.find(x => x.id === req.params.id);
  if (!it || it.studentId !== req.user.studentId) { res.status(403).json({ error: 'هذا الغرض ليس من مسؤوليتك.' }); return null; }
  if (!it.allowPhoto) { res.status(403).json({ error: 'المشرف لم يفعّل إرفاق الصورة لهذا الغرض.' }); return null; }
  return it;
}
app.post('/api/items/:id/photo', (req, res, next) => ownerItem(req, res) && next(), uploadMw, async (req, res) => {
  const it = db.items.find(x => x.id === req.params.id);
  if (!req.file) return res.status(400).json({ error: 'اختر صورة أولاً.' });
  try {
    const out = await sharp(req.file.buffer, { failOn: 'error' }).rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(); // التدوير حسب EXIF وإزالة البيانات الوصفية
    const file = uid() + uid() + '.webp';
    await putFile(file, out);
    const old = it.photo; it.photo = { file, ownerStudentId: req.user.studentId, at: new Date().toISOString() }; save();
    if (old) delFile(old.file);
    broadcast(); res.json({ ok: true, photo: '/api/photos/' + file });
  } catch { res.status(400).json({ error: 'الملف ليس صورة صالحة. جرّب صورة أخرى.' }); }
});
app.delete('/api/items/:id/photo', (req, res) => {
  const it = ownerItem(req, res); if (!it) return;
  if (it.photo) { const f = it.photo.file; it.photo = null; save(); delFile(f); }
  broadcast(); res.json({ ok: true });
});
app.get('/api/photos/:file', needLogin, async (req, res) => {
  const f = req.params.file;
  if (!/^[a-f0-9]{32}\.webp$/.test(f)) return res.status(404).end();
  const live = db.items.some(i => i.photo && i.photo.file === f);
  const arch = db.archivedPhotos.some(a => a.file === f);
  if (!live && !(arch && isStaff(req.user))) return res.status(404).end();
  const buf = await getFile(f); if (!buf) return res.status(404).end();
  res.set('Cache-Control', 'private, max-age=3600').type('image/webp').send(buf);
});

/* ---------- الاجتماعات ---------- */
function readMeetingBody(req, res) {
  const title = clean(req.body.title, 80);
  if (!title) { res.status(400).json({ error: 'اسم الاجتماع مطلوب.' }); return null; }
  const when = new Date(req.body.startsAt);
  if (isNaN(when)) { res.status(400).json({ error: 'اختر التاريخ والوقت.' }); return null; }
  return { title, startsAt: when.toISOString(), description: clean(req.body.description, 300) };
}
const meetingView = m => ({ id: m.id, title: m.title, description: m.description, startsAt: m.startsAt, isOpen: m.isOpen, participants: pres(m.id).size });
app.get('/api/meetings', needLogin, (req, res) => res.json(db.meetings.map(meetingView).sort((a, b) => a.startsAt.localeCompare(b.startsAt))));
app.post('/api/meetings', need('meetings'), (req, res) => {
  const b = readMeetingBody(req, res); if (!b) return;
  db.meetings.push({ id: uid(), ...b, isOpen: false, overrides: {}, createdAt: new Date().toISOString() });
  save(); broadcast(); res.json({ ok: true });
});
app.put('/api/meetings/:id', need('meetings'), (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  const b = readMeetingBody(req, res); if (!b) return;
  Object.assign(m, b); save(); broadcast(); res.json({ ok: true });
});
async function closeRoom(m) {
  const p = pres(m.id);
  p.forEach((v, key) => endAttendance(m.id, key)); p.clear();
  if (roomClient) { try { await roomClient.deleteRoom('meeting-' + m.id); } catch {} }
}
app.post('/api/meetings/:id/toggle', need('meetings'), async (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  m.isOpen = req.body.open !== undefined ? !!req.body.open : !m.isOpen;
  if (!m.isOpen) { m.overrides = {}; m.screenOff = false; await closeRoom(m); }
  save(); broadcast(); res.json({ ok: true, isOpen: m.isOpen });
});
app.delete('/api/meetings/:id', need('meetings'), async (req, res) => {
  const i = db.meetings.findIndex(x => x.id === req.params.id); if (i < 0) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  await closeRoom(db.meetings[i]); presence.delete(db.meetings[i].id);
  db.meetings.splice(i, 1); save(); broadcast(); res.json({ ok: true });
});

/* ---------- صلاحيات الغرفة ---------- */
function effective(role, key, m) {
  if (role !== 'student') return { mic: true, cam: true, screen: true };
  const ov = (m.overrides || {})[key] || {};
  return { mic: db.settings.allowMic && ov.mic !== false, cam: db.settings.allowCamera && ov.cam !== false, screen: ov.screen !== false && !m.screenOff };
}
const SRC_STR = { cam: 'camera', mic: 'microphone' };
function sourcesFor(eff, asNumbers) {
  const out = [];
  if (eff.cam) out.push(asNumbers ? 1 : 'camera');
  if (eff.mic) out.push(asNumbers ? 2 : 'microphone');
  if (eff.screen) { out.push(asNumbers ? 3 : 'screen_share'); out.push(asNumbers ? 4 : 'screen_share_audio'); }
  return out;
}
async function pushPerms(m, key, role) {
  if (!roomClient) return;
  const eff = effective(role, key, m), src = sourcesFor(eff, true);
  try {
    await roomClient.updateParticipant('meeting-' + m.id, key, undefined,
      { canSubscribe: true, canPublish: src.length > 0, canPublishData: true, canPublishSources: src });
    if (!eff.mic) await muteMic(m, key);
  } catch (e) { /* المشارك غير متصل */ }
}
async function muteCam(m, key) {
  try {
    const ps = await roomClient.listParticipants('meeting-' + m.id);
    const p = ps.find(x => x.identity === key); if (!p) return;
    for (const t of p.tracks) if (t.source === 1 && !t.muted) await roomClient.mutePublishedTrack('meeting-' + m.id, key, t.sid, true);
  } catch {}
}
async function muteMic(m, key) {
  try {
    const ps = await roomClient.listParticipants('meeting-' + m.id);
    const p = ps.find(x => x.identity === key); if (!p) return;
    for (const t of p.tracks) if (t.source === 2 && !t.muted) await roomClient.mutePublishedTrack('meeting-' + m.id, key, t.sid, true);
  } catch {}
}
function applyPermsToLiveRooms() {
  if (!roomClient) return;
  presence.forEach((map, mid) => { const m = db.meetings.find(x => x.id === mid); if (m) map.forEach((p, key) => pushPerms(m, key, p.role)); });
}

app.post('/api/meetings/:id/join', needLogin, async (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  if (!LK_READY) return res.status(503).json({ error: 'خدمة الصوت والفيديو غير مفعّلة بعد. أضف مفاتيح LiveKit في إعدادات التشغيل (راجع ملف README).' });
  const u = req.user;
  if (!m.isOpen) {
    if (u.role === 'student') return res.status(403).json({ error: 'هذا الاجتماع مغلق حالياً. سيظهر لك الدخول عندما يفتحه المشرف.' });
    if (!can(req, 'meetings')) return res.status(403).json({ error: 'الاجتماع مغلق، ولا تملك صلاحية فتحه.' });
    m.isOpen = true; save(); broadcast();
  }
  const key = u.role === 'student' ? 'student:' + u.studentId : u.role + ':' + u.sidKey;
  const name = u.name;
  const eff = effective(u.role, key, m), src = sourcesFor(eff, false);
  const at = new lk.AccessToken(LK_KEY, LK_SECRET, { identity: key, name, ttl: '6h' });
  at.addGrant({ roomJoin: true, room: 'meeting-' + m.id, canSubscribe: true, canPublish: src.length > 0, canPublishData: true, canPublishSources: src });
  const p = pres(m.id);
  if (!p.has(key)) db.attendance.push({ id: uid(), meetingId: m.id, key, name, role: u.role, joinedAt: new Date().toISOString(), leftAt: null });
  p.set(key, { key, name, role: u.role, studentId: u.studentId || null, lastSeen: Date.now(), mic: false, cam: false, screen: false });
  save(); broadcast();
  res.json({ url: LK_URL, token: await at.toJwt(), key, perms: eff });
});
app.get('/api/meetings/:id/me', needLogin, (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  const u = req.user, key = u.role === 'student' ? 'student:' + u.studentId : u.role + ':' + u.sidKey;
  res.json({ isOpen: m.isOpen, screenOff: !!m.screenOff, perms: effective(u.role, key, m) });
});
app.post('/api/meetings/:id/presence', needLogin, (req, res) => {
  const u = req.user, key = u.role === 'student' ? 'student:' + u.studentId : u.role + ':' + u.sidKey;
  const p = pres(req.params.id).get(key);
  if (!p) return res.status(404).json({ error: 'غير متصل بالاجتماع.' });
  const prev = `${p.mic}${p.cam}${p.screen}`;
  p.lastSeen = Date.now(); p.mic = !!req.body.mic; p.cam = !!req.body.cam; p.screen = !!req.body.screen;
  if (prev !== `${p.mic}${p.cam}${p.screen}`) broadcast();
  res.json({ ok: true });
});
app.post('/api/meetings/:id/leave', (req, res) => {
  // يقبل sendBeacon (نص عادي) — الهوية من الكوكي
  if (!req.user) return res.json({ ok: true });
  const u = req.user, key = u.role === 'student' ? 'student:' + u.studentId : u.role + ':' + u.sidKey;
  if (pres(req.params.id).delete(key)) { endAttendance(req.params.id, key); broadcast(); }
  res.json({ ok: true });
});

/* ---------- إدارة الاجتماع ---------- */
app.get('/api/meetings/:id/participants', need('moderation'), (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  res.json([...pres(m.id).values()].map(p => ({ key: p.key, name: p.name, role: p.role, mic: p.mic, cam: p.cam, screen: p.screen, perms: effective(p.role, p.key, m) })));
});
app.post('/api/meetings/:id/mod', need('moderation'), async (req, res) => {
  const m = db.meetings.find(x => x.id === req.params.id); if (!m) return res.status(404).json({ error: 'الاجتماع غير موجود.' });
  if (!LK_READY) return res.status(503).json({ error: 'خدمة الاجتماعات غير مفعّلة.' });
  const { action, key } = req.body, room = 'meeting-' + m.id;
  const target = key && pres(m.id).get(key);
  try {
    if (action === 'muteAll') {
      const ps = await roomClient.listParticipants(room);
      for (const p of ps) if (p.identity.startsWith('student:')) await muteMic(m, p.identity);
    } else if (action === 'camOffAll') {
      const ps = await roomClient.listParticipants(room);
      for (const p of ps) if (p.identity.startsWith('student:')) await muteCam(m, p.identity);
    } else if (action === 'screenAll') {
      m.screenOff = !req.body.value; save();
      pres(m.id).forEach((p, k) => { if (p.role === 'student') pushPerms(m, k, 'student'); });
    } else if (action === 'mute') {
      if (!target || target.role !== 'student') return res.status(400).json({ error: 'المشارك غير موجود أو ليس طالباً.' });
      await muteMic(m, key);
    } else if (action === 'perm') {
      if (!target || target.role !== 'student') return res.status(400).json({ error: 'المشارك غير موجود أو ليس طالباً.' });
      const what = req.body.what, val = !!req.body.value;
      if (!['mic', 'cam', 'screen'].includes(what)) return res.status(400).json({ error: 'صلاحية غير معروفة.' });
      m.overrides = m.overrides || {}; m.overrides[key] = { ...(m.overrides[key] || {}), [what]: val }; save();
      await pushPerms(m, key, 'student');
    } else if (action === 'remove') {
      if (!target || target.role !== 'student') return res.status(400).json({ error: 'يمكن إخراج الطلاب فقط.' });
      await roomClient.removeParticipant(room, key);
      pres(m.id).delete(key); endAttendance(m.id, key);
    } else return res.status(400).json({ error: 'إجراء غير معروف.' });
  } catch (e) { return res.status(502).json({ error: 'تعذر تنفيذ الإجراء على خدمة الاجتماعات. تأكد أن المشارك ما زال متصلاً.' }); }
  broadcast(); res.json({ ok: true });
});

/* ---------- لوحة الرئيسية ---------- */
app.get('/api/overview', needLogin, (req, res) => {
  if (!isStaff(req.user)) return res.status(403).json({ error: 'غير مسموح.' });
  res.json({ students: db.students.length, openMeetings: db.meetings.filter(m => m.isOpen).length, presentNow: presentNow(), assignedItems: db.items.filter(i => i.studentId).length });
});

/* ---------- SSE ---------- */
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders(); res.write('retry: 3000\n\n');
  clients.add(res); req.on('close', () => clients.delete(res));
});

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.use('/api', (req, res) => res.status(404).json({ error: 'غير موجود.' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

init().then(() => app.listen(PORT, () => {
  console.log(`نادي فتيان أبها يعمل على المنفذ ${PORT} (${pool ? 'تخزين: قاعدة بيانات' : 'تخزين: ملفات'})`);
  if (!LK_READY) console.log('تنبيه: مفاتيح LiveKit غير مضبوطة، فالاجتماعات الصوتية والمرئية معطّلة حتى تضيفها.');
})).catch(e => { console.error('فشل التشغيل:', e.message); process.exit(1); });
