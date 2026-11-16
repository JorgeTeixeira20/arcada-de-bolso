// Tijolos: a raquete segue o dedo na horizontal (o dedo pode ficar abaixo dela). Toca para lançar a bola.
(function () {
  const TAU = Math.PI * 2;
  // Campo virtual de 400 x 720, escalado para caber no ecrã. Por baixo sobra espaço para o dedo.
  const FW = 400, FH = 720;
  const COLS = 8, PAD = 10, GAP = 4;
  const BW = (FW - PAD * 2 - GAP * (COLS - 1)) / COLS, BH = 18;
  const BRICK_TOP = 64;
  const PADDLE_Y = 650, PADDLE_H = 14;
  const BALL_R = 7;
  const HP_COLORS = { 1: '#2bcbba', 2: '#ff9f43', 3: '#ff5a6e' };
  const DROPS = {
    wide:  { color: '#45aaf2', name: 'Raquete larga' },
    multi: { color: '#a55eea', name: 'Multi-bola' },
    slow:  { color: '#26de81', name: 'Bola lenta' },
    life:  { color: '#ff5a6e', name: 'Vida extra' },
  };

  // Padrões de nível: devolvem true se há tijolo na coluna c, linha r (de `rows`).
  const PATTERNS = [
    (c, r) => true,
    (c, r, rows) => Math.abs(c - 3.5) <= (r + 1) * 4 / rows,
    (c, r) => (c + r) % 2 === 0,
    (c, r, rows) => Math.abs(c - 3.5) / 4 + Math.abs(r - (rows - 1) / 2) / (rows / 2) <= 1.05,
    (c, r) => c !== 2 && c !== 5 || r % 3 === 0,
    (c, r) => r % 2 === 0 || c === 0 || c === 7,
    (c, r, rows) => (c < 2 || c > 5) ? r < rows - 1 : r % 2 === 1,
  ];

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    const L = { s: 1, ox: 0, oy: 0 };
    function layout() {
      const y = top + 74;
      const aw = view.w - 12, ah = view.h - y - 10;
      L.s = Math.max(0.3, Math.min(aw / FW, ah / FH));
      L.ox = (view.w - FW * L.s) / 2;
      L.oy = y;
    }

    let S;
    function rnd(seed) { // pseudo-aleatório determinístico por nível
      let x = seed * 9301 + 49297;
      return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    }
    function buildLevel(n) {
      const rand = rnd(n * 7 + 3);
      const rows = Math.min(5 + Math.floor((n - 1) / 2), 10);
      let pat = PATTERNS[(n - 1) % PATTERNS.length];
      if (n > PATTERNS.length && rand() < 0.4) { // padrão aleatório simétrico
        const grid = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < 4; c++) grid[r * 4 + c] = rand() < 0.7;
        pat = (c, r) => grid[r * 4 + (c < 4 ? c : 7 - c)];
      }
      const maxHp = Math.min(3, 1 + Math.floor(n / 2));
      const bricks = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (!pat(c, r, rows)) continue;
          let hp = 1 + Math.floor((1 - r / rows) * maxHp);
          if (rand() < 0.1 * Math.min(n, 5)) hp++;
          hp = Math.max(1, Math.min(3, hp, maxHp));
          bricks.push({ x: PAD + c * (BW + GAP), y: BRICK_TOP + r * (BH + GAP), w: BW, h: BH, hp, max: hp, hit: 0 });
        }
      }
      return bricks;
    }

    function reset() {
      layout();
      S = {
        phase: 'play', t: 0, level: 1, lives: 3, score: 0, broken: 0,
        paddle: { x: FW / 2, w: 84, target: FW / 2 },
        balls: [], drops: [], parts: [], bricks: buildLevel(1),
        fx: { wide: 0, slow: 0 }, banner: 1.6, bannerText: 'Nível 1', shake: 0,
      };
      newBall();
      overlay.hidden = true;
    }

    function speed() {
      return Math.min(560, 340 + (S.level - 1) * 16 + S.t * 0.6) * (S.fx.slow > 0 ? 0.62 : 1);
    }
    function newBall() {
      S.balls = [{ x: S.paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: -1, stuck: true }];
    }
    function launch() {
      for (const b of S.balls) {
        if (!b.stuck) continue;
        b.stuck = false;
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
        b.vx = Math.cos(a); b.vy = Math.sin(a);
      }
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 60 + Math.random() * 160;
        S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.4, color });
      }
    }

    function hitBrick(br) {
      br.hp--;
      br.hit = 0.1;
      S.score += 10;
      if (br.hp <= 0) {
        S.score += 10 * br.max;
        S.broken++;
        burst(br.x + br.w / 2, br.y + br.h / 2, HP_COLORS[br.max], 10);
        if (Math.random() < 0.16) {
          const r = Math.random();
          const type = r < 0.32 ? 'wide' : r < 0.6 ? 'multi' : r < 0.88 ? 'slow' : 'life';
          S.drops.push({ x: br.x + br.w / 2, y: br.y + br.h / 2, type });
        }
      }
      Arcade.buzz(5);
    }

    function catchDrop(d) {
      S.score += 25;
      if (d.type === 'wide') S.fx.wide = 14;
      else if (d.type === 'slow') S.fx.slow = 9;
      else if (d.type === 'life') S.lives = Math.min(6, S.lives + 1);
      else if (d.type === 'multi') {
        const src = S.balls.find(b => !b.stuck) || S.balls[0];
        if (src.stuck) launch();
        const base = Math.atan2(src.vy, src.vx);
        for (const off of [-0.45, 0.45]) {
          if (S.balls.length >= 12) break;
          let a = base + off;
          const vy = Math.sin(a);
          if (Math.abs(vy) < 0.3) a = base - off;
          S.balls.push({ x: src.x, y: src.y, vx: Math.cos(a), vy: Math.sin(a), stuck: false });
        }
      }
      S.bannerText = DROPS[d.type].name; S.banner = 1.1;
      burst(d.x, PADDLE_Y, DROPS[d.type].color, 12);
      Arcade.buzz(20);
    }

    // Move uma bola por `dist` unidades, em pequenos passos para não atravessar tijolos.
    function moveBall(b, dist) {
      const pw = S.paddle.w;
      const n = Math.max(1, Math.ceil(dist / 3));
      const st = dist / n;
      for (let i = 0; i < n; i++) {
        b.x += b.vx * st; b.y += b.vy * st;
        if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
        if (b.x > FW - BALL_R) { b.x = FW - BALL_R; b.vx = -Math.abs(b.vx); }
        if (b.y < BALL_R) { b.y = BALL_R; b.vy = Math.abs(b.vy); }
        // raquete
        if (b.vy > 0 && b.y + BALL_R >= PADDLE_Y && b.y - BALL_R <= PADDLE_Y + PADDLE_H &&
            b.x >= S.paddle.x - pw / 2 - BALL_R && b.x <= S.paddle.x + pw / 2 + BALL_R) {
          const off = Math.max(-1, Math.min(1, (b.x - S.paddle.x) / (pw / 2 + BALL_R)));
          const a = -Math.PI / 2 + off * 1.05;
          b.vx = Math.cos(a); b.vy = Math.sin(a);
          b.y = PADDLE_Y - BALL_R;
        }
        // tijolos (no máximo um por passo)
        for (const br of S.bricks) {
          if (br.hp <= 0) continue;
          const cx = Math.max(br.x, Math.min(b.x, br.x + br.w));
          const cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
          const dx = b.x - cx, dy = b.y - cy;
          if (dx * dx + dy * dy > BALL_R * BALL_R) continue;
          // eixo de menor penetração
          const ox = Math.min(b.x + BALL_R - br.x, br.x + br.w - (b.x - BALL_R));
          const oy = Math.min(b.y + BALL_R - br.y, br.y + br.h - (b.y - BALL_R));
          if (ox < oy) { b.vx = b.x < br.x + br.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); b.x += Math.sign(b.vx) * ox; }
          else { b.vy = b.y < br.y + br.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); b.y += Math.sign(b.vy) * oy; }
          hitBrick(br);
          break;
        }
        // nunca demasiado horizontal
        if (Math.abs(b.vy) < 0.28) {
          b.vy = (b.vy < 0 ? -1 : 1) * 0.28;
          b.vx = Math.sign(b.vx || 1) * Math.sqrt(1 - 0.28 * 0.28);
        }
        if (b.y > FH + BALL_R) { b.lost = true; return; }
      }
    }

    function update(dt) {
      if (S.shake > 0) S.shake -= dt;
      for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt; }
      S.parts = S.parts.filter(q => q.life > 0);
      if (S.phase !== 'play') return;
      S.t += dt;
      if (S.banner > 0) S.banner -= dt;
      for (const k in S.fx) if (S.fx[k] > 0) S.fx[k] = Math.max(0, S.fx[k] - dt);

      const P = S.paddle;
      const targetW = S.fx.wide > 0 ? 132 : 84;
      P.w += (targetW - P.w) * Math.min(1, dt * 10);
      // teclado
      if (keys.left) P.target -= 520 * dt;
      if (keys.right) P.target += 520 * dt;
      P.target = Math.max(P.w / 2, Math.min(FW - P.w / 2, P.target));
      P.x += (P.target - P.x) * Math.min(1, dt * 30);
      P.x = Math.max(P.w / 2, Math.min(FW - P.w / 2, P.x));

      const sp = speed();
      for (const b of S.balls) {
        if (b.stuck) { b.x = P.x; b.y = PADDLE_Y - BALL_R - 1; continue; }
        moveBall(b, sp * dt);
      }
      S.balls = S.balls.filter(b => !b.lost);
      S.bricks = S.bricks.filter(br => br.hp > 0);
      for (const br of S.bricks) if (br.hit > 0) br.hit -= dt;

      for (const d of S.drops) {
        d.y += 170 * dt;
        if (d.y + 9 >= PADDLE_Y && d.y - 9 <= PADDLE_Y + PADDLE_H && Math.abs(d.x - P.x) <= P.w / 2 + 16) { d.done = true; catchDrop(d); }
        if (d.y > FH + 20) d.done = true;
      }
      S.drops = S.drops.filter(d => !d.done);

      if (!S.balls.length) {
        S.lives--;
        S.shake = 0.3;
        Arcade.buzz(90);
        S.fx.wide = 0; S.fx.slow = 0; S.drops = [];
        if (S.lives <= 0) return gameOver();
        newBall();
        S.bannerText = S.lives === 1 ? 'Última vida!' : `Faltam ${S.lives} vidas`;
        S.banner = 1.4;
      }
      if (!S.bricks.length) {
        S.score += 100 * S.level;
        S.level++;
        S.bricks = buildLevel(S.level);
        S.drops = [];
        S.fx.slow = 0;
        newBall();
        S.bannerText = `Nível ${S.level}`; S.banner = 1.6;
        Arcade.buzz(40);
      }
    }

    // ---------- Entrada ----------
    const keys = { left: false, right: false };
    let ptr = null;
    function toField(clientX) { return (clientX - L.ox) / L.s; }
    function onDown(e) {
      if (ptr !== null && e.pointerType !== 'mouse') return;
      ptr = e.pointerId;
      S.paddle.target = toField(e.clientX);
    }
    function onMove(e) {
      if (S.phase !== 'play') return;
      if (e.pointerId === ptr || (e.pointerType === 'mouse' && ptr === null)) S.paddle.target = toField(e.clientX);
    }
    function onUp(e) {
      if (e.pointerId !== ptr) return;
      ptr = null;
      if (S.phase === 'play' && e.type === 'pointerup') launch(); // levantar o dedo lança a bola
    }
    function onKey(e) {
      const k = e.key.toLowerCase();
      const down = e.type === 'keydown';
      if (k === 'arrowleft' || k === 'a') keys.left = down;
      else if (k === 'arrowright' || k === 'd') keys.right = down;
      else if (down && (k === ' ' || k === 'arrowup' || k === 'w')) { e.preventDefault(); if (S.phase === 'play') launch(); }
      else if (down && (k === 'escape' || k === 'p')) pause();
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ---------- Ecrãs ----------
    function gameOver() {
      S.phase = 'over';
      ptr = null;
      const best = Arcade.store.get('bricks:best', 0);
      const record = S.score > best || S.recSet;
      if (record) Arcade.store.set('bricks:best', S.score);
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Fim de jogo'}</h2>
        <p>${record ? '' : `Recorde: ${best} pontos`}</p>
        <div class="stats">
          <div><b>${S.score}</b><span>pontos</span></div>
          <div><b>${S.level}</b><span>nível</span></div>
          <div><b>${S.broken}</b><span>tijolos</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = reset;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }


    // O recorde fica guardado mesmo que saias a meio da partida.
    function commitBest() {
      if (!S) return;
      const v = S.score;
      if (v > Arcade.store.get('bricks:best', 0)) { Arcade.store.set('bricks:best', v); S.recSet = true; }
    }
    function pause() {
      if (S.phase !== 'play') return;
      S.phase = 'paused';
      commitBest();
      ptr = null; keys.left = keys.right = false;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>Nível ${S.level} · ${S.score} pontos · ${S.lives} ${S.lives === 1 ? 'vida' : 'vidas'}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; S.phase = 'play'; };
      overlay.querySelector('[data-a=restart]').onclick = reset;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Desenho ----------
    function rrect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function heart(x, y, s) {
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x - s * 0.9, y - s * 0.25, x - s * 0.45, y - s * 0.85, x, y - s * 0.4);
      ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.25, x, y + s * 0.35);
      ctx.fill();
    }
    function dropIcon(d) {
      const { x, y } = d;
      ctx.fillStyle = DROPS[d.type].color;
      rrect(x - 17, y - 9, 34, 18, 9); ctx.fill();
      ctx.fillStyle = '#0f1020'; ctx.strokeStyle = '#0f1020'; ctx.lineWidth = 2;
      if (d.type === 'wide') {
        ctx.beginPath();
        ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y);
        ctx.moveTo(x - 9, y); ctx.lineTo(x - 5, y - 4); ctx.moveTo(x - 9, y); ctx.lineTo(x - 5, y + 4);
        ctx.moveTo(x + 9, y); ctx.lineTo(x + 5, y - 4); ctx.moveTo(x + 9, y); ctx.lineTo(x + 5, y + 4);
        ctx.stroke();
      } else if (d.type === 'multi') {
        for (const o of [-7, 0, 7]) { ctx.beginPath(); ctx.arc(x + o, y, 2.6, 0, TAU); ctx.fill(); }
      } else if (d.type === 'slow') {
        ctx.beginPath(); ctx.arc(x, y, 5.5, 0, TAU); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 4); ctx.moveTo(x, y); ctx.lineTo(x + 3, y); ctx.stroke();
      } else heart(x, y + 1, 9);
    }

    function render() {
      layout();
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      let sx = 0, sy = 0;
      if (S.shake > 0) { sx = (Math.random() - 0.5) * 8; sy = (Math.random() - 0.5) * 8; }
      ctx.translate(L.ox + sx, L.oy + sy);
      ctx.scale(L.s, L.s);

      // campo
      ctx.fillStyle = '#15172b';
      rrect(0, 0, FW, FH, 14); ctx.fill();
      ctx.strokeStyle = '#34386a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(1.5, FH); ctx.lineTo(1.5, 14); ctx.arcTo(1.5, 1.5, 14, 1.5, 12.5);
      ctx.lineTo(FW - 14, 1.5); ctx.arcTo(FW - 1.5, 1.5, FW - 1.5, 14, 12.5); ctx.lineTo(FW - 1.5, FH); ctx.stroke();

      for (const br of S.bricks) {
        ctx.fillStyle = br.hit > 0 ? '#fff' : HP_COLORS[br.hp];
        rrect(br.x, br.y, br.w, br.h, 4); ctx.fill();
        if (br.max > 1) { // marcas de resistência
          ctx.fillStyle = 'rgba(15,16,32,.45)';
          for (let i = 0; i < br.hp; i++) ctx.fillRect(br.x + br.w / 2 - (br.hp - 1) * 5 + i * 10 - 2, br.y + br.h / 2 - 2, 4, 4);
        }
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(br.x + 3, br.y + 2, br.w - 6, 3);
      }

      for (const d of S.drops) dropIcon(d);

      const P = S.paddle;
      ctx.fillStyle = S.fx.wide > 0 ? '#45aaf2' : '#ffcc4d';
      rrect(P.x - P.w / 2, PADDLE_Y, P.w, PADDLE_H, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(P.x - P.w / 2 + 7, PADDLE_Y + 3, P.w - 14, 3);

      const slow = S.fx.slow > 0;
      for (const b of S.balls) {
        ctx.fillStyle = slow ? '#26de81' : '#eef0ff';
        ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, TAU); ctx.fill();
      }
      if (S.phase === 'play' && S.balls.some(b => b.stuck)) {
        ctx.fillStyle = '#9aa0c8';
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Toca para lançar', FW / 2, PADDLE_Y - 70);
        ctx.font = '500 12px system-ui, sans-serif';
        ctx.fillText('Arrasta em qualquer altura para mexer a raquete', FW / 2, PADDLE_Y - 48);
        ctx.textAlign = 'left';
      }

      for (const q of S.parts) {
        ctx.globalAlpha = Math.min(1, q.life * 3);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 2.5, q.y - 2.5, 5, 5);
      }
      ctx.globalAlpha = 1;

      if (S.banner > 0 && S.phase === 'play') {
        ctx.globalAlpha = Math.min(1, S.banner * 2);
        ctx.fillStyle = '#eef0ff';
        ctx.font = '800 30px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(S.bannerText, FW / 2, 400);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // HUD
      const y0 = top + 22;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 24px system-ui, sans-serif';
      ctx.fillText(String(S.score), 16, y0 - 2);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(`Nível ${S.level} · Recorde ${Math.max(S.score, Arcade.store.get('bricks:best', 0))}`, 16, y0 + 26);
      ctx.fillStyle = '#ff5a6e';
      const hx = w - 80;
      for (let i = 0; i < S.lives; i++) heart(hx - i * 22, y0 + 10, 16);
      ctx.textBaseline = 'alphabetic';
    }

    reset();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        commitBest();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  Arcade.register({
    id: 'bricks',
    title: 'Tijolos',
    icon: '🧱',
    color: '#ff9f43',
    desc: 'Parte todos os tijolos com a bola e apanha os bónus que caem.',
    best: () => Arcade.store.get('bricks:best', 0) + ' pts',
    create,
  });
})();
