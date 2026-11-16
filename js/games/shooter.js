// Enxame: sobrevive às hordas. Mexes-te com o polegar, a arma dispara sozinha.
(function () {
  const TAU = Math.PI * 2;

  const UPGRADES = [
    { id: 'dmg',    name: 'Força',          desc: 'Dano +25%',                         apply: s => { s.dmg *= 1.25; } },
    { id: 'rate',   name: 'Gatilho rápido', desc: 'Disparas 18% mais depressa', max: 8, apply: s => { s.fireDelay *= 0.82; } },
    { id: 'multi',  name: 'Disparo múltiplo', desc: '+1 projétil por disparo',  max: 5, apply: s => { s.shots++; } },
    { id: 'pierce', name: 'Perfuração',     desc: 'As balas atravessam +1 inimigo', max: 4, apply: s => { s.pierce++; } },
    { id: 'speed',  name: 'Botas',          desc: 'Velocidade +12%',           max: 5, apply: s => { s.speed *= 1.12; } },
    { id: 'hp',     name: 'Coração',        desc: '+25 de vida máxima e cura total', apply: (s, p) => { s.maxHp += 25; p.hp = s.maxHp; } },
    { id: 'magnet', name: 'Íman',           desc: 'Apanhas XP de mais longe',  max: 4, apply: s => { s.magnet *= 1.45; } },
    { id: 'orbit',  name: 'Lâminas',        desc: '+1 lâmina a girar à tua volta', max: 6, apply: s => { s.orbs++; } },
    { id: 'regen',  name: 'Regeneração',    desc: 'Recuperas +1 de vida por segundo', max: 5, apply: s => { s.regen += 1; } },
    { id: 'nova',   name: 'Onda de choque', desc: 'Explosão periódica à tua volta', max: 4, apply: s => { s.nova++; } },
  ];

  const ENEMIES = {
    grunt:  { hp: 12,  speed: 72,  r: 12, dmg: 10, xp: 1,  pts: 10,  color: '#ff5a6e' },
    runner: { hp: 7,   speed: 135, r: 9,  dmg: 6,  xp: 1,  pts: 15,  color: '#ff9f43' },
    tank:   { hp: 60,  speed: 42,  r: 20, dmg: 20, xp: 5,  pts: 50,  color: '#a55eea' },
    boss:   { hp: 900, speed: 58,  r: 36, dmg: 35, xp: 40, pts: 500, color: '#eb3b5a' },
  };

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

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    let S;
    function reset() {
      S = {
        t: 0, kills: 0, pts: 0, level: 1, xp: 0, xpNext: 5, pendingLevels: 0,
        phase: 'play',
        p: { x: 0, y: 0, r: 14, hp: 100, inv: 0 },
        st: { maxHp: 100, dmg: 10, fireDelay: 0.5, shots: 1, pierce: 0, speed: 170, magnet: 70, orbs: 0, regen: 0, nova: 0, bulletSpeed: 540 },
        lv: {},
        enemies: [], bullets: [], gems: [], parts: [], rings: [],
        fireT: 0, spawnT: 0, novaT: 3, orbA: 0, nextBoss: 120, shake: 0,
      };
      overlay.hidden = true;
      stick.reset();
    }

    // ---------- Lógica ----------
    function pickType() {
      const r = Math.random();
      if (S.t > 60 && r < 0.12) return 'tank';
      if (S.t > 25 && r < 0.40) return 'runner';
      return 'grunt';
    }

    function spawn(type) {
      const d = ENEMIES[type];
      const a = Math.random() * TAU;
      const dist = Math.hypot(view.w, view.h) / 2 + 40;
      const mul = 1 + S.t / 75;
      S.enemies.push({
        type, x: S.p.x + Math.cos(a) * dist, y: S.p.y + Math.sin(a) * dist,
        r: d.r, hp: d.hp * mul, maxHp: d.hp * mul,
        speed: d.speed * (1 + Math.min(0.5, S.t / 600)),
        dmg: d.dmg, xp: d.xp, pts: d.pts, color: d.color,
        flash: 0, orbCd: 0, dead: false,
      });
    }

    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
        S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3, color });
      }
    }

    function damage(e, amount) {
      if (e.dead) return;
      e.hp -= amount;
      e.flash = 0.08;
      if (e.hp <= 0) {
        e.dead = true;
        S.kills++;
        S.pts += e.pts;
        burst(e.x, e.y, e.color, e.type === 'boss' ? 40 : 8, e.type === 'boss' ? 260 : 140);
        if (e.type === 'boss') { S.shake = 0.4; Arcade.buzz(80); }
        // XP: gemas grandes valem mais; se houver demasiadas, entra direto
        let xp = e.xp;
        while (xp > 0) {
          const v = xp >= 5 ? 5 : 1;
          xp -= v;
          if (S.gems.length < 300) {
            S.gems.push({ x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r, v, pull: false });
          } else gainXp(v);
        }
      }
    }

    function gainXp(v) {
      S.xp += v;
      while (S.xp >= S.xpNext) {
        S.xp -= S.xpNext;
        S.level++;
        S.xpNext = Math.round(5 + S.level * 3.5 + S.level * S.level * 0.15);
        S.pendingLevels++;
      }
    }

    function nearest(maxDist) {
      let best = null, bd = maxDist * maxDist;
      for (const e of S.enemies) {
        const d = (e.x - S.p.x) ** 2 + (e.y - S.p.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    function fire(target) {
      const { p, st } = S;
      const base = Math.atan2(target.y - p.y, target.x - p.x);
      const spread = 0.14;
      for (let i = 0; i < st.shots; i++) {
        const a = base + (i - (st.shots - 1) / 2) * spread;
        S.bullets.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * st.bulletSpeed, vy: Math.sin(a) * st.bulletSpeed,
          life: 1.1, pierce: st.pierce, hit: new Set(),
        });
      }
    }

    function update(dt) {
      if (S.shake > 0) S.shake -= dt;
      if (S.phase !== 'play') return;
      const { p, st } = S;
      S.t += dt;

      // Jogador
      const v = stick.vec();
      p.x += v.x * st.speed * dt;
      p.y += v.y * st.speed * dt;
      if (p.inv > 0) p.inv -= dt;
      if (st.regen) p.hp = Math.min(st.maxHp, p.hp + st.regen * dt);

      // Spawns
      S.spawnT += dt * Math.min(14, 0.8 + S.t * 0.045);
      while (S.spawnT >= 1) {
        S.spawnT -= 1;
        if (S.enemies.length < 260) spawn(pickType());
      }
      if (S.t >= S.nextBoss) { spawn('boss'); S.nextBoss += 120; }

      // Inimigos: perseguem, empurram-se uns aos outros, magoam ao tocar
      const E = S.enemies;
      for (const e of E) {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        e.x += dx / d * e.speed * dt;
        e.y += dy / d * e.speed * dt;
        if (e.flash > 0) e.flash -= dt;
        if (e.orbCd > 0) e.orbCd -= dt;
        if (d < e.r + p.r && p.inv <= 0) {
          p.hp -= e.dmg;
          p.inv = 0.6;
          S.shake = 0.15;
          Arcade.buzz(30);
        }
      }
      for (let i = 0; i < E.length; i++) {
        const a = E[i];
        for (let j = i + 1; j < E.length; j++) {
          const b = E[j];
          const dx = b.x - a.x, dy = b.y - a.y, min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < min * min && d2 > 0.0001) {
            const d = Math.sqrt(d2), push = (min - d) / d, wa = b.r / min, wb = a.r / min;
            a.x -= dx * push * wa; a.y -= dy * push * wa;
            b.x += dx * push * wb; b.y += dy * push * wb;
          }
        }
      }

      // Arma principal
      S.fireT -= dt;
      if (S.fireT <= 0) {
        const target = nearest(Math.max(view.w, view.h) * 0.6);
        if (target) { fire(target); S.fireT = st.fireDelay; }
      }
      for (const b of S.bullets) {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        for (const e of E) {
          if (e.dead || b.hit.has(e)) continue;
          if ((e.x - b.x) ** 2 + (e.y - b.y) ** 2 < (e.r + 4) ** 2) {
            damage(e, st.dmg);
            b.hit.add(e);
            if (b.pierce-- <= 0) { b.life = 0; break; }
          }
        }
      }
      S.bullets = S.bullets.filter(b => b.life > 0);

      // Lâminas orbitais
      if (st.orbs > 0) {
        S.orbA += dt * 3.2;
        for (let k = 0; k < st.orbs; k++) {
          const a = S.orbA + k * TAU / st.orbs;
          const ox = p.x + Math.cos(a) * 62, oy = p.y + Math.sin(a) * 62;
          for (const e of E) {
            if (e.orbCd <= 0 && (e.x - ox) ** 2 + (e.y - oy) ** 2 < (e.r + 9) ** 2) {
              damage(e, st.dmg * 0.8);
              e.orbCd = 0.35;
            }
          }
        }
      }

      // Onda de choque
      if (st.nova > 0) {
        S.novaT -= dt;
        if (S.novaT <= 0) {
          S.novaT = 4.5 - st.nova * 0.8;
          const radius = 100 + st.nova * 35;
          for (const e of E) {
            if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (radius + e.r) ** 2) damage(e, st.dmg * 2.5);
          }
          S.rings.push({ x: p.x, y: p.y, max: radius, life: 0.35 });
        }
      }
      for (const r of S.rings) r.life -= dt;
      S.rings = S.rings.filter(r => r.life > 0);

      S.enemies = E.filter(e => !e.dead);

      // Gemas de XP
      for (const g of S.gems) {
        const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
        if (d < st.magnet) g.pull = true;
        if (g.pull) {
          const sp = 420 * dt;
          g.x += dx / (d || 1) * sp; g.y += dy / (d || 1) * sp;
        }
        if (d < p.r + 6) { g.taken = true; gainXp(g.v); }
      }
      S.gems = S.gems.filter(g => !g.taken);

      // Partículas
      for (const q of S.parts) {
        q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= 0.92; q.vy *= 0.92;
        q.life -= dt;
      }
      S.parts = S.parts.filter(q => q.life > 0);

      if (p.hp <= 0) return gameOver();
      if (S.pendingLevels > 0) showLevelUp();
    }

    // ---------- Ecrãs ----------
    function showLevelUp() {
      S.phase = 'levelup';
      stick.reset();
      const pool = UPGRADES.filter(u => !u.max || (S.lv[u.id] || 0) < u.max);
      const choices = [];
      while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      overlay.innerHTML = `<h2>Nível ${S.level - S.pendingLevels + 1}!</h2><p>Escolhe uma melhoria</p>` +
        choices.map((u, i) => {
          const cur = S.lv[u.id] || 0;
          const tag = u.max ? ` <small>(${cur + 1}/${u.max})</small>` : '';
          return `<button class="btn" data-i="${i}"><b>${u.name}${tag}</b><small>${u.desc}</small></button>`;
        }).join('');
      overlay.hidden = false;
      overlay.querySelectorAll('[data-i]').forEach(btn => {
        btn.onclick = () => {
          const u = choices[+btn.dataset.i];
          u.apply(S.st, S.p);
          S.lv[u.id] = (S.lv[u.id] || 0) + 1;
          S.pendingLevels--;
          if (S.pendingLevels > 0) showLevelUp();
          else { overlay.hidden = true; S.phase = 'play'; }
        };
      });
    }

    function fmtTime(t) {
      const s = Math.floor(t);
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    function gameOver() {
      S.phase = 'over';
      stick.reset();
      const best = Arcade.store.get('shooter:best', 0);
      const record = S.pts > best;
      if (record) Arcade.store.set('shooter:best', S.pts);
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Morreste'}</h2>
        <p>${record ? '' : `Recorde: ${best} pontos`}</p>
        <div class="stats">
          <div><b>${S.pts}</b><span>pontos</span></div>
          <div><b>${fmtTime(S.t)}</b><span>tempo</span></div>
          <div><b>${S.kills}</b><span>abates</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = reset;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function pause() {
      if (S.phase !== 'play') return;
      S.phase = 'paused';
      stick.reset();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${fmtTime(S.t)} · ${S.pts} pontos · nível ${S.level}</p>
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
    function render() {
      const { w, h } = view;
      const { p, st } = S;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);

      let sx = 0, sy = 0;
      if (S.shake > 0) { sx = (Math.random() - 0.5) * 10; sy = (Math.random() - 0.5) * 10; }
      const cx = w / 2 - p.x + sx, cy = h / 2 - p.y + sy;

      // Grelha do chão (dá sensação de movimento)
      const g = 48;
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = ((cx % g) + g) % g; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = ((cy % g) + g) % g; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      const visible = (x, y, r) => x + r > -cx && x - r < -cx + w && y + r > -cy && y - r < -cy + h;

      for (const gm of S.gems) {
        if (!visible(gm.x, gm.y, 8)) continue;
        const s = gm.v >= 5 ? 7 : 4.5;
        ctx.fillStyle = gm.v >= 5 ? '#45aaf2' : '#2bcbba';
        ctx.beginPath();
        ctx.moveTo(gm.x, gm.y - s); ctx.lineTo(gm.x + s, gm.y); ctx.lineTo(gm.x, gm.y + s); ctx.lineTo(gm.x - s, gm.y);
        ctx.fill();
      }

      for (const r of S.rings) {
        const k = 1 - r.life / 0.35;
        ctx.strokeStyle = `rgba(120,200,255,${1 - k})`;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.max * k, 0, TAU); ctx.stroke();
      }

      for (const e of S.enemies) {
        if (!visible(e.x, e.y, e.r)) continue;
        ctx.fillStyle = e.flash > 0 ? '#fff' : e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, TAU); ctx.fill();
        // olhos virados para o jogador
        const a = Math.atan2(p.y - e.y, p.x - e.x);
        ctx.fillStyle = '#0f1020';
        for (const s of [-0.5, 0.5]) {
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a + s) * e.r * 0.5, e.y + Math.sin(a + s) * e.r * 0.5, Math.max(2, e.r * 0.16), 0, TAU);
          ctx.fill();
        }
        if (e.type === 'boss' || e.type === 'tank') {
          ctx.fillStyle = 'rgba(0,0,0,.5)';
          ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
          ctx.fillStyle = '#ff5a6e';
          ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * Math.max(0, e.hp / e.maxHp), 4);
        }
      }

      ctx.fillStyle = '#ffd86b';
      for (const b of S.bullets) {
        ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, TAU); ctx.fill();
      }

      for (let k = 0; k < st.orbs; k++) {
        const a = S.orbA + k * TAU / st.orbs;
        ctx.fillStyle = '#d1d8e0';
        ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * 62, p.y + Math.sin(a) * 62, 8, 0, TAU); ctx.fill();
      }

      if (!(p.inv > 0 && Math.floor(p.inv * 20) % 2)) {
        ctx.fillStyle = '#ffcc4d';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(43,203,186,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, st.magnet, 0, TAU); ctx.stroke();

      for (const q of S.parts) {
        ctx.globalAlpha = Math.min(1, q.life * 2.5);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 2, q.y - 2, 4, 4);
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      // HUD
      const y0 = top;
      ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, y0, w, 6);
      ctx.fillStyle = '#2bcbba'; ctx.fillRect(0, y0, w * (S.xp / S.xpNext), 6);

      const bw = Math.min(200, w - 140);
      ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(14, y0 + 22, bw, 12);
      ctx.fillStyle = p.hp / st.maxHp > 0.3 ? '#26de81' : '#ff5a6e';
      ctx.fillRect(14, y0 + 22, bw * Math.max(0, p.hp / st.maxHp), 12);

      ctx.fillStyle = '#eef0ff';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`Nv ${S.level}   ${fmtTime(S.t)}   ${S.pts} pts`, 14, y0 + 42);

      stick.draw(ctx);
    }

    reset();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        loop.stop();
        stick.dispose();
        disposeCanvas();
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  Arcade.register({
    id: 'shooter',
    title: 'Enxame',
    icon: '🎯',
    color: '#ff5a6e',
    desc: 'Sobrevive às hordas. Mata, sobe de nível e escolhe poderes.',
    best: () => Arcade.store.get('shooter:best', 0) + ' pts',
    create,
  });
})();
