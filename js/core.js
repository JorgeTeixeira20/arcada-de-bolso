// Peças partilhadas por todos os mini-jogos: registo, gravação, canvas, ciclo de jogo e joystick.
window.Arcade = (function () {
  const games = [];

  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('arcada:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('arcada:' + key, JSON.stringify(value)); } catch {}
    },
  };

  // Canvas nítido em ecrãs retina; desenha-se sempre em píxeis CSS.
  function setupCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const view = { w: 0, h: 0 };
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      view.w = r.width; view.h = r.height;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);
    return { ctx, view, dispose() { window.removeEventListener('resize', resize); } };
  }

  // Altura da "notch" / barra de estado, para o HUD não ficar escondido.
  function safeTop() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top);visibility:hidden';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    probe.remove();
    return h;
  }

  function loop(step) {
    let last = performance.now(), id = 0, running = true;
    function frame(t) {
      if (!running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      step(dt);
      id = requestAnimationFrame(frame);
    }
    id = requestAnimationFrame(frame);
    return { stop() { running = false; cancelAnimationFrame(id); } };
  }

  // Joystick flutuante: toca em qualquer sítio e arrasta. WASD/setas também funcionam (para testar no PC).
  function joystick(el, radius = 55) {
    const j = { active: false, ox: 0, oy: 0, px: 0, py: 0, radius, id: null };
    let tx = 0, ty = 0;
    const keys = new Set();

    function down(e) {
      if (j.id !== null) return;
      j.id = e.pointerId; j.active = true;
      j.ox = j.px = e.clientX; j.oy = j.py = e.clientY;
      tx = ty = 0;
    }
    function move(e) {
      if (e.pointerId !== j.id) return;
      j.px = e.clientX; j.py = e.clientY;
      let dx = j.px - j.ox, dy = j.py - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > radius) { // a base segue o dedo
        j.ox = j.px - dx / d * radius; j.oy = j.py - dy / d * radius;
        dx = j.px - j.ox; dy = j.py - j.oy;
      }
      tx = dx / radius; ty = dy / radius;
    }
    function up(e) {
      if (e.pointerId !== j.id) return;
      j.id = null; j.active = false; tx = ty = 0;
    }
    const kd = e => keys.add(e.key.toLowerCase());
    const ku = e => keys.delete(e.key.toLowerCase());

    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);

    j.vec = function () {
      let x = tx, y = ty;
      if (keys.has('a') || keys.has('arrowleft')) x -= 1;
      if (keys.has('d') || keys.has('arrowright')) x += 1;
      if (keys.has('w') || keys.has('arrowup')) y -= 1;
      if (keys.has('s') || keys.has('arrowdown')) y += 1;
      const m = Math.hypot(x, y);
      return m > 1 ? { x: x / m, y: y / m } : { x, y };
    };
    j.draw = function (ctx) {
      if (!j.active) return;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(j.ox, j.oy, radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(j.ox + tx * radius, j.oy + ty * radius, 24, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };
    j.reset = function () { j.id = null; j.active = false; tx = ty = 0; keys.clear(); };
    j.dispose = function () {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
    return j;
  }

  function buzz(ms) {
    try { navigator.vibrate && navigator.vibrate(ms); } catch {}
  }

  return { games, register: g => games.push(g), store, setupCanvas, safeTop, loop, joystick, buzz };
})();
