// js/budget.js — balance-budget math for the Fighter Lab.
// PURE: no three.js, no DOM. Safe to import anywhere (incl. node).

export function speedMult(startup) {
  if (startup <= 3) return 2.0;
  if (startup <= 6) return 1.5;
  if (startup <= 10) return 1.2;
  if (startup <= 16) return 1.0;
  return 0.8;
}

const KB_MULT = { kill: 1.5, strong: 1.2, neutral: 1.0, weak: 0.8 };
export function kbMultOf(kbClass) {
  return KB_MULT[kbClass] !== undefined ? KB_MULT[kbClass] : 1.0;
}

// Base sticker price of a move (before class tax).
export function moveCost(dmg, startup, kbClass) {
  return dmg * speedMult(startup) * kbMultOf(kbClass);
}

// Multiplier applied when a class equips a move (native moves are free in the lab;
// tax only matters for stolen moves).
export function classTax(cls, move) {
  if (cls === 'heavy' && move.startup <= 6) return 1.5;
  if (cls === 'light' && kbMultOf(move.kbClass) >= 1.2) return 1.4;
  return 1;
}

const BUDGETS = { light: 176, mid: 208, heavy: 240 };
export function classBudget(cls) {
  return BUDGETS[cls] !== undefined ? BUDGETS[cls] : 208;
}

// Total damage a move deals across all its hits (what moveCost prices).
// Projectile specials carry their damage on the projectile record.
export function moveDamage(move) {
  let dmg = 0;
  if (Array.isArray(move.hits)) dmg += move.hits.reduce((s, h) => s + (h.dmg || 0), 0);
  if (move.projectile && move.projectile.dmg) dmg += move.projectile.dmg;
  return dmg;
}

// What a fighter of class cls actually pays to equip this move.
export function taxedCost(move, cls) {
  return moveCost(moveDamage(move), move.startup, move.kbClass) * classTax(cls, move);
}

export function kitCost(moves, cls) {
  let sum = 0;
  for (const id of Object.keys(moves)) sum += taxedCost(moves[id], cls);
  return sum;
}

// Cap rule: no single move may cost more than 2x the class per-move average.
export function moveCap(cls) {
  return (classBudget(cls) / 16) * 2;
}

export function validateKit(moves, cls) {
  const budget = classBudget(cls);
  const cap = moveCap(cls);
  let spent = 0;
  let priciest = -Infinity;
  let priciestTaxedId = null;
  const capViolations = [];
  for (const id of Object.keys(moves)) {
    const m = moves[id];
    const c = taxedCost(m, cls);
    spent += c;
    if (c > priciest) { priciest = c; priciestTaxedId = m.id || id; }
    if (c > cap) capViolations.push(m.id || id);
  }
  const overBy = Math.max(0, spent - budget);
  return {
    spent,
    budget,
    ok: overBy <= 0 && capViolations.length === 0,
    overBy,
    priciestTaxedId,
    capViolations,
  };
}
