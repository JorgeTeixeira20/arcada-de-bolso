// Corredor: corre sem parar. Toca para saltar, mantém o dedo para saltar mais alto e toca outra vez no ar para o duplo salto.
(function () {
  const TAU = Math.PI * 2;
  // Mundo em unidades virtuais. Mostram-se pelo menos MIN_VW de largura e VH de altura; o chão fica a 70% do ecrã.
  const VH = 900, MIN_VW = 540, GY = 640, DEPTH = 700;  // topo do chão e profundidade da terra
  const PW = 34, PH = 44, PX = 90;       // jogador: tamanho e distância à esquerda do ecrã
  const GRAV = 2600, JUMP_V = 770, JUMP2_V = 700, HOLD_T = 0.22, HOLD_G = 0.42;
  const SUB = 1 / 240;                   // passo máximo da física

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

    const k = () => Math.min(view.h / VH, view.w / MIN_VW);  // píxeis por unidade
    const VW = () => view.w / k();         // largura visível em unidades
    const groundPx = () => view.h * 0.7;   // onde aparece o chão no ecrã (px)

    let S;
    function reset() {
      S = {
        phase: 'ready', t: 0, dist: 0, speed: 330, coins: 0,
        p: { x: 0, y: GY - PH, vy: 0, ground: true, jumps: 0, holdT: 0, coyote: 0, squash: 0, run: 0 },
        segs: [{ x0: -400, x1: 900 }], obs: [], coins_: [], parts: [], genX: 900,
        buffer: 0, holding: false, dieT: 0, shake: 0,
      };
      S.camX = S.p.x - PX;
      overlay.hidden = true;
    }

    // ---------- Geração do percurso ----------
    function rand(a, b) { return a + Math.random() * (b - a); }
    function coinArc(x0, x1, yBase, hgt) {
      const n = Math.max(3, Math.round((x1 - x0) / 38));
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        S.coins_.push({ x: x0 + (x1 - x0) * u, y: yBase - Math.sin(u * Math.PI) * hgt });
      }
    }
    function generate() {
      const d = Math.min(1, S.dist / 24000);       // dificuldade 0..1
      const sp = S.speed;
      while (S.genX < S.camX + VW() + 500) {
        // buraco
        if (Math.random() < 0.3 + 0.35 * d) {
          const maxGap = Math.min(sp * 0.5, 120 + 170 * d);
          const gap = rand(70, Math.max(80, maxGap));
          if (Math.random() < 0.6) coinArc(S.genX - 10, S.genX + gap + 10, GY - 70, 90 + gap * 0.2);
          S.genX += gap;
        }
        // chão com obstáculos
        const len = rand(380, 820) * (1 - 0.25 * d);
        const x0 = S.genX, x1 = S.genX + len;
        const last = S.segs[S.segs.length - 1];
        if (last && last.x1 >= x0) last.x1 = x1; else S.segs.push({ x0, x1 }); // sem buraco: junta ao chão anterior
        let x = x0 + 140;
        const minSpace = sp * (0.85 - 0.25 * d);
        while (x < x1 - 160) {
          if (Math.random() < 0.55 + 0.3 * d) {
            const r = Math.random();
            let o;
            if (r < 0.35) o = { type: 'crate', w: 38, h: 38 };
            else if (r < 0.55 && d > 0.15) o = { type: 'crate', w: 38, h: 70 };
            else if (r < 0.7) o = { type: 'crate', w: 76, h: 38 };
            else if (r < 0.85 && d > 0.3) o = { type: 'crate', w: 38, h: 38, stack: true };
            else o = { type: 'spike', w: 30 + 18 * Math.floor(rand(1, 2 + 2 * d)), h: 24 };
            if (o.stack) { // dois caixotes: um em cima do outro, ligeiramente desfasados
              S.obs.push({ type: 'crate', x, y: GY - 38, w: 38, h: 38 });
              S.obs.push({ type: 'crate', x: x + 38, y: GY - 76, w: 38, h: 76 });
              o.w = 76;
            } else {
              S.obs.push({ type: o.type, x, y: GY - o.h, w: o.w, h: o.h });
            }
            if (Math.random() < 0.5) coinArc(x - 30, x + o.w + 30, GY - 60 - (o.stack ? 76 : o.h), 50);
            x += o.w + rand(minSpace, minSpace * 1.8);
          } else {
            if (Math.random() < 0.4) for (let i = 0; i < 4; i++) S.coins_.push({ x: x + i * 34, y: GY - 34 });
            x += rand(140, 260);
          }
        }
        S.genX = x1;
      }
      // limpar o que ficou para trás
      const cut = S.camX - 200;
      if (S.segs.length > 2 && S.segs[0].x1 < cut) S.segs.shift();
      S.obs = S.obs.filter(o => o.x + o.w > cut);
      S.coins_ = S.coins_.filter(c => c.x > cut && !c.taken);
    }

    // ---------- Física ----------
    function burst(x, y, color, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = sp * (0.3 + Math.random());
        S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.4, color });
      }
    }

    function die() {
      if (S.phase !== 'play') return;
      S.phase = 'dying';
      S.dieT = 0.9;
      S.shake = 0.35;
      burst(S.p.x + PW / 2, S.p.y + PH / 2, '#ffcc4d', 24, 420);
      Arcade.buzz(120);
    }

    function tryJump() {
      const p = S.p;
      if (p.ground || p.coyote > 0) {
        p.vy = -JUMP_V; p.jumps = 1; p.holdT = 0; p.ground = false; p.coyote = 0;
        burst(p.x + PW / 2, p.y + PH, '#9aa0c8', 6, 120);
        return true;
      }
      if (p.jumps < 2) {
        p.vy = -JUMP2_V; p.jumps = 2; p.holdT = 0;
        burst(p.x + PW / 2, p.y + PH, '#45aaf2', 8, 160);
        return true;
      }
      return false;
    }

    function physStep(h) {
      const p = S.p;
      S.speed = Math.min(600, 330 + S.dist * 0.011);
      if (S.buffer > 0) { S.buffer -= h; if (tryJump()) S.buffer = 0; }

      // salto variável: enquanto o dedo está em baixo, a gravidade é mais fraca no início da subida
      const hold = S.holding && p.vy < 0 && p.holdT < HOLD_T;
      p.holdT += h;
      p.vy += GRAV * (hold ? HOLD_G : 1) * h;
      if (p.vy > 1800) p.vy = 1800;
      const prevBottom = p.y + PH;
      p.y += p.vy * h;
      const dx = S.speed * h;
      p.x += dx; S.dist += dx;
      if (p.coyote > 0) p.coyote -= h;
      if (p.squash > 0) p.squash -= h;

      const wasGround = p.ground;
      p.ground = false;
      const L = p.x + 3, R = p.x + PW - 3, B = p.y + PH;

      // chão
      for (const s of S.segs) {
        if (R <= s.x0 || L >= s.x1) continue;
        if (p.vy >= 0 && prevBottom <= GY + 0.5 && B >= GY) { p.y = GY - PH; p.vy = 0; p.ground = true; }
        else if (B > GY + 6) return die(); // bateu na parede do buraco
      }
      // caixotes (dá para aterrar em cima) e picos
      for (const o of S.obs) {
        if (R <= o.x || L >= o.x + o.w) continue;
        if (o.type === 'spike') {
          if (p.y + PH > o.y + 8 && L < o.x + o.w - 6 && R > o.x + 6) return die();
          continue;
        }
        const Bn = p.y + PH;
        if (Bn <= o.y || p.y >= o.y + o.h) continue;
        if (p.vy >= 0 && prevBottom <= o.y + 0.5) { p.y = o.y - PH; p.vy = 0; p.ground = true; }
        else return die();
      }
      if (p.ground) {
        if (!wasGround) { p.squash = 0.12; burst(p.x + PW / 2, p.y + PH, '#9aa0c8', 4, 80); }
        p.jumps = 0; p.coyote = 0.08;
      } else if (wasGround && p.vy >= 0) {
        p.jumps = Math.max(p.jumps, 1); // caiu de uma beira: fica só o salto extra (mais o tempo de tolerância)
      }

      // moedas
      for (const c of S.coins_) {
        if (c.taken) continue;
        if (c.x > p.x - 14 && c.x < p.x + PW + 14 && c.y > p.y - 14 && c.y < p.y + PH + 14) {
          c.taken = true; S.coins++;
          burst(c.x, c.y, '#ffd23f', 5, 140);
          Arcade.buzz(6);
        }
      }
      if (p.y > GY + 420) die();
    }

    function update(dt) {
      if (S.shake > 0) S.shake -= dt;
      for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 900 * dt; q.life -= dt; }
      S.parts = S.parts.filter(q => q.life > 0);
      if (S.phase === 'dying') {
        S.dieT -= dt;
        if (S.dieT <= 0) gameOver();
        return;
      }
      if (S.phase !== 'play') return;
      S.t += dt;
      const n = Math.ceil(dt / SUB);
      for (let i = 0; i < n && S.phase === 'play'; i++) physStep(dt / n);
      S.p.run += dt * S.speed / 30;
      S.camX = S.p.x - PX;
      generate();
    }

    const score = () => Math.floor(S.dist / 40) + S.coins * 5;

    // ---------- Entrada ----------
    let ptr = null;
    function press() {
      if (S.phase === 'ready') { S.phase = 'play'; S.holding = false; return; }
      if (S.phase !== 'play') return;
      S.holding = true;
      S.buffer = 0.12;
    }
    function release() { S.holding = false; }
    function onDown(e) {
      if (ptr !== null) return;
      ptr = e.pointerId;
      press();
    }
    function onUp(e) { if (e.pointerId === ptr) { ptr = null; release(); } }
    function onKey(e) {
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'arrowup' || key === 'w') {
        e.preventDefault();
        if (e.type === 'keydown') { if (!e.repeat) press(); } else release();
      } else if (e.type === 'keydown' && (key === 'escape' || key === 'p')) pause();
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    // ---------- Ecrãs ----------
    function gameOver() {
      S.phase = 'over';
      ptr = null;
      const pts = score();
      const best = Arcade.store.get('runner:best', 0);
      const record = pts > best;
      if (record) Arcade.store.set('runner:best', pts);
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Fim da corrida'}</h2>
        <p>${record ? '' : `Recorde: ${best} pontos`}</p>
        <div class="stats">
          <div><b>${pts}</b><span>pontos</span></div>
          <div><b>${Math.floor(S.dist / 40)} m</b><span>distância</span></div>
          <div><b>${S.coins}</b><span>moedas</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = reset;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    let resumePhase = 'play';
    function pause() {
      if (S.phase !== 'play' && S.phase !== 'ready') return;
      resumePhase = S.phase;
      S.phase = 'paused';
      ptr = null; S.holding = false; S.buffer = 0;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${Math.floor(S.dist / 40)} m · ${S.coins} moedas · ${score()} pontos</p>
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
    // relevo pseudo-aleatório mas contínuo para o fundo
    function ridge(x, seed) {
      return Math.sin(x * 0.0021 + seed) * 0.5 + Math.sin(x * 0.0047 + seed * 2.3) * 0.3 + Math.sin(x * 0.011 + seed * 5.1) * 0.2;
    }
    function layer(par, seed, base, amp, color) {
      const vw = VW(), off = S.camX * par;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, GY + 20);
      for (let x = 0; x <= vw + 20; x += 20) ctx.lineTo(x, base - ridge(x + off, seed) * amp);
      ctx.lineTo(vw + 20, GY + 20);
      ctx.closePath();
      ctx.fill();
    }

    function render() {
      const { w, h } = view;
      const s = k(), vw = VW();
      const gp = groundPx();
      const sky = ctx.createLinearGradient(0, 0, 0, gp);
      sky.addColorStop(0, '#0f1020'); sky.addColorStop(1, '#1f2350');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // estrelas e lua (em píxeis de ecrã, quase paradas)
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      const sw = w + 40;
      for (let i = 0; i < 46; i++) {
        const sx = ((i * 137.5 - S.camX * 0.03 * s) % sw + sw) % sw - 20;
        const sy = top + 70 + (i * 61.7) % Math.max(60, gp * 0.55);
        const z = i % 3 ? 2 : 3;
        ctx.fillRect(sx, sy, z, z);
      }
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(w * 0.72, top + 150, 30, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1d42';
      ctx.beginPath(); ctx.arc(w * 0.72 + 12, top + 143, 26, 0, TAU); ctx.fill();

      ctx.save();
      ctx.translate(0, gp - GY * s);
      ctx.scale(s, s);
      layer(0.12, 1.3, GY - 170, 90, '#1e2147');
      layer(0.3, 4.1, GY - 90, 60, '#282c5c');
      layer(0.55, 7.7, GY - 30, 30, '#323772');

      let shx = 0, shy = 0;
      if (S.shake > 0) { shx = (Math.random() - 0.5) * 12; shy = (Math.random() - 0.5) * 12; }
      ctx.translate(-S.camX + shx, shy);

      // chão
      for (const g of S.segs) {
        if (g.x1 < S.camX - 20 || g.x0 > S.camX + vw + 20) continue;
        ctx.fillStyle = '#2a2d58';
        ctx.fillRect(g.x0 - 0.5, GY, g.x1 - g.x0 + 1, DEPTH);
        ctx.fillStyle = '#26de81';
        ctx.fillRect(g.x0, GY, g.x1 - g.x0, 10);
        ctx.fillStyle = '#1fae68';
        ctx.fillRect(g.x0, GY + 10, g.x1 - g.x0, 4);
        // riscas que mostram a velocidade
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        const st = 60;
        for (let x = Math.ceil(Math.max(g.x0, S.camX - 20) / st) * st; x < Math.min(g.x1, S.camX + vw + 20) - 20; x += st) {
          ctx.fillRect(x, GY + 40, 22, 6);
          ctx.fillRect(x + 30, GY + 110, 14, 6);
        }
      }
      // moedas
      for (const c of S.coins_) {
        if (c.taken || c.x < S.camX - 20 || c.x > S.camX + vw + 20) continue;
        const sq = Math.abs(Math.cos(S.t * 4 + c.x * 0.01));
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 10 * (0.35 + 0.65 * sq), 10, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ffb400';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, 4 * (0.35 + 0.65 * sq), 5, 0, 0, TAU); ctx.fill();
      }
      // obstáculos
      for (const o of S.obs) {
        if (o.x > S.camX + vw + 20 || o.x + o.w < S.camX - 20) continue;
        if (o.type === 'crate') {
          ctx.fillStyle = '#ff9f43';
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.strokeStyle = '#c56d1c'; ctx.lineWidth = 4;
          ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
          ctx.beginPath();
          for (let y = o.y; y < o.y + o.h - 1; y += 38) { ctx.moveTo(o.x + 4, y + 4); ctx.lineTo(o.x + o.w - 4, Math.min(o.y + o.h, y + 38) - 4); }
          ctx.stroke();
        } else {
          ctx.fillStyle = '#ff5a6e';
          const n = Math.max(1, Math.round(o.w / 18));
          const sw = o.w / n;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            ctx.moveTo(o.x + i * sw, GY); ctx.lineTo(o.x + i * sw + sw / 2, o.y); ctx.lineTo(o.x + (i + 1) * sw, GY);
          }
          ctx.fill();
        }
      }
      // jogador
      const p = S.p;
      if (S.phase !== 'dying' && S.phase !== 'over') {
        const sq = p.squash > 0 ? p.squash / 0.12 * 0.2 : 0;
        const stretch = !p.ground ? Math.min(0.15, Math.abs(p.vy) / 6000) : 0;
        const pw = PW * (1 + sq - stretch), ph = PH * (1 - sq + stretch);
        const bx = p.x + PW / 2 - pw / 2, by = p.y + PH - ph;
        // pernas
        ctx.strokeStyle = '#e0a92a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
        const ph1 = p.ground ? Math.sin(p.run) * 9 : 6, ph2 = p.ground ? -Math.sin(p.run) * 9 : -4;
        ctx.beginPath();
        ctx.moveTo(bx + pw * 0.35, by + ph - 6); ctx.lineTo(bx + pw * 0.35 + ph1, p.y + PH + 4);
        ctx.moveTo(bx + pw * 0.65, by + ph - 6); ctx.lineTo(bx + pw * 0.65 + ph2, p.y + PH + 4);
        ctx.stroke();
        ctx.fillStyle = '#ffcc4d';
        ctx.beginPath();
        const r = 10;
        ctx.moveTo(bx + r, by); ctx.arcTo(bx + pw, by, bx + pw, by + ph, r); ctx.arcTo(bx + pw, by + ph - 4, bx, by + ph - 4, 6);
        ctx.arcTo(bx, by + ph - 4, bx, by, 6); ctx.arcTo(bx, by, bx + pw, by, r); ctx.closePath(); ctx.fill();
        // olho e lenço
        ctx.fillStyle = '#0f1020';
        ctx.beginPath(); ctx.arc(bx + pw * 0.7, by + ph * 0.3, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff5a6e';
        ctx.fillRect(bx, by + ph * 0.5, pw, 6);
        const wave = Math.sin(S.t * 18) * 4;
        ctx.beginPath(); ctx.moveTo(bx, by + ph * 0.5); ctx.lineTo(bx - 16, by + ph * 0.5 - 2 + wave); ctx.lineTo(bx - 14, by + ph * 0.5 + 8 + wave); ctx.lineTo(bx, by + ph * 0.5 + 6); ctx.fill();
        if (p.jumps === 1 && !p.ground) { // indicador de duplo salto disponível
          ctx.fillStyle = 'rgba(69,170,242,.8)';
          ctx.beginPath(); ctx.arc(p.x + PW / 2, p.y + PH + 12, 4, 0, TAU); ctx.fill();
        }
      }
      for (const q of S.parts) {
        ctx.globalAlpha = Math.min(1, q.life * 2.5);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // HUD
      const y0 = top + 22;
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 26px system-ui, sans-serif';
      ctx.fillText(String(score()), 16, y0 - 2);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 13px system-ui, sans-serif';
      ctx.fillText(`${Math.floor(S.dist / 40)} m · Recorde ${Math.max(score(), Arcade.store.get('runner:best', 0))}`, 16, y0 + 28);
      const cx = w - 84;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(cx, y0 + 12, 8, 0, TAU); ctx.fill();
      ctx.textAlign = 'right';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText(String(S.coins), cx - 14, y0 + 3);
      if (S.phase === 'ready') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#eef0ff';
        ctx.font = '700 20px system-ui, sans-serif';
        ctx.fillText('Toca para começar', w / 2, h * 0.3);
        ctx.fillStyle = '#9aa0c8';
        ctx.font = '500 14px system-ui, sans-serif';
        ctx.fillText('Toca para saltar · mantém para ir mais alto', w / 2, h * 0.3 + 32);
        ctx.fillText('Toca outra vez no ar para o duplo salto', w / 2, h * 0.3 + 54);
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    reset();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('keyup', onKey);
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  Arcade.register({
    id: 'runner',
    title: 'Corredor',
    icon: '🏃',
    color: '#45aaf2',
    desc: 'Corre sem parar, salta buracos e caixotes e apanha moedas.',
    best: () => Arcade.store.get('runner:best', 0) + ' pts',
    create,
  });
})();
