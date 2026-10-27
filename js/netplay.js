// js/netplay.js — v0.11 online netplay: input-delay lockstep over Trystero P2P.
//
// ARCHITECTURE (6 lines):
// 1. All clients step the SAME deterministic sim (seeded PRNG, fixed seed per
//    match) from the SAME input streams — no state is ever sent during play.
// 2. Input delay: the input you sample now applies 3 ticks out, giving remote
//    inputs 3 ticks (50ms) to arrive before the sim needs them.
// 3. The sim only steps when EVERY player's input for the tick has arrived;
//    a late input shows "waiting" — no rollback, no misprediction.
// 4. Every 60 ticks each client broadcasts a state hash; on mismatch the host
//    broadcasts its authoritative input log and EVERYONE (host included)
//    re-simulates from tick 0 — determinism makes this exact.
// 5. CPU bots run locally on every client from the same seeded stream, so
//    they're identical everywhere with zero bandwidth.
// 6. This VM blocks UDP, so real P2P can't be verified here: the protocol is
//    verified over fake channels (test/netproto.mjs) and the signaling layer
//    is verified as far as headless allows. Two real devices are ground truth.

import { packInput, unpackInput, PACKED_BLANK, lobbyCode } from './rng.js?v=49';
import { TICK, readHuman } from './engine.js?v=49';
import { sfx } from './audio.js?v=49';

export const NET_DELAY = 3;       // input delay, ticks
export const HASH_EVERY = 60;     // state-hash cadence, ticks
export const MAX_HUMANS = 4;      // v1 scope: up to 4 humans + CPU bots
export const APP_ID = 'smashvr-v011';

// ---------------------------------------------------------------- transport
// Thin wrapper over Trystero rooms (dual strategy: torrent + nostr, same as
// LIMBO's proven setup). Every payload carries our per-session cid + seq and
// is deduped — the same human may arrive via both strategies.

/* OpenRelay static-auth (no signup): time-limited HMAC-SHA1 credentials. */
const TURN_HOST = 'staticauth.openrelay.metered.ca';
const TURN_SECRET = 'openrelayprojectsecret';
const TURN_TTL_S = 24 * 3600; // credentials valid 24h

async function makeTurnCreds() {
  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_S;
  const username = `${expiry}:smashvr`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(TURN_SECRET),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(username)
  );
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return { username, password: btoa(bin), expiry };
}

function buildIceServers(creds) {
  return [
    // STUN first (cheap, direct); Trystero's defaults are replaced, so ours
    // must be complete.
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
    // TURN relay for symmetric NATs — UDP then TCP flavors.
    {
      urls: [`turn:${TURN_HOST}:80`, `turn:${TURN_HOST}:443`],
      username: creds.username,
      credential: creds.password,
    },
    {
      urls: `turns:${TURN_HOST}:443`,
      username: creds.username,
      credential: creds.password,
    },
  ];
}

// One rtcConfig per page load (creds live 24h). If WebCrypto is
// unavailable (non-secure context) fall back to Trystero's defaults
// instead of breaking transport creation.
let rtcConfigPromise = null;
export function getRtcConfig() {
  if (!rtcConfigPromise) {
    rtcConfigPromise = makeTurnCreds()
      .then((creds) => ({ iceServers: buildIceServers(creds) }))
      .catch(() => null);
  }
  return rtcConfigPromise;
}

export async function createNetTransport(roomCode, hooks) {
  const { onPeerJoin = () => {}, onPeerLeave = () => {}, onMessage = () => {} } = hooks;
  const cid = Math.random().toString(36).slice(2, 10);
  const seen = new Set();
  let seq = 0;

  const onData = (strategy, data) => {
    if (!data || data.cid === cid) return; // ignore our own echo
    const key = data.cid + ':' + data.seq;
    if (seen.has(key)) return;
    seen.add(key);
    trimSeen();
    onMessage(data.msg, data.cid);
  };

  // trim the dedup window so a long session can't grow it unboundedly
  const trimSeen = () => {
    if (seen.size <= 4000) return;
    const it = seen.values();
    for (let i = 0; i < 2000; i++) {
      const n = it.next();
      if (n.done) break;
      seen.delete(n.value);
    }
  };

  const loads = [
    ['torrent', 'https://esm.sh/@trystero-p2p/torrent@0.25.4'],
    ['nostr', 'https://esm.sh/@trystero-p2p/nostr@0.25.4'],
  ];
  // Nostr relay pinning — LIMBO-verified reliable set for this app shape
  // (the 0.25.4 defaults include flaky relays).
  const NOSTR_RELAYS = ['wss://yabu.me/v2', 'wss://relay02.lnfi.network', 'wss://relay.sigit.io'];
  // v0.28: pass LIMBO's ICE config (STUN + OpenRelay TURN). Without it
  // Trystero's defaults are STUN-only, and two NATted phones (carrier
  // CGNAT especially) can signal fine yet never connect — "codes don't
  // connect". rtcConfig replaces the defaults wholesale in Trystero
  // core, so buildIceServers carries the STUN entries too.
  // v0.30: fetch the TURN creds AND both strategy module graphs in
  // PARALLEL. The old sequential awaits made a cold guest wait the SUM
  // of two esm.sh graph loads (~25s observed) staring at "Joining
  // lobby…" before a single socket opened; now it's the max.
  const rtcConfig = await getRtcConfig();
  const modResults = await Promise.all(loads.map(([name, url]) =>
    import(url).then((mod) => ({ name, mod }), (err) => ({ name, err }))));
  let ok = 0;
  const stratErrs = [];
  const sendFns = [];
  const leaveFns = [];
  const peerIds = new Set(); // strategy peer ids currently joined (any strategy)
  for (const { name, mod, err } of modResults) {
    if (err) { stratErrs.push(name + ':import:' + err.message); continue; }
    if (!mod) continue;
    try {
      // Trystero 0.25.x API: makeAction returns an ACTION OBJECT (not a
      // [send, recv] tuple); room event handlers are property assignments.
      const room = mod.joinRoom(
        { appId: APP_ID, ...(rtcConfig ? { rtcConfig } : {}), ...(name === 'nostr' ? { relayConfig: { urls: NOSTR_RELAYS } } : {}) },
        roomCode
      );
      const action = room.makeAction('sv');
      action.onMessage = (data) => onData(name, data);
      room.onPeerJoin = (p) => { peerIds.add(name + ':' + p); onPeerJoin(p, name); };
      room.onPeerLeave = (p) => { peerIds.delete(name + ':' + p); onPeerLeave(p, name); };
      sendFns.push((env) => action.send(env));
      leaveFns.push(() => { try { room.leave(); } catch (e) {} });
      ok++;
    } catch (e) { stratErrs.push(name + ':room:' + e.message); }
  }
  if (!ok) throw new Error('net offline — signaling unreachable (' + stratErrs.join(' | ') + ')');

  return {
    cid,
    peerCount: () => peerIds.size,
    send(msg) {
      const env = { cid, seq: seq++, msg };
      for (const s of sendFns) { try { s(env); } catch (e) {} }
    },
    leave() { for (const l of leaveFns) l(); },
  };
}

// ---------------------------------------------------------------- NetDriver
// Owns one client's lockstep session: paces game.update, exchanges inputs,
// checks hashes, and heals divergence via authoritative input-log replay.

export class NetDriver {
  constructor(o) {
    this.game = o.game;
    this.myIdx = o.myIdx;               // 0..playerCount-1
    this.playerCount = o.playerCount;   // humans (CPU needs no inputs)
    this.isHost = !!o.isHost;
    this.seed = o.seed;
    this.send = o.send;                 // (msg) -> transport broadcast
    this.sampleLocal = o.sampleLocal;   // () -> packed int
    this.onWaiting = o.onWaiting || (() => {});
    this.onEvent = o.onEvent || (() => {}); // ('resync'|'mismatch'|...)
    // input logs, per player, indexed by 1-based tick. Ticks 1..DELAY
    // pre-filled neutral — the first live inputs apply at tick DELAY+1.
    this.logs = [];
    for (let p = 0; p < this.playerCount; p++) {
      this.logs[p] = [PACKED_BLANK, PACKED_BLANK, PACKED_BLANK, PACKED_BLANK];
    }
    this.hashCache = {};   // tick -> own hash
    this.peerHashes = {};  // tick -> {p: hash}
    this.waiting = false;
    this.mismatchAt = -1;
    this.resyncs = 0;
    this.game._net = this;
  }

  setWaiting(v) {
    if (v === this.waiting) return;
    this.waiting = v;
    this.onWaiting(v);
  }

  // game.update() delegates here in net mode. Returns ticks run.
  pollTicks(game) {
    let n = 0;
    while (n < 5 && game._acc >= TICK) {
      if (game.state !== 'fight') {
        game._acc -= TICK; game.tick(); n++;
        continue;
      }
      const s = game._tick + 1;
      if (!this.beginTick(s)) { this.setWaiting(true); break; }
      this.setWaiting(false);
      game._acc -= TICK;
      game._netInput = this.inputsFor(s);
      game.tick();
      n++;
      this.afterTick(game, s);
    }
    return n;
  }

  // Sample the local input (applies at tick s+DELAY) and check tick s is
  // fully present. Always broadcasts — even while waiting.
  beginTick(s) {
    const mine = this.sampleLocal(s);
    this.logs[this.myIdx][s + NET_DELAY] = mine;
    this.send({ k: 'in', p: this.myIdx, t: s + NET_DELAY, i: mine });
    for (let p = 0; p < this.playerCount; p++) {
      if (this.logs[p][s] === undefined) return false;
    }
    return true;
  }

  inputsFor(s) {
    const out = [];
    for (let p = 0; p < this.playerCount; p++) out.push(unpackInput(this.logs[p][s] ?? PACKED_BLANK));
    return out;
  }

  afterTick(game, s) {
    if (s % HASH_EVERY !== 0) return;
    const h = game.stateHash();
    this.hashCache[s] = h;
    this.send({ k: 'hash', p: this.myIdx, t: s, h });
    this.checkHashes(s);
  }

  onMessage(msg) {
    if (!msg || typeof msg.k !== 'string') return;
    if (msg.k === 'in') {
      if (msg.p >= 0 && msg.p < this.playerCount && Number.isInteger(msg.t) && msg.t > 0) {
        this.logs[msg.p][msg.t] = msg.i;
      }
    } else if (msg.k === 'hash') {
      (this.peerHashes[msg.t] = this.peerHashes[msg.t] || {})[msg.p] = msg.h;
      this.checkHashes(msg.t);
    } else if (msg.k === 'resync') {
      this.applyResync(msg);
    }
  }

  checkHashes(t) {
    const mine = this.hashCache[t];
    if (mine === undefined || t === this.mismatchAt) return;
    const ph = this.peerHashes[t] || {};
    for (let p = 0; p < this.playerCount; p++) {
      if (p === this.myIdx) continue;
      if (ph[p] === undefined) return;   // still waiting on a peer's hash
      if (ph[p] !== mine) { this.onMismatch(t); return; }
    }
    if (t > HASH_EVERY * 2) {
      delete this.hashCache[t - HASH_EVERY * 2];
      delete this.peerHashes[t - HASH_EVERY * 2];
    }
  }

  onMismatch(t) {
    this.mismatchAt = t;
    this.onEvent('mismatch', t);
    if (!this.isHost) return; // guests wait for the host's resync
    // Storm guard: at most one resync per 300 ticks — a tighter loop means
    // a real nondeterminism bug, and infinite resync would stall forever.
    if (this.lastResyncTick !== undefined && t - this.lastResyncTick < 300) return;
    this.lastResyncTick = t;
    this.send({ k: 'resync', seed: this.seed, t, logs: this.logs.map((l) => l.slice()) });
    this.applyResync({ seed: this.seed, t, logs: this.logs });
  }

  // Authoritative heal: reset the sim and re-simulate ticks 1..t from the
  // host's input log. Determinism (test/determinism.mjs) makes this exact.
  // Runs silently — no sfx/HUD/results churn across thousands of ticks.
  applyResync(msg) {
    const game = this.game;
    this.resyncs++;
    this.onEvent('resync', msg.t);
    // v0.11.1: preserve my OWN sampled inputs. The host's snapshot can be
    // missing my most recent ticks (broadcast race: I sampled + sent them,
    // the host hadn't received them when it snapshotted). My own stream is
    // never wrong — only the host's copy can lag — so re-asserting is safe.
    // Without this the client waits forever for its own inputs (deadlock).
    const own = this.logs[this.myIdx] || [];
    game._silent = true;
    sfx.silent = true;
    try {
      game.resetSim(msg.seed);
      let guard = 0;
      while (game._tick < msg.t && guard++ < msg.t + 600) {
        const s = game._tick + 1;
        game._netInput = msg.logs.map((l) => unpackInput(l[s] ?? PACKED_BLANK));
        game.tick();
      }
    } finally {
      game._silent = false;
      sfx.silent = false;
    }
    // adopt the authoritative logs (may be newer/longer than ours)
    this.logs = msg.logs.map((l) => l.slice());
    while (this.logs.length < this.playerCount) this.logs.push([PACKED_BLANK, 0, 0, 0]);
    for (let t = 0; t < own.length; t++) {
      if (own[t] !== undefined) this.logs[this.myIdx][t] = own[t];
    }
    this.hashCache = {};
    this.peerHashes = {};
    this.mismatchAt = -1;
    this.setWaiting(false);
  }
}

// ---------------------------------------------------------------- lobby
// Host-authoritative lobby protocol over the transport. Players are keyed by
// transport cid (dedupes the dual-strategy double-join).

export class Lobby {
  constructor(transport, o) {
    this.t = transport;
    this.isHost = !!o.isHost;
    this.name = o.name || 'Player';
    this.code = o.code;
    this.players = []; // {cid, name, idx, def, ready}
    this.config = { mode: 'ffa', cpus: 1 }; // cpus: CPU bot seats to add
    this.onChange = null;  // () => refresh UI
    this.onStart = null;   // (seed, slots) => begin match
    this.onKicked = null;  // () => kicked by host
  }

  onMsg(msg, cid) {
    if (!msg || typeof msg.k !== 'string') return;
    if (this.isHost) this.hostOnMsg(msg, cid);
    else this.guestOnMsg(msg, cid);
  }

  send(m) { this.t.send(m); }

  broadcast() {
    this.send({ k: 'lobby', players: this.players, config: this.config });
    if (this.onChange) this.onChange();
  }

  myPlayer() { return this.players.find((p) => p.cid === this.t.cid); }

  // ---- host ----
  hostOnMsg(msg, cid) {
    if (msg.k === 'hello') {
      if (!this.players.some((p) => p.cid === cid)) {
        const used = new Set(this.players.map((p) => p.idx));
        let idx = 0;
        while (used.has(idx) && idx < MAX_HUMANS) idx++;
        if (idx >= MAX_HUMANS) return; // lobby full
        this.players.push({ cid, name: String(msg.name || 'Player').slice(0, 16), idx, def: 'ronin', ready: false });
      }
      this.broadcast();
    } else if (msg.k === 'pick') {
      const p = this.players.find((x) => x.cid === cid);
      if (p && ['ronin', 'volt', 'wisp'].includes(msg.def)) { p.def = msg.def; this.broadcast(); }
    } else if (msg.k === 'ready') {
      const p = this.players.find((x) => x.cid === cid);
      if (p) { p.ready = !!msg.ready; this.broadcast(); }
    } else if (msg.k === 'bye') {
      this.players = this.players.filter((x) => x.cid !== cid);
      this.broadcast();
    }
  }

  hostSetConfig(patch) {
    Object.assign(this.config, patch);
    this.config.cpus = Math.max(0, Math.min(7 - this.players.length, this.config.cpus | 0));
    this.broadcast();
  }

  hostKick(idx) {
    const p = this.players.find((x) => x.idx === idx && x.cid !== this.t.cid);
    if (!p) return;
    this.send({ k: 'kicked', idx });
    this.players = this.players.filter((x) => x !== p);
    this.broadcast();
  }

  allReady() {
    return this.players.length >= 1 &&
      this.players.every((p) => p.ready) &&
      this.players.length + this.config.cpus >= 2;
  }

  // Build match slots: humans in idx order, then CPU bots. Teams mode splits
  // red/blue by idx parity.
  buildSlots() {
    const teams = this.config.mode === 'teams';
    const cpuDefs = ['volt', 'ronin', 'wisp', 'volt', 'ronin', 'wisp', 'volt'];
    const slots = [];
    const teamOf = (i) => (teams ? (i % 2 === 0 ? 'red' : 'blue') : null);
    const humans = [...this.players].sort((a, b) => a.idx - b.idx);
    humans.forEach((p, i) => slots.push({ def: p.def, ctrl: 'net' + p.idx, team: teamOf(i), name: p.name }));
    for (let c = 0; c < this.config.cpus && slots.length < 8; c++) {
      slots.push({ def: cpuDefs[c % cpuDefs.length], ctrl: 'cpu', team: teamOf(humans.length + c) });
    }
    return slots;
  }

  hostStart() {
    if (!this.allReady()) return null;
    const seed = (Math.random() * 0x7fffffff) | 0;
    const slots = this.buildSlots();
    this.send({ k: 'start', seed, slots });
    return { seed, slots };
  }

  // ---- guest ----
  guestOnMsg(msg, cid) {
    if (msg.k === 'lobby') {
      this.players = msg.players;
      this.config = msg.config;
      if (this.onChange) this.onChange();
    } else if (msg.k === 'start') {
      if (this.onStart) this.onStart(msg.seed, msg.slots);
    } else if (msg.k === 'kicked' && this.myPlayer() && this.myPlayer().idx === msg.idx) {
      if (this.onKicked) this.onKicked();
    }
  }

  hello() { this.send({ k: 'hello', name: this.name }); }
  // v0.11.1: the host applies its own pick/ready locally — the transport
  // never echoes our own messages back, so without this the host's fighter
  // pick and ready toggle would silently do nothing.
  pick(def) {
    if (this.isHost) {
      const p = this.myPlayer();
      if (p && ['ronin', 'volt', 'wisp'].includes(def)) { p.def = def; this.broadcast(); }
    } else this.send({ k: 'pick', def });
  }
  setReady(r) {
    if (this.isHost) {
      const p = this.myPlayer();
      if (p) { p.ready = !!r; this.broadcast(); }
    } else this.send({ k: 'ready', ready: !!r });
  }
  leave() { this.send({ k: 'bye' }); this.t.leave(); }
}

export { lobbyCode };

// Sample the local keyboard (P1 map) as a packed input int — the net driver's
// per-tick sampler in the browser.
export function sampleLocalInput() {
  return packInput(readHuman(1));
}
