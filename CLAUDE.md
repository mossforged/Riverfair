# Riverfair: project handoff

Read this first. It records what the game is, how the code is laid out, the decisions already made, and what is still open, so a new session can pick up without re-deriving any of it.

## What it is
- **Riverfair** is a digital board game for 2–5 players, played online with friends (no account) or on one device against AI.
- **Live:** https://mossforged.github.io/Riverfair/ (GitHub Pages from this repo, branch `main`). It can be installed as an app from the title screen.
- **Origin:** it began as a faithful implementation of Rüdiger Dorn's *Istanbul* plus its first expansion (*Mocha & Baksheesh*). The owner later made it its own game and removed every Istanbul reference from what players see. Keep it that way: no Istanbul names in player-facing text. The rules are still Istanbul's, and the original rulebooks were the reference for every rule and component value.
- **Setting:** the owner's animal-fantasy world (Eldrith). The species are Redwall-like, with nothing larger than a badger or fox. The Avian Ascendancy (herons, egrets, crows and their bird servants) is the meddling power above the townsfolk. Small mammals have single plain names. Greater avians have elevated, Latin- or elvish-sounding names.

## Owner's working style
- He generates all the art himself with AI image tools, from prompts written here. Give him one ready-to-paste prompt per image, and add the art to the game when he sends it.
- He playtests himself. Don't over-tune balance before he has played.
- He often tests on a phone, so every screen must work at about 400px wide.
- He likes short lists of concrete options with a recommendation, and plain pushback when an idea is weak.

## Files
| File | What it holds |
|---|---|
| `index.html` | Page shell; loads `themes/riverfair.js`, then `game.js`; registers `sw.js` |
| `game.js` | Everything else: rules engine, AI, rendering, effects and sound, online sync, home screen and lobby (about 1,800 lines, one file on purpose) |
| `style.css` | All styling. Later rules override earlier ones, and Riverfair sections are near the end |
| `themes/riverfair.js` | Every name, description and art path players see (`words`, `goods`, `places`, `cards`, `tileAbil`, `art`). Change wording here, not in `game.js` |
| `art/` | `tiles/` (20 places), `standees/` (9 figures), `portraits/` (head crops of the standees), `icons/`, `home/` (title, lobby and table backgrounds, crest feather, empty chair), `app/` (app icons) |
| `manifest.webmanifest`, `sw.js` | Installable app and offline cache |
| `tools-precache.py` | Rewrites the offline file list in `sw.js`. Run it on every release (see below) |
| `database.rules.json` | Firebase Realtime Database rules |
| `server/push-worker.js` | Cloudflare Worker that sends turn alerts (not served by Pages; the owner pastes it into Cloudflare) |

## Releasing a change
1. Bump the cache-busting stamp: `V=$(date -u +%Y%m%d%H%M); sed -i -E "s/\?v=[0-9]+/?v=$V/g" index.html`
2. Refresh the offline list: `python3 tools-precache.py $V`
3. Commit and push to `main`. Pages redeploys within about a minute.
- The repo was renamed from `Istanbul` to `Riverfair`. Pushing worked through the old URL, which GitHub forwards.

## Key internal names (theme words in brackets)
- **Goods:** `r g y b` [Wool, Herbs, Honey, Pearls]
- **Places and resources:**
  - `coffee` [mushrooms]
  - lira [Coppers]
  - rubies [Gold Feathers]
  - assistants [apprentices]
  - family [cousin]
  - envoy track [Lady Shavala Kartil at Envoy's Aerie, place 13]
  - lodge tiles [lodge badges, places 14–15]
  - gem dealer [Madame Glimmer's Hoard, 16]
- **Characters:**
  - `gov` [Clerk Nelfar Corbow, crow]
  - `smug` [Rennick, fox smuggler]
  - `trader` [Sorrel, squirrel forager]
  - neutral traders in 2-player games [Gutterlane Peddlers, rat standees]
- **Expansion** (`g.x`, shown as "Mushrooms & Guilds"):
  - places 17 Mushroom Grotto, 18 Guild Hall, 19 Gutterlane Snug, 20 Roastery
  - guild cards, numbered 1–20
  - Snug favours (`tt.m` [Gutter map, straight-line move] and `tt.e` [Friends in low places, free encounters])
  - barricade (`g.barrier`)
  - bribe slate (`g.bribe`)
- **Board:** a 4×4 grid (base game) or 5×4 (expansion, `g.cols`). Phones transpose the 5×4 board to 4×5 with CSS only.
- **Player colors and standees:**
  - red: hedgehog
  - green: mouse
  - yellow: lizard
  - teal: jay
  - white: toad

## How the engine works
- Game state `G` is one plain JSON object. `newGame(cfg)` builds it, and `upgradeState()` migrates saves made by older versions.
- Turns are async. Every player choice goes through `decide(ctx,p,kind,data)`, which shows a window for humans (`humanDecide`) and asks the AI otherwise (`aiDecide`).
- The AI ranks moves by simulating them on cloned state (`rankMoves` and `evalPlayer`), with `ctx.sim` set.
- `GEN` and `ABORT` cancel stale turn flows. `RNG_N` counts random draws; Undo is only allowed while it hasn't changed.
- **Effects** (`runFx`): `render()` snapshots before and after. Pieces walk tile by tile (`gridPath`, `walkToken`, a clone tagged `data-walk`). Gained or spent goods, coins, mushrooms, apprentices, cards, badges and favours fly between the tile and the player's panel, one icon per unit. Dice and the feather flourish also play here.
- **Important:** `render()` must rebuild only the `.tile` elements inside `#board`. Walking figures, the barricade and its icon live on the board too and must survive redraws; wiping the board broke movement for online watchers.
- **Online:** Firebase Realtime Database. The config is in `game.js`; the project id is `istanbul-8c39c`, which players never see.
  - Each game lives at `games/<CODE>`. The active player's browser runs the turn and commits it with a versioned transaction, while watchers render a throttled `live` copy.
  - AI turns are driven by the first human player who is online.
  - `?mock` swaps in a same-browser fake database for testing with two tabs.
- Local saves are stored under `riverfair-*` keys. Older `istanbul-*` keys are migrated automatically at startup.

## Guided tutorial ("Learn to play" on the title screen)
- `startTutorial()` builds a real two-player base game (`tutSetup()`): the player (saved name, or "Hob") against the AI Bramble, on the short layout, with fixed coins, cards, Crow, Fox and Riverside order board. The game carries `G.tut=true` and is never saved.
- `tutSteps()` is the script: 21 coach cards over six turns (Wool Loft and filling to cart capacity, Wool badge while paying a Peddler, a favour card, Herb Cellar, Herb badge for a Gold Feather, Town Well, selling at Riverside with the Fox there). Each step has `when` ('move' or 'post'), optional `only` (the one place you may move to), `spot` (selectors to highlight; the first visible one wins), and either a `next` button or an `until()` goal. `text` may be a function when it depends on the game (the Town Well card mentions Bramble's crate only if he bought one).
- While the script runs, only the taught place is reachable, Suggest and Undo are hidden, End turn shows only on end-turn steps, and lodge claims have no Skip. Bramble's first five moves come from `TUT.ai`, and `TUT.dice` fixes the one roll that matters (the paid Peddler walks to Rat Alley). `SIMN` stops AI simulations from using those dice.
- When the script ends (or the player taps Skip lesson) the same game continues as normal free play.
- If you change the short layout, starting setup, or encounter rules, re-run the tutorial: its moves are planned around them.

## Mushrooms & Guilds tour
- `xSteps()` / `startXLesson()`: six coach cards (mushrooms, Roastery, guild cards, Snug, Sorrel) shown at the start of a player's first expansion game on a device (`riverfair-xlesson`). Explains only; nothing is restricted. Replay it from How to play during an expansion game. It reuses the tutorial coach with `TUT.kind='exp'`.

## AI skill
- `p.lvl` is `easy`, `normal` or `hard` for AI players; one "AI skill" choice at setup (local and online, saved as `riverfair-lvl`) applies to all AI seats. Shown as "AI · Hard" tags.
- Easy's handicaps live in `EASY` in `game.js`: it takes the best, 2nd or 3rd-ranked move 70/18/12% of the time, ignores a good guild card 15% of the time and bets 6 or 7 at the Tavern. Normal is the original AI. Hard re-ranks its top 5 moves by also scoring the best follow-up move (`rankMoves(...,look)`) and bets 7 at the Tavern.
- Measured win rates (hundreds of bot games): Easy vs two Normals wins about 21% (a fair share would be 33%). In Easy vs Normal vs Hard, Hard wins about 70%, Normal about 17% and Easy about 8%. Hard is strong enough that even Normal rarely wins that three-way. The owner asked for Easy to be a bit stronger than the first version (which won about 6% against two Normals).

## End of game
- Players carry `fsrc` (Gold Feathers by place name, from `gainRuby`) and `st` stats (`steps`, `paid`, `sold`, `deals`, `caught`, `bet`, via `stat()`). The results sheet (`endHTML`) shows each player's feather sources and up to four "Market awards".
- **Rematch** starts the same seats again. Locally it calls `startGame`. Online it creates a new game already in play, records its code at `games/<old>/next`, and everyone else gets a "Rematch!" prompt to follow it.

## Turn alerts (web push)
- Online games show a bell button. Turning it on asks permission, subscribes with `PUSH_KEY` (public VAPID key) and stores the subscription at `games/<CODE>/push/<ME>`. Each client also writes `games/<CODE>/vis/<ME>` (is the tab visible).
- After every committed turn (and at start and rematch) the driving client calls `PUSH_URL/notify` with the code. The worker reads the game from Firebase, and if the player to move is a human who is away (no presence, or tab hidden) it sends one alert per turn (`games/<CODE>/notified`). `sw.js` shows it and opens `?game=CODE` when tapped.
- **Status:** built and tested (encryption against `http_ece`, worker logic against a fake database, the button and storage in a browser), but **not live until the owner deploys the worker** and `PUSH_URL` in `game.js` is set. The private VAPID key was handed to the owner directly; it is not in the repo. iPhones only allow alerts from the installed app.

## Card art
- `THEME.art.cards[key]` and `THEME.art.guild[n]` (paths under `art/cards/`) fill the card's picture window; the icon formula stays as a small badge in the corner. Square images work best. Process: one shared style prompt plus a one-line subject per card, about five cards per batch.

## Music
- A music toggle (note icon in the header, plus "♪ Music" on the tutorial coach card) plays a looping 6/8 tune in D major, synthesised with Web Audio like the sound effects: `MEL`, `CHORD`, `musSchedule()`. Off by default; the choice is saved as `riverfair-music`. It pauses while the tab is hidden.
- To use a real recording instead, add `music: 'art/music/theme.mp3'` (or similar) to `themes/riverfair.js`; `musicStart()` then plays that file on a loop. Add the file to `tools-precache.py`'s list if it should work offline (it only collects `.webp`/`.png`).

## Settings
- The header's sliders button opens a Settings window (`settingsSheet()`) with three switches: sound effects, music, and "Dim places you can't reach" (`riverfair-dim`, on by default; off adds `body.no-dim`). Sound and music moved here from the header to free space on phones; the tutorial coach card keeps its own music switch.
- The dimming was softened at the owner's request: art tiles out of reach now keep 70% of their colour (was 45%).

## Board figures
- Tiles with standing figures get a `.shade` layer that blurs and darkens the painting behind them, and standees get a cream cut-out outline. Groups of 3+ spread across the tile.

## Testing that was used
- Playwright (Chromium is preinstalled) against `python3 -m http.server`.
- **All-AI games:** override `window.sleep` to finish quickly, then loop `playTurn` and `advanceTurn` over 2–5 players, with and without the expansion. Expect no errors and finished games.
- **Movement test:** record every animation frame. Each move must keep the piece visible, avoid doubles and jumps over 40px, pass through the right tiles and face the direction of travel. Run it locally, on a phone-sized screen and online with two `?mock` tabs.
- **Two-tab online test:** create, join by code, start, and play a guild card.
- **AI skill tournament:** Easy, Normal and Hard play each other with `window.sleep` stubbed; Hard should win most, Easy least.
- **Online rematch:** two `?mock` tabs, finish the game in the mock database, Rematch from one tab, follow from the other; both end up in the new game in their own seats.
- **Tutorial run:** click Learn to play, then loop: click the coach's Next, tap the step's `only` place and Move here, play the card, End turn, accept sheets. It should reach free play with 1 Gold Feather, both Wool & Herb badges and no errors, at 400px and desktop widths.

## Decisions already made (don't relitigate without the owner)
- **Resources:**
  - Wool, Herbs, Honey and Pearls. Pearls are white.
  - Mushrooms are the expansion resource; they're roasted into tea at the Roastery.
- **Places:** the base game's two mosques are "Lodges", so the expansion's "Guild Hall" keeps its name.
- **Standees and art:**
  - Player standees walk, carrying packs. Characters who aren't players stand still with no pack.
  - Location tiles are outdoor views with animals at work. Don't feature the player species on tiles (rats are allowed at Rat Alley).
  - The Snug and Roastery tiles are interior scenes, and the owner chose to keep them as they are.
- **Layout:**
  - The main game layout stays as it is. A one-screen dashboard redesign was considered and declined; only the painted table background was adopted.
  - The isometric/3D board was considered and declined, since it hurts readability.
  - On desktop (900px+) the board is capped to the screen height so the whole board is always in view (`--bw` in `style.css`). From 1400px the page widens to 2000px, the board column gets more room, and tile text, icons and standees grow (bigger again from 2200px). Phones are unchanged.
- **Title screen text:** tagline *Where small folk make their fortunes*, headline *Fill your cart. Earn your feathers.*
- **Rules and components:**
  - Market demand tiles, the Envoy track start (5 goods with 2–3 players, 4 with 4–5) and Glimmer's prices (15/14/12 by player count) match the printed components.
  - The Snug favour piles cost 1–4.
  - Turn order: the starting player is random, and seating follows the setup order.

## Open items
- **Music:** the synthesised tune is a placeholder-quality first pass. The owner may replace it with an AI-generated track (see Music above).
- The owner's real playtest with a friend hasn't happened yet. Expect feedback on pacing, clarity and online quirks.
- **Turn alerts:** waiting for the owner to deploy `server/push-worker.js` to Cloudflare and send the worker address for `PUSH_URL`.
- **Letters & Seals** (the second official expansion): the owner wants it eventually for completeness; paused. Ask for its rulebook PDF before building.
- **Card art:** first batch of prompts given (Spare crate, Purse of coppers, Shortcut, Whistle, Bail out cousin).
- **Unused art:** the `charter` icon.
- **Optional extras:**
  - outdoor versions of the Snug and Roastery tiles (prompts were written)
  - painted art for each of the 39 cards (currently built from icons)
  - a full shuffle of turn order
