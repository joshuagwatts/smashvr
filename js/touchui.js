// js/touchui.js — v0.26: retro handheld-console mobile mode.
// Touch devices get two switchable presentations (persisted):
//   'console' — the game sits in the screen of a Game Boy Micro-style body;
//               analog stick (left) + round action buttons (right) live on
//               the body. Default on touch devices.
//   'full'    — canvas fills the viewport; the same stick + buttons float
//               over it semi-transparent, fading lower while untouched.
// Desktop (no coarse pointer) never initializes: no DOM, no behavior change.
//
// Input: the stick/buttons write P1's keyboard codes into Input.virtual, so
// engine.readHuman() and netplay sampling consume them exactly like keys.
// The engine's input contract is digital (keyboard is digital too), so the
// stick quantizes its analog vector to direction booleans with a deadzone
// and hysteresis — the vector itself stays analog (nub tracking, magnitude).
import { Input } from './input.js?v=34';

export const STICK_DEADZONE = 0.18;
const DIR_ON = 0.38;   // axis magnitude that turns a direction on
const DIR_OFF = 0.26;  // ...and off (hysteresis band prevents flicker)

// Pure mapping: analog stick vector (x right+, y down+, magnitude <= 1) ->
// direction booleans. `prev` carries the previous booleans for hysteresis.
// Exported for test/touch_input.mjs.
export function stickToDirs(x, y, prev = {}) {
  const mag = Math.hypot(x, y);
  if (mag < STICK_DEADZONE) return { left: false, right: false, up: false, down: false };
  const on = (v, was) => (was ? Math.abs(v) > DIR_OFF : Math.abs(v) > DIR_ON);
  return {
    left: x < 0 && on(x, prev.left),
    right: x > 0 && on(x, prev.right),
    up: y < 0 && on(y, prev.up),
    down: y > 0 && on(y, prev.down),
  };
}

const LS_KEY = 'smashvr.mobileMode';
const P1 = () => Input.map[1];

export const TouchUI = {
  active: false,
  mode: 'console', // 'console' | 'full'
  _slot: null,
  _stickDirs: { left: false, right: false, up: false, down: false },

  isTouchDevice() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || 'ontouchstart' in window;
  },

  // Size the renderer should use: the console screen rect in console mode,
  // null (= window size) otherwise.
  viewportSize() {
    if (!this.active || this.mode !== 'console' || !this._slot) return null;
    const r = this._slot.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return null;
    return { w: Math.round(r.width), h: Math.round(r.height) };
  },

  init() {
    if (this.active || !this.isTouchDevice()) return;
    this.active = true;
    try { this.mode = localStorage.getItem(LS_KEY) === 'full' ? 'full' : 'console'; }
    catch { this.mode = 'console'; }
    this._buildDom();
    this._applyMode(false);
    window.addEventListener('resize', () => { if (!this._notifying) this._layout(); });
    window.addEventListener('orientationchange', () => setTimeout(() => this._layout(), 60));
    if (this._slot && 'ResizeObserver' in window) {
      new ResizeObserver(() => this._layout()).observe(this._slot);
    }
    this._layout();
  },

  setMode(mode) {
    if (!this.active || mode === this.mode) return;
    this.mode = mode;
    try { localStorage.setItem(LS_KEY, mode); } catch { /* private mode */ }
    this._applyMode(true);
  },

  _applyMode(userGesture) {
    const b = document.body;
    b.classList.toggle('touch-ui', true);
    b.classList.toggle('mode-console', this.mode === 'console');
    b.classList.toggle('mode-full', this.mode === 'full');
    this._mountControls();
    if (userGesture) {
      if (this.mode === 'full') {
        const p = document.documentElement.requestFullscreen?.();
        if (p && p.catch) p.catch(() => { /* fallback: CSS fullscreen */ });
      } else if (document.fullscreenElement) {
        const p = document.exitFullscreen?.();
        if (p && p.catch) p.catch(() => {});
      }
    }
    this._clearInputs();
    this._pokeIdle();
    // layout after the class flip has taken effect
    requestAnimationFrame(() => this._layout());
  },

  _notifyResize() {
    if (this._notifying) return;
    this._notifying = true;
    window.dispatchEvent(new Event('resize'));
    this._notifying = false;
  },

  _layout() {
    if (!this.active) return;
    const game = document.getElementById('game');
    const glass = document.getElementById('screen-glass');
    const root = document.documentElement;
    if (this.mode === 'console' && this._slot) {
      const r = this._slot.getBoundingClientRect();
      if (r.width >= 40 && r.height >= 40) {
        for (const el of [game, glass]) {
          if (!el) continue;
          el.style.left = r.left + 'px';
          el.style.top = r.top + 'px';
          el.style.width = r.width + 'px';
          el.style.height = r.height + 'px';
        }
        root.style.setProperty('--vx', r.left + 'px');
        root.style.setProperty('--vy', r.top + 'px');
        root.style.setProperty('--vw', r.width + 'px');
        root.style.setProperty('--vh', r.height + 'px');
        this._notifyResize();
        return;
      }
    }
    // full mode / fallback: canvas covers the viewport again
    for (const el of [game, glass]) {
      if (!el) continue;
      el.style.left = ''; el.style.top = ''; el.style.width = ''; el.style.height = '';
    }
    root.style.setProperty('--vx', '0px');
    root.style.setProperty('--vy', '0px');
    root.style.setProperty('--vw', '100vw');
    root.style.setProperty('--vh', '100vh');
    this._notifyResize();
  },

  // ------------------------------------------------------------ DOM

  _buildDom() {
    const mk = (html) => {
      const t = document.createElement('template');
      t.innerHTML = html.trim();
      return t.content.firstElementChild;
    };

    // ---- console shell (screen bezel + decks are mount points) ----
    const shell = mk(`
    <div id="console" aria-hidden="true">
      <div id="console-top">
        <span class="power"><span class="led"></span>POWER</span>
        <span class="brand">SMASH&#8202;BOY <em>micro</em></span>
        <button id="btn-expand" class="chrome-btn" title="Fullscreen">&#x26F6; FULL</button>
      </div>
      <div id="console-main">
        <div class="deck deck-left"></div>
        <div id="bezel"><div id="screen-slot"></div></div>
        <div class="deck deck-right"></div>
      </div>
      <div id="console-bottom">
        <span class="grille">${'<i></i>'.repeat(12)}</span>
        <span class="pills-mount"></span>
        <span class="grille">${'<i></i>'.repeat(12)}</span>
      </div>
    </div>`);
    document.body.appendChild(shell);
    this._slot = shell.querySelector('#screen-slot');

    // glass overlay: gloss + inset shadow over the canvas, follows the slot
    const glass = mk('<div id="screen-glass"></div>');
    document.body.appendChild(glass);

    // ---- floating overlay for fullscreen mode ----
    const overlay = mk(`
    <div id="touch-overlay">
      <div class="ov-left"></div>
      <div class="ov-right"></div>
      <div class="ov-top">
        <span class="pills-mount"></span>
        <button id="btn-shrink" class="chrome-btn ghost-btn" title="Console mode">&#x26F6; CONSOLE</button>
      </div>
    </div>`);
    document.body.appendChild(overlay);

    // ---- the controls themselves (re-parented per mode) ----
    this._stick = mk(`
    <div class="stick-wrap">
      <div id="stick-base"><div id="stick-nub"></div></div>
      <div class="ctl-label">MOVE</div>
    </div>`);
    this._buttons = mk(`
    <div class="btn-cluster">
      <div class="diamond">
        <button class="abtn y" data-act="jump">Y</button>
        <button class="abtn x" data-act="smash">X</button>
        <button class="abtn a" data-act="attack">A</button>
        <button class="abtn b" data-act="special">B</button>
      </div>
      <button class="abtn shield" data-act="shield">SHIELD</button>
    </div>`);
    this._pills = mk(`
    <span class="pills">
      <button class="pill" id="pill-select">SELECT</button>
      <button class="pill" id="pill-start">START</button>
    </span>`);

    shell.querySelector('#btn-expand').addEventListener('click', () => this.setMode('full'));
    overlay.querySelector('#btn-shrink').addEventListener('click', () => this.setMode('console'));
    this._pills.querySelector('#pill-select').addEventListener('click',
      () => this.setMode(this.mode === 'console' ? 'full' : 'console'));
    this._pills.querySelector('#pill-start').addEventListener('click', () => {
      // main.js owns pause (Escape/KeyP keydown when a fight is live)
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    });

    this._wireStick(this._stick.querySelector('#stick-base'), this._stick.querySelector('#stick-nub'));
    this._wireButtons(this._buttons);
    for (const rootEl of [shell, overlay]) {
      rootEl.addEventListener('touchstart', (e) => { if (e.target.closest('.stick-wrap,.btn-cluster,.pills,.chrome-btn')) e.preventDefault(); }, { passive: false });
      rootEl.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    const poke = () => this._pokeIdle();
    window.addEventListener('pointerdown', poke, true);
  },

  _mountControls() {
    if (this.mode === 'console') {
      document.querySelector('#console .deck-left').appendChild(this._stick);
      document.querySelector('#console .deck-right').appendChild(this._buttons);
      document.querySelector('#console .pills-mount').appendChild(this._pills);
    } else {
      document.querySelector('#touch-overlay .ov-left').appendChild(this._stick);
      document.querySelector('#touch-overlay .ov-right').appendChild(this._buttons);
      document.querySelector('#touch-overlay .ov-top .pills-mount').appendChild(this._pills);
    }
  },

  // fullscreen overlays fade while untouched, come back on any touch
  _pokeIdle() {
    if (!this.active) return;
    document.body.classList.remove('ctl-idle');
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => document.body.classList.add('ctl-idle'), 2600);
  },

  _clearInputs() {
    const m = P1();
    for (const code of Object.values(m)) Input.setVirtual(code, false);
    this._stickDirs = { left: false, right: false, up: false, down: false };
  },

  // ------------------------------------------------------------ stick

  _wireStick(base, nub) {
    let pid = null;
    const setDirs = (x, y) => {
      const d = stickToDirs(x, y, this._stickDirs);
      this._stickDirs = d;
      const m = P1();
      Input.setVirtual(m.left, d.left);
      Input.setVirtual(m.right, d.right);
      Input.setVirtual(m.down, d.down);
      Input.setVirtual(m.jump, d.up); // W doubles as up-direction and jump
    };
    const handle = (e) => {
      const r = base.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      let dx = (e.clientX - cx) / (r.width / 2);
      let dy = (e.clientY - cy) / (r.height / 2);
      const mag = Math.hypot(dx, dy);
      if (mag > 1) { dx /= mag; dy /= mag; }
      const travel = r.width / 2 - nub.offsetWidth / 2 - 4;
      nub.style.transform = `translate(calc(-50% + ${dx * travel}px), calc(-50% + ${dy * travel}px))`;
      setDirs(dx, dy);
    };
    const release = () => {
      pid = null;
      nub.style.transform = 'translate(-50%, -50%)';
      setDirs(0, 0);
    };
    base.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pid = e.pointerId;
      base.setPointerCapture(pid);
      base.classList.add('on');
      handle(e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === pid) handle(e); });
    const up = (e) => { if (e.pointerId === pid) { base.classList.remove('on'); release(); } };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
  },

  // ------------------------------------------------------------ buttons

  _wireButtons(cluster) {
    const ACT = {
      attack: () => P1().attack, special: () => P1().special,
      smash: () => P1().smash, shield: () => P1().shield,
      jump: () => P1().jump,
    };
    cluster.querySelectorAll('.abtn').forEach((btn) => {
      const code = ACT[btn.dataset.act]();
      const pointers = new Set();
      const sync = () => {
        Input.setVirtual(code, pointers.size > 0);
        btn.classList.toggle('on', pointers.size > 0);
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        pointers.add(e.pointerId);
        btn.setPointerCapture(e.pointerId);
        sync();
      });
      const off = (e) => { if (pointers.delete(e.pointerId)) sync(); };
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off);
    });
  },
};
