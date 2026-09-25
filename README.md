# Kazemura 風村 — a samurai village

A third-person samurai game in the browser, inspired by the river village of [Hanakawa](https://hanakawa-boat-game.vercel.app/). Walk and run through a mid-size Edo-period village, talk to anyone by typing, earn and spend mon, fight with or without a sword, and pick who you play: a wandering samurai (the default) or live-action-style takes on characters from One Piece, Naruto, Bleach and Brawl Stars.

NPC conversations are understood by **TypeSafe's Jev** model: you can type anything, and the game reads what you meant — buying, haggling, asking directions, accepting a task, answering a riddle, threatening someone — then decides in code what the villager says and does.

## Quick start

```bash
npm install
npm run assets        # downloads the CC0 textures/models into public/assets (already done if the folder exists)
cp .env.example .env  # then paste your TypeSafe key: TYPESAFE_API_KEY=...
npm run dev           # http://localhost:5173
```

No key? The game still works — conversations fall back to a keyword interpreter (shown as "keyword mode" in the dialogue box). Get a key at <https://console.typesafe.ai/keys>.

Other scripts: `npm run build` (type-check + production build), `npm run preview` (serve the build, `/api/talk` included), `npm test` (unit tests for the talk pipeline and dialogue rules).

## What you can do

- **Explore** ~95 procedurally built buildings — machiya shops, kura storehouses, thatched farmhouses, a dojo, the Sakura Inn, a tea house — plus a vermilion arched bridge, a tunnel of thirty torii up to a hill shrine, a five-story pagoda, rice paddies, a bamboo grove, a waterfall and a bandit camp. A day lasts 24 real minutes; lanterns light up at night.
- **Talk** to ~35 villagers. Press <kbd>E</kbd>, then type or pick an option. NPCs remember how you treat them (the mood bar) and react to who you are playing.
- **Trade**: swords, armor, food, remedies, hats and masks. Haggle in your own words — a polite, reasoned case gets a better price than "cheaper!". Sell bandit tokens and loot.
- **Quests**: the bandit chief Kurogane, Kenta's lost cat, the monk's riddles (judged by meaning, not exact words), a rice delivery, a fisherman's charm, the legendary Moon Blade, the dojo trials, and a drunken ronin's duel.
- **Fight**: combos, heavy attacks, blocking and parrying, dodge rolls, formal duels and sparring, and one special technique per character. Sheathe your weapon (<kbd>Q</kbd>) to fight bare-handed.
- **Services**: sleep at the inn (saves, heals, skips to morning), play chō-han dice at the tea house, train at the dojo, get a blessing at the shrine.

## Controls

| Key | Action |
| --- | --- |
| <kbd>W A S D</kbd> | Move (camera-relative) · <kbd>Shift</kbd> run · <kbd>Z</kbd> walk · <kbd>Space</kbd> jump |
| Mouse | Look (click the game to capture the mouse) · wheel to zoom |
| Left click | Strike — tap for combos, hold and release for a heavy blow |
| Right click | Block — block as a blow lands to parry |
| <kbd>C</kbd> | Dodge roll |
| <kbd>Q</kbd> | Draw / sheathe |
| <kbd>F</kbd> | Special technique |
| <kbd>E</kbd> | Talk / interact |
| <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> | Quick items: healing, tea, sake |
| <kbd>M</kbd> · <kbd>J</kbd> · <kbd>Esc</kbd> | Map · journal and bag · menu |

In conversations: type and press <kbd>Enter</kbd>, or press <kbd>1</kbd>–<kbd>9</kbd> for options (when the text box is empty), <kbd>Esc</kbd> to leave.

## Characters

| | Character | Weapon | Special (<kbd>F</kbd>) |
| --- | --- | --- | --- |
| Default | **Hayato**, wandering samurai | Katana & wakizashi | Iaijutsu flash-draw dash |
| One Piece | Monkey D. Luffy | Fists | Gum-Gum Pistol (the arm really stretches) |
| One Piece | Roronoa Zoro | Three swords, one in the mouth | Oni Giri |
| Naruto | Naruto Uzumaki | Kunai | Shadow Clone Jutsu (three clones fight with you) |
| Naruto | Sasuke Uchiha | Kusanagi | Chidori |
| Bleach | Ichigo Kurosaki | Zangetsu | Getsuga Tenshō (a flying crescent) |
| Bleach | Byakuya Kuchiki | Senbonzakura | A storm of cherry-petal blades |
| Brawl Stars | Shelly | Shotgun | Super Shell |
| Brawl Stars | El Primo | Fists | Flying Elbow Drop |

Characters are built procedurally with realistic proportions (not anime shapes): a skinned body with computed skin weights, a sculpted head, hair, clothing lofted over the same bones, and procedural animation. Switch any time from the pause menu — money, bag and quests carry over. Adding a character is one entry in `shared/roster.ts`.

## How the TypeSafe integration works

Jev doesn't write dialogue. It returns typed judgments that code can branch on, so the design is:

1. **One request per message, many questions (speculative fan-out).** `server/questions.ts` builds a single Jev request with every judgment the dialogue code might need:
   - **Choice** — the main intent (greet, buy, haggle, ask directions, ask for work, challenge, threaten…), which of the NPC's topics, which ware, which of your items, which village place, which service.
   - **Score** — politeness (hostile → courteous) and how strong a haggling case is.
   - **Noul** — threat, insult, flattery, "claims the task is done".
   - Only when relevant — the reply to a pending yes/no question, whether a riddle was attempted and answered correctly (judged by meaning against the accepted answer), and, when you name several numbers, which one is your offer (code finds the numbers; Jev selects one).
2. **Code owns the outcome.** `src/systems/dialogue.ts` applies explicit policy: confidence gates (unsure readings ask you to clarify instead of guessing), purchases always ask for a yes first, prices come from mood, honor and the haggling score with a per-merchant cap, and quest claims are checked against real game state — "I found your cat" only works if Mochi is actually following you.
3. **The key stays on the server.** `/api/talk` (the Vite dev/preview middleware, or `api/talk.ts` on Vercel) builds the questions from the NPC catalog — clients can't send their own questions, input is validated and length-limited, and requests are rate-limited.
4. **Fallback.** If there's no key or Jev is unreachable, the same answer shape comes from `shared/heuristic.ts`, so the game never breaks.

The line under the dialogue box shows how your last message was read, e.g. `haggle 100% · item: bokken · polite 2.0/3`.

## Deploying

Vercel works out of the box: it builds the Vite app and turns `api/talk.ts` into a function. Set `TYPESAFE_API_KEY` in the project's environment variables. Any static host also works — without `/api/talk` the game uses keyword mode.

## Project layout

```
shared/        data shared by client and server: NPCs, items, quests, places, riddles, roster, talk contract, fallback
server/        /api/talk: validation, rate limiting, Jev question set
api/talk.ts    Vercel function wrapper
src/world/     terrain, river, buildings, props, vegetation, collision, navigation
src/characters procedural skinned characters, clothing, hair, weapons, animation
src/entities/  actors, player, NPC AI, combat, specials
src/systems/   dialogue director, quests, effects, day/night, talk client
src/ui/        HUD, dialogue, shop, journal, map, menus, loading and select screens
scripts/       asset download, screenshot helpers
```

Dev pages: `?lineup` (all characters side by side), `?lineup&npcs`, `?poselab&id=zoro&clips=slash1:0.2` (pose inspection), `?preview` (world only).

## Credits

- Textures and props: [Poly Haven](https://polyhaven.com), CC0 — see `public/assets/CREDITS.md`.
- Fonts: Cormorant Garamond and Geist (SIL Open Font License), via Fontsource.
- Music and sound effects are synthesized at runtime.
- Luffy, Zoro, Naruto, Sasuke, Ichigo, Byakuya, Shelly and El Primo belong to their creators (Eiichiro Oda / Shueisha, Masashi Kishimoto / Shueisha, Tite Kubo / Shueisha, Supercell). This is a non-commercial fan project; the models are original procedural recreations, not ripped assets.
