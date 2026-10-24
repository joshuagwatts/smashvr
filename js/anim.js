// js/anim.js — per-frame fighter posing.
// Reads f.state/stateFrame/moveId/moveFrame/moves; interpolates move.anim
// keyframes during 'attack', otherwise plays locomotion poses.
// Adapter: procedural rig -> bone.rotation.set; VRM -> resetNormalizedPose +
// getNormalizedBoneNode quaternion (null-guarded), then vrm.update(dt).

import * as THREE from 'three';
import { BONE_NAMES, VRM_BONE_MAP } from './rig.js?v=44';
import { NEUTRAL_POSE, POSES, FLOATER_LIMB } from './moves.js?v=44';

const _euler = new THREE.Euler();
const _delta = new THREE.Quaternion();
const _stw = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _m1 = new THREE.Quaternion();

// v0.15: arm chains to normalize (T-pose/A-pose imports keep arms out).
const ARM_CHAINS = [
  ['upperArmL', 'lowerArmL', 'handL'],
  ['upperArmR', 'lowerArmR', 'handR'],
];
// v0.12: frame-correct VRM retargeting scratch.
const _parentW = new THREE.Quaternion();
const _plink = [];

const lerp = (a, b, u) => a + (b - a) * u;
// v0.4: smoothstep easing for keyframe interpolation — poses accelerate out
// of and settle into each key instead of snapping linearly between them.
const sstep = (u) => u * u * (3 - 2 * u);
// v0.7: phase-aware easing — the visual serves the frame data.
// coil: slow deliberate wind-up into anticipation.
// snap: explosive extension into the strike key (active-frame start).
// settle: soft return through recovery.
const easeInOutSine = (u) => -(Math.cos(Math.PI * u) - 1) / 2;
const easeOutExpo = (u) => (u >= 1 ? 1 : 1 - Math.pow(2, -10 * u));
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);

function basePose() {
  const out = {};
  for (const b of BONE_NAMES) out[b] = NEUTRAL_POSE[b] ? NEUTRAL_POSE[b].slice() : [0, 0, 0];
  return out;
}

// Interpolate a move's keyframe track at moveFrame/total.
// Exported for the hitbox-sync test (test/hitbox_sync.mjs) and the engine's
// skeleton-driven hitboxes.
// v0.7: phase-aware easing — the visual serves the frame data. The re-authored
// tracks place a keyframe exactly at every hit.from/total (the strike key).
// Spans ending at a strike key get an explosive snap; spans before startup
// coil deliberately; spans after the active window settle softly. Kill/strong
// moves keep the v0.4 punch-through exaggeration, now on the strike span
// where it belongs (was: last span).
export function attackPose(move, moveFrame) {
  const keys = move.anim;
  const t = move.total > 0 ? Math.min(1, Math.max(0, moveFrame / move.total)) : 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const span = (k1.t - k0.t) || 1;
  const u = Math.min(1, Math.max(0, (t - k0.t) / span));
  const startupT = move.startup / move.total;
  const strikeTimes = move.hits.length
    ? move.hits.map((h) => h.from / move.total)
    : [startupT]; // hitless specials (projectiles) still snap at startup
  const isStrike = strikeTimes.some((st) => Math.abs(k1.t - st) < 1e-9);
  let ue;
  if (isStrike) {
    ue = easeOutExpo(u);
    if (move.kbClass === 'kill' || move.kbClass === 'strong') {
      ue = ue + Math.sin(Math.min(1, ue) * Math.PI) * 0.09;
    }
  } else if (k1.t < startupT - 1e-9) {
    ue = easeInOutSine(u);
  } else {
    ue = easeOutCubic(u);
  }
  const out = {};
  for (const b of BONE_NAMES) {
    const a = k0.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    const c = k1.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    out[b] = [lerp(a[0], c[0], ue), lerp(a[1], c[1], ue), lerp(a[2], c[2], ue)];
  }
  return out;
}

// Exported for the rest×delta test (test/autorig.mjs) — the analytic idle
// pose the game layers onto a fighter.
export function locomotionPose(f, t) {
  // v0.6: floaters (ghosts/bugs) don't run — they glide. Hover bob is applied
  // to the root in engine.js; here: forward glide tilt, swept-back arms,
  // gentle idle sway. Missing leg bones are simply never posed (applyPose
  // null-guards). Other states fall through to the standard set, whose leg
  // references are skipped harmlessly on legless rigs.
  if (f.bodyType === 'floater') {
    const P = basePose();
    const sf = f.stateFrame || 0;
    switch (f.state) {
      case 'idle':
      case 'respawn': {
        const br = Math.sin(t * 2.6) * 0.05;
        P.spine = [0, 0, -0.06 + br];
        P.chest = [0, 0.1, -0.04 + br];
        P.head = [0, 0, 0.05 + Math.sin(t * 2.6 + 1) * 0.04];
        P.upperArmR = [0, 0, 0.75 + Math.sin(t * 2.6) * 0.08];
        P.upperArmL = [0, 0, -0.75 - Math.sin(t * 2.6) * 0.08];
        P.lowerArmR = [0, 0, 0.5];
        P.lowerArmL = [0, 0, -0.5];
        break;
      }
      case 'run': {
        // glide: leaned into the motion, arms trailed back, slight bob sync
        const lean = 0.30 + Math.sin(t * 7) * 0.02;
        P.spine = [0, 0, -lean];
        P.chest = [0, 0.08, -lean * 0.7];
        P.head = [0, 0, 0.18];
        P.upperArmR = [0, 0, -0.5 - Math.sin(t * 7) * 0.06];
        P.upperArmL = [0, 0, 0.5 + Math.sin(t * 7) * 0.06];
        P.lowerArmR = [0, 0, -0.9];
        P.lowerArmL = [0, 0, 0.9];
        break;
      }
      case 'jump': {
        P.upperArmR = [0, 0, 1.7]; P.upperArmL = [0, 0, -1.7];
        P.lowerArmR = [0, 0, 0.5]; P.lowerArmL = [0, 0, -0.5];
        P.spine = [0, 0, -0.12];
        P.head = [0, 0, -0.1];
        break;
      }
      case 'airdodge':
      case 'fall': {
        P.upperArmR = [0, 0, 2.2]; P.lowerArmR = [0, 0, 0.5];
        P.upperArmL = [0, 0, -2.2]; P.lowerArmL = [0, 0, -0.5];
        P.spine = [0, 0, 0.05];
        P.head = [0, 0, -0.12];
        break;
      }
      default:
        return locomotionPoseBiped(f, t);
    }
    return P;
  }
  return locomotionPoseBiped(f, t);
}

function locomotionPoseBiped(f, t) {
  const P = basePose();
  const sf = f.stateFrame || 0;
  switch (f.state) {
    case 'idle': {
      const br = Math.sin(t * 2.2) * 0.035;
      P.spine = [0, 0, -0.12 + br];
      P.chest = [0, 0.14, -0.08 + br];
      P.head = [0, 0, 0.08 + Math.sin(t * 2.2 + 1) * 0.025];
      P.upperArmR = [0, 0, 1.05 + Math.sin(t * 2.2) * 0.05];
      P.upperArmL = [0, 0, -0.95 - Math.sin(t * 2.2) * 0.05];
      break;
    }
    case 'run': {
      const ph = sf * 0.45;
      const s1 = Math.sin(ph), s2 = Math.sin(ph + Math.PI);
      P.upperLegR = [0, 0, 0.1 + s1 * 0.8];
      P.upperLegL = [0, 0, 0.1 + s2 * 0.8];
      P.lowerLegR = [0, 0, -(0.25 + 0.7 * Math.max(0, -s1))];
      P.lowerLegL = [0, 0, 0.25 + 0.7 * Math.max(0, -s2)];
      P.upperArmR = [0, 0, 0.9 + s2 * 0.55];
      P.upperArmL = [0, 0, -0.9 - s1 * 0.55];
      P.lowerArmR = [0, 0, 1.1];
      P.lowerArmL = [0, 0, -1.1];
      P.spine = [0, 0, -0.28];
      P.chest = [0, 0.1, -0.15];
      P.head = [0, 0, 0.15];
      // v0.7: stride-synced vertical bob + slight forward pump — the old
      // cycle floated without weight.
      P.hips = [0, 0, -Math.abs(Math.sin(ph)) * 0.05];
      break;
    }
    case 'jump': {
      // v0.7: launch extension — explode up out of the squat over the first
      // ticks, then tuck. Reads as a jump instead of a float.
      const ext = Math.max(0, 1 - sf / 5);
      P.upperLegR = [0, 0, 0.85 - ext * 1.0];
      P.lowerLegR = [0, 0, -1.8 + ext * 1.9];
      P.upperLegL = [0, 0, 0.7 - ext * 0.85];
      P.lowerLegL = [0, 0, -1.6 + ext * 1.7];
      P.upperArmR = [0, 0, 1.5 - ext * 0.6];
      P.upperArmL = [0, 0, -1.5 + ext * 0.6];
      P.spine = [0, 0, -0.2 + ext * 0.12];
      break;
    }
    case 'airdodge':
    case 'fall': {
      P.upperArmR = [0, 0, 2.3]; P.lowerArmR = [0, 0, 0.4];
      P.upperArmL = [0, 0, -2.3]; P.lowerArmL = [0, 0, -0.4];
      P.upperLegR = [0, 0, 0.35]; P.lowerLegR = [0, 0, -0.5];
      P.upperLegL = [0, 0, -0.25]; P.lowerLegL = [0, 0, 0.4];
      P.head = [0, 0, -0.15];
      break;
    }
    case 'squat':
    case 'landlag': // v0.40: landing reads as a low recovery crouch
    case 'crouch': {
      P.spine = [0, 0, -0.5];
      P.upperLegR = [0, 0, 0.95]; P.lowerLegR = [0, 0, -1.6];
      P.upperLegL = [0, 0, 0.95]; P.lowerLegL = [0, 0, -1.6];
      P.head = [0, 0, 0.28];
      break;
    }
    case 'shield': {
      P.upperArmR = [0, 0.2, 1.25]; P.lowerArmR = [0.4, 0, 1.7];
      P.upperArmL = [0, -0.2, -1.25]; P.lowerArmL = [-0.4, 0, -1.7];
      P.spine = [0, 0, -0.3];
      P.upperLegR = [0, 0, 0.5]; P.lowerLegR = [0, 0, -0.9];
      P.upperLegL = [0, 0, -0.4]; P.lowerLegL = [0, 0, 0.8];
      break;
    }
    case 'hitstun': {
      const w = sf * 0.55;
      P.upperArmR = [0, 0, 1.6 + Math.sin(w) * 0.9];
      P.upperArmL = [0, 0, -1.6 - Math.sin(w + 1) * 0.9];
      P.upperLegR = [0, 0, 0.4 + Math.sin(w + 2) * 0.5];
      P.upperLegL = [0, 0, -0.4 - Math.sin(w + 3) * 0.5];
      P.spine = [0, 0, 0.3];
      P.head = [0, 0, -0.4];
      break;
    }
    case 'helpless': {
      P.upperArmR = [0, 0, 1.7]; P.upperArmL = [0, 0, -1.7];
      P.upperLegR = [0, 0, 0.5]; P.upperLegL = [0, 0, -0.5];
      P.spine = [0, 0, 0.15]; P.head = [0, 0, -0.25];
      break;
    }
    case 'dead': {
      P.spine = [0, 0, -0.9];
      P.upperLegR = [0, 0, 1.2]; P.lowerLegR = [0, 0, -1.9];
      P.upperLegL = [0, 0, 0.9]; P.lowerLegL = [0, 0, -1.7];
      P.upperArmR = [0, 0, 0.6]; P.upperArmL = [0, 0, -0.6];
      P.head = [0, 0, -0.5];
      break;
    }
    // ---- v0.3 genre mechanics ----
    case 'charge': {
      // deep windup crouch, trembling harder the longer the charge holds
      P.spine = [0, 0, -0.55];
      P.upperLegR = [0, 0, 1.0]; P.lowerLegR = [0, 0, -1.7];
      P.upperLegL = [0, 0, 1.0]; P.lowerLegL = [0, 0, -1.7];
      P.upperArmR = [0, 0, -1.2]; P.lowerArmR = [0, 0, -0.8];
      P.upperArmL = [0, 0, 1.2]; P.lowerArmL = [0, 0, -1.2];
      P.head = [0, 0, 0.3];
      const tr = Math.sin(t * 42) * 0.025 * Math.min(1, (f._chargeT || 0) / 30);
      P.spine[2] += tr;
      break;
    }
    case 'grab':
      return Object.assign(basePose(), POSES.GRAB_ATTEMPT);
    case 'holding':
      return Object.assign(basePose(), POSES.HOLDING);
    case 'grabbed':
      return Object.assign(basePose(), POSES.GRABBED);
    case 'ledgeroll':
    case 'roll': {
      // tucked spin: hips rotate a full turn over the roll
      const u = Math.min(1, sf / 28);
      P.spine = [0, 0, -0.7];
      P.upperLegR = [0, 0, 1.3]; P.lowerLegR = [0, 0, -2.2];
      P.upperLegL = [0, 0, 1.3]; P.lowerLegL = [0, 0, -2.2];
      P.upperArmR = [0, 0, 0.5]; P.lowerArmR = [0, 0, 2.2];
      P.upperArmL = [0, 0, -0.5]; P.lowerArmL = [0, 0, -2.2];
      P.hips = [0, u * Math.PI * 2 * (f._rollDir || 1), 0];
      P.head = [0, 0, 0.4];
      break;
    }
    case 'spotdodge': {
      // crouch extra deep, arms tucked
      P.spine = [0, 0, -0.78];
      P.upperLegR = [0, 0, 1.25]; P.lowerLegR = [0, 0, -2.05];
      P.upperLegL = [0, 0, 1.25]; P.lowerLegL = [0, 0, -2.05];
      P.upperArmR = [0, 0, 0.3]; P.lowerArmR = [0, 0, 1.9];
      P.upperArmL = [0, 0, -0.3]; P.lowerArmL = [0, 0, -1.9];
      P.head = [0, 0, 0.42];
      break;
    }
    case 'ledge': {
      // hanging off the edge, arms up gripping
      P.upperArmR = [0, 0, 2.9]; P.lowerArmR = [0, 0, 0.3];
      P.upperArmL = [0, 0, 2.9]; P.lowerArmL = [0, 0, 0.3];
      P.spine = [0, 0, -0.15]; P.head = [0, 0, -0.3];
      P.upperLegR = [0, 0, 0.6]; P.lowerLegR = [0, 0, -1.0];
      P.upperLegL = [0, 0, 0.5]; P.lowerLegL = [0, 0, -0.9];
      break;
    }
    case 'ledgegetup': {
      // climbing over: deep crouch rising
      P.spine = [0, 0, -0.6];
      P.upperLegR = [0, 0, 1.1]; P.lowerLegR = [0, 0, -1.8];
      P.upperLegL = [0, 0, 0.9]; P.lowerLegL = [0, 0, -1.6];
      P.upperArmR = [0, 0, 2.4]; P.lowerArmR = [0, 0, 0.4];
      P.upperArmL = [0, 0, 2.2]; P.lowerArmL = [0, 0, 0.5];
      P.head = [0, 0, -0.2];
      break;
    }
    case 'ledgeattack':
      return Object.assign(basePose(), POSES.PUNCH_R);
    case 'tech': {
      // quick slap-down getup
      P.spine = [0, 0, -0.65];
      P.upperLegR = [0, 0, 1.15]; P.lowerLegR = [0, 0, -1.9];
      P.upperLegL = [0, 0, 1.15]; P.lowerLegL = [0, 0, -1.9];
      P.upperArmR = [0, 0, 0.9]; P.upperArmL = [0, 0, -0.9];
      P.head = [0, 0, 0.35];
      break;
    }
    case 'misstech': {
      // flat on the back, vulnerable
      P.spine = [0, 0, -1.25];
      P.upperLegR = [0, 0, 1.5]; P.lowerLegR = [0, 0, -0.4];
      P.upperLegL = [0, 0, 1.5]; P.lowerLegL = [0, 0, -0.4];
      P.upperArmR = [0, 0, 0.4]; P.lowerArmR = [0, 0, 0.6];
      P.upperArmL = [0, 0, -0.4]; P.lowerArmL = [0, 0, -0.6];
      P.head = [0, 0, -0.6];
      break;
    }
    case 'respawn':
    default: {
      const br = Math.sin(t * 2.2) * 0.035;
      P.spine = [0, 0, -0.12 + br];
      P.chest = [0, 0.14, -0.08 + br];
      break;
    }
  }
  return P;
}

export function applyPose(f, eulerDict) {
  // v0.13.2: VRM via WORLD-DELTA. Pose the procedural rig, then for each VRM
  // bone: VRM_world = VRM_rest_world · (Proc_rest_world⁻¹ · Proc_posed_world).
  // This applies the procedural's world-space rotation delta to the VRM's
  // rest, preserving the VRM's natural bone roll (no twists).
  const doProcedural = () => {
    // v0.13.4: facing is a root mirror (scale.x = -1), which flips yaw.
    // The torso blade (chest toward camera) must counter-mirror so you see
    // the chest whether facing left or right — not the back.
    const mirrorYaw = f.facing < 0;
    const yawBones = { spine: 1, chest: 1, neck: 1, head: 1, hips: 1 };
    for (const b of BONE_NAMES) {
      const e = eulerDict[b];
      if (!e || !f.rig.bones[b]) continue;
      if (mirrorYaw && yawBones[b]) f.rig.bones[b].rotation.set(e[0], -e[1], e[2]);
      else f.rig.bones[b].rotation.set(e[0], e[1], e[2]);
    }
  };
  // Procedural rest world quats + bone dirs (captured once per fighter).
  function procRestWorld() {
    if (f._procRestW) return f._procRestW;
    const saved = {};
    for (const b of BONE_NAMES) {
      if (!f.rig.bones[b]) continue;
      saved[b] = f.rig.bones[b].quaternion.clone();
      f.rig.bones[b].quaternion.identity();
    }
    f.rig.group.updateMatrixWorld(true);
    const cache = { quat: {}, dir: {} };
    for (const b of BONE_NAMES) {
      if (!f.rig.bones[b]) continue;
      cache.quat[b] = new THREE.Quaternion();
      f.rig.bones[b].getWorldQuaternion(cache.quat[b]);
    }
    // v0.15: rest bone directions (bone -> child, world) for arm normalization.
    for (const [upper, lower, hand] of ARM_CHAINS) {
      for (const [bone, child] of [[upper, lower], [lower, hand]]) {
        if (!f.rig.bones[bone] || !f.rig.bones[child]) continue;
        f.rig.bones[bone].getWorldPosition(_v1);
        f.rig.bones[child].getWorldPosition(_v2);
        cache.dir[bone] = _v2.sub(_v1).normalize().clone();
      }
    }
    for (const b of BONE_NAMES) {
      if (saved[b]) f.rig.bones[b].quaternion.copy(saved[b]);
    }
    f._procRestW = cache;
    return cache;
  }
  // v0.15: rotate a VRM arm bone so its rest direction matches the
  // procedural's (hanging). Pure swing (shortest arc), preserves twist.
  function normalizeVrmArm(humanoid, bone, child, procDir) {
    const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[bone]);
    const vc = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[child]);
    if (!vb || !vc || !procDir) return;
    vb.getWorldPosition(_v1);
    vc.getWorldPosition(_v2);
    _v3.copy(_v2).sub(_v1);
    if (_v3.lengthSq() < 1e-10) return;
    _v3.normalize();
    _m1.setFromUnitVectors(_v3, procDir); // swing only
    if (Math.abs(_m1.w - 1) < 1e-6) return; // already aligned
    vb.parent.getWorldQuaternion(_q2); // P
    _q1.copy(vb.quaternion); // save L_old (must not clobber before use)
    // L_new = P^-1 * M * P * L_old
    vb.quaternion.copy(_q2).invert().multiply(_m1).multiply(_q2).multiply(_q1);
  }
  if (f.vrm && f.vrm.vrm && f.vrm.vrm.humanoid) {
    const humanoid = f.vrm.vrm.humanoid;
    if (!f.rig) return;
    const procRest = procRestWorld();
    // VRM rest world (after reset)
    humanoid.resetNormalizedPose();
    f.vrm.vrm.scene.updateMatrixWorld(true);
    // v0.15: normalize arm rest to the procedural's hanging arms, root-to-tip.
    // Without this, T-pose/A-pose imports keep their arms out and never take
    // the fighting stance — "more like Ronin" needs the same rest.
    for (const [upper, lower, hand] of ARM_CHAINS) {
      normalizeVrmArm(humanoid, upper, lower, procRest.dir[upper]);
      f.vrm.vrm.scene.updateMatrixWorld(true);
      normalizeVrmArm(humanoid, lower, hand, procRest.dir[lower]);
      f.vrm.vrm.scene.updateMatrixWorld(true);
    }
    const vrmRest = {};
    for (const b of BONE_NAMES) {
      const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      if (!vb) continue;
      vrmRest[b] = new THREE.Quaternion();
      vb.getWorldQuaternion(vrmRest[b]);
    }
    // Pose procedural
    doProcedural();
    f.rig.group.updateMatrixWorld(true);
    // Apply world deltas
    for (const b of BONE_NAMES) {
      const vrmBone = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      const procBone = f.rig.bones[b];
      if (!vrmBone || !procBone || !procRest.quat[b] || !vrmRest[b]) continue;
      procBone.getWorldQuaternion(_q1); // proc posed world
      // D = procRest⁻¹ · procPosed (world-space delta)
      _q2.copy(procRest.quat[b]).invert().multiply(_q1);
      // VRM posed world = D · vrmRest (delta in WORLD frame, not local!)
      _q1.copy(_q2).multiply(vrmRest[b]);
      // Convert to local
      vrmBone.parent.getWorldQuaternion(_q2);
      vrmBone.quaternion.copy(_q2).invert().multiply(_q1);
    }
    f.vrm.vrm.scene.updateMatrixWorld(true);
  } else if (f.rig) {
    doProcedural();
  }
}

// v0.7: skeleton-driven hitboxes. Pose the fighter's bones with an analytic
// euler dict (no blending — the caller passes the exact pose the visual will
// show) and update world matrices so strikeTip() can read live positions.
// The engine calls this in stepAttack before the hit loop; the visual tick
// re-applies the identical pose right after (idempotent).
export function poseStrikeSkeleton(f, eulerDict) {
  applyPose(f, eulerDict);
  if (f.root) f.root.updateMatrixWorld(true);
}

function boneWorld(f, bone) {
  if (f.rig && f.rig.bones[bone]) {
    f.rig.bones[bone].getWorldPosition(_stw);
    return { x: _stw.x, y: _stw.y };
  }
  if (f.vrm && f.vrm.vrm && f.vrm.vrm.humanoid) {
    const node = f.vrm.vrm.humanoid.getNormalizedBoneNode(VRM_BONE_MAP[bone]);
    if (!node) return null;
    node.getWorldPosition(_stw);
    return { x: _stw.x, y: _stw.y };
  }
  return null;
}

// v0.7: resolve which bone is the striking point for a hitbox.
// Floaters (no legs) redirect leg limbs to the torso — their kick-family
// moves are body attacks (v0.7 redesign). SPIN_FEET picks the currently
// front-most foot for +x hitboxes, back-most for -x.
export function resolveStrikeLimb(f, limbSpec) {
  if (f.bodyType === 'floater') {
    if (limbSpec === 'SPIN_FEET') return 'chest';
    return FLOATER_LIMB[limbSpec] || limbSpec;
  }
  return limbSpec;
}

// v0.7: the fist IS the hitbox — world position of the striking limb's tip,
// or null when the bone is unavailable (engine falls back to the design anchor).
export function strikeTip(f, limbSpec, hit) {
  let limb = resolveStrikeLimb(f, limbSpec);
  if (limb === 'SPIN_FEET') {
    const r = boneWorld(f, 'footR'), l = boneWorld(f, 'footL');
    if (!r || !l) return null;
    limb = (hit.dx >= 0) === (r.x >= l.x) ? 'footR' : 'footL';
  }
  return boneWorld(f, limb);
}

// v0.7: analytic euler dict for the ledge getup attack (same pose the
// locomotion system shows), so its hitbox can be skeleton-driven too.
export function ledgeAttackEuler() {
  return Object.assign(basePose(), POSES.PUNCH_R);
}

function lerpPose(a, b, u) {
  const out = {};
  for (const bn of BONE_NAMES) {
    const A = (a && a[bn]) || [0, 0, 0];
    const B = (b && b[bn]) || [0, 0, 0];
    out[bn] = [lerp(A[0], B[0], u), lerp(A[1], B[1], u), lerp(A[2], B[2], u)];
  }
  return out;
}

// v0.4: crossfade between states so fighters never pop between poses.
const BLEND_TICKS = 5;

export function tickFighterVisual(f, dt) {
  // Hitstop freezes the pose as well as the physics — the impact reads.
  if (f.hitPause > 0) return;
  // v0.4: per-fighter anim clock (was a shared global) so a frozen fighter
  // resumes its own cycle phase instead of jumping to the global one.
  f._animT = (f._animT || 0) + dt;
  const key = f.state + '|' + (f.moveId || '');
  let target;
  if (f.state === 'attack' && f.moveId && f.moves[f.moveId]) {
    target = attackPose(f.moves[f.moveId], f.moveFrame || 0);
  } else {
    target = locomotionPose(f, f._animT);
  }
  let pose = target;
  if (f._animKey !== key) {
    f._blendFrom = f._animPose || target;
    f._blendT = 0;
    f._animKey = key;
  }
  // v0.7: no crossfade DURING attacks. The re-authored anticipation keyframes
  // start at neutral and ARE the transition; hitboxes are generated from this
  // exact analytic pose, so visual and hitbox can never diverge mid-attack.
  // (Attack exits and all other state changes still blend.)
  const inAttack = f.state === 'attack' && f.moveId && f.moves[f.moveId];
  if (!inAttack && f._blendT < BLEND_TICKS) {
    f._blendT++;
    pose = lerpPose(f._blendFrom, target, sstep(Math.min(1, f._blendT / BLEND_TICKS)));
  }
  f._animPose = pose;
  applyPose(f, pose);
  if (f.vrm && f.vrm.vrm) f.vrm.vrm.update(dt); // spring bones, etc.
  // Respawn invulnerability blink — only while respawning, so dodge/ledge
  // intangibility (which also uses invuln) doesn't strobe the fighter.
  if (f.root) f.root.visible = !(f.state === 'respawn' && f.invuln > 0 && Math.floor(f._animT * 12) % 2 === 1);
}

export function setFighterTheme(f, theme) {
  f.theme = { primary: theme.primary, secondary: theme.secondary };
  if (f.rig) f.rig.setTheme(f.theme);
}
