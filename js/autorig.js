// js/autorig.js — best-effort in-browser auto-rigger for static GLB/GLTF characters.
//
// Takes an unrigged character mesh in T-pose or A-pose, fits a humanoid
// skeleton to it by proportion, auto weight-paints the vertices onto the
// bones, and returns a pseudo-VRM record so the existing, already-verified
// VRM attach/pose/detach path (vrm.js + anim.js) works unchanged:
//
//   { vrm: { scene, humanoid: { getNormalizedBoneNode, resetNormalizedPose }, update },
//     vrm0: false,
//     autorig: { pose: 'T'|'A'|'?', warnings: [...], notice: '...', ok: bool } }
//
// HONEST LIMITS (v1):
// - T-pose / A-pose humanoids only. Anything else gets a warning and
//   best-effort output — proportions are heuristic, not magic.
// - Files that already contain a skeleton are REJECTED with a clear error
//   instead of producing garbage silently.
// - Weight painting is smooth distance-based skinning, not Mixamo quality.
//   It deforms sensibly; it will not win awards.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BONE_NAMES, VRM_BONE_MAP } from './rig.js';

// game bone -> VRM humanoid name, inverted for the adapter below
const BONE_OF_VRM_NAME = {};
for (const b of BONE_NAMES) BONE_OF_VRM_NAME[VRM_BONE_MAP[b]] = b;

export async function autoRigCharacterFile(file) {
  const loader = new GLTFLoader();
  const url = URL.createObjectURL(file);
  try {
    const gltf = await loader.loadAsync(url);
    return autoRigScene(gltf.scene);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function distPointSegmentSq(p, a, b) {
  // p, a, b are THREE.Vector3. Returns squared distance.
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 > 0 ? (apx * abx + apy * aby + apz * abz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}

export function autoRigScene(scene) {
  // ---- 1. reject already-rigged files (no silent garbage) ----
  let rigged = false;
  scene.traverse((o) => { if (o.isSkinnedMesh || o.isBone) rigged = true; });
  if (rigged) {
    throw new Error(
      'This file already contains a skeleton — auto-rig only handles static (unrigged) meshes. ' +
      'Rigged avatars go through the VRM import path.'
    );
  }

  scene.updateMatrixWorld(true);
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh && !o.isSkinnedMesh) meshes.push(o); });
  if (!meshes.length) throw new Error('No mesh geometry found in this file.');

  // ---- 2. measure ----
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const H = size.y;
  if (!(H > 0) || !isFinite(H)) throw new Error('Could not measure the character (empty bounds).');
  const minY = box.min.y;
  const Y = (f) => minY + f * H;

  // Flat vertex sample in model space (baked transforms).
  const VX = [], VY = [], VZ = [];
  const _v = new THREE.Vector3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
      VX.push(_v.x); VY.push(_v.y); VZ.push(_v.z);
    }
  }
  const n = VX.length;
  const band = (f0, f1, xMin) => {
    const out = [];
    const y0 = Y(f0), y1 = Y(f1);
    for (let i = 0; i < n; i++) {
      if (VY[i] >= y0 && VY[i] <= y1 && Math.abs(VX[i]) >= xMin) out.push(i);
    }
    return out;
  };

  // ---- 3. joint fitting ----
  const warnings = [];

  // ---- body-type detection (first: floaters use different proportion
  // windows below). Floaters (ghosts, bugs, robes) have no bilateral leg
  // mass in the lower region. First-class type, not a failure: clean
  // floaters get NO "missing legs" warning. Manual override lives in the Lab.
  let legL = 0, legR = 0;
  for (let i = 0; i < n; i++) {
    if (VY[i] < Y(0.45)) {
      if (VX[i] > 0.05 * H) legL++;
      else if (VX[i] < -0.05 * H) legR++;
    }
  }
  const bodyType = (legL >= 30 && legR >= 30) ? 'biped' : 'floater';
  const LEG_BONES = ['upperLegL', 'lowerLegL', 'footL', 'upperLegR', 'lowerLegR', 'footR'];
  const ACTIVE_BONES = bodyType === 'floater'
    ? BONE_NAMES.filter((b) => LEG_BONES.indexOf(b) < 0)
    : BONE_NAMES;

  // torso half-width via horizontal raycasts: cast ±x rays at several heights
  // in the 0.15-0.40H band (hip/upper-leg/robe region). Arm verts can never
  // reach this low — even arms hanging straight down bottom out at ~0.48H —
  // so the widest hit is always torso/hip/leg/robe, never an arm. The band
  // runs low enough to catch flared robe hems (whose torso can be wider
  // than the cone at hip height). Raycasts are tessellation-independent,
  // unlike vertex-band sampling which silently misses on low-poly meshes.
  scene.updateMatrixWorld(true);
  let tw = 0.13 * H;
  {
    const rc = new THREE.Raycaster();
    let mx = 0;
    for (let k = 0; k < 6; k++) {
      const y = Y(0.15 + 0.05 * k);
      for (const sgn of [1, -1]) {
        rc.set(new THREE.Vector3(sgn * 10 * H, y, 0), new THREE.Vector3(-sgn, 0, 0));
        const hits = rc.intersectObjects(scene.children, true);
        if (hits.length) {
          const ax = Math.abs(hits[0].point.x);
          if (ax > mx) mx = ax;
        }
      }
    }
    if (mx > 0) tw = Math.max(0.08 * H, mx);
  }

  // arm direction per side from the shoulder band (T-pose = along ±x,
  // A-pose = angled down-out, supported down to ~60° droop). Band extends
  // low enough to catch deep A-pose hands; the |x| cutoff keeps torso/leg
  // verts out. Model faces +Z, so anatomical right is -X.
  // v0.6: for floaters the shoulder anchor is the detected arm-centroid
  // height (their proportions don't follow the 0.80H humanoid rule).
  const shoulderY = Y(0.80);
  const armDir = {};
  const armShoulderY = {};
  let poseScore = 0, poseCount = 0;
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    const sx = sgn * tw;
    const idx = band(0.44, 0.88, tw * 1.05).filter((i) => VX[i] * sgn > 0);
    let dir;
    if (idx.length >= 12) {
      let cx = 0, cy = 0, cz = 0;
      for (const i of idx) { cx += VX[i]; cy += VY[i]; cz += VZ[i]; }
      cx /= idx.length; cy /= idx.length; cz /= idx.length;
      const sY = bodyType === 'floater' ? cy : shoulderY;
      armShoulderY[side] = sY;
      dir = new THREE.Vector3(cx - sx, cy - sY, cz - 0).normalize();
      poseScore += Math.abs(dir.y);
      poseCount++;
      // limb-shape check: a real arm is long and thin along dir; a blobby
      // cap of a non-humanoid mesh is roughly isotropic. Elongation ratio
      // (length along dir vs width across it) below ~2 means "not a limb".
      {
        let tMn = Infinity, tMx = -Infinity, uMx = 0;
        for (const i of idx) {
          const rx = VX[i] - sx, ry = VY[i] - sY, rz = VZ[i];
          const t = rx * dir.x + ry * dir.y + rz * dir.z;
          const px = rx - dir.x * t, py = ry - dir.y * t, pz = rz - dir.z * t;
          const u = Math.sqrt(px * px + py * py + pz * pz);
          if (t < tMn) tMn = t;
          if (t > tMx) tMx = t;
          if (u > uMx) uMx = u;
        }
        if ((tMx - tMn) / Math.max(1e-6, 2 * uMx) < 2.0) {
          warnings.push('the ' + (side === 'L' ? 'left' : 'right') + ' arm region is not limb-shaped — results may be janky');
        }
      }
    } else {
      warnings.push('arm not detected on the ' + (side === 'L' ? 'left' : 'right') + ' side — guessing');
      dir = new THREE.Vector3(sgn, -0.15, 0).normalize();
    }
    armDir[side] = dir;
  }
  const meanDroop = poseCount ? poseScore / poseCount : 0.15;
  // T < ~14° droop, A < ~67° droop (margin past 60° for noisy real meshes),
  // '?' beyond that (genuinely unusual).
  const pose = meanDroop < 0.25 ? 'T' : meanDroop < 0.92 ? 'A' : '?';
  if (pose === '?') warnings.push('arms point somewhere unexpected — assuming A-pose-ish');

  const J = {}; // joint positions, model space
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  J.hips = V3(0, Y(0.52), 0);
  J.spine = V3(0, Y(0.62), 0);
  J.chest = V3(0, Y(0.71), 0);
  J.neck = V3(0, Y(0.815), 0);
  J.head = V3(0, Y(0.875), 0);
  for (const side of ['L', 'R']) {
    const sgn = side === 'L' ? 1 : -1;
    // v0.6: floaters anchor shoulders at the detected arm height (their
    // proportions don't follow the humanoid 0.80H rule); bipeds use it.
    const sY = bodyType === 'floater' && armShoulderY[side] != null ? armShoulderY[side] : shoulderY;
    const S = V3(sgn * tw, sY, 0);
    const E = S.clone().addScaledVector(armDir[side], 0.17 * H);
    const W = E.clone().addScaledVector(armDir[side], 0.15 * H);
    J['upperArm' + side] = S;
    J['lowerArm' + side] = E;
    J['hand' + side] = W;
    J['upperLeg' + side] = V3(sgn * 0.095 * H, Y(0.52), 0);
    J['lowerLeg' + side] = V3(sgn * 0.10 * H, Y(0.28), 0);
    J['foot' + side] = V3(sgn * 0.10 * H, Y(0.075), 0);
  }

  // ---- 4. humanoid-likeness sanity checks (warnings, not blocks) ----
  // (full width is meaningless in T-pose — arm span ~= height — so check
  // torso slenderness and shoulder span instead)
  // v0.6: floaters get wider bounds — stubby ghost/bug bodies are normal,
  // not a humanoid-proportion failure.
  const torsoRatio = H / (2 * tw);
  const ratioLo = bodyType === 'floater' ? 1.5 : 3.0;
  const ratioHi = bodyType === 'floater' ? 7.0 : 6.5;
  if (torsoRatio < ratioLo || torsoRatio > ratioHi) warnings.push('torso proportions look off for a humanoid');
  {
    // shoulder span measured in the same wide band the arm detector uses —
    // drooped A-pose arms narrow the high band, so measure low and wide.
    // Deep A-pose (~60°) narrows span toward ~0.55H; allow down to 0.50H.
    // v0.6: floaters measured on compressed H can legitimately span wider.
    const idx = band(0.44, 0.88, 0);
    let mn = Infinity, mx = -Infinity;
    for (const i of idx) { if (VX[i] < mn) mn = VX[i]; if (VX[i] > mx) mx = VX[i]; }
    const span = mx - mn;
    const spanHi = bodyType === 'floater' ? 1.80 * H : 1.30 * H;
    if (span < 0.50 * H || span > spanHi) warnings.push('shoulder span is odd — arms may be misdetected');
  }
  {
    // v0.6: for bipeds this is a real warning; for floaters missing legs is
    // the expected condition (first-class type), so stay silent.
    if (bodyType === 'biped' && (legL < 30 || legR < 30)) warnings.push('could not find two legs');
  }
  {
    let c = 0;
    for (let i = 0; i < n; i++) if (VY[i] > Y(0.90)) c++;
    if (c < 20) warnings.push('could not find a head');
  }

  // ---- 5. build the bone hierarchy ----
  const bones = {};
  const mkBone = (name, parent, worldPos) => {
    const b = new THREE.Bone();
    b.name = name;
    if (parent) {
      const pp = new THREE.Vector3();
      parent.getWorldPosition(pp);
      b.position.copy(worldPos).sub(pp);
      parent.add(b);
    } else {
      b.position.copy(worldPos);
    }
    bones[name] = b;
    return b;
  };
  const hips = mkBone('hips', null, J.hips);
  const spine = mkBone('spine', hips, J.spine);
  const chest = mkBone('chest', spine, J.chest);
  const neck = mkBone('neck', chest, J.neck);
  mkBone('head', neck, J.head);
  for (const side of ['L', 'R']) {
    const ua = mkBone('upperArm' + side, chest, J['upperArm' + side]);
    const la = mkBone('lowerArm' + side, ua, J['lowerArm' + side]);
    mkBone('hand' + side, la, J['hand' + side]);
    // v0.6: floaters get no leg bones at all (cleaner than zero-length
    // stubs). anim.js / the adapter null-guard missing bones everywhere.
    if (bodyType === 'biped') {
      const ul = mkBone('upperLeg' + side, hips, J['upperLeg' + side]);
      const ll = mkBone('lowerLeg' + side, ul, J['lowerLeg' + side]);
      mkBone('foot' + side, ll, J['foot' + side]);
    }
  }

  const rigGroup = new THREE.Group();
  rigGroup.add(hips);
  rigGroup.updateMatrixWorld(true);

  // ---- 6. weight paint: smooth distance-to-bone-segment falloff ----
  // v0.6: boneList/boneIndex/adapter all run on ACTIVE_BONES so a legless
  // floater never leaves undefined holes in the skeleton.
  const boneList = ACTIVE_BONES.map((b) => bones[b]);
  const boneIndex = {};
  boneList.forEach((b, i) => { boneIndex[b.name] = i; });
  const bw = new THREE.Vector3(); // scratch
  const segOf = (boneName, a, b, rFrac) => {
    const bb = bones[boneName];
    bb.getWorldPosition(bw);
    return { bi: boneIndex[boneName], a: bw.clone(), b: b.clone(), r: rFrac * H };
  };
  const segs = [
    segOf('hips', null, J.spine, 0.16),
    segOf('spine', null, J.chest, 0.16),
    segOf('chest', null, J.neck, 0.17),
    segOf('neck', null, J.head, 0.08),
    segOf('head', null, J.head.clone().add(V3(0, 0.10 * H, 0)), 0.11),
  ];
  for (const side of ['L', 'R']) {
    const d = armDir[side];
    segs.push(segOf('upperArm' + side, null, J['lowerArm' + side], 0.075));
    segs.push(segOf('lowerArm' + side, null, J['hand' + side], 0.065));
    segs.push(segOf('hand' + side, null, J['hand' + side].clone().addScaledVector(d, 0.08 * H), 0.06));
    // v0.6: no leg segments for floaters — lower-body verts bind to
    // hips/spine instead, which is exactly right for a ghost/robe.
    if (bodyType === 'biped') {
      segs.push(segOf('upperLeg' + side, null, J['lowerLeg' + side], 0.09));
      segs.push(segOf('lowerLeg' + side, null, J['foot' + side], 0.075));
      segs.push(segOf('foot' + side, null, J['foot' + side].clone().add(V3(0, -0.03 * H, 0.11 * H)), 0.07));
    }
  }
  // NOTE: segOf ignores its `a` param and uses the bone's world position —
  // the joint position IS the bone position by construction.

  const skinned = [];
  const pv = new THREE.Vector3();
  for (const m of meshes) {
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    const p = geo.attributes.position;
    const count = p.count;
    const sIdx = new Uint16Array(count * 4);
    const sWt = new Float32Array(count * 4);
    const cand = [];
    for (let i = 0; i < count; i++) {
      pv.fromBufferAttribute(p, i);
      cand.length = 0;
      for (const s of segs) {
        const d2 = distPointSegmentSq(pv, s.a, s.b);
        const r = s.r;
        if (d2 < r * r) {
          const d = Math.sqrt(d2);
          const wgt = (1 - d / r);
          cand.push([s.bi, wgt * wgt]);
        }
      }
      cand.sort((x, y) => y[1] - x[1]);
      let picked = cand.slice(0, 4);
      if (!picked.length) {
        // degenerate: bind to the nearest segment outright
        let best = segs[0], bd = Infinity;
        for (const s of segs) {
          const d2 = distPointSegmentSq(pv, s.a, s.b);
          if (d2 < bd) { bd = d2; best = s; }
        }
        picked = [[best.bi, 1]];
      }
      let sum = 0;
      for (const pr of picked) sum += pr[1];
      for (let k = 0; k < 4; k++) {
        sIdx[i * 4 + k] = k < picked.length ? picked[k][0] : 0;
        sWt[i * 4 + k] = k < picked.length ? picked[k][1] / sum : 0;
      }
    }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(sIdx, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sWt, 4));
    const sk = new THREE.SkinnedMesh(geo, m.material);
    sk.castShadow = false;
    sk.frustumCulled = false; // skinned bounds aren't recomputed per-pose
    rigGroup.add(sk);
    skinned.push(sk);
  }

  const skeleton = new THREE.Skeleton(boneList);
  rigGroup.updateMatrixWorld(true);
  for (const sk of skinned) sk.bind(skeleton);

  // ---- 7. pseudo-VRM adapter: speaks the vrm.js / anim.js contract ----
  const byVrmName = {};
  for (const b of ACTIVE_BONES) byVrmName[VRM_BONE_MAP[b]] = bones[b];
  const humanoid = {
    getNormalizedBoneNode: (name) => byVrmName[name] || null,
    resetNormalizedPose: () => {
      for (const b of ACTIVE_BONES) bones[b].rotation.set(0, 0, 0);
    },
  };
  const vrm = { scene: rigGroup, humanoid, update: () => {} };

  const ok = warnings.length === 0;
  // v0.6: floaters get their own first-class notice (also the import toast).
  const notice = bodyType === 'floater'
    ? (ok ? 'Auto-rigged — Floater type detected — hover locomotion'
          : `Auto-rigged floater with warnings (${warnings[0]}${warnings.length > 1 ? `, +${warnings.length - 1} more` : ''}) — results may be janky`)
    : ok ? `Auto-rigged — arms detected: ${pose}-pose`
          : `Auto-rigged with warnings (${warnings[0]}${warnings.length > 1 ? `, +${warnings.length - 1} more` : ''}) — results may be janky`;

  return { vrm, vrm0: false, autorig: { pose, bodyType, warnings, notice, ok, boneCount: boneList.length } };
}
