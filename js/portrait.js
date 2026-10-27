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
import { FIGHTER_DEFS } from './moves.js?v=49';
import { createFighter } from './fighters.js?v=49';
import { tickFighterVisual } from './anim.js?v=49';
import { isCustom, getCharacterData, getCustomEntry, setCustomPortrait, PORTRAIT_CACHE_V } from './roster.js?v=49';
import { attachVRMToFighter } from './vrm.js?v=49';

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
  // v0.47: FRONT three-quarter framing (Joshua: "make sure the thumbnails
  // aren't profile too"). Fighters face +X, so the old camera on +Z saw a
  // pure side profile. The camera now sits off the FACING axis — ~35° from
  // front toward the model's left — squared-up like a mugshot, not a
  // silhouette. FRONT_DIR is shared by the stock + custom framing below.
  cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  cam.position.copy(STOCK_DIR).multiplyScalar(3.3).add(new THREE.Vector3(0, 1.0, 0));
  cam.lookAt(0, 1.0, 0);
  return true;
}

// v0.47: the shared front three-quarter view direction (fighter space:
// +X = facing, +Z = toward the game camera's side). y<0 = low hero angle.
const FRONT_DIR = new THREE.Vector3(2.4, -0.35, 1.7).normalize();
// Stock rigs are flat dolls whose decorated front (chest plate, visor)
// faces +Z — their front three-quarter stays in the +Z hemisphere,
// angled ~28° toward the facing axis. Customs (real 3D bodies) face +X,
// so their front three-quarter is the FRONT_DIR above.
const STOCK_DIR = new THREE.Vector3(1.55, -0.35, 2.85).normalize();

// Pose the fighter for its card. Stock fighters keep their dynamic
// mid-jab "select stance". Customs (v0.49, Joshua: "make sure it's like
// that for the thumbnails too") stand in Ronin's idle guard stance —
// the same pose template the forced-Ronin-rest path puts on them
// in-match, not a bind pose or a model-authored pose.
function poseForPortrait(f, custom) {
  if (custom) {
    f.state = 'idle';
    f.moveId = null;
    f.stateFrame = 0;
    f._animT = 1.0;
    f.facing = 1;
    // The locomotion path crossfades from the creation pose (blend rate
    // dt*7) — a single render tick would leave the card at ~zero pose.
    // Run the blend out (and let spring bones settle) before framing.
    for (let i = 0; i < 6; i++) tickFighterVisual(f, 0.05);
    f.root.updateMatrixWorld(true);
    return;
  }
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
  poseForPortrait(f, isCustom(defId));
  scene.add(f.root);
  if (isCustom(defId)) {
    // v0.28: frame the actual model. Built-ins share one fixed camera, but
    // imported models vary in proportions — fit the posed bounding box so
    // the whole fighter is in frame, from the same front three-quarter
    // direction (v0.47). The view is ~35° off the facing axis, so the
    // on-screen width mixes the model's x/z extents; fit against that
    // projected width and pad by the projected depth.
    // precise=true: bound the actual posed skin, not the bind-pose box —
    // a posed skinned mesh's default box overestimates badly (v0.47).
    const box = new THREE.Box3().setFromObject(f.root, true);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    // Exact fit: project the 8 bbox corners into the view frame and take
    // the smallest distance that keeps every corner inside the frustum
    // (a long accessory — e.g. a backpack arm — must not shrink the
    // fighter by inflating a padded box fit, v0.47).
    const halfFovTan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const right = new THREE.Vector3(FRONT_DIR.z, 0, -FRONT_DIR.x).normalize();
    const up = new THREE.Vector3().crossVectors(right, FRONT_DIR).negate();
    let dist = 0;
    for (const cx of [box.min.x, box.max.x]) for (const cy of [box.min.y, box.max.y]) for (const cz of [box.min.z, box.max.z]) {
      const off = new THREE.Vector3(cx - center.x, cy - center.y, cz - center.z);
      const d = off.dot(FRONT_DIR); // toward the camera
      dist = Math.max(dist,
        Math.abs(off.dot(right)) / halfFovTan + d,
        Math.abs(off.dot(up)) / halfFovTan + d);
    }
    dist *= 1.06;
    cam.position.copy(center).addScaledVector(FRONT_DIR, dist);
    cam.lookAt(center.x, center.y, center.z);
  } else {
    cam.position.copy(STOCK_DIR).multiplyScalar(3.3).add(new THREE.Vector3(0, 1.0, 0));
    cam.lookAt(0, 1.0, 0);
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
