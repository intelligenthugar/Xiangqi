import { firebaseConfig } from './firebase-config.js';

const $=id=>document.getElementById(id);const params=new URLSearchParams(location.search);let onlineMode=params.get('mode')==='online';let inviteRoomCode=(params.get('room')||'').trim().toUpperCase();let autoJoinAttempted=false;
let app=null,auth=null,db=null,user=null,roomCode=null,myColor=null,roomUnsubscribe=null,onlineReady=false,applyingRemote=false;
let firebaseApi=null,publicRoomsUnsubscribe=null,roomNoticeUnsubscribe=null,onlinePublicRoomsCache=[],lastRoomNoticeId='',lastSeenMoveCount=-1,rematchResetStarted=false,rematchPromptOpen=false;
let currentPlayerNames={red:'紅方',black:'黑方'};
let chessPieces=[],chessSelectedIdx=-1,chessValidMoves=[],chessDangerMoves=[],chessTurn='red',chessGameMode='pve',currentAiLevel='hard',chessGameOver=false,isTossingCoin=false,isBannerDismissed=false,lastMove=null,moveHistory=[];
let chessStats=JSON.parse(localStorage.getItem('chess_ai_stats')||'null')||{wins:0,losses:0,draws:0};const pieceValues={'帥':10000,'將':10000,'俥':90,'車':90,'炮':45,'包':45,'傌':40,'馬':40,'相':20,'象':20,'仕':20,'士':20,'兵':10,'卒':10};
function setStatus(s){$('chess-status').textContent=s}
function showModal(id){$(id).hidden=false}function hideModal(id){$(id).hidden=true}
function initialBoard(){const b=Array(90).fill(null);const black=['車','馬','象','士','將','士','象','馬','車'];black.forEach((name,c)=>b[c]={name,color:'black',type:name});b[19]={name:'包',color:'black',type:'炮'};b[25]={name:'包',color:'black',type:'炮'};[0,2,4,6,8].forEach(c=>b[27+c]={name:'卒',color:'black',type:'卒'});[0,2,4,6,8].forEach(c=>b[54+c]={name:'兵',color:'red',type:'兵'});b[64]={name:'炮',color:'red',type:'炮'};b[70]={name:'炮',color:'red',type:'炮'};['俥','傌','相','仕','帥','仕','相','傌','俥'].forEach((name,c)=>b[81+c]={name,color:'red',type:name});return b}
function initGame(skipCoin=false){chessGameMode=$('chess-game-mode').value;currentAiLevel=$('chess-ai-level').value;$('chess-ai-level').style.display=chessGameMode==='pve'?'inline-block':'none';$('chess-ai-score-container').style.display=chessGameMode==='pve'?'flex':'none';chessPieces=initialBoard();chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];chessTurn='red';chessGameOver=false;isBannerDismissed=false;lastMove=null;moveHistory=[];updateStats();renderBoard();if(skipCoin||onlineMode){isTossingCoin=false;$('coin-overlay').style.display='none';if(onlineMode){chessTurn='red';updateStatus()}else updateStatus()}else tossCoin()}
function tossCoin(){isTossingCoin=true;$('coin-overlay').style.display='flex';$('coin-text-tip').textContent='🪙 擲硬幣決定先手...';const red=Math.random()<.5,deg=red?2160:2340;$('coin').style.transition='none';$('coin').style.transform='rotateY(0deg)';setTimeout(()=>{$('coin').style.transition='transform 1.2s cubic-bezier(.25,1,.5,1)';$('coin').style.transform=`rotateY(${deg}deg)`},50);setTimeout(()=>{$('coin-text-tip').textContent=red?'🪙 擲出「紅」！由紅方先手！':'🪙 擲出「黑」！由黑方先手！';setTimeout(()=>{$('coin-overlay').style.display='none';isTossingCoin=false;chessTurn=red?'red':'black';updateStatus();if(chessGameMode==='pve'&&chessTurn==='black')aiTurn()},900)},1250)}
function isKingsFacing(board){let r=-1,b=-1;for(let i=0;i<90;i++){if(board[i]?.name==='帥')r=i;if(board[i]?.name==='將')b=i}if(r<0||b<0||r%9!==b%9)return false;for(let row=Math.min(Math.floor(r/9),Math.floor(b/9))+1;row<Math.max(Math.floor(r/9),Math.floor(b/9));row++)if(board[row*9+r%9])return false;return true}
function between(from,to,board){let fr=Math.floor(from/9),fc=from%9,tr=Math.floor(to/9),tc=to%9,n=0;if(fr===tr){for(let c=Math.min(fc,tc)+1;c<Math.max(fc,tc);c++)if(board[fr*9+c])n++}else if(fc===tc){for(let r=Math.min(fr,tr)+1;r<Math.max(fr,tr);r++)if(board[r*9+fc])n++}return n}
function canMove(from,to,board){const a=board[from],d=board[to];if(!a||from===to||d?.color===a.color)return false;const fr=Math.floor(from/9),fc=from%9,tr=Math.floor(to/9),tc=to%9,dr=Math.abs(fr-tr),dc=Math.abs(fc-tc);switch(a.type){case'將':case'帥':return dr+dc===1&&tc>=3&&tc<=5&&(a.color==='black'?tr<=2:tr>=7);case'士':case'仕':return dr===1&&dc===1&&tc>=3&&tc<=5&&(a.color==='black'?tr<=2:tr>=7);case'象':case'相':return dr===2&&dc===2&&(a.color==='black'?tr<=4:tr>=5)&&!board[((fr+tr)/2|0)*9+((fc+tc)/2|0)];case'馬':case'傌':if(!((dr===1&&dc===2)||(dr===2&&dc===1)))return false;return dr===2?!board[((fr+tr)/2|0)*9+fc]:!board[fr*9+((fc+tc)/2|0)];case'車':case'俥':return(fr===tr||fc===tc)&&between(from,to,board)===0;case'炮':case'包':if(fr!==tr&&fc!==tc)return false;return d?between(from,to,board)===1:between(from,to,board)===0;case'卒':case'兵':if(dr+dc!==1)return false;if(a.color==='black')return (tr===fr+1&&dc===0)||(fr>=5&&tr===fr&&dc===1);return (tr===fr-1&&dc===0)||(fr<=4&&tr===fr&&dc===1);default:return false}}
function isCheck(board,color){const king=board.findIndex(p=>p?.name===(color==='red'?'帥':'將'));if(king<0)return true;for(let i=0;i<90;i++)if(board[i]?.color!==(color)&&board[i]&&canMove(i,king,board))return true;return false}
function legalMovesFrom(from,board=chessPieces){const piece=board[from],valid=[],danger=[];if(!piece)return{valid,danger};for(let to=0;to<90;to++){if(!canMove(from,to,board))continue;const src=board[from],dst=board[to];board[to]=src;board[from]=null;const bad=isKingsFacing(board)||isCheck(board,piece.color);board[from]=src;board[to]=dst;(bad?danger:valid).push(to)}return{valid,danger}}
function allLegalMoves(board,color){const out=[];for(let from=0;from<90;from++)if(board[from]?.color===color){for(const to of legalMovesFrom(from,board).valid)out.push({from,to})}return out}
function renderBoard(){const root=$('chess-board');root.innerHTML='';root.className='chess-board'+(chessGameMode==='pvp'?' pvp-mode':'')+(onlineMode&&myColor==='black'?' online-black-view':'');const svgNS='http://www.w3.org/2000/svg',svg=document.createElementNS(svgNS,'svg');svg.setAttribute('class','full-board-svg');svg.setAttribute('viewBox','0 0 360 400');let lines='';const cw=40,ch=40,ox=20,oy=20;lines+=`<rect x="18" y="18" width="324" height="364" stroke="#704214" stroke-width="2" fill="none"/>`;for(let r=0;r<10;r++)lines+=`<line x1="20" y1="${20+r*40}" x2="340" y2="${20+r*40}" stroke="#704214" stroke-width="1.5"/>`;for(let c=0;c<9;c++){if(c===0||c===8)lines+=`<line x1="${20+c*40}" y1="20" x2="${20+c*40}" y2="380" stroke="#704214" stroke-width="1.5"/>`;else{lines+=`<line x1="${20+c*40}" y1="20" x2="${20+c*40}" y2="180" stroke="#704214" stroke-width="1.5"/><line x1="${20+c*40}" y1="220" x2="${20+c*40}" y2="380" stroke="#704214" stroke-width="1.5"`+' />'}}lines+=`<text x="92" y="211" font-size="22" fill="#704214" font-weight="bold" font-family="KaiTi, 標楷體">楚 河</text><text x="228" y="211" font-size="22" fill="#704214" font-weight="bold" font-family="KaiTi, 標楷體">漢 界</text><line x1="140" y1="20" x2="220" y2="100" stroke="#704214"/><line x1="220" y1="20" x2="140" y2="100" stroke="#704214"/><line x1="140" y1="300" x2="220" y2="380" stroke="#704214"/><line x1="220" y1="300" x2="140" y2="380" stroke="#704214"/>`;svg.innerHTML=lines;root.appendChild(svg);const overlay=document.createElement('div');overlay.className='full-board-interactive';for(let i=0;i<90;i++){const cell=document.createElement('div');let cls='chess-cell';if(chessSelectedIdx===i)cls+=' selected';if(lastMove&&(lastMove.from===i||lastMove.to===i))cls+=' last-move';if(chessValidMoves.includes(i))cls+=chessPieces[i]?' valid-capture':' valid-move';if(chessDangerMoves.includes(i))cls+=chessPieces[i]?' invalid-danger-capture':' invalid-danger-move';cell.className=cls;cell.onclick=()=>handleClick(i);const p=chessPieces[i];if(p){const el=document.createElement('div');el.className='chess-piece '+p.color;el.textContent=p.name;el.setAttribute('aria-label',`${p.color==='red'?'紅方':'黑方'}${p.name}`);el.title=el.getAttribute('aria-label');cell.appendChild(el)}overlay.appendChild(cell)}root.appendChild(overlay)}
function updateStatus(){if(chessGameOver||isTossingCoin)return;const check=isCheck(chessPieces,chessTurn);const isTargetPlayerBoard=!onlineMode||(onlineReady&&myColor===chessTurn);const showCheck=check&&isTargetPlayerBoard&&!isBannerDismissed;$('check-banner').classList.toggle('show',showCheck);$('chess-status').classList.toggle('status-in-check',check&&isTargetPlayerBoard);if(check&&isTargetPlayerBoard)setStatus(`⚡ ${chessTurn==='red'?'🔴 紅方':'⚫ 黑方'} 被將軍！請儘快應將`);else setStatus(`輪到 ${chessTurn==='red'?'🔴 紅方':'⚫ 黑方'} 行棋${onlineMode&&myColor!==chessTurn?'（等待對方）':''}`)}
function getSideName(color){if(onlineMode)return currentPlayerNames[color]|| (color==='red'?'紅方':'黑方');if(chessGameMode==='pve')return color==='red'?'你':'AI';return color==='red'?'紅方':'黑方'}
function winnerMessage(winner){const loser=winner==='red'?'black':'red';return `${getSideName(winner)} 打敗了 ${getSideName(loser)}`}
function handleClick(idx){if(chessGameOver||isTossingCoin||applyingRemote)return;if(onlineMode&&(!onlineReady||myColor!==chessTurn)){setStatus(myColor?'現在是對方的回合':'請先建立或加入房間');return}if(!onlineMode&&chessGameMode==='pve'&&chessTurn==='black')return;const p=chessPieces[idx];if(p?.color===chessTurn){chessSelectedIdx=idx;const m=legalMovesFrom(idx);chessValidMoves=m.valid;chessDangerMoves=m.danger;renderBoard();return}if(chessSelectedIdx>=0&&chessValidMoves.includes(idx)){const from=chessSelectedIdx;const move={from,to:idx,movedPiece:chessPieces[from],capturedPiece:chessPieces[idx],turn:chessTurn};applyMoveLocal(move);if(onlineMode)sendMove();else if(!chessGameOver&&chessGameMode==='pve'&&chessTurn==='black')aiTurn()}}
function applyMoveLocal(m){moveHistory.push({from:m.from,to:m.to,movedPiece:chessPieces[m.from],capturedPiece:chessPieces[m.to],turn:chessTurn});chessPieces[m.to]=chessPieces[m.from];chessPieces[m.from]=null;lastMove={from:m.from,to:m.to};isBannerDismissed=false;chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];renderBoard();const winner=chessPieces.some(p=>p?.name==='帥')?(chessPieces.some(p=>p?.name==='將')?null:'red'):'black';if(winner){finishGame(winner,'主帥已被吃掉！');return}chessTurn=chessTurn==='red'?'black':'red';updateStatus();const moves=allLegalMoves(chessPieces,chessTurn);if(!moves.length){finishGame(chessTurn==='red'?'black':'red',isCheck(chessPieces,chessTurn)?'將死！':'困斃！')}}
function configureFinishedModal(mode='finished'){
  const online=onlineMode&&!!roomCode;
  $('rematch-request-btn').hidden=!online||mode!=='finished';
  $('rematch-accept-btn').hidden=!online||mode!=='incoming';
  $('rematch-decline-btn').hidden=!online||!['finished','incoming','waiting'].includes(mode);
  $('confirm-win').hidden=online;
  $('rematch-status').textContent='';
  if(mode==='incoming')$('rematch-status').textContent=`${currentPlayerNames[myColor==='red'?'black':'red']||'對手'} 想再玩一局，是否同意？`;
  else if(mode==='waiting')$('rematch-status').textContent='已送出再玩一局的邀請，正在等待對方回覆…';
  else if(online)$('rematch-status').textContent='要再玩一局嗎？若任何一方不繼續，房間就會關閉。';
}
function finishGame(winner,reason){chessGameOver=true;$('check-banner').classList.remove('show');$('winner-message').textContent=winnerMessage(winner);$('winner-reason').textContent=reason;if(!onlineMode&&chessGameMode==='pve'){if(winner==='red')chessStats.wins++;else chessStats.losses++;updateStats()}configureFinishedModal('finished');showModal('win-modal');if(onlineMode&&roomCode)update(ref(db,`rooms/${roomCode}`),{status:'finished',winner,reason,winnerName:getSideName(winner),loserName:getSideName(winner==='red'?'black':'red'),board:chessPieces,turn:chessTurn}).catch(console.error)}
async function publishRoomNotice(type,extra={}){
  if(!roomCode||!db||!user)throw new Error('目前沒有有效的連線房間');
  const code=roomCode;
  await set(ref(db,`roomNotices/${code}`),{id:`${user.uid}_${type}_${Date.now()}`,type,senderUid:user.uid,senderColor:myColor,senderName:currentPlayerNames[myColor]||getSideName(myColor),createdAt:Date.now(),...extra});
}
async function requestRematch(){
  if(!roomCode||!user)return;
  try{await publishRoomNotice('rematch-request');configureFinishedModal('waiting');$('rematch-status').textContent='已送出再玩一局的邀請，正在等待對方回覆…';}
  catch(e){showRoomAlert('邀請失敗',`無法送出再玩一局的邀請：${e.message}`)}
}
async function acceptRematch(){
  if(!roomCode||!user)return;
  try{await publishRoomNotice('rematch-agreed');$('rematch-status').textContent='雙方同意再玩一局，正在重設棋盤…';await resetRoomForRematch();}
  catch(e){showRoomAlert('重新開始失敗',`無法重新開始：${e.message}`)}
}
async function resetRoomForRematch(){
  if(rematchResetStarted||!roomCode||!db||!user)return;
  rematchResetStarted=true;
  try{
    const code=roomCode;const snap=await get(ref(db,`rooms/${code}`));
    if(!snap.exists()){exitRoomLocally('房間已關閉，已返回連線大廳。');return}
    const room=snap.val();
    // 現有 Rules 只允許輪到自己的玩家更新房間；因此由 room.turn 對應的玩家負責重開。
    if(room.players?.[room.turn]!==user.uid){rematchResetStarted=false;return}
    await update(ref(db,`rooms/${code}`),{status:'playing',winner:null,reason:null,winnerName:null,loserName:null,board:initialBoard(),turn:'red',lastMove:null,moveCount:0});
    await set(ref(db,`roomNotices/${code}`),{id:`${user.uid}_rematch-started_${Date.now()}`,type:'rematch-started',senderUid:user.uid,createdAt:Date.now()});
    chessPieces=initialBoard();chessTurn='red';chessGameOver=false;chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];lastMove=null;moveHistory=[];isBannerDismissed=false;lastSeenMoveCount=0;
    hideModal('win-modal');renderBoard();updateStatus();$('room-waiting').textContent='新的一局開始！';
  }catch(e){rematchResetStarted=false;throw e}
}
async function declineRematch(){
  if(!roomCode||!db||!user){hideModal('win-modal');return}
  const code=roomCode;
  try{await publishRoomNotice('rematch-declined');await closeFinishedRoom(code,'雙方結束對局，房間已關閉。');}
  catch(e){showRoomAlert('關閉房間失敗',`無法關閉房間：${e.message}`)}
}
async function closeFinishedRoom(code=roomCode,message='房間已關閉。'){
  if(!code||!db)return;
  try{
    const snap=await get(ref(db,`rooms/${code}`));const room=snap.val();
    if(room?.settings?.visibility==='public')await remove(ref(db,`publicRooms/${code}`)).catch(()=>{});
    if(snap.exists())await remove(ref(db,`rooms/${code}`));
  }finally{hideModal('win-modal');exitRoomLocally(message);onlineMode=true;rematchResetStarted=false;}
}
function updateStats(){ $('chess-stat-win').textContent=chessStats.wins;$('chess-stat-loss').textContent=chessStats.losses;$('chess-stat-draw').textContent=chessStats.draws;localStorage.setItem('chess_ai_stats',JSON.stringify(chessStats))}
function evaluate(board){let s=0;for(let i=0;i<90;i++){const p=board[i];if(!p)continue;let v=pieceValues[p.name]||10,r=Math.floor(i/9),c=i%9;if(p.type==='兵'&&r<=4)v+=(5-r)*5;if(p.type==='卒'&&r>=5)v+=(r-4)*5;if(['車','俥'].includes(p.type)&&c===4)v+=10;s+=p.color==='black'?v:-v}return s}
function minimax(board,depth,alpha,beta,maximizing){if(depth===0)return evaluate(board);const color=maximizing?'black':'red',moves=allLegalMoves(board,color);if(!moves.length)return maximizing?-99999:99999;let best=maximizing?-Infinity:Infinity;for(const m of moves){const a=board[m.from],d=board[m.to];board[m.to]=a;board[m.from]=null;const score=minimax(board,depth-1,alpha,beta,!maximizing);board[m.from]=a;board[m.to]=d;if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,score)}else{best=Math.min(best,score);beta=Math.min(beta,score)}if(beta<=alpha)break}return best}
function aiTurn(){if(chessGameOver||onlineMode||chessGameMode!=='pve'||chessTurn!=='black')return;setTimeout(()=>{const moves=allLegalMoves(chessPieces,'black');if(!moves.length)return;let chosen;if(currentAiLevel==='easy'){moves.sort((a,b)=>(pieceValues[chessPieces[b.to]?.name]||0)-(pieceValues[chessPieces[a.to]?.name]||0));chosen=moves[Math.floor(Math.random()*Math.min(3,moves.length))]}else{let best=-Infinity,opts=[];for(const m of moves){const a=chessPieces[m.from],d=chessPieces[m.to];chessPieces[m.to]=a;chessPieces[m.from]=null;const s=minimax(chessPieces,1,-Infinity,Infinity,false);chessPieces[m.from]=a;chessPieces[m.to]=d;if(s>best){best=s;opts=[m]}else if(s===best)opts.push(m)}chosen=opts[Math.floor(Math.random()*opts.length)]}applyMoveLocal(chosen)},450)}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
async function connectFirebase(){
  if(firebaseConfig.apiKey==='YOUR_API_KEY'||firebaseConfig.databaseURL.includes('YOUR_DATABASE')){$('online-status').textContent='請先編輯 js/firebase-config.js，填入 Firebase Console 的真實設定。';return}
  try{
    const [appMod,authMod,dbMod]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
    ]);
    firebaseApi={...appMod,...authMod,...dbMod};
    app=firebaseApi.initializeApp(firebaseConfig);auth=firebaseApi.getAuth(app);db=firebaseApi.getDatabase(app);
    // 先等待 Firebase 還原原本的匿名登入；不要每次重整都重新建立匿名帳號，否則無法認回原房間。
    let unsubscribeAuth;
    const existingUser=await new Promise(resolve=>{unsubscribeAuth=firebaseApi.onAuthStateChanged(auth,u=>{unsubscribeAuth?.();resolve(u)});});
    if(existingUser) user=existingUser;
    else user=(await firebaseApi.signInAnonymously(auth)).user;
    $('online-status').textContent='Firebase 已連線（匿名玩家），可以建立或加入房間。';
    initOnlinePublicRooms();
    if(!inviteRoomCode) await restoreSavedRoom();
    attemptAutoJoinInvite();
  }catch(e){$('online-status').textContent=`Firebase 連線失敗：${explainFirebaseError(e,'連線')}`;console.error(e)}
}
function getNickname(){
  const input=$('player-nickname');
  const typed=(input?.value||localStorage.getItem('xiangqi-nickname')||'棋手').trim().replace(/[<>]/g,'').slice(0,18);
  const name=typed||'棋手';
  localStorage.setItem('xiangqi-nickname',name);
  if(input)input.value=name;
  return name;
}
async function passwordDigest(password){
  if(!password)return '';
  const bytes=new TextEncoder().encode(password);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function saveActiveRoom(code,color){localStorage.setItem('xiangqi-active-room',JSON.stringify({code,color,uid:user?.uid||'',savedAt:Date.now()}));}
async function restoreSavedRoom(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem('xiangqi-active-room')||'null')}catch{}
  if(!saved?.code||!user||!db)return false;
  try{
    const snap=await get(ref(db,`rooms/${saved.code}`));
    if(!snap.exists()){localStorage.removeItem('xiangqi-active-room');return false;}
    const room=snap.val();
    if(room.players?.red===user.uid)myColor='red';
    else if(room.players?.black===user.uid)myColor='black';
    else {localStorage.removeItem('xiangqi-active-room');return false;}
    roomCode=saved.code;onlineMode=true;
    $('online-panel').hidden=false;$('chess-game-mode').value='pvp';$('chess-game-mode').querySelector('option[value="pvp"]').textContent='多人連線對戰';$('chess-game-mode').disabled=true;$('chess-mode-title').textContent='多人連線對戰';$('chess-ai-level').style.display='none';$('chess-ai-score-container').style.display='none';
    if(room.playerNames?.[myColor]&&$('player-nickname'))$('player-nickname').value=room.playerNames[myColor];
    enterRoom(saved.code);
    $('room-role').textContent=myColor==='red'?'你是紅方（先手）':'你是黑方（後手）';
    $('room-waiting').textContent='已恢復先前的對局，可以繼續下棋。';
    setStatus(`已恢復房間 ${saved.code}，你是${myColor==='red'?'紅方':'黑方'}。`);
    return true;
  }catch(e){console.warn('恢復房間失敗',e);return false;}
}
const ref=(...a)=>firebaseApi.ref(...a),get=(...a)=>firebaseApi.get(...a),set=(...a)=>firebaseApi.set(...a),update=(...a)=>firebaseApi.update(...a),remove=(...a)=>firebaseApi.remove(...a),onValue=(...a)=>firebaseApi.onValue(...a),runTransaction=(...a)=>firebaseApi.runTransaction(...a),onDisconnect=(...a)=>firebaseApi.onDisconnect(...a);

function escapeRoomText(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function formatRoomTime(value){const n=Number(value);if(!Number.isFinite(n)||n<=0)return '時間未知';return new Date(n).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
function renderOnlinePublicRooms(){
  const list=$('online-public-rooms-list');if(!list)return;
  const rooms=onlinePublicRoomsCache.filter(r=>r.status==='waiting').sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  if(!rooms.length){list.innerHTML='<p class="muted small">目前沒有等待中的公開房間。你可以建立公開房間，或輸入朋友提供的房號。</p>';return;}
  list.innerHTML=rooms.map(r=>`<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeRoomText(r.code)}</strong><span class="room-status">等待加入</span><span class="muted small">房主：${escapeRoomText(r.hostName||'棋手')}</span><span class="muted small">建立：${escapeRoomText(formatRoomTime(r.createdAt))}</span><span class="muted small">人數：${Number(r.playersCount||1)}/2　${r.hasPassword?'🔒 需要密碼':'🔓 無密碼'}</span></div><div><button class="room-join-link online-room-join-btn" type="button" data-room-code="${escapeRoomText(r.code)}" data-room-password="${r.hasPassword?'1':'0'}">加入房間</button></div></article>`).join('');
}
function initOnlinePublicRooms(){
  const status=$('online-public-rooms-status');if(!status||!db||!firebaseApi)return;
  if(publicRoomsUnsubscribe)publicRoomsUnsubscribe();
  status.textContent='正在讀取公開房間…';
  publicRoomsUnsubscribe=onValue(ref(db,'publicRooms'),snap=>{
    const value=snap.val()||{};
    onlinePublicRoomsCache=Object.entries(value).map(([code,r])=>({...r,code:r.code||code}));
    const waiting=onlinePublicRoomsCache.filter(r=>r.status==='waiting').length;
    status.textContent=`公開房間 ${waiting} 間等待加入`;
    renderOnlinePublicRooms();
  },error=>{
    console.error('公開房間列表讀取失敗',error);
    status.textContent=error?.code==='PERMISSION_DENIED'||String(error?.code||'').includes('permission-denied')
      ?'載入失敗：Permission denied。請確認 Firebase Rules 的 publicRooms「父節點」有 .read: "auth != null"，並已按 Publish。'
      :`公開列表載入失敗：${error?.message||error}`;
    const list=$('online-public-rooms-list');if(list)list.innerHTML='<p class="muted small">目前無法讀取公開房間；你仍可使用房號加入。</p>';
  });
}

function explainFirebaseError(e, action){
  const code=e?.code||'';
  if(code.includes('permission-denied')) return 'Firebase 拒絕存取：請確認 Realtime Database Rules 已發布，且允許已匿名登入的玩家讀寫房間。';
  if(code.includes('unauthorized-domain')) return '目前網站網域未被 Firebase 授權。請到 Authentication → Settings → Authorized domains，加入你的 GitHub Pages 網域（例如 hugar67.github.io）。';
  if(code.includes('operation-not-allowed')) return 'Firebase 尚未啟用匿名登入。請到 Authentication → Sign-in method，啟用 Anonymous。';
  if(code.includes('network-request-failed')) return '網路連線失敗，請確認網路正常，並從 HTTPS 的 GitHub Pages 網址開啟網站，不要直接用 file:// 開啟。';
  if(code.includes('app/no-options')||code.includes('invalid-api-key')) return 'Firebase 設定不正確：請檢查 js/firebase-config.js 是否完整貼上 Firebase Web App 設定。';
  return `${action}失敗：${e?.message||code||'未知錯誤'}（${code||'沒有錯誤代碼'}）`;
}
function showRoomAlert(title, message){
  setStatus(`${title}：${message}`);
  window.alert(`${title}\n\n${message}`);
}
async function createRoom(){
  if(!user||!db){
    const msg='Firebase 尚未完成連線。請確認 js/firebase-config.js 已填入正確設定，並已啟用匿名登入及發布資料庫規則。';
    showRoomAlert('無法建立房間',msg);return;
  }
  const btn=$('create-room-btn');btn.disabled=true;btn.textContent='正在建立…';
  try{
    let code=makeCode();
    for(let tries=0;tries<8;tries++){
      const existing=await get(ref(db,`rooms/${code}`));
      if(!existing.exists())break;
      code=makeCode();
      if(tries===7)throw new Error('無法產生新的房間代碼，請再試一次。');
    }
    const nickname=getNickname();
    const passwordHash=await passwordDigest($('room-password-input')?.value||'');
    const visibility=$('room-visibility-select')?.value||'public';
    const data={createdAt:Date.now(),players:{red:user.uid,black:null},playerNames:{red:nickname,black:null},settings:{visibility,hasPassword:!!passwordHash,passwordHash},board:initialBoard(),turn:'red',status:'waiting',lastMove:null,moveCount:0};
    await set(ref(db,`rooms/${code}`),data);
    roomCode=code;myColor='red';saveActiveRoom(code,'red');renderBoard();enterRoom(code);
    let publicIndexFailed=false;
    if(visibility==='public'){
      try{await set(ref(db,`publicRooms/${code}`),{code,hostName:nickname,hostUid:user.uid,createdAt:data.createdAt,status:'waiting',playersCount:1,hasPassword:!!passwordHash});}
      catch(indexError){publicIndexFailed=true;console.warn('公開房間索引寫入失敗，需設定 publicRooms 規則',indexError);}
    }
    $('room-role').textContent='你是紅方（先手）';
    $('room-waiting').textContent=publicIndexFailed?'房間已建立，但未登上公開列表；請依 README 合併 publicRooms 規則。':'房間建立成功！請把代碼傳給朋友，等待黑方加入。';
    setStatus(`房間 ${code} 已建立，等待另一位玩家加入。`);
    window.alert(`房間建立成功！\n\n房間代碼：${code}\n玩家暱稱：${nickname}\n房間類型：${visibility==='public'?'公開':'私人'}\n密碼保護：${passwordHash?'有':'無'}\n${publicIndexFailed?'\n注意：公開列表規則尚未設定，房間目前無法顯示在大廳。':''}\n\n請把代碼傳給朋友加入。`);
  }catch(e){console.error(e);showRoomAlert('建立房間失敗',explainFirebaseError(e,'建立房間'));}
  finally{if(!roomCode){btn.disabled=false;btn.textContent='建立房間';}}
}
async function joinRoom(){
  if(!user||!db){
    showRoomAlert('無法加入房間','Firebase 尚未完成連線。請確認 Firebase 設定、匿名登入及資料庫規則。');return;
  }
  const code=$('room-code-input').value.trim().toUpperCase();
  if(!code){showRoomAlert('無法加入房間','請先輸入朋友提供的 6 碼房間代碼。');return;}
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(code)){
    showRoomAlert('房間代碼格式錯誤','代碼必須是 6 個英文字母或數字；為避免混淆，不使用 I、O、0、1。請確認是否輸入錯誤。');return;
  }
  const btn=$('join-room-btn');btn.disabled=true;btn.textContent='正在加入…';
  try{
    const r=ref(db,`rooms/${code}`);
    // 先讀取以便提供清楚的錯誤原因；再用 transaction 防止兩人同時搶入同一個位置。
    const before=await get(r);
    if(!before.exists()){
      showRoomAlert('加入房間失敗',`代碼 ${code} 無效：找不到這個房間。請確認代碼，或請房主重新建立房間。`);return;
    }
    const old=before.val();
    if(old.players?.red===user.uid||old.players?.black===user.uid){
      myColor=old.players?.red===user.uid?'red':'black';roomCode=code;saveActiveRoom(code,myColor);enterRoom(code);
      $('room-role').textContent=myColor==='red'?'你是紅方（先手）':'你是黑方（後手）';
      $('room-waiting').textContent='已重新連回你原本的座位。';return;
    }
    if(old.settings?.passwordHash){
      const provided=await passwordDigest($('room-password-input')?.value||'');
      if(!provided){showRoomAlert('此房間需要密碼','請在「房間密碼」欄位輸入房主提供的密碼，再按加入房間。');return;}
      if(provided!==old.settings.passwordHash){showRoomAlert('房間密碼錯誤','請確認密碼後再試一次。');return;}
    }
    if(old.players?.red&&old.players?.black){
      showRoomAlert('房間已滿',`代碼 ${code} 已經有兩位玩家使用，無法再加入。請請房主建立新房間。`);return;
    }
    if(old.status!=='waiting'){
      showRoomAlert('無法加入房間','這個房間已經開始或已結束，不能再加入。請使用新的房間代碼。');return;
    }
    let failureReason='';
    const result=await runTransaction(r,room=>{
      // Realtime Database transaction updater may first receive local null even after get() succeeded.
      // Use the just-read snapshot as a fallback so this cache miss does not falsely reject a valid room.
      if(!room) room={...old,players:{...(old.players||{})}};
      if(room.players?.red===user.uid||room.players?.black===user.uid){failureReason='你已經在這個房間內。';return;}
      if(room.status!=='waiting'){failureReason='這個房間已經開始或結束。';return;}
      if(room.players?.red&&room.players?.black){failureReason='此代碼已經有兩個人使用，房間已滿。';return;}
      if(!room.players?.red){failureReason='房間資料不完整，缺少紅方玩家。請房主重新建立房間。';return;}
      room.players.black=user.uid;room.playerNames=room.playerNames||{};room.playerNames.black=getNickname();room.status='playing';return room;
    });
    if(!result.committed){
      const msg=failureReason||'房間狀態剛剛改變，可能另一位玩家已先加入。請重新確認代碼或請房主建立新房間。';
      showRoomAlert('加入房間失敗',msg);return;
    }
    roomCode=code;myColor='black';saveActiveRoom(code,'black');renderBoard();enterRoom(code);
    if(old.settings?.visibility==='public')update(ref(db,`publicRooms/${code}`),{status:'playing',playersCount:2,blackUid:user.uid}).catch(e=>console.warn('公開列表同步失敗',e));
    $('room-role').textContent='你是黑方（後手）';
    $('room-waiting').textContent='已成功加入房間，開始對弈！';
    setStatus(`已加入房間 ${code}，你是黑方。`);
    window.alert(`加入房間成功！\n\n房間代碼：${code}\n你的角色：黑方（後手）`);
  }catch(e){console.error(e);showRoomAlert('加入房間失敗',explainFirebaseError(e,'加入房間'));}
  finally{if(!roomCode){btn.disabled=false;btn.textContent='加入房間';}}
}

function exitRoomLocally(message='已離開房間。'){
  if(roomNoticeUnsubscribe){roomNoticeUnsubscribe();roomNoticeUnsubscribe=null;}
  if(roomUnsubscribe){roomUnsubscribe();roomUnsubscribe=null;}
  if(publicRoomsUnsubscribe){publicRoomsUnsubscribe();publicRoomsUnsubscribe=null;}
  localStorage.removeItem('xiangqi-active-room');
  roomCode=null;myColor=null;onlineReady=false;
  $('room-info').hidden=true;
  $('create-room-btn').disabled=false;$('create-room-btn').textContent='建立房間';
  $('join-room-btn').disabled=false;$('join-room-btn').textContent='加入房間';
  $('room-code-input').disabled=false;$('room-code-input').value='';$('room-password-input').value='';
  $('room-role').textContent='';$('room-waiting').textContent='';
  $('online-status').textContent=message;
  setStatus(message);
}

async function leaveRoom(){
  if(!roomCode||!db||!user){
    $('room-info').hidden=true;
    localStorage.removeItem('xiangqi-active-room');
    return;
  }

  const code=roomCode;
  if(!window.confirm('確定離開這個房間？系統會通知另一位玩家，並結束本局。'))return;

  const btn=$('leave-room-btn');
  if(btn){btn.disabled=true;btn.textContent='正在通知對方…';}

  try{
    const roomRef=ref(db,`rooms/${code}`);
    const roomSnap=await get(roomRef);
    const room=roomSnap.val();

    if(roomSnap.exists()){
      // 先送出獨立通知，讓對方收到即時訊息，再刪除房間。
      await set(ref(db,`roomNotices/${code}`),{
        id:`${user.uid}_${Date.now()}`,
        type:'player-left',
        senderUid:user.uid,
        senderColor:myColor,
        senderName:room.playerNames?.[myColor]||localStorage.getItem('xiangqi-nickname')||'對手',
        createdAt:Date.now()
      });
      await new Promise(resolve=>setTimeout(resolve,1200));
    }

    if(room?.settings?.visibility==='public') await remove(ref(db,`publicRooms/${code}`));
    if(roomSnap.exists()) await remove(roomRef);
    exitRoomLocally('你已離開房間，本局已結束。');
    onlineMode=true;
  }catch(e){
    console.error('離開房間失敗',e);
    showRoomAlert('離開房間失敗',`${explainFirebaseError(e,'離開房間')}\n請確認 Firebase Rules 已更新並發布。`);
  }finally{
    if(btn){btn.disabled=false;btn.textContent='🚪 離開房間';}
  }
}

function enterRoom(code){
  roomCode=code;saveActiveRoom(code,myColor);
  $('room-info').hidden=false;
  $('room-code-display').textContent=code;
  $('create-room-btn').disabled=true;
  $('join-room-btn').disabled=true;
  $('room-code-input').disabled=true;
  onlineReady=true;
  if(roomUnsubscribe)roomUnsubscribe();
  roomUnsubscribe=onValue(ref(db,`rooms/${code}`),snap=>{
    const room=snap.val();
    if(!room){exitRoomLocally('房間已結束或不存在，已返回連線大廳。');onlineMode=true;return;}
    if(room.players?.red===user.uid)myColor='red';
    else if(room.players?.black===user.uid)myColor='black';
    else{setStatus('你不是此房間的玩家');onlineReady=false;return;}

    currentPlayerNames={red:room.playerNames?.red||'紅方',black:room.playerNames?.black||'黑方'};
    const ownName=room.playerNames?.[myColor]||localStorage.getItem('xiangqi-nickname')||'棋手';
    const otherColor=myColor==='red'?'black':'red';
    const otherLabel=otherColor==='red'?'紅方':'黑方';
    const redName=room.playerNames?.red||'等待玩家';
    const blackName=room.playerNames?.black||'等待玩家';
    const playersDisplay=$('room-players-display');
    if(playersDisplay)playersDisplay.textContent=`🔴 紅方：${redName}　｜　⚫ 黑方：${blackName}`;
    if($('player-nickname')&&room.playerNames?.[myColor])$('player-nickname').value=room.playerNames[myColor];
    if(room.settings?.visibility==='public')update(ref(db,`publicRooms/${code}`),{status:room.status||'waiting',playersCount:room.players?.black?2:1,...(room.players?.black?{blackUid:room.players.black}:{})}).catch(()=>{});
    const otherPresence=room.presence?.[otherColor];
    let presenceText;
    if(otherPresence?.online===true) presenceText=`🟢 ${otherLabel}：在線上`;
    else if(otherPresence?.online===false) presenceText=`⚪ ${otherLabel}：已離線`;
    else presenceText=`🟡 ${otherLabel}：尚未確認連線`;
    const presenceEl=$('opponent-presence');
    if(presenceEl)presenceEl.textContent=presenceText;

    if(room.status==='waiting')$('room-waiting').textContent='等待黑方玩家加入…';
    else if(room.status==='playing')$('room-waiting').textContent='對局進行中';
    else if(room.status==='finished')$('room-waiting').textContent='本局已結束';
    else if(room.status==='closed')$('room-waiting').textContent='房間已關閉';
    if(room.board){
      applyingRemote=true;
      const moveCount=Number(room.moveCount||0);
      if(moveCount!==lastSeenMoveCount){isBannerDismissed=false;lastSeenMoveCount=moveCount;}
      chessPieces=Array.from({length:90},(_,i)=>room.board?.[i]??null);
      chessTurn=room.turn||'red';lastMove=room.lastMove||null;
      chessGameOver=room.status==='finished';chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];
      renderBoard();updateStatus();applyingRemote=false;
    }
    if(room.status==='finished'&&room.winner&&$('win-modal').hidden){
      currentPlayerNames={red:room.playerNames?.red||'紅方',black:room.playerNames?.black||'黑方'};
      $('winner-message').textContent=room.winnerName&&room.loserName?`${room.winnerName} 打敗了 ${room.loserName}`:winnerMessage(room.winner);
      $('winner-reason').textContent=room.reason||'';configureFinishedModal('finished');showModal('win-modal');
    }
  },error=>{
    console.error('房間即時監聽失敗',error);
    setStatus(`房間同步失敗：${explainFirebaseError(error,'讀取房間')}`);
  });
  if(roomNoticeUnsubscribe){roomNoticeUnsubscribe();roomNoticeUnsubscribe=null;}
  roomNoticeUnsubscribe=onValue(ref(db,`roomNotices/${code}`),snap=>{
    const notice=snap.val();
    if(!notice||notice.id===lastRoomNoticeId)return;
    lastRoomNoticeId=notice.id||'';
    if(notice.type==='player-left'&&notice.senderUid!==user?.uid){
      const name=notice.senderName||'對手';
      window.alert(`對手已離開房間\n\n${name} 已離開，本局結束。你將返回連線大廳。`);
      exitRoomLocally(`${name} 已離開，本局結束。你已返回連線大廳。`);
      onlineMode=true;chessGameOver=true;chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];renderBoard();
    }else if(notice.type==='rematch-request'&&notice.senderUid!==user?.uid&&chessGameOver){
      rematchPromptOpen=true;configureFinishedModal('incoming');showModal('win-modal');
    }else if(notice.type==='rematch-agreed'){
      rematchPromptOpen=false;
      $('rematch-status').textContent='對方同意再玩一局，正在準備新棋盤…';
      resetRoomForRematch().catch(e=>showRoomAlert('重新開始失敗',`無法重新開始：${e.message}`));
    }else if(notice.type==='rematch-declined'){
      if(notice.senderUid!==user?.uid){window.alert('對方不再繼續對局，房間即將關閉。');closeFinishedRoom(code,'對局已結束，房間已關閉。').catch(console.error);}
    }else if(notice.type==='rematch-started'){
      chessPieces=initialBoard();chessTurn='red';chessGameOver=false;chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];lastMove=null;moveHistory=[];isBannerDismissed=false;lastSeenMoveCount=0;rematchResetStarted=false;hideModal('win-modal');renderBoard();updateStatus();$('room-waiting').textContent='新的一局開始！';
    }
  },error=>console.warn('房間通知讀取失敗',error));

  // 這個原型採用「任何一位玩家斷線就結束房間」的清理方式，
  // 因此重新整理、關閉分頁或網路中斷時，Firebase 會刪除房間與公開列表索引。
  // 注意：重新整理會結束該局，不再保留跨重新整理的對局。
  const myPresenceRef=ref(db,`rooms/${code}/presence/${myColor}`);
  const roomRefForDisconnect=ref(db,`rooms/${code}`);
  const publicRefForDisconnect=ref(db,`publicRooms/${code}`);
  onValue(ref(db,'.info/connected'),async snap=>{
    if(snap.val()!==true||!user||!myColor||roomCode!==code)return;
    try{
      // 先向 Firebase 伺服器登記斷線操作，再標記在線。
      const publicRoomSnapshot = await get(publicRefForDisconnect);
      if(publicRoomSnapshot.exists()) await onDisconnect(publicRefForDisconnect).remove();
      await onDisconnect(roomRefForDisconnect).remove();
      await onDisconnect(myPresenceRef).set({online:false,lastSeen:Date.now(),uid:user.uid});
      await set(myPresenceRef,{online:true,lastSeen:Date.now(),uid:user.uid});
    }catch(error){
      console.error('設定離線清理／在線狀態失敗',error);
      const el=$('opponent-presence');
      if(el)el.textContent='⚠️ 離線清理設定失敗，請檢查 Firebase Rules';
    }
  });
}
async function sendMove(){if(!roomCode||!db||!user)return;const roomRef=ref(db,`rooms/${roomCode}`);try{const result=await runTransaction(roomRef,room=>{if(!room||room.status!=='playing'||room.players?.[myColor]!==user.uid||room.turn!==myColor)return;room.board=chessPieces;room.turn=chessTurn;room.lastMove=lastMove;room.moveCount=(room.moveCount||0)+1;return room});if(!result.committed)setStatus('棋步未同步：可能已輪到對方或連線規則拒絕寫入')}catch(e){setStatus(`同步失敗：${e.message}`)}}
async function copyText(text){
  if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(text);return true;}
  const area=document.createElement('textarea');area.value=text;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok)throw new Error('瀏覽器不允許自動複製');return true;
}
function makeInviteUrl(code){const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('mode','online');url.searchParams.set('room',code);return url.href;}
function attemptAutoJoinInvite(){
  if(!onlineMode||!inviteRoomCode||autoJoinAttempted||!user||!db)return;
  autoJoinAttempted=true;
  if(!/^[A-HJ-NP-Z2-9]{6}$/.test(inviteRoomCode)){$('online-status').textContent='邀請網址中的房間代碼格式不正確，請向房主索取新連結。';return;}
  $('room-code-input').value=inviteRoomCode;
  $('online-status').textContent=`正在加入房間 ${inviteRoomCode}…`;
  joinRoom();
}
$('online-refresh-rooms-btn')?.addEventListener('click',()=>{
  if(!db||!firebaseApi){const st=$('online-public-rooms-status');if(st)st.textContent='Firebase 尚未連線。';return;}
  firebaseApi.get(ref(db,'publicRooms')).then(snap=>{
    const value=snap.val()||{};onlinePublicRoomsCache=Object.entries(value).map(([code,r])=>({...r,code:r.code||code}));
    const st=$('online-public-rooms-status');if(st)st.textContent=`公開房間 ${onlinePublicRoomsCache.filter(r=>r.status==='waiting').length} 間等待加入`;
    renderOnlinePublicRooms();
  }).catch(e=>{const st=$('online-public-rooms-status');if(st)st.textContent=`載入失敗：${e?.code||e?.message||e}`;});
});
$('online-public-rooms-list')?.addEventListener('click',async e=>{
  const btn=e.target.closest('.online-room-join-btn');if(!btn)return;
  const code=btn.dataset.roomCode||'';
  $('room-code-input').value=code;
  if(btn.dataset.roomPassword==='1'){
    const password=window.prompt(`房間 ${code} 需要密碼，請輸入房主提供的密碼：`);
    if(password===null)return;
    $('room-password-input').value=password;
  }else $('room-password-input').value='';
  $('online-status').textContent=`正在加入公開房間 ${code}…`;
  await joinRoom();
});
$('create-room-btn').addEventListener('click',createRoom);$('join-room-btn').addEventListener('click',joinRoom);$('leave-room-btn')?.addEventListener('click',leaveRoom);
if($('player-nickname')){$('player-nickname').value=localStorage.getItem('xiangqi-nickname')||'';$('player-nickname').addEventListener('change',getNickname);}
if($('room-code-input'))$('room-code-input').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,6)});
$('copy-room-btn').addEventListener('click',async()=>{if(!roomCode)return;try{await copyText(roomCode);$('room-waiting').textContent='✅ 已複製房間代碼！傳給朋友即可加入。'}catch{$('room-waiting').textContent=`複製失敗，請手動複製代碼：${roomCode}`}});
$('copy-invite-btn').addEventListener('click',async()=>{if(!roomCode)return;const url=makeInviteUrl(roomCode);try{await copyText(url);$('room-waiting').textContent='✅ 已複製邀請網址！傳給朋友，對方開啟後會自動嘗試加入。'}catch{$('room-waiting').textContent=`無法自動複製，請手動複製此網址：${url}`;window.prompt('請複製這個邀請網址：',url)}});
$('chess-game-mode').addEventListener('change',()=>{if(onlineMode)return;initGame()});$('chess-ai-level').addEventListener('change',()=>{currentAiLevel=$('chess-ai-level').value});$('restart-btn').addEventListener('click',()=>{if(onlineMode){if(chessGameOver)showModal('win-modal');else setStatus(english?'Restart is available after the game ends.':'連線對局中不能直接重來，請先結束本局。');return}initGame()});$('reset-stats-btn').addEventListener('click',()=>{chessStats={wins:0,losses:0,draws:0};updateStats()});$('confirm-win').onclick=()=>hideModal('win-modal');$('close-win').onclick=()=>{if(onlineMode&&roomCode)declineRematch();else hideModal('win-modal')};$('rematch-request-btn')?.addEventListener('click',requestRematch);$('rematch-accept-btn')?.addEventListener('click',acceptRematch);$('rematch-decline-btn')?.addEventListener('click',declineRematch);$('cancel-confirm').onclick=()=>hideModal('confirm-modal');$('accept-confirm').onclick=()=>hideModal('confirm-modal');$('check-banner').onclick=()=>{$('check-banner').classList.remove('show');isBannerDismissed=true};
function toggleDarkMode(){document.body.classList.toggle('dark-mode');const d=document.body.classList.contains('dark-mode');$('theme-btn').textContent=d?'☀️ 淺色':'🌙 深色';localStorage.setItem('xiangqi-theme',d?'dark':'light')}
const LANG_KEY = 'xiangqi-language';
let english = localStorage.getItem(LANG_KEY) === 'en';
const textTranslations = {
  '繁體中文':'繁體中文','English':'English','🪨 中國象棋':'🪨 Xiangqi','🪨 中國象棋（傳統大棋盤）':'🪨 Xiangqi (Traditional Board)','中國象棋｜多人連線大廳':'Xiangqi | Multiplayer Lobby','中國象棋':'Xiangqi',
  '選擇你的對弈方式':'Choose How to Play','保留傳統棋盤風格，與 AI 或朋友一決勝負。':'Play Xiangqi against the AI or a friend.','單機版':'Single Player','與 AI 對弈，支援初級與高級難度。':'Play against AI with easy and hard difficulty.','開始遊戲 →':'Start Game →','多人連線':'Online Multiplayer','建立公開或私人房間，輸入房號與朋友即時對弈。':'Create a public or private room and play with a friend.','建立公開或私人房間，輸入房號與朋友即時對弈。':'Create a public or private room and play with a friend.','進入連線大廳 →':'Enter Lobby →','找到你上次的對局':'Your Previous Game','恢復上次對局':'Resume Previous Game','🌐 公開房間列表':'🌐 Public Rooms','顯示等待中的公開房間；私人房間不會列在這裡。':'Waiting public rooms are shown here. Private rooms are hidden.','重新整理':'Refresh','正在載入公開房間…':'Loading public rooms…','多人連線需要網路及 Firebase 設定。公開列表需在 Firebase Realtime Database Rules 加入本 ZIP 提供的 publicRooms 規則。':'Online play requires an internet connection and Firebase configuration. Add the publicRooms rule to your Firebase Realtime Database Rules to enable the public list.','🛡️ 管理員模式（原型）':'🛡️ Admin Mode (Prototype)','安全限制：這是純前端原型，密碼會出現在 JavaScript 中，不能當成真正的管理員驗證。此介面不會提供刪除房間功能。':'Security note: This is a front-end prototype. The password is visible in JavaScript and is not secure authentication. Room deletion is not available here.','管理員密碼':'Admin Password','輸入管理員密碼':'Enter admin password','登入管理介面':'Log In to Admin Panel','密碼錯誤。':'Incorrect password.','全部房間狀態（含私人房間）':'All Rooms (Including Private Rooms)','管理員列表會列出 rooms 節點中的公開與私人房間；目前只提供查看／加入，不提供刪除。注意：為了讓靜態網站列出全部房間，已登入的匿名使用者也能讀取房間清單；此原型不適合放置敏感資料。':'The admin list shows public and private rooms from the rooms node. You can view/join rooms but cannot delete them. To list all rooms on this static site, signed-in anonymous users can also read the room list. Do not store sensitive data in this prototype.','重新載入列表':'Reload List','目前沒有符合條件的公開房間。':'No public rooms match the current filter.','目前沒有房間（公開或私人）。':'There are no rooms (public or private).','等待加入':'Waiting for Player','對局中':'In Game','已結束':'Finished','已關閉':'Closed','公開房間':'Public Room','私人房間':'Private Room','房主：':'Host: ','建立：':'Created: ','人數：':'Players: ','需要密碼':'Password Required','無密碼':'No Password','不可加入':'Unavailable','輸入／加入':'Join','查看／加入':'View / Join','房間代碼：':'Room Code: ','房間類型':'Room Type','房間密碼（可留空）':'Room Password (Optional)','玩家暱稱':'Nickname','輸入暱稱（1～18 字）':'Enter nickname (1–18 characters)','公開房間（顯示在大廳）':'Public Room (Shown in Lobby)','私人房間（不公開）':'Private Room (Hidden from Lobby)','設定密碼；加入時需輸入':'Set a password; required to join','建立房間':'Create Room','加入房間':'Join Room','輸入 6 碼房間代碼':'Enter 6-character room code','暱稱只用於顯示。此原型的房間密碼是前端檢查，不能取代伺服器端安全驗證。':'Nicknames are for display only. Passwords are checked on the client and are not a substitute for server-side security.','📋 複製房間代碼':'📋 Copy Room Code','🔗 複製邀請網址':'🔗 Copy Invite Link','🚪 離開房間':'🚪 Leave Room','紅方：等待玩家　｜　黑方：等待玩家':'Red: Waiting　|　Black: Waiting','🟡 對手狀態：尚未確認':'🟡 Opponent: Not Confirmed','🏠 首頁':'🏠 Home','傳統象棋':'Xiangqi','傳統象棋（傳統大棋盤）':'Xiangqi (Traditional Board)','單人對戰 (AI)':'Single Player (AI)','雙人對戰（同裝置）':'Two Players (Same Device)','AI: 初級':'AI: Easy','AI: 高級 (Minimax)':'AI: Hard (Minimax)','重來':'Restart','🤖 象棋 AI 戰績：':'🤖 AI Stats: ','勝:':'Wins:','敗:':'Losses:','和:':'Draws:','重置':'Reset','準備開始…':'Ready to start…','⚠️ 將軍 CHECK！點一下這個提示可關閉':'⚠️ CHECK! Click this notice to dismiss','⚠️ 將軍！CHECK!':'⚠️ CHECK!','🏆 遊戲結束！':'🏆 Game Over!','確定':'OK','取消':'Cancel','多人連線對戰':'Online Match','🌐 多人連線':'🌐 Online Multiplayer','建立房間後，把顯示的 6 碼代碼傳給朋友；對方輸入代碼後即可加入。':'After creating a room, share the 6-character code with your friend. They can enter it to join.','點選等待中的房間即可加入；私人房間不會出現在這裡。':'Select a waiting room to join. Private rooms are not shown here.','正在連線…':'Connecting…','目前沒有等待中的公開房間。你可以建立公開房間，或輸入朋友提供的房號。':'No public rooms are waiting. You can create a public room or enter a friend’s room code.','等待黑方玩家加入…':'Waiting for Black to join…','對局進行中':'Game in progress','本局已結束':'This game has ended','房間已關閉':'Room closed','房間已建立，但未登上公開列表；請依 README 合併 publicRooms 規則。':'Room created, but it is not listed publicly. Merge the publicRooms rule into your Firebase Rules.','房間建立成功！請把代碼傳給朋友，等待黑方加入。':'Room created! Share the code with your friend and wait for Black to join.','已成功加入房間，開始對弈！':'Joined the room. The game is starting!','已重新連回你原本的座位。':'Reconnected to your previous seat.','你是紅方（先手）':'You are Red (first)','你是黑方（後手）':'You are Black (second)','⚡ 🔴 紅方 被將軍！請儘快應將':'⚡ 🔴 Red is in check! Respond to the check.','⚡ ⚫ 黑方 被將軍！請儘快應將':'⚡ ⚫ Black is in check! Respond to the check.','現在是對方的回合':'It is your opponent’s turn.','請先建立或加入房間':'Create or join a room first.','主帥已被吃掉！':'The general has been captured!','將死！':'Checkmate!','困斃！':'Stalemate!','勝方 打敗了 敗方':'Winner defeated loser','勝方獲勝！':'Winner wins!','請先編輯 js/firebase-config.js，填入 Firebase Console 的真實設定。':'Edit js/firebase-config.js and enter your Firebase Console configuration first.','Firebase 已連線（匿名玩家），可以建立或加入房間。':'Connected to Firebase (anonymous player). You can create or join a room.','房間代碼格式不正確，請向房主索取新連結。':'Invalid room code. Please ask the host for a new invite link.','房間密碼錯誤。':'Incorrect room password.','房間不存在或已結束。':'Room does not exist or has ended.','房間已滿。':'Room is full.','對手已離開房間':'Your opponent left the room','本局結束。你將返回連線大廳。':'The game has ended. You will return to the lobby.','已複製房間代碼！傳給朋友即可加入。':'Room code copied! Send it to your friend to join.','已複製邀請網址！傳給朋友，對方開啟後會自動嘗試加入。':'Invite link copied! Send it to your friend; opening it will attempt to join automatically.','公開列表規則尚未設定，房間目前無法顯示在大廳。':'Public-room rules are not configured, so the room cannot appear in the lobby.','正在建立…':'Creating…','正在加入…':'Joining…','正在通知對方…':'Notifying opponent…','你不是此房間的玩家':'You are not a player in this room','等待玩家':'Waiting for player','棋手':'Player','紅方':'Red','黑方':'Black','公開':'Public','私人':'Private','有':'Yes','無':'No','時間未知':'Unknown time','目前公開房間：':'Public rooms: ','間等待加入':' waiting','公開房間 ':'Public rooms ',' 間等待加入':' waiting','Firebase 尚未連線，無法載入公開房間。':'Firebase is not connected; public rooms cannot be loaded.','Firebase 尚未連線。':'Firebase is not connected.','讀取失敗：':'Read failed: ','載入失敗：':'Loading failed: ','同步失敗：':'Sync failed: ','房間同步失敗：':'Room sync failed: ','棋步未同步：可能已輪到對方或連線規則拒絕寫入':'Move not synced: it may be your opponent’s turn or Firebase Rules rejected the write.','多人模式的重新開始目前請建立新房間，避免兩端棋局不同步。':'To restart an online game, create a new room to avoid desynchronization.','對手狀態：尚未確認':'Opponent status: not confirmed','已離線':'Offline','在線上':'Online','尚未確認連線':'Connection not confirmed','請儘快應將':'Respond to the check','輪到 ':'Turn: ',' 行棋':' to move','（等待對方）':' (waiting for opponent)',' 打敗了 ':' defeated ','被將軍！':' is in check!','房間 ':'Room ',' 需要密碼，請輸入房主提供的密碼：':' requires a password. Enter the password from the host:','邀請網址中的房間代碼格式不正確，請向房主索取新連結。':'Invalid room code in invite link. Ask the host for a new link.','房間已建立！':'Room created!','請把代碼傳給朋友加入。':'Share the code with your friend to join.','你的角色：黑方（後手）':'Your role: Black (second)','房間建立成功！':'Room created!','你將返回連線大廳。':'You will return to the online lobby.','目前無法讀取公開房間；你仍可使用房號加入。':'Cannot load public rooms right now; you can still join using a room code.','尚未設定 Firebase；單機模式仍可使用。':'Firebase is not configured yet; single-player mode is still available.','公開列表需在 Firebase Realtime Database Rules 加入本 ZIP 提供的 publicRooms 規則。':'Add the publicRooms rule to Firebase Realtime Database Rules to enable the public list.','單機模式':'Single Player','連線大廳':'Online Lobby','你已返回連線大廳。':'You have returned to the online lobby.'
};
textTranslations['詢問對方再玩一局']='Ask for a rematch';
textTranslations['同意，再玩一局']='Accept and play again';
textTranslations['不玩了，關閉房間']='No rematch, close room';
textTranslations['已送出再玩一局的邀請，正在等待對方回覆…']='Rematch request sent. Waiting for the opponent…';
textTranslations['要再玩一局嗎？若任何一方不繼續，房間就會關閉。']='Play another round? The room closes if either player declines.';
textTranslations['雙方同意再玩一局，正在重設棋盤…']='Both players agreed. Resetting the board…';
textTranslations['對方同意再玩一局，正在準備新棋盤…']='Your opponent agreed. Preparing a new board…';
textTranslations['新的一局開始！']='A new round has started!';
textTranslations['對局已結束，房間已關閉。']='The match has ended and the room is closed.';
textTranslations['對方不再繼續對局，房間即將關閉。']='Your opponent declined. The room will close.';
textTranslations['想再玩一局，是否同意？']='wants a rematch. Do you agree?';
const attributeTranslations = {
  '輸入暱稱（1～18 字）':'Enter nickname (1–18 characters)','設定密碼；加入時需輸入':'Set a password; required to join','輸入 6 碼房間代碼':'Enter 6-character room code','輸入管理員密碼':'Enter admin password','管理員模式':'Admin mode','關閉':'Close'
};
function translateChinese(text){
  if(textTranslations[text]!==undefined)return textTranslations[text];
  let out=text;
  const replacements=[
    ['房間建立成功！','Room created!'],['加入房間成功！','Joined room!'],['房間代碼：','Room code: '],['玩家暱稱：','Nickname: '],['房間類型：','Room type: '],['密碼保護：','Password protection: '],['請把代碼傳給朋友加入。','Share the code with your friend to join.'],['等待黑方加入。','Waiting for Black to join.'],['已離開，本局結束。你已返回連線大廳。','left. The game has ended. You returned to the lobby.'],['已離開，本局結束。你將返回連線大廳。','left. The game has ended. You will return to the lobby.'],['已離開','left'],['正在加入房間','Joining room'],['正在加入公開房間','Joining public room'],['公開房間','Public room'],['等待加入','Waiting'],['建立成功','Created successfully'],['建立失敗','Failed to create'],['加入失敗','Failed to join'],['房間已滿','Room is full'],['房間不存在','Room not found'],['密碼錯誤','Incorrect password'],['紅方：','Red: '],['黑方：','Black: '],['房主：','Host: '],['建立：','Created: '],['人數：','Players: '],['你是紅方（先手）','You are Red (first)'],['你是黑方（後手）','You are Black (second)'],['紅方','Red'],['黑方','Black'],['等待玩家','Waiting for player'],['打敗了','defeated'],['將軍！','CHECK!'],['對局中','In game'],['已結束','Finished'],['私人','Private'],['公開','Public']
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

if(localStorage.getItem('xiangqi-theme')==='light')document.body.classList.remove('dark-mode');$('theme-btn').textContent=document.body.classList.contains('dark-mode')?'☀️ 淺色':'🌙 深色';if(onlineMode){$('online-panel').hidden=false;$('chess-game-mode').value='pvp';$('chess-game-mode').querySelector('option[value="pvp"]').textContent='多人連線對戰';$('chess-game-mode').disabled=true;$('chess-mode-title').textContent='多人連線對戰';$('chess-ai-level').style.display='none';$('chess-ai-score-container').style.display='none'}initGame(onlineMode);updateStats();if(onlineMode)connectFirebase();
