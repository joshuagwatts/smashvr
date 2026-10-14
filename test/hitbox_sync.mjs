// test/hitbox_sync.mjs — v0.7: hitboxes are GENERATED from the live posed
// skeleton (the fist IS the hitbox). This test verifies the authored strike
// poses actually place the striking limb's tip on the design anchor, within
// 0.25u, at every active tick — a regression guard against pose drift.
// Sweep attacks (spinning limbs) are checked at the strike tick (h.from);
// their hitbox legitimately sweeps during active frames.
//
// Usage: node test/hitbox_sync.mjs
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TOL = 0.25;
// Sweep attacks: the striking point travels during active frames by design
// (the hitbox follows the sweep). Verified at the strike tick.
const SWEEP_IDS = new Set(['ronin_dsmash', 'wisp_bair', 'wisp_dtilt']);

const { buildProceduralRig } = await import(pathToFileURL(path.join(ROOT, 'js/rig.js')).href);
const { MOVES, STRIKE_LIMB } = await import(pathToFileURL(path.join(ROOT, 'js/moves.js')).href);
const { attackPose, poseStrikeSkeleton, strikeTip } = await import(pathToFileURL(path.join(ROOT, 'js/anim.js')).href);

let samples = 0, fails = 0;
const failLines = [];
for (const defId of Object.keys(MOVES)) {
  const rig = buildProceduralRig({ primary: '#8a93a6', secondary: '#d44' }, defId);
  const f = { rig, root: rig.group, bodyType: defId === 'wisp' ? 'floater' : 'biped', x: 0, y: 0, facing: 1 };
  f.root.position.set(0, 0, 0);
  f.root.scale.set(1, 1, 1);
  for (const slot of Object.keys(MOVES[defId])) {
    const move = MOVES[defId][slot];
    const limb = STRIKE_LIMB[move.id];
    if (!limb) { fails++; failLines.push(`FAIL ${move.id}: no STRIKE_LIMB entry`); continue; }
    for (const h of move.hits) {
      const sweep = SWEEP_IDS.has(move.id);
      const ticks = sweep ? [h.from] : Array.from({ length: h.to - h.from + 1 }, (_, k) => h.from + k);
      for (const mf of ticks) {
        samples++;
        poseStrikeSkeleton(f, attackPose(move, mf));
        const tip = strikeTip(f, limb, h);
        if (!tip) { fails++; failLines.push(`FAIL ${move.id} hit[${h.from}-${h.to}] tick ${mf}: null tip (limb=${limb})`); continue; }
        const d = Math.hypot(tip.x - h.dx, tip.y - h.dy);
        if (d > TOL) {
          fails++;
          failLines.push(`FAIL ${move.id} hit[${h.from}-${h.to}] tick ${mf}: tip(${tip.x.toFixed(2)},${tip.y.toFixed(2)}) vs anchor(${h.dx},${h.dy}) d=${d.toFixed(3)}u limb=${limb}${sweep ? ' [sweep]' : ''}`);
        }
      }
    }
  }
}
console.log(`hitbox_sync: ${samples} samples, ${fails} failures (tol ${TOL}u)`);
for (const l of failLines.slice(0, 20)) console.log(l);
if (fails) { console.log(`${fails} FAILURES`); process.exit(1); }
console.log('PASS');
