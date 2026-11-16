// Fusão: desliza o tabuleiro 4x4 e junta peças iguais para duplicarem de valor.
(function () {
  const N = 4;
  const SLIDE_MS = 120;

  // Paleta própria: do índigo ao turquesa, verdes, âmbar, corais, magenta e céu.
  const COLORS = {
    2: ['#363c8c', '#e2e5ff'],
    4: ['#5045b8', '#f1efff'],
    8: ['#16a59c', '#03211f'],
    16: ['#22c27a', '#03230f'],
    32: ['#9bd63b', '#1b2600'],
    64: ['#ffd166', '#2b1d00'],
    128: ['#ff9f43', '#2b1300'],
    256: ['#ff6b6b', '#2b0505'],
    512: ['#e84393', '#ffffff'],
    1024: ['#9b59f6', '#ffffff'],
    2048: ['#3fa9f5', '#ffffff'],
  };
  const BEYOND = ['#f5f6ff', '#0f1020'];

  const CSS = `
  .mg-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 12px calc(env(safe-area-inset-bottom) + 16px); gap: 14px; }
  .mg-head { width:100%; max-width:520px; height:44px; padding-right:60px; display:flex; align-items:center; gap:8px; }
  .mg-title { font-size:24px; font-weight:800; flex:1; letter-spacing:.01em; }
  .mg-box { background:#1a1c33; border-radius:10px; padding:4px 10px; min-width:64px; text-align:center; }
  .mg-box span { display:block; font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#9aa0c8; }
  .mg-box b { font-size:17px; }
  .mg-board { position:relative; background:#1a1c33; border-radius:14px; flex:none; margin-top:auto; }
  .mg-slot { position:absolute; background:#23264a; border-radius:10px; }
  .mg-tile { position:absolute; left:0; top:0; transition: transform ${SLIDE_MS}ms ease-in-out; will-change: transform; }
  .mg-tile.nt { transition:none; }
  .mg-in { width:100%; height:100%; border-radius:10px; display:grid; place-items:center; font-weight:800; }
  .mg-in.appear { animation: mg-appear .16s ease-out; }
  .mg-in.pop { animation: mg-pop .18s ease-out; }
  @keyframes mg-appear { from { transform:scale(.2); opacity:0 } to { transform:scale(1); opacity:1 } }
  @keyframes mg-pop { 0% { transform:scale(1) } 45% { transform:scale(1.18) } 100% { transform:scale(1) } }
  .mg-bar { display:flex; gap:10px; width:100%; max-width:520px; }
  .mg-act { flex:1; height:50px; border-radius:14px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:16px; font-weight:700; }
  .mg-act:disabled { opacity:.4; }
  .mg-act:active { transform:scale(.97); }
  .mg-hint { margin:0 0 auto; color:#9aa0c8; font-size:13px; }
  `;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'mg-wrap';
    wrap.style.setProperty('--st', top + 'px');
    wrap.innerHTML = `
      <div class="mg-head">
        <div class="mg-title">Fusão</div>
        <div class="mg-box"><span>Pontos</span><b data-k="score">0</b></div>
        <div class="mg-box"><span>Recorde</span><b data-k="best">0</b></div>
      </div>
      <div class="mg-board"></div>
      <div class="mg-bar">
        <button class="mg-act" data-a="undo">↶ Anular</button>
        <button class="mg-act" data-a="new">Novo jogo</button>
      </div>
      <p class="mg-hint">Desliza para juntar peças iguais.</p>`;
    root.appendChild(wrap);
    const board = wrap.querySelector('.mg-board');
    const scoreEl = wrap.querySelector('[data-k=score]');
    const bestEl = wrap.querySelector('[data-k=best]');
    const undoBtn = wrap.querySelector('[data-a=undo]');

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    // ---------- Estado ----------
    let cells = new Array(N * N).fill(null); // { id, v, el, inner }
    let score = 0, best = Arcade.store.get('merge:best', 0), prev = null, won = false, over = false;
    let startBest = best; // recorde no início desta partida
    let nextId = 1;
    let pending = []; // acabamentos das animações em curso
    let pendingTimer = 0;
    let geo = { size: 0, gap: 0, cell: 0 };

    function values() { return cells.map(t => (t ? t.v : 0)); }

    function save() {
      if (over) { Arcade.store.set('merge:state', null); return; }
      Arcade.store.set('merge:state', { v: values(), s: score, p: prev, w: won, b: startBest });
    }

    // ---------- Desenho ----------
    function layout() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
      const size = Math.floor(Math.max(200, Math.min(view.w - 24, view.h - top - 22 - 44 - 64 - 90, 520)));
      const gap = Math.round(size * 0.028);
      geo = { size, gap, cell: (size - gap * (N + 1)) / N };
      board.style.width = board.style.height = size + 'px';
      board.querySelectorAll('.mg-slot').forEach(s => s.remove());
      for (let i = 0; i < N * N; i++) {
        const s = document.createElement('div');
        s.className = 'mg-slot';
        const [x, y] = pos(i);
        s.style.cssText = `left:${x}px;top:${y}px;width:${geo.cell}px;height:${geo.cell}px`;
        board.insertBefore(s, board.firstChild);
      }
      for (let i = 0; i < N * N; i++) if (cells[i] && cells[i].el) place(cells[i], i, false);
    }

    function pos(i) {
      const r = Math.floor(i / N), c = i % N;
      return [geo.gap + c * (geo.cell + geo.gap), geo.gap + r * (geo.cell + geo.gap)];
    }

    function paintTile(t) {
      const [bg, fg] = COLORS[t.v] || BEYOND;
      const digits = String(t.v).length;
      t.inner.style.background = bg;
      t.inner.style.color = fg;
      t.inner.style.fontSize = Math.round(geo.cell * (digits <= 2 ? 0.46 : digits === 3 ? 0.38 : digits === 4 ? 0.3 : 0.24)) + 'px';
      t.inner.textContent = t.v;
    }

    function place(t, i, animate) {
      const [x, y] = pos(i);
      t.el.classList.toggle('nt', !animate);
      t.el.style.width = t.el.style.height = geo.cell + 'px';
      t.el.style.transform = `translate(${x}px,${y}px)`;
      paintTile(t);
    }

    function makeTile(v, i, anim) {
      const el = document.createElement('div');
      el.className = 'mg-tile nt';
      const inner = document.createElement('div');
      inner.className = 'mg-in' + (anim ? ' ' + anim : '');
      el.appendChild(inner);
      board.appendChild(el);
      const t = { id: nextId++, v, el, inner };
      place(t, i, false);
      return t;
    }

    function rebuild(vals) {
      flush();
      board.querySelectorAll('.mg-tile').forEach(e => e.remove());
      cells = vals.map((v, i) => (v ? makeTile(v, i, 'appear') : null));
    }

    function hud() {
      scoreEl.textContent = score;
      bestEl.textContent = best;
      undoBtn.disabled = !prev || over;
    }

    // ---------- Lógica ----------
    function spawn() {
      const empty = [];
      cells.forEach((t, i) => { if (!t) empty.push(i); });
      if (!empty.length) return null;
      const i = empty[Math.floor(Math.random() * empty.length)];
      return { i, v: Math.random() < 0.9 ? 2 : 4 };
    }

    function lines(dir) {
      const out = [];
      for (let a = 0; a < N; a++) {
        const line = [];
        for (let b = 0; b < N; b++) {
          if (dir === 'left') line.push(a * N + b);
          else if (dir === 'right') line.push(a * N + (N - 1 - b));
          else if (dir === 'up') line.push(b * N + a);
          else line.push((N - 1 - b) * N + a);
        }
        out.push(line);
      }
      return out;
    }

    function canMove() {
      for (let i = 0; i < N * N; i++) {
        if (!cells[i]) return true;
        const r = Math.floor(i / N), c = i % N;
        if (c < N - 1 && cells[i + 1] && cells[i + 1].v === cells[i].v) return true;
        if (r < N - 1 && cells[i + N] && cells[i + N].v === cells[i].v) return true;
      }
      return false;
    }

    function flush() {
      clearTimeout(pendingTimer);
      const p = pending;
      pending = [];
      p.forEach(f => f());
    }

    function move(dir) {
      if (over || !overlay.hidden) return;
      flush();
      const before = { v: values(), s: score };
      const next = new Array(N * N).fill(null);
      const dying = [], merged = [];
      let moved = false, gained = 0;

      for (const line of lines(dir)) {
        const tiles = line.map(i => cells[i]).filter(Boolean);
        const res = [];
        for (const t of tiles) {
          const last = res[res.length - 1];
          if (last && !last.justMerged && last.v === t.v) {
            last.v *= 2;
            last.justMerged = true;
            gained += last.v;
            dying.push({ t, into: last });
            merged.push(last);
          } else res.push(t);
        }
        res.forEach((t, k) => { next[line[k]] = t; });
        line.forEach((i, k) => {
          const was = cells[i], now = next[i];
          if (was !== now) moved = true;
        });
        if (tiles.length !== res.length) moved = true;
      }
      if (!moved) return;

      prev = before;
      score += gained;
      if (score > best) { best = score; Arcade.store.set('merge:best', best); }
      cells = next;

      // Animação: todas deslizam; as que morrem vão para a casa da que sobrevive.
      cells.forEach((t, i) => {
        if (!t) return;
        const [x, y] = pos(i);
        t.el.classList.remove('nt');
        t.el.style.transform = `translate(${x}px,${y}px)`;
        t._idx = i;
      });
      for (const d of dying) {
        const [x, y] = pos(d.into._idx);
        d.t.el.classList.remove('nt');
        d.t.el.style.transform = `translate(${x}px,${y}px)`;
        d.t.el.style.zIndex = 0;
      }
      merged.forEach(t => { t.justMerged = false; t.inner.textContent = t.v / 2; });

      const sp = spawn();
      if (sp) cells[sp.i] = { placeholder: true, v: sp.v }; // reserva lógica
      pending.push(() => {
        dying.forEach(d => d.t.el.remove());
        merged.forEach(t => {
          paintTile(t);
          t.el.style.zIndex = 1;
          t.inner.classList.remove('pop', 'appear');
          void t.inner.offsetWidth;
          t.inner.classList.add('pop');
        });
        if (sp && cells[sp.i] && cells[sp.i].placeholder) cells[sp.i] = makeTile(sp.v, sp.i, 'appear');
      });
      pendingTimer = setTimeout(flush, SLIDE_MS);

      if (gained >= 128) Arcade.buzz(15);
      if (!won && cells.some(t => t && t.v >= 2048)) { won = true; setTimeout(showWin, SLIDE_MS + 200); }
      if (!canMove()) { over = true; setTimeout(gameOver, SLIDE_MS + 450); }
      hud();
      save();
    }

    function newGame() {
      flush();
      over = false; won = false; prev = null; score = 0; startBest = best;
      overlay.hidden = true;
      rebuild(new Array(N * N).fill(0));
      for (let k = 0; k < 2; k++) { const s = spawn(); cells[s.i] = makeTile(s.v, s.i, 'appear'); }
      hud();
      save();
    }

    function undo() {
      if (!prev) return;
      const p = prev;
      prev = null;
      over = false;
      overlay.hidden = true;
      score = p.s;
      rebuild(p.v);
      hud();
      save();
    }

    // ---------- Ecrãs ----------
    function showOverlay(html, actions) {
      overlay.innerHTML = html;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = actions[b.dataset.a]; });
    }

    function maxTile() { return Math.max(0, ...values()); }

    function gameOver() {
      if (!over) return;
      const record = score > startBest;
      showOverlay(`
        <h2>${record ? 'Novo recorde!' : 'Sem jogadas'}</h2>
        <p>${record ? 'Nunca tinhas ido tão longe.' : `Recorde: ${best} pontos`}</p>
        <div class="stats">
          <div><b>${score}</b><span>pontos</span></div>
          <div><b>${maxTile()}</b><span>maior peça</span></div>
          <div><b>${best}</b><span>recorde</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        ${prev ? '<button class="btn center" data-a="undo">Anular última jogada</button>' : ''}
        <button class="btn center" data-a="menu">Menu</button>`,
        { again: newGame, undo, menu: host.exit });
      hud();
      save();
    }

    function showWin() {
      if (over) return;
      showOverlay(`
        <h2>Chegaste aos 2048!</h2>
        <p>Podes continuar a fundir peças.</p>
        <button class="btn primary" data-a="go">Continuar a jogar</button>
        <button class="btn center" data-a="new">Novo jogo</button>
        <button class="btn center" data-a="menu">Menu</button>`,
        { go: () => { overlay.hidden = true; }, new: newGame, menu: host.exit });
    }

    function pause() {
      if (!overlay.hidden || over) return;
      showOverlay(`
        <h2>Pausa</h2>
        <p>${score} pontos · maior peça ${maxTile()}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="new">Novo jogo</button>
        <button class="btn center" data-a="menu">Menu</button>`,
        { go: () => { overlay.hidden = true; }, new: newGame, menu: host.exit });
    }
    pauseBtn.onclick = pause;
    undoBtn.onclick = undo;
    wrap.querySelector('[data-a=new]').onclick = newGame;

    // ---------- Entrada ----------
    let sw = null;
    const onDown = e => {
      if (e.target.closest('button')) return;
      sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const onUp = e => {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      sw = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'right' : 'left');
      else move(dy > 0 ? 'down' : 'up');
    };
    const onCancel = () => { sw = null; };
    const KEYS = { arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
    const onKey = e => {
      const k = e.key.toLowerCase();
      if (KEYS[k]) { e.preventDefault(); move(KEYS[k]); }
      else if (k === 'z' || k === 'backspace') undo();
    };
    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);

    // ---------- Arranque ----------
    layout();
    const saved = Arcade.store.get('merge:state', null);
    if (saved && Array.isArray(saved.v) && saved.v.length === N * N && saved.v.some(v => v)) {
      score = saved.s || 0; prev = saved.p || null; won = !!saved.w; startBest = saved.b ?? best;
      rebuild(saved.v);
      if (!canMove()) { over = true; setTimeout(gameOver, 300); }
      hud();
    } else newGame();

    return {
      destroy() {
        flush();
        save();
        disposeCanvas();
        root.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', layout);
      },
    };
  }

  Arcade.register({
    id: 'merge',
    title: 'Fusão',
    icon: '🔢',
    color: '#16a59c',
    desc: 'Desliza e funde peças iguais até onde conseguires.',
    best: () => Arcade.store.get('merge:best', 0) + ' pts',
    create,
  });
})();
