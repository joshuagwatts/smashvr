// js/vrm.js — user-supplied VRM avatar import.
// Accepts VRM 0.x and 1.0 (metaVersion check + rotateVRM0). Attaching hides the
// procedural rig, scales the model to ~1.7 units tall, and faces it +X like the
// procedural rig (VRM models face +Z at rest). Removing restores the rig.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

export async function loadVRMFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'glb' || ext === 'gltf') {
    // Auto-rig path: static character -> fitted humanoid skeleton.
    // Dynamic import keeps the rigger out of the boot bundle.
    const { autoRigCharacterFile } = await import('./autorig.js?v=44');
    return autoRigCharacterFile(file);
  }
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) throw new Error('No VRM data found in this file.');
    const vrm0 = !!(vrm.meta && vrm.meta.metaVersion === '0');
    if (vrm0) VRMUtils.rotateVRM0(vrm);
    // v0.43: rotateVRM0 leaves its compensation on scene.rotation.y (PI for
    // VRM0 — those files face -Z in glTF space). Capture it: attach must
    // COMPOSE with this base yaw, never overwrite it. Overwriting it is
    // exactly why every VRM0 import has faced backwards in-game.
    const baseYaw = vrm.scene.rotation.y || 0;
    return { vrm, vrm0, baseYaw };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function attachVRMToFighter(f, { vrm, vrm0, flip, faceYaw, baseYaw }) {
  removeVRMFromFighter(f); // clean slate
  if (f.rig && f.rig.group) f.rig.group.visible = false;

  // Scale to ~1.7 units tall, feet at y=0.
  const box = new THREE.Box3().setFromObject(vrm.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const h = size.y > 0 ? size.y : 1.7;
  const s = 1.7 / h;
  vrm.scene.scale.setScalar(s);
  // v0.12.2: flip turns a backward-authored model around (-90° instead of +90°).
  // v0.43: the rotation COMPOSES three terms instead of overwriting:
  //   baseYaw — load-time compensation (rotateVRM0's PI for VRM0 files;
  //             the pre-v0.43 code overwrote it, so every VRM0 import
  //             faced backwards — the "cactus boy" bug);
  //   faceYaw — the import-time measured deviation from facing +Z
  //             (js/facing.js), subtracted so off-axis models land on +X;
  //   flip    — the manual Lab toggle, a pure +180° offset
  //             (PI/2 + PI == -PI/2, identical to the old flip branch).
  // With baseYaw 0 and faceYaw 0/absent this reproduces the old rotations.
  vrm.scene.rotation.y = (baseYaw || 0) + Math.PI / 2 - (faceYaw || 0) + (flip ? Math.PI : 0); // VRM rest faces +Z -> face +X
  vrm.scene.position.set(0, -box.min.y * s, 0);

  f.root.add(vrm.scene);
  f.vrm = { vrm, vrm0: !!vrm0 };
  f._isVRM = true; // procedural theme recolors must never touch a VRM model
  // v0.6.1: drop any cached rest-pose quaternions — a new model has new rests
  f._vrmRest = null;
}

export function removeVRMFromFighter(f) {
  if (f.vrm && f.vrm.vrm && f.vrm.vrm.scene) {
    const sc = f.vrm.vrm.scene;
    if (sc.parent) sc.parent.remove(sc);
    sc.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          for (const k of Object.keys(m)) {
            const v = m[k];
            if (v && v.isTexture) v.dispose();
          }
          m.dispose();
        });
      }
    });
    f.vrm = null;
  }
  f._isVRM = false;
  f._vrmRest = null; // v0.6.1: rest cache belongs to the removed model
  if (f.rig && f.rig.group) f.rig.group.visible = true;
}
