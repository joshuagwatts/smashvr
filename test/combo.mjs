/* v0.23: combo counter + hit-cancel flow */
import { loadEngine, blankScene } from './_harness.mjs';
const { THREE, createGame } = await loadEngine();
const scene = blankScene(THREE);
const blank = () => ({ left: false, right: false, up: false, down: false, attack: false, special: false, jump: false, shield: false });
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

function newGame(seed = 11) {
  let lastHud = null;
  const g = createGame({ slots: [
    { def: 'ronin', ctrl: 'p1', team: null },
    { def: 'ronin', ctrl: 'p2', team: null },
  ], scene, seed, onHud: (s) => { lastHud = s; } });
  g._getHud = () => lastHud;
  for (let t = 0; t < 200 && g.state !== 'fight'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  return g;
}
function park(g, a, b) {
  // training dummy: P2 idle in jab range, P1 actionable
  b.x = a.x + 0.7 * a.facing; b.y = a.y; b.vx = 0; b.vy = 0;
  b.state = 'idle'; b.stateFrame = 0; b.invuln = 0;
  a.x = 0; a.y = 0; a.vx = 0; a.vy = 0;
}
function tickIdle(g, n) {
  for (let t = 0; t < n; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
}
// P1 jabs the dummy; returns true if P2's percent rose
function jabOnce(g, a, b) {
  park(g, a, b);
  // wait until P1 can act
  for (let t = 0; t < 60 && a.state === 'attack'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  const before = b.percent;
  for (let t = 0; t < 50; t++) {
    const h = blank(); if (t === 2) h.attack = true;
    g._human[0] = h; g._human[1] = blank();
    park(g, a, b); // keep dummy parked (re-apply after physics)
    b.state = 'idle';
    g.tick();
    if (b.percent > before) return true;
  }
  return false;
}

{
  const g = newGame();
  const [a, b] = g.fighters;
  check('jab lands', jabOnce(g, a, b));
  const c1 = a._combo;
  check('combo live after first hit', c1 >= 1, 'got ' + c1);
  check('second jab lands', jabOnce(g, a, b));
  check('combo increments', a._combo > c1, `got ${a._combo} after ${c1}`);
  check('snapshot carries combo', g._getHud().fighters[0].combo === a._combo);
}
// combo breaks when the victim recovers (leaves hitstun)
{
  const g = newGame(12);
  const [a, b] = g.fighters;
  jabOnce(g, a, b);
  check('combo live', a._combo >= 1, 'got ' + a._combo);
  for (let t = 0; t < 400 && b.state === 'hitstun'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  check('victim recovered', b.state !== 'hitstun', b.state);
  check('combo broken on recovery', a._combo === 0, 'got ' + a._combo);
}
// combo breaks when the attacker gets hit
{
  const g = newGame(13);
  const [a, b] = g.fighters;
  jabOnce(g, a, b);
  check('combo live', a._combo >= 1);
  // P2 jabs P1: reset both, P2 attacks
  a.x = 0; b.x = -0.7; a.y = 0; b.y = 0; b.facing = 1; a.facing = -1;
  a.state = 'idle'; a.stateFrame = 0; b.state = 'idle'; b.stateFrame = 0;
  const before = a.percent;
  let landed = false;
  for (let t = 0; t < 60; t++) {
    const h = blank(); if (t === 2) h.attack = true;
    g._human[1] = h; g._human[0] = blank();
    a.x = 0; a.y = 0; a.vx = 0; a.vy = 0;
    g.tick();
    if (a.percent > before) { landed = true; break; }
  }
  check('P2 hit P1', landed);
  check('attacker-hit breaks combo', a._combo === 0, 'got ' + a._combo);
}
// hit-cancel: buffered attack after a connected hit skips recovery
{
  const g = newGame(14);
  const [a, b] = g.fighters;
  const mv = a.moves.jab;
  const lastActive = Math.max(...mv.hits.map((h) => h.to));
  b.x = a.x + 0.7; b.y = 0; b.state = 'idle';
  let cancelled = false;
  for (let t = 0; t < 80; t++) {
    const h = blank();
    if (t === 2) h.attack = true;          // first jab
    if (t === 16) h.attack = true;        // buffered during recovery (post-active)
    g._human[0] = h; g._human[1] = blank();
    const wasId = a.moveId;
    // keep dummy in range
    if (b.state === 'idle') { b.x = a.x + 0.7 * a.facing; b.y = a.y; }
    g.tick();
    // v0.23: endAttack leaves moveFrame untouched — if the attack ended with
    // moveFrame < total, the recovery was cancelled (not played out).
    if (wasId === 'jab' && a.moveId === null && a.moveFrame < mv.total) cancelled = true;
  }
  check('hit-cancel skips recovery into next jab', cancelled);
}
// whiffed attack does NOT cancel (full recovery plays)
{
  const g = newGame(15);
  const [a, b] = g.fighters;
  const mv = a.moves.jab;
  const lastActive = Math.max(...mv.hits.map((h) => h.to));
  b.x = 99; // far away — jab whiffs
  let cancelled = false, playedOut = false;
  for (let t = 0; t < 80; t++) {
    const h = blank();
    if (t === 2) h.attack = true;
    if (t === 16) h.attack = true;
    g._human[0] = h; g._human[1] = blank();
    const wasId = a.moveId;
    g.tick();
    if (wasId === 'jab' && a.moveId === null) {
      if (a.moveFrame < mv.total) cancelled = true;
      else playedOut = true;
    }
  }
  check('whiff plays full recovery (no cancel)', !cancelled && playedOut);
}

console.log(fail === 0 ? 'ALL COMBO CHECKS PASS' : `${fail} FAILURES`);
process.exit(fail ? 1 : 0);
