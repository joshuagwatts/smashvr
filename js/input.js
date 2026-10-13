// js/input.js — keyboard state with per-player maps and edge detection.
// Edges (pressed this frame) are latched on keydown and cleared by endFrame(),
// which the main loop calls once per rendered frame after game.update().

const P1 = {
  left: 'KeyA', right: 'KeyD', jump: 'KeyW', down: 'KeyS',
  attack: 'KeyJ', smash: 'KeyK', special: 'KeyL', shield: 'Space',
};
const P2 = {
  left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', down: 'ArrowDown',
  attack: 'Numpad1', special: 'Numpad2', smash: 'Numpad3', shield: 'Numpad0',
};

const GAME_CODES = new Set([...Object.values(P1), ...Object.values(P2)]);

export const Input = {
  map: { 1: P1, 2: P2 },
  keys: Object.create(null),    // code -> true while held
  pressed: Object.create(null), // code -> true if pressed since last endFrame()
  _inited: false,

  init() {
    if (this._inited) return;
    this._inited = true;
    window.addEventListener('keydown', (e) => {
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.pressed[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    // Don't leave keys stuck if the window loses focus mid-fight.
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.pressed = Object.create(null);
    });
  },

  down(code) { return !!this.keys[code]; },

  // edge: true only on the frame the key went down
  pressedEdge(code) { return !!this.pressed[code]; },

  // -1 | 0 | 1 horizontal axis for a player
  axis(player) {
    const m = this.map[player];
    return (this.down(m.right) ? 1 : 0) - (this.down(m.left) ? 1 : 0);
  },

  // call once per rendered frame, after the game has consumed input
  endFrame() { this.pressed = Object.create(null); },
};

// Contract-friendly accessor: { held(code), pressedEdge(code) }
export function makeInput() {
  return {
    held: (code) => Input.down(code),
    pressedEdge: (code) => Input.pressedEdge(code),
  };
}
