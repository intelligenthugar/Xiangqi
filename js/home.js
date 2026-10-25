import { firebaseConfig } from './firebase-config.js';
const $ = id => document.getElementById(id);
const ADMIN_PASSWORD = 'prohaugar'; // Prototype only: visible in source; not secure authentication.
let db = null, api = null, roomsCache = [], allRoomsCache = [], roomsListenerStarted = false;
try { const savedRoom = JSON.parse(localStorage.getItem('xiangqi-active-room') || 'null'); if (savedRoom?.code) { $('resume-room-container').hidden = false; $('resume-room-link').href = `chess.html?mode=online&room=${encodeURIComponent(savedRoom.code)}`; $('resume-room-link').textContent = `恢復房間 ${savedRoom.code}`; } } catch {}
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
function renderAdminRoomList(target) {
  const rooms = allRoomsCache.slice().sort((a,b) => Number(b.createdAt||0)-Number(a.createdAt||0));
  if (!rooms.length) { target.innerHTML = '<p class="muted small">目前沒有房間（公開或私人）。</p>'; return; }
  target.innerHTML = rooms.map(r => {
    const status = r.status === 'waiting' ? '等待加入' : r.status === 'playing' ? '對局中' : r.status === 'finished' ? '已結束' : r.status === 'closed' ? '已關閉' : escapeHtml(r.status||'狀態未知');
    const visibility = r.visibility === 'private' ? '🔒 私人房間' : '🌐 公開房間';
    const players = `${r.playersCount||((r.players?.black)?2:1)}/2`;
    const join = r.status === 'waiting' ? `<a class="room-join-link" href="chess.html?mode=online&room=${encodeURIComponent(r.code)}">查看／加入</a>` : '<span class="muted small">不可加入</span>';
    return `<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeHtml(r.code)}</strong><span class="room-status">${visibility} · ${status}</span><span class="muted small">房主：${escapeHtml(r.hostName||r.playerNames?.red||'棋手')}</span><span class="muted small">建立：${escapeHtml(formatTime(r.createdAt))}</span><span class="muted small">人數：${players}　${r.hasPassword||r.settings?.hasPassword?'🔒 需要密碼':'🔓 無密碼'}</span></div><div>${join}</div></article>`;
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
      if (!$('admin-dashboard').hidden) renderAdminRoomList($('admin-room-list'));
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
        return {...pub, code, ...room, visibility: room.settings?.visibility || (pub.hostUid ? 'public' : 'private'), hostName: pub.hostName || room.playerNames?.red || '棋手', playersCount: room.players?.black ? 2 : 1, hasPassword: !!(room.settings?.hasPassword || room.settings?.passwordHash)};
      });
      if (!$('admin-dashboard').hidden) renderAdminRoomList($('admin-room-list'));
    }, error => {
      console.warn('管理員房間清單讀取失敗', error);
      if (!$('admin-dashboard').hidden) $('admin-room-list').innerHTML = `<p class="muted small">讀取私人／全部房間失敗：${escapeHtml(error.message||error)}。請確認 rooms 節點的 .read 規則允許 auth != null。</p>`;
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
  if (db) renderAdminRoomList($('admin-room-list'));
  else $('admin-room-list').innerHTML = '<p class="muted small">Firebase 尚未連線，無法載入公開房間。</p>';
}
$('admin-login-btn').addEventListener('click', adminLogin);
$('admin-password-input').addEventListener('keydown', e => { if (e.key === 'Enter') adminLogin(); });
$('admin-refresh-btn').addEventListener('click', async () => {
  if (!db || !api) return;
  try {
    const [publicSnap, allSnap] = await Promise.all([api.get(api.ref(db, 'publicRooms')), api.get(api.ref(db, 'rooms'))]);
    const publicValue = publicSnap.val() || {};
    roomsCache = Object.entries(publicValue).map(([code,r])=>({...r,code:r.code||code}));
    const publicByCode = new Map(roomsCache.map(r => [r.code, r]));
    const allValue = allSnap.val() || {};
    allRoomsCache = Object.entries(allValue).map(([code, room]) => {
      const pub = publicByCode.get(code) || {};
      return {...pub, code, ...room, visibility: room.settings?.visibility || (pub.hostUid ? 'public' : 'private'), hostName: pub.hostName || room.playerNames?.red || '棋手', playersCount: room.players?.black ? 2 : 1, hasPassword: !!(room.settings?.hasPassword || room.settings?.passwordHash)};
    });
    renderAdminRoomList($('admin-room-list'));
  } catch(e) { $('admin-room-list').innerHTML = `<p class="muted small">載入失敗：${escapeHtml(e.message||e)}。請確認 rooms 節點讀取規則。</p>`; }
});
initRooms();


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
    general: {icon:'帥',title:'帥／將',description:'每次沿直線走一格，只能在九宮內活動。將與帥不能直接照面。',tip:'小提醒：保護主帥是第一要務，別讓它暴露在車、炮的攻擊線上。'},
    advisor: {icon:'仕',title:'仕／士',description:'每次沿斜線走一格，只能在九宮內活動。它主要負責守護將／帥。',tip:'小提醒：不要為了吃小棋而隨意把士、仕移離主帥身邊。'},
    elephant: {icon:'相',title:'相／象',description:'每次斜走兩格，俗稱「田」字走法；中間的格子若有棋子擋住就不能走，而且不能過河。',tip:'小提醒：象眼被塞住就不能走，走之前記得檢查中間點。'},
    rook: {icon:'俥',title:'俥／車',description:'可以沿橫線或直線走任意格，但路徑中不能穿過其他棋子。車也沿直線吃子。',tip:'小提醒：車的威力很大，盡早讓車出動並打開通道。'},
    horse: {icon:'傌',title:'傌／馬',description:'走「日」字：先直走一格再斜走一格。若第一步的相鄰格被棋子堵住，就叫「蹩馬腿」，不能走那個方向。',tip:'小提醒：馬不是可以跳過所有棋子的棋子，記得注意馬腿。'},
    cannon: {icon:'炮',title:'炮／包',description:'不吃子時像車一樣沿直線移動；吃子時必須與目標之間恰好隔著一顆棋子，這顆棋子就是炮架。',tip:'小提醒：炮架很重要，沒有隔子就不能吃；隔了兩顆也不能吃。'},
    soldier: {icon:'兵',title:'兵／卒',description:'過河前只能向前走一格；過河後可以向前或左右走一格，但永遠不能後退。',tip:'小提醒：兵卒過河後更有攻擊力，別忽略它們的推進。'}
  };
  const detailIcon = $('piece-detail-icon'), detailTitle = $('piece-detail-title'), detailDescription = $('piece-detail-description'), detailTip = $('piece-detail-tip');
  tutorialRoot.querySelectorAll('[data-piece]').forEach(button => button.addEventListener('click', () => {
    const lesson = pieceLessons[button.dataset.piece]; if (!lesson) return;
    tutorialRoot.querySelectorAll('[data-piece]').forEach(item => item.classList.toggle('active', item === button));
    detailIcon.textContent = lesson.icon; detailTitle.textContent = lesson.title; detailDescription.textContent = lesson.description; detailTip.textContent = lesson.tip;
  }));

  const quiz = [
    {q:'哪一種棋子可以沿直線走任意格，直到被棋子擋住？', options:['馬','車','炮'], answer:1, explain:'答對了！車可以沿橫線或直線移動，路徑不能穿過其他棋子。'},
    {q:'炮要吃掉對方的棋子，通常需要什麼條件？', options:['目標旁邊不能有棋子','與目標之間恰好隔一顆棋子','一定要先過河'], answer:1, explain:'答對了！炮吃子需要隔一顆棋子作為炮架。'},
    {q:'兵／卒過河後，可以怎麼走？', options:['可以後退一格','只能向前走','可以向前或左右走一格，不能後退'], answer:2, explain:'答對了！過河後兵卒可以向前或左右走一格，但不能後退。'}
  ];
  let quizIndex = 0, quizScore = 0, quizAnswered = false, quizFinished = false;
  const quizCount = $('quiz-count'), quizQuestion = $('quiz-question'), quizOptions = $('quiz-options'), quizFeedback = $('quiz-feedback'), quizNext = $('quiz-next');
  function renderQuiz() {
    const item = quiz[quizIndex]; quizAnswered = false; quizFinished = false;
    quizCount.textContent = `新手測驗 · 第 ${quizIndex+1} 題，共 ${quiz.length} 題`;
    quizQuestion.textContent = item.q; quizFeedback.textContent = '選一個答案試試看。'; quizFeedback.className = 'quiz-feedback'; quizNext.disabled = true; quizNext.textContent = quizIndex === quiz.length-1 ? '查看成績' : '下一題';
    quizOptions.innerHTML = '';
    item.options.forEach((label, index) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => {
      if (quizAnswered) return; quizAnswered = true; const correct = index === item.answer; if (correct) quizScore++;
      [...quizOptions.children].forEach((option, optionIndex) => { option.disabled = true; if (optionIndex === item.answer) option.classList.add('correct-answer'); else if (optionIndex === index) option.classList.add('wrong-answer'); });
      quizFeedback.textContent = (correct ? '✅ 正確！' : `❌ 正確答案是「${item.options[item.answer]}」。`) + ' ' + item.explain; quizFeedback.classList.add(correct ? 'correct' : 'wrong'); quizNext.disabled = false;
    }); quizOptions.appendChild(button); });
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
