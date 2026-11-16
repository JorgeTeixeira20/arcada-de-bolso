// Ritmo: as notas caem em 4 pistas; toca na pista quando a nota chega à linha.
// A música é sintetizada pelo próprio jogo (WebAudio) e as notas seguem o relógio do AudioContext.
(function () {
  const LANE_COLORS = ['#ff5a6e', '#ffcc4d', '#26de81', '#45aaf2'];
  const KEYS = { d: 0, f: 1, j: 2, k: 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };

  const TRACKS = [
    { id: 'neon',   name: 'Néon Lento',  bpm: 92,  seed: 11, root: 45, scale: 'minor', bars: 26, wave: 'triangle' },
    { id: 'mare',   name: 'Maré Alta',   bpm: 108, seed: 27, root: 48, scale: 'major', bars: 28, wave: 'square' },
    { id: 'turbo',  name: 'Turbo',       bpm: 126, seed: 53, root: 43, scale: 'minor', bars: 30, wave: 'sawtooth' },
    { id: 'cometa', name: 'Cometa',      bpm: 148, seed: 91, root: 46, scale: 'major', bars: 34, wave: 'square' },
  ];
  const DIFFS = [
    { id: 'easy',   name: 'Fácil',   grid: 4, gap: 4, holdMin: 5, approach: 1.75, rests: false, doubles: false, overlap: false },
    { id: 'normal', name: 'Normal',  grid: 2, gap: 2, holdMin: 5, approach: 1.4,  rests: true,  doubles: false, overlap: true },
    { id: 'hard',   name: 'Difícil', grid: 1, gap: 1, holdMin: 4, approach: 1.1,  rests: true,  doubles: true,  overlap: true },
  ];
  const SCALES = { minor: [0, 2, 3, 5, 7, 8, 10], major: [0, 2, 4, 5, 7, 9, 11] };
  const PROGS = [[0, 5, 3, 4], [0, 3, 4, 3], [0, 4, 5, 3], [5, 3, 0, 4]];

  // Janelas de avaliação (segundos)
  const W_PERFECT = 0.05, W_GOOD = 0.11, W_MISS = 0.15;

  const bestKey = (tr, df) => `rhythm:best:${tr}:${df}`;

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- Composição: gera a música e a partitura a partir da seed ----------
  function compose(track) {
    const r = rng(track.seed);
    const scale = SCALES[track.scale];
    const prog = pick(r, PROGS);
    const stepDur = 60 / track.bpm / 4; // semicolcheia
    const degMidi = d => track.root + 24 + Math.floor(d / 7) * 12 + scale[((d % 7) + 7) % 7];

    // Motivo de 2 compassos (32 passos)
    function motif(chordOf) {
      const notes = [];
      let deg = 4 + Math.floor(r() * 3);
      for (let s = 0; s < 32; s++) {
        const p = s % 8 === 0 ? 0.85 : s % 4 === 0 ? 0.55 : s % 2 === 0 ? 0.3 : 0.1;
        if (r() > p) continue;
        deg += pick(r, [-2, -1, -1, 0, 1, 1, 2]);
        if (s % 8 === 0) { // nos tempos fortes, aproxima-se de uma nota do acorde
          const c = chordOf(s);
          const tones = [c, c + 2, c + 4, c + 7].filter(t => t >= 0 && t <= 10);
          deg = tones.reduce((a, b) => Math.abs(b - deg) < Math.abs(a - deg) ? b : a, tones[0]);
        }
        deg = Math.max(0, Math.min(10, deg));
        notes.push({ s, deg, len: 1 });
      }
      for (let i = 0; i < notes.length; i++) {
        const next = i + 1 < notes.length ? notes[i + 1].s : 32;
        const room = next - notes[i].s;
        notes[i].len = room >= 5 && r() < 0.55 ? room : Math.max(1, Math.min(room, pick(r, [1, 2, 2, 3, 4, 6, 8, 8])));
      }
      return notes;
    }

    const intro = 2, outro = 2;
    const body = track.bars - intro - outro;
    const chordAtBar = bar => prog[bar % 4];
    const motA = motif(s => chordAtBar(Math.floor(s / 16)));
    const motB = motif(s => chordAtBar(Math.floor(s / 16) + 2));
    const kickExtra = [pick(r, [6, 10, 14, -1]), pick(r, [3, 11, -1])];
    const hat16 = track.bpm < 120;

    const audio = [];   // { t, kind, midi?, dur? }
    const melody = [];  // { step, deg, len }
    for (let bar = 0; bar < track.bars; bar++) {
      const b0 = bar * 16;
      const inBody = bar >= intro && bar < intro + body;
      const sec = inBody ? Math.floor((bar - intro) / 8) : -1;
      const chord = chordAtBar(bar);
      // Bateria
      for (let s = 0; s < 16; s++) {
        const t = (b0 + s) * stepDur;
        const kick = s === 0 || s === 8 || (inBody && kickExtra.includes(s));
        if (kick) audio.push({ t, kind: 'kick' });
        if ((s === 4 || s === 12) && (inBody || bar === intro - 1)) audio.push({ t, kind: 'snare' });
        if (hat16 ? s % 2 === 0 : true) if (bar < track.bars - 1) audio.push({ t, kind: 'hat', open: s % 4 === 2 });
      }
      // Baixo em colcheias
      const bassMidi = track.root + scale[chord % 7] - (chord >= 5 ? 12 : 0);
      for (let s = 0; s < 16; s += 2) {
        audio.push({ t: (b0 + s) * stepDur, kind: 'bass', midi: s === 6 || s === 14 ? bassMidi + 12 : bassMidi, dur: stepDur * 1.8 });
      }
      // Melodia
      if (inBody) {
        const mot = sec === 1 ? motB : motA;
        const half = (bar - intro) % 2;
        const variation = sec === 2 && (bar - intro) % 8 >= 6 ? 1 : 0;
        for (const n of mot) {
          if (Math.floor(n.s / 16) !== half) continue;
          const step = b0 + (n.s % 16);
          const deg = Math.max(0, Math.min(10, n.deg + variation));
          melody.push({ step, deg, len: n.len });
          audio.push({ t: step * stepDur, kind: 'lead', midi: degMidi(deg), dur: n.len * stepDur * 0.95 });
        }
      }
    }
    // Acorde final
    audio.push({ t: (track.bars - 1) * 16 * stepDur, kind: 'lead', midi: degMidi(prog[0]), dur: stepDur * 14 });
    audio.sort((a, b) => a.t - b.t);
    const length = track.bars * 16 * stepDur;
    return { audio, melody, stepDur, length, intro, body };
  }

  function buildChart(song, diff) {
    const { melody, stepDur, intro, body } = song;
    // Pista segue o contorno da melodia: sobe -> direita, desce -> esquerda (com "ricochete" nas pontas).
    let lane = 1, prevDeg = null, same = 0;
    const cand = melody.map(n => {
      if (prevDeg !== null) {
        const d = n.deg - prevDeg;
        if (d === 0) { if (++same >= 3) { lane += lane >= 2 ? -1 : 1; same = 0; } }
        else { same = 0; lane += Math.sign(d) * (Math.abs(d) >= 3 ? 2 : 1); }
        if (lane > 3) lane = lane === 4 ? 2 : 1;
        if (lane < 0) lane = lane === -1 ? 1 : 2;
      }
      prevDeg = n.deg;
      return { step: n.step, lane, len: n.len };
    });
    // Nas pausas da melodia, a tarola também dá notas (Normal/Difícil)
    if (diff.rests) {
      const bodyStart = intro * 16, bodyEnd = (intro + body) * 16;
      let alt = 0;
      for (let s = bodyStart + 4; s < bodyEnd; s += 8) {
        const busy = melody.some(n => n.step <= s && n.step + Math.max(n.len, 3) > s - 1 && n.step >= s - 3);
        if (!busy) cand.push({ step: s, lane: 1 + (alt++ % 2), len: 1 });
      }
    }
    cand.sort((a, b) => a.step - b.step || a.lane - b.lane);

    const out = [];
    let lastStep = -99, holdEnd = -1;
    const laneFree = [-1, -1, -1, -1];
    for (const c of cand) {
      if (c.step % diff.grid) continue;
      if (c.step - lastStep < diff.gap) continue;
      if (!diff.overlap && c.step < holdEnd) continue;
      let lane = c.lane;
      if (laneFree[lane] > c.step) { // pista ocupada por uma nota longa
        const alt = [0, 1, 2, 3].find(l => laneFree[l] <= c.step);
        if (alt === undefined) continue;
        lane = alt;
      }
      const hold = c.len >= diff.holdMin && (c.len - 1) * stepDur >= 0.3;
      const dur = hold ? (c.len - 1) * stepDur : 0;
      out.push({ t: c.step * stepDur, lane, dur });
      lastStep = c.step;
      laneFree[lane] = c.step + (hold ? c.len : 1);
      if (hold) holdEnd = Math.max(holdEnd, c.step + c.len);
      // Acordes: nos inícios de compasso, uma segunda nota
      if (diff.doubles && c.step % 16 === 0 && !hold) {
        const l2 = (lane + 2) % 4;
        if (laneFree[l2] <= c.step) { out.push({ t: c.step * stepDur, lane: l2, dur: 0 }); laneFree[l2] = c.step + 1; }
      }
    }
    return out.map((n, i) => ({ ...n, id: i, state: 'pending', judge: null, holdPid: null }));
  }

  // ---------- Sintetizador ----------
  function makeSynth(ctx, out) {
    let noise = null;
    function noiseBuf() {
      if (noise) return noise;
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const d = noise.getChannelData(0);
      const r = rng(7);
      for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
      return noise;
    }
    function env(g, when, peak, attack, decay) {
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    }
    return function play(ev, when, bus, wave) {
      if (ev.kind === 'kick') {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, when);
        o.frequency.exponentialRampToValueAtTime(42, when + 0.12);
        env(g, when, 0.9, 0.003, 0.22);
        o.connect(g).connect(bus);
        o.start(when); o.stop(when + 0.3);
      } else if (ev.kind === 'snare' || ev.kind === 'hat') {
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf();
        f.type = 'highpass';
        f.frequency.value = ev.kind === 'snare' ? 1200 : 7000;
        const dec = ev.kind === 'snare' ? 0.16 : ev.open ? 0.09 : 0.035;
        env(g, when, ev.kind === 'snare' ? 0.45 : 0.14, 0.002, dec);
        s.connect(f).connect(g).connect(bus);
        s.start(when); s.stop(when + dec + 0.05);
        if (ev.kind === 'snare') {
          const o = ctx.createOscillator(), g2 = ctx.createGain();
          o.type = 'triangle'; o.frequency.setValueAtTime(190, when);
          env(g2, when, 0.3, 0.002, 0.08);
          o.connect(g2).connect(bus); o.start(when); o.stop(when + 0.12);
        }
      } else {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        const bass = ev.kind === 'bass';
        o.type = bass ? 'sawtooth' : wave;
        o.frequency.setValueAtTime(mtof(ev.midi), when);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(bass ? 700 : 2600, when);
        f.frequency.exponentialRampToValueAtTime(bass ? 220 : 900, when + ev.dur);
        const peak = bass ? 0.32 : wave === 'square' ? 0.11 : wave === 'sawtooth' ? 0.12 : 0.2;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
        g.gain.setValueAtTime(peak, when + Math.max(0.01, ev.dur - 0.05));
        g.gain.exponentialRampToValueAtTime(0.0001, when + ev.dur + 0.04);
        o.connect(f).connect(g).connect(bus);
        o.start(when); o.stop(when + ev.dur + 0.06);
      }
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

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.style.overflowY = 'auto';
    overlay.style.justifyContent = 'safe center';
    root.appendChild(overlay);

    // ---------- Áudio ----------
    let actx = null, master = null, synth = null, bus = null;
    let muted = Arcade.store.get('rhythm:mute', false);
    let perfBase = 0, perfPausedAt = 0; // relógio de recurso, se não houver AudioContext
    function ensureAudio() { // chamado dentro de um toque (requisito do iOS)
      if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        actx = new AC({ latencyHint: 'interactive' });
        master = actx.createGain();
        master.gain.value = muted ? 0 : 0.8;
        master.connect(actx.destination);
        synth = makeSynth(actx, master);
        // Buffer silencioso: desbloqueia o áudio no iOS
        const b = actx.createBuffer(1, 1, 22050), s = actx.createBufferSource();
        s.buffer = b; s.connect(master); s.start(0);
        actx.resume().catch(() => {});
      } catch { actx = null; }
    }
    const audioOk = () => actx && actx.state === 'running';
    function clock() {
      if (S && S.useAudio) return actx.currentTime;
      if (S && S.phase !== 'play') return perfPausedAt;
      return (performance.now() - perfBase) / 1000;
    }
    const latency = () => (S && S.useAudio ? (actx.outputLatency || actx.baseLatency || 0) : 0);
    const songTime = () => clock() - S.startAt - latency();
    function setMuted(m) {
      muted = m;
      Arcade.store.set('rhythm:mute', m);
      if (master) master.gain.setValueAtTime(m ? 0 : 0.8, actx.currentTime);
    }

    // ---------- Estado ----------
    let S = null;
    let selTrack = Arcade.store.get('rhythm:lastTrack', TRACKS[0].id);
    let selDiff = Arcade.store.get('rhythm:lastDiff', 'normal');
    if (!TRACKS.some(t => t.id === selTrack)) selTrack = TRACKS[0].id;
    if (!DIFFS.some(d => d.id === selDiff)) selDiff = 'normal';
    const songCache = {};
    const getSong = tr => songCache[tr.id] || (songCache[tr.id] = compose(tr));

    const pointers = new Map(); // pointerId -> pista
    const pressed = [0, 0, 0, 0];
    const flash = [0, 0, 0, 0];

    function commitBest() {
      if (!S || S.score <= 0) return;
      const k = bestKey(S.track.id, S.diff.id);
      if (S.score > Arcade.store.get(k, 0)) Arcade.store.set(k, S.score);
    }

    function startSong(track, diff) {
      ensureAudio();
      if (bus) { try { bus.disconnect(); } catch {} bus = null; }
      const song = getSong(track);
      S = {
        track, diff, song, chart: buildChart(song, diff),
        phase: 'play', score: 0, combo: 0, maxCombo: 0,
        counts: { perfect: 0, good: 0, miss: 0 }, holdsDone: 0,
        popups: [], aIdx: 0, startBest: Arcade.store.get(bestKey(track.id, diff.id), 0),
        useAudio: false, startAt: 0, countdown: 0,
      };
      Arcade.store.set('rhythm:lastTrack', track.id);
      Arcade.store.set('rhythm:lastDiff', diff.id);
      pointers.clear(); pressed.fill(0);
      overlay.hidden = true;
      pauseBtn.hidden = false;
      const begin = () => {
        if (!S || S.track !== track) return;
        S.useAudio = audioOk();
        if (S.useAudio) {
          bus = actx.createGain();
          bus.connect(master);
          S.startAt = actx.currentTime + 0.4;
        } else {
          perfBase = performance.now();
          S.startAt = 0.4;
        }
        S.started = true;
      };
      // Espera um instante pelo arranque do AudioContext; se não arrancar, joga sem som.
      if (actx && actx.state !== 'running') {
        const t0 = performance.now();
        S.started = false;
        const tick = () => {
          if (!S || S.track !== track || S.started) return;
          if (audioOk() || performance.now() - t0 > 700) begin();
          else setTimeout(tick, 30);
        };
        tick();
      } else begin();
    }

    // Agenda os sons que vão tocar nos próximos 300 ms (no relógio do áudio).
    function schedule() {
      if (!S.useAudio || !bus) return;
      const ev = S.song.audio;
      const horizon = actx.currentTime + 0.3;
      while (S.aIdx < ev.length && S.startAt + ev[S.aIdx].t < horizon) {
        const e = ev[S.aIdx++];
        const when = S.startAt + e.t;
        if (when >= actx.currentTime - 0.01) synth(e, Math.max(when, actx.currentTime), bus, S.track.wave);
      }
    }

    function addPopup(text, color, lane) {
      S.popups = S.popups.filter(p => p.lane !== lane);
      S.popups.push({ text, color, lane, life: 0.6 });
    }
    const mult = () => Math.min(4, 1 + Math.floor(S.combo / 10));

    function award(judge, lane) {
      S.counts[judge]++;
      if (judge === 'miss') {
        if (S.combo >= 10) Arcade.buzz(25);
        S.combo = 0;
        addPopup('Falhou', '#ff5a6e', lane);
        return;
      }
      S.combo++;
      S.maxCombo = Math.max(S.maxCombo, S.combo);
      S.score += (judge === 'perfect' ? 300 : 100) * mult();
      addPopup(judge === 'perfect' ? 'Perfeito' : 'Bom', judge === 'perfect' ? '#ffcc4d' : '#45aaf2', lane);
      flash[lane] = 1;
    }

    function hitLane(lane, pid) {
      if (!S || S.phase !== 'play' || !S.started) return;
      const t = songTime();
      let best = null, bd = 1e9;
      for (const n of S.chart) {
        if (n.state !== 'pending' || n.lane !== lane) continue;
        const d = Math.abs(n.t - t);
        if (d < bd) { bd = d; best = n; }
        if (n.t > t + W_MISS) break;
      }
      if (!best || bd > W_GOOD + 0.03) return; // toque sem nota: não penaliza
      const judge = bd <= W_PERFECT ? 'perfect' : bd <= W_GOOD ? 'good' : 'miss';
      best.judge = judge;
      award(judge, lane);
      if (judge === 'miss') { best.state = 'missed'; return; }
      if (best.dur > 0) { best.state = 'holding'; best.holdPid = pid; best.lastTick = best.t; }
      else best.state = 'hit';
    }

    function releaseLane(lane, pid) {
      if (!S || S.phase !== 'play') return;
      const t = songTime();
      for (const n of S.chart) {
        if (n.state !== 'holding' || n.lane !== lane || n.holdPid !== pid) continue;
        if (t >= n.t + n.dur - 0.12) finishHold(n);
        else { n.state = 'dropped'; S.combo = 0; addPopup('Largaste', '#ff9f43', lane); }
      }
    }
    function finishHold(n) {
      n.state = 'hit';
      S.holdsDone++;
      S.score += 150 * mult();
      addPopup('Boa!', '#26de81', n.lane);
    }

    function update(dt) {
      for (let i = 0; i < 4; i++) flash[i] = Math.max(0, flash[i] - dt * 4);
      if (!S) return;
      for (const p of S.popups) p.life -= dt;
      S.popups = S.popups.filter(p => p.life > 0);
      if (S.phase === 'countdown') {
        S.countdown -= dt;
        if (S.countdown <= 0) {
          S.phase = 'play';
          if (S.useAudio) actx.resume().catch(() => {});
          else perfBase = performance.now() - perfPausedAt * 1000;
        }
        return;
      }
      if (S.phase !== 'play' || !S.started) return;
      // Se o áudio foi suspenso pelo sistema (ex.: chamada), tenta retomar.
      if (S.useAudio && actx.state === 'suspended') actx.resume().catch(() => {});
      schedule();
      const t = songTime();
      for (const n of S.chart) {
        if (n.t > t + 0.1) break;
        if (n.state === 'pending' && t > n.t + W_MISS) { n.state = 'missed'; n.judge = 'miss'; award('miss', n.lane); }
        else if (n.state === 'holding') {
          while (n.lastTick + 0.1 <= Math.min(t, n.t + n.dur)) { n.lastTick += 0.1; S.score += 5 * mult(); }
          if (t >= n.t + n.dur) finishHold(n);
        }
      }
      if (t > S.song.length + 0.6) finish();
    }

    // ---------- Entrada ----------
    const laneGeom = () => {
      const lw = Math.min(110, view.w / 4);
      const x0 = (view.w - lw * 4) / 2;
      return { lw, x0, hitY: Math.round(view.h * 0.8) };
    };
    function laneAt(x) {
      const { lw, x0 } = laneGeom();
      return Math.max(0, Math.min(3, Math.floor((x - x0) / lw)));
    }
    function onDown(e) {
      if (!S || S.phase !== 'play') return;
      e.preventDefault();
      const lane = laneAt(e.clientX);
      pointers.set(e.pointerId, lane);
      pressed[lane]++;
      hitLane(lane, e.pointerId);
    }
    function onUp(e) {
      if (!pointers.has(e.pointerId)) return;
      const lane = pointers.get(e.pointerId);
      pointers.delete(e.pointerId);
      pressed[lane] = Math.max(0, pressed[lane] - 1);
      releaseLane(lane, e.pointerId);
    }
    const keyDown = e => {
      const lane = KEYS[e.key.toLowerCase()];
      if (lane === undefined || e.repeat) return;
      const pid = 'k' + lane;
      if (pointers.has(pid)) return;
      pointers.set(pid, lane); pressed[lane]++;
      hitLane(lane, pid);
    };
    const keyUp = e => {
      const lane = KEYS[e.key.toLowerCase()];
      if (lane === undefined) return;
      onUp({ pointerId: 'k' + lane });
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);

    // ---------- Ecrãs ----------
    function releaseAll() {
      for (const [pid, lane] of [...pointers]) { pointers.delete(pid); releaseLane(lane, pid); }
      pressed.fill(0);
    }

    function showSelect() {
      if (S && S.phase !== 'over' && S.phase !== 'select') commitBest();
      if (bus) { try { bus.disconnect(); } catch {} bus = null; }
      S = null;
      pauseBtn.hidden = true;
      const fmt = v => v ? v.toLocaleString('pt-PT') : '—';
      overlay.innerHTML = `
        <h2>Ritmo</h2>
        <p>Toca na pista quando a nota chega à linha. Mantém o dedo nas notas longas.</p>
        <div class="rh-diffs" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%;max-width:360px">
          ${DIFFS.map(d => `<button class="btn center" data-d="${d.id}" style="padding:12px 4px;${d.id === selDiff ? 'background:#34386a;border-color:#ffcc4d' : ''}">${d.name}</button>`).join('')}
        </div>
        ${TRACKS.map((t, i) => `
          <button class="btn" data-t="${t.id}" style="display:flex;align-items:center;gap:12px">
            <span style="width:12px;height:36px;border-radius:6px;background:${LANE_COLORS[i]};flex:none"></span>
            <span style="flex:1"><b>${t.name}</b><small>${t.bpm} BPM · ${Math.round(t.bars * 16 * 15 / t.bpm)} s · recorde ${fmt(Arcade.store.get(bestKey(t.id, selDiff), 0))}</small></span>
            <span style="font-size:20px">▶</span>
          </button>`).join('')}
        <button class="btn center" data-a="mute">${muted ? '🔇 Som desligado' : '🔊 Som ligado'}</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-d]').forEach(b => { b.onclick = () => { selDiff = b.dataset.d; Arcade.store.set('rhythm:lastDiff', selDiff); showSelect(); }; });
      overlay.querySelectorAll('[data-t]').forEach(b => {
        b.onclick = () => startSong(TRACKS.find(t => t.id === b.dataset.t), DIFFS.find(d => d.id === selDiff));
      });
      overlay.querySelector('[data-a=mute]').onclick = () => { setMuted(!muted); ensureAudio(); showSelect(); };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function stopAudioClock() {
      if (S.useAudio) actx.suspend().catch(() => {});
      else perfPausedAt = (performance.now() - perfBase) / 1000;
    }

    function pause() {
      if (!S || (S.phase !== 'play' && S.phase !== 'countdown')) return;
      if (S.phase === 'play') stopAudioClock();
      S.phase = 'paused';
      releaseAll();
      commitBest();
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${S.track.name} · ${S.diff.name} · ${S.score.toLocaleString('pt-PT')} pontos</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="select">Escolher faixa</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; ensureAudio(); S.phase = 'countdown'; S.countdown = 1.5; };
      overlay.querySelector('[data-a=restart]').onclick = () => { commitBest(); startSong(S.track, S.diff); };
      overlay.querySelector('[data-a=select]').onclick = () => { if (actx) actx.resume().catch(() => {}); showSelect(); };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) { if (S && (S.phase === 'play' || S.phase === 'countdown')) pause(); else commitBest(); } };
    document.addEventListener('visibilitychange', onVis);

    function finish() {
      S.phase = 'over';
      releaseAll();
      const total = S.chart.length || 1;
      const acc = Math.round((S.counts.perfect + S.counts.good * 0.5) / total * 100);
      const record = S.score > S.startBest;
      commitBest();
      const grade = acc >= 95 ? 'S' : acc >= 85 ? 'A' : acc >= 70 ? 'B' : acc >= 50 ? 'C' : 'D';
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Faixa concluída'}</h2>
        <p>${S.track.name} · ${S.diff.name} · nota ${grade}${record ? '' : ` · recorde ${S.startBest.toLocaleString('pt-PT')}`}</p>
        <div class="stats">
          <div><b>${S.score.toLocaleString('pt-PT')}</b><span>pontos</span></div>
          <div><b>${acc}%</b><span>precisão</span></div>
          <div><b>${S.maxCombo}</b><span>combo máx.</span></div>
        </div>
        <div class="stats">
          <div><b style="color:#ffcc4d">${S.counts.perfect}</b><span>perfeito</span></div>
          <div><b style="color:#45aaf2">${S.counts.good}</b><span>bom</span></div>
          <div><b style="color:#ff5a6e">${S.counts.miss}</b><span>falhou</span></div>
        </div>
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="select">Escolher faixa</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      pauseBtn.hidden = true;
      overlay.querySelector('[data-a=again]').onclick = () => startSong(S.track, S.diff);
      overlay.querySelector('[data-a=select]').onclick = showSelect;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    // ---------- Desenho ----------
    function render() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      const { lw, x0, hitY } = laneGeom();
      const topY = top + 64;

      for (let i = 0; i < 4; i++) {
        const x = x0 + i * lw;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(255,255,255,.06)';
        ctx.fillRect(x, 0, lw, h);
        if (pressed[i] || flash[i]) {
          const g = ctx.createLinearGradient(0, hitY, 0, hitY - 220);
          const a = pressed[i] ? 0.28 : 0;
          g.addColorStop(0, LANE_COLORS[i] + Math.round(Math.max(a, flash[i] * 0.5) * 255).toString(16).padStart(2, '0'));
          g.addColorStop(1, LANE_COLORS[i] + '00');
          ctx.fillStyle = g;
          ctx.fillRect(x, hitY - 220, lw, 220);
        }
      }
      // Linha de acerto e "teclas"
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillRect(x0, hitY - 2, lw * 4, 4);
      for (let i = 0; i < 4; i++) {
        const cx = x0 + i * lw + lw / 2;
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.lineWidth = 3;
        ctx.globalAlpha = pressed[i] ? 1 : 0.55;
        ctx.beginPath(); ctx.arc(cx, hitY, lw * 0.3, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (S && S.started) {
        const t = S.phase === 'play' || S.phase === 'countdown' || S.phase === 'paused' || S.phase === 'over' ? songTime() : 0;
        const ap = S.diff.approach;
        const yOf = nt => hitY - (nt - t) / ap * (hitY - topY);
        const nr = Math.min(26, lw * 0.3);
        for (const n of S.chart) {
          if (n.t - t > ap * 1.05) break;
          if (n.state === 'hit' || (n.state === 'missed' && n.dur === 0 && t > n.t + 0.4)) continue;
          if (n.dur === 0 && n.state !== 'pending' && n.state !== 'missed') continue;
          const endT = n.t + n.dur;
          if (yOf(endT) > h + 40) continue;
          const cx = x0 + n.lane * lw + lw / 2;
          const col = LANE_COLORS[n.lane];
          const dead = n.state === 'missed' || n.state === 'dropped';
          ctx.globalAlpha = dead ? 0.3 : 1;
          if (n.dur > 0) {
            const yh = n.state === 'holding' ? hitY : yOf(n.t), ye = yOf(endT);
            ctx.fillStyle = col;
            ctx.globalAlpha = dead ? 0.2 : n.state === 'holding' ? 0.85 : 0.55;
            ctx.fillRect(cx - nr * 0.45, ye, nr * 0.9, Math.max(0, yh - ye));
            ctx.globalAlpha = dead ? 0.3 : 1;
            ctx.beginPath(); ctx.arc(cx, ye, nr * 0.45, 0, Math.PI * 2); ctx.fill();
            if (n.state === 'holding') continue;
          }
          const y = yOf(n.t);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(cx, y, nr, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.85)';
          ctx.beginPath(); ctx.arc(cx, y, nr * 0.38, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.globalAlpha = 1;

        for (const p of S.popups) {
          ctx.globalAlpha = Math.min(1, p.life * 3);
          ctx.fillStyle = p.color;
          ctx.font = '800 18px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(p.text, x0 + p.lane * lw + lw / 2, hitY - 50 - (0.6 - p.life) * 40);
        }
        ctx.globalAlpha = 1;

        // HUD (com fundo, para as notas entrarem por baixo dele)
        const y0 = top;
        const hg = ctx.createLinearGradient(0, y0 + 60, 0, y0 + 90);
        ctx.fillStyle = '#0f1020'; ctx.fillRect(0, 0, w, y0 + 60);
        hg.addColorStop(0, '#0f1020'); hg.addColorStop(1, 'rgba(15,16,32,0)');
        ctx.fillStyle = hg; ctx.fillRect(0, y0 + 60, w, 30);
        const prog = Math.max(0, Math.min(1, t / S.song.length));
        ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(0, y0, w, 5);
        ctx.fillStyle = '#ffcc4d'; ctx.fillRect(0, y0, w * prog, 5);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = '#eef0ff';
        ctx.font = '700 22px system-ui, sans-serif';
        ctx.fillText(S.score.toLocaleString('pt-PT'), 14, y0 + 18);
        ctx.fillStyle = '#9aa0c8';
        ctx.font = '500 12px system-ui, sans-serif';
        ctx.fillText(`${S.track.name} · ${S.diff.name} · recorde ${Math.max(S.score, S.startBest).toLocaleString('pt-PT')}`, 14, y0 + 46);
        if (S.combo >= 3 && S.phase !== 'over') {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#eef0ff';
          ctx.font = '800 34px system-ui, sans-serif';
          ctx.fillText(S.combo, w / 2, h * 0.38);
          ctx.font = '600 13px system-ui, sans-serif';
          ctx.fillStyle = '#9aa0c8';
          ctx.fillText('combo', w / 2, h * 0.38 + 38);
        }
        if (mult() > 1) {
          ctx.textAlign = 'right';
          ctx.fillStyle = LANE_COLORS[mult() - 1];
          ctx.font = '800 20px system-ui, sans-serif';
          ctx.fillText('×' + mult(), w - 72, y0 + 30);
        }
        if (t < S.song.intro * 16 * S.song.stepDur - 0.6 && S.phase === 'play') {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#eef0ff';
          ctx.font = '700 22px system-ui, sans-serif';
          ctx.fillText('Prepara-te…', w / 2, h * 0.3);
        }
        if (S.phase === 'countdown') {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffcc4d';
          ctx.font = '800 64px system-ui, sans-serif';
          ctx.fillText(Math.ceil(S.countdown / 0.5), w / 2, h * 0.3);
        }
        ctx.textAlign = 'left';
      }
    }

    // Gancho de depuração opcional (só para testes automáticos).
    if (window.ARCADE_DEBUG) {
      window.ARCADE_DEBUG.rhythm = {
        state() {
          if (!S) return { phase: 'select' };
          const g = laneGeom();
          return {
            phase: S.phase, started: !!S.started, useAudio: S.useAudio, audioState: actx && actx.state,
            t: S.started ? songTime() : null, score: S.score, combo: S.combo, maxCombo: S.maxCombo,
            counts: { ...S.counts }, holdsDone: S.holdsDone, length: S.song.length,
            lanesX: [0, 1, 2, 3].map(i => g.x0 + i * g.lw + g.lw / 2), hitY: g.hitY,
            notes: S.chart.map(n => ({ id: n.id, t: n.t, lane: n.lane, dur: n.dur, state: n.state })),
          };
        },
      };
    }

    showSelect();
    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        commitBest();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', keyDown);
        window.removeEventListener('keyup', keyUp);
        document.removeEventListener('visibilitychange', onVis);
        if (actx) { try { actx.close(); } catch {} }
        if (window.ARCADE_DEBUG) delete window.ARCADE_DEBUG.rhythm;
      },
    };
  }

  Arcade.register({
    id: 'rhythm',
    title: 'Ritmo',
    icon: '🎵',
    color: '#a55eea',
    desc: 'Toca nas pistas ao ritmo da música. Mantém o dedo nas notas longas.',
    best: () => {
      let best = 0;
      for (const t of TRACKS) for (const d of DIFFS) best = Math.max(best, Arcade.store.get(bestKey(t.id, d.id), 0));
      return best ? best.toLocaleString('pt-PT') + ' pts' : '—';
    },
    create,
  });
})();
