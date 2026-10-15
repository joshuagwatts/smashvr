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

import { FIGHTER_DEFS } from './moves.js?v=30';
import { loadVRMFile } from './vrm.js?v=30';

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
  for (const rec of all) registerDef(rec);
  return all.length;
}

export function isCustom(defId) {
  return registry.has(defId);
}

export function listCustoms() {
  return [...registry.values()].map((e) => ({
    id: e.id, name: e.name, filename: e.filename,
    sourceType: e.sourceType, bodyType: e.bodyType, kit: e.kit, pose: e.pose || null,
  }));
}

export function getCustomEntry(defId) {
  return registry.get(defId) || null;
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
      const { analyzeVRM, assignStyle } = await import('./archetype.js');
      archetype = analyzeVRM(data.vrm);
      style = assignStyle(archetype);
    } catch (e) { /* analysis failed — default style */ }
  }
  const rec = {
    id,
    name: existing ? existing.name : sanitize(file.name).toUpperCase(),
    filename: file.name,
    sourceType: ext === 'vrm' ? 'vrm' : 'glb',
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
           archetype: rec.archetype, style: rec.style };
}

// Loaded model data for a custom def, loading from the stored blob on demand.
export async function getCharacterData(defId) {
  const entry = registry.get(defId);
  if (!entry) throw new Error('unknown custom fighter "' + defId + '"');
  if (entry.data) return entry.data;
  const file = new File([entry.blob], entry.filename);
  entry.data = await loadVRMFile(file);
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
export async function setCustomPortrait(defId, dataUrl) {
  const entry = registry.get(defId);
  if (!entry) return;
  entry.portrait = dataUrl;
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
    valkyrie: { kit: 'volt', style: 'valkyrie', headbutts: false, squashMul: 1.0, label: 'Valkyrie' },
    silly: { kit: 'wisp', style: 'silly', headbutts: true, squashMul: 1.6, label: 'Silly' },
    bruiser: { kit: 'ronin', style: 'brawler', headbutts: true, squashMul: 1.2, label: 'Big-head bruiser' },
  };
  if (styleName !== 'auto' && styles[styleName]) {
    entry.style = styles[styleName];
    entry.kit = styles[styleName].kit;
    registerDef(entry);
  } else if (entry.archetype) {
    // Revert to auto-detected.
    const { assignStyle } = await import('./archetype.js');
    entry.style = assignStyle(entry.archetype);
    entry.kit = entry.style.kit;
    registerDef(entry);
  }
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
