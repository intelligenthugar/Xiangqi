'use strict';
/*
 * 象棋 AI (Web Worker)
 * 在背景執行緒計算，不會卡住網頁。由 chess.js 的 aiStrongThink() 呼叫。
 *
 * 棋盤格式與網站一致: 長度 90 的陣列, 索引 = 列*9 + 行, 第 0 格是黑方左上角。
 * 搜尋: 迭代加深 + alpha-beta + 置換表 + 吃子排序 + 殺手/歷史啟發 + 晚走縮減
 *       + 將軍延伸 + 靜態搜尋 + 重複局面判和
 */

const MATE = 100000;
const RED = 0, BLACK = 1;
// 棋子代碼: 紅 1~7, 黑 8~14. 類型: 1車 2馬 3相 4仕 5帥 6炮 7兵
const NAME2CODE = {
  '俥': 1, '傌': 2, '相': 3, '仕': 4, '帥': 5, '炮': 6, '兵': 7,
  '車': 8, '馬': 9, '象': 10, '士': 11, '將': 12, '包': 13, '卒': 14
};
const BASE = [0, 900, 400, 200, 200, 0, 450, 100];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const NMOVES = [[-2, -1, -1, 0], [-2, 1, -1, 0], [2, -1, 1, 0], [2, 1, 1, 0],
                [-1, -2, 0, -1], [1, -2, 0, -1], [-1, 2, 0, 1], [1, 2, 0, 1]];

const START_NAMES = (() => {
  const b = Array(90).fill('');
  ['車', '馬', '象', '士', '將', '士', '象', '馬', '車'].forEach((n, c) => b[c] = n);
  b[19] = b[25] = '包';
  [0, 2, 4, 6, 8].forEach(c => { b[27 + c] = '卒'; b[54 + c] = '兵'; });
  b[64] = b[70] = '炮';
  ['俥', '傌', '相', '仕', '帥', '仕', '相', '傌', '俥'].forEach((n, c) => b[81 + c] = n);
  return b;
})();

// 第一步常見開局 (黑方回應), 以 [起點, 終點] 的棋盤索引表示
const BOOK_BLACK = [[1, 20], [7, 24], [1, 20], [7, 24], [25, 22], [19, 22]]; // 屏風馬 / 順炮 / 列炮

function bonus(t, r, c, red) {
  const adv = red ? 9 - r : r, cen = 4 - Math.abs(c - 4);
  if (t === 7) return adv >= 5 ? 40 + (adv - 5) * 8 + cen * 4 : adv * 2;
  if (t === 2) return cen * 6 + Math.min(adv, 7) * 3;
  if (t === 1) return adv * 3 + cen;
  if (t === 6) return cen * 3;
  return 0;
}
const PST = [null];
for (let p = 1; p <= 14; p++) {
  const t = p > 7 ? p - 7 : p, red = p <= 7, arr = new Int32Array(90);
  for (let sq = 0; sq < 90; sq++) {
    const r = (sq / 9) | 0, c = sq % 9, v = BASE[t] + bonus(t, r, c, red);
    arr[sq] = red ? v : -v;
  }
  PST.push(arr);
}

let seed = 20261108;
function rnd() {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return (t ^ t >>> 14) >>> 0;
}
const Z1 = new Int32Array(15 * 90), Z2 = new Int32Array(15 * 90);
for (let i = 0; i < Z1.length; i++) { Z1[i] = rnd() | 0; Z2[i] = rnd() | 0; }
const ZS1 = rnd() | 0, ZS2 = rnd() | 0;

// ---------- 局面狀態 (全域, 速度優先) ----------
const B = new Int8Array(90);
const KP = [0, 0];
let SIDE = RED, SC = 0, H1 = 0, H2 = 0;

function key() { return (H2 & 0x1FFFFF) * 4294967296 + (H1 >>> 0); }
const isBlack = p => p > 7 ? 1 : 0;

function setup(names, side) {
  B.fill(0); SC = 0; H1 = 0; H2 = 0; SIDE = side;
  for (let i = 0; i < 90; i++) {
    const p = names[i] ? NAME2CODE[names[i]] : 0;
    if (!p) continue;
    B[i] = p; SC += PST[p][i]; H1 ^= Z1[p * 90 + i]; H2 ^= Z2[p * 90 + i];
    if (p === 5) KP[0] = i; else if (p === 12) KP[1] = i;
  }
  if (side === BLACK) { H1 ^= ZS1; H2 ^= ZS2; }
}

function make(m) {
  const f = m >> 7, t = m & 127, p = B[f], cap = B[t];
  B[t] = p; B[f] = 0;
  SC += PST[p][t] - PST[p][f];
  H1 ^= Z1[p * 90 + f] ^ Z1[p * 90 + t]; H2 ^= Z2[p * 90 + f] ^ Z2[p * 90 + t];
  if (cap) { SC -= PST[cap][t]; H1 ^= Z1[cap * 90 + t]; H2 ^= Z2[cap * 90 + t]; }
  if (p === 5) KP[0] = t; else if (p === 12) KP[1] = t;
  SIDE ^= 1; H1 ^= ZS1; H2 ^= ZS2;
  return cap;
}
function unmake(m, cap) {
  const f = m >> 7, t = m & 127, p = B[t];
  B[f] = p; B[t] = cap;
  SC -= PST[p][t] - PST[p][f];
  H1 ^= Z1[p * 90 + f] ^ Z1[p * 90 + t]; H2 ^= Z2[p * 90 + f] ^ Z2[p * 90 + t];
  if (cap) { SC += PST[cap][t]; H1 ^= Z1[cap * 90 + t]; H2 ^= Z2[cap * 90 + t]; }
  if (p === 5) KP[0] = f; else if (p === 12) KP[1] = f;
  SIDE ^= 1; H1 ^= ZS1; H2 ^= ZS2;
}

// ---------- 走法生成 (偽合法) ----------
function gen(side, caps) {
  const mv = [], red = side === RED;
  for (let i = 0; i < 90; i++) {
    const p = B[i];
    if (!p || isBlack(p) !== side) continue;
    const r = (i / 9) | 0, c = i - r * 9, t = p > 7 ? p - 7 : p;
    if (t === 1) {
      for (const d of ORTH) {
        let rr = r + d[0], cc = c + d[1];
        while (rr >= 0 && rr < 10 && cc >= 0 && cc < 9) {
          const j = rr * 9 + cc, q = B[j];
          if (q) { if (isBlack(q) !== side) mv.push(i << 7 | j); break; }
          if (!caps) mv.push(i << 7 | j);
          rr += d[0]; cc += d[1];
        }
      }
    } else if (t === 6) {
      for (const d of ORTH) {
        let rr = r + d[0], cc = c + d[1], screen = false;
        while (rr >= 0 && rr < 10 && cc >= 0 && cc < 9) {
          const j = rr * 9 + cc, q = B[j];
          if (!screen) { if (q) screen = true; else if (!caps) mv.push(i << 7 | j); }
          else if (q) { if (isBlack(q) !== side) mv.push(i << 7 | j); break; }
          rr += d[0]; cc += d[1];
        }
      }
    } else if (t === 2) {
      for (const n of NMOVES) {
        const rr = r + n[0], cc = c + n[1];
        if (rr < 0 || rr > 9 || cc < 0 || cc > 8 || B[(r + n[2]) * 9 + c + n[3]]) continue;
        const j = rr * 9 + cc, q = B[j];
        if (q ? isBlack(q) !== side : !caps) mv.push(i << 7 | j);
      }
    } else if (t === 3) {
      for (const d of DIAG) {
        const rr = r + 2 * d[0], cc = c + 2 * d[1];
        if (rr < 0 || rr > 9 || cc < 0 || cc > 8) continue;
        if ((red && rr < 5) || (!red && rr > 4)) continue;
        if (B[(r + d[0]) * 9 + c + d[1]]) continue;
        const j = rr * 9 + cc, q = B[j];
        if (q ? isBlack(q) !== side : !caps) mv.push(i << 7 | j);
      }
    } else if (t === 4 || t === 5) {
      for (const d of (t === 4 ? DIAG : ORTH)) {
        const rr = r + d[0], cc = c + d[1];
        if (cc < 3 || cc > 5) continue;
        if (red ? (rr < 7 || rr > 9) : (rr < 0 || rr > 2)) continue;
        const j = rr * 9 + cc, q = B[j];
        if (q ? isBlack(q) !== side : !caps) mv.push(i << 7 | j);
      }
    } else { // 兵卒
      const fw = red ? -1 : 1, crossed = red ? r <= 4 : r >= 5;
      const tg = [[r + fw, c]];
      if (crossed) tg.push([r, c - 1], [r, c + 1]);
      for (const g of tg) {
        if (g[0] < 0 || g[0] > 9 || g[1] < 0 || g[1] > 8) continue;
        const j = g[0] * 9 + g[1], q = B[j];
        if (q ? isBlack(q) !== side : !caps) mv.push(i << 7 | j);
      }
    }
  }
  return mv;
}

function inCheck(side) {
  const k = KP[side], kr = (k / 9) | 0, kc = k - kr * 9;
  const eR = side === RED ? 8 : 1, eC = side === RED ? 13 : 6, eN = side === RED ? 9 : 2;
  const eP = side === RED ? 14 : 7, eK = side === RED ? 12 : 5;
  for (const d of ORTH) {
    let r = kr + d[0], c = kc + d[1], screen = false;
    while (r >= 0 && r < 10 && c >= 0 && c < 9) {
      const q = B[r * 9 + c];
      if (q) {
        if (!screen) { if (q === eR || (q === eK && d[1] === 0)) return true; screen = true; }
        else { if (q === eC) return true; break; }
      }
      r += d[0]; c += d[1];
    }
  }
  for (const dd of [[-2, -1], [-2, 1], [2, -1], [2, 1], [-1, -2], [1, -2], [-1, 2], [1, 2]]) {
    const r = kr + dd[0], c = kc + dd[1];
    if (r >= 0 && r < 10 && c >= 0 && c < 9 && B[r * 9 + c] === eN) {
      const lr = r - (Math.abs(dd[0]) === 2 ? dd[0] / 2 : 0), lc = c - (Math.abs(dd[1]) === 2 ? dd[1] / 2 : 0);
      if (!B[lr * 9 + lc]) return true;
    }
  }
  if (side === RED) {
    if (kr > 0 && B[(kr - 1) * 9 + kc] === eP) return true;
    if (kr >= 5) for (const dc of [-1, 1]) if (kc + dc >= 0 && kc + dc < 9 && B[kr * 9 + kc + dc] === eP) return true;
  } else {
    if (kr < 9 && B[(kr + 1) * 9 + kc] === eP) return true;
    if (kr <= 4) for (const dc of [-1, 1]) if (kc + dc >= 0 && kc + dc < 9 && B[kr * 9 + kc + dc] === eP) return true;
  }
  return false;
}

function legal() {
  const side = SIDE, out = [];
  for (const m of gen(side, false)) {
    const cap = make(m);
    if (!inCheck(side)) out.push(m);
    unmake(m, cap);
  }
  return out;
}

// ---------- 搜尋 ----------
const TIMEOUT = { timeout: true };
let NODES = 0, DEADLINE = 0, TT = new Map(), PATH = [], HSET = new Set();
const HIST = new Int32Array(90 * 90);
const KILL = Array.from({ length: 128 }, () => [0, 0]);

const typeOf = p => p > 7 ? p - 7 : p;

function nega(depth, alpha, beta, ply) {
  NODES++;
  if ((NODES & 2047) === 0 && Date.now() > DEADLINE) throw TIMEOUT;
  const k = key();
  if (HSET.has(k) || PATH.includes(k)) return 0; // 重複局面視為和
  const side = SIDE, chk = inCheck(side);
  if (chk && ply < 24) depth++;
  if (depth <= 0) return qs(alpha, beta);
  let ttm = 0;
  const e = TT.get(k);
  if (e) {
    ttm = e[3];
    let es = e[2];
    if (es > MATE - 200) es -= ply; else if (es < -MATE + 200) es += ply;
    if (e[0] >= depth) {
      if (e[1] === 0) return es;
      if (e[1] === 1 && es >= beta) return es;
      if (e[1] === 2 && es <= alpha) return es;
    }
  }
  const moves = gen(side, false), sc = new Array(moves.length);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i], cap = B[m & 127];
    if (m === ttm) sc[i] = 1 << 20;
    else if (cap) sc[i] = 100000 + BASE[typeOf(cap)] * 10 - BASE[typeOf(B[m >> 7])] / 10;
    else if (m === KILL[ply][0] || m === KILL[ply][1]) sc[i] = 90000;
    else sc[i] = HIST[(m >> 7) * 90 + (m & 127)];
  }
  let best = -MATE - 1, bm = 0, n = 0;
  const a0 = alpha;
  for (let i = 0; i < moves.length; i++) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
    if (bi !== i) {
      let t = moves[i]; moves[i] = moves[bi]; moves[bi] = t;
      t = sc[i]; sc[i] = sc[bi]; sc[bi] = t;
    }
    const m = moves[i], cap = make(m);
    if (inCheck(side)) { unmake(m, cap); continue; }
    n++;
    PATH.push(k);
    let s;
    if (n > 4 && depth >= 3 && !cap && !chk) {
      s = -nega(depth - 2, -alpha - 1, -alpha, ply + 1);
      if (s > alpha) s = -nega(depth - 1, -beta, -alpha, ply + 1);
    } else {
      s = -nega(depth - 1, -beta, -alpha, ply + 1);
    }
    PATH.pop();
    unmake(m, cap);
    if (s > best) { best = s; bm = m; }
    if (s > alpha) {
      alpha = s;
      if (alpha >= beta) {
        if (!cap) {
          const kl = KILL[ply]; kl[1] = kl[0]; kl[0] = m;
          HIST[(m >> 7) * 90 + (m & 127)] += depth * depth;
        }
        break;
      }
    }
  }
  if (n === 0) return -MATE + ply; // 被將死或困斃 = 輸
  const flag = best >= beta ? 1 : (best <= a0 ? 2 : 0);
  let sv = best;
  if (sv > MATE - 200) sv += ply; else if (sv < -MATE + 200) sv -= ply;
  TT.set(k, [depth, flag, sv, bm]);
  return best;
}

function qs(alpha, beta) {
  NODES++;
  if ((NODES & 2047) === 0 && Date.now() > DEADLINE) throw TIMEOUT;
  const stand = SIDE === RED ? SC : -SC;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  const side = SIDE, moves = gen(side, true), sc = moves.map(
    m => BASE[typeOf(B[m & 127])] * 10 - BASE[typeOf(B[m >> 7])] / 10);
  for (let i = 0; i < moves.length; i++) {
    let bi = i;
    for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[bi]) bi = j;
    if (bi !== i) {
      let t = moves[i]; moves[i] = moves[bi]; moves[bi] = t;
      t = sc[i]; sc[i] = sc[bi]; sc[bi] = t;
    }
    const m = moves[i], cap = make(m);
    if (inCheck(side)) { unmake(m, cap); continue; }
    const s = -qs(-beta, -alpha);
    unmake(m, cap);
    if (s >= beta) return s;
    if (s > alpha) alpha = s;
  }
  return alpha;
}

function think(timeMs, maxDepth, histKeys) {
  DEADLINE = Date.now() + timeMs; NODES = 0; HSET = new Set(histKeys);
  if (TT.size > 1500000) TT.clear();
  HIST.fill(0);
  for (const kl of KILL) { kl[0] = 0; kl[1] = 0; }
  const moves = legal();
  if (!moves.length) return null;
  let best = moves[0], bestScore = 0, reached = 0;
  if (moves.length === 1) return { m: best, depth: 0, score: 0 };
  const rootKey = key();
  const sB = Int8Array.from(B), sKP = KP.slice(), sSIDE = SIDE, sSC = SC, sH1 = H1, sH2 = H2;
  let cur = 0;
  try {
    for (let d = 1; d <= maxDepth; d++) {
      let alpha = -MATE - 1, bm = 0;
      cur = 0;
      PATH = [rootKey];
      for (const m of moves) {
        const cap = make(m);
        const s = -nega(d - 1, -MATE - 1, -alpha, 1);
        unmake(m, cap);
        if (s > alpha) { alpha = s; bm = m; cur = m; }
      }
      if (bm) {
        best = bm; bestScore = alpha; reached = d;
        const idx = moves.indexOf(bm);
        if (idx > 0) { moves.splice(idx, 1); moves.unshift(bm); }
      }
      if (Math.abs(alpha) > MATE - 100 || Date.now() > DEADLINE) break;
    }
  } catch (err) {
    if (err !== TIMEOUT) throw err;
    B.set(sB); KP[0] = sKP[0]; KP[1] = sKP[1]; SIDE = sSIDE; SC = sSC; H1 = sH1; H2 = sH2;
    if (cur) best = cur; // 逾時前已找到的更好走法
  }
  return { m: best, depth: reached, score: bestScore };
}

// 弱化模式 (低段位用): 固定深度對每一步完整評分, 再從「接近最佳」的走法裡隨機挑,
// 並有一定機率故意走爛棋 (但不會直接送車炮或被一步殺)。
function scoredMove(depth, margin, blunder, histKeys) {
  HSET = new Set(histKeys); PATH = [key()]; NODES = 0; DEADLINE = Date.now() + 20000;
  TT.clear(); HIST.fill(0);
  for (const kl of KILL) { kl[0] = 0; kl[1] = 0; }
  const moves = legal();
  if (!moves.length) return null;
  const sc = [];
  for (const m of moves) {
    const cap = make(m);
    sc.push(-nega(depth - 1, -MATE - 1, MATE + 1, 1));
    unmake(m, cap);
  }
  let best = -Infinity;
  for (const x of sc) if (x > best) best = x;
  let pool;
  if (best > MATE - 200) pool = moves.filter((m, i) => sc[i] === best);        // 有殺棋就一定走
  else if (Math.random() < blunder) pool = moves.filter((m, i) => sc[i] >= best - 350);
  else pool = moves.filter((m, i) => sc[i] >= best - margin);
  const m = pool[Math.floor(Math.random() * pool.length)];
  return { m, depth, score: sc[moves.indexOf(m)] };
}

// 重播棋譜以取得歷史局面 (用來避免重複局面)
function historyKeys(mvs, names) {
  setup(START_NAMES, RED);
  const keys = [];
  for (const mv of mvs) {
    if (!B[mv.f]) { setup(names, BLACK); return []; }
    keys.push(key());
    make(mv.f << 7 | mv.t);
  }
  const same = SIDE === BLACK && names.every((n, i) => (n ? NAME2CODE[n] : 0) === B[i]);
  setup(names, BLACK);
  return same ? keys : [];
}

function handle(data) {
  const names = data.board, mvs = data.moves || [];
  const keys = historyKeys(mvs, names);
  setup(names, BLACK); // 網站 AI 固定執黑
  if (data.book && mvs.length === 1) {
    const lg = new Set(legal()), cands = BOOK_BLACK.map(x => x[0] << 7 | x[1]).filter(m => lg.has(m));
    if (cands.length) {
      const m = cands[Math.floor(Math.random() * cands.length)];
      return { from: m >> 7, to: m & 127, depth: 0, score: 0, book: true };
    }
  }
  const lv = data.level;
  const r = lv && lv.scored
    ? scoredMove(lv.depth, lv.margin || 0, lv.blunder || 0, keys)
    : think(data.timeMs || 1500, data.maxDepth || 40, keys);
  if (!r) return { from: -1, to: -1, depth: 0, score: 0 };
  return { from: r.m >> 7, to: r.m & 127, depth: r.depth, score: r.score, nodes: NODES };
}

if (typeof self !== 'undefined' && typeof importScripts === 'function') {
  self.onmessage = (e) => {
    try { self.postMessage(handle(e.data)); }
    catch (err) { self.postMessage({ error: String(err) }); }
  };
}
if (typeof module !== 'undefined') module.exports = { scoredMove, handle, setup, legal, make, unmake, think, START_NAMES, B };
