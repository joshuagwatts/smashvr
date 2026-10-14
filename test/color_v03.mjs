/* test/color_v03.mjs — v0.3 COLOR PASS browser verification.
   Checks:
     1. mirror match (ronin vs ronin): P2 gets altTheme (#2ee2a8/#f2f5f7),
        P1 keeps base (#e23b2e/#ffb13d); materials differ.
     2. port rings: RingGeometry under each fighter, P1 #ff3b30, P2 #0a84ff,
        y~0.02, track fighter x/z every frame.
     3. HUD: hud-p1-name/hud-p1-pct in P1 red, hud-p2-name/hud-p2-pct in P2 blue.
     4. mixed match (ronin vs volt): base themes intact, rings correct.
   Run: node test/color_v03.mjs (needs http.server 8902 + /tmp/smashvrm-bootstrap.html) */
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

const P1_RGB = 'rgb(255, 59, 48)';
const P2_RGB = 'rgb(10, 132, 255)';

async function bootAndStart(p2def) {
  await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
  await page.waitForFunction(() => {
    const b = document.getElementById('btn-1p');
    return b && document.getElementById('screen-title') && !document.getElementById('screen-title').classList.contains('hidden');
  }, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.click('#btn-1p');
  await page.waitForFunction(() => !document.getElementById('screen-select').classList.contains('hidden'), { timeout: 10000 });
  // v0.9: slot UI — select slot 2 via its name (the CTRL badge cycles
  // controller instead of selecting), then assign its fighter card
  if (p2def) {
    await page.click('#slot-strip .slot:nth-child(2) .slot-name');
    await page.click(`#fighter-cards .fcard[data-def="${p2def}"]`);
  }
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__sv && window.__sv.game && window.__sv.game.state === 'fight', { timeout: 30000 });
}

const rootColors = () => ev(`() => {
  const cols = (f) => {
    const s = new Set();
    f.root.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.isColor) s.add('#' + o.material.color.getHexString()); });
    return [...s].sort();
  };
  const [a, b] = window.__sv.game.fighters;
  return { p1: cols(a), p2: cols(b), p2theme: b.theme, p2vrm: !!b._isVRM, p1vrm: !!a._isVRM };
}`);

const ringInfo = () => ev(`() => window.__sv.game.fighters.map((f, i) => ({
  has: !!f._portRing,
  inScene: !!(f._portRing && f._portRing.parent),
  color: f._portRing ? '#' + f._portRing.material.color.getHexString() : null,
  y: f._portRing ? +f._portRing.position.y.toFixed(3) : null,
  x: f._portRing ? +f._portRing.position.x.toFixed(2) : null,
  geoInner: f._portRing ? +f._portRing.geometry.parameters.innerRadius.toFixed(2) : null,
  geoOuter: f._portRing ? +f._portRing.geometry.parameters.outerRadius.toFixed(2) : null,
}))`);

const hudColors = () => ev(`() => {
  // v0.9: HUD is chips — left chip = slot 0, right chip = slot 1
  const chips = [...document.querySelectorAll('#hud .hchip')];
  const c = (chip, sel) => chip ? getComputedStyle(chip.querySelector(sel)).color : null;
  return { n1: c(chips[0], '.hud-name'), p1: c(chips[0], '.hud-pct'), n2: c(chips[1], '.hud-name'), p2: c(chips[1], '.hud-pct') };
}`);

try {
  // ---------------- MIRROR MATCH: ronin vs ronin ----------------
  await bootAndStart('ronin');
  check('mirror match reached fight state', true);

  const mc = await rootColors();
  check('P1 keeps base ronin primary', mc.p1.includes('#e23b2e'), mc.p1.join(' '));
  check('P2 got alt primary (teal)', mc.p2.includes('#2ee2a8'), mc.p2.join(' '));
  check('P2 got alt secondary (white)', mc.p2.includes('#f2f5f7'), mc.p2.join(' '));
  check('P2 no longer carries base ronin red', !mc.p2.includes('#e23b2e'), mc.p2.join(' '));
  check('P2 fighter.theme records alt', mc.p2theme && mc.p2theme.primary === '#2ee2a8' && mc.p2theme.secondary === '#f2f5f7', JSON.stringify(mc.p2theme));
  check('procedural fighters not VRM-flagged', mc.p1vrm === false && mc.p2vrm === false, `p1:${mc.p1vrm} p2:${mc.p2vrm}`);

  const ri = await ringInfo();
  check('both port rings in scene', ri.every(r => r.has && r.inScene), JSON.stringify(ri.map(r => r.has && r.inScene)));
  check('P1 ring is port red', ri[0].color === '#ff3b30', ri[0].color);
  check('P2 ring is port blue', ri[1].color === '#0a84ff', ri[1].color);
  check('ring geometry ~0.55/0.75', ri[0].geoInner === 0.55 && ri[0].geoOuter === 0.75, `${ri[0].geoInner}/${ri[0].geoOuter}`);
  check('ring y ~0.02', Math.abs(ri[0].y - 0.02) < 0.005 && Math.abs(ri[1].y - 0.02) < 0.005, `${ri[0].y}, ${ri[1].y}`);

  // ring tracks fighter x/z: sample f.x and ring.x in one atomic evaluate —
  // the live CPU AI keeps moving the fighter, so exact-position asserts race.
  // v0.4: the ring is placed at the RENDER-interpolated position (same pass
  // that positions the fighter's root), so assert against root.position.x
  // (exact) and only loosely against the logic f.x (within a tick of run).
  await ev(`() => { const b = window.__sv.game.fighters[1]; b.x = 2.5; b.vx = 0; b.state = 'idle'; }`);
  await page.waitForTimeout(400);
  const follow = await ev(`() => { const b = window.__sv.game.fighters[1]; return { fx: +b.x.toFixed(3), rx: +b._portRing.position.x.toFixed(3), px: +b.root.position.x.toFixed(3) }; }`);
  check('ring follows fighter render x', Math.abs(follow.rx - follow.px) < 0.01, `render x=${follow.px} ring x=${follow.rx}`);
  check('ring within a tick of logic x', Math.abs(follow.rx - follow.fx) < 0.25, `fighter x=${follow.fx} ring x=${follow.rx}`);
  const ry = await ev(`() => window.__sv.game.fighters[1]._portRing.position.y`);
  check('ring stays at ground y while fighter moves', Math.abs(ry - 0.02) < 0.005, `ring y=${ry}`);

  const hc = await hudColors();
  check('hud-p1-name in P1 red', hc.n1 === P1_RGB, hc.n1);
  check('hud-p1-pct in P1 red', hc.p1 === P1_RGB, hc.p1);
  check('hud-p2-name in P2 blue', hc.n2 === P2_RGB, hc.n2);
  check('hud-p2-pct in P2 blue', hc.p2 === P2_RGB, hc.p2);

  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/mirror.png' });
  check('mirror screenshot saved', true);

  // ---------------- MIXED MATCH: ronin vs volt ----------------
  await bootAndStart(null); // defaults: ronin vs volt
  check('mixed match reached fight state', true);

  const xc = await rootColors();
  check('mixed P1 keeps ronin base', xc.p1.includes('#e23b2e') && !xc.p1.includes('#2ee2a8'), xc.p1.join(' '));
  check('mixed P2 keeps volt base (no alt tint)', xc.p2.includes('#2e9be2') && !xc.p2.includes('#e27a2e'), xc.p2.join(' '));
  const xri = await ringInfo();
  check('mixed rings: P1 red / P2 blue', xri[0].color === '#ff3b30' && xri[1].color === '#0a84ff', `${xri[0].color} / ${xri[1].color}`);
  const xhc = await hudColors();
  check('mixed HUD port colors', xhc.n1 === P1_RGB && xhc.p1 === P1_RGB && xhc.n2 === P2_RGB && xhc.p2 === P2_RGB, JSON.stringify(xhc));

  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/ports.png' });
  check('ports screenshot saved', true);

  // ---------------- errors ----------------
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
