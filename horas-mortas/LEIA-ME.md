# Horas Mortas: Deathmatch

Deathmatch todos-contra-todos para um jogador contra bots, por tempo (3, 5 ou 10 minutos). Corre no browser, sem instalar dependências e sem internet.

## Modos

- **Deathmatch:** todos contra todos, por tempo, no mapa Subúrbio.
- **Incursão:** avanças sala a sala num complexo de 12 salas (armazém, pátio, contentores, ruínas, bunker, casa, oficina, praça). Limpas a sala, o portão abre e segues para o nível seguinte. Depois da 12.ª sala gera-se um setor novo, mais difícil. A cada 5 níveis há um chefe. Ganhas uma habilidade por sala limpa e outra sempre que a barra de experiência dos abates enche. Morreres acaba a incursão.

Na Incursão tens duas habilidades ativas desde o início: **E** dash e **V** foco (abranda os inimigos durante uns segundos, o ecrã fica azulado). As escolhas entre salas melhoram-nas.

Cada sala tem cobertura garantida junto às portas, e os inimigos esperam cerca de 2 segundos antes de disparar quando entras.

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
| B | Menu de armas: 1 a 4 arma principal, 5 Karambit, 6 Butterfly |
| R (com a faca) | Repete a animação da faca |
| G ou 4 | Granada na mão, com linha de trajetória; clique esquerdo lança |
| R | Recarregar |
| F | Inspecionar a arma (um toque = uma vez; segurar = repete) |
| X | Radar |
| Baixar + saltar | Entra pelas janelas (parte o vidro) |
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
- Modelos 3D das armas (Sketchfab, licença CC BY 4.0 — https://creativecommons.org/licenses/by/4.0/), com texturas reduzidas:
  - "M16 Assault Rifle" de Mateusz Woliński (jeandiz)
  - "Karambit" de Diamonddogkz
  - "Butterfly Knife NOX Balisong" de Frobin_G
  - "M9 Bayonet knife" de Michael Karel
- Estes recursos servem para uso pessoal. Se algum dia quiseres publicar ou vender o jogo, confirma primeiro as licenças de cada um.
