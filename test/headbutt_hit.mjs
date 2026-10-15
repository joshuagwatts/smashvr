/* headbutt connects: bruiser jab damages a foe in the sim */
import { loadEngine, blankScene } from './_harness.mjs';
const { THREE, createGame } = await loadEngine();
const { FIGHTER_DEFS } = await import('../js/moves.js?v=29');
const scene = blankScene(THREE);
FIGHTER_DEFS['test_mushy'] = {
  ...FIGHTER_DEFS.ronin, id: 'test_mushy', name: 'MUSHY', custom: true,
  kit: 'wisp', style: { kit: 'wisp', style: 'silly', headbutts: true, squashMul: 1.6, label: 'Cartoony brawler' },
};
const g = createGame({ slots: [
  { def: 'test_mushy', ctrl: 'p1', team: null },
  { def: 'volt', ctrl: 'p2', team: null },
], scene, seed: 7 });
const blank = () => ({ left: false, right: false, up: false, down: false, attack: false, special: false, jump: false, shield: false });
// run to fight state
for (let t = 0; t < 200 && g.state !== 'fight'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
const [a, b] = g.fighters;
console.log('P1 jab:', a.moves.jab.name, '| P2 start %:', b.percent);
// park them in range, P1 jabs
a.x = 0; b.x = 0.8; a.y = 0; b.y = 0; a.facing = 1;
let hit = false;
for (let t = 0; t < 120; t++) {
  const h = blank(); if (t === 5) h.attack = true;
  g._human[0] = h; g._human[1] = blank();
  g.tick();
  if (b.percent > 0) { hit = true; break; }
}
console.log('headbutt connected:', hit, '| P2 % after:', b.percent);
console.log(hit && b.percent >= 7 ? 'PASS' : 'FAIL');
