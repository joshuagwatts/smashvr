// js/touchui.js — v0.26: retro handheld-console mobile mode.
// Touch devices get two switchable presentations (persisted):
//   'console' — the game sits in the screen of a Game Boy Micro-style body;
//               analog stick (left) + round action buttons (right) live on
//               the body. Default on touch devices.
//   'full'    — canvas fills the viewport; the same stick + buttons float
//               over it semi-transparent, fading lower while untouched.
// Desktop (no coarse pointer) never initializes: no DOM, no behavior change.
//
// Layout: CSS-first. #screen-slot's 16:9 box is pure CSS (aspect-ratio +
// container units in style.css) and #game is reparented inside the slot
// in console mode, so first paint is correct BY CONSTRUCTION — no
// resize/visualViewport/ResizeObserver event is load-bearing (Brave on
// Android delivers those late or effectively never, and its farbling
// perturbs devicePixelRatio/screen metrics; all layout math here is CSS
// px, DPR is used nowhere in this file). JS only syncs what CSS cannot:
// the canvas buffer size and the gloss/HUD placement, via change-gated
// _layout() passes driven by a short boot-window rAF loop + event kicks.
//
// Input: the stick/buttons write P1's keyboard codes into Input.virtual, so
// engine.readHuman() and netplay sampling consume them exactly like keys.
// The engine's input contract is digital (keyboard is digital too), so the
// stick quantizes its analog vector to direction booleans with a deadzone
// and hysteresis — the vector itself stays analog (nub tracking, magnitude).
import { Input } from './input.js?v=50';

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
  _lastVSig: null,   // last published visual rect (gloss/HUD placement)
  _lastBufSig: null, // last buffer size notified to the renderer
  _bootLoopOn: false,

  isTouchDevice() {
    return (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || 'ontouchstart' in window;
  },

  // Size the renderer should use: the console screen size in console
  // mode, null (= window size) otherwise. Layout px only: offsetWidth/
  // offsetHeight are immune to the console's fit-scale transform and to
  // devicePixelRatio, and the slot is CSS-sized, so this is correct at
  // first paint even if no resize event ever fires.
  viewportSize() {
    if (!this.active || this.mode !== 'console' || !this._slot) return null;
    const w = this._slot.offsetWidth, h = this._slot.offsetHeight;
    if (w < 40 || h < 40) return null;
    return { w, h };
  },

  init() {
    if (this.active || !this.isTouchDevice()) return;
    this.active = true;
    try { this.mode = localStorage.getItem(LS_KEY) === 'full' ? 'full' : 'console'; }
    catch { this.mode = 'console'; }
    this._buildDom();
    this._applyMode(false);
    // Geometry is CSS-first now (see the header note): the slot is right
    // at first paint even if none of these ever fire. The listeners, the
    // ResizeObserver and the boot-window rAF loop (see _kickRelayout) are
    // a safety net that only re-syncs the canvas buffer + gloss/HUD when
    // measurements actually change — they refine, they never originate.
    const kick = () => this._kickRelayout();
    window.addEventListener('resize', kick);
    window.addEventListener('orientationchange', kick);
    window.addEventListener('fullscreenchange', kick);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', kick);
    }
    window.addEventListener('load', kick);
    window.addEventListener('pointerdown', kick, true); // first touch re-asserts
    if (this._slot && 'ResizeObserver' in window) {
      try {
        const ro = new ResizeObserver(kick);
        ro.observe(this._slot);
        if (this._slot.parentElement) ro.observe(this._slot.parentElement); // #bezel
      } catch { /* RO is a safety net only — never load-bearing */ }
    }
    this._kickRelayout();
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
    this._mountGame();
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
    requestAnimationFrame(() => this._kickRelayout());
  },

  // #game lives inside #screen-slot in console mode (CSS pins it to the
  // slot's box — see style.css) and back at its original <body> spot in
  // full mode, where its base fixed/inset:0 rules make it the viewport.
  _mountGame() {
    const game = document.getElementById('game');
    if (!game) return;
    if (this.mode === 'console') {
      if (this._slot && game.parentElement !== this._slot) this._slot.appendChild(game);
    } else if (game.parentElement !== document.body) {
      document.body.insertBefore(game, document.getElementById('dmg-layer'));
    }
  },

  // One reconciliation pass + (re)start the boot-window loop. The loop
  // re-asserts layout every frame until measurements are stable for 30
  // consecutive frames (and at least 500ms in), then self-terminates;
  // hard cap ~3s. It exists for engines/browsers whose viewport metrics
  // settle late WITHOUT firing events — under the CSS it changes
  // nothing when geometry is already right (passes are change-gated).
  _kickRelayout() {
    if (!this.active || this._notifying) return;
    this._layout();
    if (this._bootLoopOn) return;
    this._bootLoopOn = true;
    const t0 = performance.now();
    let last = this._layoutSig(), stable = 0;
    const step = () => {
      if (!this.active) { this._bootLoopOn = false; return; }
      this._layout();
      const sig = this._layoutSig();
      if (sig === last) stable++; else { stable = 0; last = sig; }
      const dt = performance.now() - t0;
      if ((stable >= 30 && dt > 500) || dt > 3000) { this._bootLoopOn = false; return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  },

  _layoutSig() {
    if (!this._slot) return this.mode;
    const r = this._slot.getBoundingClientRect();
    return [this.mode, this._slot.offsetWidth, this._slot.offsetHeight,
      Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height),
      window.innerWidth, window.innerHeight].join('|');
  },

  _notifyResize() {
    if (this._notifying) return;
    this._notifying = true;
    window.dispatchEvent(new Event('resize'));
    this._notifying = false;
  },

  // CSS owns the slot's geometry and #game's placement inside it. This
  // pass only syncs what CSS cannot express: the gloss overlay's fixed
  // position, the --v* HUD vars, and (via _notifyResize) the renderer's
  // buffer size. Every write is change-gated, so repeat passes are free
  // and can never fight the CSS or thrash the canvas buffer.
  _layout() {
    if (!this.active) return;
    const glass = document.getElementById('screen-glass');
    const root = document.documentElement;
    if (this.mode === 'console' && this._slot) {
      this._guardSlotAspect();
      this._fitScale();
      const ow = this._slot.offsetWidth, oh = this._slot.offsetHeight;
      if (ow >= 40 && oh >= 40) {
        const r = this._slot.getBoundingClientRect(); // visual rect (post fit-scale)
        if (glass) {
          glass.style.left = r.left + 'px';
          glass.style.top = r.top + 'px';
          glass.style.width = r.width + 'px';
          glass.style.height = r.height + 'px';
        }
        const vSig = Math.round(r.left) + ',' + Math.round(r.top) + ',' +
                     Math.round(r.width) + 'x' + Math.round(r.height);
        if (vSig !== this._lastVSig) {
          this._lastVSig = vSig;
          root.style.setProperty('--vx', r.left + 'px');
          root.style.setProperty('--vy', r.top + 'px');
          root.style.setProperty('--vw', r.width + 'px');
          root.style.setProperty('--vh', r.height + 'px');
        }
        const bSig = ow + 'x' + oh;
        if (bSig !== this._lastBufSig) { this._lastBufSig = bSig; this._notifyResize(); }
        return;
      }
    }
    // full mode / fallback: canvas covers the viewport again (base CSS),
    // any guard-applied inline slot size is released back to CSS.
    if (this._slot) { this._slot.style.width = ''; this._slot.style.height = ''; }
    if (glass) {
      glass.style.left = ''; glass.style.top = '';
      glass.style.width = ''; glass.style.height = '';
    }
    const fSig = 'full:' + window.innerWidth + 'x' + window.innerHeight;
    if (fSig !== this._lastVSig) {
      this._lastVSig = fSig;
      root.style.setProperty('--vx', '0px');
      root.style.setProperty('--vy', '0px');
      root.style.setProperty('--vw', '100vw');
      root.style.setProperty('--vh', '100vh');
    }
    if (this._lastBufSig !== 'full') { this._lastBufSig = 'full'; this._notifyResize(); }
  },

  // CSS sizes the slot (aspect-ratio + container units). This guard only
  // fires on engines WITHOUT container-query units, where the CSS
  // fallback (width:100% + max-height:100%) can distort the box — only
  // then does JS pin the largest 16:9 rect inside the bezel, in layout px
  // (offset* — transform- and DPR-immune). When CSS is doing its job the
  // guard is a no-op and clears any stale inline size back to CSS.
  _guardSlotAspect() {
    const slot = this._slot, bezel = slot && slot.parentElement;
    if (!bezel) return;
    const w = slot.offsetWidth, h = slot.offsetHeight;
    const off = w > 0 && h > 0 && Math.abs(w / h - 16 / 9) > 0.01 * (16 / 9);
    if (!off) {
      if (slot.style.width || slot.style.height) {
        slot.style.width = ''; slot.style.height = '';
      }
      return;
    }
    const bw = Math.max(80, bezel.offsetWidth - 20);  // bezel padding: 10px/side
    const bh = Math.max(80, bezel.offsetHeight - 20);
    let sw = bw, sh = sw * 9 / 16;
    if (sh > bh) { sh = bh; sw = sh * 16 / 9; }
    slot.style.width = Math.round(sw) + 'px';
    slot.style.height = Math.round(sh) + 'px';
  },

  // If a control deck can't fit its content at designed size (very
  // short viewports), shrink the WHOLE console uniformly — like scaling
  // a physical handheld — instead of letting flex crush individual
  // parts. All measurements are layout px (offset*/client*), which the
  // transform itself does not affect; #game rides inside the slot, so
  // the scale can never desync the game from the screen.
  _fitScale() {
    const con = document.getElementById('console');
    if (!con || this.mode !== 'console') return;
    con.style.transform = ''; // re-derive below
    let s = 1;
    const pairs = [
      [document.querySelector('#console .deck-left'), this._stick],
      [document.querySelector('#console .deck-right'), this._buttons],
    ];
    for (const [deck, kid] of pairs) {
      if (!deck || !kid) continue;
      if (deck.clientHeight > 0 && kid.offsetHeight > deck.clientHeight)
        s = Math.min(s, deck.clientHeight / kid.offsetHeight);
      if (deck.clientWidth > 0 && kid.offsetWidth > deck.clientWidth)
        s = Math.min(s, deck.clientWidth / kid.offsetWidth);
    }
    if (s < 0.999) con.style.transform = `scale(${s})`;
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
      // NOTE: preventDefault on touchstart suppresses the click event — the
      // pills and chrome buttons are click-driven, so only the analog
      // controls (pointer-driven) get gesture prevention here.
      rootEl.addEventListener('touchstart', (e) => { if (e.target.closest('.stick-wrap,.btn-cluster')) e.preventDefault(); }, { passive: false });
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
