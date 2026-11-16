# Horas Mortas: Deathmatch

Deathmatch todos-contra-todos para um jogador contra bots, por tempo (3, 5 ou 10 minutos). Corre no browser, sem instalar dependências e sem internet.

## Modos

- **Deathmatch:** todos contra todos, por tempo, no mapa Subúrbio.
- **Incursão:** avanças sala a sala num complexo de 12 salas (armazém, pátio, contentores, ruínas, bunker, casa, oficina, praça). Limpas a sala, o portão abre e segues para o nível seguinte. Depois da 12.ª sala gera-se um setor novo, mais difícil. A cada 5 níveis há um chefe. Ganhas uma habilidade por sala limpa e outra sempre que a barra de experiência dos abates enche. Morreres acaba a incursão.

Habilidades ativas que se desbloqueiam na Incursão: **E** dash, **V** foco (abranda os inimigos).

## Como correr

1. Instala o Node.js (qualquer versão recente), se ainda não tiveres.
2. Nesta pasta: `npm start` (ou `node server.js`).
3. Abre http://localhost:5173 no Chrome, Edge ou Firefox.

Também funciona abrindo o `index.html` com duplo clique.

## Controlos

| Tecla | Ação |
|---|---|
| WASD | Mexer |
| Shift | Correr |
| Rato | Apontar; botão esquerdo dispara, botão direito faz mira (funcionam os dois ao mesmo tempo) |
| Espaço | Saltar (dá para subir a caixotes, carros e barreiras) |
| C ou Ctrl (segurar) | Baixar. Se vieres a correr, desliza |
| 1 / 2 / 3 | Arma principal / pistola / faca (com a faca corres mais depressa) |
| Q | Volta à última arma usada |
| B | Menu para escolher a arma principal (1 a 4 equipa logo) |
| G ou 4 | Granada na mão, com linha de trajetória; clique esquerdo lança |
| R | Recarregar |
| F | Radar |
| Tab | Classificação |
| Esc | Pausa |
| M | Som |

Nota sobre o Ctrl: fora do ecrã inteiro, Ctrl+W fecha o separador do browser e a página não consegue impedir isso. Usa o botão "Ecrã inteiro" do menu (aí o jogo fica com o teclado) ou baixa-te com o C.

## Onde mexer

- `js/world.js`: mapa (armazém, bairro, contentores, ruínas, bunker, oficina), colisões e navegação dos bots.
- `js/tex.js`: texturas e materiais.
- `js/chars.js`: soldados, animação e braços por cinemática inversa.
- `js/game.js`: armas (`WP`), dificuldade (`DIFF`), IA dos bots (`botThink`, `botUpdate`), HUD e regras da partida.
- `js/assets.js`: modelo do soldado e fotos de texturas, embutidos.
- `js/anims.js`: animações do Mixamo já adaptadas ao esqueleto do soldado.
- `lib/postfx.js`: pós-processamento (modo de gráficos "Cinemático" no menu; se ficar lento ou estranho, muda para "Normal").

## Créditos dos recursos

- Motor: three.js r128 (licença MIT, ver `lib/THREE-LICENSE.txt`).
- Animações de combate (correr com espingarda, andar de lado, recuar, apontar, recarregar, reação a tiro): pack "Basic Shooter" do Mixamo, convertido para `js/anims.js`.
- Modelo e animações do soldado: `Soldier.glb`, dos exemplos do three.js (personagem "Vanguard" do Mixamo).
- Texturas de tijolo, relva, madeira e caixote: dos exemplos do three.js.
- Estes recursos servem para uso pessoal. Se algum dia quiseres publicar ou vender o jogo, confirma primeiro as licenças de cada um.
