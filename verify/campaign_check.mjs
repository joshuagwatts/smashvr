/* verify/campaign_check.mjs — v0.10 browser verification:
   campaign screen renders (stages, locks, coop), stage 1 fight, KO FEST
   counter HUD, BOSS HP bar HUD, zero errors. */
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--allow-file-access-from-files','--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message.slice(0,150)));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0,150)); });
let pass = 0, fail = 0;
const check = (n, c, x='') => { c ? pass++ : fail++; console.log((c?'ok':'FAIL')+' - '+n+(x&&!c?' — '+x:'')); };

await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
await page.waitForFunction(() => !!document.getElementById('btn-campaign'), { timeout: 30000 });
await page.waitForTimeout(1200);

// 1) campaign screen
await page.click('#btn-campaign'); await page.waitForTimeout(800);
const stages = await page.evaluate(() => [...document.querySelectorAll('#campaign-stages .stage')].map(s => ({
  name: s.querySelector('.stage-name').textContent,
  locked: s.classList.contains('locked'),
})));
check('7 stages listed', stages.length === 7, JSON.stringify(stages.map(s=>s.name)));
check('stage 1 unlocked, rest locked', stages[0] && !stages[0].locked && stages.slice(1).every(s=>s.locked));
check('coop toggle present', await page.evaluate(() => !!document.getElementById('btn-coop2')));
await page.screenshot({ path: '/tmp/camp-screen.png' });

// 2) stage 1 fight via debug hook
await page.evaluate(() => window.__sv.startCampaign(0));
await page.waitForFunction(() => window.__sv?.game?.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(2500);
const f1 = await page.evaluate(() => {
  const g = window.__sv.game;
  return { n: g.fighters.length, teams: g.fighters.map(f=>f.team).join(','), ctrls: g.fighters.map(f=>f.ctrl).join(',') };
});
check('stage 1: 1v1 red vs blue', f1.n === 2 && f1.teams === 'red,blue', JSON.stringify(f1));
check('intro splash shown then hidden', await page.evaluate(() => document.getElementById('campaign-intro').classList.contains('hidden')));
await page.screenshot({ path: '/tmp/camp-stage1.png' });

// 3) KO FEST — counter HUD
await page.evaluate(() => window.__sv.startCampaign(2));
await page.waitForFunction(() => window.__sv?.game?.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(2000);
const kf = await page.evaluate(() => {
  const g = window.__sv.game;
  return { n: g.fighters.length, extra: document.getElementById('hud-extra').textContent.trim().slice(0,20) };
});
check('kofest: 4 fighters (1+3)', kf.n === 4, JSON.stringify(kf));
check('kofest: counter HUD visible', /KO/.test(kf.extra), kf.extra);
await page.screenshot({ path: '/tmp/camp-kofest.png' });

// 4) BOSS — HP bar HUD, force phase 3 for the screenshot
await page.evaluate(() => window.__sv.startCampaign(6));
await page.waitForFunction(() => window.__sv?.game?.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const g = window.__sv.game;
  const boss = g.fighters.find(f => f._isBoss);
  boss.percent = 130; // force phase 3
});
await page.waitForTimeout(1200);
const boss = await page.evaluate(() => {
  const g = window.__sv.game;
  const b = g.fighters.find(f => f._isBoss);
  return { scale: b._modScale, armor: b._superArmor, ai: b._aiPersonality,
    bar: document.getElementById('hud-extra').textContent.trim().slice(0,40) };
});
check('boss: scaled 2.5x', boss.scale === 2.5);
check('boss: phase 3 armor+spammer', boss.armor === true && boss.ai === 'spammer', JSON.stringify(boss));
check('boss: HP bar HUD', /WISP KING/.test(boss.bar), boss.bar);
await page.screenshot({ path: '/tmp/camp-boss.png' });

// 5) co-op stage 1
await page.evaluate(() => window.__sv.startCampaign(0, true));
await page.waitForFunction(() => window.__sv?.game?.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(1000);
const coop = await page.evaluate(() => window.__sv.game.fighters.map(f=>f.ctrl+':'+f.team).join(' '));
check('coop: p1+p2 red vs cpu blue', coop === 'p1:red p2:red cpu:blue', coop);

console.log(`\n${pass} pass, ${fail} fail | ERRORS:`, errors.length ? errors : 'none');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
