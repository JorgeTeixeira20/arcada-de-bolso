// Guarda tudo no telemóvel para jogar sem rede.
// Responde logo com a cópia guardada e, se houver rede, atualiza-a em segundo plano
// (as alterações aparecem na abertura seguinte). Ao adicionar ficheiros novos, junta-os
// a ASSETS e sobe a versão de CACHE.
const CACHE = 'arcada-v2';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/core.js',
  'js/app.js',
  'js/games/shooter.js',
  'js/games/towers.js',
  'js/games/runner.js',
  'js/games/snake.js',
  'js/games/bricks.js',
  'js/games/reflex.js',
  'js/games/merge.js',
  'js/games/mines.js',
  'js/games/sudoku.js',
  'js/games/solitaire.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(e.request, { ignoreSearch: true });
      const network = fetch(e.request)
        .then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; })
        .catch(() => cached);
      if (cached) { e.waitUntil(network); return cached; }
      return network;
    })
  );
});
