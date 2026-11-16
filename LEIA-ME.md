# Arcada de Bolso

Mini-jogos para o telemóvel que funcionam sem internet (PWA: instala-se a partir do browser, sem loja de apps).

## Testar no computador

Nesta pasta: `python3 -m http.server 8000` e abre http://localhost:8000.
Usa o modo telemóvel das DevTools do Chrome (Cmd+Shift+M). WASD/setas também mexem o jogador.

## Pôr no telemóvel

O telemóvel tem de abrir a app **uma vez** por HTTPS, por exemplo no GitHub Pages. Depois disso fica guardada e funciona offline.
- iPhone (Safari): Partilhar → "Adicionar ao ecrã principal"
- Android (Chrome): menu ⋮ → "Instalar app"

Abre-a uma vez com rede antes do voo, para garantir que fica tudo guardado.

## Adicionar um jogo

1. Cria `js/games/<nome>.js` com `Arcade.register({ id, title, icon, color, desc, best, create(host) })`.
   `create` recebe `{ root, canvas, exit }` e devolve `{ destroy() }`. Usa `js/games/shooter.js` como modelo.
2. Junta o `<script>` em `index.html`.
3. Junta o ficheiro a `ASSETS` em `sw.js` e sobe a versão de `CACHE`.

## Jogos

| Jogo | Ficheiro | Como se joga |
|---|---|---|
| Enxame | shooter.js | Arrasta o polegar para fugir; a arma dispara sozinha. Escolhe melhorias a cada nível. |
| Defesa da Torre | towers.js | Toca numa casa para construir; toca numa torre para a melhorar ou vender. 3 mapas, 20 vagas, modo infinito. |
| Corredor | runner.js | Toca para saltar, mantém para saltar mais alto, toca no ar para o duplo salto. |
| Serpente | snake.js | Desliza para virar. |
| Tijolos | bricks.js | A raquete segue o dedo; levanta o dedo para lançar a bola. |
| Reflexos | reflex.js | 3 modos: alvos, tempo de reação, sequência. |
| Fusão | merge.js | Desliza para juntar números iguais. Guarda o jogo sozinho. |
| Campo Minado | mines.js | Toque revela, toque longo põe bandeira. 3 dificuldades. |
| Sudoku | sudoku.js | 3 dificuldades, notas, dicas. Guarda o jogo sozinho. |
| Paciência | solitaire.js | Toca numa carta para a mover sozinha, ou arrasta. Vira 1 ou 3 cartas. |
