// js/archetype.js — v0.19: automatic character archetype detection for VRM imports.
// Measures the model's proportions and assigns a fighting style:
//   - big head -> headbutt-focused moves
//   - feminine build -> "valkyrie" style (fast, kick-focused)
//   - masculine fighter build -> "brawler" style (ronin kit, punch-focused)
//   - cartoony (big head + short) -> "silly" style (bouncy, exaggerated)

import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _box = new THREE.Box3();

// Measure the head's world-space size via skin weights (vertices mostly
// influenced by the head bone). Returns head height or 0 if undetectable.
// VRM HumanoidBoneName for analysis (not all are in VRM_BONE_MAP).
// Note: we use the clavicle shoulder bones (not upper arms) because upper
// arms swing with the rest pose (T-pose inflates the width). Clavicle/hip
// ratio is pose-invariant.
const VRM_BONES = {
  head: 'head',
  shoulderL: 'leftShoulder', shoulderR: 'rightShoulder',
  upperLegL: 'leftUpperLeg', upperLegR: 'rightUpperLeg',
};

function measureHead(vrm) {
  const humanoid = vrm.humanoid;
  if (!humanoid) return 0;
  // Use the RAW bone node — the normalized bone isn't in the SkinnedMesh skeletons.
  const headBone = humanoid.getRawBoneNode
    ? humanoid.getRawBoneNode(VRM_BONES.head)
    : humanoid.getNormalizedBoneNode(VRM_BONES.head);
  if (!headBone) return 0;

  let headBox = null;
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const geo = o.geometry;
    const skIdx = geo.getAttribute('skinIndex');
    const skWt = geo.getAttribute('skinWeight');
    const pos = geo.getAttribute('position');
    if (!skIdx || !skWt || !pos) return;
    // Find the bone index for the head bone in this mesh's skeleton.
    const bones = o.skeleton.bones;
    let headIdx = -1;
    for (let i = 0; i < bones.length; i++) {
      if (bones[i] === headBone) { headIdx = i; break; }
    }
    if (headIdx < 0) return;
    for (let vi = 0; vi < pos.count; vi++) {
      // Check if head bone is the dominant influence.
      let w = 0;
      for (let k = 0; k < 4; k++) {
        if (skIdx.getComponent(vi, k) === headIdx) {
          w = Math.max(w, skWt.getComponent(vi, k));
        }
      }
      if (w < 0.5) continue;
      _v1.fromBufferAttribute(pos, vi).applyMatrix4(o.matrixWorld);
      if (!headBox) headBox = new THREE.Box3();
      headBox.expandByPoint(_v1);
    }
  });
  if (!headBox) return 0;
  _v2.subVectors(headBox.max, headBox.min);
  return _v2.y; // head height in world units
}

function bonePos(humanoid, vrmBoneName, out) {
  const nd = humanoid.getNormalizedBoneNode(vrmBoneName);
  if (!nd) return null;
  nd.getWorldPosition(out);
  return out;
}

export function analyzeVRM(vrm) {
  const result = {
    height: 0,
    headRatio: 0,
    buildRatio: 1,
    bigHead: false,
    cartoon: false,
    build: 'neutral', // 'femme' | 'masc' | 'neutral'
    size: 'medium',   // 'small' | 'medium' | 'large'
  };
  if (!vrm || !vrm.humanoid) return result;

  // Total height from bounding box.
  vrm.scene.updateMatrixWorld(true);
  _box.setFromObject(vrm.scene);
  _v1.subVectors(_box.max, _box.min);
  result.height = _v1.y;
  if (result.height <= 0) return result;

  // Head ratio.
  const headH = measureHead(vrm);
  if (headH > 0) {
    result.headRatio = headH / result.height;
    result.bigHead = result.headRatio > 0.22;
  }

  // Build: shoulder width vs hip width.
  const humanoid = vrm.humanoid;
  const sL = bonePos(humanoid, VRM_BONES.shoulderL, new THREE.Vector3());
  const sR = bonePos(humanoid, VRM_BONES.shoulderR, new THREE.Vector3());
  const hL = bonePos(humanoid, VRM_BONES.upperLegL, new THREE.Vector3());
  const hR = bonePos(humanoid, VRM_BONES.upperLegR, new THREE.Vector3());
  if (sL && sR && hL && hR) {
    const sW = sL.distanceTo(sR);
    const hW = hL.distanceTo(hR);
    if (hW > 0.01) {
      result.buildRatio = sW / hW;
      // Clavicle/hip: femme < 0.65, masc > 0.90 (calibrated on Seed-san 0.48).
      if (result.buildRatio > 0.90) result.build = 'masc';
      else if (result.buildRatio < 0.65) result.build = 'femme';
    }
  }

  // Size (VRM units are meters; scale-invariant via attachVRMToFighter later,
  // but raw height still signals chibi vs realistic).
  if (result.height < 1.2) result.size = 'small';
  else if (result.height > 1.8) result.size = 'large';

  // Cartoon: big head + short stature = chibi; OR a huge head (>30%) is
  // cartoony at any height (e.g. Mushy: 39% head, 1.89m tall).
  result.cartoon = result.bigHead && (result.size === 'small' || result.headRatio > 0.30);

  return result;
}

// Map analysis to a fighting style. Returns { kit, style, headbutts, squashMul }.
export function assignStyle(a) {
  // Priority: cartoon > bigHead > build.
  if (a.cartoon) {
    return { kit: 'wisp', style: 'silly', headbutts: a.bigHead, squashMul: 1.6,
             label: 'Cartoony brawler' };
  }
  if (a.bigHead) {
    return { kit: 'ronin', style: 'brawler', headbutts: true, squashMul: 1.2,
             label: 'Big-head bruiser' };
  }
  if (a.build === 'femme') {
    return { kit: 'volt', style: 'valkyrie', headbutts: false, squashMul: 1.0,
             label: 'Valkyrie' };
  }
  if (a.build === 'masc') {
    return { kit: 'ronin', style: 'brawler', headbutts: false, squashMul: 1.0,
             label: 'Brawler' };
  }
  return { kit: 'ronin', style: 'brawler', headbutts: false, squashMul: 1.0,
           label: 'Brawler' };
}
