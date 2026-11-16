// Menu principal e navegação entre jogos (#id no URL, para o botão "voltar" do Android funcionar).
(function () {
  const app = document.getElementById('app');
  let current = null;
  let enteredFromMenu = false;


  function stopCurrent() {
    if (current) { current.destroy(); current = null; }
  }

  function showMenu() {
    stopCurrent();
    const games = Arcade.games.map(g => `
      <button class="card" data-id="${g.id}">
        <div class="ico" style="background:${g.color}33">${g.icon}</div>
        <div>
          <h2>${g.title}</h2>
          <div class="desc">${g.desc}</div>
          <div class="best">Recorde: ${g.best()}</div>
        </div>
      </button>`).join('');
    app.innerHTML = `
      <div class="menu">
        <h1>Arcada de Bolso</h1>
        <p class="sub">${Arcade.games.length} mini-jogos que funcionam sem internet.</p>
        <div class="cards">${games}</div>
      </div>`;
    app.querySelectorAll('[data-id]').forEach(b => {
      b.onclick = () => { enteredFromMenu = true; location.hash = b.dataset.id; };
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
