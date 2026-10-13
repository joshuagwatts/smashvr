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
