/* test/_harness.mjs — node harness for engine-level sims (v0.9).
   Stubs window/document/localStorage-free env, resolves the vendored three
   via the root node_modules/three shim, and no-ops WebAudio via a Proxy. */
function dummyAC() {
  const mk = () => new Proxy(function () {}, {
    get(t, p) {
      if (p === 'getChannelData') return () => new Float32Array(44100);
      if (p === Symbol.toPrimitive) return () => 0;
      return mk();
    },
    set() { return true; },
    apply() { return mk(); },
  });
  return mk();
}

globalThis.window = {
  innerWidth: 1280, innerHeight: 800,
  addEventListener() {},
  AudioContext: function () { return dummyAC(); },
  webkitAudioContext: undefined,
};
const canvasStub = () => ({
  width: 0, height: 0, style: {},
  getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(v) {},
  }),
});
globalThis.document = { createElement: canvasStub, getElementById: () => null };

export async function loadEngine() {
  const THREE = await import('three');
  const engine = await import('../js/engine.js');
  return { THREE, ...engine };
}

export function blankScene(THREE) {
  return new THREE.Scene();
}
