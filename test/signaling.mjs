/* test/signaling.mjs — v0.11 Trystero signaling verification.
   Two headless pages join the same room via the real createNetTransport.
   Proves: esm.sh strategy modules load, room join succeeds, own cid is
   assigned, SDP offer generation works (AGENTS.md pattern). On THIS VM,
   UDP is blocked so ICE can never connect — peer-join/data-channel success
   is NOT expected here; the asserts below pin exactly the signaling layer.
   Run: node test/signaling.mjs (needs http.server 8902) */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';

let shell = process.env.CHROME_SHELL;
if (!shell) {
  try {
    shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
  } catch (e) { /* ignore */ }
}
if (!shell) { console.log('FAIL  no chrome binary found'); process.exit(1); }

const BROWSER_ARGS = [
  '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--proxy-server=http://127.0.0.1:8899',
  '--proxy-bypass-list=127.0.0.1;localhost', '--ignore-certificate-errors',
  '--mute-audio', '--allow-file-access-from-files',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
];
const browser = await chromium.launch({ executablePath: shell, args: BROWSER_ARGS });

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

const room = 'SIG' + Math.random().toString(36).slice(2, 8).toUpperCase();
// per-run bootstrap: file:// initiator -> location.replace to the signal page
// (Chromium 152 blocks direct file:// -> 127.0.0.1 navigation otherwise)
import { writeFileSync } from 'fs';
writeFileSync('/tmp/smashvrm-signal-bootstrap.html',
  `<!doctype html><html><body><script>location.replace('http://127.0.0.1:8902/test/_signal.html#room=${room}');</script></body></html>`);
const pages = [];
for (let i = 0; i < 2; i++) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page._sigErrors = errors;
  await page.goto('file:///tmp/smashvrm-signal-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
  pages.push(page);
}

// wait for both pages to finish their signaling attempt
for (const [i, page] of pages.entries()) {
  try {
    await page.waitForFunction(() => window.__sig && window.__sig.done, { timeout: 45000 });
  } catch (e) { /* timeout — report below */ }
  const sig = await page.evaluate(() => ({ log: window.__sig ? window.__sig.log : [], error: window.__sig ? window.__sig.error : 'no __sig' }));
  console.log(`--- page ${i} log ---`);
  for (const l of sig.log) console.log('   ' + l);
  if (sig.error) console.log('   ERROR: ' + sig.error);
  const errs = page._sigErrors.filter((e) => !e.includes('favicon'));
  if (errs.length) console.log('   pageerrors: ' + errs.slice(0, 3).join(' | '));

  check(`page ${i}: strategy modules imported`, sig.log.includes('import-ok'), sig.log.join(','));
  check(`page ${i}: room joined with cid`, sig.log.some((l) => l.startsWith('room-joined')), sig.log.join(','));
  check(`page ${i}: SDP offer generated`, sig.log.some((l) => l.startsWith('sdp-ok')), sig.log.join(','));
  check(`page ${i}: send attempt did not throw`, sig.log.some((l) => l.startsWith('send-attempted')), sig.log.join(','));
  check(`page ${i}: no page errors`, errs.length === 0, errs.slice(0, 2).join(' | '));
  const joins = sig.log.filter((l) => l.startsWith('peer-join'));
  console.log(`   note: peer-join events on page ${i}: ${joins.length} (UDP wall => 0 expected here)`);
}

await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
