// js/roster.js — custom roster slots for imported characters (v0.7 phase 2).
// Joshua's directive: "we need like a new slot for the vrm characters as we
// add them instead of attaching em to p1 ronin guy."
//
// An import (.vrm/.glb/.gltf) registers a CUSTOM fighter def:
//   id `custom_<sanitized-filename>`, display name from the filename
//   (Mushy.vrm -> "MUSHY"), bodyType auto-detected, moveset = kit
//   (default RONIN, swappable in the Lab).
// The file blob + metadata persist in IndexedDB so the collection survives
// reloads; the registry + select-screen cards rebuild on boot. Re-importing
// the same filename updates the existing slot instead of duplicating.

import { FIGHTER_DEFS } from './moves.js?v=50';
import { loadVRMFile } from './vrm.js?v=50';

const DB_NAME = 'smashvr';
const STORE = 'customFighters';

let db = null;
const registry = new Map(); // defId -> { id, name, filename, sourceType, bodyType, kit, blob, data }

function sanitize(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const s = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32);
  return s || 'custom';
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function idbAll() {
  return new Promise((resolve, reject) => {
    const req = tx('readonly').getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(rec) {
  // strip non-serializables (loaded three.js data, live def ref)
  const { data, def, ...storable } = rec;
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').put(storable);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDel(id) {
  return new Promise((resolve, reject) => {
    const req = tx('readwrite').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Register (or re-register) the fighter def from a record. The def inherits
// physics/weight/etc. from its kit; customs never get altTheme (mirror-match
// alt rules don't apply — and VRM models are never tinted anyway).
function registerDef(rec) {
  const kitDef = FIGHTER_DEFS[rec.kit] || FIGHTER_DEFS.ronin;
  const def = {
    ...kitDef,
    id: rec.id,
    name: rec.name,
    cls: kitDef.cls,
    bodyType: rec.bodyType,
    kit: rec.kit,
    custom: true,
    theme: { primary: '#9aa3b2', secondary: '#4a5160' },
    // v0.19: archetype + fighting style ride on the def for the Lab/engine.
    archetype: rec.archetype || null,
    style: rec.style || null,
    styleOverride: rec.styleOverride || 'auto',
  };
  delete def.altTheme;
  FIGHTER_DEFS[rec.id] = def;
  const entry = registry.get(rec.id) || {};
  registry.set(rec.id, { ...entry, ...rec, def });
  return def;
}

export async function initRoster() {
  db = await openDB();
  const all = await idbAll();
  for (const rec of all) {
    // v0.47: the "valkyrie" style was wiped (Joshua's order). Any record
    // saved with it — auto-assigned or picked as a Lab override — falls
    // back to the plain RONIN kit / no style. Other styles untouched.
    if ((rec.style && rec.style.style === 'valkyrie') || rec.styleOverride === 'valkyrie') {
      rec.style = null;
      rec.kit = 'ronin';
      if (rec.styleOverride === 'valkyrie') rec.styleOverride = 'auto';
      idbPut(rec).catch(() => {});
    }
    registerDef(rec);
  }
  return all.length;
}

export function isCustom(defId) {
  return registry.has(defId);
}

export function listCustoms() {
  return [...registry.values()].map((e) => ({
    id: e.id, name: e.name, filename: e.filename,
    sourceType: e.sourceType, bodyType: e.bodyType, kit: e.kit, pose: e.pose || null,
    faceDeg: e.faceDeg || 0,
  }));
}

export function getCustomEntry(defId) {
  return registry.get(defId) || null;
}

// v0.43: run the facing detector over freshly loaded model data.
// Returns { faceYaw, faceDeg }: faceYaw is the attach-time correction in
// radians (VRM path — the deviation is subtracted again at attach); for
// auto-rigged GLBs the rigger already baked the correction into the
// scene, so faceYaw is 0 and faceDeg only reports what was found.
async function detectRecordFacing(data) {
  if (!data) return { faceYaw: 0, faceDeg: 0 };
  if (data.autorig) {
    const f = data.autorig.facing || {};
    return { faceYaw: 0, faceDeg: f.yawDeg || 0 };
  }
  if (data.vrm) {
    try {
      const { detectFacingVRM } = await import('./facing.js?v=50');
      const det = detectFacingVRM(data.vrm);
      return { faceYaw: det.yaw || 0, faceDeg: det.deg || 0 };
    } catch (e) { /* detection best-effort */ }
  }
  return { faceYaw: 0, faceDeg: 0 };
}

// Import a file -> register/update the custom slot. Returns { id, name,
// updated, bodyType }. Throws on load failure (caller toasts).
export async function importCharacter(file) {
  const data = await loadVRMFile(file);
  const id = 'custom_' + sanitize(file.name);
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const existing = registry.get(id);
  // v0.19: analyze the character and auto-assign a fighting style.
  // Auto-rigged GLBs (data.autorig) skip VRM analysis — they get the default.
  let archetype = null, style = null;
  if (!data.autorig && data.vrm) {
    try {
      const { analyzeVRM, assignStyle } = await import('./archetype.js?v=50');
      archetype = analyzeVRM(data.vrm);
      style = assignStyle(archetype);
    } catch (e) { /* analysis failed — default style */ }
  }
  // v0.43: measure which way the model actually faces (toes/eyes/head) so
  // backwards-authored imports get corrected at attach, not by hand.
  const facingNow = await detectRecordFacing(data);
  const rec = {
    id,
    name: existing ? existing.name : sanitize(file.name).toUpperCase(),
    filename: file.name,
    sourceType: ext === 'vrm' ? 'vrm' : 'glb',
    faceYaw: facingNow.faceYaw,
    faceDeg: facingNow.faceDeg,
    bodyType: existing ? existing.bodyType
      : ((data.autorig && data.autorig.bodyType) || 'biped'),
    // v0.8: detected import pose (T/A/unknown) for the Lab badge.
    pose: (data.autorig && data.autorig.pose) || null,
    kit: existing ? existing.kit : (style ? style.kit : 'ronin'),
    // v0.19: archetype + auto-assigned style.
    archetype: archetype || existing?.archetype || null,
    style: style || existing?.style || null,
    styleOverride: existing?.styleOverride || 'auto',
    blob: file,
    addedAt: existing ? existing.addedAt : Date.now(),
    // v0.12.2: model faces backward in VRM space — flip its Y rotation.
    flip: existing ? !!existing.flip : false,
  };
  await idbPut(rec);
  registerDef(rec);
  registry.get(id).data = data; // cache the just-loaded model
  return { id, name: rec.name, updated: !!existing, bodyType: rec.bodyType, pose: rec.pose, sourceType: rec.sourceType,
           archetype: rec.archetype, style: rec.style, faceDeg: rec.faceDeg };
}

// Loaded model data for a custom def, loading from the stored blob on demand.
export async function getCharacterData(defId) {
  const entry = registry.get(defId);
  if (!entry) throw new Error('unknown custom fighter "' + defId + '"');
  if (entry.data) return entry.data;
  const file = new File([entry.blob], entry.filename);
  entry.data = await loadVRMFile(file);
  // v0.43: records imported before facing detection have no faceYaw —
  // measure once, persist, and drop the (possibly backwards) cached
  // portrait so it re-renders corrected. This is what upgrades existing
  // collections (e.g. Cactus Boy) without a re-import.
  if (entry.faceYaw == null) {
    const f = await detectRecordFacing(entry.data);
    entry.faceYaw = f.faceYaw;
    entry.faceDeg = f.faceDeg;
    entry.portrait = null;
    entry.portraitV = 0;
    idbPut(entry).catch(() => {});
  }
  return entry.data;
}

export async function renameCustom(defId, name) {
  const entry = registry.get(defId);
  if (!entry) return;
  const clean = String(name || '').trim().slice(0, 24) || entry.name;
  entry.name = clean.toUpperCase();
  entry.def.name = entry.name;
  await idbPut(entry);
}

export async function setCustomKit(defId, kit) {
  const entry = registry.get(defId);
  if (!entry || !FIGHTER_DEFS[kit] || FIGHTER_DEFS[kit].custom) return;
  entry.kit = kit;
  registerDef(entry);
  await idbPut(entry);
}

// v0.12.2: flip a backward-facing model (toggles its Y rotation).
export async function setCustomFlip(defId, flip) {
  const entry = registry.get(defId);
  if (!entry) return;
  entry.flip = !!flip;
  await idbPut(entry);
}

// v0.17: cached select-screen portrait (dataURL) for a custom import.
// v0.28: portraits carry a cache version — v1 caches (if any) may hold the
// placeholder-rig render produced while portrait.js was module-split, so
// only portraitV >= PORTRAIT_CACHE_V is trusted.
// v0.43: v3 — v2 portraits of VRM0 imports were rendered facing backwards
// (the baseYaw bug), so all older caches are distrusted and re-rendered.
// v0.47: v4 — portraits re-framed front three-quarter (v3 and older are
// side-profile renders), so all older caches re-render again.
export const PORTRAIT_CACHE_V = 6;
export async function setCustomPortrait(defId, dataUrl) {
  const entry = registry.get(defId);
  if (!entry) return;
  entry.portrait = dataUrl;
  entry.portraitV = PORTRAIT_CACHE_V;
  await idbPut(entry);
}

// v0.19: override the auto-assigned fighting style ('auto' = use detection).
export async function setCustomStyle(defId, styleName) {
  const entry = registry.get(defId);
  if (!entry) return;
  entry.styleOverride = styleName;
  // Apply the style's kit immediately.
  const styles = {
    brawler: { kit: 'ronin', style: 'brawler', headbutts: false, squashMul: 1.0, label: 'Brawler' },
    silly: { kit: 'wisp', style: 'silly', headbutts: true, squashMul: 1.6, label: 'Silly' },
    bruiser: { kit: 'ronin', style: 'brawler', headbutts: true, squashMul: 1.2, label: 'Big-head bruiser' },
  };
  if (styleName !== 'auto' && styles[styleName]) {
    entry.style = styles[styleName];
    entry.kit = styles[styleName].kit;
    registerDef(entry);
  } else if (entry.archetype) {
    // Revert to auto-detected.
    const { assignStyle } = await import('./archetype.js?v=50');
    entry.style = assignStyle(entry.archetype);
    entry.kit = entry.style.kit;
    registerDef(entry);
  } else {
    // v0.43: 'auto' on an import with no archetype analysis (auto-rigged
    // GLBs) reverts to the plain default instead of leaving the previous
    // override's style/kit stuck on.
    entry.style = null;
    entry.kit = 'ronin';
    registerDef(entry);
  }
  // v0.43: the portrait poses the fighter's (style-dependent) jab —
  // headbutt styles visibly change it — so a style change must retire the
  // cached portrait. portrait.js's session memo is cleared by the Lab via
  // invalidatePortrait(); the IDB cache is cleared here.
  entry.portrait = null;
  entry.portraitV = 0;
  await idbPut(entry);
}

export async function deleteCustom(defId) {
  registry.delete(defId);
  delete FIGHTER_DEFS[defId];
  // drop Lab-saved state for this def
  for (const k of ['smashvr_kit_', 'smashvr_theme_', 'smashvr_bodytype_']) {
    try { localStorage.removeItem(k + defId); } catch (e) {}
  }
  await idbDel(defId);
}
