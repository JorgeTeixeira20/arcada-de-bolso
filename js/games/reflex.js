// Reflexos: três provas rápidas de toque — alvos que encolhem, tempo de reação e memória de sequências.
(function () {
  const TAU = Math.PI * 2;
  const PADS = ['#ff5a6e', '#ff9f43', '#ffd86b', '#26de81', '#2bcbba', '#45aaf2', '#4b7bec', '#a55eea', '#fd79a8'];
  const MODES = {
    targets: { name: 'Alvos', desc: 'Toca nos círculos antes que desapareçam.' },
    reaction: { name: 'Tempo de reação', desc: 'Espera pelo verde e toca. Média de 5.' },
    seq: { name: 'Sequência', desc: 'Memoriza as luzes e repete a ordem.' },
  };
  const TRIES = 5;

  function fmtTime(t) {
    const s = Math.floor(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function recordText(m) {
    if (m === 'targets') { const v = Arcade.store.get('reflex:targets', 0); return v ? v + ' alvos' : '—'; }
    if (m === 'reaction') { const v = Arcade.store.get('reflex:reaction', 0); return v ? v + ' ms' : '—'; }
    const v = Arcade.store.get('reflex:seq', 0); return v ? v + ' luzes' : '—';
  }

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

    let mode = null, phase = 'menu', S = null;
    let parts = [], flash = 0, flashColor = '#ff5a6e', marks = [];

    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, v = speed * (0.4 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, color });
      }
    }

    // ---------- Início de cada modo ----------
    function start(m) {
      mode = m;
      phase = 'play';
      overlay.hidden = true;
      parts = []; marks = []; flash = 0;
      if (m === 'targets') S = { t: 0, score: 0, lives: 3, targets: [], spawnT: 0.5 };
      else if (m === 'reaction') { S = { tries: [], fouls: 0, st: 'wait', waitT: 0, goAt: 0, last: 0 }; armWait(); }
      else { S = { seq: [], st: 'between', timer: 0.6, i: 0, lit: -1, idx: 0, done: 0, press: Array(9).fill(0), wrong: -1 }; extendSeq(3); }
    }

    function chooser() {
      phase = 'menu';
      const btn = m => `<button class="btn" data-m="${m}"><b>${MODES[m].name}</b><small>${MODES[m].desc}<br>Recorde: ${recordText(m)}</small></button>`;
      overlay.innerHTML = `
        <h2>Reflexos</h2>
        <p>Escolhe um modo</p>
        ${btn('targets')}${btn('reaction')}${btn('seq')}
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-m]').forEach(b => { b.onclick = () => start(b.dataset.m); });
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    // ---------- Alvos ----------
    function targetR() { return Math.max(32, Math.min(58, Math.min(view.w, view.h) * 0.11)); }
    function spawnTarget(life) {
      const R = targetR();
      const minY = top + 84 + R, maxY = view.h - R - 16;
      let x = 0, y = 0;
      for (let k = 0; k < 12; k++) {
        x = R + 10 + Math.random() * Math.max(1, view.w - 2 * R - 20);
        y = minY + Math.random() * Math.max(1, maxY - minY);
        if (S.targets.every(t => Math.hypot(t.x - x, t.y - y) > t.R + R + 6)) break;
      }
      S.targets.push({ x, y, R, age: 0, life, color: PADS[Math.floor(Math.random() * PADS.length)] });
    }
    function loseLife(x, y) {
      S.lives--;
      flash = 0.25; flashColor = '#ff5a6e';
      marks.push({ x, y, life: 0.5 });
      Arcade.buzz(40);
      if (S.lives <= 0) gameOver();
    }
    function updateTargets(dt) {
      S.t += dt;
      const interval = Math.max(0.34, 0.95 - S.t * 0.011);
      const life = Math.max(0.85, 2.2 - S.t * 0.018);
      S.spawnT -= dt;
      if (S.spawnT <= 0 && S.targets.length < 6) { spawnTarget(life); S.spawnT = interval; }
      for (const t of S.targets) t.age += dt;
      const gone = S.targets.filter(t => t.age >= t.life);
      S.targets = S.targets.filter(t => t.age < t.life);
      for (const t of gone) { if (phase === 'play') loseLife(t.x, t.y); }
    }
    function tapTargets(x, y) {
      for (let i = S.targets.length - 1; i >= 0; i--) {
        const t = S.targets[i];
        const r = t.R * (1 - t.age / t.life);
        if (Math.hypot(t.x - x, t.y - y) < r + 12) {
          S.targets.splice(i, 1);
          S.score++;
          burst(t.x, t.y, t.color, 12, 180);
          Arcade.buzz(10);
          return;
        }
      }
      loseLife(x, y);
    }

    // ---------- Tempo de reação ----------
    function armWait() {
      S.st = 'wait';
      S.waitT = 1.2 + Math.random() * 2.8;
    }
    function updateReaction(dt) {
      if (S.st === 'wait') {
        S.waitT -= dt;
        if (S.waitT <= 0) { S.st = 'go'; S.goAt = performance.now(); }
      }
    }
    function tapReaction(e) {
      if (S.st === 'wait') {
        S.fouls++;
        S.st = 'foul';
        Arcade.buzz(60);
      } else if (S.st === 'go') {
        const now = performance.now();
        let ms = e.timeStamp - S.goAt;
        if (!(ms > 0 && ms < now - S.goAt + 50)) ms = now - S.goAt;
        S.last = Math.max(1, Math.round(ms));
        S.tries.push(S.last);
        S.st = 'result';
        Arcade.buzz(10);
      } else if (S.st === 'result' || S.st === 'foul') {
        if (S.tries.length >= TRIES) gameOver();
        else armWait();
      }
    }

    // ---------- Sequência ----------
    function extendSeq(n) {
      while (S.seq.length < n) S.seq.push(Math.floor(Math.random() * 9));
    }
    function gridGeom() {
      const availH = view.h - top - 200;
      const size = Math.max(180, Math.min(view.w - 40, availH, 460));
      const gap = Math.round(size * 0.04);
      const cell = (size - 2 * gap) / 3;
      const x0 = (view.w - size) / 2;
      const y0 = top + 110 + Math.max(0, (availH - size) / 2);
      return { size, gap, cell, x0, y0 };
    }
    function padAt(x, y) {
      const g = gridGeom();
      for (let i = 0; i < 9; i++) {
        const px = g.x0 + (i % 3) * (g.cell + g.gap), py = g.y0 + Math.floor(i / 3) * (g.cell + g.gap);
        if (x >= px && x <= px + g.cell && y >= py && y <= py + g.cell) return i;
      }
      return -1;
    }
    function updateSeq(dt) {
      for (let i = 0; i < 9; i++) if (S.press[i] > 0) S.press[i] -= dt;
      if (S.st === 'between') {
        S.timer -= dt;
        if (S.timer <= 0) { S.st = 'show'; S.i = 0; S.lit = -1; S.timer = 0.35; }
      } else if (S.st === 'show') {
        S.timer -= dt;
        if (S.timer > 0) return;
        const on = Math.max(0.28, 0.55 - S.seq.length * 0.02), off = 0.16;
        if (S.lit >= 0) { S.lit = -1; S.i++; S.timer = off; }
        else if (S.i < S.seq.length) { S.lit = S.seq[S.i]; S.timer = on; }
        else { S.st = 'input'; S.idx = 0; }
      } else if (S.st === 'fail') {
        S.timer -= dt;
        if (S.timer <= 0) gameOver();
      }
    }
    function tapSeq(x, y) {
      if (S.st !== 'input') return;
      const p = padAt(x, y);
      if (p < 0) return;
      S.press[p] = 0.22;
      if (p === S.seq[S.idx]) {
        S.idx++;
        Arcade.buzz(8);
        if (S.idx >= S.seq.length) {
          S.done = S.seq.length;
          S.st = 'between';
          S.timer = 0.8;
          const g = gridGeom();
          burst(g.x0 + g.size / 2, g.y0 + g.size / 2, '#26de81', 18, 220);
          extendSeq(S.seq.length + 1);
        }
      } else {
        S.wrong = p;
        S.st = 'fail';
        S.timer = 1.2;
        flash = 0.3; flashColor = '#ff5a6e';
        Arcade.buzz(80);
      }
    }

    // ---------- Entrada ----------
    function onDown(e) {
      if (phase !== 'play') return;
      e.preventDefault();
      const x = e.clientX, y = e.clientY;
      if (mode === 'targets') tapTargets(x, y);
      else if (mode === 'reaction') tapReaction(e);
      else tapSeq(x, y);
    }
    canvas.addEventListener('pointerdown', onDown);

    // ---------- Ecrãs ----------
    function gameOver() {
      phase = 'over';
      let title, sub, stats;
      if (mode === 'targets') {
        const best = Arcade.store.get('reflex:targets', 0);
        const rec = S.score > best;
        if (rec) Arcade.store.set('reflex:targets', S.score);
        title = rec ? 'Novo recorde!' : 'Sem vidas';
        sub = rec ? 'Alvos' : `Recorde: ${best} alvos`;
        stats = [[S.score, 'alvos'], [fmtTime(S.t), 'tempo'], [Math.max(best, S.score), 'recorde']];
      } else if (mode === 'reaction') {
        const avg = Math.round(S.tries.reduce((a, b) => a + b, 0) / S.tries.length);
        const best = Arcade.store.get('reflex:reaction', 0);
        const rec = !best || avg < best;
        if (rec) Arcade.store.set('reflex:reaction', avg);
        title = rec ? 'Novo recorde!' : 'Resultado';
        sub = (rec ? 'Tempo de reação' : `Recorde: ${best} ms`) + ` · ${S.tries.join(' / ')} ms`;
        stats = [[avg + ' ms', 'média'], [Math.min(...S.tries) + ' ms', 'melhor'], [S.fouls, S.fouls === 1 ? 'falta' : 'faltas']];
      } else {
        const best = Arcade.store.get('reflex:seq', 0);
        const rec = S.done > best;
        if (rec) Arcade.store.set('reflex:seq', S.done);
        title = rec ? 'Novo recorde!' : 'Erraste';
        sub = rec ? 'Sequência' : `Recorde: ${best} luzes`;
        stats = [[S.done, 'luzes'], [Math.max(0, S.done - 2), 'rondas'], [Math.max(best, S.done), 'recorde']];
      }
      overlay.innerHTML = `
        <h2>${title}</h2>
        <p>${sub}</p>
        <div class="stats">${stats.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('')}</div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="mode">Mudar de modo</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=again]').onclick = () => start(mode);
      overlay.querySelector('[data-a=mode]').onclick = chooser;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function pause() {
      if (phase !== 'play') return;
      phase = 'paused';
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${MODES[mode].name}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="mode">Mudar de modo</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => {
        overlay.hidden = true;
        phase = 'play';
        // Uma tentativa interrompida não conta
        if (mode === 'reaction' && (S.st === 'wait' || S.st === 'go')) armWait();
      };
      overlay.querySelector('[data-a=restart]').onclick = () => start(mode);
      overlay.querySelector('[data-a=mode]').onclick = chooser;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Desenho ----------
    function text(str, x, y, size, color, weight = 700, align = 'center') {
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px system-ui, sans-serif`;
      ctx.textAlign = align;
      ctx.fillText(str, x, y);
    }

    function drawHeart(x, y, s, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(x, y + s * 0.35);
      ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
      ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
      ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.35);
      ctx.fill();
    }

    function renderTargets() {
      const { w } = view;
      for (const t of S.targets) {
        const k = 1 - t.age / t.life;
        const r = Math.max(0, t.R * k);
        ctx.strokeStyle = 'rgba(255,255,255,.14)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.R, 0, TAU); ctx.stroke();
        ctx.fillStyle = t.color;
        ctx.beginPath(); ctx.arc(t.x, t.y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#0f1020';
        ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.55, 0, TAU); ctx.fill();
        ctx.fillStyle = t.color;
        ctx.beginPath(); ctx.arc(t.x, t.y, r * 0.25, 0, TAU); ctx.fill();
      }
      for (const m of marks) {
        ctx.strokeStyle = `rgba(255,90,110,${Math.min(1, m.life * 2)})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(m.x - 10, m.y - 10); ctx.lineTo(m.x + 10, m.y + 10);
        ctx.moveTo(m.x + 10, m.y - 10); ctx.lineTo(m.x - 10, m.y + 10);
        ctx.stroke();
      }
      ctx.textBaseline = 'top';
      text(String(S.score), 16, top + 22, 30, '#eef0ff', 800, 'left');
      text(`alvos · recorde ${Arcade.store.get('reflex:targets', 0)}`, 16, top + 56, 13, '#9aa0c8', 500, 'left');
      for (let i = 0; i < 3; i++) drawHeart(w / 2 - 30 + i * 30, top + 30, 22, i < S.lives ? '#ff5a6e' : 'rgba(255,255,255,.14)');
    }

    function renderReaction() {
      const { w, h } = view;
      const bg = { wait: '#9b2c3e', go: '#1fbf6f', result: '#1a1c33', foul: '#c4661f' }[S.st];
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const cy = h / 2;
      ctx.textBaseline = 'middle';
      if (S.st === 'wait') {
        text('Espera pelo verde…', w / 2, cy, 26, '#fff');
        text('Não toques ainda', w / 2, cy + 36, 15, 'rgba(255,255,255,.7)', 500);
      } else if (S.st === 'go') {
        text('TOCA!', w / 2, cy, 64, '#fff', 900);
      } else if (S.st === 'result') {
        text(S.last + ' ms', w / 2, cy - 10, 56, '#ffcc4d', 900);
        const more = S.tries.length >= TRIES ? 'Toca para ver o resultado' : 'Toca para continuar';
        text(more, w / 2, cy + 44, 15, '#9aa0c8', 500);
      } else {
        text('Cedo demais!', w / 2, cy - 10, 36, '#fff', 900);
        text('Falta. Toca para repetir', w / 2, cy + 34, 15, 'rgba(255,255,255,.8)', 500);
      }
      // Progresso
      ctx.textBaseline = 'top';
      text(`Tentativa ${Math.min(TRIES, S.tries.length + (S.st === 'result' ? 0 : 1))} de ${TRIES}`, 16, top + 24, 17, '#fff', 700, 'left');
      text(`faltas: ${S.fouls} · recorde ${recordText('reaction')}`, 16, top + 48, 13, 'rgba(255,255,255,.7)', 500, 'left');
      for (let i = 0; i < TRIES; i++) {
        ctx.fillStyle = i < S.tries.length ? '#ffcc4d' : 'rgba(255,255,255,.25)';
        ctx.beginPath(); ctx.arc(w / 2 - 48 + i * 24, h - 60, 7, 0, TAU); ctx.fill();
      }
      if (S.tries.length) {
        ctx.textBaseline = 'top';
        text(S.tries.map(t => t + '').join('  ·  ') + ' ms', w / 2, h - 44, 13, 'rgba(255,255,255,.7)', 500);
      }
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function renderSeq() {
      const { w } = view;
      const g = gridGeom();
      for (let i = 0; i < 9; i++) {
        const px = g.x0 + (i % 3) * (g.cell + g.gap), py = g.y0 + Math.floor(i / 3) * (g.cell + g.gap);
        const lit = S.lit === i || S.press[i] > 0 || (S.st === 'fail' && i === S.seq[S.idx]);
        ctx.globalAlpha = lit ? 1 : 0.22;
        ctx.fillStyle = S.st === 'fail' && i === S.wrong ? '#ffffff' : PADS[i];
        roundRect(px, py, g.cell, g.cell, g.cell * 0.18);
        ctx.fill();
        if (lit) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#fff';
          roundRect(px + g.cell * 0.15, py + g.cell * 0.15, g.cell * 0.7, g.cell * 0.7, g.cell * 0.12);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      ctx.textBaseline = 'top';
      text(String(S.seq.length), 16, top + 22, 30, '#eef0ff', 800, 'left');
      text(`luzes · recorde ${Arcade.store.get('reflex:seq', 0)}`, 16, top + 56, 13, '#9aa0c8', 500, 'left');
      let status = '';
      if (S.st === 'show') status = 'Observa…';
      else if (S.st === 'input') status = `A tua vez · ${S.idx}/${S.seq.length}`;
      else if (S.st === 'fail') status = 'Errado!';
      else status = S.done ? 'Boa!' : 'Prepara-te…';
      text(status, w / 2, g.y0 + g.size + 22, 20, S.st === 'fail' ? '#ff5a6e' : S.st === 'input' ? '#ffcc4d' : '#eef0ff');
    }

    function update(dt) {
      if (flash > 0) flash -= dt;
      for (const m of marks) m.life -= dt;
      marks = marks.filter(m => m.life > 0);
      for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; q.life -= dt; }
      parts = parts.filter(q => q.life > 0);
      if (phase !== 'play') return;
      if (mode === 'targets') updateTargets(dt);
      else if (mode === 'reaction') updateReaction(dt);
      else updateSeq(dt);
    }

    function render() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      if (S && mode) {
        if (mode === 'targets') renderTargets();
        else if (mode === 'reaction') renderReaction();
        else renderSeq();
      }
      for (const q of parts) {
        ctx.globalAlpha = Math.min(1, q.life * 2.5);
        ctx.fillStyle = q.color;
        ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
      }
      ctx.globalAlpha = 1;
      if (flash > 0) {
        ctx.fillStyle = flashColor;
        ctx.globalAlpha = Math.min(0.35, flash);
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }

    chooser();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        document.removeEventListener('visibilitychange', onVis);
      },
    };
  }

  Arcade.register({
    id: 'reflex',
    title: 'Reflexos',
    icon: '⚡',
    color: '#ffd86b',
    desc: 'Alvos, tempo de reação e sequências: põe os dedos à prova.',
    best: () => {
      const t = Arcade.store.get('reflex:targets', 0), r = Arcade.store.get('reflex:reaction', 0), s = Arcade.store.get('reflex:seq', 0);
      const out = [];
      if (t) out.push(t + ' alvos');
      if (r) out.push(r + ' ms');
      if (s) out.push('seq. ' + s);
      return out.length ? out.join(' · ') : '—';
    },
    create,
  });
})();
