// js/portrait.js — v0.17: Smash-style character portraits for the select screen.
// Renders each fighter (built-in procedural or custom VRM) offscreen in a
// heroic pose and returns a dataURL. Customs cache their portrait in IndexedDB
// so it's rendered once at import time, not every select screen open.

import * as THREE from 'three';
// v0.28: these imports MUST carry the same ?v= cache-bust as every other
// module. Without it the browser loads a second, disconnected copy of
// roster/moves — its registry is empty, isCustom() returns false for every
// import, and custom portraits silently render the bare procedural rig in
// the grey placeholder theme instead of the imported VRM.
import { FIGHTER_DEFS } from './moves.js?v=47';
import { createFighter } from './fighters.js?v=47';
import { tickFighterVisual } from './anim.js?v=47';
import { isCustom, getCharacterData, getCustomEntry, setCustomPortrait, PORTRAIT_CACHE_V } from './roster.js?v=47';
import { attachVRMToFighter } from './vrm.js?v=47';

const SIZE = 220;
let renderer = null;
let scene = null;
let cam = null;

function ensureRenderer() {
  if (renderer) return true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) {
    return false;
  }
  renderer.setSize(SIZE, SIZE, false);
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(2, 3, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, 0.8);
  rim.position.set(-3, 2, -2);
  scene.add(rim);
  // v0.17: low hero angle — camera slightly below, looking up at the fighter.
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.set(0.6, 0.75, 3.2);
  cam.lookAt(0, 1.05, 0);
  return true;
}

// Pose the fighter in a dynamic "select stance" — a mid-jab for punchers.
function poseForPortrait(f) {
  f.state = 'attack';
  f.moveId = 'jab';
  // Frame ~40% through the jab: arm extended, torso twisted — reads as action.
  const total = f.moves.jab ? f.moves.jab.total : 22;
  f.moveFrame = Math.floor(total * 0.4);
  f._animT = 0;
  f.facing = 1;
  tickFighterVisual(f, 0.016);
  f.root.updateMatrixWorld(true);
}

// Memoize in-flight + finished portraits per def. Without this, defCard and
// preRenderPortraits race: two fighters attach the SAME shared vrm.scene,
// the second attach steals it from the first fighter's root, and whichever
// render resolves last (possibly the empty one) wins the card + the cache.
const portraitMemo = new Map();

export function getPortrait(defId) {
  if (portraitMemo.has(defId)) return portraitMemo.get(defId);
  const p = renderPortrait(defId).catch(() => null);
  portraitMemo.set(defId, p);
  return p;
}

// v0.43: drop the session-cached portrait so the next getPortrait
// re-renders (used when a custom's style or facing correction changes —
// roster.setCustomStyle clears the IndexedDB cache on its side).
export function invalidatePortrait(defId) {
  portraitMemo.delete(defId);
}

async function renderPortrait(defId) {
  // Customs: use cached portrait if we have one from the current cache
  // version (older caches may hold the pre-fix placeholder render).
  if (isCustom(defId)) {
    const entry = getCustomEntry(defId);
    if (entry && entry.portrait && entry.portraitV >= PORTRAIT_CACHE_V) return entry.portrait;
  }
  if (!ensureRenderer()) return null;

  const f = createFighter(defId);
  // Customs: attach their VRM before rendering.
  if (isCustom(defId)) {
    try {
      const data = await getCharacterData(defId);
      const entry = getCustomEntry(defId);
      attachVRMToFighter(f, { ...data, flip: !!entry?.flip, faceYaw: entry?.faceYaw || 0 });
    } catch (e) {
      return null; // VRM failed — caller shows the swatch fallback
    }
  }
  poseForPortrait(f);
  scene.add(f.root);
  if (isCustom(defId)) {
    // v0.28: frame the actual model. Built-ins share one fixed camera, but
    // imported models vary in proportions — fit the posed bounding box so
    // the whole fighter is in frame, keeping the same low hero angle.
    const box = new THREE.Box3().setFromObject(f.root);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const dist = Math.max(size.y / 2 / halfFovTan, size.x / 2 / halfFovTan) * 1.12 + size.z / 2;
    const dir = new THREE.Vector3(0.6, -0.3, 3.2).normalize();
    cam.position.copy(center).addScaledVector(dir, dist);
    cam.lookAt(center.x, center.y, center.z);
  } else {
    cam.position.set(0.6, 0.75, 3.2);
    cam.lookAt(0, 1.05, 0);
  }
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  scene.remove(f.root);

  // Cache custom portraits in IndexedDB so we only render once.
  if (isCustom(defId) && url) {
    setCustomPortrait(defId, url).catch(() => {});
  }
  return url;
}

// Fire-and-forget pre-render for the whole roster (called when select opens).
export function preRenderPortraits() {
  if (!ensureRenderer()) return;
  for (const defId of Object.keys(FIGHTER_DEFS)) {
    getPortrait(defId).catch(() => {});
  }
}
