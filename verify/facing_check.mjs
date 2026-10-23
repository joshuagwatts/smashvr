/* verify/facing_check.mjs — v0.43 facing-detector proof on real VRM files.
   Serves ~/workspace on :8902 (parent dir, so user/files/*.vrm resolve),
   opens /tmp/facing_probe.html which loads SeedSan + Mushy through the
   game's own loadVRMFile, bakes 90/180/270° yaws, and measures detector
   output + corrected toe direction. Screenshots the renders. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) { /* fall through */ }
if (!shell) shell = '/opt/meta-chromium/chrome';

const browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox', '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL((u) => u.href.startsWith('http://127.0.0.1:8902/facing_probe.html'), { timeout: 30000 });
await page.waitForFunction(() => window.__done === true, { timeout: 180000 });
const results = await page.evaluate(() => window.__results);
console.log(JSON.stringify(results, null, 1));
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/v043_facing.png', fullPage: true });
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();

let fail = 0;
const near = (a, b, tol) => a != null && Math.abs(((a - b + 540) % 360) - 180) <= tol ? false : Math.abs(a - b) <= tol;
function angDiff(a, b) { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; }
function check(name, cond, extra = '') {
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (extra ? ' ' + extra : ''));
  if (!cond) fail++;
}
for (const k of Object.keys(results)) {
  const r = results[k];
  check(`${k} as-loaded |yaw| <= 12`, r.asLoaded && angDiff(r.asLoaded.deg, 0) <= 12, `got ${r.asLoaded && r.asLoaded.deg}`);
  check(`${k} rot90 detected ~90`, r.rot90 && angDiff(r.rot90.deg, 90) <= 15, `got ${r.rot90 && r.rot90.deg}`);
  check(`${k} rot180 detected ~180`, r.rot180 && angDiff(r.rot180.deg, 180) <= 15, `got ${r.rot180 && r.rot180.deg}`);
  check(`${k} rot270 detected ~-90`, r.rot270 && angDiff(r.rot270.deg, -90) <= 15, `got ${r.rot270 && r.rot270.deg}`);
  check(`${k} corrected180 toe dot(+X) > 0.9`, r.corrected180 && r.corrected180.dotEngineForward > 0.9, `got ${r.corrected180 && r.corrected180.dotEngineForward}`);
  check(`${k} uncorrected180 toe dot(+X) < -0.9 (bug reproduced)`, r.uncorrected180 && r.uncorrected180.dotEngineForward < -0.9, `got ${r.uncorrected180 && r.uncorrected180.dotEngineForward}`);
  check(`${k} normalAttach toe dot(+X) > 0.9`, r.normalAttach && r.normalAttach.dotEngineForward > 0.9, `got ${r.normalAttach && r.normalAttach.dotEngineForward}`);
}
console.log(fail ? `\n${fail} FACING CHECKS FAILED` : '\nALL FACING CHECKS PASS');
process.exit(fail ? 1 : 0);
