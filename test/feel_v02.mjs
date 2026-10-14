/* test/feel_v02.mjs — v0.2 feel-pass browser verification:
   1. strong hit (fsmash) triggers camera shake; weak poke (jab) does not.
   2. KO blow (last stock) freezes both fighters ~26 ticks, _koFx camera
      cinematic pushes in, then releases into the launch.
   Run: node test/feel_v02.mjs (needs http.server 8902 + bootstrap in /tmp) */
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
const browser = await chromium.launch({
  executablePath: shell,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--proxy-bypass-list=127.0.0.1;localhost', '--ignore-certificate-errors',
         '--mute-audio', '--allow-file-access-from-files'],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
const ev = (expr) => page.evaluate(expr.trimStart().startsWith('() =>') ? `(${expr})()` : expr);

async function setup() {
  await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-1p');
    return b && !document.getElementById('screen-title').classList.contains('hidden');
  }, { timeout: 60000 });
  await page.click('#btn-1p');
  await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__sv.game.state === 'fight', { timeout: 30000 });
  // freeze CPU AI so the setup is deterministic
  await ev(`() => {
    const g = window.__sv.game, [a, b] = g.fighters;
    b._ai = { cool: 999999, hold: { left:false, right:false, up:false, down:false, jump:false, attack:false, smash:false, special:false, shield:false }, tap: {}, shieldT: 0, usedUpB: false };
  }`);
}

// place fighters: P1 at x, facing 1; CPU at bx (idle, no velocity)
async function place(x, bx, pct = 0, stocks = 3) {
  await page.evaluate(([x, bx, pct, stocks]) => {
    const g = window.__sv.game, [a, b] = g.fighters;
    a.x = x; a.y = 0; a.vx = 0; a.vy = 0; a.facing = 1; a.state = 'idle'; a.moveId = null; a.hitPause = 0;
    b.x = bx; b.y = 0; b.vx = 0; b.vy = 0; b.facing = -1; b.state = 'idle'; b.moveId = null;
    b.percent = pct; b.stocks = stocks; b.hitPause = 0; b.invuln = 0;
    g._shakeT = 0; g._koFx = null;
  }, [x, bx, pct, stocks]);
  await page.waitForTimeout(200);
}

try {
  await setup();

  // --- 1. jab (weak): connects but NO shake ---
  await place(1.0, 2.0);
  await page.keyboard.down('j');
  await page.waitForTimeout(400);
  await page.keyboard.up('j');
  const jabRes = await ev(`() => ({
    t: window.__sv.game._shakeT, amp: window.__sv.game._shakeAmp,
    pct: window.__sv.game.fighters[1].percent,
  })`);
  check('jab connects', jabRes.pct > 0, `cpu pct=${jabRes.pct}`);
  check('jab (weak) triggers no camera shake', jabRes.t === 0 && jabRes.amp === 0,
    `t=${jabRes.t} amp=${jabRes.amp}`);

  // --- 2. fsmash (strong): shake fires ---
  // (v0.3: holding K charges now — release, then the hit lands ~12 ticks later)
  await place(1.0, 2.0, 30);
  const camZ0 = await ev(`() => window.__sv.game.camera.position.z`);
  await page.keyboard.down('k'); // smash button -> charge
  await page.waitForTimeout(500); // charge up
  await page.keyboard.up('k'); // release -> fsmash fires
  let smashShake = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    smashShake = await ev(`() => ({ t: window.__sv.game._shakeT, dur: window.__sv.game._shakeDur, amp: +window.__sv.game._shakeAmp.toFixed(3) })`);
    if (smashShake.amp > 0) break; // amp persists once the hit fires
  }
  check('fsmash (strong) triggers camera shake', smashShake.amp > 0 && smashShake.dur >= 8 && smashShake.dur <= 15,
    `amp=${smashShake.amp} dur=${smashShake.dur}`);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/shake.png' });
  check('shake screenshot taken', true);

  // --- 3. KO blow: last stock, high percent, near edge ---
  await place(4.0, 5.2, 120, 1);
  await page.keyboard.down('k');
  // poll for the KO cinematic, then read hitPause immediately (it decays fast)
  let ko = null;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    ko = await ev(`() => {
      const g = window.__sv.game, [a, b] = g.fighters;
      return {
        koFx: !!g._koFx, koT: g._koFx ? g._koFx.t : -1,
        defPause: b.hitPause, atkPause: a.hitPause,
        camZ: +g.camera.position.z.toFixed(2),
        shakeAmp: +g._shakeAmp.toFixed(3),
      };
    }`);
    if (ko.koFx) break;
  }
  await page.keyboard.up('k');
  check('KO blow sets _koFx cinematic', ko && ko.koFx, ko ? `t=${ko.koT}` : 'never fired');
  // freeze-frame screenshot DURING the freeze (hitPause decays fast)
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/kofreeze.png' });
  check('KO blow freezes defender ~26 ticks', ko.defPause >= 20, `hitPause=${ko.defPause}`);
  check('KO blow freezes attacker ~26 ticks', ko.atkPause >= 20, `hitPause=${ko.atkPause}`);
  // v0.3: the charged release delays the hit — let the camera push-in develop
  // before reading z (k.t advances during the freeze)
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100);
    const t = await ev(`() => window.__sv.game._koFx ? window.__sv.game._koFx.t : 999`);
    if (t > 12) break;
  }
  ko.camZ = await ev(`() => +window.__sv.game.camera.position.z.toFixed(2)`);
  // v0.6: check the logical smoothed camera (_camS.z), not the rendered
  // position — the v0.4 render interpolation adds display lag that makes the
  // rendered z timing-flaky (it trails _camS.z by a frame or two).
  ko.camSz = await ev(`() => +window.__sv.game._camS.z.toFixed(2)`);
  check('KO blow pushes camera in (z decreasing toward 12.5)', ko.camSz < 15.95, `z=${ko.camSz} (rendered ${ko.camZ})`);
  check('KO blow fires shake pulse', ko.shakeAmp >= 0.25, `amp=${ko.shakeAmp}`);

  // --- 4. freeze releases into the launch: victim eventually dies ---
  let dead = false;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const s = await ev(`() => ({ st: window.__sv.game.fighters[1].state, stocks: window.__sv.game.fighters[1].stocks, phase: window.__sv.game.state })`);
    if (s.st === 'dead' || s.stocks === 0 || s.phase === 'done') { dead = true; break; }
  }
  check('KO blow resolves into a real KO', dead);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/koafter.png' });

  const realErrors = errors.filter((e) => !/audio|AudioContext/i.test(e));
  check('no page/console errors (non-audio)', realErrors.length === 0, realErrors.slice(0, 3).join(' | ') || 'clean');
} catch (err) {
  check('feel script completed', false, err.message.split('\n')[0]);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} feel checks passed`);
process.exit(failed ? 1 : 0);
