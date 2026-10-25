// js/fighters.js — createFighter('ronin'|'volt') -> engine-ready fighter record.
// Auto-applies the saved Fighter Lab kit ('smashvr_kit_<defId>') and theme
// ('smashvr_theme_<defId>') from localStorage. Saved kit moves are rehydrated
// to their canonical move records by id (falling back to the stored clone).

import { FIGHTER_DEFS, MOVES, SLOTS } from './moves.js?v=45';
// v0.23: re-exported so tests can register fake defs on the live instance.
export { FIGHTER_DEFS };
import { buildProceduralRig } from './rig.js?v=45';
import { classBudget } from './budget.js?v=45';
import * as THREE from 'three';

function loadJSON(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

export function findMoveById(id) {
  for (const d of Object.keys(MOVES)) {
    for (const s of Object.keys(MOVES[d])) {
      if (MOVES[d][s].id === id) return MOVES[d][s];
    }
  }
  return null;
}

export function createFighter(defId) {
  const def = FIGHTER_DEFS[defId];
  if (!def) throw new Error('createFighter: unknown fighter defId "' + defId + '"');

  // Theme: saved lab theme wins, else the def default.
  const savedTheme = loadJSON('smashvr_theme_' + defId) || {};
  const theme = {
    primary: savedTheme.primary || def.theme.primary,
    secondary: savedTheme.secondary || def.theme.secondary,
  };

  // v0.6: body type — Lab override ('smashvr_bodytype_<defId>': auto/biped/floater)
  // wins; otherwise the def's native type. Drives hover locomotion + rig choice.
  const btOverride = loadJSON('smashvr_bodytype_' + defId, 'auto');
  const bodyType = (btOverride === 'biped' || btOverride === 'floater')
    ? btOverride
    : (def.bodyType || 'biped');

  // v0.7: customs use the wisp (floater) rig as fallback when their bodyType
  // is floater — the VRM hides it on attach anyway.
  const rig = buildProceduralRig(theme, bodyType === 'floater' ? 'wisp' : defId);
  // v0.6.2: root is a wrapper — attachVRMToFighter hides rig.group only, so the
  // per-frame root visibility toggle (respawn blink in anim.js) can never
  // re-show the procedural rig on top of an attached VRM.
  const root = new THREE.Group();
  root.add(rig.group);

  // Kit: native moveset overlaid with the saved lab kit.
  // v0.7: custom roster defs have no MOVES entry of their own — their native
  // kit is the kit def's moveset (default ronin, swappable in the Lab).
  let nativeMoves = def.custom ? MOVES[def.kit] : MOVES[defId];
  // v0.22: headbutt styles — big-head bruisers lead with the skull. Swapped in
  // BEFORE the Lab's saved kit so a manual pick in the Lab still wins.
  if (def.style && def.style.headbutts && MOVES.bruiser) {
    nativeMoves = { ...nativeMoves, jab: MOVES.bruiser.jab, fsmash: MOVES.bruiser.fsmash };
  }
  const savedKit = loadJSON('smashvr_kit_' + defId) || {};
  const moves = {};
  for (const slot of SLOTS) {
    const sv = savedKit[slot];
    if (sv && sv.id) {
      moves[slot] = findMoveById(sv.id) || sv;
    } else {
      moves[slot] = nativeMoves[slot];
    }
  }

  return {
    defId,
    name: def.name,
    cls: def.cls,
    bodyType,
    theme,
    weight: def.weight,
    runSpeed: def.runSpeed,
    airSpeed: def.airSpeed,
    fallSpeed: def.fallSpeed,
    fastFall: def.fastFall,
    jumpV: def.jumpV,
    djumpV: def.djumpV,
    traction: def.traction,
    moves,
    budget: classBudget(def.cls),

    root,
    rig,
    vrm: null,

    // v0.19: fighting style (customs) — drives squash & stretch intensity.
    _squashMul: (def.style && def.style.squashMul) || 1,

    // v0.9: multiplayer identity — engine sets these from the slot config.
    team: null,   // 'red' | 'blue' | null (FFA)
    ctrl: 'cpu',  // 'p1' | 'p2' | 'cpu'
    slot: 0,
    _portColor: '#ff3b30',

    // engine state
    x: 0, y: 0, vx: 0, vy: 0,
    facing: 1,
    percent: 0,
    stocks: 3,
    state: 'idle',
    stateFrame: 0,
    moveId: null,
    moveFrame: 0,
    onGround: true,
    jumpsUsed: 0,
    shieldHP: 60,
    invuln: 0,
    hitPause: 0,
    ai: null,
  };
}
