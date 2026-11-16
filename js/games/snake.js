// Serpente: desliza o dedo em qualquer sítio do ecrã para virar. Come maçãs, cresce e não batas em ti.
(function () {
  const TAU = Math.PI * 2;
  const COLS = 15;
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const POWERS = {
    gold:  { color: '#ffd23f', name: 'Maçã dourada' },
    slow:  { color: '#45aaf2', name: 'Abrandar', dur: 6 },
    ghost: { color: '#a55eea', name: 'Paredes livres', dur: 8 },
  };

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

    const G = { cols: COLS, rows: 20, cell: 20, ox: 0, oy: 0 };
    function availRect() {
      const hud = top + 76;
      return { x: 12, y: hud, w: view.w - 24, h: Math.max(100, view.h - hud - 20) };
    }
    function layout() {
      const a = availRect();
      G.cell = Math.max(6, Math.floor(Math.min(a.w / G.cols, a.h / G.rows)));
      G.ox = Math.round((view.w - G.cell * G.cols) / 2);
      G.oy = Math.round(a.y + (a.h - G.cell * G.rows) / 2);
    }

    let S;
    function reset() {
      const a = availRect();
      G.rows = Math.max(12, Math.min(32, Math.floor(a.h / (a.w / G.cols))));
      layout();
      const cy = Math.floor(G.rows / 2);
      const body = [{ x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy }];
      S = {
        phase: 'ready', t: 0, body, prev: body.map(c => ({ ...c })),
        dir: DIRS.right, queue: [], acc: 0, grow: 0,
        score: 0, eaten: 0, food: null, item: null, itemT: 9 + Math.random() * 6,
        fx: { slow: 0, ghost: 0 }, parts: [], dieT: 0, shake: 0, flash: 0,
      };
      S.food = freeCell();
      overlay.hidden = true;
    }

    function occupied(x, y) {
      if (S.body.some(c => c.x === x && c.y === y)) return true;
      if (S.food && S.food.x === x && S.food.y === y) return true;
      if (S.item && S.item.x === x && S.item.y === y) return true;
      return false;
    }
    function freeCell() {
      for (let i = 0; i < 500; i++) {
        const x = Math.floor(Math.random() * G.cols), y = Math.floor(Math.random() * G.rows);
        if (!occupied(x, y)) return { x, y };
      }
      for (let y = 0; y < G.rows; y++) for (let x = 0; x < G.cols; x++) if (!occupied(x, y)) return { x, y };
      return null;
    }

    function interval() {
      const base = Math.max(0.065, 0.165 - S.eaten * 0.0028);
      return S.fx.slow > 0 ? base * 1.7 : base;
    }

    function burst(cx, cy, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = 1.5 + Math.random() * 4; // em casas por segundo
        S.parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.35, color });
      }
    }

    function die() {
      S.phase = 'dying';
      S.dieT = 0.8;
      S.shake = 0.3;
      S.prev = S.body.map(c => ({ ...c }));
      S.acc = 0;
      burst(S.body[0].x, S.body[0].y, '#ff5a6e', 18);
      Arcade.buzz(120);
    }

    function step() {
      if (S.queue.length) S.dir = S.queue.shift();
      const h = S.body[0];
      let nx = h.x + S.dir.x, ny = h.y + S.dir.y;
      if (nx < 0 || ny < 0 || nx >= G.cols || ny >= G.rows) {
        if (S.fx.ghost > 0) { nx = (nx + G.cols) % G.cols; ny = (ny + G.rows) % G.rows; }
        else return die();
      }
      const willGrow = S.grow > 0;
      const n = S.body.length - (willGrow ? 0 : 1);
      for (let i = 0; i < n; i++) if (S.body[i].x === nx && S.body[i].y === ny) return die();

      const old = S.body;
      S.body = [{ x: nx, y: ny }, ...old];
      if (willGrow) S.grow--; else S.body.pop();
      S.prev = S.body.map((c, i) => ({ ...(old[i] || old[old.length - 1]) }));

      if (S.food && S.food.x === nx && S.food.y === ny) {
        S.eaten++;
        S.score += 10 + Math.floor(S.eaten / 5) * 2;
        S.grow += 1;
        burst(nx, ny, '#ff5a6e', 8);
        Arcade.buzz(10);
        S.food = freeCell();
      }
      const it = S.item;
      if (it && it.x === nx && it.y === ny) {
        const p = POWERS[it.type];
        if (it.type === 'gold') { S.score += 50; S.grow += 2; }
        else S.fx[it.type] = p.dur;
        S.flash = 0.6; S.flashName = p.name; S.flashColor = p.color;
        burst(nx, ny, p.color, 14);
        Arcade.buzz(25);
        S.item = null;
        S.itemT = 10 + Math.random() * 8;
      }
    }

    function update(dt) {
      if (S.shake > 0) S.shake -= dt;
      for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; q.life -= dt; }
      S.parts = S.parts.filter(q => q.life > 0);
      if (S.phase === 'dying') {
        S.dieT -= dt;
        if (S.dieT <= 0) gameOver();
        return;
      }
      if (S.phase !== 'play') return;
      S.t += dt;
      if (S.flash > 0) S.flash -= dt * 0.5;
      for (const k in S.fx) if (S.fx[k] > 0) S.fx[k] = Math.max(0, S.fx[k] - dt);

      // Itens especiais ocasionais
      if (S.item) {
        S.item.life -= dt;
        if (S.item.life <= 0) { S.item = null; S.itemT = 8 + Math.random() * 6; }
      } else {
        S.itemT -= dt;
        if (S.itemT <= 0) {
          const types = ['gold', 'gold', 'slow', 'ghost'];
          const c = freeCell();
          if (c) S.item = { ...c, type: types[Math.floor(Math.random() * types.length)], life: 7 };
          else S.itemT = 5;
        }
      }

      S.acc += dt / interval();
      while (S.acc >= 1 && S.phase === 'play') { S.acc -= 1; step(); }
    }

    // ---------- Entrada: deslizar em qualquer sítio ----------
    function turn(name) {
      const d = DIRS[name];
      if (S.phase === 'ready') {
        if (d.x === -S.dir.x && d.y === -S.dir.y) return;
        S.phase = 'play';
        S.queue = [d];
        S.acc = 0.6; // começa logo a andar
        return;
      }
      if (S.phase !== 'play') return;
      const last = S.queue.length ? S.queue[S.queue.length - 1] : S.dir;
      if ((d.x === last.x && d.y === last.y) || (d.x === -last.x && d.y === -last.y)) return;
      if (S.queue.length < 3) S.queue.push(d);
    }

    let sw = null;
    const swipeMin = () => Math.max(16, Math.min(34, G.cell * 0.9));
    function onDown(e) {
      if (sw) return;
      sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    function onMove(e) {
      if (!sw || e.pointerId !== sw.id) return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (Math.hypot(dx, dy) < swipeMin()) return;
      if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
      else turn(dy > 0 ? 'down' : 'up');
      sw.x = e.clientX; sw.y = e.clientY; // permite virar várias vezes sem levantar o dedo
    }
    function onUp(e) { if (sw && e.pointerId === sw.id) sw = null; }
    const KEYS = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    function onKey(e) {
      const k = KEYS[e.key.toLowerCase()];
      if (k) { e.preventDefault(); turn(k); }
      else if (e.key === 'Escape' || e.key === 'p') pause();
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);

    // ---------- Ecrãs ----------
    function gameOver() {
      S.phase = 'over';
      const best = Arcade.store.get('snake:best', 0);
      const record = S.score > best || S.recSet;
      if (record) Arcade.store.set('snake:best', S.score);
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Fim de jogo'}</h2>
        <p>${record ? '' : `Recorde: ${best} pontos`}</p>
        <div class="stats">
          <div><b>${S.score}</b><span>pontos</span></div>
          <div><b>${S.body.length}</b><span>comprimento</span></div>
          <div><b>${S.eaten}</b><span>maçãs</span></div>
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
      if (v > Arcade.store.get('snake:best', 0)) { Arcade.store.set('snake:best', v); S.recSet = true; }
    }
    let resumePhase = 'play';
    function pause() {
      if (S.phase !== 'play' && S.phase !== 'ready') return;
      resumePhase = S.phase;
      S.phase = 'paused';
      commitBest();
      sw = null;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${S.score} pontos · ${S.body.length} de comprimento</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; S.phase = resumePhase; };
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

    // posição (em casas) de cada segmento, interpolada entre o passo anterior e o atual
    function segPoints(t) {
      const pts = [];
      for (let i = 0; i < S.body.length; i++) {
        const a = S.prev[i] || S.body[i], b = S.body[i];
        let dx = b.x - a.x, dy = b.y - a.y;
        if (dx > 1) dx -= G.cols; else if (dx < -1) dx += G.cols;
        if (dy > 1) dy -= G.rows; else if (dy < -1) dy += G.rows;
        let x = a.x + dx * t, y = a.y + dy * t;
        if (x < -0.5) x += G.cols; else if (x > G.cols - 0.5) x -= G.cols;
        if (y < -0.5) y += G.rows; else if (y > G.rows - 0.5) y -= G.rows;
        pts.push({ x, y });
      }
      return pts;
    }

    function render() {
      layout();
      const { w, h } = view;
      const c = G.cell;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);

      let sx = 0, sy = 0;
      if (S.shake > 0) { sx = (Math.random() - 0.5) * 8; sy = (Math.random() - 0.5) * 8; }
      ctx.save();
      ctx.translate(sx, sy);

      // Tabuleiro
      const bw = c * G.cols, bh = c * G.rows;
      ctx.fillStyle = '#16182e';
      rrect(G.ox - 4, G.oy - 4, bw + 8, bh + 8, 10); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      for (let y = 0; y < G.rows; y++) for (let x = (y & 1); x < G.cols; x += 2) ctx.fillRect(G.ox + x * c, G.oy + y * c, c, c);
      if (S.fx.ghost > 0) {
        ctx.strokeStyle = (S.fx.ghost < 2 && Math.floor(S.t * 8) % 2) ? 'rgba(165,94,234,.3)' : '#a55eea';
        ctx.setLineDash([8, 6]);
      } else {
        ctx.strokeStyle = '#34386a';
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 3;
      rrect(G.ox - 4, G.oy - 4, bw + 8, bh + 8, 10); ctx.stroke();
      ctx.setLineDash([]);

      ctx.save();
      rrect(G.ox, G.oy, bw, bh, 6); ctx.clip();
      const px = gx => G.ox + (gx + 0.5) * c, py = gy => G.oy + (gy + 0.5) * c;

      // Maçã
      if (S.food) {
        const pulse = 1 + Math.sin(S.t * 6) * 0.06;
        const fx = px(S.food.x), fy = py(S.food.y), r = c * 0.36 * pulse;
        ctx.fillStyle = '#ff5a6e';
        ctx.beginPath(); ctx.arc(fx, fy + r * 0.1, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#26de81';
        ctx.beginPath(); ctx.ellipse(fx + r * 0.35, fy - r * 0.85, r * 0.35, r * 0.18, -0.6, 0, TAU); ctx.fill();
      }
      // Item especial
      if (S.item && !(S.item.life < 2 && Math.floor(S.item.life * 8) % 2)) {
        const it = S.item, p = POWERS[it.type];
        const ix = px(it.x), iy = py(it.y), r = c * 0.42;
        ctx.fillStyle = p.color + '44';
        ctx.beginPath(); ctx.arc(ix, iy, r * (1.35 + Math.sin(S.t * 5) * 0.12), 0, TAU); ctx.fill();
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(ix, iy, r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#0f1020'; ctx.fillStyle = '#0f1020'; ctx.lineWidth = Math.max(1.5, c * 0.08);
        if (it.type === 'gold') {
          ctx.beginPath();
          for (let k = 0; k < 10; k++) {
            const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.28 : r * 0.62;
            ctx.lineTo(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr);
          }
          ctx.closePath(); ctx.fill();
        } else if (it.type === 'slow') {
          ctx.beginPath(); ctx.arc(ix, iy, r * 0.55, 0, TAU); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ix, iy); ctx.lineTo(ix, iy - r * 0.4); ctx.moveTo(ix, iy); ctx.lineTo(ix + r * 0.3, iy); ctx.stroke();
        } else {
          ctx.setLineDash([3, 3]);
          rrect(ix - r * 0.5, iy - r * 0.5, r, r, 2); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // Serpente
      const t = S.phase === 'play' ? Math.min(1, S.acc) : (S.phase === 'dying' ? 0 : Math.min(1, S.acc));
      const pts = segPoints(t);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const n = pts.length;
      const ghost = S.fx.ghost > 0;
      const dead = S.phase === 'dying' || S.phase === 'over';
      const ang = Math.atan2(S.dir.y, S.dir.x);
      // com "paredes livres" desenha-se também uma cópia do outro lado, para se ver a passagem
      const offs = ghost ? [[0, 0], [-G.cols, 0], [G.cols, 0], [0, -G.rows], [0, G.rows]] : [[0, 0]];
      for (const [ox, oy] of offs) {
        for (let i = n - 1; i > 0; i--) {
          const a = pts[i], b = pts[i - 1];
          if (Math.abs(a.x - b.x) > 1.5 || Math.abs(a.y - b.y) > 1.5) continue;
          const k = i / Math.max(1, n - 1);
          ctx.strokeStyle = ghost ? `hsl(${270 - k * 20},70%,${66 - k * 18}%)` : `hsl(${145 - k * 15},65%,${55 - k * 18}%)`;
          ctx.lineWidth = c * (0.74 - k * 0.22);
          ctx.beginPath(); ctx.moveTo(px(a.x + ox), py(a.y + oy)); ctx.lineTo(px(b.x + ox), py(b.y + oy)); ctx.stroke();
        }
        // Cabeça
        const hx = px(pts[0].x + ox), hy = py(pts[0].y + oy);
        ctx.fillStyle = dead ? '#ff5a6e' : (ghost ? '#c89bf5' : '#4be08f');
        ctx.beginPath(); ctx.arc(hx, hy, c * 0.44, 0, TAU); ctx.fill();
        for (const s of [-0.6, 0.6]) {
          const ex = hx + Math.cos(ang + s) * c * 0.22, ey = hy + Math.sin(ang + s) * c * 0.22;
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(ex, ey, c * 0.12, 0, TAU); ctx.fill();
          ctx.fillStyle = '#0f1020';
          ctx.beginPath(); ctx.arc(ex + Math.cos(ang) * c * 0.04, ey + Math.sin(ang) * c * 0.04, c * 0.06, 0, TAU); ctx.fill();
        }
      }

      for (const q of S.parts) {
        ctx.globalAlpha = Math.min(1, q.life * 3);
        ctx.fillStyle = q.color;
        const s = Math.max(2, c * 0.14);
        ctx.fillRect(px(q.x) - s / 2, py(q.y) - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.restore();

      // HUD
      const y0 = top + 22;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillText(String(S.score), 16, y0 - 2);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(`Recorde ${Math.max(S.score, Arcade.store.get('snake:best', 0))}`, 16, y0 + 28);

      // efeitos ativos (barras entre a pontuação e o botão de pausa)
      let ex = Math.max(120, w * 0.36);
      const exMax = w - 72;
      for (const k of ['slow', 'ghost']) {
        if (S.fx[k] <= 0) continue;
        const p = POWERS[k], bwid = Math.min(90, (exMax - ex));
        if (bwid < 40) break;
        ctx.fillStyle = p.color;
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillText(p.name, ex, y0 + 4);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(ex, y0 + 22, bwid, 6);
        ctx.fillStyle = p.color; ctx.fillRect(ex, y0 + 22, bwid * Math.min(1, S.fx[k] / p.dur), 6);
        ex += bwid + 12;
      }

      // Mensagens
      ctx.textAlign = 'center';
      if (S.phase === 'ready') {
        ctx.fillStyle = 'rgba(15,16,32,.75)';
        rrect(w / 2 - 150, G.oy + bh * 0.62, 300, 64, 14); ctx.fill();
        ctx.fillStyle = '#eef0ff';
        ctx.font = '700 18px system-ui, sans-serif';
        ctx.fillText('Desliza o dedo para começar', w / 2, G.oy + bh * 0.62 + 12);
        ctx.fillStyle = '#9aa0c8';
        ctx.font = '500 13px system-ui, sans-serif';
        ctx.fillText('Em qualquer sítio do ecrã', w / 2, G.oy + bh * 0.62 + 38);
      } else if (S.flash > 0 && S.phase === 'play') {
        ctx.globalAlpha = Math.min(1, S.flash * 2);
        ctx.fillStyle = S.flashColor;
        ctx.font = '800 22px system-ui, sans-serif';
        ctx.fillText(S.flashName + '!', w / 2, G.oy + 16);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
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
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  Arcade.register({
    id: 'snake',
    title: 'Serpente',
    icon: '🐍',
    color: '#26de81',
    desc: 'Desliza para virar, come maçãs e cresce sem bater em ti.',
    best: () => Arcade.store.get('snake:best', 0) + ' pts',
    create,
  });
})();
