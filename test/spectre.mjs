/* v0.25: SPECTRE zoner kit — projectiles spawn/travel/damage, and the charged
   Aether Cannon (fsmash) fires a charged projectile (pow 1.0 -> 1.4). */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadEngine, blankScene } from './_harness.mjs';

const { THREE, createGame } = await loadEngine();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
// same module instance as the engine's (identical ?v=37 URL) — shares state
const { peekProjectiles } = await import(pathToFileURL(path.join(ROOT, 'js/fx.js')).href + '?v=37');

const scene = blankScene(THREE);
const blank = () => ({ left: false, right: false, up: false, down: false, attack: false, smash: false, special: false, jump: false, shield: false });
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

function newGame(seed = 31) {
  const g = createGame({ slots: [
    { def: 'spectre', ctrl: 'p1', team: null },
    { def: 'ronin', ctrl: 'p2', team: null },
  ], scene, seed });
  for (let t = 0; t < 200 && g.state !== 'fight'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  return g;
}
function idle(g) {
  // wait until P1 is actionable
  for (let t = 0; t < 120 && (g.fighters[0].state === 'attack' || g.fighters[0].state === 'charge'); t++) {
    g._human[0] = blank(); g._human[1] = blank(); g.tick();
  }
}
function parkDummy(g) {
  const [a, b] = g.fighters;
  a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.facing = 1;
  b.x = 4; b.y = 0; b.vx = 0; b.vy = 0;
  b.state = 'idle'; b.stateFrame = 0; b.invuln = 0; b.percent = 0;
}
function fireSpecial(g) {
  const h = blank(); h.special = true;
  g._human[0] = h; g._human[1] = blank(); g.tick();
}
function latestProj(owner) {
  const ps = peekProjectiles();
  for (let i = ps.length - 1; i >= 0; i--) if (!owner || ps[i].owner === owner) return ps[i];
  return null;
}

// 1) Hex Bolt spawns a projectile past its startup frame
{
  const g = newGame();
  idle(g);
  fireSpecial(g);
  let p = null;
  for (let t = 0; t < 20 && !p; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); p = latestProj(g.fighters[0]); }
  check('nspecial spawns projectile', !!p);
  check('projectile kbClass/dmg sane', p && p.dmg === 5 && p.kbClass === 'weak', p ? `dmg=${p.dmg}` : 'none');
}
// 2) projectile travels forward
{
  const g = newGame(32);
  idle(g);
  // dummy behind the shooter so the bolt flies free
  g.fighters[1].x = -8; g.fighters[1].y = 0; g.fighters[1].vx = 0; g.fighters[1].vy = 0;
  fireSpecial(g);
  let p = null;
  for (let t = 0; t < 20 && !p; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); p = latestProj(g.fighters[0]); }
  const x0 = p.x;
  for (let t = 0; t < 30; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  check('projectile travels forward', p.x > x0 + 1, `${x0.toFixed(2)} -> ${p.x.toFixed(2)}`);
  check('projectile still live', !p.dead);
}
// 3) projectile damages the dummy in its path
{
  const g = newGame(33);
  idle(g);
  parkDummy(g);
  fireSpecial(g);
  const b = g.fighters[1];
  let hit = false;
  for (let t = 0; t < 150 && !hit; t++) {
    g._human[0] = blank(); g._human[1] = blank(); g.tick();
    if (b.percent > 0) hit = true;
  }
  check('projectile damages dummy', hit, `percent=${b.percent}`);
  check('bolt dealt ~5', hit && b.percent >= 4.9, `percent=${b.percent}`);
}
// 4) quick-tap fsmash fires an (almost) uncharged projectile; full charge = 1.4x pow
{
  const g = newGame(34);
  idle(g);
  const [a] = g.fighters;
  const tapSmash = (holdTicks) => {
    idle(g);
    let p = null;
    for (let t = 0; t < holdTicks + 80 && !p; t++) {
      const h = blank(); if (t < holdTicks) h.smash = true;
      g._human[0] = h; g._human[1] = blank(); g.tick();
      p = latestProj(a);
    }
    return p;
  };
  const pQuick = tapSmash(1);
  check('quick fsmash fires projectile', !!pQuick);
  check('quick fsmash pow ~1.0', pQuick && Math.abs(pQuick.pow - 1) < 0.05, pQuick ? `pow=${pQuick.pow}` : 'none');
  const pFull = tapSmash(70);
  check('full-charge fsmash fires projectile', !!pFull);
  check('full-charge pow = 1.4', pFull && Math.abs(pFull.pow - 1.4) < 1e-9, pFull ? `pow=${pFull.pow}` : 'none');
}
// 5) charged cannon hurts more than the uncharged one
{
  const g = newGame(35);
  idle(g);
  const [a, b] = g.fighters;
  const dmgFor = (holdTicks) => {
    idle(g);
    parkDummy(g);
    let before = 0, after = 0;
    for (let t = 0; t < holdTicks + 150 && after === 0; t++) {
      const h = blank(); if (t < holdTicks) h.smash = true;
      g._human[0] = h; g._human[1] = blank(); g.tick();
      if (t === 0) before = b.percent;
      if (b.percent > before) after = b.percent;
    }
    return after - before;
  };
  const dQuick = dmgFor(1);
  const dFull = dmgFor(70);
  check('charged cannon out-damages quick tap', dFull > dQuick + 3, `quick=${dQuick.toFixed(1)} full=${dFull.toFixed(1)}`);
}

if (fail) { console.log(`${fail} FAILURES`); process.exit(1); }
console.log('PASS');
