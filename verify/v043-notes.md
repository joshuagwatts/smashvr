# SMASHVR ?v=43 notes — character import quality

## Baseline (recorded 2026-10-23 BEFORE any changes, tree == live ?v=42)
- autorig: 70 passed, 4 failed (PRE-EXISTING):
  1. v0.12 arm norm: A-45° idle arm matches procedural stance — 47.7°
  2. v0.12 arm norm: A-45° jab fist goes forward (+X) — (-0.67,-0.74,-0.00)
  3. v0.12 arm norm: T-pose idle arm matches procedural stance — 4.2°
  4. v0.12 arm norm: T-pose jab fist goes forward (+X) — (-1.00,-0.07,-0.00)
- moveset PASS, combo PASS, determinism 6/6, hitbox_sync PASS (712 samples),
  spectre PASS, touch_input 17/17, test_logic 14/14.

## Findings
- vrm.js attachVRMToFighter: rotation.y = flip ? -PI/2 : +PI/2 (assumes rest faces +Z).
  flip=true is exactly a +PI offset (3PI/2 == -PI/2), so a measured-yaw term can
  compose cleanly: rotY = PI/2 - faceYaw + (flip ? PI : 0). Callers: main.js:802,
  portrait.js:87, lab.js:475 — all pass {...data, flip: entry?.flip}.
- roster.js: records persist in IndexedDB ('smashvr'/'customFighters'). flip and
  styleOverride/setCustomStyle ALREADY exist (v0.19). importCharacter defaults
  flip=false; getCharacterData lazy-loads from blob (hook for legacy records).
- archetype.js: assignStyle -> {kit, style, headbutts, squashMul, label};
  styles: silly(wisp)/brawler(ronin)/valkyrie(volt); setCustomStyle adds bruiser.
  Engine consumes def.style in fighters.js createFighter (headbutt jab/fsmash
  swap + _squashMul) — portrait uses createFighter too (jab pose).
- LAB style picker ALREADY EXISTS (Auto/Brawler/Valkyrie/Silly/Bruiser) and
  persists. GAPS found for task (2):
  a) setCustomStyle never invalidates the cached portrait (IDB portrait +
     portrait.js portraitMemo) -> style change never updates the portrait.
  b) styleSel.onchange doesn't reset Lab kit state/renderAll -> move rows +
     kit select go stale after a style-driven kit swap.
  c) setCustomStyle('auto') on a GLB import (archetype=null) leaves the old
     override style stuck instead of reverting to default.
- autorig.js: fit assumes faces +Z (foot/toe segment extends +0.11H in z,
  "anatomical right is -X"). No toe bones in the fitted rig -> GLB facing must
  be detected from raw geometry and BAKED (rotate scene) before fitting.
- Tests stage rewritten copies into tmpdir; real .vrm files are only loaded in
  the browser harness (verify/, playwright-core + local http.server :8902).

## Plan
1. js/facing.js: detectFacingVRM (toes w3, eyes w2, head-geo w1.5, shoulder
   frame w1 tiebreak) + detectFacingScene (geometry toes/head for GLBs).
   yaw = atan2(V.x, V.z) of weighted unit vectors; snap to 90° multiples
   within 15°; low total weight -> yaw 0 (don't touch).
2. autorig: detect at top of autoRigScene, bake scene.rotation.y -= yaw,
   report autorig.facing {yawDeg, confidence}.
3. vrm.js attach: rotation.y = PI/2 - faceYaw + (flip ? PI : 0).
4. roster: rec.faceYaw (attach-time rad) + rec.faceDeg (display); detect at
   import; lazy-detect legacy records in getCharacterData (+ clear stale
   portrait); PORTRAIT_CACHE_V 2->3; setCustomStyle clears portrait + GLB
   auto fix.
5. portrait.js: export invalidatePortrait; pass faceYaw.
6. lab.js: pass faceYaw; style handler completes (kit reset + renderAll +
   portrait invalidate); facing badge next to pose badge.
7. main.js: pass faceYaw.

## ROOT CAUSE FOUND (bigger than the ask)
- Mushy.vrm is VRM0 (metaVersion '0'). VRM0 files face -Z in glTF space;
  VRMUtils.rotateVRM0 compensates by leaving scene.rotation.y = PI at load
  (verified: Mushy scene.rotation.y = 3.142 after loadVRMFile; world toes
  then read +Z). attachVRMToFighter OVERWROTE scene.rotation.y = PI/2,
  discarding that PI -> EVERY VRM0 import has faced backwards (-X) in-game.
  Screenshot proof: pre-fix "Mushy normal" panel showed his BACK (no face);
  post-fix shows face + gills. Cactus Boy is presumably VRM0 too.
- FIX (vrm.js): loadVRMFile captures baseYaw = scene.rotation.y after
  rotateVRM0 and returns it in the data record; attach composes
  rotation.y = baseYaw + PI/2 - faceYaw + (flip ? PI : 0). Idempotent
  across re-attaches (baseYaw stored on the record, not read live).
- Detector calibration on real files (verify/facing_check.mjs, ALL PASS):
  SeedSan + Mushy: as-loaded 0deg conf 1; baked 90/180/270 read exactly
  90/180/-90; corrected-180 toe dot(+X) = 1; uncorrected = -1 (bug repro);
  normal attach = 1 for both. Signals that fired: toes (w3) + shoulder
  frame (w1); eye bones absent on both test files, head-geo below threshold.
