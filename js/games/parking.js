// Estacionamento: puzzle de blocos deslizantes 6×6. Tira o carro vermelho pela saída.
// Níveis criados pelo gerador abaixo (semente fixa por nível) e verificados por um solver BFS.
(function () {
  const N = 6;            // tabuleiro 6×6
  const EXIT_ROW = 2;     // saída à direita da 3.ª linha
  const GOAL = N - 2;     // coluna do carro vermelho (comprimento 2) quando chega à saída

  // ---------- Motor: carros, jogadas e solver ----------
  // Carro: { h: horizontal?, len, fix: linha (h) ou coluna (v) fixa }. Estado: array com a posição variável de cada carro.
  function cellsOf(car, p) {
    const out = [];
    for (let k = 0; k < car.len; k++) out.push(car.h ? car.fix * N + p + k : (p + k) * N + car.fix);
    return out;
  }

  function occupancy(cars, pos, skip) {
    const occ = new Uint8Array(N * N);
    for (let i = 0; i < cars.length; i++) if (i !== skip) for (const c of cellsOf(cars[i], pos[i])) occ[c] = 1;
    return occ;
  }

  // Limites [min, max] para onde o carro i pode deslizar sem atravessar outros.
  function range(cars, pos, i) {
    const occ = occupancy(cars, pos, i);
    const car = cars[i];
    const at = q => car.h ? car.fix * N + q : q * N + car.fix;
    let lo = pos[i], hi = pos[i];
    while (lo > 0 && !occ[at(lo - 1)]) lo--;
    while (hi + car.len < N && !occ[at(hi + car.len)]) hi++;
    return [lo, hi];
  }

  // Vizinhos de um estado: cada carro desliza qualquer distância (1 jogada).
  function neighbours(cars, pos, fn) {
    const occ = occupancy(cars, pos, -1);
    for (let i = 0; i < cars.length; i++) {
      const car = cars[i], p = pos[i];
      const at = q => car.h ? car.fix * N + q : q * N + car.fix;
      for (let q = p - 1; q >= 0 && !occ[at(q)]; q--) fn(i, q);
      for (let q = p + 1; q + car.len <= N && !occ[at(q + car.len - 1)]; q++) fn(i, q);
    }
  }

  const key = pos => String.fromCharCode.apply(null, pos.map(p => 48 + p));

  // BFS a partir do estado atual até o vermelho chegar à saída. Devolve a lista de jogadas [carro, posição].
  function solve(cars, start, maxStates = 400000) {
    if (start[0] === GOAL) return [];
    const k0 = key(start);
    const prev = new Map([[k0, null]]);
    let frontier = [start];
    while (frontier.length && prev.size < maxStates) {
      const next = [];
      for (const pos of frontier) {
        const kp = key(pos);
        let found = null;
        neighbours(cars, pos, (i, q) => {
          if (found) return;
          const np = pos.slice(); np[i] = q;
          const k = key(np);
          if (prev.has(k)) return;
          prev.set(k, [kp, i, q]);
          if (i === 0 && q === GOAL) found = k;
          else next.push(np);
        });
        if (found) {
          const path = [];
          for (let k = found; prev.get(k); k = prev.get(k)[0]) path.unshift([prev.get(k)[1], prev.get(k)[2]]);
          return path;
        }
      }
      frontier = next;
    }
    return null;
  }

  // ---------- Gerador ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Coloca carros ao acaso; explora todo o conjunto de estados alcançáveis e calcula, para cada um,
  // a distância mínima até à saída. Escolhe um estado exatamente a `target` jogadas.
  function attempt(rand, target, nCars) {
    const cars = [{ h: true, len: 2, fix: EXIT_ROW }];
    const pos = [Math.floor(rand() * 3)];
    const occ = new Uint8Array(N * N);
    for (const c of cellsOf(cars[0], pos[0])) occ[c] = 1;
    let guard = 0;
    while (cars.length < nCars && guard++ < 300) {
      const h = rand() < 0.5, len = rand() < 0.72 ? 2 : 3;
      const fix = Math.floor(rand() * N), p = Math.floor(rand() * (N - len + 1));
      if (h && fix === EXIT_ROW) continue; // um carro deitado na linha da saída tapava-a
      const car = { h, len, fix };
      const cs = cellsOf(car, p);
      if (cs.some(c => occ[c])) continue;
      cs.forEach(c => { occ[c] = 1; });
      cars.push(car); pos.push(p);
    }
    // Todos os estados alcançáveis (o grafo é não dirigido: todas as jogadas se desfazem).
    const seen = new Map([[key(pos), pos]]);
    let frontier = [pos];
    while (frontier.length) {
      const next = [];
      for (const s of frontier) neighbours(cars, s, (i, q) => {
        const np = s.slice(); np[i] = q;
        const k = key(np);
        if (!seen.has(k)) { seen.set(k, np); next.push(np); }
      });
      frontier = next;
      if (seen.size > 250000) return null;
    }
    // BFS multi-origem a partir dos estados resolvidos.
    const dist = new Map();
    frontier = [];
    for (const [k, s] of seen) if (s[0] === GOAL) { dist.set(k, 0); frontier.push(s); }
    if (!frontier.length) return null;
    let d = 0, layer = null;
    while (frontier.length && d < target) {
      const next = [];
      for (const s of frontier) neighbours(cars, s, (i, q) => {
        const np = s.slice(); np[i] = q;
        const k = key(np);
        if (!dist.has(k)) { dist.set(k, d + 1); next.push(np); }
      });
      frontier = next; d++;
      layer = next;
    }
    if (d !== target || !layer || !layer.length) return null;
    // Prefere estados com o vermelho longe da saída e carros a bloqueá-lo.
    layer.sort((a, b) => a[0] - b[0] || key(a).localeCompare(key(b)));
    const best = layer.filter(s => s[0] === layer[0][0]);
    const chosen = best[Math.floor(rand() * best.length)];
    return { cars, pos: chosen, min: target };
  }

  function encode(cars, pos) {
    const b = new Array(N * N).fill('.');
    cars.forEach((car, i) => cellsOf(car, pos[i]).forEach(c => { b[c] = String.fromCharCode(65 + i); }));
    return b.join('');
  }

  function decode(str) {
    const cars = [], pos = [];
    const ids = [...new Set(str.replace(/\./g, ''))].sort();
    for (const id of ids) {
      const cs = [];
      for (let c = 0; c < N * N; c++) if (str[c] === id) cs.push(c);
      const h = cs.length > 1 && cs[1] - cs[0] === 1;
      cars.push({ h, len: cs.length, fix: h ? Math.floor(cs[0] / N) : cs[0] % N });
      pos.push(h ? cs[0] % N : Math.floor(cs[0] / N));
    }
    return { cars, pos };
  }

  // Níveis: 4 pacotes × 15. O mínimo de jogadas sobe ao longo da lista.
  const PACKS = [
    { name: 'Iniciante',  color: '#26c6da' },
    { name: 'Intermédio', color: '#ffcc4d' },
    { name: 'Avançado',   color: '#ff8a3d' },
    { name: 'Perito',     color: '#ff5a8a' },
  ];
  const PER_PACK = 15;
  const TOTAL = PACKS.length * PER_PACK;
  const LAST_TARGET = 33;
  function targetFor(i) {
    // 2 → 35 jogadas, a subir mais depressa nos pacotes finais. O último nível fica com LAST_TARGET
    // (com esta semente não se encontrou 34, 35 nem 36 em 20000 tentativas).
    if (i === TOTAL - 1) return LAST_TARGET;
    return Math.round(2 + 34 * Math.pow(i / (TOTAL - 1), 1.15));
  }
  function generateLevel(i) {
    const target = targetFor(i);
    const rand = rng(0x5eed + i * 7919);
    for (let t = 0; t < 20000; t++) {
      const nCars = 7 + Math.floor(rand() * 7);
      const r = attempt(rand, target, nCars);
      if (r) return { b: encode(r.cars, r.pos), m: r.min };
    }
    return null;
  }

  // Pré-calculados com generateLevel(0..59) (o mesmo código, para não fazer esperar o telemóvel).
  const LEVELS = /*LEVELS*/[
    '.G.KEE.G.KC.AA..C.JJBH.FIIBH.F.DD...02', 'BBB.CCDDD...AA.E...JHE...JHII.FFF.GG02', 'HCDD..HCE...AAE..IJJ.BBI...FF.GG....03', '.H.G...HIG.FAAI..FB..CC.B.....B.EEDD03',
    'HHF.....F.CCAAE...I.E...IBBD..IGGD..04', '.K.FHH.K.FLE.BAALEJB.II.JDDD..CCGG..04', 'EE.....BBBGGAA...H.CCFFH.....D.....D04', '....GG..EEBBAADHIF..DHIF........CC..05',
    '....JJ...G.EAACG.EB.CDD.BHII.FBH...F05', '..JJKKDD..IEAA.BIECLFB.ECLF.H.CGGGH.06', '..B.....BCCCAABEG.D..EG.DFF.........06', 'M.GH.FMEGHBF.EAABF.ELLJJ.CCII..DD.KK07',
    '.DKKK..D.HI.AA.HI.G...BCG.EEBCGJJFF.07', '..IIGG..J.EEAAJDBCH.JDBCH....F.....F08', 'DLKKCCDL.HEEAA.H.F..JJ.FMB..IGMB..IG09', '..KKLL.G..EBJGAAEBJGDDEB.FIC...FICHH09',
    'H.....H.EELLHAA.JF.KBBJFDK.ICCDGGI..10', 'KD.IIIKDBBB.KAA.FECCHJFE..HJG.....G.10', '......JJ....HBAAF.HBECF.IGECF.IGE.DD11', '.C.JJL.C...LAA.FKHGEEFKHG.IDDHG.IBBB11',
    '..LHHH..LF..AA.FEKDCCIEKD..IMBJJGGMB12', '.G..HH.GEJJJAAE..FKCE.DFKCIIDF..BB..12', 'GHH.JBG.EEJBAA..JB..FF..ICKDDDICK...13', 'KLL...K.HBBCAAHG.C..JGII..JDF..EEDF.14',
    '..GFFFDDGHC.IAAHC.I.BBMM..KKKLJJEE.L14', 'IIJJE..MM.EDAABCED..BCLL..FKK.HHF.GG15', '.DDC...I.CMMLIAAJGL.EEJG....BFKKHHBF15', 'JJ..B....EB.AA.EBH.D.CCH.D.IGG.KKIFF16',
    '.HDDLL.H.GGGAAK..BJ.KCCBJII.F...EEF.16', '.EEE.H....BHAAF.BJDDFIBJKC.IGGKC....17', '.HDDC..HEECGAAF.CG..FJIIBMMJ..BKK.LL18', '....JJIEEEF.IAA.F.D.HHF.D.KCCGBBK..G18',
    'KGGGBJKMMHBJAA.HB.DIFF..DI.EE.DCC.LL19', 'KKJJJG.C..EGHCAAEIHCFF.IH.D.LLBBD...19', 'HGGDF.H..DFM.CAAFM.CJJ.B.CIEEBKKILLB20', 'GIIDD.G.F.HJAAF.HJ.KK.HE.CBBBE.CLL..21',
    'B.FFCCB.KKJJAA..EGHHD.EG.LD.EI.LMMMI21', '...CGG..LCKKAAL..ED.LBBEDIIIHJFF..HJ22', 'KIIG..KC.GDD.CAA.MHHL.EM..L.EBJJJFFB22', 'CHHH.IC.JJDIAAKMD.LFKMD.LFBB.GEEE..G23',
    'CCC.H.JJ.BHEAADB.EI.DKK.I.L.FFGGL...24', 'ILLGGGIJJJ.KAA...KEECC.K..DHBBFFDH..24', 'G.HHDDG..BLLAA.B...J.BCCEJFFMKEIIIMK25', 'KK..C.FGG.C.FDAAC..DHBJJIIHB.LEEE..L26',
    '.CCFLMJK.FLMJKAA.MIIHG....HGBBEEEDD.26', 'EEE.GG..HBBMAAH.IMJ.CCIKJ..DDKLLFFF.27', 'HHH.FF..BLLKAAB..KCEEJJDC.GGID....I.28', '..CCCD.EEKGDAA.KGDI.HBFFI.HBLL.JJ...28',
    '.DDDHBMM..HBAAEKHJGCEK.JGC.FF.G.IILL29', 'JJJI.....I.DGAACEDGHHCEF..BKKFLLB..F29', 'CGG...C.IJMMAAIJFE.DDJFE.HHHBLKKK.BL30', '.BBBH...LLHGAA.IMGEJJIMGE.DCFF..DCKK31',
    '..L.CCFFL..MBHAA.MBHDDIMEE.JI.GGGJKK31', '..FBLL..FBHIAA.MHI.DDMEJKGGGEJK..CCC32', 'EDDBBJE.CFFJAAC......LHHIIILG.KK.LG.33', 'CIIIFGCDD.FGAAJBL.KKJBL....HEE...H..33',
    'HBBBC.HGGEC.AA.EC...KJII..KJLL..FFDD34', '.LLL....KGHHAAKGI.ECMMIFECBBIFDD..JJ35', 'F.HHL.FMMMLJAA.ICJ.DDIC...EBGG..EBKK35', 'HDDBBLH.KMMLAAKJ.....JCCFFFGI..EEGI.33',
  ].map(s => s && { b: s.slice(0, 36), m: +s.slice(36) })/*END*/;

  function getLevel(i) {
    if (!LEVELS[i]) LEVELS[i] = generateLevel(i);
    return LEVELS[i];
  }

  // Exposto para testes/pré-cálculo.
  const engine = { solve, generateLevel, decode, encode, targetFor, range, TOTAL, LEVELS };

  // ---------- Interface ----------
  const CAR_COLORS = ['#3d8bff', '#ffcc4d', '#26c6da', '#a55eea', '#ff9f43', '#2bcbba', '#f78fb3', '#7bed9f', '#70a1ff', '#eccc68', '#c39bff', '#ffa07a', '#5fd3f3'];
  const RED = '#ff3b4e';

  const CSS = `
  .pk-bar { position:absolute; left:0; right:0; bottom:calc(env(safe-area-inset-bottom) + 14px); display:flex; gap:8px; justify-content:center; padding:0 12px; }
  .pk-btn { flex:1; max-width:110px; height:56px; border-radius:14px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:13px; font-weight:700;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; }
  .pk-btn i { font-style:normal; font-size:19px; line-height:1; }
  .pk-btn:disabled { opacity:.4; }
  .pk-btn:active { transform:scale(.95); }
  .pk-tabs { display:flex; gap:6px; width:100%; max-width:380px; }
  .pk-tab { flex:1; height:44px; border-radius:12px; border:2px solid #34386a; background:#1a1c33; color:#eef0ff; font:inherit; font-size:12px; font-weight:700; padding:0 2px; }
  .pk-tab.on { border-color:transparent; color:#1a1300; }
  .pk-tab:disabled { opacity:.4; }
  .pk-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; width:100%; max-width:380px; margin:6px 0; }
  .pk-lv { height:58px; border-radius:12px; border:0; background:#2c3170; color:#eef0ff; font:inherit; font-size:18px; font-weight:800; padding:0;
    display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; }
  .pk-lv small { font-size:11px; letter-spacing:1px; color:#ffcc4d; font-weight:700; min-height:13px; }
  .pk-lv.cur { box-shadow:0 0 0 3px #eef0ff inset; }
  .pk-lv:disabled { opacity:.35; }
  .pk-stars { font-size:34px; letter-spacing:6px; color:#ffcc4d; margin:-4px 0 4px; }
  .pk-stars span { color:#34386a; }
  `;

  function starsFor(moves, min, hinted) {
    let s = moves <= min ? 3 : moves <= min + Math.max(2, Math.ceil(min * 0.5)) ? 2 : 1;
    if (hinted) s = Math.min(s, 2);
    return s;
  }

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();

    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const bar = document.createElement('div');
    bar.className = 'pk-bar';
    bar.innerHTML = `
      <button class="pk-btn" data-t="undo"><i>↶</i>Anular</button>
      <button class="pk-btn" data-t="restart"><i>⟲</i>Recomeçar</button>
      <button class="pk-btn" data-t="hint"><i>?</i>Dica</button>
      <button class="pk-btn" data-t="levels"><i>▦</i>Níveis</button>`;
    root.appendChild(bar);
    const tool = n => bar.querySelector(`[data-t=${n}]`);

    const pauseBtn = document.createElement('button');
    pauseBtn.className = 'hud-btn';
    pauseBtn.textContent = 'II';
    pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.hidden = true;
    root.appendChild(overlay);

    // ---------- Estado ----------
    // S = { lvl, pos[], moves, undo[], hinted }
    let S = null, cars = null, min = 0;
    let stars = Arcade.store.get('parking:stars', []);
    let drag = null;        // { i, id, start, lo, hi, off, p0 }
    let hint = null;        // { i, q, t }
    let exitAnim = 0;       // >0 enquanto o vermelho sai
    let shake = 0;
    let B = { x: 0, y: 0, cs: 40 };

    const solvedIn = p => stars.slice(p * PER_PACK, (p + 1) * PER_PACK).filter(x => x > 0).length;
    const packOpen = p => p === 0 || solvedIn(p - 1) >= 10;
    const levelOpen = i => {
      const p = Math.floor(i / PER_PACK), j = i % PER_PACK;
      return packOpen(p) && (j === 0 || stars[i - 1] > 0 || stars[i] > 0);
    };

    function save() {
      if (!S) return;
      Arcade.store.set('parking:stars', stars);
      Arcade.store.set('parking:state', exitAnim ? null : S);
      Arcade.store.set('parking:last', S.lvl);
    }

    function load(lvl, saved) {
      const L = getLevel(lvl);
      const d = decode(L.b);
      cars = d.cars; min = L.m;
      S = saved && saved.lvl === lvl && Array.isArray(saved.pos) && saved.pos.length === cars.length
        ? saved : { lvl, pos: d.pos, moves: 0, undo: [], hinted: false };
      drag = null; hint = null; exitAnim = 0;
      overlay.hidden = true;
      layout();
      updateTools();
      save();
    }

    function updateTools() {
      tool('undo').disabled = !S || !S.undo.length || exitAnim > 0;
      tool('restart').disabled = !S || !S.moves || exitAnim > 0;
      tool('hint').disabled = !S || exitAnim > 0;
    }

    function move(i, q) {
      if (q === S.pos[i]) return;
      S.undo.push([i, S.pos[i]]);
      if (S.undo.length > 300) S.undo.shift();
      S.pos[i] = q;
      S.moves++;
      hint = null;
      Arcade.buzz(8);
      if (i === 0 && q === GOAL) { win(); return; }
      updateTools();
      save();
    }

    function undo() {
      if (!S || !S.undo.length || exitAnim) return;
      const [i, q] = S.undo.pop();
      S.pos[i] = q;
      S.moves = Math.max(0, S.moves - 1);
      hint = null;
      updateTools();
      save();
    }

    function restart() {
      if (!S || exitAnim) return;
      const hinted = S.hinted;
      load(S.lvl, null);
      S.hinted = hinted;
      save();
    }

    function giveHint() {
      if (!S || exitAnim) return;
      const path = solve(cars, S.pos);
      if (!path || !path.length) return;
      const [i, q] = path[0];
      hint = { i, q, t: 0 };
      if (!S.hinted) { S.hinted = true; save(); }
    }

    function win() {
      exitAnim = 0.001;
      drag = null;
      const s = starsFor(S.moves, min, S.hinted);
      const old = stars[S.lvl] || 0;
      while (stars.length < TOTAL) stars.push(0);
      stars[S.lvl] = Math.max(old, s);
      Arcade.store.set('parking:stars', stars);
      Arcade.store.set('parking:state', null);
      updateTools();
      Arcade.buzz(40);
      setTimeout(() => showWin(s, old), 750);
    }

    function showWin(s, old) {
      const lvl = S.lvl, next = lvl + 1;
      const hasNext = next < TOTAL && levelOpen(next);
      const acts = { again: () => load(lvl, null), levels: () => showLevels(Math.floor(lvl / PER_PACK)), menu: host.exit };
      if (hasNext) acts.next = () => load(next, null);
      const st = '★'.repeat(s) + `<span>${'★'.repeat(3 - s)}</span>`;
      const msg = s === 3 ? 'Perfeito! Mínimo de jogadas.' :
        S.hinted && S.moves <= min ? 'Com dica, no máximo 2 estrelas.' : `Consegues em ${min} jogadas?`;
      showOverlay(`
        <h2>Nível ${lvl + 1} resolvido!</h2>
        <div class="pk-stars">${st}</div>
        <p>${msg}${s > old && old ? ' Melhoraste!' : ''}</p>
        <div class="stats">
          <div><b>${S.moves}</b><span>jogadas</span></div>
          <div><b>${min}</b><span>mínimo</span></div>
          <div><b>${stars.reduce((a, b) => a + (b || 0), 0)}★</b><span>total</span></div>
        </div>
        ${hasNext ? '<button class="btn primary" data-a="next">Próximo nível</button><button class="btn center" data-a="again">Jogar outra vez</button>'
          : '<button class="btn primary" data-a="again">Jogar outra vez</button>'}
        <button class="btn center" data-a="levels">Níveis</button>
        <button class="btn center" data-a="menu">Menu</button>`, acts);
      if (!hasNext && next < TOTAL) overlay.querySelector('p').textContent += ` Resolve 10 níveis do pacote para abrir o seguinte.`;
    }

    function showOverlay(html, actions) {
      overlay.innerHTML = html;
      overlay.hidden = false;
      drag = null;
      overlay.querySelectorAll('[data-a]').forEach(b => { b.onclick = actions[b.dataset.a]; });
    }

    function showLevels(pack) {
      if (S && !exitAnim) save();
      if (pack == null) pack = S ? Math.floor(S.lvl / PER_PACK) : 0;
      const tabs = PACKS.map((p, k) => `<button class="pk-tab ${k === pack ? 'on' : ''}" data-p="${k}" ${packOpen(k) ? '' : 'disabled'}
        style="${k === pack ? 'background:' + p.color : ''}">${p.name}<br>${solvedIn(k)}/${PER_PACK}</button>`).join('');
      let cells = '';
      for (let j = 0; j < PER_PACK; j++) {
        const i = pack * PER_PACK + j, s = stars[i] || 0;
        cells += `<button class="pk-lv ${S && S.lvl === i && !exitAnim ? 'cur' : ''}" data-l="${i}" ${levelOpen(i) ? '' : 'disabled'}>${i + 1}<small>${s ? '★'.repeat(s) : ''}</small></button>`;
      }
      const acts = { menu: host.exit };
      if (S && !exitAnim) acts.back = resume;
      showOverlay(`
        <h2>Estacionamento</h2>
        <p>Escolhe um nível · ${stars.reduce((a, b) => a + (b || 0), 0)}★ de ${TOTAL * 3}</p>
        <div class="pk-tabs">${tabs}</div>
        <div class="pk-grid">${cells}</div>
        ${acts.back ? '<button class="btn center" data-a="back">Voltar ao nível</button>' : ''}
        <button class="btn center" data-a="menu">Menu</button>`, acts);
      overlay.querySelectorAll('[data-p]').forEach(b => { b.onclick = () => showLevels(+b.dataset.p); });
      overlay.querySelectorAll('[data-l]').forEach(b => { b.onclick = () => {
        const i = +b.dataset.l;
        if (S && S.lvl === i && !exitAnim) resume(); else load(i, null);
      }; });
    }

    function resume() { overlay.hidden = true; }

    function pause() {
      if (!overlay.hidden || !S || exitAnim) return;
      drag = null;
      save();
      showOverlay(`
        <h2>Pausa</h2>
        <p>Nível ${S.lvl + 1} · ${S.moves} jogada${S.moves === 1 ? '' : 's'} · mínimo ${min}</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar</button>
        <button class="btn center" data-a="levels">Níveis</button>
        <button class="btn center" data-a="menu">Menu</button>`,
        { go: resume, restart: () => { overlay.hidden = true; restart(); }, levels: () => showLevels(), menu: host.exit });
    }
    pauseBtn.onclick = pause;
    const onVis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', onVis);

    tool('undo').onclick = undo;
    tool('restart').onclick = restart;
    tool('hint').onclick = giveHint;
    tool('levels').onclick = () => showLevels();

    // ---------- Entrada (arrastar) ----------
    function carAt(x, y) {
      const c = Math.floor((x - B.x) / B.cs), r = Math.floor((y - B.y) / B.cs);
      if (c < 0 || r < 0 || c >= N || r >= N) return -1;
      const cell = r * N + c;
      for (let i = 0; i < cars.length; i++) if (cellsOf(cars[i], S.pos[i]).includes(cell)) return i;
      return -1;
    }
    function onDown(e) {
      if (!S || drag || exitAnim || !overlay.hidden) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      let i = carAt(x, y);
      // toque ligeiramente fora do carro: tenta as casas vizinhas (dedos grandes)
      if (i < 0) for (const [dx, dy] of [[-.3, 0], [.3, 0], [0, -.3], [0, .3]]) { i = carAt(x + dx * B.cs, y + dy * B.cs); if (i >= 0) break; }
      if (i < 0) return;
      e.preventDefault();
      const [lo, hi] = range(cars, S.pos, i);
      drag = { i, id: e.pointerId, lo, hi, p0: S.pos[i], sx: cars[i].h ? x : y, off: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch {}
    }
    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const rect = canvas.getBoundingClientRect();
      const v = cars[drag.i].h ? e.clientX - rect.left : e.clientY - rect.top;
      const d = (v - drag.sx) / B.cs;
      drag.off = Math.max(drag.lo - drag.p0, Math.min(drag.hi - drag.p0, d));
    }
    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      const q = d.p0 + Math.round(d.off);
      if (q !== d.p0) move(d.i, q);
      else if (Math.abs(d.off) < 0.08 && d.i === 0) shake = 0.25; // toque no vermelho sem o mexer
    }
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    const onKey = e => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) undo();
      else if (e.key === 'Escape') pause();
    };
    window.addEventListener('keydown', onKey);

    // ---------- Desenho ----------
    function layout() {
      const hudH = top + 22 + 72;
      const barH = 56 + 14 + 20;
      const avail = view.h - hudH - barH - 24;
      const size = Math.max(200, Math.min(view.w - 44, avail, 520));
      B.cs = Math.floor(size / N);
      const bw = B.cs * N;
      B.x = Math.round((view.w - bw) / 2) - 8;
      B.y = Math.round(hudH + Math.max(0, avail - bw) * 0.3 + 12);
    }
    window.addEventListener('resize', layout);

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function drawCar(i, p, alpha) {
      const car = cars[i], cs = B.cs, pad = Math.max(3, cs * 0.07);
      const x = B.x + (car.h ? p : car.fix) * cs + pad, y = B.y + (car.h ? car.fix : p) * cs + pad;
      const w = (car.h ? car.len : 1) * cs - pad * 2, h = (car.h ? 1 : car.len) * cs - pad * 2;
      const col = i === 0 ? RED : CAR_COLORS[(i - 1) % CAR_COLORS.length];
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      rr(x + 2, y + 4, w, h, cs * 0.2); ctx.fill();
      ctx.fillStyle = col;
      rr(x, y, w, h, cs * 0.2); ctx.fill();
      // tejadilho e vidros
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      const L = car.h ? w : h, T = car.h ? h : w;
      const ins = T * 0.2;
      if (car.h) {
        rr(x + L * 0.22, y + ins, L * 0.5, T - ins * 2, cs * 0.1); ctx.fill();
        ctx.fillStyle = 'rgba(15,16,32,.55)';
        rr(x + L * 0.72 - T * 0.08, y + ins, T * 0.16, T - ins * 2, 3); ctx.fill();
        rr(x + L * 0.22 - T * 0.12, y + ins, T * 0.12, T - ins * 2, 3); ctx.fill();
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(x + w - 4, y + T * 0.16, 3, T * 0.14); ctx.fillRect(x + w - 4, y + T * 0.7, 3, T * 0.14);
      } else {
        rr(x + ins, y + L * 0.22, T - ins * 2, L * 0.5, cs * 0.1); ctx.fill();
        ctx.fillStyle = 'rgba(15,16,32,.55)';
        rr(x + ins, y + L * 0.22 - T * 0.12, T - ins * 2, T * 0.12, 3); ctx.fill();
        rr(x + ins, y + L * 0.72 - T * 0.08, T - ins * 2, T * 0.16, 3); ctx.fill();
        ctx.fillStyle = '#fff6c8';
        ctx.fillRect(x + T * 0.16, y + 1, T * 0.14, 3); ctx.fillRect(x + T * 0.7, y + 1, T * 0.14, 3);
      }
      ctx.restore();
    }

    function render(dt) {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      if (!S) return;
      const cs = B.cs, bw = cs * N;

      // HUD
      const y0 = top + 22;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '800 22px system-ui, sans-serif';
      ctx.fillText(`Nível ${S.lvl + 1}`, 16, y0);
      const pack = PACKS[Math.floor(S.lvl / PER_PACK)];
      ctx.fillStyle = pack.color;
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.fillText(pack.name, 16, y0 + 28);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(`Jogadas ${S.moves} · mínimo ${min}`, 16, y0 + 50);
      const cur = starsFor(S.moves, min, S.hinted);
      const bestS = stars[S.lvl] || 0;
      ctx.textAlign = 'right';
      ctx.font = '700 15px system-ui, sans-serif';
      const sx = w - 16;
      ctx.fillStyle = '#ffcc4d';
      ctx.fillText('★'.repeat(cur), sx - (3 - cur) * 15.5, y0 + 50);
      ctx.fillStyle = '#34386a';
      ctx.fillText('★'.repeat(3 - cur), sx, y0 + 50);
      if (bestS) { ctx.fillStyle = '#9aa0c8'; ctx.font = '600 12px system-ui, sans-serif'; ctx.fillText(`melhor ${'★'.repeat(bestS)}`, w - 72, y0 + 28); }
      ctx.textAlign = 'left';

      // Parque
      ctx.save();
      if (shake > 0) { shake -= dt; ctx.translate(Math.sin(shake * 60) * 4, 0); }
      const fr = Math.max(8, cs * 0.18);
      ctx.fillStyle = '#34386a';
      rr(B.x - fr, B.y - fr, bw + fr * 2, bw + fr * 2, 16); ctx.fill();
      ctx.fillStyle = '#16182e';
      rr(B.x, B.y, bw, bw, 8); ctx.fill();
      // saída
      ctx.fillStyle = '#16182e';
      ctx.fillRect(B.x + bw - 2, B.y + EXIT_ROW * cs + 3, fr + 4, cs - 6);
      ctx.fillStyle = RED;
      const ex = B.x + bw + fr + 6, ey = B.y + EXIT_ROW * cs + cs / 2;
      ctx.beginPath(); ctx.moveTo(ex, ey - 8); ctx.lineTo(ex + 10, ey); ctx.lineTo(ex, ey + 8); ctx.closePath(); ctx.fill();
      // linhas de estacionamento
      ctx.strokeStyle = 'rgba(255,255,255,.06)';
      ctx.lineWidth = 2;
      for (let k = 1; k < N; k++) {
        ctx.beginPath(); ctx.moveTo(B.x + k * cs, B.y + 6); ctx.lineTo(B.x + k * cs, B.y + bw - 6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(B.x + 6, B.y + k * cs); ctx.lineTo(B.x + bw - 6, B.y + k * cs); ctx.stroke();
      }
      // faixa da saída
      ctx.fillStyle = 'rgba(255,59,78,.08)';
      ctx.fillRect(B.x, B.y + EXIT_ROW * cs, bw, cs);

      // dica: destino fantasma
      if (hint) {
        hint.t += dt;
        drawCar(hint.i, hint.q, 0.25 + 0.15 * Math.sin(hint.t * 6));
      }
      // vermelho a sair: recorta fora do tabuleiro + saída
      for (let i = cars.length - 1; i >= 0; i--) {
        let p = S.pos[i];
        if (drag && drag.i === i) p = drag.p0 + drag.off;
        if (i === 0 && exitAnim) {
          exitAnim += dt;
          p = GOAL + Math.pow(exitAnim * 2.2, 2) * 2;
          ctx.save();
          ctx.beginPath(); ctx.rect(B.x - fr, B.y - fr, bw + fr * 2 + 40, bw + fr * 2); ctx.clip();
          drawCar(0, p, Math.max(0, 1 - (p - GOAL) / 4));
          ctx.restore();
          continue;
        }
        drawCar(i, p, 1);
        if (hint && hint.i === i) {
          const car = cars[i];
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = 0.5 + 0.5 * Math.sin(hint.t * 6);
          ctx.lineWidth = 3;
          const x = B.x + (car.h ? p : car.fix) * cs + 2, y = B.y + (car.h ? car.fix : p) * cs + 2;
          rr(x, y, (car.h ? car.len : 1) * cs - 4, (car.h ? 1 : car.len) * cs - 4, cs * 0.22); ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }

    const loop = Arcade.loop(dt => render(dt));

    // ---------- Arranque ----------
    const saved = Arcade.store.get('parking:state', null);
    if (saved && saved.lvl >= 0 && saved.lvl < TOTAL) load(saved.lvl, saved);
    else {
      let first = 0;
      while (first < TOTAL - 1 && stars[first] > 0 && levelOpen(first + 1)) first++;
      load(first, null);
      showLevels(Math.floor(S.lvl / PER_PACK));
    }

    if (window.ARCADE_DEBUG) window.__parkingDebug = { solve: () => solve(cars, S.pos), hint: () => hint && [hint.i, hint.q], state: () => S, board: () => B, cars: () => cars };

    return {
      destroy() {
        save();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', layout);
        document.removeEventListener('visibilitychange', onVis);
        if (window.__parkingDebug) delete window.__parkingDebug;
      },
    };
  }

  Arcade.register({
    id: 'parking',
    title: 'Estacionamento',
    icon: '🚗',
    color: '#ff4d5e',
    desc: 'Desliza os carros e tira o vermelho do parque. 60 níveis.',
    best: () => {
      const st = Arcade.store.get('parking:stars', []);
      const solved = st.filter(x => x > 0).length;
      return solved ? `${solved}/${TOTAL} níveis · ${st.reduce((a, b) => a + (b || 0), 0)}★` : '—';
    },
    create,
    engine,
  });
})();
