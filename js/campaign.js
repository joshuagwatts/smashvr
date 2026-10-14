// js/campaign.js — CLASSIC MODE: 7-stage tournament ladder, challenge stages
// (KO FEST, SURVIVAL), and a phased boss fight. Co-op from day one (1P or 2P
// humans share the clear condition). Pure logic + localStorage — the engine
// only exposes its v0.10 hooks (slot mods, addFighter, onTick/onKO/onTimeUp).

// ---------------------------------------------------------------- stages

// Enemy slot configs: { def, mods } — ctrl/team are assigned by the manager.
const FEST_RONIN = {
  def: 'ronin',
  mods: { stocks: 1, weightMul: 0.85, kbTakenMul: 1.25, name: 'FEST RONIN', ai: 'rusher' },
};
const WEAK_RONIN = {
  def: 'ronin',
  mods: { stocks: 1, weightMul: 0.8, kbTakenMul: 1.3, kbDealtMul: 0.8, name: 'WILD RONIN', ai: 'rusher' },
};

export const STAGES = [
  {
    id: 'warmup', name: 'WARMUP', type: 'ladder',
    sub: '1v1 vs the CPU — learn the ropes.',
    enemies: [{ def: 'volt', mods: { name: 'VOLT' } }],
  },
  {
    id: 'tiny-terrors', name: 'TINY TERRORS', type: 'ladder',
    sub: 'Two tiny VOLTs. Terrifyingly fast.',
    enemies: [
      { def: 'volt', mods: { scale: 0.7, speedMul: 1.6, weightMul: 0.7, name: 'TINY VOLT', ai: 'rusher' } },
      { def: 'volt', mods: { scale: 0.7, speedMul: 1.6, weightMul: 0.7, name: 'TINY VOLT', ai: 'rusher' } },
    ],
  },
  {
    id: 'ko-fest', name: 'KO FEST', type: 'kofest', target: 10,
    sub: 'Endless weaklings. Knock 10 off the stage!',
    enemies: [FEST_RONIN, FEST_RONIN, FEST_RONIN],
    enemyPool: [FEST_RONIN, FEST_RONIN, FEST_RONIN, FEST_RONIN],
  },
  {
    id: 'odd-couple', name: 'ODD COUPLE', type: 'ladder',
    sub: 'A giant and a camper walk into a bar…',
    enemies: [
      { def: 'ronin', mods: { scale: 1.6, weightMul: 1.9, kbDealtMul: 1.25, name: 'GIANT RONIN', ai: 'rusher' } },
      { def: 'volt', mods: { ai: 'camper', name: 'CAMPER VOLT' } },
    ],
  },
  {
    id: 'survival', name: 'SURVIVAL', type: 'survival', time: 180,
    sub: 'Endless enemies for 3 minutes. Don’t die.',
    enemies: [WEAK_RONIN, WEAK_RONIN, WEAK_RONIN],
    enemyPool: [WEAK_RONIN, WEAK_RONIN, WEAK_RONIN, WEAK_RONIN],
  },
  {
    id: 'last-stand', name: 'LAST STAND', type: 'ladder',
    sub: 'You and an ally vs three. Hold the line.',
    ally: { def: 'volt', mods: { name: 'ALLY VOLT' } },
    enemies: [
      { def: 'ronin', mods: { name: 'RONIN' } },
      { def: 'ronin', mods: { name: 'RONIN', ai: 'rusher' } },
      { def: 'volt', mods: { name: 'VOLT', ai: 'camper' } },
    ],
  },
  {
    id: 'wisp-king', name: 'WISP KING', type: 'boss',
    sub: 'It has three moods. All of them bad.',
    enemies: [
      {
        def: 'wisp',
        mods: {
          scale: 2.5, weightMul: 2.4, kbDealtMul: 1.4, kbTakenMul: 1.1,
          stocks: 1, name: 'WISP KING', ai: 'rusher', boss: true,
        },
      },
    ],
  },
];

// ---------------------------------------------------------------- progress

const PKEY = 'smashvr_campaign_v1';

export function loadProgress() {
  try {
    const s = localStorage.getItem(PKEY);
    if (s) {
      const p = JSON.parse(s);
      if (typeof p.unlocked === 'number') return p;
    }
  } catch (e) {}
  return { unlocked: 0, best: {}, completed: false };
}

export function saveProgress(p) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch (e) {}
}

// score: { stocks, time } — more stocks remaining wins, then faster time.
export function recordClear(idx, score) {
  const p = loadProgress();
  p.unlocked = Math.max(p.unlocked, Math.min(STAGES.length - 1, idx + 1));
  const prev = p.best[idx];
  if (!prev || score.stocks > prev.stocks ||
      (score.stocks === prev.stocks && score.time < prev.time)) {
    p.best[idx] = score;
  }
  if (idx === STAGES.length - 1) p.completed = true;
  saveProgress(p);
  return p;
}

// ---------------------------------------------------------------- manager

export function createCampaignManager(stageIdx, opts = {}) {
  const stage = STAGES[stageIdx];
  if (!stage) throw new Error('createCampaignManager: bad stage ' + stageIdx);
  const {
    p1def = 'ronin', p2def = 'volt', coop = false, announce = null,
    timeOverride = 0,
  } = opts;

  const mgr = {
    stageIdx, stage, coop, p1def, p2def,
    koCount: 0,
    spawnQueue: [],
    bossPhase: 0,
    resolved: null,
    clearScore: null,
    failWhy: '',
    announce,
    _poolIdx: 0,
    _shockCD: 200,
    _survCD: 0,
    _p3buff: false,
    _timeOverride: timeOverride,
    // human-designated slot indices — the "players" even when a test drives
    // them with the CPU.
    _humanSlots: null,

    // ---- slot list for createGame ----
    slots() {
      const L = [{ def: this.p1def, ctrl: 'p1', team: 'red' }];
      if (this.coop) {
        L.push({ def: this.p2def, ctrl: 'p2', team: 'red' });
      } else if (this.stage.ally) {
        L.push({ ...this.stage.ally, ctrl: 'cpu', team: 'red' });
      }
      const n0 = this.stage.type === 'kofest' || this.stage.type === 'survival'
        ? this.stage.enemies.slice(0, 3)
        : this.stage.enemies;
      for (const e of n0) L.push({ def: e.def, ctrl: 'cpu', team: 'blue', mods: e.mods });
      // v0.10: remember which slot indices are the humans (node sims may
      // re-ctrl them to cpu for AI driving; the slot stays the player).
      this._humanSlots = L.map((s, i) => (s.ctrl === 'p1' || s.ctrl === 'p2') ? i : -1)
        .filter((i) => i >= 0);
      return L;
    },

    matchTime() {
      if (this._timeOverride) return this._timeOverride;
      return this.stage.type === 'survival' ? this.stage.time : 0;
    },

    humansAlive(game) {
      const hs = this._humanSlots || [];
      return game.fighters.some((f) => hs.includes(f.slot) && f.stocks > 0);
    },

    liveEnemies(game) {
      return game.fighters.filter(
        (f) => f.team === 'blue' && f.stocks > 0 && f.state !== 'dead');
    },

    // ---- engine hooks ----
    onTick(game) {
      if (this.resolved || game.state !== 'fight') return;
      const t = this.stage.type;
      if (t === 'kofest' || t === 'survival') this.spawnerTick(game);
      if (t === 'boss') this.bossTick(game);
      if (!this.humansAlive(game)) this.fail(game, 'your team was wiped out');
    },

    onKO(game, f) {
      if (this.resolved || f.team !== 'blue') return;
      const t = this.stage.type;
      if (t === 'kofest') {
        this.koCount++;
        if (this.koCount >= this.stage.target) { this.clear(game); return; }
        // never let blue fully die before the target — checkWin would end it
        if (this.liveEnemies(game).length === 0) {
          this.spawnEnemy(game); this.spawnEnemy(game);
        } else {
          this.spawnQueue.push(50);
        }
      } else if (t === 'survival') {
        this.spawnQueue.push(70);
      }
    },

    onTimeUp(game) {
      // survival: the clock is the boss — alive at 0:00 = clear
      if (this.humansAlive(game)) this.clear(game);
      else this.fail(game, 'time up with nobody standing');
    },

    // ---- spawners ----
    spawnerTick(game) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        if (--this.spawnQueue[i] <= 0) {
          this.spawnQueue.splice(i, 1);
          this.spawnEnemy(game);
        }
      }
      if (this.stage.type === 'survival') {
        if (--this._survCD <= 0) {
          this._survCD = 100;
          if (this.liveEnemies(game).length < 3) this.spawnEnemy(game);
        }
      }
    },

    spawnEnemy(game) {
      const pool = this.stage.enemyPool || this.stage.enemies;
      const cfg = pool[this._poolIdx++ % pool.length];
      return game.addFighter({
        def: cfg.def, ctrl: 'cpu', team: 'blue', mods: cfg.mods,
        x: Math.random() * 8 - 4,
      });
    },

    // ---- boss brain ----
    bossTick(game) {
      const boss = game.fighters.find((f) => f._isBoss);
      if (!boss || boss.state === 'dead') return;
      const phase = boss.percent >= 120 ? 3 : boss.percent >= 60 ? 2 : 1;
      if (phase !== this.bossPhase) {
        this.bossPhase = phase;
        if (this.announce) {
          this.announce(phase === 2 ? 'WISP KING — PHASE 2' : 'WISP KING — FINAL PHASE');
        }
        if (phase === 3 && !this._p3buff) {
          this._p3buff = true;
          boss._aiPersonality = 'spammer';
          boss.runSpeed *= 1.25; boss.airSpeed *= 1.25;
        }
        if (boss.onGround) {
          game.spawnShockwave(boss, 1); game.spawnShockwave(boss, -1);
        }
      }
      // super armor: phase 3 always; otherwise only mid-smash
      boss._superArmor = phase >= 3 ||
        (boss.state === 'attack' && !!boss.moveId && boss.moveId.includes('smash'));
      // shockwave stomps
      if (boss.onGround && boss.state !== 'respawn') {
        if (--this._shockCD <= 0) {
          this._shockCD = phase >= 3 ? 150 : 260;
          game.spawnShockwave(boss, 1); game.spawnShockwave(boss, -1);
        }
      }
    },

    // ---- resolution ----
    clear(game) {
      if (this.resolved) return;
      this.resolved = 'clear';
      const hs = this._humanSlots || [];
      const humans = game.fighters.filter((f) => hs.includes(f.slot));
      const stocks = humans.length ? Math.min(...humans.map((f) => f.stocks)) : 0;
      this.clearScore = { stocks: Math.max(0, stocks), time: game._tick };
      game.finish({
        winner: { name: 'YOU' }, reason: 'campaign-clear',
        campaign: { clear: true, stage: this.stageIdx, score: this.clearScore },
      });
    },

    fail(game, why) {
      if (this.resolved) return;
      this.resolved = 'fail';
      this.failWhy = why;
      game.finish({
        winner: { name: 'CPU' }, reason: 'campaign-fail',
        campaign: { clear: false, stage: this.stageIdx, why },
      });
    },

    // main.js calls this from onEnd — unifies manager-resolved and
    // engine-resolved (ladder checkWin / default timeUp) endings.
    resolveEnd(game, result) {
      if (result && result.campaign) {
        return {
          clear: !!result.campaign.clear,
          score: result.campaign.score || null,
          why: result.campaign.why || '',
        };
      }
      const w = (result && result.winner) || {};
      if (w.team === 'red') {
        const hs = this._humanSlots || [];
        const humans = game.fighters.filter((f) => hs.includes(f.slot));
        const stocks = humans.length ? Math.min(...humans.map((f) => f.stocks)) : 0;
        this.resolved = 'clear';
        this.clearScore = { stocks: Math.max(0, stocks), time: game._tick };
        return { clear: true, score: this.clearScore, why: '' };
      }
      this.resolved = 'fail';
      return { clear: false, score: null, why: 'defeated' };
    },

    // ---- HUD extras (main.js renders) ----
    hudExtra(game) {
      if (this.stage.type === 'kofest') {
        return { kind: 'kofest', count: this.koCount, target: this.stage.target };
      }
      if (this.stage.type === 'boss') {
        const boss = game.fighters.find((f) => f._isBoss);
        if (boss && boss.state !== 'dead') {
          return {
            kind: 'boss', name: boss.name,
            pct: Math.floor(boss.percent), phase: this.bossPhase,
          };
        }
      }
      return null;
    },
  };
  return mgr;
}
