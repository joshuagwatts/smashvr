/* test/angle_bands.mjs — Directive 2 (v0.2 feel pass).
   Every hitbox's knockback angle must sit in the band its visual demands.
   Angles: 0 = forward (attacker's facing), 90 = straight up, 180 = backward,
   270 = straight down (meteor). Run: node test/angle_bands.mjs */
import { MOVES } from '../js/moves.js';

// [lo, hi] per slot. dsmash back-hit / bair launch behind (135-160).
// dair meteors: 260-280, except ronin's final dair pop-up hit (50-70).
const BANDS = {
  jab: [20, 50], ftilt: [25, 50], utilt: [75, 100], dtilt: [15, 40],
  fsmash: [25, 50], usmash: [75, 100], dsmash: [[20, 45], [135, 160]],
  nair: [30, 55], fair: [15, 40], bair: [135, 160], uair: [75, 100],
  dair: [[260, 280], [260, 280], [50, 70]],
  nspecial: [20, 45], sspecial: [30, 55], uspecial: [65, 95],
  dspecial: [65, 95], // up-ish; volt_dspecial spike checked per-move below
};

// Per-move band overrides (slot band is shared, these moves differ).
// v0.6: wisp runs the volt kit, so wisp_dspecial is the same spike.
const MOVE_BANDS = {
  volt_dspecial: [[290, 310]],
  wisp_dspecial: [[290, 310]],
};

let failures = 0;
for (const defId of Object.keys(MOVES)) {
  for (const slot of Object.keys(MOVES[defId])) {
    const move = MOVES[defId][slot];
    const band = MOVE_BANDS[move.id] || BANDS[slot];
    const recs = [];
    for (const h of move.hits) recs.push(['hit', h.angle]);
    if (move.projectile) recs.push(['projectile', move.projectile.angle]);
    if (!recs.length) { console.log(`--    ${move.id.padEnd(16)} (no hits)`); continue; }
    let ok = true;
    const got = [];
    recs.forEach(([kind, ang], i) => {
      // per-index bands when counts match (dsmash front/back, dair hits);
      // otherwise every record uses the slot's single band.
      const b = (Array.isArray(band[0]) && band.length === recs.length) ? band[i] : (Array.isArray(band[0]) ? band[0] : band);
      got.push(`${kind}${recs.length > 1 ? i : ''}=${ang}`);
      if (ang < b[0] || ang > b[1]) ok = false;
    });
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${move.id.padEnd(16)} ${got.join(' ')}`);
  }
}
console.log(failures ? `\n${failures} move(s) outside their angle band` : '\nall angles in band');
process.exit(failures ? 1 : 0);
