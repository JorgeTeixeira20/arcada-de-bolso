// Batalha Naval: afunda a frota do computador antes que ele afunde a tua. Por turnos, grelha 10x10.
(function () {
  const N = 10;
  const FLEET = [
    { name: 'Porta-aviões', size: 5 },
    { name: 'Couraçado', size: 4 },
    { name: 'Cruzador', size: 3 },
    { name: 'Submarino', size: 3 },
    { name: 'Patrulha', size: 2 },
  ];
  const DIFFS = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
  const ORDER = ['easy', 'normal', 'hard'];
  const SAVE_KEY = 'naval:save', STATS_KEY = 'naval:stats', DIFF_KEY = 'naval:diff';
  const LONG_MS = 450;

  const CSS = `
  .nv-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 8px calc(env(safe-area-inset-bottom) + 12px); gap:10px; }
  .nv-head { width:100%; max-width:760px; min-height:44px; padding-right:60px; display:flex; align-items:center; }
  .nv-status { flex:1; font-weight:800; font-size:17px; line-height:1.25; }
  .nv-status small { display:block; color:#9aa0c8; font-weight:600; font-size:13px; }
  .nv-main { flex:1; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; width:100%; }
  .nv-main.land { flex-direction:row; align-items:center; }
  .nv-box { position:relative; display:flex; flex-direction:column; align-items:flex-start; }
  .nv-label { color:#9aa0c8; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; margin:0 0 5px 2px; height:14px; }
  .nv-board { position:relative; border-radius:12px; overflow:hidden; touch-action:none; }
  .nv-sea { position:absolute; inset:0; background-color:#11386a;
    background-image:
      radial-gradient(ellipse 18px 5px at 30% 50%, rgba(160,210,255,.16), transparent 70%),
      linear-gradient(180deg, rgba(255,255,255,0) 0 55%, rgba(120,190,255,.08) 55% 70%, rgba(255,255,255,0) 70%);
    background-size: 64px 30px, 100% 22px;
    animation: nv-wave 5s linear infinite; }
  .nv-board.small .nv-sea { animation-duration: 8s; }
  @keyframes nv-wave { from { background-position: 0 0, 0 0; } to { background-position: 64px 0, 0 22px; } }
  .nv-ships, .nv-cells { position:absolute; inset:0; }
  .nv-cells { display:grid; grid-template-columns:repeat(10, 1fr); grid-template-rows:repeat(10, 1fr); }
  .nv-ship { position:absolute; border-radius:999px; background:linear-gradient(180deg,#a9b3e6,#7480bd);
    box-shadow: inset 0 0 0 2px #cfd6ff55, 0 2px 0 #0b1c38; }
  .nv-ship.v { background:linear-gradient(90deg,#a9b3e6,#7480bd); }
  .nv-ship.sunk { background:#4a1f33; box-shadow: inset 0 0 0 2px #ff5a6e; }
  .nv-ship.hidden { background:#4a1f33; box-shadow: inset 0 0 0 2px #ff9f4399; opacity:.85; }
  .nv-ship.fresh { animation: nv-sink .9s ease-out; }
  @keyframes nv-sink { 0% { transform:scale(1.12); filter:brightness(2); } 100% { transform:scale(1); filter:none; } }
  .nv-c { position:relative; box-shadow: inset 0 0 0 .5px rgba(200,225,255,.13); }
  .nv-board.target .nv-c.open:active { background:rgba(255,204,77,.25); }
  .nv-c.miss::before { content:''; position:absolute; left:36%; top:36%; width:28%; height:28%; border-radius:50%; background:#d5e6ff; opacity:.75; }
  .nv-c.hit::before { content:''; position:absolute; inset:20%; border-radius:50%; background:#ff5a6e; box-shadow:0 0 0 2px #ffcc4d99, 0 0 8px #ff9f43; }
  .nv-c.sk::before { background:#ff9f43; box-shadow:none; inset:30%; }
  .nv-c.anim.miss::after { content:''; position:absolute; inset:8%; border-radius:50%; border:2px solid #d5e6ff; animation: nv-rip .8s ease-out forwards; }
  .nv-c.anim.hit::after { content:''; position:absolute; inset:-45%; border-radius:50%; z-index:2; pointer-events:none;
    background: radial-gradient(circle, #fff 0 12%, #ffe08a 22%, #ff9f43 40%, rgba(255,90,110,.6) 55%, rgba(255,90,110,0) 70%);
    animation: nv-boom .65s ease-out forwards; }
  .nv-c.anim.hit::before { animation: nv-pop .45s ease-out; }
  .nv-c.last { box-shadow: inset 0 0 0 2px #ffcc4d; }
  @keyframes nv-rip { from { transform:scale(.3); opacity:1; } to { transform:scale(1.5); opacity:0; } }
  @keyframes nv-boom { 0% { transform:scale(.2); opacity:1; } 60% { opacity:.9; } 100% { transform:scale(1.5); opacity:0; } }
  @keyframes nv-pop { 0% { transform:scale(.2); } 60% { transform:scale(1.3); } 100% { transform:scale(1); } }
  .nv-board.shake { animation: nv-shake .35s; }
  @keyframes nv-shake { 0%,100% { transform:none; } 25% { transform:translate(-4px,2px); } 50% { transform:translate(4px,-2px); } 75% { transform:translate(-2px,1px); } }
  .nv-board.wait .nv-cells { opacity:.75; }
  .nv-toast { position:absolute; left:50%; top:50%; z-index:5; pointer-events:none; white-space:nowrap;
    background:#ffcc4d; color:#1a1300; font-weight:800; font-size:17px; padding:10px 16px; border-radius:14px;
    box-shadow:0 6px 20px rgba(0,0,0,.45); animation: nv-toast 1.8s ease forwards; }
  .nv-toast.bad { background:#ff5a6e; color:#fff; }
  .nv-toast.info { background:#1a1c33; color:#eef0ff; border:2px solid #34386a; font-size:15px; }
  @keyframes nv-toast { 0% { transform:translate(-50%,-50%) scale(.5); opacity:0; } 12% { transform:translate(-50%,-50%) scale(1.08); opacity:1; }
    20% { transform:translate(-50%,-50%) scale(1); } 80% { opacity:1; } 100% { transform:translate(-50%,-60%); opacity:0; } }
  .nv-side { display:flex; flex-direction:column; gap:8px; min-width:0; }
  .nv-sub { display:flex; gap:12px; align-items:flex-end; }
  .nv-panel { background:#1a1c33; border-radius:12px; padding:10px; font-size:13px; color:#9aa0c8; display:flex; flex-direction:column; gap:6px; }
  .nv-panel b { color:#eef0ff; font-size:15px; }
  .nv-row { display:flex; justify-content:space-between; gap:8px; }
  .nv-fleet { display:flex; flex-direction:column; gap:4px; }
  .nv-fl { display:flex; align-items:center; gap:6px; font-size:12px; color:#eef0ff; }
  .nv-fl.gone { color:#6d7299; text-decoration:line-through; }
  .nv-pips { display:flex; gap:2px; flex:none; }
  .nv-pips i { width:7px; height:7px; border-radius:2px; background:#8c96c8; }
  .nv-fl.gone .nv-pips i { background:#ff5a6e; }
  .nv-setup { width:100%; max-width:420px; display:flex; flex-direction:column; gap:10px; }
  .nv-seg { display:flex; gap:6px; }
  .nv-btn { flex:1; height:48px; border-radius:14px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff;
    font:inherit; font-size:15px; font-weight:700; }
  .nv-btn:active { transform:scale(.97); }
  .nv-btn.on { background:#45aaf2; border-color:transparent; color:#071a2b; }
  .nv-btn.go { background:#ffcc4d; border-color:transparent; color:#1a1300; }
  .nv-btn[disabled] { opacity:.4; }
  .nv-chips { display:flex; flex-wrap:wrap; gap:6px; min-height:30px; }
  .nv-chip { display:flex; align-items:center; gap:6px; background:#1a1c33; border-radius:10px; padding:5px 8px; font-size:12px; font-weight:600; }
  .nv-chip.next { background:#ffcc4d; color:#1a1300; }
  .nv-chip.next .nv-pips i { background:#1a1300; }
  .nv-chip.done { opacity:.4; }
  .nv-hint { color:#9aa0c8; font-size:13px; text-align:center; }
  `;

  const idx = (x, y) => y * N + x;
  const inb = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
  const rnd = a => a[Math.floor(Math.random() * a.length)];

  function cellsOf(s) {
    const out = [];
    for (let k = 0; k < FLEET[s.k].size; k++) out.push(s.h ? idx(s.x + k, s.y) : idx(s.x, s.y + k));
    return out;
  }
  function fits(ships, s) {
    const size = FLEET[s.k].size;
    if (!inb(s.x, s.y) || !inb(s.h ? s.x + size - 1 : s.x, s.h ? s.y : s.y + size - 1)) return false;
    const taken = new Set();
    for (const o of ships) if (o.k !== s.k) cellsOf(o).forEach(i => taken.add(i));
    return cellsOf(s).every(i => !taken.has(i));
  }
  function randomFleet() {
    for (;;) {
      const ships = [];
      let ok = true;
      for (let k = 0; k < FLEET.length && ok; k++) {
        ok = false;
        for (let t = 0; t < 300; t++) {
          const s = { k, h: Math.random() < 0.5, x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) };
          if (fits(ships, s)) { ships.push(s); ok = true; break; }
        }
      }
      if (ok) return ships;
    }
  }
  const shipAt = (side, i) => side.ships.find(s => cellsOf(s).includes(i)) || null;
  const isSunk = (side, s) => cellsOf(s).every(i => side.shots[i] === 2);
  const allSunk = side => side.ships.length === FLEET.length && side.ships.every(s => isSunk(side, s));

  // ---------- IA ----------
  // A IA só usa o que um jogador saberia: tiros feitos, água/fogo e que barcos já foram anunciados como afundados.
  function aiPick(level, side) {
    const shots = side.shots;
    const sunkCells = new Set(), remaining = [];
    for (const s of side.ships) {
      if (isSunk(side, s)) cellsOf(s).forEach(i => sunkCells.add(i));
      else remaining.push(FLEET[s.k].size);
    }
    const unknown = [];
    for (let i = 0; i < N * N; i++) if (shots[i] === 0) unknown.push(i);
    if (level === 'easy' || !unknown.length) return rnd(unknown);
    const open = [];
    for (let i = 0; i < N * N; i++) if (shots[i] === 2 && !sunkCells.has(i)) open.push(i);
    const isOpen = (x, y) => inb(x, y) && shots[idx(x, y)] === 2 && !sunkCells.has(idx(x, y));
    const isUnk = (x, y) => inb(x, y) && shots[idx(x, y)] === 0;

    if (level === 'normal') {
      // Caça e alvo: com dois acertos alinhados continua a linha; com um só experimenta à volta.
      if (open.length) {
        const line = [], around = [];
        for (const i of open) {
          const x = i % N, y = (i / N) | 0;
          for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (!isOpen(x + dx, y + dy) && !isOpen(x - dx, y - dy)) continue;
            let a = 1; while (isOpen(x + a * dx, y + a * dy)) a++;
            if (isUnk(x + a * dx, y + a * dy)) line.push(idx(x + a * dx, y + a * dy));
            let b = 1; while (isOpen(x - b * dx, y - b * dy)) b++;
            if (isUnk(x - b * dx, y - b * dy)) line.push(idx(x - b * dx, y - b * dy));
          }
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isUnk(x + dx, y + dy)) around.push(idx(x + dx, y + dy));
        }
        if (line.length) return rnd(line);
        if (around.length) return rnd(around);
      }
      return rnd(unknown);
    }

    // Difícil: mapa de probabilidades com todas as posições possíveis dos barcos que restam.
    const w = new Float64Array(N * N);
    const blocked = i => shots[i] === 1 || sunkCells.has(i);
    for (const size of remaining) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) for (const h of [true, false]) {
        if (h ? x + size > N : y + size > N) continue;
        const cs = [];
        let bad = false, covered = 0;
        for (let k = 0; k < size; k++) {
          const i = h ? idx(x + k, y) : idx(x, y + k);
          if (blocked(i)) { bad = true; break; }
          if (shots[i] === 2) covered++;
          cs.push(i);
        }
        if (bad) continue;
        if (open.length && !covered) continue;
        const add = open.length ? Math.pow(8, covered) : 1;
        for (const i of cs) if (shots[i] === 0) w[i] += add;
      }
    }
    if (!open.length && remaining.length) {
      // Paridade: o barco mais pequeno que resta ocupa sempre uma casa destas.
      const m = Math.min(...remaining);
      const par = new Float64Array(w);
      let any = false;
      for (let i = 0; i < N * N; i++) {
        if (((i % N) + ((i / N) | 0)) % m !== 0) par[i] = 0;
        else if (par[i] > 0) any = true;
      }
      if (any) w.set(par);
    }
    let max = 0;
    for (let i = 0; i < N * N; i++) if (w[i] > max) max = w[i];
    if (max <= 0) return rnd(unknown);
    const top = [];
    for (let i = 0; i < N * N; i++) if (w[i] >= max * 0.999) top.push(i);
    return rnd(top);
  }

  function getStats() {
    const s = Arcade.store.get(STATS_KEY, null) || {};
    for (const k of ORDER) s[k] = s[k] || { w: 0, l: 0 };
    s.shots = s.shots || 0; s.hits = s.hits || 0;
    return s;
  }

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();
    const debug = !!window.ARCADE_DEBUG;

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'nv-wrap';
    wrap.style.setProperty('--st', top + 'px');
    root.appendChild(wrap);

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    let G = null;
    let paused = false, aiTimer = 0, endTimer = 0, busy = false;
    let lastMe = -1, lastAi = -1, freshSunk = null;
    let built = null; // { phase, land, ... }
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const speed = () => (debug && dbg.fast ? 0.05 : 1);

    function paintBg() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
    }

    function save() {
      if (!G || G.phase === 'over') return;
      Arcade.store.set(SAVE_KEY, G);
    }

    function newGame() {
      clearTimers();
      let diff = Arcade.store.get(DIFF_KEY, 'normal');
      if (!DIFFS[diff]) diff = 'normal';
      G = {
        v: 1, phase: 'setup', diff,
        me: { ships: [], shots: new Array(N * N).fill(0) },
        foe: { ships: [], shots: new Array(N * N).fill(0) },
        turn: 'me', myShots: 0, myHits: 0, aiShots: 0, aiHits: 0,
      };
      lastMe = lastAi = -1; freshSunk = null; busy = false; paused = false;
      overlay.hidden = true;
      Arcade.store.set(SAVE_KEY, null);
      save();
      build();
    }

    function clearTimers() {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      aiTimer = 0; endTimer = 0;
    }

    // ---------- Layout ----------
    function sizes() {
      const w = view.w, h = view.h;
      const land = w > h * 1.15;
      const availH = h - top - 22 - 44 - 10 - 12 - 8;
      const availW = w - 16;
      if (G.phase === 'setup') {
        const B = Math.floor(Math.min(availW, 480, availH - 240) / 10) * 10;
        return { land, B: Math.max(200, B), s: 0 };
      }
      if (!land) {
        let B = Math.min(availW, 560);
        let s = Math.min(B * 0.46, 220);
        const need = B + 19 + 12 + s + 19;
        if (need > availH) { const k = availH / need; B *= k; s *= k; }
        return { land, B: Math.floor(B / 10) * 10, s: Math.floor(s / 10) * 10 };
      }
      const B = Math.min(availH - 19, availW * 0.5, 560);
      const s = Math.min(B * 0.7, availW - B - 12 - 12 - 160);
      return { land, B: Math.floor(B / 10) * 10, s: Math.max(100, Math.floor(s / 10) * 10) };
    }

    function boardHTML(cls) {
      return `<div class="nv-board ${cls}"><div class="nv-sea"></div><div class="nv-ships"></div><div class="nv-cells"></div></div>`;
    }

    function build() {
      const z = sizes();
      wrap.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'nv-head';
      head.innerHTML = '<div class="nv-status"></div>';
      wrap.appendChild(head);
      const main = document.createElement('div');
      main.className = 'nv-main' + (z.land && G.phase !== 'setup' ? ' land' : '');
      wrap.appendChild(main);
      built = { z, status: head.firstChild, main, phase: G.phase };

      if (G.phase === 'setup') {
        main.innerHTML = `
          <div class="nv-box"><div class="nv-label">A tua frota</div>${boardHTML('mine')}</div>
          <div class="nv-setup">
            <div class="nv-chips"></div>
            <div class="nv-hint">Toca para pôr · toca no barco para rodar · mantém premido para tirar</div>
            <div class="nv-seg">${ORDER.map(k => `<button class="nv-btn" data-d="${k}">${DIFFS[k]}</button>`).join('')}</div>
            <div class="nv-seg">
              <button class="nv-btn" data-a="shuffle">Baralhar</button>
              <button class="nv-btn" data-a="clear">Limpar</button>
              <button class="nv-btn go" data-a="start">Começar</button>
            </div>
          </div>`;
        built.big = main.querySelector('.nv-board');
        built.bigBox = built.big.parentNode;
        built.chips = main.querySelector('.nv-chips');
        main.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
          G.diff = b.dataset.d; Arcade.store.set(DIFF_KEY, G.diff); save(); render();
        });
        main.querySelector('[data-a=shuffle]').onclick = () => { G.me.ships = randomFleet(); save(); render(); };
        main.querySelector('[data-a=clear]').onclick = () => { G.me.ships = []; save(); render(); };
        main.querySelector('[data-a=start]').onclick = startBattle;
        sizeBoard(built.big, z.B);
      } else {
        main.innerHTML = `
          <div class="nv-box"><div class="nv-label">Frota inimiga</div>${boardHTML('target')}</div>
          <div class="nv-sub">
            <div class="nv-box"><div class="nv-label">A tua frota</div>${boardHTML('small mine')}</div>
            <div class="nv-panel"></div>
          </div>`;
        built.big = main.querySelector('.nv-board.target');
        built.bigBox = built.big.parentNode;
        built.small = main.querySelector('.nv-board.small');
        built.panel = main.querySelector('.nv-panel');
        sizeBoard(built.big, z.B);
        sizeBoard(built.small, z.s);
        built.panel.style.width = (z.land ? Math.min(220, view.w - 16 - z.B - z.s - 24) : Math.max(120, Math.min(220, view.w - 16 - z.s - 12))) + 'px';
      }
      built.big.addEventListener('pointerdown', onDown);
      built.big.addEventListener('pointerup', onUp);
      built.big.addEventListener('pointercancel', onCancel);
      built.big.addEventListener('pointerleave', onCancel);
      render();
    }

    function sizeBoard(el, px) {
      el.style.width = px + 'px';
      el.style.height = px + 'px';
      el.querySelector('.nv-sea').style.backgroundSize = `${px / 5}px ${px / 10 * 0.9}px, 100% ${px / 10}px`;
    }

    function drawBoard(el, side, opts) {
      const px = parseFloat(el.style.width), cs = px / N;
      const shipsEl = el.querySelector('.nv-ships'), cellsEl = el.querySelector('.nv-cells');
      let sh = '';
      for (const s of side.ships) {
        const sunk = G.phase !== 'setup' && isSunk(side, s);
        if (!opts.showShips && !sunk && !opts.reveal) continue;
        const size = FLEET[s.k].size, pad = Math.max(1.5, cs * 0.1);
        const cls = sunk ? 'sunk' : (opts.showShips ? '' : 'hidden');
        const fresh = freshSunk && freshSunk.side === side && freshSunk.k === s.k ? ' fresh' : '';
        sh += `<div class="nv-ship ${s.h ? 'h' : 'v'} ${cls}${fresh}" style="left:${s.x * cs + pad}px;top:${s.y * cs + pad}px;` +
          `width:${(s.h ? size : 1) * cs - 2 * pad}px;height:${(s.h ? 1 : size) * cs - 2 * pad}px"></div>`;
      }
      shipsEl.innerHTML = sh;
      const sunkSet = new Set();
      if (G.phase !== 'setup') for (const s of side.ships) if (isSunk(side, s)) cellsOf(s).forEach(i => sunkSet.add(i));
      let ch = '';
      for (let i = 0; i < N * N; i++) {
        const v = side.shots[i];
        let c = v === 1 ? 'miss' : v === 2 ? 'hit' : 'open';
        if (v === 2 && sunkSet.has(i)) c += ' sk';
        if (i === opts.last) c += ' anim last';
        ch += `<div class="nv-c ${c}"></div>`;
      }
      cellsEl.innerHTML = ch;
    }

    function pips(n) { return `<span class="nv-pips">${'<i></i>'.repeat(n)}</span>`; }

    function render() {
      if (!G || !built) return;
      paintBg();
      if (G.phase === 'setup') {
        const placed = new Set(G.me.ships.map(s => s.k));
        const next = FLEET.findIndex((_, k) => !placed.has(k));
        built.status.innerHTML = next < 0
          ? `Frota pronta!<small>Escolhe a dificuldade e carrega em Começar</small>`
          : `Coloca o ${FLEET[next].name} (${FLEET[next].size})<small>Ou carrega em Baralhar para pôr tudo ao acaso</small>`;
        built.chips.innerHTML = FLEET.map((f, k) =>
          `<span class="nv-chip ${placed.has(k) ? 'done' : k === next ? 'next' : ''}">${f.name} ${pips(f.size)}</span>`).join('');
        built.main.querySelectorAll('[data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === G.diff));
        built.main.querySelector('[data-a=start]').disabled = next >= 0;
        drawBoard(built.big, G.me, { showShips: true, last: -1 });
        return;
      }
      const over = G.phase === 'over';
      drawBoard(built.big, G.foe, { showShips: false, reveal: over, last: lastMe });
      drawBoard(built.small, G.me, { showShips: true, last: lastAi });
      built.big.classList.toggle('wait', G.turn !== 'me' && !over);
      const foeLeft = G.foe.ships.filter(s => !isSunk(G.foe, s)).length;
      const meLeft = G.me.ships.filter(s => !isSunk(G.me, s)).length;
      const acc = G.myShots ? Math.round(G.myHits / G.myShots * 100) : 0;
      if (!over) {
        built.status.innerHTML = G.turn === 'me'
          ? `A tua vez<small>Toca numa casa da frota inimiga · ${DIFFS[G.diff]}</small>`
          : `O computador está a apontar…<small>Aguarda o tiro dele · ${DIFFS[G.diff]}</small>`;
      }
      built.panel.innerHTML = `
        <div class="nv-row"><span>Tiros</span><b>${G.myShots}</b></div>
        <div class="nv-row"><span>Precisão</span><b>${acc}%</b></div>
        <div class="nv-row"><span>Os teus barcos</span><b>${meLeft}/5</b></div>
        <div class="nv-fleet">${G.foe.ships.slice().sort((a, b) => a.k - b.k).map(s =>
          `<div class="nv-fl ${isSunk(G.foe, s) ? 'gone' : ''}">${pips(FLEET[s.k].size)}${FLEET[s.k].name}</div>`).join('')}</div>
        <div class="nv-row"><span>Inimigos a flutuar</span><b>${foeLeft}/5</b></div>`;
    }

    function toast(box, text, cls) {
      box.querySelectorAll('.nv-toast').forEach(o => o.remove());
      const t = document.createElement('div');
      t.className = 'nv-toast ' + (cls || '');
      t.textContent = text;
      box.appendChild(t);
      later(() => t.remove(), 1800);
    }

    // ---------- Entrada ----------
    let press = null;
    function cellFromEvent(e) {
      const r = built.big.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / (r.width / N)), y = Math.floor((e.clientY - r.top) / (r.height / N));
      return inb(x, y) ? idx(x, y) : -1;
    }
    function onDown(e) {
      const i = cellFromEvent(e);
      if (i < 0 || paused) return;
      if (G.phase === 'setup') {
        const s = shipAt(G.me, i);
        press = { id: e.pointerId, i, done: false, t: 0 };
        if (s) press.t = later(() => { // toque longo: tira o barco
          press.done = true;
          G.me.ships = G.me.ships.filter(o => o !== s);
          Arcade.buzz(20); save(); render();
        }, LONG_MS);
      } else if (G.phase === 'play') {
        playerShot(i);
      }
    }
    function onUp(e) {
      if (!press || press.id !== e.pointerId) return;
      const p = press; press = null;
      clearTimeout(p.t); timers.delete(p.t);
      if (p.done) return;
      if (cellFromEvent(e) !== p.i) return;
      setupTap(p.i);
    }
    function onCancel(e) {
      if (!press || press.id !== e.pointerId) return;
      clearTimeout(press.t); timers.delete(press.t);
      press = null;
    }

    // Tenta posições que continuem a cobrir a casa tocada.
    function placeCovering(k, i, horizFirst) {
      const size = FLEET[k].size, x = i % N, y = (i / N) | 0;
      for (const h of [horizFirst, !horizFirst]) {
        for (let o = 0; o < size; o++) {
          const s = { k, h, x: h ? x - o : x, y: h ? y : y - o };
          if (fits(G.me.ships, s)) return s;
        }
      }
      return null;
    }

    function setupTap(i) {
      const s = shipAt(G.me, i);
      if (s) {
        const size = FLEET[s.k].size;
        // roda à volta da casa onde o barco começa; se não couber, à volta da casa tocada
        let r = { k: s.k, h: !s.h, x: s.x, y: s.y };
        if (!fits(G.me.ships, r)) {
          r = null;
          const x = i % N, y = (i / N) | 0;
          for (let o = 0; o < size && !r; o++) {
            const t = { k: s.k, h: !s.h, x: !s.h ? x - o : x, y: !s.h ? y : y - o };
            if (fits(G.me.ships, t)) r = t;
          }
        }
        if (!r) { toast(built.bigBox, 'Não há espaço para rodar', 'info'); Arcade.buzz(15); return; }
        Object.assign(s, r);
      } else {
        const placed = new Set(G.me.ships.map(o => o.k));
        const k = FLEET.findIndex((_, j) => !placed.has(j));
        if (k < 0) return;
        const p = placeCovering(k, i, true);
        if (!p) { toast(built.bigBox, 'Não cabe aqui', 'info'); Arcade.buzz(15); return; }
        G.me.ships.push(p);
      }
      save();
      render();
    }

    function startBattle() {
      if (G.me.ships.length !== FLEET.length) return;
      G.foe.ships = randomFleet();
      G.phase = 'play';
      G.turn = 'me';
      Arcade.store.set(DIFF_KEY, G.diff);
      save();
      build();
    }

    function shoot(side, i) {
      side.shots[i] = 1;
      const s = shipAt(side, i);
      if (!s) return { hit: false };
      side.shots[i] = 2;
      return { hit: true, sunk: isSunk(side, s) ? s : null, win: allSunk(side) };
    }

    function playerShot(i) {
      if (G.turn !== 'me' || busy || G.foe.shots[i] !== 0) return;
      const r = shoot(G.foe, i);
      G.myShots++;
      if (r.hit) G.myHits++;
      lastMe = i;
      freshSunk = r.sunk ? { side: G.foe, k: r.sunk.k } : null;
      if (r.hit) Arcade.buzz(r.sunk ? 60 : 25);
      if (r.win) { render(); return finish(true); }
      G.turn = 'ai';
      save();
      render();
      if (r.sunk) toast(built.bigBox, `Afundaste o ${FLEET[r.sunk.k].name}!`);
      else toast(built.bigBox, r.hit ? 'Fogo!' : 'Água', r.hit ? '' : 'info');
      scheduleAI(r.sunk ? 1300 : 850);
    }

    function scheduleAI(ms) {
      if (aiTimer) { clearTimeout(aiTimer); timers.delete(aiTimer); }
      aiTimer = later(aiTurn, ms * speed());
    }

    function aiTurn() {
      aiTimer = 0;
      if (paused || G.phase !== 'play' || G.turn !== 'ai') return;
      const i = aiPick(G.diff, G.me);
      const r = shoot(G.me, i);
      G.aiShots++;
      if (r.hit) G.aiHits++;
      lastAi = i;
      freshSunk = r.sunk ? { side: G.me, k: r.sunk.k } : null;
      if (r.win) { render(); return finish(false); }
      G.turn = 'me';
      save();
      render();
      if (r.hit) {
        Arcade.buzz(40);
        built.small.classList.remove('shake'); void built.small.offsetWidth; built.small.classList.add('shake');
      }
      if (r.sunk) toast(built.bigBox, `Afundaram o teu ${FLEET[r.sunk.k].name}!`, 'bad');
      else if (r.hit) toast(built.bigBox, 'Atingiram um barco teu!', 'bad');
    }

    function finish(won) {
      G.phase = 'over';
      Arcade.store.set(SAVE_KEY, null);
      const st = getStats();
      st[G.diff][won ? 'w' : 'l']++;
      st.shots += G.myShots; st.hits += G.myHits;
      Arcade.store.set(STATS_KEY, st);
      built.status.innerHTML = won ? 'Vitória!<small>A frota inimiga foi ao fundo</small>' : 'Derrota<small>Vê onde estavam os barcos inimigos</small>';
      render();
      toast(built.bigBox, won ? 'Frota inimiga afundada!' : 'A tua frota afundou', won ? '' : 'bad');
      endTimer = later(() => showOver(won, st), 1700 * speed());
    }

    const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    function showOver(won, st) {
      wrap.querySelectorAll('.nv-toast').forEach(o => o.remove());
      const acc = G.myShots ? Math.round(G.myHits / G.myShots * 100) : 0;
      const tot = ORDER.reduce((a, k) => a + st[k].w, 0), totL = ORDER.reduce((a, k) => a + st[k].l, 0);
      const tAcc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
      const meLeft = G.me.ships.filter(s => !isSunk(G.me, s)).length;
      overlay.innerHTML = `
        <h2>${won ? 'Vitória!' : 'Derrota'}</h2>
        <p>${DIFFS[G.diff]}: ${pl(st[G.diff].w, 'vitória', 'vitórias')}, ${pl(st[G.diff].l, 'derrota', 'derrotas')}</p>
        <div class="stats">
          <div><b>${G.myShots}</b><span>tiros</span></div>
          <div><b>${acc}%</b><span>precisão</span></div>
          <div><b>${meLeft}/5</b><span>barcos salvos</span></div>
        </div>
        <p>Total: ${pl(tot, 'vitória', 'vitórias')} · ${pl(totL, 'derrota', 'derrotas')} · precisão média ${tAcc}%</p>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = newGame;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    // ---------- Pausa / retomar ----------
    function pause() {
      if (!G || G.phase === 'over' || paused) return;
      paused = true;
      if (aiTimer) { clearTimeout(aiTimer); timers.delete(aiTimer); aiTimer = 0; }
      save();
      const acc = G.myShots ? Math.round(G.myHits / G.myShots * 100) : 0;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${G.phase === 'setup' ? 'A preparar a frota' : `${DIFFS[G.diff]} · ${G.myShots} tiros · ${acc}% de precisão`}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = resume;
      overlay.querySelector('[data-a=restart]').onclick = newGame;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    function resume() {
      paused = false;
      overlay.hidden = true;
      if (G.phase === 'play' && G.turn === 'ai') scheduleAI(600);
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', onVis);

    function offerResume(data) {
      G = data;
      build();
      paused = true;
      const foeLeft = G.foe.ships.filter(s => !isSunk(G.foe, s)).length;
      const meLeft = G.me.ships.filter(s => !isSunk(G.me, s)).length;
      overlay.innerHTML = `
        <h2>Partida guardada</h2>
        <p>${DIFFS[G.diff]}</p>
        <div class="stats">
          <div><b>${G.myShots}</b><span>tiros</span></div>
          <div><b>${meLeft}/5</b><span>os teus barcos</span></div>
          <div><b>${foeLeft}/5</b><span>inimigos</span></div>
        </div>
        <button class="btn primary" data-a="go">Continuar partida</button>
        <button class="btn center" data-a="new">Nova partida</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = resume;
      overlay.querySelector('[data-a=new]').onclick = newGame;
    }

    let lastW = 0, lastH = 0;
    const onResize = () => {
      if (view.w === lastW && view.h === lastH) return;
      lastW = view.w; lastH = view.h;
      if (G) build();
    };
    // setupCanvas regista o seu resize primeiro, por isso view já está atualizado aqui
    window.addEventListener('resize', onResize);

    const dbg = { fast: false };
    if (debug) {
      Object.defineProperties(dbg, Object.getOwnPropertyDescriptors({
        get G() { return G; },
        aiPick, cellsOf, FLEET,
        tapCell(i) { // centro de uma casa da grelha grande, em píxeis do ecrã
          const r = built.big.getBoundingClientRect(), cs = r.width / N;
          return { x: r.left + (i % N + 0.5) * cs, y: r.top + (((i / N) | 0) + 0.5) * cs };
        },
      }));
      window.__naval = dbg;
    }

    const saved = Arcade.store.get(SAVE_KEY, null);
    lastW = view.w; lastH = view.h;
    if (saved && saved.v === 1 && saved.phase === 'play') offerResume(saved);
    else if (saved && saved.v === 1 && saved.phase === 'setup') { G = saved; build(); }
    else newGame();

    return {
      destroy() {
        save();
        clearTimers();
        disposeCanvas();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (window.__naval === dbg) delete window.__naval;
      },
    };
  }

  Arcade.register({
    id: 'naval',
    title: 'Batalha Naval',
    icon: '🚢',
    color: '#45aaf2',
    desc: 'Esconde a tua frota e afunda a do computador, tiro a tiro.',
    best: () => {
      const s = getStats();
      const w = ORDER.reduce((a, k) => a + s[k].w, 0);
      if (!s.shots) return '—';
      return `${w} ${w === 1 ? 'vitória' : 'vitórias'} · ${Math.round(s.hits / s.shots * 100)}% precisão`;
    },
    create,
  });
})();
