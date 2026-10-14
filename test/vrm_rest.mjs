// test/vrm_rest.mjs — v0.6.1 VRM rest-pose fix.
// A real VRM's bones (esp. head/neck) have NON-identity rest orientations
// after resetNormalizedPose(). applyPose must compose keyframes as
// rest * delta, never an absolute overwrite (the old absolute set() showed
// up as a constant head twist on Joshua's imported VRM).
//
// Verifies with a mock bone chain:
//  1. head bone with 30° yaw rest + head-turn pose -> world quat == rest*delta
//  2. NOT delta alone (the old buggy behavior)
//  3. NOT double-applied (rest*rest*delta)
//  4. procedural rig path unchanged (raw euler passed straight through)
//  5. identity-rest VRM (auto-rig adapter) behaves exactly like the old code

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ROOT = '/home/hatch/workspace/smashvrm';
const STAGE = path.join(os.tmpdir(), 'smashvrm-vrmrest-test');
const THREE_ABS = path.join(ROOT, 'js/vendor/three.module.js');

async function stage() {
  await fs.mkdir(STAGE, { recursive: true });
  const rw = (src, dst, extra = []) => fs.readFile(src, 'utf8').then((s) => {
    s = s.split("from 'three'").join(`from '${THREE_ABS}'`);
    for (const [a, b] of extra) s = s.split(a).join(b);
    return fs.writeFile(dst, s);
  });
  await rw(path.join(ROOT, 'js/rig.js'), path.join(STAGE, 'rig.js'));
  await rw(path.join(ROOT, 'js/budget.js'), path.join(STAGE, 'budget.js'));
  await rw(path.join(ROOT, 'js/moves.js'), path.join(STAGE, 'moves.js'), [
    ["from './budget.js'", `from '${path.join(STAGE, 'budget.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/anim.js'), path.join(STAGE, 'anim.js'), [
    ["from './rig.js'", `from '${path.join(STAGE, 'rig.js')}'`],
    ["from './moves.js'", `from '${path.join(STAGE, 'moves.js')}'`],
  ]);
}

await stage();
const THREE = await import(THREE_ABS);
const { applyPose } = await import(path.join(STAGE, 'anim.js'));
const { VRM_BONE_MAP } = await import(path.join(STAGE, 'rig.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};
const quatAngle = (a, b) => {
  // angle between two quaternions in radians
  const dot = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return 2 * Math.acos(Math.min(1, dot));
};

// ---- mock VRM humanoid: chest (identity rest) -> head (30° yaw rest) ----
function mockHumanoid(headRestEuler) {
  const chest = new THREE.Bone();
  const head = new THREE.Bone();
  const restQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...headRestEuler));
  head.quaternion.copy(restQ);
  chest.add(head);
  chest.updateMatrixWorld(true);
  const nodes = { chest, head };
  return {
    nodes,
    restQ: restQ.clone(),
    resetNormalizedPose() {
      head.quaternion.copy(restQ);
      chest.quaternion.identity();
    },
    getNormalizedBoneNode: (name) => nodes[name] || null,
  };
}

const HEAD_REST = [0, Math.PI / 6, 0]; // 30° yaw — like a real VRM head bone
const POSE_EULER = [0, 0, 0.5];        // head-turn keyframe from our pose data

// ---- 1-3: rest * delta semantics on a non-identity rest ----
{
  const humanoid = mockHumanoid(HEAD_REST);
  const f = { vrm: { vrm: { humanoid } }, _vrmRest: null };
  applyPose(f, { head: POSE_EULER });

  const restQ = humanoid.restQ.clone();
  const deltaQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...POSE_EULER));
  const expectWorld = restQ.clone().multiply(deltaQ); // chest rest is identity

  humanoid.nodes.chest.updateMatrixWorld(true);
  const actualWorld = new THREE.Quaternion();
  humanoid.nodes.head.getWorldQuaternion(actualWorld);

  ok('world orientation == rest * delta', quatAngle(actualWorld, expectWorld) < 1e-6,
    `angle=${quatAngle(actualWorld, expectWorld)}`);
  ok('NOT the old absolute-overwrite behavior (delta alone)',
    quatAngle(actualWorld, deltaQ) > 0.2, `angle=${quatAngle(actualWorld, deltaQ).toFixed(3)}`);
  const doubleApplied = restQ.clone().multiply(restQ).multiply(deltaQ);
  ok('NOT double-applied (rest*rest*delta)',
    quatAngle(actualWorld, doubleApplied) > 0.2, `angle=${quatAngle(actualWorld, doubleApplied).toFixed(3)}`);
  ok('rest cache captured once and reused',
    !!f._vrmRest && f._vrmRest.head && quatAngle(f._vrmRest.head, restQ) < 1e-9);
  // second frame: reset + re-apply must be stable (no drift/accumulation)
  applyPose(f, { head: POSE_EULER });
  humanoid.nodes.head.getWorldQuaternion(actualWorld);
  ok('stable across frames (no accumulation)', quatAngle(actualWorld, expectWorld) < 1e-6);
}

// ---- 4: procedural rig path unchanged ----
{
  const calls = {};
  const rig = {
    bones: {
      head: { rotation: { set: (x, y, z) => { calls.head = [x, y, z]; } } },
    },
  };
  applyPose({ rig }, { head: [0.1, 0.2, 0.3] });
  ok('procedural path passes raw euler through',
    calls.head && calls.head[0] === 0.1 && calls.head[1] === 0.2 && calls.head[2] === 0.3,
    JSON.stringify(calls.head));
}

// ---- 5: identity-rest VRM (auto-rig adapter) == old behavior ----
{
  const humanoid = mockHumanoid([0, 0, 0]); // identity rest, like the autorig adapter
  const f = { vrm: { vrm: { humanoid } }, _vrmRest: null };
  applyPose(f, { head: POSE_EULER });
  const deltaQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...POSE_EULER));
  humanoid.nodes.chest.updateMatrixWorld(true);
  const actualWorld = new THREE.Quaternion();
  humanoid.nodes.head.getWorldQuaternion(actualWorld);
  ok('identity rest: rest*delta === delta (no behavior change)',
    quatAngle(actualWorld, deltaQ) < 1e-9);
}

// ---- 6: stale cache invalidated across models (simulates re-attach) ----
{
  const h1 = mockHumanoid([0, Math.PI / 6, 0]);
  const f = { vrm: { vrm: { humanoid: h1 } }, _vrmRest: null };
  applyPose(f, { head: POSE_EULER });
  // swap model (vrm.js sets f._vrmRest = null on attach)
  const h2 = mockHumanoid([0, -Math.PI / 4, 0]);
  f.vrm.vrm.humanoid = h2;
  f._vrmRest = null;
  applyPose(f, { head: POSE_EULER });
  const rest2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 4, 0));
  const deltaQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(...POSE_EULER));
  const expectWorld = rest2.clone().multiply(deltaQ);
  h2.nodes.chest.updateMatrixWorld(true);
  const actualWorld = new THREE.Quaternion();
  h2.nodes.head.getWorldQuaternion(actualWorld);
  ok('re-attach uses the NEW model rest quats', quatAngle(actualWorld, expectWorld) < 1e-6);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
