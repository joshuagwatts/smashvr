/* v0.40: directional moveset expansion — tap/hold attack semantics
   (tap = tilt/jab, hold+direction = charged smash on the ATTACK button),
   crouch state + crouch attacks, five-way aerials relative to facing at
   the press (bair was unreachable before v0.40), aerial landing lag, and
   the classic smash-button charge path left intact. */
import { loadEngine, blankScene } from './_harness.mjs';
const { THREE, createGame } = await loadEngine();
const scene = blankScene(THREE);
const blank = () => ({ left: false, right: false, up: false, down: false, attack: false, smash: false, special: false, jump: false, shield: false });
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

function newGame(seed = 41) {
  const g = createGame({ slots: [
    { def: 'ronin', ctrl: 'p1', team: null },
    { def: 'ronin', ctrl: 'p2', team: null },
  ], scene, seed });
  for (let t = 0; t < 200 && g.state !== 'fight'; t++) { g._human[0] = blank(); g._human[1] = blank(); g.tick(); }
  return g;
}
function resetPair(g) {
  const [a, b] = g.fighters;
  Object.assign(a, { x: 0, y: 0, vx: 0, vy: 0, facing: 1, percent: 0, moveId: null, _pendT: 0, _chargeDir: null, stateFrame: 0 });
  a.state = 'idle'; a.onGround = true;
  Object.assign(b, { x: 6, y: 0, vx: 0, vy: 0, facing: -1, percent: 0, invuln: 0, stateFrame: 0 });
  b.state = 'idle'; b.onGround = true;
  run(g, 3, () => blank());
}
// run n ticks; fn(t) -> P1 hold struct. obs collects states/moveIds seen.
function run(g, n, fn, obs) {
  const [a] = g.fighters;
  for (let t = 0; t < n; t++) {
    g._human[0] = fn(t); g._human[1] = blank();
    g.tick();
    if (obs) {
      obs.states.add(a.state);
      if (a.moveId) obs.moves.add(a.moveId);
      if (a.moveId && obs.firstMove === null) { obs.firstMove = a.moveId; obs.firstMoveTick = t; }
    }
  }
}
const newObs = () => ({ states: new Set(), moves: new Set(), firstMove: null, firstMoveTick: -1 });
// park the dummy in front of P1 (fsmash/jab range) before every tick
function parkFront(g, dist) {
  const [a, b] = g.fighters;
  b.x = a.x + dist * a.facing; b.y = 0; b.vx = 0; b.vy = 0;
  if (b.state === 'hitstun') return;
  b.state = 'idle'; b.invuln = 0;
}
function runParked(g, n, fn, dist = 1.3) {
  for (let t = 0; t < n; t++) {
    parkFront(g, dist);
    g._human[0] = fn(t); g._human[1] = blank();
    g.tick();
  }
}

// ---- 1. neutral TAP = jab, fired on release (not on the press) ----
{
  const g = newGame(); resetPair(g);
  const obs = newObs();
  run(g, 30, (t) => { const h = blank(); if (t < 2) h.attack = true; return h; }, obs);
  check('neutral tap fires jab', obs.moves.has('jab'), [...obs.moves].join(','));
  check('jab waits for the tap decision (no move on press ticks)', obs.firstMoveTick >= 2, 'tick ' + obs.firstMoveTick);
  check('neutral tap never charges', !obs.states.has('charge'));
}
// ---- 2. neutral HOLD = jab anyway (never a neutral charge) ----
{
  const g = newGame(42); resetPair(g);
  const obs = newObs();
  run(g, 40, (t) => { const h = blank(); if (t < 20) h.attack = true; return h; }, obs);
  check('neutral hold still jabs', obs.moves.has('jab'), [...obs.moves].join(','));
  check('neutral hold never charges', !obs.states.has('charge'));
}
// ---- 3. direction TAP = tilt (fwd / up / down-from-crouch) ----
{
  const g = newGame(43); resetPair(g);
  const obs = newObs();
  run(g, 30, (t) => { const h = blank(); h.right = true; if (t < 3) h.attack = true; return h; }, obs);
  check('right tap = ftilt', obs.moves.has('ftilt') && !obs.moves.has('fsmash'), [...obs.moves].join(','));
}
{
  const g = newGame(44); resetPair(g);
  const obs = newObs();
  run(g, 30, (t) => { const h = blank(); h.up = true; if (t < 3) h.attack = true; return h; }, obs);
  check('up tap = utilt', obs.moves.has('utilt') && !obs.moves.has('usmash'), [...obs.moves].join(','));
}
{
  const g = newGame(45); resetPair(g);
  const obs = newObs();
  run(g, 40, (t) => { const h = blank(); h.down = true; if (t >= 6 && t < 9) h.attack = true; return h; }, obs);
  check('down tap from crouch = dtilt', obs.moves.has('dtilt') && !obs.moves.has('dsmash'), [...obs.moves].join(','));
}
// ---- 4. direction HOLD on attack = charged smash (direction locked) ----
{
  const g = newGame(46); resetPair(g);
  const [a, b] = g.fighters;
  const obs = newObs();
  // hold right+attack through the decision window and 6 charge ticks,
  // then release BOTH — the smash must still be the fsmash (locked dir).
  runParked(g, 18, (t) => { const h = blank(); h.right = true; h.attack = true; return h; });
  const wasCharging = a.state === 'charge';
  runParked(g, 60, () => blank());
  const quickDmg = b.percent;
  check('short attack-hold enters charge', wasCharging, a.state);
  check('short charge fsmash still fires forward (locked dir)', quickDmg > 15, 'dmg ' + quickDmg.toFixed(1));
  check('short charge is barely scaled', quickDmg < 21, 'dmg ' + quickDmg.toFixed(1));
}
{
  const g = newGame(47); resetPair(g);
  const [a, b] = g.fighters;
  let sawCharge = false;
  runParked(g, 60, (t) => { const h = blank(); h.right = true; h.attack = true; if (a.state === 'charge') sawCharge = true; return h; });
  runParked(g, 60, () => blank());
  check('long attack-hold charges', sawCharge);
  check('long charge fsmash out-damages short charge', b.percent > 22, 'dmg ' + b.percent.toFixed(1) + ' (full scale 25.2)');
}
// ---- 5. up HOLD = usmash charge — with the jump key in the hold (W+J) ----
{
  const g = newGame(48); resetPair(g);
  const [a] = g.fighters;
  const obs = newObs();
  run(g, 45, (t) => {
    const h = blank();
    if (t < 40) { h.up = true; h.jump = true; h.attack = true; } // the real W+J hold
    return h;
  }, obs);
  check('up hold enters charge', obs.states.has('charge'), [...obs.states].join(','));
  check('up hold never jumps/squats first', !obs.states.has('jump') && !obs.states.has('squat'), [...obs.states].join(','));
  check('up hold fires usmash', obs.moves.has('usmash'), [...obs.moves].join(','));
}
// ---- 6. crouch: stance, rooted, no slide, stands back up ----
{
  const g = newGame(49); resetPair(g);
  const [a] = g.fighters;
  run(g, 12, () => { const h = blank(); h.right = true; return h; });
  check('running before crouch', a.state === 'run' && a.vx > 0.08, a.state + ' vx ' + a.vx.toFixed(2));
  const x0 = a.x;
  let crouchedAll = true;
  for (let t = 0; t < 20; t++) {
    const h = blank(); h.down = true; h.right = true;
    g._human[0] = h; g._human[1] = blank(); g.tick();
    if (a.state !== 'crouch') crouchedAll = false;
  }
  check('down+dir holds crouch', crouchedAll, a.state);
  check('crouch is rooted (no slide)', Math.abs(a.x - x0) < 0.45, 'moved ' + (a.x - x0).toFixed(2));
  run(g, 5, () => blank());
  check('releasing down stands up', a.state === 'idle', a.state);
}
// ---- 7. five aerials, selected by direction vs facing at the press ----
{
  const g = newGame(50); resetPair(g);
  const [a] = g.fighters;
  const cases = [
    ['nair', {}, 1], ['fair', { right: true }, 1], ['bair', { left: true }, 1],
    ['uair', { up: true }, 1], ['dair', { down: true }, 1],
    ['bair mirrored', { right: true }, -1], ['fair mirrored', { left: true }, -1],
  ];
  for (const [label, hold, facing] of cases) {
    const want = label.split(' ')[0];
    Object.assign(a, { x: 0, y: 5, vx: 0, vy: 0, facing, moveId: null, _pendT: 0, stateFrame: 0 });
    a.state = 'fall'; a.onGround = false;
    let got = null;
    for (let t = 0; t < 6 && !got; t++) {
      const h = blank(); Object.assign(h, hold); if (t === 0) h.attack = true;
      g._human[0] = h; g._human[1] = blank(); g.tick();
      if (a.moveId) got = a.moveId;
    }
    check('air ' + label, got === want, 'got ' + got);
    run(g, 90, () => blank()); // let it finish / land
    resetPair(g);
  }
}
// ---- 8. landing mid-aerial = landing lag (<=10 ticks), then free ----
{
  const g = newGame(51); resetPair(g);
  const [a] = g.fighters;
  Object.assign(a, { x: 0, y: 2.5, vx: 0, vy: 0, moveId: null, stateFrame: 0 });
  a.state = 'fall'; a.onGround = false;
  let lagTicks = 0, lagMoveFrame = -1, sawDair = false;
  for (let t = 0; t < 90; t++) {
    const h = blank(); if (t === 0) { h.down = true; h.attack = true; }
    g._human[0] = h; g._human[1] = blank(); g.tick();
    if (a.moveId === 'dair') sawDair = true;
    if (a.state === 'landlag') { lagTicks++; if (lagMoveFrame < 0) lagMoveFrame = a.moveFrame; }
    if (lagTicks > 0 && a.state === 'idle') break;
  }
  check('dair started', sawDair);
  check('landing mid-aerial enters landing lag', lagTicks >= 2 && lagTicks <= 10, lagTicks + ' ticks');
  check('lag cut the move short (landed before total)', lagMoveFrame >= 0 && lagMoveFrame < a.moves.dair.total, 'frame ' + lagMoveFrame);
  check('free after lag', a.state === 'idle', a.state);
}
// ---- 9. an aerial that FINISHES in the air: no landing lag ----
{
  const g = newGame(52); resetPair(g);
  const [a] = g.fighters;
  Object.assign(a, { x: 0, y: 8, vx: 0, vy: 0, moveId: null, stateFrame: 0 });
  a.state = 'fall'; a.onGround = false;
  let sawLag = false, endedAirborne = false;
  for (let t = 0; t < 60; t++) {
    const h = blank(); if (t === 0) h.attack = true;
    g._human[0] = h; g._human[1] = blank(); g.tick();
    if (a.state === 'landlag') sawLag = true;
    if (t > 0 && !a.moveId && !a.onGround) endedAirborne = true;
  }
  check('completed aerial: no landing lag', !sawLag);
  check('completed aerial ends in the air', endedAirborne);
}
// ---- 10. classic smash-button (X/K) charge path untouched ----
{
  const g = newGame(53); resetPair(g);
  const [a, b] = g.fighters;
  runParked(g, 2, () => { const h = blank(); h.smash = true; return h; });
  const inCharge = a.state === 'charge';
  runParked(g, 70, () => blank());
  check('smash tap enters charge', inCharge, a.state);
  check('smash tap fsmash ~unscaled', b.percent > 16 && b.percent < 20, 'dmg ' + b.percent.toFixed(1));
}
{
  const g = newGame(54); resetPair(g);
  const [a, b] = g.fighters;
  runParked(g, 70, () => { const h = blank(); h.smash = true; return h; });
  runParked(g, 40, () => blank());
  check('smash full hold = 1.4x fsmash', b.percent > 24 && b.percent < 26.5, 'dmg ' + b.percent.toFixed(1));
}
// ---- 11. jab chains still flow through the tap decision ----
{
  const g = newGame(55); resetPair(g);
  const [a, b] = g.fighters;
  let rises = 0, lastPct = 0, maxCombo = 0;
  for (let t = 0; t < 90; t++) {
    // training dummy pinned in jab range (combo.mjs technique: re-parked
    // and held idle so consecutive hits register as one string)
    b.x = a.x + 0.7 * a.facing; b.y = 0; b.vx = 0; b.vy = 0;
    b.state = 'idle'; b.invuln = 0;
    const h = blank(); if (t % 5 < 2) h.attack = true; // mash rhythm: 2 on, 3 off
    g._human[0] = h; g._human[1] = blank(); g.tick();
    if (b.percent > lastPct) { rises++; lastPct = b.percent; }
    if ((a._combo || 0) > maxCombo) maxCombo = a._combo;
  }
  check('tapped jab chains land repeatedly', rises >= 2 && b.percent >= 5, rises + ' hits, ' + b.percent.toFixed(1) + '%');
  check('combo counter climbs on chains', maxCombo >= 3, 'combo ' + maxCombo);
}

console.log(fail === 0 ? 'ALL MOVESET CHECKS PASS' : `${fail} FAILURES (${pass} passed)`);
process.exit(fail ? 1 : 0);
