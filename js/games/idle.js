// Colónia: jogo incremental. Toca no formigueiro para recolher comida, contrata formigas e constrói
// edifícios que produzem sozinhos, compra melhorias e, quando a colónia for grande, funda uma nova rainha.
(function () {
  const TAU = Math.PI * 2;
  const GROWTH = 1.15;
  const OFFLINE_MAX = 12 * 3600;

  // ---------- Números grandes (escala longa, como em Portugal) ----------
  const SUF = ['', ' mil', ' M', ' mM', ' B', ' mB', ' T', ' mT', ' Qd', ' mQd', ' Qt', ' mQt', ' Sx', ' mSx'];
  function trunc(v, d) { const k = Math.pow(10, d); return (Math.floor(v * k + 1e-9) / k).toFixed(d); }
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n);
    if (n < 1000) return (n < 100 && n % 1 > 1e-9 ? trunc(n, 1) : String(Math.floor(n))).replace('.', ',');
    const e = Math.floor(Math.log10(n) / 3);
    if (e >= SUF.length) return n.toExponential(2).replace('.', ',').replace('e+', 'e');
    const v = n / Math.pow(1000, e);
    return (v < 10 ? trunc(v, 2) : v < 100 ? trunc(v, 1) : String(Math.floor(v))).replace('.', ',') + SUF[e];
  }
  function fmtDur(s) {
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (h) return `${h} h ${String(m).padStart(2, '0')} min`;
    if (m) return `${m} min ${String(sec).padStart(2, '0')} s`;
    return `${sec} s`;
  }

  const PRODUCERS = [
    { id: 'op', name: 'Operária', cost: 10, prod: 0.3, color: '#ff6b4a', desc: 'Apanha migalhas perto do formigueiro.' },
    { id: 'ex', name: 'Exploradora', cost: 110, prod: 2, color: '#ff9f43', desc: 'Descobre comida longe de casa.' },
    { id: 'so', name: 'Soldado', cost: 1200, prod: 12, color: '#f7b731', desc: 'Protege as rotas e traz presas grandes.' },
    { id: 'tu', name: 'Túnel', cost: 13000, prod: 70, color: '#a5b1c2', desc: 'Caminhos mais curtos para todas.' },
    { id: 'fu', name: 'Horta de fungos', cost: 150e3, prod: 420, color: '#26de81', desc: 'Cultiva fungos com folhas cortadas.' },
    { id: 'pu', name: 'Quinta de pulgões', cost: 1.8e6, prod: 2600, color: '#2bcbba', desc: 'Pulgões dão melada sem parar.' },
    { id: 'ca', name: 'Câmara real', cost: 24e6, prod: 16000, color: '#45aaf2', desc: 'Mais ovos, mais trabalhadoras.' },
    { id: 'sa', name: 'Formigueiro satélite', cost: 350e6, prod: 1e5, color: '#4b7bec', desc: 'Uma segunda casa do outro lado do jardim.' },
    { id: 'sc', name: 'Supercolónia', cost: 5e9, prod: 650e3, color: '#a55eea', desc: 'Milhões de ninhos ligados entre si.' },
    { id: 'ci', name: 'Cidade subterrânea', cost: 80e9, prod: 4.2e6, color: '#d980fa', desc: 'Avenidas, silos e mercados de sementes.' },
    { id: 'im', name: 'Império das formigas', cost: 1.4e12, prod: 28e6, color: '#fd79a8', desc: 'O continente inteiro trabalha para ti.' },
    { id: 'mc', name: 'Mente coletiva', cost: 25e12, prod: 190e6, color: '#eef0ff', desc: 'Todas as formigas pensam como uma só.' },
  ];

  const TIERS = [10, 25, 50, 100, 150, 200, 250, 300];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const UPGRADES = (function () {
    const U = [];
    const tapN = ['Mandíbulas fortes', 'Patas rápidas', 'Antenas sensíveis', 'Carapaça de aço', 'Ferrão dourado', 'Instinto ancestral', 'Força de mil formigas'];
    [[50, 2], [700, 2], [9000, 2], [2.5e5, 2], [8e6, 3], [4e8, 3], [3e10, 3]].forEach(([c, x], i) =>
      U.push({ id: 'tap' + i, kind: 'tap', mult: x, cost: c, name: tapN[i], desc: `Cada toque rende ×${x}` }));
    [[4e3, 0.02], [5e5, 0.03], [6e7, 0.05], [8e9, 0.05], [1e12, 0.05]].forEach(([c, x], i) =>
      U.push({ id: 'tp' + i, kind: 'tappct', pct: x, cost: c, name: 'Trilho de feromonas ' + ROMAN[i], desc: `Cada toque dá também ${x * 100}% da produção por segundo` }));
    PRODUCERS.forEach((p, i) => TIERS.forEach((t, k) =>
      U.push({ id: p.id + k, kind: 'prod', p: i, need: t, mult: 2, cost: p.cost * Math.pow(GROWTH, t) * 6,
        name: `${p.name} ${ROMAN[k]}`, desc: `Produção de ${p.name.toLowerCase()} ×2 (com ${t})` })));
    [1e5, 1e7, 1e9, 1e11, 1e13, 1e15, 1e17, 1e19, 1e21].forEach((c, i) =>
      U.push({ id: 'g' + i, kind: 'global', mult: 1.5, cost: c, name: 'Rainha sábia ' + ROMAN[i], desc: 'Toda a produção ×1,5' }));
    U.sort((a, b) => a.cost - b.cost);
    return U;
  })();
  const UP_BY_ID = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // Objetivos: cada um dá +1% de produção para sempre.
  const GOALS = (function () {
    const G = [];
    for (let k = 2; k <= 30; k++) G.push({ id: 'f' + k, text: `Recolher ${fmt(Math.pow(10, k))} de comida no total`, test: S => S.life >= Math.pow(10, k), prog: S => S.life / Math.pow(10, k) });
    PRODUCERS.forEach((p, i) => [1, 25, 50, 100, 200].forEach(n =>
      G.push({ id: p.id + 'n' + n, text: n === 1 ? `Comprar: ${p.name}` : `Ter ${n} × ${p.name.toLowerCase()}`, test: S => S.counts[i] >= n, prog: S => S.counts[i] / n })));
    [100, 1000, 10000, 50000].forEach(n => G.push({ id: 't' + n, text: `Tocar ${fmt(n)} vezes no formigueiro`, test: S => S.taps >= n, prog: S => S.taps / n }));
    [1, 3, 10, 25].forEach(n => G.push({ id: 'q' + n, text: `Fundar ${n} ${n === 1 ? 'nova rainha' : 'novas rainhas'}`, test: S => S.prestiges >= n, prog: S => S.prestiges / n }));
    return G;
  })();

  // ---------- Lógica pura ----------
  function freshState(keep) {
    return {
      v: 1, food: 0, run: 0, life: keep ? keep.life : 0, counts: PRODUCERS.map(() => 0), ups: {},
      geleia: keep ? keep.geleia : 0, prestiges: keep ? keep.prestiges : 0, taps: keep ? keep.taps : 0,
      goals: keep ? keep.goals : {}, played: keep ? keep.played : 0, time: Date.now(), runStart: Date.now(),
    };
  }
  function calc(S) {
    const pm = PRODUCERS.map(() => 1);
    let tapMult = 1, tapPct = 0, global = 1;
    for (const id in S.ups) {
      const u = UP_BY_ID[id];
      if (!u) continue;
      if (u.kind === 'prod') pm[u.p] *= u.mult;
      else if (u.kind === 'tap') tapMult *= u.mult;
      else if (u.kind === 'tappct') tapPct += u.pct;
      else if (u.kind === 'global') global *= u.mult;
    }
    const goals = Object.keys(S.goals).length;
    global *= (1 + 0.1 * S.geleia) * (1 + 0.01 * goals);
    const each = PRODUCERS.map((p, i) => p.prod * pm[i] * global);
    let rate = 0;
    PRODUCERS.forEach((p, i) => { rate += S.counts[i] * each[i]; });
    const tap = tapMult * global + tapPct * rate;
    return { rate, tap, each, global };
  }
  function costOf(S, i, n) {
    const p = PRODUCERS[i], r = GROWTH, c = S.counts[i];
    return p.cost * Math.pow(r, c) * (Math.pow(r, n) - 1) / (r - 1);
  }
  function maxAfford(S, i) {
    const p = PRODUCERS[i], r = GROWTH, c = S.counts[i];
    const n = Math.floor(Math.log(S.food * (r - 1) / (p.cost * Math.pow(r, c)) + 1) / Math.log(r));
    return Math.max(0, n);
  }
  function gain(S, amount) { S.food += amount; S.run += amount; S.life += amount; }
  function upVisible(S, u) {
    if (S.ups[u.id]) return false;
    if (u.kind === 'prod') return S.counts[u.p] >= u.need;
    return S.run >= u.cost * 0.25 || S.food >= u.cost * 0.25;
  }
  const geleiaGain = S => Math.floor(Math.sqrt(S.run / 1e6));
  function checkGoals(S) {
    const got = [];
    for (const g of GOALS) if (!S.goals[g.id] && g.test(S)) { S.goals[g.id] = 1; got.push(g); }
    return got;
  }
  function nextGoal(S) {
    let best = null, bp = -1;
    for (const g of GOALS) {
      if (S.goals[g.id]) continue;
      const p = Math.min(0.999, g.prog(S));
      if (p > bp) { bp = p; best = g; }
    }
    return best ? { g: best, p: bp } : null;
  }

  // ---------- Interface ----------
  const CSS = `
.idl-panel{position:absolute;left:0;right:0;bottom:0;z-index:1;background:#15172b;border-radius:18px 18px 0 0;display:flex;flex-direction:column;
  box-shadow:0 -4px 16px rgba(0,0,0,.35)}
.idl-tabs{display:flex;gap:6px;padding:8px 10px 6px}
.idl-tabs button{flex:1;min-height:44px;border-radius:12px;border:0;background:transparent;color:var(--muted);font:inherit;font-size:15px;font-weight:700;position:relative}
.idl-tabs button.on{background:var(--panel);color:var(--text)}
.idl-tabs button .n{display:inline-block;min-width:20px;padding:1px 6px;margin-left:4px;border-radius:10px;background:#ff6b4a;color:#fff;font-size:12px}
.idl-list{flex:1;overflow-y:auto;touch-action:pan-y;-webkit-overflow-scrolling:touch;padding:0 10px calc(env(safe-area-inset-bottom) + 14px)}
.idl-amt{display:flex;gap:6px;margin:2px 0 8px}
.idl-amt button{flex:1;min-height:40px;border-radius:10px;border:2px solid var(--line);background:transparent;color:var(--text);font:inherit;font-weight:700}
.idl-amt button.on{background:var(--accent);border-color:transparent;color:#1a1300}
.idl-row{display:flex;align-items:center;gap:10px;width:100%;min-height:62px;margin-bottom:8px;padding:8px 10px;border-radius:14px;border:2px solid transparent;
  background:var(--panel);color:var(--text);font:inherit;text-align:left}
.idl-row:active{transform:scale(.985)}
.idl-row.ok{border-color:#3b4080}
.idl-row.no{opacity:.55}
.idl-row.locked{opacity:.35}
.idl-ic{flex:none;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;font-weight:800;font-size:15px;color:#15172b}
.idl-mid{flex:1;min-width:0}
.idl-mid b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.idl-mid small{display:block;color:var(--muted);font-size:12px;line-height:1.3}
.idl-cost{flex:none;text-align:right;font-weight:700;font-size:14px;color:var(--accent)}
.idl-cost small{display:block;color:var(--muted);font-weight:500;font-size:11px}
.idl-row.no .idl-cost{color:var(--muted)}
.idl-card{background:var(--panel);border-radius:14px;padding:12px 14px;margin-bottom:8px}
.idl-card h3{margin:0 0 4px;font-size:16px}
.idl-card p{margin:0;color:var(--muted);font-size:13px;line-height:1.4}
.idl-card .big{font-size:22px;font-weight:800;color:var(--accent)}
.idl-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.idl-grid div{background:var(--panel);border-radius:12px;padding:8px 10px}
.idl-grid b{display:block;font-size:16px}
.idl-grid span{color:var(--muted);font-size:12px}
.idl-goal{display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 0;border-bottom:1px solid #23264a}
.idl-goal i{font-style:normal;color:var(--muted);margin-left:auto;flex:none}
.idl-empty{color:var(--muted);text-align:center;padding:24px 10px;font-size:14px}
.idl-prest{width:100%;min-height:52px;margin:6px 0 4px}
.idl-prest:disabled{opacity:.45}
`;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const top = Arcade.safeTop();
    const mk = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    const style = mk('style'); style.textContent = CSS; root.appendChild(style);
    const panel = mk('div', 'idl-panel');
    panel.innerHTML = `<div class="idl-tabs"><button data-tab="col">Colónia</button><button data-tab="up">Melhorias</button><button data-tab="q">Rainha</button></div><div class="idl-list"></div>`;
    root.appendChild(panel);
    const list = panel.querySelector('.idl-list');
    const tabBtns = [...panel.querySelectorAll('[data-tab]')];

    const pauseBtn = mk('button', 'hud-btn'); pauseBtn.textContent = 'II'; pauseBtn.setAttribute('aria-label', 'Pausa');
    root.appendChild(pauseBtn);
    const overlay = mk('div', 'overlay'); overlay.hidden = true; root.appendChild(overlay);

    const SAVE_KEY = 'idle:save', BEST_KEY = 'idle:best';
    let S, C;
    let tab = 'col', amt = Arcade.store.get('idle:amt', 1);
    let lastTick = Date.now(), saveT = 0, uiT = 0, goalT = 0, listKey = '';
    const floats = [], crumbs = [], ants = [];
    let squash = 0, toast = null;

    function validSave(s) {
      return s && s.v === 1 && Array.isArray(s.counts) && typeof s.food === 'number' && isFinite(s.food);
    }
    function save() {
      if (!S) return;
      S.time = Date.now();
      Arcade.store.set(SAVE_KEY, S);
      if (S.life > Arcade.store.get(BEST_KEY, 0)) Arcade.store.set(BEST_KEY, S.life);
    }
    function recalc() { C = calc(S); }

    // Produção pelo relógio real: se passou muito tempo (app em segundo plano ou fechada), é produção offline.
    function catchUp(seconds, announce) {
      const s = Math.max(0, Math.min(OFFLINE_MAX, seconds));
      const amount = C.rate * s;
      gain(S, amount);
      S.played += s;
      if (announce && seconds >= 30) showAway(seconds, s, amount);
    }

    function showAway(real, used, amount) {
      overlay.innerHTML = `<h2>Enquanto estiveste fora…</h2>
        <p>Passaram ${fmtDur(real)}${real > OFFLINE_MAX ? ' (contam no máximo 12 h)' : ''}.</p>
        <div class="stats" style="grid-template-columns:1fr 1fr"><div><b>+${fmt(amount)}</b><span>comida recolhida</span></div>
        <div><b>${fmt(C.rate)}/s</b><span>produção</span></div></div>
        <button class="btn primary" data-a="go">Boa!</button>`;
      overlay.hidden = false;
      overlay.dataset.kind = 'away';
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; };
    }

    // ---------- Ações ----------
    function tapAt(x, y) {
      const v = C.tap;
      gain(S, v);
      S.taps++;
      squash = 1;
      floats.push({ x, y, text: '+' + fmt(v), life: 1 });
      if (floats.length > 30) floats.shift();
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 90 + Math.random() * 120;
        crumbs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.7, c: Math.random() < 0.5 ? '#26de81' : '#ffcc4d' });
      }
      if (crumbs.length > 80) crumbs.splice(0, crumbs.length - 80);
    }

    function buy(i) {
      let n = amt === 'max' ? maxAfford(S, i) : amt;
      if (n < 1) n = 1;
      const c = costOf(S, i, n);
      if (c > S.food + 1e-9) { Arcade.buzz(15); return; }
      S.food -= c;
      S.counts[i] += n;
      Arcade.buzz(10);
      recalc();
      goals();
      refresh(true);
    }
    function buyUp(id) {
      const u = UP_BY_ID[id];
      if (!u || S.ups[id] || u.cost > S.food + 1e-9) { Arcade.buzz(15); return; }
      S.food -= u.cost;
      S.ups[id] = 1;
      Arcade.buzz(12);
      recalc();
      refresh(true);
    }
    function goals() {
      const got = checkGoals(S);
      if (got.length) {
        recalc();
        toast = { text: 'Objetivo cumprido: ' + got[got.length - 1].text + ' (+1%)', life: 3.5 };
      }
    }

    function prestige() {
      const g = geleiaGain(S);
      if (g < 1) return;
      overlay.innerHTML = `<h2>Nova rainha?</h2>
        <p>A colónia atual dispersa-se: perdes a comida, as formigas, os edifícios e as melhorias.<br>
        Ficas com <b>+${g}</b> de geleia real (+${g * 10}% de produção para sempre). Os objetivos mantêm-se.</p>
        <button class="btn primary" data-a="yes">Fundar nova colónia</button>
        <button class="btn center" data-a="no">Ainda não</button>`;
      overlay.hidden = false;
      overlay.dataset.kind = 'q';
      overlay.querySelector('[data-a=yes]').onclick = () => {
        const keep = { life: S.life, geleia: S.geleia + g, prestiges: S.prestiges + 1, taps: S.taps, goals: S.goals, played: S.played };
        S = freshState(keep);
        recalc(); goals(); save();
        overlay.hidden = true;
        tab = 'col';
        refresh(true);
      };
      overlay.querySelector('[data-a=no]').onclick = () => { overlay.hidden = true; };
    }

    function pause() {
      save();
      overlay.innerHTML = `<h2>Pausa</h2><p>As formigas continuam a trabalhar, mesmo com a app fechada (até 12 h).</p>
        <button class="btn primary" data-a="go">Continuar</button>
        <button class="btn center" data-a="restart">Recomeçar do zero</button>
        <button class="btn center" data-a="menu">Menu</button>`;
      overlay.hidden = false;
      overlay.dataset.kind = 'pause';
      overlay.querySelector('[data-a=go]').onclick = () => { overlay.hidden = true; };
      overlay.querySelector('[data-a=menu]').onclick = host.exit;
      overlay.querySelector('[data-a=restart]').onclick = () => {
        overlay.innerHTML = `<h2>Apagar tudo?</h2><p>Perdes a colónia, a geleia real e os objetivos. Não dá para desfazer.</p>
          <button class="btn primary" data-a="yes">Sim, recomeçar do zero</button>
          <button class="btn center" data-a="no">Cancelar</button>`;
        overlay.querySelector('[data-a=yes]').onclick = () => { S = freshState(null); recalc(); save(); overlay.hidden = true; refresh(true); };
        overlay.querySelector('[data-a=no]').onclick = pause;
      };
    }
    pauseBtn.onclick = pause;

    // ---------- Painel ----------
    function producerVisible(i) {
      if (S.counts[i] > 0 || i === 0) return true;
      return S.counts[i - 1] > 0 || S.run >= PRODUCERS[i].cost * 0.3;
    }
    function rowsCol() {
      const ids = [];
      for (let i = 0; i < PRODUCERS.length; i++) {
        if (producerVisible(i)) ids.push('p' + i);
        else { ids.push('L' + i); break; }
      }
      return ids;
    }
    function rowsUp() { return UPGRADES.filter(u => upVisible(S, u)).slice(0, 30).map(u => 'u' + u.id); }

    function buildCol(ids) {
      return `<div class="idl-amt">${[1, 10, 100, 'max'].map(a => `<button data-amt="${a}" class="${amt === a ? 'on' : ''}">${a === 'max' ? 'Máx.' : '×' + a}</button>`).join('')}</div>` +
        ids.map(id => {
          const i = +id.slice(1), p = PRODUCERS[i];
          if (id[0] === 'L') return `<div class="idl-row locked"><div class="idl-ic" style="background:#34386a;color:#9aa0c8">?</div><div class="idl-mid"><b>???</b><small>Junta mais comida para descobrir</small></div><div class="idl-cost">${fmt(p.cost)}</div></div>`;
          return `<button class="idl-row" data-buy="${i}"><div class="idl-ic" style="background:${p.color}" data-r="n"></div>
            <div class="idl-mid"><b>${p.name}</b><small data-r="s"></small></div><div class="idl-cost"><span data-r="c"></span><small data-r="k"></small></div></button>`;
        }).join('');
    }
    function buildUp(ids) {
      if (!ids.length) return `<div class="idl-empty">Sem melhorias disponíveis por agora.<br>Compra mais formigas e edifícios para desbloquear.</div>`;
      return ids.map(id => {
        const u = UP_BY_ID[id.slice(1)];
        const col = u.kind === 'prod' ? PRODUCERS[u.p].color : u.kind === 'global' ? '#ffcc4d' : '#fd79a8';
        const ic = u.kind === 'prod' ? '×2' : u.kind === 'global' ? '×1,5' : u.kind === 'tap' ? '👆︎' : '%';
        return `<button class="idl-row" data-up="${u.id}"><div class="idl-ic" style="background:${col}">${u.kind === 'tap' ? '×' + u.mult : ic}</div>
          <div class="idl-mid"><b>${u.name}</b><small>${u.desc}</small></div><div class="idl-cost"><span data-r="c">${fmt(u.cost)}</span></div></button>`;
      }).join('');
    }
    function buildQ() {
      return `<div class="idl-card"><h3>Geleia real</h3><p><span class="big" data-r="gel"></span> &nbsp;<span data-r="gelb"></span></p>
          <p style="margin-top:6px">Funda uma nova rainha para recomeçar a colónia com um bónus permanente. Quanto mais comida juntares nesta colónia, mais geleia ganhas.</p>
          <button class="btn primary idl-prest" data-prestige="1"></button><p data-r="pg"></p></div>
        <div class="idl-grid">
          <div><b data-r="life"></b><span>comida no total</span></div>
          <div><b data-r="runf"></b><span>nesta colónia</span></div>
          <div><b data-r="taps"></b><span>toques</span></div>
          <div><b data-r="pre"></b><span>rainhas fundadas</span></div>
          <div><b data-r="gl"></b><span>objetivos (+1% cada)</span></div>
          <div><b data-r="time"></b><span>tempo de jogo</span></div>
        </div>
        <div class="idl-card"><h3>Próximos objetivos</h3><div data-r="goals"></div></div>`;
    }

    function refresh(force) {
      if (!S) return;
      const ids = tab === 'col' ? rowsCol() : tab === 'up' ? rowsUp() : ['q'];
      const key = tab + '|' + amt + '|' + ids.join(',');
      if (force || key !== listKey) {
        if (key !== listKey || force) {
          const st = list.scrollTop;
          list.innerHTML = tab === 'col' ? buildCol(ids) : tab === 'up' ? buildUp(ids) : buildQ();
          if (key.split('|')[0] === listKey.split('|')[0]) list.scrollTop = st;
          listKey = key;
        }
      }
      tabBtns.forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
      const nUp = UPGRADES.filter(u => upVisible(S, u) && u.cost <= S.food).length;
      tabBtns[1].innerHTML = 'Melhorias' + (nUp ? `<span class="n">${nUp > 9 ? '9+' : nUp}</span>` : '');
      const gg = geleiaGain(S);
      tabBtns[2].innerHTML = 'Rainha' + (gg >= 1 && gg >= Math.max(1, S.geleia * 0.5) ? '<span class="n">!</span>' : '');

      if (tab === 'col') {
        list.querySelectorAll('[data-buy]').forEach(el => {
          const i = +el.dataset.buy;
          let n = amt === 'max' ? Math.max(1, maxAfford(S, i)) : amt;
          const c = costOf(S, i, n);
          const ok = c <= S.food + 1e-9;
          el.classList.toggle('ok', ok); el.classList.toggle('no', !ok);
          el.querySelector('[data-r=n]').textContent = S.counts[i];
          el.querySelector('[data-r=s]').textContent = `+${fmt(C.each[i])}/s cada · ${fmt(C.each[i] * S.counts[i])}/s no total`;
          el.querySelector('[data-r=c]').textContent = fmt(c);
          el.querySelector('[data-r=k]').textContent = n > 1 || amt !== 1 ? `comprar ${n}` : '';
        });
      } else if (tab === 'up') {
        list.querySelectorAll('[data-up]').forEach(el => {
          const ok = UP_BY_ID[el.dataset.up].cost <= S.food + 1e-9;
          el.classList.toggle('ok', ok); el.classList.toggle('no', !ok);
        });
      } else {
        const q = s => list.querySelector(`[data-r=${s}]`);
        q('gel').textContent = fmt(S.geleia);
        q('gelb').textContent = `+${fmt(S.geleia * 10)}% de produção`;
        const btn = list.querySelector('[data-prestige]');
        btn.textContent = gg >= 1 ? `Nova rainha (+${fmt(gg)} geleia)` : 'Nova rainha';
        btn.disabled = gg < 1;
        const nextAt = Math.pow(gg + 1, 2) * 1e6;
        q('pg').textContent = gg < 1 ? `Precisas de juntar ${fmt(1e6)} de comida nesta colónia (tens ${fmt(S.run)}).`
          : `Próxima geleia aos ${fmt(nextAt)} de comida nesta colónia.`;
        q('life').textContent = fmt(S.life);
        q('runf').textContent = fmt(S.run);
        q('taps').textContent = fmt(S.taps);
        q('pre').textContent = S.prestiges;
        q('gl').textContent = `${Object.keys(S.goals).length}/${GOALS.length}`;
        q('time').textContent = fmtDur(S.played);
        const pending = GOALS.filter(g => !S.goals[g.id]).map(g => ({ g, p: Math.min(0.999, g.prog(S)) })).sort((a, b) => b.p - a.p).slice(0, 5);
        const gk = pending.map(x => x.g.id + Math.floor(x.p * 100)).join();
        const gEl = q('goals');
        if (gEl.dataset.k !== gk) {
          gEl.dataset.k = gk;
          gEl.innerHTML = pending.map(x => `<div class="idl-goal"><span>${x.g.text}</span><i>${Math.floor(x.p * 100)}%</i></div>`).join('') || '<div class="idl-goal">Cumpriste todos!</div>';
        }
      }
    }

    panel.addEventListener('click', e => {
      const t = e.target.closest('button');
      if (!t || !S) return;
      if (t.dataset.tab) { tab = t.dataset.tab; list.scrollTop = 0; refresh(true); }
      else if (t.dataset.amt) { amt = t.dataset.amt === 'max' ? 'max' : +t.dataset.amt; Arcade.store.set('idle:amt', amt); refresh(true); }
      else if (t.dataset.buy) buy(+t.dataset.buy);
      else if (t.dataset.up) buyUp(t.dataset.up);
      else if (t.dataset.prestige) prestige();
    });

    // ---------- Formigueiro (canvas) ----------
    let G = {};
    function layout() {
      const split = Math.round(Math.max(250, Math.min(view.h * 0.42, 400)));
      panel.style.top = split + 'px';
      const groundY = split - 46;
      const r = Math.min(view.w * 0.3, (groundY - top - 150) * 1.1, 130);
      G = { split, groundY, cx: view.w / 2, r: Math.max(50, r) };
    }
    function antTarget() {
      const n = S.counts.reduce((a, c) => a + c, 0);
      return Math.min(46, n ? 2 + Math.floor(Math.log2(n + 1) * 4) : 0);
    }
    function newAnt() {
      const dir = Math.random() < 0.5 ? -1 : 1;
      return { x: G.cx, y: G.groundY + 6 + Math.random() * 22, dir, sp: 22 + Math.random() * 26, out: true,
        far: G.r * 1.05 + Math.random() * (view.w / 2 - G.r * 1.05 - 8), d: 0, t: Math.random() * 10 };
    }

    function onDown(e) {
      if (!S || !overlay.hidden) return;
      if (e.clientY > G.split) return;
      if (e.clientY < top + 70 && e.clientX > view.w - 70) return; // botão de pausa
      tapAt(e.clientX, e.clientY);
    }
    canvas.addEventListener('pointerdown', onDown);

    function update(dt) {
      const now = Date.now();
      let real = (now - lastTick) / 1000;
      lastTick = now;
      if (real < 0) real = 0;
      if (real > 3) catchUp(real, true); // a app esteve parada
      else { gain(S, C.rate * real); S.played += real; }

      saveT += real; uiT += real; goalT += real;
      if (saveT >= 5) { saveT = 0; save(); }
      if (goalT >= 0.5) { goalT = 0; goals(); }
      if (uiT >= 0.2) { uiT = 0; refresh(false); }

      if (squash > 0) squash = Math.max(0, squash - dt * 5);
      for (const f of floats) { f.y -= 55 * dt; f.life -= dt; }
      while (floats.length && floats[0].life <= 0) floats.shift();
      for (const c of crumbs) { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 500 * dt; c.life -= dt; }
      for (let i = crumbs.length - 1; i >= 0; i--) if (crumbs[i].life <= 0) crumbs.splice(i, 1);
      if (toast) { toast.life -= dt; if (toast.life <= 0) toast = null; }

      const want = antTarget();
      while (ants.length < want) ants.push(newAnt());
      if (ants.length > want) ants.length = want;
      for (const a of ants) {
        a.t += dt;
        a.d += a.sp * dt * (a.out ? 1 : -1);
        if (a.out && a.d >= a.far) a.out = false;
        if (!a.out && a.d <= 0) { Object.assign(a, newAnt(), { t: a.t }); }
        a.x = G.cx + a.dir * (G.r * 0.4 + a.d);
      }
    }

    function drawAnt(x, y, dir, carry, t) {
      const s = 1;
      ctx.fillStyle = '#ff6b4a';
      ctx.beginPath(); ctx.arc(x - dir * 5 * s, y, 3.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + dir * 4.5 * s, y - 0.5, 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#ff6b4a'; ctx.lineWidth = 1;
      const w = Math.sin(t * 18) * 1.5;
      ctx.beginPath();
      for (const k of [-1, 0, 1]) { ctx.moveTo(x + k * 2, y); ctx.lineTo(x + k * 2.5 + w * k, y + 4); }
      ctx.stroke();
      if (carry) { ctx.fillStyle = '#26de81'; ctx.beginPath(); ctx.arc(x + dir * 7.5, y - 3, 2.6, 0, TAU); ctx.fill(); }
    }

    function render() {
      const { w, h } = view;
      ctx.fillStyle = '#0f1020';
      ctx.fillRect(0, 0, w, h);
      const { cx, groundY, r, split } = G;
      // chão
      ctx.fillStyle = '#2a1d24';
      ctx.fillRect(0, groundY, w, split - groundY + 20);
      ctx.fillStyle = '#3a2830';
      for (let x = 7; x < w; x += 23) ctx.fillRect(x, groundY + 14 + (x * 7) % 26, 3, 3);
      // formigueiro
      const sq = squash;
      ctx.save();
      ctx.translate(cx, groundY);
      ctx.scale(1 + sq * 0.06, 1 - sq * 0.08);
      ctx.fillStyle = '#c47a3a';
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.78, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#d98f4e';
      ctx.beginPath(); ctx.ellipse(-r * 0.22, -r * 0.1, r * 0.62, r * 0.55, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#e8a766';
      for (let i = 0; i < 9; i++) {
        const a = Math.PI + (i + 0.5) / 9 * Math.PI, rr = r * (0.35 + (i * 37 % 10) / 22);
        ctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr * 0.75, 4, 3);
      }
      ctx.fillStyle = '#3b2412';
      ctx.beginPath(); ctx.ellipse(0, -r * 0.62, r * 0.17, r * 0.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1d24';
      ctx.beginPath(); ctx.ellipse(r * 0.42, -4, r * 0.11, r * 0.07, 0, Math.PI, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(-r * 0.42, -4, r * 0.11, r * 0.07, 0, Math.PI, TAU); ctx.fill();
      ctx.restore();
      if (S.taps < 15) {
        ctx.fillStyle = 'rgba(238,240,255,' + (0.55 + 0.3 * Math.sin(Date.now() / 300)) + ')';
        ctx.font = '600 14px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Toca no formigueiro!', cx, groundY - r * 0.78 - 14);
        ctx.textAlign = 'left';
      }
      for (const a of ants) drawAnt(a.x, a.y, a.out ? a.dir : -a.dir, !a.out, a.t);
      for (const c of crumbs) { ctx.globalAlpha = Math.min(1, c.life * 2); ctx.fillStyle = c.c; ctx.fillRect(c.x - 2, c.y - 2, 4, 4); }
      ctx.globalAlpha = 1;

      // HUD
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#eef0ff';
      ctx.font = '800 32px system-ui, sans-serif';
      ctx.fillText(fmt(S.food), 16, top + 20);
      ctx.fillStyle = '#9aa0c8';
      ctx.font = '600 14px system-ui, sans-serif';
      ctx.fillText(`comida · +${fmt(C.rate)}/s · toque +${fmt(C.tap)}`, 16, top + 58);
      if (S.geleia > 0) {
        ctx.fillStyle = '#ffcc4d';
        ctx.fillText(`Geleia real ${fmt(S.geleia)} (+${fmt(S.geleia * 10)}%)`, 16, top + 78);
      }
      // próximo objetivo
      const ng = nextGoal(S);
      if (ng) {
        const y = top + (S.geleia > 0 ? 120 : 106), x0 = 16, bw = w - 32;
        ctx.fillStyle = '#eef0ff';
        ctx.font = '600 12px system-ui, sans-serif';
        let text = 'Objetivo: ' + ng.g.text;
        while (ctx.measureText(text).width > bw && text.length > 10) text = text.slice(0, -2);
        ctx.fillText(text, x0, y - 14);
        ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x0, y + 4, bw, 6);
        ctx.fillStyle = '#26de81'; ctx.fillRect(x0, y + 4, bw * Math.max(0, ng.p), 6);
      }
      for (const f of floats) {
        ctx.globalAlpha = Math.max(0, Math.min(1, f.life * 1.6));
        ctx.fillStyle = '#ffcc4d';
        ctx.font = '800 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(f.text, f.x, f.y - 30);
        ctx.textAlign = 'left';
      }
      ctx.globalAlpha = 1;
      if (toast) {
        ctx.globalAlpha = Math.min(1, toast.life * 2);
        ctx.font = '700 13px system-ui, sans-serif';
        const tw = Math.min(w - 24, ctx.measureText(toast.text).width + 24);
        const tx = (w - tw) / 2, ty = top + 142;
        ctx.fillStyle = '#26de81';
        ctx.fillRect(tx, ty, tw, 30);
        ctx.fillStyle = '#062b17';
        ctx.textAlign = 'center';
        let text = toast.text;
        while (ctx.measureText(text).width > tw - 16 && text.length > 10) text = text.slice(0, -2);
        ctx.fillText(text, w / 2, ty + 8);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
      }
    }

    // ---------- Gravação e ciclo de vida ----------
    const onVis = () => {
      if (document.hidden) save();
      // ao voltar, update() vê o salto no relógio e conta-o como tempo fora
    };
    document.addEventListener('visibilitychange', onVis);
    const onHide = () => save();
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    const onResize = () => { layout(); };
    window.addEventListener('resize', onResize);

    const saved = Arcade.store.get(SAVE_KEY, null);
    if (validSave(saved)) {
      S = Object.assign(freshState(null), saved);
      while (S.counts.length < PRODUCERS.length) S.counts.push(0);
      recalc();
      const away = (Date.now() - (saved.time || Date.now())) / 1000;
      if (away > 0) catchUp(away, true);
      goals();
    } else {
      S = freshState(null);
      recalc();
    }
    lastTick = Date.now();
    layout();
    for (let i = 0; i < antTarget(); i++) { const a = newAnt(); a.d = Math.random() * a.far; ants.push(a); }
    refresh(true);
    save();

    const loop = Arcade.loop(dt => { update(dt); render(); });

    return {
      destroy() {
        save();
        loop.stop();
        disposeCanvas();
        canvas.removeEventListener('pointerdown', onDown);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pagehide', onHide);
        window.removeEventListener('beforeunload', onHide);
        window.removeEventListener('resize', onResize);
        S = null;
      },
    };
  }

  Arcade.register({
    id: 'idle',
    title: 'Colónia',
    icon: '🐜',
    color: '#c47a3a',
    desc: 'Faz crescer um formigueiro que trabalha mesmo com a app fechada.',
    best: () => {
      const b = Arcade.store.get('idle:best', 0);
      return b ? fmt(b) + ' de comida' : 'ainda nada';
    },
    logic: { PRODUCERS, UPGRADES, GOALS, freshState, calc, costOf, maxAfford, gain, upVisible, geleiaGain, checkGoals, fmt },
    create,
  });
})();
