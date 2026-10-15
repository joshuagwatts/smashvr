// test/vrm_rest.mjs — v0.13 VRM animation via procedural world-copy.
// VRM bones copy their procedural counterpart's WORLD orientation, so VRMs
// move exactly like the built-in fighters. No delta math, no rest caches.

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
  await rw(path.join(ROOT, 'js/moves.js'), path.join(STAGE, 'moves.js'));
  await rw(path.join(ROOT, 'js/anim.js'), path.join(STAGE, 'anim.js'));
  return STAGE;
}

let pass = 0, fail = 0;
function ok(name, cond, extra = '') {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name} ${extra}`); }
}
function quatAngle(a, b) {
  const dot = Math.abs(a.dot(b));
  return 2 * Math.acos(Math.min(1, dot));
}

const THREE = await import(THREE_ABS);
const STG = await stage();
const { applyPose } = await import(path.join(STG, 'anim.js'));
const { BONE_NAMES } = await import(path.join(STG, 'rig.js'));

// Mock: procedural rig bone + VRM bone, both under a root.
function mockFighter() {
  const root = new THREE.Group();
  // procedural rig
  const rigGroup = new THREE.Group(); root.add(rigGroup);
  const rigBones = {};
  const hips = new THREE.Bone(); hips.name = 'hips'; rigGroup.add(hips); rigBones.hips = hips;
  const chest = new THREE.Bone(); chest.name = 'chest'; chest.position.set(0, 0.5, 0); hips.add(chest); rigBones.chest = chest;
  const head = new THREE.Bone(); head.name = 'head'; head.position.set(0, 0.5, 0); chest.add(head); rigBones.head = head;
  // VRM scene (rotated +90° Y like the game does)
  const scene = new THREE.Group(); scene.rotation.y = Math.PI / 2; root.add(scene);
  const vHips = new THREE.Object3D(); vHips.name = 'hips'; scene.add(vHips);
  const vChest = new THREE.Object3D(); vChest.name = 'chest'; vChest.position.set(0, 0.5, 0); vHips.add(vChest);
  const vHead = new THREE.Object3D(); vHead.name = 'head'; vHead.position.set(0, 0.5, 0); vChest.add(vHead);
  // give the VRM head a non-identity rest orientation (like a real VRM)
  vHead.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 6, 0));
  const humanoid = {
    getNormalizedBoneNode: (n) => ({ hips: vHips, chest: vChest, head: vHead }[n] || null),
    resetNormalizedPose() {
      vHips.quaternion.identity(); vChest.quaternion.identity();
      vHead.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 6, 0));
    },
  };
  root.updateMatrixWorld(true);
  return {
    root, rig: { group: rigGroup, bones: rigBones },
    vrm: { vrm: { humanoid, scene } },
  };
}

// 1: VRM head world orientation matches procedural head world orientation.
{
  const f = mockFighter();
  applyPose(f, { head: [0, 0, 0.5] }); // head-turn
  f.root.updateMatrixWorld(true);
  const pq = new THREE.Quaternion(); f.rig.bones.head.getWorldQuaternion(pq);
  const vq = new THREE.Quaternion();
  f.vrm.vrm.humanoid.getNormalizedBoneNode('head').getWorldQuaternion(vq);
  ok('VRM head world == procedural head world', quatAngle(pq, vq) < 1e-6,
    `angle=${quatAngle(pq, vq)}`);
}

// 2: procedural rig still posed (not broken by VRM path).
{
  const f = mockFighter();
  applyPose(f, { chest: [0, 0, 0.3] });
  const e = new THREE.Euler().setFromQuaternion(f.rig.bones.chest.quaternion, 'XYZ');
  ok('procedural chest posed', Math.abs(e.z - 0.3) < 1e-6, `z=${e.z}`);
}

// 3: VRM with no procedural rig bone (missing) is skipped safely.
{
  const f = mockFighter();
  delete f.rig.bones.head;
  applyPose(f, { head: [0, 0, 0.5] }); // should not throw
  ok('missing procedural bone skipped', true);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
