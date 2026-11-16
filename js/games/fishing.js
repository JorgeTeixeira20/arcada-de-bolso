// Pesca: lança, espera que pique e puxa sem partir a linha. Coleção de espécies, venda e melhorias.
(function () {
  const TAU = Math.PI * 2;
  const SAVE_KEY = 'fishing:save', BEST_KEY = 'fishing:best';
  const MIN_PER_SEC = 3; // 1 hora de jogo = 20 s

  const RAR = {
    c: { name: 'Comum', col: '#c3c8e8', w: 60 },
    u: { name: 'Incomum', col: '#26de81', w: 26 },
    r: { name: 'Raro', col: '#45aaf2', w: 9 },
    l: { name: 'Lendário', col: '#ffcc4d', w: 2.2 },
  };

  // when: 'any' | 'day' | 'night'; rain: gosta de chuva; v: valor por kg; d: dificuldade 0..1
  const LOCS = [
    {
      id: 'lake', name: 'Lago', cost: 0, desc: 'Águas calmas, ideal para começar.',
      water: [30, 105, 130], fish: [
        { id: 'perca', name: 'Perca', r: 'c', min: 0.1, max: 0.9, v: 14, col: '#a3cb38', when: 'any', d: 0.25 },
        { id: 'carpa', name: 'Carpa', r: 'c', min: 1, max: 9, v: 5, col: '#c8a165', when: 'any', d: 0.45 },
        { id: 'bota', name: 'Bota velha', r: 'c', min: 0.4, max: 1.2, v: 1, col: '#7a5240', when: 'any', d: 0.05, shape: 'boot', junk: true },
        { id: 'tenca', name: 'Tenca', r: 'u', min: 0.5, max: 3, v: 12, col: '#6ab04c', when: 'any', d: 0.35, rain: true },
        { id: 'achiga', name: 'Achigã', r: 'u', min: 0.5, max: 4, v: 14, col: '#5f8f3e', when: 'day', d: 0.55 },
        { id: 'enguia', name: 'Enguia', r: 'u', min: 0.3, max: 2.5, v: 20, col: '#7d7a8c', when: 'night', d: 0.5, shape: 'eel' },
        { id: 'lucio', name: 'Lúcio', r: 'r', min: 2, max: 14, v: 10, col: '#8fbf47', when: 'day', d: 0.7, shape: 'long' },
        { id: 'gato', name: 'Peixe-gato', r: 'r', min: 1, max: 12, v: 11, col: '#9c8670', when: 'night', d: 0.6 },
        { id: 'koi', name: 'Carpa-dourada', r: 'l', min: 3, max: 12, v: 30, col: '#ffb142', when: 'any', d: 0.8 },
      ],
    },
    {
      id: 'river', name: 'Rio', cost: 250, desc: 'Corrente viva e peixes mais lutadores.',
      water: [40, 120, 110], fish: [
        { id: 'boga', name: 'Boga', r: 'c', min: 0.1, max: 0.6, v: 18, col: '#b8c6db', when: 'any', d: 0.3 },
        { id: 'barbo', name: 'Barbo', r: 'c', min: 0.5, max: 5, v: 7, col: '#b0905f', when: 'any', d: 0.45 },
        { id: 'escalo', name: 'Escalo', r: 'c', min: 0.2, max: 1.5, v: 12, col: '#95a5a6', when: 'any', d: 0.35 },
        { id: 'lata', name: 'Lata ferrugenta', r: 'c', min: 0.1, max: 0.4, v: 2, col: '#b5651d', when: 'any', d: 0.05, shape: 'can', junk: true },
        { id: 'truta', name: 'Truta-arco-íris', r: 'u', min: 0.4, max: 4, v: 16, col: '#ff8fab', when: 'day', d: 0.55 },
        { id: 'savel', name: 'Sável', r: 'u', min: 1, max: 3.5, v: 15, col: '#c7ecee', when: 'any', d: 0.5, rain: true },
        { id: 'fario', name: 'Truta-fário', r: 'r', min: 0.3, max: 3, v: 30, col: '#e1701a', when: 'day', d: 0.62 },
        { id: 'lampreia', name: 'Lampreia', r: 'r', min: 0.5, max: 2, v: 35, col: '#6c7a89', when: 'night', d: 0.65, shape: 'eel' },
        { id: 'salmao', name: 'Salmão', r: 'l', min: 3, max: 15, v: 12, col: '#fa8231', when: 'any', d: 0.85, rain: true },
        { id: 'siluro', name: 'Siluro', r: 'l', min: 10, max: 60, v: 4, col: '#5a5a48', when: 'night', d: 0.9, shape: 'long' },
      ],
    },
    {
      id: 'sea', name: 'Mar', cost: 800, desc: 'Ondas, peixes grandes e monstros das profundezas.',
      water: [20, 80, 150], fish: [
        { id: 'sardinha', name: 'Sardinha', r: 'c', min: 0.05, max: 0.2, v: 60, col: '#aab7cf', when: 'any', d: 0.3 },
        { id: 'carapau', name: 'Carapau', r: 'c', min: 0.1, max: 0.6, v: 25, col: '#8395a7', when: 'any', d: 0.35 },
        { id: 'sargo', name: 'Sargo', r: 'c', min: 0.3, max: 2, v: 18, col: '#dcdde1', when: 'any', d: 0.45 },
        { id: 'douradam', name: 'Dourada', r: 'u', min: 0.5, max: 3, v: 20, col: '#f6e58d', when: 'day', d: 0.5 },
        { id: 'robalo', name: 'Robalo', r: 'u', min: 1, max: 8, v: 14, col: '#a4b0be', when: 'any', d: 0.6, rain: true },
        { id: 'polvo', name: 'Polvo', r: 'u', min: 1, max: 6, v: 12, col: '#e17055', when: 'night', d: 0.55, shape: 'octo' },
        { id: 'choco', name: 'Choco', r: 'u', min: 0.5, max: 3, v: 14, col: '#d1b9a5', when: 'night', d: 0.45, shape: 'squid' },
        { id: 'pargo', name: 'Pargo', r: 'r', min: 1, max: 9, v: 16, col: '#ff6b81', when: 'any', d: 0.7 },
        { id: 'atum', name: 'Atum', r: 'l', min: 20, max: 120, v: 3.5, col: '#3c4a8a', when: 'day', d: 0.95 },
        { id: 'espadarte', name: 'Espadarte', r: 'l', min: 30, max: 150, v: 3, col: '#5d6d7e', when: 'night', d: 0.95, shape: 'sword' },
      ],
    },
  ];
  const ALL = LOCS.flatMap(l => l.fish);

  const UPG = [
    { id: 'rod', name: 'Cana', desc: 'Zona do peixe maior e lançamentos mais longos', cost: [80, 220, 520, 1100] },
    { id: 'reel', name: 'Carreto', desc: 'Puxas mais depressa e a linha aguenta mais tensão', cost: [60, 180, 450, 1000] },
    { id: 'bait', name: 'Isco', desc: 'Picam mais depressa e aparecem mais peixes raros', cost: [40, 140, 380, 900] },
  ];
  const MAXLV = 4;

  const fmtKg = w => w < 1 ? Math.round(w * 1000) + ' g' : w.toFixed(w < 10 ? 2 : 1).replace('.', ',') + ' kg';
  const fmtTime = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

  function freshSave() {
    return { v: 1, money: 0, rod: 0, reel: 0, bait: 0, unlocked: { lake: true }, loc: 'lake', time: 9 * 60, rain: 0, coll: {}, total: 0, sound: true };
  }
  function loadSave() {
    const s = Arcade.store.get(SAVE_KEY, null);
    if (!s || s.v !== 1) return freshSave();
    return { ...freshSave(), ...s };
  }

  // Desenho genérico de peixes (e afins) virado para a direita, centrado em (x, y), com comprimento len.
  function drawFish(ctx, x, y, len, f, t = 0) {
    const col = f.col, sh = f.shape || 'fish';
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    const eye = (ex, ey, r) => {
      ctx.fillStyle = '#0f1020'; ctx.beginPath(); ctx.arc(ex, ey, r, 0, TAU); ctx.fill(); ctx.fillStyle = col;
    };
    if (sh === 'boot') {
      ctx.beginPath();
      ctx.moveTo(-len * 0.2, -len * 0.4); ctx.lineTo(len * 0.12, -len * 0.4); ctx.lineTo(len * 0.12, len * 0.05);
      ctx.lineTo(len * 0.45, len * 0.12); ctx.lineTo(len * 0.45, len * 0.32); ctx.lineTo(-len * 0.2, len * 0.32); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3e2a20'; ctx.fillRect(-len * 0.22, len * 0.28, len * 0.7, len * 0.08);
    } else if (sh === 'can') {
      ctx.fillRect(-len * 0.18, -len * 0.3, len * 0.36, len * 0.6);
      ctx.fillStyle = '#7f4a14'; ctx.fillRect(-len * 0.18, -len * 0.08, len * 0.36, len * 0.14);
      ctx.fillStyle = '#ddd'; ctx.fillRect(-len * 0.18, -len * 0.32, len * 0.36, len * 0.04);
    } else if (sh === 'octo' || sh === 'squid') {
      const n = sh === 'octo' ? 8 : 6;
      ctx.lineWidth = Math.max(2, len * 0.06); ctx.lineCap = 'round';
      for (let k = 0; k < n; k++) {
        const yy = (k / (n - 1) - 0.5) * len * 0.35;
        ctx.beginPath(); ctx.moveTo(-len * 0.05, yy * 0.6);
        ctx.quadraticCurveTo(-len * 0.3, yy + Math.sin(t * 4 + k) * len * 0.05, -len * 0.5, yy * 1.3);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(len * 0.15, 0, len * (sh === 'octo' ? 0.25 : 0.32), len * (sh === 'octo' ? 0.22 : 0.15), 0, 0, TAU); ctx.fill();
      if (sh === 'squid') { ctx.beginPath(); ctx.moveTo(len * 0.4, 0); ctx.lineTo(len * 0.5, -len * 0.12); ctx.lineTo(len * 0.5, len * 0.12); ctx.fill(); }
      eye(len * 0.05, -len * 0.06, Math.max(1.5, len * 0.035));
    } else if (sh === 'eel') {
      ctx.lineWidth = len * 0.12; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 12; k++) {
        const u = k / 12, xx = lerp(-len / 2, len / 2, u), yy = Math.sin(u * 5 + t * 5) * len * 0.07 * (1 - u * 0.6);
        k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
      }
      ctx.stroke();
      eye(len * 0.44, -len * 0.02, Math.max(1.2, len * 0.025));
    } else {
      const bodyH = sh === 'long' ? 0.17 : sh === 'sword' ? 0.2 : 0.27;
      const sw = Math.sin(t * 6) * len * 0.04;
      // cauda
      ctx.beginPath();
      ctx.moveTo(-len * 0.32, 0); ctx.lineTo(-len * 0.5, -len * 0.18 + sw); ctx.lineTo(-len * 0.5, len * 0.18 + sw); ctx.closePath(); ctx.fill();
      // corpo
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.36, len * bodyH, 0, 0, TAU); ctx.fill();
      // barbatana
      ctx.beginPath(); ctx.moveTo(-len * 0.08, -len * bodyH * 0.9); ctx.lineTo(len * 0.06, -len * bodyH * 1.6); ctx.lineTo(len * 0.14, -len * bodyH * 0.85); ctx.fill();
      if (sh === 'sword') { ctx.beginPath(); ctx.moveTo(len * 0.32, -len * 0.03); ctx.lineTo(len * 0.62, 0); ctx.lineTo(len * 0.32, len * 0.03); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath(); ctx.ellipse(len * 0.02, len * bodyH * 0.35, len * 0.26, len * bodyH * 0.35, 0, 0, TAU); ctx.fill();
      eye(len * 0.22, -len * bodyH * 0.25, Math.max(1.5, len * 0.035));
    }
    ctx.restore();
  }

  // ---------- Som (WebAudio, opcional) ----------
  function makeAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    let ac;
    try { ac = new AC(); } catch { return null; }
    const master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
    const len = ac.sampleRate * 2;
    const brown = ac.createBuffer(1, len, ac.sampleRate), white = ac.createBuffer(1, len, ac.sampleRate);
    { const d = brown.getChannelData(0); let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } }
    { const d = white.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1; }
    const loopSrc = buf => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    // água: ruído castanho filtrado, com ondulação lenta
    const water = loopSrc(brown), wf = ac.createBiquadFilter(), wg = ac.createGain();
    wf.type = 'lowpass'; wf.frequency.value = 500; wg.gain.value = 0.25;
    water.connect(wf); wf.connect(wg); wg.connect(master);
    const lfo = ac.createOscillator(), lfoG = ac.createGain();
    lfo.frequency.value = 0.15; lfoG.gain.value = 0.12; lfo.connect(lfoG); lfoG.connect(wg.gain); lfo.start();
    // chuva
    const rain = loopSrc(white), rf = ac.createBiquadFilter(), rg = ac.createGain();
    rf.type = 'highpass'; rf.frequency.value = 2500; rg.gain.value = 0;
    rain.connect(rf); rf.connect(rg); rg.connect(master);

    function blip(freq, dur, type = 'sine', vol = 0.15, to) {
      const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function splash(vol = 0.35) {
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime;
      s.buffer = white; f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + 0.5);
    }
    return {
      ac,
      setLoc(id) {
        const t = ac.currentTime;
        wf.frequency.setTargetAtTime(id === 'river' ? 950 : id === 'sea' ? 420 : 520, t, 0.5);
        lfo.frequency.setTargetAtTime(id === 'river' ? 0.4 : id === 'sea' ? 0.09 : 0.15, t, 0.5);
        lfoG.gain.setTargetAtTime(id === 'sea' ? 0.22 : id === 'river' ? 0.05 : 0.1, t, 0.5);
      },
      setRain(on) { rg.gain.setTargetAtTime(on ? 0.05 : 0, ac.currentTime, 1); },
      splash, blip,
      tick() { blip(2200, 0.03, 'square', 0.025); },
      chime() { [660, 880, 1320].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'triangle', 0.12), i * 110)); },
      suspend() { try { ac.suspend(); } catch {} },
      resume() { try { ac.resume(); } catch {} },
      close() { try { ac.close(); } catch {} },
    };
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

    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;z-index:2;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);display:flex;gap:8px';
    bar.innerHTML = ['book:Caderno', 'shop:Loja', 'map:Local', 'snd:Som'].map(s => {
      const [a, t] = s.split(':');
      return `<button class="btn center" data-a="${a}" style="flex:1;padding:12px 4px;font-size:14px;min-height:48px;background:rgba(26,28,51,.88)">${t}</button>`;
    }).join('');
    root.appendChild(bar);
    const sndBtn = bar.querySelector('[data-a=snd]');

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    let P = loadSave();
    let audio = null;
    const loc = () => LOCS.find(l => l.id === P.loc) || LOCS[0];

    // Estado da pesca (efémero)
    let phase = 'idle';      // idle, charge, fly, wait, bite, reel, menu, paused
    let resumePhase = 'idle';
    let holding = false, holdId = null;
    let chargeT = 0, power = 0;
    let fly = null, bob = null;      // bobber: {x, y, sx, sy}
    let waitT = 0, nibT = 0, nib = 0, biteT = 0;
    let hooked = null, rl = null;
    let toast = null, ripples = [], drops = [], saveT = 10, tickT = 0, clock = 0, lastHour = Math.floor(P.time / 60);
    const shadows = [];
    for (let i = 0; i < 4; i++) shadows.push({ x: Math.random(), y: Math.random(), vx: (Math.random() < 0.5 ? -1 : 1) * (0.02 + Math.random() * 0.03), s: 0.6 + Math.random() * 0.6 });

    function save() {
      Arcade.store.set(SAVE_KEY, P);
      Arcade.store.set(BEST_KEY, Object.keys(P.coll).length);
    }

    const isNight = () => { const hh = P.time / 60; return hh >= 20 || hh < 6; };
    function nightK() { // 0 = dia, 1 = noite, com transições ao amanhecer/anoitecer
      const hh = P.time / 60;
      if (hh >= 7 && hh < 18.5) return 0;
      if (hh >= 21 || hh < 5) return 1;
      if (hh >= 18.5) return (hh - 18.5) / 2.5;
      return 1 - (hh - 5) / 2;
    }

    function geom() {
      const w = view.w, h = view.h;
      const horizon = Math.max(top + 190, h * 0.33);
      const shore = h - 128;
      const tip = { x: w * 0.6, y: shore - 70 };
      return { w, h, horizon, shore, tip };
    }
    const maxDist = () => 0.62 + P.rod * 0.095;
    const distToY = (g, d) => g.shore - 30 - d * (g.shore - 30 - g.horizon - 14);

    function say(text, color, t = 2.2) { toast = { text, color: color || '#eef0ff', t }; }

    // ---------- Som ----------
    function ensureAudio() {
      if (!P.sound) return;
      if (!audio) { audio = makeAudio(); if (audio) { audio.setLoc(P.loc); audio.setRain(P.rain > 0); } }
      else audio.resume();
    }
    function updateSndBtn() { sndBtn.textContent = P.sound ? 'Som: sim' : 'Som: não'; }
    updateSndBtn();
    sndBtn.onclick = () => {
      P.sound = !P.sound; save(); updateSndBtn();
      if (P.sound) ensureAudio(); else if (audio) audio.suspend();
    };
    const sfx = (name, ...a) => { if (audio && P.sound) audio[name](...a); };

    // ---------- Peixes ----------
    function pickFish(dist) {
      const night = isNight(), rain = P.rain > 0;
      const list = loc().fish.filter(f => f.when === 'any' || (f.when === 'night') === night);
      const mul = { c: 1.2 - dist * 0.45, u: 1 + P.bait * 0.15, r: (1 + P.bait * 0.35) * (0.55 + dist * 0.9), l: (1 + P.bait * 0.6) * (0.4 + dist * 1.1) };
      const ws = list.map(f => RAR[f.r].w * mul[f.r] * (f.junk ? 0.35 : 1) * (rain && f.rain ? 2.5 : 1));
      let r = Math.random() * ws.reduce((a, b) => a + b, 0), f = list[0];
      for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) { f = list[i]; break; } }
      const skew = Math.max(0.8, 2.4 - dist * 1.0 - P.rod * 0.12);
      const wt = f.min + (f.max - f.min) * Math.pow(Math.random(), skew);
      const d = Math.min(1, f.d * 0.8 + 0.2 * (wt - f.min) / (f.max - f.min || 1));
      return { f, w: Math.round(wt * 1000) / 1000, d };
    }
    const valueOf = c => Math.max(1, Math.round(2 + c.f.v * c.w * (c.f.r === 'l' ? 1.6 : c.f.r === 'r' ? 1.25 : 1)));

    // ---------- Ações ----------
    function startCharge() { phase = 'charge'; chargeT = 0; power = 0; }
    function cast() {
      const g = geom();
      const d = Math.max(0.08, power) * maxDist();
      const tx = g.w * 0.5 + (Math.random() - 0.5) * g.w * 0.35;
      fly = { t: 0, d, sx: g.tip.x, sy: g.tip.y, tx, ty: distToY(g, d) };
      phase = 'fly';
      sfx('blip', 500, 0.25, 'sine', 0.05, 1500);
    }
    function land() {
      bob = { x: fly.tx, y: fly.ty, d: fly.d };
      ripples.push({ x: bob.x, y: bob.y, t: 0 });
      sfx('splash', 0.3);
      phase = 'wait';
      const k = (1 - P.bait * 0.12) * (P.rain > 0 ? 0.7 : 1) * (isNight() ? 0.9 : 1);
      waitT = (3.5 + Math.random() * 7) * k;
      nibT = 0.8 + Math.random() * 2;
      nib = 0;
    }
    function reelIn(msg) {
      phase = 'idle'; bob = null; hooked = null; rl = null;
      if (msg) say(msg);
    }
    function bite() {
      hooked = pickFish(bob.d);
      phase = 'bite';
      biteT = 1.0 + P.bait * 0.1;
      ripples.push({ x: bob.x, y: bob.y, t: 0 }, { x: bob.x, y: bob.y, t: -0.15 });
      sfx('blip', 320, 0.18, 'sine', 0.2, 110);
      Arcade.buzz(40);
    }
    function hook() {
      const d = hooked.d;
      rl = {
        needle: 0.3, nv: 0, zone: 0.5, zt: 0.5, zw: Math.max(0.12, 0.27 + P.rod * 0.035 - d * 0.12),
        retarget: 0.5, prog: 0.3, tension: 0, surge: 0, surgeT: 2.5 + Math.random() * 3, t: 0,
        sx: bob.x, sy: bob.y,
      };
      phase = 'reel';
      Arcade.buzz(20);
    }
    function lose(msg, color) {
      say(msg, color || '#ff9f9f');
      Arcade.buzz(80);
      reelIn();
    }

    function caught() {
      const c = hooked, f = c.f;
      const prev = P.coll[f.id];
      const isNew = !prev;
      const record = prev && c.w > prev.max;
      P.coll[f.id] = { n: (prev ? prev.n : 0) + 1, max: Math.max(prev ? prev.max : 0, c.w) };
      P.total++;
      save();
      sfx('chime');
      Arcade.buzz([30, 50, 30]);
      reelIn();
      phase = 'menu';
      const val = valueOf(c);
      overlay.innerHTML = `
        <h2>${isNew ? 'Nova espécie!' : record ? 'Novo recorde de peso!' : 'Apanhaste!'}</h2>
        <canvas width="440" height="200" style="position:static;display:block;width:220px;height:100px"></canvas>
        <p style="color:${RAR[f.r].col};font-weight:700;margin:0">${f.name} · ${RAR[f.r].name}</p>
        <div class="stats">
          <div><b>${fmtKg(c.w)}</b><span>peso</span></div>
          <div><b>${val} €</b><span>valor</span></div>
          <div><b>${fmtKg(P.coll[f.id].max)}</b><span>recorde</span></div>
        </div>
        <button class="btn primary" data-a="sell">Vender (+${val} €)</button>
        <button class="btn center" data-a="free">Soltar</button>`;
      const cv = overlay.querySelector('canvas').getContext('2d');
      cv.scale(2, 2);
      drawFish(cv, 110, 52, 150, f, 0.3);
      overlay.hidden = false;
      // Ignora toques logo a seguir à captura (o dedo ainda estava a puxar a linha).
      const opened = performance.now(), ready = () => performance.now() - opened > 700;
      overlay.querySelector('[data-a=sell]').onclick = () => { if (!ready()) return; P.money += val; save(); closeMenu(); say(`+${val} €`, '#ffcc4d', 1.5); };
      overlay.querySelector('[data-a=free]').onclick = () => { if (!ready()) return; closeMenu(); say('Voltou para a água', '#9aa0c8', 1.5); };
    }

    function closeMenu() { overlay.hidden = true; phase = 'idle'; }

    // ---------- Ecrãs ----------
    function openMenu() {
      if (phase === 'reel' || phase === 'bite' || phase === 'menu' || phase === 'paused') return false;
      if (phase === 'wait' || phase === 'fly' || phase === 'charge') reelIn();
      holding = false; holdId = null;
      phase = 'menu';
      return true;
    }

    function showBook(locId) {
      const L = LOCS.find(l => l.id === (locId || P.loc));
      const n = Object.keys(P.coll).length;
      const rows = L.fish.map(f => {
        const c = P.coll[f.id];
        const when = f.when === 'night' ? 'noite' : f.when === 'day' ? 'dia' : 'sempre';
        return `<div style="display:flex;align-items:center;gap:10px;background:#1a1c33;border-radius:12px;padding:8px 10px;text-align:left">
          <canvas data-f="${f.id}" width="96" height="56" style="position:static;display:block;width:48px;height:28px;flex:none;${c ? '' : 'filter:brightness(0) opacity(.5)'}"></canvas>
          <div style="flex:1;min-width:0"><b style="display:block;font-size:15px">${c ? f.name : '???'}</b>
          <small style="color:${RAR[f.r].col}">${RAR[f.r].name}</small><small style="color:#9aa0c8"> · ${when}${f.rain ? ' · gosta de chuva' : ''}</small></div>
          <div style="text-align:right;font-size:13px;color:#9aa0c8">${c ? `<b style="color:#ffcc4d;display:block">${fmtKg(c.max)}</b>×${c.n}` : '—'}</div></div>`;
      }).join('');
      overlay.innerHTML = `
        <h2>Caderno</h2>
        <p>${n}/${ALL.length} espécies · ${P.total} capturas</p>
        <div style="display:flex;gap:6px;width:100%;max-width:360px">${LOCS.map(l => `<button class="btn center" data-l="${l.id}" style="flex:1;padding:10px 4px;${l.id === L.id ? 'border-color:#ffcc4d' : ''}">${l.name}</button>`).join('')}</div>
        <div style="display:grid;gap:6px;width:100%;max-width:360px;max-height:52vh;overflow-y:auto">${rows}</div>
        <button class="btn primary" data-a="close">Fechar</button>`;
      overlay.style.justifyContent = 'flex-start';
      overlay.style.paddingTop = `calc(env(safe-area-inset-top) + 24px)`;
      overlay.querySelectorAll('canvas[data-f]').forEach(cv => {
        const f = ALL.find(x => x.id === cv.dataset.f), c2 = cv.getContext('2d');
        c2.scale(2, 2); drawFish(c2, 24, 14, 36, f);
      });
      overlay.hidden = false;
      overlay.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => showBook(b.dataset.l); });
      overlay.querySelector('[data-a=close]').onclick = () => { resetOverlayStyle(); closeMenu(); };
    }
    function resetOverlayStyle() { overlay.style.justifyContent = ''; overlay.style.paddingTop = ''; }

    function showShop() {
      const rows = UPG.map(u => {
        const lv = P[u.id], max = lv >= MAXLV, cost = max ? 0 : u.cost[lv];
        return `<button class="btn" data-u="${u.id}" ${max || P.money < cost ? 'disabled style="opacity:.55"' : ''}>
          <b>${u.name} · nível ${lv + 1}/${MAXLV + 1}${max ? '' : ` → ${cost} €`}</b><small>${max ? 'No máximo' : u.desc}</small></button>`;
      }).join('');
      overlay.innerHTML = `
        <h2>Loja</h2>
        <p>Tens <b style="color:#ffcc4d">${P.money} €</b></p>
        ${rows}
        <button class="btn primary" data-a="close">Fechar</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-u]').forEach(b => {
        b.onclick = () => {
          const u = UPG.find(x => x.id === b.dataset.u), lv = P[u.id];
          if (lv >= MAXLV || P.money < u.cost[lv]) return;
          P.money -= u.cost[lv]; P[u.id]++; save();
          sfx('chime');
          showShop();
        };
      });
      overlay.querySelector('[data-a=close]').onclick = closeMenu;
    }

    function showMap() {
      const rows = LOCS.map(l => {
        const open = P.unlocked[l.id], here = P.loc === l.id;
        const tag = here ? 'Estás aqui' : open ? 'Ir para aqui' : `Desbloquear por ${l.cost} €`;
        const dis = here || (!open && P.money < l.cost);
        return `<button class="btn" data-l="${l.id}" ${dis ? 'disabled' : ''} style="${dis && !here ? 'opacity:.55' : ''}${here ? 'border-color:#ffcc4d' : ''}">
          <b>${l.name} · ${tag}</b><small>${l.desc} ${l.fish.length} espécies.</small></button>`;
      }).join('');
      overlay.innerHTML = `<h2>Locais</h2><p>Tens <b style="color:#ffcc4d">${P.money} €</b></p>${rows}<button class="btn primary" data-a="close">Fechar</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-l]').forEach(b => {
        b.onclick = () => {
          const l = LOCS.find(x => x.id === b.dataset.l);
          if (!P.unlocked[l.id]) { if (P.money < l.cost) return; P.money -= l.cost; P.unlocked[l.id] = true; }
          P.loc = l.id; save();
          if (audio) audio.setLoc(l.id);
          closeMenu();
          say(l.name, '#eef0ff', 1.5);
        };
      });
      overlay.querySelector('[data-a=close]').onclick = closeMenu;
    }

    bar.querySelector('[data-a=book]').onclick = () => { ensureAudio(); if (openMenu()) showBook(); };
    bar.querySelector('[data-a=shop]').onclick = () => { ensureAudio(); if (openMenu()) showShop(); };
    bar.querySelector('[data-a=map]').onclick = () => { ensureAudio(); if (openMenu()) showMap(); };

    function pause() {
      if (phase === 'paused') return;
      resumePhase = phase === 'menu' ? 'idle' : phase;
      if (phase === 'menu') resetOverlayStyle();
      phase = 'paused';
      holding = false; holdId = null;
      save();
      if (audio) audio.suspend();
      const n = Object.keys(P.coll).length;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${loc().name} · ${fmtTime(P.time)} · ${P.money} € · ${n}/${ALL.length} espécies</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => {
        overlay.hidden = true; phase = resumePhase;
        if (audio && P.sound) audio.resume();
      };
      overlay.querySelector('[data-a=restart]').onclick = () => {
        overlay.innerHTML = `
          <h2>Recomeçar?</h2>
          <p>Perdes a coleção, o dinheiro, as melhorias e os locais desbloqueados.</p>
          <button class="btn primary" data-a="yes">Apagar tudo e recomeçar</button>
          <button class="btn center" data-a="no">Cancelar</button>`;
        overlay.querySelector('[data-a=yes]').onclick = () => {
          const snd = P.sound;
          P = freshSave(); P.sound = snd; save();
          lastHour = Math.floor(P.time / 60);
          reelIn();
          overlay.hidden = true;
          if (audio) { audio.setLoc(P.loc); audio.setRain(false); if (P.sound) audio.resume(); }
        };
        overlay.querySelector('[data-a=no]').onclick = () => { phase = 'menu'; pause(); };
      };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) { if (phase !== 'paused') pause(); else save(); } };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Entrada ----------
    function onDown(e) {
      ensureAudio();
      if (holdId !== null) return;
      holdId = e.pointerId; holding = true;
      if (phase === 'idle') startCharge();
      else if (phase === 'wait') reelIn('Recolheste a linha');
      else if (phase === 'bite') hook();
    }
    function onUp(e) {
      if (e.pointerId !== holdId) return;
      holdId = null; holding = false;
      if (phase === 'charge') cast();
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // ---------- Atualização ----------
    function update(dt) {
      clock += dt;
      if (toast) { toast.t -= dt; if (toast.t <= 0) toast = null; }
      for (const r of ripples) r.t += dt;
      ripples = ripples.filter(r => r.t < 1.4);
      if (phase === 'paused') return;

      // relógio do dia e meteorologia
      P.time = (P.time + dt * MIN_PER_SEC) % 1440;
      const hr = Math.floor(P.time / 60);
      if (hr !== lastHour) {
        lastHour = hr;
        if (P.rain > 0) { P.rain--; if (P.rain <= 0 && audio) audio.setRain(false); }
        else if (Math.random() < 0.09) { P.rain = 1 + Math.floor(Math.random() * 3); if (audio) audio.setRain(true); say('Começou a chover', '#9ecbff', 1.8); }
      }
      saveT -= dt;
      if (saveT <= 0) { saveT = 10; save(); }

      const g = geom();
      if (P.rain > 0) {
        for (let k = 0; k < 6; k++) drops.push({ x: Math.random() * g.w, y: -10, v: 500 + Math.random() * 200 });
      }
      for (const d of drops) d.y += d.v * dt;
      if (drops.length && Math.random() < 0.3) {
        const d = drops.find(q => q.y > g.horizon && Math.random() < 0.05);
        if (d) ripples.push({ x: d.x, y: d.y, t: 0.6, small: true });
      }
      drops = drops.filter(d => d.y < g.shore);
      for (const s of shadows) {
        s.x += s.vx * dt; if (s.x < -0.1 || s.x > 1.1) s.vx *= -1;
      }

      if (phase === 'charge') {
        chargeT += dt;
        power = (1 - Math.cos(chargeT * 2.4)) / 2;
      } else if (phase === 'fly') {
        fly.t += dt / 0.7;
        if (fly.t >= 1) land();
      } else if (phase === 'wait') {
        waitT -= dt;
        nibT -= dt;
        if (nib > 0) nib -= dt;
        if (nibT <= 0 && waitT > 0.8) { nib = 0.35; nibT = 1 + Math.random() * 2.5; sfx('blip', 520, 0.06, 'sine', 0.05, 380); }
        if (waitT <= 0) bite();
      } else if (phase === 'bite') {
        biteT -= dt;
        if (biteT <= 0) lose('Não ferraste a tempo — o peixe fugiu', '#ffb38a');
      } else if (phase === 'reel') {
        reelStep(dt);
      }
    }

    function reelStep(dt) {
      const r = rl, d = hooked.d;
      r.t += dt;
      // o peixe escolhe novos alvos; às vezes dá uma corrida forte
      r.retarget -= dt;
      r.surgeT -= dt;
      if (r.surgeT <= 0 && r.surge <= 0) { r.surge = 1 + d * 0.6; r.surgeT = 3 + Math.random() * 4 - d * 1.5; r.zt = Math.random() < 0.5 ? r.zw / 2 : 1 - r.zw / 2; Arcade.buzz(15); }
      if (r.surge > 0) r.surge -= dt;
      if (r.retarget <= 0 && r.surge <= 0) {
        r.retarget = (0.6 + Math.random() * 1.3) / (0.6 + d);
        r.zt = r.zw / 2 + Math.random() * (1 - r.zw);
      }
      const zsp = (0.18 + d * 0.55) * (r.surge > 0 ? 2.2 : 1);
      const dz = r.zt - r.zone;
      r.zone += Math.sign(dz) * Math.min(Math.abs(dz), zsp * dt);
      r.zone += Math.sin(r.t * (3 + d * 5)) * d * 0.08 * dt; // tremor
      r.zone = Math.max(r.zw / 2, Math.min(1 - r.zw / 2, r.zone));
      // indicador: segurar empurra para a direita, soltar deixa-o voltar
      r.nv += (holding ? 2.4 : -2.4) * dt;
      r.nv = Math.max(-1.1, Math.min(1.1, r.nv));
      r.needle += r.nv * dt;
      if (r.needle < 0) { r.needle = 0; r.nv = Math.max(0, r.nv) * 0.3; }
      if (r.needle > 1) { r.needle = 1; r.nv = Math.min(0, r.nv) * 0.3; }
      const inZone = Math.abs(r.needle - r.zone) <= r.zw / 2;
      if (inZone) r.prog += (0.15 + P.reel * 0.03) * dt;
      else r.prog -= (0.09 + d * 0.08) * dt;
      // tensão
      if (holding) r.tension += (0.12 + d * 0.32 + (r.surge > 0 ? 0.65 : 0)) * (1 - P.reel * 0.11) * dt;
      else r.tension -= 0.38 * dt;
      r.tension = Math.max(0, r.tension);
      if (holding) { tickT -= dt; if (tickT <= 0) { tickT = 0.08; sfx('tick'); } }
      if (r.tension >= 1) return lose('A linha partiu!');
      if (r.prog <= 0) return lose('O peixe escapou…');
      if (r.prog >= 1) return caught();
    }

    // ---------- Desenho ----------
    const SKY = [ // hora, cor de cima, cor de baixo
      [0, [8, 10, 32], [20, 22, 60]], [5, [12, 14, 45], [40, 36, 80]], [6.5, [70, 80, 150], [250, 170, 120]],
      [8.5, [70, 150, 220], [160, 210, 240]], [17, [70, 150, 220], [160, 210, 240]], [19, [80, 70, 150], [250, 140, 100]],
      [20.5, [25, 25, 70], [70, 50, 100]], [22, [8, 10, 32], [20, 22, 60]], [24, [8, 10, 32], [20, 22, 60]],
    ];
    function skyAt(hh) {
      for (let i = 0; i < SKY.length - 1; i++) {
        const a = SKY[i], b = SKY[i + 1];
        if (hh >= a[0] && hh <= b[0]) { const t = (hh - a[0]) / (b[0] - a[0]); return [mix(a[1], b[1], t), mix(a[2], b[2], t)]; }
      }
      return [SKY[0][1], SKY[0][2]];
    }

    function render() {
      const g = geom(), { w, h, horizon, shore } = g;
      const hh = P.time / 60, nk = nightK(), rain = P.rain > 0, L = loc();
      let [st, sb] = skyAt(hh);
      if (rain) { st = mix(st, [60, 64, 80], 0.55 * (1 - nk * 0.5)); sb = mix(sb, [90, 95, 110], 0.55 * (1 - nk * 0.5)); }
      const gr = ctx.createLinearGradient(0, 0, 0, horizon);
      gr.addColorStop(0, rgb(st)); gr.addColorStop(1, rgb(sb));
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, horizon + 1);
      // estrelas
      if (nk > 0.2 && !rain) {
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 40; i++) {
          const x = (i * 97.3) % w, y = (i * 53.7) % (horizon - 20);
          ctx.globalAlpha = nk * (0.4 + 0.4 * Math.sin(clock * 2 + i));
          ctx.fillRect(x, y, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
      // sol / lua num arco
      const arc = (u, r, col, glow) => {
        const x = w * 0.08 + u * w * 0.84, y = horizon - Math.sin(u * Math.PI) * (horizon - top - 90) - 6;
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 2, 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      };
      if (hh >= 6 && hh <= 20) arc((hh - 6) / 14, 16, rain ? '#d8d8c8' : '#ffd86b', 'rgba(255,220,120,0.18)');
      else { const u = ((hh + 4) % 24) / 10; arc(u, 12, '#e8ecff', 'rgba(220,230,255,0.12)'); }
      // nuvens de chuva
      if (rain) {
        ctx.fillStyle = 'rgba(70,74,90,0.75)';
        for (let i = 0; i < 6; i++) {
          const x = ((i * 90 + clock * 8) % (w + 160)) - 80, y = top + 70 + (i % 3) * 22;
          ctx.beginPath(); ctx.ellipse(x, y, 70, 18, 0, 0, TAU); ctx.fill();
        }
      }
      // horizonte (terra / árvores conforme o local)
      const land = mix([30, 60, 50], [8, 14, 22], nk);
      ctx.fillStyle = rgb(land);
      if (L.id === 'lake') {
        ctx.beginPath(); ctx.moveTo(0, horizon);
        for (let x = 0; x <= w; x += 14) ctx.lineTo(x, horizon - 10 - Math.abs(Math.sin(x * 0.09)) * 16 - (x % 28 ? 0 : 6));
        ctx.lineTo(w, horizon); ctx.fill();
      } else if (L.id === 'river') {
        ctx.beginPath(); ctx.moveTo(0, horizon);
        for (let x = 0; x <= w; x += 10) ctx.lineTo(x, horizon - 18 - Math.sin(x * 0.02) * 14 - Math.abs(Math.sin(x * 0.2)) * 6);
        ctx.lineTo(w, horizon); ctx.fill();
      } else {
        ctx.fillStyle = rgb(mix([60, 70, 90], [12, 16, 30], nk));
        ctx.beginPath(); ctx.moveTo(w * 0.7, horizon); ctx.lineTo(w * 0.8, horizon - 14); ctx.lineTo(w * 0.92, horizon - 8); ctx.lineTo(w, horizon - 12); ctx.lineTo(w, horizon); ctx.fill();
      }
      // água
      const wc = mix(L.water, [6, 10, 28], nk * 0.75);
      const wg = ctx.createLinearGradient(0, horizon, 0, shore);
      wg.addColorStop(0, rgb(mix(wc, sb, 0.35))); wg.addColorStop(1, rgb(mix(wc, [0, 0, 0], 0.25)));
      ctx.fillStyle = wg; ctx.fillRect(0, horizon, w, shore - horizon);
      // ondulação / corrente
      ctx.strokeStyle = `rgba(255,255,255,${0.10 - nk * 0.04})`; ctx.lineWidth = 1.5;
      for (let i = 0; i < 14; i++) {
        const k = i / 14, y = lerp(horizon + 6, shore - 6, k * k);
        const spd = L.id === 'river' ? 60 : L.id === 'sea' ? 14 : 6;
        const off = (clock * spd * (0.4 + k) + i * 47) % (w + 120) - 60;
        const len = 20 + k * 50;
        ctx.beginPath();
        if (L.id === 'sea') {
          for (let x = -10; x <= w + 10; x += 12) { const yy = y + Math.sin(x * 0.03 + clock * 1.5 + i) * (2 + k * 4); x < 0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
        } else { ctx.moveTo(off, y); ctx.lineTo(off + len, y); ctx.moveTo((off + w * 0.5) % (w + 60), y + 4); ctx.lineTo((off + w * 0.5) % (w + 60) + len * 0.6, y + 4); }
        ctx.stroke();
      }
      // reflexo do sol/lua
      ctx.fillStyle = nk > 0.5 ? 'rgba(220,230,255,0.06)' : 'rgba(255,230,150,0.08)';
      ctx.fillRect(w * 0.42, horizon, w * 0.16, shore - horizon);
      // sombras de peixes
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (const s of shadows) {
        const y = lerp(horizon + 30, shore - 40, s.y), x = s.x * w, sc = lerp(0.5, 1.2, s.y) * s.s;
        ctx.beginPath(); ctx.ellipse(x, y, 16 * sc, 5 * sc, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - Math.sign(s.vx) * 14 * sc, y); ctx.lineTo(x - Math.sign(s.vx) * 22 * sc, y - 5 * sc); ctx.lineTo(x - Math.sign(s.vx) * 22 * sc, y + 5 * sc); ctx.fill();
      }
      // ondas circulares
      for (const r of ripples) {
        if (r.t < 0) continue;
        const k = r.t / 1.4, rad = (r.small ? 8 : 26) * (0.2 + k);
        ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.6})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.35, 0, 0, TAU); ctx.stroke();
      }
      // margem / pontão
      ctx.fillStyle = rgb(mix([110, 78, 50], [40, 30, 26], nk));
      ctx.fillRect(0, shore, w, h - shore);
      ctx.fillStyle = rgb(mix([90, 62, 40], [30, 22, 20], nk));
      for (let y = shore + 14; y < h; y += 22) ctx.fillRect(0, y, w, 3);
      for (let x = w * 0.2; x < w; x += w * 0.3) ctx.fillRect(x, shore, 3, h - shore);

      // cana
      const tip = g.tip;
      let bend = 0;
      if (phase === 'charge') bend = -power * 30;
      if (phase === 'reel') bend = 14 + rl.tension * 26;
      ctx.strokeStyle = '#3b2a1e'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      const rb = Math.min(h - 70, shore + 58);
      ctx.beginPath(); ctx.moveTo(w * 0.8, rb); ctx.quadraticCurveTo(w * 0.72 + bend * 0.3, shore - 20, tip.x + bend * 0.6, tip.y + bend * 0.5); ctx.stroke();
      ctx.fillStyle = '#d1d8e0'; ctx.beginPath(); ctx.arc(w * 0.775, rb - 22, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.arc(w * 0.775, rb - 22, 3.5, 0, TAU); ctx.fill();
      const tx = tip.x + bend * 0.6, ty = tip.y + bend * 0.5;

      // linha e boia
      let bx = null, by = null;
      if (phase === 'fly') {
        const t = fly.t;
        bx = lerp(fly.sx, fly.tx, t); by = lerp(fly.sy, fly.ty, t) - Math.sin(t * Math.PI) * 120;
      } else if (bob && (phase === 'wait' || phase === 'bite')) {
        bx = bob.x; by = bob.y + Math.sin(clock * 2) * 1.5;
      } else if (phase === 'reel') {
        const k = Math.min(1, rl.prog);
        bx = lerp(rl.sx, w * 0.5, k * 0.7) + (rl.zone - 0.5) * w * 0.5;
        by = lerp(rl.sy, shore - 40, k * 0.75);
      }
      if (bx != null) {
        const taut = phase === 'reel';
        const tens = taut ? rl.tension : 0;
        ctx.strokeStyle = taut ? `rgb(255,${Math.round(255 - tens * 180)},${Math.round(255 - tens * 200)})` : 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(tx, ty);
        if (taut) ctx.lineTo(bx, by);
        else ctx.quadraticCurveTo((tx + bx) / 2, Math.max(ty, by) + 30, bx, by);
        ctx.stroke();
        if (phase === 'reel') {
          // peixe a debater-se logo abaixo da superfície
          ctx.globalAlpha = 0.45;
          drawFish(ctx, bx, by + 10, 46, { col: '#0a0f1c', shape: hooked.f.shape }, clock * 2);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
          const sp = 10 + Math.sin(clock * 20) * 3;
          ctx.beginPath(); ctx.ellipse(bx, by + 2, sp, sp * 0.35, 0, 0, TAU); ctx.stroke();
        } else {
          let dip = 0;
          if (phase === 'wait' && nib > 0) dip = Math.sin((0.35 - nib) / 0.35 * Math.PI) * 4;
          if (phase === 'bite') dip = 7 + Math.sin(clock * 30) * 1.5;
          const sc = phase === 'fly' ? 1 : lerp(1.1, 0.65, bob.d);
          drawBobber(bx, by + dip, sc, phase === 'bite' ? 0.55 : 0);
          if (phase === 'bite') {
            ctx.fillStyle = '#ffcc4d'; ctx.font = '900 34px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText('!', bx, by - 14 - Math.abs(Math.sin(clock * 12)) * 6);
          }
        }
      }
      // marcador de distância ao carregar
      if (phase === 'charge') {
        const d = Math.max(0.08, power) * maxDist(), y = distToY(g, d);
        ctx.strokeStyle = 'rgba(255,204,77,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.ellipse(w / 2, y, 30 * lerp(1, 0.5, d), 9 * lerp(1, 0.5, d), 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        const bw = Math.min(260, w - 80), x0 = (w - bw) / 2, y0 = shore - 26;
        ctx.fillStyle = 'rgba(8,9,20,0.6)'; rr(x0 - 4, y0 - 4, bw + 8, 18, 9); ctx.fill();
        ctx.fillStyle = `hsl(${40 + power * 80},90%,60%)`; rr(x0, y0, bw * power * maxDist() / 1.0, 10, 5); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; rr(x0, y0, bw * maxDist(), 10, 5); ctx.stroke();
      }
      // chuva
      if (drops.length) {
        ctx.strokeStyle = 'rgba(200,215,255,0.45)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - 3, d.y - 12); }
        ctx.stroke();
      }
      // véu noturno sobre tudo
      if (nk > 0) { ctx.fillStyle = `rgba(5,8,30,${nk * 0.25})`; ctx.fillRect(0, 0, w, h); }

      // minijogo de puxar
      if (phase === 'reel') drawReel(g);

      // HUD
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(8,9,20,0.45)'; rr(8, top + 14, Math.min(w - 84, 250), 66, 14); ctx.fill();
      ctx.fillStyle = '#ffcc4d'; ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`${P.money} €`, 20, top + 20);
      ctx.fillStyle = '#eef0ff'; ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(`${L.name} · ${fmtTime(P.time)} · ${isNight() ? 'noite' : 'dia'}${rain ? ' · chuva' : ''}`, 20, top + 48);
      ctx.fillStyle = '#9aa0c8'; ctx.font = '500 12px system-ui, sans-serif';
      ctx.fillText(`${Object.keys(P.coll).length}/${ALL.length} espécies · cana ${P.rod + 1} · carreto ${P.reel + 1} · isco ${P.bait + 1}`, 20, top + 66 - 2);

      // dica
      const hint = { idle: 'Toca e segura para lançar', charge: 'Larga para lançar', fly: '', wait: 'Espera que o peixe pique…', bite: 'Toca agora!', reel: '' }[phase];
      if (hint) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = phase === 'bite' ? '800 24px system-ui, sans-serif' : '600 16px system-ui, sans-serif';
        ctx.fillStyle = phase === 'bite' ? '#ffcc4d' : 'rgba(238,240,255,0.85)';
        ctx.fillText(hint, w / 2, shore + 26);
      }
      if (toast) {
        ctx.globalAlpha = Math.min(1, toast.t * 2);
        ctx.font = '700 19px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(toast.text).width + 30;
        ctx.fillStyle = 'rgba(8,9,20,0.8)'; rr(w / 2 - tw / 2, horizon + 40, tw, 42, 12); ctx.fill();
        ctx.fillStyle = toast.color; ctx.fillText(toast.text, w / 2, horizon + 61);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }

    function drawBobber(x, y, sc, sunk) {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      ctx.beginPath(); ctx.rect(-12, -30, 24, 30 + 10 - sunk * 18); ctx.clip();
      ctx.fillStyle = '#f5f6fa'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff4757'; ctx.beginPath(); ctx.arc(0, 0, 8, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#ff4757'; ctx.fillRect(-1.5, -16, 3, 9);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y + 4 * sc, 12 * sc, 3.5 * sc, 0, 0, TAU); ctx.stroke();
    }

    function drawReel(g) {
      const r = rl, w = g.w;
      const bw = Math.min(w - 40, 340), x0 = (w - bw) / 2, y0 = top + 104;
      ctx.fillStyle = 'rgba(8,9,20,0.78)'; rr(x0 - 12, y0 - 14, bw + 24, 112, 16); ctx.fill();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#9aa0c8'; ctx.font = '600 12px system-ui, sans-serif';
      ctx.fillText('Segura para puxar · solta para aliviar', x0, y0 - 2);
      // barra principal com a zona do peixe
      const by = y0 + 10, bh = 26;
      ctx.fillStyle = '#1a1c33'; rr(x0, by, bw, bh, 8); ctx.fill();
      const surge = r.surge > 0;
      ctx.fillStyle = surge ? 'rgba(255,140,60,0.75)' : 'rgba(38,222,129,0.6)';
      rr(x0 + (r.zone - r.zw / 2) * bw, by, r.zw * bw, bh, 8); ctx.fill();
      drawFish(ctx, x0 + r.zone * bw, by + bh / 2, 22, { col: surge ? '#ffe0c0' : '#e8fff2', shape: hooked.f.shape }, clock * 3);
      const nx = x0 + r.needle * bw;
      ctx.fillStyle = '#ffcc4d'; rr(nx - 3, by - 6, 6, bh + 12, 3); ctx.fill();
      // captura
      const py = by + bh + 16;
      ctx.fillStyle = '#9aa0c8'; ctx.fillText('Captura', x0, py + 4);
      ctx.fillStyle = '#1a1c33'; rr(x0 + 64, py, bw - 64, 8, 4); ctx.fill();
      ctx.fillStyle = '#45aaf2'; rr(x0 + 64, py, (bw - 64) * Math.max(0, Math.min(1, r.prog)), 8, 4); ctx.fill();
      // tensão
      const ty = py + 22;
      ctx.fillStyle = r.tension > 0.75 ? '#ff5a6e' : '#9aa0c8'; ctx.fillText('Tensão', x0, ty + 4);
      ctx.fillStyle = '#1a1c33'; rr(x0 + 64, ty, bw - 64, 8, 4); ctx.fill();
      ctx.fillStyle = r.tension > 0.75 ? '#ff5a6e' : r.tension > 0.45 ? '#ff9f43' : '#26de81';
      rr(x0 + 64, ty, (bw - 64) * Math.min(1, r.tension), 8, 4); ctx.fill();
      if (r.tension > 0.75 && Math.floor(clock * 6) % 2) {
        ctx.fillStyle = '#ff5a6e'; ctx.textAlign = 'center'; ctx.font = '800 16px system-ui, sans-serif';
        ctx.fillText('A linha vai partir!', w / 2, ty + 32);
      }
    }
    function rr(x, y, w2, h2, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, Math.max(0, w2), h2, Math.min(r, Math.abs(w2) / 2, h2 / 2)) : ctx.rect(x, y, w2, h2); }

    // ---------- Gancho de debug (só com window.ARCADE_DEBUG) ----------
    if (window.ARCADE_DEBUG) {
      window.ARCADE_DEBUG.fishing = {
        state: () => ({
          phase, money: P.money, rod: P.rod, reelLv: P.reel, bait: P.bait, loc: P.loc, time: P.time, rain: P.rain,
          species: Object.keys(P.coll).length, total: P.total, sound: P.sound, audio: audio ? audio.ac.state : null,
          reel: rl ? { needle: rl.needle, nv: rl.nv, zone: rl.zone, zw: rl.zw, prog: rl.prog, tension: rl.tension, surge: rl.surge > 0 } : null,
          hooked: hooked ? { id: hooked.f.id, w: hooked.w } : null,
        }),
        setTime(m) { P.time = m; lastHour = Math.floor(m / 60); },
        setRain(hrs) { P.rain = hrs; if (audio) audio.setRain(hrs > 0); },
      };
    }

    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        save();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        document.removeEventListener('visibilitychange', onVis);
        if (audio) audio.close();
        if (window.ARCADE_DEBUG) delete window.ARCADE_DEBUG.fishing;
      },
    };
  }

  Arcade.register({
    id: 'fishing',
    title: 'Pesca',
    icon: '🎣',
    color: '#45aaf2',
    desc: 'Lança, espera que pique e puxa sem partir a linha. Completa o caderno.',
    best: () => {
      const s = Arcade.store.get('fishing:save', null);
      const n = s && s.coll ? Object.keys(s.coll).length : 0;
      return `${n}/${ALL.length} espécies`;
    },
    create,
  });
})();
