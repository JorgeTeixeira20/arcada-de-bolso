// Masmorra de Cartas: roguelike de construir baralhos. Sobe os 3 andares da torre, combate por turnos
// com cartas, junta relíquias e poções e derrota os três guardiões. A partida inteira fica guardada.
(function () {
  'use strict';

  // =====================================================================
  // 1. DADOS — estados, cartas, relíquias, poções, inimigos, encontros, eventos
  // =====================================================================

  // ---- Estados (buffs e debuffs). dur = diminui 1 no fim do turno de quem o tem ----
  const STATUS = {
    poison:     { n: 'Veneno',     ic: '☠', col: '#26de81', bad: 1, d: n => `Perde ${n} PV no início do turno (ignora o escudo) e depois diminui 1.` },
    weak:       { n: 'Fraqueza',   ic: '↓', col: '#a5b1c2', bad: 1, dur: 1, d: n => `Os ataques causam menos 25% de dano. Dura ${n} turno(s).` },
    vuln:       { n: 'Vulnerável', ic: '✕', col: '#fa8231', bad: 1, dur: 1, d: n => `Sofre mais 50% de dano dos ataques. Dura ${n} turno(s).` },
    str:        { n: 'Força',      ic: '↑', col: '#ff5a6e', d: n => `Os ataques causam ${n >= 0 ? 'mais' : 'menos'} ${Math.abs(n)} de dano por golpe.` },
    dex:        { n: 'Destreza',   ic: '◆', col: '#45aaf2', d: n => `As cartas de escudo dão mais ${n} de escudo.` },
    thorns:     { n: 'Espinhos',   ic: '✶', col: '#fed330', d: n => `Quem atacar sofre ${n} de dano por cada golpe.` },
    plating:    { n: 'Placas',     ic: '▣', col: '#a5b1c2', d: n => `No fim do turno ganha ${n} de escudo.` },
    ritual:     { n: 'Forja',      ic: '⚒', col: '#eb3b5a', d: n => `No início do turno ganha ${n} de Força.` },
    envenom:    { n: 'Untadas',    ic: '✎', col: '#20bf6b', d: n => `Cada golpe dos teus ataques aplica ${n} de Veneno.` },
    greenhouse: { n: 'Estufa',     ic: '❀', col: '#2bcbba', d: n => `No início do turno aplica ${n} de Veneno a todos os inimigos.` },
    regen:      { n: 'Seiva',      ic: '+', col: '#26de81', d: n => `No fim do turno cura ${n} PV.` },
    energize:   { n: 'Pedra',      ic: '⚡', col: '#ffcc4d', d: n => `No início do turno ganha mais ${n} ⚡.` },
    keepBlock:  { n: 'Fortaleza',  ic: '▦', col: '#4b7bec', d: () => `O escudo já não desaparece no início do turno.` },
    echo:       { n: 'Eco',        ic: '◎', col: '#45aaf2', d: n => `Sempre que jogas uma habilidade, ganha ${n} de escudo.` },
    enrage:     { n: 'Fúria',      ic: '!', col: '#ff5a6e', d: n => `Ganha ${n} de Força sempre que jogas uma habilidade.` },
  };

  const TYPE_N = { atk: 'Ataque', skl: 'Habilidade', pwr: 'Poder', st: 'Estado', cur: 'Maldição' };
  const RAR_N = { basic: 'Básica', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', st: 'Estado', cur: 'Maldição' };

  // ---- Efeitos das cartas. run(G, op, alvo) e txt(op, mods) ----
  const plural = (n, s, p) => n === 1 ? s : p;
  const OPS = {
    dmg:      { run: (G, a, t) => G.attack(t, a[1], a[2] || 1), txt: (a, m) => `Causa ${m.d(a[1])} de dano${a[2] > 1 ? ` ×${a[2]}` : ''}.` },
    dmgAll:   { run: (G, a) => G.attackAll(a[1], a[2] || 1), txt: (a, m) => `Causa ${m.d(a[1])} de dano${a[2] > 1 ? ` ×${a[2]}` : ''} a todos os inimigos.` },
    pierce:   { run: (G, a, t) => G.attack(t, a[1], 1, true), txt: (a, m) => `Causa ${m.d(a[1])} de dano que ignora o escudo.` },
    block:    { run: (G, a) => G.block(a[1]), txt: (a, m) => `Ganha ${m.b(a[1])} de escudo.` },
    st:       {
      run: (G, a, t) => a[1] === 'S' ? G.addSt('p', a[2], a[3]) : a[1] === 'A' ? G.stAll(a[2], a[3]) : G.addSt(t, a[2], a[3]),
      txt: a => {
        const s = STATUS[a[2]];
        if (a[1] === 'S') return ['str', 'dex', 'thorns'].includes(a[2]) ? `Ganha ${a[3]} de ${s.n}.` : s.d(a[3]);
        return `Aplica ${a[3]} de ${s.n}${a[1] === 'A' ? ' a todos os inimigos' : ''}.`;
      },
    },
    draw:     { run: (G, a) => G.draw(a[1]), txt: a => `Compra ${a[1]} ${plural(a[1], 'carta', 'cartas')}.` },
    energy:   { run: (G, a) => G.energy(a[1]), txt: a => `Ganha ${a[1]} ⚡.` },
    heal:     { run: (G, a) => G.heal(a[1]), txt: a => `Cura ${a[1]} PV.` },
    hpLoss:   { run: (G, a) => G.hpLoss(a[1]), txt: a => `Perde ${a[1]} PV.` },
    dmgBlock: { run: (G, a, t) => G.attack(t, G.C().block, 1), txt: (a, m) => `Causa dano igual ao teu escudo${m.live ? ` (${m.d(m.blk)})` : ''}.` },
    dmgPoison:{ run: (G, a, t) => G.attack(t, t.st.poison || 0, 1), txt: () => `Causa dano igual ao Veneno do alvo.` },
    mulSt:    { run: (G, a, t) => { const v = t.st[a[2]] || 0; if (v > 0) G.addSt(t, a[2], v * (a[3] - 1)); }, txt: a => `Multiplica por ${a[3]} o ${STATUS[a[2]].n} do alvo.` },
    dblBlock: { run: G => G.block(G.C().block, true), txt: () => `Duplica o teu escudo.` },
    dblStr:   { run: G => { const s = G.C().st.str || 0; if (s > 0) G.addSt('p', 'str', s); }, txt: () => `Duplica a tua Força.` },
  };

  // ---- Cartas: C(id, nome, custo, tipo, raridade, alvo ('e' inimigo | 'n'), efeitos, melhoria, extra) ----
  // melhoria: array = novos efeitos; número = novo custo; objeto {fx, cost}. extra: ex = Esgota, un = Injogável.
  const CARDS = {};
  function C(id, name, cost, type, rar, tgt, fx, up, extra) {
    if (Array.isArray(up)) up = { fx: up };
    else if (typeof up === 'number') up = { cost: up };
    CARDS[id] = Object.assign({ id, name, cost, type, rar, tgt, fx, up: up || null, cls: id[0] }, extra || {});
  }
  const EX = { ex: 1 };

  // Sentinela — escudos, Força e Espinhos
  C('s_golpe', 'Golpe', 1, 'atk', 'basic', 'e', [['dmg', 6]], [['dmg', 9]]);
  C('s_escudo', 'Erguer Escudo', 1, 'skl', 'basic', 'n', [['block', 5]], [['block', 8]]);
  C('s_investida', 'Investida', 2, 'atk', 'basic', 'e', [['dmg', 8], ['st', 'T', 'vuln', 2]], [['dmg', 10], ['st', 'T', 'vuln', 3]]);
  C('s_duplo', 'Corte Duplo', 1, 'atk', 'common', 'e', [['dmg', 5, 2]], [['dmg', 7, 2]]);
  C('s_escudada', 'Escudada', 1, 'atk', 'common', 'e', [['dmgBlock']], 0);
  C('s_pontape', 'Pontapé', 1, 'atk', 'common', 'e', [['dmg', 5], ['st', 'T', 'vuln', 1]], [['dmg', 7], ['st', 'T', 'vuln', 2]]);
  C('s_varrer', 'Varredura', 1, 'atk', 'common', 'n', [['dmgAll', 8]], [['dmgAll', 11]]);
  C('s_rapida', 'Lâmina Rápida', 0, 'atk', 'common', 'e', [['dmg', 3], ['draw', 1]], [['dmg', 5], ['draw', 1]]);
  C('s_postura', 'Postura Firme', 1, 'skl', 'common', 'n', [['block', 5], ['draw', 1]], [['block', 8], ['draw', 1]]);
  C('s_esmagar', 'Esmagar', 2, 'atk', 'common', 'e', [['dmg', 14]], [['dmg', 19]]);
  C('s_grito', 'Grito de Guerra', 0, 'skl', 'common', 'n', [['st', 'A', 'weak', 1]], [['st', 'A', 'weak', 2]], EX);
  C('s_martelada', 'Martelada', 1, 'atk', 'common', 'e', [['dmg', 9], ['st', 'T', 'weak', 1]], [['dmg', 12], ['st', 'T', 'weak', 2]]);
  C('s_espinhoso', 'Escudo Espinhoso', 1, 'skl', 'common', 'n', [['block', 4], ['st', 'S', 'thorns', 2]], [['block', 6], ['st', 'S', 'thorns', 3]]);
  C('s_sangrar', 'Sangrar', 0, 'skl', 'common', 'n', [['hpLoss', 3], ['energy', 1]], [['hpLoss', 3], ['energy', 2]]);
  C('s_contra', 'Contra-golpe', 1, 'atk', 'common', 'e', [['block', 5], ['dmg', 5]], [['block', 7], ['dmg', 7]]);
  C('s_furia', 'Fúria Contida', 1, 'pwr', 'uncommon', 'n', [['st', 'S', 'str', 2]], [['st', 'S', 'str', 3]]);
  C('s_placas', 'Placas de Ferro', 2, 'pwr', 'uncommon', 'n', [['st', 'S', 'plating', 4]], [['st', 'S', 'plating', 6]]);
  C('s_turbilhao', 'Turbilhão', 2, 'atk', 'uncommon', 'n', [['dmgAll', 5, 2]], [['dmgAll', 7, 2]]);
  C('s_desafio', 'Desafio', 1, 'skl', 'uncommon', 'n', [['st', 'A', 'vuln', 2]], [['st', 'A', 'vuln', 3]]);
  C('s_bastiao', 'Bastião', 2, 'skl', 'uncommon', 'n', [['block', 15]], [['block', 20]]);
  C('s_retaliar', 'Retaliação', 1, 'pwr', 'uncommon', 'n', [['st', 'S', 'thorns', 3]], [['st', 'S', 'thorns', 5]]);
  C('s_perfurar', 'Perfurar', 1, 'atk', 'uncommon', 'e', [['pierce', 9]], [['pierce', 13]]);
  C('s_tremor', 'Tremor', 1, 'atk', 'uncommon', 'n', [['dmgAll', 3], ['st', 'A', 'vuln', 1]], [['dmgAll', 5], ['st', 'A', 'vuln', 2]]);
  C('s_reforcar', 'Reforçar', 1, 'skl', 'uncommon', 'n', [['dblBlock']], 0);
  C('s_eco', 'Eco de Aço', 1, 'pwr', 'uncommon', 'n', [['st', 'S', 'echo', 2]], [['st', 'S', 'echo', 3]]);
  C('s_fortaleza', 'Fortaleza', 3, 'pwr', 'rare', 'n', [['st', 'S', 'keepBlock', 1]], 2);
  C('s_forja', 'Forja Interior', 2, 'pwr', 'rare', 'n', [['st', 'S', 'ritual', 1]], 1);
  C('s_final', 'Golpe Final', 3, 'atk', 'rare', 'e', [['dmg', 30]], [['dmg', 40]], EX);
  C('s_ira', 'Ira do Titã', 1, 'skl', 'rare', 'n', [['dblStr']], 0, EX);
  C('s_inabalavel', 'Inabalável', 2, 'skl', 'rare', 'n', [['block', 30]], [['block', 40]], EX);
  C('s_cometa', 'Queda de Cometa', 3, 'atk', 'rare', 'n', [['dmgAll', 18]], [['dmgAll', 24]]);

  // Alquimista — Veneno, compra de cartas e debuffs
  C('a_corte', 'Corte', 1, 'atk', 'basic', 'e', [['dmg', 6]], [['dmg', 9]]);
  C('a_esquiva', 'Esquiva', 1, 'skl', 'basic', 'n', [['block', 5]], [['block', 8]]);
  C('a_frasco', 'Frasco Tóxico', 1, 'skl', 'basic', 'e', [['st', 'T', 'poison', 5]], [['st', 'T', 'poison', 7]]);
  C('a_po', 'Pó Irritante', 0, 'atk', 'basic', 'e', [['dmg', 3], ['st', 'T', 'weak', 1]], [['dmg', 4], ['st', 'T', 'weak', 2]]);
  C('a_dardo', 'Dardo Envenenado', 1, 'atk', 'common', 'e', [['dmg', 4], ['st', 'T', 'poison', 3]], [['dmg', 6], ['st', 'T', 'poison', 4]]);
  C('a_fumo', 'Cortina de Fumo', 1, 'skl', 'common', 'n', [['block', 6], ['st', 'A', 'weak', 1]], [['block', 9], ['st', 'A', 'weak', 1]]);
  C('a_destilar', 'Destilar', 1, 'skl', 'common', 'n', [['draw', 2]], [['draw', 3]]);
  C('a_nuvem', 'Nuvem Tóxica', 1, 'skl', 'common', 'n', [['st', 'A', 'poison', 3]], [['st', 'A', 'poison', 4]]);
  C('a_bisturi', 'Bisturi', 0, 'atk', 'common', 'e', [['dmg', 4]], [['dmg', 6]]);
  C('a_reagente', 'Reagente', 0, 'skl', 'common', 'n', [['block', 3], ['draw', 1]], [['block', 5], ['draw', 1]]);
  C('a_acido', 'Ácido', 1, 'atk', 'common', 'e', [['dmg', 6], ['st', 'T', 'vuln', 1]], [['dmg', 8], ['st', 'T', 'vuln', 2]]);
  C('a_rolar', 'Rolar', 1, 'skl', 'common', 'n', [['block', 8]], [['block', 11]]);
  C('a_explosao', 'Explosão Química', 2, 'atk', 'common', 'n', [['dmgAll', 8]], [['dmgAll', 11]]);
  C('a_transfusao', 'Transfusão', 1, 'atk', 'common', 'e', [['dmg', 5], ['heal', 2]], [['dmg', 7], ['heal', 3]]);
  C('a_fermentar', 'Fermentar', 1, 'skl', 'common', 'e', [['block', 4], ['st', 'T', 'poison', 3]], [['block', 6], ['st', 'T', 'poison', 4]]);
  C('a_agulhas', 'Agulhas', 1, 'atk', 'common', 'e', [['dmg', 2, 3]], [['dmg', 3, 3]]);
  C('a_reacao', 'Reação em Cadeia', 1, 'skl', 'uncommon', 'e', [['mulSt', 'T', 'poison', 2]], [['mulSt', 'T', 'poison', 3]], EX);
  C('a_untar', 'Lâminas Untadas', 1, 'pwr', 'uncommon', 'n', [['st', 'S', 'envenom', 1]], [['st', 'S', 'envenom', 2]]);
  C('a_ferver', 'Ferver', 1, 'atk', 'uncommon', 'e', [['dmgPoison']], 0);
  C('a_estufa', 'Estufa', 2, 'pwr', 'uncommon', 'n', [['st', 'S', 'greenhouse', 2]], [['st', 'S', 'greenhouse', 3]]);
  C('a_reflexos', 'Reflexos', 1, 'pwr', 'uncommon', 'n', [['st', 'S', 'dex', 2]], [['st', 'S', 'dex', 3]]);
  C('a_barreira', 'Barreira Alquímica', 2, 'skl', 'uncommon', 'n', [['block', 13]], [['block', 17]]);
  C('a_corrosivo', 'Fumos Corrosivos', 1, 'skl', 'uncommon', 'e', [['st', 'T', 'vuln', 2], ['st', 'T', 'weak', 2]], [['st', 'T', 'vuln', 3], ['st', 'T', 'weak', 3]]);
  C('a_estudo', 'Estudo Profundo', 1, 'skl', 'uncommon', 'n', [['draw', 3]], 0, EX);
  C('a_bomba', 'Bomba Lenta', 1, 'skl', 'uncommon', 'e', [['st', 'T', 'poison', 8]], [['st', 'T', 'poison', 11]]);
  C('a_infusao', 'Infusão', 0, 'skl', 'uncommon', 'n', [['energy', 1], ['draw', 1]], [['energy', 2], ['draw', 1]], EX);
  C('a_peste', 'Peste', 2, 'skl', 'rare', 'n', [['st', 'A', 'poison', 8]], [['st', 'A', 'poison', 11]], EX);
  C('a_pedra', 'Pedra Filosofal', 3, 'pwr', 'rare', 'n', [['st', 'S', 'energize', 1]], 2);
  C('a_decantar', 'Decantação', 2, 'skl', 'rare', 'n', [['block', 14], ['draw', 2]], [['block', 18], ['draw', 3]]);
  C('a_elixir', 'Elixir da Vida', 2, 'pwr', 'rare', 'n', [['st', 'S', 'regen', 2]], [['st', 'S', 'regen', 3]]);
  C('a_mutagenio', 'Mutagénio', 2, 'pwr', 'rare', 'n', [['st', 'S', 'str', 2], ['st', 'S', 'dex', 2]], [['st', 'S', 'str', 3], ['st', 'S', 'dex', 3]]);
  C('a_golpecorr', 'Golpe Corrosivo', 2, 'atk', 'rare', 'e', [['dmg', 12], ['st', 'T', 'poison', 6]], [['dmg', 16], ['st', 'T', 'poison', 8]]);

  // Estados e maldições (de inimigos e eventos)
  C('x_lodo', 'Lodo', 1, 'st', 'st', 'n', [], null, { ex: 1, txt: 'Não faz nada.' });
  C('x_ferida', 'Ferida', 0, 'st', 'st', 'n', [], null, { un: 1, txt: 'Ocupa espaço na mão.' });
  C('x_fardo', 'Fardo', 0, 'cur', 'cur', 'n', [], null, { un: 1, txt: 'No fim do turno, se estiver na mão, perdes 1 PV.' });

  // ---- Personagens ----
  const CHARS = {
    sentinela: {
      n: 'Sentinela', col: '#ff9f43', hp: 85, relic: 'ambar', cls: 's',
      d: 'Guerreira de escudo pesado. Bloqueia, ganha Força e devolve os golpes com Espinhos.',
      deck: ['s_golpe', 's_golpe', 's_golpe', 's_golpe', 's_golpe', 's_escudo', 's_escudo', 's_escudo', 's_escudo', 's_investida'],
    },
    alquimista: {
      n: 'Alquimista', col: '#26de81', hp: 66, relic: 'frasco', cls: 'a',
      d: 'Mestre dos frascos. Envenena, enfraquece e compra muitas cartas.',
      deck: ['a_corte', 'a_corte', 'a_corte', 'a_corte', 'a_esquiva', 'a_esquiva', 'a_esquiva', 'a_esquiva', 'a_frasco', 'a_po'],
    },
  };

  // ---- Relíquias (efeitos passivos). Ganchos: pick, start, turn, end, play, win; mods = modificadores ----
  const RELICS = {
    ambar:     { n: 'Âmbar Antigo', ic: '●', col: '#ffcc4d', rar: 'start', d: 'No fim de cada combate curas 8 PV.', win: G => G.heal(8) },
    frasco:    { n: 'Frasco Rachado', ic: '⚱', col: '#26de81', rar: 'start', d: 'No início de cada combate aplica 2 de Veneno a todos os inimigos.', start: G => G.stAll('poison', 2) },
    vime:      { n: 'Escudo de Vime', ic: '◈', col: '#cd9b5a', rar: 'common', d: 'Começas cada combate com 8 de escudo.', start: G => G.block(8, true) },
    dente:     { n: 'Dente de Lobo', ic: '▼', col: '#ff5a6e', rar: 'common', d: 'Começas cada combate com 1 de Força.', start: G => G.addSt('p', 'str', 1) },
    pena:      { n: 'Pena de Corvo', ic: '✒', col: '#778ca3', rar: 'common', d: 'No 1.º turno de cada combate compras mais 2 cartas.', mods: { draw1: 2 } },
    lanterna:  { n: 'Lanterna Azul', ic: '♦', col: '#45aaf2', rar: 'common', d: 'Ganhas mais 1 ⚡ no 1.º turno de cada combate.', mods: { en1: 1 } },
    carvalho:  { n: 'Coração de Carvalho', ic: '♥', col: '#20bf6b', rar: 'common', d: 'Ganhas 10 PV máximos.', pick: G => G.maxHp(10) },
    bolsa:     { n: 'Bolsa Funda', ic: '◉', col: '#ffcc4d', rar: 'common', d: 'Ganhas mais 50% de ouro nos combates.', mods: { gold: 0.5 } },
    talisma:   { n: 'Talismã de Cobre', ic: '☥', col: '#fa8231', rar: 'uncommon', d: 'Uma vez por combate, ao desceres abaixo de metade dos PV, curas 12.' },
    vela:      { n: 'Vela Eterna', ic: '♨', col: '#fed330', rar: 'uncommon', d: 'Descansar cura mais 15% dos PV máximos.', mods: { rest: 0.15 } },
    moeda:     { n: 'Moeda do Mercador', ic: '¤', col: '#ffcc4d', rar: 'uncommon', d: 'Tudo na loja custa menos 25%.', mods: { shop: -0.25 } },
    olho:      { n: 'Olho de Vidro', ic: '◎', col: '#a55eea', rar: 'uncommon', d: 'Os inimigos começam os combates com 1 de Vulnerável.', start: G => G.stAll('vuln', 1) },
    ninho:     { n: 'Ninho de Vespas', ic: '✶', col: '#fed330', rar: 'uncommon', d: 'Começas cada combate com 3 de Espinhos.', start: G => G.addSt('p', 'thorns', 3) },
    metronomo: { n: 'Metrónomo de Osso', ic: '♪', col: '#d1d8e0', rar: 'uncommon', d: 'Cada 3.º ataque que jogas num turno dá-te 4 de escudo.' },
    afiar:     { n: 'Pedra de Afiar', ic: '◇', col: '#a5b1c2', rar: 'uncommon', d: 'Ao apanhar: melhora 2 cartas aleatórias.', pick: G => G.upRand(2) },
    cinto:     { n: 'Cinto de Frascos', ic: '⊞', col: '#cd6133', rar: 'uncommon', d: 'Ganhas mais 1 espaço para poções.', pick: G => G.potSlot() },
    musgo:     { n: 'Musgo Vivo', ic: '❦', col: '#26de81', rar: 'rare', d: 'No fim de cada turno curas 1 PV.', end: G => G.heal(1) },
    prata:     { n: 'Placa de Prata', ic: '▣', col: '#d1d8e0', rar: 'rare', d: 'Começas cada combate com 3 de Placas.', start: G => G.addSt('p', 'plating', 3) },
    relogio:   { n: 'Relógio de Sol', ic: '☀', col: '#fed330', rar: 'rare', d: 'A cada 3 turnos ganhas mais 1 ⚡.', turn: (G, t) => { if (t % 3 === 0) G.energy(1); } },
    trevo:     { n: 'Trevo de Ferro', ic: '♣', col: '#20bf6b', rar: 'rare', d: 'As cartas raras aparecem com o dobro da frequência.', mods: { rare: 1 } },
    coroa:     { n: 'Coroa Rachada', ic: '♛', col: '#ffcc4d', rar: 'boss', d: 'Mais 1 ⚡ por turno. Começas os combates com 2 de Fraqueza.', mods: { energy: 1 }, start: G => G.addSt('p', 'weak', 2) },
    nucleo:    { n: 'Núcleo Ardente', ic: '✹', col: '#ff5a6e', rar: 'boss', d: 'Mais 1 ⚡ por turno. Já não podes curar ao descansar.', mods: { energy: 1, noRest: 1 } },
    ampulheta: { n: 'Ampulheta Dourada', ic: '⧗', col: '#fed330', rar: 'boss', d: 'Compras mais 1 carta por turno.', mods: { draw: 1 } },
    grimorio:  { n: 'Grimório Vivo', ic: '❖', col: '#a55eea', rar: 'boss', d: 'Ao apanhar: melhora 4 cartas aleatórias e ganhas 8 PV máximos.', pick: G => { G.upRand(4); G.maxHp(8); } },
  };

  // ---- Poções (usam-se uma vez; t = precisa de alvo; any = pode usar-se fora de combate) ----
  const POTIONS = {
    vida:     { n: 'Poção de Vida', col: '#ff5a6e', d: 'Cura 20 PV.', any: 1, use: G => G.heal(20) },
    forca:    { n: 'Poção de Força', col: '#eb3b5a', d: 'Ganha 2 de Força.', use: G => G.addSt('p', 'str', 2) },
    ferro:    { n: 'Poção de Ferro', col: '#a5b1c2', d: 'Ganha 12 de escudo.', use: G => G.block(12, true) },
    fogo:     { n: 'Frasco de Fogo', col: '#fa8231', d: 'Causa 20 de dano a um inimigo.', t: 1, use: (G, t) => G.damage(t, 20) },
    veneno:   { n: 'Frasco de Veneno', col: '#26de81', d: 'Aplica 7 de Veneno a um inimigo.', t: 1, use: (G, t) => G.addSt(t, 'poison', 7) },
    energia:  { n: 'Poção de Energia', col: '#ffcc4d', d: 'Ganha 2 ⚡.', use: G => G.energy(2) },
    nevoa:    { n: 'Névoa Fria', col: '#778ca3', d: 'Aplica 3 de Fraqueza a um inimigo.', t: 1, use: (G, t) => G.addSt(t, 'weak', 3) },
    agil:     { n: 'Poção Ágil', col: '#45aaf2', d: 'Ganha 2 de Destreza.', use: G => G.addSt('p', 'dex', 2) },
    bomba:    { n: 'Bomba de Pólvora', col: '#d1d8e0', d: 'Causa 10 de dano a todos os inimigos.', use: G => G.damageAll(10) },
    saber:    { n: 'Poção do Saber', col: '#a55eea', d: 'Compra 3 cartas.', use: G => G.draw(3) },
  };

  // ---- Inimigos. moves: { chave: { n: nome, fx } }; ai(e) devolve a chave do próximo movimento ----
  // fx: atk n [vezes] · block n · blockAll n · buff estado n · debuff estado n (no jogador) · add carta n · heal n · summon id máx
  const cyc = (...ks) => e => ks[e.t % ks.length];
  const seq = (k0, ...ks) => e => e.t === 0 ? k0 : ks[(e.t - 1) % ks.length];
  const rnd = (...pairs) => e => { // pares [chave, peso]; nunca 3 vezes seguidas o mesmo
    const h = e.hist, ban = h.length >= 2 && h[h.length - 1] === h[h.length - 2] ? h[h.length - 1] : null;
    const opts = pairs.filter(p => p[0] !== ban);
    let r = Math.random() * opts.reduce((s, p) => s + p[1], 0);
    for (const p of opts) { r -= p[1]; if (r <= 0) return p[0]; }
    return opts[0][0];
  };

  const ENEMIES = {
    // Andar 1
    rato:      { n: 'Rato da Cripta', hp: [11, 15], col: '#9aa0c8', sh: 'round', sz: 0.7, moves: { a: { n: 'Morder', fx: [['atk', 5]] }, b: { n: 'Roer', fx: [['atk', 3], ['debuff', 'weak', 1]] } }, ai: rnd(['a', 65], ['b', 35]) },
    lodo:      { n: 'Lodo Verde', hp: [26, 30], col: '#26de81', sh: 'blob', sz: 1, moves: { a: { n: 'Cuspir', fx: [['atk', 7], ['add', 'x_lodo', 1]] }, b: { n: 'Absorver', fx: [['block', 6], ['buff', 'str', 1]] } }, ai: cyc('a', 'a', 'b') },
    arqueiro:  { n: 'Esqueleto Arqueiro', hp: [20, 24], col: '#d1d8e0', sh: 'tall', sz: 0.9, moves: { a: { n: 'Flecha', fx: [['atk', 6]] }, b: { n: 'Rajada', fx: [['atk', 3, 2]] }, c: { n: 'Mirar', fx: [['buff', 'str', 2]] } }, ai: seq('a', 'b', 'a', 'c') },
    morcego:   { n: 'Morcego Vampiro', hp: [13, 17], col: '#a55eea', sh: 'wing', sz: 0.75, moves: { a: { n: 'Sugar', fx: [['atk', 4], ['heal', 4]] }, b: { n: 'Guincho', fx: [['atk', 2], ['debuff', 'vuln', 1]] } }, ai: rnd(['a', 70], ['b', 30]) },
    cogumelo:  { n: 'Cogumelo Esporento', hp: [22, 26], col: '#ff9f43', sh: 'mush', sz: 0.9, moves: { a: { n: 'Esporos', fx: [['debuff', 'poison', 3]] }, b: { n: 'Cabeçada', fx: [['atk', 8]] } }, ai: cyc('a', 'b') },
    gargula:   { n: 'Gárgula Jovem', hp: [36, 40], col: '#778ca3', sh: 'box', sz: 1.05, moves: { a: { n: 'Garras', fx: [['atk', 10]] }, b: { n: 'Petrificar', fx: [['block', 10]] }, c: { n: 'Rasgar', fx: [['atk', 6], ['debuff', 'vuln', 1]] } }, ai: cyc('a', 'b', 'c') },
    esporo:    { n: 'Esporo', hp: [10, 12], col: '#fed330', sh: 'round', sz: 0.55, minion: 1, moves: { a: { n: 'Picar', fx: [['atk', 4]] }, b: { n: 'Inchar', fx: [['buff', 'str', 1]] } }, ai: seq('a', 'b', 'a', 'a') },
    ogre:      { n: 'Ogre Carrasco', hp: [78, 84], col: '#eb3b5a', sh: 'big', sz: 1.25, elite: 1, moves: { a: { n: 'Urro', fx: [['buff', 'str', 2], ['block', 6]] }, b: { n: 'Machado', fx: [['atk', 14]] }, c: { n: 'Giro', fx: [['atk', 5, 2]] } }, ai: seq('a', 'b', 'c', 'a') },
    cavaleiro: { n: 'Cavaleiro Enferrujado', hp: [70, 74], col: '#cd6133', sh: 'box', sz: 1.2, elite: 1, init: [['buff', 'enrage', 1]], moves: { a: { n: 'Golpe', fx: [['atk', 11]] }, b: { n: 'Guarda', fx: [['block', 12], ['atk', 5]] }, c: { n: 'Provocar', fx: [['debuff', 'weak', 2], ['debuff', 'vuln', 1]] } }, ai: cyc('c', 'a', 'b', 'a') },
    reiFungo:  { n: 'Rei Fungo', hp: [125, 125], col: '#ff9f43', sh: 'mush', sz: 1.5, boss: 1, moves: { a: { n: 'Brotar', fx: [['summon', 'esporo', 2], ['block', 6]] }, b: { n: 'Nuvem de Esporos', fx: [['debuff', 'poison', 4], ['debuff', 'weak', 1]] }, c: { n: 'Esmagar', fx: [['atk', 15]] }, d: { n: 'Nutrir', fx: [['block', 12], ['buff', 'str', 2]] } }, ai: seq('a', 'b', 'c', 'd', 'c', 'a') },
    // Andar 2
    cavOco:    { n: 'Cavaleiro Oco', hp: [44, 48], col: '#8854d0', sh: 'tall', sz: 1.1, moves: { a: { n: 'Estocada', fx: [['atk', 12]] }, b: { n: 'Golpe e guarda', fx: [['atk', 6], ['block', 8]] }, c: { n: 'Uivo', fx: [['debuff', 'weak', 2]] } }, ai: rnd(['a', 45], ['b', 35], ['c', 20]) },
    aranha:    { n: 'Aranha Tecedeira', hp: [28, 32], col: '#4b6584', sh: 'spider', sz: 0.9, moves: { a: { n: 'Teia', fx: [['atk', 4], ['debuff', 'weak', 2]] }, b: { n: 'Picada', fx: [['atk', 6], ['debuff', 'poison', 3]] } }, ai: cyc('a', 'b', 'b') },
    bruxa:     { n: 'Bruxa do Pântano', hp: [36, 40], col: '#20bf6b', sh: 'tri', sz: 1, moves: { a: { n: 'Maldição', fx: [['debuff', 'vuln', 2], ['debuff', 'weak', 2]] }, b: { n: 'Raio', fx: [['atk', 13]] }, c: { n: 'Proteger', fx: [['blockAll', 8]] } }, ai: cyc('a', 'b', 'c', 'b') },
    golem:     { n: 'Golem de Barro', hp: [62, 66], col: '#a5754a', sh: 'big', sz: 1.2, moves: { a: { n: 'Carregar', fx: [['block', 10], ['buff', 'str', 2]] }, b: { n: 'Esmagar', fx: [['atk', 18]] } }, ai: cyc('a', 'b') },
    serpente:  { n: 'Serpente de Cobre', hp: [36, 40], col: '#fa8231', sh: 'wide', sz: 1, moves: { a: { n: 'Dentadas', fx: [['atk', 4, 3]] }, b: { n: 'Peçonha', fx: [['atk', 5], ['debuff', 'poison', 4]] } }, ai: rnd(['a', 55], ['b', 45]) },
    espectro:  { n: 'Espectro', hp: [28, 32], col: '#c8d6e5', sh: 'ghost', sz: 0.9, moves: { a: { n: 'Toque gélido', fx: [['atk', 9], ['debuff', 'weak', 1]] }, b: { n: 'Desvanecer', fx: [['block', 14]] }, c: { n: 'Lamento', fx: [['debuff', 'vuln', 2], ['add', 'x_ferida', 1]] } }, ai: seq('c', 'a', 'b', 'a') },
    aranhico:  { n: 'Aranhiço', hp: [8, 10], col: '#4b6584', sh: 'spider', sz: 0.5, minion: 1, moves: { a: { n: 'Morder', fx: [['atk', 4]] } }, ai: cyc('a') },
    maeAranha: { n: 'Mãe Aranha', hp: [108, 114], col: '#3867d6', sh: 'spider', sz: 1.35, elite: 1, moves: { a: { n: 'Ninhada', fx: [['summon', 'aranhico', 3]] }, b: { n: 'Picada', fx: [['atk', 9], ['debuff', 'poison', 4]] }, c: { n: 'Mordida', fx: [['atk', 18]] }, d: { n: 'Casulo', fx: [['debuff', 'weak', 2], ['block', 12]] } }, ai: seq('a', 'b', 'c', 'd', 'a') },
    carrasco:  { n: 'Carrasco de Bronze', hp: [118, 124], col: '#f7b731', sh: 'big', sz: 1.3, elite: 1, init: [['buff', 'enrage', 1]], moves: { a: { n: 'Cutelo', fx: [['atk', 13]] }, b: { n: 'Golpe duplo', fx: [['atk', 7, 2]] }, c: { n: 'Afiar', fx: [['buff', 'str', 3], ['block', 8]] } }, ai: cyc('a', 'b', 'c') },
    hidra:     { n: 'Hidra de Bronze', hp: [220, 220], col: '#fd9644', sh: 'hydra', sz: 1.5, boss: 1, moves: { a: { n: 'Mordidas', fx: [['atk', 8, 2]] }, b: { n: 'Cuspir ácido', fx: [['debuff', 'poison', 5], ['debuff', 'weak', 2]] }, c: { n: 'Três cabeças', fx: [['atk', 7, 3]] }, d: { n: 'Rugido', fx: [['buff', 'str', 2], ['block', 12]] } }, ai: cyc('a', 'b', 'c', 'd') },
    // Andar 3
    runica:    { n: 'Sentinela Rúnica', hp: [64, 68], col: '#45aaf2', sh: 'box', sz: 1.15, moves: { a: { n: 'Raio rúnico', fx: [['atk', 15]] }, b: { n: 'Barreira', fx: [['block', 14], ['buff', 'plating', 2]] }, c: { n: 'Feixe', fx: [['atk', 8], ['debuff', 'vuln', 2]] } }, ai: cyc('c', 'a', 'b') },
    devorador: { n: 'Devorador', hp: [78, 84], col: '#eb3b5a', sh: 'blob', sz: 1.3, moves: { a: { n: 'Morder', fx: [['atk', 10]] }, b: { n: 'Crescer', fx: [['buff', 'str', 3]] }, c: { n: 'Engolir', fx: [['atk', 22]] } }, ai: cyc('a', 'b', 'c') },
    lamina:    { n: 'Lâmina Viva', hp: [44, 48], col: '#d1d8e0', sh: 'tri', sz: 0.95, moves: { a: { n: 'Retalhar', fx: [['atk', 5, 3]] }, b: { n: 'Afiar', fx: [['buff', 'str', 2], ['block', 6]] } }, ai: cyc('a', 'b', 'a') },
    feiticeiro:{ n: 'Feiticeiro Cinzento', hp: [54, 58], col: '#778ca3', sh: 'tall', sz: 1, moves: { a: { n: 'Praga', fx: [['debuff', 'weak', 2], ['debuff', 'vuln', 2], ['add', 'x_ferida', 1]] }, b: { n: 'Raio', fx: [['atk', 16]] }, c: { n: 'Barreira', fx: [['blockAll', 12]] } }, ai: cyc('a', 'b', 'c', 'b') },
    dragao:    { n: 'Dragão Jovem', hp: [165, 170], col: '#eb3b5a', sh: 'hydra', sz: 1.4, elite: 1, moves: { a: { n: 'Escamas', fx: [['block', 18], ['buff', 'str', 2]] }, b: { n: 'Sopro', fx: [['atk', 6, 3]] }, c: { n: 'Garra', fx: [['atk', 24]] } }, ai: seq('b', 'c', 'a', 'b') },
    golemAnc:  { n: 'Golem Ancestral', hp: [175, 180], col: '#a5754a', sh: 'big', sz: 1.4, elite: 1, init: [['buff', 'plating', 4]], moves: { a: { n: 'Punho', fx: [['atk', 20]] }, b: { n: 'Terramoto', fx: [['atk', 9], ['debuff', 'weak', 2], ['debuff', 'vuln', 2]] }, c: { n: 'Reparar', fx: [['block', 12], ['heal', 10]] } }, ai: cyc('b', 'a', 'c') },
    coracao:   { n: 'Coração da Torre', hp: [420, 420], col: '#ff5a6e', sh: 'heart', sz: 1.55, boss: 1, moves: { a: { n: 'Drenar', fx: [['debuff', 'weak', 2], ['debuff', 'vuln', 2], ['add', 'x_ferida', 2]] }, b: { n: 'Chuva de sangue', fx: [['atk', 3, 6]] }, c: { n: 'Batida', fx: [['atk', 30]] }, d: { n: 'Pulsar', fx: [['buff', 'str', 3], ['block', 25]] } }, ai: cyc('a', 'b', 'c', 'd') },
  };

  // ---- Encontros por andar ----
  const ENC = {
    1: {
      easy: [['rato', 'rato'], ['lodo'], ['cogumelo'], ['morcego', 'morcego']],
      hard: [['arqueiro', 'rato'], ['gargula'], ['lodo', 'cogumelo'], ['rato', 'rato', 'rato'], ['arqueiro', 'arqueiro'], ['morcego', 'cogumelo']],
      elite: [['ogre'], ['cavaleiro']], boss: ['reiFungo'],
    },
    2: {
      easy: [['cavOco'], ['aranha', 'aranha'], ['serpente'], ['espectro', 'espectro']],
      hard: [['bruxa', 'cavOco'], ['golem'], ['serpente', 'aranha'], ['bruxa', 'espectro'], ['golem', 'aranha']],
      elite: [['maeAranha'], ['carrasco']], boss: ['hidra'],
    },
    3: {
      easy: [['runica'], ['lamina', 'lamina'], ['devorador']],
      hard: [['feiticeiro', 'lamina'], ['runica', 'feiticeiro'], ['devorador', 'lamina'], ['runica', 'runica']],
      elite: [['dragao'], ['golemAnc']], boss: ['coracao'],
    },
  };

  // ---- Eventos: escolhas com efeitos. ops: gold, hp, healPct, maxhp, card, relic, potion, upRand, pick, fight, gamble ----
  const EVENTS = [
    { id: 'fonte', n: 'Fonte Turva', t: 'Uma fonte de água escura borbulha no meio da sala. Cheira a ervas e a ferrugem.', ch: [
      { t: 'Beber', d: 'Cura 30% dos PV máximos.', ops: [['healPct', 0.3]], m: 'A água é amarga, mas sentes as feridas a fechar.' },
      { t: 'Encher um frasco', d: 'Ganhas uma poção aleatória.', ops: [['potion']], m: 'Guardas a água num frasco vazio. Brilha estranhamente.' },
      { t: 'Seguir caminho', d: 'Nada acontece.', ops: [], m: 'Não confias em águas paradas.' }] },
    { id: 'altar', n: 'Altar Esquecido', t: 'Um altar coberto de musgo tem uma taça de pedra. Uma inscrição pede uma oferenda.', ch: [
      { t: 'Oferecer sangue', d: 'Perdes 8 PV. Ganhas uma relíquia.', ops: [['hp', -8], ['relic']], m: 'A taça enche-se e algo brilha no fundo.' },
      { t: 'Rezar', d: 'Melhora uma carta aleatória.', ops: [['upRand', 1]], m: 'Sentes-te mais confiante.' },
      { t: 'Ir embora', d: 'Nada acontece.', ops: [], m: 'O altar fica em silêncio.' }] },
    { id: 'mercador', n: 'Mercador Encapuzado', t: 'Um vulto encapuzado abre a capa e mostra pergaminhos antigos. "Tudo tem um preço", sussurra.', ch: [
      { t: 'Comprar um pergaminho', d: 'Pagas 45 de ouro. Ganhas uma carta rara.', req: S => S.gold >= 45, ops: [['gold', -45], ['card', 'rare']], m: 'O pergaminho transforma-se numa carta nas tuas mãos.' },
      { t: 'Vender uma memória', d: 'Perdes 5 PV. Removes uma carta do baralho.', ops: [['hp', -5], ['pick', 'remove']], m: 'Esqueces algo... e sentes-te mais leve.' },
      { t: 'Recusar', d: 'Nada acontece.', ops: [], m: 'O vulto desaparece no escuro.' }] },
    { id: 'mochila', n: 'Mochila Abandonada', t: 'Um esqueleto ainda agarra uma mochila pesada. Algo tilinta lá dentro.', ch: [
      { t: 'Revistar', d: 'Ganhas 75 de ouro, mas apanhas a maldição Fardo.', ops: [['gold', 75], ['card', 'x_fardo']], m: 'Moedas! E um peso estranho nos ombros.' },
      { t: 'Deixar em paz', d: 'Nada acontece.', ops: [], m: 'Que descanse em paz.' }] },
    { id: 'biblioteca', n: 'Biblioteca Afundada', t: 'Estantes meio submersas guardam tomos que ainda se conseguem ler.', ch: [
      { t: 'Ler um tomo', d: 'Ganhas uma carta incomum aleatória.', ops: [['card', 'uncommon']], m: 'Aprendes uma técnica nova.' },
      { t: 'Dormir entre as estantes', d: 'Cura 12 PV.', ops: [['hp', 12]], m: 'Dormes um sono sem sonhos.' }] },
    { id: 'espelho', n: 'Espelho Rachado', t: 'O teu reflexo olha para ti com um sorriso que não é teu.', ch: [
      { t: 'Partir o espelho', d: 'Perdes 6 PV. Removes uma carta do baralho.', ops: [['hp', -6], ['pick', 'remove']], m: 'Os estilhaços cortam-te, mas o reflexo leva algo consigo.' },
      { t: 'Encarar o reflexo', d: 'Ganhas 4 PV máximos.', ops: [['maxhp', 4]], m: 'O reflexo acena e desaparece.' }] },
    { id: 'treinador', n: 'Guerreiro Fantasma', t: 'Um fantasma de armadura aponta para ti. Quer treinar.', ch: [
      { t: 'Treinar', d: 'Perdes 10 PV. Melhora 2 cartas aleatórias.', ops: [['hp', -10], ['upRand', 2]], m: 'Cada golpe dói, mas aprendes com eles.' },
      { t: 'Recusar', d: 'Nada acontece.', ops: [], m: 'O fantasma encolhe os ombros e desvanece.' }] },
    { id: 'jardim', n: 'Jardim de Cogumelos', t: 'Cogumelos luminosos cobrem a sala. Alguns mexem-se.', ch: [
      { t: 'Comer um cogumelo', d: 'Ganhas 5 PV máximos, mas perdes 3 PV.', ops: [['maxhp', 5], ['hp', -3]], m: 'Sabe a terra. Sentes-te mais robusto.' },
      { t: 'Lutar pelo jardim', d: 'Combate. Ganhas uma relíquia se venceres.', ops: [['fight', ['cogumelo', 'cogumelo']]], m: '' }] },
    { id: 'dados', n: 'Dados de Osso', t: 'Um goblin sentado num barril sacode uns dados. "Apostas?"', ch: [
      { t: 'Apostar 30 de ouro', d: 'Metade das vezes ganhas 80 de ouro.', req: S => S.gold >= 30, ops: [['gamble', 0.5, [['gold', 50]], [['gold', -30]], 'Seis e seis! Ganhaste 80 de ouro.', 'Um e dois... Perdeste 30 de ouro.']], m: '' },
      { t: 'Ignorar', d: 'Nada acontece.', ops: [], m: 'O goblin resmunga.' }] },
    { id: 'bigorna', n: 'Bigorna Quente', t: 'Uma forja abandonada ainda arde. Há um martelo pousado na bigorna.', ch: [
      { t: 'Forjar', d: 'Escolhe uma carta para melhorar.', ops: [['pick', 'upgrade']], m: 'O metal canta debaixo do martelo.' },
      { t: 'Aquecer-te', d: 'Cura 8 PV.', ops: [['hp', 8]], m: 'O calor faz-te bem.' }] },
  ];

  // Símbolos das salas no mapa
  const ROOM = {
    m: { n: 'Combate', ic: '⚔', col: '#ff5a6e' },
    e: { n: 'Elite', ic: '☠', col: '#fa8231' },
    $: { n: 'Loja', ic: '$', col: '#ffcc4d' },
    r: { n: 'Descanso', ic: '☾', col: '#45aaf2' },
    '?': { n: 'Evento', ic: '?', col: '#a55eea' },
    t: { n: 'Tesouro', ic: '◆', col: '#fed330' },
    b: { n: 'Guardião', ic: '♚', col: '#eb3b5a' },
  };

  // =====================================================================
  // 2. ESTILOS
  // =====================================================================
  const CSS = `
.mc{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;background:#0f1020;color:#eef0ff;touch-action:none}
.mc button{font:inherit;color:inherit}
.mc-top{flex:none;padding:calc(env(safe-area-inset-top) + 8px) 64px 6px 10px;display:flex;flex-direction:column;gap:6px;background:#15172c;border-bottom:1px solid #26294d}
.mc-top .r1{display:flex;gap:12px;align-items:center;font-weight:700;font-size:15px;white-space:nowrap}
.mc-top .r1 .hp{color:#ff6b7f}.mc-top .r1 .gd{color:#ffcc4d}.mc-top .r1 .fl{color:#9aa0c8;font-weight:600;font-size:13px}
.mc-top .r2{display:flex;gap:6px;align-items:center;min-height:30px}
.mc-chip{flex:none;height:30px;min-width:30px;border-radius:9px;border:1px solid #34386a;background:#1f2240;display:grid;place-items:center;font-size:14px;font-weight:700;padding:0 7px}
.mc-chip.deck{padding:0 9px}
.mc-rel{display:flex;gap:4px;overflow-x:auto;flex:1;scrollbar-width:none}
.mc-rel::-webkit-scrollbar{display:none}
.mc-pot{width:30px;height:30px;border-radius:9px;border:1px dashed #34386a;background:none;position:relative;flex:none;padding:0}
.mc-pot i{position:absolute;left:8px;right:8px;bottom:4px;top:10px;border-radius:5px 5px 7px 7px;background:var(--pc)}
.mc-pot i:before{content:'';position:absolute;left:4px;right:4px;top:-6px;height:6px;background:var(--pc);border-radius:2px;filter:brightness(.7)}
.mc-pot.full{border-style:solid;background:#1f2240}
.mc-pot.sel{outline:3px solid #ffcc4d}
.mc-body{flex:1;position:relative;overflow:hidden;display:flex;flex-direction:column}
.mc-scroll{flex:1;overflow-y:auto;touch-action:pan-y;padding:14px 14px calc(env(safe-area-inset-bottom) + 20px)}
.mc h3{margin:4px 0 10px;font-size:20px}
.mc .sub{color:#9aa0c8;font-size:14px;margin:0 0 12px;line-height:1.4}
.mc .btn{display:block;margin:0 auto 10px}
.mc-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
/* cartas */
.cd{position:relative;width:var(--cw);height:calc(var(--cw)*1.32);text-align:left;border-radius:calc(var(--cw)*.1);background:#23264a;
  border:2px solid var(--rc,#5a5f8f);color:#eef0ff;overflow:hidden;flex:none;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:calc(var(--cw)*.118);line-height:1.22}
.cd.r-common{--rc:#7d84b8}.cd.r-basic{--rc:#4a4f7d}.cd.r-uncommon{--rc:#45aaf2}.cd.r-rare{--rc:#ffcc4d}.cd.r-st{--rc:#555a80}.cd.r-cur{--rc:#8854d0}
.cd.t-atk{--tc:#c9364a}.cd.t-skl{--tc:#2e7fc0}.cd.t-pwr{--tc:#b3871d}.cd.t-st{--tc:#4a4f6d}.cd.t-cur{--tc:#5e3a8f}
.cd .cdi{position:absolute;inset:0;padding-right:var(--pr,0px)}
.cd .nm{font-weight:800;font-size:calc(var(--cw)*.128);line-height:1.08;padding:calc(var(--cw)*.05) 4px 0 calc(var(--cw)*.29);min-height:calc(var(--cw)*.31);display:flex;align-items:center}
.cd.up .nm{color:#7bed9f}
.cd .bd{margin:2px 5px 0;height:calc(var(--cw)*.16);border-radius:4px;background:var(--tc);font-size:calc(var(--cw)*.095);font-weight:700;display:flex;align-items:center;justify-content:center;text-transform:uppercase;letter-spacing:.04em;color:rgba(255,255,255,.85)}
.cd .tx{padding:calc(var(--cw)*.05) 5px 0;text-align:center}
.cd .tx b.hi{color:#7bed9f}.cd .tx b.lo{color:#ff8a9a}
.cd .tx i{color:#c8cce8;font-style:normal;font-weight:700}
.cd .co{position:absolute;left:3px;top:3px;width:calc(var(--cw)*.25);height:calc(var(--cw)*.25);border-radius:50%;background:#ffcc4d;color:#1a1300;font-weight:900;display:grid;place-items:center;font-size:calc(var(--cw)*.16);box-shadow:0 0 0 2px #1a1300}
.cd .co.no{background:#6b6f8f;color:#1f2240}
.cd .pr{position:absolute;left:0;right:0;bottom:0;background:#0f1020e0;color:#ffcc4d;text-align:center;font-weight:800;font-size:calc(var(--cw)*.13);padding:2px 0}
.cd .pr.no{color:#ff6b7f}
.cd.sold{opacity:.25}
/* combate */
.mc-field{flex:1;position:relative;display:flex;align-items:center;justify-content:center;gap:4px;padding:6px 4px 0}
.en{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:4px 2px;border-radius:14px;min-width:0;flex:0 1 auto;background:none;border:0}
.en.dead{visibility:hidden}
.en.tg .eb{outline:3px dashed #ffcc4d;outline-offset:5px}
.en.hov .eb{outline:3px solid #fff;outline-offset:5px}
.en .it{height:30px;display:flex;align-items:center;gap:4px;font-weight:800;font-size:16px;white-space:nowrap;margin-bottom:6px}
.en .it span{display:inline-flex;align-items:center;gap:2px;padding:2px 6px;border-radius:8px;background:#1f2240}
.en .it .ia{color:#ff6b7f}.en .it .id{color:#45aaf2}.en .it .ib{color:#26de81}.en .it .ie{color:#c56cf0}
.eb{position:relative;background:var(--ec);flex:none}
.eb .ey{position:absolute;top:36%;width:16%;height:16%;border-radius:50%;background:#fff}
.eb .ey:after{content:'';position:absolute;left:30%;top:35%;width:45%;height:45%;border-radius:50%;background:#0f1020}
.eb .ey.l{left:27%}.eb .ey.r{right:27%}
.sh-round{border-radius:50%}
.sh-blob{border-radius:50% 50% 38% 38%/62% 62% 38% 38%}
.sh-tall{border-radius:42% 42% 12% 12%}
.sh-box{border-radius:14%}
.sh-big{border-radius:30% 30% 22% 22%}
.sh-tri{clip-path:polygon(50% 0,100% 100%,0 100%)}
.sh-tri .ey{top:55%}
.sh-mush{border-radius:50% 50% 18% 18%/70% 70% 30% 30%}
.sh-wing{clip-path:polygon(0 10%,25% 35%,50% 15%,75% 35%,100% 10%,85% 75%,50% 100%,15% 75%)}
.sh-wing .ey{top:40%}
.sh-spider{border-radius:50%;box-shadow:0 0 0 4px #0f1020,0 0 0 7px var(--ec)}
.sh-ghost{border-radius:50% 50% 8% 8%;clip-path:polygon(0 0,100% 0,100% 100%,83% 88%,66% 100%,50% 88%,33% 100%,17% 88%,0 100%)}
.sh-wide{border-radius:50%/40%}
.sh-hydra{clip-path:polygon(0 30%,15% 0,28% 30%,38% 5%,50% 0,62% 5%,72% 30%,85% 0,100% 30%,92% 100%,8% 100%)}
.sh-hydra .ey{top:48%}
.sh-heart{clip-path:polygon(50% 18%,62% 4%,80% 0,96% 12%,100% 34%,90% 58%,50% 100%,10% 58%,0 34%,4% 12%,20% 0,38% 4%)}
.en .bl{position:absolute;left:-4px;bottom:-4px;min-width:28px;height:28px;border-radius:9px 9px 14px 14px;background:#45aaf2;color:#0f1020;font-weight:900;font-size:14px;display:grid;place-items:center;padding:0 4px}
.en .nmE{font-size:12px;font-weight:700;margin-top:7px;max-width:120px;text-align:center;line-height:1.1;color:#c8cce8}
.hpb{position:relative;width:100%;min-width:74px;height:15px;border-radius:8px;background:#2a2d4f;overflow:hidden;margin-top:4px}
.hpb i{position:absolute;left:0;top:0;bottom:0;background:#ff5a6e}
.hpb.pz i{background:#26de81}
.hpb b{position:relative;display:block;text-align:center;font-size:11px;line-height:15px;font-weight:800;text-shadow:0 1px 2px #000}
.hpb.blk{box-shadow:0 0 0 2px #45aaf2}
.sts{display:flex;flex-wrap:wrap;gap:3px;justify-content:center;margin-top:4px;min-height:20px;max-width:130px}
.sts span{height:20px;min-width:20px;padding:0 4px;border-radius:6px;background:#1f2240;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:1px;color:var(--sc);border:1px solid var(--sc)}
.mc-me{flex:none;display:flex;align-items:center;gap:8px;padding:6px 12px}
.mc-me .who{font-weight:800;font-size:14px;color:var(--pcol)}
.mc-me .hpb{flex:1;max-width:170px;margin:0;height:18px}.mc-me .hpb b{line-height:18px;font-size:12px}
.mc-me .blkB{min-width:34px;height:26px;border-radius:8px 8px 13px 13px;background:#45aaf2;color:#0f1020;font-weight:900;display:grid;place-items:center;padding:0 5px}
.mc-me .sts{justify-content:flex-start;margin:0;flex:1;max-width:none}
.mc-ctrl{flex:none;display:flex;align-items:center;gap:8px;padding:2px 10px 4px}
.mc-en{width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#ffe08a,#ffb31a);color:#1a1300;display:grid;place-items:center;font-weight:900;font-size:19px;box-shadow:0 0 0 3px #1a1300,0 0 0 5px #ffcc4d}
.mc-en.zero{filter:grayscale(.8) brightness(.7)}
.mc-pile{height:44px;min-width:56px;border-radius:12px;border:2px solid #34386a;background:#1a1c33;font-size:12px;font-weight:700;padding:0 8px;line-height:1.1}
.mc-pile b{display:block;font-size:16px}
.mc-endb{margin-left:auto;height:48px;border-radius:14px;border:0;background:#ffcc4d;color:#1a1300!important;font-weight:800!important;font-size:15px!important;padding:0 16px}
.mc-endb:disabled{opacity:.45}
.mc-hand{flex:none;position:relative;height:calc(var(--hcw)*1.32 + 26px + env(safe-area-inset-bottom))}
.mc-hand .cd{position:absolute;bottom:calc(8px + env(safe-area-inset-bottom));transition:transform .15s ease,left .15s ease;touch-action:none}
.mc-hand .cd.sel{transform:translateY(-22px) scale(1.05);box-shadow:0 0 0 3px #ffcc4d,0 8px 18px rgba(0,0,0,.6)}
.mc-hand .cd.drag{transition:none;pointer-events:none;box-shadow:0 0 0 3px #ffcc4d,0 12px 24px rgba(0,0,0,.7)}
.mc-hand .cd.cant{filter:brightness(.7)}
.mc-banner{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);background:#1a1c33ee;border:2px solid #34386a;border-radius:14px;padding:10px 18px;font-weight:800;font-size:18px;pointer-events:none;z-index:5;white-space:nowrap}
.mc-hint{position:absolute;left:0;right:0;bottom:4px;text-align:center;font-size:12px;color:#9aa0c8;pointer-events:none}
.flt{position:fixed;z-index:20;pointer-events:none;font-weight:900;font-size:20px;text-shadow:0 2px 3px #000;animation:mcflt .9s ease-out forwards;transform:translateX(-50%);white-space:nowrap}
.flt.sm{font-size:13px}
@keyframes mcflt{from{opacity:1;margin-top:0}to{opacity:0;margin-top:-46px}}
.en.hit .eb{animation:mchit .3s}
@keyframes mchit{30%{transform:translateX(-6px);filter:brightness(2)}70%{transform:translateX(5px)}}
/* mapa */
.mc-map{position:relative;flex:1;overflow-y:auto;touch-action:pan-y}
.mc-map svg{position:absolute;left:0;top:0}
.mc .mc-node{position:absolute;width:44px;height:44px;border-radius:50%;border:3px solid #34386a;background:#1a1c33;display:grid;place-items:center;font-size:20px;font-weight:900;padding:0;color:var(--nc)}
.mc-node.big{width:68px;height:68px;font-size:34px}
.mc-node.done{background:#34386a;color:#6b6f9f;border-color:#4a4f7d}
.mc-node.cur{border-color:#fff}
.mc-node.av{border-color:var(--nc);box-shadow:0 0 0 4px rgba(255,255,255,.08);animation:mcpulse 1.1s infinite alternate}
.mc-node.off{opacity:.45}
@keyframes mcpulse{to{transform:scale(1.12);box-shadow:0 0 14px var(--nc)}}
.mc-legend{flex:none;display:flex;flex-wrap:wrap;gap:4px 10px;justify-content:center;padding:6px 8px calc(env(safe-area-inset-bottom) + 6px);font-size:12px;color:#9aa0c8;background:#15172c;border-top:1px solid #26294d}
.mc-legend span b{font-weight:900;margin-right:2px}
.mc-mhead{flex:none;padding:8px 12px 4px;font-weight:800;font-size:16px;display:flex;justify-content:space-between;align-items:center}
.mc-mhead small{color:#9aa0c8;font-weight:600}
/* modal */
.mc-modal{position:absolute;inset:0;z-index:4;background:rgba(8,9,20,.86);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;touch-action:pan-y}
.mc-modal[hidden]{display:none}
.mc-box{width:100%;max-width:400px;max-height:100%;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
.mc-box.full{height:100%}
.mc-box .scr{overflow-y:auto;width:100%;flex:1;touch-action:pan-y;padding:4px 0}
.mc-box h2{margin:0;font-size:22px}
.mc-box p{margin:0;color:#c8cce8;line-height:1.4}
.mc-kw{width:100%;text-align:left;background:#1a1c33;border-radius:12px;padding:8px 12px;font-size:13px;color:#c8cce8;line-height:1.35}
.mc-kw b{color:#eef0ff}
.mc-tabs{display:flex;gap:6px;width:100%}
.mc-tabs button{flex:1;height:40px;border-radius:10px;border:2px solid #34386a;background:#1a1c33;font-size:13px;font-weight:700}
.mc-tabs button.on{background:#34386a;border-color:#ffcc4d}
.mc-row{display:flex;gap:10px;align-items:center;justify-content:center}
.mc-relbig{width:54px;height:54px;border-radius:14px;background:#1f2240;border:2px solid var(--rc2,#34386a);display:grid;place-items:center;font-size:28px;flex:none}
.mc-item{display:flex;gap:12px;align-items:center;text-align:left;width:100%;max-width:360px;margin:0 auto 10px;padding:10px 12px;border-radius:14px;border:2px solid #34386a;background:#1a1c33;min-height:56px}
.mc-item div{flex:1;font-size:13px;color:#9aa0c8;line-height:1.3}.mc-item div b{display:block;color:#eef0ff;font-size:15px}
.mc-item .pr{color:#ffcc4d;font-weight:800;font-size:15px}
.mc-item .pr.no{color:#ff6b7f}
.mc-item.sold{opacity:.3}
.mc-chest{width:120px;height:86px;margin:24px auto;position:relative;background:#a5754a;border-radius:10px 10px 8px 8px;box-shadow:inset 0 -10px 0 #7a5535}
.mc-chest:before{content:'';position:absolute;left:-6px;right:-6px;top:-14px;height:34px;background:#cd9b5a;border-radius:16px 16px 4px 4px}
.mc-chest:after{content:'';position:absolute;left:50%;top:14px;width:18px;height:22px;margin-left:-9px;background:#ffcc4d;border-radius:4px}
.mc-chest.open:before{top:-40px;transform:rotate(-12deg)}
.mc-char{display:block;width:100%;max-width:360px;margin:0 auto 12px;text-align:left;padding:14px;border-radius:16px;border:2px solid var(--cc);background:#1a1c33}
.mc-char b{font-size:19px;color:var(--cc)}
.mc-char p{margin:4px 0 0;color:#c8cce8;font-size:14px;line-height:1.35}
.mc-char small{display:block;margin-top:6px;color:#9aa0c8}
.mc-toast{position:absolute;left:50%;top:calc(env(safe-area-inset-top) + 100px);transform:translateX(-50%);z-index:6;background:#2a2d4f;border:1px solid #4a4f7d;padding:8px 14px;border-radius:12px;font-weight:700;font-size:14px;pointer-events:none;white-space:nowrap}
`;

  // =====================================================================
  // 3. JOGO
  // =====================================================================
  const SAVE_KEY = 'cards:run', STATS_KEY = 'cards:stats';
  const R = () => Math.random();
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const pick = a => a[Math.floor(R() * a.length)];
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadStats() {
    const s = Arcade.store.get(STATS_KEY, null) || {};
    return { wins: s.wins || {}, runs: s.runs || 0, maxFloor: s.maxFloor || 0, best: s.best || 0 };
  }

  // Definição efetiva de uma carta (com melhoria aplicada)
  function cdef(inst) {
    const b = CARDS[inst.id];
    if (!inst.up || !b.up) return b;
    return Object.assign({}, b, { name: b.name + '+', fx: b.up.fx || b.fx, cost: b.up.cost != null ? b.up.cost : b.cost });
  }
  const canUp = inst => !inst.up && !!CARDS[inst.id].up;

  function create(host) {
    const { root, canvas } = host;
    const { ctx, view, dispose: disposeCanvas } = Arcade.setupCanvas(canvas);
    const paintBg = () => { ctx.fillStyle = '#0f1020'; ctx.fillRect(0, 0, view.w, view.h); };
    paintBg();

    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const mk = (tag, cls) => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };

    const style = mk('style'); style.textContent = CSS; root.appendChild(style);
    const wrap = mk('div', 'mc'); root.appendChild(wrap);
    const modal = mk('div', 'mc-modal'); modal.hidden = true; root.appendChild(modal);
    const pauseBtn = mk('button', 'hud-btn'); pauseBtn.textContent = 'II'; pauseBtn.setAttribute('aria-label', 'Pausa'); root.appendChild(pauseBtn);
    const overlay = mk('div', 'overlay'); overlay.hidden = true; root.appendChild(overlay);

    let S = null;            // estado da partida (é tudo gravado)
    let FAST = false;        // modo simulação do bot: sem atrasos, sem gravação, sem estatísticas
    let busy = false;        // turno inimigo a decorrer
    let sel = null;          // carta selecionada na mão
    let potSel = null;       // poção à espera de alvo
    let floats = [];
    let hitSet = new Set();
    let toastT = 0;
    let restartArmed = false;

    // ------------------------------------------------------------------
    // 3.1 Gravação e estatísticas
    // ------------------------------------------------------------------
    function save() {
      if (FAST || !S) return;
      Arcade.store.set(SAVE_KEY, S.over ? null : S);
    }
    function commitFloor() {
      if (FAST || !S) return;
      const st = loadStats();
      st.maxFloor = Math.max(st.maxFloor, S.floor);
      const prog = (S.floor - 1) * 13 + (S.map ? S.map.rooms : 0);
      st.best = Math.max(st.best, prog);
      Arcade.store.set(STATS_KEY, st);
    }

    // ------------------------------------------------------------------
    // 3.2 Motor de combate
    // ------------------------------------------------------------------
    const P = 'p';
    const CB = () => S.combat;
    const stOf = w => (w === P ? S.combat.st : w.st);
    const alive = () => S.combat.enemies.filter(e => !e.dead);
    const has = id => S.relics.includes(id);
    function mod(k) { let v = 0; for (const r of S.relics) { const m = RELICS[r].mods; if (m && m[k]) v += m[k]; } return v; }

    function float(w, txt, col, small) {
      if (FAST) return;
      floats.push({ w: w === P ? P : w.uid, txt, col, small });
    }

    function addSt(w, id, n) {
      if (!w || !n || (w !== P && w.dead)) return;
      const st = stOf(w);
      st[id] = (st[id] || 0) + n;
      if (!st[id]) delete st[id];
      float(w, `${STATUS[id].ic} ${n > 0 ? '+' : ''}${n}`, STATUS[id].col, true);
    }
    function stAll(id, n) { for (const e of alive()) addSt(e, id, n); }

    function calcDmg(src, dst, base) {
      const ss = stOf(src);
      let d = base + (ss.str || 0);
      if (ss.weak) d *= 0.75;
      if (dst && stOf(dst).vuln) d *= 1.5;
      return Math.max(0, Math.floor(d));
    }

    function loseHp(w, n) {
      if (n <= 0) return;
      if (w === P) {
        const before = S.hp;
        S.hp = Math.max(0, S.hp - n);
        float(P, '-' + n, '#ff5a6e');
        const C = S.combat;
        if (C && has('talisma') && !C.tal && S.hp > 0 && S.hp < S.maxHp / 2 && before >= S.maxHp / 2) {
          C.tal = 1; heal(12);
        }
      } else {
        if (w.dead) return;
        w.hp = Math.max(0, w.hp - n);
        float(w, '-' + n, '#ff5a6e');
        hitSet.add(w.uid);
        if (w.hp <= 0) killEnemy(w);
      }
    }
    function killEnemy(e) {
      e.dead = true; e.block = 0; e.st = {};
      S.kills++;
      if (!ENEMIES[e.id].minion && !S.combat.enemies.some(x => !x.dead && !ENEMIES[x.id].minion)) {
        for (const x of S.combat.enemies) if (!x.dead) { x.dead = true; x.hp = 0; }
      }
    }

    function damage(dst, amount, pierce) {
      if (dst !== P && dst.dead) return 0;
      let d = amount;
      if (!pierce) {
        const blk = dst === P ? S.combat.block : dst.block;
        const a = Math.min(blk, d);
        if (dst === P) S.combat.block -= a; else dst.block -= a;
        d -= a;
        if (a > 0 && d === 0) float(dst, 'Bloqueado', '#45aaf2', true);
      }
      loseHp(dst, d);
      return d;
    }
    function hit(src, dst, base, pierce) {
      if (src !== P && src.dead) return;
      damage(dst, calcDmg(src, dst, base), pierce);
      const th = stOf(dst).thorns;
      if (th && (src === P || !src.dead)) damage(src, th, false);
    }

    function gainBlock(w, n, raw) {
      if (w === P) {
        if (!raw) n += S.combat.st.dex || 0;
        n = Math.max(0, n);
        S.combat.block += n;
        if (n) float(P, '+' + n + ' ▼', '#45aaf2', true);
      } else { w.block += n; }
    }
    function heal(n) {
      const before = S.hp;
      S.hp = Math.min(S.maxHp, S.hp + n);
      if (S.combat && S.hp > before) float(P, '+' + (S.hp - before), '#26de81');
    }
    function drawCards(n) {
      const C = S.combat;
      for (let i = 0; i < n; i++) {
        if (C.hand.length >= 10) break;
        if (!C.draw.length) {
          if (!C.disc.length) break;
          C.draw = shuffle(C.disc); C.disc = [];
        }
        C.hand.push(C.draw.pop());
      }
    }
    function upRand(n) {
      const ups = shuffle(S.deck.filter(canUp));
      for (let i = 0; i < n && i < ups.length; i++) ups[i].up = 1;
    }
    function newInst(id, up) { return { u: ++S.uid, id, up: up ? 1 : 0 }; }

    // API passada às cartas, relíquias e poções
    const G = {
      C: () => S.combat,
      attack(t, n, times, pierce) {
        if (!t) return;
        for (let i = 0; i < times; i++) {
          if (t.dead || S.hp <= 0) break;
          hit(P, t, n, pierce);
          if (S.combat.st.envenom && !t.dead) addSt(t, 'poison', S.combat.st.envenom);
        }
      },
      attackAll(n, times) {
        for (let i = 0; i < times; i++) for (const e of alive()) {
          hit(P, e, n);
          if (S.combat.st.envenom && !e.dead) addSt(e, 'poison', S.combat.st.envenom);
        }
      },
      damage: (t, n) => { if (t) damage(t, n); },
      damageAll: n => { for (const e of alive()) damage(e, n); },
      block: (n, raw) => gainBlock(P, n, raw),
      addSt: (w, id, n) => addSt(w, id, n),
      stAll,
      draw: drawCards,
      energy: n => { S.combat.energy += n; },
      heal,
      hpLoss: n => loseHp(P, n),
      maxHp: n => { S.maxHp += n; S.hp += n; },
      upRand,
      potSlot: () => { S.pots.push(null); },
    };

    function makeEnemy(id) {
      const d = ENEMIES[id];
      return { uid: ++S.uid, id, hp: 0, maxHp: 0, block: 0, st: {}, next: null, hist: [], t: 0, dead: false, ...(() => { const h = ri(d.hp[0], d.hp[1]); return { hp: h, maxHp: h }; })() };
    }
    function chooseIntent(e) {
      const k = ENEMIES[e.id].ai(e);
      e.next = k; e.hist.push(k); if (e.hist.length > 4) e.hist.shift();
      e.t++;
    }

    function startCombat(ids, kind, extra) {
      const C = {
        kind, enemies: [], draw: shuffle(S.deck.map(c => ({ ...c }))), hand: [], disc: [], exh: [],
        energy: 0, turn: 0, block: 0, st: {}, atkT: 0, tal: 0, relic: !!(extra && extra.relic), name: '',
      };
      S.combat = C; S.screen = 'combat';
      sel = null; potSel = null;
      for (const id of ids) C.enemies.push(makeEnemy(id));
      C.name = ENEMIES[ids[0]].n;
      S.lastFight = C.name;
      for (const e of C.enemies) {
        for (const op of ENEMIES[e.id].init || []) if (op[0] === 'buff') { e.st[op[1]] = (e.st[op[1]] || 0) + op[2]; }
        chooseIntent(e);
      }
      for (const r of S.relics) if (RELICS[r].start) RELICS[r].start(G);
      startTurn();
    }

    function startTurn() {
      const C = S.combat;
      C.turn++; C.atkT = 0;
      if (C.turn > 1 && !C.st.keepBlock) C.block = 0;
      if (C.st.poison) {
        loseHp(P, C.st.poison);
        if (--C.st.poison <= 0) delete C.st.poison;
        if (checkEnd()) return;
      }
      if (C.st.ritual) addSt(P, 'str', C.st.ritual);
      if (C.st.greenhouse) stAll('poison', C.st.greenhouse);
      C.energy = 3 + mod('energy') + (C.st.energize || 0) + (C.turn === 1 ? mod('en1') : 0);
      for (const r of S.relics) if (RELICS[r].turn) RELICS[r].turn(G, C.turn);
      drawCards(5 + mod('draw') + (C.turn === 1 ? mod('draw1') : 0));
    }

    function checkEnd() {
      if (S.hp <= 0) { endRun(false); return true; }
      if (S.combat && S.combat.enemies.every(e => e.dead)) { winCombat(); return true; }
      return false;
    }

    function playCard(hi, ti) {
      const C = S.combat;
      if (!C || busy) return false;
      const inst = C.hand[hi];
      if (!inst) return false;
      const d = cdef(inst);
      if (d.un) { toast('Esta carta não se pode jogar.'); return false; }
      if (d.cost > C.energy) { toast('Não tens energia suficiente.'); return false; }
      let t = null;
      if (d.tgt === 'e') {
        t = C.enemies[ti];
        if (!t || t.dead) { const a = alive(); if (a.length === 1) t = a[0]; else return false; }
      }
      C.energy -= d.cost;
      C.hand.splice(hi, 1);
      for (const op of d.fx) { OPS[op[0]].run(G, op, t); if (S.hp <= 0) break; }
      if (d.type !== 'pwr') (d.ex ? C.exh : C.disc).push(inst);
      if (d.type === 'atk') { C.atkT++; if (has('metronomo') && C.atkT % 3 === 0) gainBlock(P, 4, true); }
      if (d.type === 'skl') {
        if (C.st.echo) gainBlock(P, C.st.echo, true);
        for (const e of alive()) if (e.st.enrage) addSt(e, 'str', e.st.enrage);
      }
      sel = null;
      checkEnd();
      return true;
    }

    function usePotion(i, ti) {
      const id = S.pots[i];
      if (!id) return false;
      const p = POTIONS[id];
      const C = S.combat;
      if (!C && !p.any) return false;
      if (C && busy) return false;
      let t = null;
      if (p.t) {
        t = C.enemies[ti];
        if (!t || t.dead) { const a = alive(); if (a.length === 1) t = a[0]; else return false; }
      }
      S.pots[i] = null;
      potSel = null;
      p.use(G, t);
      if (C) checkEnd();
      return true;
    }

    // Fim do turno do jogador: efeitos de fim de turno, depois os inimigos agem
    function endTurnPlayer() {
      const C = S.combat;
      if (C.st.plating) gainBlock(P, C.st.plating, true);
      if (C.st.regen) heal(C.st.regen);
      for (const r of S.relics) if (RELICS[r].end) RELICS[r].end(G);
      for (const c of C.hand) if (c.id === 'x_fardo') loseHp(P, 1);
      C.disc.push(...C.hand); C.hand = [];
      for (const k of ['weak', 'vuln']) if (C.st[k] && --C.st[k] <= 0) delete C.st[k];
      sel = null; potSel = null;
      return !checkEnd();
    }
    function enemyTurn() {
      const C = S.combat;
      for (const e of C.enemies.slice()) {
        if (e.dead) continue;
        e.block = 0;
        if (e.st.poison) {
          loseHp(e, e.st.poison);
          if (!e.dead && --e.st.poison <= 0) delete e.st.poison;
          if (e.dead) { if (checkEnd()) return; continue; }
        }
        if (e.st.ritual) addSt(e, 'str', e.st.ritual);
        doMove(e);
        if (S.hp <= 0) { endRun(false); return; }
        if (!e.dead && e.st.plating) e.block += e.st.plating;
        if (checkEnd()) return;
      }
      for (const e of C.enemies) {
        if (e.dead) continue;
        for (const k of ['weak', 'vuln']) if (e.st[k] && --e.st[k] <= 0) delete e.st[k];
        chooseIntent(e);
      }
      if (checkEnd()) return;
      startTurn();
    }
    function doMove(e) {
      const C = S.combat;
      const mv = ENEMIES[e.id].moves[e.next];
      for (const op of mv.fx) {
        if (e.dead || S.hp <= 0) return;
        const [k, a, b] = op;
        if (k === 'atk') { for (let i = 0; i < (b || 1); i++) { if (e.dead || S.hp <= 0) break; hit(e, P, a); } }
        else if (k === 'block') gainBlock(e, a);
        else if (k === 'blockAll') { for (const x of alive()) gainBlock(x, a); }
        else if (k === 'buff') addSt(e, a, b);
        else if (k === 'debuff') addSt(P, a, b);
        else if (k === 'heal') { e.hp = Math.min(e.maxHp, e.hp + a); float(e, '+' + a, '#26de81'); }
        else if (k === 'add') { for (let i = 0; i < b; i++) C.disc.push(newInst(a)); float(P, `+${b} ${CARDS[a].name}`, '#9aa0c8', true); }
        else if (k === 'summon') {
          const n = C.enemies.filter(x => !x.dead && x.id === a).length;
          for (let i = n; i < b; i++) {
            const m = makeEnemy(a); chooseIntent(m);
            const slot = C.enemies.findIndex(x => x.dead);
            if (slot >= 0 && C.enemies.length >= 4) C.enemies[slot] = m; else if (C.enemies.length < 4) C.enemies.push(m);
          }
        }
      }
    }

    function intentInfo(e) {
      const mv = ENEMIES[e.id].moves[e.next];
      const o = { atk: null, def: false, buff: false, deb: false, n: mv.n };
      for (const op of mv.fx) {
        if (op[0] === 'atk') o.atk = { d: calcDmg(e, P, op[1]), x: op[2] || 1 };
        else if (op[0] === 'block' || op[0] === 'blockAll') o.def = true;
        else if (op[0] === 'buff' || op[0] === 'summon' || op[0] === 'heal') o.buff = true;
        else o.deb = true;
      }
      return o;
    }

    // ------------------------------------------------------------------
    // 3.3 Partida: mapa, salas, recompensas
    // ------------------------------------------------------------------
    function startRun(ch) {
      const c = CHARS[ch];
      S = {
        v: 1, char: ch, hp: c.hp, maxHp: c.hp, gold: 99, deck: [], relics: [c.relic], pots: [null, null, null],
        floor: 1, map: null, screen: 'map', combat: null, reward: null, shop: null, event: null, pick: null, treasure: null, bossRelics: null,
        uid: 0, kills: 0, rooms: 0, removeCost: 75, seenEv: [], over: null, t0: Date.now(),
      };
      S.deck = c.deck.map(id => newInst(id));
      S.map = genMap();
      if (!FAST) { const st = loadStats(); st.runs++; Arcade.store.set(STATS_KEY, st); }
      commitFloor();
    }

    function genMap() {
      const ROWS = 12, COLS = 5, nodes = {}, edges = new Set();
      const key = (r, c) => r + '-' + c;
      const starts = shuffle([0, 1, 2, 3, 4]);
      for (let p = 0; p < 4; p++) {
        let c = p < 3 ? starts[p] : ri(0, COLS - 1);
        for (let r = 0; r < ROWS; r++) {
          const k = key(r, c);
          if (!nodes[k]) nodes[k] = { r, c, t: '', next: [], jx: Math.round(R() * 14 - 7), jy: Math.round(R() * 10 - 5) };
          if (r === ROWS - 1) break;
          const opts = shuffle([c - 1, c, c + 1].filter(x => x >= 0 && x < COLS));
          let nc = opts.find(x => x === c || !edges.has(key(r, x) + '>' + key(r + 1, c)));
          if (nc == null) nc = c;
          edges.add(k + '>' + key(r + 1, nc));
          if (!nodes[k].next.includes(key(r + 1, nc))) nodes[k].next.push(key(r + 1, nc));
          c = nc;
        }
      }
      const parents = {};
      for (const [k, n] of Object.entries(nodes)) for (const x of n.next) (parents[x] = parents[x] || []).push(k);
      const ids = Object.keys(nodes).sort((a, b) => nodes[a].r - nodes[b].r);
      for (const k of ids) {
        const n = nodes[k];
        if (n.r === 0) { n.t = 'm'; continue; }
        if (n.r === 5) { n.t = 't'; continue; }
        if (n.r === ROWS - 1) { n.t = 'r'; continue; }
        const par = (parents[k] || []).map(p => nodes[p].t);
        const w = [['m', 48], ['?', 22]];
        if (n.r >= 2) w.push(['$', 8]);
        if (n.r >= 4) w.push(['e', 11]);
        if (n.r >= 3 && n.r !== ROWS - 2) w.push(['r', 11]);
        const ok = w.filter(([t]) => !(['e', 'r', '$'].includes(t) && par.includes(t)));
        let x = R() * ok.reduce((s, q) => s + q[1], 0);
        n.t = ok[0][0];
        for (const q of ok) { x -= q[1]; if (x <= 0) { n.t = q[0]; break; } }
      }
      for (const k of ids) if (nodes[k].r === ROWS - 1) nodes[k].next = ['boss'];
      nodes.boss = { r: ROWS, c: 2, t: 'b', next: [], jx: 0, jy: 0 };
      return { nodes, pos: null, path: [], rooms: 0, fights: 0 };
    }

    function availNodes() {
      const M = S.map;
      if (!M.pos) return Object.keys(M.nodes).filter(k => M.nodes[k].r === 0);
      return M.nodes[M.pos].next;
    }

    function chooseNode(k) {
      if (S.screen !== 'map' || !availNodes().includes(k)) return false;
      const M = S.map, n = M.nodes[k];
      M.pos = k; M.path.push(k); M.rooms++; S.rooms++;
      commitFloor();
      const E = ENC[S.floor];
      if (n.t === 'm') {
        const pool = M.fights < 3 ? E.easy : E.hard;
        M.fights++;
        startCombat(pick(pool), 'm');
      } else if (n.t === 'e') startCombat(pick(E.elite), 'e');
      else if (n.t === 'b') startCombat(E.boss, 'b');
      else if (n.t === '$') openShop();
      else if (n.t === 'r') S.screen = 'rest';
      else if (n.t === 't') { S.treasure = { relic: randRelic(), open: false }; S.screen = 'treasure'; }
      else if (n.t === '?') {
        let pool = EVENTS.filter(e => !S.seenEv.includes(e.id));
        if (!pool.length) { S.seenEv = []; pool = EVENTS; }
        const ev = pick(pool);
        S.seenEv.push(ev.id);
        S.event = { id: ev.id, done: false, msg: '' };
        S.screen = 'event';
      }
      return true;
    }
    const toMap = () => { S.screen = 'map'; S.reward = null; S.shop = null; S.event = null; S.treasure = null; S.pick = null; };

    function classPool(rar) {
      const cls = CHARS[S.char].cls;
      return Object.values(CARDS).filter(c => c.cls === cls && c.rar === rar).map(c => c.id);
    }
    function rollRar(kind) {
      const rm = 1 + mod('rare');
      const rare = (kind === 'e' ? 0.12 : 0.05) * rm, unc = kind === 'e' ? 0.4 : 0.33;
      const r = R();
      return r < rare ? 'rare' : r < rare + unc ? 'uncommon' : 'common';
    }
    function rollCards(kind, n) {
      const out = [];
      const upCh = S.floor === 1 ? 0 : S.floor === 2 ? 0.12 : 0.25;
      let guard = 0;
      while (out.length < n && guard++ < 100) {
        const rar = kind === 'b' ? 'rare' : rollRar(kind);
        const id = pick(classPool(rar));
        if (out.some(o => o.id === id)) continue;
        out.push({ id, up: CARDS[id].up && R() < upCh ? 1 : 0 });
      }
      return out;
    }
    function randRelic(rarities) {
      const owned = new Set(S.relics);
      if (S.treasure) owned.add(S.treasure.relic);
      if (S.shop) for (const r of S.shop.relics) owned.add(r.id);
      const r = R();
      const want = rarities || [r < 0.5 ? 'common' : r < 0.85 ? 'uncommon' : 'rare'];
      let pool = Object.keys(RELICS).filter(k => want.includes(RELICS[k].rar) && !owned.has(k));
      if (!pool.length) pool = Object.keys(RELICS).filter(k => ['common', 'uncommon', 'rare'].includes(RELICS[k].rar) && !owned.has(k));
      return pool.length ? pick(pool) : null;
    }
    const randPotion = () => pick(Object.keys(POTIONS));
    function addRelic(id) {
      if (!id || S.relics.includes(id)) return;
      S.relics.push(id);
      if (RELICS[id].pick) RELICS[id].pick(G);
    }
    function addPotion(id) {
      const i = S.pots.indexOf(null);
      if (i < 0) return false;
      S.pots[i] = id; return true;
    }

    function winCombat() {
      const C = S.combat;
      for (const r of S.relics) if (RELICS[r].win) RELICS[r].win(G);
      const base = C.kind === 'b' ? ri(80, 100) : C.kind === 'e' ? ri(30, 40) : ri(14, 22);
      const gold = Math.round(base * (1 + mod('gold')));
      S.gold += gold;
      sel = null; potSel = null;
      if (C.kind === 'b' && S.floor === 3) { S.combat = null; endRun(true); return; }
      S.reward = {
        gold, name: C.name, kind: C.kind,
        cards: rollCards(C.kind, 3),
        potion: R() < (C.kind === 'm' ? 0.4 : 0.65) ? randPotion() : null,
        relic: C.kind === 'e' || C.relic ? randRelic() : null,
        cardDone: false,
      };
      S.combat = null;
      S.screen = 'reward';
    }
    function takeRewardCard(i) {
      const R2 = S.reward;
      if (!R2 || R2.cardDone || !R2.cards[i]) return;
      S.deck.push(newInst(R2.cards[i].id, R2.cards[i].up));
      R2.cardDone = true;
    }
    function leaveReward() {
      const kind = S.reward && S.reward.kind;
      S.reward = null;
      if (kind === 'b') {
        const pool = shuffle(Object.keys(RELICS).filter(k => RELICS[k].rar === 'boss' && !S.relics.includes(k)));
        S.bossRelics = pool.slice(0, 3);
        S.screen = 'boss';
      } else toMap();
    }
    function takeBossRelic(i) {
      if (S.bossRelics && S.bossRelics[i]) addRelic(S.bossRelics[i]);
      S.bossRelics = null;
      nextFloor();
    }
    function nextFloor() {
      S.floor++;
      S.map = genMap();
      S.hp = Math.min(S.maxHp, S.hp + Math.round((S.maxHp - S.hp) * 0.75));
      toMap();
      commitFloor();
    }

    function endRun(win) {
      S.combat = null;
      S.over = { win, floor: S.floor, rooms: S.rooms, kills: S.kills, char: S.char, killer: win ? '' : (S.lastFight || '') };
      S.screen = 'over';
      if (!FAST) {
        const st = loadStats();
        if (win) { st.wins[S.char] = (st.wins[S.char] || 0) + 1; st.maxFloor = Math.max(st.maxFloor, 3); st.best = Math.max(st.best, 40); }
        Arcade.store.set(STATS_KEY, st);
        Arcade.store.set(SAVE_KEY, null);
      }
    }

    // Loja
    function priceMul() { return 1 + mod('shop'); }
    function openShop() {
      const cards = [...rollShopCards()];
      const mul = priceMul();
      const prc = r => Math.round((r === 'rare' ? ri(140, 160) : r === 'uncommon' ? ri(68, 80) : ri(45, 55)) * mul);
      const rel = [];
      for (let i = 0; i < 2; i++) { const id = randRelic(); if (id && !rel.some(x => x.id === id)) rel.push({ id, price: Math.round((RELICS[id].rar === 'rare' ? ri(230, 260) : RELICS[id].rar === 'uncommon' ? ri(180, 200) : ri(140, 160)) * mul), sold: false }); S.shop = { relics: rel }; }
      S.shop = {
        cards: cards.map(c => ({ ...c, price: prc(CARDS[c.id].rar), sold: false })),
        relics: rel,
        pots: [0, 1, 2].map(() => ({ id: randPotion(), price: Math.round(ri(48, 65) * mul), sold: false })),
        removed: false,
      };
      S.screen = 'shop';
    }
    function rollShopCards() {
      const out = [], want = ['common', 'common', 'uncommon', 'uncommon', 'rare'];
      for (const rar of want) {
        const pool = classPool(rar).filter(id => !out.some(o => o.id === id));
        out.push({ id: pick(pool), up: 0 });
      }
      return out;
    }
    const removePrice = () => Math.round(S.removeCost * priceMul());
    function buy(kind, i) {
      const sh = S.shop;
      const it = kind === 'c' ? sh.cards[i] : kind === 'r' ? sh.relics[i] : sh.pots[i];
      if (!it || it.sold || S.gold < it.price) return false;
      if (kind === 'p' && S.pots.indexOf(null) < 0) { toast('Não tens espaço para poções.'); return false; }
      S.gold -= it.price; it.sold = true;
      if (kind === 'c') S.deck.push(newInst(it.id, it.up));
      else if (kind === 'r') addRelic(it.id);
      else addPotion(it.id);
      return true;
    }

    // Seleção de carta do baralho (remover / melhorar)
    function startPick(mode, src) { S.pick = { mode, src }; S.screen = 'pick'; }
    function pickCard(u) {
      const pk = S.pick;
      const i = S.deck.findIndex(c => c.u === u);
      if (!pk || i < 0) return;
      if (pk.mode === 'remove') {
        S.deck.splice(i, 1);
        if (pk.src === 'shop') { S.gold -= removePrice(); S.removeCost += 25; S.shop.removed = true; }
      } else S.deck[i].up = 1;
      finishPick();
    }
    function finishPick() {
      const src = S.pick.src;
      S.pick = null;
      if (src === 'shop') S.screen = 'shop';
      else if (src === 'event') S.screen = 'event';
      else toMap();
    }

    function restHeal() {
      if (mod('noRest')) return;
      heal(Math.round(S.maxHp * (0.3 + mod('rest'))));
      toMap();
    }

    // Eventos
    function eventChoose(i) {
      const ev = EVENTS.find(e => e.id === S.event.id);
      const ch = ev.ch[i];
      if (!ch || S.event.done || (ch.req && !ch.req(S))) return;
      S.event.done = true;
      S.event.msg = ch.m;
      let pickMode = null, fight = null;
      const run = ops => {
        for (const op of ops) {
          const [k, a] = op;
          if (k === 'gold') S.gold = Math.max(0, S.gold + a);
          else if (k === 'hp') { if (a > 0) heal(a); else S.hp = Math.max(1, S.hp + a); }
          else if (k === 'healPct') heal(Math.round(S.maxHp * a));
          else if (k === 'maxhp') { S.maxHp += a; S.hp += a; }
          else if (k === 'card') {
            const id = CARDS[a] ? a : pick(classPool(a === 'rand' ? 'common' : a));
            S.deck.push(newInst(id));
            S.event.msg += ` Ganhaste: ${CARDS[id].name}.`;
          }
          else if (k === 'relic') { const id = randRelic(); if (id) { addRelic(id); S.event.msg += ` Ganhaste: ${RELICS[id].n}.`; } }
          else if (k === 'potion') { const id = randPotion(); if (addPotion(id)) S.event.msg += ` Ganhaste: ${POTIONS[id].n}.`; else S.event.msg += ' Mas não tens espaço para mais poções.'; }
          else if (k === 'upRand') upRand(a);
          else if (k === 'pick') pickMode = a;
          else if (k === 'fight') fight = a;
          else if (k === 'gamble') { const ok = R() < a; run(ok ? op[2] : op[3]); S.event.msg = ok ? op[4] : op[5]; }
        }
      };
      run(ch.ops);
      if (fight) { S.event = null; startCombat(fight, 'm', { relic: true }); return; }
      if (pickMode) {
        const can = pickMode === 'remove' ? S.deck.length > 1 : S.deck.some(canUp);
        if (can) startPick(pickMode, 'event');
      }
    }

    // ------------------------------------------------------------------
    // 3.4 Interface
    // ------------------------------------------------------------------
    function cardMods() {
      const C = S && S.combat;
      if (!C) return { d: n => n, b: n => n, live: false };
      const wrapN = (v, base) => v > base ? `<b class="hi">${v}</b>` : v < base ? `<b class="lo">${v}</b>` : `${v}`;
      return {
        live: true, blk: C.block,
        d: n => wrapN(Math.max(0, Math.floor((n + (C.st.str || 0)) * (C.st.weak ? 0.75 : 1))), n),
        b: n => wrapN(Math.max(0, n + (C.st.dex || 0)), n),
      };
    }
    const BASEM = { d: n => n, b: n => n, live: false };
    function cardText(d, m) {
      let t = d.fx.map(op => OPS[op[0]].txt(op, m)).join(' ');
      if (d.txt) t += (t ? ' ' : '') + d.txt;
      if (d.un) t += ' <i>Injogável.</i>';
      if (d.ex) t += ' <i>Esgota.</i>';
      return t;
    }
    function cardHTML(inst, o) {
      o = o || {};
      const d = cdef(inst);
      const m = o.mods || BASEM;
      return `<div class="cd t-${d.type} r-${d.rar}${inst.up ? ' up' : ''}${o.cls ? ' ' + o.cls : ''}" data-card="${inst.id}:${inst.up ? 1 : 0}"${o.attrs || ''} style="${o.style || ''}">` +
        `<div class="cdi"><div class="nm">${esc(d.name)}</div><div class="bd">${TYPE_N[d.type]}</div><div class="tx">${cardText(d, m)}</div></div>` +
        (d.un ? '' : `<div class="co${o.cant ? ' no' : ''}">${d.cost}</div>`) +
        (o.price != null ? `<div class="pr${o.price > S.gold ? ' no' : ''}">● ${o.price}</div>` : '') + `</div>`;
    }
    function stsHTML(st) {
      return Object.entries(st).map(([k, v]) => `<span style="--sc:${STATUS[k].col}">${STATUS[k].ic}${k === 'keepBlock' ? '' : v}</span>`).join('');
    }

    function topHTML() {
      const fl = S.floor + '';
      const rel = S.relics.map(r => `<button class="mc-chip" data-a="relic" data-k="${r}" style="color:${RELICS[r].col}">${RELICS[r].ic}</button>`).join('');
      const pots = S.pots.map((p, i) => p ? `<button class="mc-pot full${potSel === i ? ' sel' : ''}" data-a="pot" data-i="${i}" style="--pc:${POTIONS[p].col}"><i></i></button>` : `<button class="mc-pot" data-a="pot" data-i="${i}"></button>`).join('');
      return `<div class="mc-top"><div class="r1"><span class="hp">♥ ${S.hp}/${S.maxHp}</span><span class="gd">● ${S.gold}</span><span class="fl">Andar ${fl} · sala ${S.map ? S.map.rooms : 0}/13</span></div>` +
        `<div class="r2"><button class="mc-chip deck" data-a="deck">▤ ${S.deck.length}</button>${pots}<div class="mc-rel">${rel}</div></div></div>`;
    }

    function render() {
      if (!S) return renderChar();
      paintBg();
      let body = '';
      switch (S.screen) {
        case 'map': body = mapHTML(); break;
        case 'combat': body = combatHTML(); break;
        case 'reward': body = rewardHTML(); break;
        case 'boss': body = bossHTML(); break;
        case 'shop': body = shopHTML(); break;
        case 'rest': body = restHTML(); break;
        case 'event': body = eventHTML(); break;
        case 'treasure': body = treasureHTML(); break;
        case 'pick': body = pickHTML(); break;
        case 'over': body = ''; break;
      }
      wrap.innerHTML = topHTML() + `<div class="mc-body">${body}</div>`;
      if (S.screen === 'map') {
        const m = wrap.querySelector('.mc-map'), cur = wrap.querySelector('.mc-node.av');
        if (m && cur) m.scrollTop = cur.offsetTop - m.clientHeight * 0.55;
      }
      if (S.screen === 'combat') layoutHand();
      showFloats();
      if (S.screen === 'over') showOver();
    }

    function renderChar() {
      const st = loadStats();
      wrap.innerHTML = `<div class="mc-scroll" style="padding-top:calc(env(safe-area-inset-top) + 24px)"><h3 style="font-size:24px">Masmorra de Cartas</h3>` +
        `<p class="sub">Sobe os 3 andares da torre. Escolhe quem vai entrar.</p>` +
        Object.entries(CHARS).map(([k, c]) => `<button class="mc-char" data-a="char" data-k="${k}" style="--cc:${c.col}"><b>${c.n}</b><p>${c.d}</p>` +
          `<small>${c.hp} PV · relíquia: ${RELICS[c.relic].n} · vitórias: ${st.wins[k] || 0}</small></button>`).join('') +
        `<p class="sub" style="text-align:center">Andar máximo: ${st.maxFloor || '—'} · partidas: ${st.runs}</p></div>`;
    }

    // ---- Mapa ----
    function mapHTML() {
      const M = S.map, W = view.w, rowH = 64, H = 13 * rowH + 70;
      const colX = c => 40 + c * (W - 80) / 4;
      const pos = n => n.t === 'b' ? { x: W / 2, y: 50 } : { x: colX(n.c) + n.jx, y: H - 40 - n.r * rowH + n.jy };
      const av = new Set(availNodes());
      const done = new Set(M.path);
      let lines = '';
      for (const [k, n] of Object.entries(M.nodes)) {
        const a = pos(n);
        for (const x of n.next) {
          const b = pos(M.nodes[x]);
          const onPath = M.path.some((p, i) => p === k && M.path[i + 1] === x);
          const live = k === M.pos && av.has(x);
          lines += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${onPath ? '#ffcc4d' : live ? '#eef0ff' : '#34386a'}" stroke-width="${onPath || live ? 3 : 2}" stroke-dasharray="${onPath ? '' : '5 6'}"/>`;
        }
      }
      let nodes = '';
      for (const [k, n] of Object.entries(M.nodes)) {
        const p = pos(n), rm = ROOM[n.t], big = n.t === 'b', s = big ? 34 : 22;
        const cls = done.has(k) ? (k === M.pos ? 'done cur' : 'done') : av.has(k) ? 'av' : (n.r < (M.pos ? M.nodes[M.pos].r : 0) ? 'off' : '');
        nodes += `<button class="mc-node${big ? ' big' : ''} ${cls}" data-a="node" data-k="${k}" style="left:${p.x - s}px;top:${p.y - s}px;--nc:${rm.col}" aria-label="${rm.n}">${rm.ic}</button>`;
      }
      const leg = Object.values(ROOM).map(r => `<span><b style="color:${r.col}">${r.ic}</b>${r.n}</span>`).join('');
      return `<div class="mc-mhead">Andar ${S.floor}<small>Escolhe o próximo passo</small></div>` +
        `<div class="mc-map"><div style="position:relative;height:${H}px"><svg width="${W}" height="${H}">${lines}</svg>${nodes}</div></div>` +
        `<div class="mc-legend">${leg}</div>`;
    }

    // ---- Combate ----
    function combatHTML() {
      const C = S.combat;
      const n = C.enemies.length;
      const avail = view.w - 12;
      const m = cardMods();
      const sd = sel != null ? cdef(C.hand[sel]) : null;
      const targeting = (sd && sd.tgt === 'e') || (potSel != null && POTIONS[S.pots[potSel]].t);
      let tot = 0;
      for (const e of C.enemies) tot += 96 * ENEMIES[e.id].sz + 10;
      const k = Math.max(0.45, Math.min(1.2, avail / tot, (view.h - 470) / 200));
      const ens = C.enemies.map((e, i) => {
        const d = ENEMIES[e.id];
        const sz = Math.round(96 * d.sz * k);
        const hgt = d.sh === 'tall' || d.sh === 'ghost' ? sz * 1.2 : d.sh === 'wide' ? sz * 0.7 : sz;
        const ii = intentInfo(e);
        let it = '';
        if (ii.atk) it += `<span class="ia">⚔${ii.atk.d}${ii.atk.x > 1 ? '×' + ii.atk.x : ''}</span>`;
        if (ii.def) it += `<span class="id">⬢</span>`;
        if (ii.buff) it += `<span class="ib">▲</span>`;
        if (ii.deb) it += `<span class="ie">✦</span>`;
        const pz = e.st.poison >= e.hp ? ' pz' : '';
        return `<button class="en${e.dead ? ' dead' : ''}${targeting && !e.dead ? ' tg' : ''}${hitSet.has(e.uid) ? ' hit' : ''}" data-a="en" data-i="${i}" data-uid="${e.uid}" style="width:${Math.max(sz + 10, 84 * Math.min(1, k + 0.15))}px">` +
          `<div class="it">${e.dead ? '' : it}</div>` +
          `<div class="eb sh-${d.sh}" style="--ec:${d.col};width:${sz}px;height:${Math.round(hgt)}px"><i class="ey l"></i><i class="ey r"></i></div>` +
          `<div class="nmE"${d.boss ? ' style="color:#ffcc4d"' : d.elite ? ' style="color:#fa8231"' : ''}>${d.boss ? '♚ ' : d.elite ? '☠ ' : ''}${d.n}</div>` +
          `<div class="hpb${pz}${e.block ? ' blk' : ''}" style="position:relative"><i style="width:${100 * e.hp / e.maxHp}%"></i><b>${e.hp}/${e.maxHp}</b></div>` +
          (e.block ? `<div class="bl" style="position:absolute;left:0;bottom:44px">${e.block}</div>` : '') +
          `<div class="sts">${stsHTML(e.st)}</div></button>`;
      }).join('');
      hitSet = new Set();
      const ch = CHARS[S.char];
      const hint = sel != null ? (sd.tgt === 'e' && alive().length > 1 ? 'Toca num inimigo (ou arrasta a carta até ele)' : 'Toca outra vez na carta ou no campo para a jogar') :
        potSel != null ? 'Toca no inimigo alvo da poção' : busy ? '' : 'Toca numa carta · toque longo: detalhes';
      return `<div class="mc-field" data-a="field">${ens}<div class="mc-hint">${hint}</div></div>` +
        `<div class="mc-me" style="--pcol:${ch.col}" data-a="me"><span class="who">${ch.n}</span>` +
        `<div class="hpb${C.block ? ' blk' : ''}"><i style="width:${100 * S.hp / S.maxHp}%"></i><b>${S.hp}/${S.maxHp}</b></div>` +
        (C.block ? `<span class="blkB" data-uid="p">${C.block}</span>` : `<span data-uid="p" style="width:1px"></span>`) +
        `<div class="sts">${stsHTML(C.st)}</div></div>` +
        `<div class="mc-ctrl"><div class="mc-en${C.energy ? '' : ' zero'}">${C.energy}</div>` +
        `<button class="mc-pile" data-a="pile" data-k="draw"><b>${C.draw.length}</b>Compra</button>` +
        `<button class="mc-pile" data-a="pile" data-k="disc"><b>${C.disc.length}</b>Descarte</button>` +
        `<button class="mc-endb" data-a="end"${busy ? ' disabled' : ''}>${busy ? 'Inimigos…' : 'Terminar turno'}</button></div>` +
        `<div class="mc-hand">${C.hand.map((c, i) => cardHTML(c, { mods: m, attrs: ` data-h="${i}"`, cls: (i === sel ? 'sel' : '') + (cdef(c).cost > C.energy || cdef(c).un ? ' cant' : ''), cant: cdef(c).cost > C.energy })).join('')}</div>`;
    }
    function handCw() { return Math.round(Math.min(96, Math.max(74, (view.w - 16) / 4.3))); }
    function layoutHand() {
      const hand = wrap.querySelector('.mc-hand');
      if (!hand) return;
      const cw = handCw();
      hand.style.setProperty('--hcw', cw + 'px');
      const els = [...hand.querySelectorAll('.cd')];
      const n = els.length, W = view.w;
      const step = n > 1 ? Math.min(cw + 6, (W - 12 - cw) / (n - 1)) : 0;
      const x0 = (W - (step * (n - 1) + cw)) / 2;
      els.forEach((el, i) => {
        el.style.setProperty('--cw', cw + 'px');
        el.style.left = Math.round(x0 + i * step) + 'px';
        el.style.zIndex = i === sel ? 50 : i + 1;
        if (i < n - 1 && i !== sel && step < cw && step > cw * 0.6) el.style.setProperty('--pr', Math.round(cw - step) + 'px');
      });
    }

    // ---- Recompensa ----
    function rewardHTML() {
      const Rw = S.reward;
      const cw = Math.min(110, Math.floor((view.w - 48) / 3));
      let h = `<div class="mc-scroll"><h3>Vitória!</h3><p class="sub">Derrotaste: ${Rw.name}. Ganhaste <b style="color:#ffcc4d">${Rw.gold} de ouro</b>.</p>`;
      if (Rw.relic) h += `<button class="mc-item" data-a="rwRelic"><span class="mc-relbig" style="color:${RELICS[Rw.relic].col}">${RELICS[Rw.relic].ic}</span><div><b>${RELICS[Rw.relic].n}</b>${RELICS[Rw.relic].d}</div></button>`;
      if (Rw.potion) h += `<button class="mc-item" data-a="rwPot"><span class="mc-pot full" style="--pc:${POTIONS[Rw.potion].col}"><i></i></span><div><b>${POTIONS[Rw.potion].n}</b>${POTIONS[Rw.potion].d}</div></button>`;
      if (!Rw.cardDone) {
        h += `<p class="sub" style="margin-top:6px">Escolhe uma carta para o baralho:</p><div class="mc-grid" style="--cw:${cw}px">` +
          Rw.cards.map((c, i) => cardHTML(c, { attrs: ` data-a="rwCard" data-i="${i}"` })).join('') + `</div>` +
          `<button class="btn center" data-a="rwSkip" style="margin-top:14px">Saltar a carta</button>`;
      } else h += `<p class="sub">Carta adicionada ao baralho.</p>`;
      h += `<button class="btn primary" data-a="rwLeave" style="margin-top:8px">Continuar</button></div>`;
      return h;
    }
    function bossHTML() {
      return `<div class="mc-scroll"><h3>Guardião derrotado!</h3><p class="sub">Escolhe uma relíquia de guardião. Depois sobes ao andar ${S.floor + 1} e recuperas grande parte dos PV.</p>` +
        S.bossRelics.map((r, i) => `<button class="mc-item" data-a="bossRelic" data-i="${i}"><span class="mc-relbig" style="color:${RELICS[r].col}">${RELICS[r].ic}</span><div><b>${RELICS[r].n}</b>${RELICS[r].d}</div></button>`).join('') +
        (S.bossRelics.length ? '' : `<button class="btn primary" data-a="bossRelic" data-i="0">Subir</button>`) + `</div>`;
    }

    // ---- Loja ----
    function shopHTML() {
      const sh = S.shop, cw = Math.min(110, Math.floor((view.w - 48) / 3));
      let h = `<div class="mc-scroll"><h3>Loja do Andar</h3><p class="sub">Um mercador anão sorri por trás do balcão. Tens <b style="color:#ffcc4d">${S.gold} de ouro</b>.</p>`;
      h += `<div class="mc-grid" style="--cw:${cw}px">` + sh.cards.map((c, i) => cardHTML(c, { price: c.price, cls: c.sold ? 'sold' : '', attrs: c.sold ? '' : ` data-a="shopCard" data-i="${i}"` })).join('') + `</div><div style="height:14px"></div>`;
      h += sh.relics.map((r, i) => `<button class="mc-item${r.sold ? ' sold' : ''}" data-a="${r.sold ? '' : 'shopRelic'}" data-i="${i}"><span class="mc-relbig" style="color:${RELICS[r.id].col}">${RELICS[r.id].ic}</span><div><b>${RELICS[r.id].n}</b>${RELICS[r.id].d}</div><span class="pr${r.price > S.gold ? ' no' : ''}">● ${r.price}</span></button>`).join('');
      h += sh.pots.map((p, i) => `<button class="mc-item${p.sold ? ' sold' : ''}" data-a="${p.sold ? '' : 'shopPot'}" data-i="${i}"><span class="mc-pot full" style="--pc:${POTIONS[p.id].col}"><i></i></span><div><b>${POTIONS[p.id].n}</b>${POTIONS[p.id].d}</div><span class="pr${p.price > S.gold ? ' no' : ''}">● ${p.price}</span></button>`).join('');
      const rp = removePrice();
      h += `<button class="mc-item${sh.removed ? ' sold' : ''}" data-a="${sh.removed ? '' : 'shopRemove'}"><span class="mc-relbig">✂</span><div><b>Remover uma carta</b>Tira uma carta do teu baralho.</div><span class="pr${rp > S.gold ? ' no' : ''}">● ${rp}</span></button>`;
      h += `<button class="btn primary" data-a="leave" style="margin-top:6px">Sair da loja</button></div>`;
      return h;
    }

    // ---- Descanso, evento, tesouro, seleção ----
    function restHTML() {
      const amt = Math.round(S.maxHp * (0.3 + mod('rest')));
      const no = mod('noRest');
      return `<div class="mc-scroll"><h3>Fogueira</h3><p class="sub">Uma pequena fogueira crepita num canto seguro. Podes descansar ou afiar o teu baralho.</p>` +
        `<button class="mc-item" data-a="restHeal"${no ? ' disabled style="opacity:.4"' : ''}><span class="mc-relbig" style="color:#26de81">♥</span><div><b>Descansar</b>${no ? 'O Núcleo Ardente impede-te de descansar.' : `Cura ${amt} PV (${S.hp}/${S.maxHp}).`}</div></button>` +
        `<button class="mc-item" data-a="restUp"${S.deck.some(canUp) ? '' : ' disabled style="opacity:.4"'}><span class="mc-relbig" style="color:#ffcc4d">⚒</span><div><b>Forjar</b>Melhora uma carta à tua escolha.</div></button>` +
        `<button class="btn center" data-a="leave">Seguir sem fazer nada</button></div>`;
    }
    function eventHTML() {
      const ev = EVENTS.find(e => e.id === S.event.id);
      let h = `<div class="mc-scroll"><h3>${ev.n}</h3><p class="sub" style="font-size:15px;color:#c8cce8">${ev.t}</p>`;
      if (!S.event.done) {
        h += ev.ch.map((c, i) => { const ok = !c.req || c.req(S); return `<button class="btn" data-a="evCh" data-i="${i}"${ok ? '' : ' disabled style="opacity:.4"'}><b>${c.t}</b><small>${c.d}</small></button>`; }).join('');
      } else {
        h += `<p class="sub" style="font-size:15px;color:#eef0ff">${esc(S.event.msg)}</p><button class="btn primary" data-a="leave">Continuar</button>`;
      }
      return h + `</div>`;
    }
    function treasureHTML() {
      const T = S.treasure;
      let h = `<div class="mc-scroll" style="text-align:center"><h3>Tesouro</h3><div class="mc-chest${T.open ? ' open' : ''}"></div>`;
      if (!T.open) h += `<button class="btn primary" data-a="chest">Abrir o baú</button><button class="btn center" data-a="leave">Deixar fechado</button>`;
      else {
        const r = T.relic ? RELICS[T.relic] : null;
        h += r ? `<div class="mc-item"><span class="mc-relbig" style="color:${r.col}">${r.ic}</span><div><b>${r.n}</b>${r.d}</div></div>` : `<p class="sub">O baú tinha 40 de ouro.</p>`;
        h += `<button class="btn primary" data-a="leave">Continuar</button>`;
      }
      return h + `</div>`;
    }
    function pickHTML() {
      const pk = S.pick, cw = Math.min(110, Math.floor((view.w - 48) / 3));
      const list = S.deck.filter(c => pk.mode === 'remove' || canUp(c));
      return `<div class="mc-scroll"><h3>${pk.mode === 'remove' ? 'Remover uma carta' : 'Melhorar uma carta'}</h3><p class="sub">Toca numa carta para ${pk.mode === 'remove' ? 'a remover do baralho' : 'ver a versão melhorada'}.</p>` +
        `<div class="mc-grid" style="--cw:${cw}px">${sortDeck(list).map(c => cardHTML(c, { attrs: ` data-a="pickCard" data-u="${c.u}"` })).join('')}</div>` +
        `<button class="btn center" data-a="pickCancel" style="margin-top:14px">Cancelar</button></div>`;
    }
    const RORD = { rare: 0, uncommon: 1, common: 2, basic: 3, st: 4, cur: 5 };
    const sortDeck = l => l.slice().sort((a, b) => RORD[CARDS[a.id].rar] - RORD[CARDS[b.id].rar] || CARDS[a.id].name.localeCompare(CARDS[b.id].name) || b.up - a.up);

    // ---- Modais ----
    function openModal(html, full) {
      modal.innerHTML = `<div class="mc-box${full ? ' full' : ''}">${html}</div>`;
      modal.hidden = false;
    }
    function closeModal() { modal.hidden = true; modal.innerHTML = ''; }
    function keywordsFor(d) {
      const ks = new Set();
      for (const op of d.fx) { if (op[0] === 'st' || op[0] === 'mulSt') ks.add(op[2]); }
      let h = [...ks].map(k => `<div><b style="color:${STATUS[k].col}">${STATUS[k].n}</b>: ${STATUS[k].d('N').replace('N turno(s)', 'N turnos')}</div>`).join('');
      if (d.ex) h += `<div><b>Esgota</b>: depois de jogada, sai do baralho até ao fim do combate.</div>`;
      if (d.type === 'pwr') h += `<div><b>Poder</b>: fica ativo até ao fim do combate.</div>`;
      return h ? `<div class="mc-kw">${h}</div>` : '';
    }
    function showCardInfo(inst, action) {
      const d = cdef(inst);
      const cw = Math.min(190, view.w * 0.48);
      let h = `<div class="mc-row" style="--cw:${cw}px">${cardHTML(inst, { mods: S && S.combat ? cardMods() : BASEM })}</div>`;
      if (canUp(inst) && !action) h += `<p style="font-size:13px">Melhorada: ${cardText(cdef({ id: inst.id, up: 1 }), BASEM)}${cdef({ id: inst.id, up: 1 }).cost !== d.cost ? ` (custo ${cdef({ id: inst.id, up: 1 }).cost})` : ''}</p>`;
      h += `<p style="font-size:13px;color:#9aa0c8">${RAR_N[d.rar]} · ${TYPE_N[d.type]}</p>` + keywordsFor(d);
      if (action) h += action;
      h += `<button class="btn center" data-m="close">Fechar</button>`;
      openModal(h);
    }
    function showUpgradePreview(u) {
      const inst = S.deck.find(c => c.u === u);
      const cw = Math.min(150, (view.w - 60) / 2);
      openModal(`<h2>Melhorar?</h2><div class="mc-row" style="--cw:${cw}px">${cardHTML(inst)}<b style="font-size:24px">→</b>${cardHTML({ id: inst.id, up: 1 })}</div>` +
        `<button class="btn primary" data-m="doPick" data-u="${u}">Melhorar</button><button class="btn center" data-m="close">Cancelar</button>`);
    }
    function showEnemyInfo(i) {
      const e = S.combat.enemies[i], d = ENEMIES[e.id], ii = intentInfo(e);
      let txt = [];
      if (ii.atk) txt.push(`atacar com ${ii.atk.d} de dano${ii.atk.x > 1 ? ` ${ii.atk.x} vezes` : ''}`);
      if (ii.def) txt.push('defender-se');
      if (ii.buff) txt.push('fortalecer-se');
      if (ii.deb) txt.push('lançar um efeito negativo');
      const sts = Object.entries(e.st).map(([k, v]) => `<div><b style="color:${STATUS[k].col}">${STATUS[k].n} ${k === 'keepBlock' ? '' : v}</b>: ${STATUS[k].d(v)}</div>`).join('');
      openModal(`<h2>${d.n}</h2><p>${e.hp}/${e.maxHp} PV${e.block ? ` · ${e.block} de escudo` : ''}</p>` +
        `<p>Próxima ação: <b>${ii.n}</b> — vai ${txt.join(', ')}.</p>` + (sts ? `<div class="mc-kw">${sts}</div>` : '') +
        `<button class="btn center" data-m="close">Fechar</button>`);
    }
    function showMeInfo() {
      const C = S.combat;
      const sts = Object.entries(C.st).map(([k, v]) => `<div><b style="color:${STATUS[k].col}">${STATUS[k].n} ${k === 'keepBlock' ? '' : v}</b>: ${STATUS[k].d(v)}</div>`).join('');
      openModal(`<h2>${CHARS[S.char].n}</h2><p>${S.hp}/${S.maxHp} PV · ${C.block} de escudo · ${C.energy} ⚡</p>` +
        (sts ? `<div class="mc-kw">${sts}</div>` : '<p>Sem efeitos ativos.</p>') + `<button class="btn center" data-m="close">Fechar</button>`);
    }
    let deckTab = 'deck';
    function showDeck(tab) {
      deckTab = tab || deckTab;
      const C = S.combat;
      if (!C && deckTab !== 'deck') deckTab = 'deck';
      const lists = { deck: S.deck, draw: C ? C.draw : [], disc: C ? C.disc : [], exh: C ? C.exh : [] };
      const names = { deck: 'Baralho', draw: 'Compra', disc: 'Descarte', exh: 'Esgotadas' };
      const cw = Math.floor((Math.min(view.w, 420) - 52) / 3);
      const list = sortDeck(lists[deckTab]);
      const tabs = C ? `<div class="mc-tabs">${Object.keys(names).map(k => `<button data-m="tab" data-k="${k}" class="${k === deckTab ? 'on' : ''}">${names[k]} ${lists[k].length}</button>`).join('')}</div>` : '';
      openModal(`<h2>${names[deckTab]} (${list.length})</h2>${tabs}<div class="scr"><div class="mc-grid" style="--cw:${cw}px">${list.map(c => cardHTML(c)).join('') || '<p>Vazio.</p>'}</div>` +
        (deckTab === 'draw' ? '<p style="font-size:12px;margin-top:8px">A ordem da pilha de compra é secreta.</p>' : '') + `</div><button class="btn center" data-m="close">Fechar</button>`, true);
    }
    function showPotion(i) {
      const id = S.pots[i];
      if (!id) { toast('Espaço vazio para poções.'); return; }
      const p = POTIONS[id];
      const can = (S.combat && !busy) || p.any;
      openModal(`<h2>${p.n}</h2><p>${p.d}</p>` +
        (can ? `<button class="btn primary" data-m="usePot" data-i="${i}">Usar</button>` : `<p style="font-size:13px;color:#9aa0c8">Só pode ser usada em combate.</p>`) +
        `<button class="btn center" data-m="dropPot" data-i="${i}">Deitar fora</button><button class="btn center" data-m="close">Fechar</button>`);
    }
    function showRelic(k) {
      const r = RELICS[k];
      openModal(`<div class="mc-relbig" style="color:${r.col};width:70px;height:70px;font-size:36px">${r.ic}</div><h2>${r.n}</h2><p>${r.d}</p>` +
        `<p style="font-size:13px;color:#9aa0c8">${{ start: 'Relíquia inicial', common: 'Comum', uncommon: 'Incomum', rare: 'Rara', boss: 'Relíquia de guardião' }[r.rar]}</p><button class="btn center" data-m="close">Fechar</button>`);
    }

    function toast(t) {
      if (FAST) return;
      let el = root.querySelector('.mc-toast');
      if (!el) { el = mk('div', 'mc-toast'); root.appendChild(el); }
      el.textContent = t;
      clearTimeout(toastT); timers.delete(toastT);
      toastT = later(() => el.remove(), 1500);
    }
    function showFloats() {
      if (!floats.length) return;
      const byW = {};
      for (const f of floats) {
        const el = wrap.querySelector(f.w === P ? '.mc-me .hpb' : `[data-uid="${f.w}"] .eb`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const k = byW[f.w] = (byW[f.w] || 0) + 1;
        const fe = mk('div', 'flt' + (f.small ? ' sm' : ''));
        fe.textContent = f.txt; fe.style.color = f.col;
        fe.style.left = (r.left + r.width / 2 + ((k % 3) - 1) * 26) + 'px';
        fe.style.top = (r.top + r.height * 0.3 - (k - 1) * 14) + 'px';
        fe.style.animationDelay = ((k - 1) * 0.08) + 's';
        root.appendChild(fe);
        later(() => fe.remove(), 1200);
      }
      floats = [];
    }

    function showOver() {
      const O = S.over;
      const st = loadStats();
      overlay.innerHTML = `<h2>${O.win ? 'A torre caiu!' : 'Derrota'}</h2>` +
        `<p>${O.win ? `${CHARS[O.char].n} derrotou o Coração da Torre!` : `${CHARS[O.char].n} caiu no andar ${O.floor}${O.killer ? ` (${O.killer})` : ''}.`}</p>` +
        `<div class="stats"><div><b>${O.floor}</b><span>andar</span></div><div><b>${O.rooms}</b><span>salas</span></div><div><b>${O.kills}</b><span>inimigos</span></div></div>` +
        `<p>Vitórias: ${Object.values(st.wins).reduce((a, b) => a + b, 0)} · Andar máximo: ${st.maxFloor}</p>` +
        `<button class="btn primary" data-o="again">Jogar outra vez</button><button class="btn center" data-o="menu">Menu</button>`;
      overlay.hidden = false;
    }

    // ------------------------------------------------------------------
    // 3.5 Ações (UI → motor → gravar → desenhar)
    // ------------------------------------------------------------------
    function act(fn) {
      fn();
      save();
      render();
    }

    function endTurnUI() {
      if (!S.combat || busy) return;
      if (!endTurnPlayer()) { save(); render(); return; }
      busy = true;
      S.combat.pend = 1;
      save();
      render();
      later(() => {
        busy = false;
        if (!S || !S.combat || !S.combat.pend) return;
        delete S.combat.pend;
        enemyTurn();
        save();
        render();
      }, 550);
    }

    function tryPlay(hi, ti) {
      if (playCard(hi, ti)) { save(); render(); return true; }
      return false;
    }

    function tapHand(i) {
      const C = S.combat;
      if (busy) return;
      potSel = null;
      const d = cdef(C.hand[i]);
      if (sel === i) {
        if (d.tgt !== 'e' || alive().length === 1) { if (!tryPlay(i, alive()[0] && C.enemies.indexOf(alive()[0]))) render(); }
        else toast('Toca num inimigo para jogar a carta.');
        return;
      }
      if (d.un) { toast('Esta carta não se pode jogar.'); return; }
      if (d.cost > C.energy) toast('Não tens energia suficiente.');
      sel = i;
      render();
    }

    const onClick = e => {
      if (suppressClick) { suppressClick = false; return; }
      const el = e.target.closest('[data-a]');
      if (!el || !S && el.dataset.a !== 'char') return;
      const a = el.dataset.a, i = +el.dataset.i, k = el.dataset.k;
      switch (a) {
        case 'char': act(() => startRun(k)); break;
        case 'deck': showDeck('deck'); break;
        case 'relic': showRelic(k); break;
        case 'pot': if (potSel === i) { potSel = null; render(); } else showPotion(i); break;
        case 'pile': showDeck(k); break;
        case 'node': if (S.screen === 'map') act(() => chooseNode(k)); break;
        case 'end': endTurnUI(); break;
        case 'en': {
          if (busy) return;
          const C = S.combat;
          if (C.enemies[i].dead) return;
          if (potSel != null) { act(() => usePotion(potSel, i)); return; }
          if (sel != null && cdef(C.hand[sel]).tgt === 'e') { if (!tryPlay(sel, i)) render(); return; }
          if (sel != null) { if (!tryPlay(sel)) render(); return; }
          showEnemyInfo(i);
          break;
        }
        case 'field': {
          if (busy || !S.combat) return;
          if (sel != null && (cdef(S.combat.hand[sel]).tgt !== 'e' || alive().length === 1)) { const ai = S.combat.enemies.indexOf(alive()[0]); if (!tryPlay(sel, ai)) render(); }
          else if (sel != null || potSel != null) { sel = null; potSel = null; render(); }
          break;
        }
        case 'me': if (!busy) showMeInfo(); break;
        case 'rwCard': showCardInfo(S.reward.cards[i], `<button class="btn primary" data-m="rwTake" data-i="${i}">Adicionar ao baralho</button>`); break;
        case 'rwSkip': act(() => { S.reward.cardDone = true; }); break;
        case 'rwRelic': act(() => { addRelic(S.reward.relic); S.reward.relic = null; }); break;
        case 'rwPot': if (S.pots.indexOf(null) < 0) toast('Não tens espaço. Deita fora uma poção primeiro.'); else act(() => { addPotion(S.reward.potion); S.reward.potion = null; }); break;
        case 'rwLeave': act(leaveReward); break;
        case 'bossRelic': act(() => takeBossRelic(i)); break;
        case 'shopCard': { const c = S.shop.cards[i]; showCardInfo(c, S.gold >= c.price ? `<button class="btn primary" data-m="buy" data-k="c" data-i="${i}">Comprar por ${c.price} de ouro</button>` : `<p style="color:#ff6b7f">Não tens ouro suficiente (${c.price}).</p>`); break; }
        case 'shopRelic': if (S.gold < S.shop.relics[i].price) toast('Não tens ouro suficiente.'); else act(() => buy('r', i)); break;
        case 'shopPot': if (S.gold < S.shop.pots[i].price) toast('Não tens ouro suficiente.'); else act(() => buy('p', i)); break;
        case 'shopRemove': if (S.gold < removePrice()) toast('Não tens ouro suficiente.'); else act(() => startPick('remove', 'shop')); break;
        case 'leave': act(toMap); break;
        case 'restHeal': if (!mod('noRest')) act(restHeal); break;
        case 'restUp': if (S.deck.some(canUp)) act(() => startPick('upgrade', 'rest')); break;
        case 'evCh': act(() => eventChoose(i)); break;
        case 'chest': act(() => { S.treasure.open = true; if (S.treasure.relic) addRelic(S.treasure.relic); else S.gold += 40; }); break;
        case 'pickCard': {
          const u = +el.dataset.u;
          if (S.pick.mode === 'upgrade') showUpgradePreview(u);
          else { const inst = S.deck.find(c => c.u === u); showCardInfo(inst, `<button class="btn primary" data-m="doPick" data-u="${u}">Remover do baralho</button>`); }
          break;
        }
        case 'pickCancel': act(finishPick); break;
      }
    };

    modal.addEventListener('click', e => {
      if (suppressClick) { suppressClick = false; return; }
      const el = e.target.closest('[data-m]');
      if (!el) { if (e.target === modal) closeModal(); return; }
      const m = el.dataset.m, i = +el.dataset.i;
      if (m === 'close') closeModal();
      else if (m === 'tab') showDeck(el.dataset.k);
      else if (m === 'rwTake') { closeModal(); act(() => takeRewardCard(i)); }
      else if (m === 'buy') { closeModal(); act(() => buy(el.dataset.k, i)); }
      else if (m === 'doPick') { closeModal(); act(() => pickCard(+el.dataset.u)); }
      else if (m === 'dropPot') { closeModal(); act(() => { S.pots[i] = null; if (potSel === i) potSel = null; }); }
      else if (m === 'usePot') {
        closeModal();
        const p = POTIONS[S.pots[i]];
        if (p.t && S.combat && alive().length > 1) { potSel = i; sel = null; render(); toast('Toca no inimigo alvo.'); }
        else act(() => usePotion(i, S.combat ? S.combat.enemies.indexOf(alive()[0]) : 0));
      }
    });

    // Toque longo (detalhes da carta) e arrastar cartas da mão
    let press = null, suppressClick = false;
    const onDown = e => {
      suppressClick = false;
      const el = e.target.closest('[data-card]');
      if (!el) return;
      const h = el.dataset.h != null ? +el.dataset.h : null;
      press = { el, pid: e.pointerId, x0: e.clientX, y0: e.clientY, h, drag: false, long: false, inModal: modal.contains(el) };
      press.timer = later(() => {
        if (!press || press.drag) return;
        press.long = true; suppressClick = true;
        const [id, up] = el.dataset.card.split(':');
        showCardInfo({ id, up: +up });
      }, 450);
    };
    const enemyAt = (x, y) => {
      const t = document.elementFromPoint(x, y);
      const en = t && t.closest && t.closest('.en');
      if (!en || en.classList.contains('dead')) return null;
      return +en.dataset.i;
    };
    const onMove = e => {
      if (!press || e.pointerId !== press.pid) return;
      const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
      if (!press.drag && Math.hypot(dx, dy) > 10) {
        clearTimeout(press.timer); timers.delete(press.timer);
        if (press.h == null || busy || !S || !S.combat || press.long) { if (press.h == null) press = null; return; }
        press.drag = true;
        if (sel !== press.h) { sel = press.h; render(); press.el = wrap.querySelector(`[data-h="${press.h}"]`); }
        press.el.classList.add('drag');
      }
      if (press && press.drag && press.el) {
        press.el.style.transform = `translate(${dx}px,${dy}px) scale(1.05)`;
        const ti = enemyAt(e.clientX, e.clientY);
        wrap.querySelectorAll('.en').forEach(x => x.classList.toggle('hov', +x.dataset.i === ti && cdef(S.combat.hand[press.h]).tgt === 'e'));
      }
    };
    const onUp = e => {
      if (!press || e.pointerId !== press.pid) return;
      const p = press; press = null;
      clearTimeout(p.timer); timers.delete(p.timer);
      if (p.drag) {
        suppressClick = true;
        const C = S.combat;
        if (!C) return;
        const d = cdef(C.hand[p.h]);
        const handTop = wrap.querySelector('.mc-hand').getBoundingClientRect().top;
        const ti = enemyAt(e.clientX, e.clientY);
        let ok = false;
        if (e.clientY < handTop - 30) {
          if (d.tgt === 'e') { if (ti != null) ok = tryPlay(p.h, ti); else if (alive().length === 1) ok = tryPlay(p.h, C.enemies.indexOf(alive()[0])); }
          else ok = tryPlay(p.h);
        }
        if (!ok) { sel = null; render(); }
        return;
      }
      if (p.long) return;
      if (p.h != null && S && S.combat && !p.inModal) { suppressClick = true; tapHand(p.h); }
    };
    wrap.addEventListener('pointerdown', onDown);
    modal.addEventListener('pointerdown', onDown);
    wrap.addEventListener('click', onClick);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const onCtx = e => { if (root.contains(e.target)) e.preventDefault(); };
    window.addEventListener('contextmenu', onCtx);

    overlay.addEventListener('click', e => {
      const b = e.target.closest('[data-o]');
      if (!b) return;
      const o = b.dataset.o;
      if (o === 'menu') host.exit();
      else if (o === 'again' || o === 'new') { overlay.hidden = true; S = null; Arcade.store.set(SAVE_KEY, null); busy = false; closeModal(); render(); }
      else if (o === 'go') {
        overlay.hidden = true;
        if (S && S.combat && S.combat.pend && !busy) { delete S.combat.pend; enemyTurn(); save(); }
        render();
      }
      else if (o === 'restart') {
        if (!restartArmed) { restartArmed = true; b.innerHTML = 'Tens a certeza? A partida atual perde-se'; return; }
        overlay.hidden = true; S = null; busy = false; Arcade.store.set(SAVE_KEY, null); closeModal(); render();
      }
    });

    function pause() {
      save();
      restartArmed = false;
      const info = S && !S.over ? `${CHARS[S.char].n} · andar ${S.floor} · ${S.hp}/${S.maxHp} PV` : 'Masmorra de Cartas';
      overlay.innerHTML = `<h2>Pausa</h2><p>${info}</p><p style="font-size:13px">A partida fica sempre guardada.</p>` +
        `<button class="btn primary" data-o="go">Continuar</button>` +
        (S && !S.over ? `<button class="btn center" data-o="restart">Recomeçar</button>` : '') +
        `<button class="btn center" data-o="menu">Menu</button>`;
      overlay.hidden = false;
    }
    pauseBtn.onclick = () => { if (S && S.over) return; pause(); };
    const onVis = () => { if (document.hidden) save(); };
    document.addEventListener('visibilitychange', onVis);
    const onResize = () => { paintBg(); if (S || !S) render(); };
    window.addEventListener('resize', onResize);

    function offerResume(data) {
      S = data;
      const C = S.combat;
      overlay.innerHTML = `<h2>Partida guardada</h2><p>${CHARS[S.char].n}${C ? ' · em combate' : ''}</p>` +
        `<div class="stats"><div><b>${S.floor}</b><span>andar</span></div><div><b>${S.hp}/${S.maxHp}</b><span>PV</span></div><div><b>${S.deck.length}</b><span>cartas</span></div></div>` +
        `<button class="btn primary" data-o="go">Continuar partida</button><button class="btn center" data-o="new">Nova partida</button>`;
      overlay.hidden = false;
      render();
    }

    // ------------------------------------------------------------------
    // 3.6 Bot de teste (só existe com window.ARCADE_DEBUG)
    // ------------------------------------------------------------------
    function botCombat() {
      const C = S.combat;
      const en = alive();
      const target = en.slice().sort((a, b) => (a.hp + a.block) - (b.hp + b.block))[0];
      const ti = C.enemies.indexOf(target);
      // poções: cura quando está mal, as outras logo no início de lutas difíceis
      for (let i = 0; i < S.pots.length; i++) {
        const p = S.pots[i];
        if (!p) continue;
        if ((p === 'vida' && S.hp < S.maxHp * 0.4) || (p !== 'vida' && (C.kind !== 'm' || S.hp < S.maxHp * 0.3) && C.turn <= 2)) { usePotion(i, ti); return; }
      }
      let incoming = 0;
      for (const e of en) { const ii = intentInfo(e); if (ii.atk) incoming += ii.atk.d * ii.atk.x; }
      const need = Math.max(0, incoming - C.block);
      let best = -1, bs = 0;
      C.hand.forEach((inst, i) => {
        const d = cdef(inst);
        if (d.un || d.cost > C.energy) return;
        let s = 0;
        if (d.type === 'pwr') s += C.turn <= 3 ? 30 : 6;
        for (const op of d.fx) {
          const k = op[0];
          if (k === 'dmg' || k === 'pierce') s += calcDmg(P, target, op[1]) * (op[2] || 1);
          else if (k === 'dmgAll') s += calcDmg(P, target, op[1]) * (op[2] || 1) * en.length * 0.8;
          else if (k === 'dmgBlock') s += C.block;
          else if (k === 'dmgPoison') s += target.st.poison || 0;
          else if (k === 'block') s += Math.min(op[1] + (C.st.dex || 0), need) * 1.3 + 0.5;
          else if (k === 'dblBlock') s += Math.min(C.block, need) * 1.3;
          else if (k === 'draw' || k === 'energy') s += 10;
          else if (k === 'st') s += op[2] === 'poison' ? op[3] * (op[1] === 'A' ? en.length : 1) * 0.9 : 4;
          else if (k === 'mulSt') s += (target.st.poison || 0);
          else if (k === 'heal') s += 2;
          else if (k === 'hpLoss') s -= S.hp > 20 ? 1 : 20;
        }
        if (d.id === 'x_lodo') s = C.energy > 1 ? 1 : 0;
        if (d.cost === 0) s += 2;
        if (s > bs) { bs = s; best = i; }
      });
      if (best >= 0) playCard(best, ti);
      else { if (endTurnPlayer()) enemyTurn(); }
    }
    function botStep() {
      switch (S.screen) {
        case 'map': {
          const av = availNodes();
          const sc = k => {
            const t = S.map.nodes[k].t, hpP = S.hp / S.maxHp;
            return t === 'r' ? (hpP < 0.5 ? 9 : 2) : t === 'e' ? (hpP > 0.75 ? 4 : -5) : t === '$' ? (S.gold > 120 ? 5 : 0) : t === '?' ? 3 : t === 't' ? 8 : 3;
          };
          const best = av.map(k => [k, sc(k) + R() * 2]).sort((a, b) => b[1] - a[1])[0][0];
          chooseNode(best);
          break;
        }
        case 'combat': botCombat(); break;
        case 'reward': {
          const Rw = S.reward;
          if (Rw.relic) { addRelic(Rw.relic); Rw.relic = null; }
          if (Rw.potion && S.pots.indexOf(null) >= 0) { addPotion(Rw.potion); Rw.potion = null; }
          if (!Rw.cardDone) {
            const order = Rw.cards.map((c, i) => [i, 3 - RORD[CARDS[c.id].rar] + R()]).sort((a, b) => b[1] - a[1]);
            if (S.deck.length < 22 || R() < 0.4) takeRewardCard(order[0][0]); else Rw.cardDone = true;
          }
          leaveReward();
          break;
        }
        case 'boss': takeBossRelic(0); break;
        case 'shop': {
          const sh = S.shop;
          if (!sh.removed && S.gold >= removePrice()) {
            const bad = S.deck.find(c => CARDS[c.id].rar === 'cur' || CARDS[c.id].rar === 'st') || S.deck.find(c => /golpe|corte/.test(c.id) && CARDS[c.id].rar === 'basic');
            if (bad) { startPick('remove', 'shop'); pickCard(bad.u); break; }
          }
          const ci = sh.cards.findIndex(c => !c.sold && c.price <= S.gold && CARDS[c.id].rar !== 'common');
          if (ci >= 0) { buy('c', ci); break; }
          toMap();
          break;
        }
        case 'rest':
          if (S.hp < S.maxHp * 0.55 && !mod('noRest')) restHeal();
          else if (S.deck.some(canUp)) { startPick('upgrade', 'rest'); const c = sortDeck(S.deck.filter(canUp))[0]; pickCard(c.u); }
          else toMap();
          break;
        case 'event': {
          if (S.event.done) { toMap(); break; }
          const ev = EVENTS.find(e => e.id === S.event.id);
          const opts = ev.ch.map((c, i) => i).filter(i => !ev.ch[i].req || ev.ch[i].req(S));
          eventChoose(pick(opts));
          break;
        }
        case 'treasure': if (!S.treasure.open) { S.treasure.open = true; addRelic(S.treasure.relic); } else toMap(); break;
        case 'pick': { const l = S.deck.filter(c => S.pick.mode === 'remove' || canUp(c)); if (l.length) pickCard(sortDeck(l)[S.pick.mode === 'remove' ? l.length - 1 : 0].u); else finishPick(); break; }
      }
    }
    function simulate(n, ch) {
      const keep = S, keepFast = FAST;
      FAST = true;
      const res = { runs: 0, wins: 0, floors: { 1: 0, 2: 0, 3: 0 }, rooms: 0, killers: {}, stuck: 0 };
      try {
        for (let r = 0; r < n; r++) {
          startRun(ch || pick(Object.keys(CHARS)));
          let steps = 0;
          while (S.screen !== 'over' && steps++ < 30000) botStep();
          if (S.screen !== 'over') { res.stuck++; continue; }
          res.runs++;
          if (S.over.win) res.wins++;
          res.floors[S.over.floor]++;
          res.rooms += S.over.rooms;
          if (!S.over.win) res.killers[S.over.killer] = (res.killers[S.over.killer] || 0) + 1;
        }
      } finally { FAST = keepFast; S = keep; }
      res.avgRooms = +(res.rooms / Math.max(1, res.runs)).toFixed(1);
      return res;
    }
    if (window.ARCADE_DEBUG) {
      window.cardsDebug = {
        state: () => S,
        simulate,
        step() { botStep(); save(); render(); },
        set(fn) { fn(S); save(); render(); },
        startRun(ch) { act(() => startRun(ch)); },
        fight(ids, kind) { act(() => startCombat(ids, kind || 'm')); },
      };
    }

    // ------------------------------------------------------------------
    const saved = Arcade.store.get(SAVE_KEY, null);
    if (saved && saved.v === 1 && !saved.over && CHARS[saved.char]) offerResume(saved);
    else render();

    return {
      destroy() {
        if (S && S.combat && S.combat.pend) { busy = false; delete S.combat.pend; enemyTurn(); }
        save();
        for (const t of timers) clearTimeout(t);
        timers.clear();
        disposeCanvas();
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('contextmenu', onCtx);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);
        if (window.cardsDebug) delete window.cardsDebug;
      },
    };
  }

  Arcade.register({
    id: 'cards',
    title: 'Masmorra de Cartas',
    icon: '🗡️',
    color: '#a55eea',
    desc: 'Sobe a torre com um baralho que vais construindo. Cada escolha conta.',
    best: () => {
      const s = loadStats();
      const w = Object.values(s.wins).reduce((a, b) => a + b, 0);
      return s.maxFloor ? `andar ${s.maxFloor} · ${w} ${w === 1 ? 'vitória' : 'vitórias'}` : '—';
    },
    create,
  });
})();
