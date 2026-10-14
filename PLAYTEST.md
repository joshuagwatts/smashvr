# SMASHVR v0.1 — Browser Playtest Report

**Date:** 2026-10-13 ~19:35–19:55 UTC (14:35–14:55 CDT)
**Environment:** Chromium 152.0.7977.82 headless (`/opt/meta-chromium/chrome`),
  SwiftShader software GL (`--use-angle=swiftshader --enable-unsafe-swiftshader`),
  1280×800 viewport, served via `python3 -m http.server 8902` in `~/workspace/smashvrm`.
  Headless frame rate measured ~13–15 fps (software rendering; NOT representative
  of real-hardware performance — physics use a fixed 1/60 timestep).
**Harness:** `test/playtest.mjs` (playwright-core, file:// bootstrap → 127.0.0.1:8902,
  same pattern as `limbo-test/test17.mjs`). Run with `?debug=1` (`window.__sv.game`).

## Result: 19/19 functional checks PASS (after 2 small fixes, below)

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Title screen renders | PASS | `verify/title.png` — SMASHVR logo, 1P/2P/Lab/VRM buttons, controls card |
| 2 | three.js loads (WebGLRenderer, canvas) | PASS | `#game canvas` present |
| 3 | Fighter select cards | PASS | 4 cards (ronin/volt × P1/P2), `verify/select.png` |
| 4 | 1P vs CPU reaches fight state | PASS | `game.state === 'fight'` after countdown |
| 5 | Two fighters spawn | PASS | RONIN (-3,0), VOLT (3,0), 3 stocks, 0% |
| 6 | Both fighter meshes in scene | PASS | `f.root.parent` set for both |
| 7 | P1 attack starts on J | PASS | mid-hold sample: `state='attack', moveId='jab'` |
| 8 | Attack connects | PASS | CPU percent rose 0 → 2 (`applyHit` probe: `pctBefore:0, pctAfter:2, dmg:2`) |
| 9 | ~10 s gameplay, no state corruption | PASS | fighters/stocks/positions sane throughout |
| 10 | Fight screenshot | PASS | `verify/fight.png` (+ `fight2.png`) |
| 11 | HUD percent element updates | PASS | `#hud-p1-pct` shows `%` |
| 12 | Match can end → results screen | PASS | `state='done'`, "RONIN WINS / LAST STOCK STANDING", Rematch + Quit buttons |
| 13 | Back to title after match | PASS | `#btn-results-title` → title visible |
| 14 | Lab: recolor UI | PASS | 2× `<input type=color>` (Primary/Secondary theme) + live 3D preview |
| 15 | Lab: budget UI | PASS | "Stolen moves: 0.0 / 208 pts" bar, per-class budget line |
| 16 | Lab: swap UI | PASS | per-move point costs + Swap buttons (e.g. Jab Combo 8.0 pts) |
| 17 | VRM file input exists/wired | PASS | `#vrm-file` file input on title; `loadVRMFile` wired to change event |
| 18 | Lab closes cleanly | PASS | ✕ button → overlay DOM removed, no errors |
| 19 | No page/console errors | PASS | zero pageerrors; zero console errors (favicon 404 fixed, see below) |

Also verified separately: **2P Versus** select + fight start + P2 input mapping
(`ArrowLeft` → P2 `_prevH.left=true`, facing flips — movement itself is subject to
the physics-scale issue below); **demo mode** (`?demo=1`) boots straight into a
CPU-vs-CPU fight with no errors.

## Bugs fixed (2, both small)

1. **Missing vendored file — game wouldn't boot at all.**
   `js/vendor/three_addons/loaders/GLTFLoader.js` imports
   `../utils/BufferGeometryUtils.js`, which wasn't vendored → module load failed →
   `main.js` never ran (no canvas, no game). Fixed by vendoring
   `three@0.180.0`'s `BufferGeometryUtils.js` from unpkg into
   `js/vendor/three_addons/utils/`. (README's "do not re-download" refers to the
   existing vendor files; this one was absent.)
2. **Grounded attacks were canceled on their first tick — no grounded attack
   could ever execute.** `physics()` calls `land()` every tick as the
   "snap-to-ground" mechanism, and `land()` unconditionally ran
   `if (f.state === 'attack') endAttack(f)` (meant as the *aerial* landing
   cancel). So every jab/tilt/smash died 1 tick after starting. Fixed in
   `js/engine.js` `land()`: capture `wasAir = !f.onGround` before grounding and
   only cancel when `wasAir` is true. Verified: jab now plays its full 22-tick
   anim and its hitboxes connect.
3. **Trivial:** added `<link rel="icon" href="data:,">` to kill favicon 404
   console noise.

## Known issues / NOT verified (do not consider v0.1 playable yet)

1. **Physics scale was wildly too fast for the world — FIXED 2026-10-13, see
   "Rebalance pass" below.** (Original measurements kept for the record:)
   - `runSpeed` 4.2 u/tick → a fighter crosses the 14-unit stage in ~4 ticks
     (~67 ms at 60 fps). Holding a direction for 250 ms flies ~36 units —
     straight off the stage.
   - `jumpV` 9.5 u/tick with `GRAV` 0.35 → any jump exits the top blast zone
     (y=11) within 2 ticks. Jumping = instant self-destruct.
   - Lunges are in the same units (e.g. VOLT sspecial `lunge: [7, 0.5]`
     adds 7 u/tick to vx).
   - Net effect observed: with zero player input the CPU loses all 3 stocks
     in ~4 s (walks/attacks itself off the edge; its recovery can't cope);
     P1 dies the same way from a 250 ms key hold. For reference, the
     knockback formula in `js/kb.js` is the literal Smash 64 formula and
     `LAUNCH_VEL_SCALE` 0.035 matches S64's ~0.03 — but S64 stages are
     ~180 units wide with blast zones ~200 out, while this stage is 14 wide
     with blast at ±13. The world is ~14× too small for the physics (or all
     motion constants are ~14× too big — the ratios aren't uniform, so it's a
     full rebalance, not a one-line scale).
   - Knockback itself connects and KOs correctly (verified), but at these
     speeds every exchange ends in seconds.
2. **Real VRM file import not verified** — no .vrm file was available; only
   confirmed the file input exists and `loadVRMFile` is wired. Needs a real
   `.vrm` drag/drop test (three-vrm 3.5.2 is vendored and loads cleanly).
3. **Game feel / balance** — untestable headless; needs Joshua's hands/eyes
   (especially after the physics rebalance in #1).
4. **Audio** — WebAudio SFX run muted headless; no errors, but sound design
   not actually heard.
5. **Fighter Lab kit persistence into fights — VERIFIED 2026-10-13** (see
   "Rebalance pass"): swapped volt's jab onto ronin via the Lab UI, confirmed
   `smashvr_kit_ronin` in localStorage, started a fresh fight, confirmed
   `moves.jab.id === 'volt_jab'` and that it executes and connects in-game.
6. **CPU AI quality** — beyond the suicide issue (a symptom of #1), AI
   decision-making not evaluated.

## Screenshots

- `verify/title.png` — title screen
- `verify/select.png` — fighter select
- `verify/fight.png` / `verify/fight2.png` — mid-fight (2P action shot)
- `verify/fight-idle.png` — idle fight (also shows post-match state)
- `verify/lab.png` — Fighter Lab (theme preview, color pickers, budget, swap list)

## Rebalance pass (2026-10-13)

**Verdict: the physics blocker is fixed — the game is mechanically playable.**
All motion constants were ~14× too big for the 14u stage (run 4.2 u/tick,
jumpV 9.5, lunges up to 7 u/tick). Retuned to S64-flavored values for this
world size. Frame data (startup/active/total per move) untouched, as required.

### New constants

`js/engine.js`
- `GRAV` 0.35 → **0.007** u/tick²
- Fall terminal-velocity cap now **skipped during hitstun** — a strong launch
  legitimately exceeds fall speed, and the old cap truncated every KO trajectory
- `helpless` (post-up-B) now allows air drift at `airSpeed` (S64-like; required
  for recovery to steer home)
- `fireSpecial` velocity sets: rise/divegrab `vy` 13 → **0.28** (apex ≈ 5.6u,
  horizontal momentum ×0.75 preserved); spin `vx` 9 → **0.075** (air lift capped
  at 0.10); divekick `vy` −12 → **−0.5**, `vx` 6 → **0.2**; punch `vx` +1.5 →
  **+0.12**; tornado re-press lift +2 → **+0.06**
- Shield pushback: `vx` (2 + dmg×0.12) → **(0.12 + dmg×0.008)**, `vy` 1 → 0.1;
  shield-break launch `vy` 7 → **0.35** (both sites)
- CPU edge guard: turns around at |x| > **5.0** (was 6.3 — the AI decides every
  12 ticks and can drift ~1.8u between decisions)

`js/moves.js` (fighter stats)
- ronin: runSpeed **0.13**, airSpeed **0.11**, fallSpeed **0.25**, fastFall
  **0.46**, jumpV **0.22**, djumpV **0.20**
- volt: runSpeed **0.15**, airSpeed **0.12**, fallSpeed **0.28**, fastFall
  **0.52**, jumpV **0.21**, djumpV **0.19**
- All 12 lunges retuned to move 1–3u TOTAL per move (were per-tick): jab 0.06,
  ftilt 0.10, ronin fsmash 0.22, fair 0.08, cyclone spin [0, 0.03], rising
  punch [0, 0], volt fsmash 0.24, knee 0.08, volt punch 0.10, railgun [0, 0.02],
  volt dive [0.04, 0], volt kick [0.03, −0.03]

`js/kb.js` — S64 formula kept, world mapping rescaled:
- `LAUNCH_VEL_SCALE` 0.035 → **0.0009**; `MAX_LAUNCH` 14 → **1.0**

### Measurements (fixed 1/60, deterministic in-page tick loops — `test/rebalance.mjs`)

| Target | Measured |
|---|---|
| Run crosses 14u stage in ~1.5–2s | 12u in 93 ticks = **1.55s** (full 14u ≈ 1.81s) ✓ |
| Single-jump apex ~3–3.5u, never threatens top blast (y=11) | **3.35u**, rise 0.48s ✓ |
| Fall from apex ~0.5–0.7s | **0.52s** ✓ |
| Fast-fall noticeably faster | **0.15s** vs 0.52s ✓ |
| Double-jump apex ~5.5–6.5u | **6.11u** ✓ |
| fsmash KOs ~80–110% near the edge | **side-blast KO at trial-65% pre-hit (≈83% post-hit)** from x=4.5 ✓ |
| Weak pokes at 0% barely push | jab: +2%, pushed **0.13u** ✓ |
| Low-% hitstun allows combos, ends before half stage (7u) | ftilt @30%: max displacement **1.91u** ✓ |
| CPU loses no stock in 60s with no P1 input | **3 stocks kept** (was: all 3 lost in ~4s) ✓ |
| Recovery: up-B + double jump from below-and-beside reaches the ledge | from **(−11,−5)** → back on stage, idle, 3 stocks ✓ |
| Lab swap loads into a real fight (old issue #5) | volt jab → ronin: equipped via UI, persisted to localStorage, `moves.jab.id === 'volt_jab'` in-fight, executes and connects (3%) ✓ |

KO-classification note: a frozen dummy can't recover after hitstun, so it can
die to the bottom blast after sliding off at ~20% — a live victim acts out of
hitstun and recovers there. The honest kill-power metric is the **side-blast**
KO (no chance to act), which is what the 65%/83% number measures.

### Bugs fixed during the pass (small)

4. **Lab overlay ate clicks after closing.** `teardown()` removed the inner
   overlay div but left the fixed full-screen `#lab-overlay` container visible
   but empty (z-index 30) — it intercepted all clicks on the title screen
   underneath. Now adds `hidden` to the container on teardown.
5. (Harness env, not game) `/tmp/smashvrm-bootstrap.html` must point at
   `index.html?debug=1` — without it `window.__sv` is never set and the
   playtest can't reach the fight state.

### Screenshots (new)

- `verify/rally1.png` — ronin fsmash connecting on volt, hit-spark visible (20% vs 53%)
- `verify/rally2.png` — volt launched in hitstun, ronin in follow-through

### Honest not-verified list (post-rebalance)

- **Game feel / balance** — numbers are S64-flavored but feel is untestable
  headless; needs Joshua's hands and eyes (unchanged from before).
- **Real VRM file import** — still no .vrm available; input exists and is wired.
- **Audio** — runs muted headless; sound design not actually heard.
- **KO%s are vs a frozen dummy** — live DI, teching and recovery change
  everything; treat the numbers as floors, not promises.
- **Meteors are weak-ish** — dair spikes send the victim down slowly; they're
  edgeguard setups, not KO moves, at sane percents.
- **Vertical KOs need very high %** — top blast (y=11) is far; usmash KOs
  around ~180%+. Side KOs are the main path in v0.1.
- **Triple-resource stack edge case** — platform (3.2) + double jump (6.1) +
  up-B (5.6) stacked at pixel-perfect apexes could theoretically reach y≈14.9
  > top blast 11. Not reachable accidentally; left as-is.
- **CPU AI quality** beyond not-suiciding — it now fights (it took a stock off
  the button-mashing script in the 19-check rerun) but decision-making quality
  not evaluated. 2P versus not re-run post-rebalance (physics-only change).

## Repro

```bash
cd ~/workspace/smashvrm && python3 -m http.server 8902   # keep running
cp test/playtest.mjs ~/workspace/limbo-test/ && cd ~/workspace/limbo-test
node smashvrm-playtest.mjs   # 19/19 expected
```

## Feel pass v0.2 (2026-10-13) — Joshua's five directives

His verdict after playing v0.1 is ground truth. All five directives implemented,
verified, and deployed.

### 1. Hitboxes now match the animations (WAS the big one)

Audited every move by posing the REAL procedural rig with the move's own
keyframe track, sampling every active tick, and measuring hitbox-center to
striking-limb-tip distance. 14 of 31 moves were out of sync (>0.6u); all fixed
by moving hitbox data to the measured limb positions (poses untouched, per his
call). New automated test: `test/hitbox_sync.mjs` (node, three.js headless —
263 hitbox-tick samples, FAILS if any active hitbox center is >0.6u from its
limb tip). Now: **263 samples, 0 out of sync.**

Notable fixes (hitbox dx,dy before -> after):
- ronin utilt (0.3,1.55) -> (0.65,1.45); usmash (0.25,1.6) -> (0.85,1.25);
  uair (0.2,1.6) -> (0.72,1.35); uspecial boxes -> (0.7,1.1)/(0.85,1.35)
  (the "up" attacks actually punch diagonally forward-up — boxes follow the fist)
- ronin bair (-0.8,1.0) -> (-0.15,1.45): the ELBOW_BACK pose throws an elbow,
  not a kick — hitbox now sits on the elbow (lowerArmR)
- ronin dsmash boxes recentered to (0.35,0.55)/(-0.65,0.55) tracking the
  front-most/back-most foot through the spin (test resolves per-tick)
- volt ftilt (0.7,1.0) -> (0.35,1.3) on the shoulder joint; utilt -> (0.8,1.3);
  usmash (0.2,1.65) -> (0.7,1.15); fair knee -> (0.5,0.85);
  bair (-0.8,1.05) -> (-0.6,0.65); uair -> (0.78,1.1, taller box);
  nspecial (0.9,1.1) -> (0.55,0.9); uspecial (0.2,0.8) -> (0.75,1.0)
- volt dsmash: the POUND pose slams only the RIGHT fist low (left fist rises
  behind) — replaced the phantom back-low box with a single honest hitbox
  (0.8,1.0) on the right fist. Move got cheaper in the Lab budget accordingly
  (priced on 16 dmg now, was 32).

### 2. Launch directions match the hit

Angle audit + `test/angle_bands.mjs` (asserts every hit/projectile angle in its
band — all pass). Fixes: both dsmash back-hits 30° -> 150° (were launching
victims FORWARD through the attacker); both bairs 35° -> 145° (back kick now
sends victims up-back instead of forward). Everything else was already in
band: utils/usmash 80-88° up, dtilts ~25-28° low, ftilts/fsmash 30-35° forward,
dair meteors 270° (ronin final hit pops up at 60°), volt divekick spikes 300°.

### 3. Knockback clearly scales with damage (he felt it was flat)

Root cause: the old formula's flat floor (+18, baseKB) dominated low-damage
moves — jab went 0.20u -> 0.61u from 0% to 180% (3x, invisible on screen).
Retuned `js/kb.js`: stronger pure-percent term (pct/6), lower floor (+10),
launch scale 0.0009 -> 0.0018, and NEW per-tick hitstun drag (vx *= 0.97) so
launches start SNAPPY and decay instead of drifting at constant speed.
`test/kb_scaling.mjs` replicates the engine's displacement model and asserts:

| move | 0% | 60% | 120% | 180% |
|---|---|---|---|---|
| jab | 0.28u | 0.61u | 0.98u | 1.45u (5.1x) |
| ftilt | 0.87u | 3.90u | 7.49u | 11.06u (12.7x) |
| fsmash | 1.34u | 6.54u | 12.09u | 17.38u (12.9x) |

KO calibration held: fsmash side-blast KOs at **82%** from x=4.5 (band 80-110);
jab at 0% still a 0.28u poke (combo game intact). `test/test_logic.mjs` golden
values updated for the new formula (its vy assertion was ALSO stale from
pre-rebalance — it was failing before this pass; now 14/14 pass).

### 4. Subtle camera shake on massive hits

`updateCamera` in `js/engine.js`: on hits with kbClass strong/kill, amplitude =
min(0.30, 0.06 + kb*0.0009), duration 8-15 ticks, quadratic decay. Weak pokes:
zero shake. Verified in browser (`test/feel_v02.mjs`): jab connects (cpu 2%)
with t=0/amp=0; fsmash fires amp=0.183, dur=10.

### 5. Camera freeze on the KO blow

`applyHit` predicts the KO with an engine-faithful simulation (drag + gravity +
stage landing + slide-out check). When the victim is on their LAST stock and
the trajectory crosses a blast line: both fighters freeze 26 ticks (hitPause),
camera pushes in toward the victim (z 16 -> 12.5, smoothstepped, then eases
back over 20 ticks) + 0.30 shake pulse, then releases into the launch.
Verified in browser: _koFx fires, defender hitPause=21-22 / attacker 22-23 on
first sample, camera z drops (15.78 and falling), shake pulse 0.30, and the
freeze resolves into a real KO. Screenshots: `verify/kofreeze.png` (freeze
frame, camera pushed in), `verify/shake.png` (fsmash connecting).

### Verification summary (all green)

- `test/test_logic.mjs`: 14/14
- `test/hitbox_sync.mjs`: 263 samples, 0 out of sync (NEW)
- `test/angle_bands.mjs`: all 31 moves in band (NEW)
- `test/kb_scaling.mjs`: dramatic curves + KO% 82 in band (NEW)
- `test/playtest.mjs`: 19/19 (no regressions)
- `test/feel_v02.mjs`: 11/11 — jab no-shake, fsmash shake, KO freeze flags,
  camera push-in, real KO resolution, zero console errors (NEW)

### Changed files (deployed)

js/kb.js (formula, scale, drag), js/moves.js (17 hitbox/angle fixes),
js/engine.js (hitstun drag, shake, KO freeze, camera), js/fx.js (projectile
kbClass), js/anim.js (export attackPose for the test), test/test_logic.mjs
(golden values), test/hitbox_sync.mjs + test/angle_bands.mjs +
test/kb_scaling.mjs + test/feel_v02.mjs (new), test/dump_traj.mjs (dev tool),
PLAYTEST.md (this section).

### Honest not-verified list (post-v0.2)

- **Game feel is still his call** — numbers are tuned and the mechanics are
  honest, but only his hands decide if it FEELS like Smash.
- **Real VRM file import** — still no .vrm on hand (his directive: test after
  gameplay is dialed in — that time is now).
- **Audio** — still muted headless; SFX not actually heard.
- **KO%s vs a live victim** — DI and recovery change everything; treat as floors.
- **Shake subtlety on real hardware** — amplitudes were eyeballed against the
  14u stage; may want nudging up/down after he plays.
- **KO prediction edge cases** — floating platforms aren't simulated in
  predictKO (rare false freeze, recovers cleanly); victim already past the
  blast line when hit dies during the freeze (correct outcome, camera targets
  the hit position).
- **CPU AI quality** — still not evaluated beyond not-suiciding.

## Genre pass v0.3 (mechanics) (2026-10-13)

Joshua's v0.3 directive: survey the Smash-like genre and implement the common
ground. Shipped the full mechanics set (engine half; mirror-match alt colors
are a separate pass, untouched here). Per his call: Melee-style charged
smashes (NOT 64-pure), Space+J = grab, Space+direction = roll, Space tap =
spot dodge, Space in air = air dodge.

### 1. Charged smashes (Melee-style)

Grounded K enters a `charge` state (max 60 ticks) instead of firing; release
fires with `mult = 1 + 0.4 * (chargeTicks/60)` (1.0x -> 1.4x), applied to BOTH
damage and knockback via a new `att.pow` field multiplied after `knockback()`
(the kb formula itself is untouched). Air K is unchanged (immediate aerial).
Charge visuals: theme-colored glow sprite scaling/brightening with charge
(`fx.chargeGlowTick`), trembling crouch pose, tiny camera tremor at full
charge, rising-pitch charge tone (`sfx.chargeStart/Set/Stop`). Getting hit,
grabbed, or KO'd mid-charge kills the tone+glow. Measured on ronin fsmash:
tap = 18.12 dmg, 30t = 21.60, 60t = 25.20; launch vx ratio full/tap = 1.79.
Lab pricing stays on uncharged values. Controls card: "K (hold) = charge
smash, release to fire".

### 2. Grab game

Space+J on the ground (from neutral or out of shield) -> `grab` state: grab
box active ticks 4-9 (range ~1.3u), 30-tick whiff = punishable. Connects
**through shield** (explicit `def.state==='shield'` check, bypassing the
shield-damage branch — no shield damage on connect). Victim -> `grabbed`,
grabber -> `holding`, victim locked to grabber. Pummel (bare J): +2%, 12-tick
cooldown. Throws (direction+J): fthrow 8dmg/40°, bthrow 8/140°, uthrow
9/85°, dthrow 7/290°, all via `knockback()` with baseKB 45 / kbGrowth 95.
Mash-out: victim holds 100 + percent*0.9 ticks; every victim
attack/special/jump/shield press shaves 14; at 0 both to idle with the victim
pushed slightly away. Getting hit breaks any grab involvement cleanly
(`releaseGrab`). New POSES: GRAB_ATTEMPT / HOLDING / GRABBED. Note: dthrow's
downward launch slams into a tech situation — verified it produces `misstech`
without a shield press.

### 3. Dodges

- **Roll** (Space+direction, ground): 28 ticks, intangible 4-20, travels 3.2u
  (can pass behind), stops at stage edges.
- **Spot dodge** (Space tapped, released within 8 ticks, no direction):
  20 ticks, intangible 3-15, stationary.
- **Air dodge** (Space in air): 26 ticks, intangible 4-18, drifts at
  airSpeed*0.8 with held direction, then -> `fall` with `jumpsUsed=1` (no
  double jump after).
Intangibility reuses `invuln`; the respawn blink in anim.js is now gated on
`state==='respawn'` so dodges/ledge don't strobe. Verified: roll and spot
dodge both pass through an active fsmash at 0%, air dodge avoids a fireball
(control: no dodge = 7%).

### 4. Ledge game

`physics()` snap check: falling, offstage (|x|>7), inside the snap box
(|x|-7<1.3, y in [-2.6, 0.6]), facing the stage, `_canGrabLedge` (re-armed on
every landing) -> `ledge`: snap to (edge, -0.5), invuln 40, 320-tick max hang
-> forced getup. Options: toward-stage direction -> `ledgegetup` (22t, intan
10); J -> `ledgeattack` (26t, 8dmg/40° hitbox active 8-14); Space ->
`ledgeroll` (30t, 3u inward, intan 4-22); W -> jump (jumpV*0.92, fresh double
jump). All four verified to reach stage/air from a below-edge snap.

### 5. Teching

`game._tick` counter added; `_lastShieldPress` tracked on every shield press
edge in all states. `land()`: airborne landing in `hitstun` with shield
pressed within 10 ticks -> `tech` (18t, invuln 14, vy 0.14 hop + spark);
otherwise -> `misstech` (45t vulnerable lying, small bounce). Verified both
paths.

### 6. Short hop via jump-squat

`jumpP` (ground or air) -> `squat` (3 ticks, crouch pose) instead of instant
jump; jump still held at squat end -> full (jumpV/djumpV), released -> short
(55%). Drop-through-platform and attack-priority ordering kept. Measured:
short apex 0.99u vs full 3.35u. AI recovery jump now holds (not taps) so the
AI still gets full jumps offstage.

### 7. Parry (perfect shield)

Shield raised within 3 ticks of the hit (`_shieldStartTick`) -> parry: 0
damage, 0 shield damage, both frozen 6 ticks, attacker pushed back
(vx = -facing*0.18), blue-white spark + distinct `sfx.parry()` "ting".
Verified vs a late-shield control (normal shield damage).

### CPU AI (minimal)

`thinkAI`: `ledge` state -> hold toward-stage direction (normal getup);
rare roll-away when the foe is mid-attack in range (`shieldTap` one-shot
consumed in `aiControl`); recovery jump holds for a full jump. New states all
auto-resolve; grab/hold/grabbed driven by the grab logic. 45s CPU-vs-CPU soak:
states seen include charge, roll, ledgegetup, misstech — 0 invalid, 0 stuck,
0 errors.

### Verification

- `test/feel_v03.mjs` (NEW, deterministic manual-tick driver: paused 2P
  versus, inputs via `game._human`, tick-by-tick): **40/40**
- `test/playtest.mjs`: 19/19 (no regressions)
- `test/feel_v02.mjs`: 11/11 (updated for the charge world: shake sampled
  after release, camera z read once the push-in develops)
- `test/test_logic.mjs`: 14/14; `test/hitbox_sync.mjs`: 263/263;
  `test/angle_bands.mjs`: all in band; `test/kb_scaling.mjs`: curves + KO%
  sane
- Screenshots: `verify/charge_full.png` (full-charge glow), 
  `verify/grab_throw.png` (hold), `verify/roll.png` (mid-roll tuck)
- Controls card in index.html documents all v0.3 inputs (both columns)

### Bugs fixed during the pass (real ones)

8. **`edges()` didn't carry held button bools** — `stepCharge`'s `!e.smash`
   release check was always true, so every charge released at 1 tick
   (found by the 21.6/25.2 damage checks failing at 18.12).
9. **`land()`'s new-state idle reset fired on the every-tick ground snap** —
   rolls/spotdodges were canceled back to idle on their first tick. The
   reset is now `wasAir`-gated for the new states (jump/fall/helpless keep
   the original unguarded behavior).

### Honest not-verified list (post-v0.3)

- **Game feel is still his call** — the mechanics are in, but only his hands
  decide (unchanged).
- **Real VRM file import** — still no .vrm on hand (unchanged).
- **Audio** — still muted headless; charge tone / parry ting not heard.
- **Grab-vs-grab and projectile-into-grab edge cases** — release paths are
  coded and the soak didn't trip them, but 1v1 projectile-while-holding is
  untested by hand.
- **AI never grabs, techs deliberately, or parries** — emergent only; its
  decision quality is still unevaluated.
- **Mirror-match alt colors** — explicitly the next pass, not this one.

## Genre pass v0.3 (colors) (2026-10-13)

Mirror-match distinguishability + Smash port-color conventions. Colors only —
no mechanics, frame data, or Lab changes.

### 1. Mirror-match alt palette
- `FIGHTER_DEFS` gained `altTheme` per fighter: ronin alt = teal `#2ee2a8` +
  white `#f2f5f7`; volt alt = orange `#e27a2e` + pale yellow `#ffe27d`
- When `p1def === p2def`, P2's procedural rig is retinted via the existing
  `rig.setTheme()` path (same code path the base theme uses) in
  `startFight` (main.js); `fighter.theme` is updated to match so saved-theme
  bookkeeping stays consistent
- VRM imported fighters keep their own look: `attachVRMToFighter` now sets
  `f._isVRM = true` (cleared to `false` on remove) and the alt-tint is
  skipped whenever either side is VRM-driven. VRM-vs-procedural already
  looks different, so no alt is needed there either
- Lab is untouched: the saved `smashvr_theme_<defId>` still wins for P1;
  the alt only overrides P2 on a mirror match

### 2. Port-colored ground rings
- Flat `THREE.RingGeometry` (inner 0.55, outer 0.75) under each fighter at
  y = 0.02, `depthWrite: false` so it never z-fights the stage edge —
  P1 `#ff3b30` red, P2 `#0a84ff` blue (Smash convention)
- Ring tracks the fighter's x/z every frame via one line in engine
  `syncRoot` (the only engine.js change besides ring creation + destroy
  cleanup; no mechanic logic altered). Always rendered: cpu / 2p / demo

### 3. HUD port colors
- `hud-p1-name` / `hud-p1-pct` in P1 red, `hud-p2-name` / `hud-p2-pct` in
  P2 blue, set once in `startFight` (`renderHud` only touches text, so the
  colors persist). Verified the percent number has no pre-existing
  damage-tint semantics (renderHud + css/style.css never recolor it), so
  nothing was overridden

### Verification
- `test/color_v03.mjs` (NEW, browser harness via bootstrap): **26/26** —
  mirror (ronin vs ronin): P1 materials keep `#e23b2e`/`#ffb13d`, P2
  materials retinted to `#2ee2a8`/`#f2f5f7` (no base red left), `theme`
  records the alt, rings red/blue in scene with correct geometry and
  y=0.02, ring.x tracks fighter.x atomically, HUD elements computed to
  `rgb(255, 59, 48)` / `rgb(10, 132, 255)`; mixed (ronin vs volt): base
  themes intact, no alt bleed, rings + HUD correct; no page/console errors
- Screenshots: `verify/mirror.png` (white/teal P2 vs red/orange P1, rings
  + port HUD visible), `verify/ports.png` (ronin vs volt)
- No regressions: `test/playtest.mjs` 19/19, `test/feel_v03.mjs` 40/40

### Honest not-verified list (post-v0.3 colors)
- **VRM alt-skip path** — `_isVRM` flag is set/cleared and procedural
  fighters read falsy, but the skip itself needs a real .vrm file on hand
  to exercise (same gap as the rest of the VRM import)
- **Saved lab theme + mirror combo** — the code path applies alt to P2
  regardless of saved themes, but not exercised headless with localStorage
  presets (fresh profile in the harness)

## v0.5 GLB auto-rig import (2026-10-14)

**What:** the title-screen file input now accepts `.vrm` / `.glb` / `.gltf`. VRM files
take the existing path unchanged. Static (unrigged) GLB/GLTF characters go through
new `js/autorig.js`: heuristic skeleton fitting for T-pose/A-pose humanoids
(bounding-box proportions, arm-axis detection from the shoulder band, joint
placement at 0.52H hips / 0.80H shoulders / 0.28H knees etc.), smooth
distance-to-bone-segment weight painting (top-4 normalized), bound as
`THREE.SkinnedMesh` + `THREE.Skeleton`.

**Integration trick:** the rigger returns a *pseudo-VRM* record
`{ scene, humanoid: { getNormalizedBoneNode, resetNormalizedPose }, update }`
so the already-verified VRM attach/pose/detach path (`vrm.js`, `anim.js`) works
with zero engine changes. Auto-rigged fighters get `_isVRM = true`, so the
mirror-match alt-tint never touches a user's model (port rings still apply).
UI toasts are honest: `Auto-rigged — arms detected: T-pose` on success, or
`Auto-rigged with warnings (…​) — results may be janky` when the proportions
don't look humanoid.

**Honest limits (v1):**
- T-pose / A-pose humanoids only. Sitting, kneeling, or stylized non-humanoid
  meshes get a warning and best-effort output — it will look janky.
- Files that already contain a skeleton are REJECTED with a clear error
  ("already contains a skeleton — use the VRM import path") instead of
  producing garbage silently.
- Weight painting is smooth distance-based skinning, not Mixamo quality.
  Fingers/toes/facial bones don't exist; loose clothing will stretch.
- Pose eulers are the game's own (authored for the procedural rig / VRM
  T-pose), applied directly like the VRM path — moves read correctly, they
  just won't be mocap-pretty.

**Tests** (`test/autorig.mjs`, node, no renderer — 19/19 pass):
- Procedural T-pose primitive humanoid → GLTFExporter → GLTFLoader →
  auto-rig → pose: bind pose is identity; raising the right arm moves hand
  verts (>0.10) while head verts stay (<0.02); bending the knee moves shin
  verts while thigh verts stay. Pose classified T, zero warnings, 17 bones.
- A-pose variant (30° droop): classified A, same deformation assertions pass.
- Negative: already-rigged file → clean rejection error; non-humanoid blob →
  warning path, no crash, honest "may be janky" notice.
- `test_logic.mjs` 14/14 still green (no shared-code regressions).
- Other suites (playtest/feel) not re-run here — a concurrent agent owns
  those files this window; this change touches none of them.

**Not verified:** no live-browser import test from this side (no browser
available to the verifying agent) — the file picker wiring, `loadVRMFile`
branching, and pseudo-VRM attach path were reviewed statically. Needs Joshua:
drag a real character GLB onto the import button and report what happens —
that is the ground-truth test for v1 heuristics.

## Feel pass v0.4 — smoothness + hit clarity ("juice") (2026-10-14)

Joshua's verdict on v0.3 is ground truth: "the fighting doesn't feel smooth
and the hits are hard to be aware of." Pure feel pass — no new mechanics, no
frame-data / knockback / angle changes. (Shipped alongside v0.5's GLB
auto-rig import, which lives in the same tree — js/autorig.js — and was
verified not to interact: the v0.4 changes operate below the rig/VRM
abstraction.)

### A. Smoothness

1. **Eased pose interpolation** (`js/anim.js` `attackPose`): smoothstep easing
   inside every keyframe span instead of linear; kill/strong moves get a
   punch-through exaggeration on the final span (mid-span push, lands exactly
   on keyframes — verified `endDiff=0`). Hitbox sync re-verified: **263/263
   samples still in sync** (easing deviations stay far under the 0.6u bar).
2. **State-transition blending**: `tickFighterVisual` crossfades 5 ticks
   (smoothstepped) on every state key change (`state|moveId`), from the last
   applied pose — idle/run/attack/hitstun no longer pop. Verified: blend
   engages on transition, pose provably still traveling mid-blend.
3. **Camera smoothing**: `updateCamera` now lerps a persistent smoothed
   position toward its target (k=0.16/tick) instead of snapping; shake is
   applied unsmoothed on top. KO punch-in target math unchanged. Measured
   max per-tick camera delta over 300 ticks of live play: **0.059u**
   (bound 1.2) — no snaps, including across respawn teleports.
4. **Render interpolation** (`game.update`): pre-tick positions are
   snapshotted and the render pass lerps between them by `acc/TICK` — kills
   judder on >60Hz displays where the fixed 1/60 tick pattern would land
   unevenly. Fighter roots AND port rings interpolate together.
5. **Per-fighter anim clock**: locomotion phase moved from a shared global to
   `f._animT`, so a fighter frozen by hitstop resumes its own cycle instead
   of jumping to the global phase. Hitstop now also freezes the pose
   (`tickFighterVisual` early-returns on `hitPause > 0`) — true hitstop.

### B. Hit awareness

1. **Hitstop on connect**: `3 + dmg*0.3`, clamped 3–8 ticks (was
   `3 + dmg*0.25`, min 2). Measured: jab 3, fsmash 7, KO blow 25
   (26 minus the defender's same-tick decrement). KO freeze stays its own
   26-tick beat; they never stack.
2. **Victim hit-flash**: `fx.setHitFlash` whites out every emissive-capable
   material under the victim's root for 4 ticks, then restores originals
   (works for procedural rigs and VRM models; sprites/shield bubble skipped).
   Verified set + full restore.
3. **Contact-point sparks**: `hitSpark` now takes `{dx, dy, dmg}` — bigger
   burst + hotter core, plus directional debris (4 + min(10, round(dmg/2))
   chunks) sprayed along the launch vector. Measured: jab 5, fsmash 13.
4. **Launch speed-lines**: `fx.speedLines` — 5–9 elongated streak sprites
   oriented along the launch dir, trailing behind the victim, on strong/kill
   launches only. Verified: zero on jab, burst on fsmash.
5. **Damage numbers**: tiny pooled DOM chips (`#dmg-layer`) pop off the
   victim with the rounded damage, float up and fade in 30 ticks (45 for the
   KO blow, larger + gold). Verified spawn with correct value, fade + removal.
6. **Hit SFX rebuilt** (`js/audio.js`): 2ms snap transient (highpassed click)
   + noise body + fast-dropping sine thump, all scaled by power; KO boom is
   now sub-drop + rumble + crack tail. Entry points verified not to throw
   headless; actual sound still needs ears (unchanged gap).
7. **KO vignette**: white edge-flash (`#ko-vignette`) pulses on the KO blow
   alongside the existing freeze/punch-in. Verified timer armed; visible in
   `verify/kofreeze_v04.png`.

### Verification (all green, zero regressions)

- `test/feel_v04.mjs` (NEW): **22/22** — easing active + keyframes exact,
  hitstop 3/7/25, KO vignette + cinematic armed, flash set/restored white,
  spark contact + debris 5/13, speed-lines only on kill moves, damage
  numbers spawn/fade, camera maxDelta 0.059u, blend engaged + traveling,
  sfx entry points, zero console errors.
- Regressions: playtest **19/19**, feel_v02 **11/11**, feel_v03 **40/40**,
  color_v03 **27/27** (one check updated: the port ring now asserts against
  the render-interpolated root position — exact — plus a loose logic-x
  bound), logic **14/14**, hitbox_sync **263/263**, angle bands pass,
  kb_scaling pass, rebalance **18/18** (jump tests updated for the v0.3
  short-hop: they were tapping, which is now correctly a short hop —
  hold-through-squat measures the full jump again).
- Screenshots: `verify/hit_clarity.png` (white flash + burst + damage
  numbers), `verify/launch_lines.png` (fsmash at 138%, flash + spark +
  speed-lines + "18"), `verify/kofreeze_v04.png` (KO freeze: vignette,
  flash, gold "18", camera pushed in).
- Test-only fixes during the pass (no game changes): feel_v04's KO/blend
  sections needed correct spacing and hitstop-aware sampling; its driver
  `reset()` now restores stocks (the KO test spends one) and revives a
  spent match; rebalance jump tests hold through jump-squat.

### Changed files (deployed)

js/anim.js (easing, blending, per-fighter clock, hitstop pose freeze),
js/engine.js (camera smoothing, render interpolation, hitstop retune,
flash/spark/speed-line/damage-number/vignette hooks, per-tick juice updates),
js/fx.js (directional debris, speedLines, hit-flash, damage numbers,
vignette, debug hooks), js/audio.js (punchier hit/ko + click transient),
js/main.js (fx/sfx debug exposure on `window.__sv`), index.html
(`#dmg-layer`, `#ko-vignette`), css/style.css (their styles),
test/feel_v04.mjs (new), test/color_v03.mjs + test/rebalance.mjs (harness
updates), PLAYTEST.md (this section).

### Honest not-verified list (post-v0.4)

- **Feel is still his call** — the juice is all in, but only his hands
  decide if it feels smooth and hits read (unchanged).
- **Audio** — synthesis rebuilt for punch on paper; still never actually
  heard (unchanged).
- **Real VRM/GLB import** — v0.5 shipped the auto-rig path; still needs his
  real character file (his directive: test after gameplay is dialed in).
- **Shake/vignette/flash magnitudes on real hardware** — eyeballed
  headless; may want nudging after he plays.
- **High-refresh render interpolation** — correct by construction, but this
  VM's headless Chromium runs at 60Hz software rendering; the >60Hz path
  is unexercised here.
- **Damage-number overlap** — rapid multi-hits stack chips (they fade in
  0.5s); fine in real play, dense in the deterministic tests.
- **CPU AI quality** — still unevaluated beyond not-suiciding (unchanged).

## v0.5.1 A-pose hardening (2026-10-14)
Joshua: "theres def gonna be a lot of a pose imports." Hardened the auto-rigger
for deep A-poses: arm detection band extended down (catches hands to ~60° droop),
pose classification widened (T < ~14°, A < ~67°), torso half-width estimator
replaced with a vertical-continuity method (widest |x| structure present across
7/8 vertical slices — max-extent, percentile, and density-peak all failed once
arm intruders got numerous), plus a limb-shape elongation check so non-humanoid
blobs still take the warning path instead of a false "A-pose" classification.
Tests: 34/34 in test/autorig.mjs (T + A at 15°/30°/45°/60°, deformation checks,
rigged-file rejection, blob warnings). 14/14 logic still green.

## v0.6 floating body types (2026-10-14)
Joshua: "some characters like a bug or ghost can be categorized as floating
types." The auto-rigger now detects body type, floaters get hover locomotion,
and WISP joins the roster as a built-in ghost fighter.

### Detection rule (js/autorig.js)
After the humanoid fit, count mesh vertices in the lower region (y < 0.45H)
split left/right of center (|x| > 0.05H each side). ≥30 verts on EACH side →
'biped'; otherwise 'floater'. A ghost (torso+head+arms, no legs), a robe
(single central mass), or a bug body → floater. Clean floaters get zero
warnings — it's a first-class type, not a failure ("Floater type detected —
hover locomotion"). rec.autorig.bodyType carries it; the Lab badge and the
fighter-select card show it.

Floater-specific fitting (their proportions don't follow humanoid rules):
- Shoulders anchor at the detected arm-centroid height, not 0.80H (a legless
  character's H is compressed, so 0.80H lands near the head).
- Torso half-width via horizontal raycasts in the 0.15–0.40H band (arm verts
  can never reach this low — even arms hanging straight down bottom out at
  ~0.48H). Raycasts are tessellation-independent; the v0.5.1 vertex-band
  continuity estimator silently missed on low-poly meshes (bands fall between
  vertex rows) and has been retired.
- Proportion sanity checks (torso slenderness, shoulder span) get wider
  bounds for floaters — stubby ghost bodies are normal.

### Floater rig
No leg bones are created (11 bones vs 17). applyPose null-guards missing bones
on both the VRM and procedural paths, so kicks/dtilt/fsmash pose without
throwing — their hitboxes are positional data and still resolve. The v0.7
plan (hitboxes generated from the live posed skeleton) will want a real
answer for legless kick visuals; for v1 it's visual-only.

### Hover locomotion (js/engine.js) — the Jigglypuff archetype
- Idle: gentle vertical bob (sin, ±0.06u) on the fighter root, applied in both
  syncRoot and the render-interpolation pass (the render pass overwrites
  root.position every frame, so visual-only offsets must ride along).
- Run → glide: no leg cycle; slight forward tilt + trailing bob while moving.
- Jumps are floaty: gravity ×0.55 airborne, fall-speed cap ×0.62, air drift
  ×1.15. Analytic fall time from jump apex: 1/√0.55 ≈ 1.35× biped.
- Double jump kept. Knockback, hitstun, shield, dodges, grabs — identical.

### WISP (js/fighters.js)
Built-in ghost fighter: rounded hovering body, little arms, no legs, gentle
bob. bodyType 'floater', runs the VOLT kit (16 wisp_-prefixed moves so the Lab
treats them as native). 3 fighters on the select screen now. Full theme /
alt-theme treatment like the others. (Caught in testing: buildWispRig placed
the arms on ±Z instead of ±X — the "right" arm sat behind the body and broke
hitbox sync; fixed.)

### Lab (js/lab.js)
Body-type badge per def ("BIPED (auto)" / "FLOATER (auto)" / "(override)") +
manual override dropdown (Auto / Biped / Floater), persisted per def as
smashvr_bodytype_<defId>. Override toggles locomotion without re-import;
def buttons are built from the live def list (was hardcoded ronin/volt).

### v0.6.1 VRM rest-pose fix (same day)
Joshua imported a real VRM: "its head was a little fucked up." Root cause
confirmed in the vendored three-vrm: resetNormalizedPose() restores each
bone's MODEL rest quaternion (generally non-identity — especially head/neck),
and applyPose then overwrote it absolutely with setFromEuler(). That worked
on the procedural rig (identity rests) but showed as a constant twist on real
VRMs, most visibly the head. Fix: capture each bone's post-reset rest
quaternion once per model (f._vrmRest, invalidated on attach/remove) and
apply every keyframe as rest * delta. Identity-rest rigs (procedural,
auto-rigged) are mathematically unchanged (rest*delta === delta). Node test
test/vrm_rest.mjs: 8/8 (30°-yaw head rest → world == rest*delta, not delta
alone, not double-applied, stable across frames, procedural path untouched,
re-attach picks up the new model's rests). Awaiting his retest with the same
VRM.

### Tests
- test/bodytype.mjs (new): 20/20 — ghost → floater/zero warnings/11 bones,
  robe → floater, biped → biped, full 3-fighter moveset poses on a legless rig
  without throwing, all hitboxes resolve positionally, wisp rig has no legs,
  createFighter wiring.
- test/vrm_rest.mjs (new): 8/8 (above).
- Full suite, no regressions: autorig 34/34, logic 14/14, playtest 19/19,
  feel_v02 11/11 (fixed a pre-existing flake: the KO camera check read the
  render-interpolated position, which trails the logical _camS.z by a frame —
  it now checks _camS.z), feel_v03 40/40, feel_v04 22/22, color_v03 27/27,
  hitbox_sync 383 samples / 0 out of sync, angle_bands all in band.
- Browser: WISP vs CPU played headless — hover bob measured (±0.06), glide,
  floaty jump, took a hit (percent > 0), screenshot verify/wisp.png. Ghost GLB
  imported via the file picker → "Floater type detected — hover locomotion"
  toast + "Floater — hover locomotion (auto-detected)" badge.

### Honest gaps
- Kick moves on floaters look odd — no leg visuals, hitboxes still work
  (mechanical, positional). Visual only; v0.7's skeleton-driven hitboxes
  will need a real answer.
- WISP is VOLT's kit on a ghost body; some hitbox→limb sync is close to the
  0.6u threshold by construction (different proportions, same offsets).
- Floater + deep-A-pose import untested (arms-down ghosts); the shoulder
  anchor follows the detected arm height, should be fine, not verified.
- The rest-pose fix is verified against a mock; a real-VRM retest by Joshua
  is the ground truth.
- Audio: still never actually heard. CPU AI quality: still unevaluated.

## v0.6.2 hotfix — VRM attach "rig on top" bug (2026-10-14, commit fd41bbda)
Joshua's report: imported Mushy.vrm — "its head was a little fucked up" / "like there was a fucked up rig on top."
Root cause (verified against deployed v0.6 + his actual file): `createFighter` set `root: rig.group`
(the SAME object). `attachVRMToFighter` hid `f.rig.group`, but `anim.js`'s respawn-blink line
(`f.root.visible = ...`) runs EVERY frame and re-showed it — procedural rig rendered on top of the VRM.
Fix: `createFighter` now wraps the rig in its own root `THREE.Group`; attach hides `rig.group` only,
blink toggles the wrapper. Verified: Mushy in-game, `rigVisible:false`, VRM alone on screen, zero errors.
Lesson: the auto-rig/VRM browser tests never attached a REAL .vrm through the real UI flow —
the v0.5 agent tested the auto-rig path with a generated GLB, never the VRM path with rig hiding.


## v0.7 animation combat overhaul — "frames of perfection" (2026-10-14)
Joshua's directive after v0.4: "work on the animation sets and connect the move animation
with the hitbox situation like legitimate combat gameplay... frames of perfection!"

### The core change: hitboxes GENERATED from the live skeleton
Old system: hitbox centers hand-placed per move (`h.dx/dy`), animation approximated them.
New system (`js/engine.js` `stepAttack`, `js/anim.js` `poseStrikeSkeleton` + `strikeTip`):
during active frames, each hitbox's center = the striking limb tip's world position, computed
from the actual posed bones that tick (root synced to this tick's physics first; the analytic
`attackPose` — identical to what the visual shows, no blend during attacks). The fist IS the
hitbox. Damage/angles/KB/frame data untouched; `h.dx/dy` now documents the design anchor and
serves as fallback if a bone is unavailable. `STRIKE_LIMB` (move → bone | `SPIN_FEET`) and
`FLOATER_LIMB` (leg → chest) live in `js/moves.js`, shared by engine + tests.

### Re-authored attacks: anticipation → strike → recovery
All 32 tracks (16 ronin + 16 volt; wisp clones volt) rebuilt on the SAME frame data:
coil key at `(startup-1)/total` (easeInOutSine wind-up from neutral), strike key EXACTLY at
`hit.from/total` (easeOutExpo snap, 1-tick), hold through active, settle to neutral
(easeOutCubic). Phase easing in `attackPose`; kill/strong punch-through moved to the strike
span. No crossfade during `attack` state (visual ≡ hitbox pose by construction); blends resume
on attack exit and all other transitions. Anchors nudged to honest tips (≤0.46u shifts;
spin/sweep anchors = foot at strike tick). Locomotion: run stride bob, jump launch extension.

### Floater kicks → body attacks (v0.6 honest gap, closed)
Wisp kick-family (ftilt/fsmash/fair/bair/uair/dair/dtilt/dspecial) re-authored as whole-body
slams/spins with new `WISP_*` poses; hitboxes generate from a new invisible `striker` bone at
the body's leading edge (uair uses `head`). Wisp gets independent anchors (deep-cloned hits).
Legless GLB imports map leg limbs → chest via `FLOATER_LIMB`.

### Tests
- `hitbox_sync`: 418 samples, 0 failures at 0.25u (was 383 @ 0.6u). Sweep attacks
  (ronin_dsmash, wisp_bair, wisp_dtilt) verified at strike tick — the hitbox legitimately
  sweeps during active.
- `anim_phases` (new): jab/fsmash/dair — anticipation opposes strike vector, snap velocity >
  coil/recovery, recovery returns. 9/9 PASS.
- Full suite green: 14/14 logic, 19/19 playtest, 11/11 feel_v02, 40/40 feel_v03,
  22/22 feel_v04, 27/27 color, 34/34 autorig, 20/20 bodytype, 8/8 vrm_rest,
  angle_bands, kb_scaling, 18/18 rebalance.

## v0.7 phase 2 — custom roster slots (2026-10-14)
Joshua: "we need like a new slot for the vrm characters as we add them instead of
attaching em to p1 ronin guy."

### Design
- `js/roster.js`: import → `custom_<sanitized>` def (`Mushy.vrm` → `MUSHY`), bodyType
  auto-detected (autorig) or biped (VRM), kit defaults to RONIN. Blob + metadata in
  IndexedDB (`smashvr`/`customFighters`); registry + select cards rebuild on boot.
  Re-import updates the slot. `getCharacterData` lazy-loads from the blob.
- Select: CUSTOM section under each side's cards (name, body-type tag, dashed swatch).
  Customs skip mirror-match alt themes (VRM never tinted); port rings + HUD colors apply.
- Fight start: each custom side's model attaches to its own fighter (`attachCustoms`);
  Lab body-type override still wins. `destroyGame` removes VRMs from both sides.
- Lab: customs get rename, kit swap (ronin/volt/wisp — clears move swaps), body-type
  override (existing), delete (card + IDB + Lab state). Move-swap treats the kit's moves
  as native; steals come from the kit's rival.
- v0.6.2 wrapper kept: `createFighter` root is a `THREE.Group` wrapping `rig.group`.

### Verification (node suites)
All 14 suites green (see v0.7 above). Browser verification (import Mushy.vrm + 2nd file,
custom-vs-custom, custom-vs-VOLT, wrapper holds, delete, reload persistence) pending —
requires live browser; flagged for follow-up.

### Honest gaps
- Wisp anchors deviate from volt's kick positions (≤0.87u on uair) — honest to the body,
  but a balance delta vs the v0.2-tuned kick placements. Worth a feel check.
- Roster: no model preview in Lab (procedural rig shown); import is title-screen only;
  custom-vs-custom mirror uses identical models (no alt).
- Audio never heard headless; CPU AI quality unevaluated (standing gaps).
