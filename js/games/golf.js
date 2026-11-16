// Mini Golfe: arrasta para trás a partir da bola para apontar e escolher a força; larga para dar a tacada.
(function () {
  const TAU = Math.PI * 2;
  const C = 20, COLS = 5, ROWS = 8;          // campo em unidades lógicas: 100 x 160
  const BR = 2, CUP_R = 3.3, MAXV = 210, MAX_STROKES = 10;
  const DT = 1 / 240, RAMP_A = 30;
  const SAVE_KEY = 'golf:save', BEST_KEY = 'golf:best';
  const DV = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
  const dirKey = (dx, dy) => dy < 0 ? 'U' : dy > 0 ? 'D' : dx < 0 ? 'L' : 'R';

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Percurso clássico (desenhado à mão) ----------
  // Cada buraco: célula de partida, movimentos célula a célula e obstáculos (i = índice da célula no caminho).
  const CLASSIC = [
    { name: 'Aquecimento', start: [2, 7], moves: 'UUUUU', par: 2, obs: [{ t: 'bump', i: 3 }] },
    { name: 'Cotovelo', start: [1, 7], moves: 'UUUURRR', par: 3, obs: [{ t: 'water', i: 2, s: 'a' }, { t: 'sand', i: 6 }] },
    { name: 'Lagoa', start: [0, 7], moves: 'UUURRRRUUU', par: 4, obs: [{ t: 'sand', i: 1 }, { t: 'water', i: 5, s: 'both' }, { t: 'water', i: 9, s: 'a' }] },
    { name: 'Moinho', start: [2, 7], moves: 'UUUUUU', par: 3, obs: [{ t: 'mill', i: 3, w: 1.3 }, { t: 'sand', i: 5 }] },
    { name: 'Corrente', start: [0, 6], moves: 'RRRRUUUULLLL', par: 4, obs: [{ t: 'ramp', i: 2, d: 'R' }, { t: 'ramp', i: 6, d: 'L' }, { t: 'ramp', i: 10, d: 'L' }] },
    { name: 'Portal', start: [0, 7], moves: 'RRRRUULLLLUURRRRUU', par: 3, obs: [{ t: 'tele', i: 2, j: 15 }, { t: 'water', i: 8, s: 'a' }, { t: 'sand', i: 12 }] },
    { name: 'Barreiras', start: [2, 7], moves: 'UUUUUUU', par: 3, obs: [{ t: 'gate', i: 2, w: 1.6 }, { t: 'gate', i: 5, w: -1.9 }] },
    { name: 'Escadaria', start: [0, 7], moves: 'RURURURU', par: 4, obs: [{ t: 'sand', i: 4 }] },
    { name: 'Grande final', start: [2, 7], moves: 'UULLUUURRRRUU', par: 5, obs: [{ t: 'water', i: 3, s: 'b' }, { t: 'gate', i: 6, w: 1.5 }, { t: 'mill', i: 9, w: -1.2 }, { t: 'ramp', i: 12, d: 'U' }] },
  ];

  // ---------- Gerador procedimental ----------
  // O caminho é uma sequência de células ligadas, sempre fechada por paredes; os obstáculos nunca cortam
  // a passagem toda (a água deixa o centro livre, as barreiras e moinhos deixam sempre um intervalo), por isso há sempre solução.
  function genHole(r, h) {
    const minL = 5 + Math.floor(h / 2), maxL = 8 + h;
    for (let tries = 0; tries < 800; tries++) {
      const L = minL + Math.floor(r() * (maxL - minL + 1));
      const sx = Math.floor(r() * COLS);
      const path = [[sx, ROWS - 1]];
      const used = new Set([sx + ',' + (ROWS - 1)]);
      let moves = '', ok = true;
      while (path.length < L) {
        const [x, y] = path[path.length - 1];
        const opts = [];
        for (const m of 'UDLR') {
          const nx = x + DV[m][0], ny = y + DV[m][1];
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || used.has(nx + ',' + ny)) continue;
          let touch = 0; // não encostar a outras partes do caminho (corredores limpos)
          for (const k of 'UDLR') {
            const qx = nx + DV[k][0], qy = ny + DV[k][1];
            if (!(qx === x && qy === y) && used.has(qx + ',' + qy)) touch++;
          }
          if (touch) continue;
          const wgt = (m === 'U' ? 3 : m === 'D' ? 0.6 : 1.6) * (moves.endsWith(m) ? 1.5 : 1);
          opts.push([m, wgt]);
        }
        if (!opts.length) { ok = false; break; }
        let tot = opts.reduce((s, o) => s + o[1], 0), pick = r() * tot, m = opts[0][0];
        for (const o of opts) { pick -= o[1]; if (pick <= 0) { m = o[0]; break; } }
        moves += m;
        const n = [x + DV[m][0], y + DV[m][1]];
        path.push(n); used.add(n[0] + ',' + n[1]);
      }
      if (!ok) continue;
      let turns = 0;
      for (let i = 1; i < moves.length; i++) if (moves[i] !== moves[i - 1]) turns++;
      if ((h >= 2 && turns < 1) || (h >= 5 && turns < 2)) continue;

      const straight = i => i > 0 && i < L - 1 && moves[i - 1] === moves[i];
      const obs = [];
      const taken = new Set();
      const free = i => !taken.has(i) && !taken.has(i - 1) && !taken.has(i + 1);
      const cand = [];
      for (let i = 1; i < L - 1; i++) cand.push(i);
      for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
      const want = 1 + Math.floor(r() * Math.min(3, 1 + h / 3));
      let hazard = false;
      for (const i of cand) {
        if (obs.length >= want) break;
        if (!free(i)) continue;
        let o;
        if (straight(i)) {
          const kinds = h < 2 ? ['sand', 'bump', 'ramp'] : ['sand', 'water', 'ramp', 'mill', 'gate', 'bump', 'water'];
          const t = kinds[Math.floor(r() * kinds.length)];
          o = { t, i };
          if (t === 'water') { o.s = h >= 6 && r() < 0.3 ? 'both' : r() < 0.5 ? 'a' : 'b'; hazard = true; }
          if (t === 'ramp') {
            const d = moves[i];
            o.d = r() < 0.6 ? d : (d === 'U' || d === 'D') ? (r() < 0.5 ? 'L' : 'R') : (r() < 0.5 ? 'U' : 'D');
          }
          if (t === 'mill') { o.w = (r() < 0.5 ? -1 : 1) * (1.1 + r() * 0.5); hazard = true; }
          if (t === 'gate') { o.w = (r() < 0.5 ? -1 : 1) * (1.3 + r() * 0.7); o.ph = r() * TAU; hazard = true; }
        } else {
          o = r() < 0.5 ? { t: 'sand', i } : { t: 'ramp', i, d: moves[i] };
        }
        obs.push(o); taken.add(i);
      }
      let tele = false;
      if (h >= 3 && L >= 9 && r() < 0.4) {
        const a = [], b = [];
        for (let i = 1; i < L - 1; i++) if (straight(i) && free(i)) (i < L - 5 ? a : b).push(i);
        const ia = a[Math.floor(r() * a.length)];
        const jb = ia != null ? b.filter(j => j >= ia + 3) : [];
        if (ia != null && jb.length) {
          const j = jb[Math.floor(r() * jb.length)];
          obs.push({ t: 'tele', i: ia, j }); taken.add(ia); taken.add(j); tele = true;
        }
      }
      const runs = turns + 1;
      const par = Math.max(2, Math.min(5, 2 + Math.floor(runs / 3) + (hazard ? 1 : 0) - (tele ? 1 : 0)));
      return { name: 'Buraco ' + (h + 1), start: path[0], moves, par, obs };
    }
    return CLASSIC[h];
  }

  function genCourse(seed) {
    const r = mulberry32(seed);
    const holes = [];
    for (let h = 0; h < 9; h++) holes.push(genHole(r, h));
    return holes;
  }

  // ---------- Construção do buraco (geometria) ----------
  function buildHole(spec) {
    const cells = [spec.start.slice()];
    for (const m of spec.moves) {
      const [x, y] = cells[cells.length - 1];
      cells.push([x + DV[m][0], y + DV[m][1]]);
    }
    const L = cells.length;
    const H = {
      name: spec.name, par: spec.par, cells, idx: new Map(cells.map((c, i) => [c[0] + ',' + c[1], i])),
      walls: [], sand: [], water: [], ramps: [], mills: [], gates: [], teles: [], bumps: [], turns: [],
    };
    const ctr = i => ({ x: (cells[i][0] + 0.5) * C, y: (cells[i][1] + 0.5) * C });
    const seen = new Set();
    const addWall = (key, x1, y1, x2, y2) => {
      if (key) { if (seen.has(key)) return; seen.add(key); }
      H.walls.push([x1, y1, x2, y2]);
    };
    const axis = i => {
      const a = i < L - 1 ? cells[i] : cells[i - 1], b = i < L - 1 ? cells[i + 1] : cells[i];
      return [b[0] - a[0], b[1] - a[1]];
    };
    for (let i = 0; i < L; i++) {
      const [cx, cy] = cells[i];
      const open = new Set();
      if (i > 0) open.add(dirKey(cells[i - 1][0] - cx, cells[i - 1][1] - cy));
      if (i < L - 1) open.add(dirKey(cells[i + 1][0] - cx, cells[i + 1][1] - cy));
      const x0 = cx * C, y0 = cy * C, x1 = x0 + C, y1 = y0 + C;
      if (!open.has('U')) addWall('h' + cx + ',' + cy, x0, y0, x1, y0);
      if (!open.has('D')) addWall('h' + cx + ',' + (cy + 1), x0, y1, x1, y1);
      if (!open.has('L')) addWall('v' + cx + ',' + cy, x0, y0, x0, y1);
      if (!open.has('R')) addWall('v' + (cx + 1) + ',' + cy, x1, y0, x1, y1);
      // Curva: parede diagonal no canto de fora, para a bola poder fazer tabela
      if (open.size === 2 && !(open.has('U') && open.has('D')) && !(open.has('L') && open.has('R'))) {
        const left = !open.has('L'), top = !open.has('U');
        const px = left ? x0 : x1, py = top ? y0 : y1, sx = left ? 1 : -1, sy = top ? 1 : -1, k = 6;
        addWall(null, px + sx * k, py, px, py + sy * k);
        H.turns.push([px, py, sx, sy, k]);
      }
    }
    for (const o of spec.obs || []) {
      const [cx, cy] = cells[o.i];
      const x0 = cx * C, y0 = cy * C, c = ctr(o.i), ax = axis(o.i), horiz = ax[1] === 0;
      if (o.t === 'sand') H.sand.push({ x: x0 + 3, y: y0 + 3, w: C - 6, h: C - 6 });
      else if (o.t === 'water') {
        const W = 6, strips = o.s === 'both' ? ['a', 'b'] : [o.s];
        for (const s of strips) {
          if (horiz) H.water.push({ x: x0, y: s === 'a' ? y0 : y0 + C - W, w: C, h: W });
          else H.water.push({ x: s === 'a' ? x0 : x0 + C - W, y: y0, w: W, h: C });
        }
      } else if (o.t === 'ramp') {
        const d = DV[o.d];
        H.ramps.push({ x: x0, y: y0, w: C, h: C, ax: d[0] * RAMP_A, ay: d[1] * RAMP_A });
      } else if (o.t === 'mill') H.mills.push({ x: c.x, y: c.y, len: 8.6, w: o.w || 1.3, ph: o.ph || 0 });
      else if (o.t === 'gate') H.gates.push({ x: c.x, y: c.y, px: -ax[1], py: ax[0], half: 5, amp: 5, w: o.w || 1.6, ph: o.ph || 0 });
      else if (o.t === 'bump') {
        const R = 3.5, p = [[c.x, c.y - R], [c.x + R, c.y], [c.x, c.y + R], [c.x - R, c.y]];
        for (let k = 0; k < 4; k++) addWall(null, p[k][0], p[k][1], p[(k + 1) % 4][0], p[(k + 1) % 4][1]);
        H.bumps.push(p);
      } else if (o.t === 'tele') {
        const b = ctr(o.j);
        H.teles.push({ ax: c.x, ay: c.y, bx: b.x, by: b.y });
      }
    }
    H.bb = {
      x0: Math.min(...cells.map(c => c[0])) * C, y0: Math.min(...cells.map(c => c[1])) * C,
      x1: (Math.max(...cells.map(c => c[0])) + 1) * C, y1: (Math.max(...cells.map(c => c[1])) + 1) * C,
    };
    H.tee = ctr(0);
    H.cup = ctr(L - 1);
    H.movers = H.mills.length + H.gates.length > 0;
    // Partição espacial: cada célula guarda as paredes que lhe podem tocar.
    H.buckets = [];
    for (let k = 0; k < COLS * ROWS; k++) H.buckets.push([]);
    for (const s of H.walls) {
      const m = BR + 0.5;
      const ax0 = Math.max(0, Math.floor((Math.min(s[0], s[2]) - m) / C)), ax1 = Math.min(COLS - 1, Math.floor((Math.max(s[0], s[2]) + m) / C));
      const ay0 = Math.max(0, Math.floor((Math.min(s[1], s[3]) - m) / C)), ay1 = Math.min(ROWS - 1, Math.floor((Math.max(s[1], s[3]) + m) / C));
      for (let y = ay0; y <= ay1; y++) for (let x = ax0; x <= ax1; x++) H.buckets[y * COLS + x].push(s);
    }
    return H;
  }

  // ---------- Física ----------
  const inRect = (r, b) => b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h;

  function dynSegs(H, t) {
    const out = [];
    for (const m of H.mills) {
      const a0 = m.ph + t * m.w;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 2;
        out.push({ x1: m.x, y1: m.y, x2: m.x + Math.cos(a) * m.len, y2: m.y + Math.sin(a) * m.len, mill: m });
      }
    }
    for (const g of H.gates) {
      const off = Math.sin(g.ph + t * g.w) * g.amp, v = Math.cos(g.ph + t * g.w) * g.amp * g.w;
      const cx = g.x + g.px * off, cy = g.y + g.py * off;
      out.push({ x1: cx - g.px * g.half, y1: cy - g.py * g.half, x2: cx + g.px * g.half, y2: cy + g.py * g.half, vx: g.px * v, vy: g.py * v });
    }
    return out;
  }

  // Colisão círculo/segmento, com a velocidade do segmento (para os obstáculos que se mexem).
  function collide(b, x1, y1, x2, y2, seg) {
    const ex = x2 - x1, ey = y2 - y1, l2 = ex * ex + ey * ey;
    let u = l2 ? ((b.x - x1) * ex + (b.y - y1) * ey) / l2 : 0;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = x1 + ex * u, qy = y1 + ey * u;
    let nx = b.x - qx, ny = b.y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= BR * BR) return false;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { nx = -ey; ny = ex; d = Math.hypot(nx, ny) || 1; }
    nx /= d; ny /= d;
    b.x = qx + nx * BR; b.y = qy + ny * BR;
    let svx = 0, svy = 0;
    if (seg) {
      if (seg.mill) { svx = -seg.mill.w * (qy - seg.mill.y); svy = seg.mill.w * (qx - seg.mill.x); }
      else { svx = seg.vx; svy = seg.vy; }
    }
    const rvx = b.vx - svx, rvy = b.vy - svy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const e = 0.6;
      // a componente tangencial também perde energia (atrito na tabela)
      const tx = rvx - vn * nx, ty = rvy - vn * ny;
      b.vx = tx * 0.88 - e * vn * nx + svx;
      b.vy = ty * 0.88 - e * vn * ny + svy;
      if (-vn > 25) b.bounced = true;
    }
    return true;
  }

  // Um passo de física. Devolve null, 'stop', 'sunk' ou 'water'.
  function physStep(H, b, t, dt) {
    let sp = Math.hypot(b.vx, b.vy);
    let c1 = 20, c2 = 0.9;
    for (const s of H.sand) if (inRect(s, b)) { c1 = 95; c2 = 2.6; break; }
    let ax = 0, ay = 0;
    for (const r of H.ramps) if (inRect(r, b)) { ax += r.ax; ay += r.ay; }
    if (sp > 0) {
      const dec = (c1 + c2 * sp) * dt;
      if (dec >= sp) { b.vx = 0; b.vy = 0; } else { const k = (sp - dec) / sp; b.vx *= k; b.vy *= k; }
    }
    b.vx += ax * dt; b.vy += ay * dt;
    let dxc = H.cup.x - b.x, dyc = H.cup.y - b.y, dc = Math.hypot(dxc, dyc);
    sp = Math.hypot(b.vx, b.vy);
    if (dc < CUP_R + 1.2 && sp < 60 && dc > 0.01) { b.vx += dxc / dc * 110 * dt; b.vy += dyc / dc * 110 * dt; }
    b.x += b.vx * dt; b.y += b.vy * dt;

    for (const s of dynSegs(H, t)) collide(b, s.x1, s.y1, s.x2, s.y2, s);
    const cx = Math.max(0, Math.min(COLS - 1, Math.floor(b.x / C))), cy = Math.max(0, Math.min(ROWS - 1, Math.floor(b.y / C)));
    for (let it = 0; it < 2; it++) for (const s of H.buckets[cy * COLS + cx]) collide(b, s[0], s[1], s[2], s[3], null);

    for (const w of H.water) if (inRect(w, b)) return 'water';
    dxc = H.cup.x - b.x; dyc = H.cup.y - b.y; dc = Math.hypot(dxc, dyc);
    sp = Math.hypot(b.vx, b.vy);
    if (dc < CUP_R && sp < 60) return 'sunk';

    for (let k = 0; k < H.teles.length; k++) {
      const p = H.teles[k];
      if (b.tele === k) {
        if (Math.hypot(b.x - p.bx, b.y - p.by) > 4.5) b.tele = -1;
      } else if (Math.hypot(b.x - p.ax, b.y - p.ay) < 2.8) {
        b.x = p.bx; b.y = p.by; b.tele = k; b.warped = true;
      }
    }
    if (ax || ay) {
      b.slow = sp < 6 ? (b.slow || 0) + dt : 0;
      if (b.slow > 0.6) { b.vx = b.vy = 0; return 'stop'; }
    } else if (sp < 1.8) { b.vx = b.vy = 0; return 'stop'; }
    return null;
  }

  // Bola parada a ser empurrada por um obstáculo móvel?
  function pushedAtRest(H, b, t) {
    for (const s of dynSegs(H, t)) if (collide(b, s.x1, s.y1, s.x2, s.y2, s)) return true;
    return false;
  }

  // ---------- Solucionador (usado pelo gancho de debug para provar que os buracos têm solução) ----------
  function simulate(H, b0, a, p, t) {
    const b = { x: b0.x, y: b0.y, vx: Math.cos(a) * p * MAXV, vy: Math.sin(a) * p * MAXV, slow: 0, tele: b0.tele == null ? -1 : b0.tele };
    let el = 0, r = null;
    while (el < 25) { r = physStep(H, b, t + el, DT); el += DT; if (r) break; }
    return { r: r || 'stop', x: b.x, y: b.y, el, tele: b.tele };
  }
  function remaining(H, x, y) {
    const i = H.idx.get(Math.floor(x / C) + ',' + Math.floor(y / C));
    if (i == null) return 1e4;
    const L = H.cells.length;
    if (i === L - 1) return Math.hypot(x - H.cup.x, y - H.cup.y);
    const n = H.cells[i + 1];
    return Math.hypot(x - (n[0] + 0.5) * C, y - (n[1] + 0.5) * C) + (L - 2 - i) * C;
  }
  function solveShot(H, b, t, delay) {
    const delays = H.movers ? [delay - 0.1, delay, delay + 0.2] : [delay];
    const POW = [0.12, 0.2, 0.3, 0.42, 0.55, 0.7, 0.85, 1];
    const here = remaining(H, b.x, b.y);
    let best = null;
    for (let ai = 0; ai < 90; ai++) {
      const a = ai / 90 * TAU;
      for (const p of POW) {
        let worst = -Infinity, end = null;
        for (const d of delays) {
          const s = simulate(H, b, a, p, t + d);
          const sc = s.r === 'sunk' ? -100 + p : s.r === 'water' ? here + 40 : remaining(H, s.x, s.y);
          if (sc > worst) { worst = sc; end = s; }
        }
        if (!best || worst < best.score) best = { angle: a, power: p, score: worst, result: end.r };
      }
    }
    return best;
  }
  function verifyCourse(holes) {
    return holes.map(spec => {
      const H = buildHole(spec);
      const b = { x: H.tee.x, y: H.tee.y, tele: -1 };
      let t = 0, strokes = 0;
      while (strokes < MAX_STROKES) {
        const s = solveShot(H, b, t, 0);
        strokes++;
        const res = simulate(H, b, s.angle, s.power, t);
        t += res.el + 0.5;
        if (res.r === 'sunk') return { par: H.par, strokes, ok: true };
        if (res.r === 'water') { strokes++; continue; }
        b.x = res.x; b.y = res.y; b.tele = res.tele;
      }
      return { par: H.par, strokes, ok: false };
    });
  }

  // ---------- Textos ----------
  function scoreName(s, par) {
    if (s === 1) return 'Buraco à primeira!';
    const d = s - par;
    if (d <= -3) return 'Albatroz!';
    if (d === -2) return 'Eagle!';
    if (d === -1) return 'Birdie!';
    if (d === 0) return 'Par';
    if (d === 1) return 'Bogey';
    if (d === 2) return 'Duplo bogey';
    return '+' + d;
  }
  const rel = d => d === 0 ? 'par' : (d > 0 ? '+' : '−') + Math.abs(d);
  const todaySeed = () => { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const courseId = (kind, seed) => kind === 'classic' ? 'classic' : 'seed:' + seed;
  function courseName(kind, seed) {
    if (kind === 'classic') return 'Clássico';
    if (kind === 'daily') return 'Percurso do dia';
    return 'Seed ' + seed;
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

    let R = null, course = null, H = null;
    let phase = 'pick';
    let ball = { x: 0, y: 0, vx: 0, vy: 0, slow: 0, tele: -1 };
    let T = 0, acc = 0, sinkT = 0, introT = 0, drag = null, saveT = 3;
    let msg = null, splash = null;

    // ---------- Volta ----------
    function startRound(kind, seed, saved) {
      course = kind === 'classic' ? CLASSIC : genCourse(seed);
      R = saved || { v: 1, kind, seed, hole: 0, scores: [], strokes: 0, ball: null, tele: -1 };
      overlay.hidden = true;
      loadHole();
    }
    function loadHole() {
      H = buildHole(course[R.hole]);
      const p = R.ball || H.tee;
      ball = { x: p.x, y: p.y, vx: 0, vy: 0, slow: 0, tele: R.ball ? (R.tele ?? -1) : -1 };
      T = 0; acc = 0; drag = null; msg = null; splash = null;
      introT = 2;
      phase = 'aim';
      R.prev = { x: ball.x, y: ball.y };
    }

    function saveRound() {
      if (!R || phase === 'pick' || phase === 'done') return;
      const rolling = phase === 'roll' && R.pre;
      Arcade.store.set(SAVE_KEY, {
        v: 1, kind: R.kind, seed: R.seed, hole: R.hole, scores: R.scores,
        strokes: rolling ? R.pre.strokes : R.strokes,
        ball: rolling ? { x: R.pre.x, y: R.pre.y } : phase === 'card' ? null : { x: ball.x, y: ball.y },
        tele: ball.tele,
      });
    }

    function shoot(a, p) {
      R.pre = { strokes: R.strokes, x: ball.x, y: ball.y };
      R.prev = { x: ball.x, y: ball.y };
      R.strokes++;
      R.ball = { x: ball.x, y: ball.y };
      ball.vx = Math.cos(a) * p * MAXV;
      ball.vy = Math.sin(a) * p * MAXV;
      ball.slow = 0;
      phase = 'roll';
      acc = 0;
      Arcade.buzz(12);
    }

    function afterStop() {
      phase = 'aim';
      R.ball = { x: ball.x, y: ball.y };
      R.tele = ball.tele;
      if (R.strokes >= MAX_STROKES) {
        flash('Limite de ' + MAX_STROKES + ' pancadas');
        finishHole(MAX_STROKES);
        return;
      }
      saveRound();
    }

    function flash(text, color) { msg = { text, t: 1.8, color: color || '#eef0ff' }; }

    function finishHole(score) {
      R.scores.push(score);
      R.hole++;
      R.strokes = 0; R.ball = null; R.pre = null; R.tele = -1;
      if (R.hole >= 9) { endRound(); return; }
      phase = 'card';
      saveRound();
      const par = course[R.hole - 1].par;
      overlay.innerHTML = `
        <h2>${scoreName(score, par)}</h2>
        <p>Buraco ${R.hole} · par ${par} · ${score} pancada${score === 1 ? '' : 's'}</p>
        ${cardHTML()}
        <button class="btn primary" data-a="next">Buraco ${R.hole + 1}</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=next]').onclick = () => { overlay.hidden = true; loadHole(); saveRound(); };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function endRound() {
      phase = 'done';
      Arcade.store.set(SAVE_KEY, null);
      const total = R.scores.reduce((s, v) => s + v, 0);
      const par = course.reduce((s, h) => s + h.par, 0);
      const id = courseId(R.kind, R.seed);
      const bests = Arcade.store.get(BEST_KEY, {}) || {};
      const prev = bests[id];
      const record = prev == null || total < prev;
      if (record) { bests[id] = total; Arcade.store.set(BEST_KEY, bests); }
      overlay.innerHTML = `
        <h2>${record ? 'Novo recorde!' : 'Volta terminada'}</h2>
        <p>${courseName(R.kind, R.seed)}${record || prev == null ? '' : ` · recorde: ${prev}`}</p>
        <div class="stats">
          <div><b>${total}</b><span>pancadas</span></div>
          <div><b>${rel(total - par)}</b><span>vs. par ${par}</span></div>
          <div><b>${Math.min(total, prev ?? total)}</b><span>recorde</span></div>
        </div>
        ${cardHTML()}
        <button class="btn primary" data-a="again">Jogar outra vez</button>
        <button class="btn center" data-a="other">Outro percurso</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      const k = R.kind, s = R.seed;
      overlay.querySelector('[data-a=again]').onclick = () => startRound(k, s);
      overlay.querySelector('[data-a=other]').onclick = showPicker;
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function cardHTML() {
      const cell = (txt, bg, fg, bold) => `<div style="background:${bg};color:${fg};border-radius:6px;padding:6px 0;${bold ? 'font-weight:700' : ''}">${txt}</div>`;
      let a = cell('', 'transparent', '#9aa0c8'), b = cell('Par', '#1a1c33', '#9aa0c8'), c = cell('Tu', '#1a1c33', '#9aa0c8');
      let tp = 0, ts = 0;
      for (let i = 0; i < 9; i++) {
        const par = course[i].par, s = R.scores[i];
        tp += par;
        a += cell(i + 1, 'transparent', R.hole === i ? '#ffcc4d' : '#9aa0c8', R.hole === i);
        b += cell(par, '#1a1c33', '#eef0ff');
        if (s == null) c += cell(i === R.hole && R.strokes ? R.strokes : '·', '#1a1c33', '#9aa0c8');
        else {
          ts += s;
          c += cell(s, s < par ? '#1f7a4d' : s > par ? '#7a2a36' : '#1a1c33', '#fff', true);
        }
      }
      a += cell('Tot', 'transparent', '#9aa0c8');
      b += cell(tp, '#1a1c33', '#eef0ff', true);
      c += cell(ts, '#1a1c33', '#ffcc4d', true);
      return `<div style="display:grid;grid-template-columns:32px repeat(9,1fr) 36px;gap:3px;width:100%;max-width:360px;font-size:13px;text-align:center;margin-bottom:8px">${a}${b}${c}</div>`;
    }

    // ---------- Ecrãs ----------
    function showPicker() {
      phase = 'pick';
      R = null;
      const bests = Arcade.store.get(BEST_KEY, {}) || {};
      const daily = todaySeed();
      const bestTxt = id => bests[id] != null ? `Recorde: ${bests[id]}` : 'Sem recorde';
      overlay.innerHTML = `
        <h2>Mini Golfe</h2>
        <p>Escolhe um percurso de 9 buracos</p>
        <button class="btn" data-a="classic"><b>Clássico</b><small>Desenhado à mão · ${bestTxt('classic')}</small></button>
        <button class="btn" data-a="daily"><b>Percurso do dia</b><small>Seed ${daily} · ${bestTxt('seed:' + daily)}</small></button>
        <button class="btn" data-a="random"><b>Percurso aleatório</b><small>Gerado a partir de uma seed nova</small></button>
        <div style="display:flex;gap:8px;width:100%;max-width:360px">
          <input data-a="seed" type="number" inputmode="numeric" placeholder="Seed (número)" style="flex:1;min-width:0;min-height:48px;background:#1a1c33;border:2px solid #34386a;color:#eef0ff;border-radius:14px;padding:0 14px;font:inherit;font-size:16px">
          <button class="btn center" data-a="go" style="width:auto;padding:0 18px;min-height:48px">Jogar</button>
        </div>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=classic]').onclick = () => startRound('classic', 0);
      overlay.querySelector('[data-a=daily]').onclick = () => startRound('daily', daily);
      overlay.querySelector('[data-a=random]').onclick = () => startRound('seed', 1 + Math.floor(Math.random() * 999999));
      overlay.querySelector('[data-a=go]').onclick = () => {
        const v = Math.abs(Math.floor(+overlay.querySelector('[data-a=seed]').value)) || 1;
        startRound('seed', v);
      };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function pause() {
      if (phase !== 'aim' && phase !== 'roll') return;
      const before = phase;
      saveRound();
      phase = 'paused';
      drag = null;
      overlay.innerHTML = `
        <h2>Pausa</h2>
        <p>${courseName(R.kind, R.seed)} · buraco ${R.hole + 1}/9 · ${R.strokes} pancada${R.strokes === 1 ? '' : 's'}</p>
        ${cardHTML()}
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar a volta</button>
        <button class="btn center" data-a="other">Outro percurso</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; phase = before; };
      overlay.querySelector('[data-a=restart]').onclick = () => startRound(R.kind, R.seed);
      overlay.querySelector('[data-a=other]').onclick = () => { Arcade.store.set(SAVE_KEY, null); showPicker(); };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }
    pauseBtn.onclick = pause;

    function offerResume(data) {
      phase = 'resume';
      const c = data.kind === 'classic' ? CLASSIC : genCourse(data.seed);
      const done = data.scores.reduce((s, v) => s + v, 0);
      const par = c.slice(0, data.hole).reduce((s, h) => s + h.par, 0);
      overlay.innerHTML = `
        <h2>Volta guardada</h2>
        <p>${courseName(data.kind, data.seed)}</p>
        <div class="stats">
          <div><b>${data.hole + 1}/9</b><span>buraco</span></div>
          <div><b>${done}</b><span>pancadas</span></div>
          <div><b>${rel(done - par)}</b><span>vs. par</span></div>
        </div>
        <button class="btn primary" data-a="go">Continuar volta</button>
        <button class="btn center" data-a="new">Nova volta</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => startRound(data.kind, data.seed, {
        v: 1, kind: data.kind, seed: data.seed, hole: data.hole, scores: data.scores.slice(),
        strokes: data.strokes || 0, ball: data.ball, tele: data.tele ?? -1,
      });
      overlay.querySelector('[data-a=new]').onclick = () => { Arcade.store.set(SAVE_KEY, null); showPicker(); };
    }

    const onVis = () => { if (document.hidden) { if (phase === 'aim' || phase === 'roll') pause(); else saveRound(); } };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Entrada (arrastar e largar) ----------
    // Enquadra só as células do buraco (com margem), para os buracos pequenos ficarem maiores.
    function layout() {
      const bb = H.bb, m = 4;
      const bx = bb.x0 - m, by = bb.y0 - m, fw = bb.x1 - bb.x0 + 2 * m, fh = bb.y1 - bb.y0 + 2 * m;
      const y0 = top + 80, availH = view.h - y0 - Math.min(110, view.h * 0.13), availW = view.w - 16; // espaço por baixo para arrastar
      const s = Math.max(0.5, Math.min(availW / fw, availH / fh, 5.2));
      return { s, ox: (view.w - fw * s) / 2 - bx * s, oy: y0 + Math.max(0, (availH - fh * s) / 2) - by * s };
    }
    const maxPull = () => Math.max(90, Math.min(150, Math.min(view.w, view.h) * 0.32));
    function pt(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onDown(e) {
      if (phase !== 'aim' || drag) return;
      const p = pt(e);
      drag = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y };
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const p = pt(e);
      drag.x = p.x; drag.y = p.y;
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      if (phase !== 'aim') return;
      const dx = d.sx - d.x, dy = d.sy - d.y, len = Math.hypot(dx, dy);
      if (len < 12) return;
      shoot(Math.atan2(dy, dx), Math.min(1, len / maxPull()));
    }
    const onCancel = () => { drag = null; };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);

    // ---------- Atualização ----------
    function update(dt) {
      if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
      if (splash) { splash.t -= dt; if (splash.t <= 0) splash = null; }
      if (introT > 0) introT -= dt;
      if (phase === 'aim') {
        T += dt;
        if (H.movers && pushedAtRest(H, ball, T)) {
          R.pre = { strokes: R.strokes, x: ball.x, y: ball.y };
          R.prev = { x: ball.x, y: ball.y };
          drag = null;
          phase = 'roll';
        }
      } else if (phase === 'roll') {
        acc += dt;
        while (acc >= DT && phase === 'roll') {
          acc -= DT;
          const res = physStep(H, ball, T, DT);
          T += DT;
          if (ball.bounced) { ball.bounced = false; Arcade.buzz(6); }
          if (ball.warped) { ball.warped = false; flash('Teletransporte!', '#c39bff'); }
          if (res === 'water') {
            splash = { x: ball.x, y: ball.y, t: 0.6 };
            R.strokes++;
            ball.x = R.prev.x; ball.y = R.prev.y; ball.vx = ball.vy = 0;
            ball.tele = -1;
            flash('Água! +1 pancada', '#6fb6ff');
            Arcade.buzz(40);
            afterStop();
          } else if (res === 'sunk') {
            phase = 'sink'; sinkT = 0;
            Arcade.buzz([20, 40, 20]);
          } else if (res === 'stop') afterStop();
        }
      } else if (phase === 'sink') {
        T += dt;
        sinkT += dt;
        ball.x += (H.cup.x - ball.x) * Math.min(1, dt * 10);
        ball.y += (H.cup.y - ball.y) * Math.min(1, dt * 10);
        if (sinkT > 0.75) finishHole(R.strokes);
      } else if (phase === 'card') T += dt;
      if (phase === 'roll' || phase === 'aim') {
        saveT -= dt;
        if (saveT <= 0) { saveT = 4; saveRound(); }
      }
    }

    // ---------- Desenho ----------
    function render() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      if (!H || phase === 'pick' || phase === 'resume') return;
      const { s, ox, oy } = layout();

      ctx.save();
      ctx.translate(ox, oy);
      ctx.scale(s, s);
      // tabuleiro
      const bb = H.bb;
      ctx.fillStyle = '#15172c';
      roundRect(bb.x0 - 4, bb.y0 - 4, bb.x1 - bb.x0 + 8, bb.y1 - bb.y0 + 8, 4); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = bb.y0 / C; y < bb.y1 / C; y++) for (let x = bb.x0 / C; x < bb.x1 / C; x++) {
        ctx.beginPath(); ctx.arc((x + 0.5) * C, (y + 0.5) * C, 0.6, 0, TAU); ctx.fill();
      }
      // relva às riscas
      H.cells.forEach(([cx, cy], i) => {
        ctx.fillStyle = (cx + cy) % 2 ? '#1f9d5c' : '#23ad66';
        ctx.fillRect(cx * C - 0.2, cy * C - 0.2, C + 0.4, C + 0.4);
      });
      // rampas / correntes
      for (const r of H.ramps) {
        ctx.fillStyle = 'rgba(120,255,190,0.18)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        const ang = Math.atan2(r.ay, r.ax), ph = (T * 0.8) % 1;
        ctx.save();
        ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
        ctx.rotate(ang);
        ctx.strokeStyle = 'rgba(220,255,235,0.55)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
        for (let k = -2; k <= 2; k++) {
          const x = (k + ph) * 6;
          for (const yy of [-5, 5]) {
            ctx.beginPath(); ctx.moveTo(x - 2, yy - 2.5); ctx.lineTo(x, yy); ctx.lineTo(x - 2, yy + 2.5); ctx.stroke();
          }
        }
        ctx.restore();
      }
      // areia
      for (const a of H.sand) {
        ctx.fillStyle = '#f0cf87';
        roundRect(a.x, a.y, a.w, a.h, 4); ctx.fill();
        ctx.fillStyle = 'rgba(160,120,50,0.35)';
        for (let k = 0; k < 7; k++) {
          ctx.beginPath(); ctx.arc(a.x + 2 + ((k * 7.3) % (a.w - 4)), a.y + 2 + ((k * 4.9) % (a.h - 4)), 0.5, 0, TAU); ctx.fill();
        }
      }
      // água
      for (const wa of H.water) {
        ctx.fillStyle = '#2f7fd6';
        ctx.fillRect(wa.x, wa.y, wa.w, wa.h);
        ctx.save();
        ctx.beginPath(); ctx.rect(wa.x, wa.y, wa.w, wa.h); ctx.clip();
        ctx.strokeStyle = 'rgba(190,225,255,0.5)'; ctx.lineWidth = 0.6;
        const horiz = wa.w > wa.h;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          for (let u = 0; u <= 20; u += 2) {
            const off = Math.sin(u * 0.6 + T * 2 + k * 2) * 0.6 + (k + 0.7) * (Math.min(wa.w, wa.h) / 3.2);
            const x = horiz ? wa.x + u : wa.x + off, y = horiz ? wa.y + off : wa.y + u;
            u ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
      }
      // tee
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(H.tee.x - 4, H.tee.y - 4, 8, 8, 2); ctx.fill();
      // teletransportes
      H.teles.forEach(p => {
        for (const [x, y, entry] of [[p.ax, p.ay, true], [p.bx, p.by, false]]) {
          ctx.fillStyle = entry ? 'rgba(165,94,234,0.45)' : 'rgba(165,94,234,0.2)';
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#c39bff'; ctx.lineWidth = 0.7;
          ctx.setLineDash(entry ? [] : [1.2, 1.2]);
          ctx.beginPath(); ctx.arc(x, y, 3.2, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          if (entry) {
            ctx.beginPath(); ctx.arc(x, y, 1.8, T * 3, T * 3 + 4); ctx.stroke();
          }
        }
      });
      // buraco
      ctx.fillStyle = '#0a2a18';
      ctx.beginPath(); ctx.arc(H.cup.x, H.cup.y, CUP_R + 0.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#05070d';
      ctx.beginPath(); ctx.arc(H.cup.x, H.cup.y, CUP_R, 0, TAU); ctx.fill();
      // paredes
      ctx.strokeStyle = '#e6e9ff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath();
      for (const wl of H.walls) { ctx.moveTo(wl[0], wl[1]); ctx.lineTo(wl[2], wl[3]); }
      ctx.stroke();
      for (const p of H.bumps) {
        ctx.fillStyle = '#ff9f43';
        ctx.beginPath(); p.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.fill();
      }
      // obstáculos móveis
      for (const g of H.gates) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(g.x - g.px * 10, g.y - g.py * 10); ctx.lineTo(g.x + g.px * 10, g.y + g.py * 10); ctx.stroke();
      }
      ctx.lineCap = 'round';
      for (const sg of dynSegs(H, T)) {
        ctx.strokeStyle = sg.mill ? '#ff5a6e' : '#ff9f43';
        ctx.lineWidth = sg.mill ? 1.4 : 1.8;
        ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
      }
      for (const m of H.mills) {
        ctx.fillStyle = '#ffd1d7';
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.4, 0, TAU); ctx.fill();
      }

      // mira
      if (drag && phase === 'aim') {
        const dx = drag.sx - drag.x, dy = drag.sy - drag.y, len = Math.hypot(dx, dy);
        if (len >= 12) {
          const p = Math.min(1, len / maxPull()), ux = dx / len, uy = dy / len;
          const col = `hsl(${120 - p * 120},90%,60%)`;
          ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(ball.x, ball.y); ctx.lineTo(ball.x - ux * p * 18, ball.y - uy * p * 18); ctx.stroke();
          ctx.strokeStyle = col; ctx.lineWidth = 1.1;
          ctx.setLineDash([1.6, 1.6]);
          ctx.beginPath(); ctx.moveTo(ball.x + ux * 3, ball.y + uy * 3); ctx.lineTo(ball.x + ux * (6 + p * 46), ball.y + uy * (6 + p * 46)); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(ball.x + ux * (6 + p * 46), ball.y + uy * (6 + p * 46), 1.1, 0, TAU); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 0.9;
          ctx.beginPath(); ctx.arc(ball.x, ball.y, 5, -Math.PI / 2, -Math.PI / 2 + TAU * p); ctx.strokeStyle = col; ctx.stroke();
        }
      }
      // bola
      const bs = phase === 'sink' ? Math.max(0.2, 1 - sinkT / 0.75) : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.arc(ball.x + 0.6, ball.y + 0.8, BR * bs, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ball.x, ball.y, BR * bs, 0, TAU); ctx.fill();
      if (phase === 'aim' && !drag) {
        const pulse = 0.5 + 0.5 * Math.sin(T * 4);
        ctx.strokeStyle = `rgba(255,204,77,${0.3 + pulse * 0.4})`; ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.arc(ball.x, ball.y, BR + 1.5 + pulse, 0, TAU); ctx.stroke();
      }
      // bandeira
      const near = Math.hypot(ball.x - H.cup.x, ball.y - H.cup.y) < 12;
      ctx.globalAlpha = near ? 0.35 : 1;
      ctx.strokeStyle = '#eef0ff'; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(H.cup.x, H.cup.y); ctx.lineTo(H.cup.x + 1.5, H.cup.y - 9); ctx.stroke();
      ctx.fillStyle = '#ffcc4d';
      const wv = Math.sin(T * 3) * 0.6;
      ctx.beginPath(); ctx.moveTo(H.cup.x + 1.5, H.cup.y - 9); ctx.lineTo(H.cup.x + 7, H.cup.y - 7.5 + wv); ctx.lineTo(H.cup.x + 1.1, H.cup.y - 5.8); ctx.fill();
      ctx.globalAlpha = 1;
      if (splash) {
        ctx.strokeStyle = `rgba(150,200,255,${splash.t / 0.6})`; ctx.lineWidth = 0.7;
        ctx.beginPath(); ctx.arc(splash.x, splash.y, (0.6 - splash.t) * 12, 0, TAU); ctx.stroke();
      }
      ctx.restore();

      // HUD
      const total = R.scores.reduce((a, v) => a + v, 0);
      const parDone = course.slice(0, R.hole).reduce((a, h2) => a + h2.par, 0);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '700 18px system-ui, sans-serif';
      ctx.fillText(`Buraco ${Math.min(9, R.hole + 1)}/9 · Par ${H.par}`, 14, top + 22);
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillStyle = '#9aa0c8';
      ctx.fillText(`${courseName(R.kind, R.seed)}${R.kind === 'classic' ? ' · ' + H.name : ''}`, 14, top + 45);
      ctx.fillStyle = '#ffcc4d';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(`Pancadas ${R.strokes}   Total ${total + R.strokes} (${rel(total - parDone)})`, 14, top + 62);

      if (introT > 0 && phase === 'aim') {
        ctx.globalAlpha = Math.min(1, introT * 1.5);
        ctx.fillStyle = 'rgba(8,9,20,0.75)';
        ctx.fillRect(0, h / 2 - 40, w, 80);
        ctx.fillStyle = '#eef0ff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '800 26px system-ui, sans-serif';
        ctx.fillText(`Buraco ${R.hole + 1} · Par ${H.par}`, w / 2, h / 2 - 8);
        ctx.font = '500 14px system-ui, sans-serif'; ctx.fillStyle = '#9aa0c8';
        ctx.fillText(R.strokes === 0 ? 'Arrasta para trás e larga para dar a tacada' : 'Continua de onde ficaste', w / 2, h / 2 + 20);
        ctx.globalAlpha = 1;
      }
      if (msg) {
        ctx.globalAlpha = Math.min(1, msg.t * 2);
        ctx.font = '700 20px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const tw = ctx.measureText(msg.text).width + 30;
        ctx.fillStyle = 'rgba(8,9,20,0.8)';
        roundRectS(w / 2 - tw / 2, h - 90, tw, 44, 12); ctx.fill();
        ctx.fillStyle = msg.color;
        ctx.fillText(msg.text, w / 2, h - 68);
        ctx.globalAlpha = 1;
      }
      ctx.textAlign = 'left';
    }
    function roundRect(x, y, w2, h2, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w2, h2, r) : ctx.rect(x, y, w2, h2); }
    const roundRectS = roundRect;

    // ---------- Gancho de debug (só com window.ARCADE_DEBUG) ----------
    if (window.ARCADE_DEBUG) {
      window.ARCADE_DEBUG.golf = {
        state() {
          const L = H ? layout() : null;
          return {
            phase, hole: R ? R.hole : null, strokes: R ? R.strokes : 0, scores: R ? R.scores.slice() : [],
            par: H ? H.par : null, ball: { x: ball.x, y: ball.y },
            ballScreen: L ? { x: L.ox + ball.x * L.s, y: L.oy + ball.y * L.s } : null,
            maxPull: maxPull(), T,
          };
        },
        // Calcula a melhor tacada a partir da posição atual e devolve o arrasto (em píxeis) que a produz.
        solve(delay = 0.25) {
          const s = solveShot(H, ball, T, delay);
          const len = Math.max(13, s.power * maxPull());
          return { ...s, dx: -Math.cos(s.angle) * len, dy: -Math.sin(s.angle) * len };
        },
        // Joga um percurso inteiro só com o solucionador (sem animação) e devolve as pancadas por buraco.
        verify(kind, seed) { return verifyCourse(kind === 'classic' ? CLASSIC : genCourse(seed)); },
        course(kind, seed) { return (kind === 'classic' ? CLASSIC : genCourse(seed)).map(c => ({ moves: c.moves, par: c.par, obs: c.obs.map(o => o.t) })); },
        start: (kind, seed) => startRound(kind, seed),
      };
    }

    const saved = Arcade.store.get(SAVE_KEY, null);
    if (saved && saved.v === 1 && saved.hole < 9) offerResume(saved);
    else showPicker();
    const loop = Arcade.loop(dt => { if (phase !== 'paused') update(dt); render(); });

    return {
      destroy() {
        saveRound();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        document.removeEventListener('visibilitychange', onVis);
        if (window.ARCADE_DEBUG) delete window.ARCADE_DEBUG.golf;
      },
    };
  }

  Arcade.register({
    id: 'golf',
    title: 'Mini Golfe',
    icon: '⛳',
    color: '#26de81',
    desc: 'Arrasta, aponta e acerta no buraco em 9 buracos cheios de obstáculos.',
    best: () => {
      const b = Arcade.store.get('golf:best', {}) || {};
      if (b.classic != null) return `${b.classic} pancadas (Clássico)`;
      const v = Object.values(b);
      return v.length ? `${Math.min(...v)} pancadas` : '—';
    },
    create,
  });
})();
