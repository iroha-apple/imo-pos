// ============================================================
//  芋を出す。POS2026  ― アプリ本体
//  ※ ふだん書き換える必要はありません。設定は firebase-config.js だけです。
// ============================================================
import { firebaseConfig } from './firebase-config.js';
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, collection, query, where, onSnapshot, getDoc, getDocs,
  setDoc, runTransaction, serverTimestamp, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ================= 基本設定 ================= */
const EMAIL_DOMAIN = 'imopos.example.com';   // ログインIDを内部でメール形式にするための飾り（実在しなくてよい）
const TAG_COUNT = 10;
const OPEN_HOUR = 10, CLOSE_HOUR = 18;
const EVENT_DAYS = ['2026-11-01', '2026-11-02', '2026-11-03'];
const ROLES = {
  register: { label: 'レジ', sub: '会計・タグ' },
  A:        { label: 'キッチンA', sub: '芋ボール＋ドリンク' },
  B:        { label: 'キッチンB', sub: '焼き芋＋ドリンク' },
  handoff:  { label: '受け渡し', sub: 'タグ回収' },
  admin:    { label: '管理・日報', sub: '売上・照合・設定' },
};
const DEFAULT_MENU = [
  { id: 'ball_plain',    group: '芋ボール', short: 'プレーン',         price: 300, kitchen: 'A' },
  { id: 'ball_honey',    group: '芋ボール', short: 'ハニー',           price: 350, kitchen: 'A' },
  { id: 'ball_butter',   group: '芋ボール', short: 'バター',           price: 350, kitchen: 'A' },
  { id: 'ball_sugar',    group: '芋ボール', short: 'シュガー',         price: 350, kitchen: 'A' },
  { id: 'ball_cinnamon', group: '芋ボール', short: 'シナモン',         price: 350, kitchen: 'A' },
  { id: 'yaki_normal',   group: '焼き芋',   short: 'ノーマル',         price: 300, kitchen: 'B' },
  { id: 'yaki_cheese',   group: '焼き芋',   short: 'チーズブリュレ',   price: 500, kitchen: 'B' },
  { id: 'yaki_custard',  group: '焼き芋',   short: 'カスタードブリュレ', price: 600, kitchen: 'B' },
  { id: 'drink_coffee',  group: 'ドリンク', short: 'ホットコーヒー',   price: 150, setPrice: 100, kitchen: 'any' },
  { id: 'drink_milktea', group: 'ドリンク', short: 'ホットミルクティー', price: 150, setPrice: 100, kitchen: 'any' },
  { id: 'drink_bocha',   group: 'ドリンク', short: '加賀棒茶',         price: 150, setPrice: 100, kitchen: 'any' },
  { id: 'drink_apple',   group: 'ドリンク', short: 'リンゴジュース',   price: 150, setPrice: 100, kitchen: 'any' },
].map((m, i) => ({
  ...m,
  name: m.kitchen === 'any' ? m.short : `${m.group} ${m.short}`,
  type: m.kitchen === 'any' ? 'drink' : 'food',
  setPrice: m.setPrice ?? null,
  active: true,
  order: i,
}));
const DENOMS = [10000, 5000, 1000, 500, 100, 50, 10];

const LOGO = `<svg viewBox="0 0 66 44" aria-hidden="true"><g transform="rotate(-14 33 22)">
<ellipse cx="31" cy="23" rx="27" ry="13.5" fill="#8E5FCC" stroke="#2E1A47" stroke-width="2.5"/>
<ellipse cx="52" cy="23" rx="6.5" ry="11" fill="#FFC83D" stroke="#2E1A47" stroke-width="2.5"/>
<path d="M14 18q5-4 10-1M20 28q6 3 12 0" stroke="#5A2F8F" stroke-width="2" fill="none" stroke-linecap="round"/>
<circle cx="52" cy="20" r="1.6" fill="#E0A500"/><circle cx="50" cy="26" r="1.3" fill="#E0A500"/></g>
<path d="M58 6q-3 3 0 6t0 6M64 3q-3 3 0 6t0 6" stroke="#FFC83D" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;

/* ================= 小さな道具 ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const yen = n => (n < 0 ? '−' : '') + '¥' + Math.abs(Math.round(n || 0)).toLocaleString('ja-JP');
const jst = ms => new Date((ms ?? Date.now()) + 9 * 3600e3);
const dayOf = ms => jst(ms).toISOString().slice(0, 10);
const todayStr = () => dayOf(Date.now());
const hm = ms => ms ? jst(ms).toISOString().slice(11, 16) : '--:--';
const hms = ms => ms ? jst(ms).toISOString().slice(11, 19) : '--:--:--';
const rid = () => Math.random().toString(36).slice(2, 10);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const dayLabel = d => { const [, m, dd] = d.split('-'); return `${Number(m)}/${Number(dd)}`; };
const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } };
class AppError extends Error {}

/* ================= 状態 ================= */
const S = {
  configured: !!firebaseConfig && !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).includes('ここに'),
  authChecked: false, user: null, profile: null,
  role: lsGet('imopos.role'),
  day: todayStr(),
  menu: [], tags: {}, orders: [], settings: { warnYellow: 5, warnRed: 10 },
  cart: {}, received: 0, chosenTag: null,
  sync: { loaded: {}, cache: {}, pending: {}, busy: 0, last: null, offlineSince: null, state: 'connecting' },
  acting: false, forceRender: true,
  admin: { tab: 'report', date: EVENT_DAYS.includes(todayStr()) ? todayStr() : todayStr(), half: false },
  edit: null, loginRole: null,
};
const SYNC_KEYS = ['menu', 'tags', 'orders', 'settings'];
let fbApp, auth, db, unsubs = [];

/* ================= 起動 ================= */
if (S.configured) {
  fbApp = initializeApp(firebaseConfig);
  auth = getAuth(fbApp);
  db = getFirestore(fbApp);
  onAuthStateChanged(auth, onAuth);
} else {
  render();
}
window.addEventListener('online', updateSync);
window.addEventListener('offline', updateSync);
setInterval(() => {
  if (S.user && todayStr() !== S.day) { S.day = todayStr(); startListeners(); }
  updateBanner();
}, 1000);
setInterval(() => { if (S.user && ['A', 'B', 'register', 'handoff'].includes(S.role) && !S.acting) render(); }, 15000);

async function onAuth(u) {
  S.authChecked = true;
  if (!u) { stopListeners(); S.user = null; S.profile = null; closeModal(); render(); return; }
  S.user = u;
  const loginId = (u.email || '').split('@')[0];
  S.profile = { id: u.uid, loginId, name: loginId };
  try {
    const ref = doc(db, 'users', u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) S.profile = { id: u.uid, loginId, ...snap.data() };
    else await setDoc(ref, { loginId, name: loginId, createdAtMs: Date.now() });
  } catch (e) { console.warn(e); }
  if (S.loginRole) { S.role = S.loginRole; lsSet('imopos.role', S.role); S.loginRole = null; }
  S.forceRender = true;
  startListeners();
  render();
}
const me = () => S.profile?.name || S.profile?.loginId || '?';

/* ================= リアルタイム受信 ================= */
function stopListeners() { unsubs.forEach(u => { try { u(); } catch { /* */ } }); unsubs = []; S.sync.loaded = {}; S.sync.cache = {}; S.sync.pending = {}; }
function startListeners() {
  stopListeners();
  S.day = todayStr();
  const opt = { includeMetadataChanges: true };
  const onErr = key => e => { console.error(key, e); toast('受信エラー：' + (e.code || e.message), 'err'); };
  const changed = snap => snap.docChanges().length > 0;
  unsubs.push(onSnapshot(collection(db, 'menu'), opt, snap => {
    const first = !S.sync.loaded.menu;
    S.menu = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    noteMeta('menu', snap); if (first || changed(snap)) liveRender();
  }, onErr('menu')));
  unsubs.push(onSnapshot(collection(db, 'tags'), opt, snap => {
    const first = !S.sync.loaded.tags;
    const t = {}; snap.docs.forEach(d => { t[d.id] = d.data(); }); S.tags = t;
    noteMeta('tags', snap); if (first || changed(snap)) liveRender();
  }, onErr('tags')));
  unsubs.push(onSnapshot(query(collection(db, 'orders'), where('day', '==', S.day), where('status', '==', 'open')), opt, snap => {
    const first = !S.sync.loaded.orders;
    S.orders = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.createdAtMs - b.createdAtMs);
    noteMeta('orders', snap); if (first || changed(snap)) liveRender();
  }, onErr('orders')));
  unsubs.push(onSnapshot(doc(db, 'settings', 'app'), opt, snap => {
    const first = !S.sync.loaded.settings;
    if (snap.exists()) S.settings = { warnYellow: 5, warnRed: 10, ...snap.data() };
    noteMeta('settings', snap); if (first || !snap.metadata.hasPendingWrites) liveRender();
  }, onErr('settings')));
}
function noteMeta(key, snap) {
  S.sync.loaded[key] = true;
  S.sync.cache[key] = snap.metadata.fromCache;
  S.sync.pending[key] = snap.metadata.hasPendingWrites;
  if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) S.sync.last = Date.now();
  updateSync();
}
function liveRender() {
  render();
  if (S.modalRefresh) S.modalRefresh();
}

/* ================= 同期表示 ================= */
function computeSync() {
  if (!navigator.onLine) return 'offline';
  if (!SYNC_KEYS.every(k => S.sync.loaded[k])) return 'connecting';
  if (SYNC_KEYS.some(k => S.sync.cache[k])) return 'offline';
  if (S.sync.busy > 0 || SYNC_KEYS.some(k => S.sync.pending[k])) return 'sending';
  return 'ok';
}
const isOffline = () => ['offline', 'connecting'].includes(S.sync.state);
function syncInner(st) {
  const label = { ok: '同期OK', sending: '送信中…', connecting: '接続中…', offline: 'オフライン' }[st];
  return `<span class="dot"></span><b>${label}</b><small class="num">${S.sync.last ? hms(S.sync.last) : ''}</small>`;
}
function updateSync() {
  const prevBad = isOffline();
  const st = computeSync();
  S.sync.state = st;
  if (st === 'offline') { if (!S.sync.offlineSince) S.sync.offlineSince = Date.now(); } else S.sync.offlineSince = null;
  const el = document.getElementById('sync');
  if (el) { el.className = 'sync sync-' + st; el.innerHTML = syncInner(st); el.title = '最後に受信した時刻: ' + (S.sync.last ? hms(S.sync.last) : 'まだ'); }
  updateBanner();
  if (prevBad !== isOffline() && S.user && S.role !== 'admin') render();
}
function updateBanner() {
  const b = document.getElementById('banner');
  if (!b) return;
  const show = S.sync.offlineSince && Date.now() - S.sync.offlineSince > 10000;
  b.hidden = !show;
}

/* ================= 操作の共通処理 ================= */
function withTimeout(p, ms = 15000) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
function errMsg(e) {
  if (e instanceof AppError) return e.message;
  if (e?.message === 'timeout') return '通信に時間がかかっています。同期表示を確認して、もう一度押してください';
  const c = e?.code || '';
  if (c.includes('permission-denied')) return '権限がありません（ログインし直してください）';
  if (c.includes('unavailable')) return '通信が切れています。つながってからもう一度押してください';
  return 'エラー：' + (c || e?.message || '不明');
}
async function act(fn, okMsg) {
  if (S.acting) return null;
  if (isOffline()) { toast('通信が切れています。「同期OK」に戻ってからもう一度押してください', 'err'); return null; }
  S.acting = true; S.sync.busy++; updateSync();
  try {
    const r = await withTimeout(fn());
    if (okMsg) toast(okMsg, 'ok');
    return r === undefined ? true : r;
  } catch (e) {
    console.error(e); toast(errMsg(e), 'err'); return null;
  } finally {
    S.acting = false; S.sync.busy--; updateSync();
  }
}
function log(action, detail = {}) {
  setDoc(doc(db, 'logs', `${Date.now()}-${rid()}`), { action, detail, by: me(), uid: S.user?.uid || null, atMs: Date.now(), day: todayStr() })
    .catch(e => console.warn('log', e));
}
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toast').appendChild(t);
  setTimeout(() => t.remove(), type === 'err' ? 5000 : 2600);
}

/* ================= 価格計算（セット割） ================= */
// フードの個数までのドリンクを setPrice（100円）にする。結果は各行の isSet にも書き込む。
function priceLines(lines) {
  const act = lines.filter(l => !l.removed);
  lines.forEach(l => { l.isSet = false; });
  const foodCount = act.filter(l => l.type === 'food').length;
  const drinks = act.filter(l => l.type === 'drink' && l.setPrice != null)
    .sort((a, b) => (b.price - b.setPrice) - (a.price - a.setPrice));
  let setCount = 0, discount = 0;
  drinks.forEach((d, i) => { if (i < foodCount) { d.isSet = true; setCount++; discount += d.price - d.setPrice; } });
  const subtotal = sum(act, l => l.price);
  return { subtotal, setCount, discount, total: subtotal - discount, count: act.length };
}
function makeLine(m) {
  return {
    lineId: rid() + rid(), menuId: m.id, name: m.name, short: m.short || m.name, price: Number(m.price),
    setPrice: m.setPrice == null ? null : Number(m.setPrice), kitchen: m.kitchen, type: m.type,
    status: 'todo', claimedBy: null, doneBy: null, doneAtMs: null, added: false, removed: false, isSet: false,
  };
}
function cartToLines() {
  const lines = [];
  S.menu.forEach(m => { const q = S.cart[m.id] || 0; for (let i = 0; i < q; i++) lines.push(makeLine(m)); });
  return lines;
}
function progress(o) {
  const act = (o.items || []).filter(l => !l.removed);
  const g = { A: { d: 0, t: 0 }, B: { d: 0, t: 0 }, D: { d: 0, t: 0 } };
  act.forEach(l => {
    const k = l.kitchen === 'any' ? (l.claimedBy || 'D') : l.kitchen;
    (g[k] || g.D).t++;
    if (l.status === 'done') (g[k] || g.D).d++;
  });
  const done = act.filter(l => l.status === 'done').length;
  return { ...g, total: act.length, done, ready: act.length > 0 && done === act.length };
}
function summarize(items) {
  const m = new Map();
  items.filter(l => !l.removed).forEach(l => m.set(l.name, (m.get(l.name) || 0) + 1));
  return [...m].map(([n, c]) => c > 1 ? `${n}×${c}` : n).join('、');
}
const tagInUse = n => !!S.tags[String(n)]?.inUse;
const freeTags = () => range(1, TAG_COUNT).filter(n => !tagInUse(n));
const orderById = id => S.orders.find(o => o.id === id);
function groupMenu(menu) {
  const groups = [];
  menu.forEach(m => {
    let g = groups.find(x => x.name === (m.group || 'その他'));
    if (!g) { g = { name: m.group || 'その他', kitchen: m.kitchen, items: [] }; groups.push(g); }
    g.items.push(m);
  });
  return groups;
}
const kitchenLabel = k => ({ A: 'キッチンA', B: 'キッチンB', any: '手の空いている方' }[k] || k);

/* ================= 画面の組み立て ================= */
function render() {
  const root = $('#app');
  if (!S.configured) { root.innerHTML = setupNeededHTML(); return; }
  if (!S.authChecked) { root.innerHTML = `<div class="splash"><div>${LOGO}読み込み中…</div></div>`; return; }
  if (!S.user) { if (!$('#loginForm')) root.innerHTML = loginHTML(); return; }
  if (!S.role || !ROLES[S.role]) {
    root.innerHTML = headerHTML() + `<main>${rolePickHTML()}</main>`; updateSync(); return;
  }
  if (S.role === 'admin' && $('#adminRoot') && !S.forceRender) { refreshAdminLive(); return; }
  const wasAdminFresh = S.role === 'admin';
  S.forceRender = false;
  const scrolls = $$('[data-scroll]').map(el => [el.dataset.scroll, el.scrollTop]);
  const y = window.scrollY;
  const openDetails = $$('details[data-keep]').filter(d => d.open).map(d => d.dataset.keep);
  root.innerHTML = headerHTML() + `<main class="role-${S.role}">${screenHTML()}</main>`;
  openDetails.forEach(k => { const d = $(`details[data-keep="${k}"]`); if (d) d.open = true; });
  scrolls.forEach(([k, v]) => { const el = $(`[data-scroll="${k}"]`); if (el) el.scrollTop = v; });
  window.scrollTo(0, y);
  updateSync();
  if (wasAdminFresh) afterAdminRender();
}
function rerender() { S.forceRender = true; render(); }

function headerHTML() {
  const r = ROLES[S.role];
  return `<header class="top">
    <div class="brand">${LOGO}<div class="title">芋を出す。<span>POS2026</span></div></div>
    <button class="role-pill" data-act="pickRole">${r ? esc(r.label) : '担当を選ぶ'} ▾</button>
    <div id="sync" class="sync"></div>
    <button class="user-btn" data-act="userMenu">${esc(me())} ▾</button>
  </header>
  <div id="banner" class="banner" hidden>⚠ 通信が切れています。Wi-Fi／モバイル回線を確認してください（会計・受け渡しは止めています）</div>`;
}
function screenHTML() {
  if (!S.sync.loaded.menu) return `<div class="empty-big"><span class="em">🍠</span>データを受信中…</div>`;
  if (!S.menu.length && S.role !== 'admin') return emptyMenuHTML();
  switch (S.role) {
    case 'register': return registerHTML();
    case 'A': case 'B': return kitchenHTML(S.role);
    case 'handoff': return handoffHTML();
    case 'admin': return adminHTML();
  }
  return '';
}
function emptyMenuHTML() {
  return `<div class="card" style="max-width:560px;margin:30px auto;text-align:center">
    <h2 style="margin-bottom:10px">はじめての準備</h2>
    <p>メニューとタグのデータがまだありません。<br>下のボタンで、設計書どおりのメニュー12品とタグ1〜10を作ります。</p>
    <button class="btn primary big" data-act="seed">初期データを作る</button></div>`;
}
function setupNeededHTML() {
  return `<div class="setup card"><div class="login-logo">${LOGO}<div class="title">芋を出す。POS2026</div></div>
    <h2>接続設定がまだです</h2>
    <p><code>firebase-config.js</code> に、Firebase の画面に出る設定値（apiKey など）を貼り付けてください。</p>
    <p class="muted">手順はセットアップ手順書の「手順4」を見てください。</p></div>`;
}

/* ---------- ログイン ---------- */
function loginHTML() {
  const last = lsGet('imopos.role') || 'register';
  S.loginRole = last;
  return `<div class="login"><form class="login-card" id="loginForm" autocomplete="on">
    <div class="login-logo">${LOGO}<div class="title">芋を出す。POS2026</div><div class="muted">スタッフ用ログイン</div></div>
    <div class="field"><label for="lid">ログインID</label>
      <input class="input" id="lid" name="username" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="例：s01" required value="${esc(lsGet('imopos.lastId') || '')}"></div>
    <div class="field"><label for="lpw">パスワード</label>
      <input class="input" id="lpw" name="password" type="password" autocomplete="current-password" required></div>
    <div class="field"><label>今日の担当</label><div class="role-grid">
      ${Object.entries(ROLES).map(([k, r]) => `<button type="button" class="role-opt ${k === last ? 'on' : ''}" data-act="loginRole" data-role="${k}">${r.label}<small>${r.sub}</small></button>`).join('')}
    </div></div>
    <p class="err-text" id="loginErr"></p>
    <button class="btn primary big" type="submit" id="loginBtn">ログイン</button>
  </form></div>`;
}
async function doLogin(form) {
  const id = form.lid.value.trim().toLowerCase();
  const pw = form.lpw.value;
  const err = $('#loginErr'); const btn = $('#loginBtn');
  err.textContent = '';
  if (!/^[a-z0-9._-]+$/.test(id)) { err.textContent = 'ログインIDは半角英数字で入力してください'; return; }
  btn.disabled = true; btn.textContent = 'ログイン中…';
  try {
    lsSet('imopos.lastId', id);
    await signInWithEmailAndPassword(auth, `${id}@${EMAIL_DOMAIN}`, pw);
  } catch (e) {
    const c = e.code || '';
    err.textContent = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? 'IDかパスワードが違います'
      : c.includes('too-many-requests') ? '失敗が続いたため一時的にロックされました。少し待ってから試してください'
      : c.includes('network') ? '通信できません。ネット接続を確認してください' : 'ログインできません：' + c;
    btn.disabled = false; btn.textContent = 'ログイン';
  }
}
function rolePickHTML() {
  return `<div class="card" style="max-width:640px;margin:20px auto"><div class="section-title">今日の担当を選んでください</div>
    <div class="role-grid">${Object.entries(ROLES).map(([k, r]) => `<button class="role-opt ${k === S.role ? 'on' : ''}" data-act="setRole" data-role="${k}" style="min-height:80px">${r.label}<small>${r.sub}</small></button>`).join('')}</div></div>`;
}
function setRole(r) { S.role = r; lsSet('imopos.role', r); closeModal(); rerender(); window.scrollTo(0, 0); }

/* ---------- レジ ---------- */
function registerHTML() {
  const groups = groupMenu(S.menu);
  const lines = cartToLines();
  const p = priceLines(lines);
  const free = freeTags();
  const tag = free.includes(S.chosenTag) ? S.chosenTag : (free[0] ?? null);
  const changeAmt = S.received - p.total;
  let reason = '';
  if (!p.count) reason = '商品を選んでください';
  else if (isOffline()) reason = '通信が切れています（同期OKに戻るまで待ってください）';
  else if (!free.length) reason = 'タグが空くまでお待ちください（全10枚使用中）';
  else if (S.received < p.total) reason = '預かり金を入力してください';

  const prod = groups.map(g => `<div class="pgroup k-${g.kitchen}"><h3>${esc(g.name)}<small>${kitchenLabel(g.kitchen)}</small></h3>
    <div class="pgrid">${g.items.map(m => `<button class="pbtn k-${m.kitchen}" data-act="add" data-id="${m.id}" ${m.active ? '' : 'disabled'}>
      <span class="pn">${esc(m.short || m.name)}</span>
      <span class="pp">${m.active ? yen(m.price) + (m.type === 'drink' && m.setPrice != null ? `<em>セット ${yen(m.setPrice)}</em>` : '') : '売り切れ'}</span>
      ${S.cart[m.id] ? `<span class="qty-badge">${S.cart[m.id]}</span>` : ''}</button>`).join('')}</div></div>`).join('');

  const cartRows = S.menu.filter(m => S.cart[m.id]).map(m => {
    const q = S.cart[m.id];
    return `<div class="cline"><div class="nm">${esc(m.name)}<small>${yen(m.price)} × ${q}</small></div>
      <button class="qbtn" data-act="dec" data-id="${m.id}" aria-label="減らす">−</button><span class="q">${q}</span>
      <button class="qbtn" data-act="add" data-id="${m.id}" aria-label="増やす">＋</button><span class="amt">${yen(m.price * q)}</span></div>`;
  }).join('');

  return `<div class="reg">
    <section class="reg-products" data-scroll="prod">${prod}</section>
    <section class="reg-side">
      <div class="card"><div class="row" style="justify-content:space-between;margin-bottom:4px"><b>注文内容</b>
        ${p.count ? `<button class="btn ghost small" data-act="clearCart">全部消す</button>` : ''}</div>
        <div class="cart" data-scroll="cart">${cartRows || '<div class="cart-empty">左の商品ボタンを押してください</div>'}</div>
        <div class="totals">
          <div class="trow"><span>小計（${p.count}点）</span><span class="num">${yen(p.subtotal)}</span></div>
          ${p.setCount ? `<div class="trow disc"><span>セット割 ドリンク${p.setCount}杯</span><span class="num">−${yen(p.discount)}</span></div>` : ''}
          <div class="trow total"><span>合計</span><span class="num">${yen(p.total)}</span></div>
        </div></div>
      <div class="card pay">
        <div class="recv"><span>預かり金</span><b class="num">${yen(S.received)}</b></div>
        <div class="keypad">
          ${['7', '8', '9'].map(k => `<button class="key" data-act="key" data-k="${k}">${k}</button>`).join('')}<button class="key q" data-act="addRecv" data-v="10000">+1万</button>
          ${['4', '5', '6'].map(k => `<button class="key" data-act="key" data-k="${k}">${k}</button>`).join('')}<button class="key q" data-act="addRecv" data-v="5000">+5千</button>
          ${['1', '2', '3'].map(k => `<button class="key" data-act="key" data-k="${k}">${k}</button>`).join('')}<button class="key q" data-act="addRecv" data-v="1000">+千</button>
          <button class="key" data-act="key" data-k="0">0</button><button class="key" data-act="key" data-k="00">00</button><button class="key" data-act="key" data-k="C">C</button><button class="key ex" data-act="exact">ちょうど</button>
        </div>
        ${p.count && S.received > 0 ? (changeAmt >= 0
          ? `<div class="change"><span>おつり</span><b class="num">${yen(changeAmt)}</b></div>`
          : `<div class="change short"><span>あと</span><b class="num">${yen(-changeAmt)} 不足</b></div>`) : ''}
      </div>
      <div class="card">
        <div class="tagpick"><span class="lbl">渡すタグ</span>
          ${range(1, TAG_COUNT).map(n => `<button class="tg ${n === tag ? 'on' : ''}" data-act="pickTag" data-n="${n}" ${tagInUse(n) ? 'disabled' : ''}>${n}</button>`).join('')}</div>
        <p class="muted" style="margin:6px 0 0;font-size:13px">空き ${free.length}枚／${TAG_COUNT}枚（番号を押すと別のタグに変えられます）</p>
      </div>
      <div class="confirm-reason">${esc(reason)}</div>
      <button class="btn primary big" data-act="checkout" ${reason ? 'disabled' : ''}>会計確定</button>
    </section>
  </div>
  ${progressStripHTML()}`;
}
function progressStripHTML() {
  const os = [...S.orders].sort((a, b) => a.tag - b.tag);
  return `<div class="card reg-progress"><div class="row" style="justify-content:space-between;margin-bottom:8px">
    <b>調理の進み具合</b><button class="btn small" data-act="history">注文履歴・修正</button></div>
    <div class="prog-row">${os.length ? os.map(o => {
      const p = progress(o);
      return `<span class="pchip ${p.ready ? 'ready' : ''}"><b>${o.tag}</b>${p.ready ? '受け渡し可' :
        [p.A.t ? `A ${p.A.d}/${p.A.t}` : '', p.B.t ? `B ${p.B.d}/${p.B.t}` : '', p.D.t ? `ドリンク未 ${p.D.t}` : ''].filter(Boolean).join(' ・ ')}</span>`;
    }).join('') : '<span class="muted">調理中の注文はありません</span>'}</div></div>`;
}
function pressKey(k) {
  if (k === 'C') S.received = 0;
  else { const s = String(S.received === 0 ? '' : S.received) + k; S.received = Math.min(Number(s) || 0, 999999); }
  render();
}
async function doCheckout() {
  const lines = cartToLines();
  if (!lines.length) return;
  const p = priceLines(lines);
  if (S.received < p.total) { toast('預かり金が足りません', 'err'); return; }
  const id = `${todayStr()}-${Date.now().toString(36)}-${rid()}`;
  const want = S.chosenTag;
  const received = S.received;
  const res = await act(() => runTransaction(db, async tx => {
    const snaps = [];
    for (const n of range(1, TAG_COUNT)) snaps.push(await tx.get(doc(db, 'tags', String(n))));
    const free = snaps.filter(s => !(s.exists() && s.data().inUse)).map(s => Number(s.id));
    if (!free.length) throw new AppError('タグの空きがありません。受け渡しが終わるまでお待ちください');
    const tag = free.includes(want) ? want : Math.min(...free);
    const now = Date.now();
    tx.set(doc(db, 'orders', id), {
      day: todayStr(), tag, status: 'open', items: lines,
      subtotal: p.subtotal, setCount: p.setCount, discount: p.discount, total: p.total,
      received, change: received - p.total,
      createdAt: serverTimestamp(), createdAtMs: now,
      cashierUid: S.user.uid, cashierName: me(), editCount: 0,
      deliveredBy: null, deliveredAtMs: null,
      history: [{ at: now, by: me(), action: '会計', total: p.total }],
    });
    tx.set(doc(db, 'tags', String(tag)), { inUse: true, orderId: id, sinceMs: now });
    return { tag, moved: want != null && want !== tag };
  }));
  if (!res) return;
  S.cart = {}; S.received = 0; S.chosenTag = null;
  render();
  openModal(`<div class="done-tag"><div class="muted" style="font-weight:800">会計完了</div>
    <div class="bigno">${res.tag}</div>
    <div class="msg">${res.tag}番のタグを渡してください</div>
    ${res.moved ? `<p class="chip o">選んだタグが先に使われたため ${res.tag}番 にしました</p>` : ''}
    <div class="change" style="margin:10px 0"><span>おつり</span><b class="num">${yen(received - p.total)}</b></div>
    <p class="muted">合計 ${yen(p.total)} ／ 預かり ${yen(received)}</p>
    <button class="btn primary big" data-act="closeModal">OK（次のお客様へ）</button></div>`);
}

/* ---------- 注文履歴・修正・取消（レジ） ---------- */
async function openHistory() {
  openModal(`<h2>今日の注文履歴</h2><div id="histBody">読み込み中…</div><div class="modal-actions"><button class="btn" data-act="closeModal">閉じる</button></div>`, 'wide');
  try {
    const snap = await getDocs(query(collection(db, 'orders'), where('day', '==', todayStr())));
    const os = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdAtMs - a.createdAtMs);
    S.histCache = os;
    const st = o => o.status === 'open' ? (progress(o).ready ? '<span class="chip g">受け渡し可</span>' : '<span class="chip">調理中</span>')
      : o.status === 'delivered' ? '<span class="chip y">受け渡し済み</span>' : '<span class="chip r">取消</span>';
    $('#histBody').innerHTML = os.length ? `<ul class="olist">${os.map(o => `<li style="align-items:center">
      <div style="flex:1"><b style="font-size:18px">${o.tag}番</b> <span class="muted">${hm(o.createdAtMs)}</span> ${st(o)}${o.editCount ? ` <span class="chip o">修正${o.editCount}</span>` : ''}
        <div class="muted" style="font-weight:500;font-size:13px">${esc(summarize(o.items))}</div></div>
      <b class="num" style="min-width:70px;text-align:right">${yen(o.total)}</b>
      ${o.status === 'open' ? `<button class="btn small" data-act="editOrder" data-o="${o.id}">修正</button><button class="btn small danger" data-act="cancelOrder" data-o="${o.id}">取消</button>` : ''}
    </li>`).join('')}</ul><p class="muted" style="font-size:13px">受け渡し済みの注文を直すときは、受け渡し画面の「受け渡し履歴」で元に戻してから修正してください。</p>`
      : '<p class="muted">まだ注文はありません</p>';
  } catch (e) { $('#histBody').innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
function openEdit(orderId) {
  const o = orderById(orderId) || S.histCache?.find(x => x.id === orderId);
  if (!o) { toast('注文が見つかりません', 'err'); return; }
  S.edit = { id: o.id, base: JSON.parse(JSON.stringify(o)), remove: new Set(), added: [], reason: '' };
  S.modalRefresh = null;
  renderEdit();
}
function editLines() {
  const e = S.edit;
  return e.base.items.map(l => ({ ...l, removed: l.removed || e.remove.has(l.lineId) })).concat(e.added.map(l => ({ ...l })));
}
function renderEdit() {
  const e = S.edit; if (!e) return;
  const prevReason = $('#editReason'); if (prevReason) e.reason = prevReason.value;
  const lines = editLines();
  const p = priceLines(lines);
  const diff = p.total - e.base.total;
  const rows = e.base.items.filter(l => !l.removed).map(l => {
    const rm = e.remove.has(l.lineId);
    return `<li class="${rm ? 'muted' : ''}"><span style="flex:1;${rm ? 'text-decoration:line-through' : ''}">${esc(l.name)} ${l.status === 'done' ? '<span class="chip g">完成済み</span>' : ''}</span>
      <span class="num">${yen(l.price)}</span>
      <button class="btn small ${rm ? '' : 'danger'}" data-act="editToggle" data-l="${l.lineId}">${rm ? '戻す' : '削除'}</button></li>`;
  }).join('') + e.added.map(l => `<li><span style="flex:1">${esc(l.name)} <span class="badge add">追加</span></span><span class="num">${yen(l.price)}</span>
      <button class="btn small" data-act="editUnadd" data-l="${l.lineId}">×</button></li>`).join('');
  openModal(`<h2>${e.base.tag}番の注文を修正</h2>
    <ul class="olist">${rows}</ul>
    <p style="font-weight:800;margin:14px 0 6px">商品を追加</p>
    <div class="mini-grid">${S.menu.filter(m => m.active).map(m => `<button class="pbtn k-${m.kitchen}" data-act="editAdd" data-id="${m.id}"><span class="pn">${esc(m.short || m.name)}</span><span class="pp">${yen(m.price)}</span></button>`).join('')}</div>
    <div class="totals" style="margin-top:14px">
      <div class="trow"><span>修正前の合計</span><span class="num">${yen(e.base.total)}</span></div>
      ${p.setCount ? `<div class="trow disc"><span>セット割 ${p.setCount}杯</span><span>−${yen(p.discount)}</span></div>` : ''}
      <div class="trow total"><span>修正後の合計</span><span class="num">${yen(p.total)}</span></div></div>
    <div class="diffmsg ${diff > 0 ? 'plus' : diff < 0 ? 'minus' : 'zero'}">${diff > 0 ? `お客様から 追加で <span class="num">${yen(diff)}</span> 受け取る` : diff < 0 ? `お客様に <span class="num">${yen(-diff)}</span> 返す` : '金額の変更はありません'}</div>
    <div class="field" style="margin-top:12px"><label for="editReason">理由（任意）</label><input class="input" id="editReason" value="${esc(e.reason)}" placeholder="例：押し間違い"></div>
    <div class="modal-actions"><button class="btn" data-act="closeModal">やめる</button>
      <button class="btn primary" data-act="editSave" ${p.count ? '' : 'disabled'}>${p.count ? '修正を保存' : '品目が0です（取消を使う）'}</button></div>`, 'wide');
}
async function saveEdit() {
  const e = S.edit; if (!e) return;
  const reason = ($('#editReason')?.value || '').trim();
  const diff = await act(() => runTransaction(db, async tx => {
    const ref = doc(db, 'orders', e.id);
    const s = await tx.get(ref);
    if (!s.exists()) throw new AppError('注文が見つかりません');
    const o = s.data();
    if (o.status !== 'open') throw new AppError('受け渡し済み・取消済みの注文は修正できません');
    const now = Date.now();
    const items = o.items.map(l => e.remove.has(l.lineId) && !l.removed ? { ...l, removed: true, removedBy: me(), removedAtMs: now } : { ...l });
    e.added.forEach(l => items.push({ ...l, added: true }));
    const p = priceLines(items);
    if (!p.count) throw new AppError('品目が0になります。注文ごとやめる場合は「取消」を使ってください');
    const d = p.total - o.total;
    tx.update(ref, {
      items, subtotal: p.subtotal, setCount: p.setCount, discount: p.discount, total: p.total,
      editCount: (o.editCount || 0) + 1,
      history: [...(o.history || []), { at: now, by: me(), action: '修正', diff: d, reason }],
    });
    return { d, tag: o.tag };
  }));
  if (!diff) return;
  log('注文修正', { orderId: e.id, tag: diff.tag, diff: diff.d, reason });
  S.edit = null; closeModal();
  toast(diff.d > 0 ? `修正しました：追加で ${yen(diff.d)} 受け取ってください` : diff.d < 0 ? `修正しました：${yen(-diff.d)} お返ししてください` : '修正しました', 'ok');
}
function openCancel(orderId) {
  const o = orderById(orderId) || S.histCache?.find(x => x.id === orderId);
  if (!o) return;
  openModal(`<h2>${o.tag}番の注文を取り消しますか？</h2>
    <p>${esc(summarize(o.items))}</p>
    <div class="diffmsg minus">お客様に <span class="num">${yen(o.total)}</span> 返す</div>
    <p class="muted">取り消すと売上から外れ、${o.tag}番のタグは空きに戻ります。キッチンの画面からも消えます。</p>
    <div class="field"><label for="cancelReason">理由（任意）</label><input class="input" id="cancelReason" placeholder="例：押し間違い"></div>
    <div class="modal-actions"><button class="btn" data-act="closeModal">やめる</button>
      <button class="btn danger" data-act="cancelConfirm" data-o="${o.id}">取り消す</button></div>`);
}
async function doCancel(orderId) {
  const reason = ($('#cancelReason')?.value || '').trim();
  const r = await act(() => runTransaction(db, async tx => {
    const ref = doc(db, 'orders', orderId);
    const s = await tx.get(ref);
    if (!s.exists()) throw new AppError('注文が見つかりません');
    const o = s.data();
    if (o.status !== 'open') throw new AppError('この注文はもう受け渡し済みか取消済みです');
    const tref = doc(db, 'tags', String(o.tag));
    const t = await tx.get(tref);
    const now = Date.now();
    tx.update(ref, { status: 'cancelled', cancelledBy: me(), cancelledAtMs: now, cancelReason: reason,
      history: [...(o.history || []), { at: now, by: me(), action: '取消', reason }] });
    if (t.exists() && t.data().orderId === orderId) tx.set(tref, { inUse: false, orderId: null, sinceMs: null });
    return o;
  }));
  if (!r) return;
  log('注文取消', { orderId, tag: r.tag, total: r.total, reason });
  closeModal(); toast(`${r.tag}番の注文を取り消しました。${yen(r.total)} お返ししてください`, 'ok');
}

/* ---------- キッチン ---------- */
function kitchenHTML(K) {
  const other = K === 'A' ? 'B' : 'A';
  const mine = l => l.kitchen === K || (l.kitchen === 'any' && (!l.claimedBy || l.claimedBy === K));
  const active = [], finished = [];
  const now = Date.now();
  S.orders.forEach(o => {
    const ls = (o.items || []).filter(l => !l.removed && mine(l));
    if (!ls.length) return;
    if (ls.some(l => l.status !== 'done')) active.push({ o, ls }); else finished.push({ o, ls });
  });
  const pending = new Map();
  active.forEach(({ ls }) => ls.filter(l => l.status !== 'done').forEach(l => {
    const key = l.kitchen === 'any' && !l.claimedBy ? `${l.short}（未）` : l.short;
    pending.set(key, (pending.get(key) || 0) + 1);
  }));
  const pendCount = [...pending.values()].reduce((a, b) => a + b, 0);
  const lineHTML = (o, l) => {
    const drink = l.kitchen === 'any';
    let btns = '';
    if (l.status === 'done') btns = `<span class="chip g">✓ 完成</span><button class="btn small ghost" data-act="line" data-k="undo" data-o="${o.id}" data-l="${l.lineId}">戻す</button>`;
    else if (drink && !l.claimedBy) btns = `<button class="btn small yellow" data-act="line" data-k="claim" data-o="${o.id}" data-l="${l.lineId}">引き受ける</button><button class="btn small green" data-act="line" data-k="done" data-o="${o.id}" data-l="${l.lineId}">完成</button>`;
    else if (drink) btns = `<button class="btn small ghost" data-act="line" data-k="unclaim" data-o="${o.id}" data-l="${l.lineId}">解除</button><button class="btn green" data-act="line" data-k="done" data-o="${o.id}" data-l="${l.lineId}">完成</button>`;
    else btns = `<button class="btn green" data-act="line" data-k="done" data-o="${o.id}" data-l="${l.lineId}">完成</button>`;
    const note = drink ? (l.claimedBy === K ? '<small>引き受け中</small>' : l.status !== 'done' ? '<small>両キッチン共通・先に押した方が担当</small>' : '') : '';
    return `<div class="kl ${l.status === 'done' ? 'done' : ''}"><div class="nm">${esc(l.short || l.name)}${drink ? '<span class="badge drink">ドリンク</span>' : ''}${l.added ? '<span class="badge add">追加</span>' : ''}${note}</div><div class="kb">${btns}</div></div>`;
  };
  const card = ({ o, ls }) => {
    const mins = Math.floor((now - o.createdAtMs) / 60000);
    const w = mins >= S.settings.warnRed ? 'w-r' : mins >= S.settings.warnYellow ? 'w-y' : '';
    const removed = (o.items || []).filter(l => l.removed && (l.kitchen === K || l.claimedBy === K));
    const otherInfo = (() => { const p = progress(o); const g = p[other]; return g.t ? `キッチン${other} ${g.d}/${g.t}` : ''; })();
    return `<div class="kcard ${w}"><div class="kc-head"><span class="tagno">${o.tag}</span>
      <div class="meta">受付 ${hm(o.createdAtMs)}<small>${esc(otherInfo)}</small></div><span class="elapsed num">${mins}分</span></div>
      ${ls.map(l => lineHTML(o, l)).join('')}
      ${removed.map(l => `<div class="kl removed"><div class="nm">${esc(l.short || l.name)}<span class="badge del">取消</span></div></div>`).join('')}</div>`;
  };
  return `<div class="ksum"><span class="big">${ROLES[K].label}</span>
    <span class="chip ${pendCount ? 'o' : 'g'}">未完成 ${pendCount}品</span>
    ${[...pending].map(([n, c]) => `<span class="chip">${esc(n)} ×${c}</span>`).join('')}</div>
    ${active.length ? `<div class="kgrid">${active.map(card).join('')}</div>` : `<div class="empty-big"><span class="em">🍠</span>いま作るものはありません</div>`}
    ${finished.length ? `<details class="kdone" data-keep="kdone"><summary>完成済み・受け渡し待ち（${finished.length}件）… 押し間違いはここで戻す</summary>
      <div class="kgrid">${finished.slice(-8).reverse().map(card).join('')}</div></details>` : ''}`;
}
async function lineAction(orderId, lineId, kind) {
  const K = S.role;
  await act(() => runTransaction(db, async tx => {
    const ref = doc(db, 'orders', orderId);
    const s = await tx.get(ref);
    if (!s.exists()) throw new AppError('注文が見つかりません');
    const o = s.data();
    if (o.status !== 'open') throw new AppError('この注文はもう受け渡し済みか取消済みです');
    const items = o.items.map(l => ({ ...l }));
    const l = items.find(x => x.lineId === lineId);
    if (!l || l.removed) throw new AppError('この品目はレジで取り消されました');
    if (l.kitchen === 'any' && l.claimedBy && l.claimedBy !== K) throw new AppError(`キッチン${l.claimedBy}が先に引き受けました`);
    const now = Date.now();
    if (kind === 'done') {
      if (l.status === 'done') return;
      Object.assign(l, { status: 'done', doneBy: me(), doneAtMs: now });
      if (l.kitchen === 'any') l.claimedBy = K;
    } else if (kind === 'undo') {
      Object.assign(l, { status: 'todo', doneBy: null, doneAtMs: null });
    } else if (kind === 'claim') {
      l.claimedBy = K;
    } else if (kind === 'unclaim') {
      if (l.status === 'done') throw new AppError('完成済みは解除できません（先に「戻す」）');
      l.claimedBy = null;
    }
    tx.update(ref, { items });
  }));
}

/* ---------- 受け渡し ---------- */
function handoffHTML() {
  let ready = 0, cooking = 0;
  const tiles = range(1, TAG_COUNT).map(n => {
    const t = S.tags[String(n)];
    if (!t?.inUse) return `<button class="htile free" disabled><span class="n">${n}</span><span class="st">空き</span></button>`;
    const o = orderById(t.orderId);
    if (!o) return `<button class="htile cooking" data-act="tagInfo" data-n="${n}"><span class="n">${n}</span><span class="st">確認中…</span></button>`;
    const p = progress(o);
    if (p.ready) { ready++; return `<button class="htile ready" data-act="handTile" data-o="${o.id}"><span class="n">${n}</span><span class="st">受け渡し可！</span><span class="pg">${p.total}品そろいました</span></button>`; }
    cooking++;
    const parts = [p.A.t ? `A ${p.A.d}/${p.A.t}` : '', p.B.t ? `B ${p.B.d}/${p.B.t}` : '', p.D.t ? `ドリンク未着手 ${p.D.t}` : ''].filter(Boolean);
    return `<button class="htile cooking" data-act="handTile" data-o="${o.id}"><span class="n">${n}</span><span class="st">調理中</span><span class="pg">${parts.join('<br>')}</span></button>`;
  }).join('');
  return `<div class="hsum"><span class="chip g" style="font-size:16px">受け渡し可 ${ready}</span><span class="chip" style="font-size:16px">調理中 ${cooking}</span>
    <span class="chip y" style="font-size:16px">空き ${freeTags().length}</span><span style="flex:1"></span>
    <button class="btn small" data-act="handHistory">受け渡し履歴</button></div>
    <div class="hgrid">${tiles}</div>
    <p class="muted" style="text-align:center;margin-top:14px">緑に光ったタグを押して、注文内容を確認してから渡してください</p>`;
}
function openHandTile(orderId) {
  const refresh = () => {
    const o = orderById(orderId);
    if (!o) { closeModal(); return; }
    const p = progress(o);
    openModal(`<h2><span class="tagno" style="display:inline-grid;vertical-align:middle;margin-right:8px">${o.tag}</span>${p.ready ? '受け渡しできます' : 'まだ調理中です'}</h2>
      <ul class="olist">${o.items.filter(l => !l.removed).map(l => `<li><span>${esc(l.name)}${l.added ? '<span class="badge add">追加</span>' : ''}</span>
        ${l.status === 'done' ? '<span class="chip g">✓ 完成</span>' : `<span class="chip o">${l.kitchen === 'any' ? (l.claimedBy ? `${l.claimedBy}で調理中` : '未着手') : `${l.kitchen}で調理中`}</span>`}</li>`).join('')}</ul>
      <p class="muted">受付 ${hm(o.createdAtMs)}・レジ ${esc(o.cashierName || '')}</p>
      <div class="modal-actions" style="justify-content:stretch"><button class="btn" data-act="closeModal">閉じる</button>
        ${p.ready ? `<button class="btn green big" style="flex:1" data-act="deliver" data-o="${o.id}">受け渡し完了（タグ回収）</button>` : ''}</div>`);
  };
  S.modalRefresh = refresh;
  refresh();
}
async function doDeliver(orderId) {
  const r = await act(() => runTransaction(db, async tx => {
    const ref = doc(db, 'orders', orderId);
    const s = await tx.get(ref);
    if (!s.exists()) throw new AppError('注文が見つかりません');
    const o = s.data();
    if (o.status !== 'open') throw new AppError('この注文はもう受け渡し済みです');
    if (!progress(o).ready) throw new AppError('まだ全品そろっていません');
    const tref = doc(db, 'tags', String(o.tag));
    const t = await tx.get(tref);
    const now = Date.now();
    tx.update(ref, { status: 'delivered', deliveredBy: me(), deliveredAtMs: now, deliveredAt: serverTimestamp(),
      history: [...(o.history || []), { at: now, by: me(), action: '受け渡し' }] });
    if (t.exists() && t.data().orderId === orderId) tx.set(tref, { inUse: false, orderId: null, sinceMs: null });
    return o.tag;
  }));
  if (!r) return;
  S.modalRefresh = null; closeModal();
  toast(`${r}番 受け渡し完了。タグを回収してレジへ戻してください`, 'ok');
}
async function openHandHistory() {
  S.modalRefresh = null;
  openModal(`<h2>受け渡し履歴（今日）</h2><div id="hhBody">読み込み中…</div><div class="modal-actions"><button class="btn" data-act="closeModal">閉じる</button></div>`);
  try {
    const snap = await getDocs(query(collection(db, 'orders'), where('day', '==', todayStr()), where('status', '==', 'delivered')));
    const os = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.deliveredAtMs || 0) - (a.deliveredAtMs || 0)).slice(0, 15);
    $('#hhBody').innerHTML = os.length ? `<ul class="olist">${os.map(o => `<li style="align-items:center"><div style="flex:1"><b>${o.tag}番</b> <span class="muted">${hm(o.deliveredAtMs)} ${esc(o.deliveredBy || '')}</span>
      <div class="muted" style="font-size:13px;font-weight:500">${esc(summarize(o.items))}</div></div>
      ${o.forced ? '<span class="chip r">強制解放</span>' : `<button class="btn small" data-act="undeliver" data-o="${o.id}" ${tagInUse(o.tag) ? 'disabled title="タグが次の注文で使用中"' : ''}>元に戻す</button>`}</li>`).join('')}</ul>
      <p class="muted" style="font-size:13px">「元に戻す」は、そのタグがまだ次の注文に使われていないときだけ押せます。</p>` : '<p class="muted">まだありません</p>';
  } catch (e) { $('#hhBody').innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
async function doUndeliver(orderId) {
  const r = await act(() => runTransaction(db, async tx => {
    const ref = doc(db, 'orders', orderId);
    const s = await tx.get(ref);
    if (!s.exists()) throw new AppError('注文が見つかりません');
    const o = s.data();
    if (o.status !== 'delivered') throw new AppError('受け渡し済みの注文ではありません');
    const tref = doc(db, 'tags', String(o.tag));
    const t = await tx.get(tref);
    if (t.exists() && t.data().inUse) throw new AppError(`${o.tag}番のタグは次の注文で使われているため戻せません`);
    const now = Date.now();
    tx.update(ref, { status: 'open', deliveredBy: null, deliveredAtMs: null,
      history: [...(o.history || []), { at: now, by: me(), action: '受け渡し取り消し' }] });
    tx.set(tref, { inUse: true, orderId, sinceMs: now });
    return o.tag;
  }));
  if (!r) return;
  log('受け渡し取り消し', { orderId, tag: r });
  closeModal(); toast(`${r}番を「受け渡し前」に戻しました`, 'ok');
}

/* ---------- 管理・日報 ---------- */
const ADMIN_TABS = { report: '日報', cash: '現金照合', menu: 'メニュー', tags: 'タグ', accounts: 'アカウント', settings: '設定' };
function adminHTML() {
  return `<div id="adminRoot"><nav class="tabs">${Object.entries(ADMIN_TABS).map(([k, v]) => `<button class="tab ${S.admin.tab === k ? 'on' : ''}" data-act="adminTab" data-tab="${k}">${v}</button>`).join('')}</nav>
    <div id="adminBody">${adminBodyHTML()}</div></div>`;
}
function adminBodyHTML() {
  switch (S.admin.tab) {
    case 'report': return reportShellHTML();
    case 'cash': return cashShellHTML();
    case 'menu': return menuAdminHTML();
    case 'tags': return tagsAdminHTML();
    case 'accounts': return accountsShellHTML();
    case 'settings': return settingsHTML();
  }
  return '';
}
function afterAdminRender() {
  if (S.admin.tab === 'report') loadReport();
  if (S.admin.tab === 'cash') loadCash();
  if (S.admin.tab === 'accounts') loadAccounts();
}
function refreshAdminLive() {
  if (S.admin.tab === 'tags') { const b = $('#adminBody'); if (b) b.innerHTML = tagsAdminHTML(); }
}
function datePickerHTML(act) {
  const d = S.admin.date;
  return `<div class="row" style="margin-bottom:6px">${EVENT_DAYS.map(x => `<button class="tab ${d === x ? 'on' : ''}" data-act="${act}" data-d="${x}">${dayLabel(x)}</button>`).join('')}
    <button class="tab ${d === todayStr() && !EVENT_DAYS.includes(d) ? 'on' : ''}" data-act="${act}" data-d="${todayStr()}">今日</button>
    <input type="date" class="input" style="width:auto;min-height:44px" id="dateInput" data-act-change="${act}" value="${d}"></div>`;
}

// 日報
function reportShellHTML() {
  return `${datePickerHTML('repDate')}
    <div class="row"><button class="btn small ${S.admin.half ? '' : 'primary'}" data-act="repHalf" data-v="0">1時間ごと</button>
      <button class="btn small ${S.admin.half ? 'primary' : ''}" data-act="repHalf" data-v="1">30分ごと</button><span style="flex:1"></span>
      <button class="btn small" data-act="repReload">↻ 更新</button><button class="btn small yellow" data-act="repMulti">3日間まとめ</button></div>
    <div id="reportArea" style="margin-top:10px">読み込み中…</div>`;
}
async function fetchOrdersOfDay(day) {
  const snap = await getDocs(query(collection(db, 'orders'), where('day', '==', day)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function loadReport() {
  const area = $('#reportArea'); if (!area) return;
  area.innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const orders = await fetchOrdersOfDay(S.admin.date);
    S.admin.reportOrders = orders;
    if ($('#reportArea')) $('#reportArea').innerHTML = reportHTML(orders);
  } catch (e) { area.innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
function computeReport(orders, half) {
  const valid = orders.filter(o => o.status !== 'cancelled');
  const nSlots = (CLOSE_HOUR - OPEN_HOUR) * (half ? 2 : 1);
  const slots = range(0, nSlots - 1).map(i => {
    const mins = OPEN_HOUR * 60 + i * (half ? 30 : 60);
    const lab = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    return { label: lab, sales: 0, count: 0 };
  });
  const outside = { sales: 0, count: 0 };
  const items = new Map();
  valid.forEach(o => {
    const d = jst(o.createdAtMs); const h = d.getUTCHours(), m = d.getUTCMinutes();
    const idx = half ? (h - OPEN_HOUR) * 2 + (m >= 30 ? 1 : 0) : h - OPEN_HOUR;
    const slot = idx >= 0 && idx < nSlots ? slots[idx] : outside;
    slot.sales += o.total; slot.count++;
    (o.items || []).filter(l => !l.removed).forEach(l => {
      const it = items.get(l.menuId) || { name: l.name, type: l.type, count: 0, setCount: 0, amount: 0 };
      it.count++;
      if (l.isSet) { it.setCount++; it.amount += l.setPrice; } else it.amount += l.price;
      items.set(l.menuId, it);
    });
  });
  const list = [...items.values()].sort((a, b) => b.count - a.count || b.amount - a.amount);
  return {
    sales: sum(valid, o => o.total), count: valid.length, discount: sum(valid, o => o.discount),
    slots, outside, items: list,
    drinkSet: sum(list.filter(i => i.type === 'drink'), i => i.setCount),
    drinkSingle: sum(list.filter(i => i.type === 'drink'), i => i.count - i.setCount),
    edits: sum(orders, o => o.editCount), cancels: orders.filter(o => o.status === 'cancelled'),
    open: orders.filter(o => o.status === 'open').length,
  };
}
function reportHTML(orders) {
  const r = computeReport(orders, S.admin.half);
  const max = Math.max(1, ...r.slots.map(s => s.sales));
  return `<div class="kpis">
      <div class="kpi main"><div class="l">${dayLabel(S.admin.date)} の売上</div><div class="v num">${yen(r.sales)}</div></div>
      <div class="kpi"><div class="l">注文数</div><div class="v num">${r.count}件</div></div>
      <div class="kpi"><div class="l">平均単価</div><div class="v num">${r.count ? yen(r.sales / r.count) : '—'}</div></div>
      <div class="kpi"><div class="l">セット割（合計）</div><div class="v num">−${yen(r.discount)}</div></div></div>
    ${r.open ? `<p class="chip o">受け渡し前の注文が ${r.open}件 あります（売上には含めています）</p>` : ''}
    <div class="grid2">
      <div class="card"><div class="section-title">時間帯別売上</div><div class="bars">
        ${r.slots.map(s => `<div class="bar"><span class="num">${s.label}</span><div class="track"><div class="fill" style="width:${(s.sales / max) * 100}%"></div></div>
          <span class="val num">${yen(s.sales)} <small>${s.count}件</small></span></div>`).join('')}
        ${r.outside.count ? `<div class="bar"><span>時間外</span><div class="track"></div><span class="val num">${yen(r.outside.sales)} <small>${r.outside.count}件</small></span></div>` : ''}</div></div>
      <div class="card"><div class="section-title">商品別販売個数</div><div class="scrollx"><table class="t">
        <thead><tr><th>商品</th><th class="r">個数</th><th class="r">うちセット</th><th class="r">金額</th></tr></thead>
        <tbody>${r.items.map(i => `<tr><td>${esc(i.name)}</td><td class="r num">${i.count}</td><td class="r num">${i.type === 'drink' ? i.setCount : '—'}</td><td class="r num">${yen(i.amount)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">まだ販売がありません</td></tr>'}</tbody>
        <tfoot><tr><td>合計</td><td class="r num">${sum(r.items, i => i.count)}</td><td class="r num">${r.drinkSet}</td><td class="r num">${yen(r.sales)}</td></tr></tfoot></table></div>
        <p class="muted" style="font-size:13px">ドリンク：単品 ${r.drinkSingle}杯・セット ${r.drinkSet}杯</p></div></div>
    <div class="card" style="margin-top:14px"><div class="section-title">修正・取消</div>
      <p>修正 ${r.edits}回 ／ 取消 ${r.cancels.length}件（取消分 ${yen(sum(r.cancels, o => o.total))} は売上に含めていません）</p>
      <div class="row"><button class="btn small" data-act="csvOrders">注文一覧CSV</button><button class="btn small" data-act="csvReport">日報CSV</button></div></div>`;
}
async function loadMulti() {
  const area = $('#reportArea'); if (!area) return;
  area.innerHTML = '<p class="muted">読み込み中…</p>';
  try {
    const snap = await getDocs(query(collection(db, 'orders'), where('day', 'in', EVENT_DAYS)));
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const rows = EVENT_DAYS.map(d => ({ d, r: computeReport(all.filter(o => o.day === d), false) }));
    const tot = computeReport(all, false);
    const best = r => { const s = [...r.slots].sort((a, b) => b.sales - a.sales)[0]; return s && s.sales ? s.label + '〜' : '—'; };
    area.innerHTML = `<div class="kpis"><div class="kpi main"><div class="l">3日間の売上合計</div><div class="v num">${yen(tot.sales)}</div></div>
      <div class="kpi"><div class="l">注文数</div><div class="v num">${tot.count}件</div></div></div>
      <div class="card scrollx"><table class="t"><thead><tr><th>日付</th><th class="r">売上</th><th class="r">注文数</th><th class="r">一番売れた時間</th><th class="r">取消</th></tr></thead>
      <tbody>${rows.map(({ d, r }) => `<tr><td>${dayLabel(d)}</td><td class="r num">${yen(r.sales)}</td><td class="r num">${r.count}</td><td class="r">${best(r)}</td><td class="r num">${r.cancels.length}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>合計</td><td class="r num">${yen(tot.sales)}</td><td class="r num">${tot.count}</td><td></td><td class="r num">${tot.cancels.length}</td></tr></tfoot></table></div>
      <div class="card" style="margin-top:14px"><div class="section-title">商品別（3日間）</div><div class="scrollx"><table class="t"><thead><tr><th>商品</th>${EVENT_DAYS.map(d => `<th class="r">${dayLabel(d)}</th>`).join('')}<th class="r">合計</th></tr></thead>
      <tbody>${tot.items.map(i => `<tr><td>${esc(i.name)}</td>${rows.map(({ r }) => `<td class="r num">${r.items.find(x => x.name === i.name)?.count || 0}</td>`).join('')}<td class="r num"><b>${i.count}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  } catch (e) { area.innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
function downloadCSV(name, rows) {
  const csv = '﻿' + rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvOrders() {
  const os = (S.admin.reportOrders || []).slice().sort((a, b) => a.createdAtMs - b.createdAtMs);
  const st = { open: '受け渡し前', delivered: '受け渡し済み', cancelled: '取消' };
  downloadCSV(`注文一覧_${S.admin.date}.csv`, [['営業日', '受付時刻', 'タグ', '品目', '小計', 'セット割', '合計', '預かり', 'おつり', '状態', 'レジ担当', '受け渡し担当', '受け渡し時刻', '修正回数', '注文ID'],
    ...os.map(o => [o.day, hms(o.createdAtMs), o.tag, summarize(o.items), o.subtotal, o.discount, o.total, o.received, o.change, st[o.status] || o.status, o.cashierName, o.deliveredBy || '', o.deliveredAtMs ? hms(o.deliveredAtMs) : '', o.editCount || 0, o.id])]);
}
function csvReport() {
  const r = computeReport(S.admin.reportOrders || [], S.admin.half);
  downloadCSV(`日報_${S.admin.date}.csv`, [['日報', S.admin.date], ['売上', r.sales], ['注文数', r.count], ['セット割合計', r.discount], ['修正回数', r.edits], ['取消件数', r.cancels.length], [],
    ['時間帯', '売上', '注文数'], ...r.slots.map(s => [s.label, s.sales, s.count]), ['時間外', r.outside.sales, r.outside.count], [],
    ['商品', '個数', 'うちセット', '金額'], ...r.items.map(i => [i.name, i.count, i.type === 'drink' ? i.setCount : '', i.amount])]);
}

// 現金照合
function cashShellHTML() {
  return `${datePickerHTML('cashDate')}<div class="grid2" style="margin-top:10px">
    <div class="card"><div class="section-title">レジの現金を数える</div>
      <div class="field"><label for="cFloat">釣銭準備金（開店時にレジに入れた金額）</label><input class="input num" id="cFloat" type="number" inputmode="numeric" min="0" placeholder="例：20000" data-cash></div>
      ${DENOMS.map(d => `<div class="cash-row"><span>${d.toLocaleString()}円</span><input class="input num" type="number" inputmode="numeric" min="0" id="c${d}" placeholder="0" data-cash><span class="num" id="cs${d}" style="text-align:right">¥0</span></div>`).join('')}
    </div>
    <div class="card"><div class="section-title">照合結果</div><div id="cashResult">読み込み中…</div>
      <div class="field" style="margin-top:12px"><label for="cMemo">メモ（差額の理由など）</label><textarea class="input" id="cMemo"></textarea></div>
      <button class="btn primary big" data-act="cashSave">この内容で保存</button><p class="muted" id="cashSaved" style="font-size:13px"></p></div></div>`;
}
async function loadCash() {
  const date = S.admin.date;
  try {
    const [orders, cc] = await Promise.all([fetchOrdersOfDay(date), getDoc(doc(db, 'cashChecks', date))]);
    if (S.admin.date !== date || !$('#cashResult')) return;
    S.admin.cashSales = sum(orders.filter(o => o.status !== 'cancelled'), o => o.total);
    if (cc.exists()) {
      const c = cc.data();
      $('#cFloat').value = c.float ?? '';
      DENOMS.forEach(d => { $('#c' + d).value = c.counts?.[d] ?? ''; });
      $('#cMemo').value = c.memo || '';
      $('#cashSaved').textContent = `最後の保存：${dayLabel(dayOf(c.atMs))} ${hm(c.atMs)} ${c.by}`;
    }
    calcCash();
  } catch (e) { $('#cashResult').innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
function cashValues() {
  const n = id => Math.max(0, Math.floor(Number($('#' + id)?.value) || 0));
  const counts = {}; DENOMS.forEach(d => { counts[d] = n('c' + d); });
  const actual = sum(DENOMS, d => d * counts[d]);
  const float = n('cFloat');
  const sales = S.admin.cashSales || 0;
  return { float, counts, actual, sales, expected: float + sales, diff: actual - (float + sales) };
}
function calcCash() {
  const v = cashValues();
  DENOMS.forEach(d => { const el = $('#cs' + d); if (el) el.textContent = yen(d * v.counts[d]); });
  const box = $('#cashResult'); if (!box) return;
  box.innerHTML = `<table class="t"><tbody>
    <tr><td>釣銭準備金</td><td class="r num">${yen(v.float)}</td></tr>
    <tr><td>＋ この日の現金売上（取消を除く）</td><td class="r num">${yen(v.sales)}</td></tr>
    <tr><td><b>＝ あるべき金額</b></td><td class="r num"><b>${yen(v.expected)}</b></td></tr>
    <tr><td><b>数えた金額</b></td><td class="r num"><b>${yen(v.actual)}</b></td></tr></tbody></table>
    <div class="diff-box ${v.diff === 0 ? 'diff-ok' : 'diff-ng'}" style="margin-top:10px">${v.diff === 0 ? 'ぴったり合っています 🎉' : v.diff > 0 ? `${yen(v.diff)} 多い` : `${yen(-v.diff)} 足りない`}</div>`;
}
async function saveCash() {
  const v = cashValues();
  const date = S.admin.date;
  const ok = await act(async () => {
    await setDoc(doc(db, 'cashChecks', date), { ...v, memo: ($('#cMemo')?.value || '').trim(), by: me(), atMs: Date.now(), day: date });
  }, '現金照合を保存しました');
  if (ok) { log('現金照合', { date, diff: v.diff }); $('#cashSaved').textContent = `最後の保存：${hm(Date.now())} ${me()}`; }
}

// メニュー
function menuAdminHTML() {
  if (!S.menu.length) return emptyMenuHTML();
  return `<div class="card"><div class="section-title">販売中／売り切れ（押すとすぐ全端末に反映）</div>
    <div class="mini-grid">${S.menu.map(m => `<button class="btn ${m.active ? 'green' : 'danger'} toggle" data-act="menuToggle" data-id="${m.id}" style="min-height:58px;border-radius:14px;flex-direction:column;gap:0;line-height:1.2">
      <span>${esc(m.short || m.name)}</span><small>${m.active ? '販売中' : '売り切れ'}</small></button>`).join('')}</div></div>
    <div class="card" style="margin-top:14px"><div class="section-title">商品名・価格の変更</div><div class="scrollx"><table class="t menu-edit">
      <thead><tr><th>グループ</th><th>ボタン表示名</th><th>正式名（日報）</th><th>価格</th><th>セット価格</th><th>担当</th><th>順番</th><th></th></tr></thead>
      <tbody>${S.menu.map(m => `<tr data-row="${m.id}">
        <td><input class="input" data-f="group" value="${esc(m.group || '')}" style="width:100px"></td>
        <td><input class="input" data-f="short" value="${esc(m.short || '')}" style="width:150px"></td>
        <td><input class="input" data-f="name" value="${esc(m.name)}" style="width:170px"></td>
        <td><input class="input num" data-f="price" type="number" inputmode="numeric" value="${m.price}" style="width:80px"></td>
        <td><input class="input num" data-f="setPrice" type="number" inputmode="numeric" value="${m.setPrice ?? ''}" placeholder="なし" style="width:80px"></td>
        <td><select class="input" data-f="kitchen" style="width:120px">${['A', 'B', 'any'].map(k => `<option value="${k}" ${m.kitchen === k ? 'selected' : ''}>${kitchenLabel(k)}</option>`).join('')}</select></td>
        <td><input class="input num" data-f="order" type="number" value="${m.order ?? 0}" style="width:60px"></td>
        <td><button class="btn small primary" data-act="menuSave" data-id="${m.id}">保存</button></td></tr>`).join('')}</tbody></table></div>
      <p class="muted" style="font-size:13px">「セット価格」を入れた商品はドリンク扱いになり、フードと一緒ならその価格になります。担当を「手の空いている方」にすると両キッチンに表示されます。</p>
      <button class="btn small" data-act="menuAdd">＋ 商品を追加</button></div>`;
}
async function menuToggle(id) {
  const m = S.menu.find(x => x.id === id); if (!m) return;
  if (!confirm(`「${m.name}」を${m.active ? '売り切れ' : '販売中'}にしますか？`)) return;
  const ok = await act(() => setDoc(doc(db, 'menu', id), { active: !m.active }, { merge: true }), m.active ? '売り切れにしました' : '販売中に戻しました');
  if (ok) { log('売り切れ切替', { id, name: m.name, active: !m.active }); rerender(); }
}
async function menuSave(id) {
  const row = $(`[data-row="${id}"]`); if (!row) return;
  const f = k => row.querySelector(`[data-f="${k}"]`).value.trim();
  const price = Math.round(Number(f('price')));
  const sp = f('setPrice');
  const kitchen = f('kitchen');
  if (!f('name') || !(price >= 0)) { toast('名前と価格を確認してください', 'err'); return; }
  const data = { group: f('group') || 'その他', short: f('short') || f('name'), name: f('name'), price,
    setPrice: sp === '' ? null : Math.round(Number(sp)), kitchen, type: sp === '' ? 'food' : 'drink', order: Number(f('order')) || 0 };
  if (!confirm(`「${data.name}」を ${yen(price)}${data.setPrice != null ? `（セット ${yen(data.setPrice)}）` : ''}・${kitchenLabel(kitchen)} で保存しますか？\n※すでに会計した注文の金額は変わりません`)) return;
  const exists = S.menu.some(m => m.id === id);
  const ok = await act(() => setDoc(doc(db, 'menu', id), exists ? data : { ...data, active: true }, { merge: true }), '保存しました');
  if (ok) { log('メニュー変更', { id, ...data }); rerender(); }
}
function menuAdd() {
  const id = 'item_' + rid();
  S.menu.push({ id, group: 'その他', short: '新しい商品', name: '新しい商品', price: 0, setPrice: null, kitchen: 'A', type: 'food', order: S.menu.length, active: true });
  rerender();
  toast('表の一番下に追加しました。名前と価格を入れて「保存」を押してください');
}

// タグ
function tagsAdminHTML() {
  return `<div class="card"><div class="section-title">タグの状態</div><ul class="olist">
    ${range(1, TAG_COUNT).map(n => {
      const t = S.tags[String(n)]; const o = t?.inUse ? orderById(t.orderId) : null;
      return `<li style="align-items:center"><span class="tagno" style="width:40px;height:40px;font-size:20px;${t?.inUse ? '' : 'background:#ccc'}">${n}</span>
        <div style="flex:1">${t?.inUse ? `使用中（${hm(t.sinceMs)}〜）<div class="muted" style="font-size:13px;font-weight:500">${o ? esc(summarize(o.items)) : '注文情報なし'}</div>` : '<span class="muted">空き</span>'}</div>
        ${t?.inUse ? `<button class="btn small danger" data-act="forceFree" data-n="${n}">強制解放</button>` : ''}</li>`;
    }).join('')}</ul>
    <p class="muted" style="font-size:13px">タグをなくした・返ってこないときに使います。強制解放すると、その注文は「受け渡し済み（強制）」として記録されます。</p></div>`;
}
async function forceFree(n) {
  if (!confirm(`${n}番のタグを強制的に空きに戻しますか？\n紐づいた注文は受け渡し済み（強制）になります。`)) return;
  const ok = await act(() => runTransaction(db, async tx => {
    const tref = doc(db, 'tags', String(n));
    const t = await tx.get(tref);
    if (!t.exists() || !t.data().inUse) return;
    const oid = t.data().orderId;
    const oref = oid ? doc(db, 'orders', oid) : null;
    const o = oref ? await tx.get(oref) : null;
    const now = Date.now();
    if (o && o.exists() && o.data().status === 'open') {
      tx.update(oref, { status: 'delivered', forced: true, deliveredBy: me() + '（強制解放）', deliveredAtMs: now,
        history: [...(o.data().history || []), { at: now, by: me(), action: 'タグ強制解放' }] });
    }
    tx.set(tref, { inUse: false, orderId: null, sinceMs: null });
  }), `${n}番を空きに戻しました`);
  if (ok) log('タグ強制解放', { tag: n });
}

// アカウント
function accountsShellHTML() {
  return `<div class="grid2"><div class="card"><div class="section-title">登録済みのアカウント</div><div id="accList">読み込み中…</div></div>
    <div class="card"><div class="section-title">まとめて登録</div>
      <p class="muted" style="font-size:14px;margin-top:0">1行に1人、「ログインID 名前」の形で入力します（IDは半角英数字）。</p>
      <textarea class="input" id="bulkText" rows="10" placeholder="s02 田中\ns03 佐藤\ns04 鈴木"></textarea>
      <div class="field" style="margin-top:10px"><label for="bulkPw">初期パスワード（6文字以上・全員共通）</label><input class="input" id="bulkPw" placeholder="例：imo2026"></div>
      <button class="btn primary" data-act="bulkCreate">登録する</button>
      <pre id="bulkLog" style="white-space:pre-wrap;font-family:inherit;font-size:13px"></pre></div></div>`;
}
async function loadAccounts() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const us = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.loginId).localeCompare(String(b.loginId), 'ja', { numeric: true }));
    const el = $('#accList'); if (!el) return;
    el.innerHTML = `<p class="muted" style="margin-top:0">${us.length}人</p><ul class="olist">${us.map(u => `<li style="align-items:center"><b style="min-width:48px">${esc(u.loginId)}</b>
      <input class="input" style="min-height:40px;flex:1" data-uname="${u.id}" value="${esc(u.name)}"><button class="btn small" data-act="renameUser" data-id="${u.id}">名前を保存</button></li>`).join('')}</ul>
      <p class="muted" style="font-size:13px">パスワードを忘れた人は、本人がログインできないので、Firebaseの画面（Authentication）でアカウントを削除してから、右の「まとめて登録」で作り直してください。</p>`;
  } catch (e) { $('#accList').innerHTML = `<p class="err-text">${esc(errMsg(e))}</p>`; }
}
async function renameUser(uid) {
  const v = ($(`[data-uname="${uid}"]`)?.value || '').trim();
  if (!v) return;
  const ok = await act(() => setDoc(doc(db, 'users', uid), { name: v }, { merge: true }), '名前を保存しました');
  if (ok && uid === S.user.uid) { S.profile.name = v; rerender(); }
}
async function bulkCreate() {
  const lines = ($('#bulkText').value || '').split(/\n/).map(s => s.trim()).filter(Boolean);
  const pw = $('#bulkPw').value;
  const out = $('#bulkLog');
  if (!lines.length) { toast('登録する人を入力してください', 'err'); return; }
  if (pw.length < 6) { toast('初期パスワードは6文字以上にしてください', 'err'); return; }
  if (!confirm(`${lines.length}人分のアカウントを作ります。よろしいですか？`)) return;
  out.textContent = '';
  const tmp = initializeApp(firebaseConfig, 'creator-' + Date.now());
  const tmpAuth = getAuth(tmp);
  let okN = 0;
  for (const line of lines) {
    const [rawId, ...rest] = line.split(/[\s,，、\t]+/);
    const id = (rawId || '').toLowerCase();
    const name = rest.join(' ') || id;
    if (!/^[a-z0-9._-]+$/.test(id)) { out.textContent += `✕ ${line}：IDは半角英数字にしてください\n`; continue; }
    try {
      const cred = await createUserWithEmailAndPassword(tmpAuth, `${id}@${EMAIL_DOMAIN}`, pw);
      await setDoc(doc(db, 'users', cred.user.uid), { loginId: id, name, createdAtMs: Date.now(), createdBy: me() });
      await signOut(tmpAuth);
      out.textContent += `○ ${id} ${name}\n`; okN++;
    } catch (e) {
      out.textContent += `✕ ${id}：${(e.code || '').includes('email-already-in-use') ? 'このIDはもう登録されています' : (e.code || e.message)}\n`;
    }
  }
  try { await deleteApp(tmp); } catch { /* */ }
  log('アカウント一括登録', { count: okN });
  toast(`${okN}人を登録しました`, 'ok');
  loadAccounts();
}

// 設定
function settingsHTML() {
  return `<div class="grid2"><div class="card"><div class="section-title">キッチンの経過時間の色</div>
      <div class="field"><label for="wY">オレンジにする（分）</label><input class="input num" id="wY" type="number" value="${S.settings.warnYellow}"></div>
      <div class="field"><label for="wR">赤にする（分）</label><input class="input num" id="wR" type="number" value="${S.settings.warnRed}"></div>
      <button class="btn primary" data-act="saveSettings">保存</button></div>
    <div class="card"><div class="section-title">データの準備</div>
      <p>メニュー12品・タグ1〜10・設定がない場合に作ります。すでにあるデータは消しません。</p>
      <button class="btn yellow" data-act="seed">初期データを作る（足りない分だけ）</button>
      <p class="muted" style="font-size:13px;margin-top:14px">ログインIDは内部で「ID@${EMAIL_DOMAIN}」として登録されています。<br>このアプリの版：2026-10-29</p></div></div>`;
}
async function saveSettings() {
  const y = Math.max(1, Number($('#wY').value) || 5), r = Math.max(y + 1, Number($('#wR').value) || 10);
  const ok = await act(() => setDoc(doc(db, 'settings', 'app'), { warnYellow: y, warnRed: r }, { merge: true }), '保存しました');
  if (ok) log('設定変更', { warnYellow: y, warnRed: r });
}
async function seed() {
  const ok = await act(async () => {
    const [menuSnap, tagSnap, setSnap] = await Promise.all([getDocs(collection(db, 'menu')), getDocs(collection(db, 'tags')), getDoc(doc(db, 'settings', 'app'))]);
    const b = writeBatch(db);
    if (menuSnap.empty) DEFAULT_MENU.forEach(({ id, ...m }) => b.set(doc(db, 'menu', id), m));
    const have = new Set(tagSnap.docs.map(d => d.id));
    range(1, TAG_COUNT).forEach(n => { if (!have.has(String(n))) b.set(doc(db, 'tags', String(n)), { inUse: false, orderId: null, sinceMs: null }); });
    if (!setSnap.exists()) b.set(doc(db, 'settings', 'app'), { warnYellow: 5, warnRed: 10 });
    await b.commit();
  }, '初期データを作りました');
  if (ok) { log('初期データ作成'); rerender(); }
}

/* ---------- ユーザーメニュー ---------- */
function openUserMenu() {
  S.modalRefresh = null;
  openModal(`<h2>${esc(me())} さん</h2><p class="muted">ログインID：${esc(S.profile?.loginId)}</p>
    <div class="field"><label for="np1">新しいパスワード（6文字以上）</label><input class="input" id="np1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="np2">もう一度</label><input class="input" id="np2" type="password" autocomplete="new-password"></div>
    <button class="btn" data-act="changePw">パスワードを変更</button>
    <div class="modal-actions"><button class="btn" data-act="closeModal">閉じる</button><button class="btn danger" data-act="logout">ログアウト（交代）</button></div>`);
}
async function changePw() {
  const a = $('#np1').value, b = $('#np2').value;
  if (a.length < 6) { toast('6文字以上にしてください', 'err'); return; }
  if (a !== b) { toast('2回の入力が違います', 'err'); return; }
  try { await updatePassword(auth.currentUser, a); toast('パスワードを変更しました', 'ok'); closeModal(); }
  catch (e) { toast((e.code || '').includes('requires-recent-login') ? '一度ログアウトしてログインし直してから変更してください' : errMsg(e), 'err'); }
}

/* ---------- モーダル ---------- */
function openModal(html, cls = '') {
  $('#modal').innerHTML = `<div class="modal-back" data-act="backdrop"><div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div></div>`;
}
function closeModal() { $('#modal').innerHTML = ''; S.modalRefresh = null; S.edit = null; }

/* ================= ボタン操作のまとめ ================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const a = el.dataset.act, d = el.dataset;
  switch (a) {
    case 'backdrop': if (e.target === el && !$('.done-tag')) closeModal(); return;
    case 'closeModal': closeModal(); return;
    case 'loginRole': $$('.role-opt').forEach(x => x.classList.toggle('on', x === el)); S.loginRole = d.role; lsSet('imopos.role', d.role); return;
    case 'pickRole': S.modalRefresh = null; openModal(`<h2>担当を切り替える</h2>${rolePickHTML().replace(/^<div class="card"[^>]*>/, '<div>')}<div class="modal-actions"><button class="btn" data-act="closeModal">閉じる</button></div>`); return;
    case 'setRole': setRole(d.role); return;
    case 'userMenu': openUserMenu(); return;
    case 'logout': closeModal(); signOut(auth); return;
    case 'changePw': changePw(); return;
    case 'seed': seed(); return;
    // レジ
    case 'add': S.cart[d.id] = (S.cart[d.id] || 0) + 1; render(); return;
    case 'dec': S.cart[d.id] = Math.max(0, (S.cart[d.id] || 0) - 1); if (!S.cart[d.id]) delete S.cart[d.id]; render(); return;
    case 'clearCart': S.cart = {}; S.received = 0; render(); return;
    case 'key': pressKey(d.k); return;
    case 'addRecv': S.received = Math.min(S.received + Number(d.v), 999999); render(); return;
    case 'exact': S.received = priceLines(cartToLines()).total; render(); return;
    case 'pickTag': S.chosenTag = Number(d.n); render(); return;
    case 'checkout': doCheckout(); return;
    case 'history': openHistory(); return;
    case 'editOrder': openEdit(d.o); return;
    case 'editToggle': S.edit.remove.has(d.l) ? S.edit.remove.delete(d.l) : S.edit.remove.add(d.l); renderEdit(); return;
    case 'editAdd': { const m = S.menu.find(x => x.id === d.id); if (m) S.edit.added.push(makeLine(m)); renderEdit(); return; }
    case 'editUnadd': S.edit.added = S.edit.added.filter(l => l.lineId !== d.l); renderEdit(); return;
    case 'editSave': saveEdit(); return;
    case 'cancelOrder': openCancel(d.o); return;
    case 'cancelConfirm': doCancel(d.o); return;
    // キッチン
    case 'line': lineAction(d.o, d.l, d.k); return;
    // 受け渡し
    case 'handTile': openHandTile(d.o); return;
    case 'tagInfo': toast('データを確認中です。数秒たっても変わらなければ再読み込みしてください'); return;
    case 'deliver': doDeliver(d.o); return;
    case 'handHistory': openHandHistory(); return;
    case 'undeliver': doUndeliver(d.o); return;
    // 管理
    case 'adminTab': S.admin.tab = d.tab; rerender(); return;
    case 'repDate': case 'cashDate': S.admin.date = d.d; rerender(); return;
    case 'repHalf': S.admin.half = d.v === '1'; if (S.admin.reportOrders) $('#reportArea').innerHTML = reportHTML(S.admin.reportOrders); $$('[data-act="repHalf"]').forEach(b => b.classList.toggle('primary', b.dataset.v === d.v)); return;
    case 'repReload': loadReport(); return;
    case 'repMulti': loadMulti(); return;
    case 'csvOrders': csvOrders(); return;
    case 'csvReport': csvReport(); return;
    case 'cashSave': saveCash(); return;
    case 'menuToggle': menuToggle(d.id); return;
    case 'menuSave': menuSave(d.id); return;
    case 'menuAdd': menuAdd(); return;
    case 'forceFree': forceFree(Number(d.n)); return;
    case 'bulkCreate': bulkCreate(); return;
    case 'renameUser': renameUser(d.id); return;
    case 'saveSettings': saveSettings(); return;
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'loginForm') { e.preventDefault(); doLogin(e.target); }
});
document.addEventListener('input', e => { if (e.target.matches('[data-cash]')) calcCash(); });
document.addEventListener('change', e => {
  const a = e.target.dataset?.actChange;
  if (a && e.target.value) { S.admin.date = e.target.value; rerender(); }
});
