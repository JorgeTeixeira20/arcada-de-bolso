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
2. Junta o `<script>` em `index.html` e põe o id numa secção de `SECTIONS` em `js/app.js`.
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
| Ritmo | rhythm.js | Toca nas 4 pistas quando as notas chegam à linha; mantém nas notas longas. Música gerada pelo jogo. |
| Labirinto | tilt.js | Inclina o telemóvel (ou usa o joystick) para levar a bola à saída. |
| Batalha Naval | naval.js | Contra o computador, 3 níveis. |
| Damas | checkers.js | Contra o computador (3 níveis) ou 2 jogadores. |
| Xadrez | chess.js | Contra o computador (4 níveis) ou 2 jogadores. |
| Colónia | idle.js | Idle: toca para recolher comida, compra formigas; produz com a app fechada (até 12 h). |
| Palavras | words.js + words-data.js | Adivinha a palavra (do dia ou livre) e sopa de letras, em português. |
| Estacionamento | parking.js | Arrasta os carros para tirar o vermelho. 60 níveis. |
| Mini Golfe | golf.js | Arrasta para trás e larga. Percurso clássico, do dia e aleatório. |
| Pesca | fishing.js | Segura para lançar, toca para ferrar, mantém o indicador na zona do peixe. |
| Masmorra de Cartas | cards.js | Roguelike de baralhos: 2 personagens, 3 andares. |
