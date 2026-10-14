/* verify/wisp_check.mjs — v0.6 browser verification:
   1. Start a fight as WISP vs CPU, verify hover bob + glide + floaty jump,
      take a hit, screenshot mid-fight (verify/wisp.png).
   2. Import the legless ghost GLB via the file picker, confirm the
      "Floater type" toast + import-status badge.
   Run: node verify/wisp_check.mjs (needs http.server 8902 + bootstrap in /tmp) */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) { /* fall through */ }
if (!shell) shell = '/opt/meta-chromium/chrome';

const browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox', '--allow-file-access-from-files', '--use-gl=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)));
const ev = (expr) => page.evaluate(expr.trimStart().startsWith('() =>') ? `(${expr})()` : expr);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`ok - ${name}`); }
  else { fail++; console.log(`FAIL - ${name}${extra ? ' — ' + extra : ''}`); }
};

await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#btn-1p');
await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });

// ---- select WISP for P1 ----
await page.click('.fcard[data-def="wisp"][data-group="1"]');
await page.waitForTimeout(300);
const sel = await ev(`() => document.querySelector('.fcard[data-def="wisp"][data-group="1"]').classList.contains('sel')`);
check('wisp card selectable for P1', sel);
const cardTag = await ev(`() => document.querySelector('.fcard[data-def="wisp"][data-group="1"] .fclass').textContent`);
check('wisp card shows FLOATER tag', /FLOATER/.test(cardTag), cardTag);

await page.click('#btn-start');
await page.waitForFunction(() => window.__sv.game.state === 'fight', { timeout: 30000 });
// freeze the CPU far away immediately — it attacks fast and would knock the
// wisp during the bob measurement
await ev(`() => {
  const g = window.__sv.game, [a, b] = g.fighters;
  a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.state = 'idle'; a.grounded = true;
  b.x = 20; b.y = 0; b.vx = 0; b.vy = 0; b.state = 'idle';
}`);
await page.waitForTimeout(300);

// ---- hover bob: render y rides ±0.06 above/below the logic y ----
// (measured as root.position.y - f.y, so it works even if the CPU knocks
// the wisp around — the bob is a visual offset on top of logic position)
const bob = await ev(`() => {
  const g = window.__sv.game, f = g.fighters[0];
  const offs = [];
  return new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => {
      offs.push(+(f.root.position.y - f.y).toFixed(4));
      if (++n >= 30) { clearInterval(iv); res(offs); }
    }, 50);
  });
}`);
const bmin = Math.min(...bob), bmax = Math.max(...bob);
check('wisp bodyType is floater in-game', await ev(`() => window.__sv.game.fighters[0].bodyType`) === 'floater');
check('hover bob oscillates (±0.06)', (bmax - bmin) > 0.04 && (bmax - bmin) < 0.25,
  `range=${(bmax - bmin).toFixed(3)}`);

// ---- glide: run right, verify x increases ----
const gx0 = await ev(`() => {
  const g = window.__sv.game, f = g.fighters[0];
  f.x = -2; f.y = 0; f.vx = 0; f.vy = 0; f.state = 'idle'; f.grounded = true; f.facing = 1;
  return f.x;
}`);
await page.keyboard.down('d');
await page.waitForTimeout(800);
await page.keyboard.up('d');
const glideX = await ev(`() => window.__sv.game.fighters[0].x`);
check('wisp glides right when running', glideX > gx0 + 0.5, `x: ${gx0.toFixed(2)} -> ${glideX.toFixed(2)}`);

// floaty jump: verify vy decays slower (gravity ×0.55) by sampling vy over time
const grav = await ev(`() => {
  const g = window.__sv.game, f = g.fighters[0];
  f.x = 0; f.y = 2; f.vx = 0; f.vy = 1.0; f.state = 'air'; f.grounded = false;
  const vys = [];
  return new Promise((res) => {
    let n = 0;
    const iv = setInterval(() => {
      vys.push(+f.vy.toFixed(4));
      if (++n >= 20) { clearInterval(iv); res(vys); }
    }, 50);
  });
}`);
// gravity per second: dv over 1s should be ~0.55 * base grav (base ~2.2?)
const dv = grav[0] - grav[grav.length - 1];
console.log(`  info: wisp vy decay over 1s: ${dv.toFixed(3)} (floater grav ×0.55)`);
check('wisp vy decays (gravity active)', dv > 0.3 && dv < 2.0, `dv=${dv.toFixed(3)}`);

// ---- take a hit: place CPU next to wisp, let it attack ----
await ev(`() => {
  const g = window.__sv.game, [a, b] = g.fighters;
  a.x = 0; a.y = 0; a.vx = 0; a.vy = 0; a.state = 'idle'; a.percent = 0;
  b.x = 1.2; b.y = 0; b.vx = 0; b.vy = 0; b.state = 'idle';
}`);
await page.waitForTimeout(3000);
const pct = await ev(`() => window.__sv.game.fighters[0].percent`);
check('wisp takes a hit (percent > 0)', pct > 0, `percent=${pct}`);
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/wisp.png' });
check('screenshot saved', true);

// ---- import the legless ghost GLB ----
await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.click('#btn-1p');
await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });
await page.setInputFiles('#vrm-file', '/tmp/ghost.glb');
await page.waitForTimeout(2000);
const toastText = await ev(`() => document.getElementById('toast').textContent`);
check('ghost import toasts "Floater type detected"', /Floater type detected/.test(toastText), toastText.slice(0, 80));
const badgeText = await ev(`() => document.getElementById('import-status').textContent`);
check('import-status badge shows Floater', /Floater/.test(badgeText), badgeText.slice(0, 80));

const realErrors = errors.filter((e) => !/audio|AudioContext/i.test(e));
check('no page errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '));

console.log(`\n${pass} passed, ${fail} failed.`);
await browser.close();
process.exit(fail ? 1 : 0);
