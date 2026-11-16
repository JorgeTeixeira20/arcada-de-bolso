// Campo Minado: revela o campo sem pisar minas. Toque = revelar, toque longo = bandeira.
(function () {
  const DIFFS = {
    easy:   { name: 'Fácil',   cols: 8,  rows: 10, mines: 10 },
    medium: { name: 'Médio',   cols: 9,  rows: 14, mines: 22 },
    hard:   { name: 'Difícil', cols: 11, rows: 18, mines: 40 },
  };
  const ORDER = ['easy', 'medium', 'hard'];
  const LONG_MS = 380;

  const CSS = `
  .mn-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 8px calc(env(safe-area-inset-bottom) + 14px); gap: 12px; }
  .mn-head { width:100%; max-width:560px; height:44px; padding-right:60px; display:flex; align-items:center; gap:8px; }
  .mn-pill { background:#1a1c33; border-radius:12px; height:40px; padding:0 12px; display:flex; align-items:center; gap:8px; font-weight:800; font-size:18px; font-variant-numeric:tabular-nums; }
  .mn-diff { flex:1; color:#9aa0c8; font-size:14px; font-weight:600; text-align:center; }
  .mn-ico-mine { width:14px; height:14px; border-radius:50%; background:#ff5a6e; box-shadow: 0 0 0 3px #ff5a6e44; }
  .mn-ico-clock { width:14px; height:14px; border-radius:50%; border:3px solid #ffcc4d; }
  .mn-board { display:grid; margin:auto 0; gap:2px; background:#0f1020; touch-action:none; }
  .mn-c { position:relative; border-radius:6px; background:#3a3f7a; box-shadow: inset 0 -3px 0 #2a2e5e;
    display:grid; place-items:center; font-weight:800; font-variant-numeric:tabular-nums; }
  .mn-c.press { background:#4a5094; filter:brightness(1.25); }
  .mn-c.open { background:#1b1d36; box-shadow:none; }
  .mn-c.n1 { color:#45aaf2; } .mn-c.n2 { color:#26de81; } .mn-c.n3 { color:#ff6b6b; } .mn-c.n4 { color:#b388ff; }
  .mn-c.n5 { color:#ff9f43; } .mn-c.n6 { color:#2bcbba; } .mn-c.n7 { color:#f8f8ff; } .mn-c.n8 { color:#ffd86b; }
  .mn-c.flag::before { content:''; position:absolute; left:38%; top:22%; width:3px; height:56%; background:#eef0ff; border-radius:2px; }
  .mn-c.flag::after { content:''; position:absolute; left:calc(38% + 3px); top:22%; border-style:solid; border-color:transparent transparent transparent #ffcc4d;
    border-width: calc(var(--cs) * .14) 0 calc(var(--cs) * .14) calc(var(--cs) * .3); }
  .mn-c.mine::before { content:''; width:46%; height:46%; border-radius:50%; background:#0f1020; box-shadow: 0 0 0 calc(var(--cs) * .06) #0f102088; }
  .mn-c.mine { background:#2a2d55; box-shadow:none; }
  .mn-c.mine::before { background:#ff9f43; box-shadow: 0 0 0 calc(var(--cs) * .06) #ff9f4355; }
  .mn-c.boom { background:#ff5a6e; }
  .mn-c.boom::before { background:#0f1020; box-shadow:none; }
  .mn-c.wrong::after { content:'✕'; position:absolute; inset:0; display:grid; place-items:center; color:#ff5a6e; font-size: calc(var(--cs) * .6); }
  .mn-c.reveal { animation: mn-rev .18s ease-out; }
  @keyframes mn-rev { from { transform:scale(.7); opacity:.3 } to { transform:scale(1); opacity:1 } }
  .mn-bar { display:flex; gap:10px; width:100%; max-width:420px; }
  .mn-btn { height:56px; border-radius:16px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:16px; font-weight:700;
    display:flex; align-items:center; justify-content:center; gap:10px; }
  .mn-btn:active { transform:scale(.97); }
  .mn-mode { flex:1; }
  .mn-mode.flagging { background:#ffcc4d; color:#1a1300; border-color:transparent; }
  .mn-new { width:110px; }
  .mn-mi { position:relative; width:22px; height:22px; }
  .mn-mi.dig { border-radius:6px; background:#3a3f7a; box-shadow: inset 0 -3px 0 #2a2e5e; }
  .mn-mi.fl::before { content:''; position:absolute; left:5px; top:2px; width:3px; height:18px; background:currentColor; border-radius:2px; }
  .mn-mi.fl::after { content:''; position:absolute; left:8px; top:2px; border-style:solid; border-color:transparent transparent transparent currentColor; border-width:6px 0 6px 12px; }
  `;

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'mn-wrap';
    wrap.style.setProperty('--st', top + 'px');
    wrap.innerHTML = `
      <div class="mn-head">
        <div class="mn-pill"><span class="mn-ico-mine"></span><span data-k="left">0</span></div>
        <div class="mn-diff" data-k="diff"></div>
        <div class="mn-pill"><span class="mn-ico-clock"></span><span data-k="time">0:00</span></div>
      </div>
      <div class="mn-board"></div>
      <div class="mn-bar">
        <button class="mn-btn mn-new" data-a="new">Novo</button>
        <button class="mn-btn mn-mode" data-a="mode"></button>
      </div>`;
    root.appendChild(wrap);
    const boardEl = wrap.querySelector('.mn-board');
    const leftEl = wrap.querySelector('[data-k=left]');
    const timeEl = wrap.querySelector('[data-k=time]');
    const diffEl = wrap.querySelector('[data-k=diff]');
    const modeBtn = wrap.querySelector('[data-a=mode]');

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
    let diff = Arcade.store.get('mines:lastDiff', 'easy');
    if (!DIFFS[diff]) diff = 'easy';
    let G = null; // { cols, rows, mines, cells[], started, over, opened, flags }
    let mode = 'open';
    let acc = 0, runFrom = 0; // cronómetro
    let els = [];

    function elapsed() { return acc + (runFrom ? performance.now() - runFrom : 0); }
    function runClock() { if (!runFrom && G && G.started && !G.over) runFrom = performance.now(); }
    function stopClock() { if (runFrom) { acc += performance.now() - runFrom; runFrom = 0; } }
    const tick = setInterval(() => { timeEl.textContent = fmt(elapsed()); }, 250);

    function newGame(d) {
      diff = d;
      Arcade.store.set('mines:lastDiff', d);
      const D = DIFFS[d];
      G = { cols: D.cols, rows: D.rows, mines: D.mines, started: false, over: false, opened: 0, flags: 0,
        cells: Array.from({ length: D.cols * D.rows }, () => ({ mine: false, n: 0, open: false, flag: false })) };
      acc = 0; runFrom = 0;
      mode = 'open';
      overlay.hidden = true;
      diffEl.textContent = D.name;
      buildBoard();
      hud();
    }

    function neighbors(i) {
      const { cols, rows } = G;
      const r = Math.floor(i / cols), c = i % cols, out = [];
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
      }
      return out;
    }

    // O primeiro toque nunca é mina (nem as casas à volta, para abrir uma zona).
    function placeMines(safe) {
      const banned = new Set([safe, ...neighbors(safe)]);
      const pool = [];
      G.cells.forEach((_, i) => { if (!banned.has(i)) pool.push(i); });
      if (pool.length < G.mines) { banned.clear(); banned.add(safe); pool.length = 0; G.cells.forEach((_, i) => { if (i !== safe) pool.push(i); }); }
      for (let k = 0; k < G.mines; k++) {
        const j = k + Math.floor(Math.random() * (pool.length - k));
        [pool[k], pool[j]] = [pool[j], pool[k]];
        G.cells[pool[k]].mine = true;
      }
      G.cells.forEach((c, i) => { c.n = neighbors(i).filter(j => G.cells[j].mine).length; });
      G.started = true;
      runClock();
    }

    function reveal(i, changed) {
      const c = G.cells[i];
      if (c.open || c.flag) return false;
      if (c.mine) return true;
      const stack = [i];
      while (stack.length) {
        const k = stack.pop();
        const cell = G.cells[k];
        if (cell.open || cell.flag) continue;
        cell.open = true;
        G.opened++;
        changed.push(k);
        if (cell.n === 0) for (const j of neighbors(k)) if (!G.cells[j].open && !G.cells[j].mine) stack.push(j);
      }
      return false;
    }

    function tap(i) {
      if (!G || G.over || !overlay.hidden) return;
      const c = G.cells[i];
      const changed = [];
      if (c.open) {
        // "Chord": com as bandeiras certas à volta, revela o resto.
        if (c.n === 0) return;
        const ns = neighbors(i);
        if (ns.filter(j => G.cells[j].flag).length !== c.n) return;
        let hit = -1;
        for (const j of ns) {
          if (G.cells[j].flag || G.cells[j].open) continue;
          if (G.cells[j].mine) { hit = j; break; }
          reveal(j, changed);
        }
        if (hit >= 0) return lose(hit);
      } else if (mode === 'flag') {
        return toggleFlag(i);
      } else {
        if (c.flag) return;
        if (!G.started) placeMines(i);
        if (reveal(i, changed)) return lose(i);
      }
      paint(changed, true);
      hud();
      if (G.opened === G.cells.length - G.mines) win();
    }

    function toggleFlag(i) {
      if (!G || G.over) return;
      const c = G.cells[i];
      if (c.open) return;
      c.flag = !c.flag;
      G.flags += c.flag ? 1 : -1;
      Arcade.buzz(12);
      paint([i]);
      hud();
    }

    // ---------- Desenho ----------
    function buildBoard() {
      boardEl.innerHTML = '';
      els = G.cells.map((_, i) => {
        const d = document.createElement('div');
        d.className = 'mn-c';
        d.dataset.i = i;
        boardEl.appendChild(d);
        return d;
      });
      layout();
    }

    function layout() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!G) return;
      const availW = view.w - 16, availH = view.h - top - 22 - 44 - 12 - 56 - 12 - 14 - 20;
      const cs = Math.floor(Math.max(16, Math.min((availW - (G.cols - 1) * 2) / G.cols, (availH - (G.rows - 1) * 2) / G.rows, 60)));
      boardEl.style.gridTemplateColumns = `repeat(${G.cols}, ${cs}px)`;
      boardEl.style.gridAutoRows = cs + 'px';
      boardEl.style.setProperty('--cs', cs + 'px');
      boardEl.style.fontSize = Math.round(cs * 0.55) + 'px';
      paint(G.cells.map((_, i) => i));
    }

    function paint(list, anim) {
      for (const i of list) {
        const c = G.cells[i], d = els[i];
        let cls = 'mn-c';
        if (c.open) cls += ' open' + (c.n ? ' n' + c.n : '') + (anim ? ' reveal' : '');
        else if (c.flag) cls += ' flag';
        if (c.showMine) cls += ' mine';
        if (c.boom) cls += ' boom';
        if (c.wrong) cls += ' wrong flag';
        d.className = cls;
        d.textContent = c.open && c.n ? c.n : '';
      }
    }

    function hud() {
      leftEl.textContent = G ? G.mines - G.flags : 0;
      timeEl.textContent = fmt(elapsed());
      modeBtn.classList.toggle('flagging', mode === 'flag');
      modeBtn.innerHTML = mode === 'flag'
        ? '<span class="mn-mi fl"></span>Modo bandeira'
        : '<span class="mn-mi dig"></span>Modo revelar';
    }

    // ---------- Fim ----------
    function lose(hit) {
      G.over = true;
      stopClock();
      Arcade.buzz([60, 40, 90]);
      G.cells.forEach(c => {
        if (c.mine && !c.flag) c.showMine = true;
        if (!c.mine && c.flag) c.wrong = true;
      });
      G.cells[hit].boom = true;
      G.cells[hit].showMine = true;
      paint(G.cells.map((_, i) => i));
      hud();
      setTimeout(() => {
        if (!G.over || G.won) return;
        showOverlay(`
          <h2>Pisaste uma mina!</h2>
          <p>${DIFFS[diff].name} · ${Math.round(100 * G.opened / (G.cells.length - G.mines))}% limpo</p>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          <button class="btn center" data-a="diff">Mudar dificuldade</button>
          <button class="btn center" data-a="look">Ver o campo</button>
          <button class="btn center" data-a="menu">Menu</button>`,
          { again: () => newGame(diff), diff: chooseDiff, look: () => { overlay.hidden = true; }, menu: host.exit });
      }, 900);
    }

    function win() {
      G.over = true; G.won = true;
      stopClock();
      const t = elapsed();
      G.cells.forEach(c => { if (c.mine) c.flag = true; });
      G.flags = G.mines;
      paint(G.cells.map((_, i) => i));
      hud();
      const key = 'mines:best:' + diff;
      const best = Arcade.store.get(key, null);
      const record = best == null || t < best;
      if (record) Arcade.store.set(key, Math.round(t));
      Arcade.buzz(40);
      setTimeout(() => {
        showOverlay(`
          <h2>${record ? 'Novo recorde!' : 'Campo limpo!'}</h2>
          <p>${DIFFS[diff].name}${record ? '' : ` · melhor tempo ${fmt(best)}`}</p>
          <div class="stats">
            <div><b>${fmt(t)}</b><span>tempo</span></div>
            <div><b>${G.mines}</b><span>minas</span></div>
            <div><b>${fmt(record ? t : best)}</b><span>melhor</span></div>
          </div>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          <button class="btn center" data-a="diff">Mudar dificuldade</button>
          <button class="btn center" data-a="menu">Menu</button>`,
          { again: () => newGame(diff), diff: chooseDiff, menu: host.exit });
      }, 600);
    }

    function showOverlay(html, actions) {
      overlay.innerHTML = html;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = actions[b.dataset.a]; });
    }

    function chooseDiff() {
      stopClock();
      const opts = ORDER.map(k => {
        const D = DIFFS[k], b = Arcade.store.get('mines:best:' + k, null);
        return `<button class="btn" data-a="${k}"><b>${D.name}</b><small>${D.cols}×${D.rows} · ${D.mines} minas · melhor: ${b == null ? '—' : fmt(b)}</small></button>`;
      }).join('');
      const acts = { menu: host.exit };
      ORDER.forEach(k => { acts[k] = () => newGame(k); });
      if (G && G.started && !G.over) acts.back = resume;
      showOverlay(`
        <h2>Campo Minado</h2>
        <p>Escolhe a dificuldade</p>
        ${opts}
        ${acts.back ? '<button class="btn center" data-a="back">Voltar ao jogo</button>' : ''}
        <button class="btn center" data-a="menu">Menu</button>`, acts);
    }

    function resume() { overlay.hidden = true; runClock(); }

    function pause() {
      if (!overlay.hidden) return;
      stopClock();
      showOverlay(`
        <h2>Pausa</h2>
        <p>${DIFFS[diff].name} · ${fmt(elapsed())} · ${G.mines - G.flags} minas por marcar</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="new">Novo jogo</button>
        <button class="btn center" data-a="menu">Menu</button>`,
        { go: resume, new: chooseDiff, menu: host.exit });
    }
    pauseBtn.onclick = pause;
    modeBtn.onclick = () => { mode = mode === 'open' ? 'flag' : 'open'; hud(); };
    wrap.querySelector('[data-a=new]').onclick = chooseDiff;

    // O cronómetro não conta com a app em segundo plano.
    const onVis = () => { if (document.hidden && G && G.started && !G.over) pause(); };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Entrada ----------
    let press = null; // { id, i, x, y, timer, done }
    function endPress() {
      if (!press) return;
      clearTimeout(press.timer);
      els[press.i] && els[press.i].classList.remove('press');
      press = null;
    }
    const onDown = e => {
      const t = e.target.closest('.mn-c');
      if (!t || !G || G.over) return;
      e.preventDefault();
      endPress();
      const i = +t.dataset.i;
      if (e.button === 2) { toggleFlag(i); return; } // botão direito do rato
      press = { id: e.pointerId, i, x: e.clientX, y: e.clientY, done: false };
      if (!G.cells[i].open) t.classList.add('press');
      press.timer = setTimeout(() => {
        if (!press) return;
        press.done = true;
        els[press.i].classList.remove('press');
        if (!G.cells[press.i].open) toggleFlag(press.i);
      }, LONG_MS);
    };
    const onMove = e => {
      if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) endPress();
    };
    const onUp = e => {
      if (!press || e.pointerId !== press.id) return;
      const { i, done } = press;
      endPress();
      if (!done) tap(i);
    };
    const onCtx = e => e.preventDefault();
    const onKey = e => { if (e.key === 'f' || e.key === ' ') { mode = mode === 'open' ? 'flag' : 'open'; hud(); } };
    boardEl.addEventListener('pointerdown', onDown);
    boardEl.addEventListener('contextmenu', onCtx);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', endPress);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);

    newGame(diff);
    chooseDiff();

    return {
      destroy() {
        clearInterval(tick);
        endPress();
        disposeCanvas();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', endPress);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', layout);
      },
    };
  }

  Arcade.register({
    id: 'mines',
    title: 'Campo Minado',
    icon: '💣',
    color: '#ff9f43',
    desc: 'Usa os números para descobrir onde estão as minas.',
    best: () => {
      const parts = ORDER.map(k => {
        const b = Arcade.store.get('mines:best:' + k, null);
        return b == null ? null : `${DIFFS[k].name} ${fmt(b)}`;
      }).filter(Boolean);
      return parts.length ? parts.join(' · ') : '—';
    },
    create,
  });
})();
