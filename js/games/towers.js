// Defesa da Torre: constrói torres à volta do caminho e trava 20 vagas de inimigos.
(function () {
  const TAU = Math.PI * 2;
  const COLS = 8, ROWS = 13;
  const START_LIVES = 20, WIN_WAVE = 20, WAVE_GAP = 20, STEP = 1 / 60;

  // Caminhos em coordenadas de grelha (coluna, linha). Entram por cima e saem por baixo.
  const MAPS = [
    { name: 'Prado', diff: 'Fácil', color: '#26de81', money: 200, hp: 1.0,
      pts: [[1, -1], [1, 2], [6, 2], [6, 5], [1, 5], [1, 8], [6, 8], [6, 11], [3, 11], [3, 13]] },
    { name: 'Desfiladeiro', diff: 'Médio', color: '#ffcc4d', money: 200, hp: 1.15,
      pts: [[6, -1], [6, 3], [1, 3], [1, 7], [5, 7], [5, 10], [2, 10], [2, 13]] },
    { name: 'Vulcão', diff: 'Difícil', color: '#ff5a6e', money: 190, hp: 1.35,
      pts: [[1, -1], [1, 4], [5, 4], [5, 8], [2, 8], [2, 13]] },
  ];

  // Valores por nível [1, 2, 3]. Alcance em casas, cadência em segundos entre disparos.
  const TOWERS = {
    gun:    { name: 'Metralhadora', color: '#ffcc4d', cost: 50,  up: [45, 90],   air: true,
              dmg: [6, 10, 16], rate: [0.32, 0.27, 0.22], range: [2.2, 2.4, 2.6] },
    cannon: { name: 'Canhão', color: '#ff9f43', cost: 90, up: [75, 140], air: false,
              dmg: [22, 38, 62], rate: [1.5, 1.4, 1.3], range: [2.3, 2.5, 2.7], splash: [0.9, 1.0, 1.15] },
    ice:    { name: 'Gelo', color: '#45aaf2', cost: 70, up: [55, 100], air: false,
              dmg: [2, 4, 7], rate: [1.2, 1.1, 1.0], range: [1.8, 2.0, 2.3], slow: [0.55, 0.45, 0.35] },
    sniper: { name: 'Sniper', color: '#26de81', cost: 120, up: [95, 170], air: true,
              dmg: [55, 100, 170], rate: [2.0, 1.8, 1.6], range: [4.5, 5.0, 5.5] },
  };
  const TOWER_ORDER = ['gun', 'cannon', 'ice', 'sniper'];

  const ENEMIES = {
    normal:  { hp: 30,  speed: 1.0,  reward: 4,  armor: 0, r: 0.24, color: '#ff5a6e', lives: 1 },
    fast:    { hp: 16,  speed: 1.8,  reward: 4,  armor: 0, r: 0.19, color: '#ff9f43', lives: 1 },
    armored: { hp: 60,  speed: 0.7,  reward: 8,  armor: 5, r: 0.3,  color: '#a55eea', lives: 1 },
    flyer:   { hp: 24,  speed: 1.15, reward: 6,  armor: 0, r: 0.22, color: '#2bcbba', lives: 1, air: true },
    boss:    { hp: 550, speed: 0.45, reward: 80, armor: 5, r: 0.42, color: '#eb3b5a', lives: 5 },
  };

  const TUNE = { a: 0.22, g: 1.08, reward: 1 };
  function hpMul(n) { return (1 + TUNE.a * (n - 1)) * Math.pow(TUNE.g, n - 1); }

  // Composição de cada vaga: grupos que entram em sequência.
  function waveGroups(n) {
    const g = [];
    g.push({ t: 'normal', c: 6 + Math.floor(n * 1.3), gap: Math.max(0.45, 1.0 - n * 0.025) });
    if (n >= 3) g.push({ t: 'fast', c: Math.floor(n * 0.8) + (n % 4 === 3 ? 6 : 0), gap: 0.5 });
    if (n >= 5) g.push({ t: 'armored', c: Math.floor((n - 3) * 0.5) + (n % 4 === 1 ? 4 : 0), gap: 1.4 });
    if (n >= 7) g.push({ t: 'flyer', c: Math.floor((n - 5) * 0.6) + (n % 4 === 2 ? 5 : 0), gap: 0.8 });
    if (n % 10 === 0) g.push({ t: 'boss', c: n / 10, gap: 4 });
    return g.filter(x => x.c > 0);
  }

  function buildMap(i) {
    const m = MAPS[i];
    const key = (c, r) => c + ',' + r;
    const pts = m.pts.map(([c, r]) => ({ x: c + 0.5, y: r + 0.5 }));
    const segs = [];
    let len = 0;
    const path = new Set();
    for (let k = 0; k < m.pts.length - 1; k++) {
      const [c0, r0] = m.pts[k], [c1, r1] = m.pts[k + 1];
      const l = Math.abs(c1 - c0) + Math.abs(r1 - r0);
      segs.push({ a: pts[k], b: pts[k + 1], l, start: len });
      len += l;
      for (let j = 0; j <= l; j++) path.add(key(c0 + Math.sign(c1 - c0) * j, r0 + Math.sign(r1 - r0) * j));
    }
    const build = new Set(), decor = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (path.has(key(c, r))) continue;
      let near = false;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (path.has(key(c + dc, r + dr))) near = true;
      if (near) build.add(key(c, r));
      else {
        const h = Math.abs(Math.sin(c * 12.9898 + r * 78.233 + i * 3.1) * 43758.5453) % 1;
        if (h < 0.55) decor.push({ c, r, kind: h < 0.35 ? 'tree' : 'rock', s: 0.6 + h * 0.6 });
      }
    }
    const last = m.pts[m.pts.length - 1], first = m.pts[0];
    return { i, m, pts, segs, len, path, build, decor, key, exitC: last[0], entryC: first[0] };
  }

  function posAt(G, d) {
    for (const s of G.segs) {
      if (d <= s.start + s.l || s === G.segs[G.segs.length - 1]) {
        const k = Math.max(0, Math.min(1, (d - s.start) / s.l));
        return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k, dx: Math.sign(s.b.x - s.a.x), dy: Math.sign(s.b.y - s.a.y) };
      }
    }
    return { x: 0, y: 0, dx: 0, dy: 1 };
  }

  function safeBottom() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;bottom:0;height:env(safe-area-inset-bottom);visibility:hidden';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  }

  const recKey = i => 'towers:map' + i;
  const getRec = i => Arcade.store.get(recKey(i), { wave: 0, stars: 0 });
  const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

  const CSS = `
.tw-bar{position:absolute;left:12px;right:12px;max-width:560px;margin:0 auto;bottom:calc(env(safe-area-inset-bottom) + 12px);display:flex;gap:10px;z-index:2}
.tw-bar .btn{max-width:none;height:50px;padding:0 12px;text-align:center}
.tw-bar .btn:disabled{opacity:1;background:#1a1c33;color:#9aa0c8;border-color:#34386a}
.tw-next{flex:1}
.tw-speed{width:72px;flex:none;font-weight:700}
.tw-panel{position:absolute;left:10px;right:10px;max-width:520px;margin:0 auto;z-index:2;background:rgba(26,28,51,.97);border:2px solid #34386a;border-radius:16px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.55)}
.tw-panel[hidden]{display:none}
.tw-row{display:flex;gap:8px}
.tw-opt{flex:1;min-width:0;min-height:78px;background:#0f1020;border:2px solid #34386a;border-radius:12px;color:#eef0ff;font:inherit;padding:8px 2px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.tw-opt:disabled{opacity:.4}
.tw-opt:active:not(:disabled){transform:scale(.96)}
.tw-opt .n{font-size:11.5px;letter-spacing:-.01em;font-weight:600;white-space:nowrap}
.tw-opt .c{font-size:14px;color:#ffcc4d;font-weight:700}
.tw-opt.sell .c{color:#26de81}
.tw-sw{width:22px;height:22px;border-radius:7px}
.tw-coin{display:inline-block;width:.72em;height:.72em;border-radius:50%;background:#ffcc4d;margin-right:4px;box-shadow:inset 0 0 0 2px #d9a400}
.tw-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:0 4px 8px}
.tw-head b{font-size:16px}.tw-head span{color:#9aa0c8;font-size:13px;text-align:right}
.overlay .tw-stars{color:#ffcc4d;letter-spacing:2px}
`;
  const coin = '<i class="tw-coin"></i>';

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();
    const bottom = safeBottom();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const bar = document.createElement('div');
    bar.className = 'tw-bar';
    bar.innerHTML = '<button class="btn primary tw-next"></button><button class="btn tw-speed">1x</button>';
    root.appendChild(bar);
    const nextBtn = bar.querySelector('.tw-next');
    const speedBtn = bar.querySelector('.tw-speed');

    const panel = document.createElement('div');
    panel.className = 'tw-panel';
    panel.hidden = true;
    root.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    let mapIdx = Math.min(MAPS.length - 1, Math.max(0, Arcade.store.get('towers:last', 0) | 0));
    let G = buildMap(mapIdx);
    let S;
    let acc = 0;

    function newState() {
      return {
        phase: 'select', t: 0, wave: 0, lives: START_LIVES, money: G.m.money, speed: 1,
        infinite: false, won: false, queue: [], spawnT: 0, timer: 0,
        enemies: [], towers: [], shells: [], fx: [], texts: [], parts: [],
        sel: null, kills: 0, shake: 0, hurt: 0, panelKey: '',
      };
    }

    function startMap(i) {
      mapIdx = i;
      Arcade.store.set('towers:last', i);
      G = buildMap(i);
      S = newState();
      S.phase = 'play';
      S.startRec = getRec(i).wave;
      overlay.hidden = true;
      closePanel();
      acc = 0;
    }

    // ---------- Lógica ----------
    function towerAt(c, r) { return S.towers.find(t => t.c === c && t.r === r); }

    function stats(t) {
      const d = TOWERS[t.type], l = t.lvl - 1;
      return { dmg: d.dmg[l], rate: d.rate[l], range: d.range[l], splash: d.splash && d.splash[l], slow: d.slow && d.slow[l], air: d.air };
    }

    function build(c, r, type) {
      const d = TOWERS[type];
      if (!G.build.has(G.key(c, r)) || towerAt(c, r) || S.money < d.cost) return false;
      S.money -= d.cost;
      S.towers.push({ type, c, r, x: c + 0.5, y: r + 0.5, lvl: 1, spent: d.cost, cd: 0, ang: -Math.PI / 2, flash: 0 });
      return true;
    }

    function upgrade(t) {
      if (!t || t.lvl >= 3) return false;
      const cost = TOWERS[t.type].up[t.lvl - 1];
      if (S.money < cost) return false;
      S.money -= cost; t.spent += cost; t.lvl++;
      addText(t.x, t.y - 0.4, 'Nv ' + t.lvl, '#eef0ff');
      return true;
    }

    function sell(t) {
      if (!t) return 0;
      const v = Math.floor(t.spent * 0.7);
      S.money += v;
      S.towers = S.towers.filter(o => o !== t);
      addText(t.x, t.y, '+' + v, '#26de81');
      return v;
    }

    function earlyBonus() {
      return S.wave > 0 && S.timer > 0 ? Math.round(S.timer) : 0;
    }

    function canCallNext() {
      return S.phase === 'play' && !S.queue.length && (S.infinite || S.wave < WIN_WAVE);
    }

    function callNext() {
      if (!canCallNext()) return false;
      const bonus = earlyBonus();
      if (bonus) { S.money += bonus; addText(COLS / 2, 0.8, 'Bónus +' + bonus, '#ffcc4d', 1.4); }
      S.wave++;
      S.timer = 0;
      for (const g of waveGroups(S.wave)) {
        for (let k = 0; k < g.c; k++) S.queue.push({ t: g.t, gap: g.gap });
        S.queue[S.queue.length - 1].gap = Math.max(g.gap, 1.6);
      }
      S.spawnT = 0;
      const rec = getRec(mapIdx);
      if (S.wave > rec.wave) { rec.wave = S.wave; Arcade.store.set(recKey(mapIdx), rec); }
      return true;
    }

    function spawn(type) {
      const d = ENEMIES[type], n = S.wave;
      const hp = d.hp * hpMul(n) * G.m.hp;
      S.enemies.push({
        type, d: 0, x: G.pts[0].x, y: G.pts[0].y, dir: { dx: 0, dy: 1 },
        hp, maxHp: hp, speed: d.speed * (1 + Math.min(0.25, n * 0.008)), armor: d.armor + (type === 'armored' || type === 'boss' ? Math.floor(n / 4) : 0),
        reward: Math.round(d.reward * TUNE.reward * (1 + 0.03 * (n - 1))), lives: d.lives, air: !!d.air, r: d.r, color: d.color,
        slowT: 0, slowF: 1, flash: 0, dead: false, wob: Math.random() * TAU,
      });
    }

    function addText(x, y, s, color, life = 0.9) { S.texts.push({ x, y, s, color, life, max: life }); }

    function burst(x, y, color, n, sp) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = sp * (0.4 + Math.random());
        S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, color });
      }
    }

    function hit(e, dmg) {
      if (e.dead) return;
      e.hp -= Math.max(dmg * 0.25, dmg - e.armor);
      e.flash = 0.06;
      if (e.hp <= 0) {
        e.dead = true;
        S.kills++;
        S.money += e.reward;
        addText(e.x, e.y - 0.2, '+' + e.reward, '#ffcc4d');
        burst(e.x, e.y, e.color, e.type === 'boss' ? 30 : 7, e.type === 'boss' ? 4 : 2.5);
        if (e.type === 'boss') { S.shake = 0.35; Arcade.buzz(60); }
      }
    }

    function target(t, st) {
      let best = null;
      const r2 = st.range * st.range;
      for (const e of S.enemies) {
        if (e.dead || (e.air && !st.air)) continue;
        if ((e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue;
        if (!best || e.d > best.d) best = e;
      }
      return best;
    }

    function update(dt) {
      if (S.phase !== 'play') return;
      S.t += dt;
      if (S.shake > 0) S.shake -= dt;
      if (S.hurt > 0) S.hurt -= dt;

      // Entrada de inimigos
      if (S.queue.length) {
        S.spawnT -= dt;
        while (S.queue.length && S.spawnT <= 0) {
          const q = S.queue.shift();
          spawn(q.t);
          S.spawnT += q.gap;
        }
        if (!S.queue.length && (S.infinite || S.wave < WIN_WAVE)) S.timer = WAVE_GAP;
      } else if (S.timer > 0) {
        S.timer -= dt;
        if (S.timer <= 0) { S.timer = 0; callNext(); }
      }

      // Movimento
      for (const e of S.enemies) {
        if (e.flash > 0) e.flash -= dt;
        let f = 1;
        if (e.slowT > 0) { e.slowT -= dt; f = e.slowF; } else e.slowF = 1;
        e.d += e.speed * f * dt;
        const p = posAt(G, e.d);
        e.x = p.x; e.y = p.y; e.dir = p;
        if (e.d >= G.len) {
          e.dead = true;
          S.lives = Math.max(0, S.lives - e.lives);
          S.hurt = 0.4; S.shake = 0.2;
          Arcade.buzz(40);
        }
      }

      // Torres
      for (const t of S.towers) {
        const st = stats(t);
        t.cd -= dt;
        if (t.flash > 0) t.flash -= dt;
        if (t.cd > 0) continue;
        if (t.type === 'ice') {
          let any = false;
          const r2 = st.range * st.range;
          for (const e of S.enemies) {
            if (e.dead || e.air || (e.x - t.x) ** 2 + (e.y - t.y) ** 2 > r2) continue;
            any = true;
            const f = e.type === 'boss' ? 1 - (1 - st.slow) * 0.5 : st.slow;
            e.slowF = e.slowT > 0 ? Math.min(e.slowF, f) : f;
            e.slowT = 1.6;
            hit(e, st.dmg);
          }
          if (any) { t.cd = st.rate; S.fx.push({ k: 'ring', x: t.x, y: t.y, r: st.range, color: '#45aaf2', life: 0.35, max: 0.35 }); }
          continue;
        }
        const e = target(t, st);
        if (!e) continue;
        t.cd = st.rate;
        t.ang = Math.atan2(e.y - t.y, e.x - t.x);
        t.flash = 0.07;
        const mx = t.x + Math.cos(t.ang) * 0.38, my = t.y + Math.sin(t.ang) * 0.38;
        if (t.type === 'cannon') {
          S.shells.push({ x: mx, y: my, e, tx: e.x, ty: e.y, dmg: st.dmg, splash: st.splash });
        } else {
          hit(e, st.dmg);
          const sn = t.type === 'sniper';
          S.fx.push({ k: 'line', x: mx, y: my, x2: e.x, y2: e.y, color: sn ? '#d4ffe6' : '#ffe08a', w: sn ? 3 : 2, life: sn ? 0.14 : 0.06, max: sn ? 0.14 : 0.06 });
        }
      }

      // Projéteis do canhão
      for (const s of S.shells) {
        if (!s.e.dead) { s.tx = s.e.x; s.ty = s.e.y; }
        const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = 7 * dt;
        if (d <= v) {
          s.done = true;
          const r2 = s.splash * s.splash;
          for (const e of S.enemies) if (!e.air && (e.x - s.tx) ** 2 + (e.y - s.ty) ** 2 <= r2) hit(e, s.dmg);
          S.fx.push({ k: 'boom', x: s.tx, y: s.ty, r: s.splash, color: '#ff9f43', life: 0.3, max: 0.3 });
        } else { s.x += dx / d * v; s.y += dy / d * v; }
      }
      S.shells = S.shells.filter(s => !s.done);
      S.enemies = S.enemies.filter(e => !e.dead);

      for (const f of S.fx) f.life -= dt;
      S.fx = S.fx.filter(f => f.life > 0);
      for (const q of S.texts) { q.life -= dt; q.y -= dt * 0.6; }
      S.texts = S.texts.filter(q => q.life > 0);
      for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9; q.life -= dt; }
      S.parts = S.parts.filter(q => q.life > 0);

      if (S.lives <= 0) return gameOver();
      if (!S.infinite && S.wave >= WIN_WAVE && !S.queue.length && !S.enemies.length) victory();
    }

    // ---------- Ecrãs ----------
    function starsFor(lives) { return lives >= 15 ? 3 : lives >= 8 ? 2 : 1; }

    function victory() {
      S.phase = 'won';
      S.won = true;
      closePanel();
      const stars = starsFor(S.lives);
      const rec = getRec(mapIdx);
      const better = stars > rec.stars;
      rec.stars = Math.max(rec.stars, stars);
      rec.wave = Math.max(rec.wave, S.wave);
      Arcade.store.set(recKey(mapIdx), rec);
      overlay.innerHTML = `
        <h2>Vitória!</h2>
        <p><span class="tw-stars" style="font-size:30px">${starStr(stars)}</span><br>${better ? 'Novo recorde neste mapa' : G.m.name + ' · ' + G.m.diff}</p>
        <div class="stats">
          <div><b>${S.lives}</b><span>vidas</span></div>
          <div><b>${S.wave}</b><span>vagas</span></div>
          <div><b>${S.kills}</b><span>abates</span></div>
        </div>
        <button class="btn primary" data-a="inf">Continuar (modo infinito)</button>
        <button class="btn center" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="maps">Mudar de mapa</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      bindOverlay({
        inf: () => { S.infinite = true; S.phase = 'play'; S.timer = WAVE_GAP; overlay.hidden = true; },
      });
    }

    function gameOver() {
      S.phase = 'over';
      S.hurt = 0; S.shake = 0;
      closePanel();
      const rec = getRec(mapIdx);
      const prev = S.startRec || 0;
      rec.wave = Math.max(rec.wave, S.wave);
      Arcade.store.set(recKey(mapIdx), rec);
      const title = S.won ? 'Fim do modo infinito' : 'O castelo caiu';
      const sub = S.wave > prev ? 'Novo recorde: vaga ' + S.wave : 'Recorde: vaga ' + prev;
      overlay.innerHTML = `
        <h2>${title}</h2>
        <p>${G.m.name} · ${G.m.diff} · ${sub}</p>
        <div class="stats">
          <div><b>${S.wave}</b><span>vaga</span></div>
          <div><b>${S.kills}</b><span>abates</span></div>
          <div><b>${S.towers.length}</b><span>torres</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="maps">Mudar de mapa</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      bindOverlay({});
    }

    function showSelect() {
      S = newState();
      closePanel();
      const opts = MAPS.map((m, i) => {
        const rec = getRec(i);
        const info = rec.stars ? `<span class="tw-stars">${starStr(rec.stars)}</span> · melhor: vaga ${rec.wave}` : rec.wave ? `Melhor: vaga ${rec.wave} de ${WIN_WAVE}` : 'Ainda por jogar';
        return `<button class="btn" data-map="${i}"><b><span style="color:${m.color}">●</span> ${m.name} · ${m.diff}</b><small>${info}</small></button>`;
      }).join('');
      overlay.innerHTML = `<h2>Defesa da Torre</h2><p>Escolhe o mapa. Aguenta ${WIN_WAVE} vagas para ganhar.</p>${opts}
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-map]').forEach(b => { b.onclick = () => startMap(+b.dataset.map); });
      bindOverlay({});
    }

    function bindOverlay(extra) {
      const acts = Object.assign({
        go: () => { overlay.hidden = true; S.phase = 'play'; },
        again: () => startMap(mapIdx),
        maps: showSelect,
        menu: host.exit,
      }, extra);
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = acts[b.dataset.a]; });
    }

    function pause() {
      if (S.phase !== 'play') return;
      S.phase = 'paused';
      closePanel();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${G.m.name} · vaga ${S.wave}${S.infinite ? '' : '/' + WIN_WAVE} · ${S.lives} vidas</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="again">Recomeçar</button>
        <button class="btn center" data-a="maps">Mudar de mapa</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      bindOverlay({});
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);

    nextBtn.onclick = () => callNext();
    speedBtn.onclick = () => { S.speed = S.speed === 1 ? 2 : 1; };

    // ---------- Painel de construção / melhoria ----------
    function closePanel() { panel.hidden = true; if (S) { S.sel = null; S.panelKey = ''; } }

    function renderPanel() {
      if (!S.sel) { panel.hidden = true; return; }
      const { c, r } = S.sel;
      const t = towerAt(c, r);
      const key = (t ? t.type + t.lvl : 'b') + ':' + c + ',' + r + ':' + S.money;
      if (key === S.panelKey && !panel.hidden) return;
      S.panelKey = key;
      if (t) {
        const d = TOWERS[t.type], st = stats(t);
        const upCost = t.lvl < 3 ? d.up[t.lvl - 1] : 0;
        const sv = Math.floor(t.spent * 0.7);
        const fx = t.type === 'ice' ? ` · lento ${Math.round((1 - st.slow) * 100)}%` : t.type === 'cannon' ? ' · área' : '';
        panel.innerHTML = `
          <div class="tw-head"><b><span style="color:${d.color}">■</span> ${d.name} · Nv ${t.lvl}</b>
          <span>Dano ${st.dmg} · alcance ${st.range}${fx}</span></div>
          <div class="tw-row">
            <button class="tw-opt" data-up ${t.lvl >= 3 || S.money < upCost ? 'disabled' : ''}>
              <span class="n">${t.lvl >= 3 ? 'Nível máximo' : 'Melhorar → Nv ' + (t.lvl + 1)}</span>
              <span class="c">${t.lvl >= 3 ? '★★★' : coin + upCost}</span></button>
            <button class="tw-opt sell" data-sell><span class="n">Vender (70%)</span><span class="c">+${sv}</span></button>
          </div>`;
        panel.querySelector('[data-up]').onclick = () => { upgrade(t); renderPanel(); };
        panel.querySelector('[data-sell]').onclick = () => { sell(t); closePanel(); };
      } else {
        panel.innerHTML = `<div class="tw-head"><b>Construir torre</b><span>${coin}${S.money}</span></div><div class="tw-row">` +
          TOWER_ORDER.map(k => {
            const d = TOWERS[k];
            return `<button class="tw-opt" data-t="${k}" ${S.money < d.cost ? 'disabled' : ''}>
              <div class="tw-sw" style="background:${d.color}"></div><span class="n">${d.name}</span><span class="c">${coin}${d.cost}</span></button>`;
          }).join('') + '</div>';
        panel.querySelectorAll('[data-t]').forEach(b => {
          b.onclick = () => { if (build(c, r, b.dataset.t)) { S.panelKey = ''; renderPanel(); } };
        });
      }
      const L = layout();
      if (r >= ROWS / 2) { panel.style.top = (L.oy + 4) + 'px'; panel.style.bottom = ''; }
      else { panel.style.top = ''; panel.style.bottom = (L.barH + 4) + 'px'; }
      panel.hidden = false;
    }

    function onDown(e) {
      if (S.phase !== 'play') return;
      const L = layout();
      const c = Math.floor((e.clientX - L.ox) / L.cell), r = Math.floor((e.clientY - L.oy) / L.cell);
      const inside = c >= 0 && c < COLS && r >= 0 && r < ROWS;
      if (inside && (towerAt(c, r) || G.build.has(G.key(c, r)))) {
        if (S.sel && S.sel.c === c && S.sel.r === r) closePanel();
        else { S.sel = { c, r }; S.panelKey = ''; renderPanel(); }
      } else closePanel();
    }
    canvas.addEventListener('pointerdown', onDown);

    // ---------- Desenho ----------
    function layout() {
      const hudH = top + 74;
      const barH = 74 + bottom;
      const availH = view.h - hudH - barH;
      const cell = Math.max(10, Math.floor(Math.min((view.w - 10) / COLS, availH / ROWS)));
      return { cell, hudH, barH, ox: Math.round((view.w - cell * COLS) / 2), oy: Math.round(hudH + (availH - cell * ROWS) / 2) };
    }

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    function drawTower(t, X, Y, cs) {
      const d = TOWERS[t.type];
      const s = cs * 0.78;
      ctx.fillStyle = '#2a2d52';
      rr(X - s / 2, Y - s / 2, s, s, cs * 0.16); ctx.fill();
      ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke();
      ctx.save();
      ctx.translate(X, Y);
      if (t.type === 'ice') {
        const k = cs * (0.22 + t.lvl * 0.03);
        ctx.rotate(S.t * 0.8);
        ctx.fillStyle = t.flash > 0 ? '#fff' : d.color;
        ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k * 0.6, 0); ctx.lineTo(0, k); ctx.lineTo(-k * 0.6, 0); ctx.closePath(); ctx.fill();
        ctx.rotate(Math.PI / 2);
        ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(0, -k); ctx.lineTo(k * 0.6, 0); ctx.lineTo(0, k); ctx.lineTo(-k * 0.6, 0); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.rotate(t.ang);
        ctx.fillStyle = '#0f1020';
        if (t.type === 'gun') {
          ctx.fillRect(0, -cs * 0.11, cs * 0.36, cs * 0.07);
          ctx.fillRect(0, cs * 0.04, cs * 0.36, cs * 0.07);
        } else if (t.type === 'cannon') {
          ctx.fillRect(0, -cs * 0.09, cs * 0.34, cs * 0.18);
        } else {
          ctx.fillRect(0, -cs * 0.035, cs * 0.46, cs * 0.07);
        }
        ctx.fillStyle = t.flash > 0 ? '#fff' : d.color;
        ctx.beginPath(); ctx.arc(0, 0, cs * (t.type === 'cannon' ? 0.2 : 0.17), 0, TAU); ctx.fill();
        if (t.flash > 0 && t.type !== 'cannon') {
          ctx.fillStyle = '#fff6c2';
          ctx.beginPath(); ctx.arc(cs * (t.type === 'sniper' ? 0.48 : 0.38), 0, cs * 0.07, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
      for (let k = 0; k < t.lvl; k++) {
        ctx.fillStyle = d.color;
        ctx.beginPath(); ctx.arc(X - s / 2 + cs * 0.12 + k * cs * 0.13, Y + s / 2 - cs * 0.1, cs * 0.045, 0, TAU); ctx.fill();
      }
    }

    function drawEnemy(e, X, Y, cs) {
      const R = e.r * cs;
      ctx.save();
      ctx.translate(X, Y);
      if (e.air) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        ctx.beginPath(); ctx.ellipse(cs * 0.1, cs * 0.28, R, R * 0.45, 0, 0, TAU); ctx.fill();
        ctx.translate(0, -cs * 0.12);
        const flap = Math.sin(S.t * 18 + e.wob) * 0.35;
        ctx.fillStyle = e.flash > 0 ? '#fff' : '#9df5ea';
        for (const sd of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(sd * R * 1.05, 0, R * 0.9, R * 0.38, sd * flap, 0, TAU); ctx.fill();
        }
      }
      ctx.fillStyle = e.flash > 0 ? '#fff' : e.color;
      if (e.type === 'armored') {
        rr(-R, -R, R * 2, R * 2, R * 0.45); ctx.fill();
        ctx.strokeStyle = '#d1d8e0'; ctx.lineWidth = Math.max(2, cs * 0.05); ctx.stroke();
      } else if (e.type === 'fast') {
        const a = Math.atan2(e.dir.dy, e.dir.dx);
        ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(R * 1.3, 0); ctx.lineTo(-R, -R); ctx.lineTo(-R * 0.5, 0); ctx.lineTo(-R, R); ctx.closePath(); ctx.fill();
        ctx.rotate(-a);
      } else {
        ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.fill();
      }
      if (e.type === 'boss') {
        ctx.fillStyle = '#ffcc4d';
        ctx.beginPath();
        ctx.moveTo(-R * 0.6, -R * 0.75); ctx.lineTo(-R * 0.6, -R * 1.25); ctx.lineTo(-R * 0.3, -R * 1.0); ctx.lineTo(0, -R * 1.35);
        ctx.lineTo(R * 0.3, -R * 1.0); ctx.lineTo(R * 0.6, -R * 1.25); ctx.lineTo(R * 0.6, -R * 0.75); ctx.closePath(); ctx.fill();
      }
      if (e.type !== 'fast') {
        ctx.fillStyle = '#0f1020';
        const ex = e.dir.dx * R * 0.3, ey = e.dir.dy * R * 0.3;
        for (const sd of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(ex + (e.dir.dy ? sd * R * 0.35 : 0), ey + (e.dir.dx ? sd * R * 0.35 : 0) - (e.dir.dy ? 0 : R * 0.1), Math.max(1.5, R * 0.17), 0, TAU);
          ctx.fill();
        }
      }
      if (e.slowT > 0) {
        ctx.strokeStyle = 'rgba(69,170,242,.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, R + 3, 0, TAU); ctx.stroke();
      }
      if (e.hp < e.maxHp) {
        const bw = Math.max(R * 2, cs * 0.5);
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(-bw / 2, -R - 9, bw, 4);
        ctx.fillStyle = e.hp / e.maxHp > 0.4 ? '#26de81' : '#ff5a6e';
        ctx.fillRect(-bw / 2, -R - 9, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
      ctx.restore();
    }

    function render() {
      const { w, h } = view;
      const L = layout(), cs = L.cell;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);

      let sx = 0, sy = 0;
      if (S.shake > 0) { sx = (Math.random() - 0.5) * 8; sy = (Math.random() - 0.5) * 8; }
      const X = x => L.ox + x * cs + sx, Y = y => L.oy + y * cs + sy;
      const gw = COLS * cs, gh = ROWS * cs;

      ctx.save();
      rr(L.ox + sx, L.oy + sy, gw, gh, 14); ctx.clip();
      ctx.fillStyle = '#14162b'; ctx.fillRect(L.ox + sx, L.oy + sy, gw, gh);

      // Decoração
      for (const d of G.decor) {
        const cx = X(d.c + 0.5), cy = Y(d.r + 0.5);
        if (d.kind === 'tree') {
          ctx.fillStyle = mapIdx === 2 ? '#3b2030' : '#1d3b33';
          ctx.beginPath(); ctx.arc(cx, cy, cs * 0.3 * d.s, 0, TAU); ctx.fill();
          ctx.fillStyle = mapIdx === 2 ? '#5a2a35' : '#25544a';
          ctx.beginPath(); ctx.arc(cx - cs * 0.06, cy - cs * 0.06, cs * 0.18 * d.s, 0, TAU); ctx.fill();
        } else {
          ctx.fillStyle = '#23264a';
          ctx.beginPath(); ctx.ellipse(cx, cy, cs * 0.22 * d.s, cs * 0.15 * d.s, 0.3, 0, TAU); ctx.fill();
        }
      }

      // Casas onde se pode construir
      for (const k of G.build) {
        const [c, r] = k.split(',').map(Number);
        ctx.fillStyle = '#1f2242';
        rr(X(c) + 3, Y(r) + 3, cs - 6, cs - 6, cs * 0.14); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1; ctx.stroke();
      }

      // Caminho
      ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
      ctx.beginPath();
      G.pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.strokeStyle = '#2f2b52'; ctx.lineWidth = cs * 0.88; ctx.stroke();
      ctx.strokeStyle = '#3a3566'; ctx.lineWidth = cs * 0.7; ctx.stroke();
      ctx.setLineDash([cs * 0.12, cs * 0.28]); ctx.lineDashOffset = -S.t * cs * 0.6;
      ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);

      // Entrada (portal) e castelo
      ctx.fillStyle = '#6c3fd1';
      ctx.beginPath(); ctx.ellipse(X(G.entryC + 0.5), Y(0.05), cs * 0.42, cs * 0.18, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0f1020';
      ctx.beginPath(); ctx.ellipse(X(G.entryC + 0.5), Y(0.05), cs * 0.3, cs * 0.11, 0, 0, TAU); ctx.fill();
      {
        const cx = X(G.exitC + 0.5), by = Y(ROWS) - 2, cw = cs * 0.84, ch = cs * 0.62;
        ctx.fillStyle = S.hurt > 0 ? '#ff5a6e' : '#d1d8e0';
        ctx.fillRect(cx - cw / 2, by - ch, cw, ch);
        const m = cw / 5;
        for (let k = 0; k < 5; k += 2) ctx.fillRect(cx - cw / 2 + k * m, by - ch - m * 0.8, m, m * 0.8);
        ctx.fillStyle = '#3a3566';
        ctx.beginPath(); ctx.moveTo(cx - cw * 0.17, by); ctx.lineTo(cx - cw * 0.17, by - ch * 0.5);
        ctx.arc(cx, by - ch * 0.5, cw * 0.17, Math.PI, 0); ctx.lineTo(cx + cw * 0.17, by); ctx.fill();
      }

      // Seleção e alcance
      let selT = null;
      if (S.sel) {
        selT = towerAt(S.sel.c, S.sel.r);
        ctx.strokeStyle = '#ffcc4d'; ctx.lineWidth = 2.5;
        rr(X(S.sel.c) + 2, Y(S.sel.r) + 2, cs - 4, cs - 4, cs * 0.16); ctx.stroke();
      }

      for (const e of S.enemies) if (!e.air) drawEnemy(e, X(e.x), Y(e.y), cs);
      for (const t of S.towers) drawTower(t, X(t.x), Y(t.y), cs);

      ctx.fillStyle = '#1b1b2b';
      for (const s of S.shells) {
        ctx.fillStyle = '#ffd2a1';
        ctx.beginPath(); ctx.arc(X(s.x), Y(s.y), cs * 0.09, 0, TAU); ctx.fill();
      }
      for (const e of S.enemies) if (e.air) drawEnemy(e, X(e.x), Y(e.y), cs);

      for (const f of S.fx) {
        const k = f.life / f.max;
        ctx.globalAlpha = Math.max(0, k);
        if (f.k === 'line') {
          ctx.strokeStyle = f.color; ctx.lineWidth = f.w;
          ctx.beginPath(); ctx.moveTo(X(f.x), Y(f.y)); ctx.lineTo(X(f.x2), Y(f.y2)); ctx.stroke();
        } else if (f.k === 'ring') {
          ctx.strokeStyle = f.color; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), f.r * cs * (1.05 - k * 0.6), 0, TAU); ctx.stroke();
        } else {
          ctx.fillStyle = f.color; ctx.globalAlpha = k * 0.55;
          ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), f.r * cs * (1.1 - k * 0.5), 0, TAU); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      for (const q of S.parts) {
        ctx.globalAlpha = Math.min(1, q.life * 3);
        ctx.fillStyle = q.color;
        ctx.fillRect(X(q.x) - 2, Y(q.y) - 2, 4, 4);
      }
      ctx.globalAlpha = 1;

      if (selT) {
        const st = stats(selT);
        ctx.fillStyle = 'rgba(255,204,77,.08)'; ctx.strokeStyle = 'rgba(255,204,77,.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(X(selT.x), Y(selT.y), st.range * cs, 0, TAU); ctx.fill(); ctx.stroke();
      }

      ctx.font = `700 ${Math.round(cs * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const q of S.texts) {
        ctx.globalAlpha = Math.min(1, q.life / q.max * 2);
        ctx.fillStyle = q.color;
        ctx.fillText(q.s, X(q.x), Y(q.y));
      }
      ctx.globalAlpha = 1;
      ctx.restore();

      if (S.hurt > 0) {
        ctx.fillStyle = `rgba(255,90,110,${S.hurt * 0.4})`;
        ctx.fillRect(0, 0, w, h);
      }

      // HUD
      const hy = top + 44;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '700 18px system-ui, sans-serif';
      let x = 16;
      // vidas (coração)
      ctx.fillStyle = '#ff5a6e';
      ctx.beginPath();
      ctx.moveTo(x + 9, hy + 7);
      ctx.bezierCurveTo(x - 4, hy - 1, x + 2, hy - 10, x + 9, hy - 3);
      ctx.bezierCurveTo(x + 16, hy - 10, x + 22, hy - 1, x + 9, hy + 7);
      ctx.fill();
      ctx.fillStyle = '#eef0ff';
      ctx.fillText(String(S.lives), x + 24, hy + 1);
      x += 24 + ctx.measureText(String(S.lives)).width + 18;
      ctx.fillStyle = '#ffcc4d';
      ctx.beginPath(); ctx.arc(x + 8, hy, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#d9a400'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#eef0ff';
      ctx.fillText(String(S.money), x + 22, hy + 1);
      x += 22 + Math.max(ctx.measureText(String(S.money)).width, 36) + 18;
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText('Vaga', x, hy + 1);
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(S.infinite ? `${S.wave} ∞` : `${S.wave}/${WIN_WAVE}`, x + 40, hy + 1);

      // Botões em baixo
      let label, dis;
      if (S.phase === 'select') { label = 'Próxima vaga'; dis = true; }
      else if (S.queue.length) { label = `Vaga ${S.wave} a chegar…`; dis = true; }
      else if (!canCallNext()) { label = 'Última vaga!'; dis = true; }
      else if (S.wave === 0) { label = 'Começar 1.ª vaga'; dis = false; }
      else { const b = earlyBonus(); label = `Próxima vaga (${Math.ceil(S.timer)}s)` + (b ? ` +${b}` : ''); dis = false; }
      if (nextBtn.textContent !== label) nextBtn.textContent = label;
      if (nextBtn.disabled !== dis) nextBtn.disabled = dis;
      const sp = S.speed + 'x';
      if (speedBtn.textContent !== sp) speedBtn.textContent = sp;
    }

    showSelect();

    const loop = Arcade.loop(dt => {
      if (S.phase === 'play') {
        acc += dt * S.speed;
        while (acc >= STEP) { update(STEP); acc -= STEP; }
        if (S.sel) renderPanel();
      } else acc = 0;
      render();
    });

    if (window.ARCADE_DEBUG) {
      window.towersDebug = {
        get S() { return S; }, get G() { return G; }, TOWERS, TUNE, ENEMIES, waveGroups, hpMul,
        start: startMap, build: (c, r, t) => build(c, r, t),
        upgrade: (c, r) => upgrade(towerAt(c, r)), sell: (c, r) => sell(towerAt(c, r)), next: callNext,
        sim(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && S.phase === 'play'; i++) update(STEP); return S.phase; },
      };
    }

    return {
      destroy() {
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        document.removeEventListener('visibilitychange', onVis);
        if (window.towersDebug) delete window.towersDebug;
      },
    };
  }

  Arcade.register({
    id: 'towers',
    title: 'Defesa da Torre',
    icon: '🏰',
    color: '#45aaf2',
    desc: 'Constrói torres à volta do caminho e trava 20 vagas.',
    best: () => {
      let stars = 0, wave = 0;
      MAPS.forEach((m, i) => { const r = getRec(i); stars += r.stars; wave = Math.max(wave, r.wave); });
      return stars ? `${stars}/9 ★ · vaga ${wave}` : wave ? `vaga ${wave}` : '—';
    },
    create,
  });
})();
