// js/anim.js — per-frame fighter posing.
// Reads f.state/stateFrame/moveId/moveFrame/moves; interpolates move.anim
// keyframes during 'attack', otherwise plays locomotion poses.
// Adapter: procedural rig -> bone.rotation.set; VRM -> resetNormalizedPose +
// getNormalizedBoneNode quaternion (null-guarded), then vrm.update(dt).

import * as THREE from 'three';
import { BONE_NAMES, VRM_BONE_MAP } from './rig.js';
import { NEUTRAL_POSE } from './moves.js';

const _euler = new THREE.Euler();
let _clock = 0;

const lerp = (a, b, u) => a + (b - a) * u;

function basePose() {
  const out = {};
  for (const b of BONE_NAMES) out[b] = NEUTRAL_POSE[b] ? NEUTRAL_POSE[b].slice() : [0, 0, 0];
  return out;
}

// Interpolate a move's keyframe track at moveFrame/total.
// Exported for the hitbox-sync test (test/hitbox_sync.mjs).
export function attackPose(move, moveFrame) {
  const keys = move.anim;
  const t = move.total > 0 ? Math.min(1, Math.max(0, moveFrame / move.total)) : 1;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const span = (k1.t - k0.t) || 1;
  const u = Math.min(1, Math.max(0, (t - k0.t) / span));
  const out = {};
  for (const b of BONE_NAMES) {
    const a = k0.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    const c = k1.bones[b] || NEUTRAL_POSE[b] || [0, 0, 0];
    out[b] = [lerp(a[0], c[0], u), lerp(a[1], c[1], u), lerp(a[2], c[2], u)];
  }
  return out;
}

function locomotionPose(f, t) {
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
    case 'fall': {
      P.upperArmR = [0, 0, 2.3]; P.lowerArmR = [0, 0, 0.4];
      P.upperArmL = [0, 0, -2.3]; P.lowerArmL = [0, 0, -0.4];
      P.upperLegR = [0, 0, 0.35]; P.lowerLegR = [0, 0, -0.5];
      P.upperLegL = [0, 0, -0.25]; P.lowerLegL = [0, 0, 0.4];
      P.head = [0, 0, -0.15];
      break;
    }
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
    for (const b of BONE_NAMES) {
      const e = eulerDict[b];
      if (!e) continue;
      const node = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      if (!node) continue; // optional bones may be missing
      node.quaternion.setFromEuler(_euler.set(e[0], e[1], e[2]));
    }
  } else if (f.rig) {
    for (const b of BONE_NAMES) {
      const e = eulerDict[b];
      if (!e || !f.rig.bones[b]) continue;
      f.rig.bones[b].rotation.set(e[0], e[1], e[2]);
    }
  }
}

export function tickFighterVisual(f, dt) {
  _clock += dt;
  let pose;
  if (f.state === 'attack' && f.moveId && f.moves[f.moveId]) {
    pose = attackPose(f.moves[f.moveId], f.moveFrame || 0);
  } else {
    pose = locomotionPose(f, _clock);
  }
  applyPose(f, pose);
  if (f.vrm && f.vrm.vrm) f.vrm.vrm.update(dt); // spring bones, etc.
  // Respawn invulnerability blink
  if (f.root) f.root.visible = !(f.invuln > 0 && Math.floor(_clock * 12) % 2 === 1);
}

export function setFighterTheme(f, theme) {
  f.theme = { primary: theme.primary, secondary: theme.secondary };
  if (f.rig) f.rig.setTheme(f.theme);
}
