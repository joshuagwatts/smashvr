// js/engine.js — SMASHVR core game: fixed-timestep fighter simulation,
// stage + blast zones, hit/shield/KO rules, specials, projectiles, CPU AI,
// camera, countdown, timer, pause. Consumes the fighter-side contract:
// createFighter (fighters.js), tickFighterVisual (anim.js), fx fns (fx.js),
// knockback math (kb.js).

import * as THREE from 'three';
import { createFighter } from './fighters.js';
import { tickFighterVisual } from './anim.js';
import {
  initFX, hitSpark, koBlast, spawnProjectile,
  updateProjectiles, shieldBubbleAttach, updateShieldBubble, clearFX,
} from './fx.js';
import { knockback, hitstunFrames, launchVelocity, TUNING } from './kb.js';
import { Input } from './input.js';
import { sfx } from './audio.js';

const TICK = 1 / 60;
const GRAV = 0.007;             // fall accel, units/frame^2 (rebalanced 2026-10-13:
                                // stage is 14u wide, blast at +/-13 — see PLAYTEST.md)
const STAGE = { x0: -7, x1: 7, top: 0 };
const PLATS = [                 // one-way: land from above only
  { cx: -4.2, y: 3.2, hw: 1.7 },
  { cx: 4.2, y: 3.2, hw: 1.7 },
];
const BLAST = { x: 13, top: 11, bottom: -7 };
const SHIELD_MAX = 60;
const START_STOCKS = 3;
const MATCH_TIME = 300;         // seconds
const HURT_W = 1.0, HURT_H = 1.7; // hurtbox, feet-anchored (y = feet)

// ---------------------------------------------------------------- helpers

function setState(f, s) {
  if (f.state !== s) { f.state = s; f.stateFrame = 0; }
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  // center-based rects
  return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
}

function blankHold() {
  return { left: false, right: false, up: false, down: false, jump: false,
           attack: false, smash: false, special: false, shield: false };
}

// held-bool struct -> per-tick struct with pressed edges for action buttons
function edges(prev, cur) {
  return {
    left: cur.left, right: cur.right, up: cur.up, down: cur.down, shield: cur.shield,
    jumpP: cur.jump && !prev.jump,
    attackP: cur.attack && !prev.attack,
    smashP: cur.smash && !prev.smash,
    specialP: cur.special && !prev.special,
  };
}

function readHuman(p) {
  const m = Input.map[p];
  return {
    left: Input.down(m.left), right: Input.down(m.right),
    up: Input.down(m.jump), // W / Up doubles as the "up" tilt direction
    down: Input.down(m.down), jump: Input.down(m.jump),
    attack: Input.down(m.attack), smash: Input.down(m.smash),
    special: Input.down(m.special), shield: Input.down(m.shield),
  };
}

// ---------------------------------------------------------------- CPU AI

function thinkAI(f, foe, a) {
  const h = blankHold();
  const offstage = !f.onGround && (f.x < STAGE.x0 || f.x > STAGE.x1 || f.y < 0.3);

  if (offstage) {
    // recover: drift to stage, jump, then up-special
    h[f.x > 0 ? 'left' : 'right'] = true;
    if (f.y < -0.8 && f.jumpsUsed < 1) {
      a.tap.jump = true;
    } else if (f.y < -2.0 && !a.usedUpB) {
      h.up = true;
      a.tap.special = true;
      a.usedUpB = true;
    }
    return h;
  }

  const dx = foe.x - f.x, dy = foe.y - f.y;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx > 0.7) h[dx > 0 ? 'right' : 'left'] = true;
  const r = Math.random();

  if (adx < 2.6 && ady < 2.6) {
    // in range — fight
    if (f.onGround) {
      if (r < 0.34) {
        a.tap.attack = true;
        if (dy > 1.4) h.up = true; else if (dy < -1) h.down = true;
      } else if (r < 0.48) {
        a.tap.smash = true;
        if (dy > 1.4) h.up = true; else if (dy < -1) h.down = true;
      } else if (r < 0.60) {
        a.tap.special = true;
        if (dy > 2) h.up = true;
      } else if (r < 0.66) {
        h.shield = true; a.shieldT = 15;
      }
    } else {
      a.tap.attack = true;
      if (dy > 1.2) h.up = true;
      else if (dy < -1.2) h.down = true;
      else if (dx * f.facing < 0) h[f.facing > 0 ? 'left' : 'right'] = true; // bair
    }
  } else {
    // approach
    if (dy > 2.2 && f.onGround && r < 0.5) a.tap.jump = true;
    if (adx < 5 && adx > 2.5 && r < 0.10) a.tap.special = true; // projectile poke
    // don't chase off the edge (AI decides every 12 ticks; at ~0.15 u/tick
    // it can drift ~1.8u between decisions, so turn around well inside x=7)
    if (f.onGround && Math.abs(f.x) > 5.0 && Math.sign(dx) === Math.sign(f.x)) {
      h[dx > 0 ? 'right' : 'left'] = false;
      h[dx > 0 ? 'left' : 'right'] = true;
    }
  }
  return h;
}

function aiControl(f, foe) {
  const a = f._ai;
  let h;
  if (a.cool > 0) { a.cool--; h = Object.assign({}, a.hold); }
  else { a.cool = 12; h = thinkAI(f, foe, a); a.hold = h; }
  for (const k in a.tap) if (a.tap[k]) h[k] = true; // one-shot presses
  a.tap = {};
  if (a.shieldT > 0) { a.shieldT--; h.shield = true; }
  return h;
}

// ---------------------------------------------------------------- game

export function createGame(opts) {
  const {
    mode = 'cpu', p1def = 'ronin', p2def = 'volt', scene,
    onEnd = () => {}, onPause = () => {}, onHud = () => {},
    demo = false,
  } = opts;

  initFX(scene);
  const stageGroup = buildStage(scene);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 3.5, 16);

  const fighters = [createFighter(p1def), createFighter(p2def)];
  const isCPU = (i) => demo || (mode === 'cpu' && i === 1);

  fighters.forEach((f, i) => {
    const x = i === 0 ? -3 : 3;
    f.x = x; f.y = 0; f.vx = 0; f.vy = 0;
    f.facing = i === 0 ? 1 : -1;
    f.percent = 0; f.stocks = START_STOCKS;
    f.state = 'idle'; f.stateFrame = 0;
    f.moveId = null; f.moveFrame = 0;
    f.onGround = true; f.jumpsUsed = 0;
    f.shieldHP = SHIELD_MAX; f.invuln = 0; f.hitPause = 0;
    // engine internals
    f._prevH = blankHold();
    f._hitSet = new Set();
    f._hitstunDur = 0;
    f._shieldMesh = null;
    f._plat = null;
    f._dropT = 0;
    f._fastFalling = false;
    f._ai = { cool: 0, hold: blankHold(), tap: {}, shieldT: 0, usedUpB: false };
    scene.add(f.root);
    syncRoot(f);
  });

  const game = {
    state: 'countdown',           // countdown -> fight -> done
    fighters,
    camera,
    paused: false,
    _acc: 0,
    _cd: 100,                    // countdown ticks (~1.7s of 3-2-1)
    _timer: MATCH_TIME * 60,
    _human: [blankHold(), blankHold()],
    // feel pass v0.2: impact shake + KO-blow cinematic state
    _shakeT: 0, _shakeDur: 1, _shakeAmp: 0,
    _koFx: null,                // { t, dur, x, y } while the KO freeze plays

    update(dt) {
      if (this.paused || this.state === 'done') return;
      this._acc = Math.min(this._acc + dt, 0.25);
      this._human = [readHuman(1), readHuman(2)]; // sample once per frame
      let n = 0;
      while (this._acc >= TICK && n < 5) {
        this._acc -= TICK; n++;
        this.tick();
      }
      if (n === 5) this._acc = 0; // shed backlog, no spiral
    },

    tick() {
      if (this.state === 'countdown') {
        this._cd--;
        if (this._cd <= 0) { this.state = 'fight'; sfx.countdownGo(); }
        for (const f of fighters) { tickFighterVisual(f, TICK); syncRoot(f); }
        this.pushHud();
        return;
      }
      if (this.state !== 'fight') return;

      if (--this._timer <= 0) { this.timeUp(); return; }

      const [f1, f2] = fighters;
      stepFighter(this, f1, isCPU(0) ? aiControl(f1, f2) : this._human[0], f2);
      stepFighter(this, f2, isCPU(1) ? aiControl(f2, f1) : this._human[1], f1);
      stepProjectiles(this);

      for (const f of fighters) checkBlast(this, f);
      if (this.state !== 'fight') return; // a KO may have ended it

      updateCamera(this);
      for (const f of fighters) {
        tickFighterVisual(f, TICK);
        syncRoot(f);
        if (f._shieldMesh) updateShieldBubble(f);
      }
      this.pushHud();
    },

    setPaused(v) {
      if (this.state !== 'fight') return;
      this.paused = v;
      onPause(v);
    },

    pushHud() {
      const snap = (f) => ({
        name: f.name, percent: Math.floor(f.percent), stocks: f.stocks,
        shield: f.shieldHP / SHIELD_MAX,
      });
      onHud({
        p1: snap(fighters[0]), p2: snap(fighters[1]),
        time: Math.max(0, Math.ceil(this._timer / 60)),
        phase: this.state,
        countdown: this.state === 'countdown' ? Math.max(1, Math.ceil(this._cd / 34)) : 0,
        paused: this.paused,
      });
    },

    finish(result) {
      if (this.state === 'done') return;
      this.state = 'done';
      onEnd(result);
    },

    timeUp() {
      const [a, b] = fighters;
      const score = (f) => f.stocks * 10000 - f.percent;
      const winner = score(a) === score(b) ? a : (score(a) > score(b) ? a : b);
      this.finish({ winner, reason: 'time' });
    },

    destroy() {
      scene.remove(stageGroup);
      for (const f of fighters) {
        if (f._shieldMesh) { f.root.remove(f._shieldMesh); f._shieldMesh = null; }
        scene.remove(f.root);
      }
      clearFX();
    },
  };

  return game;
}

// ---------------------------------------------------------------- stage

function buildStage(scene) {
  const g = new THREE.Group();
  const platMat = new THREE.MeshStandardMaterial({ color: 0x1c2340, roughness: 0.7, metalness: 0.3 });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

  const main = new THREE.Mesh(new THREE.BoxGeometry(15, 1, 4), platMat);
  main.position.set(0, -0.5, 0);
  g.add(main);
  const mainEdge = new THREE.Mesh(new THREE.BoxGeometry(15.06, 0.08, 4.06), edgeMat);
  mainEdge.position.set(0, -0.02, 0);
  g.add(mainEdge);

  for (const p of PLATS) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p.hw * 2, 0.4, 3), platMat);
    m.position.set(p.cx, p.y - 0.2, 0);
    g.add(m);
    const e = new THREE.Mesh(new THREE.BoxGeometry(p.hw * 2 + 0.06, 0.06, 3.06), edgeMat);
    e.position.set(p.cx, p.y - 0.01, 0);
    g.add(e);
  }
  scene.add(g);
  return g;
}

function syncRoot(f) {
  f.root.position.set(f.x, f.y, 0);
  f.root.scale.x = f.facing; // face the model toward f.facing
  f.root.scale.y = 1; f.root.scale.z = 1;
}

function updateCamera(game) {
  const [a, b] = game.fighters;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  let cx = Math.max(-4, Math.min(4, mx)) * 0.6;
  const dist = Math.abs(a.x - b.x);
  let z = 16 + Math.max(0, Math.min(10, dist - 8)) * 0.5;
  let cy = 3.5 + (my - 2) * 0.15;
  let lookY = 2.2;

  // KO-blow cinematic (v0.2): push in toward the victim over the freeze,
  // then ease back out. Blend is smoothstepped so there's no snap.
  const k = game._koFx;
  if (k && k.t < k.dur) {
    k.t++;
    const IN = 26, OUT = 20;
    let blend;
    if (k.t <= IN) blend = k.t / IN;
    else blend = Math.max(0, 1 - (k.t - IN) / OUT);
    const e = blend * blend * (3 - 2 * blend);
    const kx = Math.max(-4, Math.min(4, k.x)) * 0.6;
    cx = cx + (kx - cx) * e;
    cy = cy + ((2.4 + k.y * 0.25) - cy) * e;
    z = z + (12.5 - z) * e;
    lookY = lookY + (Math.max(0.5, k.y + 1) - lookY) * e;
  }

  // impact shake (v0.2): subtle, amplitude decays quadratically — strong/kill
  // hits and KO blows only, never weak pokes.
  let sx = 0, sy = 0;
  if (game._shakeT > 0) {
    game._shakeT--;
    const u = game._shakeT / game._shakeDur; // 1 -> 0
    const amp = game._shakeAmp * u * u;
    sx = (Math.random() * 2 - 1) * amp;
    sy = (Math.random() * 2 - 1) * amp;
  }

  game.camera.position.set(cx + sx, cy + sy, z);
  game.camera.lookAt(cx, lookY, 0);
}

// ---------------------------------------------------------------- per-fighter step

function stepFighter(game, f, cur, foe) {
  const e = edges(f._prevH, cur);
  f._prevH = cur;

  if (f.state === 'dead') return;
  f.stateFrame++;
  if (f.invuln > 0) f.invuln--;
  if (f._dropT > 0) f._dropT--;
  if (f.hitPause > 0) { f.hitPause--; return; } // frozen — no physics

  if (f.shieldHP < SHIELD_MAX && f.state !== 'shield') {
    f.shieldHP = Math.min(SHIELD_MAX, f.shieldHP + 0.25);
  }

  switch (f.state) {
    case 'respawn':
      if (f.stateFrame >= 50) setState(f, 'fall');
      return;
    case 'hitstun':
      // v0.2: knockback decay — launches start fast and bleed off instead of
      // drifting at constant speed (calibrated with LAUNCH_VEL_SCALE in kb.js)
      f.vx *= TUNING.HITSTUN_DRAG;
      physics(game, f);
      if (f.stateFrame >= f._hitstunDur) setState(f, f.onGround ? 'idle' : 'fall');
      return;
    case 'shield':
      stepShield(game, f, e);
      physics(game, f);
      return;
    case 'attack':
      stepAttack(game, f, e, foe);
      return;
    case 'helpless':
      // S64-like: you can still air-drift after your up-B (needed for recovery)
      {
        const hdir = (e.right ? 1 : 0) - (e.left ? 1 : 0);
        const tgt = hdir * f.airSpeed;
        const dd = tgt - f.vx;
        f.vx += Math.sign(dd) * Math.min(Math.abs(dd), 0.35);
      }
      physics(game, f);
      return;
    default:
      stepControl(game, f, e);
      physics(game, f);
  }
}

function physics(game, f) {
  f.vy -= GRAV;
  // Terminal-velocity cap: skipped during hitstun so launch trajectories are
  // never truncated (a strong launch legitimately exceeds fall speed).
  const cap = f._fastFalling ? f.fastFall : f.fallSpeed;
  if (f.state !== 'hitstun' && f.vy < -cap) f.vy = -cap;

  const px = f.x, py = f.y;
  f.x += f.vx;
  f.y += f.vy;

  // main platform (one-way from above)
  if (f.vy <= 0 && py >= STAGE.top && f.y <= STAGE.top &&
      f.x >= STAGE.x0 - 0.15 && f.x <= STAGE.x1 + 0.15) {
    land(game, f, STAGE.top, null);
    return;
  }
  // floating platforms (one-way, droppable)
  if (f._dropT <= 0 && f.vy <= 0) {
    for (const p of PLATS) {
      if (py >= p.y && f.y <= p.y && Math.abs(f.x - p.cx) <= p.hw) {
        land(game, f, p.y, p);
        return;
      }
    }
  }
  // walked / knocked off support?
  if (f.onGround) {
    const overMain = f.y === STAGE.top && f.x >= STAGE.x0 - 0.15 && f.x <= STAGE.x1 + 0.15;
    const overPlat = f._plat && f.y === f._plat.y && Math.abs(f.x - f._plat.cx) <= f._plat.hw;
    if (!overMain && !overPlat) {
      f.onGround = false; f._plat = null;
      if (f.state === 'idle' || f.state === 'run' || f.state === 'crouch') setState(f, 'fall');
    }
  }
}

function land(game, f, gy, plat) {
  // NOTE: physics() calls land() every tick for grounded fighters as the
  // "snap to ground" mechanism, so the aerial landing-cancel must only fire
  // when the fighter was actually airborne — otherwise every grounded attack
  // is canceled on its first tick (bug found 2026-10-13 in browser testing:
  // no grounded attack could ever execute).
  const wasAir = !f.onGround;
  f.y = gy; f.vy = 0;
  f.onGround = true; f._plat = plat || null;
  f.jumpsUsed = 0;
  if (f._ai) f._ai.usedUpB = false;
  if (f.state === 'attack' && wasAir) endAttack(f); // aerial landing cancels
  else if (f.state === 'jump' || f.state === 'fall' || f.state === 'helpless') setState(f, 'idle');
}

function stepControl(game, f, e) {
  if (e.left && !e.right) f.facing = -1;
  else if (e.right && !e.left) f.facing = 1;
  const dir = (e.right ? 1 : 0) - (e.left ? 1 : 0);

  if (f.onGround) {
    const tgt = dir * f.runSpeed;
    if (dir !== 0) {
      const d = tgt - f.vx;
      f.vx += Math.sign(d) * Math.min(Math.abs(d), 0.7);
      setState(f, 'run');
    } else {
      f.vx *= f.traction; // traction as ground friction multiplier
      if (Math.abs(f.vx) < 0.05) f.vx = 0;
      setState(f, 'idle');
    }
  } else {
    const tgt = dir * f.airSpeed;
    const d = tgt - f.vx;
    f.vx += Math.sign(d) * Math.min(Math.abs(d), 0.35);
    setState(f, f.vy > 0.5 ? 'jump' : 'fall');
  }

  // fast fall
  f._fastFalling = false;
  if (!f.onGround && e.down && f.vy < 0) { f.vy = -f.fastFall; f._fastFalling = true; }

  // attacks take priority over jump (so W+J = utilt, not a jump)
  if (e.attackP || e.smashP || e.specialP) { startAttackFromInput(game, f, e); return; }

  if (e.jumpP) {
    if (f.onGround && f._plat && e.down) { // drop through platform
      f._dropT = 18; f.onGround = false; f._plat = null;
      f.y -= 0.05; setState(f, 'fall');
      return;
    }
    if (f.onGround) {
      f.vy = f.jumpV; f.onGround = false; f.jumpsUsed = 0;
      setState(f, 'jump'); sfx.jump();
    } else if (f.jumpsUsed < 1) {
      f.jumpsUsed++; f.vy = f.djumpV; f._fastFalling = false;
      setState(f, 'jump'); sfx.jump();
    }
    return;
  }

  if (e.shield && f.onGround) { enterShield(f); return; }
  if (e.down && f.onGround) { setState(f, 'crouch'); }
}

// ---------------------------------------------------------------- attacks

function airAttackId(f, e) {
  if (e.up) return 'uair';
  if (e.down) return 'dair';
  if (e.left || e.right) {
    const dir = (e.right ? 1 : 0) - (e.left ? 1 : 0);
    return dir === f.facing ? 'fair' : 'bair';
  }
  return 'nair';
}

function startAttackFromInput(game, f, e) {
  const up = e.up, dn = e.down, h = e.left || e.right;
  let id;
  if (e.specialP) {
    id = up ? 'uspecial' : dn ? 'dspecial' : h ? 'sspecial' : 'nspecial';
  } else if (e.smashP) {
    id = f.onGround ? (up ? 'usmash' : dn ? 'dsmash' : 'fsmash') : airAttackId(f, e);
  } else {
    id = f.onGround ? (up ? 'utilt' : dn ? 'dtilt' : h ? 'ftilt' : 'jab') : airAttackId(f, e);
  }
  startAttack(f, id);
}

function startAttack(f, id) {
  const mv = f.moves[id];
  if (!mv) return;
  setState(f, 'attack');
  f.moveId = id; f.moveFrame = 0;
  f._hitSet = new Set();
  f._lungeDone = false;
  f._fired = false;
  f._lifts = 0;
  sfx.whiff();
}

function endAttack(f) {
  f.moveId = null;
  setState(f, f.onGround ? 'idle' : 'fall');
}

function fireSpecial(f, mv) {
  switch (mv.special) {
    case 'fireball':
      spawnProjectile(f, mv, f.x + f.facing * 0.8, f.y + 1.1, f.facing);
      break;
    case 'rise':
    case 'divegrab':
      f.vy = 0.28; f.vx *= 0.75; f.onGround = false;
      break;
    case 'spin':
      f.vx = f.facing * 0.075;
      if (!f.onGround) f.vy = Math.max(f.vy, 0.10);
      break;
    case 'divekick':
      f.vy = -0.5; f.vx = f.facing * 0.2; f.onGround = false;
      break;
    case 'punch':
      f.vx += f.facing * 0.12;
      break;
  }
}

function stepAttack(game, f, e, foe) {
  const mv = f.moves[f.moveId];
  if (!mv) { endAttack(f); return; }
  f.moveFrame++;
  const mf = f.moveFrame;

  if (mf === mv.startup && !f._fired) { f._fired = true; fireSpecial(f, mv); }

  if (!f._lungeDone && mv.lunge && mv.hits.some((h) => mf >= h.from)) {
    f.vx += mv.lunge[0] * f.facing;
    f.vy += mv.lunge[1];
    f._lungeDone = true;
  }

  // tornado: re-press special in air for a little lift (max 3)
  if (mv.special === 'tornado' && !f.onGround && e.specialP && f._lifts < 3) {
    f.vy += 0.06; f._lifts++;
  }

  for (const h of mv.hits) {
    if (mf < h.from || mf > h.to) continue;
    if (foe.state === 'dead' || foe.state === 'respawn' || foe.invuln > 0) continue;
    if (f._hitSet.has(foe)) continue;
    const hx = f.x + h.dx * f.facing, hy = f.y + h.dy;
    if (rectsOverlap(hx, hy, h.w, h.h, foe.x, foe.y + HURT_H / 2, HURT_W, HURT_H)) {
      f._hitSet.add(foe);
      applyHit(game, { facing: f.facing, theme: f.theme, kbClass: mv.kbClass }, foe, h, hx, hy);
    }
  }

  if (mv.special === 'divekick' && f.onGround) { endAttack(f); return; } // landing cancels

  if (f.onGround) f.vx *= 0.85; // grounded attacks root the fighter
  physics(game, f);

  if (f.moveFrame >= mv.total) {
    if (mv.special === 'rise' || mv.special === 'divegrab') setState(f, 'helpless');
    else endAttack(f);
  }
}

// v0.2: predict whether a launch will actually KO — simulates the victim's
// hitstun trajectory with the same drag + gravity the engine applies, including
// landing on the main stage (a landed victim slides; only a slide that still
// reaches the blast line counts). Used to trigger the KO-blow freeze.
function predictKO(def, lvx, lvy, hs) {
  let x = def.x, y = def.y, vx = lvx, vy = lvy;
  for (let i = 0; i < hs; i++) {
    x += vx; y += vy;
    vx *= TUNING.HITSTUN_DRAG; vy -= GRAV;
    if (Math.abs(x) > BLAST.x || y > BLAST.top || y < BLAST.bottom) return true;
    if (vy < 0 && y <= STAGE.top && Math.abs(x) <= STAGE.x1 + 0.15) {
      const slide = Math.abs(vx) / (1 - TUNING.HITSTUN_DRAG);
      return Math.abs(x) + slide > BLAST.x;
    }
  }
  return false;
}

// att = { facing, theme, kbClass } — a real fighter or a projectile's owner info
function applyHit(game, att, def, hit, hx, hy) {
  if (def.invuln > 0 || def.state === 'dead' || def.state === 'respawn') return;
  exitShieldMesh(def);

  // --- shielded ---
  if (def.state === 'shield' && def.onGround) {
    def.shieldHP -= hit.dmg * 1.2;
    def.vx = att.facing * (0.12 + hit.dmg * 0.008);
    def.vy = 0.1;
    sfx.shieldHit();
    hitSpark(hx, hy, att.theme, 0.25);
    if (def.shieldHP <= 0) {
      def.shieldHP = 0;
      def._hitstunDur = 180;
      setState(def, 'hitstun');
      def.vy = 0.35; def.vx = 0; def.onGround = false;
      sfx.shieldBreak();
      hitSpark(def.x, def.y + 1, att.theme, 0.6);
    }
    return;
  }

  // --- clean hit ---
  def.percent += hit.dmg;
  const kb = knockback(def.percent, hit.dmg, def.weight, hit.baseKB, hit.kbGrowth);

  // light DI: rotate the launch angle a touch toward the defender's held dir
  let ang = hit.angle;
  const held = (def._prevH.right ? 1 : 0) - (def._prevH.left ? 1 : 0);
  if (held !== 0) ang += (held === att.facing ? 1 : -1) * 8;

  const [lvx, lvy] = launchVelocity(kb, ang, att.facing);
  def.vx = lvx; def.vy = lvy;
  def.jumpsUsed = 0; // getting hit refreshes the double jump
  def._hitstunDur = hitstunFrames(kb);
  def._fastFalling = false;
  setState(def, 'hitstun');
  def.onGround = false;

  // v0.2 KO-blow cinematic: if this hit will take the victim's last stock,
  // freeze BOTH fighters ~26 ticks, punch the camera in on the victim with a
  // shake pulse, then release into the launch.
  const koBlow = def.stocks <= 1 && predictKO(def, lvx, lvy, def._hitstunDur);
  const hp = koBlow ? 26 : Math.max(2, Math.round(3 + hit.dmg * 0.25));
  def.hitPause = hp;
  // attacker freeze: find the real fighter behind att when it's a fighter hit
  const atkF = game.fighters.find((x) => x.theme === att.theme && x.state === 'attack');
  if (atkF) atkF.hitPause = hp;
  if (koBlow) {
    game._koFx = { t: 0, dur: 46, x: def.x, y: def.y };
  }

  // v0.2 impact shake: subtle, only on strong/kill hits and KO blows —
  // amplitude scales with knockback, decays over 8-15 ticks. Weak pokes: none.
  if (koBlow) {
    game._shakeT = game._shakeDur = 15;
    game._shakeAmp = 0.30;
  } else if (att.kbClass === 'strong' || att.kbClass === 'kill') {
    game._shakeT = game._shakeDur = Math.min(15, 8 + Math.floor(kb / 50));
    game._shakeAmp = Math.min(0.30, 0.06 + kb * 0.0009);
  }

  const power = Math.min(1, hit.dmg / 22);
  hitSpark(hx, hy, att.theme, power);
  sfx.hit(power);
}

// ---------------------------------------------------------------- shield

function enterShield(f) {
  setState(f, 'shield');
  f.vx *= 0.5;
  if (!f._shieldMesh) {
    try { f._shieldMesh = shieldBubbleAttach(f); } catch (err) { f._shieldMesh = null; }
  }
}

function exitShieldMesh(f) {
  if (f._shieldMesh) {
    try { f.root.remove(f._shieldMesh); } catch (err) {}
    f._shieldMesh = null;
  }
}

function stepShield(game, f, e) {
  if (!e.shield || !f.onGround) {
    exitShieldMesh(f);
    setState(f, 'idle');
    return;
  }
  f.shieldHP -= 0.12;
  f.vx *= 0.8;
  if (f.shieldHP <= 0) { // shield broke under its own drain
    exitShieldMesh(f);
    f.shieldHP = 0;
    f._hitstunDur = 180;
    setState(f, 'hitstun');
    f.vy = 0.35; f.vx = 0; f.onGround = false;
    sfx.shieldBreak();
    hitSpark(f.x, f.y + 1, f.theme, 0.6);
  }
}

// ---------------------------------------------------------------- projectiles

function stepProjectiles(game) {
  const projs = updateProjectiles(TICK);
  if (!projs) return;
  const [f1, f2] = game.fighters;

  for (const p of projs) {
    if (p.dead) continue;
    if (p.x < -BLAST.x - 1 || p.x > BLAST.x + 1 || p.y < BLAST.bottom - 1 || p.y > BLAST.top + 1) {
      p.dead = true; continue;
    }
    for (const f of [f1, f2]) {
      if (f === p.owner || f.state === 'dead' || f.state === 'respawn' || f.invuln > 0) continue;
      if (rectsOverlap(p.x, p.y, p.w, p.h, f.x, f.y + HURT_H / 2, HURT_W, HURT_H)) {
        p.dead = true;
        applyHit(game,
          { facing: p.dir || (p.owner ? p.owner.facing : 1), theme: p.theme || (p.owner ? p.owner.theme : null), kbClass: p.kbClass || 'weak' },
          f, { dmg: p.dmg, angle: p.angle, baseKB: p.baseKB, kbGrowth: p.kbGrowth }, p.x, p.y);
        break;
      }
    }
  }

  // projectile vs projectile — both pop
  for (let i = 0; i < projs.length; i++) {
    for (let j = i + 1; j < projs.length; j++) {
      const a = projs[i], b = projs[j];
      if (a.dead || b.dead || a.owner === b.owner) continue;
      if (rectsOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h)) {
        a.dead = b.dead = true;
        hitSpark((a.x + b.x) / 2, (a.y + b.y) / 2, a.theme || b.theme, 0.4);
      }
    }
  }
}

// ---------------------------------------------------------------- KO / respawn

function checkBlast(game, f) {
  if (f.state === 'dead' || f.state === 'respawn') return;
  if (f.x < -BLAST.x || f.x > BLAST.x || f.y > BLAST.top || f.y < BLAST.bottom) {
    const bx = Math.max(-BLAST.x, Math.min(BLAST.x, f.x));
    const by = Math.max(BLAST.bottom, Math.min(BLAST.top, f.y));
    koBlast(bx, by, f.theme);
    sfx.ko();
    exitShieldMesh(f);
    f.stocks--;
    if (f.stocks > 0) {
      f.x = 0; f.y = 6; f.vx = 0; f.vy = 0;
      f.percent = 0; f.invuln = 120; f.onGround = false;
      f.shieldHP = SHIELD_MAX; f.hitPause = 0;
      f.moveId = null;
      setState(f, 'respawn');
    } else {
      setState(f, 'dead');
      const [a, b] = game.fighters;
      const other = f === a ? b : a;
      if (other.stocks > 0) game.finish({ winner: other, reason: 'stocks' });
    }
  }
}
