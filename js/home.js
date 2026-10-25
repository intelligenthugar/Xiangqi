import { firebaseConfig } from './firebase-config.js';
const $ = id => document.getElementById(id);
const ADMIN_PASSWORD = 'prohaugar'; // Prototype only: visible in source; not secure authentication.
const LANG_KEY = 'xiangqi-language';
let english = localStorage.getItem(LANG_KEY) === 'en';
const textTranslations = {
  '繁體中文':'繁體中文','English':'English','🪨 中國象棋':'🪨 Xiangqi','🪨 中國象棋（傳統大棋盤）':'🪨 Xiangqi (Traditional Board)','中國象棋｜多人連線大廳':'Xiangqi | Multiplayer Lobby','中國象棋':'Xiangqi',
  '選擇你的對弈方式':'Choose How to Play','保留傳統棋盤風格，與 AI 或朋友一決勝負。':'Play Xiangqi against the AI or a friend.','單機版':'Single Player','與 AI 對弈，支援初級與高級難度。':'Play against AI with easy and hard difficulty.','開始遊戲 →':'Start Game →','多人連線':'Online Multiplayer','建立公開或私人房間，輸入房號與朋友即時對弈。':'Create a public or private room and play with a friend.','建立公開或私人房間，輸入房號與朋友即時對弈。':'Create a public or private room and play with a friend.','進入連線大廳 →':'Enter Lobby →','找到你上次的對局':'Your Previous Game','恢復上次對局':'Resume Previous Game','🌐 公開房間列表':'🌐 Public Rooms','顯示等待中的公開房間；私人房間不會列在這裡。':'Waiting public rooms are shown here. Private rooms are hidden.','重新整理':'Refresh','正在載入公開房間…':'Loading public rooms…','多人連線需要網路及 Firebase 設定。公開列表需在 Firebase Realtime Database Rules 加入本 ZIP 提供的 publicRooms 規則。':'Online play requires an internet connection and Firebase configuration. Add the publicRooms rule to your Firebase Realtime Database Rules to enable the public list.','🛡️ 管理員模式（原型）':'🛡️ Admin Mode (Prototype)','安全限制：這是純前端原型，密碼會出現在 JavaScript 中，不能當成真正的管理員驗證。此介面不會提供刪除房間功能。':'Security note: This is a front-end prototype. The password is visible in JavaScript and is not secure authentication. Room deletion is not available here.','管理員密碼':'Admin Password','輸入管理員密碼':'Enter admin password','登入管理介面':'Log In to Admin Panel','密碼錯誤。':'Incorrect password.','全部房間狀態（含私人房間）':'All Rooms (Including Private Rooms)','管理員列表會列出 rooms 節點中的公開與私人房間；目前只提供查看／加入，不提供刪除。注意：為了讓靜態網站列出全部房間，已登入的匿名使用者也能讀取房間清單；此原型不適合放置敏感資料。':'The admin list shows public and private rooms from the rooms node. You can view/join rooms but cannot delete them. To list all rooms on this static site, signed-in anonymous users can also read the room list. Do not store sensitive data in this prototype.','重新載入列表':'Reload List','目前沒有符合條件的公開房間。':'No public rooms match the current filter.','目前沒有房間（公開或私人）。':'There are no rooms (public or private).','等待加入':'Waiting for Player','對局中':'In Game','已結束':'Finished','已關閉':'Closed','公開房間':'Public Room','私人房間':'Private Room','房主：':'Host: ','建立：':'Created: ','人數：':'Players: ','需要密碼':'Password Required','無密碼':'No Password','不可加入':'Unavailable','輸入／加入':'Join','查看／加入':'View / Join','房間代碼：':'Room Code: ','房間類型':'Room Type','房間密碼（可留空）':'Room Password (Optional)','玩家暱稱':'Nickname','輸入暱稱（1～18 字）':'Enter nickname (1–18 characters)','公開房間（顯示在大廳）':'Public Room (Shown in Lobby)','私人房間（不公開）':'Private Room (Hidden from Lobby)','設定密碼；加入時需輸入':'Set a password; required to join','建立房間':'Create Room','加入房間':'Join Room','輸入 6 碼房間代碼':'Enter 6-character room code','暱稱只用於顯示。此原型的房間密碼是前端檢查，不能取代伺服器端安全驗證。':'Nicknames are for display only. Passwords are checked on the client and are not a substitute for server-side security.','📋 複製房間代碼':'📋 Copy Room Code','🔗 複製邀請網址':'🔗 Copy Invite Link','🚪 離開房間':'🚪 Leave Room','紅方：等待玩家　｜　黑方：等待玩家':'Red: Waiting　|　Black: Waiting','🟡 對手狀態：尚未確認':'🟡 Opponent: Not Confirmed','🏠 首頁':'🏠 Home','傳統象棋':'Xiangqi','傳統象棋（傳統大棋盤）':'Xiangqi (Traditional Board)','單人對戰 (AI)':'Single Player (AI)','雙人對戰（同裝置）':'Two Players (Same Device)','AI: 初級':'AI: Easy','AI: 高級 (Minimax)':'AI: Hard (Minimax)','重來':'Restart','🤖 象棋 AI 戰績：':'🤖 AI Stats: ','勝:':'Wins:','敗:':'Losses:','和:':'Draws:','重置':'Reset','準備開始…':'Ready to start…','⚠️ 將軍 CHECK！點一下這個提示可關閉':'⚠️ CHECK! Click this notice to dismiss','⚠️ 將軍！CHECK!':'⚠️ CHECK!','🏆 遊戲結束！':'🏆 Game Over!','確定':'OK','取消':'Cancel','多人連線對戰':'Online Match','🌐 多人連線':'🌐 Online Multiplayer','建立房間後，把顯示的 6 碼代碼傳給朋友；對方輸入代碼後即可加入。':'After creating a room, share the 6-character code with your friend. They can enter it to join.','點選等待中的房間即可加入；私人房間不會出現在這裡。':'Select a waiting room to join. Private rooms are not shown here.','正在連線…':'Connecting…','目前沒有等待中的公開房間。你可以建立公開房間，或輸入朋友提供的房號。':'No public rooms are waiting. You can create a public room or enter a friend’s room code.','等待黑方玩家加入…':'Waiting for Black to join…','對局進行中':'Game in progress','本局已結束':'This game has ended','房間已關閉':'Room closed','房間已建立，但未登上公開列表；請依 README 合併 publicRooms 規則。':'Room created, but it is not listed publicly. Merge the publicRooms rule into your Firebase Rules.','房間建立成功！請把代碼傳給朋友，等待黑方加入。':'Room created! Share the code with your friend and wait for Black to join.','已成功加入房間，開始對弈！':'Joined the room. The game is starting!','已重新連回你原本的座位。':'Reconnected to your previous seat.','你是紅方（先手）':'You are Red (first)','你是黑方（後手）':'You are Black (second)','⚡ 🔴 紅方 被將軍！請儘快應將':'⚡ 🔴 Red is in check! Respond to the check.','⚡ ⚫ 黑方 被將軍！請儘快應將':'⚡ ⚫ Black is in check! Respond to the check.','現在是對方的回合':'It is your opponent’s turn.','請先建立或加入房間':'Create or join a room first.','主帥已被吃掉！':'The general has been captured!','將死！':'Checkmate!','困斃！':'Stalemate!','勝方 打敗了 敗方':'Winner defeated loser','勝方獲勝！':'Winner wins!','請先編輯 js/firebase-config.js，填入 Firebase Console 的真實設定。':'Edit js/firebase-config.js and enter your Firebase Console configuration first.','Firebase 已連線（匿名玩家），可以建立或加入房間。':'Connected to Firebase (anonymous player). You can create or join a room.','房間代碼格式不正確，請向房主索取新連結。':'Invalid room code. Please ask the host for a new invite link.','房間密碼錯誤。':'Incorrect room password.','房間不存在或已結束。':'Room does not exist or has ended.','房間已滿。':'Room is full.','對手已離開房間':'Your opponent left the room','本局結束。你將返回連線大廳。':'The game has ended. You will return to the lobby.','已複製房間代碼！傳給朋友即可加入。':'Room code copied! Send it to your friend to join.','已複製邀請網址！傳給朋友，對方開啟後會自動嘗試加入。':'Invite link copied! Send it to your friend; opening it will attempt to join automatically.','公開列表規則尚未設定，房間目前無法顯示在大廳。':'Public-room rules are not configured, so the room cannot appear in the lobby.','正在建立…':'Creating…','正在加入…':'Joining…','正在通知對方…':'Notifying opponent…','你不是此房間的玩家':'You are not a player in this room','等待玩家':'Waiting for player','棋手':'Player','紅方':'Red','黑方':'Black','公開':'Public','私人':'Private','有':'Yes','無':'No','時間未知':'Unknown time','目前公開房間：':'Public rooms: ','間等待加入':' waiting','公開房間 ':'Public rooms ',' 間等待加入':' waiting','Firebase 尚未連線，無法載入公開房間。':'Firebase is not connected; public rooms cannot be loaded.','Firebase 尚未連線。':'Firebase is not connected.','讀取失敗：':'Read failed: ','載入失敗：':'Loading failed: ','同步失敗：':'Sync failed: ','房間同步失敗：':'Room sync failed: ','棋步未同步：可能已輪到對方或連線規則拒絕寫入':'Move not synced: it may be your opponent’s turn or Firebase Rules rejected the write.','多人模式的重新開始目前請建立新房間，避免兩端棋局不同步。':'To restart an online game, create a new room to avoid desynchronization.','對手狀態：尚未確認':'Opponent status: not confirmed','已離線':'Offline','在線上':'Online','尚未確認連線':'Connection not confirmed','請儘快應將':'Respond to the check','輪到 ':'Turn: ',' 行棋':' to move','（等待對方）':' (waiting for opponent)',' 打敗了 ':' defeated ','被將軍！':' is in check!','房間 ':'Room ',' 需要密碼，請輸入房主提供的密碼：':' requires a password. Enter the password from the host:','邀請網址中的房間代碼格式不正確，請向房主索取新連結。':'Invalid room code in invite link. Ask the host for a new link.','房間已建立！':'Room created!','請把代碼傳給朋友加入。':'Share the code with your friend to join.','你的角色：黑方（後手）':'Your role: Black (second)','房間建立成功！':'Room created!','你將返回連線大廳。':'You will return to the online lobby.','目前無法讀取公開房間；你仍可使用房號加入。':'Cannot load public rooms right now; you can still join using a room code.','尚未設定 Firebase；單機模式仍可使用。':'Firebase is not configured yet; single-player mode is still available.','公開列表需在 Firebase Realtime Database Rules 加入本 ZIP 提供的 publicRooms 規則。':'Add the publicRooms rule to Firebase Realtime Database Rules to enable the public list.','單機模式':'Single Player','連線大廳':'Online Lobby','你已返回連線大廳。':'You have returned to the online lobby.'
};
const attributeTranslations = {
  '輸入暱稱（1～18 字）':'Enter nickname (1–18 characters)','設定密碼；加入時需輸入':'Set a password; required to join','輸入 6 碼房間代碼':'Enter 6-character room code','輸入管理員密碼':'Enter admin password','管理員模式':'Admin mode','關閉':'Close'
};
function translateChinese(text){
  if(textTranslations[text]!==undefined)return textTranslations[text];
  let out=text;
  const replacements=[
    ['房間建立成功！','Room created!'],['加入房間成功！','Joined room!'],['房間代碼：','Room code: '],['玩家暱稱：','Nickname: '],['房間類型：','Room type: '],['密碼保護：','Password protection: '],['請把代碼傳給朋友加入。','Share the code with your friend to join.'],['等待黑方加入。','Waiting for Black to join.'],['已離開，本局結束。你已返回連線大廳。','left. The game has ended. You returned to the lobby.'],['已離開，本局結束。你將返回連線大廳。','left. The game has ended. You will return to the lobby.'],['已離開','left'],['正在加入房間','Joining room'],['正在加入公開房間','Joining public room'],['公開房間','Public room'],['等待加入','Waiting'],['建立成功','Created successfully'],['建立失敗','Failed to create'],['加入失敗','Failed to join'],['房間已滿','Room is full'],['房間不存在','Room not found'],['密碼錯誤','Incorrect password'],['紅方：','Red: '],['黑方：','Black: '],['房主：','Host: '],['建立：','Created: '],['人數：','Players: '],['你是紅方（先手）','You are Red (first)'],['你是黑方（後手）','You are Black (second)'],['紅方','Red'],['黑方','Black'],['等待玩家','Waiting for player'],['打敗了','defeated'],['將軍！','CHECK!'],['對局中','In game'],['已結束','Finished'],['私人','Private'],['公開','Public'],['有','Yes'],['無','No']
  ];
  for(const [from,to] of replacements)out=out.split(from).join(to);
  return out;
}
const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
function applyLanguage(root=document){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode())){
    if(!originalTextNodes.has(node))originalTextNodes.set(node,node.nodeValue);
    const original=originalTextNodes.get(node);
    const next=english?translateChinese(original):original;
    if(node.nodeValue!==next)node.nodeValue=next;
  }
  const elements = root.nodeType===Node.ELEMENT_NODE ? [root,...root.querySelectorAll('*')] : [...root.querySelectorAll('*')];
  for(const el of elements){
    for(const attr of ['placeholder','title','aria-label']){
      if(!el.hasAttribute(attr))continue;
      let saved=originalAttributes.get(el);if(!saved){saved={};originalAttributes.set(el,saved)}
      if(saved[attr]===undefined)saved[attr]=el.getAttribute(attr);
      const original=saved[attr];const next=english?(attributeTranslations[original]||translateChinese(original)):original;
      if(el.getAttribute(attr)!==next)el.setAttribute(attr,next);
    }
  }
  document.documentElement.lang=english?'en':'zh-TW';
  const langButton=document.getElementById('lang-btn');if(langButton)langButton.textContent=english?'繁體中文':'English';
}
function toggleLanguage(){english=!english;localStorage.setItem(LANG_KEY,english?'en':'zh');applyLanguage();}
document.getElementById('lang-btn')?.addEventListener('click',toggleLanguage);
applyLanguage();
const languageObserver=new MutationObserver(records=>{
  for(const record of records){
    if(record.type==='childList')record.addedNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE){if(!originalTextNodes.has(n))originalTextNodes.set(n,n.nodeValue);if(english)n.nodeValue=translateChinese(originalTextNodes.get(n));}else if(n.nodeType===Node.ELEMENT_NODE)applyLanguage(n);});
    else if(record.type==='characterData'&&record.target.nodeType===Node.TEXT_NODE){const n=record.target;if(!originalTextNodes.has(n))originalTextNodes.set(n,n.nodeValue);if(english){const next=translateChinese(originalTextNodes.get(n));if(n.nodeValue!==next)n.nodeValue=next;}}
  }
});
languageObserver.observe(document.documentElement,{subtree:true,childList:true,characterData:true});

let db = null, api = null, roomsCache = [], allRoomsCache = [], roomsListenerStarted = false;
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
