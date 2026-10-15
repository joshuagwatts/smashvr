/* pushback check: two fighters walking at each other never cross / never stack */
import { loadEngine, blankScene } from './_harness.mjs';
const { THREE, createGame } = await loadEngine();
const scene = blankScene(THREE);
const g = createGame({ slots: [
  { def: 'ronin', ctrl: 'p1', team: null },
  { def: 'volt', ctrl: 'p2', team: null },
], scene, seed: 42 });
const holdR = () => ({ left: false, right: true, up: false, down: false, attack: false, special: false, jump: false, shield: false });
const holdL = () => ({ left: true, right: false, up: false, down: false, attack: false, special: false, jump: false, shield: false });
let crossed = 0, minGap = Infinity, samples = 0;
for (let t = 0; t < 700; t++) {
  g._human[0] = holdR();
  g._human[1] = holdL();
  g.tick();
  if (g.state !== 'fight') continue;
  const [a, b] = g.fighters;
  if (Math.abs(a.x) > 5 || Math.abs(b.x) > 5) break; // stop before ledge play
  const gap = b.x - a.x;
  samples++;
  if (gap < 0) crossed++;
  if (gap < minGap) minGap = gap;
}
console.log('samples', samples, 'crossed(frames b left of a)', crossed, 'minGap', minGap.toFixed(3));
console.log(crossed === 0 && minGap > 0.5 ? 'PASS: bodies stay solid, order preserved' : 'FAIL');
