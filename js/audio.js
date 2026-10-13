// js/audio.js — WebAudio synth SFX for SMASHVR. No audio files.
// Call sfx.ensure() from a user gesture before playing anything.

let ctx = null;
let master = null;
let noiseBuf = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

function env(g, t, peak, dur) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

function tone({ f0 = 440, f1 = null, dur = 0.15, type = 'sine', vol = 0.5, delay = 0 }) {
  const c = ac();
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  env(g, t, vol, dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise({ dur = 0.2, vol = 0.5, freq = 1000, q = 1, type = 'lowpass', delay = 0 }) {
  const c = ac();
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, vol, dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur + 0.05);
}

export const sfx = {
  // resume/create the context on first user gesture
  ensure() {
    try {
      const c = ac();
      if (c.state === 'suspended') c.resume();
    } catch (e) { /* audio unavailable — game still runs */ }
  },

  // power01: 0..1, scales pitch + volume
  hit(power01 = 0.5) {
    const p = Math.max(0, Math.min(1, power01));
    const v = 0.25 + p * 0.55;
    noise({ dur: 0.12, vol: v, freq: 900 + p * 1800, type: 'lowpass' });
    tone({ f0: 120 + p * 60, f1: 40, dur: 0.18, type: 'sine', vol: v });
  },

  whiff() {
    noise({ dur: 0.09, vol: 0.12, freq: 2500, type: 'bandpass', q: 2 });
  },

  ko() {
    noise({ dur: 0.7, vol: 0.6, freq: 500, type: 'lowpass' });
    tone({ f0: 200, f1: 30, dur: 0.7, type: 'sine', vol: 0.6 });
    tone({ f0: 1200, f1: 200, dur: 0.3, type: 'sawtooth', vol: 0.15 });
  },

  jump() {
    tone({ f0: 280, f1: 520, dur: 0.12, type: 'square', vol: 0.12 });
  },

  shieldHit() {
    tone({ f0: 750, f1: 600, dur: 0.08, type: 'square', vol: 0.2 });
    noise({ dur: 0.06, vol: 0.15, freq: 4000, type: 'highpass' });
  },

  shieldBreak() {
    tone({ f0: 900, f1: 120, dur: 0.5, type: 'sawtooth', vol: 0.3 });
    noise({ dur: 0.4, vol: 0.3, freq: 3000, type: 'highpass' });
  },

  select() {
    tone({ f0: 660, dur: 0.07, type: 'square', vol: 0.15 });
    tone({ f0: 990, dur: 0.1, type: 'square', vol: 0.15, delay: 0.07 });
  },

  uiMove() {
    tone({ f0: 440, dur: 0.05, type: 'square', vol: 0.08 });
  },

  countdownGo() {
    tone({ f0: 523, dur: 0.12, type: 'square', vol: 0.2 });
    tone({ f0: 784, dur: 0.22, type: 'square', vol: 0.2, delay: 0.1 });
  },
};
