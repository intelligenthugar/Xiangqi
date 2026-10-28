import { firebaseConfig } from './firebase-config.js';

const $ = id => document.getElementById(id); const params = new URLSearchParams(location.search); let onlineMode = params.get('mode') === 'online'; let inviteRoomCode = (params.get('room') || '').trim().toUpperCase(); let autoJoinAttempted = false;
let app = null, auth = null, db = null, user = null, roomCode = null, myColor = null, roomUnsubscribe = null, onlineReady = false, applyingRemote = false;
let firebaseApi = null, publicRoomsUnsubscribe = null, roomNoticeUnsubscribe = null, onlinePublicRoomsCache = [], lastRoomNoticeId = '', lastSeenMoveCount = -1, rematchResetStarted = false, rematchPromptOpen = false, opponentDisconnectTimer = null, disconnectHandledRoom = '';
let currentPlayerNames = { red: '紅方', black: '黑方' }; let playerDisplayName = '棋手', currentGameId = 'single_' + Date.now(), savedMatchIds = new Set();
let rankedQuality = 0, rankedBeforeMaterial = 0; let chessPieces = [], chessSelectedIdx = -1, chessValidMoves = [], chessDangerMoves = [], chessTurn = 'red', chessGameMode = 'pve', currentAiLevel = 'hard', chessGameOver = false, isTossingCoin = false, isBannerDismissed = false, lastMove = null, moveHistory = [];
const pieceValues = { '帥': 10000, '將': 10000, '俥': 90, '車': 90, '炮': 45, '包': 45, '傌': 40, '馬': 40, '相': 20, '象': 20, '仕': 20, '士': 20, '兵': 10, '卒': 10 };
function setStatus(s) { $('chess-status').textContent = s }
function showModal(id) { $(id).hidden = false } function hideModal(id) { $(id).hidden = true }
function initialBoard() { const b = Array(90).fill(null); const black = ['車', '馬', '象', '士', '將', '士', '象', '馬', '車']; black.forEach((name, c) => b[c] = { name, color: 'black', type: name }); b[19] = { name: '包', color: 'black', type: '炮' }; b[25] = { name: '包', color: 'black', type: '炮' };[0, 2, 4, 6, 8].forEach(c => b[27 + c] = { name: '卒', color: 'black', type: '卒' });[0, 2, 4, 6, 8].forEach(c => b[54 + c] = { name: '兵', color: 'red', type: '兵' }); b[64] = { name: '炮', color: 'red', type: '炮' }; b[70] = { name: '炮', color: 'red', type: '炮' };['俥', '傌', '相', '仕', '帥', '仕', '相', '傌', '俥'].forEach((name, c) => b[81 + c] = { name, color: 'red', type: name }); return b }
function initGame(skipCoin = false) { rankedQuality = 0; rankedBeforeMaterial = 0; currentGameId = 'single_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); chessGameMode = $('chess-game-mode').value; const rankedLocked = chessGameMode === 'ranked'; if (rankedLocked) { $('chess-ai-level').value = 'hard'; currentAiLevel = 'hard' } else { currentAiLevel = $('chess-ai-level').value } $('chess-game-mode').disabled = rankedLocked || onlineMode; $('chess-ai-level').disabled = rankedLocked || onlineMode; $('chess-ai-level').style.display = ['pve', 'ranked'].includes(chessGameMode) ? (rankedLocked ? 'none' : 'inline-block') : 'none'; $('ranked-panel').hidden = chessGameMode !== 'ranked'; if (chessGameMode === 'ranked') loadRankedRating(); chessPieces = initialBoard(); chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = []; chessTurn = 'red'; chessGameOver = false; isBannerDismissed = false; lastMove = null; moveHistory = []; renderBoard(); if (skipCoin || onlineMode) { isTossingCoin = false; $('coin-overlay').style.display = 'none'; if (onlineMode) { chessTurn = 'red'; updateStatus() } else updateStatus() } else tossCoin() }
function tossCoin() { isTossingCoin = true; $('coin-overlay').style.display = 'flex'; $('coin-text-tip').textContent = '🪙 擲硬幣決定先手...'; const red = Math.random() < .5, deg = red ? 2160 : 2340; $('coin').style.transition = 'none'; $('coin').style.transform = 'rotateY(0deg)'; setTimeout(() => { $('coin').style.transition = 'transform 1.2s cubic-bezier(.25,1,.5,1)'; $('coin').style.transform = `rotateY(${deg}deg)` }, 50); setTimeout(() => { $('coin-text-tip').textContent = red ? '🪙 擲出「紅」！由紅方先手！' : '🪙 擲出「黑」！由黑方先手！'; setTimeout(() => { $('coin-overlay').style.display = 'none'; isTossingCoin = false; chessTurn = red ? 'red' : 'black'; updateStatus(); if (['pve', 'ranked'].includes(chessGameMode) && chessTurn === 'black') aiTurn() }, 900) }, 1250) }
function isKingsFacing(board) { let r = -1, b = -1; for (let i = 0; i < 90; i++) { if (board[i]?.name === '帥') r = i; if (board[i]?.name === '將') b = i } if (r < 0 || b < 0 || r % 9 !== b % 9) return false; for (let row = Math.min(Math.floor(r / 9), Math.floor(b / 9)) + 1; row < Math.max(Math.floor(r / 9), Math.floor(b / 9)); row++)if (board[row * 9 + r % 9]) return false; return true }
function between(from, to, board) { let fr = Math.floor(from / 9), fc = from % 9, tr = Math.floor(to / 9), tc = to % 9, n = 0; if (fr === tr) { for (let c = Math.min(fc, tc) + 1; c < Math.max(fc, tc); c++)if (board[fr * 9 + c]) n++ } else if (fc === tc) { for (let r = Math.min(fr, tr) + 1; r < Math.max(fr, tr); r++)if (board[r * 9 + fc]) n++ } return n }
function canMove(from, to, board) { const a = board[from], d = board[to]; if (!a || from === to || d?.color === a.color) return false; const fr = Math.floor(from / 9), fc = from % 9, tr = Math.floor(to / 9), tc = to % 9, dr = Math.abs(fr - tr), dc = Math.abs(fc - tc); switch (a.type) { case '將': case '帥': return dr + dc === 1 && tc >= 3 && tc <= 5 && (a.color === 'black' ? tr <= 2 : tr >= 7); case '士': case '仕': return dr === 1 && dc === 1 && tc >= 3 && tc <= 5 && (a.color === 'black' ? tr <= 2 : tr >= 7); case '象': case '相': return dr === 2 && dc === 2 && (a.color === 'black' ? tr <= 4 : tr >= 5) && !board[((fr + tr) / 2 | 0) * 9 + ((fc + tc) / 2 | 0)]; case '馬': case '傌': if (!((dr === 1 && dc === 2) || (dr === 2 && dc === 1))) return false; return dr === 2 ? !board[((fr + tr) / 2 | 0) * 9 + fc] : !board[fr * 9 + ((fc + tc) / 2 | 0)]; case '車': case '俥': return (fr === tr || fc === tc) && between(from, to, board) === 0; case '炮': case '包': if (fr !== tr && fc !== tc) return false; return d ? between(from, to, board) === 1 : between(from, to, board) === 0; case '卒': case '兵': if (dr + dc !== 1) return false; if (a.color === 'black') return (tr === fr + 1 && dc === 0) || (fr >= 5 && tr === fr && dc === 1); return (tr === fr - 1 && dc === 0) || (fr <= 4 && tr === fr && dc === 1); default: return false } }
function isCheck(board, color) { const king = board.findIndex(p => p?.name === (color === 'red' ? '帥' : '將')); if (king < 0) return true; for (let i = 0; i < 90; i++)if (board[i]?.color !== (color) && board[i] && canMove(i, king, board)) return true; return false }
function legalMovesFrom(from, board = chessPieces) { const piece = board[from], valid = [], danger = []; if (!piece) return { valid, danger }; for (let to = 0; to < 90; to++) { if (!canMove(from, to, board)) continue; const src = board[from], dst = board[to]; board[to] = src; board[from] = null; const bad = isKingsFacing(board) || isCheck(board, piece.color); board[from] = src; board[to] = dst; (bad ? danger : valid).push(to) } return { valid, danger } }
function allLegalMoves(board, color) { const out = []; for (let from = 0; from < 90; from++)if (board[from]?.color === color) { for (const to of legalMovesFrom(from, board).valid) out.push({ from, to }) } return out }
function renderBoard() { const root = $('chess-board'); root.innerHTML = ''; root.className = 'chess-board' + (chessGameMode === 'pvp' ? ' pvp-mode' : '') + (onlineMode && myColor === 'black' ? ' online-black-view' : ''); const svgNS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('class', 'full-board-svg'); svg.setAttribute('viewBox', '0 0 360 400'); let lines = ''; const cw = 40, ch = 40, ox = 20, oy = 20; lines += `<rect x="18" y="18" width="324" height="364" stroke="#704214" stroke-width="2" fill="none"/>`; for (let r = 0; r < 10; r++)lines += `<line x1="20" y1="${20 + r * 40}" x2="340" y2="${20 + r * 40}" stroke="#704214" stroke-width="1.5"/>`; for (let c = 0; c < 9; c++) { if (c === 0 || c === 8) lines += `<line x1="${20 + c * 40}" y1="20" x2="${20 + c * 40}" y2="380" stroke="#704214" stroke-width="1.5"/>`; else { lines += `<line x1="${20 + c * 40}" y1="20" x2="${20 + c * 40}" y2="180" stroke="#704214" stroke-width="1.5"/><line x1="${20 + c * 40}" y1="220" x2="${20 + c * 40}" y2="380" stroke="#704214" stroke-width="1.5"` + ' />' } } lines += `<text x="92" y="211" font-size="22" fill="#704214" font-weight="bold" font-family="KaiTi, 標楷體">楚 河</text><text x="228" y="211" font-size="22" fill="#704214" font-weight="bold" font-family="KaiTi, 標楷體">漢 界</text><line x1="140" y1="20" x2="220" y2="100" stroke="#704214"/><line x1="220" y1="20" x2="140" y2="100" stroke="#704214"/><line x1="140" y1="300" x2="220" y2="380" stroke="#704214"/><line x1="220" y1="300" x2="140" y2="380" stroke="#704214"/>`; svg.innerHTML = lines; root.appendChild(svg); const overlay = document.createElement('div'); overlay.className = 'full-board-interactive'; for (let i = 0; i < 90; i++) { const cell = document.createElement('div'); let cls = 'chess-cell'; if (chessSelectedIdx === i) cls += ' selected'; if (lastMove && (lastMove.from === i || lastMove.to === i)) cls += ' last-move'; if (chessValidMoves.includes(i)) cls += chessPieces[i] ? ' valid-capture' : ' valid-move'; if (chessDangerMoves.includes(i)) cls += chessPieces[i] ? ' invalid-danger-capture' : ' invalid-danger-move'; cell.className = cls; cell.onclick = () => handleClick(i); const p = chessPieces[i]; if (p) { const el = document.createElement('div'); el.className = 'chess-piece ' + p.color; el.textContent = p.name; el.setAttribute('aria-label', `${p.color === 'red' ? '紅方' : '黑方'}${p.name}`); el.title = el.getAttribute('aria-label'); cell.appendChild(el) } overlay.appendChild(cell) } root.appendChild(overlay) }
function updateStatus() { if (chessGameOver || isTossingCoin) return; const check = isCheck(chessPieces, chessTurn); const isTargetPlayerBoard = !onlineMode || (onlineReady && myColor === chessTurn); const showCheck = check && isTargetPlayerBoard && !isBannerDismissed; $('check-banner').classList.toggle('show', showCheck); $('chess-status').classList.toggle('status-in-check', check && isTargetPlayerBoard); if (check && isTargetPlayerBoard) setStatus(`⚡ ${chessTurn === 'red' ? '🔴 紅方' : '⚫ 黑方'} 被將軍！請儘快應將`); else setStatus(`輪到 ${chessTurn === 'red' ? '🔴 紅方' : '⚫ 黑方'} 行棋${onlineMode && myColor !== chessTurn ? '（等待對方）' : ''}`) }
function getSideName(color) { if (onlineMode) return currentPlayerNames[color] || (color === 'red' ? '紅方' : '黑方'); if (chessGameMode === 'pve') return color === 'red' ? '你' : 'AI'; return color === 'red' ? '紅方' : '黑方' }
function winnerMessage(winner) { const loser = winner === 'red' ? 'black' : 'red'; return `${getSideName(winner)} 打敗了 ${getSideName(loser)}` }
function handleClick(idx) { if (chessGameOver || isTossingCoin || applyingRemote) return; if (onlineMode && (!onlineReady || myColor !== chessTurn)) { setStatus(myColor ? '現在是對方的回合' : '請先建立或加入房間'); return } if (!onlineMode && ['pve', 'ranked'].includes(chessGameMode) && chessTurn === 'black') return; const p = chessPieces[idx]; if (p?.color === chessTurn) { chessSelectedIdx = idx; const m = legalMovesFrom(idx); chessValidMoves = m.valid; chessDangerMoves = m.danger; renderBoard(); return } if (chessSelectedIdx >= 0 && chessValidMoves.includes(idx)) { const from = chessSelectedIdx; const move = { from, to: idx, movedPiece: chessPieces[from], capturedPiece: chessPieces[idx], turn: chessTurn }; applyMoveLocal(move); if (onlineMode) sendMove(); else if (!chessGameOver && ['pve', 'ranked'].includes(chessGameMode) && chessTurn === 'black') aiTurn() } }
function applyMoveLocal(m) { const isRankedMove = chessGameMode === 'ranked' && !onlineMode && chessTurn === 'red'; const beforeEval = isRankedMove ? evaluate(chessPieces) : 0; const capturedForQuality = chessPieces[m.to]; moveHistory.push({ from: m.from, to: m.to, movedPiece: chessPieces[m.from], capturedPiece: chessPieces[m.to], turn: chessTurn }); chessPieces[m.to] = chessPieces[m.from]; chessPieces[m.from] = null; lastMove = { from: m.from, to: m.to }; if (isRankedMove) { const afterEval = evaluate(chessPieces); const swing = beforeEval - afterEval; rankedQuality += Math.max(-8, Math.min(8, Math.round(swing / 12))) + (capturedForQuality ? 2 : 0) + (isCheck(chessPieces, 'black') ? 2 : 0); } isBannerDismissed = false; chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = []; renderBoard(); const winner = chessPieces.some(p => p?.name === '帥') ? (chessPieces.some(p => p?.name === '將') ? null : 'red') : 'black'; if (winner) { finishGame(winner, '主帥已被吃掉！'); return } chessTurn = chessTurn === 'red' ? 'black' : 'red'; updateStatus(); const moves = allLegalMoves(chessPieces, chessTurn); if (!moves.length) { finishGame(chessTurn === 'red' ? 'black' : 'red', isCheck(chessPieces, chessTurn) ? '將死！' : '困斃！') } }
function configureFinishedModal(mode = 'finished') {
  const online = onlineMode && !!roomCode;
  $('rematch-request-btn').hidden = !online || mode !== 'finished';
  $('rematch-accept-btn').hidden = !online || mode !== 'incoming';
  $('rematch-decline-btn').hidden = !online || !['finished', 'incoming', 'waiting'].includes(mode);
  $('confirm-win').hidden = online;
  $('rematch-status').textContent = '';
  if (mode === 'incoming') $('rematch-status').textContent = `${currentPlayerNames[myColor === 'red' ? 'black' : 'red'] || '對手'} 想再玩一局，是否同意？`;
  else if (mode === 'waiting') $('rematch-status').textContent = '已送出再玩一局的邀請，正在等待對方回覆…';
  else if (online) $('rematch-status').textContent = '要再玩一局嗎？若任何一方不繼續，房間就會關閉。';
}
function setResultStamp(isWinner) { const stamp = $('result-stamp'); if (!stamp) return; stamp.textContent = isWinner ? '勝' : '敗'; stamp.classList.toggle('stamp-win', isWinner); stamp.classList.toggle('stamp-loss', !isWinner); stamp.hidden = false }
async function savePlayerMatch(match) { try { if (!user || user.isAnonymous || !db || !firebaseApi || !match?.matchId || savedMatchIds.has(match.matchId)) return; savedMatchIds.add(match.matchId); const profileSnap = await get(ref(db, `users/${user.uid}/profile`)); const profile = profileSnap.val() || {}; if (!profile.displayName) { savedMatchIds.delete(match.matchId); return } const data = { id: match.matchId, mode: match.mode, result: match.result, reason: String(match.reason || '').slice(0, 160), finishedAt: Number(match.finishedAt || Date.now()), moveCount: Number(match.moveCount || 0), aiLevel: match.aiLevel || null, opponentName: String(match.opponentName || '').slice(0, 30), roomCode: match.roomCode || null, displayName: profile.displayName }; await set(ref(db, `users/${user.uid}/matches/${match.matchId.replace(/[^A-Za-z0-9_-]/g, '_')}`), data); } catch (e) { savedMatchIds.delete(match.matchId); console.warn('對戰紀錄儲存失敗，請確認 Firebase Rules 已允許本人寫入 users/{uid}/matches', e) } }
function finishGame(winner, reason) { chessGameOver = true; $('check-banner').classList.remove('show'); setResultStamp(!onlineMode ? (winner === 'red' || (chessGameMode === 'pvp' && winner === 'black')) : winner === myColor); $('winner-message').textContent = winnerMessage(winner); $('winner-reason').textContent = reason; configureFinishedModal('finished'); showModal('win-modal'); if (onlineMode && roomCode) { const finishedAt = Date.now(); update(ref(db, `rooms/${roomCode}`), { status: 'finished', winner, reason, winnerName: getSideName(winner), loserName: getSideName(winner === 'red' ? 'black' : 'red'), board: chessPieces, turn: chessTurn, finishedAt }).catch(console.error) } else if (['pve', 'ranked'].includes(chessGameMode)) { const result = winner === 'red' ? 'win' : 'loss'; savePlayerMatch({ matchId: currentGameId, mode: chessGameMode === 'ranked' ? 'ranked' : 'pve', result, winner, reason, finishedAt: Date.now(), moveCount: moveHistory.length, aiLevel: currentAiLevel, opponentName: chessGameMode === 'ranked' ? '排位 AI' : `AI（${currentAiLevel === 'easy' ? '初級' : currentAiLevel === 'medium' ? '中級' : '高級'}）` }); if (chessGameMode === 'ranked') recordRankedResult(result, rankedQuality, moveHistory.length); } }
async function publishRoomNotice(type, extra = {}) {
  if (!roomCode || !db || !user) throw new Error('目前沒有有效的連線房間');
  const code = roomCode;
  await set(ref(db, `roomNotices/${code}`), { id: `${user.uid}_${type}_${Date.now()}`, type, senderUid: user.uid, senderColor: myColor, senderName: currentPlayerNames[myColor] || getSideName(myColor), createdAt: Date.now(), ...extra });
}
async function requestRematch() {
  if (!roomCode || !user) return;
  try { await publishRoomNotice('rematch-request'); configureFinishedModal('waiting'); $('rematch-status').textContent = '已送出再玩一局的邀請，正在等待對方回覆…'; }
  catch (e) { showRoomAlert('邀請失敗', `無法送出再玩一局的邀請：${e.message}`) }
}
async function acceptRematch() {
  if (!roomCode || !user) return;
  try { await publishRoomNotice('rematch-agreed'); $('rematch-status').textContent = '雙方同意再玩一局，正在重設棋盤…'; await resetRoomForRematch(); }
  catch (e) { showRoomAlert('重新開始失敗', `無法重新開始：${e.message}`) }
}
async function resetRoomForRematch() {
  if (rematchResetStarted || !roomCode || !db || !user) return;
  rematchResetStarted = true;
  try {
    const code = roomCode; const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) { exitRoomLocally('房間已關閉，已返回連線大廳。'); return }
    const room = snap.val();
    // 現有 Rules 只允許輪到自己的玩家更新房間；因此由 room.turn 對應的玩家負責重開。
    if (room.players?.[room.turn] !== user.uid) { rematchResetStarted = false; return }
    await update(ref(db, `rooms/${code}`), { status: 'playing', winner: null, reason: null, winnerName: null, loserName: null, board: initialBoard(), turn: 'red', lastMove: null, moveCount: 0 });
    await set(ref(db, `roomNotices/${code}`), { id: `${user.uid}_rematch-started_${Date.now()}`, type: 'rematch-started', senderUid: user.uid, createdAt: Date.now() });
    currentGameId = 'single_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); chessPieces = initialBoard(); chessTurn = 'red'; chessGameOver = false; chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = []; lastMove = null; moveHistory = []; isBannerDismissed = false; lastSeenMoveCount = 0;
    hideModal('win-modal'); $('result-stamp').hidden = true; $('result-stamp').classList.remove('stamp-win', 'stamp-loss'); renderBoard(); updateStatus(); $('room-waiting').textContent = '新的一局開始！';
  } catch (e) { rematchResetStarted = false; throw e }
}
async function declineRematch() {
  if (!roomCode || !db || !user) { hideModal('win-modal'); return }
  const code = roomCode;
  try { await publishRoomNotice('rematch-declined'); await closeFinishedRoom(code, '雙方結束對局，房間已關閉。'); }
  catch (e) { showRoomAlert('關閉房間失敗', `無法關閉房間：${e.message}`) }
}
async function closeFinishedRoom(code = roomCode, message = '房間已關閉。') {
  if (!code || !db) return;
  try {
    const snap = await get(ref(db, `rooms/${code}`)); const room = snap.val();
    if (room?.settings?.visibility === 'public') await remove(ref(db, `publicRooms/${code}`)).catch(() => { });
    if (snap.exists()) await remove(ref(db, `rooms/${code}`));
  } finally { hideModal('win-modal'); exitRoomLocally(message); onlineMode = true; rematchResetStarted = false; }
}
function evaluate(board) { let s = 0; for (let i = 0; i < 90; i++) { const p = board[i]; if (!p) continue; let v = pieceValues[p.name] || 10, r = Math.floor(i / 9), c = i % 9; if (p.type === '兵' && r <= 4) v += (5 - r) * 5; if (p.type === '卒' && r >= 5) v += (r - 4) * 5; if (['車', '俥'].includes(p.type) && c === 4) v += 10; s += p.color === 'black' ? v : -v } return s }
function minimax(board, depth, alpha, beta, maximizing) { if (depth === 0) return evaluate(board); const color = maximizing ? 'black' : 'red', moves = allLegalMoves(board, color); if (!moves.length) return maximizing ? -99999 : 99999; let best = maximizing ? -Infinity : Infinity; for (const m of moves) { const a = board[m.from], d = board[m.to]; board[m.to] = a; board[m.from] = null; const score = minimax(board, depth - 1, alpha, beta, !maximizing); board[m.from] = a; board[m.to] = d; if (maximizing) { best = Math.max(best, score); alpha = Math.max(alpha, score) } else { best = Math.min(best, score); beta = Math.min(beta, score) } if (beta <= alpha) break } return best }
function aiTurn() { if (chessGameOver || onlineMode || !['pve', 'ranked'].includes(chessGameMode) || chessTurn !== 'black') return; setTimeout(() => { const moves = allLegalMoves(chessPieces, 'black'); if (!moves.length) return; let chosen; if (currentAiLevel === 'easy') { moves.sort((a, b) => (pieceValues[chessPieces[b.to]?.name] || 0) - (pieceValues[chessPieces[a.to]?.name] || 0)); chosen = moves[Math.floor(Math.random() * Math.min(5, moves.length))] } else if (currentAiLevel === 'medium') { let best = -Infinity, opts = []; for (const m of moves) { const a = chessPieces[m.from], d = chessPieces[m.to]; chessPieces[m.to] = a; chessPieces[m.from] = null; const score = evaluate(chessPieces) + (d ? (pieceValues[d.name] || 0) * 0.8 : 0) + (isCheck(chessPieces, 'red') ? 30 : 0); chessPieces[m.from] = a; chessPieces[m.to] = d; if (score > best) { best = score; opts = [m] } else if (score === best) opts.push(m) } chosen = opts[Math.floor(Math.random() * opts.length)] } else { let best = -Infinity, opts = []; for (const m of moves) { const a = chessPieces[m.from], d = chessPieces[m.to]; chessPieces[m.to] = a; chessPieces[m.from] = null; const s = minimax(chessPieces, chessGameMode === 'ranked' ? 2 : 1, -Infinity, Infinity, false); chessPieces[m.from] = a; chessPieces[m.to] = d; if (s > best) { best = s; opts = [m] } else if (s === best) opts.push(m) } chosen = opts[Math.floor(Math.random() * opts.length)] } applyMoveLocal(chosen) }, 450) }
function makeCode() { const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; for (let i = 0; i < 6; i++)s += chars[Math.floor(Math.random() * chars.length)]; return s }
async function connectFirebase() {
  if (firebaseConfig.apiKey === 'YOUR_API_KEY' || firebaseConfig.databaseURL.includes('YOUR_DATABASE')) { $('online-status').textContent = '請先編輯 js/firebase-config.js，填入 Firebase Console 的真實設定。'; return }
  try {
    const [appMod, authMod, dbMod] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
    ]);
    firebaseApi = { ...appMod, ...authMod, ...dbMod };
    app = firebaseApi.getApps().find(a => a.name === 'xiangqi-player-accounts') || firebaseApi.initializeApp(firebaseConfig, 'xiangqi-player-accounts'); auth = firebaseApi.getAuth(app); db = firebaseApi.getDatabase(app);
    // 優先使用本機持久登入，降低 iPhone 關閉瀏覽器後匿名 UID 改變的機率。
    // 若瀏覽器是私人瀏覽或使用者清除了網站資料，仍可能無法恢復原 UID。
    try { await firebaseApi.setPersistence(auth, firebaseApi.browserLocalPersistence) } catch (persistenceError) { console.warn('無法設定本機登入持久性，沿用 Firebase 預設設定', persistenceError) }
    // 先等待 Firebase 還原原本的匿名登入；不要每次重整都重新建立匿名帳號，否則無法認回原房間。
    let unsubscribeAuth;
    const existingUser = await new Promise(resolve => { unsubscribeAuth = firebaseApi.onAuthStateChanged(auth, u => { unsubscribeAuth?.(); resolve(u) }); });
    if (existingUser) user = existingUser;
    else user = (await firebaseApi.signInAnonymously(auth)).user;
    if (user && !user.isAnonymous) { try { const profileSnap = await firebaseApi.get(firebaseApi.ref(db, `users/${user.uid}/profile`)); const profile = profileSnap.val() || {}; if (profile.displayName) { playerDisplayName = String(profile.displayName).slice(0, 18); localStorage.setItem('xiangqi-nickname', playerDisplayName); if ($('player-nickname')) $('player-nickname').value = playerDisplayName; } } catch (e) { console.warn('無法載入帳號名稱', e) } }
    $('online-status').textContent = user && !user.isAnonymous ? `已登入：${playerDisplayName}，可以建立或加入房間。` : 'Firebase 已連線（訪客模式），可以建立或加入房間。';
    if (onlineMode) { initOnlinePublicRooms(); if (!inviteRoomCode) await restoreSavedRoom(); attemptAutoJoinInvite(); }
  } catch (e) { $('online-status').textContent = `Firebase 連線失敗：${explainFirebaseError(e, '連線')}`; console.error(e) }
}
function getNickname() {
  const input = $('player-nickname');
  const typed = (playerDisplayName !== '棋手' ? playerDisplayName : (input?.value || localStorage.getItem('xiangqi-nickname') || '棋手')).trim().replace(/[<>]/g, '').slice(0, 18);
  const name = typed || '棋手';
  localStorage.setItem('xiangqi-nickname', name);
  if (input) input.value = name;
  return name;
}
async function passwordDigest(password) {
  if (!password) return '';
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function saveActiveRoom(code, color) { localStorage.setItem('xiangqi-active-room', JSON.stringify({ code, color, uid: user?.uid || '', savedAt: Date.now() })); }
async function restoreSavedRoom() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem('xiangqi-active-room') || 'null') } catch { }
  if (!saved?.code || !user || !db) return false;
  try {
    const snap = await get(ref(db, `rooms/${saved.code}`));
    if (!snap.exists()) { localStorage.removeItem('xiangqi-active-room'); return false; }
    const room = snap.val();
    if (room.players?.red === user.uid) myColor = 'red';
    else if (room.players?.black === user.uid) myColor = 'black';
    else { localStorage.removeItem('xiangqi-active-room'); return false; }
    roomCode = saved.code; onlineMode = true;
    $('online-panel').hidden = false; $('chess-game-mode').value = 'pvp'; $('chess-game-mode').querySelector('option[value="pvp"]').textContent = '多人連線對戰'; $('chess-game-mode').disabled = true; $('chess-mode-title').textContent = '多人連線對戰'; $('chess-ai-level').style.display = 'none';
    if (room.playerNames?.[myColor] && $('player-nickname')) $('player-nickname').value = room.playerNames[myColor];
    enterRoom(saved.code);
    $('room-role').textContent = myColor === 'red' ? '你是紅方（先手）' : '你是黑方（後手）';
    $('room-waiting').textContent = '已恢復先前的對局，可以繼續下棋。';
    setStatus(`已恢復房間 ${saved.code}，你是${myColor === 'red' ? '紅方' : '黑方'}。`);
    return true;
  } catch (e) { console.warn('恢復房間失敗', e); return false; }
}
const ref = (...a) => firebaseApi.ref(...a), get = (...a) => firebaseApi.get(...a), set = (...a) => firebaseApi.set(...a), update = (...a) => firebaseApi.update(...a), remove = (...a) => firebaseApi.remove(...a), onValue = (...a) => firebaseApi.onValue(...a), runTransaction = (...a) => firebaseApi.runTransaction(...a), onDisconnect = (...a) => firebaseApi.onDisconnect(...a);

function escapeRoomText(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function formatRoomTime(value) { const n = Number(value); if (!Number.isFinite(n) || n <= 0) return '時間未知'; return new Date(n).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
function renderOnlinePublicRooms() {
  const list = $('online-public-rooms-list'); if (!list) return;
  const rooms = onlinePublicRoomsCache.filter(r => r.status === 'waiting').sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  if (!rooms.length) { list.innerHTML = '<p class="muted small">目前沒有等待中的公開房間。你可以建立公開房間，或輸入朋友提供的房號。</p>'; return; }
  list.innerHTML = rooms.map(r => `<article class="public-room-card"><div class="public-room-main"><strong class="room-code">${escapeRoomText(r.code)}</strong><span class="room-status">等待加入</span><span class="muted small">房主：${escapeRoomText(r.hostName || '棋手')}</span><span class="muted small">建立：${escapeRoomText(formatRoomTime(r.createdAt))}</span><span class="muted small">人數：${Number(r.playersCount || 1)}/2　${r.hasPassword ? '🔒 需要密碼' : '🔓 無密碼'}</span></div><div><button class="room-join-link online-room-join-btn" type="button" data-room-code="${escapeRoomText(r.code)}" data-room-password="${r.hasPassword ? '1' : '0'}">加入房間</button></div></article>`).join('');
}
function initOnlinePublicRooms() {
  const status = $('online-public-rooms-status'); if (!status || !db || !firebaseApi) return;
  if (publicRoomsUnsubscribe) publicRoomsUnsubscribe();
  status.textContent = '正在讀取公開房間…';
  publicRoomsUnsubscribe = onValue(ref(db, 'publicRooms'), snap => {
    const value = snap.val() || {};
    onlinePublicRoomsCache = Object.entries(value).map(([code, r]) => ({ ...r, code: r.code || code }));
    const waiting = onlinePublicRoomsCache.filter(r => r.status === 'waiting').length;
    status.textContent = `公開房間 ${waiting} 間等待加入`;
    renderOnlinePublicRooms();
  }, error => {
    console.error('公開房間列表讀取失敗', error);
    status.textContent = error?.code === 'PERMISSION_DENIED' || String(error?.code || '').includes('permission-denied')
      ? '載入失敗：Permission denied。請確認 Firebase Rules 的 publicRooms「父節點」有 .read: "auth != null"，並已按 Publish。'
      : `公開列表載入失敗：${error?.message || error}`;
    const list = $('online-public-rooms-list'); if (list) list.innerHTML = '<p class="muted small">目前無法讀取公開房間；你仍可使用房號加入。</p>';
  });
}

function explainFirebaseError(e, action) {
  const code = e?.code || '';
  if (code.includes('permission-denied')) return 'Firebase 拒絕存取：請確認 Realtime Database Rules 已發布，且允許已匿名登入的玩家讀寫房間。';
  if (code.includes('unauthorized-domain')) return '目前網站網域未被 Firebase 授權。請到 Authentication → Settings → Authorized domains，加入你的 GitHub Pages 網域（例如 hugar67.github.io）。';
  if (code.includes('operation-not-allowed')) return 'Firebase 尚未啟用匿名登入。請到 Authentication → Sign-in method，啟用 Anonymous。';
  if (code.includes('network-request-failed')) return '網路連線失敗，請確認網路正常，並從 HTTPS 的 GitHub Pages 網址開啟網站，不要直接用 file:// 開啟。';
  if (code.includes('app/no-options') || code.includes('invalid-api-key')) return 'Firebase 設定不正確：請檢查 js/firebase-config.js 是否完整貼上 Firebase Web App 設定。';
  return `${action}失敗：${e?.message || code || '未知錯誤'}（${code || '沒有錯誤代碼'}）`;
}
function showRoomAlert(title, message) {
  setStatus(`${title}：${message}`);
  window.alert(`${title}\n\n${message}`);
}
async function createRoom() {
  if (!user || !db) {
    const msg = 'Firebase 尚未完成連線。請確認 js/firebase-config.js 已填入正確設定，並已啟用匿名登入及發布資料庫規則。';
    showRoomAlert('無法建立房間', msg); return;
  }
  const btn = $('create-room-btn'); btn.disabled = true; btn.textContent = '正在建立…';
  try {
    let code = makeCode();
    for (let tries = 0; tries < 8; tries++) {
      const existing = await get(ref(db, `rooms/${code}`));
      if (!existing.exists()) break;
      code = makeCode();
      if (tries === 7) throw new Error('無法產生新的房間代碼，請再試一次。');
    }
    const nickname = getNickname();
    const passwordHash = await passwordDigest($('room-password-input')?.value || '');
    const visibility = $('room-visibility-select')?.value || 'public';
    const data = { createdAt: Date.now(), players: { red: user.uid, black: null }, playerNames: { red: nickname, black: null }, settings: { visibility, hasPassword: !!passwordHash, passwordHash }, board: initialBoard(), turn: 'red', status: 'waiting', lastMove: null, moveCount: 0 };
    await set(ref(db, `rooms/${code}`), data);
    roomCode = code; myColor = 'red'; saveActiveRoom(code, 'red'); renderBoard(); enterRoom(code);
    let publicIndexFailed = false;
    if (visibility === 'public') {
      try { await set(ref(db, `publicRooms/${code}`), { code, hostName: nickname, hostUid: user.uid, createdAt: data.createdAt, status: 'waiting', playersCount: 1, hasPassword: !!passwordHash }); }
      catch (indexError) { publicIndexFailed = true; console.warn('公開房間索引寫入失敗，需設定 publicRooms 規則', indexError); }
    }
    $('room-role').textContent = '你是紅方（先手）';
    $('room-waiting').textContent = publicIndexFailed ? '房間已建立，但未登上公開列表；請依 README 合併 publicRooms 規則。' : '房間建立成功！請把代碼傳給朋友，等待黑方加入。';
    setStatus(`房間 ${code} 已建立，等待另一位玩家加入。`);
    window.alert(`房間建立成功！\n\n房間代碼：${code}\n玩家暱稱：${nickname}\n房間類型：${visibility === 'public' ? '公開' : '私人'}\n密碼保護：${passwordHash ? '有' : '無'}\n${publicIndexFailed ? '\n注意：公開列表規則尚未設定，房間目前無法顯示在大廳。' : ''}\n\n請把代碼傳給朋友加入。`);
  } catch (e) { console.error(e); showRoomAlert('建立房間失敗', explainFirebaseError(e, '建立房間')); }
  finally { if (!roomCode) { btn.disabled = false; btn.textContent = '建立房間'; } }
}
async function joinRoom() {
  if (!user || !db) {
    showRoomAlert('無法加入房間', 'Firebase 尚未完成連線。請確認 Firebase 設定、匿名登入及資料庫規則。'); return;
  }
  const code = $('room-code-input').value.trim().toUpperCase();
  if (!code) { showRoomAlert('無法加入房間', '請先輸入朋友提供的 6 碼房間代碼。'); return; }
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) {
    showRoomAlert('房間代碼格式錯誤', '代碼必須是 6 個英文字母或數字；為避免混淆，不使用 I、O、0、1。請確認是否輸入錯誤。'); return;
  }
  const btn = $('join-room-btn'); btn.disabled = true; btn.textContent = '正在加入…';
  try {
    const r = ref(db, `rooms/${code}`);
    // 先讀取以便提供清楚的錯誤原因；再用 transaction 防止兩人同時搶入同一個位置。
    const before = await get(r);
    if (!before.exists()) {
      showRoomAlert('加入房間失敗', `代碼 ${code} 無效：找不到這個房間。請確認代碼，或請房主重新建立房間。`); return;
    }
    const old = before.val();
    if (old.players?.red === user.uid || old.players?.black === user.uid) {
      myColor = old.players?.red === user.uid ? 'red' : 'black'; roomCode = code; saveActiveRoom(code, myColor); enterRoom(code);
      $('room-role').textContent = myColor === 'red' ? '你是紅方（先手）' : '你是黑方（後手）';
      $('room-waiting').textContent = '已重新連回你原本的座位。'; return;
    }
    if (old.settings?.passwordHash) {
      const provided = await passwordDigest($('room-password-input')?.value || '');
      if (!provided) { showRoomAlert('此房間需要密碼', '請在「房間密碼」欄位輸入房主提供的密碼，再按加入房間。'); return; }
      if (provided !== old.settings.passwordHash) { showRoomAlert('房間密碼錯誤', '請確認密碼後再試一次。'); return; }
    }
    if (old.players?.red && old.players?.black) {
      showRoomAlert('房間已滿', `代碼 ${code} 已經有兩位玩家使用，無法再加入。請請房主建立新房間。`); return;
    }
    if (old.status !== 'waiting') {
      showRoomAlert('無法加入房間', '這個房間已經開始或已結束，不能再加入。請使用新的房間代碼。'); return;
    }
    let failureReason = '';
    const result = await runTransaction(r, room => {
      // Realtime Database transaction updater may first receive local null even after get() succeeded.
      // Use the just-read snapshot as a fallback so this cache miss does not falsely reject a valid room.
      if (!room) room = { ...old, players: { ...(old.players || {}) } };
      if (room.players?.red === user.uid || room.players?.black === user.uid) { failureReason = '你已經在這個房間內。'; return; }
      if (room.status !== 'waiting') { failureReason = '這個房間已經開始或結束。'; return; }
      if (room.players?.red && room.players?.black) { failureReason = '此代碼已經有兩個人使用，房間已滿。'; return; }
      if (!room.players?.red) { failureReason = '房間資料不完整，缺少紅方玩家。請房主重新建立房間。'; return; }
      room.players.black = user.uid; room.playerNames = room.playerNames || {}; room.playerNames.black = getNickname(); room.status = 'playing'; return room;
    });
    if (!result.committed) {
      const msg = failureReason || '房間狀態剛剛改變，可能另一位玩家已先加入。請重新確認代碼或請房主建立新房間。';
      showRoomAlert('加入房間失敗', msg); return;
    }
    roomCode = code; myColor = 'black'; saveActiveRoom(code, 'black'); renderBoard(); enterRoom(code);
    if (old.settings?.visibility === 'public') update(ref(db, `publicRooms/${code}`), { status: 'playing', playersCount: 2, blackUid: user.uid }).catch(e => console.warn('公開列表同步失敗', e));
    $('room-role').textContent = '你是黑方（後手）';
    $('room-waiting').textContent = '已成功加入房間，開始對弈！';
    setStatus(`已加入房間 ${code}，你是黑方。`);
    window.alert(`加入房間成功！\n\n房間代碼：${code}\n你的角色：黑方（後手）`);
  } catch (e) { console.error(e); showRoomAlert('加入房間失敗', explainFirebaseError(e, '加入房間')); }
  finally { if (!roomCode) { btn.disabled = false; btn.textContent = '加入房間'; } }
}

function exitRoomLocally(message = '已離開房間。') {
  if (opponentDisconnectTimer) { clearTimeout(opponentDisconnectTimer); opponentDisconnectTimer = null; }
  if (roomNoticeUnsubscribe) { roomNoticeUnsubscribe(); roomNoticeUnsubscribe = null; }
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  if (publicRoomsUnsubscribe) { publicRoomsUnsubscribe(); publicRoomsUnsubscribe = null; }
  localStorage.removeItem('xiangqi-active-room');
  roomCode = null; myColor = null; onlineReady = false;
  $('room-info').hidden = true;
  $('create-room-btn').disabled = false; $('create-room-btn').textContent = '建立房間';
  $('join-room-btn').disabled = false; $('join-room-btn').textContent = '加入房間';
  $('room-code-input').disabled = false; $('room-code-input').value = ''; $('room-password-input').value = '';
  $('room-role').textContent = ''; $('room-waiting').textContent = '';
  $('online-status').textContent = message;
  setStatus(message);
}

async function leaveRoom() {
  if (!roomCode || !db || !user) {
    $('room-info').hidden = true;
    localStorage.removeItem('xiangqi-active-room');
    return;
  }

  const code = roomCode;
  const roomRef = ref(db, `rooms/${code}`);
  let roomSnap;
  try { roomSnap = await get(roomRef); } catch (e) { showRoomAlert('離開房間失敗', explainFirebaseError(e, '讀取房間')); return; }
  const room = roomSnap.val();
  if (!roomSnap.exists()) {
    exitRoomLocally('房間已結束，已返回連線大廳。'); onlineMode = true; return;
  }
  const moveCount = Number(room.moveCount || 0);
  const formalGame = room.status === 'playing' && moveCount > 5;
  const prompt = formalGame
    ? `目前已走 ${moveCount} 步。確定離開嗎？離開將直接判定你認輸，對手獲勝。`
    : `目前已走 ${moveCount} 步（未超過 5 步）。確定離開房間？這次不會判定勝負。`;
  if (!window.confirm(prompt)) return;

  const btn = $('leave-room-btn');
  if (btn) { btn.disabled = true; btn.textContent = '正在處理離開…'; }
  try {
    const otherColor = myColor === 'red' ? 'black' : 'red';
    if (formalGame) {
      // 先將自己的 presence 標記為離線，再將本局結束為認輸。
      // Firebase Rules 也會檢查離線狀態，避免任意替對手判勝。
      await set(ref(db, `rooms/${code}/presence/${myColor}`), { online: false, lastSeen: Date.now(), uid: user.uid });
      const winnerName = room.playerNames?.[otherColor] || (otherColor === 'red' ? '紅方' : '黑方');
      const loserName = room.playerNames?.[myColor] || (myColor === 'red' ? '紅方' : '黑方');
      const finishedAt = Date.now(); await update(roomRef, { status: 'finished', winner: otherColor, reason: '對手因退出遊戲而認輸，己方獲得勝利。', winnerName, loserName, finishedAt });
      await savePlayerMatch({ matchId: `online_${code}_${finishedAt}_${otherColor}`, mode: 'online', result: 'loss', winner: otherColor, reason: '你因退出遊戲而被判定認輸。', finishedAt, moveCount, opponentName: winnerName, roomCode: code });
      exitRoomLocally('你已認輸並離開房間。'); onlineMode = true;
      return;
    }

    // 前 5 步可自由離開，不判勝負；通知對方後清除尚未正式開始的對局。
    await set(ref(db, `roomNotices/${code}`), {
      id: `${user.uid}_${Date.now()}`,
      type: 'player-left',
      senderUid: user.uid,
      senderColor: myColor,
      senderName: room.playerNames?.[myColor] || localStorage.getItem('xiangqi-nickname') || '對手',
      createdAt: Date.now()
    });
    await new Promise(resolve => setTimeout(resolve, 500));
    if (room.settings?.visibility === 'public') await remove(ref(db, `publicRooms/${code}`));
    await remove(roomRef);
    exitRoomLocally('你已離開房間，未判定勝負。'); onlineMode = true;
  } catch (e) {
    console.error('離開房間失敗', e);
    showRoomAlert('離開房間失敗', `${explainFirebaseError(e, '離開房間')}\n如果是權限錯誤，請確認已發布本次附上的 Firebase Rules。`);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🚪 離開房間'; }
  }
}
function enterRoom(code) {
  roomCode = code; saveActiveRoom(code, myColor);
  $('room-info').hidden = false;
  $('room-code-display').textContent = code;
  $('create-room-btn').disabled = true;
  $('join-room-btn').disabled = true;
  $('room-code-input').disabled = true;
  onlineReady = true;
  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = onValue(ref(db, `rooms/${code}`), snap => {
    const room = snap.val();
    if (!room) { exitRoomLocally('房間已結束或不存在，已返回連線大廳。'); onlineMode = true; return; }
    if (room.players?.red === user.uid) myColor = 'red';
    else if (room.players?.black === user.uid) myColor = 'black';
    else { setStatus('你不是此房間的玩家'); onlineReady = false; return; }

    currentPlayerNames = { red: room.playerNames?.red || '紅方', black: room.playerNames?.black || '黑方' };
    const ownName = room.playerNames?.[myColor] || localStorage.getItem('xiangqi-nickname') || '棋手';
    const otherColor = myColor === 'red' ? 'black' : 'red';
    const otherLabel = otherColor === 'red' ? '紅方' : '黑方';
    const redName = room.playerNames?.red || '等待玩家';
    const blackName = room.playerNames?.black || '等待玩家';
    const playersDisplay = $('room-players-display');
    if (playersDisplay) playersDisplay.textContent = `🔴 紅方：${redName}　｜　⚫ 黑方：${blackName}`;
    if ($('player-nickname') && room.playerNames?.[myColor]) $('player-nickname').value = room.playerNames[myColor];
    if (room.settings?.visibility === 'public') update(ref(db, `publicRooms/${code}`), { status: room.status || 'waiting', playersCount: room.players?.black ? 2 : 1, ...(room.players?.black ? { blackUid: room.players.black } : {}) }).catch(() => { });
    const otherPresence = room.presence?.[otherColor];
    let presenceText;
    if (otherPresence?.online === true) presenceText = `🟢 ${otherLabel}：在線上`;
    else if (otherPresence?.online === false) presenceText = `⚪ ${otherLabel}：已離線`;
    else presenceText = `🟡 ${otherLabel}：尚未確認連線`;
    const presenceEl = $('opponent-presence');
    if (presenceEl) presenceEl.textContent = presenceText;

    // 關閉網頁時 onDisconnect 會把玩家 presence 設為離線。等待 12 秒，
    // 避免短暫斷線／重新整理時立刻判負；正式對局達 5 步才判定退出認輸。
    if (opponentDisconnectTimer) { clearTimeout(opponentDisconnectTimer); opponentDisconnectTimer = null; }
    if (room.status === 'playing' && Number(room.moveCount || 0) > 5 && otherPresence?.online === false && room.players?.[myColor] === user.uid) {
      const disconnectKey = `${code}:${otherColor}:${Number(room.moveCount || 0)}`;
      if (disconnectHandledRoom !== disconnectKey) {
        opponentDisconnectTimer = setTimeout(async () => {
          try {
            const latestSnap = await get(ref(db, `rooms/${code}`));
            const latest = latestSnap.val();
            if (!latestSnap.exists() || latest.status !== 'playing' || Number(latest.moveCount || 0) <= 5 || latest.presence?.[otherColor]?.online !== false || latest.players?.[myColor] !== user.uid) return;
            disconnectHandledRoom = disconnectKey;
            const winnerName = latest.playerNames?.[myColor] || (myColor === 'red' ? '紅方' : '黑方');
            const loserName = latest.playerNames?.[otherColor] || (otherColor === 'red' ? '紅方' : '黑方');
            await update(ref(db, `rooms/${code}`), { status: 'finished', winner: myColor, reason: '對手因退出遊戲而認輸，己方獲得勝利。', winnerName, loserName, finishedAt: Date.now() });
          } catch (e) { console.error('處理對手離線判負失敗', e); setStatus('對手已離線，但判定勝負失敗；請確認 Firebase Rules 已更新。'); }
        }, 12000);
      }
    }

    if (room.status === 'waiting') $('room-waiting').textContent = '等待黑方玩家加入…';
    else if (room.status === 'playing') $('room-waiting').textContent = '對局進行中';
    else if (room.status === 'finished') $('room-waiting').textContent = '本局已結束';
    else if (room.status === 'closed') $('room-waiting').textContent = '房間已關閉';
    if (room.board) {
      applyingRemote = true;
      const moveCount = Number(room.moveCount || 0);
      if (moveCount !== lastSeenMoveCount) { isBannerDismissed = false; lastSeenMoveCount = moveCount; }
      chessPieces = Array.from({ length: 90 }, (_, i) => room.board?.[i] ?? null);
      chessTurn = room.turn || 'red'; lastMove = room.lastMove || null;
      chessGameOver = room.status === 'finished'; chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = [];
      renderBoard(); updateStatus(); applyingRemote = false;
    }
    if (room.status === 'finished' && opponentDisconnectTimer) { clearTimeout(opponentDisconnectTimer); opponentDisconnectTimer = null; }
    if (room.status === 'finished' && room.winner && myColor) { const resultKey = `online_${code}_${Number(room.finishedAt || room.moveCount || 0)}_${room.winner}`; savePlayerMatch({ matchId: resultKey, mode: 'online', result: room.winner === myColor ? 'win' : 'loss', winner: room.winner, reason: room.reason || '', finishedAt: Number(room.finishedAt || Date.now()), moveCount: Number(room.moveCount || 0), opponentName: room.playerNames?.[myColor === 'red' ? 'black' : 'red'] || '對手', roomCode: code }); }
    if (room.status === 'finished' && room.winner && $('win-modal').hidden) {
      currentPlayerNames = { red: room.playerNames?.red || '紅方', black: room.playerNames?.black || '黑方' };
      setResultStamp(room.winner === myColor);
      if (String(room.reason || '').includes('退出遊戲') && room.winner === myColor) {
        $('winner-message').textContent = '己方獲得勝利';
        $('winner-reason').textContent = '對手因退出遊戲而認輸。';
      } else if (String(room.reason || '').includes('退出遊戲') && room.winner !== myColor) {
        $('winner-message').textContent = '你已認輸';
        $('winner-reason').textContent = '你因退出遊戲而被判定認輸。';
      } else {
        $('winner-message').textContent = room.winnerName && room.loserName ? `${room.winnerName} 打敗了 ${room.loserName}` : winnerMessage(room.winner);
        $('winner-reason').textContent = room.reason || '';
      }
      configureFinishedModal('finished'); showModal('win-modal');
    }
  }, error => {
    console.error('房間即時監聽失敗', error);
    setStatus(`房間同步失敗：${explainFirebaseError(error, '讀取房間')}`);
  });
  if (roomNoticeUnsubscribe) { roomNoticeUnsubscribe(); roomNoticeUnsubscribe = null; }
  roomNoticeUnsubscribe = onValue(ref(db, `roomNotices/${code}`), snap => {
    const notice = snap.val();
    if (!notice || notice.id === lastRoomNoticeId) return;
    lastRoomNoticeId = notice.id || '';
    if (notice.type === 'player-left' && notice.senderUid !== user?.uid) {
      const name = notice.senderName || '對手';
      window.alert(`對手已離開房間\n\n${name} 已離開，本局結束。你將返回連線大廳。`);
      exitRoomLocally(`${name} 已離開，本局結束。你已返回連線大廳。`);
      onlineMode = true; chessGameOver = true; chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = []; renderBoard();
    } else if (notice.type === 'rematch-request' && notice.senderUid !== user?.uid && chessGameOver) {
      rematchPromptOpen = true; configureFinishedModal('incoming'); showModal('win-modal');
    } else if (notice.type === 'rematch-agreed') {
      rematchPromptOpen = false;
      $('rematch-status').textContent = '對方同意再玩一局，正在準備新棋盤…';
      resetRoomForRematch().catch(e => showRoomAlert('重新開始失敗', `無法重新開始：${e.message}`));
    } else if (notice.type === 'rematch-declined') {
      if (notice.senderUid !== user?.uid) { window.alert('對方不再繼續對局，房間即將關閉。'); closeFinishedRoom(code, '對局已結束，房間已關閉。').catch(console.error); }
    } else if (notice.type === 'rematch-started') {
      currentGameId = 'single_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); chessPieces = initialBoard(); chessTurn = 'red'; chessGameOver = false; chessSelectedIdx = -1; chessValidMoves = []; chessDangerMoves = []; lastMove = null; moveHistory = []; isBannerDismissed = false; lastSeenMoveCount = 0; rematchResetStarted = false; disconnectHandledRoom = ''; hideModal('win-modal'); $('result-stamp').hidden = true; $('result-stamp').classList.remove('stamp-win', 'stamp-loss'); renderBoard(); updateStatus(); $('room-waiting').textContent = '新的一局開始！';
    }
  }, error => console.warn('房間通知讀取失敗', error));

  // 重要：玩家離線時絕不能刪除整個房間或公開列表。iPhone 關閉 Safari、切換網路、
  // 短暫斷線都會觸發 onDisconnect；只更新自己的 presence，保留棋盤與房間供對手重連／觀戰。
  const myPresenceRef = ref(db, `rooms/${code}/presence/${myColor}`);
  onValue(ref(db, '.info/connected'), async snap => {
    if (snap.val() !== true || !user || !myColor || roomCode !== code) return;
    try {
      // 清掉目前連線上可能殘留的舊版「斷線刪除整個房間」設定，絕不再讓斷線刪除房間。
      await onDisconnect(ref(db, `rooms/${code}`)).cancel();
      await onDisconnect(ref(db, `publicRooms/${code}`)).cancel();
      await onDisconnect(myPresenceRef).set({ online: false, lastSeen: Date.now(), uid: user.uid });
      await set(myPresenceRef, { online: true, lastSeen: Date.now(), uid: user.uid });
    } catch (error) {
      console.error('設定離線狀態失敗', error);
      const el = $('opponent-presence');
      if (el) el.textContent = '⚠️ 離線狀態更新失敗，請檢查 Firebase Rules';
    }
  });
}
async function sendMove() { if (!roomCode || !db || !user) return; const roomRef = ref(db, `rooms/${roomCode}`); try { const result = await runTransaction(roomRef, room => { if (!room || room.status !== 'playing' || room.players?.[myColor] !== user.uid || room.turn !== myColor) return; room.board = chessPieces; room.turn = chessTurn; room.lastMove = lastMove; room.moveCount = (room.moveCount || 0) + 1; return room }); if (!result.committed) setStatus('棋步未同步：可能已輪到對方或連線規則拒絕寫入') } catch (e) { setStatus(`同步失敗：${e.message}`) } }
async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); const ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error('瀏覽器不允許自動複製'); return true;
}
function makeInviteUrl(code) { const current = new URL(location.href); const testKey = current.searchParams.get('key'); const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('mode', 'online'); url.searchParams.set('room', code); if (testKey === 'ji32k7au4a83') url.searchParams.set('key', testKey); return url.href; }
function attemptAutoJoinInvite() {
  if (!onlineMode || !inviteRoomCode || autoJoinAttempted || !user || !db) return;
  autoJoinAttempted = true;
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(inviteRoomCode)) { $('online-status').textContent = '邀請網址中的房間代碼格式不正確，請向房主索取新連結。'; return; }
  $('room-code-input').value = inviteRoomCode;
  $('online-status').textContent = `正在加入房間 ${inviteRoomCode}…`;
  joinRoom();
}
$('online-refresh-rooms-btn')?.addEventListener('click', () => {
  if (!db || !firebaseApi) { const st = $('online-public-rooms-status'); if (st) st.textContent = 'Firebase 尚未連線。'; return; }
  firebaseApi.get(ref(db, 'publicRooms')).then(snap => {
    const value = snap.val() || {}; onlinePublicRoomsCache = Object.entries(value).map(([code, r]) => ({ ...r, code: r.code || code }));
    const st = $('online-public-rooms-status'); if (st) st.textContent = `公開房間 ${onlinePublicRoomsCache.filter(r => r.status === 'waiting').length} 間等待加入`;
    renderOnlinePublicRooms();
  }).catch(e => { const st = $('online-public-rooms-status'); if (st) st.textContent = `載入失敗：${e?.code || e?.message || e}`; });
});
$('online-public-rooms-list')?.addEventListener('click', async e => {
  const btn = e.target.closest('.online-room-join-btn'); if (!btn) return;
  const code = btn.dataset.roomCode || '';
  $('room-code-input').value = code;
  if (btn.dataset.roomPassword === '1') {
    const password = window.prompt(`房間 ${code} 需要密碼，請輸入房主提供的密碼：`);
    if (password === null) return;
    $('room-password-input').value = password;
  } else $('room-password-input').value = '';
  $('online-status').textContent = `正在加入公開房間 ${code}…`;
  await joinRoom();
});
$('create-room-btn').addEventListener('click', createRoom); $('join-room-btn').addEventListener('click', joinRoom); $('leave-room-btn')?.addEventListener('click', leaveRoom);
if ($('player-nickname')) { $('player-nickname').value = localStorage.getItem('xiangqi-nickname') || ''; $('player-nickname').addEventListener('change', getNickname); }
if ($('room-code-input')) $('room-code-input').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6) });
$('copy-room-btn').addEventListener('click', async () => { if (!roomCode) return; try { await copyText(roomCode); $('room-waiting').textContent = '✅ 已複製房間代碼！傳給朋友即可加入。' } catch { $('room-waiting').textContent = `複製失敗，請手動複製代碼：${roomCode}` } });
$('copy-invite-btn').addEventListener('click', async () => { if (!roomCode) return; const url = makeInviteUrl(roomCode); try { await copyText(url); $('room-waiting').textContent = '✅ 已複製邀請網址！傳給朋友，對方開啟後會自動嘗試加入。' } catch { $('room-waiting').textContent = `無法自動複製，請手動複製此網址：${url}`; window.prompt('請複製這個邀請網址：', url) } });
// Shared player account UI on chess.html (uses the same Firebase Auth app as the lobby).
function accountEsc(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) }
function accountSetStatus(msg, isError = false) { const n = $('account-status'); if (n) { n.textContent = msg || ''; n.classList.toggle('is-error', !!isError) } }
function accountValidEmail(value) { const e = String(value || '').trim(); return e.length <= 254 && !/\s/.test(e) && /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(e) }
const RANKED_START = 1000;
function ratingTier(r) { return r >= 1800 ? '宗師' : r >= 1600 ? '大師' : r >= 1400 ? '菁英' : r >= 1200 ? '高手' : r >= 1000 ? '進階' : '新手' }
async function loadRankedRating() { const node = $('ranked-rating'); if (!node) return; if (!user || user.isAnonymous || !db || !firebaseApi) { node.textContent = '登入後查看'; return } try { const snap = await get(ref(db, `users/${user.uid}/ranked`)); node.textContent = Number(snap.val()?.rating || RANKED_START) } catch { node.textContent = '—' } }
async function recordRankedResult(result, quality, moveCount) { if (!user || user.isAnonymous || !db || !firebaseApi) { accountSetStatus('排位賽不會記錄：請先登入帳號再開始排位對戰。', true); return } try { const uid = user.uid; const profileSnap = await get(ref(db, `users/${uid}/profile`)); const profile = profileSnap.val() || {}; if (!profile.displayName) { accountSetStatus('帳號名稱尚未載入，請重新整理後再開始排位賽。', true); return } const oldSnap = await get(ref(db, `users/${uid}/ranked`)); const old = oldSnap.val() || {}; const rating = Number(old.rating || RANKED_START); const skillBonus = Math.max(0, Math.min(12, Math.round(Number(quality || 0) / Math.max(1, moveCount / 12)))); const delta = result === 'win' ? 20 + skillBonus : result === 'loss' ? -(12 + Math.min(8, skillBonus)) : 4 + Math.min(6, skillBonus); const next = Math.max(0, rating + delta); const stats = old.stats || {}; const nextStats = { played: Number(stats.played || 0) + 1, wins: Number(stats.wins || 0) + (result === 'win' ? 1 : 0), losses: Number(stats.losses || 0) + (result === 'loss' ? 1 : 0), draws: Number(stats.draws || 0) + (result === 'draw' ? 1 : 0) }; const data = { uid, displayName: profile.displayName, rating: next, tier: ratingTier(next), delta, lastResult: result, skillBonus, stats: nextStats, updatedAt: Date.now() }; await set(ref(db, `users/${uid}/ranked`), data); await set(ref(db, `rankedLeaderboard/${uid}`), data); $('ranked-rating').textContent = next; accountSetStatus(`排位結果已記錄：${delta >= 0 ? '+' : ''}${delta} 分（技術加成 +${skillBonus}），目前 ${next} 分。`); } catch (e) { accountSetStatus(`排位積分保存失敗：${e.message || e}。請更新 Firebase Rules。`, true) } }
async function showRankedLeaderboard() { const box = $('ranked-leaderboard'); box.hidden = false; box.innerHTML = '<p>排行榜載入中…</p>'; if (!db || !firebaseApi) { box.innerHTML = '<p>目前無法連線 Firebase。</p>'; return } try { const snap = await get(ref(db, 'rankedLeaderboard')); const rows = Object.values(snap.val() || {}).sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0)).slice(0, 10); box.innerHTML = rows.length ? rows.map((r, i) => `<div class="ranked-row"><span><b>#${i + 1}</b>　${accountEsc(r.displayName || '棋手')} <small>· ${accountEsc(r.tier || ratingTier(Number(r.rating || 1000)))}</small></span><strong>${Number(r.rating || 1000)} 分</strong></div>`).join('') : '<p>排行榜還沒有紀錄，登入後完成排位賽即可上榜。</p>' } catch (e) { box.innerHTML = `<p>讀取排行榜失敗：${accountEsc(e.message || e)}。請檢查 Firebase Rules。</p>` } }
$('ranked-leaderboard-btn')?.addEventListener('click', showRankedLeaderboard);
function accountCleanName(v) { return String(v || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 18) }
let chessAccountProfile = null, chessAccountListenerStarted = false, chessAccountInitPromise = null;
let rankedAuthPromptShown = false;
function chessAccountInit() { if (!chessAccountInitPromise) chessAccountInitPromise = performChessAccountInit().catch(error => { chessAccountInitPromise = null; throw error }); return chessAccountInitPromise; }
async function ensureRankedAccount() { await chessAccountInit(); if (user && !user.isAnonymous) { if ($('account-modal')) $('account-modal').hidden = true; rankedAuthPromptShown = false; await loadRankedRating(); return true; } if (!rankedAuthPromptShown) { rankedAuthPromptShown = true; const modal = $('account-modal'); if (modal && modal.hidden) { accountSetStatus('積分排位賽需要登入帳號，才能保存積分並登上排行榜。', true); modal.hidden = false; } } return false; }
function paintChessAccount(userNow = user) { const b = $('account-open-btn'); if (!b) return; const signed = !!userNow && !userNow.isAnonymous; const name = chessAccountProfile?.displayName; b.textContent = signed ? (name || '我的棋手帳號') : '登入／註冊'; b.title = signed ? '查看個人資料與對戰紀錄' : '登入或建立棋手帳號'; if ($('account-auth-fields')) $('account-auth-fields').hidden = signed; if ($('account-profile-area')) $('account-profile-area').hidden = !signed; for (const id of ['account-email', 'account-password', 'account-username']) { const el = $(id); if (el) el.hidden = id === 'account-username' || signed; const label = document.querySelector(`label[for="${id}"]`); if (label) label.hidden = id === 'account-username' || signed; } if ($('account-name-label')) $('account-name-label').hidden = true; if ($('account-auth-actions')) $('account-auth-actions').hidden = signed; if ($('account-register-btn')) $('account-register-btn').hidden = signed; if ($('account-setup-save-btn')) $('account-setup-save-btn').hidden = true; if ($('account-close-btn')) $('account-close-btn').hidden = false; if ($('account-modal-title')) $('account-modal-title').textContent = signed ? '👤 我的棋手帳號' : '👤 登入／註冊'; if ($('account-subtitle')) $('account-subtitle').textContent = signed ? '你的對戰紀錄會跟著帳號保存。' : '登入帳號以查看對戰紀錄；尚未註冊請使用下方註冊連結。'; if (signed && name) { $('account-profile-name').textContent = name; $('account-edit-name').value = name; } }
async function loadChessAccountMatches() {
  if (!user || user.isAnonymous || !db || !firebaseApi) return;
  try {
    const snap = await get(ref(db, `users/${user.uid}/matches`));
    const matches = Object.entries(snap.val() || {})
      .map(([id, value]) => ({ id, ...value }))
      .sort((a, b) => Number(b.finishedAt || 0) - Number(a.finishedAt || 0));

    function renderMatches(items, prefix, emptyMessage) {
      const stats = { played: items.length, wins: 0, losses: 0, draws: 0 };
      items.forEach(match => {
        if (match.result === 'win') stats.wins++;
        else if (match.result === 'loss') stats.losses++;
        else stats.draws++;
      });

      const playedNode = $(`account-${prefix}-played`);
      const winsNode = $(`account-${prefix}-wins`);
      const lossesNode = $(`account-${prefix}-losses`);
      const drawsNode = $(`account-${prefix}-draws`);
      const listNode = $(`account-${prefix}-match-list`);
      if (!playedNode || !winsNode || !lossesNode || !drawsNode || !listNode) return;

      playedNode.textContent = stats.played;
      winsNode.textContent = stats.wins;
      lossesNode.textContent = stats.losses;
      drawsNode.textContent = stats.draws;

      if (items.length === 0) {
        listNode.innerHTML = `<p class="muted small">${accountEsc(emptyMessage)}</p>`;
        return;
      }

      listNode.innerHTML = items.slice(0, 12).map(match => {
        const resultText = match.result === 'win' ? '勝利' : match.result === 'loss' ? '失敗' : '平手';
        const resultClass = match.result === 'win' ? 'match-win' : match.result === 'loss' ? 'match-loss' : 'match-draw';
        const level = match.aiLevel === 'easy' ? '初級' : match.aiLevel === 'medium' ? '中級' : '高級';
        const title = prefix === 'ai' ? `AI 對戰（${level}）` : '多人連線對戰';
        const finishedAt = accountEsc(new Date(Number(match.finishedAt || 0)).toLocaleString('zh-TW'));
        const moveCount = Number(match.moveCount || 0);
        const opponent = match.opponentName ? `<span class="muted small">對手：${accountEsc(match.opponentName)}</span>` : '';
        const room = match.roomCode ? `<span class="muted small">房號：${accountEsc(match.roomCode)}</span>` : '';
        return `<article class="account-match-row"><div><strong>${accountEsc(title)}</strong><span class="muted small">${finishedAt} · ${moveCount} 步</span>${opponent}${room}</div><b class="${resultClass}">${resultText}</b></article>`;
      }).join('');
    }

    renderMatches(matches.filter(match => match.mode === 'pve'), 'ai', '還沒有 AI 對戰紀錄。完成一場 AI 對局後會顯示在這裡。');
    renderMatches(matches.filter(match => match.mode === 'online'), 'online', '還沒有連線對打紀錄。完成一場多人連線對局後會顯示在這裡。');
  } catch (error) {
    accountSetStatus(`讀取戰績失敗：${error.message || error}，請確認 Firebase Rules。`, true);
  }
}
async function performChessAccountInit() {
  try {
    if (!firebaseApi) {
      const [appM, authM, dbM] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js')
      ]);
      firebaseApi = { ...appM, ...authM, ...dbM };
      app = firebaseApi.getApps().find(a => a.name === 'xiangqi-player-accounts') ||
        firebaseApi.initializeApp(firebaseConfig, 'xiangqi-player-accounts');
      auth = firebaseApi.getAuth(app);
      db = firebaseApi.getDatabase(app);
    }

    // Wait until Firebase has restored the persisted login state.
    const current = await new Promise(resolve => {
      let unsubscribe = () => { };
      unsubscribe = firebaseApi.onAuthStateChanged(auth, account => {
        unsubscribe();
        resolve(account);
      });
    });
    user = current;

    const syncProfile = async account => {
      chessAccountProfile = null;
      if (!account || account.isAnonymous) return;
      const snapshot = await firebaseApi.get(firebaseApi.ref(db, `users/${account.uid}/profile`));
      chessAccountProfile = snapshot.val() || null;
      let savedName = accountCleanName(chessAccountProfile?.displayName || '');
      if (!savedName) {
        const localName = accountCleanName(localStorage.getItem('xiangqi-nickname') || '');
        savedName = localName || accountCleanName(String(account.email || '').split('@')[0]) || '棋手';
        const repaired = {
          ...(chessAccountProfile || {}),
          displayName: savedName,
          email: account.email || chessAccountProfile?.email || '',
          createdAt: chessAccountProfile?.createdAt || Date.now(),
          updatedAt: Date.now()
        };
        await firebaseApi.set(firebaseApi.ref(db, `users/${account.uid}/profile`), repaired);
        chessAccountProfile = repaired;
      }
      if (savedName) {
        playerDisplayName = savedName;
        localStorage.setItem('xiangqi-nickname', savedName);
        if ($('player-nickname')) $('player-nickname').value = savedName;
      }
      await loadChessAccountMatches();
    };

    try {
      await syncProfile(current);
    } catch (error) {
      console.warn('載入帳號個人資料失敗', error);
      accountSetStatus(`讀取個人資料失敗：${error.message || error}`, true);
    }

    paintChessAccount(current);
    if (chessGameMode === 'ranked') await loadRankedRating();

    if (!chessAccountListenerStarted) {
      chessAccountListenerStarted = true;
      firebaseApi.onAuthStateChanged(auth, async account => {
        user = account;
        try {
          await syncProfile(account);
        } catch (error) {
          console.warn('載入帳號個人資料失敗', error);
        }
        paintChessAccount(account);
        if (chessGameMode === 'ranked') await loadRankedRating();
        if (chessGameMode === 'ranked' && account && !account.isAnonymous && chessAccountProfile?.displayName) {
          const modal = $('account-modal');
          if (modal) modal.hidden = true;
          accountSetStatus('');
        }
      });
    }
  } catch (error) {
    accountSetStatus(`帳號系統初始化失敗：${error.message || error}`, true);
  }
}
async function chessAccountAction(kind) { try { await chessAccountInit(); if (!firebaseApi || !auth) return; const email = $('account-email').value.trim(), password = $('account-password').value; if (kind === 'login' || kind === 'register') { if (!accountValidEmail(email)) { accountSetStatus('必須填寫有效的電子郵件地址，例如 name@example.com。', true); $('account-email').focus(); return } if (password.length < 6) { accountSetStatus('密碼必須至少包含 6 個字元。', true); $('account-password').focus(); return } accountSetStatus(kind === 'register' ? '正在建立帳號…' : '正在登入…'); if (kind === 'register') await firebaseApi.createUserWithEmailAndPassword(auth, email, password); else await firebaseApi.signInWithEmailAndPassword(auth, email, password); accountSetStatus(kind === 'register' ? '帳號建立成功，請設定使用者名稱。' : '登入成功。'); return } const u = auth.currentUser; if (kind === 'logout') { await firebaseApi.signOut(auth); chessAccountProfile = null; accountSetStatus('已登出。'); return } if (!u || u.isAnonymous) { accountSetStatus('請先登入帳號。', true); return } const first = !chessAccountProfile?.displayName; const name = accountCleanName(first ? $('account-username').value : $('account-edit-name').value); if (!name) { accountSetStatus('使用者名稱不可空白。', true); return } await firebaseApi.set(ref(db, `users/${u.uid}/profile`), { displayName: name, email: u.email || '', createdAt: chessAccountProfile?.createdAt || Date.now(), updatedAt: Date.now() }); chessAccountProfile = { ...(chessAccountProfile || {}), displayName: name, email: u.email || '' }; localStorage.setItem('xiangqi-nickname', name); paintChessAccount(u); await loadChessAccountMatches(); accountSetStatus('使用者名稱已儲存。') } catch (e) { const msg = e.code === 'auth/email-already-in-use' ? '這個電子郵件已註冊，請直接登入。' : e.code === 'auth/invalid-email' ? '電子郵件格式不正確。' : e.code === 'auth/weak-password' ? '密碼必須至少包含 6 個字元。' : e.code === 'auth/invalid-credential' ? '電子郵件或密碼錯誤。' : `操作失敗：${e.message || e}`; accountSetStatus(msg, true) } }
$('account-open-btn')?.addEventListener('click', async () => { if ($('account-modal')) $('account-modal').hidden = false; accountSetStatus(''); await chessAccountInit(); if (!user || user.isAnonymous) { $('account-auth-fields').hidden = false; $('account-profile-area').hidden = true; $('account-register-btn').hidden = false } }); $('account-close-btn')?.addEventListener('click', () => { if (user && !user.isAnonymous && !chessAccountProfile?.displayName) { accountSetStatus('請先設定使用者名稱，才能使用帳號功能。', true); return } $('account-modal').hidden = true }); $('account-modal')?.addEventListener('click', e => { if (e.target === $('account-modal') && !(user && !user.isAnonymous && !chessAccountProfile?.displayName)) $('account-modal').hidden = true }); $('account-login-btn')?.addEventListener('click', () => chessAccountAction('login')); $('account-register-btn')?.addEventListener('click', () => { const modal = $('account-register-modal'); if (modal) modal.hidden = false; const status = $('account-register-status'); if (status) status.textContent = ''; $('register-email').value = $('account-email').value.trim(); $('register-password').value = ''; $('register-username').value = ''; $('register-email').focus(); }); $('account-save-name-btn')?.addEventListener('click', () => chessAccountAction('save')); $('account-setup-save-btn')?.addEventListener('click', () => chessAccountAction('save')); $('account-register-close')?.addEventListener('click', () => { $('account-register-modal').hidden = true }); $('account-register-back')?.addEventListener('click', () => { $('account-register-modal').hidden = true; $('account-modal').hidden = false }); $('account-register-submit')?.addEventListener('click', async () => { const email = $('register-email').value.trim(), password = $('register-password').value, name = accountCleanName($('register-username').value); const status = $('account-register-status'); const say = (m, err = false) => { status.textContent = m; status.classList.toggle('is-error', err) }; if (!accountValidEmail(email)) { say('請輸入有效的電子郵件地址。', true); return } if (password.length < 6) { say('密碼至少需要 6 個字元。', true); return } if (!name) { say('請設定使用者名稱。', true); $('register-username').focus(); return } try { await chessAccountInit(); say('正在建立帳號…'); const credential = await firebaseApi.createUserWithEmailAndPassword(auth, email, password); const profile = { displayName: name, email, createdAt: Date.now(), updatedAt: Date.now() }; await firebaseApi.set(firebaseApi.ref(db, `users/${credential.user.uid}/profile`), profile); user = credential.user; rankedAuthPromptShown = false; chessAccountProfile = profile; playerDisplayName = name; localStorage.setItem('xiangqi-nickname', name); if ($('player-nickname')) $('player-nickname').value = name; $('account-register-modal').hidden = true; $('account-modal').hidden = true; paintChessAccount(user); await loadChessAccountMatches(); if (chessGameMode === 'ranked') await loadRankedRating(); accountSetStatus('帳號建立成功！使用者名稱已儲存。'); } catch (e) { const msg = e.code === 'auth/email-already-in-use' ? '這個電子郵件已註冊，請返回登入。' : e.code === 'auth/invalid-email' ? '電子郵件格式不正確。' : e.code === 'auth/weak-password' ? '密碼至少需要 6 個字元。' : `註冊失敗：${e.message || e}`; say(msg, true) } }); $('register-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') $('account-register-submit').click() }); $('account-logout-btn')?.addEventListener('click', () => chessAccountAction('logout')); $('account-password')?.addEventListener('keydown', e => { if (e.key === 'Enter') chessAccountAction('login') }); $('account-username')?.addEventListener('keydown', e => { if (e.key === 'Enter') chessAccountAction('save') }); $('account-edit-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') chessAccountAction('save') });
$('chess-game-mode').addEventListener('change', () => { if (onlineMode) return; initGame(); if ($('chess-game-mode').value === 'ranked') ensureRankedAccount().catch(e => { console.warn('排位登入狀態確認失敗', e); accountSetStatus('登入狀態確認失敗，請稍後重試。', true) }); else rankedAuthPromptShown = false }); $('chess-ai-level').addEventListener('change', () => { if (chessGameMode === 'ranked') { $('chess-ai-level').value = 'hard'; currentAiLevel = 'hard'; return } currentAiLevel = $('chess-ai-level').value }); $('restart-btn').addEventListener('click', () => { if (onlineMode) { if (chessGameOver) showModal('win-modal'); else setStatus('連線對局中不能直接重來，請先結束本局。'); return } const isRanked = chessGameMode === 'ranked'; const moves = moveHistory.length; let prompt; if (isRanked) { prompt = chessGameOver ? '確定要重新開始一場排位賽嗎？目前這局已結束。' : `確定要重新開始排位賽嗎？目前已走 ${moves} 步。排位賽超過 5 步後按下重來，將直接判定本局認輸並記錄敗場。${moves > 5 ? '你已超過 5 步，確認後將直接判負。' : '目前尚未超過 5 步，確認後會重新開始。'}`; } else { prompt = '確定要重新開始單機對局嗎？目前的棋局進度將會清除。'; } if (!window.confirm(prompt)) return; if (isRanked && !chessGameOver && moves > 5) { finishGame('black', '你在排位賽走棋超過 5 步後選擇重來，本局判定你認輸。'); return; } initGame() }); $('confirm-win').onclick = () => hideModal('win-modal'); $('close-win').onclick = () => { if (onlineMode && roomCode) declineRematch(); else hideModal('win-modal') }; $('rematch-request-btn')?.addEventListener('click', requestRematch); $('rematch-accept-btn')?.addEventListener('click', acceptRematch); $('rematch-decline-btn')?.addEventListener('click', declineRematch); $('cancel-confirm').onclick = () => hideModal('confirm-modal'); $('accept-confirm').onclick = () => hideModal('confirm-modal'); $('check-banner').onclick = () => { $('check-banner').classList.remove('show'); isBannerDismissed = true };
if (onlineMode) { $('online-panel').hidden = false; $('chess-game-mode').value = 'pvp'; $('chess-game-mode').querySelector('option[value="pvp"]').textContent = '多人連線對戰'; $('chess-game-mode').disabled = true; $('chess-mode-title').textContent = '多人連線對戰'; $('chess-ai-level').style.display = 'none'; } else if (params.get('mode') === 'ranked') { $('chess-game-mode').value = 'ranked'; $('chess-mode-title').textContent = '積分排位賽'; } initGame(onlineMode); connectFirebase().then(() => chessAccountInit()).then(() => { if (params.get('mode') === 'ranked') return ensureRankedAccount() }).catch(e => { console.warn('初始化帳號狀態失敗', e); if (params.get('mode') === 'ranked') accountSetStatus('無法確認登入狀態，請稍後重試。', true) });
