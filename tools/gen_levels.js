// 關卡產生器：node tools/gen_levels.js
// 產生 50 關「唯一解」且「可純邏輯推理（不需猜）」的狗狗數獨，依難度排序後輸出 js/levels.js
'use strict';
const fs = require('fs');
const path = require('path');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = mulberry32(20261008);
const ri = (k) => Math.floor(rand() * k);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// 1) 隨機解：每列一隻、每行一隻、上下列不能斜角相鄰
function randomSolution(n) {
  const sol = new Array(n).fill(-1), used = new Array(n).fill(false);
  function bt(r) {
    if (r === n) return true;
    for (const c of shuffle([...Array(n).keys()])) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(sol[r - 1] - c) < 2) continue;
      sol[r] = c; used[c] = true;
      if (bt(r + 1)) return true;
      used[c] = false;
    }
    return false;
  }
  bt(0);
  return sol;
}

// 2) 從解的位置長出 n 個色塊
function growRegions(n, sol) {
  const reg = new Array(n * n).fill(-1);
  const size = new Array(n).fill(1);
  for (let r = 0; r < n; r++) reg[r * n + sol[r]] = r;
  let left = n * n - n;
  const bias = rand(); // 0~1：越高越偏好讓小色塊先長，形狀更平均
  while (left > 0) {
    // 挑一個色塊：有時挑最小的，有時隨機
    let k;
    if (rand() < bias * 0.7) {
      let min = Infinity, cands = [];
      for (let i = 0; i < n; i++) { if (size[i] < min) { min = size[i]; cands = [i]; } else if (size[i] === min) cands.push(i); }
      k = cands[ri(cands.length)];
    } else k = ri(n);
    const frontier = [];
    for (let i = 0; i < n * n; i++) {
      if (reg[i] !== k) continue;
      const r = (i / n) | 0, c = i % n;
      if (r > 0 && reg[i - n] < 0) frontier.push(i - n);
      if (r < n - 1 && reg[i + n] < 0) frontier.push(i + n);
      if (c > 0 && reg[i - 1] < 0) frontier.push(i - 1);
      if (c < n - 1 && reg[i + 1] < 0) frontier.push(i + 1);
    }
    if (!frontier.length) { size[k] = Infinity; if (size.every((s) => s === Infinity)) break; continue; }
    const cell = frontier[ri(frontier.length)];
    reg[cell] = k; size[k]++; left--;
  }
  if (reg.includes(-1)) return null;
  return reg;
}

// 3) 列舉解答（最多 limit 個）
function findSolutions(n, reg, limit = 2) {
  const out = [];
  const colUsed = new Array(n).fill(false), regUsed = new Array(n).fill(false);
  const pos = new Array(n).fill(-1);
  function bt(r) {
    if (out.length >= limit) return;
    if (r === n) { out.push(pos.slice()); return; }
    for (let c = 0; c < n; c++) {
      if (colUsed[c]) continue;
      const g = reg[r * n + c];
      if (regUsed[g]) continue;
      if (r > 0 && Math.abs(pos[r - 1] - c) < 2) continue;
      colUsed[c] = regUsed[g] = true; pos[r] = c;
      bt(r + 1);
      colUsed[c] = regUsed[g] = false;
    }
  }
  bt(0);
  return out;
}
const countSolutions = (n, reg, limit = 2) => findSolutions(n, reg, limit).length;

// 移走 cell 後，原色塊是否仍連通
function stillConnected(n, reg, cell) {
  const g = reg[cell];
  const cells = [];
  for (let i = 0; i < n * n; i++) if (reg[i] === g && i !== cell) cells.push(i);
  if (!cells.length) return false;
  const seen = new Set([cells[0]]), stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop(), r = (i / n) | 0, c = i % n;
    for (const j of [r > 0 ? i - n : -1, r < n - 1 ? i + n : -1, c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1]) {
      if (j >= 0 && j !== cell && reg[j] === g && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === cells.length;
}

// 修補：反覆把「其他解」用到的格子劃給鄰近色塊，直到解唯一
function makeUnique(n, sol, reg, maxIter = 400) {
  const seed = new Set(sol.map((c, r) => r * n + c));
  const LIMIT = 60;
  let sols = findSolutions(n, reg, LIMIT);
  for (let it = 0; it < maxIter && sols.length > 1; it++) {
    const alts = sols.filter((s) => s.some((c, r) => c !== sol[r]));
    const alt = alts[ri(alts.length)];
    const moves = [];
    for (let r = 0; r < n; r++) {
      const cell = r * n + alt[r];
      if (seed.has(cell)) continue;
      const c = alt[r];
      for (const j of [r > 0 ? cell - n : -1, r < n - 1 ? cell + n : -1, c > 0 ? cell - 1 : -1, c < n - 1 ? cell + 1 : -1]) {
        if (j >= 0 && reg[j] !== reg[cell]) moves.push([cell, reg[j]]);
      }
    }
    shuffle(moves);
    let applied = false;
    for (const [cell, to] of moves) {
      if (!stillConnected(n, reg, cell)) continue;
      const from = reg[cell];
      reg[cell] = to;
      const next = findSolutions(n, reg, LIMIT);
      if (next.length <= sols.length || rand() < 0.25) { sols = next; applied = true; break; }
      reg[cell] = from;
    }
    if (!applied) return null;
  }
  return sols.length === 1 ? reg : null;
}

// 4) 邏輯解題器：回傳 {solved, score, maxTech}
function logicSolve(n, reg) {
  const N = n * n;
  const cand = new Array(N).fill(true);
  const dog = new Array(N).fill(false);
  const units = [];
  for (let r = 0; r < n; r++) units.push({ t: 'row', cells: [...Array(n).keys()].map((c) => r * n + c) });
  for (let c = 0; c < n; c++) units.push({ t: 'col', cells: [...Array(n).keys()].map((r) => r * n + c) });
  for (let g = 0; g < n; g++) units.push({ t: 'reg', cells: [...Array(N).keys()].filter((i) => reg[i] === g) });
  const rowOf = (i) => (i / n) | 0, colOf = (i) => i % n;

  function killList(i) {
    const out = [];
    const r = rowOf(i), c = colOf(i);
    for (let j = 0; j < N; j++) {
      if (j === i) continue;
      const rr = rowOf(j), cc = colOf(j);
      if (rr === r || cc === c || reg[j] === reg[i] || (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1)) out.push(j);
    }
    return out;
  }
  const kills = [...Array(N).keys()].map(killList);
  function place(i) { dog[i] = true; cand[i] = false; for (const j of kills[i]) cand[j] = false; }
  const unitDone = (u) => u.cells.some((i) => dog[i]);
  const unitCands = (u) => u.cells.filter((i) => cand[i]);

  let score = 0, maxTech = 0, placed = 0;
  const use = (tech, w) => { score += w; if (tech > maxTech) maxTech = tech; };

  function contradiction() {
    for (const u of units) if (!unitDone(u) && unitCands(u).length === 0) return true;
    return false;
  }

  function step() {
    // T1：某行/列/色塊只剩一個候選
    for (const u of units) {
      if (unitDone(u)) continue;
      const cs = unitCands(u);
      if (cs.length === 1) { place(cs[0]); placed++; use(1, 1); return true; }
    }
    // T2：某色塊的候選全在同一行(列) → 該行(列)其他格刪除；反之亦然
    let changed = false;
    for (const a of units) {
      if (unitDone(a)) continue;
      const cs = unitCands(a);
      if (!cs.length) continue;
      for (const b of units) {
        if (b === a || b.t === a.t || unitDone(b)) continue;
        if (a.t !== 'reg' && b.t !== 'reg') continue;
        const inB = new Set(b.cells);
        if (cs.every((i) => inB.has(i))) {
          const inA = new Set(a.cells);
          for (const j of b.cells) if (cand[j] && !inA.has(j)) { cand[j] = false; changed = true; }
        }
      }
    }
    if (changed) { use(2, 3); return true; }
    // T3：k 個色塊被侷限在 k 行(列) 內 / k 行(列) 被侷限在 k 個色塊內
    for (let k = 2; k < n; k++) {
      for (const [ta, tb] of [['reg', 'row'], ['reg', 'col'], ['row', 'reg'], ['col', 'reg']]) {
        const A = units.filter((u) => u.t === ta && !unitDone(u));
        const B = units.filter((u) => u.t === tb && !unitDone(u));
        if (A.length <= k) continue;
        const idxB = (i) => B.findIndex((u) => u.cells.includes(i));
        const masks = A.map((u) => { let m = 0; for (const i of unitCands(u)) { const b = idxB(i); if (b >= 0) m |= 1 << b; } return m; });
        const combo = [];
        const tryCombo = (start) => {
          if (combo.length === k) {
            let m = 0; for (const a of combo) m |= masks[a];
            let bits = 0; for (let x = m; x; x &= x - 1) bits++;
            if (bits === k) {
              const inA = new Set(combo.flatMap((a) => A[a].cells));
              let ch = false;
              for (let b = 0; b < B.length; b++) if (m & (1 << b)) for (const j of B[b].cells) if (cand[j] && !inA.has(j)) { cand[j] = false; ch = true; }
              if (ch) return true;
            }
            return false;
          }
          for (let a = start; a < A.length; a++) { combo.push(a); if (tryCombo(a + 1)) return true; combo.pop(); }
          return false;
        };
        if (tryCombo(0)) { use(3, 6); return true; }
      }
    }
    // T4：假設放在某格會讓某個單位無處可放 → 該格刪除
    for (let i = 0; i < N; i++) {
      if (!cand[i]) continue;
      const saved = cand.slice(), savedDog = dog.slice();
      place(i);
      const bad = contradiction();
      for (let j = 0; j < N; j++) { cand[j] = saved[j]; dog[j] = savedDog[j]; }
      if (bad) { cand[i] = false; use(4, 10); return true; }
    }
    return false;
  }
  while (placed < n && step()) { /* 繼續 */ }
  return { solved: placed === n, score, maxTech };
}

// 5) 色票配置：相鄰色塊盡量避開相近顏色
const PALETTE = ['#FF9EBB', '#FFD45E', '#86C5F4', '#B9A8F2', '#8FDCA9', '#FFAE6B', '#6FD0D0', '#D6E36E', '#C9B39B'];
function hexToRgb(h) { return [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)); }
const RGB = PALETTE.map(hexToRgb);
const colorDist = (a, b) => Math.hypot(RGB[a][0] - RGB[b][0], (RGB[a][1] - RGB[b][1]) * 1.2, RGB[a][2] - RGB[b][2]);
function assignColors(n, reg) {
  const adj = new Set();
  for (let i = 0; i < n * n; i++) {
    const r = (i / n) | 0, c = i % n;
    if (c < n - 1 && reg[i] !== reg[i + 1]) adj.add(Math.min(reg[i], reg[i + 1]) + ',' + Math.max(reg[i], reg[i + 1]));
    if (r < n - 1 && reg[i] !== reg[i + n]) adj.add(Math.min(reg[i], reg[i + n]) + ',' + Math.max(reg[i], reg[i + n]));
  }
  const pairs = [...adj].map((s) => s.split(',').map(Number));
  let best = null, bestScore = -1;
  for (let t = 0; t < 3000; t++) {
    const perm = shuffle([...Array(PALETTE.length).keys()]).slice(0, n);
    let worst = Infinity;
    for (const [a, b] of pairs) worst = Math.min(worst, colorDist(perm[a], perm[b]));
    if (worst > bestScore) { bestScore = worst; best = perm; }
  }
  return best;
}

// 6) 主流程
const PLAN = [
  { n: 5, count: 10, maxTechCap: 4 },
  { n: 6, count: 10, maxTechCap: 4 },
  { n: 7, count: 10, maxTechCap: 4 },
  { n: 8, count: 10, maxTechCap: 4 },
  { n: 9, count: 10, maxTechCap: 4 },
];
const levels = [];
for (const { n, count } of PLAN) {
  const pool = [], seen = new Set();
  const target = n <= 6 ? 300 : n === 7 ? 200 : 120;
  let tries = 0;
  const t0 = Date.now();
  while (pool.length < target && tries < 20000 && Date.now() - t0 < 120000) {
    tries++;
    const sol = randomSolution(n);
    let reg = growRegions(n, sol);
    if (!reg) continue;
    if (countSolutions(n, reg) !== 1) reg = makeUnique(n, sol, reg);
    if (!reg) continue;
    const key = reg.join('');
    if (seen.has(key)) continue;
    seen.add(key);
    const res = logicSolve(n, reg);
    if (!res.solved) continue;
    pool.push({ n, reg, sol, ...res });
  }
  pool.sort((a, b) => a.score - b.score);
  // 依難度百分位挑 count 關：從簡單到困難，章節末段更難
  const picks = [];
  for (let k = 0; k < count; k++) {
    const p = Math.pow(k / (count - 1), 1.15) * 0.92 + 0.03;
    let idx = Math.min(pool.length - 1, Math.floor(p * pool.length));
    while (picks.includes(idx) && idx < pool.length - 1) idx++;
    picks.push(idx);
  }
  if (n === 5) picks[0] = 0; // 第一關給最簡單的
  for (const idx of picks) {
    const lv = pool[idx];
    const colors = assignColors(n, lv.reg);
    const rows = [];
    for (let r = 0; r < n; r++) rows.push(lv.reg.slice(r * n, r * n + n).join(''));
    levels.push({ n, regions: rows, colors, sol: lv.sol, diff: lv.score, tech: lv.maxTech });
  }
  console.log(`n=${n}: ${pool.length} 個合格題 (嘗試 ${tries} 次, ${Date.now() - t0}ms) 難度範圍 ${pool[0].score}~${pool[pool.length - 1].score}`);
}

const out = '// 由 tools/gen_levels.js 自動產生，請勿手動修改\n' +
  'window.DOG_PALETTE = ' + JSON.stringify(PALETTE) + ';\n' +
  'window.DOG_LEVELS = [\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n];\n';
fs.writeFileSync(path.join(__dirname, '..', 'js', 'levels.js'), out);
console.log('已輸出', levels.length, '關 → js/levels.js');
console.log(levels.map((l, i) => `${i + 1}:${l.n}x${l.n} d${l.diff} t${l.tech}`).join('  '));
