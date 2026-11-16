// js/archetypes.js — v0.51: the base character archetype registry.
// Joshua's ask: "more base character archetypes to bounce off of" — the
// classic roster templates every fighter (built-in or imported custom) is
// built/assigned from. Each archetype = a label, a tagline, the kit it
// runs, and a physics profile (weight / speeds / fall / jumps) that a
// fighter assigned to the archetype inherits.
//
// This is NOT js/archetype.js (that's the VRM auto-detection analyzer —
// unchanged). This file is the registry the select screen, the Lab style
// dropdown and roster.registerDef all read from.
//
// Physics profiles are DERIVED from the archetype's base fighter def so
// the registry can never drift from the fighters themselves.

import { FIGHTER_DEFS } from './moves.js?v=51';

const PHYS_FIELDS = [
  'weight', 'runSpeed', 'airSpeed', 'fallSpeed', 'fastFall',
  'jumpV', 'djumpV', 'traction', 'jumps', 'grabRangeMul', 'throwMul',
];

// The physics profile an archetype hands to a fighter assigned to it.
// Fields a def doesn't set fall back to the engine defaults (jumps 1,
// grab/throw multipliers 1) so the profile is always complete.
export function physicsOf(defId) {
  const def = FIGHTER_DEFS[defId];
  if (!def) return null;
  const out = {};
  for (const k of PHYS_FIELDS) out[k] = def[k] !== undefined ? def[k] : (k === 'weight' ? 100 : 1);
  out.cls = def.cls;
  return out;
}

// id -> { id, label, tagline, kitId, defId }
// kitId: the MOVES kit the archetype fights with. defId: the base fighter
// whose physics profile the archetype carries (same fighter for all eight
// launch archetypes — customs assigned an archetype take ITS physics).
export const ARCHETYPES = {
  ronin: {
    id: 'ronin', label: 'ALL-ROUNDER', kitId: 'ronin', defId: 'ronin',
    tagline: 'Balanced blade — no weakness, no gimmick, all fundamentals.',
  },
  volt: {
    id: 'volt', label: 'POWERHOUSE', kitId: 'volt', defId: 'volt',
    tagline: 'A fast heavyweight. Every hit is a truck with a schedule.',
  },
  wisp: {
    id: 'wisp', label: 'FLOATER', kitId: 'wisp', defId: 'wisp',
    tagline: 'A drifting ghost — light, floaty, and hard to pin down.',
  },
  blitz: {
    id: 'blitz', label: 'RUSHDOWN', kitId: 'blitz', defId: 'blitz',
    tagline: 'Death by a thousand cuts. Fastest feet on the roster.',
  },
  spectre: {
    id: 'spectre', label: 'ZONER', kitId: 'spectre', defId: 'spectre',
    tagline: 'Keep-away artist — fights you from across the stage.',
  },
  titan: {
    id: 'titan', label: 'GRAPPLER', kitId: 'titan', defId: 'titan',
    tagline: 'Get close and you get thrown. Slow feet, iron hands.',
  },
  saber: {
    id: 'saber', label: 'DUELIST', kitId: 'saber', defId: 'saber',
    tagline: 'A living blade — wins on reach, kills on the tip.',
  },
  mirage: {
    id: 'mirage', label: 'TRICKSTER', kitId: 'mirage', defId: 'mirage',
    tagline: 'Here, gone, behind you. Blinks, double jumps, weak hits.',
  },
};

// The three archetypes a custom import can be assigned in the Lab (the
// v0.51 additions). Maps Lab style name -> archetype id.
export const CUSTOM_STYLE_ARCHETYPES = {
  grappler: 'titan',
  duelist: 'saber',
  trickster: 'mirage',
};

// Archetype record for a fighter def: built-ins ARE their archetype;
// customs take the archetype their style override (or kit) points at.
export function archetypeForDef(defId, def) {
  if (!def) return null;
  if (!def.custom && ARCHETYPES[defId]) return ARCHETYPES[defId];
  if (def.custom) {
    if (def.styleOverride && CUSTOM_STYLE_ARCHETYPES[def.styleOverride]) {
      return ARCHETYPES[CUSTOM_STYLE_ARCHETYPES[def.styleOverride]];
    }
    for (const a of Object.values(ARCHETYPES)) {
      if (a.kitId === def.kit) return a;
    }
  }
  return ARCHETYPES.ronin;
}
