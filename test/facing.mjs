// test/facing.mjs — v0.43 facing detection for auto-rigged GLB imports.
// A synthetic character WITH feet (toe boxes extending +Z) and a nose is
// exported facing forward / backwards / sideways; detectFacingScene must
// read 0 / 180 / 90, and autoRigScene must report the yaw AND bake it so
// the fitted rig lands in the same world place as the forward fit.
// Run: node test/facing.mjs (from ~/workspace/smashvrm)

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const ROOT = '/home/hatch/workspace/smashvrm';
const STAGE = path.join(os.tmpdir(), 'smashvrm-facing-test');
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
  await rw(path.join(ROOT, 'js/facing.js'), path.join(STAGE, 'facing.js'));
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
const { autoRigScene } = await import(path.join(STAGE, 'autorig.js'));
const { detectFacingScene } = await import(path.join(STAGE, 'facing.js'));
const { GLTFLoader } = await import(path.join(STAGE, 'addons/loaders/GLTFLoader.js'));
const { GLTFExporter } = await import(path.join(STAGE, 'addons/exporters/GLTFExporter.js'));

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

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};
const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const mat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.8 });
// Character facing +Z: foot boxes extend toward +Z from the ankle line,
// nose protrudes +Z. Legs end at the ankle (y~0.23) so the lowest band
// is pure foot, like a real model's geometry. yawDeg rotates the whole
// character before export. opts.bare strips feet + nose (nothing left
// that knows front from back).
function buildCharacter(yawDeg, opts = {}) {
  const inner = new THREE.Group();
  const add = (geo, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    inner.add(m);
    return m;
  };
  add(new THREE.BoxGeometry(0.36, 0.55, 0.22), 0, 0.98, 0);            // torso
  add(new THREE.SphereGeometry(0.13, 10, 8), 0, 1.48, 0);              // head
  if (!opts.bare) add(new THREE.BoxGeometry(0.08, 0.08, 0.14), 0, 1.47, 0.16); // nose (+Z)
  for (const s of [1, -1]) {                                           // arms (T)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), mat);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(s * 0.49, 1.28, 0);
    inner.add(arm);
  }
  for (const s of [1, -1]) {                                           // legs + feet
    add(new THREE.CapsuleGeometry(0.08, 0.42, 4, 10), s * 0.11, 0.52, 0);
    if (!opts.bare) add(new THREE.BoxGeometry(0.11, 0.08, 0.26), s * 0.11, 0.04, 0.05); // foot, toes +Z
  }
  const g = new THREE.Group();
  g.add(inner);
  g.rotation.y = yawDeg * Math.PI / 180;
  return g;
}

async function roundTrip(group) {
  const exporter = new GLTFExporter();
  const buf = await exporter.parseAsync(group, { binary: true });
  const loader = new GLTFLoader();
  return loader.parseAsync(buf, '');
}

function boneWorld(rec, name) {
  const n = rec.vrm.humanoid.getNormalizedBoneNode(name);
  if (!n) return null;
  rec.vrm.scene.updateMatrixWorld(true);
  return n.getWorldPosition(new THREE.Vector3());
}

// ---- detector readings ----
const cases = [
  ['forward', 0, 0],
  ['backwards', 180, 180],
  ['sideways', 90, 90],
];
const fits = {};
for (const [label, authored, expect] of cases) {
  const gltf = await roundTrip(buildCharacter(authored));
  const det = detectFacingScene(gltf.scene);
  ok(`${label}: detector reads ~${expect}`, angDiff(det.deg, expect) <= 15, `got ${det.deg}`);
  ok(`${label}: detector confident`, det.confidence >= 0.5, `got ${det.confidence}`);

  const gltf2 = await roundTrip(buildCharacter(authored));
  const rec = autoRigScene(gltf2.scene);
  fits[label] = rec;
  const rep = rec.autorig.facing ? rec.autorig.facing.yawDeg : null;
  ok(`${label}: autoRig reports facing ~${expect}`, rep != null && angDiff(rep, expect) <= 15, `got ${rep}`);
}

// ---- bake equivalence: after normalization the fitted rigs coincide ----
for (const label of ['backwards', 'sideways']) {
  for (const bone of ['hips', 'head', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot']) {
    const a = boneWorld(fits.forward, bone);
    const b = boneWorld(fits[label], bone);
    ok(`${label}: baked fit matches forward fit (${bone})`,
      !!a && !!b && a.distanceTo(b) < 0.06,
      a && b ? `dist ${a.distanceTo(b).toFixed(3)}` : 'missing bone');
  }
}

// ---- a character with NO feet direction info must not be "corrected" ----
{
  const gltf = await roundTrip(buildCharacter(180, { bare: true }));
  const det = detectFacingScene(gltf.scene);
  ok('featureless backwards model: detector abstains (yaw 0)', det.yaw === 0, `got ${det.deg}`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
