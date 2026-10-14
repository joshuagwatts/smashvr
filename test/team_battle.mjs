/* test/team_battle.mjs — v0.9: teams + N fighters engine sims.
   - 4v4 all-CPU red vs blue: runs to completion, a TEAM wins, zero friendly-fire hits.
   - FFA 4-way all-CPU: runs to completion, one fighter wins.
   - Legacy 1v1 path: unchanged behavior (2 fighters, spawns -3/+3).
   - Perf: avg tick ms with 8 fighters.
   Usage: node test/team_battle.mjs */
import { loadEngine, blankScene } from './_harness.mjs';

const { THREE, createGame } = await loadEngine();
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails++;
};

function runUntilDone(game, cap) {
  let n = 0;
  for (; n < cap && game.state !== 'done'; n++) game.tick();
  return n;
}

// ---- 1. legacy 1v1 unchanged ----
{
  const g = createGame({ mode: 'cpu', p1def: 'ronin', p2def: 'volt', scene: blankScene(THREE), demo: true });
  check('legacy: 2 fighters', g.fighters.length === 2);
  check('legacy: spawns -3/+3', g.fighters[0].x === -3 && g.fighters[1].x === 3, `${g.fighters[0].x},${g.fighters[1].x}`);
  check('legacy: no teams', g.fighters[0].team === null && g.fighters[1].team === null);
  check('legacy: ctrls p1/cpu', g.fighters[0].ctrl === 'cpu' && g.fighters[1].ctrl === 'cpu', 'demo forces cpu');
  for (let i = 0; i < 600; i++) g.tick();
  check('legacy: 600 ticks clean', g.state === 'fight');
}

// ---- 2. 4v4 team battle ----
const mkSlots44 = () => {
  const defs = ['ronin', 'volt', 'wisp', 'ronin', 'volt', 'ronin', 'wisp', 'volt'];
  return defs.map((def, i) => ({ def, ctrl: 'cpu', team: i < 4 ? 'red' : 'blue' }));
};
let winner44 = null;
{
  const g = createGame({ scene: blankScene(THREE), demo: true, slots: mkSlots44() });
  check('4v4: 8 fighters built', g.fighters.length === 8, `${g.fighters.length}`);
  check('4v4: teams 4v4', g.fighters.filter((f) => f.team === 'red').length === 4 &&
    g.fighters.filter((f) => f.team === 'blue').length === 4);
  // reds spawn left, blues right
  const redX = Math.max(...g.fighters.filter((f) => f.team === 'red').map((f) => f.x));
  const blueX = Math.min(...g.fighters.filter((f) => f.team === 'blue').map((f) => f.x));
  check('4v4: reds left, blues right', redX < blueX, `redMax=${redX.toFixed(1)} blueMin=${blueX.toFixed(1)}`);
  const n = runUntilDone(g, 60000);
  check('4v4: match completed', g.state === 'done', `ticks=${n}`);
  check('4v4: zero friendly-fire hits', (g._ffHits || 0) === 0, `ffHits=${g._ffHits || 0}`);
  check('4v4: exactly one team alive', (() => {
    const alive = g.fighters.filter((f) => f.stocks > 0);
    return alive.length > 0 && new Set(alive.map((f) => f.team)).size === 1;
  })(), g.fighters.map((f) => f.stocks).join(','));
}

// ---- 3. FFA 4-way ----
{
  const g = createGame({
    scene: blankScene(THREE), demo: true,
    slots: ['ronin', 'volt', 'wisp', 'ronin'].map((def) => ({ def, ctrl: 'cpu', team: null })),
  });
  const n = runUntilDone(g, 60000);
  check('ffa4: match completed', g.state === 'done', `ticks=${n}`);
  const alive = g.fighters.filter((f) => f.stocks > 0);
  check('ffa4: exactly one fighter alive', alive.length === 1, alive.map((f) => f.name).join(','));
  check('ffa4: zero friendly-fire hits', (g._ffHits || 0) === 0);
}

// ---- 4. perf: 8 fighters ----
{
  const g = createGame({ scene: blankScene(THREE), demo: true, slots: mkSlots44() });
  // warm past countdown
  for (let i = 0; i < 120; i++) g.tick();
  const t0 = performance.now();
  for (let i = 0; i < 1000; i++) g.tick();
  const avg = (performance.now() - t0) / 1000;
  check('perf: 8-fighter tick avg < 8ms', avg < 8, `${avg.toFixed(2)}ms/tick`);
  console.log(`perf: 8 fighters, avg tick ${avg.toFixed(2)}ms (budget 16.7ms)`);
}

if (fails) { console.log(`${fails} FAILURES`); process.exit(1); }
console.log('PASS — team_battle');
