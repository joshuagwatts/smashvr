/* verify/team4v4.mjs — v0.9 browser verification: 4v4 all-CPU team battle.
   Starts via the __sv.startSlots debug hook, screenshots, asserts 8 fighters,
   team HUD, zero errors. Also captures the select screen with slots. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) {}
if (!shell) shell = '/opt/meta-chromium/chrome';

const browser = await chromium.launch({ executablePath: shell, args: [
  '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--mute-audio', '--allow-file-access-from-files',
]});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 150)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 150)); });
const ev = (expr) => page.evaluate(expr.trimStart().startsWith('() =>') ? `(${expr})()` : expr);
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};

await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
await page.waitForFunction(() => !!document.getElementById('btn-1p'), { timeout: 30000 });
await page.waitForTimeout(1500);

// select screen with the slot UI
await page.click('#btn-2p');
await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });
await page.waitForTimeout(500);
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/select_slots.png' });
check('8 slot cards rendered', await ev(`() => document.querySelectorAll('#slot-strip .slot').length`) === 8);
// open slot 3 (index 2): cycle controller closed -> cpu
await page.click('#slot-strip .slot:nth-child(3) .slot-ctrl');
await page.waitForTimeout(300);
const ctrl3 = await ev(`() => document.querySelector('#slot-strip .slot:nth-child(3) .slot-ctrl').textContent`);
check('slot controller cycles to CPU', ctrl3 === 'CPU', ctrl3);
// set teams: slots 1-2 red, slot 3 blue
await page.click('#slot-strip .slot:nth-child(1) .slot-team');
await page.click('#slot-strip .slot:nth-child(2) .slot-team');
await page.click('#slot-strip .slot:nth-child(3) .slot-team');
await page.click('#slot-strip .slot:nth-child(3) .slot-team');
await page.waitForTimeout(300);
const teams = await ev(`() => [...document.querySelectorAll('#slot-strip .slot')].slice(0,3).map(s => s.querySelector('.slot-team').className)`);
check('team dots cycle (red, red, blue)', /team-red/.test(teams[0]) && /team-red/.test(teams[1]) && /team-blue/.test(teams[2]), teams.join('|'));

// 4v4 all-CPU team battle via debug hook
const started = await ev(`() => {
  const defs = ['ronin','volt','wisp','ronin','volt','ronin','wisp','volt'];
  const slots = defs.map((def, i) => ({ def, ctrl: 'cpu', team: i < 4 ? 'red' : 'blue' }));
  window.__sv.startSlots(slots, 'cpu');
  return true;
}`);
check('startSlots hook fired', started);
await page.waitForFunction(() => window.__sv && window.__sv.game && window.__sv.game.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(4000);
const info = await ev(`() => {
  const g = window.__sv.game;
  return {
    n: g.fighters.length,
    inScene: g.fighters.filter(f => f.root && f.root.parent).length,
    teams: g.fighters.map(f => f.team).join(','),
    hudChips: document.querySelectorAll('#hud .hchip').length,
    states: [...new Set(g.fighters.map(f => f.state))].join(','),
  };
}`);
check('8 fighters in game', info.n === 8, JSON.stringify(info.n));
check('8 fighter roots in scene', info.inScene === 8, `${info.inScene}`);
check('teams assigned', info.teams === 'red,red,red,red,blue,blue,blue,blue', info.teams);
check('8 HUD chips', info.hudChips === 8, `${info.hudChips}`);
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/team4v4.png' });
// let it run — KOs should happen, no errors
await page.waitForTimeout(15000);
const later = await ev(`() => {
  const g = window.__sv.game;
  return { state: g.state, totalStocks: g.fighters.reduce((s,f) => s + f.stocks, 0), ffHits: g._ffHits || 0,
    maxPct: Math.max(...g.fighters.map(f => Math.round(f.percent))) };
}`);
check('battle progressing (stocks lost)', later.totalStocks < 24, `stocks=${later.totalStocks} state=${later.state}`);
check('damage dealt', later.maxPct > 0, `maxPct=${later.maxPct}`);
check('zero friendly-fire hits', later.ffHits === 0, `ffHits=${later.ffHits}`);
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/team4v4_late.png' });

const realErrors = errors.filter(e => !/audio|AudioContext/i.test(e));
check('no page/console errors (non-audio)', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
console.log(`\n${pass} pass, ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
