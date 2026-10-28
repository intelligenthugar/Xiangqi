import { firebaseConfig } from './firebase-config.js';
const TEST_KEY = 'ji32k7au4a83';
const ADMIN_UID = '7PHHdOC8IWYNqbGqaajq8j8DK822';
const testKeyRequested = new URLSearchParams(location.search).get('key') === TEST_KEY;
let testBypass = false;
function removeTestKeyFromUrl() { const u = new URL(location.href); u.searchParams.delete('key'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); }
async function authorizeTestMode() {
  if (!testKeyRequested) return;
  try {
    const [appMod, authMod] = await Promise.all([import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'), import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js')]);
    const app = appMod.getApps().find(a => a.name === 'xiangqi-player-accounts') || appMod.initializeApp(firebaseConfig, 'xiangqi-player-accounts');
    const auth = authMod.getAuth(app); let stop;
    const user = await new Promise(resolve => { stop = authMod.onAuthStateChanged(auth, u => { stop?.(); resolve(u); }); });
    if (user && !user.isAnonymous && user.uid === ADMIN_UID) {
      testBypass = true;
      function preserveTestKey(root = document) { root.querySelectorAll?.('a[href]').forEach(a => { try { const u = new URL(a.href, location.href); if (u.origin === location.origin && !u.searchParams.has('key')) { u.searchParams.set('key', TEST_KEY); a.href = u.href; } } catch { } }); }
      preserveTestKey();
      new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { preserveTestKey(n); if (n.matches?.('a[href]')) preserveTestKey(n.parentNode || document); } }))).observe(document.documentElement, { childList: true, subtree: true });
      document.addEventListener('click', e => { const a = e.target.closest?.('a[href]'); if (a) preserveTestKey(a.parentNode || document); }, true);
    } else removeTestKeyFromUrl();
  } catch (e) { console.warn('測試模式管理員驗證失敗', e); removeTestKeyFromUrl(); }
}
const $ = id => document.getElementById(id);
let db = null, api = null, roomsCache = [], allRoomsCache = [], roomsListenerStarted = false;
try { const savedRoom = JSON.parse(localStorage.getItem('xiangqi-active-room') || 'null'); if (savedRoom?.code) { $('resume-room-container').hidden = false; $('resume-room-link').href = `chess.html?mode=online&room=${encodeURIComponent(savedRoom.code)}`; $('resume-room-link').textContent = `恢復房間 ${savedRoom.code}`; } } catch { }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatTime(value) { try { return new Date(Number(value)).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '時間未知'; } }
function renderRoomList(target, includeNonWaiting = false) {
  const rooms = roomsCache.filter(r => includeNonWaiting || r.status === 'waiting');
  if (!rooms.length) { target.innerHTML = '<p class="muted small">目前沒有符合條件的公開房間。</p>'; return; }
  target.innerHTML = rooms.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)).map(r => {
    const status = r.status === 'waiting' ? '等待加入' : r.status === 'playing' ? '對局中' : '已結束';
    const join = r.status === 'waiting' ? `<a class="room-join-link" href="chess.html?mode=online&room=${encodeURIComponent(r.code)}">輸入／加入</a>` : '<span class="muted small">不可加入</span>';
    return `<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeHtml(r.code)}</strong><span class="room-status">${status}</span><span class="muted small">房主：${escapeHtml(r.hostName || '棋手')}</span><span class="muted small">建立：${escapeHtml(formatTime(r.createdAt))}</span><span class="muted small">人數：${Number(r.playersCount || 1)}/2　${r.hasPassword ? '🔒 需要密碼' : '🔓 無密碼'}</span></div><div>${join}</div></article>`;
  }).join('');
}
function renderAdminRoomList(target) {
  const rooms = allRoomsCache.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  if (!rooms.length) { target.innerHTML = '<p class="muted small">目前沒有房間（公開或私人）。</p>'; return; }
  target.innerHTML = rooms.map(r => {
    const status = r.status === 'waiting' ? '等待加入' : r.status === 'playing' ? '對局中' : r.status === 'finished' ? '已結束' : r.status === 'closed' ? '已關閉' : escapeHtml(r.status || '狀態未知');
    const visibility = r.visibility === 'private' ? '🔒 私人房間' : '🌐 公開房間';
    const players = `${r.playersCount || ((r.players?.black) ? 2 : 1)}/2`;
    const join = r.status === 'waiting' ? `<a class="room-join-link" href="chess.html?mode=online&room=${encodeURIComponent(r.code)}">查看／加入</a>` : '<span class="muted small">不可加入</span>';
    return `<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeHtml(r.code)}</strong><span class="room-status">${visibility} · ${status}</span><span class="muted small">房主：${escapeHtml(r.hostName || r.playerNames?.red || '棋手')}</span><span class="muted small">建立：${escapeHtml(formatTime(r.createdAt))}</span><span class="muted small">人數：${players}　${r.hasPassword || r.settings?.hasPassword ? '🔒 需要密碼' : '🔓 無密碼'}</span></div><div>${join}</div></article>`;
  }).join('');
}
let siteControlEnabled = true;
let siteControlLoaded = false;
let siteCloseTimer = null;
let maintenanceWarningTimer = null;
let maintenanceNoticeKey = '';
let latestSiteControl = {};
function renderTopStatus(control = latestSiteControl) {
  const banner = $('site-announcement');
  const label = $('site-announcement-label');
  const text = $('site-announcement-text');
  if (!banner || !label || !text) return;

  // 測試通行碼模式優先顯示專用公告，不被維護倒數或一般公告覆蓋。
  if (testBypass) {
    banner.classList.remove('is-countdown');
    label.textContent = '🧪 測試模式';
    text.textContent = '測試模式已啟用：維護期間仍可進入遊戲。';
    banner.hidden = false;
    document.body.classList.add('has-site-announcement');
    return;
  }

  const closeAt = Number(control.autoCloseAt || 0);
  const remaining = closeAt - Date.now();
  const isClosed = !testBypass && (control.playEnabled === false || (closeAt > 0 && remaining <= 0));

  // 首頁進入「網站暫停遊玩」狀態時，不再顯示公告橫幅。
  if (document.body.classList.contains('home-page') && isClosed) {
    banner.hidden = true;
    banner.classList.remove('is-countdown');
    document.body.classList.remove('has-site-announcement');
    return;
  }

  // 維護排程中：固定顯示倒數，不使用跑馬燈動畫。
  if (!isClosed && closeAt > 0 && remaining > 0) {
    const total = Math.ceil(remaining / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    label.textContent = '⏳ 維護倒數';
    text.textContent = h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    banner.classList.add('is-countdown');
    banner.hidden = false;
    document.body.classList.add('has-site-announcement');
    return;
  }

  // 一般公告：保留跑馬燈效果。
  banner.classList.remove('is-countdown');
  label.textContent = '📢 公告';
  const message = String(control.announcement || '').trim();
  text.textContent = message;
  banner.hidden = !message;
  document.body.classList.toggle('has-site-announcement', !!message);
}

setInterval(() => { renderTopStatus(); const closeAt = Number(latestSiteControl.autoCloseAt || 0); if (!testBypass && latestSiteControl.playEnabled !== false && closeAt > Date.now() && closeAt - Date.now() <= 60000) showMaintenanceNotice(`scheduled-${closeAt}`); }, 1000);
function showMaintenanceNotice(key) {
  if (maintenanceNoticeKey === key || document.getElementById('maintenance-warning-dialog')) return;
  maintenanceNoticeKey = key;
  const style = document.createElement('style');
  style.textContent = '#maintenance-warning-dialog{position:fixed;inset:0;z-index:100001;background:#000b;display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}#maintenance-warning-dialog .maintenance-warning-card{width:min(520px,100%);background:#171717;color:#fff;border:2px solid #e5b93f;border-radius:18px;padding:24px;box-shadow:0 18px 70px #0009;text-align:center}#maintenance-warning-dialog h2{margin:0 0 14px;color:#ffd54f;font-size:clamp(22px,5vw,30px)}#maintenance-warning-dialog p{font-size:clamp(17px,3.8vw,21px);line-height:1.7;margin:0 0 20px}#maintenance-warning-dialog button{border:0;border-radius:10px;padding:12px 22px;background:#ffd54f;color:#241b00;font-weight:800;font-size:16px;cursor:pointer}';
  document.head.appendChild(style);
  const dialog = document.createElement('div');
  dialog.id = 'maintenance-warning-dialog';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = '<div class="maintenance-warning-card"><h2>⚠️ 系統維護提醒</h2><p>即將進行網站維護！請盡快結束目前對局。維護開始後，這場棋局將不會被儲存。</p><button type="button" id="maintenance-warning-ok">我知道了</button></div>';
  document.body.appendChild(dialog);
  document.getElementById('maintenance-warning-ok').addEventListener('click', () => dialog.remove());
}
function scheduleMaintenanceNotice(control) {
  if (maintenanceWarningTimer) { clearTimeout(maintenanceWarningTimer); maintenanceWarningTimer = null; }
  const closeAt = Number(control.autoCloseAt || 0);
  // 直接鎖定遊玩代表維護已開始，不應繼續顯示「即將關閉」倒數或提醒。
  if (control.playEnabled === false || testBypass || !(closeAt > Date.now())) {
    document.getElementById('maintenance-warning-dialog')?.remove();
    maintenanceNoticeKey = '';
    return;
  }
  const key = `scheduled-${closeAt}`;
  maintenanceWarningTimer = setTimeout(() => showMaintenanceNotice(key), Math.max(0, closeAt - Date.now() - 60000));
}
function applySiteControl(control = {}) {
  if (siteCloseTimer) { clearTimeout(siteCloseTimer); siteCloseTimer = null; }
  latestSiteControl = control || {};
  renderTopStatus(latestSiteControl);
  scheduleMaintenanceNotice(control);
  const closeAt = Number(control.autoCloseAt || 0);
  const autoClosed = closeAt > 0 && Date.now() >= closeAt;
  siteControlEnabled = testBypass || (control.playEnabled !== false && !autoClosed);
  window.__xiangqiPlayEnabled = siteControlEnabled;
  if (closeAt > Date.now()) siteCloseTimer = setTimeout(() => applySiteControl(control), Math.min(closeAt - Date.now() + 50, 2147483000));
  siteControlLoaded = true;
  const maintenance = $('site-maintenance-banner');
  if (maintenance) { maintenance.hidden = siteControlEnabled; if (control.maintenanceMessage) $('site-maintenance-message').textContent = control.maintenanceMessage; }
  document.querySelectorAll('a.mode-card, #resume-room-link, .room-join-link').forEach(link => {
    if (link.id === 'admin-fab' || link.href.includes('admin.html')) return;
    if (!siteControlEnabled) { link.dataset.siteDisabled = '1'; link.setAttribute('aria-disabled', 'true'); link.style.opacity = '.45'; link.style.pointerEvents = 'none'; }
    else if (link.dataset.siteDisabled) { delete link.dataset.siteDisabled; link.removeAttribute('aria-disabled'); link.style.opacity = ''; link.style.pointerEvents = ''; }
  });
  if (!siteControlEnabled) {
    if ($('public-rooms-status')) $('public-rooms-status').textContent = '網站目前暫停遊玩；管理員仍可透過右下角 ⚙ 入口登入管理中心。';
  }
}
async function startSiteTracking() {
  if (firebaseConfig.apiKey === 'YOUR_API_KEY' || String(firebaseConfig.databaseURL).includes('YOUR_DATABASE')) return;
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
    ]);
    // 使用帳號系統共用的 Firebase Auth：登入時以帳號 UID 記錄，未登入時才使用匿名裝置 UID。
    const app = appMod.getApps().find(a => a.name === 'xiangqi-player-accounts') || appMod.initializeApp(firebaseConfig, 'xiangqi-player-accounts');
    const auth = authMod.getAuth(app);
    const database = dbMod.getDatabase(app);
    try { await authMod.setPersistence(auth, authMod.browserLocalPersistence); } catch { }
    dbMod.onValue(dbMod.ref(database, 'siteControl'), snap => applySiteControl(snap.val() || { playEnabled: true, announcement: '' }), error => {
      console.warn('網站設定讀取失敗', error);
      applySiteControl({ playEnabled: true, announcement: '' });
      if ($('public-rooms-status')) $('public-rooms-status').textContent = '無法讀取網站公告／開放狀態；請確認 Firebase Rules。';
    });

    let trackedUid = '', trackedCurrentRef = null, heartbeat = null;
    const registerVisitor = async currentUser => {
      if (!currentUser) { try { await authMod.signInAnonymously(auth); } catch (e) { console.warn('匿名訪客初始化失敗', e); } return; }
      const uid = currentUser.uid;
      if (uid === trackedUid) return;
      if (trackedCurrentRef) dbMod.update(trackedCurrentRef, { online: false, lastSeen: dbMod.serverTimestamp() }).catch(() => { });
      trackedUid = uid;
      const currentRef = dbMod.ref(database, `siteVisitors/current/${uid}`);
      trackedCurrentRef = currentRef;
      if (heartbeat) clearInterval(heartbeat);
      let profileName = '';
      if (!currentUser.isAnonymous) {
        try { const profileSnap = await dbMod.get(dbMod.ref(database, `users/${uid}/profile`)); profileName = profileSnap.val()?.displayName || ''; } catch { }
      }
      const displayName = (profileName || localStorage.getItem('xiangqi-nickname') || (currentUser.isAnonymous ? '裝置訪客' : '已登入棋手')).replace(/[<>]/g, '').slice(0, 18);
      const visitorType = currentUser.isAnonymous ? 'device' : 'account';
      await dbMod.set(currentRef, { uid, name: displayName, visitorType, online: true, lastSeen: dbMod.serverTimestamp(), page: '大廳' });
      try { await dbMod.onDisconnect(currentRef).update({ online: false, lastSeen: dbMod.serverTimestamp() }); } catch { }
      const now = Date.now();

      const updatePresence = () => { if (document.visibilityState === 'visible' && trackedUid === uid) dbMod.update(currentRef, { name: displayName, visitorType, online: true, lastSeen: dbMod.serverTimestamp(), page: '大廳' }).catch(() => { }); };
      document.addEventListener('visibilitychange', updatePresence);
      heartbeat = setInterval(updatePresence, 45000);
    };
    authMod.onAuthStateChanged(auth, user => { registerVisitor(user).catch(e => console.warn('訪客紀錄更新失敗', e)); });
  } catch (e) { console.warn('網站狀態／訪客追蹤未啟用', e); }
}

document.addEventListener('click', event => { if (!testBypass && window.__xiangqiPlayEnabled === false) { const link = event.target.closest('a'); if (link && !link.href.includes('admin.html')) { event.preventDefault(); event.stopPropagation(); window.alert('網站目前暫停遊玩，請稍後再來。'); } } }, true);

async function initRooms() {
  if (!$('public-rooms-status') || !$('public-rooms-list')) return;
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
    api = { ...appMod, ...authMod, ...dbMod };
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
      roomsCache = Object.entries(value).map(([code, r]) => ({ ...r, code: r.code || code }));
      $('public-rooms-status').textContent = `目前公開房間：${roomsCache.filter(r => r.status === 'waiting').length} 間等待加入`;
      renderRoomList($('public-rooms-list'));
    }, error => {
      $('public-rooms-status').textContent = error?.code?.includes('permission-denied')
        ? 'Firebase 尚未允許讀取公開房間列表。請將 README 中 publicRooms 規則合併至現有 Rules 後發布。'
        : `公開房間讀取失敗：${error.message || error}`;
      $('public-rooms-list').innerHTML = '<p class="muted small">無法載入列表；仍可使用房號加入房間。</p>';
    });
    api.onValue(api.ref(db, 'rooms'), snap => {
      const value = snap.val() || {};
      const publicByCode = new Map(roomsCache.map(r => [r.code, r]));
      allRoomsCache = Object.entries(value).map(([code, room]) => {
        const pub = publicByCode.get(code) || {};
        return { ...pub, code, ...room, visibility: room.settings?.visibility || (pub.hostUid ? 'public' : 'private'), hostName: pub.hostName || room.playerNames?.red || '棋手', playersCount: room.players?.black ? 2 : 1, hasPassword: !!(room.settings?.hasPassword || room.settings?.passwordHash) };
      });
    }, error => {
      console.warn('管理員房間清單讀取失敗', error);
    });
  } catch (e) {
    console.error(e);
    $('public-rooms-status').textContent = `Firebase 連線失敗：${e.message || e}`;
  }
}
$('refresh-rooms-btn')?.addEventListener('click', () => {
  if (!db || !api) { initRooms(); return; }
  api.get(api.ref(db, 'publicRooms')).then(snap => {
    const value = snap.val() || {};
    roomsCache = Object.entries(value).map(([code, r]) => ({ ...r, code: r.code || code }));
    $('public-rooms-status').textContent = `目前公開房間：${roomsCache.filter(r => r.status === 'waiting').length} 間等待加入`;
    renderRoomList($('public-rooms-list'));
  }).catch(e => $('public-rooms-status').textContent = `讀取失敗：${e.message || e}`);
});

await authorizeTestMode();
initRooms();
startSiteTracking();


// Interactive Xiangqi tutorial on the home page.
const tutorialRoot = $('xiangqi-tutorial');
if (tutorialRoot) {
  const tutorialTabs = [...tutorialRoot.querySelectorAll('[data-tutorial-tab]')];
  const tutorialPanels = [...tutorialRoot.querySelectorAll('[data-tutorial-panel]')];
  tutorialTabs.forEach(tab => tab.addEventListener('click', () => {
    const name = tab.dataset.tutorialTab;
    tutorialTabs.forEach(item => { const active = item === tab; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active)); });
    tutorialPanels.forEach(panel => { panel.hidden = panel.dataset.tutorialPanel !== name; });
  }));

  const pieceLessons = {
    general: { icon: '帥', title: '帥／將', description: '每次沿直線走一格，只能在九宮內活動。將與帥不能直接照面。', tip: '小提醒：保護主帥是第一要務，別讓它暴露在車、炮的攻擊線上。' },
    advisor: { icon: '仕', title: '仕／士', description: '每次沿斜線走一格，只能在九宮內活動。它主要負責守護將／帥。', tip: '小提醒：不要為了吃小棋而隨意把士、仕移離主帥身邊。' },
    elephant: { icon: '相', title: '相／象', description: '每次斜走兩格，俗稱「田」字走法；中間的格子若有棋子擋住就不能走，而且不能過河。', tip: '小提醒：象眼被塞住就不能走，走之前記得檢查中間點。' },
    rook: { icon: '俥', title: '俥／車', description: '可以沿橫線或直線走任意格，但路徑中不能穿過其他棋子。車也沿直線吃子。', tip: '小提醒：車的威力很大，盡早讓車出動並打開通道。' },
    horse: { icon: '傌', title: '傌／馬', description: '走「日」字：先直走一格再斜走一格。若第一步的相鄰格被棋子堵住，就叫「蹩馬腿」，不能走那個方向。', tip: '小提醒：馬不是可以跳過所有棋子的棋子，記得注意馬腿。' },
    cannon: { icon: '炮', title: '炮／包', description: '不吃子時像車一樣沿直線移動；吃子時必須與目標之間恰好隔著一顆棋子，這顆棋子就是炮架。', tip: '小提醒：炮架很重要，沒有隔子就不能吃；隔了兩顆也不能吃。' },
    soldier: { icon: '兵', title: '兵／卒', description: '過河前只能向前走一格；過河後可以向前或左右走一格，但永遠不能後退。', tip: '小提醒：兵卒過河後更有攻擊力，別忽略它們的推進。' }
  };
  const detailIcon = $('piece-detail-icon'), detailTitle = $('piece-detail-title'), detailDescription = $('piece-detail-description'), detailTip = $('piece-detail-tip');
  tutorialRoot.querySelectorAll('[data-piece]').forEach(button => button.addEventListener('click', () => {
    const lesson = pieceLessons[button.dataset.piece]; if (!lesson) return;
    tutorialRoot.querySelectorAll('[data-piece]').forEach(item => item.classList.toggle('active', item === button));
    detailIcon.textContent = lesson.icon; detailTitle.textContent = lesson.title; detailDescription.textContent = lesson.description; detailTip.textContent = lesson.tip;
  }));

  const quiz = [
    { q: '哪一種棋子可以沿直線走任意格，直到被棋子擋住？', options: ['馬', '車', '炮'], answer: 1, explain: '答對了！車可以沿橫線或直線移動，路徑不能穿過其他棋子。' },
    { q: '炮要吃掉對方的棋子，通常需要什麼條件？', options: ['目標旁邊不能有棋子', '與目標之間恰好隔一顆棋子', '一定要先過河'], answer: 1, explain: '答對了！炮吃子需要隔一顆棋子作為炮架。' },
    { q: '兵／卒過河後，可以怎麼走？', options: ['可以後退一格', '只能向前走', '可以向前或左右走一格，不能後退'], answer: 2, explain: '答對了！過河後兵卒可以向前或左右走一格，但不能後退。' }
  ];
  let quizIndex = 0, quizScore = 0, quizAnswered = false, quizFinished = false;
  const quizCount = $('quiz-count'), quizQuestion = $('quiz-question'), quizOptions = $('quiz-options'), quizFeedback = $('quiz-feedback'), quizNext = $('quiz-next');
  function renderQuiz() {
    const item = quiz[quizIndex]; quizAnswered = false; quizFinished = false;
    quizCount.textContent = `新手測驗 · 第 ${quizIndex + 1} 題，共 ${quiz.length} 題`;
    quizQuestion.textContent = item.q; quizFeedback.textContent = '選一個答案試試看。'; quizFeedback.className = 'quiz-feedback'; quizNext.disabled = true; quizNext.textContent = quizIndex === quiz.length - 1 ? '查看成績' : '下一題';
    quizOptions.innerHTML = '';
    item.options.forEach((label, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => {
        if (quizAnswered) return; quizAnswered = true; const correct = index === item.answer; if (correct) quizScore++;
        [...quizOptions.children].forEach((option, optionIndex) => { option.disabled = true; if (optionIndex === item.answer) option.classList.add('correct-answer'); else if (optionIndex === index) option.classList.add('wrong-answer'); });
        quizFeedback.textContent = (correct ? '✅ 正確！' : `❌ 正確答案是「${item.options[item.answer]}」。`) + ' ' + item.explain; quizFeedback.classList.add(correct ? 'correct' : 'wrong'); quizNext.disabled = false;
      }); quizOptions.appendChild(button);
    });
  }
  quizNext.addEventListener('click', () => {
    if (quizFinished) { quizIndex = 0; quizScore = 0; renderQuiz(); return; }
    if (!quizAnswered) return;
    if (quizIndex < quiz.length - 1) { quizIndex++; renderQuiz(); return; }
    quizFinished = true; quizCount.textContent = '測驗完成'; quizQuestion.textContent = `你答對了 ${quizScore} / ${quiz.length} 題！`;
    quizOptions.innerHTML = ''; quizFeedback.textContent = quizScore === quiz.length ? '太棒了！你已掌握幾個重要的基本規則。' : '可以再看一次「棋子走法」，再挑戰一次。'; quizFeedback.className = 'quiz-feedback'; quizNext.textContent = '重新測驗'; quizNext.disabled = false;
  });
  renderQuiz();
}


// Email/password player accounts, editable display name, and per-account match history.
let accountApi = null, accountAuth = null, accountDb = null, accountProfile = null;
let accountAuthListenerStarted = false;
const accountModal = $('account-modal');
function accountStatus(message, error = false) {
  const node = $('account-status');
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('is-error', !!error);
}
function cleanPlayerName(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18);
}
function isValidAccountEmail(value) {
  const email = String(value || '').trim();
  if (email.length > 254 || /\s/.test(email)) return false;
  return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(email);
}
function openAccountModal() {
  if (accountModal) accountModal.hidden = false;
  accountStatus('');
}
function closeAccountModal() {
  const user = accountAuth?.currentUser;
  if (user && !user.isAnonymous && !accountProfile?.displayName) {
    accountStatus('請先設定使用者名稱，才能使用帳號功能。', true);
    return;
  }
  if (accountModal) accountModal.hidden = true;
}
function paintAccountButton(user) {
  const button = $('account-open-btn');
  if (!button) return;
  button.textContent = user && !user.isAnonymous ? (accountProfile?.displayName || '設定使用者名稱') : '登入／註冊';
  button.title = user && !user.isAnonymous ? '查看個人資料與對戰紀錄' : '登入或建立棋手帳號';
}
function setAccountView(user) {
  const signedIn = !!user && !user.isAnonymous;
  const needsName = signedIn && !accountProfile?.displayName;
  $('account-auth-fields').hidden = signedIn && !needsName;
  $('account-profile-area').hidden = !signedIn || needsName;
  $('account-auth-actions').hidden = signedIn;
  $('account-setup-save-btn').hidden = !needsName;
  $('account-name-label').hidden = !needsName;
  $('account-username').hidden = !needsName;
  $('account-close-btn').hidden = needsName;
  $('account-modal-title').textContent = needsName ? '請先設定使用者名稱' : signedIn ? '👤 我的棋手帳號' : '👤 登入／註冊';
  $('account-subtitle').textContent = needsName ? '第一次登入必須設定名稱，之後可以隨時修改。' : signedIn ? '你的對戰紀錄會跟著帳號保存。' : '註冊帳號即可跨裝置保存單機與多人對戰紀錄。';
  if (signedIn && !needsName) {
    $('account-profile-name').textContent = accountProfile.displayName;
    $('account-edit-name').value = accountProfile.displayName;
  }
  paintAccountButton(user);
  if (needsName && accountModal) accountModal.hidden = false;
}
async function initializeAccountSystem() {
  if (accountApi && accountAuth && accountDb) return;
  if (firebaseConfig.apiKey === 'YOUR_API_KEY' || String(firebaseConfig.databaseURL).includes('YOUR_DATABASE')) {
    accountStatus('請先設定 js/firebase-config.js 的 Firebase 設定。', true);
    return;
  }
  const [appMod, authMod, dbMod] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
  ]);
  accountApi = { ...appMod, ...authMod, ...dbMod };
  const app = accountApi.getApps().find(a => a.name === 'xiangqi-player-accounts') || accountApi.initializeApp(firebaseConfig, 'xiangqi-player-accounts');
  accountAuth = accountApi.getAuth(app);
  accountDb = accountApi.getDatabase(app);
  try { await accountApi.setPersistence(accountAuth, accountApi.browserLocalPersistence); } catch { }
  if (!accountAuthListenerStarted) {
    accountAuthListenerStarted = true;
    accountApi.onAuthStateChanged(accountAuth, async user => {
      accountProfile = null;
      if (user && !user.isAnonymous) {
        try {
          const snap = await accountApi.get(accountApi.ref(accountDb, `users/${user.uid}/profile`));
          accountProfile = snap.val() || null;
        } catch (e) { accountStatus(`讀取個人資料失敗：${e.message || e}`, true); }
      }
      setAccountView(user);
      if (user && !user.isAnonymous && accountProfile?.displayName) await loadAccountMatches(user.uid);
      else { if ($('account-ai-match-list')) $('account-ai-match-list').innerHTML = '<p class="muted small">登入後會載入 AI 戰績。</p>'; if ($('account-online-match-list')) $('account-online-match-list').innerHTML = '<p class="muted small">登入後會載入連線戰績。</p>'; }
    });
  }
}
async function loadAccountMatches(uid) {
  const renderCategory = (matches, prefix, emptyText, modeLabel) => {
    const stats = { played: matches.length, wins: 0, losses: 0, draws: 0 };
    for (const match of matches) {
      if (match.result === 'win') stats.wins++;
      else if (match.result === 'loss') stats.losses++;
      else stats.draws++;
    }
    $(`account-${prefix}-played`).textContent = stats.played;
    $(`account-${prefix}-wins`).textContent = stats.wins;
    $(`account-${prefix}-losses`).textContent = stats.losses;
    $(`account-${prefix}-draws`).textContent = stats.draws;
    const list = $(`account-${prefix}-match-list`);
    if (!matches.length) { list.innerHTML = `<p class="muted small">${emptyText}</p>`; return; }
    list.innerHTML = matches.slice(0, 12).map(m => {
      const result = m.result === 'win' ? '勝利' : m.result === 'loss' ? '失敗' : '平手';
      const resultClass = m.result === 'win' ? 'match-win' : m.result === 'loss' ? 'match-loss' : 'match-draw';
      const level = m.aiLevel === 'easy' ? '初級' : m.aiLevel === 'medium' ? '中級' : '高級';
      const title = prefix === 'ai' ? `AI 對戰（${level}）` : '多人連線對戰';
      const date = Number(m.finishedAt) > 0 ? new Date(Number(m.finishedAt)).toLocaleString('zh-TW') : '時間未知';
      return `<article class="account-match-row"><div><strong>${escapeHtml(title)}</strong><span class="muted small">${escapeHtml(date)} · ${Number(m.moveCount || 0)} 步</span>${m.opponentName ? `<span class="muted small">對手：${escapeHtml(m.opponentName)}</span>` : ''}${m.roomCode ? `<span class="muted small">房號：${escapeHtml(m.roomCode)}</span>` : ''}</div><b class="${resultClass}">${result}</b></article>`;
    }).join('');
  };
  try {
    const snap = await accountApi.get(accountApi.ref(accountDb, `users/${uid}/matches`));
    const values = snap.val() || {};
    const matches = Object.entries(values).map(([id, value]) => ({ id, ...value })).sort((a, b) => Number(b.finishedAt || 0) - Number(a.finishedAt || 0));
    // Same-device two-player games are intentionally excluded from account records.
    renderCategory(matches.filter(m => m.mode === 'pve'), 'ai', '還沒有 AI 對戰紀錄。完成一場 AI 對局後會顯示在這裡。', 'AI');
    renderCategory(matches.filter(m => m.mode === 'online'), 'online', '還沒有連線對打紀錄。完成一場多人連線對局後會顯示在這裡。', 'Online');
  } catch (e) {
    const message = `無法載入戰績：${escapeHtml(e.message || e)}。請確認 Firebase Rules 已允許本人讀取 users/${escapeHtml(uid)}。`;
    if ($('account-ai-match-list')) $('account-ai-match-list').innerHTML = `<p class="muted small">${message}</p>`;
    if ($('account-online-match-list')) $('account-online-match-list').innerHTML = `<p class="muted small">${message}</p>`;
  }
}
async function registerAccount() {
  try {
    await initializeAccountSystem();
    if (!accountApi) return;
    const email = $('account-email').value.trim(), password = $('account-password').value;
    if (!email || !password) { accountStatus('請輸入電子郵件與密碼。', true); return; }
    if (!isValidAccountEmail(email)) { accountStatus('必須填寫有效的電子郵件地址，例如 name@example.com。', true); $('account-email').focus(); return; }
    if (password.length < 6) { accountStatus('密碼必須至少包含 6 個字元。', true); $('account-password').focus(); return; }
    $('account-register-btn').disabled = true;
    accountStatus('正在建立帳號…');
    await accountApi.createUserWithEmailAndPassword(accountAuth, email, password);
    accountStatus('帳號建立成功，請設定使用者名稱。');
  } catch (e) {
    const msg = e.code === 'auth/email-already-in-use' ? '這個電子郵件已註冊，請直接登入。' : e.code === 'auth/invalid-email' ? '電子郵件格式不正確。' : e.code === 'auth/weak-password' ? '密碼強度不足，請使用至少 6 個字元。' : `註冊失敗：${e.message || e}`;
    accountStatus(msg, true);
  } finally { if ($('account-register-btn')) $('account-register-btn').disabled = false; }
}
async function loginAccount() {
  try {
    await initializeAccountSystem();
    if (!accountApi) return;
    const email = $('account-email').value.trim(), password = $('account-password').value;
    if (!email || !password) { accountStatus('請輸入電子郵件與密碼。', true); return; }
    if (!isValidAccountEmail(email)) { accountStatus('必須填寫有效的電子郵件地址，例如 name@example.com。', true); $('account-email').focus(); return; }
    if (password.length < 6) { accountStatus('密碼必須至少包含 6 個字元。', true); $('account-password').focus(); return; }
    $('account-login-btn').disabled = true;
    accountStatus('正在登入…');
    await accountApi.signInWithEmailAndPassword(accountAuth, email, password);
    accountStatus('登入成功。');
  } catch (e) {
    accountStatus(e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found' ? '電子郵件或密碼錯誤。' : `登入失敗：${e.message || e}`, true);
  } finally { if ($('account-login-btn')) $('account-login-btn').disabled = false; }
}
async function saveAccountName() {
  const user = accountAuth?.currentUser;
  if (!user || user.isAnonymous) { accountStatus('請先登入帳號。', true); return; }
  const firstSetup = !accountProfile?.displayName;
  const name = cleanPlayerName(firstSetup ? $('account-username').value : $('account-edit-name').value);
  if (!name) { accountStatus('使用者名稱不可空白。', true); return; }
  try {
    accountStatus('正在儲存名稱…');
    await accountApi.set(accountApi.ref(accountDb, `users/${user.uid}/profile`), { displayName: name, email: user.email || '', updatedAt: Date.now(), createdAt: accountProfile?.createdAt || Date.now() });
    accountProfile = { ...(accountProfile || {}), displayName: name, email: user.email || '', updatedAt: Date.now() };
    localStorage.setItem('xiangqi-nickname', name);
    setAccountView(user);
    accountStatus('使用者名稱已儲存。');
  } catch (e) { accountStatus(`儲存失敗：${e.message || e}。請確認 Firebase Rules。`, true); }
}
$('account-open-btn')?.addEventListener('click', async () => {
  openAccountModal();
  try { await initializeAccountSystem(); const u = accountAuth?.currentUser; if (!u || u.isAnonymous) { $('account-auth-fields').hidden = false; $('account-profile-area').hidden = true; } }
  catch (e) { accountStatus(`帳號系統初始化失敗：${e.message || e}`, true); }
});
$('account-close-btn')?.addEventListener('click', closeAccountModal);
$('account-modal')?.addEventListener('click', e => { if (e.target === accountModal) closeAccountModal(); });
$('account-login-btn')?.addEventListener('click', loginAccount);
$('account-register-btn')?.addEventListener('click', registerAccount);
$('account-save-name-btn')?.addEventListener('click', saveAccountName);
$('account-setup-save-btn')?.addEventListener('click', saveAccountName);
$('account-logout-btn')?.addEventListener('click', async () => { try { await accountApi.signOut(accountAuth); accountProfile = null; accountStatus('已登出。'); } catch (e) { accountStatus(`登出失敗：${e.message || e}`, true); } });
$('account-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginAccount(); });
$('account-username')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveAccountName(); });
$('account-edit-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveAccountName(); });
initializeAccountSystem().catch(e => { console.warn('帳號系統初始化失敗', e); accountStatus(`帳號系統初始化失敗：${e.message || e}`, true); });
