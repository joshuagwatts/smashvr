// js/rng.js — seeded PRNG for the deterministic sim (v0.11 netplay).
// All gameplay randomness (AI decisions, spawn positions) draws from a
// mulberry32 stream seeded per match and synced to every client. Visual-only
// randomness (particles, camera shake) keeps using Math.random — it never
// feeds back into gameplay state.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 9-bool input hold struct <-> 9-bit int, for the wire.
export function packInput(h) {
  let b = 0;
  if (h.left) b |= 1; if (h.right) b |= 2; if (h.up) b |= 4;
  if (h.down) b |= 8; if (h.jump) b |= 16; if (h.attack) b |= 32;
  if (h.smash) b |= 64; if (h.special) b |= 128; if (h.shield) b |= 256;
  return b;
}

export function unpackInput(b) {
  return {
    left: !!(b & 1), right: !!(b & 2), up: !!(b & 4),
    down: !!(b & 8), jump: !!(b & 16), attack: !!(b & 32),
    smash: !!(b & 64), special: !!(b & 128), shield: !!(b & 256),
  };
}

export const PACKED_BLANK = 0;

// 6-char lobby code from Math.random (lobby layer only — never the sim).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function lobbyCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}
