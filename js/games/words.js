// Palavras: dois jogos de palavras em português, sem rede.
// "Adivinha" (5 letras, 6 tentativas, palavra do dia + jogo livre) e "Sopa de letras" por temas.
// O dicionário vem de words-data.js (window.WORDS_PT), que tem de ser carregado antes deste ficheiro.
(function () {
  const DATA = window.WORDS_PT || { solutions: ['livro', 'praia', 'gato'], valid: [], themes: [] };
  const TRIES = 6, LEN = 5;

  // Tira acentos e cedilha: "Maçã" -> "maca".
  const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Soluções (forma com acentos por cada forma normalizada) e palavras aceites.
  const SOL = [];
  const SOL_FORM = new Map();
  for (const w of DATA.solutions) {
    const k = norm(w);
    if (k.length === LEN && /^[a-z]+$/.test(k) && !SOL_FORM.has(k)) { SOL_FORM.set(k, w); SOL.push(k); }
  }
  const VALID = new Set(SOL);
  for (const w of DATA.valid) { const k = norm(w); if (k.length === LEN) VALID.add(k); }

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Ordem fixa e baralhada das soluções para a palavra do dia (não segue o alfabeto).
  const DAILY_ORDER = (() => {
    const o = SOL.slice(), r = rng(20261116);
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  })();

  function today() {
    const d = new Date();
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      day: Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5),
      label: `${d.getDate()}/${d.getMonth() + 1}` };
  }
  const dailyWord = day => DAILY_ORDER[((day - 20000) % DAILY_ORDER.length + DAILY_ORDER.length) % DAILY_ORDER.length];

  // Avaliação com letras repetidas: primeiro as certas, depois as que existem noutro sítio.
  function score(guess, answer) {
    const res = new Array(LEN).fill('a');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) res[i] = 'c';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (res[i] === 'c') continue;
      if (left[guess[i]] > 0) { res[i] = 'p'; left[guess[i]]--; }
    }
    return res;
  }

  function fmt(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  const emptyStats = () => ({ played: 0, wins: 0, streak: 0, max: 0, dist: [0, 0, 0, 0, 0, 0], lastWin: null });

  // ---------- Sopa de letras ----------
  const DIRS = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  const FILL = 'AAAAAAAAAAAAAEEEEEEEEEEEOOOOOOOOOOSSSSSSSRRRRRRIIIIIINNNNNDDDDMMMMUUUUTTTTCCCCLLLPPPVVGGHQBFZJX';
  const COLS = 10, ROWS = 12;

  function makeSoup(theme, rand) {
    const pool = theme.words
      .map(w => ({ w, k: norm(w).replace(/[^a-z]/g, '').toUpperCase() }))
      .filter(o => o.k.length >= 3 && o.k.length <= Math.max(COLS, ROWS));
    for (let tries = 0; tries < 30; tries++) {
      const pick = pool.slice();
      for (let i = pick.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pick[i], pick[j]] = [pick[j], pick[i]]; }
      const chosen = pick.slice(0, 11).sort((a, b) => b.k.length - a.k.length);
      const grid = new Array(COLS * ROWS).fill('');
      const placed = [];
      for (const o of chosen) {
        let ok = false;
        for (let t = 0; t < 300 && !ok; t++) {
          const [dr, dc] = DIRS[Math.floor(rand() * 8)];
          const r0 = Math.floor(rand() * ROWS), c0 = Math.floor(rand() * COLS);
          const r1 = r0 + dr * (o.k.length - 1), c1 = c0 + dc * (o.k.length - 1);
          if (r1 < 0 || r1 >= ROWS || c1 < 0 || c1 >= COLS) continue;
          let fits = true;
          for (let k = 0; k < o.k.length; k++) {
            const g = grid[(r0 + dr * k) * COLS + c0 + dc * k];
            if (g && g !== o.k[k]) { fits = false; break; }
          }
          if (!fits) continue;
          for (let k = 0; k < o.k.length; k++) grid[(r0 + dr * k) * COLS + c0 + dc * k] = o.k[k];
          placed.push({ w: o.w, k: o.k, r: r0, c: c0, dr, dc });
          ok = true;
        }
        if (placed.length >= 10) break;
      }
      if (placed.length < 8) continue;
      for (let i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = FILL[Math.floor(rand() * FILL.length)];
      // ordem alfabética na lista
      placed.sort((a, b) => a.w.localeCompare(b.w, 'pt'));
      return { grid: grid.join(''), words: placed };
    }
    return null;
  }

  const FOUND_COLORS = ['#ff7a45', '#4aa8ff', '#ffcc4d', '#b388ff', '#2bcbba', '#ff5a8a', '#7bed9f', '#ffa07a', '#70a1ff', '#eccc68', '#c39bff'];

  const CSS = `
  .wd-wrap { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
    padding: calc(var(--st) + 22px) 8px calc(env(safe-area-inset-bottom) + 10px); }
  .wd-wrap[hidden] { display:none; }
  .wd-head { width:100%; max-width:520px; height:44px; padding:0 60px 0 8px; display:flex; align-items:center; gap:10px; flex:none; }
  .wd-title { font-size:22px; font-weight:800; }
  .wd-sub { color:#9aa0c8; font-size:14px; font-weight:600; flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wd-pill { background:#1a1c33; border-radius:12px; height:40px; padding:0 12px; display:flex; align-items:center; font-weight:800; font-size:17px; font-variant-numeric:tabular-nums; }
  .wd-board { display:grid; gap:6px; margin:auto 0 0; flex:none; }
  .wd-row { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; }
  .wd-row.shake { animation: wd-shake .4s; }
  @keyframes wd-shake { 20%,60% { transform:translateX(-7px) } 40%,80% { transform:translateX(7px) } }
  .wd-t { display:grid; place-items:center; border-radius:10px; border:2px solid #34386a; background:#14162a; font-weight:800; text-transform:uppercase; color:#eef0ff; }
  .wd-t.f { border-color:#6b70b8; animation: wd-pop .1s; }
  @keyframes wd-pop { 50% { transform:scale(1.08) } }
  .wd-t.c { background:#ff7a45; border-color:#ff7a45; color:#1a0d05; }
  .wd-t.p { background:#4aa8ff; border-color:#4aa8ff; color:#04121f; }
  .wd-t.a { background:#2e2a4f; border-color:#2e2a4f; color:#b9b3e6; }
  .wd-t.flip { animation: wd-flip .5s ease both; }
  @keyframes wd-flip { 0% { transform:rotateX(0) } 50% { transform:rotateX(90deg) } 100% { transform:rotateX(0) } }
  .wd-t.win { animation: wd-jump .5s ease both; }
  @keyframes wd-jump { 40% { transform:translateY(-14px) } 70% { transform:translateY(3px) } }
  .wd-msg { height:34px; margin:6px 0; display:flex; align-items:center; justify-content:center; flex:none; }
  .wd-msg span { background:#eef0ff; color:#0f1020; font-weight:700; border-radius:10px; padding:6px 14px; font-size:15px; }
  .wd-kb { width:100%; max-width:520px; display:flex; flex-direction:column; gap:7px; margin-bottom:auto; flex:none; }
  .wd-kr { display:grid; grid-template-columns:repeat(20,1fr); gap:5px; }
  .wd-k { grid-column:span 2; height:54px; border-radius:9px; border:0; background:#3a3f7a; color:#eef0ff; font:inherit; font-size:18px; font-weight:700; padding:0; }
  .wd-k.wide { grid-column:span 3; font-size:16px; }
  .wd-k:active { filter:brightness(1.3); }
  .wd-k.c { background:#ff7a45; color:#1a0d05; }
  .wd-k.p { background:#4aa8ff; color:#04121f; }
  .wd-k.a { background:#1c1a33; color:#6c6896; }
  .wd-legend { display:flex; gap:12px; justify-content:center; font-size:12px; color:#9aa0c8; margin-top:2px; }
  .wd-legend i { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-1px; margin-right:4px; }
  .wd-dist { width:100%; max-width:360px; display:flex; flex-direction:column; gap:4px; margin-bottom:8px; }
  .wd-dist div { display:flex; align-items:center; gap:6px; font-size:13px; font-weight:700; }
  .wd-dist b { height:20px; min-width:22px; border-radius:5px; background:#34386a; color:#eef0ff; display:flex; align-items:center; justify-content:flex-end; padding:0 6px; font-size:12px; }
  .wd-dist b.on { background:#ff7a45; color:#1a0d05; }
  .wd-sol { font-size:30px; font-weight:800; letter-spacing:4px; text-transform:uppercase; color:#ff7a45; margin:-2px 0 6px; }
  .wd-themes { display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%; max-width:360px; }
  .wd-themes .btn { padding:12px 10px; }
  .sp-list { position:absolute; left:8px; right:8px; display:flex; flex-wrap:wrap; gap:6px 8px; justify-content:center; align-content:flex-start; }
  .sp-list span { padding:4px 9px; border-radius:8px; background:#1a1c33; font-size:14px; font-weight:700; color:#eef0ff; }
  .sp-list span.ok { text-decoration:line-through; color:#0f1020; }
  .overlay .wd-scroll { overflow-y:auto; max-height:100%; width:100%; display:flex; flex-direction:column; align-items:center; gap:10px; padding:8px 0; }
  `;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    // ----- DOM da Adivinha -----
    const gw = document.createElement('div');
    gw.className = 'wd-wrap';
    gw.hidden = true;
    gw.style.setProperty('--st', top + 'px');
    const KB = ['qwertyuiop', 'asdfghjklç', '+zxcvbnm-'];
    gw.innerHTML = `
      <div class="wd-head"><div class="wd-title">Adivinha</div><div class="wd-sub" data-k="sub"></div></div>
      <div class="wd-board">${Array.from({ length: TRIES }, () => `<div class="wd-row">${'<div class="wd-t"></div>'.repeat(LEN)}</div>`).join('')}</div>
      <div class="wd-msg"></div>
      <div class="wd-kb">${KB.map(r => `<div class="wd-kr">${[...r].map(ch =>
        ch === '+' ? '<button class="wd-k wide" data-key="Enter" aria-label="Enviar">OK</button>' :
        ch === '-' ? '<button class="wd-k wide" data-key="Backspace" aria-label="Apagar">⌫</button>' :
        `<button class="wd-k" data-key="${ch}">${ch.toUpperCase()}</button>`).join('')}</div>`).join('')}
        <div class="wd-legend"><span><i style="background:#ff7a45"></i>certa</span><span><i style="background:#4aa8ff"></i>noutro sítio</span><span><i style="background:#2e2a4f"></i>não existe</span></div>
      </div>`;
    root.appendChild(gw);
    const boardEl = gw.querySelector('.wd-board');
    const rowEls = [...gw.querySelectorAll('.wd-row')];
    const tileEls = rowEls.map(r => [...r.children]);
    const msgEl = gw.querySelector('.wd-msg');
    const subEl = gw.querySelector('[data-k=sub]');
    const keyEls = {};
    gw.querySelectorAll('[data-key]').forEach(b => { keyEls[b.dataset.key] = b; });

    // ----- DOM da Sopa -----
    const sw = document.createElement('div');
    sw.className = 'wd-wrap';
    sw.hidden = true;
    sw.style.setProperty('--st', top + 'px');
    sw.style.pointerEvents = 'none';
    sw.innerHTML = `<div class="wd-head"><div class="wd-title">Sopa</div><div class="wd-sub" data-k="theme"></div><div class="wd-pill" data-k="time">0:00</div></div>
      <div class="sp-list"></div>`;
    root.appendChild(sw);
    const listEl = sw.querySelector('.sp-list');
    const themeEl = sw.querySelector('[data-k=theme]');
    const timeEl = sw.querySelector('[data-k=time]');

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    function showOverlay(html, actions) {
      overlay.innerHTML = `<div class="wd-scroll">${html}</div>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = actions[b.dataset.a]; });
    }

    let mode = null; // 'daily' | 'free' | 'soup'

    // =====================================================================
    // Adivinha
    // =====================================================================
    let G = null;       // { answer, guesses[], done, won, date? }
    let cur = '';       // tentativa em curso (com ç se escrito)
    let busy = false;   // animação a decorrer
    let msgT = 0;

    const statsKey = m => 'words:stats:' + m;

    function showMsg(t, ms = 1600) {
      msgEl.innerHTML = t ? `<span>${t}</span>` : '';
      clearTimeout(msgT);
      if (t && ms) msgT = setTimeout(() => { msgEl.innerHTML = ''; }, ms);
    }

    function saveGuess() {
      if (!G) return;
      if (mode === 'daily' || G.date) Arcade.store.set('words:daily', G);
      else Arcade.store.set('words:free', G);
    }

    function startGuess(m, fresh) {
      mode = m;
      sw.hidden = true; gw.hidden = false;
      overlay.hidden = true;
      cur = ''; busy = false;
      if (m === 'daily') {
        const t = today();
        const s = Arcade.store.get('words:daily', null);
        G = s && s.date === t.key && Array.isArray(s.guesses) ? s : { date: t.key, answer: dailyWord(t.day), guesses: [], done: false, won: false };
        subEl.textContent = `Palavra do dia · ${t.label}`;
      } else {
        const s = !fresh && Arcade.store.get('words:free', null);
        G = s && !s.done && Array.isArray(s.guesses) && SOL_FORM.has(s.answer) ? s
          : { answer: SOL[Math.floor(Math.random() * SOL.length)], guesses: [], done: false, won: false };
        subEl.textContent = 'Jogo livre';
      }
      saveGuess();
      layoutGuess();
      paintGuess();
      showMsg('');
      if (G.done) setTimeout(endGuess, 300);
    }

    function displayLetters(guess, res) {
      // Letras certas aparecem com o acento da solução.
      const form = SOL_FORM.get(G.answer) || G.answer;
      const formChars = [...form];
      return [...guess].map((ch, i) => res && res[i] === 'c' && formChars.length === LEN ? formChars[i] : ch);
    }

    function paintGuess() {
      const keyState = {};
      const rank = { a: 1, p: 2, c: 3 };
      G.guesses.forEach((g, r) => {
        const res = score(norm(g), G.answer);
        const shown = displayLetters(g, res);
        tileEls[r].forEach((t, i) => { t.className = 'wd-t ' + res[i]; t.textContent = shown[i]; });
        [...norm(g)].forEach((ch, i) => { if (!keyState[ch] || rank[res[i]] > rank[keyState[ch]]) keyState[ch] = res[i]; });
      });
      for (let r = G.guesses.length; r < TRIES; r++) {
        tileEls[r].forEach((t, i) => {
          const ch = r === G.guesses.length ? (cur[i] || '') : '';
          t.className = 'wd-t' + (ch ? ' f' : '');
          t.textContent = ch;
        });
      }
      for (const k in keyEls) {
        if (k.length !== 1) continue;
        const st = keyState[norm(k)];
        keyEls[k].className = 'wd-k' + (st ? ' ' + st : '');
      }
    }

    function typeKey(k) {
      if (mode === 'soup' || !G || G.done || busy || !overlay.hidden) return;
      if (k === 'Enter') return submit();
      if (k === 'Backspace') { cur = cur.slice(0, -1); paintGuess(); return; }
      const ch = k.toLowerCase();
      if (ch.length !== 1 || cur.length >= LEN) return;
      const c = ch === 'ç' ? 'ç' : norm(ch);
      if (c !== 'ç' && !/^[a-z]$/.test(c)) return;
      cur += c;
      paintGuess();
      const t = tileEls[G.guesses.length][cur.length - 1];
      t.classList.remove('f'); void t.offsetWidth; t.classList.add('f');
    }

    function shakeRow(msg) {
      const r = rowEls[G.guesses.length];
      r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
      showMsg(msg);
      Arcade.buzz(30);
    }

    function submit() {
      if (cur.length < LEN) return shakeRow('Faltam letras');
      const k = norm(cur);
      if (!VALID.has(k)) return shakeRow('Palavra não reconhecida');
      const row = G.guesses.length;
      G.guesses.push(cur);
      cur = '';
      const res = score(k, G.answer);
      const won = k === G.answer;
      if (won || G.guesses.length >= TRIES) { G.done = true; G.won = won; recordResult(); }
      saveGuess();
      // animação de virar as peças, uma de cada vez
      busy = true;
      const shown = displayLetters(G.guesses[row], res);
      tileEls[row].forEach((t, i) => {
        t.textContent = shown[i];
        setTimeout(() => { t.classList.add('flip'); }, i * 180);
        setTimeout(() => { t.className = 'wd-t flip ' + res[i]; }, i * 180 + 250);
      });
      setTimeout(() => {
        busy = false;
        paintGuess();
        if (G.done) {
          if (won) tileEls[row].forEach((t, i) => setTimeout(() => t.classList.add('win'), i * 90));
          showMsg(won ? ['Génio!', 'Fantástico!', 'Muito bem!', 'Boa!', 'Ufa, à justa!', 'Mesmo no fim!'][row] : (SOL_FORM.get(G.answer) || G.answer).toUpperCase(), 0);
          setTimeout(endGuess, 1300);
        }
      }, LEN * 180 + 350);
    }

    function recordResult() {
      const key = statsKey(G.date ? 'daily' : 'free');
      const st = Object.assign(emptyStats(), Arcade.store.get(key, null) || {});
      st.played++;
      if (G.won) {
        st.wins++;
        st.dist[G.guesses.length - 1]++;
        if (G.date) {
          // a sequência diária só continua se a vitória anterior foi ontem
          const y = new Date(G.date + 'T12:00:00'); y.setDate(y.getDate() - 1);
          const yk = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
          st.streak = st.lastWin === yk ? st.streak + 1 : 1;
          st.lastWin = G.date;
        } else st.streak++;
        st.max = Math.max(st.max, st.streak);
      } else st.streak = 0;
      Arcade.store.set(key, st);
    }

    function statsHtml(m, highlight) {
      const st = Object.assign(emptyStats(), Arcade.store.get(statsKey(m), null) || {});
      const mx = Math.max(1, ...st.dist);
      return `
        <div class="stats" style="grid-template-columns:repeat(4,1fr)">
          <div><b>${st.played}</b><span>jogos</span></div>
          <div><b>${st.played ? Math.round(st.wins / st.played * 100) : 0}%</b><span>vitórias</span></div>
          <div><b>${st.streak}</b><span>sequência</span></div>
          <div><b>${st.max}</b><span>melhor</span></div>
        </div>
        <div class="wd-dist">${st.dist.map((n, i) => `<div>${i + 1}<b class="${highlight === i ? 'on' : ''}" style="width:${8 + n / mx * 82}%">${n}</b></div>`).join('')}</div>`;
    }

    function endGuess() {
      const m = G.date ? 'daily' : 'free';
      const form = (SOL_FORM.get(G.answer) || G.answer);
      const acts = { look: () => { overlay.hidden = true; showMsg(G.won ? 'Resolvida!' : form.toUpperCase(), 0); }, modes: showModes, menu: host.exit };
      let primary;
      if (m === 'free') { acts.again = () => startGuess('free', true); primary = '<button class="btn primary" data-a="again">Jogar outra vez</button>'; }
      else { acts.free = () => startGuess('free', false); primary = '<button class="btn primary" data-a="free">Jogo livre</button>'; }
      showOverlay(`
        <h2>${G.won ? 'Acertaste!' : 'Não foi desta'}</h2>
        <p>${G.won ? `Em ${G.guesses.length} tentativa${G.guesses.length === 1 ? '' : 's'}:` : 'A palavra era:'}</p>
        <div class="wd-sol">${form}</div>
        ${m === 'daily' ? '<p>Há palavra nova amanhã.</p>' : ''}
        ${statsHtml(m, G.won ? G.guesses.length - 1 : -1)}
        ${primary}
        <button class="btn center" data-a="look">Ver tabuleiro</button>
        <button class="btn center" data-a="modes">Outros modos</button>
        <button class="btn center" data-a="menu">Menu</button>`, acts);
    }

    function layoutGuess() {
      const kh = Math.round(Math.max(42, Math.min(58, (view.h - top) * 0.066)));
      gw.querySelectorAll('.wd-k').forEach(k => { k.style.height = kh + 'px'; });
      const kbH = 3 * kh + 2 * 7 + 22;
      const availH = view.h - top - 22 - 44 - 46 - kbH - 30;
      const byW = (Math.min(view.w, 520) - 40 - 4 * 6) / LEN;
      const byH = (availH - 5 * 6) / TRIES;
      const t = Math.floor(Math.max(30, Math.min(byW, byH, 66)));
      boardEl.style.width = (t * LEN + 4 * 6) + 'px';
      rowEls.forEach(r => { r.style.height = t + 'px'; });
      boardEl.style.fontSize = Math.round(t * 0.52) + 'px';
    }
    gw.querySelectorAll('[data-key]').forEach(b => {
      b.addEventListener('pointerdown', e => { e.preventDefault(); typeKey(b.dataset.key); });
    });

    // =====================================================================
    // Sopa de letras
    // =====================================================================
    let P = null;        // { theme, grid, words[], found[], time }
    let runFrom = 0;
    let sel = null;      // { id, r0, c0, r1, c1 }
    const SG = { x: 0, y: 0, cs: 30 };

    const elapsed = () => P ? P.time + (runFrom ? performance.now() - runFrom : 0) : 0;
    function runClock() { if (!runFrom && P && !P.done && mode === 'soup' && overlay.hidden && !document.hidden) runFrom = performance.now(); }
    function stopClock() { if (runFrom && P) { P.time += performance.now() - runFrom; runFrom = 0; } }

    function saveSoup() {
      if (!P) return;
      const t = elapsed();
      Arcade.store.set('words:soup', P.done ? null : Object.assign({}, P, { time: Math.round(t) }));
    }

    function newSoup(themeIdx) {
      const themes = DATA.themes;
      if (!themes.length) return;
      if (themeIdx == null || themeIdx < 0) themeIdx = Math.floor(Math.random() * themes.length);
      const s = makeSoup(themes[themeIdx], Math.random);
      P = { theme: themeIdx, grid: s.grid, words: s.words, found: [], time: 0, done: false };
      runFrom = 0;
      Arcade.store.set('words:lastTheme', themeIdx);
      startSoup();
    }

    function startSoup() {
      mode = 'soup';
      gw.hidden = true; sw.hidden = false;
      overlay.hidden = true;
      sel = null;
      themeEl.textContent = DATA.themes[P.theme].name;
      layoutSoup();
      paintList();
      saveSoup();
      runClock();
    }

    function paintList() {
      listEl.innerHTML = P.words.map((o, i) => {
        const f = P.found.indexOf(i);
        return `<span class="${f >= 0 ? 'ok' : ''}" style="${f >= 0 ? 'background:' + FOUND_COLORS[f % FOUND_COLORS.length] : ''}">${o.w}</span>`;
      }).join('');
    }

    function layoutSoup() {
      const y0 = top + 22 + 44 + 10;
      const listH = Math.max(96, Math.ceil(P ? P.words.length / 3 : 4) * 32);
      const byW = (Math.min(view.w, 560) - 16) / COLS;
      const byH = (view.h - y0 - listH - 24) / ROWS;
      SG.cs = Math.floor(Math.max(20, Math.min(byW, byH, 52)));
      SG.x = Math.round((view.w - SG.cs * COLS) / 2);
      SG.y = y0;
      listEl.style.top = (SG.y + SG.cs * ROWS + 12) + 'px';
    }

    function cellFrom(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: (e.clientX - rect.left - SG.x) / SG.cs, y: (e.clientY - rect.top - SG.y) / SG.cs };
    }

    // A seleção vai do primeiro toque até ao dedo, presa a uma das 8 direções.
    function updateSel(p) {
      const dx = p.x - (sel.c0 + 0.5), dy = p.y - (sel.r0 + 0.5);
      const d = Math.hypot(dx, dy);
      if (d < 0.5) { sel.r1 = sel.r0; sel.c1 = sel.c0; return; }
      const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      const dc = Math.round(Math.cos(a * Math.PI / 4)), dr = Math.round(Math.sin(a * Math.PI / 4));
      let n = Math.round(dc && dr ? d / Math.SQRT2 : d);
      // não sai da grelha
      while (n > 0 && (sel.r0 + dr * n < 0 || sel.r0 + dr * n >= ROWS || sel.c0 + dc * n < 0 || sel.c0 + dc * n >= COLS)) n--;
      sel.r1 = sel.r0 + dr * n; sel.c1 = sel.c0 + dc * n;
    }

    function selCells(s) {
      const dr = Math.sign(s.r1 - s.r0), dc = Math.sign(s.c1 - s.c0);
      const n = Math.max(Math.abs(s.r1 - s.r0), Math.abs(s.c1 - s.c0));
      const out = [];
      for (let k = 0; k <= n; k++) out.push([s.r0 + dr * k, s.c0 + dc * k]);
      return out;
    }

    function onSoupDown(e) {
      if (mode !== 'soup' || !P || P.done || !overlay.hidden || sel) return;
      const p = cellFrom(e);
      const c = Math.floor(p.x), r = Math.floor(p.y);
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return;
      e.preventDefault();
      sel = { id: e.pointerId, r0: r, c0: c, r1: r, c1: c };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    }
    function onSoupMove(e) {
      if (!sel || e.pointerId !== sel.id) return;
      updateSel(cellFrom(e));
    }
    function onSoupUp(e) {
      if (!sel || e.pointerId !== sel.id) return;
      const s = sel;
      sel = null;
      if (mode !== 'soup' || !P || P.done) return;
      const cells = selCells(s);
      if (cells.length < 2) return;
      const str = cells.map(([r, c]) => P.grid[r * COLS + c]).join('');
      const rev = [...str].reverse().join('');
      const i = P.words.findIndex((o, k) => !P.found.includes(k) && (o.k === str || o.k === rev));
      if (i < 0) { Arcade.buzz(15); return; }
      // guarda as casas da palavra na sua posição real (a seleção pode estar ao contrário)
      P.found.push(i);
      Arcade.buzz(25);
      paintList();
      if (P.found.length === P.words.length) winSoup();
      else saveSoup();
    }
    canvas.addEventListener('pointerdown', onSoupDown);
    window.addEventListener('pointermove', onSoupMove);
    window.addEventListener('pointerup', onSoupUp);
    window.addEventListener('pointercancel', onSoupUp);

    function winSoup() {
      stopClock();
      P.done = true;
      const t = P.time;
      const best = Arcade.store.get('words:soupBest', null);
      const record = best == null || t < best;
      if (record) Arcade.store.set('words:soupBest', Math.round(t));
      Arcade.store.set('words:soupDone', Arcade.store.get('words:soupDone', 0) + 1);
      Arcade.store.set('words:soup', null);
      Arcade.buzz(50);
      setTimeout(() => {
        if (mode !== 'soup') return;
        showOverlay(`
          <h2>${record ? 'Novo recorde!' : 'Sopa resolvida!'}</h2>
          <p>${DATA.themes[P.theme].name} · ${P.words.length} palavras</p>
          <div class="stats">
            <div><b>${fmt(t)}</b><span>tempo</span></div>
            <div><b>${fmt(record ? t : best)}</b><span>melhor</span></div>
            <div><b>${Arcade.store.get('words:soupDone', 0)}</b><span>resolvidas</span></div>
          </div>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          <button class="btn center" data-a="theme">Outro tema</button>
          <button class="btn center" data-a="modes">Outros modos</button>
          <button class="btn center" data-a="menu">Menu</button>`,
          { again: () => newSoup(P.theme), theme: chooseTheme, modes: showModes, menu: host.exit });
      }, 700);
    }

    function chooseTheme() {
      stopClock(); saveSoup();
      const acts = { rand: () => newSoup(-1), modes: showModes };
      const btns = DATA.themes.map((t, i) => { acts['t' + i] = () => newSoup(i); return `<button class="btn center" data-a="t${i}">${t.name}</button>`; }).join('');
      showOverlay(`
        <h2>Sopa de letras</h2>
        <p>Escolhe um tema. Arrasta o dedo sobre as letras (em qualquer direção).</p>
        <button class="btn primary" data-a="rand">Tema ao acaso</button>
        <div class="wd-themes">${btns}</div>
        <button class="btn center" data-a="modes">Voltar</button>`, acts);
    }

    function drawSoup() {
      const cs = SG.cs, gw2 = cs * COLS, gh = cs * ROWS;
      ctx.fillStyle = '#1a1c33';
      const bx = SG.x - 6, by = SG.y - 6, bw = gw2 + 12, bh = gh + 12, br = 14;
      ctx.beginPath();
      ctx.moveTo(bx + br, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, br); ctx.arcTo(bx + bw, by + bh, bx, by + bh, br);
      ctx.arcTo(bx, by + bh, bx, by, br); ctx.arcTo(bx, by, bx + bw, by, br); ctx.closePath(); ctx.fill();
      const capsule = (r0, c0, r1, c1, col, alpha) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = col;
        ctx.lineCap = 'round';
        ctx.lineWidth = cs * 0.78;
        ctx.beginPath();
        ctx.moveTo(SG.x + (c0 + 0.5) * cs, SG.y + (r0 + 0.5) * cs);
        ctx.lineTo(SG.x + (c1 + 0.5) * cs + 0.01, SG.y + (r1 + 0.5) * cs);
        ctx.stroke();
        ctx.restore();
      };
      P.found.forEach((i, n) => {
        const o = P.words[i], L = o.k.length - 1;
        capsule(o.r, o.c, o.r + o.dr * L, o.c + o.dc * L, FOUND_COLORS[n % FOUND_COLORS.length], 0.55);
      });
      if (sel) capsule(sel.r0, sel.c0, sel.r1, sel.c1, '#eef0ff', 0.35);
      ctx.fillStyle = '#eef0ff';
      ctx.font = `700 ${Math.round(cs * 0.55)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        ctx.fillText(P.grid[r * COLS + c], SG.x + (c + 0.5) * cs, SG.y + (r + 0.5) * cs + 1);
      }
    }

    // =====================================================================
    // Modos, pausa, ciclo
    // =====================================================================
    function showModes() {
      stopClock(); saveSoup();
      const t = today();
      const d = Arcade.store.get('words:daily', null);
      const dailyDone = d && d.date === t.key && d.done;
      const fr = Arcade.store.get('words:free', null);
      const sp = Arcade.store.get('words:soup', null);
      const ds = Object.assign(emptyStats(), Arcade.store.get(statsKey('daily'), null) || {});
      const fs = Object.assign(emptyStats(), Arcade.store.get(statsKey('free'), null) || {});
      const sb = Arcade.store.get('words:soupBest', null);
      showOverlay(`
        <h2>Palavras</h2>
        <p>Escolhe o jogo</p>
        <button class="btn" data-a="daily"><b>Adivinha · palavra do dia</b><small>${dailyDone ? (d.won ? `Feita em ${d.guesses.length} ✓` : 'Falhada hoje') + ' · ' : ''}sequência ${ds.streak} · ${ds.wins} vitórias</small></button>
        <button class="btn" data-a="free"><b>Adivinha · jogo livre</b><small>${fr && !fr.done && fr.guesses.length ? 'Partida a meio · ' : ''}sequência ${fs.streak} · melhor ${fs.max}</small></button>
        <button class="btn" data-a="soup"><b>Sopa de letras</b><small>${sp ? `Continuar: ${DATA.themes[sp.theme] ? DATA.themes[sp.theme].name : ''} · ` : ''}melhor tempo ${sb == null ? '—' : fmt(sb)}</small></button>
        <button class="btn center" data-a="stats">Estatísticas</button>
        <button class="btn center" data-a="menu">Menu</button>`, {
        daily: () => startGuess('daily'),
        free: () => startGuess('free', false),
        soup: () => {
          const s = Arcade.store.get('words:soup', null);
          if (s && s.grid && s.grid.length === COLS * ROWS && DATA.themes[s.theme]) { P = s; runFrom = 0; startSoup(); }
          else chooseTheme();
        },
        stats: showStats,
        menu: host.exit,
      });
    }

    function showStats() {
      const sb = Arcade.store.get('words:soupBest', null);
      showOverlay(`
        <h2>Estatísticas</h2>
        <p>Palavra do dia</p>${statsHtml('daily', -1)}
        <p>Jogo livre</p>${statsHtml('free', -1)}
        <p>Sopa de letras: ${Arcade.store.get('words:soupDone', 0)} resolvidas · melhor ${sb == null ? '—' : fmt(sb)}</p>
        <button class="btn center" data-a="back">Voltar</button>`, { back: showModes });
    }

    function pause() {
      if (!overlay.hidden || !mode) return;
      if (mode === 'soup') {
        if (!P || P.done) return;
        stopClock(); saveSoup();
        sel = null;
        const found = P.found.length;
        showOverlay(`
          <h2>Pausa</h2>
          <p>${DATA.themes[P.theme].name} · ${fmt(elapsed())} · ${found}/${P.words.length}</p>
          <button class="btn primary" data-a="go">Continuar</button>
          <button class="btn center" data-a="restart">Recomeçar</button>
          <button class="btn center" data-a="theme">Outro tema</button>
          <button class="btn center" data-a="modes">Outros modos</button>
          <button class="btn center" data-a="menu">Menu</button>`,
          { go: () => { overlay.hidden = true; runClock(); }, restart: () => newSoup(P.theme), theme: chooseTheme, modes: showModes, menu: host.exit });
      } else {
        if (!G || busy) return;
        if (G.done) { endGuess(); return; }
        saveGuess();
        const acts = { go: () => { overlay.hidden = true; }, modes: showModes, menu: host.exit };
        let restart = '';
        if (mode === 'free') { acts.restart = () => { if (!G.done && G.guesses.length) { recordResult(); } startGuess('free', true); }; restart = `<button class="btn center" data-a="restart">Recomeçar${!G.done && G.guesses.length ? ' (conta como derrota)' : ''}</button>`; }
        showOverlay(`
          <h2>Pausa</h2>
          <p>${mode === 'daily' ? 'Palavra do dia' : 'Jogo livre'} · tentativa ${Math.min(TRIES, G.guesses.length + 1)}/${TRIES}</p>
          <button class="btn primary" data-a="go">Continuar</button>
          ${restart}
          <button class="btn center" data-a="modes">Outros modos</button>
          <button class="btn center" data-a="menu">Menu</button>`, acts);
      }
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) { if (mode === 'soup') pause(); else saveGuess(); } };
    document.addEventListener('visibilitychange', onVis);

    const onKey = e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') { if (overlay.hidden) pause(); return; }
      if (mode !== 'daily' && mode !== 'free') return;
      if (e.key === 'Enter' || e.key === 'Backspace') { e.preventDefault(); typeKey(e.key); }
      else if (e.key.length === 1) typeKey(e.key);
    };
    window.addEventListener('keydown', onKey);

    function onResize() { if (mode === 'soup') layoutSoup(); else layoutGuess(); }
    window.addEventListener('resize', onResize);

    const loop = Arcade.loop(() => {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
      if (mode === 'soup' && P) {
        drawSoup();
        timeEl.textContent = fmt(elapsed());
      }
    });
    const autosave = setInterval(() => { if (mode === 'soup' && runFrom) saveSoup(); }, 5000);

    if (window.ARCADE_DEBUG) {
      window.__wordsDebug = {
        answer: () => G && G.answer,
        mode: () => mode,
        soup: () => P && { words: P.words, found: P.found, grid: P.grid, cols: COLS, rows: ROWS, x: SG.x, y: SG.y, cs: SG.cs },
      };
    }

    layoutGuess();
    showModes();

    return {
      destroy() {
        stopClock();
        saveSoup();
        saveGuess();
        loop.stop();
        clearInterval(autosave);
        clearTimeout(msgT);
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onSoupDown);
        window.removeEventListener('pointermove', onSoupMove);
        window.removeEventListener('pointerup', onSoupUp);
        window.removeEventListener('pointercancel', onSoupUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (window.__wordsDebug) delete window.__wordsDebug;
      },
    };
  }

  Arcade.register({
    id: 'words',
    title: 'Palavras',
    icon: '🔤',
    color: '#4aa8ff',
    desc: 'Adivinha a palavra de 5 letras ou encontra-as na sopa de letras.',
    best: () => {
      const d = Arcade.store.get('words:stats:daily', null);
      const f = Arcade.store.get('words:stats:free', null);
      const wins = (d ? d.wins : 0) + (f ? f.wins : 0);
      const mx = Math.max(d ? d.max : 0, f ? f.max : 0);
      const sb = Arcade.store.get('words:soupBest', null);
      const parts = [];
      if (d || f) parts.push(`${wins} vitória${wins === 1 ? '' : 's'} · sequência ${mx}`);
      if (sb != null) parts.push(`sopa ${fmt(sb)}`);
      return parts.length ? parts.join(' · ') : '—';
    },
    create,
  });
})();
