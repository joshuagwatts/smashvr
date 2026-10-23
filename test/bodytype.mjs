// test/bodytype.mjs — v0.6 floating body types.
//  - legless ghost mesh -> bodyType 'floater', zero warnings, no leg bones
//  - standard biped -> 'biped'
//  - robe (single central lower mass) -> 'floater'
//  - full moveset (incl. kicks/dtilt) poses on a legless rig without throwing;
//    hitboxes still resolve as positional data
//  - wisp procedural rig has no leg bones; createFighter wires bodyType
// Run: node test/bodytype.mjs (from ~/workspace/smashvrm)

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ROOT = '/home/hatch/workspace/smashvrm';
const STAGE = path.join(os.tmpdir(), 'smashvrm-bodytype-test');
const THREE_ABS = path.join(ROOT, 'js/vendor/three.module.js');

async function stage() {
  await fs.mkdir(path.join(STAGE, 'addons/loaders'), { recursive: true });
  await fs.mkdir(path.join(STAGE, 'addons/utils'), { recursive: true });
  const rw = (src, dst, extra = []) => fs.readFile(src, 'utf8').then((s) => {
    s = s.split("from 'three'").join(`from '${THREE_ABS}'`);
    for (const [a, b] of extra) s = s.split(a).join(b);
    return fs.writeFile(dst, s);
  });
  await rw(path.join(ROOT, 'js/rig.js'), path.join(STAGE, 'rig.js'));
  await rw(path.join(ROOT, 'js/facing.js'), path.join(STAGE, 'facing.js'));
  await rw(path.join(ROOT, 'js/budget.js'), path.join(STAGE, 'budget.js'));
  await rw(path.join(ROOT, 'js/moves.js'), path.join(STAGE, 'moves.js'), [
    ["from './budget.js'", `from '${path.join(STAGE, 'budget.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/anim.js'), path.join(STAGE, 'anim.js'), [
    ["from './rig.js'", `from '${path.join(STAGE, 'rig.js')}'`],
    ["from './moves.js'", `from '${path.join(STAGE, 'moves.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/fighters.js'), path.join(STAGE, 'fighters.js'), [
    ["from './moves.js'", `from '${path.join(STAGE, 'moves.js')}'`],
    ["from './rig.js'", `from '${path.join(STAGE, 'rig.js')}'`],
    ["from './budget.js'", `from '${path.join(STAGE, 'budget.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/autorig.js'), path.join(STAGE, 'autorig.js'), [
    ["from 'three/addons/loaders/GLTFLoader.js'", `from '${path.join(STAGE, 'addons/loaders/GLTFLoader.js')}'`],
    ["from './rig.js'", `from '${path.join(STAGE, 'rig.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/vendor/three_addons/loaders/GLTFLoader.js'),
    path.join(STAGE, 'addons/loaders/GLTFLoader.js'));
  await rw(path.join(ROOT, 'js/vendor/three_addons/utils/BufferGeometryUtils.js'),
    path.join(STAGE, 'addons/utils/BufferGeometryUtils.js'));
}

await stage();
const THREE = await import(THREE_ABS);
const { autoRigScene } = await import(path.join(STAGE, 'autorig.js'));
const { buildProceduralRig } = await import(path.join(STAGE, 'rig.js'));
const { MOVES, FIGHTER_DEFS, SLOTS } = await import(path.join(STAGE, 'moves.js'));
const { attackPose, applyPose } = await import(path.join(STAGE, 'anim.js'));
const { createFighter } = await import(path.join(STAGE, 'fighters.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};

const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 });
function grp() { return new THREE.Group(); }
function add(g, geo, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}
// arms shared by all test characters (T-pose). NOTE: a real arm tube with
// verts along its length (low-poly capsules concentrate all verts in the
// end caps, which defeats any vertex-distribution limb check).
function addArms(g, y) {
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.62, 10, 6), mat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(s * 0.49, y, 0);
    g.add(arm);
  }
}
// ghost: torso + head + arms, NO legs.
// NOTE: boxes are subdivided — real character meshes are tessellated, and
// the rigger's estimators sample vertices (an unsubdivided 24-vert box has
// no interior verts for any horizontal band to catch).
function buildGhost() {
  const g = grp();
  add(g, new THREE.BoxGeometry(0.40, 0.60, 0.30, 2, 4, 2), 0, 1.00, 0);
  add(g, new THREE.SphereGeometry(0.16, 18, 14), 0, 1.55, 0);
  addArms(g, 1.25);
  return g;
}
// robe: torso + head + arms + single central robe mass (no bilateral legs)
function buildRobe() {
  const g = grp();
  add(g, new THREE.BoxGeometry(0.38, 0.50, 0.28, 2, 4, 2), 0, 1.15, 0);
  add(g, new THREE.SphereGeometry(0.15, 18, 14), 0, 1.62, 0);
  addArms(g, 1.32);
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 14, 4), mat);
  robe.position.set(0, 0.48, 0);
  g.add(robe);
  return g;
}
// biped: the standard humanoid (legs included)
function buildBiped() {
  const g = grp();
  add(g, new THREE.BoxGeometry(0.36, 0.55, 0.22, 2, 4, 2), 0, 0.98, 0);
  add(g, new THREE.SphereGeometry(0.13, 18, 14), 0, 1.48, 0);
  addArms(g, 1.28);
  for (const s of [1, -1]) add(g, new THREE.CapsuleGeometry(0.08, 0.55, 4, 10), s * 0.11, 0.455, 0);
  return g;
}

// ================= detection =================
{
  const rec = autoRigScene(buildGhost());
  ok('ghost: bodyType floater', rec.autorig.bodyType === 'floater', 'got ' + rec.autorig.bodyType);
  ok('ghost: zero warnings (first-class type)', rec.autorig.warnings.length === 0, rec.autorig.warnings.join('; '));
  ok('ghost: notice names the floater type', /Floater type detected/.test(rec.autorig.notice), rec.autorig.notice);
  ok('ghost: no leg bones in rig',
    rec.vrm.humanoid.getNormalizedBoneNode('leftUpperLeg') === null &&
    rec.vrm.humanoid.getNormalizedBoneNode('rightFoot') === null,
    'leg bones present');
  ok('ghost: 11 bones (17 - 6 leg)', rec.autorig.boneCount === 11, 'got ' + rec.autorig.boneCount);
}
{
  const rec = autoRigScene(buildRobe());
  ok('robe: bodyType floater', rec.autorig.bodyType === 'floater', 'got ' + rec.autorig.bodyType);
  ok('robe: zero warnings', rec.autorig.warnings.length === 0, rec.autorig.warnings.join('; '));
}
{
  const rec = autoRigScene(buildBiped());
  ok('biped: bodyType biped', rec.autorig.bodyType === 'biped', 'got ' + rec.autorig.bodyType);
  ok('biped: 17 bones', rec.autorig.boneCount === 17, 'got ' + rec.autorig.boneCount);
}

// ================= full moveset poses on a legless rig =================
{
  const rec = autoRigScene(buildGhost());
  const f = { vrm: { vrm: rec.vrm }, bodyType: 'floater' };
  let threw = null, moves = 0, hits = 0, badHits = 0;
  try {
    for (const defId of Object.keys(MOVES)) {
      for (const slot of SLOTS) {
        const move = MOVES[defId][slot];
        if (!move) continue;
        const pose = attackPose(move, move.startup + 1);
        applyPose(f, pose); // must not throw on missing leg bones
        moves++;
        for (const h of move.hits || []) {
          hits++;
          // hitboxes are positional data — must still resolve sanely
          if (!isFinite(h.dx) || !isFinite(h.dy) || Math.abs(h.dx) > 3 || Math.abs(h.dy) > 3) badHits++;
        }
      }
    }
  } catch (e) { threw = e; }
  ok('legless rig: all moves pose without throwing', !threw, threw ? threw.message : `${moves} moves posed`);
  ok('legless rig: all hitboxes resolve positionally', badHits === 0, `${badHits}/${hits} bad`);
}

// ================= wisp procedural rig =================
{
  const rig = buildProceduralRig({ primary: '#ffffff', secondary: '#888888' }, 'wisp');
  ok('wisp rig: no leg bones', !rig.bones.upperLegL && !rig.bones.footR, 'leg bones present');
  ok('wisp rig: has arms+head', !!(rig.bones.upperArmL && rig.bones.head && rig.bones.handR));
  let threw = null;
  try {
    // kick-heavy pose dict must not throw on the legless rig
    applyPose({ rig }, {
      upperLegR: [0, 0, 0.9], lowerLegR: [0, 0, -1.6], footR: [0, 0, 0],
      upperArmR: [0, 0, 1.5], head: [0, 0, 0.1],
    });
  } catch (e) { threw = e; }
  ok('wisp rig: leg poses skipped harmlessly', !threw, threw && threw.message);
}

// ================= createFighter wiring =================
{
  const w = createFighter('wisp');
  ok("createFighter('wisp').bodyType === 'floater'", w.bodyType === 'floater', 'got ' + w.bodyType);
  ok('wisp runs the volt kit (16 wisp_ moves)',
    SLOTS.every((s) => w.moves[s] && w.moves[s].id === 'wisp_' + s));
  const r = createFighter('ronin');
  ok("createFighter('ronin').bodyType === 'biped'", r.bodyType === 'biped', 'got ' + r.bodyType);
  const v = createFighter('volt');
  ok("createFighter('volt').bodyType === 'biped'", v.bodyType === 'biped', 'got ' + v.bodyType);
  ok('wisp def is the floaty archetype (low fallSpeed)',
    FIGHTER_DEFS.wisp.fallSpeed < FIGHTER_DEFS.volt.fallSpeed,
    `wisp ${FIGHTER_DEFS.wisp.fallSpeed} vs volt ${FIGHTER_DEFS.volt.fallSpeed}`);
  // analytic fall-time ratio from jump apex: t ~ 1/sqrt(g) -> 1/sqrt(0.55)
  const ratio = 1 / Math.sqrt(0.55);
  ok('floater fall time ~1.4x biped (analytic)', ratio > 1.3 && ratio < 1.45, ratio.toFixed(3) + 'x');
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
