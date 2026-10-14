// js/main.js — SMASHVR boot: renderer/scene, screen flow (title -> select ->
// fight -> pause/results), HUD rendering, VRM import, Fighter Lab overlay.

import * as THREE from 'three';
import { createGame } from './engine.js';
import { Input } from './input.js';
import { sfx } from './audio.js';
import { createFighter } from './fighters.js';
import { FIGHTER_DEFS } from './moves.js';
import { loadVRMFile, attachVRMToFighter, removeVRMFromFighter } from './vrm.js';
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

let mode = 'cpu';           // 'cpu' | 'versus'
let selP1 = 'ronin', selP2 = 'volt';
let game = null;
let lastDefs = null;
let rosterReady = null; // initRoster() promise — select waits for customs

function defCard(defId, group) {
  // Build from the live fighter def so class + theme swatch always match.
  let f = null;
  try { f = createFighter(defId); } catch (e) { /* fighter half not landed yet */ }
  const el = document.createElement('div');
  el.className = 'fcard' + (((group === 1 && defId === selP1) || (group === 2 && defId === selP2)) ? ' sel' : '');
  el.dataset.def = defId;
  el.dataset.group = group;
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
    if (group === 1) selP1 = defId; else selP2 = defId;
    refreshCards();
  });
  return el;
}

function refreshCards() {
  const g1 = $('p1-cards'), g2 = $('p2-cards');
  g1.innerHTML = ''; g2.innerHTML = '';
  // v0.7: built-ins first, then the CUSTOM section (imported characters).
  const builtin = [], custom = [];
  for (const d of Object.keys(FIGHTER_DEFS)) {
    (FIGHTER_DEFS[d].custom ? custom : builtin).push(d);
  }
  for (const d of builtin) {
    g1.appendChild(defCard(d, 1));
    g2.appendChild(defCard(d, 2));
  }
  if (custom.length) {
    for (const [g, grp] of [[g1, 1], [g2, 2]]) {
      const lab = document.createElement('div');
      lab.className = 'fcard-label';
      lab.textContent = '— CUSTOM —';
      g.appendChild(lab);
      for (const d of custom) g.appendChild(defCard(d, grp));
    }
  }
}

function openSelect(m) {
  mode = m;
  $('select-title').textContent = m === 'cpu' ? '1P vs CPU — choose fighters' : '2P Versus — choose fighters';
  $('p1-mode-tag').textContent = m === 'cpu' ? '(you)' : '(P1)';
  $('p2-label').textContent = m === 'cpu' ? 'CPU' : 'P2';
  // v0.7: customs rebuild from IndexedDB before the cards render
  rosterReady.finally(() => {
    refreshCards();
    show('screen-select');
  });
}

// ------------------------------------------------------------ game lifecycle

function renderHud(s) {
  $('hud-p1-name').textContent = s.p1.name + ' · P1';
  $('hud-p2-name').textContent = s.p2.name + (mode === 'cpu' ? ' · CPU' : ' · P2');
  $('hud-p1-pct').textContent = Math.floor(s.p1.percent) + '%';
  $('hud-p2-pct').textContent = Math.floor(s.p2.percent) + '%';
  $('hud-p1-stocks').textContent = '●'.repeat(Math.max(0, s.p1.stocks));
  $('hud-p2-stocks').textContent = '●'.repeat(Math.max(0, s.p2.stocks));
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

function startFight(p1def, p2def, m, isDemo = false) {
  destroyGame();
  show(null);
  showHud(true);
  lastDefs = { p1def, p2def, m };
  game = createGame({
    mode: m, p1def, p2def, scene, demo: isDemo,
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
  // v0.7: custom roster slots — each side's imported model attaches to its
  // own fighter (replaces the old pendingVRM -> P1 flow).
  attachCustoms(game, p1def, p2def);
  // v0.3 colors: mirror match (same def both sides) -> P2 gets the def's
  // altTheme via the same rig.setTheme path the base theme uses. VRM-driven
  // fighters keep their own look (f._isVRM check); one VRM side needs no alt.
  // Customs never have altTheme (deleted at registration).
  if (p1def === p2def) {
    const def = FIGHTER_DEFS[p1def];
    const p2 = game.fighters[1];
    if (def && def.altTheme && !def.custom && !game.fighters[0]._isVRM && !p2._isVRM &&
        p2.rig && typeof p2.rig.setTheme === 'function') {
      p2.rig.setTheme(def.altTheme);
      p2.theme = { primary: def.altTheme.primary, secondary: def.altTheme.secondary };
    }
  }
  // v0.3 colors: HUD in Smash port colors. The percent number has no
  // damage-tint semantics (renderHud + css never recolor it), so this is safe.
  const P1_PORT = '#ff3b30', P2_PORT = '#0a84ff';
  $('hud-p1-name').style.color = P1_PORT;
  $('hud-p2-name').style.color = P2_PORT;
  $('hud-p1-pct').style.color = P1_PORT;
  $('hud-p2-pct').style.color = P2_PORT;
  if (DEBUG) window.__sv = { game, sfx, fx: { lastSpark, lastSpeedLines, dmgNumCount, fxCount } };
}

// v0.7: attach each custom side's imported model to its own fighter.
// Async (model may load from IndexedDB on first use after a reload); the
// fight runs on the procedural rig until the model lands.
async function attachCustoms(g, p1def, p2def) {
  const defs = [p1def, p2def];
  for (let i = 0; i < 2; i++) {
    if (!isCustom(defs[i])) continue;
    try {
      const data = await getCharacterData(defs[i]);
      if (!g.fighters[i].root.parent) return; // fight was quit mid-load
      attachVRMToFighter(g.fighters[i], data);
      // imported body type drives hover locomotion — unless the Lab's manual
      // override for this def says otherwise (override wins, no re-import).
      const ov = readBodyTypeOverride(defs[i]);
      if (data.autorig && data.autorig.bodyType && (!ov || ov === 'auto')) {
        g.fighters[i].bodyType = data.autorig.bodyType;
      }
    } catch (err) {
      toast(`Custom model failed (${defs[i]}): ` + err.message, true);
    }
  }
}

function destroyGame() {
  if (!game) return;
  try { removeVRMFromFighter(game.fighters[0]); } catch (e) {}
  try { removeVRMFromFighter(game.fighters[1]); } catch (e) {}
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
$('btn-start').addEventListener('click', () => { sfx.select(); startFight(selP1, selP2, mode); });

$('btn-resume').addEventListener('click', () => { sfx.select(); if (game) game.setPaused(false); });
$('btn-quit').addEventListener('click', () => { sfx.uiMove(); quitToTitle(); });
$('btn-rematch').addEventListener('click', () => {
  sfx.select();
  if (lastDefs) startFight(lastDefs.p1def, lastDefs.p2def, lastDefs.m);
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
    const { id, name, updated, bodyType } = await importCharacter(file);
    toast(
      `${name} ${updated ? 'updated' : 'added to roster'} — pick them on the select screen`,
      false
    );
    // body-type badge under the import button
    const st = $('import-status');
    if (st) {
      st.textContent = `${name}: ${bodyType === 'floater' ? 'Floater — hover locomotion' : 'Biped'} (auto-detected)`;
    }
    refreshCards();
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
    openLab(overlay, () => labFighter || (labFighter = createFighter(selP1)));
  } catch (err) {
    toast('Lab failed to open: ' + err.message, true);
    overlay.classList.add('hidden');
  }
});
// Lab mutates via createFighter re-reads; when its DOM goes away, drop our
// cached preview fighter so the next open / fight re-reads the saved kit.
new MutationObserver(() => {
  if ($('lab-overlay').classList.contains('hidden') || $('lab-overlay').childElementCount === 0) {
    // v0.7: a custom slot may have been deleted — reset stale selections
    if (!FIGHTER_DEFS[selP1]) selP1 = 'ronin';
    if (!FIGHTER_DEFS[selP2]) selP2 = 'volt';
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
  startFight('ronin', 'volt', 'cpu', true);
  toast('demo mode — CPU vs CPU');
}
if (DEBUG && !window.__sv) window.__sv = { get game() { return game; }, sfx, fx: { lastSpark, lastSpeedLines, dmgNumCount, fxCount } };
