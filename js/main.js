// js/main.js — SMASHVR boot: renderer/scene, screen flow (title -> select ->
// fight -> pause/results), HUD rendering, VRM import, Fighter Lab overlay.

import * as THREE from 'three';
import { createGame } from './engine.js?v=35';
import { Input } from './input.js?v=35';
import { sfx } from './audio.js?v=35';
import { createFighter } from './fighters.js?v=35';
import { FIGHTER_DEFS } from './moves.js?v=35';
import { attachVRMToFighter, removeVRMFromFighter } from './vrm.js?v=35';
import { initRoster, isCustom, listCustoms, importCharacter, getCharacterData, getCustomEntry } from './roster.js?v=35';
import { openLab } from './lab.js?v=35';
import { getPortrait, preRenderPortraits } from './portrait.js?v=35';
import { lastSpark, lastSpeedLines, dmgNumCount, fxCount } from './fx.js?v=35';
import {
  STAGES, createCampaignManager, loadProgress, recordClear,
} from './campaign.js?v=35';
import {
  createNetTransport, Lobby, NetDriver, sampleLocalInput, lobbyCode,
} from './netplay.js?v=35';
import { TouchUI } from './touchui.js?v=35';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const DEMO = params.has('demo');

// v0.26: touch devices get the handheld-console UI (no-op on desktop).
// Init before the renderer so the first size already fits the console screen.
TouchUI.init();
function viewDims() {
  return TouchUI.viewportSize() || { w: window.innerWidth, h: window.innerHeight };
}

// ------------------------------------------------------------ renderer/scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
{
  const d = viewDims();
  renderer.setSize(d.w, d.h);
}
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
const menuCam = new THREE.PerspectiveCamera(50, viewDims().w / viewDims().h, 0.1, 200);
menuCam.position.set(0, 4, 18);
menuCam.lookAt(0, 2, 0);

window.addEventListener('resize', () => {
  const d = viewDims();
  renderer.setSize(d.w, d.h);
  menuCam.aspect = d.w / d.h;
  menuCam.updateProjectionMatrix();
  if (game) {
    game.camera.aspect = d.w / d.h;
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

const SCREENS = ['screen-title', 'screen-select', 'screen-campaign', 'screen-online', 'screen-lobby', 'screen-pause', 'screen-results'];
function show(id) {
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
  if (!id) for (const s of SCREENS) $(s).classList.add('hidden');
}
function showHud(v) {
  $('hud').classList.toggle('hidden', !v);
  if (!v) {
    $('hud-countdown').classList.add('hidden'); $('hud-extra').classList.add('hidden');
    $('btn-net-leave').classList.add('hidden'); // v0.11: only during net matches
  }
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
  // v0.17: Smash-style portrait. Async — card renders with the swatch first,
  // portrait swaps in when the offscreen render lands (cached after first).
  const pname = def && def.custom ? def.name : defId.toUpperCase();
  el.innerHTML = `<div class="fname">${pname}</div>
    <div class="fportrait"><div class="swatch" style="background:linear-gradient(135deg,${c1},${c2})${def && def.custom ? ';border:1px dashed #9aa3b2' : ''}"></div></div>
    <div class="fclass">${cls}${bt}${customTag}</div>`;
  getPortrait(defId).then((url) => {
    if (!url || !el.isConnected) return;
    const wrap = el.querySelector('.fportrait');
    if (wrap) wrap.innerHTML = `<img src="${url}" alt="${pname}" draggable="false">`;
  }).catch(() => {});
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
    preRenderPortraits(); // v0.17: warm the portrait cache for the card grid
  });
}

// ------------------------------------------------------------ campaign
// v0.10 CLASSIC MODE: 7-stage ladder/challenges/boss, 1P or 2P co-op.

let campCoop = false;
let campP1 = 'ronin', campP2 = 'volt';
let campMgr = null, campIdx = 0, lastWasCampaign = false;

function fmtTicks(t) {
  const s = Math.floor(t / 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function campFighterRow(elId, cur, set) {
  const el = $(elId);
  el.innerHTML = '';
  const ids = [...Object.keys(FIGHTER_DEFS).filter((d) => !FIGHTER_DEFS[d].custom),
    ...Object.keys(FIGHTER_DEFS).filter((d) => FIGHTER_DEFS[d].custom)];
  for (const d of ids) {
    const b = document.createElement('button');
    b.className = 'btn pick' + (d === cur ? ' sel' : '');
    b.textContent = FIGHTER_DEFS[d].custom ? FIGHTER_DEFS[d].name : d.toUpperCase();
    b.addEventListener('click', () => { sfx.uiMove(); set(d); openCampaign(); });
    el.appendChild(b);
  }
}

function openCampaign() {
  const prog = loadProgress();
  const list = $('campaign-stages');
  list.innerHTML = '';
  STAGES.forEach((st, i) => {
    const unlocked = i <= prog.unlocked;
    const d = document.createElement('div');
    d.className = 'stage' + (unlocked ? '' : ' locked');
    const best = prog.best[i];
    d.innerHTML = `<div class="stage-num">${unlocked ? (i + 1) : '🔒'}</div>` +
      `<div class="stage-body"><div class="stage-name">${st.name}</div>` +
      `<div class="stage-sub">${st.sub}</div></div>` +
      `<div class="stage-best">${best ? `${best.stocks} stocks · ${fmtTicks(best.time)}` : ''}</div>`;
    if (unlocked) d.addEventListener('click', () => { sfx.select(); startCampaignStage(i); });
    list.appendChild(d);
  });
  $('btn-coop1').classList.toggle('sel', !campCoop);
  $('btn-coop2').classList.toggle('sel', campCoop);
  $('camp-p2-wrap').classList.toggle('hidden', !campCoop);
  campFighterRow('camp-p1-cards', campP1, (d) => { campP1 = d; });
  if (campCoop) campFighterRow('camp-p2-cards', campP2, (d) => { campP2 = d; });
  show('screen-campaign');
}

function startCampaignStage(idx, p1 = null, p2 = null, coop = null) {
  if (p1) campP1 = p1;
  if (p2) campP2 = p2;
  if (coop !== null) campCoop = coop;
  // a custom slot may have been deleted while we were away
  if (!FIGHTER_DEFS[campP1]) campP1 = 'ronin';
  if (!FIGHTER_DEFS[campP2]) campP2 = 'volt';
  campIdx = idx;
  campMgr = createCampaignManager(idx, {
    p1def: campP1, p2def: campP2, coop: campCoop,
    announce: (m) => toast(m),
  });
  destroyGame();
  show(null);
  showHud(true);
  lastWasCampaign = true;
  game = createGame({
    slots: campMgr.slots(),
    scene,
    matchTime: campMgr.matchTime(),
    onTick: (g) => campMgr.onTick(g),
    onKO: (g, f) => campMgr.onKO(g, f),
    onTimeUp: (g) => campMgr.onTimeUp(g),
    onEnd: (result) => campaignEnd(result),
    onPause: (paused) => { if (paused) show('screen-pause'); else show(null); },
    onHud: renderHud,
  });
  attachCustoms(game);
  game._hudExtra = () => campMgr.hudExtra(game);
  // stage intro splash
  const st = STAGES[idx];
  $('ci-num').textContent = `STAGE ${idx + 1} / ${STAGES.length}`;
  $('ci-name').textContent = st.name;
  $('ci-sub').textContent = st.sub + (campCoop ? ' · CO-OP' : '');
  $('campaign-intro').classList.remove('hidden');
  setTimeout(() => $('campaign-intro').classList.add('hidden'), 2400);
  if (DEBUG) window.__sv = {
    game, sfx, fx: { lastSpark, lastSpeedLines, dmgNumCount, fxCount },
    startSlots: (list, m = 'cpu') => startFightWithSlots(list, m),
    startCampaign: (i, c = false, a = 'ronin', b = 'volt') => startCampaignStage(i, a, b, c),
  };
}

function campaignEnd(result) {
  showHud(false);
  const r = campMgr.resolveEnd(game, result);
  const st = STAGES[campIdx];
  const final = campIdx === STAGES.length - 1;
  if (r.clear) {
    const prog = recordClear(campIdx, r.score || { stocks: 0, time: 0 });
    const isBest = prog.best[campIdx] && r.score &&
      prog.best[campIdx].stocks === r.score.stocks && prog.best[campIdx].time === r.score.time;
    $('results-winner').textContent = final ? 'CAMPAIGN COMPLETE!' : 'STAGE CLEAR!';
    $('results-sub').textContent =
      `${st.name} cleared — ${r.score ? r.score.stocks : 0} stock(s) left` +
      (isBest ? ' · NEW BEST!' : '');
    $('btn-next-stage').classList.toggle('hidden', final);
    $('btn-rematch').textContent = 'REPLAY STAGE';
    sfx.select();
  } else {
    $('results-winner').textContent = 'STAGE FAILED';
    $('results-sub').textContent = `${st.name} — ${r.why || 'try again'}`;
    $('btn-next-stage').classList.add('hidden');
    $('btn-rematch').textContent = 'TRY AGAIN';
    sfx.select();
  }
  show('screen-results');
}

// ------------------------------------------------------------ online netplay
// v0.11: Trystero P2P lobbies + input-delay lockstep matches.

let netTransport = null, netLobby = null, netDriver = null, netMsgHandler = null;
let netHelloTimer = 0, netBeatTimer = 0;
const NET_DEFS = ['ronin', 'volt', 'wisp']; // built-ins only online (v1)

function netName() {
  try { return localStorage.getItem('smashvr_name') || ''; } catch (e) { return ''; }
}
function setNetName(n) { try { localStorage.setItem('smashvr_name', n); } catch (e) {} }

function setNetStatus(t, isErr = false) {
  const el = $('net-status');
  el.textContent = t;
  el.classList.toggle('error', isErr);
}

function openOnline() {
  $('net-name').value = netName();
  const m = location.hash.match(/#net=([A-Z0-9]{6})/i);
  if (m) $('net-code').value = m[1].toUpperCase();
  setNetStatus('');
  show('screen-online');
}

function stopNetTimers() {
  clearInterval(netHelloTimer); clearInterval(netBeatTimer);
  netHelloTimer = 0; netBeatTimer = 0;
}

function wireLobbyTransport() {
  netMsgHandler = (msg, cid) => { if (netLobby) netLobby.onMsg(msg, cid); };
}

async function createLobby() {
  const name = $('net-name').value.trim() || 'Player';
  setNetName(name);
  const code = lobbyCode();
  setNetStatus('Creating lobby…');
  try {
    netTransport = await createNetTransport(code, {
      onMessage: (msg, cid) => { if (netMsgHandler) netMsgHandler(msg, cid); },
      onPeerJoin: () => renderLobby(),
      onPeerLeave: () => renderLobby(),
    });
    netLobby = new Lobby(netTransport, { isHost: true, name, code });
    netLobby.players.push({ cid: netTransport.cid, name, idx: 0, def: 'ronin', ready: false });
    netLobby.onChange = renderLobby;
    netLobby.onStart = null; // host starts via hostStart()
    netLobby.onKicked = null;
    wireLobbyTransport();
    // host heartbeat: re-broadcast lobby state so staggered joiners catch up
    stopNetTimers();
    netBeatTimer = setInterval(() => { if (netLobby && netLobby.isHost) netLobby.broadcast(); }, 3000);
    setNetStatus('');
    show('screen-lobby');
    renderLobby();
    if (DEBUG) { window.__sv.net = window.__sv.net || {}; window.__sv.net.lobby = netLobby; window.__sv.net.transport = netTransport; }
    sfx.select();
  } catch (err) {
    setNetStatus('Could not create lobby: ' + err.message, true);
  }
}

async function joinLobby() {
  const code = $('net-code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { setNetStatus('Enter the 6-character code', true); return; }
  const name = $('net-name').value.trim() || 'Player';
  setNetName(name);
  setNetStatus('Joining lobby ' + code + '…');
  try {
    netTransport = await createNetTransport(code, {
      onMessage: (msg, cid) => { if (netMsgHandler) netMsgHandler(msg, cid); },
      onPeerJoin: () => renderLobby(),
      onPeerLeave: () => renderLobby(),
    });
    netLobby = new Lobby(netTransport, { isHost: false, name, code });
    netLobby.onChange = renderLobby;
    netLobby.onStart = (seed, slots) => {
      const me = netLobby.myPlayer();
      if (me) startNetMatch(seed, slots, me.idx);
    };
    netLobby.onKicked = () => { leaveLobby(); toast('Kicked from lobby', true); };
    wireLobbyTransport();
    netLobby.hello();
    // staggered join: re-hello until the host's lobby state lists us
    stopNetTimers();
    netHelloTimer = setInterval(() => {
      if (!netLobby || netLobby.myPlayer()) { clearInterval(netHelloTimer); netHelloTimer = 0; return; }
      netLobby.hello();
    }, 2000);
    setNetStatus('');
    show('screen-lobby');
    renderLobby();
    if (DEBUG) { window.__sv.net = window.__sv.net || {}; window.__sv.net.lobby = netLobby; window.__sv.net.transport = netTransport; }
    sfx.select();
  } catch (err) {
    setNetStatus('Could not join: ' + err.message, true);
  }
}

function renderLobby() {
  if (!netLobby) return;
  $('lobby-code').textContent = netLobby.code;
  const me = netLobby.myPlayer();
  const list = $('lobby-players');
  list.innerHTML = '';
  const humans = [...netLobby.players].sort((a, b) => a.idx - b.idx);
  for (const p of humans) {
    const row = document.createElement('div');
    row.className = 'lrow' + (me && p.cid === me.cid ? ' me' : '');
    const nm = document.createElement('span');
    nm.className = 'lname';
    nm.textContent = `#${p.idx + 1} ${p.name}${netLobby.isHost && p.cid === netTransport.cid ? ' (host)' : ''}`;
    row.appendChild(nm);
    // fighter picker (built-ins only, v1) — own row only
    const sel = document.createElement('select');
    sel.className = 'ldef';
    for (const d of NET_DEFS) {
      const o = document.createElement('option');
      o.value = d; o.textContent = d.toUpperCase();
      if (d === p.def) o.selected = true;
      sel.appendChild(o);
    }
    sel.disabled = !(me && p.cid === me.cid);
    sel.addEventListener('change', () => { sfx.uiMove(); netLobby.pick(sel.value); });
    row.appendChild(sel);
    // ready toggle — own row only
    const rb = document.createElement('button');
    rb.className = 'btn small' + (p.ready ? ' sel' : '');
    rb.textContent = p.ready ? 'READY ✓' : 'ready?';
    rb.disabled = !(me && p.cid === me.cid);
    rb.addEventListener('click', () => { sfx.select(); netLobby.setReady(!p.ready); });
    row.appendChild(rb);
    // kick — host only, not self
    if (netLobby.isHost && me && p.cid !== me.cid) {
      const kb = document.createElement('button');
      kb.className = 'btn small danger';
      kb.textContent = 'kick';
      kb.addEventListener('click', () => netLobby.hostKick(p.idx));
      row.appendChild(kb);
    }
    list.appendChild(row);
  }
  for (let i = humans.length; i < 4; i++) {
    const row = document.createElement('div');
    row.className = 'lrow empty';
    row.textContent = `seat ${i + 1} — open (share the code)`;
    list.appendChild(row);
  }
  // host config
  $('lobby-config').classList.toggle('hidden', !netLobby.isHost);
  if (netLobby.isHost) {
    $('btn-mode-ffa').classList.toggle('sel', netLobby.config.mode === 'ffa');
    $('btn-mode-teams').classList.toggle('sel', netLobby.config.mode === 'teams');
    $('lobby-cpus').textContent = netLobby.config.cpus;
  }
  // start — host only, needs all-ready + 2+ fighters
  const startBtn = $('btn-lobby-start');
  startBtn.classList.toggle('hidden', !netLobby.isHost);
  if (netLobby.isHost) {
    const ok = netLobby.allReady();
    startBtn.disabled = !ok;
    startBtn.textContent = ok ? `START MATCH (${humans.length + netLobby.config.cpus} fighters)` : 'WAITING FOR READY…';
  }
  const n = humans.length + netLobby.config.cpus;
  $('lobby-hint').textContent =
    `${humans.length}/4 players · ${n} fighter${n === 1 ? '' : 's'} total` +
    (netLobby.config.mode === 'teams' ? ' · red: seats 1-2, blue: seats 3-4' : '');
}

function startNetMatch(seed, slots, myIdx) {
  stopNetTimers();
  destroyGame();
  show(null);
  showHud(true);
  lastWasCampaign = false;
  const playerCount = slots.filter((s) => typeof s.ctrl === 'string' && s.ctrl.startsWith('net')).length;
  const isHost = netLobby ? netLobby.isHost : true;
  game = createGame({
    slots: slots.map((s) => ({ ...s })),
    scene, seed,
    onEnd: (result) => {
      showHud(false);
      $('results-winner').textContent = `${result.winner.name.toUpperCase()} WINS`;
      $('results-sub').textContent = result.reason === 'time' ? 'time up' : 'last one standing';
      $('btn-next-stage').classList.add('hidden');
      $('btn-rematch').classList.add('hidden');
      sfx.select();
      show('screen-results');
    },
    onPause: (paused) => { if (paused) show('screen-pause'); else show(null); },
    onHud: renderHud,
  });
  // HUD player names
  game._netNames = {};
  if (netLobby) {
    for (const s of slots) {
      const p = netLobby.players.find((x) => 'net' + x.idx === s.ctrl);
      if (p) game._netNames[s.ctrl] = p.name;
    }
  }
  netDriver = new NetDriver({
    game, myIdx, playerCount, isHost, seed,
    send: (m) => { if (netTransport) netTransport.send(m); },
    sampleLocal: () => sampleLocalInput(),
    onWaiting: (w) => $('net-waiting').classList.toggle('hidden', !w),
    onEvent: (e) => { if (e === 'resync') toast('Resyncing…'); },
  });
  netMsgHandler = (msg) => netDriver.onMessage(msg);
  $('net-waiting').classList.add('hidden');
  // v0.11: pause is disabled online (would desync) — offer a leave button instead
  $('btn-net-leave').classList.remove('hidden');
  if (DEBUG) window.__sv.net = { driver: netDriver, lobby: netLobby };
  toast(isHost ? 'Match started (you are host)' : 'Match started!');
}

function leaveLobby() {
  stopNetTimers();
  if (netLobby) { try { netLobby.leave(); } catch (e) {} }
  netTransport = null; netLobby = null; netDriver = null; netMsgHandler = null;
  if (game && game._net) { destroyGame(); }
  show('screen-title');
}

// ------------------------------------------------------------ game lifecycle

// v0.23: last shown combo count per slot — the HUD badge only updates (and
// pops) when the count changes, not on every tick's chip rebuild.
const _comboShown = {};
const _comboEl = {};
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
    // v0.11: online chips show the player's name
    const ctrlTag = f.ctrl === 'cpu' ? 'CPU' : (f.pname || f.ctrl.toUpperCase());
    d.innerHTML = `<div class="hud-name" style="color:${f.color}">${f.name} · ${ctrlTag}</div>
      <div class="hud-pct" style="color:${f.color}">${Math.floor(f.percent)}%</div>
      <div class="hud-stocks">${'●'.repeat(Math.max(0, f.stocks))}</div>
      <div class="hud-combo" id="combo-${f.slot}"></div>`;
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
  // v0.23: combo badges — the chips rebuild every tick via innerHTML, which
  // destroys the badge element. Track the element object: if it's a fresh
  // element, re-apply the text silently; the pop animation only plays when
  // the COUNT changes on a live element.
  for (const f of fs) {
    const el = document.getElementById(`combo-${f.slot}`);
    if (!el) continue;
    const n = f.combo >= 2 ? f.combo : 0;
    const isNewEl = _comboEl[f.slot] !== el;
    if (_comboShown[f.slot] !== n || isNewEl) {
      _comboShown[f.slot] = n;
      _comboEl[f.slot] = el;
      if (n >= 2) {
        el.textContent = `${n} HITS`;
        el.style.color = f.color;
        el.classList.remove('hidden');
        if (!isNewEl) {
          el.classList.remove('pop');
          void el.offsetWidth; // reflow retriggers the animation
          el.classList.add('pop');
        }
      } else {
        el.classList.add('hidden');
        el.classList.remove('pop');
      }
    }
  }
  const t = s.time;
  $('hud-timer').textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  const cd = $('hud-countdown');
  if (s.phase === 'countdown' && s.countdown > 0) {
    cd.textContent = s.countdown;
    cd.classList.remove('hidden');
  } else {
    cd.classList.add('hidden');
  }
  // v0.10: campaign HUD extras — KO FEST counter, boss HP bar
  const ex = $('hud-extra');
  if (s.extra && (s.extra.kind === 'kofest' || s.extra.kind === 'boss')) {
    ex.classList.remove('hidden');
    if (s.extra.kind === 'kofest') {
      ex.innerHTML = `<div class="kofest">KO <b>${s.extra.count}</b> / ${s.extra.target}</div>`;
    } else {
      const pct = Math.max(0, Math.min(100, Math.round(s.extra.pct / 1.6)));
      const ph = Math.max(1, s.extra.phase || 1);
      ex.innerHTML = `<div class="bossbar"><div class="bossname">${s.extra.name} — PHASE ${ph}</div>` +
        `<div class="bosstrack"><div class="bossfill" style="width:${pct}%"></div>` +
        `<div class="bosspip" style="left:37.5%"></div><div class="bosspip" style="left:75%"></div></div></div>`;
    }
  } else {
    ex.classList.add('hidden');
  }
}

function startFightWithSlots(slotList, m, isDemo = false) {
  destroyGame();
  show(null);
  showHud(true);
  lastWasCampaign = false;
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
      const entry = getCustomEntry(f.defId); // v0.12.2: per-model flip
      attachVRMToFighter(f, { ...data, flip: !!entry?.flip });
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
  // v0.11: leaving an online match/session drops the transport too
  stopNetTimers();
  if (netTransport) { try { netTransport.leave(); } catch (e) {} }
  netTransport = null; netLobby = null; netDriver = null; netMsgHandler = null;
  destroyGame();
  show('screen-title');
}

// ------------------------------------------------------------ wiring

$('btn-1p').addEventListener('click', () => { sfx.select(); openSelect('cpu'); });
$('btn-2p').addEventListener('click', () => { sfx.select(); openSelect('versus'); });
$('btn-campaign').addEventListener('click', () => { sfx.select(); openCampaign(); });
// v0.11: online netplay
$('btn-online').addEventListener('click', () => { sfx.select(); openOnline(); });
$('btn-online-back').addEventListener('click', () => { sfx.uiMove(); show('screen-title'); });
$('btn-net-create').addEventListener('click', () => { sfx.select(); createLobby(); });
$('btn-net-join').addEventListener('click', () => { sfx.select(); joinLobby(); });
$('net-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinLobby(); });
$('btn-lobby-leave').addEventListener('click', () => { sfx.uiMove(); leaveLobby(); });
// v0.11: leave button during net matches (pause is disabled online)
$('btn-net-leave').addEventListener('click', () => { sfx.uiMove(); quitToTitle(); });
$('btn-copy-link').addEventListener('click', () => {
  if (!netLobby) return;
  const url = location.origin + location.pathname + '#net=' + netLobby.code;
  const done = () => toast('Invite link copied — send it to your friend');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => toast('Copy failed: ' + url, true));
  } else { toast(url); }
  sfx.select();
});
$('btn-mode-ffa').addEventListener('click', () => { sfx.uiMove(); if (netLobby && netLobby.isHost) netLobby.hostSetConfig({ mode: 'ffa' }); });
$('btn-mode-teams').addEventListener('click', () => { sfx.uiMove(); if (netLobby && netLobby.isHost) netLobby.hostSetConfig({ mode: 'teams' }); });
$('btn-cpu-inc').addEventListener('click', () => { sfx.uiMove(); if (netLobby && netLobby.isHost) netLobby.hostSetConfig({ cpus: netLobby.config.cpus + 1 }); });
$('btn-cpu-dec').addEventListener('click', () => { sfx.uiMove(); if (netLobby && netLobby.isHost) netLobby.hostSetConfig({ cpus: netLobby.config.cpus - 1 }); });
$('btn-lobby-start').addEventListener('click', () => {
  sfx.select();
  if (!netLobby || !netLobby.isHost) return;
  const r = netLobby.hostStart();
  if (r) {
    const me = netLobby.myPlayer();
    startNetMatch(r.seed, r.slots, me ? me.idx : 0);
  }
});
$('btn-camp-back').addEventListener('click', () => { sfx.uiMove(); show('screen-title'); });
$('btn-coop1').addEventListener('click', () => { sfx.uiMove(); campCoop = false; openCampaign(); });
$('btn-coop2').addEventListener('click', () => { sfx.uiMove(); campCoop = true; openCampaign(); });
$('btn-next-stage').addEventListener('click', () => {
  sfx.select();
  if (campIdx < STAGES.length - 1) startCampaignStage(campIdx + 1);
});
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
  if (lastWasCampaign) { startCampaignStage(campIdx); return; }
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
// v0.11: invite links carry the lobby code in the hash
if (location.hash.match(/#net=([A-Z0-9]{6})/i)) openOnline();
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
  startCampaign: (i, c = false, a = 'ronin', b = 'volt') => startCampaignStage(i, a, b, c),
};
