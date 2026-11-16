// Paciência (Klondike): 7 colunas, 4 fundações, baralho e descarte. Toca numa carta para a mover sozinha, ou arrasta.
(function () {
  const SUITS = ['♠︎', '♥︎', '♦︎', '♣︎'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suitOf = c => Math.floor(c / 13);
  const rankOf = c => c % 13 + 1;
  const isRed = c => { const s = suitOf(c); return s === 1 || s === 2; };
  const TAU = Math.PI * 2;

  function fmtTime(t) {
    const s = Math.floor(t || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const CSS = `
.sol-board{position:absolute;inset:0;z-index:1;touch-action:none}
.sol-slot{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.13);
  border:2px dashed rgba(255,255,255,.16);display:grid;place-items:center;color:rgba(255,255,255,.24);
  font-size:calc(var(--cw)*.42);font-weight:700}
.sol-card{position:absolute;left:0;top:0;width:var(--cw);height:var(--ch);border-radius:calc(var(--cw)*.13);
  transition:transform .2s ease;touch-action:none;color:#1c1e38;
  background:#5b4bd6 repeating-linear-gradient(45deg,rgba(255,255,255,.14) 0 3px,transparent 3px 7px);
  box-shadow:inset 0 0 0 2px rgba(255,255,255,.6),0 1px 3px rgba(0,0,0,.5)}
.sol-card.up{background:#f7f5ef;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 1px 3px rgba(0,0,0,.5)}
.sol-card.up.red{color:#e2304a}
.sol-card .f{display:none}
.sol-card.up .f{display:block}
.sol-card .r{position:absolute;left:7%;top:3%;font-weight:800;font-size:calc(var(--cw)*.38);line-height:1;letter-spacing:-.06em}
.sol-card .s{position:absolute;right:7%;top:4%;font-size:calc(var(--cw)*.32);line-height:1}
.sol-card .c{position:absolute;left:0;right:0;bottom:7%;text-align:center;font-size:calc(var(--cw)*.62);line-height:1}
.sol-card.drag,.sol-card.fly,.sol-card.nt{transition:none}
.sol-card.drag{box-shadow:0 8px 18px rgba(0,0,0,.6)}
.sol-card.shake{animation:solshake .3s}
@keyframes solshake{25%{left:-5px}75%{left:5px}}
.sol-bar{position:absolute;z-index:2;left:0;right:0;bottom:0;display:flex;gap:8px;justify-content:center;
  padding:8px 12px calc(env(safe-area-inset-bottom) + 10px)}
.sol-bar button{flex:1;max-width:160px;min-height:46px;border-radius:12px;border:2px solid var(--line);
  background:var(--panel);color:var(--text);font:inherit;font-size:15px;font-weight:600;padding:0 6px}
.sol-bar button:active{transform:scale(.97)}
.sol-bar button:disabled{opacity:.4}
.sol-bar button.go{background:var(--accent);color:#1a1300;border-color:transparent}
.sol-bar button[hidden]{display:none}
`;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

    const style = mk('style');
    style.textContent = CSS;
    root.appendChild(style);

    const board = mk('div', 'sol-board');
    root.appendChild(board);

    const slotEls = {};
    for (const k of ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6']) {
      const s = mk('div', 'sol-slot');
      s.dataset.slot = k;
      if (k[0] === 'f') s.textContent = 'A';
      if (k[0] === 't') s.textContent = 'K';
      board.appendChild(s);
      slotEls[k] = s;
    }

    const els = [];
    for (let c = 0; c < 52; c++) {
      const e = mk('div', 'sol-card' + (isRed(c) ? ' red' : ''));
      e.dataset.id = c;
      const s = SUITS[suitOf(c)];
      e.innerHTML = `<div class="f"><span class="r">${RANKS[c % 13]}</span><span class="s">${s}</span><span class="c">${s}</span></div>`;
      board.appendChild(e);
      els.push(e);
    }

    const bar = mk('div', 'sol-bar');
    bar.innerHTML = `<button data-a="new">Novo jogo</button><button data-a="undo">↶ Anular</button><button data-a="auto" class="go" hidden>Completar</button>`;
    root.appendChild(bar);
    const btnUndo = bar.querySelector('[data-a=undo]');
    const btnAuto = bar.querySelector('[data-a=auto]');

    const pauseBtn = mk('button', 'hud-btn');
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = mk('div', 'overlay');
    overlay.hidden = true;
    root.appendChild(overlay);

    // ---------- Estado ----------
    let S, G, pos = {};
    let paused = false, busy = false, drag = null, fly = null, confetti = [];
    const lifted = new Set();
    let liftTimer = 0;

    function fresh(draw) {
      const deck = shuffle([...Array(52).keys()]);
      const up = Array(52).fill(false);
      const tab = [];
      for (let i = 0; i < 7; i++) {
        tab.push(deck.splice(0, i + 1));
        up[tab[i][i]] = true;
      }
      return { tab, found: [[], [], [], []], stock: deck, waste: [], up, moves: 0, time: 0, draw, started: false, won: false, hist: [] };
    }

    function validSave(s) {
      if (!s || s.won || !Array.isArray(s.tab) || s.tab.length !== 7 || !Array.isArray(s.found) || !Array.isArray(s.up)) return false;
      const n = s.tab.flat().length + s.found.flat().length + s.stock.length + s.waste.length;
      return n === 52;
    }

    function save() {
      if (S) Arcade.store.set('solitaire:save', S.won ? null : S);
    }

    function pileArr(loc) {
      if (loc.pile === 'stock') return S.stock;
      if (loc.pile === 'waste') return S.waste;
      if (loc.pile === 'found') return S.found[loc.i];
      return S.tab[loc.i];
    }

    function locate(c) {
      let i = S.stock.indexOf(c);
      if (i >= 0) return { pile: 'stock', idx: i };
      i = S.waste.indexOf(c);
      if (i >= 0) return { pile: 'waste', idx: i };
      for (let j = 0; j < 4; j++) { i = S.found[j].indexOf(c); if (i >= 0) return { pile: 'found', i: j, idx: i }; }
      for (let j = 0; j < 7; j++) { i = S.tab[j].indexOf(c); if (i >= 0) return { pile: 'tab', i: j, idx: i }; }
      return null;
    }

    // ---------- Geometria ----------
    function geom() {
      const w = view.w, h = view.h;
      const barH = bar.offsetHeight || 70;
      const y0 = top + 74;
      const gap = w < 500 ? 5 : 8;
      let cw = Math.floor((Math.min(w, 820) - 8 * gap) / 7);
      const avail = h - barH - 8 - y0;
      cw = Math.min(cw, Math.floor(avail / (1.4 * 3.6)));
      cw = Math.max(28, cw);
      const ch = Math.round(cw * 1.4);
      const left = Math.round((w - 7 * cw - 6 * gap) / 2);
      G = {
        cw, ch, gap, left, y0,
        x: [...Array(7)].map((_, i) => left + i * (cw + gap)),
        tabY: y0 + ch + Math.max(10, gap * 2),
        maxY: h - barH - 6,
        fan: Math.round(cw * 0.42),
      };
      board.style.setProperty('--cw', cw + 'px');
      board.style.setProperty('--ch', ch + 'px');
      const setSlot = (k, x, y) => { slotEls[k].style.transform = `translate(${x}px,${y}px)`; };
      setSlot('stock', G.x[0], y0);
      setSlot('waste', G.x[1], y0);
      for (let j = 0; j < 4; j++) setSlot('f' + j, G.x[3 + j], y0);
      for (let j = 0; j < 7; j++) setSlot('t' + j, G.x[j], G.tabY);
    }

    function canAuto() {
      return !S.won && !S.stock.length && !S.waste.length && S.tab.some(c => c.length) &&
        S.tab.every(col => col.every(c => S.up[c]));
    }

    function render() {
      const P = {}, Z = {};
      S.stock.forEach((c, i) => { P[c] = [G.x[0], G.y0]; Z[c] = i + 1; });
      const nShow = S.draw === 3 ? Math.min(3, S.waste.length) : 1;
      S.waste.forEach((c, i) => {
        const k = Math.max(0, i - (S.waste.length - nShow));
        P[c] = [G.x[1] + k * G.fan, G.y0]; Z[c] = i + 1;
      });
      S.found.forEach((f, j) => f.forEach((c, i) => { P[c] = [G.x[3 + j], G.y0]; Z[c] = i + 1; }));
      const avail = G.maxY - G.tabY - G.ch;
      S.tab.forEach((col, j) => {
        let nd = 0, nu = 0;
        for (let i = 0; i < col.length - 1; i++) S.up[col[i]] ? nu++ : nd++;
        let dOff = G.ch * 0.13, uOff = G.ch * 0.3;
        const need = nd * dOff + nu * uOff;
        if (need > avail && need > 0) { const k = Math.max(0.1, avail) / need; dOff *= k; uOff *= k; }
        let y = G.tabY;
        col.forEach((c, i) => { P[c] = [G.x[j], y]; Z[c] = 10 + i; y += S.up[c] ? uOff : dOff; });
      });
      for (let c = 0; c < 52; c++) {
        const e = els[c], p = P[c];
        if (!p) continue;
        const x = Math.round(p[0]), y = Math.round(p[1]);
        pos[c] = { x, y };
        e.style.transform = `translate(${x}px,${y}px)`;
        e.style.zIndex = Z[c] + (lifted.has(c) ? 500 : 0);
        e.classList.toggle('up', !!S.up[c]);
      }
      slotEls.stock.textContent = !S.stock.length && S.waste.length ? '↻' : '';
      btnUndo.disabled = !S.hist.length || S.won;
      btnAuto.hidden = !canAuto() || busy;
    }

    function lift(ids) {
      lifted.clear();
      ids.forEach(c => lifted.add(c));
      clearTimeout(liftTimer);
      timers.delete(liftTimer);
      liftTimer = later(() => { lifted.clear(); if (S && !fly) render(); }, 260);
    }

    // ---------- Regras ----------
    function canPlace(ids, t) {
      const c = ids[0];
      if (t.pile === 'found') {
        if (ids.length !== 1) return false;
        const f = S.found[t.i];
        if (!f.length) return rankOf(c) === 1;
        const tp = f[f.length - 1];
        return suitOf(tp) === suitOf(c) && rankOf(c) === rankOf(tp) + 1;
      }
      const col = S.tab[t.i];
      if (!col.length) return rankOf(c) === 13;
      const tp = col[col.length - 1];
      return S.up[tp] && isRed(tp) !== isRed(c) && rankOf(tp) === rankOf(c) + 1;
    }

    function pushHist() {
      S.hist.push(JSON.stringify({ tab: S.tab, found: S.found, stock: S.stock, waste: S.waste, up: S.up, moves: S.moves }));
      if (S.hist.length > 200) S.hist.shift();
    }

    function doMove(loc, ids, t) {
      if (loc.pile === t.pile && loc.i === t.i) return false;
      if (!canPlace(ids, t)) return false;
      pushHist();
      const src = pileArr(loc);
      src.splice(src.length - ids.length, ids.length);
      pileArr(t).push(...ids);
      if (loc.pile === 'tab' && src.length && !S.up[src[src.length - 1]]) S.up[src[src.length - 1]] = true;
      S.moves++;
      S.started = true;
      lift(ids);
      render();
      if (!checkWin()) save();
      return true;
    }

    function drawStock() {
      if (S.stock.length) {
        pushHist();
        const n = Math.min(S.draw, S.stock.length);
        const taken = [];
        for (let k = 0; k < n; k++) {
          const c = S.stock.pop();
          S.up[c] = true;
          S.waste.push(c);
          taken.push(c);
        }
        lift(taken);
      } else if (S.waste.length) {
        pushHist();
        S.stock = S.waste.reverse();
        S.stock.forEach(c => { S.up[c] = false; });
        S.waste = [];
      } else return;
      S.moves++;
      S.started = true;
      render();
      save();
    }

    function autoMove(c, loc) {
      const ids = pileArr(loc).slice(loc.idx);
      if (ids.length === 1 && loc.pile !== 'found') {
        const order = [0, 1, 2, 3].sort((a, b) => {
          const fa = S.found[a], fb = S.found[b];
          const sa = fa.length && suitOf(fa[0]) === suitOf(c) ? 0 : 1;
          const sb = fb.length && suitOf(fb[0]) === suitOf(c) ? 0 : 1;
          return sa - sb;
        });
        for (const j of order) if (doMove(loc, ids, { pile: 'found', i: j })) return;
      }
      const start = loc.pile === 'tab' ? loc.i + 1 : 0;
      const cols = [...Array(7).keys()].map(k => (start + k) % 7).filter(j => !(loc.pile === 'tab' && j === loc.i));
      for (const j of cols) if (S.tab[j].length && doMove(loc, ids, { pile: 'tab', i: j })) return;
      if (!(loc.pile === 'tab' && loc.idx === 0)) {
        for (const j of cols) if (!S.tab[j].length && doMove(loc, ids, { pile: 'tab', i: j })) return;
      }
      const e = els[ids[0]];
      e.classList.remove('shake');
      void e.offsetWidth;
      e.classList.add('shake');
      Arcade.buzz(15);
    }

    function undo() {
      if (!S.hist.length || busy || S.won) return;
      const h = JSON.parse(S.hist.pop());
      Object.assign(S, h);
      lifted.clear();
      render();
      save();
    }

    function runAuto() {
      if (busy || !canAuto()) return;
      busy = true;
      render();
      const step = () => {
        if (!S || S.won || !busy) { busy = false; return; }
        let best = null;
        for (let j = 0; j < 7; j++) {
          const col = S.tab[j];
          if (!col.length) continue;
          const c = col[col.length - 1];
          if (best && rankOf(c) >= rankOf(best.c)) continue;
          for (let f = 0; f < 4; f++) {
            if (canPlace([c], { pile: 'found', i: f })) { best = { c, j, f }; break; }
          }
        }
        if (!best) { busy = false; render(); return; }
        doMove({ pile: 'tab', i: best.j, idx: S.tab[best.j].length - 1 }, [best.c], { pile: 'found', i: best.f });
        if (!S.won) later(step, 110);
        else busy = false;
      };
      step();
    }

    function checkWin() {
      if (!S.found.every(f => f.length === 13)) return false;
      win();
      return true;
    }

    // ---------- Vitória ----------
    function win() {
      S.won = true;
      busy = false;
      const wins = Arcade.store.get('solitaire:wins', 0) + 1;
      Arcade.store.set('solitaire:wins', wins);
      const best = Arcade.store.get('solitaire:best', 0);
      const t = Math.max(1, Math.floor(S.time));
      const record = !best || t < best;
      if (record) Arcade.store.set('solitaire:best', t);
      Arcade.store.set('solitaire:save', null);
      Arcade.buzz([40, 60, 40]);
      render();
      startWinAnim();
      later(() => showWin(record, wins, best, t), 2800);
    }

    function startWinAnim() {
      fly = [];
      let k = 0;
      for (let r = 12; r >= 0; r--) {
        for (let j = 0; j < 4; j++) {
          const c = S.found[j][r];
          if (c == null) continue;
          const p = pos[c] || { x: G.x[3 + j], y: G.y0 };
          const dir = Math.random() < 0.5 ? -1 : 1;
          fly.push({
            c, x: p.x, y: p.y, rot: 0,
            vx: dir * (120 + Math.random() * 220), vy: -(250 + Math.random() * 350),
            vr: (Math.random() - 0.5) * 9, delay: k * 0.045,
          });
          els[c].classList.add('fly');
          els[c].style.zIndex = 600 + k;
          k++;
        }
      }
      const colors = ['#ff5a6e', '#ffd86b', '#26de81', '#45aaf2', '#a55eea', '#ff9f43'];
      confetti = [];
      for (let i = 0; i < 160; i++) {
        confetti.push({
          x: Math.random() * view.w, y: -20 - Math.random() * view.h * 0.8,
          vx: (Math.random() - 0.5) * 60, vy: 90 + Math.random() * 160,
          a: Math.random() * TAU, va: (Math.random() - 0.5) * 8,
          color: colors[i % colors.length], s: 5 + Math.random() * 5,
        });
      }
    }

    function stopWinAnim() {
      if (fly) fly.forEach(f => els[f.c].classList.remove('fly'));
      fly = null;
      confetti = [];
    }

    function updateFly(dt) {
      if (!fly) return;
      const floor = view.h - G.ch;
      for (const f of fly) {
        if (f.delay > 0) { f.delay -= dt; continue; }
        f.vy += 1500 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.rot += f.vr * dt;
        if (f.y > floor) {
          f.y = floor;
          f.vy *= -0.7;
          f.vr *= 0.8;
          if (Math.abs(f.vy) < 140) f.vy = -(260 + Math.random() * 200);
        }
        els[f.c].style.transform = `translate(${f.x}px,${f.y}px) rotate(${f.rot}rad)`;
      }
    }

    function showWin(record, wins, prevBest, t) {
      overlay.innerHTML = `
        <h2>Ganhaste!</h2>
        <p>${record ? 'Novo melhor tempo!' : `Melhor tempo: ${fmtTime(prevBest)}`}</p>
        <div class="stats">
          <div><b>${fmtTime(t)}</b><span>tempo</span></div>
          <div><b>${S.moves}</b><span>jogadas</span></div>
          <div><b>${wins}</b><span>vitórias</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = () => newGame(S.draw);
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    // ---------- Novo jogo / pausa ----------
    function newGame(draw) {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      Arcade.store.set('solitaire:draw', draw);
      stopWinAnim();
      lifted.clear();
      drag = null;
      busy = false;
      paused = false;
      overlay.hidden = true;
      S = fresh(draw);
      geom();
      // Distribuição: todas as cartas partem do baralho
      for (let c = 0; c < 52; c++) {
        els[c].classList.add('nt');
        els[c].classList.remove('up', 'shake');
        els[c].style.transform = `translate(${G.x[0]}px,${G.y0}px)`;
      }
      void board.offsetWidth;
      let k = 0;
      for (let r = 0; r < 7; r++) {
        for (let j = r; j < 7; j++) els[S.tab[j][r]].style.transitionDelay = (k++ * 0.025) + 's';
      }
      for (let c = 0; c < 52; c++) els[c].classList.remove('nt');
      render();
      later(() => { for (let c = 0; c < 52; c++) els[c].style.transitionDelay = ''; }, 1200);
      save();
    }

    function showChooser(canCancel) {
      paused = true;
      drag = null;
      const d = Arcade.store.get('solitaire:draw', 1);
      overlay.innerHTML = `
        <h2>Novo jogo</h2>
        <p>Quantas cartas se viram do baralho de cada vez?</p>
        <button class="btn" data-d="1"${d === 1 ? ' style="border-color:var(--accent)"' : ''}><b>Virar 1 carta</b><small>Mais fácil</small></button>
        <button class="btn" data-d="3"${d === 3 ? ' style="border-color:var(--accent)"' : ''}><b>Virar 3 cartas</b><small>Clássico, mais difícil</small></button>
        ${canCancel ? '<button class="btn center" data-a="cancel">Cancelar</button>' : ''}`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-d]').forEach(b => { b.onclick = () => newGame(+b.dataset.d); });
      const cancel = overlay.querySelector('[data-a=cancel]');
      if (cancel) cancel.onclick = resume;
    }

    function resume() {
      overlay.hidden = true;
      paused = false;
    }

    function pause() {
      if (!S || S.won || !overlay.hidden) return;
      paused = true;
      if (drag) { drag.ids.forEach(c => els[c].classList.remove('drag')); drag = null; render(); }
      save();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${fmtTime(S.time)} · ${S.moves} jogadas · virar ${S.draw}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = resume;
      overlay.querySelector('[data-a=restart]').onclick = () => showChooser(true);
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;

    bar.onclick = e => {
      const b = e.target.closest('button');
      if (!b || !S || paused || fly) return;
      const a = b.dataset.a;
      if (a === 'new') showChooser(true);
      else if (a === 'undo') undo();
      else if (a === 'auto') runAuto();
    };

    // ---------- Toque e arrasto ----------
    function onDown(e) {
      if (!S || S.won || busy || paused || drag) return;
      const cardEl = e.target.closest('.sol-card');
      const slotEl = e.target.closest('.sol-slot');
      if (cardEl) {
        const c = +cardEl.dataset.id;
        const loc = locate(c);
        if (!loc) return;
        if (loc.pile === 'stock') { drawStock(); return; }
        if (!S.up[c]) return;
        if (loc.pile !== 'tab' && loc.idx !== pileArr(loc).length - 1) return;
        const ids = pileArr(loc).slice(loc.idx);
        drag = {
          pid: e.pointerId, ids, loc, sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false,
          base: ids.map(id => ({ x: pos[id].x, y: pos[id].y })),
        };
        e.preventDefault();
      } else if (slotEl && slotEl.dataset.slot === 'stock') {
        drawStock();
      }
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      if (!drag.moved) {
        drag.moved = true;
        drag.ids.forEach(c => els[c].classList.add('drag'));
      }
      drag.dx = dx; drag.dy = dy;
      drag.ids.forEach((c, k) => {
        els[c].style.transform = `translate(${drag.base[k].x + dx}px,${drag.base[k].y + dy}px)`;
        els[c].style.zIndex = 1000 + k;
      });
    }

    function dropTargets(cx, cy, d) {
      const col = Math.max(0, Math.min(6, Math.round((cx - G.left - G.cw / 2) / (G.cw + G.gap))));
      if (cy < G.tabY - 4) {
        if (d.ids.length !== 1 || col < 2) return [];
        const list = [];
        if (col >= 3) list.push({ pile: 'found', i: col - 3 });
        for (let j = 0; j < 4; j++) if (j !== col - 3) list.push({ pile: 'found', i: j });
        return list;
      }
      return [{ pile: 'tab', i: col }];
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag;
      drag = null;
      d.ids.forEach(c => els[c].classList.remove('drag'));
      if (e.type === 'pointercancel') { render(); return; }
      if (!d.moved) { autoMove(d.ids[0], d.loc); return; }
      const cx = d.base[0].x + d.dx + G.cw / 2, cy = d.base[0].y + d.dy + G.ch / 2;
      for (const t of dropTargets(cx, cy, d)) if (doMove(d.loc, d.ids, t)) return;
      render();
    }

    board.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const onResize = () => {
      geom();
      if (fly) return;
      render();
    };
    window.addEventListener('resize', onResize);
    const onVis = () => { if (document.hidden) { pause(); save(); } };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Desenho (fundo, HUD e confettis) ----------
    function draw() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      const x0 = Math.max(14, G.left);
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText(fmtTime(S.time), x0, top + 24);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText(`${S.moves} jogadas · virar ${S.draw}`, x0, top + 49);
      for (const q of confetti) {
        ctx.save();
        ctx.translate(q.x, q.y);
        ctx.rotate(q.a);
        ctx.fillStyle = q.color;
        ctx.fillRect(-q.s / 2, -q.s / 4, q.s, q.s / 2);
        ctx.restore();
      }
    }

    function update(dt) {
      if (S.started && !S.won && !paused) S.time += dt;
      updateFly(dt);
      for (const q of confetti) {
        q.x += q.vx * dt; q.y += q.vy * dt; q.a += q.va * dt;
        if (q.y > view.h + 20) { q.y = -20; q.x = Math.random() * view.w; }
      }
    }

    // ---------- Arranque ----------
    geom();
    const saved = Arcade.store.get('solitaire:save', null);
    if (validSave(saved)) {
      S = saved;
      S.hist = Array.isArray(S.hist) ? S.hist : [];
      S.draw = S.draw === 3 ? 3 : 1;
      els.forEach(e => e.classList.add('nt'));
      render();
      void board.offsetWidth;
      els.forEach(e => e.classList.remove('nt'));
    } else {
      S = fresh(Arcade.store.get('solitaire:draw', 1));
      els.forEach(e => e.classList.add('nt'));
      render();
      void board.offsetWidth;
      els.forEach(e => e.classList.remove('nt'));
      showChooser(false);
    }

    const loop = Arcade.loop(dt => { update(dt); draw(); });

    return {
      destroy() {
        loop.stop();
        save();
        for (const t of timers) clearTimeout(t);
        timers.clear();
        disposeCanvas();
        board.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        S = null;
      },
    };
  }

  Arcade.register({
    id: 'solitaire',
    title: 'Paciência',
    icon: '🃏',
    color: '#26de81',
    desc: 'A paciência clássica: arruma o baralho todo nas fundações.',
    best: () => {
      const wins = Arcade.store.get('solitaire:wins', 0);
      const best = Arcade.store.get('solitaire:best', 0);
      if (!wins) return 'sem vitórias';
      return `${wins} ${wins === 1 ? 'vitória' : 'vitórias'} · ${fmtTime(best)}`;
    },
    create,
  });
})();
