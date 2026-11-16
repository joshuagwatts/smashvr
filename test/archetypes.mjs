/* v0.51: archetype registry + the three new base fighters.
   TITAN (grappler): command grab connects/whiffs, grabRangeMul stretches
   the normal grab, throwMul hardens throws. SABER (duelist): tipper
   hitboxes — tip out-damages the inner hit. MIRAGE (trickster): jumps=2,
   Blink distance/invuln/once-per-airtime, Blink Rise ends helpless.
   Plus: registry covers all 8 built-in defs, archetype physics land on
   createFighter records, and CPU AI survives all three kits. */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { loadEngine, blankScene } from './_harness.mjs';

const { THREE, createGame } = await loadEngine();
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { MOVES, FIGHTER_DEFS } = await import(pathToFileURL(path.join(ROOT, 'js/moves.js')).href);
const { ARCHETYPES, CUSTOM_STYLE_ARCHETYPES, physicsOf, archetypeForDef } = await import(pathToFileURL(path.join(ROOT, 'js/archetypes.js')).href);
const { createFighter } = await import(pathToFileURL(path.join(ROOT, 'js/fighters.js')).href);

const scene = blankScene(THREE);
const blank = () => ({ left: false, right: false, up: false, down: false, attack: false, smash: false, special: false, jump: false, shield: false });
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

function newGame(defA, defB, seed = 51) {
  const g = createGame({ slots: [
    { def: defA, ctrl: 'p1', team: null },
    { def: defB, ctrl: 'p2', team: null },
  ], scene, seed });
  for (let t = 0; t < 200 && g.state !== 'fight'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  return g;
}
function tick(g, h0 = blank(), h1 = blank()) { g._human[0] = h0; g._human[1] = h1; g.tick(); }
function idle(g, who = 0) {
  for (let t = 0; t < 200 && g.fighters[who].state !== 'idle' && g.fighters[who].state !== 'fall'; t++) tick(g);
}
function park(g, a, b, dist) {
  a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.facing = 1; a.onGround = true;
  b.x = dist; b.y = 0; b.vx = 0; b.vy = 0; b.invuln = 0; b.percent = 0;
  if (b.state !== 'hitstun') { b.state = 'idle'; b.stateFrame = 0; }
  b.onGround = true;
}

// ---------- registry ----------
{
  const builtins = Object.keys(FIGHTER_DEFS).filter((d) => !FIGHTER_DEFS[d].custom);
  check('registry covers all 8 built-in defs', builtins.length === 8 && builtins.every((d) => ARCHETYPES[d]),
    builtins.join(','));
  check('every archetype kit exists in MOVES', Object.values(ARCHETYPES).every((a) => MOVES[a.kitId]),
    Object.values(ARCHETYPES).map((a) => a.kitId).join(','));
  check('labels: grappler/duelist/trickster', ARCHETYPES.titan.label === 'GRAPPLER' &&
    ARCHETYPES.saber.label === 'DUELIST' && ARCHETYPES.mirage.label === 'TRICKSTER');
  check('custom style map -> titan/saber/mirage', CUSTOM_STYLE_ARCHETYPES.grappler === 'titan' &&
    CUSTOM_STYLE_ARCHETYPES.duelist === 'saber' && CUSTOM_STYLE_ARCHETYPES.trickster === 'mirage');
  const tp = physicsOf('titan');
  check('titan physics profile complete', tp && tp.weight === 124 && tp.grabRangeMul === 1.3 && tp.throwMul === 1.25 && tp.jumps === 1);
  const mp = physicsOf('mirage');
  check('mirage physics profile: jumps=2', mp && mp.jumps === 2 && mp.weight === 86);
  check('archetypeForDef resolves built-ins', archetypeForDef('saber', FIGHTER_DEFS.saber).label === 'DUELIST');
}

// ---------- def fields land on fighter records ----------
{
  const t = createFighter('titan');
  check('createFighter titan: grab/throw multipliers', t.grabRangeMul === 1.3 && t.throwMul === 1.25 && t.weight === 124);
  const m = createFighter('mirage');
  check('createFighter mirage: jumps=2', m.jumps === 2);
  const r = createFighter('ronin');
  check('createFighter ronin: defaults untouched', r.jumps === 1 && r.grabRangeMul === 1 && r.throwMul === 1);
  const s = createFighter('saber');
  check('saber rig carries the blade tip bone', !!s.rig.bones.saberTip);
}

// ---------- SABER tipper data ----------
{
  for (const slot of ['fsmash', 'fair', 'ftilt']) {
    const mv = MOVES.saber[slot];
    const tip = mv.hits.find((h) => h.limb === 'saberTip');
    const inner = mv.hits.find((h) => !h.limb);
    check(`saber ${slot}: tipper hitbox exists and out-damages inner`,
      !!tip && !!inner && tip.dmg > inner.dmg, tip ? `tip=${tip.dmg} inner=${inner && inner.dmg}` : 'no tip');
  }
}

// ---------- TITAN command grab: connects ----------
{
  const g = newGame('titan', 'ronin');
  const [a, b] = g.fighters;
  park(g, a, b, 2.2);
  const h = blank(); h.right = true; h.special = true; // side special press
  tick(g, h);
  let connected = false;
  for (let t = 0; t < 40 && !connected; t++) {
    // keep the foe at snatch range while the lunge plays out
    b.x = a.x + 2.2; b.y = 0; if (b.state !== 'grabbed' && b.state !== 'hitstun') { b.state = 'idle'; b.invuln = 0; }
    tick(g);
    if (b.state === 'grabbed' && a.state === 'holding') connected = true;
  }
  check('cmdgrab connects into holding/grabbed', connected, `a=${a.state} b=${b.state}`);
  // throw out of it: attack + toward = fthrow, 8 * 1.25 = 10%
  const before = b.percent;
  const th = blank(); th.attack = true; th.right = true;
  tick(g, th);
  for (let t = 0; t < 10 && b.state !== 'hitstun'; t++) tick(g);
  check('cmdgrab throw deals throwMul damage (10%)', Math.abs(b.percent - before - 10) < 0.6,
    `delta=${(b.percent - before).toFixed(2)}`);
}

// ---------- TITAN command grab: whiffs punishably ----------
{
  const g = newGame('titan', 'ronin', 52);
  const [a, b] = g.fighters;
  park(g, a, b, 6.5);
  const h = blank(); h.right = true; h.special = true;
  tick(g, h);
  let sawAttack = false, grabbed = false;
  for (let t = 0; t < 90; t++) {
    tick(g);
    if (a.state === 'attack' && a.moveId === 'sspecial') sawAttack = true;
    if (b.state === 'grabbed') grabbed = true;
  }
  check('cmdgrab whiff: move played, nobody grabbed', sawAttack && !grabbed);
  check('cmdgrab whiff: titan actionable again after long recovery', a.state === 'idle', a.state);
}

// ---------- grabRangeMul: titan's normal grab outreaches ronin's ----------
function tryGrab(grabberDef, dist) {
  const g = newGame(grabberDef, 'ronin', 53);
  const [a, b] = g.fighters;
  park(g, a, b, dist);
  const h = blank(); h.shield = true; h.attack = true; // shield+attack = grab
  tick(g, h);
  let got = false;
  for (let t = 0; t < 20 && !got; t++) {
    b.x = a.x + dist; b.y = 0; if (b.state !== 'grabbed') { b.state = 'idle'; b.invuln = 0; }
    tick(g);
    if (b.state === 'grabbed') got = true;
  }
  return got;
}
{
  check('ronin normal grab whiffs at 2.45u', tryGrab('ronin', 2.45) === false);
  check('titan normal grab connects at 2.45u (grabRangeMul)', tryGrab('titan', 2.45) === true);
}

// ---------- MIRAGE: two midair jumps ----------
// Measures TOTAL air jumps available from a clean airborne start
// (jumpsUsed 0). Note: the v0.14 input buffer keeps a jump edge alive 6
// ticks, so a press can chain straight into the next air jump — the cap
// total is the invariant that matters, not the press count.
function airJumps(def) {
  const g = newGame(def, 'ronin', 54);
  const a = g.fighters[0];
  idle(g);
  a.x = 0; a.y = 5; a.vy = 0; a.onGround = false; a.state = 'fall'; a.jumpsUsed = 0;
  for (let n = 0; n < 4; n++) {
    const before = a.jumpsUsed;
    a.y = 5; a.vy = 0; a.state = 'fall'; // re-pin so landing never interferes
    const h = blank(); h.jump = true; tick(g, h);
    // settle: back to 'fall' with the 6-tick buffer long dead
    for (let t = 0; t < 80 && a.state !== 'fall'; t++) tick(g);
    for (let t = 0; t < 10; t++) tick(g);
    if (a.jumpsUsed === before) break; // cap reached
  }
  return a.jumpsUsed;
}
{
  check('mirage gets TWO midair jumps', airJumps('mirage') === 2);
  check('ronin still gets ONE midair jump', airJumps('ronin') === 1);
}

// ---------- MIRAGE: Blink ----------
{
  const g = newGame('mirage', 'ronin', 55);
  const [a, b] = g.fighters;
  park(g, a, b, -5);
  // neutral special press, then hold RIGHT through the startup so the
  // blink reads the held direction at the fire frame
  let h = blank(); h.special = true; tick(g, h);
  let teleported = false, invulnAtBlink = 0;
  for (let t = 0; t < 12 && !teleported; t++) {
    const x0 = a.x;
    h = blank(); h.right = true; tick(g, h);
    if (a.x - x0 > 2) { teleported = true; invulnAtBlink = a.invuln; }
  }
  check('blink teleports ~3.2u toward held dir', teleported && Math.abs(a.x - 3.2) < 0.45, `x=${a.x.toFixed(2)}`);
  check('blink grants ~12 ticks invuln', invulnAtBlink >= 10, `invuln=${invulnAtBlink}`);
}
{
  // once per airtime: second air blink does not move her; landing re-arms
  const g = newGame('mirage', 'ronin', 56);
  const [a, b] = g.fighters;
  park(g, a, b, -5);
  a.y = 3; a.onGround = false; a.state = 'fall'; a.vy = 0;
  const blink = () => {
    let h = blank(); h.special = true; tick(g, h);
    for (let t = 0; t < 12; t++) { h = blank(); h.right = true; tick(g, h); }
    idle(g);
  };
  blink();
  const xAfterFirst = a.x;
  check('air blink works', xAfterFirst > 2.5 && a._blinkUsed === true, `x=${xAfterFirst.toFixed(2)} used=${a._blinkUsed}`);
  a.y = 3; a.onGround = false; a.state = 'fall'; a.vy = 0; // still the same airtime
  blink();
  check('second air blink does NOT teleport (once per airtime)', Math.abs(a.x - xAfterFirst) < 0.45,
    `x ${xAfterFirst.toFixed(2)} -> ${a.x.toFixed(2)}`);
  for (let t = 0; t < 200 && !a.onGround; t++) tick(g);
  check('landing re-arms blink', a.onGround && a._blinkUsed === false);
  const xBefore = a.x;
  blink();
  check('blink works again after landing', a.x - xBefore > 2.5, `${xBefore.toFixed(2)} -> ${a.x.toFixed(2)}`);
}
{
  // Blink Rise: up + forward teleport, ends helpless
  const g = newGame('mirage', 'ronin', 57);
  const [a, b] = g.fighters;
  park(g, a, b, -5);
  a.x = 0; a.y = 1; a.onGround = false; a.state = 'fall'; a.vy = 0;
  const y0 = a.y, x0 = a.x;
  let h = blank(); h.up = true; h.special = true; tick(g, h);
  let rose = false;
  for (let t = 0; t < 14 && !rose; t++) { tick(g); if (a.y - y0 > 2.8) rose = true; }
  check('blink rise teleports up ~3.4u', rose, `y ${y0} -> ${a.y.toFixed(2)}`);
  check('blink rise drifts 1.2u toward facing', Math.abs(a.x - (x0 + 1.2)) < 0.3, `x=${a.x.toFixed(2)}`);
  for (let t = 0; t < 60 && a.state !== 'helpless'; t++) tick(g);
  check('blink rise ends helpless', a.state === 'helpless', a.state);
}

// ---------- SABER: tipper in a real fight ----------
function saberFsmashPercent(dist) {
  const g = newGame('saber', 'ronin', 58);
  const [a, b] = g.fighters;
  park(g, a, b, dist);
  let before = null, after = 0;
  for (let t = 0; t < 90; t++) {
    b.x = a.x + dist; b.y = 0; b.vx = 0; b.vy = 0;
    if (b.state !== 'hitstun') { b.state = 'idle'; b.invuln = 0; }
    const h = blank(); if (t === 0) h.smash = true; // quick tap = ~1.0x charge
    tick(g, h);
    if (t === 0) before = b.percent;
    if (b.percent > before) { after = b.percent; break; }
  }
  return after - (before || 0);
}
{
  const inner = saberFsmashPercent(0.45);
  const tip = saberFsmashPercent(1.75);
  check('saber fsmash inner hit ~14%', inner > 12.5 && inner < 15.5, `inner=${inner.toFixed(2)}`);
  check('saber fsmash TIPPER hit ~22%', tip > 20.5 && tip < 23.5, `tip=${tip.toFixed(2)}`);
  check('tipper clearly out-damages inner', tip > inner + 6, `tip=${tip.toFixed(1)} inner=${inner.toFixed(1)}`);
}

// ---------- CPU AI survives the new kits ----------
for (const def of ['titan', 'saber', 'mirage']) {
  const g = createGame({ slots: [
    { def, ctrl: 'cpu', team: null },
    { def: 'ronin', ctrl: 'cpu', team: null },
  ], scene, seed: 59 });
  let threw = null;
  try {
    for (let t = 0; t < 900; t++) g.tick();
  } catch (e) { threw = e; }
  check(`CPU vs CPU with ${def}: 900 ticks, no crash`, !threw, threw ? threw.message : '');
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
console.log('PASS');
