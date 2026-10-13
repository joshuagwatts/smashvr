// js/fighters.js — createFighter('ronin'|'volt') -> engine-ready fighter record.
// Auto-applies the saved Fighter Lab kit ('smashvr_kit_<defId>') and theme
// ('smashvr_theme_<defId>') from localStorage. Saved kit moves are rehydrated
// to their canonical move records by id (falling back to the stored clone).

import { FIGHTER_DEFS, MOVES, SLOTS } from './moves.js';
import { buildProceduralRig } from './rig.js';
import { classBudget } from './budget.js';

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

  const rig = buildProceduralRig(theme, defId);

  // Kit: native moveset overlaid with the saved lab kit.
  const savedKit = loadJSON('smashvr_kit_' + defId) || {};
  const moves = {};
  for (const slot of SLOTS) {
    const sv = savedKit[slot];
    if (sv && sv.id) {
      moves[slot] = findMoveById(sv.id) || sv;
    } else {
      moves[slot] = MOVES[defId][slot];
    }
  }

  return {
    defId,
    name: def.name,
    cls: def.cls,
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

    root: rig.group,
    rig,
    vrm: null,

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
