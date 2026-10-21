/* v0.26: handheld-console touch input — the analog stick vector must map to
   the same direction booleans the keyboard produces (deadzone, cardinal
   thresholds, hysteresis), and Input.virtual must feed Input.down() exactly
   like physical keys so engine.readHuman() sees touch input unchanged. */
import { stickToDirs, STICK_DEADZONE } from '../js/touchui.js';
import { Input } from '../js/input.js';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };
const NONE = { left: false, right: false, up: false, down: false };
const eq = (a, b) => a.left === b.left && a.right === b.right && a.up === b.up && a.down === b.down;

// 1) centered stick = neutral
check('center is neutral', eq(stickToDirs(0, 0), NONE));
// 2) inside the deadzone = neutral, even diagonally
check('deadzone swallows small tilt', eq(stickToDirs(STICK_DEADZONE * 0.6, STICK_DEADZONE * 0.6), NONE));
// 3) full right / left
check('full right', eq(stickToDirs(1, 0), { ...NONE, right: true }));
check('full left', eq(stickToDirs(-1, 0), { ...NONE, left: true }));
// 4) up on the stick = jump/up direction, down = crouch
check('full up', eq(stickToDirs(0, -1), { ...NONE, up: true }));
check('full down', eq(stickToDirs(0, 1), { ...NONE, down: true }));
// 5) diagonal keeps both cardinals (run + jump arcs)
check('up-right diagonal', eq(stickToDirs(0.8, -0.8), { ...NONE, right: true, up: true }));
// 6) shallow diagonal favors the dominant axis only
check('shallow right-down favors right', eq(stickToDirs(0.9, 0.3), { ...NONE, right: true }));
// 7) hysteresis: once on, a direction survives dips into the off band...
{
  const on = stickToDirs(0.5, 0);
  check('tilt 0.5 turns right on', on.right === true);
  const held = stickToDirs(0.3, 0, on);
  check('dip to 0.3 keeps right (hysteresis)', held.right === true);
  const off = stickToDirs(0.2, 0, held);
  check('dip to 0.2 releases right', off.right === false);
  // ...but the same 0.3 from neutral does NOT turn it on
  check('0.3 from neutral stays off', stickToDirs(0.3, 0).right === false);
}
// 8) virtual keys feed Input.down() like physical keys, per P1 code map
{
  const m = Input.map[1];
  check('virtual starts clear', Input.down(m.attack) === false);
  Input.setVirtual(m.attack, true);
  check('setVirtual(attack) reads as down', Input.down(m.attack) === true);
  check('other codes unaffected', Input.down(m.special) === false);
  Input.setVirtual(m.attack, false);
  check('release clears down', Input.down(m.attack) === false);
  Input.keys[m.shield] = true;
  check('physical and virtual OR together', Input.down(m.shield) === true);
  delete Input.keys[m.shield];
}

console.log(fail === 0 ? `ALL TOUCH-INPUT CHECKS PASS (${pass})` : `${fail} FAILURES (${pass} pass)`);
process.exit(fail ? 1 : 0);
