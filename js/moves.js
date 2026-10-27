// js/moves.js — fighter definitions + full 16-slot movesets with hand-authored
// keyframed pose tracks. All names, poses and effects are original; frame DATA
// (startup/active/total/damage/angle/KB) is recreated from public frame data.
// Imports only budget.js (pure) — no three.js here.

import { moveCost } from './budget.js?v=50';

export const FIGHTER_DEFS = {
  ronin: {
    name: 'RONIN', cls: 'mid', bodyType: 'biped',
    weight: 100, runSpeed: 0.13, airSpeed: 0.11, fallSpeed: 0.25, fastFall: 0.46,
    jumpV: 0.22, djumpV: 0.20, traction: 0.6,
    theme: { primary: '#e23b2e', secondary: '#ffb13d' },
    // v0.3 mirror match: P2 alt palette (teal + white) when both sides pick ronin
    altTheme: { primary: '#2ee2a8', secondary: '#f2f5f7' },
  },
  volt: {
    name: 'VOLT', cls: 'heavy', bodyType: 'biped',
    weight: 114, runSpeed: 0.15, airSpeed: 0.12, fallSpeed: 0.28, fastFall: 0.52,
    jumpV: 0.21, djumpV: 0.19, traction: 0.55,
    theme: { primary: '#2e9be2', secondary: '#7df9ff' },
    // v0.3 mirror match: P2 alt palette (orange + pale yellow) when both sides pick volt
    altTheme: { primary: '#e27a2e', secondary: '#ffe27d' },
  },
  // v0.6: WISP — floating ghost type. No legs; glides instead of running,
  // floaty low-grav jumps (the Jigglypuff archetype). Runs the VOLT kit —
  // the fast kit suits a ghost. Kick moves work mechanically (positional
  // hitboxes) but have no leg visuals — honest v1 gap.
  wisp: {
    name: 'WISP', cls: 'light', bodyType: 'floater',
    weight: 82, runSpeed: 0.14, airSpeed: 0.135, fallSpeed: 0.16, fastFall: 0.38,
    jumpV: 0.20, djumpV: 0.18, traction: 0.65,
    theme: { primary: '#b9f3ff', secondary: '#5e7bff' },
    // v0.6 mirror match alt: deep violet + pale mist
    altTheme: { primary: '#8b5cf6', secondary: '#e6f9ff' },
  },
  // v0.24: BLITZ — rushdown. "Death by a thousand cuts." Fastest fighter on
  // the roster, weakest hits, lives for the jab string and hit-cancel flow.
  blitz: {
    name: 'BLITZ', cls: 'light', bodyType: 'biped',
    weight: 88, runSpeed: 0.17, airSpeed: 0.145, fallSpeed: 0.22, fastFall: 0.42,
    jumpV: 0.235, djumpV: 0.21, traction: 0.65,
    theme: { primary: '#f5d020', secondary: '#ff6b1a' },
    altTheme: { primary: '#20f5d0', secondary: '#1a6bff' },
  },
  // v0.25: SPECTRE — zoner. The keep-away kit: a fast Hex Bolt neutral
  // special, an arcing Arc Shot side special, and a CHARGED Aether Cannon
  // forward smash (charge it like any smash — the charge multiplier rides on
  // the projectile). Slow feet, floaty air, weak melee with wide hitboxes.
  spectre: {
    name: 'SPECTRE', cls: 'light', bodyType: 'biped',
    weight: 95, runSpeed: 0.125, airSpeed: 0.14, fallSpeed: 0.20, fastFall: 0.40,
    jumpV: 0.24, djumpV: 0.21, traction: 0.6,
    theme: { primary: '#a855f7', secondary: '#ec4899' },
    altTheme: { primary: '#22d3ee', secondary: '#f0abfc' },
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

// v0.7: striking limb per move — the bone whose tip IS the hitbox.
// 'SPIN_FEET' = spin moves: per active tick, the front-most foot matches the
// +x hitbox and the back-most matches the -x hitbox (feet trade sides mid-spin).
export const STRIKE_LIMB = {
  ronin_jab: 'handR', ronin_ftilt: 'footR', ronin_utilt: 'handR',
  ronin_dtilt: 'footR', ronin_fsmash: 'handR', ronin_usmash: 'handR',
  ronin_dsmash: 'SPIN_FEET', ronin_nair: 'chest',
  ronin_fair: 'handR', ronin_bair: 'lowerArmR', ronin_uair: 'handR',
  ronin_dair: 'footR', ronin_sspecial: 'chest', ronin_uspecial: 'handR',
  ronin_dspecial: 'chest', ronin_nspecial: 'handR',
  volt_jab: 'handR', volt_ftilt: 'upperArmR', volt_utilt: 'handR',
  volt_dtilt: 'footR', volt_fsmash: 'footR', volt_usmash: 'handR',
  volt_dsmash: 'handR', volt_nair: 'chest',
  volt_fair: 'lowerLegR', volt_bair: 'footR', volt_uair: 'footR',
  volt_dair: 'footR', volt_nspecial: 'handR', volt_sspecial: 'chest',
  volt_uspecial: 'handR', volt_dspecial: 'footR',
};
for (const s of SLOTS) STRIKE_LIMB['wisp_' + s] = STRIKE_LIMB['volt_' + s];
// v0.7: wisp kick-family moves are body attacks — hitboxes come from the
// 'striker' bone (body's leading edge), not phantom legs. uair strikes with
// the head (body stretched skyward).
for (const s of ['ftilt', 'fsmash', 'fair', 'bair', 'dair', 'dtilt', 'dspecial']) {
  STRIKE_LIMB['wisp_' + s] = 'striker';
}
STRIKE_LIMB['wisp_uair'] = 'head';

// v0.22: bruiser headbutts strike with the head bone (tracks VRM head too).
STRIKE_LIMB['bruiser_jab'] = 'head';
STRIKE_LIMB['bruiser_fsmash'] = 'head';

// v0.24: blitz uses ronin limb mapping (cloned kit).
for (const s of SLOTS) STRIKE_LIMB['blitz_' + s] = STRIKE_LIMB['ronin_' + s];

// v0.25: spectre uses ronin limb mapping (cloned kit).
for (const s of SLOTS) STRIKE_LIMB['spectre_' + s] = STRIKE_LIMB['ronin_' + s];

// v0.7: floaters have no legs — their kick-family moves are body attacks.
// Leg limbs redirect to the torso for hitbox generation (and the wisp anim
// tracks are authored as body motions to match).
export const FLOATER_LIMB = {
  footR: 'chest', footL: 'chest',
  lowerLegR: 'chest', lowerLegL: 'chest',
  upperLegR: 'chest', upperLegL: 'chest',
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
  // ---- v0.7: wisp body-attack poses (floaters have no legs; kick-family
  // moves become whole-body slams/spins. Hitboxes generate from the
  // 'striker' bone at the body's leading edge.) ----
  WISP_COIL: { // twist back, compress — anticipation
    hips: [0, 0.7, 0.08], spine: [0, 0, 0.35], chest: [0, 0, 0.3], head: [0, 0, 0.25],
    upperArmR: [0, 0, 1.8], lowerArmR: [0, 0, 0.6],
    upperArmL: [0, 0, -1.8], lowerArmL: [0, 0, -0.6],
  },
  WISP_SLAM: { // twist into the slam, leading edge extends (S3 probe: best reach)
    hips: [0, 0.4, -0.1], spine: [0, 0, -0.2], chest: [0, 0, -0.15], head: [0, 0, -0.1],
    upperArmR: [0, 0, 2.0], lowerArmR: [0, 0, 0.3],
    upperArmL: [0, 0, -2.0], lowerArmL: [0, 0, -0.3],
  },
  WISP_SPIN: { // horizontal body spin (hips yaw overridden per keyframe)
    hips: [0, 1.4, 0], spine: [0, 0, -0.25], chest: [0, 0, -0.2], head: [0, 0, -0.15],
    upperArmR: [0, 0, 2.6], lowerArmR: [0, 0, 0.2],
    upperArmL: [0, 0, -2.6], lowerArmL: [0, 0, -0.2],
  },
  WISP_UP: { // body upright, stretched skyward — the head is the strike
    hips: [0, 0, 0], spine: [0, 0, 0.05], chest: [0, 0, 0.05], head: [0, 0, 0.05],
    upperArmR: [0, 0, 2.6], lowerArmR: [0, 0, 0.2],
    upperArmL: [0, 0, -2.6], lowerArmL: [0, 0, -0.2],
  },
  WISP_LOWSPIN: { // pitched-down body spin for the low sweep (yaw overridden)
    hips: [0, 1.0, -0.18], spine: [0, 0, -0.45], chest: [0, 0, -0.35], head: [0, 0, -0.25],
    upperArmR: [0, 0, 2.4], lowerArmR: [0, 0, 0.2],
    upperArmL: [0, 0, -2.4], lowerArmL: [0, 0, -0.2],
  },
  WISP_DOWN: { // pitch down, body slams earthward
    hips: [0, 0, -0.15], spine: [0, 0, -0.6], chest: [0, 0, -0.5], head: [0, 0, -0.4],
    upperArmR: [0, 0, 2.4], upperArmL: [0, 0, -2.4],
  },
  // ---- v0.22: bruiser headbutt poses (big-head styles lead with the skull).
  // Convention: +z = lean back, -z = crunch forward (fighter faces +X). ----
  BUTT_WINDUP: { // rear the head back, coil — anticipation
    head: [0, 0, 0.5], neck: [0, 0, 0.2],
    spine: [0, 0, 0.25], chest: [0, 0, 0.18], hips: [0, 0, -0.12],
    upperArmR: [0, 0, 0.6], lowerArmR: [0, 0, 1.3],
    upperArmL: [0, 0, 0.6], lowerArmL: [0, 0, 1.3],
    upperLegR: [0, 0, -0.3], lowerLegR: [0, 0, 0.6],
    upperLegL: [0, 0, 0.25], lowerLegL: [0, 0, -0.15],
  },
  BUTT_SMASH: { // forehead drives forward — whole torso crunches into it.
    // Head bone must TRANSLATE forward (it pivots in place when pitched),
    // so the hips shift and the torso jackknifes over the front leg.
    head: [0, 0, -0.6], neck: [0, 0, -0.25],
    spine: [0, 0, -0.55], chest: [0, 0, -0.4], hips: [0.28, 0, 0.1],
    upperArmR: [0, 0, 1.0], lowerArmR: [0, 0, 1.5],
    upperArmL: [0, 0, 1.0], lowerArmL: [0, 0, 1.5],
    upperLegR: [0, 0, 0.55], lowerLegR: [0, 0, -0.35],
    upperLegL: [0, 0, -0.45], lowerLegL: [0, 0, 0.7],
  },
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
    upperLegR: [0, 0, 1.1], lowerLegR: [0, 0, -0.5], footR: [0, 0, 0.3],
    upperLegL: [0, 0, 0.15], lowerLegL: [0, 0, -0.5],
    spine: [0, 0, -0.15], chest: [0, 0.1, -0.08], hips: [0, 0, -0.06],
    upperArmR: [0, 0, 0.5], upperArmL: [0, 0, -0.9],
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
    // v0.24: earliest frame a connected hit can cancel recovery (jab chains).
    // Defaults to after the last active frame (see engine hit-cancel).
    cancelFrom: cfg.cancelFrom || null,
  };
}

// ---------------------------------------------------------------------------
// RONIN — mid class, balanced all-rounder
// ---------------------------------------------------------------------------

const ronin = {
  jab: mv('ronin', 'jab', {
    name: 'Jab Combo', startup: 3, active: 4, total: 22, kbClass: 'weak', lunge: [0.06, 0],
    cancelFrom: 6, // v0.24: jabs chain — cancel into the next one right after the first hit
    hits: [
      H(0.85, 1.25, 0.7, 0.5, 2, 30, 20, 40, 3, 5),
      H(0.85, 1.25, 0.7, 0.5, 3, 40, 28, 60, 11, 13),
    ],
    // v0.7: 1-2 rhythm — coil, snap, hold, pull back, snap, hold, settle.
    anim: [K(0, 'NEUTRAL'), K(2 / 22, 'WINDUP_SHORT'), K(3 / 22, 'JAB_R'), K(6 / 22, 'JAB_R'), K(10 / 22, 'WINDUP_SHORT'), K(11 / 22, 'JAB_R'), K(14 / 22, 'JAB_R'), K(1, 'NEUTRAL')],
  }),
  ftilt: mv('ronin', 'ftilt', {
    name: 'Side Kick', startup: 6, active: 4, total: 30, kbClass: 'neutral', lunge: [0.10, 0],
    hits: [H(0.95, 0.9, 0.9, 0.7, 13, 35, 35, 90, 6, 10)],
    anim: [K(0, 'NEUTRAL'), K(5 / 30, 'WINDUP_KICK_R'), K(6 / 30, 'KICK_R'), K(10 / 30, 'KICK_R'), K(1, 'NEUTRAL')],
  }),
  utilt: mv('ronin', 'utilt', {
    name: 'Rising Palm', startup: 5, active: 6, total: 28, kbClass: 'neutral',
    hits: [H(0.7, 1.7, 0.8, 0.8, 10, 88, 30, 100, 5, 11)],
    anim: [K(0, 'NEUTRAL'), K(4 / 28, 'CROUCH'), K(5 / 28, 'PALM'), K(11 / 28, 'PALM'), K(1, 'NEUTRAL')],
  }),
  dtilt: mv('ronin', 'dtilt', {
    name: 'Low Sweep', startup: 7, active: 4, total: 30, kbClass: 'neutral',
    hits: [H(0.7, 0.35, 0.9, 0.45, 12, 25, 32, 85, 7, 11)],
    anim: [K(0, 'NEUTRAL'), K(6 / 30, 'CROUCH'), K(7 / 30, 'SWEEP'), K(11 / 30, 'SWEEP'), K(1, 'NEUTRAL')],
  }),
  fsmash: mv('ronin', 'fsmash', {
    name: 'Blade Rush', startup: 12, active: 4, total: 48, kbClass: 'strong', lunge: [0.22, 0],
    hits: [H(0.85, 1.05, 0.9, 0.6, 18, 35, 45, 110, 12, 16)],
    anim: [K(0, 'NEUTRAL'), K(11 / 48, 'WINDUP_R'), K(12 / 48, 'PUNCH_R'), K(16 / 48, 'PUNCH_R'), K(1, 'NEUTRAL')],
  }),
  usmash: mv('ronin', 'usmash', {
    name: 'Skyward Fist', startup: 9, active: 8, total: 52, kbClass: 'kill',
    hits: [H(0.85, 1.25, 0.8, 0.8, 19, 88, 50, 120, 9, 17)],
    anim: [K(0, 'NEUTRAL'), K(8 / 52, 'CROUCH'), K(9 / 52, 'UPPERCUT'), K(17 / 52, 'UPPERCUT'), K(1, 'NEUTRAL')],
  }),
  dsmash: mv('ronin', 'dsmash', {
    name: 'Whirlwind Kick', startup: 10, active: 8, total: 50, kbClass: 'strong',
    hits: [
      H(0.05, 0.55, 0.9, 0.7, 17, 30, 45, 105, 10, 14),
      H(-0.85, 0.55, 0.9, 0.7, 17, 150, 45, 105, 14, 18),
    ],
    anim: [K(0, 'NEUTRAL'), K(9 / 50, 'CROUCH'), K(10 / 50, 'SPIN_A', { hips: [0, 1.5, 0] }), K(14 / 50, 'SPIN_A', { hips: [0, 3.1, 0] }), K(18 / 50, 'SPIN_A', { hips: [0, 4.7, 0] }), K(1, 'NEUTRAL')],
  }),
  nair: mv('ronin', 'nair', {
    name: 'Cyclone Elbow', startup: 3, active: 20, total: 40, kbClass: 'neutral',
    hits: [H(0, 1.1, 1.2, 0.8, 13, 40, 32, 90, 3, 23)],
    anim: [K(0, 'NEUTRAL'), K(2 / 40, 'SPIN_A', { hips: [0, 0.2, 0] }), K(3 / 40, 'SPIN_A', { hips: [0, 0.8, 0] }), K(13 / 40, 'SPIN_A', { hips: [0, 2.8, 0] }), K(23 / 40, 'SPIN_A', { hips: [0, 4.8, 0] }), K(1, 'NEUTRAL')],
  }),
  fair: mv('ronin', 'fair', {
    name: 'Comet Fist', startup: 14, active: 6, total: 44, kbClass: 'strong', lunge: [0.08, 0],
    hits: [H(0.8, 1.15, 0.75, 0.6, 15, 20, 40, 100, 14, 20)],
    anim: [K(0, 'NEUTRAL'), K(13 / 44, 'WINDUP_R'), K(14 / 44, 'PUNCH_R'), K(20 / 44, 'PUNCH_R'), K(1, 'NEUTRAL')],
  }),
  bair: mv('ronin', 'bair', {
    name: 'Back Kick', startup: 11, active: 6, total: 42, kbClass: 'strong',
    hits: [H(-0.15, 1.45, 0.8, 0.7, 15, 145, 40, 100, 11, 17)],
    anim: [K(0, 'NEUTRAL'), K(10 / 42, 'WINDUP_R'), K(11 / 42, 'ELBOW_BACK'), K(17 / 42, 'ELBOW_BACK'), K(1, 'NEUTRAL')],
  }),
  uair: mv('ronin', 'uair', {
    name: 'Helm Splitter', startup: 2, active: 10, total: 34, kbClass: 'neutral',
    hits: [H(0.6, 1.8, 0.7, 1.0, 11, 85, 30, 95, 2, 12)],
    anim: [K(0, 'NEUTRAL'), K(1 / 34, 'CROUCH'), K(2 / 34, 'OVERHEAD'), K(12 / 34, 'OVERHEAD'), K(1, 'NEUTRAL')],
  }),
  dair: mv('ronin', 'dair', {
    name: 'Drill Stomp', startup: 16, active: 12, total: 48, kbClass: 'neutral',
    hits: [
      H(0.3, 0.25, 0.8, 0.6, 4, 270, 15, 40, 16, 20),
      H(0.3, 0.25, 0.8, 0.6, 4, 270, 15, 40, 20, 24),
      H(0.3, 0.25, 0.8, 0.6, 4, 60, 25, 60, 24, 28),
    ],
    anim: [K(0, 'NEUTRAL'), K(15 / 48, 'CROUCH'), K(16 / 48, 'STOMP'), K(20 / 48, 'STOMP'), K(24 / 48, 'STOMP'), K(28 / 48, 'STOMP'), K(1, 'NEUTRAL')],
  }),
  nspecial: mv('ronin', 'nspecial', {
    name: 'Ember Shot', startup: 10, active: 2, total: 36, kbClass: 'weak', special: 'fireball',
    hits: [],
    projectile: { speed: 9, dmg: 7, angle: 30, baseKB: 25, kbGrowth: 60, w: 0.5, h: 0.5, life: 120, gravity: 0.25 },
    anim: [K(0, 'NEUTRAL'), K(9 / 36, 'WINDUP_SHORT'), K(10 / 36, 'FIREBALL'), K(12 / 36, 'FIREBALL'), K(1, 'NEUTRAL')],
  }),
  sspecial: mv('ronin', 'sspecial', {
    name: 'Cyclone Spin', startup: 10, active: 14, total: 44, kbClass: 'neutral', special: 'spin', lunge: [0, 0.03],
    hits: [H(0, 1.25, 1.4, 1.2, 12, 45, 40, 95, 10, 24)],
    anim: [K(0, 'NEUTRAL'), K(9 / 44, 'CROUCH'), K(10 / 44, 'TORNADO_A', { hips: [0, 1.5, 0] }), K(17 / 44, 'TORNADO_A', { hips: [0, 3.5, 0] }), K(24 / 44, 'TORNADO_A', { hips: [0, 5.5, 0] }), K(1, 'NEUTRAL')],
  }),
  uspecial: mv('ronin', 'uspecial', {
    name: 'Rising Punch', startup: 4, active: 10, total: 50, kbClass: 'strong', special: 'rise', lunge: [0, 0],
    hits: [
      H(0.9, 1.4, 0.7, 0.7, 5, 80, 40, 80, 4, 7),
      H(0.85, 1.35, 0.7, 0.7, 9, 80, 45, 100, 7, 14),
    ],
    anim: [K(0, 'NEUTRAL'), K(3 / 50, 'CROUCH'), K(4 / 50, 'RISE_B'), K(7 / 50, 'RISE_B'), K(14 / 50, 'RISE_B'), K(1, 'NEUTRAL')],
  }),
  dspecial: mv('ronin', 'dspecial', {
    name: 'Tornado', startup: 1, active: 20, total: 44, kbClass: 'weak', special: 'tornado',
    hits: [
      H(0, 1.25, 1.3, 1.3, 3, 75, 12, 30, 1, 5),
      H(0, 1.25, 1.3, 1.3, 3, 75, 12, 30, 5, 9),
      H(0, 1.25, 1.3, 1.3, 3, 75, 12, 30, 9, 13),
      H(0, 1.25, 1.3, 1.3, 3, 75, 12, 30, 13, 17),
      H(0, 1.25, 1.3, 1.3, 3, 75, 12, 30, 17, 21),
    ],
    // v0.7: startup 1 — no room for a coil key; opens straight into the spin.
    anim: [K(0, 'NEUTRAL'), K(1 / 44, 'TORNADO_A', { hips: [0, 1, 0] }), K(11 / 44, 'TORNADO_A', { hips: [0, 3, 0] }), K(21 / 44, 'TORNADO_A', { hips: [0, 5, 0] }), K(1, 'NEUTRAL')],
  }),
};

// ---------------------------------------------------------------------------
// VOLT — heavy class, fast heavyweight
// ---------------------------------------------------------------------------

const volt = {
  jab: mv('volt', 'jab', {
    name: 'Volt Jab', startup: 4, active: 4, total: 24, kbClass: 'weak',
    cancelFrom: 7, // v0.24: jabs chain
    hits: [
      H(0.8, 1.25, 0.7, 0.5, 3, 30, 20, 40, 4, 6),
      H(0.8, 1.25, 0.7, 0.5, 4, 40, 28, 60, 12, 14),
    ],
    anim: [K(0, 'NEUTRAL'), K(3 / 24, 'WINDUP_SHORT'), K(4 / 24, 'JAB_R'), K(7 / 24, 'JAB_R'), K(11 / 24, 'WINDUP_SHORT'), K(12 / 24, 'JAB_R'), K(15 / 24, 'JAB_R'), K(1, 'NEUTRAL')],
  }),
  ftilt: mv('volt', 'ftilt', {
    name: 'Shoulder Check', startup: 8, active: 4, total: 32, kbClass: 'neutral',
    hits: [H(0.35, 1.3, 0.9, 0.7, 14, 35, 38, 95, 8, 12)],
    anim: [K(0, 'NEUTRAL'), K(7 / 32, 'WINDUP_R'), K(8 / 32, 'SHOULDER'), K(12 / 32, 'SHOULDER'), K(1, 'NEUTRAL')],
  }),
  utilt: mv('volt', 'utilt', {
    name: 'Uppercut', startup: 7, active: 5, total: 30, kbClass: 'neutral',
    hits: [H(0.8, 1.3, 0.8, 0.8, 11, 80, 34, 95, 7, 12)],
    anim: [K(0, 'NEUTRAL'), K(6 / 30, 'CROUCH'), K(7 / 30, 'UPPERCUT'), K(12 / 30, 'UPPERCUT'), K(1, 'NEUTRAL')],
  }),
  dtilt: mv('volt', 'dtilt', {
    name: 'Leg Sweep', startup: 9, active: 4, total: 32, kbClass: 'neutral',
    hits: [H(0.75, 0.35, 0.9, 0.45, 12, 28, 34, 90, 9, 13)],
    anim: [K(0, 'NEUTRAL'), K(8 / 32, 'CROUCH'), K(9 / 32, 'SWEEP'), K(13 / 32, 'SWEEP'), K(1, 'NEUTRAL')],
  }),
  fsmash: mv('volt', 'fsmash', {
    name: 'Flame Kick', startup: 14, active: 4, total: 54, kbClass: 'strong', lunge: [0.24, 0],
    hits: [H(0.85, 0.85, 0.9, 0.6, 19, 30, 48, 115, 14, 18)],
    anim: [K(0, 'NEUTRAL'), K(13 / 54, 'WINDUP_KICK_R'), K(14 / 54, 'KICK_R'), K(18 / 54, 'KICK_R'), K(1, 'NEUTRAL')],
  }),
  usmash: mv('volt', 'usmash', {
    name: 'Thunder Clap', startup: 4, active: 6, total: 44, kbClass: 'strong',
    hits: [H(0.7, 1.15, 0.9, 0.8, 16, 88, 48, 110, 4, 10)],
    anim: [K(0, 'NEUTRAL'), K(3 / 44, 'CROUCH'), K(4 / 44, 'CLAP'), K(10 / 44, 'CLAP'), K(1, 'NEUTRAL')],
  }),
  dsmash: mv('volt', 'dsmash', {
    name: 'Ground Pound', startup: 12, active: 8, total: 52, kbClass: 'neutral',
    // v0.2: the POUND pose slams the RIGHT fist down-forward (left fist rises
    // behind) — a single honest hitbox on the right fist replaces the old
    // phantom back-low box.
    hits: [
      H(0.8, 1.0, 0.9, 0.8, 16, 30, 44, 100, 12, 20),
    ],
    anim: [K(0, 'NEUTRAL'), K(11 / 52, 'OVERHEAD'), K(12 / 52, 'POUND'), K(20 / 52, 'POUND'), K(1, 'NEUTRAL')],
  }),
  nair: mv('volt', 'nair', {
    name: 'Volt Spin', startup: 5, active: 16, total: 38, kbClass: 'neutral',
    hits: [H(0, 1.1, 1.2, 0.8, 12, 40, 34, 90, 5, 21)],
    anim: [K(0, 'NEUTRAL'), K(4 / 38, 'SPIN_A', { hips: [0, 0.3, 0] }), K(5 / 38, 'SPIN_A', { hips: [0, 1, 0] }), K(13 / 38, 'SPIN_A', { hips: [0, 3, 0] }), K(21 / 38, 'SPIN_A', { hips: [0, 5, 0] }), K(1, 'NEUTRAL')],
  }),
  fair: mv('volt', 'fair', {
    name: 'Knee Strike', startup: 16, active: 4, total: 46, kbClass: 'kill', lunge: [0.08, 0],
    hits: [H(0.5, 0.85, 0.7, 0.7, 18, 25, 46, 115, 16, 20)],
    anim: [K(0, 'NEUTRAL'), K(15 / 46, 'WINDUP_KICK_R'), K(16 / 46, 'KNEE'), K(20 / 46, 'KNEE'), K(1, 'NEUTRAL')],
  }),
  bair: mv('volt', 'bair', {
    name: 'Reverse Kick', startup: 12, active: 6, total: 42, kbClass: 'neutral',
    hits: [H(-0.6, 0.65, 0.8, 0.7, 14, 145, 40, 100, 12, 18)],
    anim: [K(0, 'NEUTRAL'), K(11 / 42, 'WINDUP_KICK_R'), K(12 / 42, 'KICK_BACK'), K(18 / 42, 'KICK_BACK'), K(1, 'NEUTRAL')],
  }),
  uair: mv('volt', 'uair', {
    name: 'Sky Kick', startup: 6, active: 8, total: 36, kbClass: 'neutral',
    hits: [H(0.65, 1.5, 0.8, 1.0, 12, 85, 36, 95, 6, 14)],
    anim: [K(0, 'NEUTRAL'), K(5 / 36, 'CROUCH'), K(6 / 36, 'KICK_UP'), K(14 / 36, 'KICK_UP'), K(1, 'NEUTRAL')],
  }),
  dair: mv('volt', 'dair', {
    name: 'Meteor Stomp', startup: 14, active: 8, total: 44, kbClass: 'strong',
    hits: [H(0.4, 0.15, 0.8, 0.6, 13, 270, 30, 80, 14, 22)],
    anim: [K(0, 'NEUTRAL'), K(13 / 44, 'CROUCH'), K(14 / 44, 'STOMP'), K(22 / 44, 'STOMP'), K(1, 'NEUTRAL')],
  }),
  nspecial: mv('volt', 'nspecial', {
    name: 'Volt Punch', startup: 38, active: 4, total: 70, kbClass: 'kill', special: 'punch', lunge: [0.10, 0],
    hits: [H(0.55, 0.9, 0.9, 0.7, 26, 35, 60, 130, 38, 42)],
    anim: [K(0, 'NEUTRAL'), K(20 / 70, 'BIG_WINDUP'), K(37 / 70, 'BIG_WINDUP'), K(38 / 70, 'BIG_PUNCH'), K(42 / 70, 'BIG_PUNCH'), K(1, 'NEUTRAL')],
  }),
  sspecial: mv('volt', 'sspecial', {
    name: 'Railgun Dash', startup: 12, active: 12, total: 46, kbClass: 'neutral', special: 'spin', lunge: [0, 0.02],
    hits: [H(0.1, 1.25, 1.3, 1.0, 14, 40, 44, 100, 12, 24)],
    anim: [K(0, 'NEUTRAL'), K(11 / 46, 'CROUCH'), K(12 / 46, 'DASH_POSE'), K(24 / 46, 'DASH_POSE'), K(1, 'NEUTRAL')],
  }),
  uspecial: mv('volt', 'uspecial', {
    name: 'Volt Dive', startup: 6, active: 12, total: 54, kbClass: 'strong', special: 'divegrab', lunge: [0.04, 0],
    hits: [H(0.75, 1.0, 1.0, 1.0, 20, 70, 55, 115, 6, 18)],
    anim: [K(0, 'NEUTRAL'), K(5 / 54, 'CROUCH'), K(6 / 54, 'GRAB'), K(18 / 54, 'GRAB'), K(1, 'NEUTRAL')],
  }),
  dspecial: mv('volt', 'dspecial', {
    name: 'Volt Kick', startup: 10, active: 16, total: 48, kbClass: 'neutral', special: 'divekick', lunge: [0.03, -0.03],
    hits: [H(0.6, 0.6, 0.9, 0.8, 15, 300, 40, 95, 10, 26)],
    anim: [K(0, 'NEUTRAL'), K(9 / 48, 'CROUCH'), K(10 / 48, 'DIVEKICK'), K(26 / 48, 'DIVEKICK'), K(1, 'NEUTRAL')],
  }),
};

// v0.6: WISP runs the VOLT kit (fast kit suits a ghost). Cloned with wisp_
// ids so the Lab's isNative() check treats them as native (free, not stolen).
const wisp = {};
for (const s of SLOTS) wisp[s] = { ...volt[s], id: 'wisp_' + s };
// v0.7: wisp hitboxes are honest to the ghost's body, not volt's kick
// positions — deep-clone the hits so wisp anchors are independent.
for (const s of SLOTS) wisp[s].hits = volt[s].hits.map((h) => ({ ...h }));
// v0.7: wisp-specific anchors, measured from the body-attack strike poses
// (striker bone / head). Same sizes, damage, angles, KB — only the positional
// anchor moves to where the ghost's body actually is.
const WISP_ANCHOR = {
  jab: [[0.95, 0.9], [0.95, 0.9]],
  ftilt: [[0.45, 0.9]],
  utilt: [[1.0, 1.0]],
  dtilt: [[0.25, 0.7]],
  fsmash: [[0.45, 0.9]],
  usmash: [[0.9, 0.9]],
  dsmash: [[0.95, 0.65]],
  bair: [[-0.4, 0.95]],
  uair: [[0, 1.35]],
  dair: [[0.35, 0.6]],
  nspecial: [[0.65, 0.5]],
  uspecial: [[0.95, 0.7]],
};
for (const [slot, pts] of Object.entries(WISP_ANCHOR)) {
  pts.forEach(([dx, dy], j) => { wisp[slot].hits[j].dx = dx; wisp[slot].hits[j].dy = dy; });
}

// v0.7: wisp kick-family moves are BODY attacks (no legs on a ghost) — same
// frame data as volt's, re-authored tracks using torso/whole-body motion.
// Hitboxes generate from the 'striker' bone (body's leading edge).
// Names renamed to match the new visuals.
wisp.ftilt.name = 'Spectral Check';
wisp.ftilt.anim = [K(0, 'NEUTRAL'), K(7 / 32, 'WISP_COIL'), K(8 / 32, 'WISP_SLAM'), K(12 / 32, 'WISP_SLAM'), K(1, 'NEUTRAL')];
wisp.fsmash.name = 'Spectral Slam';
wisp.fsmash.anim = [K(0, 'NEUTRAL'), K(13 / 54, 'WISP_COIL'), K(14 / 54, 'WISP_SLAM'), K(18 / 54, 'WISP_SLAM'), K(1, 'NEUTRAL')];
wisp.fair.name = 'Comet Body';
wisp.fair.anim = [K(0, 'NEUTRAL'), K(15 / 46, 'WISP_COIL'), K(16 / 46, 'WISP_SLAM'), K(20 / 46, 'WISP_SLAM'), K(1, 'NEUTRAL')];
wisp.bair.name = 'Back Spin';
wisp.bair.anim = [K(0, 'NEUTRAL'), K(11 / 42, 'WISP_COIL'), K(12 / 42, 'WISP_SPIN', { hips: [0, 2.6, 0] }), K(18 / 42, 'WISP_SPIN', { hips: [0, 2.6 + Math.PI, 0] }), K(1, 'NEUTRAL')];
wisp.uair.name = 'Rising Wisp';
wisp.uair.anim = [K(0, 'NEUTRAL'), K(5 / 36, 'WISP_COIL'), K(6 / 36, 'WISP_UP'), K(14 / 36, 'WISP_UP'), K(1, 'NEUTRAL')];
wisp.dair.name = 'Plunge';
wisp.dair.anim = [K(0, 'NEUTRAL'), K(13 / 44, 'WISP_COIL'), K(14 / 44, 'WISP_DOWN'), K(22 / 44, 'WISP_DOWN'), K(1, 'NEUTRAL')];
wisp.dtilt.name = 'Low Spin';
wisp.dtilt.anim = [K(0, 'NEUTRAL'), K(8 / 32, 'WISP_COIL'), K(9 / 32, 'WISP_LOWSPIN', { hips: [0, 1.0, -0.18] }), K(13 / 32, 'WISP_LOWSPIN', { hips: [0, 1.0 + Math.PI, -0.18] }), K(1, 'NEUTRAL')];
wisp.dspecial.name = 'Dive Bomb';
wisp.dspecial.anim = [K(0, 'NEUTRAL'), K(9 / 48, 'WISP_COIL'), K(10 / 48, 'WISP_DOWN'), K(26 / 48, 'WISP_DOWN'), K(1, 'NEUTRAL')];

// ---------------------------------------------------------------------------
// v0.22: BRUISER — headbutt overlay kit for big-head styles (headbutts flag).
// Not a standalone kit: fighters.js swaps jab/fsmash in over the style's base
// kit. The Lab can also assign these moves manually (findMoveById searches all
// of MOVES). Hitboxes track the head bone (STRIKE_LIMB 'head', like wisp_uair).
// ---------------------------------------------------------------------------
const bruiser = {
  jab: mv('bruiser', 'jab', {
    name: 'Headbutt', startup: 4, active: 5, total: 26, kbClass: 'weak', lunge: [0.14, 0],
    cancelFrom: 10, // v0.24: jabs chain
    hits: [H(0.35, 1.4, 0.85, 0.65, 7, 32, 28, 70, 4, 9)],
    anim: [K(0, 'NEUTRAL'), K(3 / 26, 'BUTT_WINDUP'), K(4 / 26, 'BUTT_SMASH'), K(9 / 26, 'BUTT_SMASH'), K(1, 'NEUTRAL')],
  }),
  fsmash: mv('bruiser', 'fsmash', {
    name: 'Skull Bash', startup: 13, active: 5, total: 52, kbClass: 'strong', lunge: [0.22, 0],
    hits: [H(0.4, 1.35, 1.0, 0.8, 19, 28, 48, 110, 13, 18)],
    anim: [K(0, 'NEUTRAL'), K(11 / 52, 'CROUCH'), K(12 / 52, 'BUTT_WINDUP'), K(13 / 52, 'BUTT_SMASH'), K(18 / 52, 'BUTT_SMASH'), K(1, 'NEUTRAL')],
  }),
};

// ---------------------------------------------------------------------------
// v0.24: BLITZ — rushdown kit. Cloned from ronin, retuned: -4 total, 0.7x
// damage, 0.8x baseKB. Frame numbers SCALE with the new total (preserving the
// move's rhythm), so the normalized anim tracks stay synced with the hits.
// ---------------------------------------------------------------------------
// v0.40: blitz names in his own voice (was: only the jab was renamed, the
// tilts/aerials still answered to ronin's names in the Lab).
const BLITZ_NAMES = {
  ftilt: 'Rush Kick', utilt: 'Snap Palm', dtilt: 'Ankle Biter',
  fsmash: 'Blur Rush', usmash: 'Sky Snap', dsmash: 'Cyclone Heel',
  nair: 'Blur Spin', fair: 'Dart Fist', bair: 'Heel Flick',
  uair: 'Helm Flick', dair: 'Dive Stomp', nspecial: 'Ember Dart',
  sspecial: 'Blur Cyclone', uspecial: 'Rising Snap', dspecial: 'Blur Tornado',
};
const blitz = {};
for (const slot of SLOTS) {
  const src = ronin[slot];
  if (!src) continue;
  // v0.24: spin moves (dsmash) keep ronin timing — the continuous hip rotation
  // doesn't survive frame scaling (hitbox_sync).
  if (slot === 'dsmash') {
    blitz[slot] = { ...src, id: 'blitz_dsmash', name: BLITZ_NAMES.dsmash, hits: src.hits.map((h) => ({ ...h })) };
    continue;
  }
  const newTotal = Math.max(10, src.total - 4);
  const sc = newTotal / src.total;
  const q = (f) => Math.max(1, Math.round(f * sc));
  const newHits = src.hits.map((h) => ({
    ...h,
    from: q(h.from),
    to: Math.max(q(h.from), q(h.to)),
    dmg: Math.max(1, Math.round(h.dmg * 0.7)),
    baseKB: h.baseKB * 0.8,
  }));
  // v0.24: deep-clone the anim. Strike keyframes must EXACTLY match the hit
  // fractions (anim.js isStrike uses 1e-9) — remap any keyframe that sat on
  // an old hit start to the new hit start.
  const oldStrikeT = src.hits.map((h) => h.from / src.total);
  const newStrikeT = newHits.map((h) => h.from / newTotal);
  const anim = src.anim.map((k) => {
    const idx = oldStrikeT.findIndex((st) => Math.abs(k.t - st) < 1e-9);
    return { t: idx >= 0 ? newStrikeT[idx] : k.t, bones: { ...k.bones } };
  });
  blitz[slot] = {
    ...src,
    id: 'blitz_' + slot,
    name: BLITZ_NAMES[slot] || src.name,
    startup: Math.max(2, q(src.startup)),
    total: newTotal,
    cancelFrom: src.cancelFrom ? Math.max(2, q(src.cancelFrom)) : null,
    anim,
    hits: newHits,
    // recompute cost on the retuned damage
    cost: moveCost(newHits.reduce((s, h) => s + h.dmg, 0), Math.max(2, q(src.startup)), src.kbClass),
  };
}
// Blitz jab is a true flurry: 3 rapid hits, chains into itself from frame 4.
blitz.jab = {
  ...blitz.jab,
  name: 'Flurry Jab',
  startup: 2, total: 20, cancelFrom: 4,
  hits: [
    H(0.85, 1.25, 0.7, 0.5, 2, 30, 18, 40, 2, 3),
    H(0.85, 1.25, 0.7, 0.5, 2, 30, 18, 40, 6, 7),
    H(0.85, 1.25, 0.7, 0.5, 3, 40, 24, 60, 10, 12),
  ],
  anim: [K(0, 'NEUTRAL'), K(1 / 20, 'WINDUP_SHORT'), K(2 / 20, 'JAB_R'), K(4 / 20, 'JAB_R'), K(5 / 20, 'WINDUP_SHORT'), K(6 / 20, 'JAB_R'), K(8 / 20, 'JAB_R'), K(9 / 20, 'WINDUP_SHORT'), K(10 / 20, 'JAB_R'), K(12 / 20, 'JAB_R'), K(1, 'NEUTRAL')],
};
blitz.jab.cost = moveCost(7, 2, 'weak');

// ---------------------------------------------------------------------------
// v0.25: SPECTRE — zoner kit. Cloned from ronin, retuned: +2 total (a touch
// slower), 0.8x damage, 0.9x baseKB, 1.15x hitbox size (range bias). Strike
// poses are UNCHANGED so anchors stay put (hitbox_sync) — only hitbox sizes
// grow. Frame numbers SCALE with the new total (blitz pattern), with strike
// keyframes remapped to the new hit fractions (anim.js isStrike is exact).
// dsmash keeps ronin timing (continuous hip-spin breaks under scaling).
// nspecial/sspecial/fsmash are projectile moves, authored fresh below.
// ---------------------------------------------------------------------------
const SPECTRE_NAMES = {
  jab: 'Hex Jab', ftilt: 'Arcane Kick', utilt: 'Warding Palm', dtilt: 'Low Rune',
  fsmash: 'Aether Cannon', usmash: 'Skyward Hex', dsmash: 'Void Spin',
  nair: 'Hex Orbit', fair: 'Comet Hex', bair: 'Hex Back', uair: 'Aether Helm',
  dair: 'Void Stomp', nspecial: 'Hex Bolt', sspecial: 'Arc Shot',
  uspecial: 'Void Rise', dspecial: 'Hex Storm',
};
const spectre = {};
for (const slot of SLOTS) {
  const src = ronin[slot];
  if (!src) continue;
  if (slot === 'dsmash') {
    spectre[slot] = { ...src, id: 'spectre_dsmash', name: SPECTRE_NAMES.dsmash, hits: src.hits.map((h) => ({ ...h })) };
    continue;
  }
  const newTotal = src.total + 2;
  const sc = newTotal / src.total;
  const q = (f) => Math.max(1, Math.round(f * sc));
  const newHits = src.hits.map((h) => ({
    ...h,
    from: q(h.from),
    to: Math.max(q(h.from), q(h.to)),
    dmg: Math.max(1, Math.round(h.dmg * 0.8)),
    baseKB: h.baseKB * 0.9,
    w: h.w * 1.15, h: h.h * 1.15,
  }));
  const oldStrikeT = src.hits.map((h) => h.from / src.total);
  const newStrikeT = newHits.map((h) => h.from / newTotal);
  const anim = src.anim.map((k) => {
    const idx = oldStrikeT.findIndex((st) => Math.abs(k.t - st) < 1e-9);
    return { t: idx >= 0 ? newStrikeT[idx] : k.t, bones: { ...k.bones } };
  });
  spectre[slot] = {
    ...src,
    id: 'spectre_' + slot,
    name: SPECTRE_NAMES[slot],
    startup: Math.max(2, q(src.startup)),
    total: newTotal,
    cancelFrom: src.cancelFrom ? Math.max(2, q(src.cancelFrom)) : null,
    anim,
    hits: newHits,
    cost: moveCost(newHits.reduce((s, h) => s + h.dmg, 0), Math.max(2, q(src.startup)), src.kbClass),
  };
}
// v0.25: projectile moves — fireSpecial's 'fireball' spawns the projectile at
// the startup frame; the FIREBALL pose keyframe sits exactly on it.
spectre.nspecial = mv('spectre', 'nspecial', {
  name: 'Hex Bolt', startup: 8, active: 2, total: 30, kbClass: 'weak', special: 'fireball',
  hits: [],
  projectile: { speed: 11, dmg: 5, angle: 30, baseKB: 22, kbGrowth: 55, w: 0.45, h: 0.45, life: 150, gravity: 0.15 },
  anim: [K(0, 'NEUTRAL'), K(7 / 30, 'WINDUP_SHORT'), K(8 / 30, 'FIREBALL'), K(10 / 30, 'FIREBALL'), K(1, 'NEUTRAL')],
});
spectre.sspecial = mv('spectre', 'sspecial', {
  name: 'Arc Shot', startup: 14, active: 2, total: 42, kbClass: 'neutral', special: 'fireball',
  hits: [],
  projectile: { speed: 7, dmg: 8, angle: 55, baseKB: 30, kbGrowth: 70, w: 0.5, h: 0.5, life: 160, gravity: 0.6 },
  anim: [K(0, 'NEUTRAL'), K(12 / 42, 'WINDUP_R'), K(14 / 42, 'FIREBALL'), K(17 / 42, 'FIREBALL'), K(1, 'NEUTRAL')],
});
// v0.25: the charged projectile smash — charge it like any smash (hold the
// smash button); the charge multiplier rides on the projectile record (pow).
spectre.fsmash = mv('spectre', 'fsmash', {
  name: 'Aether Cannon', startup: 12, active: 2, total: 50, kbClass: 'strong', special: 'fireball',
  hits: [],
  projectile: { speed: 9, dmg: 13, angle: 35, baseKB: 35, kbGrowth: 95, w: 0.6, h: 0.6, life: 140, gravity: 0.1 },
  anim: [K(0, 'NEUTRAL'), K(10 / 50, 'BIG_WINDUP'), K(12 / 50, 'FIREBALL'), K(16 / 50, 'FIREBALL'), K(1, 'NEUTRAL')],
});

export const MOVES = { ronin, volt, wisp, bruiser, blitz, spectre };
