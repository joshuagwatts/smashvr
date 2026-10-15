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
    const { autoRigCharacterFile } = await import('./autorig.js');
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
    return { vrm, vrm0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function attachVRMToFighter(f, { vrm, vrm0, flip }) {
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
  vrm.scene.rotation.y = flip ? -Math.PI / 2 : Math.PI / 2; // VRM rest faces +Z -> face +X
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
