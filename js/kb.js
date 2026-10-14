// js/kb.js — pure knockback math for SMASHVR. No three.js import.
// Shared contract: the fighter-side defs supply weight / baseKB / kbGrowth;
// the engine consumes knockback(), hitstunFrames(), launchVelocity().

export const TUNING = {
  // hitstun frames = floor(kb * HITSTUN_SCALE)
  HITSTUN_SCALE: 0.4,
  // launch speed in world-units/frame = kb * LAUNCH_VEL_SCALE.
  // Feel pass v0.2 (2026-10-13): raised for snappy launches + per-tick
  // hitstun drag (HITSTUN_DRAG) so KO distance stays calibrated:
  // fsmash side-blast KOs ~82-86% from x=4.5. (S64's 0.03 maps to S64's ~180u
  // stages; ours is 14u wide with blast at +/-13.)
  LAUNCH_VEL_SCALE: 0.0018,
  // knockback decay applied to vx once per tick while in hitstun — launches
  // start fast and decay instead of drifting at constant speed. Calibrated
  // together with LAUNCH_VEL_SCALE (see above).
  HITSTUN_DRAG: 0.97,
  // sanity cap so a data typo can't fling someone to the moon
  MAX_LAUNCH: 1.0,
};

// Smash-64-flavored knockback, retuned v0.2 for dramatic percent scaling:
// the pure-percent term (pct/6) makes percent matter even for low-damage
// moves (jab used to feel flat: 0.20u -> 0.61u from 0% to 180%; now
// 0.28u -> 1.45u with clearly different launch speeds at each step).
// pct = defender's percent AFTER this hit's damage is added.
// weight ~ 80 (floaty) .. 120 (heavy). baseKB shifts the floor, kbGrowth
// scales the percent-driven part.
export function knockback(pct, dmg, weight, baseKB, kbGrowth) {
  const w = Math.max(40, weight);
  const wfac = (200 / (w + 100)) * 1.4;
  let kb = (((pct / 10 + (pct * dmg) / 20 + pct / 6) * wfac) + 10);
  kb = kb * (kbGrowth / 100) + baseKB;
  return Math.max(0, kb);
}

export function hitstunFrames(kb) {
  return Math.floor(kb * TUNING.HITSTUN_SCALE);
}

// angleDeg: 0 = horizontal (toward dir), 90 = straight up.
// dir: +1 | -1, the attacker's facing. Returns [vx, vy] in units/frame.
export function launchVelocity(kb, angleDeg, dir) {
  const speed = Math.min(kb * TUNING.LAUNCH_VEL_SCALE, TUNING.MAX_LAUNCH);
  const rad = (angleDeg * Math.PI) / 180;
  return [Math.cos(rad) * speed * dir, Math.sin(rad) * speed];
}
