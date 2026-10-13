# SMASHVR — platform fighter prototype v0.1

A browser platform fighter with classic 64-era vibes: original fighters
(RONIN, VOLT), knockback/percent/stocks rules, shields, projectiles, CPU AI,
VRM avatar import, and a Fighter Lab for custom kits. Desktop-first, keyboard.

Zero Nintendo IP: all fighters, moves, and audio are original.

## Run

Serve the folder over HTTP (ES modules + importmap need it) and open
`index.html`:

```bash
cd ~/workspace/smashvrm
python3 -m http.server 8901
# -> http://localhost:8901/
```

URL flags: `?demo=1` (CPU-vs-CPU exhibition), `?debug=1` (`window.__sv.game`).

## Controls

| | P1 | P2 |
|---|---|---|
| Move | A / D | ← / → |
| Jump (also "up" for tilts) | W | ↑ |
| Crouch / fast-fall | S | ↓ |
| Attack (tilts / aerials) | J | Num1 |
| Smash | K | Num3 |
| Special | L | Num2 |
| Shield | Space | Num0 |

- **Tilts:** hold a direction + attack (W+J = up-tilt, S+J = down-tilt).
- **Smash in air** = aerial. **Special:** direction + special (W+L = up-special recovery).
- **Drop through platform:** S + jump while standing on one.
- **DI:** hold a direction while launched to nudge the launch angle ±8°.
- **Esc / P:** pause.

## Rules (v0.1)

- 3 stocks, 5:00 timer. Blast zones at x ±13, top 11, bottom −7.
- Percent → knockback (Smash-64-flavored formula in `js/kb.js`).
- Shield has HP, drains while held, breaks into long stun at zero.
- Up-specials leave you helpless until you land. Getting hit refreshes double jump.

## File layout

| File | Owner | What |
|---|---|---|
| `index.html` | engine | screens: title / select / HUD / pause / results, importmap |
| `css/style.css` | engine | dark arena theme |
| `js/main.js` | engine | boot, renderer, screen flow, HUD, VRM import, lab overlay |
| `js/engine.js` | engine | `createGame()` — fixed-timestep sim, physics, combat, AI, camera |
| `js/input.js` | engine | keyboard state, per-player maps, edge detection |
| `js/audio.js` | engine | WebAudio synth SFX, no files |
| `js/kb.js` | engine | pure knockback math (`TUNING`, `knockback`, `hitstunFrames`, `launchVelocity`) |
| `js/fighters.js` | fighter agent | `createFighter('ronin'\|'volt')` |
| `js/moves.js` | fighter agent | move data |
| `js/anim.js` | fighter agent | `tickFighterVisual(f, dt)` |
| `js/rig.js` | fighter agent | procedural rig |
| `js/fx.js` | fighter agent | `initFX`, `hitSpark`, `koBlast`, `spawnProjectile`, `updateProjectiles`, shield bubble |
| `js/vrm.js` | fighter agent | `loadVRMFile`, `attachVRMToFighter`, `removeVRMFromFighter` |
| `js/lab.js` | fighter agent | `openLab(containerEl, getP1Fighter)` |
| `js/budget.js` | fighter agent | move-swap balance budget |
| `js/vendor/` | — | vendored three r180, three-vrm 3.5.2, GLTFLoader (do not re-download) |

## Contract notes (engine side assumptions)

- `f.y` is the fighter's **feet**; hurtbox ≈ 1.0w × 1.7h above feet.
- `f.traction` is used as a ground-friction multiplier (vx *= traction when no input).
- Move `hits[]` use `from`/`to` frame windows; `lunge` applies once at the first active frame.
- `updateProjectiles(dt)` is called with `dt = 1/60` (seconds per fixed tick).
- `tickFighterVisual(f, dt)` is called every fixed tick with `dt = 1/60`.
- Fighters are re-created per match via `createFighter`, which re-reads the saved Fighter Lab kit.
