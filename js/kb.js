// js/kb.js — pure knockback math for SMASHVR. No three.js import.
// Shared contract: the fighter-side defs supply weight / baseKB / kbGrowth;
// the engine consumes knockback(), hitstunFrames(), launchVelocity().

export const TUNING = {
  // hitstun frames = floor(kb * HITSTUN_SCALE)
  HITSTUN_SCALE: 0.4,
  // launch speed in world-units/frame = kb * LAUNCH_VEL_SCALE.
  // Rebalanced 2026-10-13 for the 14u stage / +/-13 blast zones:
  // fsmash side-blast KOs ~trial-72% (actual ~90%) from x=4.5, ~100%+ from
  // center; jab pokes at 0% travel ~0.15u. (S64's 0.03 maps to S64's ~180u
  // stages.)
  LAUNCH_VEL_SCALE: 0.0009,
  // sanity cap so a data typo can't fling someone to the moon
  MAX_LAUNCH: 1.0,
};

// Smash-64-flavored knockback. pct = defender's percent AFTER this hit's
// damage is added. weight ~ 80 (floaty) .. 120 (heavy). baseKB shifts the
// floor, kbGrowth scales the percent-driven part.
export function knockback(pct, dmg, weight, baseKB, kbGrowth) {
  const w = Math.max(40, weight);
  let kb = (((pct / 10 + (pct * dmg) / 20) * (200 / (w + 100)) * 1.4) + 18);
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
