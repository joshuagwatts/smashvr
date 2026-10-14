// js/lab.js — Fighter Lab overlay: theme picker, live 3D preview, and the
// move-swap budget minigame.
//
// Budget semantics: your NATIVE kit is free. The budget (budget.js) limits what
// you STEAL from the other fighter — validateKit() runs over the stolen subset
// only. (A full 16-move kit of real frame data costs ~300 pts vs a 208 mid
// budget, so taxing native moves would make every default kit invalid.)
//
// Persists 'smashvr_kit_<defId>' ({slotId: moveRecordClone}) and
// 'smashvr_theme_<defId>' ({primary, secondary}). Fires CustomEvents
// 'smashvr-kit' / 'smashvr-theme' ({defId, ...}) so the engine can live-update.

import * as THREE from 'three';
import { FIGHTER_DEFS, MOVES, SLOTS, SLOT_LABELS } from './moves.js';
import { classTax, classBudget, moveCap, validateKit, taxedCost } from './budget.js';
import { createFighter } from './fighters.js';
import { tickFighterVisual, setFighterTheme } from './anim.js';
import { renameCustom, setCustomKit, deleteCustom } from './roster.js';

const OTHER = { ronin: 'volt', volt: 'ronin', wisp: 'ronin' };
// v0.7: customs steal from their kit's rival (their native kit is the kit def's)
const otherFor = (d) => {
  const dd = FIGHTER_DEFS[d];
  const base = dd && dd.custom ? dd.kit : d;
  return OTHER[base] || 'ronin';
};

function loadJSON(key, fallback) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch (e) {
    return fallback;
  }
}
function saveJSON(key, v) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* private mode etc. */ }
}

const css = (el, o) => Object.assign(el.style, o);
const el = (tag, text) => {
  const e = document.createElement(tag);
  if (text != null) e.textContent = text;
  return e;
};
const fmt = (n) => (Math.round(n * 10) / 10).toFixed(1);

export function openLab(containerEl, onClose) {
  let defId = 'ronin';
  let kit = loadJSON('smashvr_kit_' + defId, null) || null; // null = native
  let theme = loadJSON('smashvr_theme_' + defId, null) || { ...FIGHTER_DEFS[defId].theme };

  const cls = () => FIGHTER_DEFS[defId].cls;
  // v0.7: customs use their kit's moveset as native
  const nativeMoves = () => {
    const dd = FIGHTER_DEFS[defId];
    return dd.custom ? MOVES[dd.kit] : MOVES[defId];
  };
  const curKit = () => {
    const k = {};
    for (const s of SLOTS) k[s] = (kit && kit[s]) || nativeMoves()[s];
    return k;
  };
  // v0.7: for customs, "native" = the kit's moves (e.g. ronin_jab)
  const isNative = (move) => {
    const dd = FIGHTER_DEFS[defId];
    const prefix = (dd.custom ? dd.kit : defId) + '_';
    return typeof move.id === 'string' && move.id.indexOf(prefix) === 0;
  };
  const stolenSet = () => {
    const o = {};
    const k = curKit();
    for (const s of SLOTS) if (!isNative(k[s])) o[s] = k[s];
    return o;
  };
  const moveNameById = (id) => {
    const k = curKit();
    for (const s of SLOTS) if (k[s].id === id) return k[s].name;
    for (const s of SLOTS) {
      const m = MOVES[otherFor(defId)][s];
      if (m.id === id) return m.name;
    }
    return id;
  };

  // ---- overlay DOM ----
  const overlay = el('div');
  css(overlay, {
    position: 'fixed', inset: '0', zIndex: '9999',
    background: 'rgba(6,8,12,0.82)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '16px',
    fontFamily: 'system-ui, -apple-system, sans-serif', color: '#e8ecf4',
  });
  const panel = el('div');
  css(panel, {
    background: '#14161d', border: '1px solid #2a2f3d', borderRadius: '12px',
    width: '620px', maxWidth: '96vw', maxHeight: '92vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
  });
  overlay.appendChild(panel);

  const header = el('div');
  css(header, { display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2f3d' });
  const title = el('h2', 'Fighter Lab');
  css(title, { margin: '0', fontSize: '17px', letterSpacing: '2px', flex: '1' });
  const closeBtn = el('button', '✕');
  css(closeBtn, { background: '#232838', color: '#e8ecf4', border: '1px solid #3a4157', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer' });
  closeBtn.onclick = () => { teardown(); if (onClose) onClose(); };
  header.appendChild(title); header.appendChild(closeBtn);
  panel.appendChild(header);

  const body = el('div');
  css(body, { overflowY: 'auto', padding: '14px 16px' });
  panel.appendChild(body);

  // ---- def selector + theme + preview ----
  const topRow = el('div');
  css(topRow, { display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '12px', flexWrap: 'wrap' });
  body.appendChild(topRow);

  const leftCol = el('div');
  css(leftCol, { flex: '1', minWidth: '220px' });
  topRow.appendChild(leftCol);

  const defRow = el('div');
  css(defRow, { display: 'flex', gap: '8px', marginBottom: '10px' });
  const defBtns = {};
  // v0.6: buttons built from the live def list (ronin/volt/wisp/...)
  for (const d of Object.keys(FIGHTER_DEFS)) {
    const b = el('button', FIGHTER_DEFS[d].name);
    css(b, { flex: '1', padding: '8px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4', fontWeight: '700', letterSpacing: '1px' });
    b.onclick = () => switchDef(d);
    defRow.appendChild(b);
    defBtns[d] = b;
  }
  leftCol.appendChild(defRow);

  // v0.7: custom slot management — rename, kit swap, delete. Visible only
  // when a custom def is selected.
  const customRow = el('div');
  css(customRow, { display: 'none', gap: '8px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' });
  const nameInput = document.createElement('input');
  css(nameInput, { padding: '6px 8px', borderRadius: '6px', background: '#232838', color: '#e8ecf4', border: '1px solid #3a4157', fontSize: '12px', width: '130px' });
  nameInput.placeholder = 'Rename…';
  const renameBtn = el('button', 'Rename');
  css(renameBtn, { padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4', fontSize: '12px' });
  renameBtn.onclick = async () => {
    if (!FIGHTER_DEFS[defId].custom) return;
    await renameCustom(defId, nameInput.value);
    nameInput.value = '';
    refreshDefBtns();
    renderAll();
    say(`Renamed to ${FIGHTER_DEFS[defId].name}.`, true);
  };
  const kitSel = document.createElement('select');
  css(kitSel, { padding: '6px 8px', borderRadius: '6px', background: '#232838', color: '#e8ecf4', border: '1px solid #3a4157', fontSize: '12px' });
  for (const k of ['ronin', 'volt', 'wisp']) {
    const o = document.createElement('option');
    o.value = k; o.textContent = FIGHTER_DEFS[k].name + ' kit';
    kitSel.appendChild(o);
  }
  kitSel.onchange = async () => {
    if (!FIGHTER_DEFS[defId].custom) return;
    await setCustomKit(defId, kitSel.value);
    kit = null; // clear move swaps — they belonged to the old kit
    try { localStorage.removeItem('smashvr_kit_' + defId); } catch (e) {}
    rebuildPreview();
    renderAll();
    say(`Moveset swapped to ${FIGHTER_DEFS[kitSel.value].name} kit.`, true);
  };
  const delBtn = el('button', 'Delete slot');
  css(delBtn, { padding: '6px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #7a2e2e', background: '#3d1f1f', color: '#ff9a9a', fontSize: '12px' });
  delBtn.onclick = async () => {
    if (!FIGHTER_DEFS[defId].custom) return;
    const nm = FIGHTER_DEFS[defId].name;
    if (!window.confirm(`Delete ${nm} from the roster?`)) return;
    await deleteCustom(defId);
    say(`${nm} deleted.`, true);
    teardown(); if (onClose) onClose();
  };
  customRow.appendChild(el('span', 'Custom:'));
  customRow.appendChild(nameInput);
  customRow.appendChild(renameBtn);
  customRow.appendChild(kitSel);
  customRow.appendChild(delBtn);
  leftCol.appendChild(customRow);

  function refreshDefBtns() {
    for (const d of Object.keys(defBtns)) {
      if (FIGHTER_DEFS[d]) defBtns[d].textContent = FIGHTER_DEFS[d].name;
      else { defBtns[d].remove(); delete defBtns[d]; }
    }
    // customs added after Lab opened
    for (const d of Object.keys(FIGHTER_DEFS)) {
      if (!defBtns[d]) {
        const b = el('button', FIGHTER_DEFS[d].name);
        css(b, { flex: '1', padding: '8px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4', fontWeight: '700', letterSpacing: '1px' });
        b.onclick = () => switchDef(d);
        defRow.appendChild(b);
        defBtns[d] = b;
      }
    }
  }

  function renderCustomRow() {
    const isC = !!(FIGHTER_DEFS[defId] && FIGHTER_DEFS[defId].custom);
    customRow.style.display = isC ? 'flex' : 'none';
    if (isC) kitSel.value = FIGHTER_DEFS[defId].kit;
  }

  const classLine = el('div');
  css(classLine, { fontSize: '12px', color: '#9aa3b8', marginBottom: '10px' });
  leftCol.appendChild(classLine);

  // v0.6: body-type badge + manual override (Auto / Biped / Floater).
  // Override persists per def and toggles locomotion without re-import.
  const btRow = el('div');
  css(btRow, { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', fontSize: '12px', color: '#9aa3b8' });
  const btBadge = el('span', '');
  css(btBadge, { padding: '3px 10px', borderRadius: '20px', fontWeight: '700', letterSpacing: '1px', fontSize: '11px' });
  const btSel = document.createElement('select');
  css(btSel, { padding: '5px 8px', borderRadius: '6px', background: '#232838', color: '#e8ecf4', border: '1px solid #3a4157', fontSize: '12px' });
  for (const [v, label] of [['auto', 'Auto'], ['biped', 'Biped'], ['floater', 'Floater']]) {
    const o = document.createElement('option');
    o.value = v; o.textContent = label;
    btSel.appendChild(o);
  }
  btSel.onchange = () => {
    saveJSON('smashvr_bodytype_' + defId, btSel.value);
    rebuildPreview();
    renderBodyType();
    say(btSel.value === 'auto'
      ? 'Body type: auto-detect.'
      : `Body type overridden to ${btSel.value} — applies on next fight.`, true);
  };
  btRow.appendChild(el('span', 'Body type:'));
  btRow.appendChild(btBadge);
  btRow.appendChild(btSel);
  leftCol.appendChild(btRow);

  function effectiveBodyType() {
    const ov = loadJSON('smashvr_bodytype_' + defId, 'auto');
    return (ov === 'biped' || ov === 'floater') ? { type: ov, auto: false } : { type: FIGHTER_DEFS[defId].bodyType || 'biped', auto: true };
  }
  function renderBodyType() {
    const { type, auto } = effectiveBodyType();
    btSel.value = loadJSON('smashvr_bodytype_' + defId, 'auto');
    btBadge.textContent = (type === 'floater' ? 'FLOATER' : 'BIPED') + (auto ? ' (auto)' : ' (override)');
    css(btBadge, {
      background: type === 'floater' ? '#5e7bff33' : '#43d17c33',
      color: type === 'floater' ? '#b9f3ff' : '#43d17c',
      border: `1px solid ${type === 'floater' ? '#5e7bff' : '#43d17c'}`,
    });
  }

  const themeRow = el('div');
  css(themeRow, { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '10px' });
  const mkPicker = (label, key) => {
    const wrap = el('label');
    css(wrap, { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9aa3b8' });
    wrap.appendChild(el('span', label));
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = theme[key];
    css(inp, { width: '34px', height: '26px', padding: '0', border: '1px solid #3a4157', borderRadius: '6px', background: 'none', cursor: 'pointer' });
    inp.oninput = () => {
      theme = { ...theme, [key]: inp.value };
      if (previewF) setFighterTheme(previewF, theme);
      saveJSON('smashvr_theme_' + defId, theme);
      document.dispatchEvent(new CustomEvent('smashvr-theme', { detail: { defId, theme: { ...theme } } }));
    };
    wrap.appendChild(inp);
    themeRow.appendChild(wrap);
    return inp;
  };
  const primaryPicker = mkPicker('Primary', 'primary');
  const secondaryPicker = mkPicker('Secondary', 'secondary');
  leftCol.appendChild(themeRow);

  const budgetWrap = el('div');
  css(budgetWrap, { marginBottom: '4px' });
  const budgetLabel = el('div');
  css(budgetLabel, { fontSize: '12px', color: '#9aa3b8', marginBottom: '4px' });
  const budgetTrack = el('div');
  css(budgetTrack, { height: '10px', background: '#232838', borderRadius: '6px', overflow: 'hidden' });
  const budgetFill = el('div');
  css(budgetFill, { height: '100%', width: '0%', background: '#43d17c', borderRadius: '6px', transition: 'width 0.2s' });
  budgetTrack.appendChild(budgetFill);
  budgetWrap.appendChild(budgetLabel);
  budgetWrap.appendChild(budgetTrack);
  leftCol.appendChild(budgetWrap);

  const noteLine = el('div', 'Your native kit is free — the budget limits stolen moves.');
  css(noteLine, { fontSize: '11px', color: '#6b7488', marginTop: '6px' });
  leftCol.appendChild(noteLine);

  // preview canvas
  const previewWrap = el('div');
  css(previewWrap, { width: '190px', textAlign: 'center' });
  const canvas = document.createElement('canvas');
  canvas.width = 190; canvas.height = 190;
  css(canvas, { width: '190px', height: '190px', borderRadius: '10px', background: '#0d1017', border: '1px solid #2a2f3d' });
  previewWrap.appendChild(canvas);
  const previewCap = el('div', 'theme preview');
  css(previewCap, { fontSize: '11px', color: '#6b7488', marginTop: '4px' });
  previewWrap.appendChild(previewCap);
  topRow.appendChild(previewWrap);

  // ---- message line ----
  const msg = el('div');
  css(msg, { minHeight: '20px', fontSize: '13px', color: '#ffb13d', margin: '6px 0' });
  body.appendChild(msg);
  const say = (t, ok) => { msg.textContent = t || ''; msg.style.color = ok ? '#43d17c' : '#ffb13d'; };

  // ---- slot rows ----
  const rowsWrap = el('div');
  body.appendChild(rowsWrap);
  const rowEls = {};

  const footer = el('div');
  css(footer, { display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #2a2f3d' });
  const resetBtn = el('button', 'Reset kit');
  css(resetBtn, { padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4' });
  resetBtn.onclick = () => {
    kit = null;
    saveJSON('smashvr_kit_' + defId, curKit());
    document.dispatchEvent(new CustomEvent('smashvr-kit', { detail: { defId } }));
    renderAll();
    say('Kit reset to native moveset.', true);
  };
  footer.appendChild(resetBtn);
  const doneBtn = el('button', 'Done');
  css(doneBtn, { padding: '8px 22px', borderRadius: '8px', cursor: 'pointer', border: 'none', background: '#43d17c', color: '#0b0e13', fontWeight: '700' });
  doneBtn.onclick = () => { teardown(); if (onClose) onClose(); };
  footer.appendChild(doneBtn);
  panel.appendChild(footer);

  // ---- 3D preview ----
  let renderer = null, previewScene = null, previewF = null, rafId = 0, lastT = 0, dead = false;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(190, 190, false);
    previewScene = new THREE.Scene();
    previewScene.add(new THREE.HemisphereLight(0xffffff, 0x223, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2);
    dl.position.set(2, 4, 3);
    previewScene.add(dl);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    cam.position.set(0.4, 1.15, 3.4);
    cam.lookAt(0, 0.95, 0);
    previewScene.userData.cam = cam;
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.2, 32),
      new THREE.MeshBasicMaterial({ color: '#1a1f2b' })
    );
    ground.rotation.x = -Math.PI / 2;
    previewScene.add(ground);
    const loop = (now) => {
      if (dead) return;
      rafId = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
      lastT = now;
      if (previewF) {
        previewF.stateFrame++;
        tickFighterVisual(previewF, dt);
        renderer.render(previewScene, previewScene.userData.cam);
      }
    };
    rafId = requestAnimationFrame(loop);
  } catch (e) {
    renderer = null; // headless / no WebGL: lab still works, no preview
  }

  function rebuildPreview() {
    if (!renderer) return;
    if (previewF && previewF.root.parent) previewF.root.parent.remove(previewF.root);
    previewF = createFighter(defId);
    setFighterTheme(previewF, theme);
    previewF.state = 'idle';
    previewScene.add(previewF.root);
  }

  function teardown() {
    dead = true;
    cancelAnimationFrame(rafId);
    if (renderer) renderer.dispose();
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    // hide the fixed full-screen container too, or the empty div keeps
    // intercepting clicks on whatever screen is underneath (found 2026-10-13)
    containerEl.classList.add('hidden');
  }

  // ---- rendering ----
  function renderBudget() {
    const v = validateKit(stolenSet(), cls());
    budgetLabel.textContent = `Stolen moves: ${fmt(v.spent)} / ${v.budget} pts`;
    const pct = Math.min(100, (v.spent / v.budget) * 100);
    budgetFill.style.width = pct + '%';
    budgetFill.style.background = v.ok ? '#43d17c' : '#e23b2e';
    classLine.textContent = `${FIGHTER_DEFS[defId].name} — ${cls()} class — per-move cap ${fmt(moveCap(cls()))} pts`;
    for (const d of Object.keys(FIGHTER_DEFS)) {
      const on = d === defId;
      css(defBtns[d], { background: on ? '#3b82f6' : '#232838', borderColor: on ? '#3b82f6' : '#3a4157' });
    }
    renderBodyType();
  }

  function renderAll() {
    renderBudget();
    renderCustomRow();
    rowsWrap.innerHTML = '';
    const k = curKit();
    for (const s of SLOTS) {
      const m = k[s];
      const row = el('div');
      css(row, { display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 4px', borderBottom: '1px solid #1e2230', fontSize: '13px' });
      const lab = el('span', SLOT_LABELS[s]);
      css(lab, { width: '110px', color: '#9aa3b8', flexShrink: '0' });
      const nm = el('span', m.name + (isNative(m) ? '' : ` (${FIGHTER_DEFS[otherFor(defId)].name})`));
      css(nm, { flex: '1', fontWeight: isNative(m) ? '400' : '700', color: isNative(m) ? '#e8ecf4' : '#7df9ff' });
      const cost = el('span', fmt(m.cost) + ' pts');
      css(cost, { width: '64px', textAlign: 'right', color: '#9aa3b8' });
      const btn = el('button', 'Swap');
      css(btn, { padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4', fontSize: '12px' });
      btn.onclick = () => openSwap(row, s);
      row.appendChild(lab); row.appendChild(nm); row.appendChild(cost); row.appendChild(btn);
      rowsWrap.appendChild(row);
      rowEls[s] = row;
    }
  }

  function openSwap(row, slot) {
    row.innerHTML = '';
    const lab = el('span', SLOT_LABELS[slot]);
    css(lab, { width: '110px', color: '#9aa3b8', flexShrink: '0' });
    row.appendChild(lab);
    const sel = document.createElement('select');
    css(sel, { flex: '1', padding: '6px', borderRadius: '6px', background: '#232838', color: '#e8ecf4', border: '1px solid #3a4157', fontSize: '13px' });
    const k = curKit();
    const cap = moveCap(cls());

    const addOpt = (move, tag) => {
      const o = document.createElement('option');
      const eff = isNative(move) ? 0 : taxedCost(move, cls());
      const taxNote = !isNative(move) && classTax(cls(), move) > 1 ? ' (taxed)' : '';
      const capNote = !isNative(move) && eff > cap ? ' — OVER CAP' : '';
      o.value = move.id;
      o.textContent = `${move.name} — ${isNative(move) ? 'native, free' : fmt(eff) + ' pts' + taxNote}${capNote} ${tag}`;
      if (k[slot].id === move.id) o.selected = true;
      sel.appendChild(o);
      return o;
    };

    // native option first (the "drop" path)
    addOpt(nativeMoves()[slot], '(native)');
    const grp = document.createElement('optgroup');
    grp.label = FIGHTER_DEFS[otherFor(defId)].name + ' moves';
    for (const s of SLOTS) grp.appendChild(addOpt(MOVES[otherFor(defId)][s], ''));
    sel.appendChild(grp);
    row.appendChild(sel);

    const okBtn = el('button', 'Equip');
    css(okBtn, { padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '12px' });
    const cancelBtn = el('button', 'Cancel');
    css(cancelBtn, { padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid #3a4157', background: '#232838', color: '#e8ecf4', fontSize: '12px' });
    cancelBtn.onclick = () => renderAll();
    okBtn.onclick = () => {
      const picked = findMoveOption(sel.value);
      if (!picked) { renderAll(); return; }
      const next = curKit();
      next[slot] = picked;
      const stolen = {};
      for (const s of SLOTS) {
        const mm = next[s];
        if (!(typeof mm.id === 'string' && mm.id.indexOf(defId + '_') === 0)) stolen[s] = mm;
      }
      const v = validateKit(stolen, cls());
      if (!v.ok) {
        const parts = [];
        if (v.overBy > 0) {
          const dropName = moveNameById(v.priciestTaxedId);
          const dropCost = stolen[Object.keys(stolen).find((s) => stolen[s].id === v.priciestTaxedId)];
          parts.push(`over budget by ${fmt(v.overBy)} pts — drop "${dropName}"${dropCost ? ` (${fmt(taxedCost(dropCost, cls()))} pts)` : ''} to fit.`);
        }
        for (const vid of v.capViolations) {
          parts.push(`"${moveNameById(vid)}" breaks the per-move cap (${fmt(cap)} pts max).`);
        }
        say('Blocked: ' + parts.join(' '));
        return;
      }
      kit = next;
      saveJSON('smashvr_kit_' + defId, kit);
      document.dispatchEvent(new CustomEvent('smashvr-kit', { detail: { defId } }));
      say(`Equipped "${picked.name}".`, true);
      renderAll();
    };
    row.appendChild(okBtn);
    row.appendChild(cancelBtn);
  }

  function findMoveOption(id) {
    for (const s of SLOTS) {
      if (MOVES[defId][s].id === id) return MOVES[defId][s];
      if (MOVES[otherFor(defId)][s].id === id) return MOVES[otherFor(defId)][s];
    }
    return null;
  }

  function switchDef(d) {
    defId = d;
    kit = loadJSON('smashvr_kit_' + defId, null) || null;
    theme = loadJSON('smashvr_theme_' + defId, null) || { ...FIGHTER_DEFS[defId].theme };
    primaryPicker.value = theme.primary;
    secondaryPicker.value = theme.secondary;
    rebuildPreview();
    say('');
    renderAll();
  }

  // init
  rebuildPreview();
  renderAll();
  (containerEl || document.body).appendChild(overlay);
}
