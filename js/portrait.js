// js/portrait.js — v0.17: Smash-style character portraits for the select screen.
// Renders each fighter (built-in procedural or custom VRM) offscreen in a
// heroic pose and returns a dataURL. Customs cache their portrait in IndexedDB
// so it's rendered once at import time, not every select screen open.

import * as THREE from 'three';
import { FIGHTER_DEFS } from './moves.js';
import { createFighter } from './fighters.js';
import { tickFighterVisual } from './anim.js';
import { isCustom, getCharacterData, getCustomEntry, setCustomPortrait } from './roster.js';
import { attachVRMToFighter } from './vrm.js';

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

export async function getPortrait(defId) {
  // Customs: use cached portrait if we have one.
  if (isCustom(defId)) {
    const entry = getCustomEntry(defId);
    if (entry && entry.portrait) return entry.portrait;
  }
  if (!ensureRenderer()) return null;

  const f = createFighter(defId);
  // Customs: attach their VRM before rendering.
  if (isCustom(defId)) {
    try {
      const data = await getCharacterData(defId);
      const entry = getCustomEntry(defId);
      attachVRMToFighter(f, { ...data, flip: !!entry?.flip });
    } catch (e) {
      return null; // VRM failed — caller shows the swatch fallback
    }
  }
  poseForPortrait(f);
  scene.add(f.root);
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
