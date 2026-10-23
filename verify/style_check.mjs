/* verify/style_check.mjs — v0.43 style-picker / persistence proof.
   Drives style_probe.html through import -> style overrides -> portrait
   invalidation -> reload persistence -> legacy-record facing upgrade ->
   Lab UI picker, all against the game's real modules + IndexedDB. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import fs from 'fs';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) { /* fall through */ }
if (!shell) shell = '/opt/meta-chromium/chrome';

fs.writeFileSync('/tmp/smashvrm-bootstrap.html', '<script>location.replace("http://127.0.0.1:8902/style_probe.html")</script>');
const browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox', '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('console: ' + m.text().slice(0, 200)); });
await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__done === true, { timeout: 180000 });
const R = await page.evaluate(() => window.__results);
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/v043_style_lab.png' });
let fail = 0;
for (const c of R.checks) {
  console.log((c.pass ? 'ok - ' : 'FAIL - ') + c.name + (c.extra ? ' — ' + c.extra : ''));
  if (!c.pass) fail++;
}
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
if (errors.length) fail++;
console.log(fail ? `\n${fail} STYLE CHECKS FAILED` : '\nALL STYLE CHECKS PASS');
await browser.close();
process.exit(fail ? 1 : 0);
