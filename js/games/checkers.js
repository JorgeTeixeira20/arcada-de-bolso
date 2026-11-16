// Damas: tabuleiro 8x8, captura obrigatória (e da maioria), capturas múltiplas e damas que andam várias casas.
(function () {
  // Motor de regras + IA. Fica numa função isolada para poder correr também dentro de um Web Worker (via Blob).
  // Tabuleiro: 64 casas (linha*8+coluna). 1 = peão amarelo, 2 = dama amarela, -1 = peão vermelho, -2 = dama vermelha.
  // As amarelas (1) começam em baixo e sobem; as vermelhas (-1) descem.
  const ENGINE = function () {
    const DR = [-1, -1, 1, 1], DC = [-1, 1, -1, 1];
    const RAY = [];
    for (let sq = 0; sq < 64; sq++) {
      RAY.push([0, 1, 2, 3].map(d => {
        const out = [];
        let r = (sq >> 3) + DR[d], c = (sq & 7) + DC[d];
        while (r >= 0 && r < 8 && c >= 0 && c < 8) { out.push(r * 8 + c); r += DR[d]; c += DC[d]; }
        return out;
      }));
    }

    function initial() {
      const b = new Array(64).fill(0);
      for (let sq = 0; sq < 64; sq++) {
        const r = sq >> 3, c = sq & 7;
        if ((r + c) % 2 !== 1) continue;
        if (r < 3) b[sq] = -1;
        else if (r > 4) b[sq] = 1;
      }
      return b;
    }

    // Todas as jogadas legais. Uma captura é a sequência completa: { path:[casas], caps:[casas capturadas], crown }.
    // Regras: captura obrigatória e da maioria; peões capturam para trás; as peças capturadas só saem no fim
    // (não se salta duas vezes a mesma e bloqueiam o caminho); só é promovido o peão que ACABA na última linha.
    function moves(b, side) {
      const caps = [];
      let best = 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (p * side <= 0) continue;
        const king = p === 2 || p === -2;
        b[sq] = 0;
        const path = [sq], taken = [];
        const dfs = pos => {
          let found = false;
          for (let d = 0; d < 4; d++) {
            const ray = RAY[pos][d];
            if (!king) {
              if (ray.length < 2) continue;
              const m = ray[0], l = ray[1];
              if (b[m] * side < 0 && taken.indexOf(m) < 0 && b[l] === 0) {
                found = true;
                path.push(l); taken.push(m);
                dfs(l);
                path.pop(); taken.pop();
              }
            } else {
              let i = 0;
              while (i < ray.length && b[ray[i]] === 0) i++;
              if (i >= ray.length) continue;
              const m = ray[i];
              if (b[m] * side >= 0 || taken.indexOf(m) >= 0) continue;
              for (let j = i + 1; j < ray.length && b[ray[j]] === 0; j++) {
                found = true;
                path.push(ray[j]); taken.push(m);
                dfs(ray[j]);
                path.pop(); taken.pop();
              }
            }
          }
          if (!found && taken.length) {
            if (taken.length > best) { best = taken.length; caps.length = 0; }
            if (taken.length === best) caps.push({ path: path.slice(), caps: taken.slice() });
          }
        };
        dfs(sq);
        b[sq] = p;
      }
      const promoRow = side === 1 ? 0 : 7;
      if (caps.length) {
        for (const m of caps) {
          const p = b[m.path[0]];
          m.crown = (p === 1 || p === -1) && (m.path[m.path.length - 1] >> 3) === promoRow;
        }
        return caps;
      }
      const out = [];
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (p * side <= 0) continue;
        if (p === 2 || p === -2) {
          for (let d = 0; d < 4; d++) for (const t of RAY[sq][d]) { if (b[t] !== 0) break; out.push({ path: [sq, t], caps: [], crown: false }); }
        } else {
          for (const d of side === 1 ? [0, 1] : [2, 3]) {
            const t = RAY[sq][d][0];
            if (t !== undefined && b[t] === 0) out.push({ path: [sq, t], caps: [], crown: (t >> 3) === promoRow });
          }
        }
      }
      return out;
    }

    function apply(b, m) {
      const n = b.slice();
      const from = m.path[0], to = m.path[m.path.length - 1];
      const p = n[from];
      n[from] = 0;
      for (const c of m.caps) n[c] = 0;
      n[to] = m.crown ? p * 2 : p;
      return n;
    }

    // Avaliação do ponto de vista das amarelas.
    function evaluate(b) {
      let s = 0, ny = 0, nr = 0;
      for (let sq = 0; sq < 64; sq++) {
        const p = b[sq];
        if (!p) continue;
        const r = sq >> 3, c = sq & 7;
        const center = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 4 : 0;
        if (p === 1) { s += 100 + (7 - r) * 5 + center + (r === 7 ? 8 : 0); ny++; }
        else if (p === -1) { s -= 100 + r * 5 + center + (r === 0 ? 8 : 0); nr++; }
        else if (p === 2) { s += 310 + center; ny++; }
        else { s -= 310 + center; nr++; }
      }
      // em vantagem, trocar peças é bom
      if (ny !== nr && ny + nr < 16) s += (ny > nr ? 1 : -1) * (24 - ny - nr) * 3;
      return s;
    }

    const WIN = 100000;
    const LEVELS = { easy: { depth: 2, noise: 70, ms: 400 }, normal: { depth: 4, noise: 12, ms: 900 }, hard: { depth: 14, noise: 0, ms: 2000 } };

    // Negamax com cortes alfa-beta e aprofundamento iterativo. Capturas pendentes estendem a pesquisa.
    function think(board, side, level) {
      const L = LEVELS[level] || LEVELS.normal;
      const root = moves(board, side);
      if (root.length <= 1) return root.length ? 0 : -1;
      const deadline = Date.now() + L.ms;
      let nodes = 0, stop = false;
      function search(b, s, depth, alpha, beta, ply) {
        if ((++nodes & 1023) === 0 && Date.now() > deadline) { stop = true; }
        if (stop) return 0;
        const ms = moves(b, s);
        if (!ms.length) return -WIN + ply;
        if (depth <= 0 && (!ms[0].caps.length || depth < -8)) return s * evaluate(b);
        let best = -Infinity;
        for (const m of ms) {
          const v = -search(apply(b, m), -s, depth - 1, -beta, -alpha, ply + 1);
          if (stop) return 0;
          if (v > best) best = v;
          if (v > alpha) alpha = v;
          if (alpha >= beta) break;
        }
        return best;
      }
      let order = root.map((m, i) => i);
      let scores = null;
      for (let depth = 1; depth <= L.depth; depth++) {
        const sc = new Array(root.length).fill(-Infinity);
        let alpha = -Infinity;
        for (const i of order) {
          // janela aberta só para o ruído do nível fácil funcionar com valores reais
          const v = -search(apply(board, root[i]), -side, depth - 1, -Infinity, L.noise ? Infinity : -alpha, 1);
          if (stop) break;
          sc[i] = v;
          if (v > alpha) alpha = v;
        }
        if (stop) break;
        scores = sc;
        order = order.slice().sort((a, b) => scores[b] - scores[a]);
        if (scores[order[0]] > WIN / 2) break; // vitória forçada encontrada
      }
      if (!scores) return order[0];
      if (L.noise) {
        const bestV = Math.max(...scores);
        const ok = order.filter(i => scores[i] >= bestV - L.noise * Math.random() * 2);
        return ok[Math.floor(Math.random() * ok.length)];
      }
      return order[0];
    }

    return { initial, moves, apply, evaluate, think, LEVELS };
  };

  const E = ENGINE();
  const DIFFS = { easy: 'Fácil', normal: 'Normal', hard: 'Difícil' };
  const ORDER = ['easy', 'normal', 'hard'];
  const SAVE_KEY = 'checkers:save', STATS_KEY = 'checkers:stats';
  const SIDE_NAME = { 1: 'Amarelas', '-1': 'Vermelhas' };
  const DRAW_PLIES = 50; // 25 jogadas de cada lado só com damas, sem capturas = empate

  const CSS = `
  .ck-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 8px calc(env(safe-area-inset-bottom) + 14px); gap:12px; }
  .ck-head { width:100%; max-width:560px; min-height:44px; padding-right:60px; display:flex; align-items:center; gap:10px; }
  .ck-status { flex:1; font-weight:800; font-size:17px; line-height:1.25; }
  .ck-status small { display:block; color:#9aa0c8; font-weight:600; font-size:13px; }
  .ck-turn { width:22px; height:22px; border-radius:50%; flex:none; box-shadow:0 0 0 3px #ffffff22; }
  .ck-mid { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; width:100%; }
  .ck-board { position:relative; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr);
    border-radius:12px; overflow:hidden; touch-action:none; box-shadow:0 0 0 4px #1a1c33; }
  .ck-sq { position:relative; }
  .ck-sq.l { background:#272a50; }
  .ck-sq.d { background:#3d4380; }
  .ck-sq.last { background:#4f5aa8; }
  .ck-sq.last::after { content:''; position:absolute; inset:0; box-shadow: inset 0 0 0 2px #45aaf2aa; }
  .ck-sq.dest::before { content:''; position:absolute; left:34%; top:34%; width:32%; height:32%; border-radius:50%; background:#ffcc4d; opacity:.85; z-index:1; }
  .ck-sq.step::before { content:''; position:absolute; left:38%; top:38%; width:24%; height:24%; border-radius:50%; background:#ffcc4d; opacity:.45; z-index:1; }
  .ck-sq.dest.capt::before { background:#ff9f43; }
  .ck-p { position:absolute; inset:11%; border-radius:50%; z-index:2; }
  .ck-p.y { background:#ffcc4d; box-shadow: inset 0 0 0 calc(var(--cs) * .07) #e0a92a, inset 0 0 0 calc(var(--cs) * .14) #ffcc4d, inset 0 0 0 calc(var(--cs) * .17) #e0a92a, 0 calc(var(--cs) * .05) 0 #8a6510; }
  .ck-p.r { background:#ff5a6e; box-shadow: inset 0 0 0 calc(var(--cs) * .07) #d23a50, inset 0 0 0 calc(var(--cs) * .14) #ff5a6e, inset 0 0 0 calc(var(--cs) * .17) #d23a50, 0 calc(var(--cs) * .05) 0 #7a1828; }
  .ck-p.k::after { content:''; position:absolute; left:27%; top:27%; width:46%; height:46%; border-radius:50%; background:#fff;
    box-shadow:0 0 0 calc(var(--cs) * .04) rgba(0,0,0,.25); }
  .ck-p.y.k::after { background:#fff6d6; } .ck-p.r.k::after { background:#ffe1e5; }
  .ck-p.k::before { content:''; position:absolute; left:40%; top:40%; width:20%; height:20%; border-radius:50%; z-index:1; background:#0f1020; opacity:.55; }
  .ck-p.sel { transform:scale(1.1); filter:brightness(1.15); outline:3px solid #fff; outline-offset:1px; }
  .ck-p.must { animation: ck-pulse 1s ease-in-out infinite; }
  @keyframes ck-pulse { 50% { filter:brightness(1.35); transform:scale(1.06); } }
  .ck-p.ghost { opacity:.35; }
  .ck-p.gone { animation: ck-gone .35s ease-in forwards; }
  @keyframes ck-gone { to { transform:scale(.2); opacity:0; } }
  .ck-p.hide { visibility:hidden; }
  .ck-fly { position:absolute; z-index:4; border-radius:50%; pointer-events:none; }
  .ck-bar { display:flex; gap:10px; width:100%; max-width:440px; }
  .ck-btn { flex:1; height:52px; border-radius:16px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:16px; font-weight:700; }
  .ck-btn:active { transform:scale(.97); }
  .ck-btn[disabled] { opacity:.4; }
  .ck-count { display:flex; gap:12px; font-size:13px; color:#9aa0c8; font-weight:600; }
  .ck-count span { display:flex; align-items:center; gap:5px; }
  .ck-dot { width:12px; height:12px; border-radius:50%; display:inline-block; }
  `;

  function getStats() {
    const s = Arcade.store.get(STATS_KEY, null) || {};
    for (const k of ORDER) s[k] = s[k] || { w: 0, l: 0, d: 0 };
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
    wrap.className = 'ck-wrap';
    wrap.style.setProperty('--st', top + 'px');
    wrap.innerHTML = `
      <div class="ck-head"><span class="ck-turn"></span><div class="ck-status"></div></div>
      <div class="ck-count"></div>
      <div class="ck-mid"><div class="ck-board"></div></div>
      <div class="ck-bar">
        <button class="ck-btn" data-a="undo">Anular</button>
        <button class="ck-btn" data-a="new">Nova partida</button>
      </div>`;
    root.appendChild(wrap);
    const boardEl = wrap.querySelector('.ck-board');
    const statusEl = wrap.querySelector('.ck-status');
    const turnEl = wrap.querySelector('.ck-turn');
    const countEl = wrap.querySelector('.ck-count');
    const undoBtn = wrap.querySelector('[data-a=undo]');
    const newBtn = wrap.querySelector('[data-a=new]');

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    // ---------- IA fora da thread principal ----------
    let worker = null, reqId = 0;
    const pending = new Map();
    try {
      const src = `const E=(${ENGINE.toString()})();
        onmessage=e=>{const d=e.data;postMessage({id:d.id,i:E.think(d.b,d.side,d.level)});};`;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = e => { const f = pending.get(e.data.id); pending.delete(e.data.id); if (f) f(e.data.i); };
      worker.onerror = () => { worker && worker.terminate(); worker = null; for (const f of pending.values()) f(null); pending.clear(); };
    } catch { worker = null; }
    function askAI(b, side, level) {
      return new Promise(res => {
        if (worker) {
          const id = ++reqId;
          pending.set(id, i => res(i == null ? E.think(b.slice(), side, 'easy') : i));
          worker.postMessage({ id, b, side, level });
        } else {
          // Sem Worker: corre num setTimeout para pelo menos deixar a UI desenhar antes.
          setTimeout(() => res(E.think(b.slice(), side, level)), 30);
        }
      });
    }

    // ---------- Estado ----------
    let G = null; // { v, mode:'ai'|'2p', level, board, turn, quiet, last, hist, over }
    let legal = [], sel = -1, step = 1, token = 0, thinking = false, animating = false, paused = false;
    let auto = null; // debug: { '1': nível } para uma IA jogar pelas amarelas
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const fast = () => debug && dbg.fast;

    function save() {
      if (!G || G.over) return;
      Arcade.store.set(SAVE_KEY, G);
    }

    function aiSide() { return G.mode === 'ai' ? -1 : 0; }
    function isAI(side) { return (G.mode === 'ai' && side === -1) || (auto && auto[side]); }
    function levelFor(side) { return auto && auto[side] ? auto[side] : G.level; }

    function start(mode, level) {
      token++; thinking = false; animating = false; paused = false;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      G = { v: 1, mode, level: level || 'normal', board: E.initial(), turn: 1, quiet: 0, last: null, hist: [], over: false };
      sel = -1; step = 1;
      overlay.hidden = true;
      save();
      afterChange();
    }

    function afterChange() {
      legal = G.over ? [] : E.moves(G.board, G.turn);
      sel = -1; step = 1;
      render();
      if (G.over) return;
      if (!legal.length) return finish(-G.turn);
      if (G.quiet >= DRAW_PLIES) return finish(0);
      if (isAI(G.turn) && !paused) runAI();
    }

    function runAI() {
      const my = ++token;
      thinking = true;
      render();
      const t0 = performance.now();
      const side = G.turn;
      askAI(G.board.slice(), side, levelFor(side)).then(i => {
        if (my !== token || !G || G.over || G.turn !== side) return;
        const wait = fast() ? 0 : Math.max(0, 450 - (performance.now() - t0));
        later(() => {
          if (my !== token) return;
          thinking = false;
          if (paused) { render(); return; }
          const m = legal[i] || legal[0];
          play(m);
        }, wait);
      });
    }

    function play(m) {
      G.hist.push({ board: G.board, turn: G.turn, quiet: G.quiet, last: G.last });
      if (G.hist.length > 300) G.hist.shift();
      const p = G.board[m.path[0]];
      const kingMove = (p === 2 || p === -2) && !m.caps.length;
      const next = E.apply(G.board, m);
      const my = token;
      animate(m, () => {
        if (my !== token) return;
        G.board = next;
        G.quiet = kingMove ? G.quiet + 1 : 0;
        G.last = { path: m.path, caps: m.caps };
        G.turn = -G.turn;
        if (m.caps.length) Arcade.buzz(m.caps.length > 1 ? 40 : 20);
        save();
        afterChange();
      });
    }

    // Peça a voar pelas casas do caminho; as capturadas encolhem.
    function animate(m, done) {
      if (fast()) return done();
      animating = true;
      sel = -1;
      render();
      const cs = boardEl.clientWidth / 8;
      const from = m.path[0];
      const pieceEl = boardEl.children[from].querySelector('.ck-p');
      if (!pieceEl || !pieceEl.animate) { animating = false; return done(); }
      const fly = pieceEl.cloneNode(true);
      fly.classList.remove('sel', 'must');
      fly.classList.add('ck-fly');
      fly.style.cssText = `left:${(from & 7) * cs + cs * 0.11}px;top:${(from >> 3) * cs + cs * 0.11}px;width:${cs * 0.78}px;height:${cs * 0.78}px;inset:auto`;
      fly.style.left = `${(from & 7) * cs + cs * 0.11}px`;
      fly.style.top = `${(from >> 3) * cs + cs * 0.11}px`;
      boardEl.appendChild(fly);
      pieceEl.classList.add('hide');
      const hop = m.caps.length ? 210 : 170;
      const frames = m.path.map(sq => ({ transform: `translate(${((sq & 7) - (from & 7)) * cs}px, ${((sq >> 3) - (from >> 3)) * cs}px)` }));
      const a = fly.animate(frames, { duration: hop * (m.path.length - 1), easing: 'ease-in-out', fill: 'forwards' });
      m.caps.forEach((c, k) => {
        const el = boardEl.children[c].querySelector('.ck-p');
        if (el) later(() => el.classList.add('gone'), hop * (k + 0.6));
      });
      a.onfinish = () => { animating = false; done(); };
    }

    function undo() {
      if (!G || !G.hist.length) return;
      token++; thinking = false; animating = false;
      if (G.over) { G.over = false; overlay.hidden = true; }
      let h;
      do { h = G.hist.pop(); } while (G.mode === 'ai' && h.turn === aiSide() && G.hist.length);
      if (G.mode === 'ai' && h.turn === aiSide()) { G.hist.push(h); return afterChange(); }
      G.board = h.board; G.turn = h.turn; G.quiet = h.quiet; G.last = h.last;
      save();
      afterChange();
    }

    // ---------- Toques ----------
    function sqFromEvent(e) {
      const r = boardEl.getBoundingClientRect();
      const c = Math.floor((e.clientX - r.left) / (r.width / 8)), rr = Math.floor((e.clientY - r.top) / (r.height / 8));
      return c >= 0 && c < 8 && rr >= 0 && rr < 8 ? rr * 8 + c : -1;
    }
    function candidates() { return sel < 0 ? [] : legal.filter(m => m.path[0] === sel && m.path.slice(1, step).every((s, k) => s === selPath[k])); }
    let selPath = [];
    function onDown(e) {
      if (!G || G.over || paused || thinking || animating || isAI(G.turn)) return;
      const sq = sqFromEvent(e);
      if (sq < 0) return;
      tap(sq);
    }
    function tap(sq) {
      const p = G.board[sq];
      if (p * G.turn > 0 && step === 1) {
        if (legal.some(m => m.path[0] === sq)) { sel = sq === sel ? -1 : sq; selPath = []; step = 1; }
        else { sel = -1; flashMust(); }
        return render();
      }
      if (sel < 0) { flashMust(); return render(); }
      const cand = candidates();
      // 1) próxima casa do caminho; 2) casa final de uma única sequência
      let next = cand.filter(m => m.path[step] === sq);
      if (!next.length) {
        const fin = cand.filter(m => m.path[m.path.length - 1] === sq);
        if (fin.length === 1) return play(fin[0]);
        if (p * G.turn > 0 && legal.some(m => m.path[0] === sq)) { sel = sq; selPath = []; step = 1; return render(); }
        sel = -1; selPath = []; step = 1;
        return render();
      }
      const done = next.filter(m => m.path.length === step + 1);
      if (next.length === 1 || (done.length && done.length === next.length)) return play(next[0]);
      selPath.push(sq); step++;
      render();
    }
    let mustFlash = 0;
    function flashMust() { mustFlash = performance.now(); }
    boardEl.addEventListener('pointerdown', onDown);
    undoBtn.onclick = undo;
    newBtn.onclick = () => chooseMode(true);

    // ---------- Desenho ----------
    function layout() {
      const availH = view.h - top - 22 - 44 - 12 - 18 - 12 - 52 - 12 - 14 - 8;
      const size = Math.floor(Math.min(view.w - 16, availH, 640) / 8) * 8;
      boardEl.style.width = size + 'px';
      boardEl.style.height = size + 'px';
      boardEl.style.setProperty('--cs', size / 8 + 'px');
    }

    function render() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
      if (!G) return;
      const b = G.board;
      const cand = candidates();
      const steps = new Set(), dests = new Set();
      for (const m of cand) {
        if (m.path.length > step + 1) steps.add(m.path[step]);
        dests.add(m.path[m.path.length - 1]);
      }
      const must = new Set();
      const isCap = legal.length && legal[0].caps.length > 0;
      const humanTurn = !G.over && !isAI(G.turn);
      if (humanTurn && isCap) legal.forEach(m => must.add(m.path[0]));
      const lastSet = new Set(G.last ? G.last.path : []);
      let h = '';
      for (let sq = 0; sq < 64; sq++) {
        const r = sq >> 3, c = sq & 7, dark = (r + c) % 2 === 1;
        let cls = 'ck-sq ' + (dark ? 'd' : 'l');
        if (lastSet.has(sq) && dark) cls += ' last';
        if (dests.has(sq)) cls += ' dest' + (isCap ? ' capt' : '');
        else if (steps.has(sq) || selPath.includes(sq)) cls += ' step';
        let pc = '';
        const p = b[sq];
        if (p) {
          let pcls = 'ck-p ' + (p > 0 ? 'y' : 'r') + (p === 2 || p === -2 ? ' k' : '');
          if (sq === sel) pcls += ' sel';
          else if (must.has(sq) && sel < 0) pcls += ' must';
          pc = `<div class="${pcls}"></div>`;
        }
        h += `<div class="${cls}">${pc}</div>`;
      }
      boardEl.innerHTML = h;
      undoBtn.disabled = !G.hist.length || (G.mode === 'ai' && !G.hist.some(x => x.turn !== aiSide()));

      const col = G.turn === 1 ? '#ffcc4d' : '#ff5a6e';
      turnEl.style.background = G.over ? '#34386a' : col;
      if (!G.over) {
        let title, sub;
        if (G.mode === 'ai') {
          title = G.turn === 1 && !auto ? 'A tua vez' : (thinking ? 'O computador está a pensar…' : 'Vez do computador');
          sub = `Contra o computador · ${DIFFS[G.level]}`;
        } else {
          title = `Vez das ${SIDE_NAME[G.turn]}`;
          sub = '2 jogadores';
        }
        if (isCap && humanTurn) sub = (legal[0].caps.length > 1 ? `Captura obrigatória de ${legal[0].caps.length} peças` : 'Captura obrigatória');
        statusEl.innerHTML = `${title}<small>${sub}</small>`;
      }
      let ny = 0, nr = 0;
      for (const p of b) { if (p > 0) ny++; else if (p < 0) nr++; }
      countEl.innerHTML = `<span><i class="ck-dot" style="background:#ffcc4d"></i>${ny} ${G.mode === 'ai' ? 'tuas' : 'amarelas'}</span>` +
        `<span><i class="ck-dot" style="background:#ff5a6e"></i>${nr} ${G.mode === 'ai' ? 'do computador' : 'vermelhas'}</span>`;
    }

    // winner: 1 amarelas, -1 vermelhas, 0 empate
    function finish(winner) {
      G.over = true;
      token++; thinking = false;
      Arcade.store.set(SAVE_KEY, null);
      let title, sub = '';
      const st = getStats();
      if (G.mode === 'ai' && !auto) {
        const k = G.level;
        if (winner === 1) st[k].w++; else if (winner === -1) st[k].l++; else st[k].d++;
        Arcade.store.set(STATS_KEY, st);
        title = winner === 1 ? 'Ganhaste!' : winner === -1 ? 'Perdeste' : 'Empate';
        const pl = (n, a, b) => `${n} ${n === 1 ? a : b}`;
        sub = `${DIFFS[k]}: ${pl(st[k].w, 'vitória', 'vitórias')} · ${pl(st[k].l, 'derrota', 'derrotas')} · ${pl(st[k].d, 'empate', 'empates')}`;
      } else {
        title = winner === 0 ? 'Empate' : `Ganharam as ${SIDE_NAME[winner]}!`;
        sub = winner === 0 ? '25 jogadas seguidas só com damas e sem capturas' : 'O adversário ficou sem jogadas';
      }
      statusEl.innerHTML = `${title}<small>${sub}</small>`;
      render();
      if (debug) dbg.result = { winner, plies: G.hist.length };
      // depois de uma vitória contra o computador já não se anula (senão as vitórias contavam a dobrar)
      const canUndo = !(G.mode === 'ai' && !auto && winner === 1);
      later(() => {
        overlay.innerHTML = `
          <h2>${title}</h2>
          <p>${sub}</p>
          <div class="stats">${ORDER.map(k => `<div><b>${st[k].w}</b><span>vitórias ${DIFFS[k].toLowerCase()}</span></div>`).join('')}</div>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          ${canUndo ? '<button class="btn center" data-a="undo">Anular última jogada</button>' : ''}
          <button class="btn center" data-a="menu">Menu</button>`;
        overlay.hidden = false;
        overlay.querySelector('[data-a=again]').onclick = () => start(G.mode, G.level);
        if (canUndo) overlay.querySelector('[data-a=undo]').onclick = undo;
        overlay.querySelector('[data-a=menu]').onclick = host.exit;
      }, fast() ? 0 : 900);
    }

    function chooseMode(cancelable) {
      const last = Arcade.store.get('checkers:level', 'normal');
      overlay.innerHTML = `
        <h2>Damas</h2>
        <p>Jogas com as amarelas. Capturar é obrigatório (e sempre o máximo de peças).</p>
        ${ORDER.map(k => `<button class="btn"${k === last ? ' style="border-color:#ffcc4d"' : ''} data-l="${k}"><b>Contra o computador · ${DIFFS[k]}</b>` +
          `<small>${k === 'easy' ? 'Vê poucas jogadas à frente' : k === 'normal' ? 'Pensa umas 4 jogadas à frente' : 'Pensa a fundo, não perdoa'}</small></button>`).join('')}
        <button class="btn" data-l="2p"><b>2 jogadores</b><small>No mesmo telemóvel, à vez</small></button>
        ${cancelable ? '<button class="btn center" data-a="back">Voltar</button>' : '<button class="btn center" data-a="menu">Menu</button>'}`;
      overlay.hidden = false;
      paused = true;
      overlay.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
        const l = b.dataset.l;
        if (l === '2p') start('2p', G ? G.level : 'normal');
        else { Arcade.store.set('checkers:level', l); start('ai', l); }
      });
      const back = overlay.querySelector('[data-a=back]');
      if (back) back.onclick = resume;
      const menu = overlay.querySelector('[data-a=menu]');
      if (menu) menu.onclick = host.exit;
    }

    // ---------- Pausa ----------
    function pause() {
      if (!G || G.over || paused) return;
      paused = true;
      save();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${G.mode === 'ai' ? 'Contra o computador · ' + DIFFS[G.level] : '2 jogadores'} · ${Math.ceil(G.hist.length / 2)} jogadas</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = resume;
      overlay.querySelector('[data-a=restart]').onclick = () => start(G.mode, G.level);
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    function resume() {
      if (!G) return chooseMode(false);
      paused = false;
      overlay.hidden = true;
      if (G.over) return;
      if (isAI(G.turn) && !thinking && !animating) runAI();
      else render();
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', onVis);
    const onResize = () => { layout(); render(); };
    window.addEventListener('resize', onResize);

    function offerResume(data) {
      G = data;
      paused = true;
      legal = E.moves(G.board, G.turn);
      render();
      overlay.innerHTML = `
        <h2>Partida guardada</h2>
        <p>${G.mode === 'ai' ? 'Contra o computador · ' + DIFFS[G.level] : '2 jogadores'} · ${Math.ceil(G.hist.length / 2)} jogadas</p>
        <button class="btn primary" data-a="go">Continuar partida</button>
        <button class="btn center" data-a="new">Nova partida</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { paused = false; overlay.hidden = true; afterChange(); };
      overlay.querySelector('[data-a=new]').onclick = () => chooseMode(false);
    }

    const dbg = { fast: false, result: null };
    if (debug) {
      Object.defineProperties(dbg, Object.getOwnPropertyDescriptors({
        engine: E,
        get G() { return G; },
        get legal() { return legal; },
        get thinking() { return thinking; },
        start,
        tap,
        // Põe uma posição qualquer (para testar regras). board: 64 valores; mode 'ai' ou '2p'.
        setPosition(board, turn, mode, level) { start(mode || '2p', level); G.board = board.slice(); G.turn = turn; afterChange(); },
        // Duas IAs a jogar uma contra a outra até ao fim.
        aiVsAi(yellowLevel, redLevel) {
          dbg.result = null;
          auto = { 1: yellowLevel };
          start('ai', redLevel);
        },
        stopAuto() { auto = null; },
      }));
      window.__checkers = dbg;
    }

    layout();
    const saved = Arcade.store.get(SAVE_KEY, null);
    if (saved && saved.v === 1 && !saved.over && Array.isArray(saved.board)) offerResume(saved);
    else { render(); chooseMode(false); }

    return {
      destroy() {
        save();
        token++;
        for (const t of timers) clearTimeout(t);
        timers.clear();
        if (worker) worker.terminate();
        boardEl.removeEventListener('pointerdown', onDown);
        disposeCanvas();
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (window.__checkers === dbg) delete window.__checkers;
      },
    };
  }

  Arcade.register({
    id: 'checkers',
    title: 'Damas',
    icon: '⛀',
    color: '#ffcc4d',
    desc: 'Damas clássicas contra o computador ou a dois no mesmo telemóvel.',
    best: () => {
      const s = getStats();
      if (!ORDER.some(k => s[k].w + s[k].l + s[k].d)) return '—';
      return ORDER.map(k => `${DIFFS[k][0]} ${s[k].w}`).join(' · ') + ' vitórias';
    },
    create,
  });
})();
