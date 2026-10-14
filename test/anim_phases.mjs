// test/anim_phases.mjs — v0.7: every attack must have 3 distinct phases.
// For jab, fsmash, dair (ronin): assert
//  1. anticipation: the striking tip displaces OPPOSITE the strike vector
//     during startup (coil), 
//  2. strike: peak tip velocity occurs at the snap into active frames,
//  3. recovery: the tip returns close to its rest position by move end.
// Fails if any phase is missing.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { buildProceduralRig } = await import(pathToFileURL(path.join(ROOT, 'js/rig.js')).href);
const { MOVES, STRIKE_LIMB } = await import(pathToFileURL(path.join(ROOT, 'js/moves.js')).href);
const { attackPose, poseStrikeSkeleton, strikeTip } = await import(pathToFileURL(path.join(ROOT, 'js/anim.js')).href);

let fails = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${detail}`);
  if (!ok) fails++;
};

function trajectory(move, limb, f) {
  const pts = [];
  for (let mf = 0; mf <= move.total; mf++) {
    poseStrikeSkeleton(f, attackPose(move, mf));
    const tip = strikeTip(f, limb, move.hits[0] || { dx: 0 });
    pts.push({ x: tip.x, y: tip.y });
  }
  return pts;
}

for (const slot of ['jab', 'fsmash', 'dair']) {
  const move = MOVES.ronin[slot];
  const limb = STRIKE_LIMB[move.id];
  const rig = buildProceduralRig({ primary: '#8a93a6', secondary: '#d44' }, 'ronin');
  const f = { rig, root: rig.group, bodyType: 'biped' };
  f.root.position.set(0, 0, 0); f.root.scale.set(1, 1, 1);
  const pts = trajectory(move, limb, f);
  const S = move.startup, A = move.active, T = move.total;
  const rest = pts[0], coil = pts[Math.max(0, S - 1)], strike = pts[S], end = pts[T];
  // strike vector: coil -> strike
  const svx = strike.x - coil.x, svy = strike.y - coil.y;
  const svLen = Math.hypot(svx, svy) || 1;
  const sx = svx / svLen, sy = svy / svLen;

  // 1. anticipation: max displacement opposite the strike vector during [1, S-1]
  let maxAgainst = 0;
  for (let t = 1; t < S; t++) {
    const dx = pts[t].x - rest.x, dy = pts[t].y - rest.y;
    maxAgainst = Math.max(maxAgainst, -(dx * sx + dy * sy));
  }
  check(`${slot}: anticipation displaces opposite strike vector`,
    maxAgainst > 0.08, `maxAgainst=${maxAgainst.toFixed(3)}u`);

  // 2. strike: peak tip velocity in the snap windows [from-2, from+2]
  const vel = (t) => Math.hypot(pts[t + 1].x - pts[t].x, pts[t + 1].y - pts[t].y);
  let vSnap = 0, vCoil = 0, vRec = 0;
  for (const h of move.hits)
    for (let t = Math.max(0, h.from - 2); t < Math.min(T, h.from + 2); t++)
      vSnap = Math.max(vSnap, vel(t));
  for (let t = 0; t < Math.max(1, S - 2); t++) vCoil = Math.max(vCoil, vel(t));
  const lastTo = Math.max(...move.hits.map((h) => h.to));
  for (let t = lastTo; t < T; t++) vRec = Math.max(vRec, vel(t));
  check(`${slot}: strike peak velocity at snap > coil and recovery`,
    vSnap > vCoil * 1.5 && vSnap > vRec * 1.5,
    `snap=${vSnap.toFixed(3)} coil=${vCoil.toFixed(3)} rec=${vRec.toFixed(3)} u/tick`);

  // 3. recovery: tip returns near rest by move end
  const strikeDist = Math.hypot(strike.x - rest.x, strike.y - rest.y);
  const endDist = Math.hypot(end.x - rest.x, end.y - rest.y);
  check(`${slot}: recovery returns toward rest`,
    endDist < strikeDist * 0.45, `end=${endDist.toFixed(3)}u strike=${strikeDist.toFixed(3)}u`);
}

if (fails) { console.log(`${fails} FAILURES`); process.exit(1); }
console.log('PASS');
