// Xadrez: regras completas contra o computador (4 níveis) ou a dois no mesmo telemóvel.
// Toca numa peça para ver os lances legais e toca no destino para jogar.
(function () {
  // ---------- Motor (autónomo: corre também dentro de um Web Worker criado a partir de um Blob) ----------
  // Tabuleiro 0x88: casa = fila*16 + coluna, fila 0 = fila 1 das brancas. Peças: +brancas / -pretas,
  // 1 peão, 2 cavalo, 3 bispo, 4 torre, 5 dama, 6 rei.
  function chessEngine() {
    const KN = [33, 31, 18, 14, -33, -31, -18, -14];
    const KG = [1, -1, 16, -16, 17, 15, -17, -15];
    const BD = [17, 15, -17, -15], RD = [1, -1, 16, -16];
    const VAL = [0, 100, 320, 330, 500, 900, 20000];
    const F_CAP = 1, F_EP = 2, F_CASTLE = 4, F_DBL = 8, F_PROMO = 16;
    const INF = 1e9, MATE = 100000;
    const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

    // Tabelas peça-casa (da fila 8 para a fila 1, do ponto de vista das brancas)
    const T = {
      1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
      2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
      3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
      4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
      5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
      6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
      7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30,
        -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
    };
    const PW = [], PB = [];
    for (let t = 1; t <= 7; t++) {
      PW[t] = new Int16Array(128); PB[t] = new Int16Array(128);
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        PW[t][r * 16 + f] = T[t][(7 - r) * 8 + f];
        PB[t][r * 16 + f] = T[t][r * 8 + f];
      }
    }
    const SQS = [];
    for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) SQS.push(r * 16 + f);

    // Chaves de Zobrist (gerador fixo, igual em todas as cópias do motor)
    let seed = 0x2545f491;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
    const ZP = [];
    for (let i = 0; i < 13; i++) { ZP[i] = new Int32Array(128); for (let s = 0; s < 128; s++) ZP[i][s] = rnd(); }
    const ZSIDE = rnd();
    const ZC = new Int32Array(16); for (let i = 0; i < 16; i++) ZC[i] = rnd();
    const ZEP = new Int32Array(128); for (let i = 0; i < 128; i++) ZEP[i] = rnd();

    const CM = new Uint8Array(128).fill(15);
    CM[0] = 13; CM[7] = 14; CM[4] = 12; CM[112] = 7; CM[119] = 11; CM[116] = 3;

    const b = new Int8Array(128);
    let side = 1, castle = 0, ep = -1, half = 0, full = 1, hash = 0;
    const kp = [4, 116];
    const stack = [], hashHist = [];
    const ki = s => (s === 1 ? 0 : 1);

    function computeHash() {
      let h = 0;
      for (const s of SQS) if (b[s]) h ^= ZP[b[s] + 6][s];
      if (side === -1) h ^= ZSIDE;
      h ^= ZC[castle];
      if (ep >= 0) h ^= ZEP[ep];
      return h;
    }

    function setFen(fen) {
      const parts = fen.trim().split(/\s+/);
      b.fill(0);
      const rows = parts[0].split('/');
      const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
      for (let i = 0; i < 8; i++) {
        let f = 0;
        for (const ch of rows[i]) {
          if (ch >= '1' && ch <= '8') { f += +ch; continue; }
          const t = map[ch.toLowerCase()], s = ch === ch.toLowerCase() ? -1 : 1;
          const sq = (7 - i) * 16 + f;
          b[sq] = t * s;
          if (t === 6) kp[ki(s)] = sq;
          f++;
        }
      }
      side = parts[1] === 'b' ? -1 : 1;
      castle = 0;
      const c = parts[2] || '-';
      if (c.includes('K')) castle |= 1;
      if (c.includes('Q')) castle |= 2;
      if (c.includes('k')) castle |= 4;
      if (c.includes('q')) castle |= 8;
      ep = parts[3] && parts[3] !== '-' ? (parts[3].charCodeAt(1) - 49) * 16 + (parts[3].charCodeAt(0) - 97) : -1;
      half = +(parts[4] || 0);
      full = +(parts[5] || 1);
      stack.length = 0; hashHist.length = 0;
      hash = computeHash();
    }

    function attacked(sq, by) {
      let t;
      if (by === 1) {
        t = sq - 15; if (!(t & 0x88) && b[t] === 1) return true;
        t = sq - 17; if (!(t & 0x88) && b[t] === 1) return true;
      } else {
        t = sq + 15; if (!(t & 0x88) && b[t] === -1) return true;
        t = sq + 17; if (!(t & 0x88) && b[t] === -1) return true;
      }
      const n = 2 * by, k = 6 * by, bb = 3 * by, r = 4 * by, q = 5 * by;
      for (let i = 0; i < 8; i++) {
        t = sq + KN[i]; if (!(t & 0x88) && b[t] === n) return true;
        t = sq + KG[i]; if (!(t & 0x88) && b[t] === k) return true;
      }
      for (let i = 0; i < 4; i++) {
        let d = BD[i]; t = sq + d;
        while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === bb || p === q) return true; break; } t += d; }
        d = RD[i]; t = sq + d;
        while (!(t & 0x88)) { const p = b[t]; if (p) { if (p === r || p === q) return true; break; } t += d; }
      }
      return false;
    }

    const mv = (f, t, promo, fl) => f | (t << 7) | (promo << 14) | (fl << 17);

    function gen(list, capsOnly) {
      const s = side;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || (p > 0) !== (s > 0)) continue;
        const a = p * s;
        if (a === 1) {
          const dir = 16 * s, t = sq + dir, last = s === 1 ? 7 : 0;
          if (!(t & 0x88) && b[t] === 0) {
            if ((t >> 4) === last) {
              list.push(mv(sq, t, 5, F_PROMO));
              if (!capsOnly) { list.push(mv(sq, t, 4, F_PROMO)); list.push(mv(sq, t, 3, F_PROMO)); list.push(mv(sq, t, 2, F_PROMO)); }
            } else if (!capsOnly) {
              list.push(mv(sq, t, 0, 0));
              if ((sq >> 4) === (s === 1 ? 1 : 6) && b[t + dir] === 0) list.push(mv(sq, t + dir, 0, F_DBL));
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            const c = sq + dir + k;
            if (c & 0x88) continue;
            if (b[c] * s < 0) {
              if ((c >> 4) === last) {
                list.push(mv(sq, c, 5, F_CAP | F_PROMO));
                if (!capsOnly) { list.push(mv(sq, c, 4, F_CAP | F_PROMO)); list.push(mv(sq, c, 3, F_CAP | F_PROMO)); list.push(mv(sq, c, 2, F_CAP | F_PROMO)); }
              } else list.push(mv(sq, c, 0, F_CAP));
            } else if (c === ep) list.push(mv(sq, c, 0, F_CAP | F_EP));
          }
        } else if (a === 2 || a === 6) {
          const offs = a === 2 ? KN : KG;
          for (let i = 0; i < 8; i++) {
            const t = sq + offs[i];
            if (t & 0x88) continue;
            const q = b[t];
            if (q === 0) { if (!capsOnly) list.push(mv(sq, t, 0, 0)); }
            else if (q * s < 0) list.push(mv(sq, t, 0, F_CAP));
          }
          if (a === 6 && !capsOnly) {
            if (s === 1 && sq === 4) {
              if ((castle & 1) && !b[5] && !b[6] && b[7] === 4 && !attacked(4, -1) && !attacked(5, -1) && !attacked(6, -1)) list.push(mv(4, 6, 0, F_CASTLE));
              if ((castle & 2) && !b[3] && !b[2] && !b[1] && b[0] === 4 && !attacked(4, -1) && !attacked(3, -1) && !attacked(2, -1)) list.push(mv(4, 2, 0, F_CASTLE));
            } else if (s === -1 && sq === 116) {
              if ((castle & 4) && !b[117] && !b[118] && b[119] === -4 && !attacked(116, 1) && !attacked(117, 1) && !attacked(118, 1)) list.push(mv(116, 118, 0, F_CASTLE));
              if ((castle & 8) && !b[115] && !b[114] && !b[113] && b[112] === -4 && !attacked(116, 1) && !attacked(115, 1) && !attacked(114, 1)) list.push(mv(116, 114, 0, F_CASTLE));
            }
          }
        } else {
          const dirs = a === 3 ? BD : a === 4 ? RD : KG;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let t = sq + d;
            while (!(t & 0x88)) {
              const q = b[t];
              if (q === 0) { if (!capsOnly) list.push(mv(sq, t, 0, 0)); }
              else { if (q * s < 0) list.push(mv(sq, t, 0, F_CAP)); break; }
              t += d;
            }
          }
        }
      }
      return list;
    }

    function make(m) {
      const f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
      const p = b[f];
      let cap = b[t];
      const u = { m, cap: 0, castle, ep, half, hash };
      stack.push(u);
      hashHist.push(hash);
      if (ep >= 0) hash ^= ZEP[ep];
      hash ^= ZC[castle];
      hash ^= ZP[p + 6][f];
      if (fl & F_EP) { const cs = t - 16 * side; cap = b[cs]; b[cs] = 0; hash ^= ZP[cap + 6][cs]; }
      else if (cap) hash ^= ZP[cap + 6][t];
      const np = promo ? promo * side : p;
      b[t] = np; b[f] = 0;
      hash ^= ZP[np + 6][t];
      if (fl & F_CASTLE) {
        let rf, rt;
        if (t === 6) { rf = 7; rt = 5; } else if (t === 2) { rf = 0; rt = 3; } else if (t === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
        const r = b[rf]; b[rt] = r; b[rf] = 0;
        hash ^= ZP[r + 6][rf] ^ ZP[r + 6][rt];
      }
      if (p === 6 * side) kp[ki(side)] = t;
      castle &= CM[f] & CM[t];
      hash ^= ZC[castle];
      ep = (fl & F_DBL) ? f + 16 * side : -1;
      if (ep >= 0) hash ^= ZEP[ep];
      half = (p === side || cap) ? 0 : half + 1;
      if (side === -1) full++;
      side = -side;
      hash ^= ZSIDE;
      u.cap = cap;
    }

    function unmake() {
      const u = stack.pop();
      hashHist.pop();
      const m = u.m, f = m & 127, t = (m >> 7) & 127, promo = (m >> 14) & 7, fl = m >> 17;
      side = -side;
      if (side === -1) full--;
      const p = promo ? side : b[t];
      b[f] = p; b[t] = 0;
      if (fl & F_EP) b[t - 16 * side] = u.cap; else b[t] = u.cap;
      if (fl & F_CASTLE) {
        let rf, rt;
        if (t === 6) { rf = 7; rt = 5; } else if (t === 2) { rf = 0; rt = 3; } else if (t === 118) { rf = 119; rt = 117; } else { rf = 112; rt = 115; }
        b[rf] = b[rt]; b[rt] = 0;
      }
      if (p === 6 * side) kp[ki(side)] = f;
      castle = u.castle; ep = u.ep; half = u.half; hash = u.hash;
    }

    const inCheck = () => attacked(kp[ki(side)], -side);
    const leftInCheck = () => attacked(kp[ki(-side)], side); // depois de make(): o rei de quem jogou ficou atacado?

    function legal() {
      const out = [];
      for (const m of gen([], false)) { make(m); if (!leftInCheck()) out.push(m); unmake(); }
      return out;
    }

    function perft(d) {
      if (d === 0) return 1;
      let n = 0;
      for (const m of gen([], false)) {
        make(m);
        if (!leftInCheck()) n += d === 1 ? 1 : perft(d - 1);
        unmake();
      }
      return n;
    }

    // ---------- Avaliação ----------
    function evaluate() {
      let mat = 0, pst = 0, phase = 0, kw = 0, kb = 0, bw = 0, bbn = 0;
      for (let i = 0; i < 64; i++) {
        const s = SQS[i], p = b[s];
        if (!p) continue;
        if (p > 0) {
          if (p === 6) { kw = s; continue; }
          mat += VAL[p]; pst += PW[p][s];
          if (p === 3) bw++;
        } else {
          const a = -p;
          if (a === 6) { kb = s; continue; }
          mat -= VAL[a]; pst -= PB[a][s];
          if (a === 3) bbn++;
        }
        const a = p > 0 ? p : -p;
        phase += a === 2 || a === 3 ? 1 : a === 4 ? 2 : a === 5 ? 4 : 0;
      }
      if (phase > 24) phase = 24;
      const kMid = PW[6][kw] - PB[6][kb], kEnd = PW[7][kw] - PB[7][kb];
      let sc = mat + pst + ((kMid * phase + kEnd * (24 - phase)) / 24 | 0);
      if (bw >= 2) sc += 30;
      if (bbn >= 2) sc -= 30;
      return sc * side;
    }

    // ---------- Pesquisa ----------
    const TTN = 1 << 18, TTM = TTN - 1;
    let ttKey, ttMove, ttScore, ttDepth, ttFlag;
    let nodes = 0, deadline = 0, stop = false;
    const killers = [], hist = new Int32Array(128 * 128);

    function isRep() {
      const n = hashHist.length, lim = Math.max(0, n - half);
      for (let i = n - 2; i >= lim; i -= 2) if (hashHist[i] === hash) return true;
      return false;
    }

    function order(moves, ttm, ply) {
      const sc = new Int32Array(moves.length);
      const k = killers[ply] || [0, 0];
      for (let i = 0; i < moves.length; i++) {
        const m = moves[i];
        if (m === ttm) { sc[i] = 1e7; continue; }
        const fl = m >> 17, t = (m >> 7) & 127;
        if (fl & F_CAP) {
          const victim = (fl & F_EP) ? 1 : Math.abs(b[t]);
          sc[i] = 1e6 + VAL[victim] * 10 - Math.abs(b[m & 127]);
        } else if (fl & F_PROMO) sc[i] = 9e5 + ((m >> 14) & 7);
        else if (m === k[0]) sc[i] = 8e5;
        else if (m === k[1]) sc[i] = 7e5;
        else sc[i] = hist[(m & 127) * 128 + t];
      }
      return sc;
    }
    function pick(moves, sc, i) { // ordenação por seleção, à medida
      let best = i;
      for (let j = i + 1; j < moves.length; j++) if (sc[j] > sc[best]) best = j;
      if (best !== i) {
        const m = moves[i]; moves[i] = moves[best]; moves[best] = m;
        const s = sc[i]; sc[i] = sc[best]; sc[best] = s;
      }
      return moves[i];
    }

    function quiesce(alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      const stand = evaluate();
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 60) return stand;
      const moves = gen([], true);
      const sc = order(moves, 0, ply);
      for (let i = 0; i < moves.length; i++) {
        const m = pick(moves, sc, i);
        make(m);
        if (leftInCheck()) { unmake(); continue; }
        const v = -quiesce(-beta, -alpha, ply + 1);
        unmake();
        if (stop) return 0;
        if (v >= beta) return v;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function search(depth, alpha, beta, ply) {
      if ((++nodes & 2047) === 0 && Date.now() > deadline) stop = true;
      if (stop) return 0;
      if (half >= 100 || isRep()) return 0;
      const chk = inCheck();
      if (chk) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      const idx = hash & TTM;
      let ttm = 0;
      if (ttKey[idx] === hash) {
        ttm = ttMove[idx];
        if (ttDepth[idx] >= depth) {
          let v = ttScore[idx];
          if (v > MATE - 1000) v -= ply; else if (v < -MATE + 1000) v += ply;
          const fl = ttFlag[idx];
          if (fl === 0) return v;
          if (fl === 1 && v >= beta) return v;
          if (fl === 2 && v <= alpha) return v;
        }
      }
      const moves = gen([], false);
      const sc = order(moves, ttm, ply);
      const a0 = alpha;
      let best = -INF, bestM = 0, n = 0;
      for (let i = 0; i < moves.length; i++) {
        const m = pick(moves, sc, i);
        make(m);
        if (leftInCheck()) { unmake(); continue; }
        n++;
        let v;
        if (n === 1) v = -search(depth - 1, -beta, -alpha, ply + 1);
        else {
          // Redução ligeira nos lances tardios e calmos
          const quiet = !((m >> 17) & (F_CAP | F_PROMO));
          const red = depth >= 3 && n > 4 && quiet && !chk ? 1 : 0;
          v = -search(depth - 1 - red, -alpha - 1, -alpha, ply + 1);
          if (v > alpha && red) v = -search(depth - 1, -alpha - 1, -alpha, ply + 1);
          if (v > alpha && v < beta) v = -search(depth - 1, -beta, -alpha, ply + 1);
        }
        unmake();
        if (stop) return 0;
        if (v > best) { best = v; bestM = m; }
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            if (!((m >> 17) & F_CAP)) {
              const k = killers[ply] || (killers[ply] = [0, 0]);
              if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
              hist[(m & 127) * 128 + ((m >> 7) & 127)] += depth * depth;
            }
            break;
          }
        }
      }
      if (!n) return chk ? -MATE + ply : 0;
      let st = best;
      if (st > MATE - 1000) st += ply; else if (st < -MATE + 1000) st -= ply;
      ttKey[idx] = hash; ttMove[idx] = bestM; ttScore[idx] = st; ttDepth[idx] = depth;
      ttFlag[idx] = best <= a0 ? 2 : best >= beta ? 1 : 0;
      return best;
    }

    // Escolhe um lance. noise: ruído (centipeões) somado à avaliação de cada lance; blunder: probabilidade de um lance ao acaso.
    function think(opts) {
      if (!ttKey) {
        ttKey = new Int32Array(TTN); ttMove = new Int32Array(TTN); ttScore = new Int32Array(TTN);
        ttDepth = new Int8Array(TTN); ttFlag = new Int8Array(TTN);
      }
      const roots = legal();
      if (!roots.length) return { move: 0 };
      if (roots.length === 1) return { move: roots[0], depth: 0 };
      if (opts.blunder && Math.random() < opts.blunder) return { move: roots[Math.floor(Math.random() * roots.length)], depth: 0, blunder: true };
      deadline = Date.now() + opts.time; stop = false; nodes = 0;
      killers.length = 0; hist.fill(0);
      const noise = opts.noise || 0;
      let best = roots[0], bestScore = 0, done = 0;
      // ordem inicial: capturas primeiro
      const sc0 = order(roots, 0, 0);
      const ordered = [];
      for (let i = 0; i < roots.length; i++) ordered.push(pick(roots, sc0, i));
      for (let d = 1; d <= opts.depth; d++) {
        let alpha = -INF, bestThis = 0, bestSc = -INF;
        const scores = [];
        for (let i = 0; i < ordered.length; i++) {
          const m = ordered[i];
          make(m);
          let v;
          if (noise) v = -search(d - 1, -INF, INF, 1);
          else if (i === 0) v = -search(d - 1, -INF, -alpha, 1);
          else {
            v = -search(d - 1, -alpha - 1, -alpha, 1);
            if (v > alpha && !stop) v = -search(d - 1, -INF, -alpha, 1);
          }
          unmake();
          if (stop) break;
          if (noise) v += Math.round((Math.random() * 2 - 1) * noise);
          scores.push([m, v]);
          if (v > bestSc) { bestSc = v; bestThis = m; }
          if (!noise && v > alpha) alpha = v;
        }
        if (bestThis && (!stop || scores.length > 0 && scores[0][0] === ordered[0])) {
          if (!stop || bestSc >= bestScore - 50 || bestThis === best) { best = bestThis; bestScore = bestSc; }
        }
        if (stop) break;
        done = d;
        // próxima iteração começa pelo melhor
        ordered.splice(ordered.indexOf(best), 1);
        ordered.unshift(best);
        if (!noise && Math.abs(bestSc) > MATE - 1000) break;
        if (Date.now() > deadline - opts.time * 0.45 && d >= 2) break; // não começa uma iteração que não vai acabar
      }
      return { move: best, depth: done, score: bestScore, nodes };
    }

    function workerMain() {
      self.onmessage = e => {
        const { fen, moves, opts, id } = e.data;
        setFen(fen);
        for (const m of moves) make(m);
        const r = think(opts);
        self.postMessage({ id, ...r });
      };
    }

    // Chave da posição para a tripla repetição (o en passant só conta se for mesmo possível)
    function posKey() {
      let s = '';
      for (const q of SQS) s += String.fromCharCode(70 + b[q]);
      let e = '-';
      if (ep >= 0) {
        for (const m of legal()) if (((m >> 17) & F_EP)) { e = ep; break; }
      }
      return s + side + castle + e;
    }

    function insufficient() {
      let minors = 0, other = 0, bishopsColors = new Set();
      for (const s of SQS) {
        const a = Math.abs(b[s]);
        if (!a || a === 6) continue;
        if (a === 2 || a === 3) { minors++; if (a === 3) bishopsColors.add(((s >> 4) + (s & 7)) & 1); }
        else other++;
      }
      if (other) return false;
      if (minors <= 1) return true;
      // só bispos, todos na mesma cor de casa
      let onlyB = true;
      for (const s of SQS) if (Math.abs(b[s]) === 2) onlyB = false;
      return onlyB && bishopsColors.size === 1;
    }

    return {
      START, F_CAP, F_EP, F_CASTLE, F_PROMO, MATE,
      setFen, make, unmake, legal, perft, inCheck, think, workerMain, posKey, insufficient, evaluate,
      board: b,
      get side() { return side; }, get half() { return half; }, get castle() { return castle; }, get ep() { return ep; },
      kingSq: s => kp[ki(s)],
    };
  }

  // ---------- Interface ----------
  const GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
  const glyph = t => GLYPH[t] + '︎';
  const LEVELS = [
    { name: 'Fácil', opts: { depth: 1, time: 300, noise: 220, blunder: 0.22 } },
    { name: 'Médio', opts: { depth: 3, time: 800, noise: 45, blunder: 0.04 } },
    { name: 'Difícil', opts: { depth: 6, time: 1500 } },
    { name: 'Mestre', opts: { depth: 40, time: 3500 } },
  ];
  const sqName = s => String.fromCharCode(97 + (s & 7)) + ((s >> 4) + 1);

  const CSS = `
.ch-wrap{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center}
.ch-status{align-self:stretch;flex:none;padding:0 70px 0 14px;min-height:52px;display:flex;flex-direction:column;justify-content:center}
.ch-status b{font-size:18px}
.ch-status span{color:var(--muted);font-size:13px;margin-top:2px}
.ch-caps{height:30px;flex:none;display:flex;align-items:center;gap:6px;font-size:19px;letter-spacing:-.12em;line-height:1;width:var(--bs);overflow:hidden;white-space:nowrap}
.ch-caps i{font-style:normal;letter-spacing:0;color:var(--muted);font-size:13px;font-weight:700;margin-left:4px}
.ch-caps .pw{color:#fff;text-shadow:0 0 1px #000,0 0 1px #000}
.ch-caps .pb{color:#14152a;text-shadow:0 0 1px #fff,0 0 2px rgba(255,255,255,.7)}
.ch-board{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);flex:none;width:var(--bs);height:var(--bs);border-radius:10px;overflow:hidden;
  box-shadow:0 0 0 3px #2b2e55;touch-action:none}
.ch-sq{position:relative;display:grid;place-items:center;min-width:0;min-height:0;overflow:hidden;font-size:calc(var(--bs)/8*.8);line-height:1}
.ch-sq.l{background:#d7dbf2}.ch-sq.d{background:#7379b8}
.ch-sq.last.l{background:#f3e08a}.ch-sq.last.d{background:#c7b257}
.ch-sq.sel{box-shadow:inset 0 0 0 4px #ffcc4d}
.ch-sq.chk.l{background:radial-gradient(circle,#ff4d5e 0,#ff4d5e 32%,rgba(255,77,94,0) 72%),#d7dbf2}
.ch-sq.chk.d{background:radial-gradient(circle,#ff4d5e 0,#ff4d5e 32%,rgba(255,77,94,0) 72%),#7379b8}
.ch-sq .pc{position:relative;z-index:1;pointer-events:none;transform:translateY(-3%)}
.ch-sq .pc.w{color:#fff;-webkit-text-stroke:1.5px #1c1e38;text-shadow:0 2px 0 rgba(0,0,0,.25)}
.ch-sq .pc.b{color:#1c1e38;-webkit-text-stroke:1px #1c1e38;text-shadow:0 1px 0 rgba(255,255,255,.35)}
.ch-sq .dot{position:absolute;width:30%;height:30%;border-radius:50%;background:rgba(20,22,50,.38)}
.ch-sq .ring{position:absolute;inset:4%;border-radius:50%;border:calc(var(--bs)/8*.08) solid rgba(20,22,50,.38)}
.ch-sq .co{position:absolute;font-size:10px;font-weight:700;line-height:1;opacity:.75;color:#1c1e38}
.ch-sq.d .co{color:#eef0ff}
.ch-sq .co.f{right:3px;bottom:2px}.ch-sq .co.r{left:3px;top:2px}
.ch-bar{display:flex;gap:8px;justify-content:center;width:100%;padding:10px 12px calc(env(safe-area-inset-bottom) + 10px);margin-top:auto}
.ch-bar button{flex:1;max-width:130px;min-height:46px;border-radius:12px;border:2px solid var(--line);background:var(--panel);
  color:var(--text);font:inherit;font-size:15px;font-weight:600}
.ch-bar button:active{transform:scale(.97)}
.ch-bar button:disabled{opacity:.4}
.ch-opts{display:flex;gap:6px;width:100%;max-width:360px}
.ch-opts button{flex:1;min-height:44px;border-radius:12px;border:2px solid var(--line);background:var(--panel);color:var(--text);font:inherit;font-size:14px;font-weight:600;padding:4px 2px}
.ch-opts button.on{background:var(--accent);color:#1a1300;border-color:transparent}
.ch-opts button small{display:block;font-size:11px;font-weight:500;opacity:.75}
.ch-lbl{width:100%;max-width:360px;text-align:left;color:var(--muted);font-size:13px;margin:6px 0 -2px}
.ch-promo{display:flex;gap:8px}
.ch-promo button{width:72px;height:72px;border-radius:14px;border:2px solid var(--line);background:#d7dbf2;font-size:52px;line-height:1;padding:0}
`;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();
    const E = chessEngine();
    const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    const style = mk('style'); style.textContent = CSS; root.appendChild(style);
    const wrap = mk('div', 'ch-wrap'); root.appendChild(wrap);
    wrap.style.paddingTop = (top + 18) + 'px';
    const status = mk('div', 'ch-status', '<b></b><span></span>');
    const capsTop = mk('div', 'ch-caps');
    const boardEl = mk('div', 'ch-board');
    const capsBot = mk('div', 'ch-caps');
    const bar = mk('div', 'ch-bar', '<button data-a="undo">↶ Anular</button><button data-a="flip">⇅ Virar</button><button data-a="new">Nova</button>');
    wrap.append(status, capsTop, boardEl, capsBot, bar);
    capsTop.style.marginTop = 'auto';
    const btnUndo = bar.querySelector('[data-a=undo]');
    const sqEls = [];
    for (let i = 0; i < 64; i++) { const d = mk('div', 'ch-sq'); d.dataset.i = i; boardEl.appendChild(d); sqEls.push(d); }

    const pauseBtn = mk('button', 'hud-btn'); pauseBtn.textContent = 'II'; pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);
    const overlay = mk('div', 'overlay'); overlay.hidden = true; root.appendChild(overlay);

    const SAVE_KEY = 'chess:save', WINS_KEY = 'chess:wins';
    let G = null;            // { mode: 'ai'|'two', human: 1|-1, level, moves: [], flipped, over }
    let legalNow = [], sel = -1, keys = [], thinking = false, reqId = 0, aiTimer = 0;
    let settings = Arcade.store.get('chess:settings', { mode: 'ai', color: 1, level: 1 });

    // ---------- Worker ----------
    let worker = null, workerUrl = null;
    try {
      workerUrl = URL.createObjectURL(new Blob([`(${chessEngine.toString()})().workerMain();`], { type: 'text/javascript' }));
      worker = new Worker(workerUrl);
      worker.onmessage = e => onAiMove(e.data);
      worker.onerror = () => { worker = null; };
    } catch { worker = null; }
    let fallback = null;

    function requestAi() {
      const id = ++reqId;
      thinking = true;
      const t0 = performance.now();
      const msg = { fen: E.START, moves: G.moves.slice(), opts: LEVELS[G.level].opts, id };
      const deliver = r => {
        const wait = Math.max(0, 450 - (performance.now() - t0)); // não responde instantaneamente
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => onAiMove(r), wait);
      };
      if (worker) {
        worker.onmessage = e => deliver(e.data);
        worker.postMessage(msg);
      } else {
        clearTimeout(aiTimer);
        aiTimer = setTimeout(() => {
          if (id !== reqId) return;
          fallback = fallback || chessEngine();
          fallback.setFen(msg.fen);
          for (const m of msg.moves) fallback.make(m);
          deliver({ id, ...fallback.think({ ...msg.opts, time: Math.min(msg.opts.time, 1200) }) });
        }, 30);
      }
      render();
    }

    function onAiMove(r) {
      if (!G || r.id !== reqId || G.over) return;
      thinking = false;
      if (r.move && legalNow.includes(r.move)) doMove(r.move);
      else render();
    }

    // ---------- Estado do jogo ----------
    function rebuild() {
      E.setFen(E.START);
      keys = [E.posKey()];
      for (const m of G.moves) { E.make(m); keys.push(E.posKey()); }
      legalNow = E.legal();
    }

    function newGame(s) {
      settings = s;
      Arcade.store.set('chess:settings', s);
      const human = s.color === 0 ? (Math.random() < 0.5 ? 1 : -1) : s.color;
      G = { mode: s.mode, human: s.mode === 'ai' ? human : 1, level: s.level, moves: [], flipped: s.mode === 'ai' && human === -1, over: null };
      reqId++; thinking = false; sel = -1;
      overlay.hidden = true;
      rebuild();
      save();
      afterChange();
    }

    function save() {
      if (!G) return;
      Arcade.store.set(SAVE_KEY, G.over ? null : { v: 1, ...G });
    }

    function result() {
      if (!legalNow.length) {
        if (E.inCheck()) return { kind: 'mate', winner: -E.side };
        return { kind: 'stalemate' };
      }
      if (E.half >= 100) return { kind: 'fifty' };
      const k = keys[keys.length - 1];
      if (keys.filter(x => x === k).length >= 3) return { kind: 'rep' };
      if (E.insufficient()) return { kind: 'material' };
      return null;
    }

    function afterChange() {
      const r = result();
      if (r) { G.over = r; endGame(r); render(); return; }
      save();
      if (G.mode === 'ai' && E.side !== G.human) requestAi();
      else render();
    }

    function doMove(m) {
      E.make(m);
      G.moves.push(m);
      keys.push(E.posKey());
      legalNow = E.legal();
      sel = -1;
      Arcade.buzz(m >> 17 & E.F_CAP ? 25 : 10);
      afterChange();
    }

    function undo() {
      if (!G || !G.moves.length) return;
      reqId++; thinking = false; clearTimeout(aiTimer);
      G.over = null;
      overlay.hidden = true;
      G.moves.pop();
      rebuild();
      // Contra o computador, volta até ser outra vez a vez do jogador
      if (G.mode === 'ai') while (G.moves.length && E.side !== G.human) { G.moves.pop(); rebuild(); }
      sel = -1;
      afterChange();
    }

    // ---------- Fim de jogo ----------
    function wins() { const w = Arcade.store.get(WINS_KEY, [0, 0, 0, 0]); return Array.isArray(w) && w.length === 4 ? w : [0, 0, 0, 0]; }

    function endGame(r) {
      Arcade.store.set(SAVE_KEY, null);
      let title, sub = '';
      const names = { 1: 'brancas', '-1': 'pretas' };
      if (r.kind === 'mate') {
        if (G.mode === 'ai') {
          if (r.winner === G.human) {
            const w = wins(); w[G.level]++; Arcade.store.set(WINS_KEY, w);
            title = 'Xeque-mate! Ganhaste'; sub = `Vitórias no nível ${LEVELS[G.level].name}: ${w[G.level]}`;
          } else { title = 'Xeque-mate. Perdeste'; sub = `O computador (${LEVELS[G.level].name}) ganhou.`; }
        } else { title = 'Xeque-mate!'; sub = `Ganham as ${names[r.winner]}.`; }
      } else {
        title = 'Empate';
        sub = { stalemate: 'Afogamento: quem joga não tem lances legais.', fifty: 'Regra dos 50 lances sem capturas nem movimentos de peão.',
          rep: 'A mesma posição repetiu-se três vezes.', material: 'Não há material suficiente para dar mate.' }[r.kind];
      }
      setTimeout(() => {
        if (!G || G.over !== r) return;
        overlay.innerHTML = `<h2>${title}</h2><p>${sub}</p>
          <div class="stats"><div><b>${Math.ceil(G.moves.length / 2)}</b><span>lances</span></div>
          <div><b>${G.mode === 'ai' ? LEVELS[G.level].name : '2 jog.'}</b><span>modo</span></div>
          <div><b>${wins().reduce((a, c) => a + c, 0)}</b><span>vitórias</span></div></div>
          <button class="btn primary" data-a="again">Jogar outra vez</button>
          <button class="btn center" data-a="look">Ver o tabuleiro</button>
          <button class="btn center" data-a="menu">Menu</button>`;
        overlay.hidden = false;
        overlay.querySelector('[data-a=again]').onclick = () => newGame(settings);
        overlay.querySelector('[data-a=look]').onclick = () => { overlay.hidden = true; };
        overlay.querySelector('[data-a=menu]').onclick = host.exit;
      }, 700);
    }

    // ---------- Ecrãs ----------
    function showSetup(canCancel) {
      const s = { ...settings };
      const w = wins();
      const draw = () => {
        overlay.innerHTML = `<h2>Nova partida</h2>
          <div class="ch-lbl">Adversário</div>
          <div class="ch-opts" data-g="mode"><button data-v="ai">Computador</button><button data-v="two">2 jogadores</button></div>
          ${s.mode === 'ai' ? `<div class="ch-lbl">Jogas com</div>
          <div class="ch-opts" data-g="color"><button data-v="1">Brancas</button><button data-v="-1">Pretas</button><button data-v="0">Ao acaso</button></div>
          <div class="ch-lbl">Nível</div>
          <div class="ch-opts" data-g="level">${LEVELS.map((l, i) => `<button data-v="${i}">${l.name}<small>${w[i]} vit.</small></button>`).join('')}</div>` : ''}
          <div style="height:6px"></div>
          <button class="btn primary" data-a="start">Começar</button>
          ${canCancel ? '<button class="btn center" data-a="cancel">Voltar</button>' : '<button class="btn center" data-a="menu">Menu</button>'}`;
        overlay.querySelectorAll('[data-g]').forEach(g => {
          g.querySelectorAll('button').forEach(bn => {
            const v = g.dataset.g === 'mode' ? bn.dataset.v : +bn.dataset.v;
            if (s[g.dataset.g] === v) bn.classList.add('on');
            bn.onclick = () => { s[g.dataset.g] = v; draw(); };
          });
        });
        overlay.querySelector('[data-a=start]').onclick = () => newGame(s);
        const c = overlay.querySelector('[data-a=cancel]');
        if (c) c.onclick = () => { overlay.hidden = true; };
        const mn = overlay.querySelector('[data-a=menu]');
        if (mn) mn.onclick = host.exit;
      };
      draw();
      overlay.hidden = false;
    }

    function pause() {
      if (!G) return;
      save();
      const desc = G.mode === 'ai' ? `Contra o computador · ${LEVELS[G.level].name}` : '2 jogadores';
      overlay.innerHTML = `<h2>Pausa</h2><p>${desc} · ${Math.ceil(G.moves.length / 2)} lances</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="new">Nova partida…</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; if (G.over) endGame(G.over); };
      overlay.querySelector('[data-a=restart]').onclick = () => newGame({ ...settings, mode: G.mode, level: G.level, color: G.mode === 'ai' ? G.human : 1 });
      overlay.querySelector('[data-a=new]').onclick = () => showSetup(true);
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
    }

    function askPromo(cands) {
      const s = E.side;
      overlay.innerHTML = `<h2>Promoção</h2><p>Escolhe a peça</p><div class="ch-promo">${[5, 4, 3, 2].map(t =>
        `<button data-t="${t}"><span class="pc ${s === 1 ? 'w' : 'b'}" style="${s === 1 ? 'color:#fff;-webkit-text-stroke:1.5px #1c1e38' : 'color:#1c1e38'}">${glyph(t)}</span></button>`).join('')}</div>
        <button class="btn center" data-a="cancel" style="margin-top:8px">Cancelar</button>`;
      overlay.hidden = false;
      overlay.querySelectorAll('[data-t]').forEach(bn => {
        bn.onclick = () => {
          overlay.hidden = true;
          const m = cands.find(m => ((m >> 14) & 7) === +bn.dataset.t);
          if (m) doMove(m);
        };
      });
      overlay.querySelector('[data-a=cancel]').onclick = () => { overlay.hidden = true; sel = -1; render(); };
    }

    // ---------- Desenho ----------
    function layout() {
      const avail = view.h - (top + 18) - 52 - 60 - 76;
      const bs = Math.floor(Math.max(160, Math.min(view.w - 16, avail, 640)) / 8) * 8;
      wrap.style.setProperty('--bs', bs + 'px');
    }

    function idxToSq(i) {
      const row = Math.floor(i / 8), col = i % 8;
      return G.flipped ? row * 16 + (7 - col) : (7 - row) * 16 + col;
    }

    function capturedText(color) {
      // peças da cor `color` que já saíram do tabuleiro
      const start = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 };
      const have = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
        const p = E.board[r * 16 + f] * color;
        if (p > 0 && p < 6) have[p]++;
      }
      let s = '';
      for (const t of [5, 4, 3, 2, 1]) for (let k = 0; k < Math.max(0, start[t] - have[t]); k++) s += glyph(t);
      return s;
    }
    function material(color) {
      const v = [0, 1, 3, 3, 5, 9, 0];
      let n = 0;
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = E.board[r * 16 + f] * color; if (p > 0) n += v[p]; }
      return n;
    }

    function render() {
      if (!G) return;
      layout();
      const last = G.moves.length ? G.moves[G.moves.length - 1] : 0;
      const lf = last ? last & 127 : -1, lt = last ? (last >> 7) & 127 : -1;
      const chk = E.inCheck() ? E.kingSq(E.side) : -1;
      const targets = new Map();
      if (sel >= 0) for (const m of legalNow) if ((m & 127) === sel) targets.set((m >> 7) & 127, m);
      for (let i = 0; i < 64; i++) {
        const sq = idxToSq(i), el = sqEls[i];
        const r = sq >> 4, f = sq & 7;
        let cls = 'ch-sq ' + ((r + f) % 2 ? 'l' : 'd');
        if (sq === lf || sq === lt) cls += ' last';
        if (sq === sel) cls += ' sel';
        if (sq === chk) cls += ' chk';
        el.className = cls;
        const p = E.board[sq];
        let html = p ? `<span class="pc ${p > 0 ? 'w' : 'b'}">${glyph(Math.abs(p))}</span>` : '';
        if (targets.has(sq)) html += p || (targets.get(sq) >> 17 & E.F_EP) ? '<span class="ring"></span>' : '<span class="dot"></span>';
        const bottomRow = i >= 56, leftCol = i % 8 === 0;
        if (bottomRow) html += `<span class="co f">${String.fromCharCode(97 + f)}</span>`;
        if (leftCol) html += `<span class="co r">${r + 1}</span>`;
        el.innerHTML = html;
      }
      // peças capturadas: em cima as que o jogador de baixo capturou? Mostramos junto de quem as capturou.
      const bottomColor = G.flipped ? -1 : 1;
      const topColor = -bottomColor;
      const diff = material(bottomColor) - material(topColor);
      capsBot.innerHTML = `<span class="${topColor === 1 ? 'pw' : 'pb'}">${capturedText(topColor)}</span>${diff > 0 ? `<i>+${diff}</i>` : ''}`;
      capsTop.innerHTML = `<span class="${bottomColor === 1 ? 'pw' : 'pb'}">${capturedText(bottomColor)}</span>${diff < 0 ? `<i>+${-diff}</i>` : ''}`;
      // estado
      const who = E.side === 1 ? 'brancas' : 'pretas';
      let main, sub;
      if (G.over) {
        const r = G.over;
        main = r.kind === 'mate' ? `Xeque-mate · ganham as ${r.winner === 1 ? 'brancas' : 'pretas'}` : 'Empate';
        sub = 'Toca em "Nova" para jogar outra vez';
      } else if (G.mode === 'ai') {
        main = thinking ? 'O computador está a pensar…' : (E.side === G.human ? 'A tua vez' : 'Vez do computador');
        sub = `${LEVELS[G.level].name} · jogas com as ${G.human === 1 ? 'brancas' : 'pretas'}`;
      } else {
        main = `Vez das ${who}`;
        sub = '2 jogadores';
      }
      if (!G.over && chk >= 0) main += ' — Xeque!';
      if (last) sub += ` · último: ${sqName(lf)}–${sqName(lt)}`;
      status.querySelector('b').textContent = main;
      status.querySelector('span').textContent = sub;
      btnUndo.disabled = !G.moves.length || (G.mode === 'ai' && G.human === -1 && G.moves.length < 2 && !G.over);
    }

    function drawBg() {
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, view.w, view.h);
    }

    // ---------- Entrada ----------
    function onDown(e) {
      if (!G || G.over || thinking || !overlay.hidden) return;
      const el = e.target.closest('.ch-sq');
      if (!el) return;
      if (G.mode === 'ai' && E.side !== G.human) return;
      const sq = idxToSq(+el.dataset.i);
      const p = E.board[sq];
      if (sel >= 0) {
        const cands = legalNow.filter(m => (m & 127) === sel && ((m >> 7) & 127) === sq);
        if (cands.length > 1) { askPromo(cands); return; }
        if (cands.length === 1) { doMove(cands[0]); return; }
      }
      if (p && Math.sign(p) === E.side && sq !== sel) {
        sel = sq;
        if (!legalNow.some(m => (m & 127) === sq)) Arcade.buzz(15);
      } else sel = -1;
      render();
    }
    boardEl.addEventListener('pointerdown', onDown);

    bar.onclick = e => {
      const a = e.target.closest('button');
      if (!a || !G) return;
      if (a.dataset.a === 'undo') undo();
      else if (a.dataset.a === 'flip') { G.flipped = !G.flipped; save(); render(); }
      else if (a.dataset.a === 'new') showSetup(!G.over);
    };
    pauseBtn.onclick = pause;

    const onVis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', onVis);
    const onResize = () => { drawBg(); render(); };
    window.addEventListener('resize', onResize);
    const onHide = () => save();
    window.addEventListener('pagehide', onHide);

    // ---------- Arranque ----------
    drawBg();
    const saved = Arcade.store.get(SAVE_KEY, null);
    function validSave(s) {
      if (!s || s.v !== 1 || !Array.isArray(s.moves) || !(s.level >= 0 && s.level < 4)) return false;
      // os lances têm de ser legais desde a posição inicial
      E.setFen(E.START);
      for (const m of s.moves) { if (!E.legal().includes(m)) return false; E.make(m); }
      return true;
    }
    if (validSave(saved)) {
      G = { ...saved, over: null };
      rebuild();
      render();
      overlay.innerHTML = `<h2>Partida guardada</h2>
        <div class="stats"><div><b>${Math.ceil(G.moves.length / 2)}</b><span>lances</span></div>
        <div><b>${G.mode === 'ai' ? LEVELS[G.level].name : '2 jog.'}</b><span>modo</span></div>
        <div><b>${G.mode === 'ai' ? (G.human === 1 ? 'Brancas' : 'Pretas') : '—'}</b><span>cor</span></div></div>
        <button class="btn primary" data-a="go">Continuar partida</button>
        <button class="btn center" data-a="new">Nova partida</button>`;
      overlay.hidden = false;
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; afterChange(); };
      overlay.querySelector('[data-a=new]').onclick = () => showSetup(false);
    } else {
      G = { mode: 'ai', human: 1, level: settings.level, moves: [], flipped: false, over: null };
      rebuild();
      render();
      showSetup(false);
    }

    return {
      destroy() {
        save();
        reqId++;
        clearTimeout(aiTimer);
        if (worker) worker.terminate();
        if (workerUrl) URL.revokeObjectURL(workerUrl);
        disposeCanvas();
        boardEl.removeEventListener('pointerdown', onDown);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('pagehide', onHide);
        G = null;
      },
    };
  }

  Arcade.register({
    id: 'chess',
    title: 'Xadrez',
    icon: '♟️',
    color: '#7379b8',
    desc: 'Xadrez completo contra o computador (4 níveis) ou a dois.',
    best: () => {
      const w = Arcade.store.get('chess:wins', [0, 0, 0, 0]);
      const total = Array.isArray(w) ? w.reduce((a, c) => a + c, 0) : 0;
      if (!total) return 'sem vitórias';
      let top = 0; for (let i = 0; i < 4; i++) if (w[i]) top = i;
      return `${total} ${total === 1 ? 'vitória' : 'vitórias'} · máx. ${LEVELS[top].name}`;
    },
    engine: chessEngine,
    create,
  });
})();
