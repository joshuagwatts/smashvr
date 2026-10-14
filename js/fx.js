// js/fx.js — hit sparks, KO blasts, projectiles, shield bubbles.
// Additive-blended sprites from a canvas-generated radial texture; all colors
// come from f.theme. Timed effects are advanced by updateEffects(), which is
// called internally by updateProjectiles() (so engine only needs to call
// updateProjectiles) and also exported as updateFX() for explicit use.

import * as THREE from 'three';

let _scene = null;
let _radialTex = null;
const _projectiles = [];
const _effects = [];

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function initFX(scene) {
  _scene = scene;
  if (!_radialTex) _radialTex = radialTexture();
}

function makeSprite(color, scale) {
  const mat = new THREE.SpriteMaterial({
    map: _radialTex,
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(scale, scale, 1);
  return s;
}

// Generic timed effect: tick(u01, obj) runs each frame; done at u>=1.
function addEffect(obj, life, tick) {
  if (!_scene) return;
  _scene.add(obj);
  _effects.push({ obj, age: 0, life, tick });
}

function disposeObj(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

export function hitSpark(x, y, theme, power01, opts) {
  if (!_scene) return;
  const p = Math.max(0.15, Math.min(1, power01 == null ? 0.5 : power01));
  const o = opts || {};
  // v0.4: bigger, brighter theme-colored burst
  const burst = makeSprite(theme.primary, 0.6 + 1.8 * p);
  burst.position.set(x, y, 0.1);
  addEffect(burst, 0.28, (u, ob) => {
    const s = (0.6 + 1.8 * p) * (1 + u * 2.2);
    ob.scale.set(s, s, 1);
    ob.material.opacity = 1 - u;
  });
  // white-hot core flash
  const core = makeSprite('#ffffff', 0.35 + 0.85 * p);
  core.position.set(x, y, 0.12);
  addEffect(core, 0.16, (u, ob) => {
    const s = (0.35 + 0.85 * p) * (1 + u * 1.2);
    ob.scale.set(s, s, 1);
    ob.material.opacity = 1 - u;
  });
  // v0.4: directional debris — chunk count scales with damage, sprayed along
  // the launch direction (away from the attacker); radial if no direction.
  const dmg = o.dmg || 0;
  const n = 4 + Math.min(10, Math.round(dmg * 0.5));
  const hasDir = Math.hypot(o.dx || 0, o.dy || 0) > 0.01;
  const baseA = hasDir ? Math.atan2(o.dy, o.dx) : 0;
  for (let i = 0; i < n; i++) {
    const s = makeSprite(i % 3 === 0 ? '#ffffff' : theme.primary, 0.14 + Math.random() * 0.16);
    s.position.set(x, y, 0.11);
    const a = hasDir ? baseA + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
    const sp = 2.5 + Math.random() * 3.5 + dmg * 0.12;
    const vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
    addEffect(s, 0.3 + Math.random() * 0.15, (u, ob) => {
      ob.position.x = x + vx * u * 0.45;
      ob.position.y = y + vy * u * 0.45 - u * u * 1.2;
      ob.material.opacity = 1 - u;
    });
  }
  _lastFx.spark = { x, y, power: p, debris: n };
}

const _lastFx = {};
export function lastSpark() { return _lastFx.spark || null; }
export function fxCount() { return _effects.length; }

// v0.4: motion streaks behind the victim on strong/kill launches —
// elongated sprites oriented along the launch dir, trailing behind.
export function speedLines(x, y, dx, dy, theme, power01) {
  if (!_scene) return;
  const p = Math.max(0.2, Math.min(1, power01 == null ? 0.6 : power01));
  const ang = Math.atan2(dy, dx);
  const px = -dy, py = dx; // perpendicular
  const n = 5 + Math.round(p * 4);
  for (let i = 0; i < n; i++) {
    const s = makeSprite(theme.secondary || '#ffffff', 1);
    s.scale.set(0.9 + p * 0.9, 0.07, 1);
    s.material.rotation = ang;
    const back = 0.4 + Math.random() * 1.6;
    const side = (Math.random() - 0.5) * 1.2;
    const ox = x - dx * back + px * side, oy = y - dy * back + py * side;
    s.position.set(ox, oy, 0.08);
    s.material.opacity = 0.75;
    addEffect(s, 0.22, (u, ob) => {
      ob.position.x = ox - dx * u * 1.4;
      ob.position.y = oy - dy * u * 1.4;
      ob.material.opacity = 0.75 * (1 - u);
    });
  }
  _lastFx.speedLines = (_lastFx.speedLines || 0) + n;
}
export function lastSpeedLines() { return _lastFx.speedLines || 0; }

export function koBlast(x, y, theme) {
  if (!_scene) return;
  // expanding ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.55, 48),
    new THREE.MeshBasicMaterial({
      color: theme.primary, transparent: true, opacity: 0.95,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  ring.position.set(x, y, 0.1);
  addEffect(ring, 0.7, (u, o) => {
    const s = 1 + u * 9;
    o.scale.set(s, s, 1);
    o.material.opacity = 0.95 * (1 - u);
  });
  // big flash
  const flash = makeSprite(theme.primary, 1.2);
  flash.position.set(x, y, 0.12);
  addEffect(flash, 0.4, (u, o) => {
    const s = 1.2 * (1 + u * 4);
    o.scale.set(s, s, 1);
    o.material.opacity = 1 - u;
  });
  const white = makeSprite('#ffffff', 0.8);
  white.position.set(x, y, 0.13);
  addEffect(white, 0.25, (u, o) => {
    const s = 0.8 * (1 + u * 2.5);
    o.scale.set(s, s, 1);
    o.material.opacity = 1 - u;
  });
}

export function spawnProjectile(ownerF, move, x, y, dir) {
  if (!_scene) return null;
  const pr = move.projectile;
  const theme = ownerF.theme || { primary: '#ffffff', secondary: '#ffffff' };
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 14, 10),
    new THREE.MeshBasicMaterial({ color: theme.primary })
  );
  const glow = makeSprite(theme.primary, 0.85);
  group.add(core);
  group.add(glow);
  group.position.set(x, y, 0.1);
  _scene.add(group);
  // trail sprites
  const trail = [];
  for (let i = 0; i < 7; i++) {
    const s = makeSprite(theme.primary, 0.4);
    s.material.opacity = 0;
    _scene.add(s);
    trail.push(s);
  }
  const p = {
    mesh: group,
    x, y,
    dir,
    vx: dir * pr.speed,
    vy: 2.0,
    w: pr.w, h: pr.h,
    dmg: pr.dmg, angle: pr.angle, baseKB: pr.baseKB, kbGrowth: pr.kbGrowth,
    kbClass: move.kbClass || 'weak',
    life: pr.life / 60, // frames -> seconds
    owner: ownerF,
    theme: { primary: theme.primary, secondary: theme.secondary },
    gravity: (pr.gravity || 0) * 60, // per-frame gravity -> units/s^2
    dead: false,
    _trail: trail,
    _hist: [],
  };
  _projectiles.push(p);
  return p;
}

function killProjectile(p) {
  p.dead = true;
  if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
  disposeObj(p.mesh);
  for (const s of p._trail) {
    if (s.parent) s.parent.remove(s);
    s.material.dispose();
  }
  p._trail.length = 0;
}

export function updateProjectiles(dt) {
  for (const p of _projectiles) {
    if (p.dead) continue;
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.mesh.position.set(p.x, p.y, 0.1);
    // trail history
    p._hist.unshift([p.x, p.y]);
    if (p._hist.length > p._trail.length) p._hist.pop();
    for (let i = 0; i < p._trail.length; i++) {
      const s = p._trail[i];
      const hpos = p._hist[Math.min(i, p._hist.length - 1)];
      if (hpos) {
        s.position.set(hpos[0], hpos[1], 0.09);
        const sc = 0.42 * (1 - i / p._trail.length);
        s.scale.set(sc, sc, 1);
        s.material.opacity = 0.55 * (1 - i / p._trail.length);
      }
    }
    if (p.life <= 0) killProjectile(p);
  }
  for (let i = _projectiles.length - 1; i >= 0; i--) {
    if (_projectiles[i].dead) _projectiles.splice(i, 1);
  }
  updateEffects(dt);
  return _projectiles;
}

export function updateFX(dt) {
  updateEffects(dt);
}

function updateEffects(dt) {
  for (let i = _effects.length - 1; i >= 0; i--) {
    const e = _effects[i];
    e.age += dt;
    const u = Math.min(1, e.age / e.life);
    try { e.tick(u, e.obj); } catch (err) { /* never break the loop on a bad tick */ }
    if (u >= 1) {
      if (e.obj.parent) e.obj.parent.remove(e.obj);
      disposeObj(e.obj);
      _effects.splice(i, 1);
    }
  }
}

export function shieldBubbleAttach(f) {
  if (!_scene && !f.root) return null;
  const theme = f.theme || { secondary: '#ffffff' };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 24, 18),
    new THREE.MeshBasicMaterial({
      color: theme.secondary, transparent: true, opacity: 0.22, depthWrite: false,
    })
  );
  mesh.position.set(0, 1.0, 0);
  f.root.add(mesh);
  f._shieldMesh = mesh;
  return mesh;
}

// v0.3 charged smash: theme-colored glow sprite attached to the fighter's
// root, scaling/brightening with charge 0..1. Pass u01=null to remove it.
export function chargeGlowTick(f, u01) {
  if (!_scene || !f.root) return;
  if (u01 == null) { chargeGlowClear(f); return; }
  const u = Math.max(0, Math.min(1, u01));
  let s = f._chargeGlow;
  if (!s) {
    s = makeSprite(f.theme ? f.theme.primary : '#ffffff', 1.0);
    s.position.set(0, 1.0, 0.05);
    f.root.add(s);
    f._chargeGlow = s;
  }
  const pulse = 1 + Math.sin(performance.now() * 0.02) * 0.12;
  const sc = (0.9 + u * 2.4) * pulse;
  s.scale.set(sc, sc, 1);
  s.material.opacity = 0.22 + u * 0.55;
  try { s.material.color.set(f.theme ? f.theme.primary : '#ffffff'); } catch (e) {}
}

export function chargeGlowClear(f) {
  const s = f._chargeGlow;
  if (!s) return;
  try { if (s.parent) s.parent.remove(s); } catch (e) {}
  try { s.material.dispose(); } catch (e) {}
  f._chargeGlow = null;
}

export function updateShieldBubble(f) {
  const m = f._shieldMesh;
  if (!m) return;
  const hp = Math.max(0, Math.min(60, f.shieldHP == null ? 60 : f.shieldHP));
  const s = 0.72 + 0.5 * (hp / 60);
  m.scale.set(s, s, s);
  m.visible = f.state === 'shield';
  m.material.opacity = 0.14 + 0.14 * (hp / 60);
}

export function clearFX() {
  for (const p of _projectiles) {
    if (!p.dead) {
      if (p.mesh && p.mesh.parent) p.mesh.parent.remove(p.mesh);
      disposeObj(p.mesh);
      for (const s of p._trail) {
        if (s.parent) s.parent.remove(s);
        s.material.dispose();
      }
    }
  }
  _projectiles.length = 0;
  for (const e of _effects) {
    if (e.obj.parent) e.obj.parent.remove(e.obj);
    disposeObj(e.obj);
  }
  _effects.length = 0;
  clearDamageNumbers();
  _lastFx.spark = null;
  _lastFx.speedLines = 0;
}

// ---------------------------------------------------------------- v0.4 hit clarity

// White hit-flash on the victim: sets every emissive-capable material under
// f.root to white for `ticks` ticks, then restores originals. Works for the
// procedural rigs (MeshStandardMaterial) and VRM models alike; materials
// without emissive (basic shield bubble, sprites) are skipped.
export function setHitFlash(f, ticks) {
  if (!f.root) return;
  const mats = new Set();
  f.root.traverse((o) => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m && m.emissive) mats.add(m);
  });
  for (const m of mats) {
    if (m.userData._flashOrig === undefined) {
      m.userData._flashOrig = m.emissive.getHex();
      m.userData._flashOrigI = m.emissiveIntensity;
    }
    m.emissive.setHex(0xffffff);
    m.emissiveIntensity = 1.0;
  }
  f._flashT = ticks;
  f._flashMats = [...mats];
}

export function tickHitFlash(f) {
  if (!f._flashT) return;
  if (--f._flashT <= 0) {
    for (const m of f._flashMats || []) {
      if (m.userData._flashOrig !== undefined) {
        m.emissive.setHex(m.userData._flashOrig);
        m.emissiveIntensity = m.userData._flashOrigI;
        delete m.userData._flashOrig;
        delete m.userData._flashOrigI;
      }
    }
    f._flashMats = null;
  }
}

// Damage numbers: tiny pooled DOM chips that pop off the victim and fade.
// Kept small and fast-fading so they aid awareness without cluttering.
const _dmgNums = [];
let _dmgLayer = null;
function dmgLayer() {
  if (!_dmgLayer) _dmgLayer = document.getElementById('dmg-layer');
  return _dmgLayer;
}

export function damageNumber(x, y, dmg, big) {
  const layer = dmgLayer();
  if (!layer) return;
  const el = document.createElement('div');
  el.className = 'dmg-num' + (big ? ' big' : '');
  el.textContent = String(dmg);
  layer.appendChild(el);
  _dmgNums.push({ el, x, y, vy: 1.7, age: 0, life: big ? 45 : 30 });
}

const _pv = new THREE.Vector3();
export function updateDamageNumbers(camera) {
  const layer = dmgLayer();
  if (!layer) return;
  camera.updateMatrixWorld();
  const w = layer.clientWidth || window.innerWidth;
  const h = layer.clientHeight || window.innerHeight;
  for (let i = _dmgNums.length - 1; i >= 0; i--) {
    const d = _dmgNums[i];
    d.age++;
    d.y += d.vy / 60;
    d.vy *= 0.96;
    _pv.set(d.x, d.y, 0).project(camera);
    const sx = (_pv.x * 0.5 + 0.5) * w;
    const sy = (-_pv.y * 0.5 + 0.5) * h;
    const u = d.age / d.life;
    const pop = 1 + (d.life > 30 ? 0.5 : 0.25) * Math.max(0, 1 - u * 3);
    d.el.style.transform =
      `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
    d.el.style.opacity = u < 0.6 ? '1' : String(Math.max(0, 1 - (u - 0.6) / 0.4));
    if (d.age >= d.life) {
      d.el.remove();
      _dmgNums.splice(i, 1);
    }
  }
}

export function clearDamageNumbers() {
  for (const d of _dmgNums) d.el.remove();
  _dmgNums.length = 0;
}

export function dmgNumCount() { return _dmgNums.length; }

// KO vignette: brief white edge-flash on the killing blow. The div lives in
// index.html; opacity writes are change-guarded so we don't touch the DOM
// every tick.
export function setVignette(u01) {
  const el = document.getElementById('ko-vignette');
  if (!el) return;
  const u = Math.max(0, Math.min(1, u01));
  if (el._lastU !== u) {
    el.style.opacity = String((u * 0.85).toFixed(3));
    el._lastU = u;
  }
}
