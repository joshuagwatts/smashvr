/* test/determinism.mjs — v0.11 netplay hard requirement.
   Same seeded match run twice -> identical state hashes every 60 ticks.
   Proves the sim (AI, spawns, physics, hitboxes) is a pure function of
   (seed, slots, input streams) — the foundation of input-delay lockstep. */
import { loadEngine, blankScene } from './_harness.mjs';

const { THREE, createGame } = await loadEngine();

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

function runMatch(slots, seed, fightTicks) {
  const scene = blankScene(THREE);
  const g = createGame({ slots, scene, seed });
  const hashes = [];
  let last = 0;
  for (let i = 0; i < fightTicks + 120; i++) {
    g.tick();
    if (g._tick > last && g._tick % 60 === 0) { hashes.push(g.stateHash()); last = g._tick; }
    if (g.state === 'done') break;
  }
  return { hashes, ticks: g._tick, done: g.state === 'done' };
}

const SLOTS4 = [
  { def: 'ronin', ctrl: 'cpu', team: 'red' },
  { def: 'volt', ctrl: 'cpu', team: 'red' },
  { def: 'ronin', ctrl: 'cpu', team: 'blue' },
  { def: 'wisp', ctrl: 'cpu', team: 'blue' },
];

// 1) 4-fighter team match, same seed, twice
const a = runMatch(SLOTS4, 987654321, 600);
const b = runMatch(SLOTS4, 987654321, 600);
check('same seed -> same tick count', a.ticks === b.ticks, `${a.ticks} vs ${b.ticks}`);
check('same seed -> identical hashes every 60 ticks',
  a.hashes.length > 0 && a.hashes.length === b.hashes.length &&
  a.hashes.every((h, i) => h === b.hashes[i]),
  `${a.hashes.length} hashes`);
console.log(`    (${a.hashes.length} hash points over ${a.ticks} fight ticks${a.done ? ', match ended early' : ''})`);

// 2) different seed -> different trajectory (seed actually matters)
const c = runMatch(SLOTS4, 12345, 600);
check('different seed -> different hash', c.hashes.some((h, i) => h !== a.hashes[i]));

// 3) legacy 1v1 CPU-vs-CPU deterministic
const legacy = [
  { def: 'ronin', ctrl: 'cpu', team: null },
  { def: 'volt', ctrl: 'cpu', team: null },
];
const d1 = runMatch(legacy, 777, 600), d2 = runMatch(legacy, 777, 600);
check('1v1 deterministic', d1.hashes.every((h, i) => h === d2.hashes[i]));

// 4) 8-fighter FFA chaos deterministic
const ffa8 = ['ronin', 'volt', 'wisp', 'ronin', 'volt', 'wisp', 'ronin', 'volt']
  .map((def) => ({ def, ctrl: 'cpu', team: null }));
const e1 = runMatch(ffa8, 424242, 600), e2 = runMatch(ffa8, 424242, 600);
check('8-fighter FFA deterministic', e1.hashes.every((h, i) => h === e2.hashes[i]));

// 5) hash is sensitive — flip one input mid-match, hash must diverge
function runWithFlip(seed) {
  const scene = blankScene(THREE);
  const g = createGame({ slots: legacy, scene, seed });
  const hashes = [];
  for (let i = 0; i < 300 + 120; i++) {
    g.tick();
    if (g._tick === 150) g.fighters[0].x += 0.001; // tiny perturbation
    if (g._tick > 0 && g._tick % 60 === 0 && !hashes.includes(g._tick)) hashes.push([g._tick, g.stateHash()]);
  }
  return hashes;
}
const f1 = runWithFlip(777), f2 = runMatch(legacy, 777, 300);
const divAt = f1.find(([t, h], i) => f2.hashes[i] !== h);
check('hash detects a 0.001 perturbation', !!divAt && divAt[0] <= 180, divAt ? `diverged at tick ${divAt[0]}` : 'never diverged');

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
