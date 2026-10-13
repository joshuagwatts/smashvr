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

export function hitSpark(x, y, theme, power01) {
  if (!_scene) return;
  const p = Math.max(0.15, Math.min(1, power01 == null ? 0.5 : power01));
  // theme-colored burst
  const burst = makeSprite(theme.primary, 0.5 + 1.4 * p);
  burst.position.set(x, y, 0.1);
  addEffect(burst, 0.28, (u, o) => {
    const s = (0.5 + 1.4 * p) * (1 + u * 2.2);
    o.scale.set(s, s, 1);
    o.material.opacity = 1 - u;
  });
  // white-hot core flash
  const core = makeSprite('#ffffff', 0.3 + 0.7 * p);
  core.position.set(x, y, 0.12);
  addEffect(core, 0.16, (u, o) => {
    const s = (0.3 + 0.7 * p) * (1 + u * 1.2);
    o.scale.set(s, s, 1);
    o.material.opacity = 1 - u;
  });
}

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
}
