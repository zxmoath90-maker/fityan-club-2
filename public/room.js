'use strict';
/* غرفة الاجتماع على طراز Teams — صوت وفيديو حقيقيان عبر LiveKit (WebRTC)
   وكل أدوات الإشراف (كتم، كاميرات، مشاركة الشاشة، إخراج) داخل الغرفة نفسها. */
let RM = null;
const LK_SRC = 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.umd.js';
function loadLK() {
  return new Promise((res, rej) => {
    if (window.LivekitClient) return res();
    const s = document.createElement('script'); s.src = LK_SRC; s.onload = res;
    s.onerror = () => rej(new Error('تعذر تحميل مكتبة الاتصال. تأكد من الإنترنت ثم أعد المحاولة.'));
    document.head.append(s);
  });
}
const roleOf = id => id.startsWith('supervisor:') ? 'مشرف' : id.startsWith('assistant:') ? 'مساعد' : 'طالب';
const backHash = () => S.me.role === 'student' ? '#/s' : '#/a/meetings';
const isMod = () => S.me.role !== 'student' && canDo('moderation');
const bringHtml = id => {
  const l = id.startsWith('student:') ? ((RM && RM.itemsBy) || {})[id.slice(8)] : null;
  return l ? l.map(t => `<span class="badge item">${esc(t)}</span>`).join(' ') : '';
};

/* ---------- شاشة ما قبل الدخول ---------- */
async function viewRoomGate(mid) {
  const m = (await api('/meetings')).find(x => x.id === mid);
  if (!m) { toast('الاجتماع غير موجود.', true); return go(backHash()); }
  const staff = S.me.role !== 'student', canOpen = staff && canDo('meetings');
  let blocked = '';
  if (!m.isOpen && !canOpen) blocked = 'هذا الاجتماع مغلق حالياً. سيظهر لك الدخول عندما يفتحه المشرف.';
  else if (!S.pub.livekit) blocked = 'خدمة الصوت والفيديو غير مفعّلة بعد. يحتاج المسؤول إلى إضافة مفاتيح LiveKit (راجع ملف README).';
  app.innerHTML = `<div class="center"><div class="card gate ready">${LOGO()}
    <div class="badge green" style="margin-top:.8rem"><i class="dot"></i>غرفة جاهزة للدخول</div>
    <h2 style="margin-top:.6rem">${esc(m.title)}</h2><p class="muted">${esc(m.description)}</p>
    <p>${meetingBadge(m)} <span class="muted">${fmtDate(m.startsAt, { weekday: 'long', day: 'numeric', month: 'long' })} · ${fmtTime(m.startsAt)}</span></p>
    <p class="muted" style="font-size:.92rem">تدخل والمايك والكاميرا متوقفان، وتشغّلهما بنفسك عند الحاجة.</p>
    ${blocked ? `<p class="err">${blocked}</p>` : ''}
    <div class="row" style="display:flex;flex-direction:column;gap:.7rem;margin-top:1rem">
      <button class="btn block" id="rj" ${blocked ? 'disabled' : ''}>${staff && !m.isOpen ? 'بدء الاجتماع' : 'دخول الاجتماع'}</button>
      <button class="btn ghost block" onclick="go('${backHash()}')">العودة للقائمة</button></div></div></div>`;
  $('#rj').onclick = async () => { $('#rj').disabled = true; try { await startRoom(m); } catch (e) { toast(e.message, true); $('#rj').disabled = false; } };
}

/* ---------- الدخول للغرفة ---------- */
async function startRoom(m) {
  await loadLK();
  const j = await api(`/meetings/${m.id}/join`, { method: 'POST', body: {} });
  const L = LivekitClient;
  const room = new L.Room({ adaptiveStream: true, dynacast: true,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  RM = { m, room, key: j.key, perms: j.perms, hb: null, left: false, state: 'connecting', itemsBy: {}, mod: null };
  const redraw = () => { if (RM && !RM.left) { drawTiles(); drawSide(); drawControls(); } };
  [L.RoomEvent.ParticipantConnected, L.RoomEvent.ParticipantDisconnected, L.RoomEvent.TrackMuted, L.RoomEvent.TrackUnmuted,
   L.RoomEvent.LocalTrackPublished, L.RoomEvent.LocalTrackUnpublished, L.RoomEvent.ActiveSpeakersChanged].forEach(ev => room.on(ev, redraw));
  room.on(L.RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === 'audio') { const el = track.attach(); el.dataset.sid = track.sid; $('#audios').append(el); }
    redraw();
  });
  room.on(L.RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(e => e.remove()); redraw(); });
  room.on(L.RoomEvent.ConnectionStateChanged, s => { if (RM) { RM.state = s; drawConn(); } });
  room.on(L.RoomEvent.MediaDevicesError, e => toast(mediaErr(e, ''), true));
  room.on(L.RoomEvent.Disconnected, reason => {
    if (!RM || RM.left) return;
    const removed = L.DisconnectReason && reason === L.DisconnectReason.PARTICIPANT_REMOVED;
    const closed = L.DisconnectReason && reason === L.DisconnectReason.ROOM_DELETED;
    leaveRoom(removed ? 'أُخرجت من الاجتماع.' : closed ? 'تم إغلاق الاجتماع.' : 'انقطع الاتصال بالاجتماع.');
  });
  drawRoomShell(m);
  try { await room.connect(j.url, j.token); await room.startAudio().catch(() => {}); }
  catch (e) { await leaveRoom('', false); throw new Error('تعذر الاتصال بغرفة الاجتماع. تحقق من الإنترنت وأعد المحاولة.'); }
  RM.state = 'connected';
  RM.hb = setInterval(heartbeat, 10000); heartbeat();
  window.addEventListener('pagehide', beaconLeave);
  await loadSummary(); loadMod(); redraw(); drawConn();
}

function drawRoomShell(m) {
  app.innerHTML = `<div class="room teams"><div class="head">${LOGO()}<div class="ttl"><b>${esc(m.title)}</b><small>${esc(S.pub.clubName)}</small></div><span style="flex:1"></span>
    <span id="rconn" class="muted"></span><button class="chip" id="rppl" aria-label="المشاركون">${ic('users', 18)}<span id="pc">0</span></button></div>
    <div class="main"><div class="stage"><div class="tiles" id="tiles"></div></div>
    <aside class="panel" id="rside"><h3>المشاركون</h3><div id="modtop" class="modtop"></div><ul class="plist" id="pl"></ul>
      <h3 style="margin-top:1.2rem">من سيحضر الأغراض</h3><ul class="plist" id="isum"></ul></aside></div>
    <div class="bar" id="ctl"></div><div id="audios" class="hidden"></div></div>`;
  $('#rppl').onclick = () => $('#rside').classList.toggle('open');
}
function drawConn() {
  const el = $('#rconn'); if (!el || !RM) return;
  const s = RM.state, ok = s === 'connected', bad = s === 'disconnected';
  el.innerHTML = `<i class="dot ${ok ? '' : bad ? 'off' : 'warn'}"></i>${ok ? 'متصل' : bad ? 'غير متصل' : s === 'connecting' ? 'جارٍ الاتصال…' : 'إعادة الاتصال…'}`;
}

/* ---------- المربعات (مثل Teams): الاسم ثم ما سيحضره ---------- */
function drawTiles() {
  const el = $('#tiles'); if (!el || !RM) return;
  const T = LivekitClient.Track, R = RM.room;
  const ps = [R.localParticipant, ...R.remoteParticipants.values()];
  const tile = (p, screen) => {
    const d = document.createElement('div'), nm = esc(p.name || p.identity) + (p.isLocal ? ' (أنت)' : '');
    d.className = 'tile' + (screen ? ' screen' : '') + (!screen && p.isSpeaking ? ' speaking' : '');
    const pub = p.getTrackPublication(screen ? T.Source.ScreenShare : T.Source.Camera);
    const on = pub && pub.track && !pub.isMuted;
    if (on) {
      const v = pub.track.attach(); v.muted = true; v.playsInline = true; d.append(v);
      d.classList.add('vid');
      d.insertAdjacentHTML('beforeend', `<div class="vw"><span class="nm"><span class="gem sm">${screen ? 'شاشة ' : ''}${nm}</span></span>${screen ? '' : bringHtml(p.identity)}</div>`);
    } else {
      d.insertAdjacentHTML('beforeend', `<div class="namebox"><span class="sparks" aria-hidden="true"></span><span class="gem">${nm}</span></div><div class="rl">${roleOf(p.identity)}</div>${bringHtml(p.identity) ? `<div class="bg">${bringHtml(p.identity)}</div>` : ''}`);
    }
    if (!screen && !p.isMicrophoneEnabled) d.insertAdjacentHTML('beforeend', `<span class="mm" title="المايك متوقف">${ic('micoff', 16)}</span>`);
    return d;
  };
  el.innerHTML = '';
  const share = ps.map(p => ({ p, pub: p.getTrackPublication(T.Source.ScreenShare) })).find(x => x.pub && x.pub.track);
  if (share) {
    el.classList.add('share'); el.append(tile(share.p, true));
    const strip = document.createElement('div'); strip.className = 'strip'; ps.forEach(p => strip.append(tile(p, false))); el.append(strip);
  } else { el.classList.remove('share'); ps.forEach(p => el.append(tile(p, false))); }
}

/* ---------- اللوحة الجانبية + أدوات الإشراف داخل الاجتماع ---------- */
function modBtn(a, label, extra = '') { return `<button class="btn ghost sm" data-act="rmod" data-a="${a}" ${extra}>${label}</button>`; }
function drawSide() {
  if (!RM || !$('#pl')) return;
  const R = RM.room, ps = [R.localParticipant, ...R.remoteParticipants.values()];
  $('#pc').textContent = ps.length;
  if (isMod()) {
    const so = RM.mod && RM.mod.screenOff;
    $('#modtop').innerHTML = `<button class="btn gold sm" data-act="rmod" data-a="muteAll">إغلاق مايكات جميع الطلاب</button>
      <button class="btn gold sm" data-act="rmod" data-a="camOffAll">إغلاق كاميرات جميع الطلاب</button>
      <button class="btn ${so ? 'gold' : 'ghost'} sm" data-act="rmod" data-a="screenAll" data-val="${so ? 1 : 0}">${so ? 'السماح بمشاركة الشاشة للجميع' : 'إيقاف مشاركة الشاشة للجميع'}</button>`;
    const list = RM.mod ? RM.mod.ps : [];
    $('#pl').innerHTML = list.length ? list.map(p => {
      const stu = p.role === 'student', k = `data-key="${esc(p.key)}" data-name="${esc(p.name)}"`;
      const sc = (what, on, onL, offL) => modBtn('perm', on ? onL : offL, `${k} data-what="${what}" data-val="${on ? 0 : 1}"`);
      return `<li class="mrow"><div><b>${esc(p.name)}</b> <span class="muted">${roleOf(p.key)}${p.key === RM.key ? ' (أنت)' : ''}</span>
        ${p.mic ? '<span class="st">مايك</span>' : ''}${p.cam ? '<span class="st">كاميرا</span>' : ''}${p.screen ? '<span class="st">شاشة</span>' : ''}</div>
        ${bringHtml(p.key) ? `<div style="margin-top:.25rem">${bringHtml(p.key)}</div>` : ''}
        ${stu ? `<div class="mc">${modBtn('mute', 'كتم', k)}${sc('mic', p.perms.mic, 'منع المايك', 'السماح بالمايك')}${sc('cam', p.perms.cam, 'منع الكاميرا', 'السماح بالكاميرا')}${sc('screen', p.perms.screen, 'إيقاف مشاركته', 'السماح بالمشاركة')}${modBtn('remove', 'إخراج', k)}</div>` : ''}</li>`;
    }).join('') : '<li class="muted">لا يوجد مشاركون الآن</li>';
  } else {
    $('#modtop').innerHTML = '';
    $('#pl').innerHTML = ps.map(p => `<li><span><b>${esc(p.name || p.identity)}</b>${p.isLocal ? ' (أنت)' : ''} <span class="muted">${roleOf(p.identity)}</span>${bringHtml(p.identity) ? `<div style="margin-top:.2rem">${bringHtml(p.identity)}</div>` : ''}</span><span class="muted">${p.isMicrophoneEnabled ? 'مايك' : ''} ${p.isCameraEnabled ? 'كاميرا' : ''}</span></li>`).join('');
  }
}
async function loadMod() {
  if (!RM || !isMod()) return;
  try {
    const [ps, me] = await Promise.all([api(`/meetings/${RM.m.id}/participants`), api(`/meetings/${RM.m.id}/me`)]);
    if (RM) { RM.mod = { ps, screenOff: me.screenOff }; drawSide(); }
  } catch {}
}
async function loadSummary() {
  try {
    const its = await api('/items/summary');
    if (!RM) return; RM.itemsBy = {};
    its.forEach(i => { if (i.studentId) (RM.itemsBy[i.studentId] = RM.itemsBy[i.studentId] || []).push(i.badge || i.name); });
    $('#isum').innerHTML = its.length ? its.map(i => `<li><span class="badge item">${esc(i.badge || i.name)}</span><span class="muted">${i.studentName ? esc(i.studentName) : 'لم يحدد بعد'}</span></li>`).join('') : '<li class="muted">لا توجد أغراض.</li>';
    drawTiles(); drawSide();
  } catch {}
}
Object.assign(A, {
  rmod: async d => {
    if (!RM) return; const body = { action: d.a };
    if (d.key) body.key = d.key;
    if (d.a === 'perm') { body.what = d.what; body.value = d.val === '1'; }
    if (d.a === 'screenAll') body.value = d.val === '1';
    if (d.a === 'remove' && !(await confirmBox('إخراج مشارك', `هل تريد إخراج «${d.name}» من الاجتماع؟`, 'إخراج'))) return;
    await api(`/meetings/${RM.m.id}/mod`, { method: 'POST', body });
    toast({ muteAll: 'تم كتم مايكات جميع الطلاب.', camOffAll: 'تم إغلاق كاميرات جميع الطلاب.', mute: 'تم كتم الطالب.', remove: 'تم إخراج الطالب.',
      screenAll: d.val === '1' ? 'تم السماح بمشاركة الشاشة للجميع.' : 'تم إيقاف مشاركة الشاشة للجميع.', perm: 'تم تحديث الصلاحية.' }[d.a] || 'تم.');
    loadMod();
  },
});

/* ---------- شريط التحكم السفلي ---------- */
function drawControls() {
  const c = $('#ctl'); if (!c || !RM) return;
  const lp = RM.room.localParticipant, P = RM.perms;
  const canShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  const btn = (id, on, i1, i0, l1, l0, allowed) => `<button class="cbtn ${on ? 'on' : 'off'}" id="${id}" ${allowed || on ? '' : 'disabled title="أوقفها المشرف"'}><span class="ci">${ic(on ? i1 : i0, 24)}</span><small>${on ? l1 : l0}</small></button>`;
  c.innerHTML = btn('cm', lp.isMicrophoneEnabled, 'mic', 'micoff', 'إيقاف المايك', 'تشغيل المايك', P.mic)
    + btn('cc', lp.isCameraEnabled, 'cam', 'camoff', 'إيقاف الكاميرا', 'تشغيل الكاميرا', P.cam)
    + (canShare ? btn('cs', lp.isScreenShareEnabled, 'screen', 'screen', 'إيقاف المشاركة', 'مشاركة الشاشة', P.screen) : '')
    + `<button class="cbtn leave" id="cl"><span class="ci">${ic('x', 24)}</span><small>مغادرة الاجتماع</small></button>`;
  $('#cm').onclick = () => rmToggle('mic'); $('#cc').onclick = () => rmToggle('cam');
  if ($('#cs')) $('#cs').onclick = () => rmToggle('screen'); $('#cl').onclick = () => leaveRoom('');
}
function mediaErr(e, kind) {
  const n = (e && e.name) || '', what = { mic: 'المايك', cam: 'الكاميرا', screen: 'مشاركة الشاشة' }[kind] || 'الجهاز';
  if (n === 'NotAllowedError' || /permission|denied/i.test((e && e.message) || '')) return kind === 'screen' ? 'لم تبدأ مشاركة الشاشة (أُلغيت أو مُنعت).' : `تم رفض إذن ${what}. اسمح للمتصفح باستخدامه من إعدادات الموقع ثم أعد المحاولة.`;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return `لم نجد ${what} في جهازك.`;
  if (n === 'NotReadableError') return `${what} مشغول بتطبيق آخر. أغلقه وأعد المحاولة.`;
  return `تعذر تشغيل ${what}.`;
}
async function rmToggle(kind) {
  if (!RM) return; const lp = RM.room.localParticipant, P = RM.perms;
  try {
    if (kind === 'mic') { if (!P.mic && !lp.isMicrophoneEnabled) return toast('المايك غير متاح لك الآن.', true); await lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled); }
    if (kind === 'cam') { if (!P.cam && !lp.isCameraEnabled) return toast('الكاميرا غير متاحة لك الآن.', true); await lp.setCameraEnabled(!lp.isCameraEnabled); }
    if (kind === 'screen') { if (!P.screen && !lp.isScreenShareEnabled) return toast('مشاركة الشاشة موقوفة الآن من المشرف.', true); await lp.setScreenShareEnabled(!lp.isScreenShareEnabled); }
  } catch (e) { toast(mediaErr(e, kind), true); }
  if (RM) { drawControls(); drawTiles(); heartbeat(); }
}
async function heartbeat() {
  if (!RM || RM.left) return; const lp = RM.room.localParticipant;
  try { await api(`/meetings/${RM.m.id}/presence`, { method: 'POST', body: { mic: lp.isMicrophoneEnabled, cam: lp.isCameraEnabled, screen: lp.isScreenShareEnabled } }); }
  catch (e) { if (e.status === 404) api(`/meetings/${RM.m.id}/join`, { method: 'POST', body: {} }).catch(() => {}); }
}
async function roomSync() {
  if (!RM || RM.left) return;
  try {
    const r = await api(`/meetings/${RM.m.id}/me`);
    if (!r.isOpen) return leaveRoom('أغلق المشرف الاجتماع.');
    RM.perms = r.perms; drawControls(); loadSummary(); loadMod();
  } catch (e) { if (e.status === 404) leaveRoom('تم حذف الاجتماع.'); }
}
function beaconLeave() { if (RM && !RM.left) navigator.sendBeacon(`/api/meetings/${RM.m.id}/leave`, new Blob(['{}'], { type: 'application/json' })); }
function stopAll() {
  if (!RM || RM.left) return false;
  RM.left = true; clearInterval(RM.hb); window.removeEventListener('pagehide', beaconLeave);
  const { room, m } = RM;
  try { room.localParticipant.trackPublications.forEach(p => p.track && p.track.stop()); } catch {}
  try { room.disconnect(); } catch {}
  api(`/meetings/${m.id}/leave`, { method: 'POST', body: {} }).catch(() => {});
  document.querySelectorAll('#audios audio').forEach(a => a.remove());
  RM = null; return true;
}
async function leaveRoom(msg, nav = true) { const had = stopAll(); if (msg) toast(msg); if (nav && had !== false) go(backHash()); }
function leaveRoomSilently() { stopAll(); }
