import { firebaseConfig } from './firebase-config.js';
const $ = id => document.getElementById(id);
const ADMIN_PASSWORD = 'prohaugar'; // Prototype only: visible in source; not secure authentication.
let db = null, api = null, roomsCache = [], roomsListenerStarted = false;
const theme = localStorage.getItem('xiangqi-theme');
try { const savedRoom = JSON.parse(localStorage.getItem('xiangqi-active-room') || 'null'); if (savedRoom?.code) { $('resume-room-container').hidden = false; $('resume-room-link').href = `chess.html?mode=online&room=${encodeURIComponent(savedRoom.code)}`; $('resume-room-link').textContent = `恢復房間 ${savedRoom.code}`; } } catch {}
if (theme === 'light') document.body.classList.remove('dark-mode');
$('theme-btn').textContent = document.body.classList.contains('dark-mode') ? '☀️ 淺色' : '🌙 深色';
$('theme-btn').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  const dark = document.body.classList.contains('dark-mode');
  $('theme-btn').textContent = dark ? '☀️ 淺色' : '🌙 深色';
  localStorage.setItem('xiangqi-theme', dark ? 'dark' : 'light');
});
$('lang-btn').addEventListener('click', () => {
  const english = $('lang-btn').textContent === '繁體中文';
  $('lang-btn').textContent = english ? 'English' : '繁體中文';
  $('lobby-title').textContent = english ? 'Choose how to play' : '選擇你的對弈方式';
  $('lobby-subtitle').textContent = english ? 'Play against AI or a friend.' : '保留傳統棋盤風格，與 AI 或朋友一決勝負。';
  $('single-title').textContent = english ? 'Single Player' : '單機版';
  $('single-desc').textContent = english ? 'Play against AI at two difficulty levels.' : '與 AI 對弈，支援初級與高級難度。';
  $('single-cta').textContent = english ? 'Start game →' : '開始遊戲 →';
  $('multi-title').textContent = english ? 'Online Multiplayer' : '多人連線';
  $('multi-desc').textContent = english ? 'Create public or private rooms and play with friends.' : '建立公開或私人房間，輸入房號與朋友即時對弈。';
  $('multi-cta').textContent = english ? 'Enter lobby →' : '進入連線大廳 →';
});
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function formatTime(value) { try { return new Date(Number(value)).toLocaleString('zh-TW', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return '時間未知'; } }
function renderRoomList(target, includeNonWaiting = false) {
  const rooms = roomsCache.filter(r => includeNonWaiting || r.status === 'waiting');
  if (!rooms.length) { target.innerHTML = '<p class="muted small">目前沒有符合條件的公開房間。</p>'; return; }
  target.innerHTML = rooms.sort((a,b) => Number(b.createdAt||0)-Number(a.createdAt||0)).map(r => {
    const status = r.status === 'waiting' ? '等待加入' : r.status === 'playing' ? '對局中' : '已結束';
    const join = r.status === 'waiting' ? `<a class="room-join-link" href="chess.html?mode=online&room=${encodeURIComponent(r.code)}">輸入／加入</a>` : '<span class="muted small">不可加入</span>';
    return `<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeHtml(r.code)}</strong><span class="room-status">${status}</span><span class="muted small">房主：${escapeHtml(r.hostName||'棋手')}</span><span class="muted small">建立：${escapeHtml(formatTime(r.createdAt))}</span><span class="muted small">人數：${Number(r.playersCount||1)}/2　${r.hasPassword?'🔒 需要密碼':'🔓 無密碼'}</span></div><div>${join}</div></article>`;
  }).join('');
}
async function initRooms() {
  if (roomsListenerStarted) return;
  if (firebaseConfig.apiKey === 'YOUR_API_KEY' || String(firebaseConfig.databaseURL).includes('YOUR_DATABASE')) {
    $('public-rooms-status').textContent = '尚未設定 Firebase；單機模式仍可使用。'; return;
  }
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
    ]);
    api = {...appMod, ...authMod, ...dbMod};
    const app = api.initializeApp(firebaseConfig);
    const auth = api.getAuth(app);
    db = api.getDatabase(app);
    let off;
    const existing = await new Promise(resolve => { off = api.onAuthStateChanged(auth, u => { off?.(); resolve(u); }); });
    if (!existing) await api.signInAnonymously(auth);
    roomsListenerStarted = true;
    $('public-rooms-status').textContent = '正在讀取公開房間…';
    api.onValue(api.ref(db, 'publicRooms'), snap => {
      const value = snap.val() || {};
      roomsCache = Object.entries(value).map(([code, r]) => ({...r, code: r.code || code}));
      $('public-rooms-status').textContent = `目前公開房間：${roomsCache.filter(r=>r.status==='waiting').length} 間等待加入`;
      renderRoomList($('public-rooms-list'));
      if (!$('admin-dashboard').hidden) renderRoomList($('admin-room-list'), true);
    }, error => {
      $('public-rooms-status').textContent = error?.code?.includes('permission-denied')
        ? 'Firebase 尚未允許讀取公開房間列表。請將 README 中 publicRooms 規則合併至現有 Rules 後發布。'
        : `公開房間讀取失敗：${error.message || error}`;
      $('public-rooms-list').innerHTML = '<p class="muted small">無法載入列表；仍可使用房號加入房間。</p>';
    });
  } catch (e) {
    console.error(e);
    $('public-rooms-status').textContent = `Firebase 連線失敗：${e.message || e}`;
  }
}
$('refresh-rooms-btn').addEventListener('click', () => {
  if (!db || !api) { initRooms(); return; }
  api.get(api.ref(db, 'publicRooms')).then(snap => {
    const value = snap.val() || {};
    roomsCache = Object.entries(value).map(([code,r])=>({...r,code:r.code||code}));
    $('public-rooms-status').textContent = `目前公開房間：${roomsCache.filter(r=>r.status==='waiting').length} 間等待加入`;
    renderRoomList($('public-rooms-list'));
  }).catch(e => $('public-rooms-status').textContent = `讀取失敗：${e.message||e}`);
});
$('admin-fab').addEventListener('click', () => { $('admin-modal').hidden = false; $('admin-password-input').focus(); });
$('admin-close').addEventListener('click', () => { $('admin-modal').hidden = true; });
$('admin-modal').addEventListener('click', e => { if (e.target === $('admin-modal')) $('admin-modal').hidden = true; });
function adminLogin() {
  if ($('admin-password-input').value !== ADMIN_PASSWORD) {
    $('admin-login-status').textContent = '密碼錯誤。';
    return;
  }
  $('admin-login-area').hidden = true;
  $('admin-dashboard').hidden = false;
  if (db) renderRoomList($('admin-room-list'), true);
  else $('admin-room-list').innerHTML = '<p class="muted small">Firebase 尚未連線，無法載入公開房間。</p>';
}
$('admin-login-btn').addEventListener('click', adminLogin);
$('admin-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
$('admin-refresh-btn').addEventListener('click', () => {
  if (!db || !api) return;
  api.get(api.ref(db, 'publicRooms')).then(snap => {
    const value = snap.val() || {};
    roomsCache = Object.entries(value).map(([code,r])=>({...r,code:r.code||code}));
    renderRoomList($('admin-room-list'), true);
  }).catch(e => $('admin-room-list').innerHTML = `<p class="muted small">載入失敗：${escapeHtml(e.message||e)}</p>`);
});
initRooms();
