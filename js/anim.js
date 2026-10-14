// js/anim.js — per-frame fighter posing.
// Reads f.state/stateFrame/moveId/moveFrame/moves; interpolates move.anim
// keyframes during 'attack', otherwise plays locomotion poses.
// Adapter: procedural rig -> bone.rotation.set; VRM -> resetNormalizedPose +
// getNormalizedBoneNode quaternion (null-guarded), then vrm.update(dt).

import * as THREE from 'three';
import { BONE_NAMES, VRM_BONE_MAP } from './rig.js';
import { NEUTRAL_POSE, POSES } from './moves.js';

const _euler = new THREE.Euler();
const _delta = new THREE.Quaternion();

const lerp = (a, b, u) => a + (b - a) * u;
// v0.4: smoothstep easing for keyframe interpolation — poses accelerate out
// of and settle into each key instead of snapping linearly between them.
const sstep = (u) => u * u * (3 - 2 * u);

function basePose() {
  const out = {};
  for (const b of BONE_NAMES) out[b] = NEUTRAL_POSE[b] ? NEUTRAL_POSE[b].slice() : [0, 0, 0];
  return out;
}

// Interpolate a move's keyframe track at moveFrame/total.
// Exported for the hitbox-sync test (test/hitbox_sync.mjs).
// v0.4: eased (smoothstep) within each keyframe span instead of linear;
// kill/strong moves get a punch-through exaggeration on the final span
// (mid-span push past the linear path, landing exactly on the keyframes).
export function attackPose(move, moveFrame) {
  const keys = move.anim;
  const t = move.total > 0 ? Math.min(1, Math.max(0, moveFrame / move.total)) : 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const span = (k1.t - k0.t) || 1;
  const u = Math.min(1, Math.max(0, (t - k0.t) / span));
  let ue = sstep(u);
  const lastSpan = (i === keys.length - 2);
  if (lastSpan && (move.kbClass === 'kill' || move.kbClass === 'strong')) {
    ue = ue + Math.sin(ue * Math.PI) * 0.09;
  }
  const out = {};
  for (const b of BONE_NAMES) {
    const a = k0.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    const c = k1.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    out[b] = [lerp(a[0], c[0], ue), lerp(a[1], c[1], ue), lerp(a[2], c[2], ue)];
  }
  return out;
}

function locomotionPose(f, t) {
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
      break;
    }
    case 'jump': {
      P.upperLegR = [0, 0, 0.85]; P.lowerLegR = [0, 0, -1.8];
      P.upperLegL = [0, 0, 0.7]; P.lowerLegL = [0, 0, -1.6];
      P.upperArmR = [0, 0, 1.5]; P.upperArmL = [0, 0, -1.5];
      P.spine = [0, 0, -0.2];
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
  if (f.vrm && f.vrm.vrm && f.vrm.vrm.humanoid) {
    const humanoid = f.vrm.vrm.humanoid;
    humanoid.resetNormalizedPose();
    // v0.6.1: VRM bones — especially head/neck — have NON-identity rest
    // orientations after resetNormalizedPose() (three-vrm restores the
    // model's normalized rest pose, not identity). Our keyframes are deltas
    // from rest, so capture each bone's rest quaternion once and apply
    // rest * delta. The old absolute setFromEuler() wiped the rest pose and
    // showed up as a constant twist, most visibly on the head. For
    // identity-rest rigs (procedural, auto-rigged) rest*delta === delta,
    // so their behavior is unchanged.
    if (!f._vrmRest) {
      f._vrmRest = {};
      for (const b of BONE_NAMES) {
        const nd = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
        f._vrmRest[b] = nd ? nd.quaternion.clone() : null;
      }
    }
    for (const b of BONE_NAMES) {
      const e = eulerDict[b];
      if (!e) continue;
      const node = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      const rest = f._vrmRest[b];
      if (!node || !rest) continue; // optional bones may be missing
      _delta.setFromEuler(_euler.set(e[0], e[1], e[2]));
      node.quaternion.copy(rest).multiply(_delta);
    }
  } else if (f.rig) {
    for (const b of BONE_NAMES) {
      const e = eulerDict[b];
      if (!e || !f.rig.bones[b]) continue;
      f.rig.bones[b].rotation.set(e[0], e[1], e[2]);
    }
  }
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
  if (f._blendT < BLEND_TICKS) {
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
