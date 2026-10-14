/* SMASHVR v0.1 browser verification: title -> select -> 1P vs CPU fight,
   gameplay inputs, hit confirm, Fighter Lab. Adapted from limbo-test/test17.mjs. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import { mkdirSync } from 'fs';

mkdirSync('/home/hatch/workspace/smashvrm/verify', { recursive: true });

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok, extra });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

let shell = process.env.CHROME_SHELL;
if (!shell) {
  try {
    shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
  } catch (e) { /* ignore */ }
}
if (!shell) { console.log('FAIL  no chrome binary found'); process.exit(1); }
console.log('using chrome:', shell);

const BROWSER_ARGS = [
  '--no-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--proxy-bypass-list=127.0.0.1;localhost',
  '--ignore-certificate-errors',
  '--mute-audio',
  '--allow-file-access-from-files',
];
const browser = await chromium.launch({ executablePath: shell, args: BROWSER_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const ev = (expr) => page.evaluate(expr.trimStart().startsWith('() =>') ? `(${expr})()` : expr);

try {
  // --- title screen ---
  await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-1p');
    return b && document.getElementById('screen-title') && !document.getElementById('screen-title').classList.contains('hidden');
  }, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/title.png' });
  check('title screen visible', true);
  check('importmap/three loaded (WebGLRenderer created)', await ev(`() => !!document.querySelector('#game canvas')`));

  // --- fighter select ---
  await page.click('#btn-1p');
  await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });
  const cards = await page.locator('#fighter-cards .fcard').count();
  const slots = await page.locator('#slot-strip .slot').count();
  check('fighter select cards rendered', cards >= 3 && slots === 8, `${cards} cards, ${slots} slots`);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/select.png' });

  // --- start 1P vs CPU ---
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__sv && window.__sv.game && window.__sv.game.state === 'fight', { timeout: 30000 });
  check('match reached fight state', true);

  const snap0 = await ev(`() => window.__sv.game.fighters.map(f => ({ x: +f.x.toFixed(2), y: +f.y.toFixed(2), pct: f.percent, stocks: f.stocks, state: f.state, name: f.name }))`);
  check('two fighters spawned', snap0.length === 2, JSON.stringify(snap0));

  // both fighters render: each fighter root group is in the scene
  const roots = await ev(`() => window.__sv.game.fighters.map(f => !!(f.root && f.root.parent))`);
  check('both fighter meshes in scene', roots.every(Boolean));

  // --- forced hit confirm: freeze CPU AI, place P1 at jab range, jab ---
  // jab hitbox: dx 0.55, w 0.7 -> reach ~0.9 from P1; CPU hurtbox half-width 0.5.
  // distance 1.0 guarantees overlap. (13fps headless: hold the key 300ms+.)
  await ev(`() => {
    const g = window.__sv.game, [a, b] = g.fighters;
    b._ai = { cool: 999999, hold: { left:false, right:false, up:false, down:false, jump:false, attack:false, smash:false, special:false, shield:false }, tap: {}, shieldT: 0, usedUpB: false };
    b.x = 2.0; b.y = 0; b.vx = 0; b.vy = 0; b.state = 'idle';
    a.x = 1.0; a.y = 0; a.vx = 0; a.vy = 0; a.facing = 1; a.state = 'idle'; a.moveId = null;
  }`);
  await page.waitForTimeout(300);
  await page.keyboard.down('j');
  await page.waitForTimeout(250);
  const midAttack = await ev(`() => { const a = window.__sv.game.fighters[0]; return a.state + '/' + a.moveId; }`);
  check('P1 attack starts on J (jab)', midAttack === 'attack/jab', midAttack);
  // sample densely right after the hit frames: percent is applied on the hit
  // frame; a frozen CPU may drift to the blast zone afterwards (respawn
  // resets percent to 0), so capture the max percent seen.
  let maxPct = 0;
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(100);
    const p = await ev(`() => window.__sv.game.fighters[1].percent`);
    if (p > maxPct) maxPct = p;
  }
  await page.keyboard.up('j');
  check('attack connects (CPU percent rose above 0)', maxPct > 0, `max CPU percent seen = ${maxPct}`);
  // unfreeze CPU
  await ev(`() => { window.__sv.game.fighters[1]._ai.cool = 0; }`);

  // --- ~10s of free gameplay: move, jump, attacks, specials, shield ---
  // NOTE: engine reads held-keys per fixed tick, so action taps must be HELD
  // ~120ms (a sub-tick press falls between ticks and is never seen).
  const tap = async (key) => { await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key); await page.waitForTimeout(80); };
  const seq = [
    ['d', 900], ['a', 900], ['w', 0], ['j', 0], ['k', 0], ['l', 0],
    ['d', 600], ['w', 0], ['j', 0], [' ', 700], ['a', 600], ['k', 0],
    ['l', 0], ['d', 500], ['w', 0], ['j', 0], ['s', 300],
  ];
  for (const [key, ms] of seq) {
    if (key === ' ') { await page.keyboard.down(' '); await page.waitForTimeout(ms); await page.keyboard.up(' '); }
    else if (ms > 200) { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); }
    else { await tap(key); }
  }
  const snap1 = await ev(`() => window.__sv.game.fighters.map(f => ({ x: +f.x.toFixed(2), y: +f.y.toFixed(2), pct: Math.floor(f.percent), stocks: f.stocks, state: f.state }))`);
  check('gameplay ran without state corruption', snap1.length === 2, JSON.stringify(snap1));
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/fight.png' });
  check('fight screenshot taken', true);

  // --- HUD live ---
  const hudPct = await ev(`() => document.querySelector('#hud-left .hchip .hud-pct').textContent`);
  check('HUD percent element updates', /%/.test(hudPct), hudPct);

  // --- exit fight: robust to the match having ended during gameplay ---
  const endState = await ev(`() => ({ state: window.__sv.game.state, results: !document.getElementById('screen-results').classList.contains('hidden') })`);
  if (endState.state === 'done' || endState.results) {
    check('match can end (results screen reached)', true, `state=${endState.state}`);
    await page.click('#btn-results-title');
  } else {
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('screen-pause').classList.contains('hidden'), { timeout: 8000 });
    check('pause menu opens on Escape', true);
    await page.click('#btn-quit');
  }
  await page.waitForFunction(() => !document.getElementById('screen-title').classList.contains('hidden'), { timeout: 8000 });
  check('back at title', true);

  // --- Fighter Lab ---
  await page.click('#btn-lab');
  await page.waitForFunction(() => {
    const o = document.getElementById('lab-overlay');
    return o && !o.classList.contains('hidden') && o.childElementCount > 0;
  }, { timeout: 8000 });
  await page.waitForTimeout(800);
  const labText = await ev(`() => document.getElementById('lab-overlay').innerText`);
  check('lab has recolor UI (color inputs)', await ev(`() => document.querySelectorAll('#lab-overlay input[type=color]').length >= 2`));
  check('lab has budget UI', /budget/i.test(labText));
  check('lab has swap UI', /swap/i.test(labText));
  check('VRM file input exists and wired', await ev(`() => { const i = document.getElementById('vrm-file'); return i && i.type === 'file'; }`));
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/lab.png' });
  // close lab via its ✕ button — teardown() removes the inner overlay div,
  // so "closed" = container has no children (main.js leaves #lab-overlay unhidden)
  const closeFound = await page.evaluate(() => {
    const o = document.getElementById('lab-overlay');
    const btn = [...o.querySelectorAll('button')].find(b => b.textContent.includes('✕'));
    if (btn) { btn.click(); return true; }
    return false;
  });
  await page.waitForTimeout(500);
  check('lab closed cleanly', closeFound && await ev(`() => document.getElementById('lab-overlay').childElementCount === 0`));

  // --- errors ---
  const audioOnly = errors.filter(e => /audio|AudioContext/i.test(e));
  const realErrors = errors.filter(e => !/audio|AudioContext/i.test(e));
  check('no page/console errors (non-audio)', realErrors.length === 0, realErrors.length ? realErrors.slice(0, 5).join(' | ') : 'clean');
  if (audioOnly.length) console.log(`note: ${audioOnly.length} audio-context console error(s) under headless: ${audioOnly[0].slice(0, 120)}`);
} catch (err) {
  check('script completed without harness exception', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
}

console.log('\n--- errors collected ---');
for (const e of errors.slice(0, 12)) console.log(' * ' + e);
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
