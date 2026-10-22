/* verify/moveset_shots.mjs — v0.40 visual verification: mid-strike
   screenshots of signature directional moves (ronin fair, volt dair,
   spectre uair). Deterministic staging: startSlots via the debug hook,
   freeze the sim (g.paused), inject the attack state, step exact sim
   ticks to the strike keyframe, screenshot the paused render.
   Needs: http.server on 8902 serving the repo + /tmp/smashvrm-bootstrap.html */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) { /* fall through */ }
if (!shell) shell = '/opt/meta-chromium/chrome';

const browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox', '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const errors = [];

async function shotFor(def, moveId, ticks, out) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(def + ': ' + String(e).slice(0, 150)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(def + ' console: ' + m.text().slice(0, 150)); });
  await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__sv && window.__sv.startSlots, { timeout: 30000 });
  await page.evaluate((d) => {
    window.__sv.startSlots([
      { def: d, ctrl: 'cpu', team: null },
      { def: 'ronin', ctrl: 'cpu', team: null },
    ], 'cpu');
  }, def);
  await page.waitForFunction(() => window.__sv.game && window.__sv.game.state === 'fight', { timeout: 30000 });
  const info = await page.evaluate(({ mv, n }) => {
    const g = window.__sv.game, [a, b] = g.fighters;
    g.paused = true; // freeze the rAF sim; tick() ignores paused, we step by hand
    a.x = 0; a.y = 4.5; a.vx = 0; a.vy = 0; a.facing = 1;
    a.onGround = false; a.jumpsUsed = 0; a.percent = 0;
    b.x = 6.5; b.y = 0; b.vx = 0; b.vy = 0; b.percent = 0;
    a.state = 'attack'; a.stateFrame = 0; a.moveId = mv; a.moveFrame = 0;
    a._hitSet = new Set(); a._lungeDone = false; a._fired = false;
    a._lifts = 0; a._chargeMult = 1;
    for (let i = 0; i < n; i++) {
      b.x = 6.5; b.y = 0; b.vx = 0; b.vy = 0;
      g.tick();
    }
    return { moveId: a.moveId, moveFrame: a.moveFrame, state: a.state, x: +a.x.toFixed(2), y: +a.y.toFixed(2) };
  }, { mv: moveId, n: ticks });
  await page.waitForTimeout(600); // let the render loop paint the frozen pose
  await page.screenshot({ path: out });
  console.log('SHOT', out, JSON.stringify(info));
  await page.close();
}

await shotFor('ronin', 'fair', 14, '/home/hatch/workspace/smashvrm/verify/v040_ronin_fair.png');
await shotFor('volt', 'dair', 14, '/home/hatch/workspace/smashvrm/verify/v040_volt_dair.png');
await shotFor('spectre', 'uair', 3, '/home/hatch/workspace/smashvrm/verify/v040_spectre_uair.png');

console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
