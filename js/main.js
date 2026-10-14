// js/main.js — SMASHVR boot: renderer/scene, screen flow (title -> select ->
// fight -> pause/results), HUD rendering, VRM import, Fighter Lab overlay.

import * as THREE from 'three';
import { createGame } from './engine.js';
import { Input } from './input.js';
import { sfx } from './audio.js';
import { createFighter } from './fighters.js';
import { FIGHTER_DEFS } from './moves.js';
import { attachVRMToFighter, removeVRMFromFighter } from './vrm.js';
import { initRoster, isCustom, listCustoms, importCharacter, getCharacterData } from './roster.js';
import { openLab } from './lab.js';
import { lastSpark, lastSpeedLines, dmgNumCount, fxCount } from './fx.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEMO = params.has('demo');

// ------------------------------------------------------------ renderer/scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0e1a);
scene.fog = new THREE.Fog(0x0b0e1a, 30, 90);

scene.add(new THREE.HemisphereLight(0x8b9bff, 0x1a1030, 0.9));
const dir = new THREE.DirectionalLight(0xffffff, 1.2);
dir.position.set(6, 12, 8);
scene.add(dir);
const rim = new THREE.DirectionalLight(0x00e5ff, 0.5);
rim.position.set(-8, 4, -6);
scene.add(rim);

// starfield backdrop
{
  const n = 400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 120;
    pos[i * 3 + 1] = Math.random() * 40 - 5;
    pos[i * 3 + 2] = -20 - Math.random() * 40;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8b93b8, size: 0.15 })));
}

// slow-orbit menu camera for the title/select screens
const menuCam = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
menuCam.position.set(0, 4, 18);
menuCam.lookAt(0, 2, 0);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  menuCam.aspect = window.innerWidth / window.innerHeight;
  menuCam.updateProjectionMatrix();
  if (game) {
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
  }
});

// ------------------------------------------------------------ input + audio

Input.init();
const firstGesture = () => sfx.ensure();
window.addEventListener('pointerdown', firstGesture, { once: true });
window.addEventListener('keydown', firstGesture, { once: true });

// ------------------------------------------------------------ toast

let toastTimer = 0;
function toast(msg, isError = false) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ------------------------------------------------------------ screens

const SCREENS = ['screen-title', 'screen-select', 'screen-pause', 'screen-results'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (!id) for (const s of SCREENS) $(s).classList.add('hidden');
}
function showHud(v) {
  $('hud').classList.toggle('hidden', !v);
  if (!v) $('hud-countdown').classList.add('hidden');
}

// ------------------------------------------------------------ fighter select
// v0.9: slot-based roster — 8 slots, each with a fighter def, a controller
// (closed/cpu/p1/p2) and a team (none/red/blue). Click a slot to select it;
// the CTRL badge cycles its controller, the team dot cycles its team;
// fighter cards assign their def to the selected slot.

let mode = 'cpu';           // 'cpu' | 'versus'
let game = null;
let lastDefs = null;
let rosterReady = null; // initRoster() promise — select waits for customs

const CTRLS = ['closed', 'cpu', 'p1', 'p2'];
const CTRL_LABEL = { closed: '—', cpu: 'CPU', p1: 'P1', p2: 'P2' };
const TEAMS = [null, 'red', 'blue'];

function defaultSlots(m) {
  const s = [
    { def: 'ronin', ctrl: 'p1', team: null },
    { def: 'volt', ctrl: m === 'cpu' ? 'cpu' : 'p2', team: null },
  ];
  for (let i = 2; i < 8; i++) s.push({ def: 'ronin', ctrl: 'closed', team: null });
  return s;
}
let slots = defaultSlots('cpu');
let selSlot = 0;

function activeSlots() {
  return slots.filter((s) => s.ctrl !== 'closed');
}

function defCard(defId) {
  // Build from the live fighter def so class + theme swatch always match.
  let f = null;
  try { f = createFighter(defId); } catch (e) { /* fighter half not landed yet */ }
  const el = document.createElement('div');
  el.className = 'fcard' + (slots[selSlot].def === defId ? ' sel' : '');
  el.dataset.def = defId;
  const def = FIGHTER_DEFS[defId];
  const cls = f ? f.cls.toUpperCase() : '?';
  // v0.6: body type on the card so floaters are visible at select time.
  // v0.7: custom slots show their name + CUSTOM tag.
  const bt = f ? (f.bodyType === 'floater' ? ' · FLOATER' : '') : '';
  const customTag = def && def.custom ? ' · CUSTOM' : '';
  const c1 = f ? '#' + new THREE.Color(f.theme.primary).getHexString() : '#555';
  const c2 = f ? '#' + new THREE.Color(f.theme.secondary).getHexString() : '#777';
  el.innerHTML = `<div class="fname">${def && def.custom ? def.name : defId.toUpperCase()}</div>
    <div class="fclass">${cls}${bt}${customTag}</div>
    <div class="swatch" style="background:linear-gradient(135deg,${c1},${c2})${def && def.custom ? ';border:1px dashed #9aa3b2' : ''}"></div>`;
  el.addEventListener('click', () => {
    sfx.uiMove();
    slots[selSlot].def = defId;
    refreshSelect();
  });
  return el;
}

function slotCard(i) {
  const s = slots[i];
  const el = document.createElement('div');
  el.className = 'slot' + (i === selSlot ? ' sel' : '') + (s.ctrl === 'closed' ? ' closed' : '');
  const teamCls = s.team ? ' team-' + s.team : '';
  const ctrlBtn = document.createElement('button');
  ctrlBtn.className = 'slot-ctrl';
  ctrlBtn.textContent = CTRL_LABEL[s.ctrl];
  ctrlBtn.title = 'Controller: click to cycle';
  ctrlBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    sfx.uiMove();
    selSlot = i; // interacting with a slot selects it
    const next = CTRLS[(CTRLS.indexOf(s.ctrl) + 1) % CTRLS.length];
    // only one human P1 / P2 across slots — setting it here clears it elsewhere
    if ((next === 'p1' || next === 'p2') && slots.some((o, j) => j !== i && o.ctrl === next)) {
      slots.forEach((o, j) => { if (j !== i && o.ctrl === next) o.ctrl = 'cpu'; });
    }
    s.ctrl = next;
    refreshSelect();
  });
  const teamBtn = document.createElement('button');
  teamBtn.className = 'slot-team' + teamCls;
  teamBtn.title = 'Team: click to cycle (none → red → blue)';
  teamBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    sfx.uiMove();
    selSlot = i; // interacting with a slot selects it
    s.team = TEAMS[(TEAMS.indexOf(s.team) + 1) % TEAMS.length];
    refreshSelect();
  });
  const nm = document.createElement('div');
  nm.className = 'slot-name';
  let dispName = s.def.toUpperCase();
  try { const d = FIGHTER_DEFS[s.def]; dispName = d && d.custom ? d.name : s.def.toUpperCase(); } catch (e) {}
  nm.textContent = `S${i + 1} · ${dispName}`;
  el.appendChild(nm);
  el.appendChild(ctrlBtn);
  el.appendChild(teamBtn);
  el.addEventListener('click', () => { sfx.uiMove(); selSlot = i; refreshSelect(); });
  return el;
}

function refreshSelect() {
  const strip = $('slot-strip');
  strip.innerHTML = '';
  slots.forEach((s, i) => strip.appendChild(slotCard(i)));
  const pool = $('fighter-cards');
  pool.innerHTML = '';
  // v0.7: built-ins first, then the CUSTOM section (imported characters).
  const builtin = [], custom = [];
  for (const d of Object.keys(FIGHTER_DEFS)) {
    (FIGHTER_DEFS[d].custom ? custom : builtin).push(d);
  }
  for (const d of builtin) pool.appendChild(defCard(d));
  if (custom.length) {
    const lab = document.createElement('div');
    lab.className = 'fcard-label';
    lab.textContent = '— CUSTOM —';
    pool.appendChild(lab);
    for (const d of custom) pool.appendChild(defCard(d));
  }
  const n = activeSlots().length;
  $('btn-start').textContent = n >= 2 ? `START FIGHT (${n})` : 'NEED 2+ FIGHTERS';
}

function openSelect(m) {
  mode = m;
  slots = defaultSlots(m);
  selSlot = 0;
  $('select-title').textContent = m === 'cpu' ? '1P vs CPU — choose fighters' : '2P Versus — battle setup';
  // v0.7: customs rebuild from IndexedDB before the cards render
  rosterReady.finally(() => {
    // a custom slot may have been deleted while we were away
    slots.forEach((s) => { if (!FIGHTER_DEFS[s.def]) s.def = 'ronin'; });
    refreshSelect();
    show('screen-select');
  });
}

// ------------------------------------------------------------ game lifecycle

function renderHud(s) {
  // v0.9: fighter chips — left = red team (or slot 0 in FFA), right = blue
  // team (or the rest). 1v1 FFA reproduces the old P1-left/P2-right look.
  const left = $('hud-left'), right = $('hud-right');
  left.innerHTML = ''; right.innerHTML = '';
  const fs = s.fighters;
  const teamMode = fs.some((f) => f.team);
  const chip = (f) => {
    const d = document.createElement('div');
    d.className = 'hchip';
    d.style.borderColor = f.color;
    const ctrlTag = f.ctrl === 'cpu' ? 'CPU' : f.ctrl.toUpperCase();
    d.innerHTML = `<div class="hud-name" style="color:${f.color}">${f.name} · ${ctrlTag}</div>
      <div class="hud-pct" style="color:${f.color}">${Math.floor(f.percent)}%</div>
      <div class="hud-stocks">${'●'.repeat(Math.max(0, f.stocks))}</div>`;
    return d;
  };
  const leftFs = teamMode ? fs.filter((f) => f.team === 'red') : fs.slice(0, 1);
  const rightFs = teamMode ? fs.filter((f) => f.team === 'blue') : fs.slice(1);
  const midFs = teamMode ? fs.filter((f) => !f.team) : [];
  if (teamMode && leftFs.length) {
    const h = document.createElement('div'); h.className = 'hud-team'; h.textContent = 'RED'; h.style.color = '#ff3b30';
    left.appendChild(h);
  }
  leftFs.forEach((f) => left.appendChild(chip(f)));
  midFs.forEach((f) => left.appendChild(chip(f)));
  if (teamMode && rightFs.length) {
    const h = document.createElement('div'); h.className = 'hud-team'; h.textContent = 'BLUE'; h.style.color = '#0a84ff';
    right.appendChild(h);
  }
  rightFs.forEach((f) => right.appendChild(chip(f)));
  const t = s.time;
  $('hud-timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const cd = $('hud-countdown');
  if (s.phase === 'countdown' && s.countdown > 0) {
    cd.textContent = s.countdown;
    cd.classList.remove('hidden');
  } else {
    cd.classList.add('hidden');
  }
}

function startFightWithSlots(slotList, m, isDemo = false) {
  destroyGame();
  show(null);
  showHud(true);
  // snapshot for rematch (defs may be deleted from the roster later)
  lastDefs = { slots: slotList.map((s) => ({ ...s })), m };
  game = createGame({
    slots: slotList.filter((s) => s.ctrl !== 'closed').map((s) => ({ ...s })),
    scene, demo: isDemo,
    onEnd: (result) => {
      showHud(false);
      $('results-winner').textContent = `${result.winner.name.toUpperCase()} WINS`;
      $('results-sub').textContent = result.reason === 'time' ? 'time up' : 'last stock standing';
      sfx.select();
      show('screen-results');
    },
    onPause: (paused) => { if (paused) show('screen-pause'); else show(null); },
    onHud: renderHud,
  });
  // v0.7: custom roster slots — each custom fighter's imported model attaches
  // to its own fighter (replaces the old pendingVRM -> P1 flow).
  attachCustoms(game);
  // v0.3 colors: mirror match (same def more than once) -> 2nd+ occurrences
  // get the def's altTheme. VRM-driven fighters keep their own look
  // (f._isVRM check); customs never have altTheme.
  {
    const seen = new Set();
    for (const f of game.fighters) {
      const def = FIGHTER_DEFS[f.defId];
      if (seen.has(f.defId) && def && def.altTheme && !def.custom && !f._isVRM &&
          f.rig && typeof f.rig.setTheme === 'function') {
        f.rig.setTheme(def.altTheme);
        f.theme = { primary: def.altTheme.primary, secondary: def.altTheme.secondary };
      }
      seen.add(f.defId);
    }
  }
  if (DEBUG) window.__sv = {
    game, sfx, fx: { lastSpark, lastSpeedLines, dmgNumCount, fxCount },
    // v0.9: debug hook — start any slot configuration directly (browser tests)
    startSlots: (list, m = 'cpu') => startFightWithSlots(list, m),
  };
}

// v0.7: attach each custom fighter's imported model to its own fighter.
// Async (model may load from IndexedDB on first use after a reload); the
// fight runs on the procedural rig until the model lands.
async function attachCustoms(g) {
  for (let i = 0; i < g.fighters.length; i++) {
    const f = g.fighters[i];
    if (!isCustom(f.defId)) continue;
    try {
      const data = await getCharacterData(f.defId);
      if (!f.root.parent) return; // fight was quit mid-load
      attachVRMToFighter(f, data);
      // imported body type drives hover locomotion — unless the Lab's manual
      // override for this def says otherwise (override wins, no re-import).
      const ov = readBodyTypeOverride(f.defId);
      if (data.autorig && data.autorig.bodyType && (!ov || ov === 'auto')) {
        f.bodyType = data.autorig.bodyType;
      }
    } catch (err) {
      toast(`Custom model failed (${f.defId}): ` + err.message, true);
    }
  }
}

function destroyGame() {
  if (!game) return;
  for (const f of game.fighters) {
    try { removeVRMFromFighter(f); } catch (e) {}
  }
  game.destroy();
  game = null;
  showHud(false);
  show(null);
}

function quitToTitle() {
  destroyGame();
  show('screen-title');
}

// ------------------------------------------------------------ wiring

$('btn-1p').addEventListener('click', () => { sfx.select(); openSelect('cpu'); });
$('btn-2p').addEventListener('click', () => { sfx.select(); openSelect('versus'); });
$('btn-back').addEventListener('click', () => { sfx.uiMove(); show('screen-title'); });
$('btn-start').addEventListener('click', () => {
  sfx.select();
  if (activeSlots().length < 2) { toast('Need at least 2 fighters — open some slots', true); return; }
  startFightWithSlots(slots, mode);
});

$('btn-resume').addEventListener('click', () => { sfx.select(); if (game) game.setPaused(false); });
$('btn-quit').addEventListener('click', () => { sfx.uiMove(); quitToTitle(); });
$('btn-rematch').addEventListener('click', () => {
  sfx.select();
  if (lastDefs) startFightWithSlots(lastDefs.slots, lastDefs.m);
});
$('btn-results-title').addEventListener('click', () => { sfx.uiMove(); quitToTitle(); });

// pause keys — engine owns pause state, we just toggle it
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Escape' || e.code === 'KeyP') && game && game.state === 'fight') {
    game.setPaused(!game.paused);
  }
});

// ---- Custom roster import (v0.7: replaces the old pendingVRM -> P1 flow) ----
function readBodyTypeOverride(defId) {
  try {
    const s = localStorage.getItem('smashvr_bodytype_' + defId);
    return s || 'auto';
  } catch (e) { return 'auto'; }
}

$('vrm-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const { id, name, updated, bodyType, pose, sourceType } = await importCharacter(file);
    // v0.8: report the detected import pose in the toast. Real .vrm files
    // are artist-rigged (no auto-rig), so they get their own honest line.
    const poseTxt = sourceType === 'vrm' ? 'VRM attached — artist-rigged model'
      : pose === 'A' ? 'A-pose detected — rigged for A-pose'
      : pose === 'T' ? 'T-pose detected — rigged for T-pose'
      : 'unusual arm pose — best-effort rig';
    toast(
      `${name} ${updated ? 'updated' : 'added to roster'} — ${poseTxt}`,
      false
    );
    // body-type badge under the import button
    const st = $('import-status');
    if (st) {
      st.textContent = `${name}: ${bodyType === 'floater' ? 'Floater — hover locomotion' : 'Biped'} (auto-detected), ${poseTxt}`;
    }
    refreshSelect();
    sfx.select();
  } catch (err) {
    toast('Import failed: ' + err.message, true);
  }
});

// ---- Fighter Lab ----
let labFighter = null;
$('btn-lab').addEventListener('click', () => {
  sfx.select();
  const overlay = $('lab-overlay');
  overlay.classList.remove('hidden');
  try {
    openLab(overlay, () => labFighter || (labFighter = createFighter(slots[0].def)));
  } catch (err) {
    toast('Lab failed to open: ' + err.message, true);
    overlay.classList.add('hidden');
  }
});
// Lab mutates via createFighter re-reads; when its DOM goes away, drop our
// cached preview fighter so the next open / fight re-reads the saved kit.
new MutationObserver(() => {
  if ($('lab-overlay').classList.contains('hidden') || $('lab-overlay').childElementCount === 0) {
    // v0.7: a custom slot may have been deleted — reset stale selections.
    // v0.9: slot defs instead of selP1/selP2.
    slots.forEach((s) => { if (!FIGHTER_DEFS[s.def]) s.def = 'ronin'; });
    if (labFighter) { labFighter = null; toast('Lab closed — P1 kit updated'); }
  }
}).observe($('lab-overlay'), { childList: true, attributes: true, attributeFilter: ['class'] });

// ------------------------------------------------------------ main loop

// v0.7: custom roster restores from IndexedDB before anything needs it
rosterReady = initRoster().catch((err) => {
  console.warn('roster init failed:', err);
  toast('Roster restore failed: ' + err.message, true);
});

show('screen-title');
const clock = new THREE.Clock();
let menuT = 0;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.1);
  if (game) {
    game.update(dt);
    renderer.render(scene, game.camera);
  } else {
    menuT += dt;
    menuCam.position.x = Math.sin(menuT * 0.15) * 4;
    menuCam.lookAt(0, 2, 0);
    renderer.render(scene, menuCam);
  }
  Input.endFrame();
}
frame();

// ?demo=1 — straight into a CPU-vs-CPU exhibition, no screens
if (DEMO) {
  startFightWithSlots(defaultSlots('cpu'), 'cpu', true);
  toast('demo mode — CPU vs CPU');
}
if (DEBUG && !window.__sv) window.__sv = {
  get game() { return game; }, sfx, fx: { lastSpark, lastSpeedLines, dmgNumCount, fxCount },
  startSlots: (list, m = 'cpu') => startFightWithSlots(list, m),
};
