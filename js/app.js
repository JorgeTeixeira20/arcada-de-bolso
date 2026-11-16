// Menu principal e navegação entre jogos (#id no URL, para o botão "voltar" do Android funcionar).
(function () {
  const app = document.getElementById('app');
  let current = null;
  let enteredFromMenu = false;


  function stopCurrent() {
    if (current) { current.destroy(); current = null; }
  }

  // Secções do menu. Um jogo que não esteja aqui vai para "Outros".
  const SECTIONS = [
    { id: 'acao', title: 'Ação', games: ['shooter', 'towers', 'runner', 'snake', 'bricks', 'rhythm', 'reflex'] },
    { id: 'puzzle', title: 'Puzzle', games: ['merge', 'mines', 'sudoku', 'parking', 'words', 'tilt'] },
    { id: 'tabuleiro', title: 'Tabuleiro e cartas', games: ['chess', 'checkers', 'naval', 'solitaire', 'cards'] },
    { id: 'relax', title: 'Relaxar', games: ['golf', 'fishing', 'idle'] },
  ];
  let menuScroll = 0;

  function card(g) {
    let best = '';
    try { best = g.best(); } catch {}
    return `
      <button class="card" data-id="${g.id}">
        <div class="ico" style="background:${g.color}33">${g.icon}</div>
        <div>
          <h2>${g.title}</h2>
          <div class="desc">${g.desc}</div>
          ${best ? `<div class="best">Recorde: ${best}</div>` : ''}
        </div>
      </button>`;
  }

  function showMenu() {
    stopCurrent();
    const filter = Arcade.store.get('menu:filter', 'all');
    const byId = Object.fromEntries(Arcade.games.map(g => [g.id, g]));
    const listed = new Set(SECTIONS.flatMap(s => s.games));
    const sections = SECTIONS
      .map(s => ({ ...s, list: s.games.map(id => byId[id]).filter(Boolean) }))
      .concat([{ id: 'outros', title: 'Outros', list: Arcade.games.filter(g => !listed.has(g.id)) }])
      .filter(s => s.list.length);
    const shown = sections.filter(s => filter === 'all' || s.id === filter);
    const chips = [{ id: 'all', title: 'Todos' }, ...sections]
      .map(s => `<button class="chip${s.id === filter ? ' on' : ''}" data-f="${s.id}">${s.title}</button>`).join('');
    app.innerHTML = `
      <div class="menu">
        <h1>Arcada de Bolso</h1>
        <p class="sub">${Arcade.games.length} mini-jogos que funcionam sem internet.</p>
        <div class="chips">${chips}</div>
        ${shown.map(s => `<h3>${s.title}</h3><div class="cards">${s.list.map(card).join('')}</div>`).join('')}
      </div>`;
    const menu = app.querySelector('.menu');
    menu.scrollTop = menuScroll;
    app.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => { menuScroll = menu.scrollTop; enteredFromMenu = true; location.hash = b.dataset.id; };
    });
    app.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => { Arcade.store.set('menu:filter', b.dataset.f); menuScroll = 0; showMenu(); };
    });
  }

  function startGame(game) {
    stopCurrent();
    app.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'screen';
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    app.appendChild(root);
    current = game.create({
      root,
      canvas,
      exit() {
        if (enteredFromMenu) history.back();
        else location.replace('#');
      },
    });
  }

  function route() {
    const id = location.hash.slice(1);
    const game = Arcade.games.find(g => g.id === id);
    if (game) startGame(game);
    else { enteredFromMenu = false; showMenu(); }
  }

  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
