/* 汪汪數獨：遊戲主程式 */
(function () {
  'use strict';
  const LEVELS = window.DOG_LEVELS, PALETTE = window.DOG_PALETTE, A = window.DogAudio;
  const TOTAL = LEVELS.length;
  const $ = (s) => document.querySelector(s);
  const IMG = 'assets/img/';
  const CHAPTERS = [
    { name: '柴犬公園', breed: '柴犬', img: IMG + 'shiba.webp', tint: '#FF9EBB', party: IMG + 'party-shiba.webp', song: 'ch1', pitch: 1.0 },
    { name: '柯基草原', breed: '柯基', img: IMG + 'corgi.webp', tint: '#FFD45E', party: IMG + 'party-corgi.webp', song: 'ch2', pitch: 1.18 },
    { name: '哈士奇雪地', breed: '哈士奇', img: IMG + 'husky.webp', tint: '#86C5F4', party: IMG + 'party-husky.webp', song: 'ch3', pitch: 0.92 },
    { name: '巴哥小鎮', breed: '巴哥', img: IMG + 'pug.webp', tint: '#B9A8F2', party: IMG + 'party-pug.webp', song: 'ch4', pitch: 0.82 },
    { name: '黃金海灘', breed: '黃金獵犬', img: IMG + 'golden.webp', tint: '#8FDCA9', party: IMG + 'party-golden.webp', song: 'ch5', pitch: 0.98 },
  ];
  const ZH_NUM = ['一', '二', '三', '四', '五'];
  const chapterOf = (i) => Math.min(CHAPTERS.length - 1, Math.floor(i / 10));
  const icon = (id, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 存檔 ----------
  const KEY = 'dogdoku.v1';
  const defaults = () => ({
    stars: {}, best: {}, bones: 3, bonesGiven: {}, tutorial: false, progress: null,
    settings: { music: true, sfx: true, musicVol: 50, autoX: true, vibrate: true },
  });
  let save = defaults();
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) save = Object.assign(defaults(), s, { settings: Object.assign(defaults().settings, s.settings) });
  } catch (e) { /* 無痕模式等情況，改用預設值 */ }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* 忽略 */ } }
  const audioCfg = () => ({ music: save.settings.music, sfx: save.settings.sfx, musicVol: save.settings.musicVol / 100 * 0.9 });
  const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
  const isUnlocked = (i) => i === 0 || !!save.stars[i - 1] || !!save.stars[i];
  function buzz(p) {
    const active = !navigator.userActivation || navigator.userActivation.hasBeenActive;
    if (save.settings.vibrate && navigator.vibrate && active) try { navigator.vibrate(p); } catch (e) { /* 忽略 */ }
  }

  // ---------- 畫面切換與音樂 ----------
  let screen = 'home';
  function show(name) {
    for (const s of ['home', 'levels', 'game']) $('#screen-' + s).hidden = s !== name;
    screen = name;
    if (name !== 'game') stopTimer();
    if (name === 'home') renderHome();
    if (name === 'levels') renderLevels();
    updateMusic();
  }
  function updateMusic() {
    if (!A.unlocked()) return;
    if (screen === 'game') { if (!S.done) A.playMusic(CHAPTERS[chapterOf(S.idx)].song); }
    else A.playMusic('menu');
  }
  let audioStarted = false;
  function unlockAudio() {
    A.init().then(() => {
      A.configure(audioCfg());
      if (!audioStarted && A.unlocked()) { audioStarted = true; updateMusic(); }
    }).catch(() => {});
  }
  document.addEventListener('pointerdown', unlockAudio, true);
  document.addEventListener('keydown', unlockAudio, true);

  // ---------- 首頁 ----------
  function nextLevel() {
    if (save.progress && LEVELS[save.progress.idx]) return { idx: save.progress.idx, resume: true };
    for (let i = 0; i < TOTAL; i++) if (!save.stars[i]) return { idx: i, resume: false };
    return null;
  }
  function renderHome() {
    const nx = nextLevel();
    $('#play-label').textContent = !nx ? '全部通關！再玩一次' : nx.resume ? `繼續 · 第 ${nx.idx + 1} 關` : nx.idx === 0 ? '開始遊戲' : `開始 · 第 ${nx.idx + 1} 關`;
    $('#home-stars').textContent = `${totalStars()} / ${TOTAL * 3}`;
    $('#home-bones').textContent = save.bones;
  }
  $('#btn-play').addEventListener('click', () => {
    A.sfx('click');
    const nx = nextLevel();
    if (!nx) show('levels'); else startLevel(nx.idx, !nx.resume);
  });
  $('#btn-levels').addEventListener('click', () => { A.sfx('click'); show('levels'); });
  $('#btn-howto').addEventListener('click', () => { A.sfx('click'); openHowto(); });
  $('#btn-settings-home').addEventListener('click', () => { A.sfx('click'); openSettings(); });

  // ---------- 關卡選擇 ----------
  function renderLevels() {
    const list = $('#levels-list');
    list.innerHTML = '';
    $('#levels-stars').textContent = `${totalStars()} / ${TOTAL * 3}`;
    let current = null;
    CHAPTERS.forEach((ch, ci) => {
      const first = ci * 10, last = Math.min(TOTAL, first + 10);
      if (first >= TOTAL) return;
      const n = LEVELS[first].n;
      let got = 0; for (let i = first; i < last; i++) got += save.stars[i] || 0;
      const sec = document.createElement('section');
      sec.className = 'chapter';
      sec.style.setProperty('--tint', ch.tint);
      sec.innerHTML = `<div class="chapter-head"><img src="${ch.img}" alt="${ch.breed}">
        <div class="chapter-title"><p>第${ZH_NUM[ci]}章 · ${n}×${n}</p><h3>${ch.name}</h3></div>
        <span class="meta-pill">${icon('star', 'star')}${got}/${(last - first) * 3}</span></div>`;
      const grid = document.createElement('div');
      grid.className = 'level-grid';
      for (let i = first; i < last; i++) {
        const b = document.createElement('button');
        b.className = 'lv';
        const stars = save.stars[i] || 0;
        if (!isUnlocked(i)) {
          b.classList.add('locked'); b.innerHTML = icon('lock'); b.setAttribute('aria-label', `第 ${i + 1} 關（未解鎖）`);
        } else if (!stars) {
          b.classList.add('current'); b.innerHTML = `${i + 1}${icon('paw')}`; b.setAttribute('aria-label', `第 ${i + 1} 關`);
          if (!current) current = b;
        } else {
          b.innerHTML = `${i + 1}<span class="mini-stars">${[0, 1, 2].map((k) => icon('star', k < stars ? 'on' : '')).join('')}</span>`;
          b.setAttribute('aria-label', `第 ${i + 1} 關，${stars} 顆星`);
        }
        b.addEventListener('click', () => {
          if (!isUnlocked(i)) { A.sfx('blocked'); return; }
          A.sfx('click');
          startLevel(i, !(save.progress && save.progress.idx === i));
        });
        grid.appendChild(b);
      }
      sec.appendChild(grid);
      list.appendChild(sec);
    });
    if (current) requestAnimationFrame(() => current.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }
  $('#levels-back').addEventListener('click', () => { A.sfx('click'); show('home'); });

  // ---------- 遊戲狀態 ----------
  const S = { session: 0, active: false, idx: 0, n: 5, reg: [], sol: [], colors: [], cells: [], units: null, dogs: 0, hearts: 3, mistakes: 0, elapsed: 0, running: false, t0: 0, done: false, busy: false, undo: [], mode: 'dog', cursor: -1 };
  const board = $('#board'), boardWrap = $('#board-wrap');
  let cellEls = [];
  const rowOf = (i) => (i / S.n) | 0, colOf = (i) => i % S.n;

  function startLevel(idx, fresh) {
    stopTimer();
    const L = LEVELS[idx];
    Object.assign(S, {
      idx, n: L.n, reg: L.regions.join('').split('').map(Number), sol: L.sol, colors: L.colors,
      cells: Array.from({ length: L.n * L.n }, () => ({ dog: false, mark: 0 })),
      dogs: 0, hearts: 3, mistakes: 0, elapsed: 0, done: false, busy: false, undo: [], cursor: -1, active: true,
      session: S.session + 1,
    });
    const n = S.n;
    S.units = {
      row: [...Array(n)].map((_, r) => [...Array(n)].map((__, c) => r * n + c)),
      col: [...Array(n)].map((_, c) => [...Array(n)].map((__, r) => r * n + c)),
      reg: [...Array(n)].map((_, g) => S.reg.map((v, i) => (v === g ? i : -1)).filter((i) => i >= 0)),
    };
    const p = save.progress;
    if (fresh) save.progress = null;
    else if (p && p.idx === idx) {
      for (const i of p.dogs) { S.cells[i].dog = true; S.dogs++; }
      [...p.marks].forEach((m, i) => { if (!S.cells[i].dog) S.cells[i].mark = +m; });
      S.hearts = p.hearts; S.mistakes = p.mistakes; S.elapsed = p.elapsed || 0;
    }
    const ch = CHAPTERS[chapterOf(idx)];
    $('#game-title').textContent = `第 ${idx + 1} 關`;
    $('#game-sub').textContent = `${ch.name} · ${n}×${n}`;
    $('#pill-dog-img').src = ch.img;
    buildBoard();
    show('game');
    setMode('dog');
    updateHud();
    for (const id of ['#modal-win', '#modal-lose']) $(id).hidden = true;
    if (idx === 0 && !save.tutorial) openHowto();
    else startTimer();
    if (A.unlocked()) A.jingle('start');
    persist();
  }

  // 建立棋盤 DOM（遊戲與教學範例共用）
  function buildGrid(container, n, reg, colors) {
    container.innerHTML = '';
    container.style.setProperty('--n', n);
    const els = [];
    for (let i = 0; i < n * n; i++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.style.setProperty('--cc', PALETTE[colors[reg[i]]]);
      d.innerHTML = '<svg class="x" aria-hidden="true"><use href="#i-x"/></svg>';
      container.appendChild(d);
      els.push(d);
    }
    let thick = '', thin = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (c < n - 1) { const s = `M${c + 1} ${r}V${r + 1}`; if (reg[i] !== reg[i + 1]) thick += s; else thin += s; }
      if (r < n - 1) { const s = `M${c} ${r + 1}H${c + 1}`; if (reg[i] !== reg[i + n]) thick += s; else thin += s; }
    }
    container.insertAdjacentHTML('beforeend', `<svg class="lines" viewBox="0 0 ${n} ${n}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${thin}" stroke="rgba(90,56,38,.18)" stroke-width="1" fill="none" vector-effect="non-scaling-stroke"/>
      <path d="${thick}" stroke="#5A3826" stroke-width="3" stroke-linecap="round" fill="none" vector-effect="non-scaling-stroke"/></svg>`);
    return els;
  }
  function buildBoard() {
    cellEls = buildGrid(board, S.n, S.reg, S.colors);
    for (let i = 0; i < cellEls.length; i++) renderCell(i);
    resizeBoard();
  }
  function resizeBoard() {
    const w = boardWrap.clientWidth, h = boardWrap.clientHeight;
    if (!w || !h) return;
    // 棋盤外框 8px、底部厚度陰影 14px 都要算進去，避免壓到工具列
    let size = Math.min(w - 18, h - 32, 640);
    size = Math.max(120, Math.floor(size / S.n) * S.n);
    board.style.setProperty('--size', size + 'px');
  }
  new ResizeObserver(resizeBoard).observe(boardWrap);

  function dogImg(src) {
    const img = new Image();
    img.className = 'dog'; img.src = src; img.alt = ''; img.draggable = false;
    return img;
  }
  function renderCell(i) {
    const c = S.cells[i], el = cellEls[i];
    el.classList.toggle('m1', !c.dog && c.mark === 1);
    el.classList.toggle('m2', !c.dog && c.mark === 2);
    el.classList.toggle('has-dog', c.dog);
    if (c.dog && !el.querySelector('.dog')) el.appendChild(dogImg(CHAPTERS[chapterOf(S.idx)].img));
  }
  function updateHud() {
    $('#dog-count').textContent = `${S.dogs}/${S.n}`;
    const h = $('#hearts');
    h.innerHTML = [0, 1, 2].map((k) => icon('heart', k >= S.hearts ? 'lost' : '')).join('');
    h.setAttribute('aria-label', `剩餘愛心 ${S.hearts} 顆`);
    $('#bone-badge').textContent = save.bones;
    $('#tool-undo').disabled = !S.undo.length || S.done;
    $('#tool-hint').disabled = S.done;
    drawTimer();
  }
  function saveProgress() {
    if (!S.active || S.done) return;
    save.progress = {
      idx: S.idx, dogs: S.cells.map((c, i) => (c.dog ? i : -1)).filter((i) => i >= 0),
      marks: S.cells.map((c) => c.mark).join(''), hearts: S.hearts, mistakes: S.mistakes, elapsed: Math.round(elapsed()),
    };
    persist();
  }

  // ---------- 計時 ----------
  let timerId = null;
  const elapsed = () => S.elapsed + (S.running ? performance.now() - S.t0 : 0);
  function startTimer() {
    if (S.done || screen !== 'game' || S.running) return;
    S.running = true; S.t0 = performance.now();
    clearInterval(timerId); timerId = setInterval(drawTimer, 500); drawTimer();
  }
  function stopTimer() {
    if (S.running) { S.elapsed += performance.now() - S.t0; S.running = false; }
    clearInterval(timerId);
  }
  function drawTimer() { $('#timer').textContent = fmt(Math.floor(elapsed() / 1000)); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopTimer(); saveProgress(); }
    else if (screen === 'game' && !anyModalOpen()) startTimer();
  });
  window.addEventListener('pagehide', saveProgress);

  // ---------- 規則判斷 ----------
  function violated(i) {
    const out = new Set(), r = rowOf(i), c = colOf(i);
    S.cells.forEach((cell, j) => {
      if (!cell.dog || j === i) return;
      const rr = rowOf(j), cc = colOf(j);
      if (S.reg[j] === S.reg[i]) out.add(0);
      if (rr === r || cc === c) out.add(1);
      if (Math.abs(rr - r) <= 1 && Math.abs(cc - c) <= 1) out.add(2);
    });
    return [...out];
  }
  const RULE_MSG = ['這個顏色已經有狗狗了', '這一行或這一列已經有狗狗了', '太靠近別的狗狗了'];
  function flashRules(list) {
    for (const k of list) { const el = $('#rule-' + k); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
  }
  function retrigger(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  // ---------- 動作 ----------
  function tapDog(i) {
    if (S.done || S.busy) return;
    const c = S.cells[i];
    if (c.dog) { A.sfx('click'); retrigger(cellEls[i], 'shake'); return; }
    if (c.mark === 2) {
      const v = violated(i);
      flashRules(v); A.sfx('blocked'); retrigger(cellEls[i], 'shake');
      toast(v.length ? RULE_MSG[v[0]] : '這格已經確定不是狗狗的位置');
      return;
    }
    if (S.sol[rowOf(i)] === colOf(i)) placeDog(i);
    else wrong(i);
  }

  function placeDog(i) {
    const c = S.cells[i];
    c.dog = true; c.mark = 0; S.dogs++;
    renderCell(i);
    const ch = CHAPTERS[chapterOf(S.idx)];
    A.sfx('place', { count: S.dogs - 1, pitch: ch.pitch });
    buzz(12);
    if (save.settings.autoX) {
      const r = rowOf(i), col = colOf(i), touched = [];
      S.cells.forEach((cj, j) => {
        if (j === i || cj.dog || cj.mark === 2) return;
        const rr = rowOf(j), cc = colOf(j);
        if (rr === r || cc === col || S.reg[j] === S.reg[i] || (Math.abs(rr - r) <= 1 && Math.abs(cc - col) <= 1)) {
          cj.mark = 2;
          cellEls[j].style.setProperty('--d', `${120 + Math.max(Math.abs(rr - r), Math.abs(cc - col)) * 45}ms`);
          renderCell(j); touched.push(j);
        }
      });
      if (touched.length) {
        setTimeout(() => A.sfx('ripple'), 120);
        setTimeout(() => touched.forEach((j) => cellEls[j].style.removeProperty('--d')), 900);
      }
    }
    updateHud();
    if (S.dogs === S.n) win(); else saveProgress();
  }

  function wrong(i) {
    S.hearts--; S.mistakes++;
    S.busy = true;
    const el = cellEls[i];
    const v = violated(i);
    flashRules(v);
    toast(v.length ? RULE_MSG[v[0]] : '狗狗不在這裡喔～');
    A.sfx('wrong'); buzz([30, 40, 30]);
    const sad = new Image(); sad.className = 'sad'; sad.src = IMG + 'sad.webp'; sad.alt = '';
    el.appendChild(sad);
    retrigger(el, 'shake'); retrigger(el, 'oops');
    updateHud();
    const lost = $('#hearts').children[S.hearts];
    if (lost) lost.classList.add('break');
    const sess = S.session;
    setTimeout(() => {
      sad.remove(); el.classList.remove('oops');
      if (sess !== S.session) return;
      S.cells[i].mark = 2; renderCell(i);
      S.busy = false;
      if (S.hearts <= 0) lose(); else saveProgress();
    }, 800);
  }

  // 標記（點擊/拖曳/長按/右鍵）
  let lastMarkSfx = 0;
  function setMark(i, val, entry) {
    const c = S.cells[i];
    if (c.dog || c.mark === 2 || c.mark === val) return;
    entry.push([i, c.mark, val]);
    c.mark = val; renderCell(i);
    const now = performance.now();
    if (now - lastMarkSfx > 45) { A.sfx(val ? 'mark' : 'unmark'); lastMarkSfx = now; }
  }
  function commit(entry) {
    if (!entry.length) return;
    S.undo.push(entry); if (S.undo.length > 200) S.undo.shift();
    updateHud(); saveProgress();
  }
  function toggleMark(i) {
    if (S.done || S.busy) return;
    const c = S.cells[i];
    if (c.dog || c.mark === 2) { A.sfx('blocked'); return; }
    const entry = [];
    setMark(i, c.mark === 1 ? 0 : 1, entry);
    commit(entry);
  }
  function undo() {
    if (S.done || !S.undo.length) return;
    const entry = S.undo.pop();
    for (let k = entry.length - 1; k >= 0; k--) {
      const [i, prev, val] = entry[k], c = S.cells[i];
      if (!c.dog && c.mark === val) { c.mark = prev; renderCell(i); }
    }
    A.sfx('unmark'); updateHud(); saveProgress();
  }

  function hint() {
    if (S.done || S.busy) return;
    if (save.bones <= 0) { A.sfx('blocked'); toast('骨頭用完了，三星過關可以再拿'); return; }
    // 挑「最好推理」的位置：所在行/列/色塊剩餘可放格最少的那隻
    let best = -1, bestScore = Infinity;
    const free = (list) => list.filter((j) => !S.cells[j].dog && S.cells[j].mark !== 2).length;
    for (let r = 0; r < S.n; r++) {
      const i = r * S.n + S.sol[r];
      if (S.cells[i].dog) continue;
      const score = Math.min(free(S.units.row[r]), free(S.units.col[S.sol[r]]), free(S.units.reg[S.reg[i]]));
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best < 0) return;
    save.bones--; persist(); updateHud();
    S.busy = true;
    A.sfx('hint');
    cellEls[best].classList.add('hinted');
    const sess = S.session;
    setTimeout(() => {
      if (sess !== S.session) return;
      cellEls[best].classList.remove('hinted');
      S.busy = false;
      placeDog(best);
    }, 600);
  }

  // ---------- 指標輸入 ----------
  let ptr = null;
  function cellAt(x, y) {
    const r = board.getBoundingClientRect();
    if (!r.width || !r.height || S.cells.length !== S.n * S.n) return -1;
    const c = Math.floor((x - r.left) / r.width * S.n), rr = Math.floor((y - r.top) / r.height * S.n);
    if (!(c >= 0 && rr >= 0 && c < S.n && rr < S.n)) return -1;
    return rr * S.n + c;
  }
  function beginPaint(i) {
    ptr.painting = true;
    ptr.val = S.cells[i].mark === 1 ? 0 : 1;
    ptr.entry = [];
    setMark(i, ptr.val, ptr.entry);
  }
  board.addEventListener('pointerdown', (e) => {
    if (S.done || S.busy || e.button === 2) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
    setCursor(-1);
    ptr = { id: e.pointerId, start: i, last: i, painting: false, lp: null };
    if (S.mode === 'mark') beginPaint(i);
    else ptr.lp = setTimeout(() => { if (ptr && !ptr.painting) { beginPaint(ptr.start); buzz(15); } }, 380);
  });
  board.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const i = cellAt(e.clientX, e.clientY);
    if (i < 0 || i === ptr.last) return;
    ptr.last = i;
    if (!ptr.painting) { clearTimeout(ptr.lp); beginPaint(ptr.start); }
    setMark(i, ptr.val, ptr.entry);
  });
  function endPointer(e, cancel) {
    if (!ptr || e.pointerId !== ptr.id) return;
    clearTimeout(ptr.lp);
    if (ptr.painting) commit(ptr.entry);
    else if (!cancel) tapDog(ptr.start);
    ptr = null;
  }
  board.addEventListener('pointerup', (e) => endPointer(e, false));
  board.addEventListener('pointercancel', (e) => endPointer(e, true));
  board.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (ptr) return; // 觸控長按已處理
    const i = cellAt(e.clientX, e.clientY);
    if (i >= 0) toggleMark(i);
  });

  // ---------- 鍵盤 ----------
  function setCursor(i) {
    if (S.cursor >= 0 && cellEls[S.cursor]) cellEls[S.cursor].classList.remove('cursor');
    S.cursor = i;
    if (i >= 0) cellEls[i].classList.add('cursor');
  }
  board.addEventListener('keydown', (e) => {
    if (S.done) return;
    const n = S.n, cur = S.cursor < 0 ? 0 : S.cursor;
    let r = rowOf(cur), c = colOf(cur);
    switch (e.key) {
      case 'ArrowUp': r = Math.max(0, r - 1); break;
      case 'ArrowDown': r = Math.min(n - 1, r + 1); break;
      case 'ArrowLeft': c = Math.max(0, c - 1); break;
      case 'ArrowRight': c = Math.min(n - 1, c + 1); break;
      case ' ': case 'Enter': if (S.cursor < 0) setCursor(cur); else if (S.mode === 'mark') toggleMark(cur); else tapDog(cur); e.preventDefault(); return;
      case 'x': case 'X': if (S.cursor < 0) setCursor(cur); else toggleMark(cur); e.preventDefault(); return;
      default: return;
    }
    e.preventDefault();
    setCursor(r * n + c);
  });
  document.addEventListener('keydown', (e) => {
    if (!cover.hidden) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); leaveCover(); }
      return;
    }
    if (e.key === 'Escape') {
      const open = ['#modal-settings', '#modal-howto'].find((id) => !$(id).hidden);
      if (open) { closeModal(open); return; }
      if (anyModalOpen()) return;
      if (screen === 'game') show('levels'); else if (screen === 'levels') show('home');
      return;
    }
    if (screen !== 'game' || anyModalOpen()) return;
    if ((e.key === 'z' || e.key === 'Z') && !e.altKey) { e.preventDefault(); undo(); }
    else if (e.key === 'h' || e.key === 'H') hint();
    else if (e.key === 'm' || e.key === 'M') setMode(S.mode === 'dog' ? 'mark' : 'dog');
  });

  // ---------- 工具列 ----------
  function setMode(m) {
    S.mode = m;
    $('#mode-dog').classList.toggle('on', m === 'dog'); $('#mode-dog').setAttribute('aria-checked', m === 'dog');
    $('#mode-mark').classList.toggle('on', m === 'mark'); $('#mode-mark').setAttribute('aria-checked', m === 'mark');
  }
  $('#mode-dog').addEventListener('click', () => { if (S.mode !== 'dog') { setMode('dog'); A.sfx('click'); } });
  $('#mode-mark').addEventListener('click', () => { if (S.mode !== 'mark') { setMode('mark'); A.sfx('click'); } });
  $('#tool-undo').addEventListener('click', undo);
  $('#tool-hint').addEventListener('click', hint);
  // 需要按兩次確認的按鈕
  function armed(btn, labelEl, armedText, action) {
    let t = null; const orig = labelEl.textContent;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('armed')) { clearTimeout(t); btn.classList.remove('armed'); labelEl.textContent = orig; action(); return; }
      if (btn === $('#tool-restart') && !S.dogs && !S.cells.some((c) => c.mark)) { action(); return; }
      btn.classList.add('armed'); labelEl.textContent = armedText; A.sfx('click');
      t = setTimeout(() => { btn.classList.remove('armed'); labelEl.textContent = orig; }, 2500);
    });
  }
  armed($('#tool-restart'), $('#restart-label'), '確定？', () => { A.sfx('click'); startLevel(S.idx, true); });
  $('#game-back').addEventListener('click', () => { A.sfx('click'); saveProgress(); show('levels'); });
  $('#game-help').addEventListener('click', () => { A.sfx('click'); openHowto(); });
  $('#game-settings').addEventListener('click', () => { A.sfx('click'); openSettings(); });

  // ---------- 過關 / 失敗 ----------
  function win() {
    S.done = true; stopTimer();
    save.progress = null;
    const stars = Math.max(1, 3 - S.mistakes);
    if (stars > (save.stars[S.idx] || 0)) save.stars[S.idx] = stars;
    const t = Math.max(1, Math.round(elapsed() / 1000));
    const prevBest = save.best[S.idx];
    const newBest = !prevBest || t < prevBest;
    if (newBest) save.best[S.idx] = t;
    let bone = false;
    if (stars === 3 && !save.bonesGiven[S.idx]) { save.bonesGiven[S.idx] = 1; save.bones = Math.min(9, save.bones + 1); bone = true; }
    persist(); updateHud();
    A.stopMusic(0.3);
    // 狗狗們依序跳舞
    let k = 0;
    cellEls.forEach((el, i) => { if (S.cells[i].dog) { el.style.setProperty('--d', `${k++ * 90}ms`); retrigger(el, 'dance'); } });
    const sess = S.session;
    setTimeout(() => { if (sess === S.session && screen === 'game') { A.jingle('win'); confetti(); } }, 350);
    setTimeout(() => { if (sess === S.session && screen === 'game') openWin(stars, t, newBest && prevBest, bone); }, 1250);
  }
  function openWin(stars, t, beatRecord, bone) {
    const last = S.idx >= TOTAL - 1;
    const ch = CHAPTERS[chapterOf(S.idx)];
    $('#win-dog').src = ch.party; $('#win-dog').alt = `開心慶祝的${ch.breed}`;
    $('#win-title').textContent = last ? '全部通關！太厲害了！' : '過關啦！';
    $('#win-stats').innerHTML = `用時 ${fmt(t)} · 失誤 ${S.mistakes} 次${beatRecord ? '<br><b>刷新最佳紀錄！</b>' : ''}`;
    $('#win-reward').hidden = !bone;
    $('#win-next').textContent = last ? '回到關卡列表' : '下一關';
    const st = $('#win-stars').children;
    for (let k = 0; k < 3; k++) {
      st[k].classList.remove('on');
      st[k].style.setProperty('--d', `${250 + k * 300}ms`);
    }
    openModal('#modal-win');
    void $('#win-stars').offsetWidth; // 重新觸發星星動畫
    for (let k = 0; k < stars; k++) {
      st[k].classList.add('on');
      setTimeout(() => A.sfx('star', { i: k }), 250 + k * 300);
    }
  }
  function lose() {
    S.done = true; stopTimer();
    save.progress = null; persist(); updateHud();
    A.stopMusic(0.3);
    const sess = S.session;
    setTimeout(() => { if (sess === S.session && screen === 'game') A.jingle('lose'); }, 200);
    setTimeout(() => { if (sess === S.session && screen === 'game') openModal('#modal-lose'); }, 650);
  }
  $('#win-next').addEventListener('click', () => {
    A.sfx('click'); closeModal('#modal-win');
    if (S.idx < TOTAL - 1) startLevel(S.idx + 1, true); else show('levels');
  });
  $('#win-replay').addEventListener('click', () => { A.sfx('click'); closeModal('#modal-win'); startLevel(S.idx, true); });
  $('#win-levels').addEventListener('click', () => { A.sfx('click'); closeModal('#modal-win'); show('levels'); });
  $('#lose-retry').addEventListener('click', () => { A.sfx('click'); closeModal('#modal-lose'); startLevel(S.idx, true); });
  $('#lose-levels').addEventListener('click', () => { A.sfx('click'); closeModal('#modal-lose'); show('levels'); });

  // ---------- 彈窗 ----------
  const anyModalOpen = () => [...document.querySelectorAll('.modal')].some((m) => !m.hidden);
  function openModal(id) {
    const m = $(id); m.hidden = false;
    stopTimer();
    const b = m.querySelector('.btn-primary'); if (b) setTimeout(() => b.focus({ preventScroll: true }), 50);
  }
  function closeModal(id) {
    $(id).hidden = true;
    if (screen === 'game' && !anyModalOpen() && !S.done) { startTimer(); board.focus({ preventScroll: true }); }
  }

  // 教學：4×4 已完成範例
  (function buildMini() {
    const reg = [0, 0, 1, 1, 0, 2, 1, 1, 2, 2, 2, 3, 2, 3, 3, 3], sol = [1, 3, 0, 2];
    const els = buildGrid($('#mini-board'), 4, reg, [0, 1, 2, 3]);
    els.forEach((el, i) => {
      if (sol[(i / 4) | 0] === i % 4) { el.classList.add('has-dog'); el.appendChild(dogImg(CHAPTERS[0].img)); }
      else el.classList.add('m2');
    });
  })();
  function openHowto() { openModal('#modal-howto'); }
  $('#howto-ok').addEventListener('click', () => {
    A.sfx('click');
    if (!save.tutorial) { save.tutorial = true; persist(); }
    closeModal('#modal-howto');
  });

  // 設定
  const setEls = { music: $('#set-music'), vol: $('#set-music-vol'), sfx: $('#set-sfx'), autoX: $('#set-autox'), vibrate: $('#set-vibrate') };
  function openSettings() {
    const st = save.settings;
    setEls.music.checked = st.music; setEls.vol.value = st.musicVol; setEls.sfx.checked = st.sfx;
    setEls.autoX.checked = st.autoX; setEls.vibrate.checked = st.vibrate;
    openModal('#modal-settings');
  }
  function applySettings() {
    const st = save.settings;
    st.music = setEls.music.checked; st.musicVol = +setEls.vol.value; st.sfx = setEls.sfx.checked;
    st.autoX = setEls.autoX.checked; st.vibrate = setEls.vibrate.checked;
    persist(); A.configure(audioCfg());
    if (st.music) updateMusic();
  }
  for (const el of Object.values(setEls)) el.addEventListener('input', () => { applySettings(); if (el.type === 'checkbox') A.sfx('click'); });
  $('#settings-ok').addEventListener('click', () => { A.sfx('click'); closeModal('#modal-settings'); });
  (function () {
    const btn = $('#set-reset'); let t = null;
    btn.addEventListener('click', () => {
      if (!btn.classList.contains('armed')) {
        btn.classList.add('armed'); btn.textContent = '再按一次確認';
        t = setTimeout(() => { btn.classList.remove('armed'); btn.textContent = '重置'; }, 3000);
        return;
      }
      clearTimeout(t); btn.classList.remove('armed'); btn.textContent = '重置';
      const keep = save.settings; save = defaults(); save.settings = keep; persist();
      closeModal('#modal-settings');
      if (screen === 'game') show('levels'); else show(screen);
    });
  })();
  for (const m of document.querySelectorAll('.modal')) {
    m.addEventListener('click', (e) => {
      if (e.target !== m) return;
      if (m.id === 'modal-settings' || m.id === 'modal-howto') closeModal('#' + m.id);
    });
  }

  // ---------- 彩帶（爪印與紙片） ----------
  function confetti() {
    if (reduceMotion) return;
    const cv = $('#confetti'), g = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.display = 'block';
    const br = board.getBoundingClientRect();
    const parts = Array.from({ length: 110 }, (_, k) => ({
      x: br.left + br.width / 2 + (Math.random() - 0.5) * br.width * 0.6, y: br.top + br.height * 0.45,
      vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 14 - 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
      s: 7 + Math.random() * 7, c: PALETTE[k % PALETTE.length], paw: Math.random() < 0.35,
    }));
    const t0 = performance.now();
    (function frame(now) {
      const t = (now - t0) / 1000;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.globalAlpha = t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.8) : 1;
      for (const p of parts) {
        p.vy += 0.42; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c;
        if (p.paw) {
          const s = p.s / 8;
          g.beginPath(); g.ellipse(0, 3 * s, 4.5 * s, 3.7 * s, 0, 0, 7); g.fill();
          for (const [x, y] of [[-5.4, -2], [-2, -5.6], [2, -5.6], [5.4, -2]]) { g.beginPath(); g.ellipse(x * s, y * s, 1.7 * s, 2.1 * s, 0, 0, 7); g.fill(); }
        } else g.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        g.restore();
      }
      if (t < 3.2) requestAnimationFrame(frame); else { g.clearRect(0, 0, W, H); cv.style.display = 'none'; }
    })(t0);
  }

  // ---------- 啟動：封面＋預先載入圖片與字型 ----------
  const cover = $('#cover');
  let coverReady = false;
  (function preload() {
    const srcs = [...CHAPTERS.map((c) => c.img), ...CHAPTERS.map((c) => c.party), IMG + 'sad.webp', IMG + 'keyart.webp'];
    const total = srcs.length + 1;
    let done = 0;
    const bar = $('#cover-bar'), loader = $('#cover-loader');
    const step = () => { done++; const pct = Math.round(done / total * 100); bar.style.width = pct + '%'; loader.setAttribute('aria-valuenow', pct); };
    const loads = srcs.map((src) => new Promise((res) => { const im = new Image(); im.onload = im.onerror = () => { step(); res(); }; im.src = src; }));
    const fonts = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(step);
    const minShow = new Promise((r) => setTimeout(r, 1200)); // 讓標題動畫跑完
    const cap = new Promise((r) => setTimeout(r, 8000)); // 網路很慢時也不要卡住
    Promise.race([Promise.all([...loads, fonts, minShow]), cap]).then(() => {
      coverReady = true;
      bar.style.width = '100%';
      setTimeout(() => { loader.hidden = true; $('#cover-start').hidden = false; }, 250);
    });
  })();
  function leaveCover() {
    if (!coverReady || cover.classList.contains('leaving')) return;
    unlockAudio();
    A.init().then(() => A.jingle('start')).catch(() => {});
    cover.classList.add('leaving');
    setTimeout(() => { cover.hidden = true; }, 650);
  }
  cover.addEventListener('click', leaveCover);
  show('home');
})();
