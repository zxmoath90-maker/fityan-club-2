'use strict';
/* ========== أدوات عامة ========== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { pub: null, me: { role: null }, modMeeting: null };
const TZ = 'Asia/Riyadh';
const fmtDate = (iso, o) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory', { timeZone: TZ, ...o });
const fmtTime = iso => new Date(iso).toLocaleTimeString('ar-SA', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
const toInput = iso => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 16);
const fromInput = v => (v ? v + ':00+03:00' : '');
const todayAr = () => fmtDate(new Date().toISOString(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

async function api(path, opts = {}) {
  const o = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
  if (opts.body instanceof FormData) o.body = opts.body;
  else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
  let r;
  try { r = await fetch('/api' + path, o); } catch { throw new Error('تعذر الاتصال بالخادم. تأكد من الإنترنت وأعد المحاولة.'); }
  let d = null; try { d = await r.json(); } catch {}
  if (!r.ok) { const e = new Error((d && d.error) || 'تعذر إكمال الطلب.'); e.status = r.status; e.code = d && d.code; throw e; }
  return d;
}
function toast(msg, bad) {
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4200);
}
const IC = {
  student: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  supervisor: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  assistant: '<circle cx="9" cy="8" r="3.5"/><circle cx="17" cy="9" r="2.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5M16 14.5c3 0 6 1.5 6 5"/>',
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5"/><path d="M17 4.5a3.5 3.5 0 0 1 0 7M19 15c2 .8 3 2.5 3 5"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3"/>',
  screen: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clip: '<path d="M20 12l-7.5 7.5a5 5 0 0 1-7-7L13 5a3.5 3.5 0 0 1 5 5l-7.5 7.5a2 2 0 0 1-3-3L14 8"/>',
  micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 11 5.7M19 11M12 18v3M3 3l18 18"/>',
  camoff: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="M16 10l5-3v10l-5-3M3 3l18 18"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
};
const ic = (n, s = 24) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
const LOGO = cls => `<img class="${cls || 'logo'}" src="/assets/ataa-logo.png" alt="شعار برنامج عطاء للفتيان">`;
const ini = n => [...String(n || '').trim()][0] || '؟';

/* ========== نوافذ حوارية ========== */
const dlg = $('#dlg');
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
function openDlg(html, cls = '') { dlg.className = cls; dlg.innerHTML = `<div class="in">${html}</div>`; if (!dlg.open) dlg.showModal(); }
const closeDlg = () => { if (dlg.open) dlg.close(); };
function confirmBox(title, msg, ok = 'تأكيد') {
  return new Promise(res => {
    openDlg(`<h3>${esc(title)}</h3><p>${esc(msg)}</p><div class="foot"><button class="btn ghost" id="cN">إلغاء</button><button class="btn danger" id="cY">${esc(ok)}</button></div>`);
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    $('#cN').onclick = () => { closeDlg(); fin(false); };
    $('#cY').onclick = () => { closeDlg(); fin(true); };
    dlg.addEventListener('close', () => fin(false), { once: true });
  });
}
function formDlg(title, fields, onSubmit, submitLabel = 'حفظ') {
  openDlg(`<h3>${esc(title)}</h3><form id="f" novalidate>${fields}<div class="err" id="ferr" role="alert"></div><div class="foot"><button type="button" class="btn ghost" id="fx">إلغاء</button><button class="btn" id="fs">${esc(submitLabel)}</button></div></form>`);
  $('#fx').onclick = closeDlg;
  const first = $('#f input,#f select,#f textarea'); if (first) first.focus();
  $('#f').onsubmit = async e => {
    e.preventDefault(); const b = $('#fs'); b.disabled = true; $('#ferr').textContent = '';
    try { await onSubmit(new FormData(e.target), e.target); closeDlg(); }
    catch (er) { $('#ferr').textContent = er.message; b.disabled = false; }
  };
}

/* ========== زخرفة شعار عطاء ========== */
const PAT = [[3, 5, 150, -12], [8, 76, 90, 18], [20, 38, 210, 8], [34, 90, 130, -20], [50, 10, 100, 25], [58, 58, 180, -6], [72, 86, 120, 14], [80, 28, 230, -16], [88, 68, 100, 10], [28, -3, 140, -8], [64, -4, 110, 20], [14, 94, 160, 5]];
function paintBg() {
  const bg = $('#bg'); bg.innerHTML = '';
  const big = document.createElement('div'); big.className = 'big'; big.textContent = 'فتيان'; bg.append(big);
  const a = S.pub && S.pub.ataa;
  if (!a || !a.enabled || !a.hasLogo) return;
  const op = Math.min(7, Math.max(3, a.opacity)) / 100;
  PAT.forEach(([t, l, s, r]) => {
    const im = new Image(); im.alt = ''; im.src = '/api/logo?v=' + (a.v || 1); im.decoding = 'async';
    im.style.cssText = `top:${t}%;left:${l}%;width:${s}px;opacity:${op};transform:rotate(${r}deg)`;
    im.onerror = () => im.remove(); bg.append(im);
  });
}

/* ========== التوجيه ========== */
const app = $('#app');
function go(h) { if (location.hash === h) route(); else location.hash = h; }
window.addEventListener('hashchange', route);
const staffNav = () => {
  const p = S.me.perms || {}, nav = [['home', 'الرئيسية', 'home'], ['meetings', 'الاجتماعات', 'cal']];
  if (p.students) nav.push(['students', 'الطلاب', 'users']);
  nav.push(['items', 'الأغراض', 'box'], ['bringers', 'من سيحضر الأغراض', 'list']);
  if (p.settings) nav.push(['settings', 'الإعدادات', 'gear']);
  return nav;
};
async function route() {
  if (typeof leaveRoomSilently === 'function') leaveRoomSilently();
  closeDlg();
  const h = (location.hash || '#/').slice(2).split('/');
  const role = S.me.role;
  try {
    if (h[0] === '' ) return role ? go(role === 'student' ? '#/s' : '#/a/home') : viewLanding();
    if (h[0] === 'in') return viewGate(h[1]);
    if (h[0] === 's') return role === 'student' ? await viewStudent() : go('#/');
    if (h[0] === 'a') {
      if (!role || role === 'student') return go('#/');
      const pg = h[1] || 'home';
      if (!staffNav().some(n => n[0] === pg)) return go('#/a/home');
      return await viewAdmin(pg);
    }
    if (h[0] === 'room') return role ? await viewRoomGate(h[1]) : go('#/');
    go('#/');
  } catch (e) {
    if (e.status === 401) { S.me = { role: null }; return go('#/'); }
    app.innerHTML = `<div class="center"><div class="card gate"><h2>تعذر تحميل الصفحة</h2><p>${esc(e.message)}</p><button class="btn block" onclick="route()">إعادة المحاولة</button></div></div>`;
  }
}
async function logout() { try { await api('/logout', { method: 'POST' }); } catch {} S.me = { role: null }; go('#/'); }

/* ========== الصفحة الرئيسية ========== */
function viewLanding() {
  const P = S.pub, entries = [
    ['student', 'دخول الطالب', 'تابع اجتماعاتك والمهام المسندة إليك', '#/in/student'],
    ['supervisor', 'دخول المشرف', 'إدارة المجموعة والاجتماعات والمشاركين', '#/in/supervisor'],
    ['assistant', 'دخول مساعد المشرف', 'شارك في التنظيم وابقَ قريباً من الفريق', '#/in/assistant'],
  ];
  app.innerHTML = `<main class="landing">
    <section class="intro">${LOGO()}<div class="tag">${esc(P.welcome)}</div>
      <h1><span>كل لقاء يبدأ</span><span>بتنظيم واضح.</span></h1>
      <p class="lead">مساحة تجمعنا، تنظّم خطوتنا، وتخلّي كل لقاء أقوى.</p>
      <div class="meta"><span><i class="dot"></i>${esc(P.clubName)}</span><span>تجربة عربية، بسيطة، ومصممة لتعمل بسلاسة على الكمبيوتر والجوال.</span></div></section>
    <section class="entries"><div class="gate-title">بوابتك إلى المجموعة</div>
      ${entries.map(([i, t, s, h]) => `<button class="entry" onclick="go('${h}')"><span class="ic">${ic(i, 28)}</span><span><h3>${t}</h3><p>${s}</p></span><span class="arrow" aria-hidden="true">‹</span></button>`).join('')}
    </section></main>`;
}

/* ========== صفحات الدخول ========== */
async function viewGate(kind) {
  if (kind === 'student') return viewStudentGate();
  const sup = kind === 'supervisor', word = sup ? 'المشرفين' : 'المساعدين';
  let list = []; try { list = await api('/staff/public?role=' + kind); } catch {}
  let showList = false;
  const draw = () => {
    const pick = showList && list.length;
    app.innerHTML = `<div class="center"><div class="card gate">${LOGO()}
    <h2>${sup ? 'لوحة المشرف' : 'مساحة المساعد'}</h2>
    <p class="muted">${sup ? 'أدخل رمز الدخول واسمك لفتح لوحة التحكم.' : 'أدخل رمز المساعد واسمك للدخول إلى مساحة التنظيم.'}</p>
    <form id="gf"><label for="code">رمز الدخول</label><input id="code" type="password" inputmode="numeric" autocomplete="off">
      ${pick ? `<label for="sn">اختر اسمك</label><select id="sn">${list.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>`
        : `<label for="nm">اسمك (يظهر للجميع)</label><input id="nm" type="text" maxlength="60" autocomplete="off" placeholder="مثال: أبو محمد">`}
      ${list.length ? `<div class="row" style="margin-top:.8rem"><button type="button" class="btn ghost block" id="tg">${pick ? '+ اسم جديد' : 'إظهار قائمة ' + word}</button></div>` : ''}
      <div class="err" id="gerr" role="alert"></div>
      <div class="row"><button class="btn block" id="gb">${sup ? 'فتح لوحة التحكم' : 'دخول المساعد'}</button><button type="button" class="btn ghost block" onclick="go('#/')">العودة للرئيسية</button></div></form></div></div>`;
    if ($('#tg')) $('#tg').onclick = () => { const v = $('#code').value; showList = !showList; draw(); $('#code').value = v; };
    $('#gf').onsubmit = async e => {
      e.preventDefault(); const code = $('#code').value.trim();
      if (!code) { $('#gerr').textContent = 'اكتب رمز الدخول.'; return; }
      const body = { code }; if (pick) body.staffId = $('#sn').value; else body.name = $('#nm').value;
      $('#gb').disabled = true;
      try { await api('/login/' + kind, { method: 'POST', body }); S.me = await api('/me'); go('#/a/home'); }
      catch (er) { $('#gerr').textContent = er.message; $('#gb').disabled = false; }
    };
  };
  draw();
}
async function viewStudentGate() {
  let list = []; try { list = await api('/students/public'); } catch (e) { toast(e.message, true); }
  let mode = list.length ? 'pick' : 'new', needLink = false;
  const draw = () => {
    app.innerHTML = `<div class="center"><div class="card gate">${LOGO()}
      <h2>أهلاً يا بطل</h2><p class="muted">اختر اسمك للدخول إلى ${esc(S.pub.clubName)}</p>
      <form id="sf">
      ${mode === 'pick' ? `<label for="sid">اسمك</label><select id="sid">${list.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        ${needLink ? `<label for="lc">رمز ربط الجهاز (من المشرف)</label><input id="lc" type="text" inputmode="numeric" autocomplete="off">` : ''}
        <div class="row"><button type="button" class="btn ghost block" id="nw">+ طالب جديد</button></div>`
      : `<label for="nm">اسمك</label><input id="nm" type="text" autocomplete="off" maxlength="60">
        ${list.length ? '<div class="row"><button type="button" class="btn ghost block" id="bk">العودة إلى قائمة الطلاب</button></div>' : ''}`}
      <div class="err" id="serr" role="alert"></div>
      <div class="row"><button class="btn block" id="sb">دخول المساحة</button><button type="button" class="btn ghost block" onclick="go('#/')">العودة للرئيسية</button></div></form></div></div>`;
    if ($('#nw')) $('#nw').onclick = () => { mode = 'new'; draw(); };
    if ($('#bk')) $('#bk').onclick = () => { mode = 'pick'; draw(); };
    $('#sf').onsubmit = async e => {
      e.preventDefault(); $('#sb').disabled = true; $('#serr').textContent = '';
      try {
        if (mode === 'pick') await api('/login/student', { method: 'POST', body: { studentId: $('#sid').value, linkCode: $('#lc') ? $('#lc').value : '' } });
        else await api('/login/student/new', { method: 'POST', body: { name: $('#nm').value } });
        S.me = await api('/me'); go('#/s');
      } catch (er) {
        if (er.code === 'NEEDS_LINK') { needLink = true; const v = $('#sid') && $('#sid').value; draw(); if (v) $('#sid').value = v; }
        $('#serr').textContent = er.message; $('#sb').disabled = false;
      }
    };
  };
  draw();
}

/* ========== لوحة الطالب ========== */
const meetingBadge = m => m.isOpen ? '<span class="badge green"><i class="dot"></i>مفتوح الآن</span>' : '<span class="badge gray">مغلق</span>';
const dateBlock = iso => `<div class="dateblock"><b>${fmtDate(iso, { day: 'numeric' })}</b><small>${fmtDate(iso, { month: 'short' })}</small></div>`;
function itemPhotoBlock(it, mine) {
  const img = it.photo ? `<img class="item-photo" src="${it.photo}" alt="صورة ${esc(it.name)}" data-act="zoom" data-src="${it.photo}" tabindex="0">` : '';
  let btns = '';
  if (mine && it.allowPhoto) btns = `<div class="actions"><button class="btn gold sm" data-act="photo" data-id="${it.id}">${it.photo ? 'استبدال الصورة' : 'إدراج صورة الغرض'}</button>${it.photo ? `<button class="btn ghost sm" data-act="photoDel" data-id="${it.id}">حذف الصورة</button>` : ''}</div>`;
  return img + btns;
}
async function viewStudent() {
  S.me = await api('/me');
  const tab = S.stab || 'meetings', P = S.pub, myId = S.me.studentId;
  const [meetings, items, sum, roster] = await Promise.all([api('/meetings'), api('/items'), api('/items/summary'), api('/students/public')]);
  const bring = {}; sum.forEach(i => { if (i.studentId) (bring[i.studentId] = bring[i.studentId] || []).push(i.badge || i.name); });
  const tabs = [['meetings', 'الاجتماعات'], ['students', 'الطلاب وما سيحضرونه'], ['mine', 'أغراضي']];
  const meet = meetings.length ? `<div class="grid g2">${meetings.map(m => `<div class="card mcard">${dateBlock(m.startsAt)}<div class="body"><h3>${esc(m.title)}</h3><div class="muted">${esc(m.description)}</div>
      <div class="muted">${fmtDate(m.startsAt, { weekday: 'long' })} · ${fmtTime(m.startsAt)}</div><div style="margin-top:.4rem">${meetingBadge(m)}</div>
      <div class="actions">${m.isOpen ? `<button class="btn sm" onclick="go('#/room/${m.id}')">دخول الاجتماع</button>` : '<span class="muted">سيظهر زر الدخول عندما يفتح المشرف الاجتماع.</span>'}</div></div></div>`).join('')}</div>`
    : '<div class="card empty"><b>لا يوجد اجتماع</b>عندما ينشئ المشرف اجتماعاً سيظهر لك هنا مباشرة.</div>';
  const list = [...roster].sort((a, b) => (b.id === myId) - (a.id === myId));
  const stu = list.length ? `<div class="grid g3">${list.map(s => `<div class="card scard ${s.id === myId ? 'me' : ''}"><div class="avatar">${esc(ini(s.name))}</div><div><b>${esc(s.name)}</b> ${s.id === myId ? '<span class="badge blue">أنت</span>' : ''}
      <div style="margin-top:.3rem">${bring[s.id] ? bring[s.id].map(t => `<span class="badge item">${esc(t)}</span>`).join(' ') : '<span class="muted">لم يُسند له غرض بعد</span>'}</div></div></div>`).join('')}</div>`
    : '<div class="card empty"><b>لا يوجد طلاب بعد</b></div>';
  const mine = items.length ? `<div class="grid g3">${items.map(it => `<div class="card"><h3>${esc(it.name)}</h3>${it.badge ? `<span class="badge item">${esc(it.badge)}</span>` : ''}${it.notes ? `<p class="muted">${esc(it.notes)}</p>` : ''}${itemPhotoBlock(it, true)}</div>`).join('')}</div>`
    : '<div class="card empty"><b>لا توجد أغراض مسندة إليك</b>إذا أسند لك المشرف غرضاً فسيظهر هنا فوراً.</div>';
  app.innerHTML = `<header class="topbar">${LOGO()}<span class="name">${esc(P.clubName)}</span><span class="grow"></span><span class="role muted">${esc(S.me.name)}</span>
    <button class="btn ghost sm" data-act="contacts">${ic('chat', 18)} الرسائل${S.me.unread ? ` <span class="badge item">${S.me.unread}</span>` : ''}</button><button class="btn ghost sm" data-act="logout">خروج</button></header>
  <main class="shell" style="grid-template-columns:1fr;max-width:980px"><div>
    <div class="page-head"><div><h2>${esc(P.welcome)}</h2><div class="date">${todayAr()}</div></div></div>
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" class="${k === tab ? 'on' : ''}" data-act="stab" data-t="${k}">${l}</button>`).join('')}</div>
    ${tab === 'students' ? stu : tab === 'mine' ? mine : meet}</div></main>`;
}

/* ========== الرسائل الفردية الخاصة (مثل واتساب) ========== */
let CH = null; // { mode: 'list' } أو { mode: 'thread', key }
const ROLE_AR = { student: 'طالب', supervisor: 'مشرف', assistant: 'مساعد' };
function openContacts() {
  CH = { mode: 'list' };
  openDlg(`<h3>${ic('chat', 22)} الرسائل</h3><p class="muted" style="margin:.2rem 0 .8rem">رسائل فردية خاصة، لا يراها إلا أنت والطرف الآخر.</p><div id="clist"><div class="muted">جارٍ التحميل…</div></div><div class="foot"><button class="btn ghost" id="cx">إغلاق</button></div>`, 'chatdlg');
  $('#cx').onclick = closeDlg; dlg.addEventListener('close', () => { CH = null; }, { once: true });
  loadContacts();
}
async function loadContacts() {
  if (!CH || CH.mode !== 'list' || !$('#clist')) return;
  try {
    const cs = await api('/chat/contacts');
    $('#clist').innerHTML = cs.length ? `<ul class="plist">${cs.map(c => `<li><button class="crow" data-act="chat" data-key="${esc(c.key)}" data-name="${esc(c.name)}"><span class="avatar sm">${esc(ini(c.name))}</span><span><b>${esc(c.name)}</b> <span class="muted">${ROLE_AR[c.role]}</span></span>${c.unread ? `<span class="badge item">${c.unread}</span>` : ''}</button></li>`).join('')}</ul>` : '<div class="empty">لا يوجد أشخاص آخرون بعد.</div>';
  } catch (e) { $('#clist').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}
function openChat(key, name) {
  CH = { mode: 'thread', key };
  openDlg(`<h3>${ic('chat', 22)} ${esc(name)}</h3><div class="chat" id="cmsgs" aria-live="polite"><div class="muted">جارٍ التحميل…</div></div>
    <img id="cprev" class="photo-prev hidden" alt="معاينة الصورة" style="max-height:120px">
    <form id="cform" class="cbar"><label class="iconbtn" title="إرفاق صورة" aria-label="إرفاق صورة">${ic('clip', 22)}<input type="file" id="cimg" accept="image/jpeg,image/png,image/webp" hidden></label>
      <input id="ctext" type="text" maxlength="1000" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn sm" id="csend">إرسال</button></form>
    <div class="err" id="cerr" role="alert"></div><div class="foot"><button class="btn ghost" id="cb">رجوع للقائمة</button><button class="btn ghost" id="cx">إغلاق</button></div>`, 'chatdlg');
  $('#cx').onclick = closeDlg; $('#cb').onclick = openContacts;
  dlg.addEventListener('close', () => { CH = null; }, { once: true });
  let blob = null;
  $('#cimg').onchange = async e => {
    const f = e.target.files[0]; blob = null; $('#cprev').classList.add('hidden'); $('#cerr').textContent = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $('#cerr').textContent = 'الصيغ المقبولة: JPEG أو PNG أو WebP.'; return; }
    blob = await compressImage(f); $('#cprev').src = URL.createObjectURL(blob); $('#cprev').classList.remove('hidden');
  };
  $('#cform').onsubmit = async e => {
    e.preventDefault(); const text = $('#ctext').value.trim();
    if (!text && !blob) return;
    $('#csend').disabled = true; $('#cerr').textContent = '';
    try {
      const fd = new FormData(); fd.append('text', text); if (blob) fd.append('image', blob, 'chat.jpg');
      await api('/chat/with/' + encodeURIComponent(key), { method: 'POST', body: fd });
      $('#ctext').value = ''; blob = null; $('#cimg').value = ''; $('#cprev').classList.add('hidden'); await loadChat();
    } catch (er) { $('#cerr').textContent = er.message + ' (رسالتك لم تُرسل، أعد المحاولة)'; }
    $('#csend').disabled = false;
  };
  loadChat();
}
async function loadChat() {
  if (!CH || CH.mode !== 'thread' || !$('#cmsgs')) return;
  try {
    const ms = await api('/chat/with/' + encodeURIComponent(CH.key)), box = $('#cmsgs'), atEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80 || !box.dataset.n;
    box.innerHTML = ms.length ? ms.map(m => `<div class="msg ${m.mine ? 'mine' : ''}">${m.image ? `<img src="${m.image}" alt="صورة مرسلة" data-act="zoom" data-src="${m.image}">` : ''}${m.text ? `<div>${esc(m.text)}</div>` : ''}<small>${fmtTime(m.at)}</small></div>`).join('')
      : '<div class="empty" style="padding:1rem">ابدأ المحادثة بأول رسالة.</div>';
    box.dataset.n = ms.length; if (atEnd) box.scrollTop = box.scrollHeight;
  } catch (e) { if ($('#cmsgs')) $('#cmsgs').innerHTML = `<div class="err">${esc(e.message)}</div>`; }
}

/* رفع صورة الغرض (للطالب المسؤول فقط) */
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}
function startPhotoUpload(id) {
  let blob = null;
  openDlg(`<h3>إدراج صورة الغرض</h3><p class="muted">اختر صورة من جهازك أو التقطها بالكاميرا. تُضغط تلقائياً (الحد الأقصى 25 ميجابايت، والصيغ: JPEG وPNG وWebP).</p>
    <input id="pf" type="file" accept="image/jpeg,image/png,image/webp" aria-label="اختيار صورة"><img id="pp" class="photo-prev hidden" alt="معاينة الصورة">
    <div class="progress hidden" id="pg"><i></i></div><div class="err" id="perr" role="alert"></div>
    <div class="foot"><button class="btn ghost" id="px">إلغاء</button><button class="btn" id="ps" disabled>تأكيد ورفع الصورة</button></div>`);
  $('#px').onclick = closeDlg;
  $('#pf').onchange = async e => {
    const f = e.target.files[0]; $('#perr').textContent = ''; blob = null; $('#ps').disabled = true; $('#pp').classList.add('hidden');
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $('#perr').textContent = 'الصيغ المقبولة: JPEG أو PNG أو WebP.'; return; }
    if (f.size > 25 * 1048576) { $('#perr').textContent = 'الصورة كبيرة جداً. اختر صورة أصغر من 25 ميجابايت.'; return; }
    blob = await compressImage(f);
    $('#pp').src = URL.createObjectURL(blob); $('#pp').classList.remove('hidden'); $('#ps').disabled = false;
  };
  $('#ps').onclick = () => {
    if (!blob) return; $('#ps').disabled = true; $('#perr').textContent = ''; $('#pg').classList.remove('hidden');
    const fd = new FormData(); fd.append('image', blob, 'item.jpg');
    const x = new XMLHttpRequest(); x.open('POST', `/api/items/${id}/photo`); x.withCredentials = true;
    x.upload.onprogress = ev => { if (ev.lengthComputable) $('#pg i').style.width = Math.round(ev.loaded / ev.total * 100) + '%'; };
    x.onload = () => {
      let d = {}; try { d = JSON.parse(x.responseText); } catch {}
      if (x.status === 200) { closeDlg(); toast('تم رفع صورة الغرض.'); route(); }
      else { $('#perr').textContent = (d.error || 'فشل رفع الصورة.') + ' يمكنك المحاولة مرة أخرى.'; $('#ps').disabled = false; }
    };
    x.onerror = () => { $('#perr').textContent = 'انقطع الاتصال أثناء الرفع. غرضك محفوظ، أعد المحاولة.'; $('#ps').disabled = false; };
    x.send(fd);
  };
}

/* ========== الإدارة ========== */
async function viewAdmin(pg) {
  const nav = staffNav(), P = S.pub, cur = nav.find(n => n[0] === pg);
  app.innerHTML = `<header class="topbar"><button class="menu-btn" data-act="menu" aria-label="القائمة">☰</button>${LOGO()}<span class="name">${esc(P.clubName)}</span><button class="btn ghost sm" data-act="rename" title="تغيير اسم المجموعة">✎ تغيير الاسم</button><button class="btn ghost sm" data-act="contacts">${ic('chat', 18)} الرسائل${S.me.unread ? ` <span class="badge item">${S.me.unread}</span>` : ''}</button><span class="grow"></span>
    <span class="role badge">${S.me.role === 'supervisor' ? 'المشرف' : 'مساعد المشرف'} · ${esc(S.me.name)}</span><span class="conn muted"><i class="dot"></i>متصل</span><button class="btn ghost sm" data-act="logout">خروج</button></header>
    <div class="shell"><nav class="side" id="side" aria-label="التنقل">${nav.map(n => `<button class="${n[0] === pg ? 'on' : ''}" onclick="go('#/a/${n[0]}')">${ic(n[2], 20)}${n[1]}</button>`).join('')}</nav>
    <main id="main"><div class="empty">جارٍ التحميل…</div></main></div>`;
  const html = await PAGES[pg](cur);
  $('#main').innerHTML = html;
}
const head = (t, d, btn = '') => `<div class="page-head"><div><h2>${t}</h2><div class="muted">${d}</div></div><div>${btn}</div></div>`;
const canDo = k => (S.me.perms || {})[k];

const PAGES = {
  async home() {
    const [ov, meetings, students] = await Promise.all([api('/overview'), api('/meetings'), canDo('students') ? api('/students') : Promise.resolve([])]);
    const cur = meetings.filter(m => m.isOpen || new Date(m.startsAt) > new Date()).slice(0, 5);
    return `${head('الرئيسية', todayAr())}
    <div class="grid g4">${[['طلاب مسجلون', ov.students], ['اجتماعات مفتوحة', ov.openMeetings], ['حاضرون الآن', ov.presentNow], ['أغراض مسندة', ov.assignedItems]].map(([l, n]) => `<div class="card stat"><b>${n}</b><span>${l}</span></div>`).join('')}</div>
    <div class="grid g2" style="margin-top:1rem"><section class="card"><h3>الاجتماعات الحالية</h3>
      ${cur.length ? cur.map(m => `<div class="mcard" style="margin-top:1rem">${dateBlock(m.startsAt)}<div class="body"><b>${esc(m.title)}</b> ${meetingBadge(m)}<div class="muted">${esc(m.description)} ${fmtTime(m.startsAt)}</div>
        ${canDo('meetings') ? `<div class="actions"><button class="btn sm" data-act="start" data-id="${m.id}">بدء الاجتماع</button></div>` : ''}</div></div>`).join('') : '<div class="empty">لا توجد اجتماعات قادمة.</div>'}</section>
      <section class="card"><h3>الطلاب</h3>${students.length ? `<ul class="plist">${students.slice(0, 8).map(s => `<li><span>${esc(s.name)}</span>${s.here ? '<span class="badge green">حاضر الآن</span>' : '<span class="badge gray">غير متصل</span>'}</li>`).join('')}</ul>` : '<div class="empty">لم يُضف أي طالب بعد.</div>'}</section></div>`;
  },

  async meetings() {
    const ms = await api('/meetings'), c = canDo('meetings');
    return `${head('الاجتماعات', 'أنشئ اجتماعاً وسيظهر فوراً لجميع الطلاب.', c ? '<button class="btn" data-act="mNew">إنشاء اجتماع</button>' : '')}
    ${ms.length ? `<div class="grid g3">${ms.map(m => `<div class="card mcard">${dateBlock(m.startsAt)}<div class="body"><h3>${esc(m.title)}</h3><div class="muted">${esc(m.description)}</div>
      <div class="muted">${fmtDate(m.startsAt, { weekday: 'long' })} · ${fmtTime(m.startsAt)}</div><div class="muted">المشاركون: ${m.participants}</div><div style="margin:.3rem 0">${meetingBadge(m)}</div>
      <div class="actions"><button class="btn sm" onclick="go('#/room/${m.id}')">دخول</button>${c ? `<button class="btn ghost sm" data-act="mToggle" data-id="${m.id}" data-open="${m.isOpen ? 0 : 1}">${m.isOpen ? 'إغلاق' : 'فتح'}</button><button class="btn ghost sm" data-act="mEdit" data-id="${m.id}">تعديل</button><button class="btn ghost sm" data-act="mDel" data-id="${m.id}">حذف</button>` : ''}</div></div></div>`).join('')}</div>`
      : '<div class="card empty"><b>لا توجد اجتماعات</b>اضغط «إنشاء اجتماع» وسيظهر للطلاب مباشرة.</div>'}`;
  },

  async students() {
    const ss = await api('/students'), sup = S.me.role === 'supervisor';
    return `${head('الطلاب والأعضاء', 'أضف الأعضاء وتابع حضورهم ومهامهم.', '<button class="btn" data-act="sNew">إضافة عضو</button>')}
    ${ss.length ? `<div class="card tablewrap"><table class="table"><thead><tr><th>الاسم</th><th>الغرض المسؤول عنه</th><th>الحضور</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>
    ${ss.map(s => `<tr><td><b>${esc(s.name)}</b></td><td>${s.items.length ? s.items.map(i => `<span class="badge item">${esc(i.badge || i.name)}</span>`).join(' ') : '<span class="muted">لا يوجد</span>'}</td>
      <td>${s.attended} اجتماع${s.lastSeen ? `<div class="muted" style="font-size:.85rem">آخر حضور ${fmtDate(s.lastSeen, { day: 'numeric', month: 'short' })}</div>` : ''}</td>
      <td>${s.here ? '<span class="badge green">حاضر الآن</span>' : '<span class="badge gray">غير متصل</span>'}</td>
      <td><div class="actions" style="margin:0"><button class="btn ghost sm" data-act="chat" data-key="student:${s.id}" data-name="${esc(s.name)}">${ic('chat', 16)} محادثة${s.unread ? ` <span class="badge item">${s.unread}</span>` : ''}</button><button class="btn ghost sm" data-act="sEdit" data-id="${s.id}" data-name="${esc(s.name)}">تعديل</button><button class="btn ghost sm" data-act="sLink" data-id="${s.id}">رمز ربط جهاز</button>${s.linked ? `<button class="btn ghost sm" data-act="sReset" data-id="${s.id}">فك الأجهزة</button>` : ''}${sup ? `<button class="btn ghost sm" data-act="sDel" data-id="${s.id}" data-name="${esc(s.name)}">حذف</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="card empty"><b>لا يوجد طلاب بعد</b>اضغط «إضافة عضو» أو دع الطلاب يسجلون أنفسهم من صفحة الدخول.</div>'}`;
  },

  async items() {
    const its = await api('/items'), c = canDo('items');
    return `${head('الأغراض والمهام', 'اربط كل غرض بالطالب المسؤول عنه، وسيظهر له فوراً.', c ? '<button class="btn" data-act="iNew">إضافة غرض</button>' : '')}
    ${its.length ? `<div class="grid g3">${its.map(it => `<div class="card"><h3>${esc(it.name)}</h3><div class="muted">${esc(it.notes)}</div>
      <p style="margin:.5rem 0">المسؤول: <b>${it.studentName ? esc(it.studentName) : 'لم يحدد بعد'}</b></p>
      ${it.badge ? `<span class="badge item">${esc(it.badge)}</span>` : ''} ${it.allowPhoto ? '<span class="badge gray">يُسمح بإرفاق صورة</span>' : ''}
      ${it.photo ? `<img class="item-photo" src="${it.photo}" alt="صورة ${esc(it.name)}" data-act="zoom" data-src="${it.photo}" tabindex="0">` : (it.allowPhoto ? '<p class="muted" style="font-size:.9rem">بانتظار صورة الطالب.</p>' : '')}
      ${c ? `<div class="actions"><button class="btn ghost sm" data-act="iEdit" data-id="${it.id}">تعديل</button><button class="btn ghost sm" data-act="iDel" data-id="${it.id}" data-name="${esc(it.name)}">حذف</button></div>` : ''}</div>`).join('')}</div>`
      : '<div class="card empty"><b>لا توجد أغراض</b>أضف غرضاً واربطه بالطالب المسؤول.</div>'}`;
  },

  async bringers() {
    const its = await api('/items'), by = {};
    its.forEach(i => { const k = i.studentName || '\u0000'; (by[k] = by[k] || []).push(i); });
    const keys = Object.keys(by).sort((a, b) => a.localeCompare(b, 'ar'));
    return `${head('من سيحضر الأغراض', 'نظرة سريعة على المسؤول عن كل غرض.')}
    ${its.length ? keys.map(k => `<section class="card" style="margin-bottom:1rem"><h3>${k === '\u0000' ? 'غير مسند بعد' : esc(k)}</h3><ul class="plist">${by[k].map(i => `<li><span>${esc(i.name)} ${i.badge ? `<span class="badge item">${esc(i.badge)}</span>` : ''}</span><span>${i.photo ? `<button class="btn ghost sm" data-act="zoom" data-src="${i.photo}">عرض الصورة</button>` : (i.allowPhoto ? '<span class="muted">بانتظار الصورة</span>' : '')}</span></li>`).join('')}</ul></section>`).join('')
      : '<div class="card empty"><b>لا توجد أغراض</b>أضف الأغراض من صفحة «الأغراض».</div>'}`;
  },


  async settings() {
    const P = S.pub, sup = S.me.role === 'supervisor';
    const ap = { meetings: 'إدارة الاجتماعات (إنشاء/فتح/إغلاق)', students: 'إضافة وتعديل الطلاب', items: 'إدارة الأغراض والتعيين', moderation: 'التحكم بالصوت والكاميرا والإخراج' };
    S.assist = (await api('/settings/admin')).assistantPerms;
    const staff = sup ? await api('/staff') : [];
    return `${head('الإعدادات', 'عدّل اسم المجموعة والنص الترحيبي الذي يظهر فوق الواجهات للجميع.')}
    <form class="card" id="setf"><label for="cn">اسم المجموعة</label><input id="cn" type="text" value="${esc(P.clubName)}" maxlength="60">
      <label for="wl">العبارة الترحيبية</label><input id="wl" type="text" value="${esc(P.welcome)}" maxlength="120">
      <label class="check"><input type="checkbox" id="ac" ${P.allowCamera ? 'checked' : ''}>السماح بالكاميرا</label>
      <label class="check"><input type="checkbox" id="am" ${P.allowMic ? 'checked' : ''}>السماح بالمايك</label>
      <h3 style="margin-top:1.6rem">صلاحيات المساعد</h3>
      ${Object.entries(ap).map(([k, l]) => `<label class="check"><input type="checkbox" data-ap="${k}" ${S.assist[k] ? 'checked' : ''}>${l}</label>`).join('')}
      <div class="err" id="serr2" role="alert"></div><div class="actions"><button class="btn">حفظ إعدادات المجموعة</button></div></form>
    <section class="card" style="margin-top:1rem"><h3>زخرفة شعار «عطاء» في الخلفية</h3>
      <p class="muted">ارفع شعار عطاء الأصلي (PNG بخلفية شفافة). يظهر بشفافية خفيفة جداً في الخلفية.</p>
      ${P.ataa.hasLogo ? `<img src="/api/logo?v=${Date.now()}" alt="شعار عطاء" style="max-width:120px;display:block;margin:.5rem 0">` : '<p class="badge gray">لم يُرفع الشعار بعد</p>'}
      <label class="check"><input type="checkbox" id="ae" ${P.ataa.enabled ? 'checked' : ''}>إظهار الزخرفة</label>
      <label for="ao">الشفافية (من 3 إلى 7)</label><input id="ao" type="number" min="3" max="7" step="1" value="${P.ataa.opacity}">
      <div class="actions"><input id="lf" type="file" accept="image/png,image/jpeg,image/webp" aria-label="ملف الشعار"><button class="btn" id="lu">رفع الشعار</button><button class="btn ghost" id="ls">حفظ إعداد الزخرفة</button>${P.ataa.hasLogo ? '<button class="btn ghost" id="ld">إزالة الشعار</button>' : ''}</div></section>
    ${sup ? `<section class="card" style="margin-top:1rem"><h3>أسماء المشرفين والمساعدين</h3>${staff.length ? `<ul class="plist">${staff.map(x => `<li><span>${esc(x.name)} <span class="muted">${x.role === 'supervisor' ? 'مشرف' : 'مساعد'}</span></span><button class="btn ghost sm" data-act="staffDel" data-id="${x.id}" data-name="${esc(x.name)}">حذف</button></li>`).join('')}</ul>` : '<p class="muted">لا توجد أسماء مسجّلة بعد.</p>'}</section>` : ''}
    ${sup ? `<section class="card" style="margin-top:1rem"><h3>تغيير رموز الدخول</h3><form id="cf"><label for="cur">رمز المشرف الحالي</label><input id="cur" type="password" autocomplete="off">
      <label for="cr">الرمز المراد تغييره</label><select id="cr"><option value="supervisor">رمز المشرف</option><option value="assistant">رمز المساعد</option></select>
      <label for="nc">الرمز الجديد (4 خانات على الأقل)</label><input id="nc" type="password" autocomplete="off"><div class="err" id="cerr" role="alert"></div><div class="actions"><button class="btn">تغيير الرمز</button></div></form></section>` : ''}`;
  },
};

/* ========== الإجراءات (أزرار) ========== */
const meetingFields = m => `<label for="mt">اسم الاجتماع</label><input id="mt" name="title" type="text" maxlength="80" value="${esc(m ? m.title : '')}">
  <label for="mw">التاريخ والوقت (بتوقيت الرياض)</label><input id="mw" name="when" type="datetime-local" value="${m ? toInput(m.startsAt) : ''}">
  <label for="md">وصف اختياري</label><textarea id="md" name="description" maxlength="300">${esc(m ? m.description : '')}</textarea>`;
async function itemForm(it) {
  const ss = await api('/students/public');
  formDlg(it ? 'تعديل الغرض' : 'إضافة غرض', `<label for="in">اسم الغرض</label><input id="in" name="name" type="text" maxlength="80" value="${esc(it ? it.name : '')}">
    <label for="is">الطالب المسؤول</label><select id="is" name="studentId"><option value="">بدون تعيين</option>${ss.map(s => `<option value="${s.id}" ${it && it.studentId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
    <label for="ib">النص الظاهر على الشارة</label><input id="ib" name="badge" type="text" maxlength="40" placeholder="مثال: بيجيب الماء" value="${esc(it ? it.badge : '')}">
    <label for="ino">ملاحظات اختيارية</label><textarea id="ino" name="notes" maxlength="300">${esc(it ? it.notes : '')}</textarea>
    <label class="check"><input type="checkbox" name="allowPhoto" ${it && it.allowPhoto ? 'checked' : ''}>السماح للطالب بإرفاق صورة الغرض</label>
    <p class="muted" style="font-size:.88rem">يظهر زر «إدراج صورة الغرض» للطالب المسؤول فقط. لا يمكن للمشرف رفع الصورة نيابةً عنه.</p>`,
    async fd => {
      const body = { name: fd.get('name'), studentId: fd.get('studentId') || null, badge: fd.get('badge'), notes: fd.get('notes'), allowPhoto: !!fd.get('allowPhoto') };
      if (!body.name.trim()) throw new Error('اسم الغرض مطلوب.');
      await api(it ? '/items/' + it.id : '/items', { method: it ? 'PUT' : 'POST', body });
      toast('تم حفظ الغرض.'); route();
    }, 'حفظ الغرض');
}
const A = {
  rename: () => formDlg('تغيير اسم المجموعة', `<p class="muted">الاسم الجديد يظهر فوراً لجميع الطلاب والمشرفين.</p><label for="gn">اسم المجموعة</label><input id="gn" name="clubName" type="text" maxlength="60" value="${esc(S.pub.clubName)}">`,
    async fd => { const v = String(fd.get('clubName') || '').trim(); if (v.length < 2) throw new Error('اكتب اسماً للمجموعة (حرفان على الأقل).'); const old = S.pub.ataa.v; S.pub = await api('/group-name', { method: 'PUT', body: { clubName: v } }); S.pub.ataa.v = old; document.title = S.pub.clubName; toast('تم تغيير اسم المجموعة للجميع.'); route(); }, 'حفظ الاسم'),
  chat: d => openChat(d.key, d.name),
  contacts: () => openContacts(),
  stab: d => { S.stab = d.t; route(); },
  logout, menu: () => $('#side').classList.toggle('open'),
  zoom: d => { openDlg(`<img src="${esc(d.src)}" alt="صورة الغرض مكبّرة"><div class="foot"><button class="btn" id="zc">إغلاق</button></div>`, 'wide'); $('#zc').onclick = closeDlg; $('#zc').focus(); },
  photo: d => startPhotoUpload(d.id),
  photoDel: async d => { if (await confirmBox('حذف الصورة', 'هل تريد حذف صورة الغرض؟', 'حذف')) { await api(`/items/${d.id}/photo`, { method: 'DELETE' }); toast('تم حذف الصورة.'); route(); } },
  start: async d => { await api(`/meetings/${d.id}/toggle`, { method: 'POST', body: { open: true } }); go('#/room/' + d.id); },
  mNew: () => formDlg('إنشاء اجتماع', meetingFields(null), async fd => {
    if (!fd.get('title').trim() || !fd.get('when')) throw new Error('اكتب اسم الاجتماع واختر التاريخ والوقت.');
    await api('/meetings', { method: 'POST', body: { title: fd.get('title'), startsAt: fromInput(fd.get('when')), description: fd.get('description') } }); toast('تم إنشاء الاجتماع.'); route();
  }, 'إنشاء الاجتماع'),
  mEdit: async d => { const m = (await api('/meetings')).find(x => x.id === d.id); formDlg('تعديل الاجتماع', meetingFields(m), async fd => {
    if (!fd.get('title').trim() || !fd.get('when')) throw new Error('اكتب اسم الاجتماع واختر التاريخ والوقت.');
    await api('/meetings/' + d.id, { method: 'PUT', body: { title: fd.get('title'), startsAt: fromInput(fd.get('when')), description: fd.get('description') } }); toast('تم حفظ التعديل.'); route();
  }); },
  mToggle: async d => { await api(`/meetings/${d.id}/toggle`, { method: 'POST', body: { open: d.open === '1' } }); toast(d.open === '1' ? 'تم فتح الاجتماع.' : 'تم إغلاق الاجتماع.'); route(); },
  mDel: async d => { if (await confirmBox('حذف الاجتماع', 'سيُحذف الاجتماع ويُخرج منه المشاركون. هل أنت متأكد؟', 'حذف')) { await api('/meetings/' + d.id, { method: 'DELETE' }); toast('تم حذف الاجتماع.'); route(); } },
  sNew: () => formDlg('إضافة عضو', '<label for="sn">اسم الطالب</label><input id="sn" name="name" type="text" maxlength="60">', async fd => { await api('/students', { method: 'POST', body: { name: fd.get('name') } }); toast('تمت إضافة الطالب.'); route(); }, 'إضافة'),
  sEdit: d => formDlg('تعديل الطالب', `<label for="sn">اسم الطالب</label><input id="sn" name="name" type="text" maxlength="60" value="${esc(d.name)}">`, async fd => { await api('/students/' + d.id, { method: 'PUT', body: { name: fd.get('name') } }); toast('تم حفظ الاسم.'); route(); }),
  sDel: async d => { if (await confirmBox('حذف الطالب', `سيُحذف «${d.name}» وتصبح أغراضه «بدون تعيين» وتُؤرشف صور أغراضه. هل أنت متأكد؟`, 'حذف')) { await api('/students/' + d.id, { method: 'DELETE' }); toast('تم حذف الطالب.'); route(); } },
  sLink: async d => { const r = await api(`/students/${d.id}/link-code`, { method: 'POST' }); openDlg(`<h3>رمز ربط جهاز جديد</h3><p>أعطِ هذا الرمز للطالب ليدخله في صفحة الدخول من جهازه الجديد. صالح لمدة ${r.minutes} دقيقة ويُستخدم مرة واحدة.</p><p style="font-family:var(--head);font-size:2.6rem;text-align:center;letter-spacing:.2em" dir="ltr">${r.code}</p><div class="foot"><button class="btn" id="lk">تم</button></div>`); $('#lk').onclick = closeDlg; },
  sReset: async d => { if (await confirmBox('فك ارتباط الأجهزة', 'سيُفصل الطالب عن أجهزته، ومن يختار اسمه أولاً سيربطه بجهازه. تابع فقط إذا فقد الطالب جهازه.', 'فك الارتباط')) { await api(`/students/${d.id}/reset-devices`, { method: 'POST' }); toast('تم فك ارتباط الأجهزة.'); route(); } },
  iNew: () => itemForm(null),
  iEdit: async d => itemForm((await api('/items')).find(x => x.id === d.id)),
  iDel: async d => { if (await confirmBox('حذف الغرض', `هل تريد حذف «${d.name}»؟ ستُؤرشف صورته إن وجدت.`, 'حذف')) { await api('/items/' + d.id, { method: 'DELETE' }); toast('تم حذف الغرض.'); route(); } },
  staffDel: async d => { if (await confirmBox('حذف الاسم', `سيُحذف اسم «${d.name}» من القائمة، وإن كان داخلاً فسيُطلب منه الدخول من جديد.`, 'حذف')) { await api('/staff/' + d.id, { method: 'DELETE' }); toast('تم حذف الاسم.'); route(); } },
};
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT') return;
  const fn = A[el.dataset.act]; if (!fn) return;
  try { await fn(el.dataset, el); } catch (er) { toast(er.message, true); }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('img[data-act]')) e.target.click(); });

/* ========== الإعدادات: ربط الأحداث بعد الرسم ========== */
S.assist = { meetings: true, students: true, items: true, moderation: true };
new MutationObserver(() => {
  const f = $('#setf'); if (!f || f.dataset.bound) return; f.dataset.bound = 1;
  f.onsubmit = async e => {
    e.preventDefault();
    const ap = {}; document.querySelectorAll('[data-ap]').forEach(c => ap[c.dataset.ap] = c.checked);
    try { S.pub = await api('/settings', { method: 'PUT', body: { clubName: $('#cn').value, welcome: $('#wl').value, allowCamera: $('#ac').checked, allowMic: $('#am').checked, assistantPerms: ap } }); S.assist = ap; toast('تم حفظ إعدادات المجموعة.'); }
    catch (er) { $('#serr2').textContent = er.message; }
  };
  const save = async b => { S.pub = await api('/settings', { method: 'PUT', body: b }); S.pub.ataa.v = Date.now(); paintBg(); };
  $('#ls').onclick = async () => { try { await save({ ataa: { enabled: $('#ae').checked, opacity: Number($('#ao').value) } }); toast('تم حفظ إعداد الزخرفة.'); } catch (er) { toast(er.message, true); } };
  $('#lu').onclick = async () => {
    const f = $('#lf').files[0]; if (!f) return toast('اختر ملف الشعار أولاً.', true);
    const fd = new FormData(); fd.append('image', f);
    try { S.pub = await api('/settings/logo', { method: 'POST', body: fd }); S.pub.ataa.v = Date.now(); paintBg(); toast('تم رفع شعار عطاء.'); route(); } catch (er) { toast(er.message, true); }
  };
  if ($('#ld')) $('#ld').onclick = async () => { try { S.pub = await api('/settings/logo', { method: 'DELETE' }); paintBg(); route(); } catch (er) { toast(er.message, true); } };
  if ($('#cf')) $('#cf').onsubmit = async e => {
    e.preventDefault();
    try { await api('/settings/codes', { method: 'PUT', body: { current: $('#cur').value, role: $('#cr').value, newCode: $('#nc').value } }); toast('تم تغيير الرمز.'); e.target.reset(); $('#cerr').textContent = ''; }
    catch (er) { $('#cerr').textContent = er.message; }
  };
}).observe(document.body, { childList: true, subtree: true });

/* ========== تحديث فوري ========== */
let syncT = null;
function startEvents() {
  const es = new EventSource('/api/events');
  es.onmessage = () => {
    clearTimeout(syncT);
    syncT = setTimeout(async () => {
      try { const v = S.pub && S.pub.ataa.v, np = await api('/public'); np.ataa.v = v; S.pub = np; document.title = np.clubName; if (S.me.role) S.me = await api('/me'); } catch {}
      if (typeof roomSync === 'function' && location.hash.startsWith('#/room/')) return roomSync();
      const h = location.hash;
      if (CH && $('#cmsgs')) { loadChat(); return; }
      if (CH && $('#clist')) { loadContacts(); return; }
      if (dlg.open || h.startsWith('#/in/') || h.includes('/settings') || !S.me.role) return;
      route();
    }, 300);
  };
}

/* ========== الإقلاع ========== */
(async function boot() {
  try { S.pub = await api('/public'); S.pub.ataa.v = 1; S.me = await api('/me'); }
  catch (e) { app.innerHTML = `<div class="center"><div class="card gate"><h2>تعذر الاتصال</h2><p>${esc(e.message)}</p><button class="btn block" onclick="location.reload()">إعادة المحاولة</button></div></div>`; return; }
  document.title = S.pub.clubName;
  paintBg(); startEvents(); route();
})();
