/* test/hitbox_sync.mjs — Directive 1 (v0.2 feel pass).
   For EVERY move, sample EVERY active tick, pose the real procedural rig with
   the move's own keyframe track, and check each active hitbox's center against
   the striking limb's tip world position. FAIL if any is farther than 0.6u.
   Run: node test/hitbox_sync.mjs (from ~/workspace/smashvrm) */
import * as THREE from '../js/vendor/three.module.js';
import { buildProceduralRig } from '../js/rig.js';
import { MOVES } from '../js/moves.js';
import { attackPose } from '../js/anim.js';

// Striking limb per move (bone whose tip should sit inside the hitbox).
// Per-hitbox overrides: [hitboxIndex, boneName] for multi-hitbox moves.
// 'SPIN_FEET' = spin moves: each hitbox matches whichever foot is currently
// front-most (+x box) / back-most (-x box), since the feet trade sides mid-spin.
const LIMB = {
  ronin_jab: 'handR', ronin_ftilt: 'footR', ronin_utilt: 'handR',
  ronin_dtilt: 'footR', ronin_fsmash: 'handR', ronin_usmash: 'handR',
  ronin_dsmash: 'SPIN_FEET', ronin_nair: 'chest',
  ronin_fair: 'handR', ronin_bair: 'lowerArmR', ronin_uair: 'handR',
  ronin_dair: 'footR', ronin_sspecial: 'chest', ronin_uspecial: 'handR',
  ronin_dspecial: 'chest',
  volt_jab: 'handR', volt_ftilt: 'upperArmR', volt_utilt: 'handR',
  volt_dtilt: 'footR', volt_fsmash: 'footR', volt_usmash: 'handR',
  volt_dsmash: 'handR', volt_nair: 'chest',
  volt_fair: 'lowerLegR', volt_bair: 'footR', volt_uair: 'footR',
  volt_dair: 'footR', volt_nspecial: 'handR', volt_sspecial: 'chest',
  volt_uspecial: 'handR', volt_dspecial: 'footR',
  // v0.6: wisp runs the volt kit on a legless rig — same striking limbs;
  // moves whose limb bone is absent get a positional sanity check instead.
  wisp_jab: 'handR', wisp_ftilt: 'upperArmR', wisp_utilt: 'handR',
  wisp_dtilt: 'footR', wisp_fsmash: 'footR', wisp_usmash: 'handR',
  wisp_dsmash: 'handR', wisp_nair: 'chest',
  wisp_fair: 'lowerLegR', wisp_bair: 'footR', wisp_uair: 'footR',
  wisp_dair: 'footR', wisp_nspecial: 'handR', wisp_sspecial: 'chest',
  wisp_uspecial: 'handR', wisp_dspecial: 'footR',
};

const MAX_DIST = 0.6;
const _v = new THREE.Vector3();
let failures = 0, checked = 0;

for (const defId of Object.keys(MOVES)) {
  const theme = { primary: '#ffffff', secondary: '#888888' };
  const rig = buildProceduralRig(theme, defId);
  rig.group.position.set(0, 0, 0);
  rig.group.scale.set(1, 1, 1); // facing = +1
  for (const slot of Object.keys(MOVES[defId])) {
    const move = MOVES[defId][slot];
    const limbSpec = LIMB[move.id];
    if (!limbSpec || move.hits.length === 0) continue; // e.g. nspecial projectile
    let worst = 0, worstInfo = '';
    for (let mf = move.startup; mf < move.startup + move.active; mf++) {
      const pose = attackPose(move, mf);
      for (const b of Object.keys(rig.bones)) {
        const e = pose[b];
        if (e) rig.bones[b].rotation.set(e[0], e[1], e[2]);
      }
      rig.group.updateMatrixWorld(true);
      move.hits.forEach((h, hi) => {
        if (mf < h.from || mf > h.to) return;
        let boneName;
        if (limbSpec === 'SPIN_FEET') {
          // whichever foot is currently front-most matches the +x hitbox,
          // back-most matches the -x hitbox
          if (!rig.bones.footR || !rig.bones.footL) {
            // v0.6: legless rig (wisp) — no foot visuals; positional sanity only
            const sane = Math.abs(h.dx) < 3 && Math.abs(h.dy) < 3;
            checked++;
            if (!sane) { failures++; worstInfo = `tick ${mf} hit${hi} box(${h.dx},${h.dy}) off-fighter`; }
            return;
          }
          rig.bones.footR.getWorldPosition(_v);
          const rx = _v.x;
          rig.bones.footL.getWorldPosition(_v);
          const lx = _v.x;
          boneName = (h.dx >= 0) === (rx >= lx) ? 'footR' : 'footL';
        } else {
          boneName = Array.isArray(limbSpec) ? limbSpec[hi] : limbSpec;
        }
        const bone = rig.bones[boneName];
        if (!bone) {
          // v0.6: legless rig (wisp) — kicks/dtilt have no leg visuals but
          // their hitboxes are positional data; verify they stay on-fighter.
          const sane = Math.abs(h.dx) < 3 && Math.abs(h.dy) < 3;
          checked++;
          if (!sane) { failures++; worstInfo = `tick ${mf} hit${hi} box(${h.dx},${h.dy}) off-fighter (no ${boneName})`; }
          return;
        }
        bone.getWorldPosition(_v);
        // 2D screen-plane distance: the engine's hit detection (rectsOverlap)
        // is purely x/y, and the side camera renders the x/y projection.
        // (Spin moves yaw limbs out of plane in z; 3D distance would punish
        // what the player actually sees connecting.)
        const d = Math.hypot(_v.x - h.dx, _v.y - h.dy);
        checked++;
        if (d > worst) { worst = d; worstInfo = `tick ${mf} hit${hi} tip(${_v.x.toFixed(2)},${_v.y.toFixed(2)}) box(${h.dx},${h.dy})`; }
      });
    }
    const ok = worst <= MAX_DIST;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${move.id.padEnd(16)} worst=${worst.toFixed(3)}u  ${worstInfo}`);
  }
}
console.log(`\n${checked} hitbox-tick samples, ${failures} move(s) out of sync (> ${MAX_DIST}u)`);
process.exit(failures ? 1 : 0);
