// Sudoku: gerador próprio (solução única), notas a lápis, dicas e jogo guardado para continuar.
(function () {
  const DIFFS = {
    easy:   { name: 'Fácil',   clues: 38 },
    medium: { name: 'Médio',   clues: 30 },
    hard:   { name: 'Difícil', clues: 24 },
  };
  const ORDER = ['easy', 'medium', 'hard'];
  const HINTS = 3;
  const ROW = i => Math.floor(i / 9), COL = i => i % 9;
  const BOX = i => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

  // Vizinhos (mesma linha, coluna ou caixa) de cada casa.
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) p.push(j);
    PEERS.push(p);
  }

  // ---------- Gerador ----------
  // Resolve com máscaras de bits e "casa com menos candidatos primeiro". Conta até `limit` soluções.
  function solve(grid, limit, random, out) {
    const g = grid.slice();
    const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxes = new Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const b = 1 << v;
      if ((rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & b) return 0;
      rows[ROW(i)] |= b; cols[COL(i)] |= b; boxes[BOX(i)] |= b;
    }
    let count = 0;
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ~(rows[ROW(i)] | cols[COL(i)] | boxes[BOX(i)]) & 0x3fe;
        let n = 0;
        for (let x = m; x; x &= x - 1) n++;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best < 0) {
        count++;
        if (out && count === 1) out.push(...g);
        return count >= limit;
      }
      if (!bestN) return false;
      const cand = [];
      for (let v = 1; v <= 9; v++) if (bestMask & (1 << v)) cand.push(v);
      if (random) for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
      const r = ROW(best), c = COL(best), bx = BOX(best);
      for (const v of cand) {
        const b = 1 << v;
        g[best] = v; rows[r] |= b; cols[c] |= b; boxes[bx] |= b;
        if (rec()) return true;
        g[best] = 0; rows[r] &= ~b; cols[c] &= ~b; boxes[bx] &= ~b;
      }
      return false;
    }
    rec();
    return count;
  }

  function generate(diff) {
    const sol = [];
    solve(new Array(81).fill(0), 1, true, sol);
    const puz = sol.slice();
    const order = [...Array(81).keys()];
    for (let k = 80; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
    let clues = 81;
    const target = DIFFS[diff].clues;
    for (const i of order) {
      if (clues <= target) break;
      const v = puz[i];
      puz[i] = 0;
      if (solve(puz, 2, false) !== 1) puz[i] = v;
      else clues--;
    }
    return { puz, sol };
  }

  const CSS = `
  .sd-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 8px calc(env(safe-area-inset-bottom) + 14px); gap: 10px; }
  .sd-head { width:100%; max-width:520px; height:44px; padding-right:60px; display:flex; align-items:center; gap:10px; }
  .sd-title { font-size:22px; font-weight:800; }
  .sd-diff { color:#9aa0c8; font-size:14px; font-weight:600; flex:1; }
  .sd-time { background:#1a1c33; border-radius:12px; height:40px; padding:0 12px; display:flex; align-items:center; font-weight:800; font-size:18px; font-variant-numeric:tabular-nums; }
  .sd-board { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(3,minmax(0,1fr)); gap:3px; background:#6b70b8; border:3px solid #6b70b8; border-radius:10px; overflow:hidden; margin-top:auto; flex:none; }
  .sd-box { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(3,minmax(0,1fr)); gap:1px; background:#34386a; }
  .sd-c { position:relative; min-width:0; min-height:0; overflow:hidden; background:#16182e; display:grid; place-items:center; font-weight:700; color:#7fd6ff; font-variant-numeric:tabular-nums; }
  .sd-c.given { color:#eef0ff; }
  .sd-c.hint { color:#26de81; }
  .sd-c.peer { background:#1f2240; }
  .sd-c.same { background:#33386e; }
  .sd-c.sel { background:#4a4fa0; }
  .sd-c.err { color:#ff5a6e; }
  .sd-c.err.sel, .sd-c.err.same { color:#ff8a98; }
  .sd-c.done { animation: sd-done .4s ease-out; }
  @keyframes sd-done { 50% { background:#2bcbba; } }
  .sd-notes { position:absolute; inset:2px; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); font-weight:600; color:#aab0e0; }
  .sd-notes span { display:grid; place-items:center; line-height:1; }
  .sd-notes span.hl { color:#ffcc4d; }
  .sd-tools { display:flex; gap:8px; width:100%; max-width:520px; }
  .sd-tool { flex:1; height:54px; border-radius:14px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:13px; font-weight:700;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
  .sd-tool i { font-style:normal; font-size:19px; line-height:1; }
  .sd-tool.on { background:#ffcc4d; color:#1a1300; border-color:transparent; }
  .sd-tool:disabled { opacity:.4; }
  .sd-tool:active, .sd-num:active { transform:scale(.95); }
  .sd-pad { display:grid; grid-template-columns:repeat(9,1fr); gap:5px; width:100%; max-width:520px; margin-bottom:auto; }
  .sd-num { height:60px; border-radius:12px; border:0; background:#2c3170; color:#eef0ff; font:inherit; font-size:24px; font-weight:800; padding:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center; }
  .sd-num small { font-size:10px; color:#9aa0c8; font-weight:600; }
  .sd-num.full { opacity:.3; }
  .sd-pad.notes .sd-num { background:#3d3a2a; color:#ffcc4d; }
  `;

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor(s / 60) % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s % 60).padStart(2, '0');
  }

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'sd-wrap';
    wrap.style.setProperty('--st', top + 'px');
    let boxes = '';
    for (let b = 0; b < 9; b++) {
      let cs = '';
      for (let k = 0; k < 9; k++) {
        const i = (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3);
        cs += `<div class="sd-c" data-i="${i}"></div>`;
      }
      boxes += `<div class="sd-box">${cs}</div>`;
    }
    wrap.innerHTML = `
      <div class="sd-head">
        <div class="sd-title">Sudoku</div>
        <div class="sd-diff" data-k="diff"></div>
        <div class="sd-time" data-k="time">0:00</div>
      </div>
      <div class="sd-board">${boxes}</div>
      <div class="sd-tools">
        <button class="sd-tool" data-t="undo"><i>↶</i>Anular</button>
        <button class="sd-tool" data-t="erase"><i>⌫</i>Apagar</button>
        <button class="sd-tool" data-t="notes"><i>✎</i>Notas</button>
        <button class="sd-tool" data-t="hint"><i>?</i><span>Dica</span></button>
      </div>
      <div class="sd-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="sd-num" data-n="${n}">${n}<small></small></button>`).join('')}</div>`;
    root.appendChild(wrap);
    const boardEl = wrap.querySelector('.sd-board');
    const cellEls = [];
    wrap.querySelectorAll('.sd-c').forEach(e => { cellEls[+e.dataset.i] = e; });
    const timeEl = wrap.querySelector('[data-k=time]');
    const diffEl = wrap.querySelector('[data-k=diff]');
    const padEl = wrap.querySelector('.sd-pad');
    const numBtns = [...wrap.querySelectorAll('.sd-num')];
    const tool = n => wrap.querySelector(`[data-t=${n}]`);

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
    // S = { diff, puz[], sol[], vals[], notes[] (bits 1..9), hinted[], hints, time, sel, undo[] }
    let S = null;
    let notesMode = false;
    let showErr = Arcade.store.get('sudoku:showErr', true);
    let runFrom = 0;
    let won = false;

    function elapsed() { return S ? S.time + (runFrom ? performance.now() - runFrom : 0) : 0; }
    function runClock() { if (!runFrom && S && !won && overlay.hidden && !document.hidden) runFrom = performance.now(); }
    function stopClock() { if (runFrom && S) { S.time += performance.now() - runFrom; runFrom = 0; } }
    const tick = setInterval(() => {
      timeEl.textContent = fmt(elapsed());
    }, 250);
    const autosave = setInterval(() => { if (S && !won && runFrom) save(); }, 5000);

    function save() {
      if (!S) return;
      if (won) { Arcade.store.set('sudoku:state', null); return; }
      const t = elapsed();
      Arcade.store.set('sudoku:state', Object.assign({}, S, { time: Math.round(t) }));
    }

    function newGame(diff) {
      won = false;
      const { puz, sol } = generate(diff);
      S = { diff, puz, sol, vals: puz.slice(), notes: new Array(81).fill(0), hinted: new Array(81).fill(0),
        hints: HINTS, time: 0, sel: puz.indexOf(0), undo: [] };
      runFrom = 0;
      notesMode = false;
      Arcade.store.set('sudoku:lastDiff', diff);
      overlay.hidden = true;
      render();
      save();
      runClock();
    }

    const locked = i => S.puz[i] || S.hinted[i];

    function pushUndo() {
      S.undo.push({ v: S.vals.join(''), n: S.notes.slice(), s: S.sel });
      if (S.undo.length > 100) S.undo.shift();
    }

    function input(n) {
      if (!S || won || !overlay.hidden) return;
      const i = S.sel;
      if (i < 0 || locked(i)) return;
      if (notesMode) {
        if (S.vals[i]) return;
        pushUndo();
        S.notes[i] ^= 1 << n;
      } else {
        pushUndo();
        if (S.vals[i] === n) S.vals[i] = 0;
        else {
          S.vals[i] = n;
          S.notes[i] = 0;
          for (const p of PEERS[i]) S.notes[p] &= ~(1 << n); // limpa as notas que deixaram de ser possíveis
          if (n !== S.sol[i]) Arcade.buzz(showErr ? 35 : 0);
        }
      }
      after(i);
    }

    function erase() {
      if (!S || won) return;
      const i = S.sel;
      if (i < 0 || locked(i) || (!S.vals[i] && !S.notes[i])) return;
      pushUndo();
      S.vals[i] = 0;
      S.notes[i] = 0;
      after(i);
    }

    function undo() {
      if (!S || won || !S.undo.length) return;
      const u = S.undo.pop();
      S.vals = u.v.split('').map(Number);
      S.notes = u.n;
      S.sel = u.s;
      render();
      save();
    }

    function hint() {
      if (!S || won || S.hints <= 0) return;
      let i = S.sel;
      if (i < 0 || locked(i) || S.vals[i] === S.sol[i]) {
        const cand = [];
        for (let k = 0; k < 81; k++) if (!locked(k) && S.vals[k] !== S.sol[k]) cand.push(k);
        if (!cand.length) return;
        i = cand[Math.floor(Math.random() * cand.length)];
      }
      S.undo = []; // a dica não se pode anular
      S.vals[i] = S.sol[i];
      S.notes[i] = 0;
      for (const p of PEERS[i]) S.notes[p] &= ~(1 << S.sol[i]);
      S.hinted[i] = 1;
      S.hints--;
      S.sel = i;
      after(i);
    }

    function after(i) {
      const unit = [];
      // animação quando se completa uma linha, coluna ou caixa
      const groups = [k => ROW(k) === ROW(i), k => COL(k) === COL(i), k => BOX(k) === BOX(i)];
      for (const f of groups) {
        const ks = [];
        for (let k = 0; k < 81; k++) if (f(k)) ks.push(k);
        if (ks.every(k => S.vals[k] === S.sol[k])) unit.push(...ks);
      }
      render();
      if (S.vals.every((v, k) => v === S.sol[k])) return win();
      if (S.vals[i] === S.sol[i]) unit.forEach(k => {
        cellEls[k].classList.remove('done'); void cellEls[k].offsetWidth; cellEls[k].classList.add('done');
      });
      save();
    }

    function select(i) {
      if (!S || won) return;
      S.sel = i;
      render();
    }

    // ---------- Desenho ----------
    function layout() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
      const availH = view.h - top - 22 - 44 - 10 - 54 - 10 - 60 - 10 - 30;
      const size = Math.floor(Math.max(220, Math.min(view.w - 16, availH, 520)));
      const cell = (size - 6 - 6 - 6) / 9;
      boardEl.style.width = boardEl.style.height = size + 'px';
      boardEl.style.fontSize = Math.round(cell * 0.6) + 'px';
      boardEl.style.setProperty('--note', Math.max(8, Math.round(cell * 0.27)) + 'px');
      render();
    }

    function render() {
      if (!S) return;
      diffEl.textContent = DIFFS[S.diff].name;
      const sel = S.sel, sv = sel >= 0 ? S.vals[sel] : 0;
      const counts = new Array(10).fill(0);
      for (let i = 0; i < 81; i++) counts[S.vals[i]]++;
      for (let i = 0; i < 81; i++) {
        const e = cellEls[i], v = S.vals[i];
        let cls = 'sd-c';
        if (S.puz[i]) cls += ' given';
        else if (S.hinted[i]) cls += ' hint';
        if (sel >= 0 && i !== sel && (ROW(i) === ROW(sel) || COL(i) === COL(sel) || BOX(i) === BOX(sel))) cls += ' peer';
        if (sv && v === sv && i !== sel) cls += ' same';
        if (i === sel) cls += ' sel';
        if (showErr && v && v !== S.sol[i]) cls += ' err';
        if (e.classList.contains('done')) cls += ' done';
        e.className = cls;
        if (v) e.textContent = v;
        else if (S.notes[i]) {
          let h = '<div class="sd-notes" style="font-size:var(--note)">';
          for (let n = 1; n <= 9; n++) h += `<span class="${n === sv ? 'hl' : ''}">${S.notes[i] & (1 << n) ? n : ''}</span>`;
          e.innerHTML = h + '</div>';
        } else e.textContent = '';
      }
      numBtns.forEach((b, k) => {
        const n = k + 1, left = Math.max(0, 9 - counts[n]);
        b.classList.toggle('full', left === 0);
        b.querySelector('small').textContent = left || '';
      });
      padEl.classList.toggle('notes', notesMode);
      tool('notes').classList.toggle('on', notesMode);
      tool('undo').disabled = !S.undo.length;
      tool('hint').disabled = S.hints <= 0;
      tool('hint').querySelector('span').textContent = `Dica (${S.hints})`;
      timeEl.textContent = fmt(elapsed());
    }

    // ---------- Ecrãs ----------
    function showOverlay(html, actions) {
      overlay.innerHTML = html;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = actions[b.dataset.a]; });
    }

    function win() {
      won = true;
      stopClock();
      const t = S.time;
      const key = 'sudoku:best:' + S.diff;
      const best = Arcade.store.get(key, null);
      const record = best == null || t < best;
      if (record) Arcade.store.set(key, Math.round(t));
      Arcade.store.set('sudoku:state', null);
      S.sel = -1;
      render();
      cellEls.forEach((e, k) => { e.style.animationDelay = (ROW(k) + COL(k)) * 25 + 'ms'; e.classList.add('done'); });
      Arcade.buzz(50);
      const used = HINTS - S.hints;
      setTimeout(() => {
        showOverlay(`
          <h2>${record ? 'Novo recorde!' : 'Resolvido!'}</h2>
          <p>${DIFFS[S.diff].name}${record ? '' : ` · melhor tempo ${fmt(best)}`}</p>
          <div class="stats">
            <div><b>${fmt(t)}</b><span>tempo</span></div>
            <div><b>${used}</b><span>dica${used === 1 ? '' : 's'}</span></div>
            <div><b>${fmt(record ? t : best)}</b><span>melhor</span></div>
          </div>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          <button class="btn center" data-a="diff">Mudar dificuldade</button>
          <button class="btn center" data-a="menu">Menu</button>`,
          { again: () => newGame(S.diff), diff: chooseDiff, menu: host.exit });
      }, 900);
    }

    function chooseDiff() {
      stopClock();
      save();
      const acts = { menu: host.exit };
      const opts = ORDER.map(k => {
        acts[k] = () => {
          overlay.innerHTML = '<h2>A gerar…</h2>';
          setTimeout(() => newGame(k), 30); // deixa o ecrã atualizar antes de gerar
        };
        const b = Arcade.store.get('sudoku:best:' + k, null);
        return `<button class="btn" data-a="${k}"><b>${DIFFS[k].name}</b><small>~${DIFFS[k].clues} números dados · melhor: ${b == null ? '—' : fmt(b)}</small></button>`;
      }).join('');
      if (S && !won) acts.back = resume;
      showOverlay(`
        <h2>Sudoku</h2>
        <p>Escolhe a dificuldade</p>
        ${opts}
        ${acts.back ? '<button class="btn center" data-a="back">Voltar ao jogo</button>' : ''}
        <button class="btn center" data-a="menu">Menu</button>`, acts);
    }

    function resume() { overlay.hidden = true; runClock(); render(); }

    function pause() {
      if (!overlay.hidden || !S || won) return;
      stopClock();
      save();
      const filled = S.vals.filter((v, k) => v && v === S.sol[k]).length;
      showOverlay(`
        <h2>Pausa</h2>
        <p>${DIFFS[S.diff].name} · ${fmt(elapsed())} · ${filled}/81</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="err">Mostrar erros: ${showErr ? 'sim' : 'não'}</button>
        <button class="btn center" data-a="new">Novo jogo</button>
        <button class="btn center" data-a="menu">Menu</button>`,
        {
          go: resume,
          err: () => { showErr = !showErr; Arcade.store.set('sudoku:showErr', showErr); overlay.hidden = true; pause(); },
          new: chooseDiff,
          menu: host.exit,
        });
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Entrada ----------
    boardEl.addEventListener('pointerdown', e => {
      const c = e.target.closest('.sd-c');
      if (c) { e.preventDefault(); select(+c.dataset.i); }
    });
    numBtns.forEach(b => { b.onclick = () => input(+b.dataset.n); });
    tool('undo').onclick = undo;
    tool('erase').onclick = erase;
    tool('notes').onclick = () => { notesMode = !notesMode; render(); };
    tool('hint').onclick = hint;

    const onKey = e => {
      if (!S || won || !overlay.hidden) return;
      const k = e.key;
      if (k >= '1' && k <= '9') input(+k);
      else if (k === '0' || k === 'Backspace' || k === 'Delete') erase();
      else if (k === 'n' || k === 'N') { notesMode = !notesMode; render(); }
      else if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) undo();
      else if (k.startsWith('Arrow')) {
        e.preventDefault();
        let i = S.sel < 0 ? 40 : S.sel, r = ROW(i), c = COL(i);
        if (k === 'ArrowUp') r = (r + 8) % 9;
        if (k === 'ArrowDown') r = (r + 1) % 9;
        if (k === 'ArrowLeft') c = (c + 8) % 9;
        if (k === 'ArrowRight') c = (c + 1) % 9;
        select(r * 9 + c);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', layout);

    // ---------- Arranque ----------
    const saved = Arcade.store.get('sudoku:state', null);
    if (saved && Array.isArray(saved.puz) && saved.puz.length === 81 && DIFFS[saved.diff]) {
      S = saved;
      if (!Array.isArray(S.undo)) S.undo = [];
      layout();
      runClock();
    } else {
      layout();
      chooseDiff();
    }

    return {
      destroy() {
        stopClock();
        save();
        clearInterval(tick);
        clearInterval(autosave);
        disposeCanvas();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', layout);
      },
    };
  }

  Arcade.register({
    id: 'sudoku',
    title: 'Sudoku',
    icon: '🧩',
    color: '#9b59f6',
    desc: 'Preenche a grelha 9×9 sem repetir números. Com notas e dicas.',
    best: () => {
      const parts = ORDER.map(k => {
        const b = Arcade.store.get('sudoku:best:' + k, null);
        return b == null ? null : `${DIFFS[k].name} ${fmt(b)}`;
      }).filter(Boolean);
      return parts.length ? parts.join(' · ') : '—';
    },
    create,
  });
})();
