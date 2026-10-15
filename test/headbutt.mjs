/* headbutt overlay: customs with style.headbutts get bruiser jab/fsmash */
import { loadEngine } from './_harness.mjs';
const { THREE } = await loadEngine();
const { FIGHTER_DEFS, MOVES, STRIKE_LIMB } = await import('../js/moves.js?v=29');
const { createFighter } = await import('../js/fighters.js');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

check('bruiser kit exists', !!MOVES.bruiser && !!MOVES.bruiser.jab && !!MOVES.bruiser.fsmash);
check('bruiser jab named Headbutt', MOVES.bruiser.jab.name === 'Headbutt', MOVES.bruiser.jab.name);
check('bruiser fsmash named Skull Bash', MOVES.bruiser.fsmash.name === 'Skull Bash');
check('strike limb head (jab)', STRIKE_LIMB[MOVES.bruiser.jab.id] === 'head', STRIKE_LIMB[MOVES.bruiser.jab.id]);
check('strike limb head (fsmash)', STRIKE_LIMB[MOVES.bruiser.fsmash.id] === 'head');
check('move ids', MOVES.bruiser.jab.id === 'bruiser_jab' && MOVES.bruiser.fsmash.id === 'bruiser_fsmash');

// fake custom def with headbutts style (like Mushy's auto-detected style)
FIGHTER_DEFS['test_mushy'] = {
  ...FIGHTER_DEFS.ronin, id: 'test_mushy', name: 'MUSHY', custom: true,
  kit: 'wisp', style: { kit: 'wisp', style: 'silly', headbutts: true, squashMul: 1.6, label: 'Cartoony brawler' },
};
const f = createFighter('test_mushy');
check('headbutt style -> jab is Headbutt', f.moves.jab.name === 'Headbutt', f.moves.jab.name);
check('headbutt style -> fsmash is Skull Bash', f.moves.fsmash.name === 'Skull Bash', f.moves.fsmash.name);
check('other slots untouched (ftilt)', f.moves.ftilt.id === MOVES.wisp.ftilt.id, f.moves.ftilt.id);

// non-headbutt custom keeps native kit
FIGHTER_DEFS['test_plain'] = {
  ...FIGHTER_DEFS.ronin, id: 'test_plain', name: 'PLAIN', custom: true,
  kit: 'ronin', style: { kit: 'ronin', style: 'brawler', headbutts: false, squashMul: 1.0, label: 'Brawler' },
};
const g = createFighter('test_plain');
check('plain style -> jab unchanged', g.moves.jab.id === 'ronin_jab', g.moves.jab.id);
check('builtin ronin untouched', createFighter('ronin').moves.jab.id === 'ronin_jab');

console.log(fail === 0 ? 'ALL HEADBUTT CHECKS PASS' : `${fail} FAILURES`);
process.exit(fail ? 1 : 0);
