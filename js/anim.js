// js/anim.js — per-frame fighter posing.
// Reads f.state/stateFrame/moveId/moveFrame/moves; interpolates move.anim
// keyframes during 'attack', otherwise plays locomotion poses.
// Adapter: procedural rig -> bone.rotation.set; VRM -> resetNormalizedPose +
// getNormalizedBoneNode quaternion (null-guarded), then vrm.update(dt).

import * as THREE from 'three';
import { BONE_NAMES, VRM_BONE_MAP, buildProceduralRig } from './rig.js?v=50';
import { NEUTRAL_POSE, POSES, FLOATER_LIMB } from './moves.js?v=50';

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
// v0.47: leg + spine chains get the same rest normalization as arms
// (pose-parity ANALYSIS Div #2) — authored knee bend / spine curl must not
// ride under every pose.
const LEG_CHAINS = [
  ['upperLegL', 'lowerLegL', 'footL'],
  ['upperLegR', 'lowerLegR', 'footR'],
];
const SPINE_CHAIN = ['hips', 'spine', 'chest', 'neck', 'head'];
const NORM_CHAINS = [...ARM_CHAINS, ...LEG_CHAINS, SPINE_CHAIN];
// v0.49: bone -> next-in-chain map for the rest-frame transplant.
const CHAIN_CHILD = {};
for (const chain of NORM_CHAINS) {
  for (let i = 0; i + 1 < chain.length; i++) CHAIN_CHILD[chain[i]] = chain[i + 1];
}
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
        // v0.45: rippling rise instead of a frozen ±1.7 pin.
        P.upperArmR = [0, 0, 1.7 + Math.sin(t * 4.6) * 0.16];
        P.upperArmL = [0, 0, -1.7 + Math.sin(t * 4.6 + 0.8) * 0.16];
        P.lowerArmR = [0, 0, 0.5 + Math.sin(t * 4.6 - 1.1) * 0.14];
        P.lowerArmL = [0, 0, -0.5 + Math.sin(t * 4.6 - 0.3) * 0.14];
        P.spine = [0, 0, -0.12];
        P.head = [0, 0, -0.1];
        break;
      }
      case 'airdodge':
      case 'fall': {
        // v0.45: gliding ripple, same language as the biped fall — both
        // arms stream back together and wave out of phase with fall
        // speed instead of a constant mirrored ±2.2 pin.
        const ramp = Math.min(1, sf / 10);
        const ease = ramp * ramp * (3 - 2 * ramp);
        const fiN = Math.min(1, Math.max(0, -(f.vy || 0)) / Math.max(0.03, (f.fallSpeed || 0.3) * 0.62));
        const freq = 4.8 + 3.2 * fiN;
        const amp = (0.15 + 0.22 * fiN) * (0.3 + 0.7 * ease);
        const sweep = -(1.50 + 0.60 * fiN);
        const trail = -0.20 - 0.20 * fiN;
        P.upperArmR = [0, 0, sweep + 0.14 + Math.sin(t * freq) * amp];
        P.lowerArmR = [0, 0, trail + Math.sin(t * freq - 1.15) * amp * 1.2];
        P.upperArmL = [0, 0, sweep - 0.14 + Math.sin(t * freq + 0.8) * amp];
        P.lowerArmL = [0, 0, trail + Math.sin(t * freq - 0.35) * amp * 1.2];
        P.spine = [0, 0, 0.05 + 0.04 * Math.sin(t * freq * 0.5)];
        P.head = [0, 0, -0.12 + 0.05 * Math.sin(t * freq * 0.5 + 1)];
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
      // v0.45: after the launch extension decays, the arms keep riding
      // the air — a soft ripple instead of freezing at ±1.5 all the way up.
      const jw = (1 - ext) * 0.15;
      P.upperArmR = [0, 0, 1.5 - ext * 0.6 + Math.sin(t * 4.6) * jw];
      P.upperArmL = [0, 0, -1.5 + ext * 0.6 + Math.sin(t * 4.6 + 0.8) * jw];
      P.lowerArmR = [0, 0, 0.3 * (1 - ext) + Math.sin(t * 4.6 - 1.1) * jw];
      P.lowerArmL = [0, 0, -0.3 * (1 - ext) + Math.sin(t * 4.6 - 0.3) * jw];
      P.spine = [0, 0, -0.2 + ext * 0.12];
      break;
    }
    case 'airdodge':
    case 'fall': {
      // v0.45: FLYING ARMS — was a constant ±2.3 mirrored pin: from the
      // game camera that draws one straight frozen line through the
      // shoulders (a T). Now BOTH arms stream back together like a
      // glider's swept wings (same-sign z — a deliberate break from the
      // mirrored stance convention), a ripple runs shoulder -> forearm,
      // the arms sit ~0.3 rad apart out of phase so they scissor instead
      // of locking, and the sweep presses harder + ripples faster the
      // faster the fall. sf ramps the gesture in (no snap on entry; the
      // state crossfade covers the exit).
      const ramp = Math.min(1, sf / 10);
      const ease = ramp * ramp * (3 - 2 * ramp);
      const fiN = Math.min(1, Math.max(0, -(f.vy || 0)) / Math.max(0.05, f.fallSpeed || 0.3));
      const sweep = -(1.55 + 0.55 * fiN); // negative z = swung back, up-streaming
      const freq = 5.2 + 3.8 * fiN;
      const amp = (0.17 + 0.27 * fiN) * (0.3 + 0.7 * ease);
      const splay = (0.10 + 0.16 * fiN) * ease;
      const trail = -0.22 - 0.22 * fiN; // forearm continues the sweep
      P.upperArmR = [-splay + 0.05 * Math.sin(t * freq * 0.5), 0, sweep + 0.16 + Math.sin(t * freq) * amp];
      P.upperArmL = [splay - 0.05 * Math.sin(t * freq * 0.5 + 0.8), 0, sweep - 0.16 + Math.sin(t * freq + 0.8) * amp];
      P.lowerArmR = [0, 0, trail + Math.sin(t * freq - 1.15) * amp * 1.25]; // forearm trails the wave
      P.lowerArmL = [0, 0, trail + Math.sin(t * freq - 0.35) * amp * 1.25];
      P.upperLegR = [0, 0, 0.32 + 0.13 * Math.sin(t * freq * 0.6 + 0.5)];
      P.lowerLegR = [0, 0, -0.48 + 0.16 * Math.sin(t * freq * 0.6 - 0.7)];
      P.upperLegL = [0, 0, -0.24 + 0.13 * Math.sin(t * freq * 0.6 + 2.3)];
      P.lowerLegL = [0, 0, 0.40 + 0.16 * Math.sin(t * freq * 0.6 + 1.1)];
      P.spine = [0, 0, 0.03 + 0.035 * Math.sin(t * freq * 0.5)];
      P.head = [0, 0, -0.15 + 0.05 * Math.sin(t * freq * 0.5 + 1)];
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
      // v0.45: helpless tumbles — arms flail wide and slow, out of phase,
      // legs paddle. Was a static ±1.7 pin.
      const w1 = Math.sin(t * 3.3), w2 = Math.sin(t * 3.3 + 1.4);
      P.upperArmR = [0.18 * w2, 0, 1.72 + 0.40 * w1];
      P.upperArmL = [-0.18 * w1, 0, -1.72 + 0.40 * w2];
      P.lowerArmR = [0, 0, 0.55 + 0.48 * Math.sin(t * 3.3 - 1.0)];
      P.lowerArmL = [0, 0, -0.55 + 0.48 * Math.sin(t * 3.3 + 0.4)];
      P.upperLegR = [0, 0, 0.5 + 0.24 * Math.sin(t * 2.6 + 1.0)];
      P.lowerLegR = [0, 0, -0.3 + 0.28 * Math.sin(t * 2.6 + 0.2)];
      P.upperLegL = [0, 0, -0.5 + 0.24 * Math.sin(t * 2.6 + 4.1)];
      P.lowerLegL = [0, 0, 0.3 + 0.28 * Math.sin(t * 2.6 + 3.3)];
      P.spine = [0, 0, 0.15 + 0.06 * Math.sin(t * 1.9)];
      P.head = [0, 0, -0.25 + 0.07 * Math.sin(t * 1.9 + 1)];
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

// v0.46: fighter-space ("chain") pose math. The engine mirrors the fighter
// root for facing (engine.js: root.scale.x = modScale * facing — a NEGATIVE
// determinant). THREE's getWorldQuaternion decomposes world matrices
// assuming proper rotations; under the mirror the extracted quaternions are
// reflection-contaminated, and composing world-space deltas from them
// twisted VRM skeletons whenever a fighter faced left (arms wrenched down,
// torso yawed sideways) — the procedural rig was immune because it is posed
// in local space. So all retargeting below composes LOCAL transforms up
// the chain to the fighter root and never reads a world matrix: the mirror
// applies to the finished pose at the root, exactly as for the rig.
// (Facing +1 numbers are unchanged: the root rotation is identity there,
// so chain space == the old world space.)
const _chainNodes = [];
const _cm = new THREE.Matrix4();
const _cm2 = new THREE.Matrix4();
function chainNodes(node, stop) {
  _chainNodes.length = 0;
  let n = node;
  while (n && n !== stop) { _chainNodes.push(n); n = n.parent; }
  return _chainNodes; // [node ... topChild] — consume immediately
}
function chainQuat(node, stop, out) {
  const arr = chainNodes(node, stop);
  out.identity();
  for (let i = arr.length - 1; i >= 0; i--) out.multiply(arr[i].quaternion);
  return out;
}
function chainPos(node, stop, out) {
  if (!node) return out.set(0, 0, 0);
  const arr = chainNodes(node, stop);
  _cm.identity();
  for (let i = arr.length - 1; i >= 0; i--) {
    const n = arr[i];
    _cm.multiply(_cm2.compose(n.position, n.quaternion, n.scale));
  }
  return out.setFromMatrixPosition(_cm);
}

// Pose a rig's bones from an euler dict (the procedural local-space path).
// mirrorYaw: facing is a root mirror, which flips yaw — the torso blade
// counter-mirrors so you see the chest whether facing left or right.
function poseRigLocals(rigBones, eulerDict, mirrorYaw) {
  const yawBones = { spine: 1, chest: 1, neck: 1, head: 1, hips: 1 };
  for (const b of BONE_NAMES) {
    const e = eulerDict[b];
    if (!e || !rigBones[b]) continue;
    if (mirrorYaw && yawBones[b]) rigBones[b].rotation.set(e[0], -e[1], e[2]);
    else rigBones[b].rotation.set(e[0], e[1], e[2]);
  }
}

// Capture a rig's rest (all-identity locals) chain quats + arm chain dirs,
// in fighter space. Rig locals are restored exactly as found.
const _rq = new THREE.Quaternion();
function restChain(rigBones, stop) {
  const saved = {};
  for (const b of BONE_NAMES) {
    if (!rigBones[b]) continue;
    saved[b] = rigBones[b].quaternion.clone();
    rigBones[b].quaternion.identity();
  }
  const cache = { quat: {}, dir: {}, ldir: {} };
  for (const b of BONE_NAMES) {
    if (!rigBones[b]) continue;
    cache.quat[b] = chainQuat(rigBones[b], stop, new THREE.Quaternion());
  }
  // rest bone directions (bone -> next-in-chain, fighter space) for rest
  // normalization (arms v0.15; legs + spine added v0.47)
  for (const chain of NORM_CHAINS) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const bone = chain[i], child = chain[i + 1];
      if (!rigBones[bone] || !rigBones[child]) continue;
      chainPos(rigBones[bone], stop, _v1);
      chainPos(rigBones[child], stop, _v2);
      cache.dir[bone] = _v2.sub(_v1).normalize().clone();
    }
  }
  // v0.49: the same segment direction expressed in the bone's OWN rest
  // frame (chain quat inverse applied) — the rig's bone-local convention,
  // which the VRM rest-frame transplant (below) aligns each model's
  // bone-local offset direction onto.
  for (const chain of NORM_CHAINS) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const bone = chain[i];
      if (!cache.dir[bone] || !cache.quat[bone]) continue;
      cache.ldir[bone] = cache.dir[bone].clone()
        .applyQuaternion(_rq.copy(cache.quat[bone]).invert());
    }
  }
  for (const b of BONE_NAMES) {
    if (saved[b]) rigBones[b].quaternion.copy(saved[b]);
  }
  return cache;
}

// v0.46: shared reference rig for VRM-only fighter records (no f.rig) —
// posing used to silently no-op without one (`if (!f.rig) return`), which
// is exactly what the v0.12 autorig tests construct: every pose came out as
// raw rest. The reference rig is posed with the same dict (nobody renders
// it) purely as the delta source.
let _refRig = null, _refRigVariant = null, _refRigRest = null;
function referenceRig(bodyType) {
  const variant = bodyType === 'floater' ? 'wisp' : 'ronin';
  if (!_refRig || _refRigVariant !== variant) {
    _refRig = buildProceduralRig({ primary: 0xffffff, secondary: 0xffffff }, variant);
    _refRigVariant = variant;
    _refRigRest = restChain(_refRig.bones, _refRig.group.parent);
  }
  return _refRig;
}

export function applyPose(f, eulerDict) {
  const doProcedural = () => {
    // v0.13.4: facing is a root mirror (scale.x = -1), which flips yaw.
    poseRigLocals(f.rig.bones, eulerDict, f.facing < 0);
  };
  // Procedural rest chain quats + bone dirs (captured once per fighter).
  function procRestChain() {
    if (f._procRestW) return f._procRestW;
    f._procRestW = restChain(f.rig.bones, f.rig.group.parent);
    return f._procRestW;
  }
  // v0.49: RONIN REST-FRAME TRANSPLANT — supersedes the v0.15 swing
  // normalization and the v0.47 rest flattening + arm-plane yaw. Joshua's
  // interim call: imports stop preserving their own rest character and
  // adopt Ronin's posing as the template, uniformly. For each chained
  // bone the transplant re-aims the model's rest segment direction onto
  // Ronin's (the joint layout becomes Ronin's, scaled only by the
  // model's own bone lengths), and the delta transfer below yields
  // posed segment directions identical to Ronin's in every state.
  // Endpoint bones (head/hands/feet) have no segment in the map: they
  // keep their authored local under the corrected parent frame, so
  // facing and toe/palm orientation ride the corrected skeleton.
  // v0.50: the correction is a fighter-space SWING on the model's OWN
  // rest frame: F = A · modelRest, A = shortest arc from the model's
  // fighter-space rest segment direction to Ronin's. v0.49 instead
  // installed the rig's frame (F = rigChain · C, C from bone-local
  // offset dirs): segment directions landed exact (0.00°) but each
  // frame's TWIST became the rig's — and the rig's twist convention
  // (bone frames face +Z while its body faces +X) differs from the
  // models' by ±90° of yaw in opposite directions (VRM0 Mushy vs VRM1
  // SeedSan), so the rendered bodies turned 90° off their facing:
  // Mushy's face pointed at the stage's back wall, SeedSan's at the
  // camera. The swing form keeps the parity identity the delta
  // transfer rests on (F · bone-local dir == Ronin's rest segment
  // direction) while the frame's own twist — where the face, palms
  // and toes point — stays the model's own.
  const _aq = new THREE.Quaternion(); // per-bone fighter-space swing A
  const _tq = new THREE.Quaternion(); // target rest frame F
  // v0.50 (arm clearance): the transplant hands every import Ronin's arm
  // DIRECTIONS, but the arm JOINTS stay the model's — and a model's mesh
  // can be wider than its skeleton. SeedSan: shoulder plane 0.141 from
  // the spine axis, torso silhouette flares to 0.172 at lower-chest
  // height (mesh-sampled) — his upper arms hang INSIDE the coat ("arms
  // go like in his body"). Ronin's shoulder plane (0.25) sits 0.025
  // OUTSIDE his torso surface (0.225) — that's the clearance the pose
  // was authored against. So for arm chains only, the rest target
  // direction gets an outward tilt about the facing axis, sized per
  // model from its own bind geometry: enough that the elbow regains
  // Ronin's +0.025 centerline margin past the model's widest torso
  // band. The gate is penetration: if the model's shoulder plane is
  // already outside its torso silhouette (Mushy: 0.168 vs 0.155), phi
  // stays 0 and the model is bit-identical to the un-biased transplant.
  // Legs/spine keep the exact v0.49 direction equality.
  const ARM_BIAS_BONES = { upperArmL: 'L', lowerArmL: 'L', upperArmR: 'R', lowerArmR: 'R' };
  const RIG_SHOULDER_MARGIN = 0.025; // Ronin: 0.25 shoulder plane - 0.225 torso surface
  const ARM_BIAS_MAX = 15 * Math.PI / 180;
  const _bq = new THREE.Quaternion(); // arm-bias rotation
  const _tv = new THREE.Vector3(); // biased target direction
  const _X_AXIS = new THREE.Vector3(1, 0, 0);
  // One-time per model (cached on f._armBias, dropped with the model in
  // vrm.js). mPos = normalized-bone rest positions in fighter space,
  // captured by forceRoninRestFrame at resetNormalizedPose.
  function armBiasFor(f, humanoid, stopV, mPos) {
    if (f._armBias) return f._armBias;
    const bias = { phi: 0, sign: { L: 0, R: 0 } };
    f._armBias = bias; // any failure below leaves phi 0 (un-biased)
    if (!mPos.spine || !mPos.neck || !mPos.chest || !mPos.upperArmL || !mPos.upperArmR ||
        !mPos.lowerArmL || !mPos.lowerArmR) return bias;
    const spineP = mPos.spine, neckP = mPos.neck, chestP = mPos.chest;
    const axis = new THREE.Vector3().subVectors(neckP, spineP);
    const torsoLen = axis.length();
    if (torsoLen < 1e-6) return bias;
    axis.divideScalar(torsoLen);
    const latAxis = new THREE.Vector3().subVectors(mPos.upperArmL, mPos.upperArmR);
    if (latAxis.lengthSq() < 1e-10) latAxis.set(0, 0, 1); else latAxis.normalize();
    let shLat = 0, upperLen = 0;
    for (const side of ['L', 'R']) {
      const sh = mPos['upperArm' + side];
      shLat += Math.abs(new THREE.Vector3().subVectors(sh, chestP).dot(latAxis));
      upperLen += mPos['lowerArm' + side].distanceTo(sh);
      bias.sign[side] = Math.sign(new THREE.Vector3().subVectors(sh, chestP).z);
    }
    shLat /= 2; upperLen /= 2;
    if (upperLen < 1e-6) return bias;
    // Torso silhouette: bind-pose skinned verts whose dominant bone is
    // spine/chest, lateral extent along the shoulder axis, banded to the
    // spine->neck span. Sampled in stopV (fighter) space — geometry
    // positions are bind shape regardless of the current pose; only the
    // node transforms are composed, into stopV space via its inverse.
    const scene = f.vrm && f.vrm.vrm ? f.vrm.vrm.scene : null;
    if (!scene || typeof humanoid.getBoneNode !== 'function') return bias;
    const lats = [];
    try {
      scene.updateWorldMatrix(true, true);
      const invStop = stopV ? new THREE.Matrix4().copy(stopV.matrixWorld).invert() : new THREE.Matrix4();
      const node2key = new Map();
      for (const k of BONE_NAMES) {
        const n = humanoid.getBoneNode(VRM_BONE_MAP[k]);
        if (n) node2key.set(n, k);
      }
      const vp = new THREE.Vector3(), rel = new THREE.Vector3();
      scene.traverse((o) => {
        if (!o.isSkinnedMesh || !o.skeleton) return;
        const geo = o.geometry, pos = geo.getAttribute('position');
        const skI = geo.getAttribute('skinIndex'), skW = geo.getAttribute('skinWeight');
        if (!pos || !skI || !skW) return;
        const mtx = new THREE.Matrix4().multiplyMatrices(invStop, o.matrixWorld);
        for (let vi = 0; vi < pos.count; vi++) {
          let bi = 0, bw = -1;
          for (let k = 0; k < 4; k++) { const w = skW.getComponent(vi, k); if (w > bw) { bw = w; bi = skI.getComponent(vi, k); } }
          const key = node2key.get(o.skeleton.bones[bi]);
          if (key !== 'spine' && key !== 'chest') continue;
          vp.fromBufferAttribute(pos, vi).applyMatrix4(mtx);
          rel.subVectors(vp, spineP);
          const u = rel.dot(axis) / torsoLen;
          if (u < -0.05 || u > 1.10) continue;
          lats.push(Math.abs(rel.dot(latAxis)));
        }
      });
    } catch (e) { return bias; } // exotic scene shape: stay un-biased
    if (lats.length < 30) return bias;
    lats.sort((a, b) => a - b);
    const torsoLat = lats[Math.min(lats.length - 1, Math.floor(0.99 * lats.length))];
    if (shLat >= torsoLat) return bias; // shoulder already outside the silhouette
    const deficit = torsoLat + RIG_SHOULDER_MARGIN - shLat;
    bias.phi = Math.min(ARM_BIAS_MAX, Math.asin(Math.min(1, deficit / upperLen)));
    return bias;
  }
  function forceRoninRestFrame(f, humanoid, refRest, stopV) {
    // Model rest capture (fighter space) — MUST run while the humanoid
    // is at resetNormalizedPose and BEFORE any bone is rewritten.
    const mQuat = {}, mDir = {}, mPos = {};
    for (const b of BONE_NAMES) {
      const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      if (!vb) continue;
      mQuat[b] = chainQuat(vb, stopV, new THREE.Quaternion());
      mPos[b] = chainPos(vb, stopV, new THREE.Vector3());
    }
    for (const chain of NORM_CHAINS) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const bone = chain[i], child = chain[i + 1];
        const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[bone]);
        const vc = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[child]);
        if (!vb || !vc) continue;
        chainPos(vb, stopV, _v1);
        chainPos(vc, stopV, _v2);
        _v2.sub(_v1);
        if (_v2.lengthSq() < 1e-10) continue;
        mDir[bone] = _v2.normalize().clone();
      }
    }
    const bias = armBiasFor(f, humanoid, stopV, mPos);
    // BONE_NAMES is root-to-tip: each bone's parent chain is read live,
    // so ancestors already hold their transplanted locals when solved.
    for (const b of BONE_NAMES) {
      const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      if (!vb) continue;
      if (!CHAIN_CHILD[b] || !mDir[b] || !mQuat[b] || !refRest.dir || !refRest.dir[b] || !refRest.quat[b]) continue;
      let target = refRest.dir[b];
      const bSide = ARM_BIAS_BONES[b];
      if (bSide && bias.phi > 0 && bias.sign[bSide] !== 0) {
        _bq.setFromAxisAngle(_X_AXIS, -bias.sign[bSide] * bias.phi);
        target = _tv.copy(target).applyQuaternion(_bq);
      }
      _aq.setFromUnitVectors(mDir[b], target); // A_b
      _tq.copy(_aq).multiply(mQuat[b]); // F_b = A_b · model rest frame
      chainQuat(vb.parent, stopV, _q2); // live parent chain (fighter space)
      vb.quaternion.copy(_q2.invert().multiply(_tq));
    }
  }
  if (f.vrm && f.vrm.vrm && f.vrm.vrm.humanoid) {
    const humanoid = f.vrm.vrm.humanoid;
    const vrmScene = f.vrm.vrm.scene;
    const stopV = vrmScene ? vrmScene.parent : null;
    // Reference rig: the fighter's own rig, or the shared stand-in.
    // v0.47: the reference is posed WITHOUT the facing mirrorYaw
    // counter-rotation. That counter-mirror exists for the flat rig (its
    // torso is a blade — without it, facing left shows the back). A VRM is
    // a real 3D body under a root mirror: the mirror already produces the
    // correct torso, and feeding counter-mirrored torso deltas made the
    // transfer facing-dependent (the Div #3 wrist-z asymmetry: torso-yaw
    // deltas acting on the arm assemblies landed differently per facing).
    // With a facing-blind reference, fighter-space posing is identical
    // for both facings and the root mirror does all the flipping.
    let refBones, refRest, refStop;
    if (f.rig) {
      refRest = procRestChain();
      poseRigLocals(f.rig.bones, eulerDict, false);
      refBones = f.rig.bones;
      refStop = f.rig.group.parent;
    } else {
      const rr = referenceRig(f.bodyType);
      for (const b of BONE_NAMES) if (rr.bones[b]) rr.bones[b].quaternion.identity();
      poseRigLocals(rr.bones, eulerDict, false);
      refBones = rr.bones;
      refRest = _refRigRest;
      refStop = rr.group.parent;
    }
    // VRM rest in fighter space (after reset)
    humanoid.resetNormalizedPose();
    // v0.49: force the model's rest frame onto Ronin's (see
    // forceRoninRestFrame above) BEFORE the rest capture, so the delta
    // transfer starts from Ronin's rest template instead of the model's
    // authored rest. v0.15–v0.47 swung segment directions toward the
    // rig's and flattened/yawed pieces of the result; the transplant
    // replaces all of it with one construction.
    forceRoninRestFrame(f, humanoid, refRest, stopV);
    const vrmRest = {};
    for (const b of BONE_NAMES) {
      const vb = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      if (!vb) continue;
      vrmRest[b] = chainQuat(vb, stopV, new THREE.Quaternion());
    }
    // Apply fighter-space deltas: posed = D * rest, D = rest^-1 * posed.
    for (const b of BONE_NAMES) {
      const vrmBone = humanoid.getNormalizedBoneNode(VRM_BONE_MAP[b]);
      const procBone = refBones[b];
      if (!vrmBone || !procBone || !refRest.quat[b] || !vrmRest[b]) continue;
      chainQuat(procBone, refStop, _q1); // proc posed (fighter space)
      // D = procRest^-1 * procPosed (fighter-space delta)
      _q2.copy(refRest.quat[b]).invert().multiply(_q1);
      // VRM posed (fighter space) = D * vrmRest
      _q1.copy(_q2).multiply(vrmRest[b]);
      // Convert to local. The parent chain is re-read live: BONE_NAMES is
      // root-to-tip, so ancestors already hold their new locals.
      chainQuat(vrmBone.parent, stopV, _q2);
      vrmBone.quaternion.copy(_q2).invert().multiply(_q1);
    }
    if (vrmScene) vrmScene.updateMatrixWorld(true);
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
