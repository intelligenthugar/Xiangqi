import { firebaseConfig } from './firebase-config.js';

const $=id=>document.getElementById(id);const params=new URLSearchParams(location.search);let onlineMode=params.get('mode')==='online';let inviteRoomCode=(params.get('room')||'').trim().toUpperCase();let autoJoinAttempted=false;
let app=null,auth=null,db=null,user=null,roomCode=null,myColor=null,roomUnsubscribe=null,onlineReady=false,applyingRemote=false;
let firebaseApi=null;
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
function updateStatus(){if(chessGameOver||isTossingCoin)return;const check=isCheck(chessPieces,chessTurn);$('check-banner').classList.toggle('show',check&&!isBannerDismissed);$('chess-status').classList.toggle('status-in-check',check);if(check)setStatus(`⚡ ${chessTurn==='red'?'🔴 紅方':'⚫ 黑方'} 被「將軍」！請儘快應將`);else setStatus(`輪到 ${chessTurn==='red'?'🔴 紅方':'⚫ 黑方'} 行棋${onlineMode&&myColor!==chessTurn?'（等待對方）':''}`)}
function handleClick(idx){if(chessGameOver||isTossingCoin||applyingRemote)return;if(onlineMode&&(!onlineReady||myColor!==chessTurn)){setStatus(myColor?'現在是對方的回合':'請先建立或加入房間');return}if(!onlineMode&&chessGameMode==='pve'&&chessTurn==='black')return;const p=chessPieces[idx];if(p?.color===chessTurn){chessSelectedIdx=idx;const m=legalMovesFrom(idx);chessValidMoves=m.valid;chessDangerMoves=m.danger;renderBoard();return}if(chessSelectedIdx>=0&&chessValidMoves.includes(idx)){const from=chessSelectedIdx;const move={from,to:idx,movedPiece:chessPieces[from],capturedPiece:chessPieces[idx],turn:chessTurn};applyMoveLocal(move);if(onlineMode)sendMove();else if(!chessGameOver&&chessGameMode==='pve'&&chessTurn==='black')aiTurn()}}
function applyMoveLocal(m){moveHistory.push({from:m.from,to:m.to,movedPiece:chessPieces[m.from],capturedPiece:chessPieces[m.to],turn:chessTurn});chessPieces[m.to]=chessPieces[m.from];chessPieces[m.from]=null;lastMove={from:m.from,to:m.to};chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];renderBoard();const winner=chessPieces.some(p=>p?.name==='帥')?(chessPieces.some(p=>p?.name==='將')?null:'red'):'black';if(winner){finishGame(winner,'主帥已被吃掉！');return}chessTurn=chessTurn==='red'?'black':'red';updateStatus();const moves=allLegalMoves(chessPieces,chessTurn);if(!moves.length){finishGame(chessTurn==='red'?'black':'red',isCheck(chessPieces,chessTurn)?'將死！':'困斃！')}}
function finishGame(winner,reason){chessGameOver=true;$('check-banner').classList.remove('show');$('winner-message').textContent=`${winner==='red'?'🔴 紅方':'⚫ 黑方'}獲勝！`;$('winner-reason').textContent=reason;if(!onlineMode&&chessGameMode==='pve'){if(winner==='red')chessStats.wins++;else chessStats.losses++;updateStats()}showModal('win-modal');if(onlineMode&&roomCode)update(ref(db,`rooms/${roomCode}`),{status:'finished',winner,reason,board:chessPieces,turn:chessTurn}).catch(console.error)}
function updateStats(){ $('chess-stat-win').textContent=chessStats.wins;$('chess-stat-loss').textContent=chessStats.losses;$('chess-stat-draw').textContent=chessStats.draws;localStorage.setItem('chess_ai_stats',JSON.stringify(chessStats))}
function evaluate(board){let s=0;for(let i=0;i<90;i++){const p=board[i];if(!p)continue;let v=pieceValues[p.name]||10,r=Math.floor(i/9),c=i%9;if(p.type==='兵'&&r<=4)v+=(5-r)*5;if(p.type==='卒'&&r>=5)v+=(r-4)*5;if(['車','俥'].includes(p.type)&&c===4)v+=10;s+=p.color==='black'?v:-v}return s}
function minimax(board,depth,alpha,beta,maximizing){if(depth===0)return evaluate(board);const color=maximizing?'black':'red',moves=allLegalMoves(board,color);if(!moves.length)return maximizing?-99999:99999;let best=maximizing?-Infinity:Infinity;for(const m of moves){const a=board[m.from],d=board[m.to];board[m.to]=a;board[m.from]=null;const score=minimax(board,depth-1,alpha,beta,!maximizing);board[m.from]=a;board[m.to]=d;if(maximizing){best=Math.max(best,score);alpha=Math.max(alpha,score)}else{best=Math.min(best,score);beta=Math.min(beta,score)}if(beta<=alpha)break}return best}
function aiTurn(){if(chessGameOver||onlineMode||chessGameMode!=='pve'||chessTurn!=='black')return;setTimeout(()=>{const moves=allLegalMoves(chessPieces,'black');if(!moves.length)return;let chosen;if(currentAiLevel==='easy'){moves.sort((a,b)=>(pieceValues[chessPieces[b.to]?.name]||0)-(pieceValues[chessPieces[a.to]?.name]||0));chosen=moves[Math.floor(Math.random()*Math.min(3,moves.length))]}else{let best=-Infinity,opts=[];for(const m of moves){const a=chessPieces[m.from],d=chessPieces[m.to];chessPieces[m.to]=a;chessPieces[m.from]=null;const s=minimax(chessPieces,1,-Infinity,Infinity,false);chessPieces[m.from]=a;chessPieces[m.to]=d;if(s>best){best=s;opts=[m]}else if(s===best)opts.push(m)}chosen=opts[Math.floor(Math.random()*opts.length)]}applyMoveLocal(chosen)},450)}
function makeCode(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=chars[Math.floor(Math.random()*chars.length)];return s}
async function connectFirebase(){
  if(firebaseConfig.apiKey==='YOUR_API_KEY'||firebaseConfig.databaseURL.includes('YOUR_DATABASE')){$('online-status').textContent='請先編輯 js/firebase-config.js，填入 Firebase Console 的真實設定。';return}
  try{
    // Firebase 只在多人模式才動態載入；即使外部 CDN 無法連線，也不會阻止單機棋盤和棋子顯示。
    const [appMod,authMod,dbMod]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
    ]);
    firebaseApi={...appMod,...authMod,...dbMod};
    app=firebaseApi.initializeApp(firebaseConfig);auth=firebaseApi.getAuth(app);db=firebaseApi.getDatabase(app);
    firebaseApi.onAuthStateChanged(auth,u=>{user=u;if(u){$('online-status').textContent='Firebase 已連線（匿名玩家），可以建立或加入房間。';attemptAutoJoinInvite();}});
    const credential=await firebaseApi.signInAnonymously(auth);user=credential.user;$('online-status').textContent='Firebase 已連線（匿名玩家），可以建立或加入房間。';attemptAutoJoinInvite();
  }catch(e){$('online-status').textContent=`Firebase 連線失敗：${explainFirebaseError(e,'連線')}`;console.error(e)}
}
const ref=(...a)=>firebaseApi.ref(...a),get=(...a)=>firebaseApi.get(...a),set=(...a)=>firebaseApi.set(...a),update=(...a)=>firebaseApi.update(...a),onValue=(...a)=>firebaseApi.onValue(...a),runTransaction=(...a)=>firebaseApi.runTransaction(...a);
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
    const data={createdAt:Date.now(),players:{red:user.uid,black:null},board:initialBoard(),turn:'red',status:'waiting',lastMove:null,moveCount:0};
    await set(ref(db,`rooms/${code}`),data);
    roomCode=code;myColor='red';renderBoard();enterRoom(code);
    $('room-role').textContent='你是紅方（先手）';
    $('room-waiting').textContent='房間建立成功！請把代碼傳給朋友，等待黑方加入。';
    setStatus(`房間 ${code} 已建立，等待另一位玩家加入。`);
    window.alert(`房間建立成功！\n\n房間代碼：${code}\n\n請把這組 6 碼代碼傳給朋友，讓對方在多人模式輸入後加入。`);
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
      showRoomAlert('無法加入房間','這個瀏覽器已經是房間內的玩家。請使用另一個瀏覽器／無痕視窗，或另一台裝置加入。');return;
    }
    if(old.players?.red&&old.players?.black){
      showRoomAlert('房間已滿',`代碼 ${code} 已經有兩位玩家使用，無法再加入。請請房主建立新房間。`);return;
    }
    if(old.status!=='waiting'){
      showRoomAlert('無法加入房間','這個房間已經開始或已結束，不能再加入。請使用新的房間代碼。');return;
    }
    let failureReason='';
    const result=await runTransaction(r,room=>{
      if(!room){failureReason='找不到房間，代碼可能無效。';return;}
      if(room.players?.red===user.uid||room.players?.black===user.uid){failureReason='你已經在這個房間內。';return;}
      if(room.status!=='waiting'){failureReason='這個房間已經開始或結束。';return;}
      if(room.players?.red&&room.players?.black){failureReason='此代碼已經有兩個人使用，房間已滿。';return;}
      if(!room.players?.red){failureReason='房間資料不完整，缺少紅方玩家。請房主重新建立房間。';return;}
      room.players.black=user.uid;room.status='playing';return room;
    });
    if(!result.committed){
      const msg=failureReason||'房間狀態剛剛改變，可能另一位玩家已先加入。請重新確認代碼或請房主建立新房間。';
      showRoomAlert('加入房間失敗',msg);return;
    }
    roomCode=code;myColor='black';renderBoard();enterRoom(code);
    $('room-role').textContent='你是黑方（後手）';
    $('room-waiting').textContent='已成功加入房間，開始對弈！';
    setStatus(`已加入房間 ${code}，你是黑方。`);
    window.alert(`加入房間成功！\n\n房間代碼：${code}\n你的角色：黑方（後手）`);
  }catch(e){console.error(e);showRoomAlert('加入房間失敗',explainFirebaseError(e,'加入房間'));}
  finally{if(!roomCode){btn.disabled=false;btn.textContent='加入房間';}}
}
function enterRoom(code){roomCode=code;$('room-info').hidden=false;$('room-code-display').textContent=code;$('create-room-btn').disabled=true;$('join-room-btn').disabled=true;$('room-code-input').disabled=true;onlineReady=true;if(roomUnsubscribe)roomUnsubscribe();roomUnsubscribe=onValue(ref(db,`rooms/${code}`),snap=>{const room=snap.val();if(!room){setStatus('房間已不存在');onlineReady=false;return}if(room.players?.red===user.uid)myColor='red';else if(room.players?.black===user.uid)myColor='black';else{setStatus('你不是此房間的玩家');onlineReady=false;return}renderBoard();if(room.status==='waiting')$('room-waiting').textContent='等待黑方玩家加入…';else $('room-waiting').textContent='對局進行中';if(room.board){applyingRemote=true;chessPieces=Array.from({length:90},(_,i)=>room.board?.[i]??null);chessTurn=room.turn||'red';lastMove=room.lastMove||null;chessGameOver=room.status==='finished';chessSelectedIdx=-1;chessValidMoves=[];chessDangerMoves=[];renderBoard();updateStatus();applyingRemote=false}if(room.status==='finished'&&room.winner&&!$('win-modal').hidden===false){$('winner-message').textContent=`${room.winner==='red'?'紅方':'黑方'}獲勝`;$('winner-reason').textContent=room.reason||'';showModal('win-modal')}})}
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
$('create-room-btn').addEventListener('click',createRoom);$('join-room-btn').addEventListener('click',joinRoom);
$('copy-room-btn').addEventListener('click',async()=>{if(!roomCode)return;try{await copyText(roomCode);$('room-waiting').textContent='✅ 已複製房間代碼！傳給朋友即可加入。'}catch{$('room-waiting').textContent=`複製失敗，請手動複製代碼：${roomCode}`}});
$('copy-invite-btn').addEventListener('click',async()=>{if(!roomCode)return;const url=makeInviteUrl(roomCode);try{await copyText(url);$('room-waiting').textContent='✅ 已複製邀請網址！傳給朋友，對方開啟後會自動嘗試加入。'}catch{$('room-waiting').textContent=`無法自動複製，請手動複製此網址：${url}`;window.prompt('請複製這個邀請網址：',url)}});
$('chess-game-mode').addEventListener('change',()=>{if(onlineMode)return;initGame()});$('chess-ai-level').addEventListener('change',()=>{currentAiLevel=$('chess-ai-level').value});$('restart-btn').addEventListener('click',()=>{if(onlineMode){setStatus('多人模式的重新開始目前請建立新房間，避免兩端棋局不同步。');return}initGame()});$('reset-stats-btn').addEventListener('click',()=>{chessStats={wins:0,losses:0,draws:0};updateStats()});$('confirm-win').onclick=()=>hideModal('win-modal');$('close-win').onclick=()=>hideModal('win-modal');$('cancel-confirm').onclick=()=>hideModal('confirm-modal');$('accept-confirm').onclick=()=>hideModal('confirm-modal');$('check-banner').onclick=()=>{$('check-banner').classList.remove('show');isBannerDismissed=true};
function toggleDarkMode(){document.body.classList.toggle('dark-mode');const d=document.body.classList.contains('dark-mode');$('theme-btn').textContent=d?'☀️ 淺色':'🌙 深色';localStorage.setItem('xiangqi-theme',d?'dark':'light')}
let english=false;function toggleLanguage(){english=!english;$('lang-btn').textContent=english?'繁體中文':'English';$('header-title').textContent=english?'🪨 Xiangqi (Chinese Chess)':'🪨 中國象棋（傳統大棋盤）';$('chess-mode-title').textContent=english?'Xiangqi':'傳統象棋';$('restart-btn').textContent=english?'Restart':'重來';$('create-room-btn').textContent=english?'Create Room':'建立房間';$('join-room-btn').textContent=english?'Join Room':'加入房間';$('online-panel').querySelector('h2').textContent=english?'🌐 Online Multiplayer':'🌐 多人連線';}
if(localStorage.getItem('xiangqi-theme')==='light')document.body.classList.remove('dark-mode');$('theme-btn').textContent=document.body.classList.contains('dark-mode')?'☀️ 淺色':'🌙 深色';if(onlineMode){$('online-panel').hidden=false;$('chess-game-mode').value='pvp';$('chess-game-mode').querySelector('option[value="pvp"]').textContent='多人連線對戰';$('chess-game-mode').disabled=true;$('chess-mode-title').textContent='多人連線對戰';$('chess-ai-level').style.display='none';$('chess-ai-score-container').style.display='none'}initGame(onlineMode);updateStats();if(onlineMode)connectFirebase();
