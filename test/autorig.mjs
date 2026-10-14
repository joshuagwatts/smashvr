// test/autorig.mjs — auto-rigger verification (node, no renderer needed).
// Round trip: procedural T-pose primitive humanoid -> GLTFExporter -> GLTFLoader
// -> autoRigScene -> pose it -> assert the skin follows the bones.
// Also: A-pose variant, already-rigged rejection, non-humanoid warning path.
//
// The game sources import bare 'three' / 'three/addons/...' (browser importmap),
// so this test stages rewritten copies under os.tmpdir() before importing.

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ROOT = '/home/hatch/workspace/smashvrm';
const STAGE = path.join(os.tmpdir(), 'smashvrm-autorig-test');
const THREE_ABS = path.join(ROOT, 'js/vendor/three.module.js');

async function stage() {
  await fs.mkdir(path.join(STAGE, 'addons/loaders'), { recursive: true });
  await fs.mkdir(path.join(STAGE, 'addons/utils'), { recursive: true });
  await fs.mkdir(path.join(STAGE, 'addons/exporters'), { recursive: true });
  const rw = (src, dst, extra = []) => fs.readFile(src, 'utf8').then((s) => {
    s = s.split("from 'three'").join(`from '${THREE_ABS}'`);
    for (const [a, b] of extra) s = s.split(a).join(b);
    return fs.writeFile(dst, s);
  });
  await rw(path.join(ROOT, 'js/rig.js'), path.join(STAGE, 'rig.js'));
  await rw(path.join(ROOT, 'js/autorig.js'), path.join(STAGE, 'autorig.js'), [
    ["from 'three/addons/loaders/GLTFLoader.js'", `from '${path.join(STAGE, 'addons/loaders/GLTFLoader.js')}'`],
    ["from './rig.js'", `from '${path.join(STAGE, 'rig.js')}'`],
  ]);
  await rw(path.join(ROOT, 'js/vendor/three_addons/loaders/GLTFLoader.js'),
    path.join(STAGE, 'addons/loaders/GLTFLoader.js'));
  await rw(path.join(ROOT, 'js/vendor/three_addons/utils/BufferGeometryUtils.js'),
    path.join(STAGE, 'addons/utils/BufferGeometryUtils.js'));
  await rw(path.join(ROOT, 'js/vendor/three_addons/exporters/GLTFExporter.js'),
    path.join(STAGE, 'addons/exporters/GLTFExporter.js'));
}

await stage();
const THREE = await import(THREE_ABS);

// GLTFExporter assembles the .glb via FileReader (absent in node; the
// polyfill below only affects this test — browsers have FileReader natively).
if (typeof FileReader === 'undefined') {
  globalThis.FileReader = class {
    constructor() { this.result = null; this.onloadend = null; }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        if (this.onloadend) this.onloadend();
      });
    }
  };
}
const { autoRigScene } = await import(path.join(STAGE, 'autorig.js'));
const { GLTFLoader } = await import(path.join(STAGE, 'addons/loaders/GLTFLoader.js'));
const { GLTFExporter } = await import(path.join(STAGE, 'addons/exporters/GLTFExporter.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};

// ---- procedural character builder (faces +Z, feet near y=0.1) ----
function buildCharacter(armDroopDeg) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 });
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.36, 0.55, 0.22), 0, 0.98, 0);          // torso
  add(new THREE.SphereGeometry(0.13, 18, 14), 0, 1.48, 0);           // head
  for (const s of [1, -1]) {                                        // arms
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.18, 1.28, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), mat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(s * 0.31, 0, 0);
    pivot.add(arm);
    pivot.rotation.z = s * -armDroopDeg * Math.PI / 180;
    g.add(pivot);
  }
  for (const s of [1, -1])                                         // legs
    add(new THREE.CapsuleGeometry(0.08, 0.55, 4, 10), s * 0.11, 0.455, 0);
  return g;
}

async function roundTrip(group) {
  const exporter = new GLTFExporter();
  const buf = await exporter.parseAsync(group, { binary: true });
  const loader = new GLTFLoader();
  return loader.parseAsync(buf, '');
}

// skinned position of vertex vi of skinned mesh sk (bind-pose geometry space)
const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3();
function skinnedPoint(sk, vi) {
  const geo = sk.geometry, skel = sk.skeleton;
  _p.fromBufferAttribute(geo.attributes.position, vi);
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  _o.set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const bi = si.getComponent(vi, k), w = sw.getComponent(vi, k);
    if (!w) continue;
    _t.copy(_p).applyMatrix4(skel.boneInverses[bi]).applyMatrix4(skel.bones[bi].matrixWorld);
    _o.addScaledVector(_t, w);
  }
  return _o.clone();
}
function skinnedMeshes(scene) {
  const out = [];
  scene.traverse((o) => { if (o.isSkinnedMesh) out.push(o); });
  return out;
}
// mean displacement of vertices matching pred between bind pose and current pose
function meanDisplacement(scene, pred) {
  let sum = 0, cnt = 0;
  const cur = new THREE.Vector3(), base = new THREE.Vector3();
  for (const sk of skinnedMeshes(scene)) {
    const p = sk.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      base.fromBufferAttribute(p, i);
      if (!pred(base)) continue;
      cur.copy(skinnedPoint(sk, i));
      sum += cur.distanceTo(base);
      cnt++;
    }
  }
  return cnt ? sum / cnt : -1;
}
function setPoseZero(humanoid) { humanoid.resetNormalizedPose(); }

// ================= T-POSE =================
{
  const gltf = await roundTrip(buildCharacter(0));
  const rec = autoRigScene(gltf.scene);
  ok('T-pose: rigs without throwing', !!rec.vrm);
  ok('T-pose: pose classified as T', rec.autorig.pose === 'T', 'got ' + rec.autorig.pose);
  ok('T-pose: no warnings', rec.autorig.warnings.length === 0, rec.autorig.warnings.join('; '));
  ok('T-pose: 17 bones', rec.autorig.boneCount === 17, 'got ' + rec.autorig.boneCount);
  ok('T-pose: humanoid adapter maps VRM names',
    rec.vrm.humanoid.getNormalizedBoneNode('rightUpperArm') &&
    rec.vrm.humanoid.getNormalizedBoneNode('hips') &&
    rec.vrm.humanoid.getNormalizedBoneNode('leftFoot'));

  const scene = rec.vrm.scene;
  const bones = {};
  for (const b of ['hips', 'upperArmR', 'lowerLegR', 'head'])
    bones[b] = rec.vrm.humanoid.getNormalizedBoneNode(
      { hips: 'hips', upperArmR: 'rightUpperArm', lowerLegR: 'rightLowerLeg', head: 'head' }[b]);

  // right side must be -X in model space (faces +Z)
  const wp = new THREE.Vector3();
  bones.upperArmR.getWorldPosition(wp);
  ok('T-pose: anatomical right is -X', wp.x < 0, 'x=' + wp.x.toFixed(3));

  // bind sanity: zero pose -> skinned == original
  setPoseZero(rec.vrm.humanoid);
  scene.updateMatrixWorld(true);
  const bindErr = meanDisplacement(scene, () => true);
  ok('T-pose: bind pose is identity', bindErr < 1e-3, 'err=' + bindErr);

  // raise right arm -> hand verts move a lot, head verts stay
  bones.upperArmR.rotation.z = -1.2;
  scene.updateMatrixWorld(true);
  const handMove = meanDisplacement(scene, (v) => v.x < -0.42);
  const headMove = meanDisplacement(scene, (v) => v.y > 1.42);
  ok('T-pose: arm raise moves hand verts', handMove > 0.10, 'moved ' + handMove.toFixed(3));
  ok('T-pose: arm raise leaves head alone', headMove >= 0 && headMove < 0.02, 'moved ' + headMove.toFixed(4));

  // bend right knee -> shin verts (bottom cap ring) move, thigh verts (top cap) stay
  setPoseZero(rec.vrm.humanoid);
  bones.lowerLegR.rotation.x = -1.0;
  scene.updateMatrixWorld(true);
  const shinMove = meanDisplacement(scene, (v) => v.y > 0.10 && v.y < 0.20 && Math.abs(v.x) < 0.25 && v.x < 0);
  const thighMove = meanDisplacement(scene, (v) => v.y > 0.72 && v.y < 0.82 && Math.abs(v.x) < 0.25);
  ok('T-pose: knee bend moves shin verts', shinMove > 0.05, 'moved ' + shinMove.toFixed(3));
  ok('T-pose: knee bend leaves thigh alone', thighMove >= 0 && thighMove < 0.03, 'moved ' + thighMove.toFixed(4));
}

// ================= A-POSE (30° droop) =================
{
  const gltf = await roundTrip(buildCharacter(30));
  const rec = autoRigScene(gltf.scene);
  ok('A-pose: rigs without throwing', !!rec.vrm);
  ok('A-pose: pose classified as A', rec.autorig.pose === 'A', 'got ' + rec.autorig.pose);
  const scene = rec.vrm.scene;
  setPoseZero(rec.vrm.humanoid);
  scene.updateMatrixWorld(true);
  const armR = rec.vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
  armR.rotation.z = -1.2;
  scene.updateMatrixWorld(true);
  const handMove = meanDisplacement(scene, (v) => v.x < -0.40);
  const headMove = meanDisplacement(scene, (v) => v.y > 1.42);
  ok('A-pose: arm raise moves hand verts', handMove > 0.10, 'moved ' + handMove.toFixed(3));
  ok('A-pose: arm raise leaves head alone', headMove >= 0 && headMove < 0.02, 'moved ' + headMove.toFixed(4));
}

// ================= already-rigged rejection =================
{
  const g = buildCharacter(0);
  const bone = new THREE.Bone();
  g.add(bone);
  let threw = null;
  try { autoRigScene(g); } catch (e) { threw = e; }
  ok('rejects files that already contain a skeleton',
    threw && /already contains a skeleton/.test(threw.message), threw ? threw.message : 'no throw');
}

// ================= non-humanoid blob: warning path, no crash =================
{
  const g = new THREE.Group();
  const blob = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0xaa8833 })
  );
  blob.position.y = 0.8;
  g.add(blob);
  let rec = null, threw = null;
  try { rec = autoRigScene(g); } catch (e) { threw = e; }
  ok('blob: does not crash', !threw, threw ? threw.message : '');
  ok('blob: returns warnings', rec && rec.autorig.warnings.length > 0,
    rec ? rec.autorig.warnings.join('; ') : 'no record');
  ok('blob: notice is honest', rec && /may be janky/.test(rec.autorig.notice), rec && rec.autorig.notice);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
