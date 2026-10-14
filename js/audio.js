// js/audio.js — WebAudio synth SFX for SMASHVR. No audio files.
// Call sfx.ensure() from a user gesture before playing anything.

let ctx = null;
let master = null;
let noiseBuf = null;
// v0.3 charged-smash tone: one persistent osc whose pitch tracks charge
let chargeOsc = null;
let chargeGain = null;

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

function envFast(g, t, peak, dur, attack = 0.002) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// v0.4: ultra-short highpassed click — the "snap" transient of a hit.
function click({ dur = 0.05, vol = 0.5, freq = 3200, delay = 0 }) {
  const c = ac();
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = freq;
  const g = c.createGain();
  envFast(g, t, vol, dur, 0.002);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur + 0.05);
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

  // v0.4: rebuilt for punch — 2ms snap transient + noise body + fast-dropping
  // sine thump, all scaled by power01. Sharper attack, more thump on big hits.
  hit(power01 = 0.5) {
    const p = Math.max(0, Math.min(1, power01));
    click({ dur: 0.045, vol: 0.35 + p * 0.45, freq: 2800 + p * 2000 });
    noise({ dur: 0.10, vol: 0.25 + p * 0.40, freq: 900 + p * 1600, type: 'lowpass' });
    tone({ f0: 170 + p * 130, f1: 42, dur: 0.20 + p * 0.06, type: 'sine', vol: 0.40 + p * 0.45 });
  },

  whiff() {
    noise({ dur: 0.09, vol: 0.12, freq: 2500, type: 'bandpass', q: 2 });
  },

  // v0.4: bigger KO boom — sub drop + rumble + crack tail.
  ko() {
    click({ dur: 0.06, vol: 0.70, freq: 2200 });
    tone({ f0: 95, f1: 26, dur: 0.85, type: 'sine', vol: 0.75 });
    noise({ dur: 0.55, vol: 0.50, freq: 420, type: 'lowpass' });
    tone({ f0: 1400, f1: 180, dur: 0.25, type: 'sawtooth', vol: 0.12 });
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

  // v0.3 parry: bright metallic "ting", distinct from shieldHit
  parry() {
    tone({ f0: 1500, f1: 2300, dur: 0.12, type: 'triangle', vol: 0.28 });
    noise({ dur: 0.08, vol: 0.18, freq: 6500, type: 'highpass' });
    tone({ f0: 750, f1: 1150, dur: 0.1, type: 'sine', vol: 0.15, delay: 0.02 });
  },

  // v0.3 charged smash: persistent tone, pitch rises with charge 0..1
  chargeStart() {
    try {
      const c = ac();
      this.chargeStop();
      chargeOsc = c.createOscillator();
      chargeGain = c.createGain();
      chargeOsc.type = 'sawtooth';
      chargeOsc.frequency.value = 110;
      chargeGain.gain.value = 0.0001;
      chargeOsc.connect(chargeGain);
      chargeGain.connect(master);
      chargeOsc.start();
      chargeGain.gain.setTargetAtTime(0.055, c.currentTime, 0.06);
    } catch (e) { /* audio unavailable — game still runs */ }
  },

  chargeSet(u01) {
    try {
      if (!chargeOsc || !ctx) return;
      const u = Math.max(0, Math.min(1, u01));
      chargeOsc.frequency.setTargetAtTime(110 + u * 440, ctx.currentTime, 0.03);
    } catch (e) { /* ignore */ }
  },

  chargeStop() {
    try {
      if (chargeOsc && ctx) {
        const o = chargeOsc, g = chargeGain;
        chargeOsc = null; chargeGain = null;
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.03);
        o.stop(ctx.currentTime + 0.15);
      }
    } catch (e) { /* ignore */ }
  },
};
