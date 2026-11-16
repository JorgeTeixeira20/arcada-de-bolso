// Labirinto: inclina o telemóvel para levar a bola até à saída, sem cair nos buracos.
// Sem sensor (ou sem permissão) joga-se com o joystick de toque ou com WASD/setas.
(function () {
  const TAU = Math.PI * 2;
  const N = 1, E = 2, S_ = 4, W = 8;
  const DIRS = [[0, -1, N, S_], [1, 0, E, W], [0, 1, S_, N], [-1, 0, W, E]];
  const WALL_T = 0.14, BALL_R = 0.27, HOLE_R = 0.34;
  const ACCEL = 24, MAX_V = 9, DRAG = 1.1, BOUNCE = 0.35;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Número de colunas por nível; as linhas saem da proporção do ecrã.
  function boardSize(level, availW, availH) {
    const maxCols = Math.max(5, Math.floor(availW / 26));
    const cols = Math.min(maxCols, 4 + level);
    const cs = availW / cols;
    const rows = Math.max(cols + 1, Math.min(Math.floor(availH / cs), Math.round(cols * 2.2)));
    return { cols, rows };
  }

  // Labirinto perfeito por "recursive backtracker" (iterativo), determinístico por nível.
  function generate(level, cols, rows) {
    const r = rng(level * 7919 + cols * 31 + rows);
    const cells = new Uint8Array(cols * rows).fill(N | E | S_ | W);
    const seen = new Uint8Array(cols * rows);
    const idx = (c, rr) => rr * cols + c;
    const stack = [[0, 0]];
    seen[0] = 1;
    while (stack.length) {
      const [c, rr] = stack[stack.length - 1];
      const opts = DIRS.filter(([dx, dy]) => {
        const nc = c + dx, nr = rr + dy;
        return nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[idx(nc, nr)];
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy, wa, wb] = opts[Math.floor(r() * opts.length)];
      const nc = c + dx, nr = rr + dy;
      cells[idx(c, rr)] &= ~wa;
      cells[idx(nc, nr)] &= ~wb;
      seen[idx(nc, nr)] = 1;
      stack.push([nc, nr]);
    }
    // BFS a partir da entrada: a saída fica na célula mais distante.
    const dist = new Int32Array(cols * rows).fill(-1), par = new Int32Array(cols * rows).fill(-1);
    const q = [0]; dist[0] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], c = i % cols, rr = (i / cols) | 0;
      for (const [dx, dy, wa] of DIRS) {
        if (cells[i] & wa) continue;
        const j = idx(c + dx, rr + dy);
        if (dist[j] < 0) { dist[j] = dist[i] + 1; par[j] = i; q.push(j); }
      }
    }
    let exit = 0;
    for (let i = 0; i < dist.length; i++) if (dist[i] > dist[exit]) exit = i;
    const path = [];
    for (let i = exit; i >= 0; i = par[i]) path.push(i);
    path.reverse();
    const onPath = new Set(path);
    // Armadilhas: em células fora do caminho, logo ao lado dele (para castigar quem passa do ponto).
    const cand = [];
    for (const i of path) {
      if (dist[i] < 2) continue;
      const c = i % cols, rr = (i / cols) | 0;
      for (const [dx, dy, wa] of DIRS) {
        if (cells[i] & wa) continue;
        const j = idx(c + dx, rr + dy);
        if (!onPath.has(j)) cand.push(j);
      }
    }
    const want = Math.min(cand.length, 1 + Math.floor(level * 0.9));
    const traps = [];
    const used = new Set();
    while (traps.length < want && cand.length) {
      const j = cand.splice(Math.floor(r() * cand.length), 1)[0];
      if (used.has(j)) continue;
      used.add(j);
      traps.push({ x: (j % cols) + 0.5, y: ((j / cols) | 0) + 0.5 });
    }
    // Paredes como retângulos (em unidades de célula), indexados por célula para a colisão.
    const rects = [];
    const byCell = Array.from({ length: cols * rows }, () => []);
    const add = (x0, y0, x1, y1, cellsTouch) => {
      const rc = { x0, y0, x1, y1 };
      rects.push(rc);
      for (const k of cellsTouch) if (k >= 0 && k < byCell.length) byCell[k].push(rc);
    };
    const h = WALL_T / 2;
    for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
      const i = idx(c, rr), v = cells[i];
      const near = (cc, r2) => (cc >= 0 && cc < cols && r2 >= 0 && r2 < rows) ? idx(cc, r2) : -1;
      if (v & N) add(c - h, rr - h, c + 1 + h, rr + h, [i, near(c, rr - 1)]);
      if (v & W) add(c - h, rr - h, c + h, rr + 1 + h, [i, near(c - 1, rr)]);
      if (rr === rows - 1 && (v & S_)) add(c - h, rr + 1 - h, c + 1 + h, rr + 1 + h, [i]);
      if (c === cols - 1 && (v & E)) add(c + 1 - h, rr - h, c + 1 + h, rr + 1 + h, [i]);
    }
    return {
      cols, rows, cells, rects, byCell, traps, pathLen: path.length,
      path: path.map(i => ({ x: (i % cols) + 0.5, y: ((i / cols) | 0) + 0.5 })),
      exit: { x: (exit % cols) + 0.5, y: ((exit / cols) | 0) + 0.5 },
      start: { x: 0.5, y: 0.5 },
    };
  }

  const parFor = m => ({ three: Math.round(2 + m.pathLen * 0.42), two: Math.round(4 + m.pathLen * 0.8) });
  const starsFor = (m, t) => { const p = parFor(m); return t <= p.three ? 3 : t <= p.two ? 2 : 1; };
  const quedas = n => n === 1 ? '1 queda' : `${n} quedas`;
  const fmtT = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const stick = Arcade.joystick(canvas);
    const top = Arcade.safeTop();

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const calBtn = document.createElement('button');
    calBtn.className = 'hud-btn';
    calBtn.textContent = '◎';
    calBtn.style.right = '64px';
    calBtn.setAttribute('aria-label', 'Recalibrar sensor');
    calBtn.hidden = true;
    root.appendChild(calBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.style.overflowY = 'auto';
    root.appendChild(overlay);

    const SAVE_KEY = 'tilt:save', LEVEL_KEY = 'tilt:level', BEST_KEY = 'tilt:best';
    const STARS_KEY = 'tilt:stars', TIMES_KEY = 'tilt:times';

    // ---------- Sensor ----------
    let mode = 'touch';            // 'tilt' ou 'touch'
    let reading = null;            // última leitura { beta, gamma }
    let neutral = { beta: 0, gamma: 0 };
    let toast = null;
    const onOrient = e => {
      if (e.beta == null || e.gamma == null) return;
      reading = { beta: e.beta, gamma: e.gamma };
    };
    window.addEventListener('deviceorientation', onOrient);
    function calibrate() {
      if (reading) neutral = { ...reading };
      showToast('Posição neutra calibrada');
    }
    function showToast(text) { toast = { text, life: 1.6 }; }
    calBtn.onclick = calibrate;

    function tiltVec() {
      if (mode !== 'tilt' || !reading) return { x: 0, y: 0 };
      let db = reading.beta - neutral.beta, dg = reading.gamma - neutral.gamma;
      if (db > 180) db -= 360; if (db < -180) db += 360;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let x = dg, y = db;
      if (ang === 90) { x = db; y = -dg; }
      else if (ang === -90 || ang === 270) { x = -db; y = dg; }
      else if (ang === 180) { x = -dg; y = -db; }
      const f = v => { const s = Math.max(-1, Math.min(1, v / 22)); return Math.abs(s) < 0.04 ? 0 : s; };
      return { x: f(x), y: f(y) };
    }

    // Pede a permissão (iOS) dentro do toque e espera por uma leitura real.
    function enableSensor(onDone) {
      const DOE = window.DeviceOrientationEvent;
      const waitForData = () => {
        const t0 = performance.now();
        const check = () => {
          if (destroyed) return;
          if (reading) { mode = 'tilt'; onDone(true); }
          else if (performance.now() - t0 > 900) { mode = 'touch'; onDone(false); }
          else setTimeout(check, 50);
        };
        check();
      };
      if (!DOE) { mode = 'touch'; onDone(false); return; }
      if (typeof DOE.requestPermission === 'function') {
        let p;
        try { p = DOE.requestPermission(); } catch { p = Promise.resolve('denied'); }
        Promise.resolve(p).then(res => {
          if (res === 'granted') waitForData();
          else { mode = 'touch'; onDone(false, 'Permissão recusada'); }
        }, () => { mode = 'touch'; onDone(false, 'Permissão recusada'); });
      } else waitForData();
    }

    // ---------- Estado ----------
    let S = null, M = null, destroyed = false;
    let geo = { cs: 40, ox: 0, oy: 0 };
    const boardArea = () => ({ x: 12, y: top + 78, w: view.w - 24, h: view.h - top - 78 - 16 });

    function layout() {
      if (!M) return;
      const a = boardArea();
      const cs = Math.min(a.w / M.cols, a.h / M.rows);
      geo = { cs, ox: a.x + (a.w - cs * M.cols) / 2, oy: a.y + (a.h - cs * M.rows) / 2 };
    }
    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    function buildLevel(level, sizeHint) {
      const a = boardArea();
      const size = sizeHint || boardSize(level, a.w, a.h);
      M = generate(level, size.cols, size.rows);
      layout();
    }

    function startLevel(level, resume) {
      const saveOk = resume && resume.level === level;
      buildLevel(level, saveOk ? { cols: resume.cols, rows: resume.rows } : null);
      S = {
        level, phase: 'play', t: saveOk ? resume.t : 0, falls: saveOk ? resume.falls : 0,
        b: { x: saveOk ? resume.bx : M.start.x, y: saveOk ? resume.by : M.start.y, vx: 0, vy: 0 },
        anim: 0, saveT: 3, hintT: mode === 'touch' ? 4 : 0,
      };
      Arcade.store.set(LEVEL_KEY, Math.max(level, Arcade.store.get(LEVEL_KEY, 1)));
      overlay.hidden = true;
      pauseBtn.hidden = false;
      calBtn.hidden = mode !== 'tilt';
      stick.reset();
      if (mode === 'tilt') calibrate();
    }

    function saveRun() {
      if (!S || !M || S.phase === 'done' || S.phase === 'win') return;
      Arcade.store.set(SAVE_KEY, { v: 1, level: S.level, cols: M.cols, rows: M.rows, t: S.t, falls: S.falls, bx: S.b.x, by: S.b.y });
    }

    // ---------- Física ----------
    function collide(b) {
      const c = Math.floor(b.x), r = Math.floor(b.y);
      const seen = new Set();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const cc = c + dx, rr = r + dy;
        if (cc < 0 || rr < 0 || cc >= M.cols || rr >= M.rows) continue;
        for (const rc of M.byCell[rr * M.cols + cc]) {
          if (seen.has(rc)) continue;
          seen.add(rc);
          const px = Math.max(rc.x0, Math.min(b.x, rc.x1)), py = Math.max(rc.y0, Math.min(b.y, rc.y1));
          let nx = b.x - px, ny = b.y - py;
          const d2 = nx * nx + ny * ny;
          if (d2 >= BALL_R * BALL_R) continue;
          let d = Math.sqrt(d2), push;
          if (d < 1e-6) { // centro dentro da parede: sai pelo lado mais próximo
            const opts = [[b.x - rc.x0, -1, 0], [rc.x1 - b.x, 1, 0], [b.y - rc.y0, 0, -1], [rc.y1 - b.y, 0, 1]];
            opts.sort((p, q) => p[0] - q[0]);
            nx = opts[0][1]; ny = opts[0][2]; push = opts[0][0] + BALL_R;
          } else { nx /= d; ny /= d; push = BALL_R - d; }
          b.x += nx * push; b.y += ny * push;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + BOUNCE) * vn * nx; b.vy -= (1 + BOUNCE) * vn * ny;
            if (vn < -4) Arcade.buzz(8);
          }
        }
      }
      // Limites do tabuleiro (segurança)
      b.x = Math.max(BALL_R, Math.min(M.cols - BALL_R, b.x));
      b.y = Math.max(BALL_R, Math.min(M.rows - BALL_R, b.y));
    }

    function update(dt) {
      if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }
      if (!S) return;
      if (S.phase === 'fall') {
        S.anim -= dt;
        if (S.anim <= 0) {
          S.b = { x: M.start.x, y: M.start.y, vx: 0, vy: 0 };
          S.phase = 'play';
        }
        return;
      }
      if (S.phase === 'win') {
        S.anim -= dt;
        if (S.anim <= 0) levelDone();
        return;
      }
      if (S.phase !== 'play') return;
      S.t += dt;
      if (S.hintT > 0) S.hintT -= dt;
      S.saveT -= dt;
      if (S.saveT <= 0) { S.saveT = 3; saveRun(); }

      const tv = tiltVec(), jv = stick.vec();
      let ix = tv.x + jv.x, iy = tv.y + jv.y;
      const m = Math.hypot(ix, iy);
      if (m > 1) { ix /= m; iy /= m; }
      const b = S.b;
      b.vx += ix * ACCEL * dt; b.vy += iy * ACCEL * dt;
      const k = Math.exp(-DRAG * dt);
      b.vx *= k; b.vy *= k;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
      const steps = Math.max(1, Math.ceil(sp * dt / (BALL_R * 0.4)));
      for (let i = 0; i < steps; i++) {
        b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
        collide(b);
      }

      // Buracos: puxam a bola quando está por cima; a meio caminho cai.
      const holeCheck = (hx, hy) => {
        const dx = hx - b.x, dy = hy - b.y, d = Math.hypot(dx, dy);
        if (d < HOLE_R) { b.vx += dx / (d || 1) * 14 * dt; b.vy += dy / (d || 1) * 14 * dt; }
        return d < HOLE_R * 0.62;
      };
      if (holeCheck(M.exit.x, M.exit.y)) {
        S.phase = 'win'; S.anim = 0.45; S.holeAt = { ...M.exit };
        Arcade.buzz([20, 40, 20]);
        return;
      }
      for (const tr of M.traps) {
        if (holeCheck(tr.x, tr.y)) {
          S.phase = 'fall'; S.anim = 0.7; S.falls++; S.holeAt = { ...tr };
          Arcade.buzz(60);
          return;
        }
      }
    }

    // ---------- Ecrãs ----------
    function levelDone() {
      S.phase = 'done';
      stick.reset();
      Arcade.store.set(SAVE_KEY, null);
      const lv = S.level;
      const stars = starsFor(M, S.t);
      const allStars = Arcade.store.get(STARS_KEY, {}), times = Arcade.store.get(TIMES_KEY, {});
      const prevTime = times[lv];
      const record = prevTime == null || S.t < prevTime;
      allStars[lv] = Math.max(allStars[lv] || 0, stars);
      if (record) times[lv] = Math.round(S.t * 10) / 10;
      Arcade.store.set(STARS_KEY, allStars);
      Arcade.store.set(TIMES_KEY, times);
      Arcade.store.set(BEST_KEY, Math.max(lv, Arcade.store.get(BEST_KEY, 0)));
      Arcade.store.set(LEVEL_KEY, Math.max(lv + 1, Arcade.store.get(LEVEL_KEY, 1)));
      const p = parFor(M);
      overlay.innerHTML = `
        <h2>Nível ${lv} concluído!</h2>
        <div style="font-size:44px;letter-spacing:6px;color:#ffcc4d">${'★'.repeat(stars)}<span style="color:#34386a">${'★'.repeat(3 - stars)}</span></div>
        <p>${record && prevTime != null ? 'Novo melhor tempo! ' : ''}3 estrelas até ${p.three} s · 2 até ${p.two} s</p>
        <div class="stats">
          <div><b>${fmtT(S.t)}</b><span>tempo</span></div>
          <div><b>${fmtT(times[lv])}</b><span>melhor</span></div>
          <div><b>${S.falls}</b><span>quedas</span></div>
        </div>
        <button class="btn primary" data-a="next">Próximo nível</button>
        <button class="btn center" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      pauseBtn.hidden = true; calBtn.hidden = true;
      overlay.querySelector('[data-a=next]').onclick = () => startLevel(lv + 1);
      overlay.querySelector('[data-a=again]').onclick = () => startLevel(lv);
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function showStart(note) {
      S = null;
      pauseBtn.hidden = true; calBtn.hidden = true;
      const unlocked = Math.max(1, Arcade.store.get(LEVEL_KEY, 1));
      const save = Arcade.store.get(SAVE_KEY, null);
      const hasSave = save && save.v === 1 && save.level >= 1;
      const curLevel = hasSave ? save.level : unlocked;
      const allStars = Arcade.store.get(STARS_KEY, {});
      const levels = [];
      for (let i = 1; i <= unlocked; i++) levels.push(i);
      overlay.innerHTML = `
        <h2>Labirinto</h2>
        <p>Inclina o telemóvel para levar a bola até à saída verde. Evita os buracos vermelhos.</p>
        ${note ? `<p style="color:#ff9f43">${note}</p>` : ''}
        <p style="color:#eef0ff;font-weight:700">Nível ${curLevel}${hasSave ? ` · em curso (${fmtT(save.t)})` : ''}</p>
        ${mode === 'tilt'
          ? `<button class="btn primary" data-a="go">${hasSave ? 'Continuar' : 'Jogar'}</button>`
          : `<button class="btn primary" data-a="sensor">Ativar sensor</button>
             <button class="btn center" data-a="touch">Jogar com toque</button>`}
        ${levels.length > 1 ? `
          <p style="margin-top:10px">Escolher nível</p>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;width:100%;max-width:360px">
            ${levels.map(i => `<button class="btn center" data-l="${i}" style="padding:8px 0;min-height:48px;${i === curLevel ? 'border-color:#ffcc4d' : ''}">
              <b style="margin:0">${i}</b><small style="color:#ffcc4d;font-size:10px">${'★'.repeat(allStars[i] || 0) || '&nbsp;'}</small></button>`).join('')}
          </div>` : ''}
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      let chosen = curLevel;
      const go = () => startLevel(chosen, hasSave && chosen === save.level ? save : null);
      const goBtn = overlay.querySelector('[data-a=go]');
      if (goBtn) goBtn.onclick = go;
      const sensBtn = overlay.querySelector('[data-a=sensor]');
      if (sensBtn) sensBtn.onclick = () => {
        sensBtn.disabled = true;
        sensBtn.textContent = 'A ligar o sensor…';
        enableSensor((ok, why) => {
          if (ok) go();
          else showStart(`${why || 'Sensor não disponível'}: usa o joystick (arrasta no ecrã) ou WASD.`);
        });
      };
      const touchBtn = overlay.querySelector('[data-a=touch]');
      if (touchBtn) touchBtn.onclick = () => { mode = 'touch'; go(); };
      overlay.querySelectorAll('[data-l]').forEach(b => {
        b.onclick = () => {
          chosen = +b.dataset.l;
          overlay.querySelectorAll('[data-l]').forEach(x => { x.style.borderColor = +x.dataset.l === chosen ? '#ffcc4d' : ''; });
        };
      });
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function pause() {
      if (!S || S.phase === 'paused' || S.phase === 'done') return;
      S.resumePhase = S.phase === 'fall' || S.phase === 'win' ? S.phase : 'play';
      S.phase = 'paused';
      stick.reset();
      saveRun();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>Nível ${S.level} · ${fmtT(S.t)} · ${quedas(S.falls)}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="levels">Escolher nível</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => {
        overlay.hidden = true; S.phase = S.resumePhase;
        if (mode === 'tilt') calibrate();
      };
      overlay.querySelector('[data-a=restart]').onclick = () => { Arcade.store.set(SAVE_KEY, null); startLevel(S.level); };
      overlay.querySelector('[data-a=levels]').onclick = () => { saveRun(); showStart(); };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) { if (S && S.phase !== 'paused' && S.phase !== 'done') pause(); else saveRun(); } };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Desenho ----------
    function render() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      if (!M || !S) return;
      const { cs, ox, oy } = geo;
      const X = x => ox + x * cs, Y = y => oy + y * cs;

      ctx.fillStyle = '#1a1c33';
      ctx.fillRect(ox, oy, M.cols * cs, M.rows * cs);
      // Entrada
      ctx.fillStyle = 'rgba(69,170,242,.18)';
      ctx.fillRect(X(0) + 2, Y(0) + 2, cs - 4, cs - 4);
      // Saída
      const ex = X(M.exit.x), ey = Y(M.exit.y), hr = HOLE_R * cs;
      ctx.fillStyle = '#26de81';
      ctx.beginPath(); ctx.arc(ex, ey, hr + 4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#062b17';
      ctx.beginPath(); ctx.arc(ex, ey, hr, 0, TAU); ctx.fill();
      // Armadilhas
      for (const tr of M.traps) {
        const tx = X(tr.x), ty = Y(tr.y);
        ctx.fillStyle = '#ff5a6e';
        ctx.beginPath(); ctx.arc(tx, ty, hr + 3, 0, TAU); ctx.fill();
        ctx.fillStyle = '#05060f';
        ctx.beginPath(); ctx.arc(tx, ty, hr, 0, TAU); ctx.fill();
      }
      // Paredes
      ctx.fillStyle = '#a55eea';
      for (const rc of M.rects) ctx.fillRect(X(rc.x0), Y(rc.y0), (rc.x1 - rc.x0) * cs, (rc.y1 - rc.y0) * cs);

      // Bola (com sombra; encolhe ao cair num buraco)
      let bx = X(S.b.x), by = Y(S.b.y), br = BALL_R * cs;
      if ((S.phase === 'fall' || S.phase === 'win') && S.holeAt) {
        const k = S.phase === 'fall' ? S.anim / 0.7 : S.anim / 0.45;
        bx = X(S.holeAt.x) + (bx - X(S.holeAt.x)) * k;
        by = Y(S.holeAt.y) + (by - Y(S.holeAt.y)) * k;
        br *= 0.3 + 0.7 * k;
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath(); ctx.arc(bx + br * 0.25, by + br * 0.3, br, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffcc4d';
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.arc(bx - br * 0.35, by - br * 0.35, br * 0.3, 0, TAU); ctx.fill();

      // HUD
      const p = parFor(M);
      const stars = starsFor(M, S.t);
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText(`Nível ${S.level}`, 14, top + 20);
      ctx.font = '600 20px ui-monospace, Menlo, monospace';
      ctx.fillText(fmtT(S.t), 110, top + 20);
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillStyle = '#ffcc4d';
      ctx.fillText('★'.repeat(stars), 14, top + 48);
      ctx.fillStyle = '#34386a';
      ctx.fillText('★'.repeat(3 - stars), 14 + ctx.measureText('★'.repeat(stars)).width, top + 48);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '500 12px system-ui, sans-serif';
      const next = S.t <= p.three ? `3★ até ${p.three} s` : S.t <= p.two ? `2★ até ${p.two} s` : '';
      ctx.fillText(`${next}${next ? ' · ' : ''}${mode === 'tilt' ? 'sensor' : 'toque'} · ${quedas(S.falls)}`, 72, top + 51);

      if (S.hintT > 0 && mode === 'touch') {
        ctx.globalAlpha = Math.min(1, S.hintT);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15,16,32,.8)';
        ctx.fillRect(w / 2 - 150, h - 70, 300, 36);
        ctx.fillStyle = '#eef0ff';
        ctx.font = '600 14px system-ui, sans-serif';
        ctx.fillText('Arrasta no ecrã para mexer a bola', w / 2, h - 60);
        ctx.globalAlpha = 1;
      }
      if (toast) {
        ctx.globalAlpha = Math.min(1, toast.life * 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(15,16,32,.85)';
        ctx.fillRect(w / 2 - 130, h / 2 - 20, 260, 40);
        ctx.fillStyle = '#26de81';
        ctx.font = '600 15px system-ui, sans-serif';
        ctx.fillText(toast.text, w / 2, h / 2 - 9);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
      stick.draw(ctx);
    }

    if (window.ARCADE_DEBUG) {
      window.ARCADE_DEBUG.tilt = {
        state() {
          if (!S || !M) return { phase: 'start', mode };
          return {
            phase: S.phase, level: S.level, mode, t: S.t, falls: S.falls,
            ball: { ...S.b }, exit: M.exit, traps: M.traps, path: M.path,
            cols: M.cols, rows: M.rows, geo: { ...geo }, neutral: { ...neutral }, reading,
          };
        },
        place(x, y) { if (S) S.b = { x, y, vx: 0, vy: 0 }; },
      };
    }

    showStart();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        destroyed = true;
        saveRun();
        loop.stop();
        stick.dispose();
        disposeCanvas();
        window.removeEventListener('deviceorientation', onOrient);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (window.ARCADE_DEBUG) delete window.ARCADE_DEBUG.tilt;
      },
    };
  }

  Arcade.register({
    id: 'tilt',
    title: 'Labirinto',
    icon: '🌀',
    color: '#26de81',
    desc: 'Inclina o telemóvel e leva a bola até à saída sem cair nos buracos.',
    best: () => {
      const lv = Arcade.store.get('tilt:best', 0);
      if (!lv) return '—';
      const st = Object.values(Arcade.store.get('tilt:stars', {})).reduce((a, b) => a + b, 0);
      return `nível ${lv} · ${st}★`;
    },
    create,
  });
})();
