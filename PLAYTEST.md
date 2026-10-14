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
