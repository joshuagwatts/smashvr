// js/moves.js — fighter definitions + full 16-slot movesets with hand-authored
// keyframed pose tracks. All names, poses and effects are original; frame DATA
// (startup/active/total/damage/angle/KB) is recreated from public frame data.
// Imports only budget.js (pure) — no three.js here.

import { moveCost } from './budget.js';

export const FIGHTER_DEFS = {
  ronin: {
    name: 'RONIN', cls: 'mid',
    weight: 100, runSpeed: 0.13, airSpeed: 0.11, fallSpeed: 0.25, fastFall: 0.46,
    jumpV: 0.22, djumpV: 0.20, traction: 0.6,
    theme: { primary: '#e23b2e', secondary: '#ffb13d' },
    // v0.3 mirror match: P2 alt palette (teal + white) when both sides pick ronin
    altTheme: { primary: '#2ee2a8', secondary: '#f2f5f7' },
  },
  volt: {
    name: 'VOLT', cls: 'heavy',
    weight: 114, runSpeed: 0.15, airSpeed: 0.12, fallSpeed: 0.28, fastFall: 0.52,
    jumpV: 0.21, djumpV: 0.19, traction: 0.55,
    theme: { primary: '#2e9be2', secondary: '#7df9ff' },
    // v0.3 mirror match: P2 alt palette (orange + pale yellow) when both sides pick volt
    altTheme: { primary: '#e27a2e', secondary: '#ffe27d' },
  },
};

export const SLOTS = [
  'jab', 'ftilt', 'utilt', 'dtilt',
  'fsmash', 'usmash', 'dsmash',
  'nair', 'fair', 'bair', 'uair', 'dair',
  'nspecial', 'sspecial', 'uspecial', 'dspecial',
];

export const SLOT_LABELS = {
  jab: 'Jab', ftilt: 'Forward Tilt', utilt: 'Up Tilt', dtilt: 'Down Tilt',
  fsmash: 'Forward Smash', usmash: 'Up Smash', dsmash: 'Down Smash',
  nair: 'Neutral Air', fair: 'Forward Air', bair: 'Back Air',
  uair: 'Up Air', dair: 'Down Air',
  nspecial: 'Neutral Special', sspecial: 'Side Special',
  uspecial: 'Up Special', dspecial: 'Down Special',
};

const KIND = {
  jab: 'jab',
  ftilt: 'tilt', utilt: 'tilt', dtilt: 'tilt',
  fsmash: 'smash', usmash: 'smash', dsmash: 'smash',
  nair: 'aerial', fair: 'aerial', bair: 'aerial', uair: 'aerial', dair: 'aerial',
  nspecial: 'special', sspecial: 'special', uspecial: 'special', dspecial: 'special',
};

// ---------------------------------------------------------------------------
// Pose library. Eulers are [rx, ry, rz] radians on the logical bones.
// Fighter faces +X, Y-up. Sparse dicts merged over NEUTRAL_POSE by K().
// ---------------------------------------------------------------------------

export const NEUTRAL_POSE = {
  hips: [0, 0, 0], spine: [0, 0, -0.12], chest: [0, 0.14, -0.08],
  neck: [0, 0, 0], head: [0, 0, 0.08],
  upperArmL: [0, 0, -0.95], lowerArmL: [0, 0, -1.35], handL: [0, 0, 0],
  upperArmR: [0, 0, 1.05], lowerArmR: [0, 0, 1.3], handR: [0, 0, 0],
  upperLegL: [0, 0, -0.2], lowerLegL: [0, 0, 0.28], footL: [0, 0, 0.05],
  upperLegR: [0, 0, 0.26], lowerLegR: [0, 0, -0.32], footR: [0, 0, 0.05],
};

export const POSES = {
  WINDUP_SHORT: { upperArmR: [0, 0, 0.5], lowerArmR: [0, 0, 1.7], spine: [0, 0, 0.08], chest: [0, 0.2, 0.05] },
  JAB_R: { upperArmR: [0, 0, 1.55], lowerArmR: [0, 0, 0.15], spine: [0, 0, -0.22], chest: [0, -0.15, -0.08] },
  WINDUP_R: { upperArmR: [0, 0, -0.9], lowerArmR: [0, 0, -0.6], spine: [0, 0, 0.3], chest: [0, 0.4, 0.15], hips: [0, 0.2, 0] },
  PUNCH_R: {
    upperArmR: [0, 0, 1.62], lowerArmR: [0, 0, 0.05], spine: [0, 0, -0.35],
    chest: [0, -0.25, -0.15], upperArmL: [0, 0, 0.2], lowerArmL: [0, 0, 1.5],
    hips: [0, -0.15, 0], upperLegR: [0, 0, 0.35], upperLegL: [0, 0, -0.3],
  },
  WINDUP_KICK_R: { upperLegR: [0, 0, -0.7], lowerLegR: [0, 0, 1.5], spine: [0, 0, -0.08], upperArmR: [0, 0, -0.5] },
  KICK_R: {
    upperLegR: [0, 0, 1.5], lowerLegR: [0, 0, -0.15], footR: [0, 0, 0.5],
    spine: [0, 0, 0.28], chest: [0, 0, 0.2], upperArmR: [0, 0, -0.7],
    upperArmL: [0, 0, 1.3], hips: [0, 0, 0.12], upperLegL: [0, 0, -0.12],
  },
  KICK_BACK: {
    upperLegR: [0, 0, -1.55], lowerLegR: [0, 0, 0.2], footR: [0, 0, -0.4],
    spine: [0, 0, -0.2], chest: [0, -0.4, -0.1], hips: [0, -0.4, 0],
    upperArmR: [0, 0, 1.2], head: [0, -0.5, 0],
  },
  KICK_UP: {
    upperLegR: [0, 0, 2.5], lowerLegR: [0, 0, -0.25], footR: [0, 0, 0.4],
    spine: [0, 0, 0.32], chest: [0, 0, 0.15], upperArmR: [0, 0, -1.1],
    upperArmL: [0, 0, 1.1], upperLegL: [0, 0, -0.15], head: [0, 0, -0.15],
  },
  KNEE: {
    upperLegR: [0, 0, 1.9], lowerLegR: [0, 0, -2.0], footR: [0, 0, 0.5],
    spine: [0, 0, -0.35], chest: [0, 0, -0.15], upperArmR: [0, 0, -0.9],
    lowerArmR: [0, 0, -0.4], upperArmL: [0, 0, 1.3], hips: [0, 0, -0.1],
    upperLegL: [0, 0, -0.15],
  },
  UPPERCUT: {
    upperArmR: [0, 0, 2.6], lowerArmR: [0, 0, 0.3], spine: [0, 0, -0.45],
    chest: [0, 0, -0.2], hips: [0, 0, -0.15], upperLegR: [0, 0, 0.3],
    lowerLegR: [0, 0, -0.3], upperLegL: [0, 0, -0.25], head: [0, 0, -0.2],
    upperArmL: [0, 0, -0.6],
  },
  PALM: {
    upperArmR: [0, 0, 2.75], lowerArmR: [0, 0, 0.35], spine: [0, 0, -0.35],
    chest: [0, 0, -0.15], head: [0, 0, -0.2], upperLegR: [0, 0, 0.35],
    upperLegL: [0, 0, -0.3],
  },
  CROUCH: {
    spine: [0, 0, -0.5], chest: [0, 0, -0.1], hips: [0, 0, 0],
    upperLegR: [0, 0, 0.95], lowerLegR: [0, 0, -1.6],
    upperLegL: [0, 0, 0.95], lowerLegL: [0, 0, -1.6],
    upperArmR: [0, 0, 0.8], lowerArmR: [0, 0, 1.1],
    upperArmL: [0, 0, -0.8], lowerArmL: [0, 0, -1.1], head: [0, 0, 0.28],
  },
  SWEEP: {
    spine: [0, 0, -0.55], upperLegR: [0, 0, 1.4], lowerLegR: [0, 0, -0.12],
    footR: [0, 0, 0.55], upperLegL: [0, 0, 0.9], lowerLegL: [0, 0, -1.55],
    upperArmR: [0, 0, 0.9], head: [0, 0, 0.25],
  },
  SPIN_A: {
    upperArmR: [0, 0, 1.57], lowerArmR: [0, 0, 0.1],
    upperArmL: [0, 0, -1.57], lowerArmL: [0, 0, -0.1],
    upperLegR: [0, 0, 1.25], lowerLegR: [0, 0, -0.3],
    upperLegL: [0, 0, -1.05], lowerLegL: [0, 0, 0.35], spine: [0, 0, -0.12],
  },
  TORNADO_A: {
    upperArmR: [0, 0, 1.57], lowerArmR: [0, 0, 0],
    upperArmL: [0, 0, -1.57], lowerArmL: [0, 0, 0],
    upperLegR: [0, 0, 0.35], upperLegL: [0, 0, -0.35], spine: [0, 0, -0.08],
  },
  FIREBALL: {
    upperArmR: [0, 0, 1.55], lowerArmR: [0, 0, 0.12],
    upperArmL: [0, 0, 1.45], lowerArmL: [0, 0, 0.18],
    spine: [0, 0, -0.32], chest: [0, 0, -0.15],
    upperLegR: [0, 0, 0.42], lowerLegR: [0, 0, -0.3],
    upperLegL: [0, 0, -0.35], lowerLegL: [0, 0, 0.3], head: [0, 0, -0.08],
  },
  RISE_B: {
    upperArmR: [0, 0, 2.9], lowerArmR: [0, 0, 0.2], spine: [0, 0, -0.5],
    chest: [0, 0, -0.2], hips: [0, 0, -0.2],
    upperLegR: [0, 0, 0.5], lowerLegR: [0, 0, -0.7],
    upperLegL: [0, 0, 0.5], lowerLegL: [0, 0, -0.7],
    head: [0, 0, -0.3], upperArmL: [0, 0, -0.8], lowerArmL: [0, 0, -0.5],
  },
  STOMP: {
    upperLegR: [0, 0, 0.55], lowerLegR: [0, 0, -0.35],
    upperLegL: [0, 0, 0.55], lowerLegL: [0, 0, -0.35],
    spine: [0, 0, -0.38], chest: [0, 0, -0.1],
    upperArmR: [0, 0, -1.25], lowerArmR: [0, 0, -0.3],
    upperArmL: [0, 0, 1.25], lowerArmL: [0, 0, 0.3], head: [0, 0, -0.18],
  },
  ELBOW_BACK: {
    chest: [0, 0.7, 0], spine: [0, 0.4, 0.05], hips: [0, 0.5, 0],
    upperArmR: [0, 0, -1.9], lowerArmR: [0, 0, -2.3], head: [0, 0.6, 0],
    upperArmL: [0, 0, 0.9], lowerArmL: [0, 0, 1.2],
  },
  OVERHEAD: {
    upperArmR: [0, 0, 2.95], lowerArmR: [0, 0, 0.15], spine: [0, 0, -0.28],
    chest: [0, 0, -0.12], head: [0, 0, -0.25],
    upperArmL: [0, 0, -0.5], lowerArmL: [0, 0, -0.3],
  },
  BIG_WINDUP: {
    upperArmR: [0, 0, -2.2], lowerArmR: [0, 0, -0.8], spine: [0, 0, 0.45],
    chest: [0, 0.5, 0.2], hips: [0, 0.3, 0.1], head: [0, 0, 0.2],
    upperLegR: [0, 0, 0.45], lowerLegR: [0, 0, -0.5],
    upperLegL: [0, 0, -0.4], lowerLegL: [0, 0, 0.4], upperArmL: [0, 0, 0.6],
  },
  BIG_PUNCH: {
    upperArmR: [0, 0, 1.65], lowerArmR: [0, 0, 0.05], spine: [0, 0, -0.5],
    chest: [0, -0.4, -0.25], hips: [0, -0.3, -0.1],
    upperLegR: [0, 0, 0.5], lowerLegR: [0, 0, -0.45],
    upperLegL: [0, 0, -0.45], lowerLegL: [0, 0, 0.35],
    head: [0, 0, -0.1], upperArmL: [0, 0, -0.7],
  },
  DASH_POSE: {
    spine: [0, 0, -0.7], chest: [0, 0, -0.2],
    upperLegR: [0, 0, 1.1], lowerLegR: [0, 0, -1.9],
    upperLegL: [0, 0, -0.8], lowerLegL: [0, 0, 1.7],
    upperArmR: [0, 0, -1.6], lowerArmR: [0, 0, -0.5],
    upperArmL: [0, 0, 1.5], lowerArmL: [0, 0, -1.3], head: [0, 0, -0.3],
  },
  SHOULDER: {
    chest: [0, -0.55, -0.22], spine: [0, -0.3, -0.18], hips: [0, -0.3, 0],
    upperArmR: [0, 0, 0.45], lowerArmR: [0, 0, 1.1], upperArmL: [0, 0, -0.4],
    upperLegR: [0, 0, 0.4], lowerLegR: [0, 0, -0.35],
    upperLegL: [0, 0, -0.3], head: [0, -0.3, 0],
  },
  CLAP: {
    upperArmR: [0, 0, 2.45], lowerArmR: [0, 0, -1.25],
    upperArmL: [0, 0, -2.45], lowerArmL: [0, 0, 1.25],
    spine: [0, 0, -0.32], chest: [0, 0, -0.15], head: [0, 0, -0.22],
    upperLegR: [0, 0, 0.3], upperLegL: [0, 0, -0.3],
  },
  POUND: {
    spine: [0, 0, -0.62], chest: [0, 0, -0.2],
    upperArmR: [0, 0, 1.95], lowerArmR: [0, 0, 0.3],
    upperArmL: [0, 0, -1.95], lowerArmL: [0, 0, -0.3],
    upperLegR: [0, 0, 0.55], lowerLegR: [0, 0, -0.85],
    upperLegL: [0, 0, -0.55], lowerLegL: [0, 0, 0.85], head: [0, 0, -0.1],
  },
  GRAB: {
    upperArmR: [0, 0, 1.7], lowerArmR: [0, 0, 0.1],
    upperArmL: [0, 0, 1.7], lowerArmL: [0, 0, 0.1],
    spine: [0, 0, -0.42], chest: [0, 0, -0.15],
    upperLegR: [0, 0, -0.4], lowerLegR: [0, 0, 0.5],
    upperLegL: [0, 0, 0.35], lowerLegL: [0, 0, -0.4], head: [0, 0, -0.15],
  },
  DIVEKICK: {
    upperLegR: [0, 0, 1.25], lowerLegR: [0, 0, -0.45], footR: [0, 0, 0.5],
    upperLegL: [0, 0, -0.55], lowerLegL: [0, 0, 0.95],
    spine: [0, 0, -0.55], chest: [0, 0, -0.2],
    upperArmR: [0, 0, -1.4], lowerArmR: [0, 0, -0.4],
    upperArmL: [0, 0, -1.2], lowerArmL: [0, 0, -0.5], head: [0, 0, -0.2],
  },
  // v0.3 grab game
  GRAB_ATTEMPT: {
    upperArmR: [0, 0, 1.6], lowerArmR: [0, 0, 0.2],
    upperArmL: [0, 0, 1.6], lowerArmL: [0, 0, 0.2],
    spine: [0, 0, -0.45], chest: [0, 0, -0.15],
    upperLegR: [0, 0, 0.5], lowerLegR: [0, 0, -0.6],
    upperLegL: [0, 0, -0.3], lowerLegL: [0, 0, 0.35], head: [0, 0, -0.1],
  },
  HOLDING: {
    upperArmR: [0, 0, 0.9], lowerArmR: [0, 0, 1.9],
    upperArmL: [0, 0, -0.5], lowerArmL: [0, 0, -1.4],
    spine: [0, 0, -0.3], chest: [0, 0.2, -0.1],
    upperLegR: [0, 0, 0.3], lowerLegR: [0, 0, -0.35],
    upperLegL: [0, 0, -0.3], lowerLegL: [0, 0, 0.35], head: [0, 0, 0.1],
  },
  GRABBED: {
    upperArmR: [0, 0, 2.6], lowerArmR: [0, 0, 0.5],
    upperArmL: [0, 0, -2.6], lowerArmL: [0, 0, -0.5],
    spine: [0, 0, 0.25], head: [0, 0, -0.35],
    upperLegR: [0, 0, 0.5], lowerLegR: [0, 0, -0.9],
    upperLegL: [0, 0, 0.4], lowerLegL: [0, 0, -0.8],
  },
};

// Keyframe helper: sparse pose name (or raw dict) merged over NEUTRAL_POSE.
const K = (t, p, o) => ({
  t,
  bones: Object.assign({}, NEUTRAL_POSE, typeof p === 'string' ? POSES[p] : p, o || {}),
});

// Hitbox helper.
const H = (dx, dy, w, h, dmg, angle, baseKB, kbGrowth, from, to) => ({
  dx, dy, w, h, dmg, angle, baseKB, kbGrowth, from, to,
});

function mv(defId, slot, cfg) {
  // Price on total damage: all hits + projectile damage (Ember Shot etc.).
  const dmg = cfg.hits.reduce((s, h) => s + h.dmg, 0) + (cfg.projectile ? cfg.projectile.dmg : 0);
  return {
    id: `${defId}_${slot}`,
    name: cfg.name,
    kind: KIND[slot],
    startup: cfg.startup,
    active: cfg.active,
    total: cfg.total,
    hits: cfg.hits,
    lunge: cfg.lunge || [0, 0],
    cost: moveCost(dmg, cfg.startup, cfg.kbClass),
    kbClass: cfg.kbClass,
    projectile: cfg.projectile || null,
    special: cfg.special || null,
    anim: cfg.anim,
  };
}

// ---------------------------------------------------------------------------
// RONIN — mid class, balanced all-rounder
// ---------------------------------------------------------------------------

const ronin = {
  jab: mv('ronin', 'jab', {
    name: 'Jab Combo', startup: 3, active: 4, total: 22, kbClass: 'weak', lunge: [0.06, 0],
    hits: [
      H(0.55, 1.05, 0.7, 0.5, 2, 30, 20, 40, 3, 5),
      H(0.6, 1.05, 0.7, 0.5, 3, 40, 28, 60, 11, 13),
    ],
    anim: [K(0, 'NEUTRAL'), K(3 / 22, 'WINDUP_SHORT'), K(6 / 22, 'JAB_R'), K(11 / 22, 'WINDUP_SHORT'), K(14 / 22, 'JAB_R'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  ftilt: mv('ronin', 'ftilt', {
    name: 'Side Kick', startup: 6, active: 4, total: 30, kbClass: 'neutral', lunge: [0.10, 0],
    hits: [H(0.7, 0.6, 0.9, 0.7, 13, 35, 35, 90, 6, 10)],
    anim: [K(0, 'NEUTRAL'), K(5 / 30, 'WINDUP_KICK_R'), K(8 / 30, 'KICK_R'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  utilt: mv('ronin', 'utilt', {
    name: 'Rising Palm', startup: 5, active: 6, total: 28, kbClass: 'neutral',
    hits: [H(0.65, 1.45, 0.8, 0.8, 10, 88, 30, 100, 5, 11)],
    anim: [K(0, 'NEUTRAL'), K(4 / 28, 'CROUCH'), K(7 / 28, 'PALM'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dtilt: mv('ronin', 'dtilt', {
    name: 'Low Sweep', startup: 7, active: 4, total: 30, kbClass: 'neutral',
    hits: [H(0.7, 0.35, 0.9, 0.45, 12, 25, 32, 85, 7, 11)],
    anim: [K(0, 'NEUTRAL'), K(5 / 30, 'CROUCH'), K(9 / 30, 'SWEEP'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  fsmash: mv('ronin', 'fsmash', {
    name: 'Blade Rush', startup: 12, active: 4, total: 48, kbClass: 'strong', lunge: [0.22, 0],
    hits: [H(0.85, 1.05, 0.9, 0.6, 18, 35, 45, 110, 12, 16)],
    anim: [K(0, 'NEUTRAL'), K(8 / 48, 'WINDUP_R'), K(14 / 48, 'PUNCH_R'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  usmash: mv('ronin', 'usmash', {
    name: 'Skyward Fist', startup: 9, active: 8, total: 52, kbClass: 'kill',
    hits: [H(0.85, 1.25, 0.8, 0.8, 19, 88, 50, 120, 9, 17)],
    anim: [K(0, 'NEUTRAL'), K(6 / 52, 'CROUCH'), K(12 / 52, 'UPPERCUT'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dsmash: mv('ronin', 'dsmash', {
    name: 'Whirlwind Kick', startup: 10, active: 8, total: 50, kbClass: 'strong',
    hits: [
      H(0.35, 0.55, 0.9, 0.7, 17, 30, 45, 105, 10, 14),
      H(-0.65, 0.55, 0.9, 0.7, 17, 150, 45, 105, 14, 18),
    ],
    anim: [K(0, 'NEUTRAL'), K(8 / 50, 'CROUCH'), K(12 / 50, 'SPIN_A', { hips: [0, 1.5, 0] }), K(16 / 50, 'SPIN_A', { hips: [0, 3.1, 0] }), K(20 / 50, 'SPIN_A', { hips: [0, 4.7, 0] }), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  nair: mv('ronin', 'nair', {
    name: 'Cyclone Elbow', startup: 3, active: 20, total: 40, kbClass: 'neutral',
    hits: [H(0, 1.1, 1.2, 0.8, 13, 40, 32, 90, 3, 23)],
    anim: [K(0, 'NEUTRAL'), K(3 / 40, 'SPIN_A', { hips: [0, 0.8, 0] }), K(12 / 40, 'SPIN_A', { hips: [0, 2.8, 0] }), K(22 / 40, 'SPIN_A', { hips: [0, 5.0, 0] }), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  fair: mv('ronin', 'fair', {
    name: 'Comet Fist', startup: 14, active: 6, total: 44, kbClass: 'strong', lunge: [0.08, 0],
    hits: [H(0.8, 1.15, 0.75, 0.6, 15, 20, 40, 100, 14, 20)],
    anim: [K(0, 'NEUTRAL'), K(10 / 44, 'WINDUP_R'), K(16 / 44, 'PUNCH_R'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  bair: mv('ronin', 'bair', {
    name: 'Back Kick', startup: 11, active: 6, total: 42, kbClass: 'strong',
    hits: [H(-0.15, 1.45, 0.8, 0.7, 15, 145, 40, 100, 11, 17)],
    anim: [K(0, 'NEUTRAL'), K(8 / 42, 'WINDUP_R'), K(13 / 42, 'ELBOW_BACK'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  uair: mv('ronin', 'uair', {
    name: 'Helm Splitter', startup: 2, active: 10, total: 34, kbClass: 'neutral',
    hits: [H(0.72, 1.35, 0.7, 1.0, 11, 85, 30, 95, 2, 12)],
    anim: [K(0, 'NEUTRAL'), K(2 / 34, 'CROUCH'), K(6 / 34, 'OVERHEAD'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dair: mv('ronin', 'dair', {
    name: 'Drill Stomp', startup: 16, active: 12, total: 48, kbClass: 'neutral',
    hits: [
      H(0.3, 0.25, 0.8, 0.6, 4, 270, 15, 40, 16, 20),
      H(0.3, 0.25, 0.8, 0.6, 4, 270, 15, 40, 20, 24),
      H(0.3, 0.25, 0.8, 0.6, 4, 60, 25, 60, 24, 28),
    ],
    anim: [K(0, 'NEUTRAL'), K(12 / 48, 'CROUCH'), K(18 / 48, 'STOMP'), K(30 / 48, 'STOMP'), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  nspecial: mv('ronin', 'nspecial', {
    name: 'Ember Shot', startup: 10, active: 2, total: 36, kbClass: 'weak', special: 'fireball',
    hits: [],
    projectile: { speed: 9, dmg: 7, angle: 30, baseKB: 25, kbGrowth: 60, w: 0.5, h: 0.5, life: 120, gravity: 0.25 },
    anim: [K(0, 'NEUTRAL'), K(8 / 36, 'WINDUP_SHORT'), K(12 / 36, 'FIREBALL'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  sspecial: mv('ronin', 'sspecial', {
    name: 'Cyclone Spin', startup: 10, active: 14, total: 44, kbClass: 'neutral', special: 'spin', lunge: [0, 0.03],
    hits: [H(0, 1.0, 1.4, 1.2, 12, 45, 40, 95, 10, 24)],
    anim: [K(0, 'NEUTRAL'), K(8 / 44, 'CROUCH'), K(14 / 44, 'TORNADO_A', { hips: [0, 1.5, 0] }), K(22 / 44, 'TORNADO_A', { hips: [0, 3.5, 0] }), K(30 / 44, 'TORNADO_A', { hips: [0, 5.5, 0] }), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  uspecial: mv('ronin', 'uspecial', {
    name: 'Rising Punch', startup: 4, active: 10, total: 50, kbClass: 'strong', special: 'rise', lunge: [0, 0],
    hits: [
      H(0.7, 1.1, 0.7, 0.7, 5, 80, 40, 80, 4, 7),
      H(0.85, 1.35, 0.7, 0.7, 9, 80, 45, 100, 7, 14),
    ],
    anim: [K(0, 'NEUTRAL'), K(3 / 50, 'CROUCH'), K(8 / 50, 'RISE_B'), K(16 / 50, 'RISE_B'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dspecial: mv('ronin', 'dspecial', {
    name: 'Tornado', startup: 1, active: 20, total: 44, kbClass: 'weak', special: 'tornado',
    hits: [
      H(0, 1.0, 1.3, 1.3, 3, 75, 12, 30, 1, 5),
      H(0, 1.0, 1.3, 1.3, 3, 75, 12, 30, 5, 9),
      H(0, 1.0, 1.3, 1.3, 3, 75, 12, 30, 9, 13),
      H(0, 1.0, 1.3, 1.3, 3, 75, 12, 30, 13, 17),
      H(0, 1.0, 1.3, 1.3, 3, 75, 12, 30, 17, 21),
    ],
    anim: [K(0, 'NEUTRAL'), K(2 / 44, 'TORNADO_A', { hips: [0, 1, 0] }), K(10 / 44, 'TORNADO_A', { hips: [0, 3, 0] }), K(18 / 44, 'TORNADO_A', { hips: [0, 5, 0] }), K(26 / 44, 'TORNADO_A', { hips: [0, 7, 0] }), K(0.9, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
};

// ---------------------------------------------------------------------------
// VOLT — heavy class, fast heavyweight
// ---------------------------------------------------------------------------

const volt = {
  jab: mv('volt', 'jab', {
    name: 'Volt Jab', startup: 4, active: 4, total: 24, kbClass: 'weak',
    hits: [
      H(0.55, 1.05, 0.7, 0.5, 3, 30, 20, 40, 4, 6),
      H(0.6, 1.05, 0.7, 0.5, 4, 40, 28, 60, 12, 14),
    ],
    anim: [K(0, 'NEUTRAL'), K(4 / 24, 'WINDUP_SHORT'), K(7 / 24, 'JAB_R'), K(12 / 24, 'WINDUP_SHORT'), K(15 / 24, 'JAB_R'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  ftilt: mv('volt', 'ftilt', {
    name: 'Shoulder Check', startup: 8, active: 4, total: 32, kbClass: 'neutral',
    hits: [H(0.35, 1.3, 0.9, 0.7, 14, 35, 38, 95, 8, 12)],
    anim: [K(0, 'NEUTRAL'), K(6 / 32, 'WINDUP_R'), K(10 / 32, 'SHOULDER'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  utilt: mv('volt', 'utilt', {
    name: 'Uppercut', startup: 7, active: 5, total: 30, kbClass: 'neutral',
    hits: [H(0.8, 1.3, 0.8, 0.8, 11, 80, 34, 95, 7, 12)],
    anim: [K(0, 'NEUTRAL'), K(5 / 30, 'CROUCH'), K(9 / 30, 'UPPERCUT'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dtilt: mv('volt', 'dtilt', {
    name: 'Leg Sweep', startup: 9, active: 4, total: 32, kbClass: 'neutral',
    hits: [H(0.75, 0.35, 0.9, 0.45, 12, 28, 34, 90, 9, 13)],
    anim: [K(0, 'NEUTRAL'), K(7 / 32, 'CROUCH'), K(11 / 32, 'SWEEP'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  fsmash: mv('volt', 'fsmash', {
    name: 'Flame Kick', startup: 14, active: 4, total: 54, kbClass: 'strong', lunge: [0.24, 0],
    hits: [H(0.85, 0.85, 0.9, 0.6, 19, 30, 48, 115, 14, 18)],
    anim: [K(0, 'NEUTRAL'), K(10 / 54, 'WINDUP_KICK_R'), K(16 / 54, 'KICK_R'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  usmash: mv('volt', 'usmash', {
    name: 'Thunder Clap', startup: 4, active: 6, total: 44, kbClass: 'strong',
    hits: [H(0.7, 1.15, 0.9, 0.8, 16, 88, 48, 110, 4, 10)],
    anim: [K(0, 'NEUTRAL'), K(3 / 44, 'CROUCH'), K(7 / 44, 'CLAP'), K(0.7, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dsmash: mv('volt', 'dsmash', {
    name: 'Ground Pound', startup: 12, active: 8, total: 52, kbClass: 'neutral',
    // v0.2: the POUND pose slams the RIGHT fist down-forward (left fist rises
    // behind) — a single honest hitbox on the right fist replaces the old
    // phantom back-low box.
    hits: [
      H(0.8, 1.0, 0.9, 0.8, 16, 30, 44, 100, 12, 20),
    ],
    anim: [K(0, 'NEUTRAL'), K(9 / 52, 'CROUCH'), K(14 / 52, 'POUND'), K(22 / 52, 'POUND'), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  nair: mv('volt', 'nair', {
    name: 'Volt Spin', startup: 5, active: 16, total: 38, kbClass: 'neutral',
    hits: [H(0, 1.1, 1.2, 0.8, 12, 40, 34, 90, 5, 21)],
    anim: [K(0, 'NEUTRAL'), K(5 / 38, 'SPIN_A', { hips: [0, 0.8, 0] }), K(13 / 38, 'SPIN_A', { hips: [0, 2.8, 0] }), K(21 / 38, 'SPIN_A', { hips: [0, 4.8, 0] }), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  fair: mv('volt', 'fair', {
    name: 'Knee Strike', startup: 16, active: 4, total: 46, kbClass: 'kill', lunge: [0.08, 0],
    hits: [H(0.5, 0.85, 0.7, 0.7, 18, 25, 46, 115, 16, 20)],
    anim: [K(0, 'NEUTRAL'), K(12 / 46, 'WINDUP_KICK_R'), K(18 / 46, 'KNEE'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  bair: mv('volt', 'bair', {
    name: 'Reverse Kick', startup: 12, active: 6, total: 42, kbClass: 'neutral',
    hits: [H(-0.6, 0.65, 0.8, 0.7, 14, 145, 40, 100, 12, 18)],
    anim: [K(0, 'NEUTRAL'), K(9 / 42, 'WINDUP_KICK_R'), K(14 / 42, 'KICK_BACK'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  uair: mv('volt', 'uair', {
    name: 'Sky Kick', startup: 6, active: 8, total: 36, kbClass: 'neutral',
    hits: [H(0.78, 1.1, 0.8, 1.0, 12, 85, 36, 95, 6, 14)],
    anim: [K(0, 'NEUTRAL'), K(4 / 36, 'CROUCH'), K(8 / 36, 'KICK_UP'), K(0.75, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dair: mv('volt', 'dair', {
    name: 'Meteor Stomp', startup: 14, active: 8, total: 44, kbClass: 'strong',
    hits: [H(0.1, 0.3, 0.8, 0.6, 13, 270, 30, 80, 14, 22)],
    anim: [K(0, 'NEUTRAL'), K(10 / 44, 'CROUCH'), K(16 / 44, 'STOMP'), K(26 / 44, 'STOMP'), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  nspecial: mv('volt', 'nspecial', {
    name: 'Volt Punch', startup: 38, active: 4, total: 70, kbClass: 'kill', special: 'punch', lunge: [0.10, 0],
    hits: [H(0.55, 0.9, 0.9, 0.7, 26, 35, 60, 130, 38, 42)],
    anim: [K(0, 'NEUTRAL'), K(20 / 70, 'BIG_WINDUP'), K(34 / 70, 'BIG_WINDUP'), K(40 / 70, 'BIG_PUNCH'), K(0.8, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  sspecial: mv('volt', 'sspecial', {
    name: 'Railgun Dash', startup: 12, active: 12, total: 46, kbClass: 'neutral', special: 'spin', lunge: [0, 0.02],
    hits: [H(0.3, 1.0, 1.3, 1.0, 14, 40, 44, 100, 12, 24)],
    anim: [K(0, 'NEUTRAL'), K(10 / 46, 'DASH_POSE'), K(16 / 46, 'DASH_POSE'), K(26 / 46, 'DASH_POSE'), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  uspecial: mv('volt', 'uspecial', {
    name: 'Volt Dive', startup: 6, active: 12, total: 54, kbClass: 'strong', special: 'divegrab', lunge: [0.04, 0],
    hits: [H(0.75, 1.0, 1.0, 1.0, 20, 70, 55, 115, 6, 18)],
    anim: [K(0, 'NEUTRAL'), K(4 / 54, 'CROUCH'), K(8 / 54, 'GRAB'), K(18 / 54, 'GRAB'), K(0.85, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
  dspecial: mv('volt', 'dspecial', {
    name: 'Volt Kick', startup: 10, active: 16, total: 48, kbClass: 'neutral', special: 'divekick', lunge: [0.03, -0.03],
    hits: [H(0.6, 0.6, 0.9, 0.8, 15, 300, 40, 95, 10, 26)],
    anim: [K(0, 'NEUTRAL'), K(8 / 48, 'CROUCH'), K(14 / 48, 'DIVEKICK'), K(26 / 48, 'DIVEKICK'), K(0.9, 'NEUTRAL'), K(1, 'NEUTRAL')],
  }),
};

export const MOVES = { ronin, volt };
