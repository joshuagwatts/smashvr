/* verify/fight_facing.mjs — v0.43 in-match proof: import Mushy through the
   real roster path, start a real fight via the debug hook, screenshot —
   Mushy (VRM0) must face his opponent, not away from him. */
import { chromium } from 'playwright-core';
import { execSync } from 'child_process';
import fs from 'fs';

let shell = '';
try {
  shell = execSync('find /root/.cache/ms-playwright /tmp /opt/meta-chromium -maxdepth 4 \\( -name "chrome-headless-shell" -o -name "chrome" \\) -type f 2>/dev/null | head -1').toString().trim();
} catch (e) { /* fall through */ }
if (!shell) shell = '/opt/meta-chromium/chrome';

fs.writeFileSync('/tmp/smashvrm-bootstrap.html', '<script>location.replace("http://127.0.0.1:8902/smashvrm/index.html?debug=1")</script>');
const browser = await chromium.launch({ executablePath: shell, args: ['--no-sandbox', '--allow-file-access-from-files', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__sv && window.__sv.startSlots, { timeout: 30000 });
const info = await page.evaluate(async () => {
  const roster = await import('./js/roster.js?v=42');
  const blob = await (await fetch('http://127.0.0.1:8902/user/files/Mushy.vrm')).blob();
  const res = await roster.importCharacter(new File([blob], 'Mushy.vrm'));
  window.__sv.startSlots([
    { def: res.id, ctrl: 'cpu', team: null },
    { def: 'ronin', ctrl: 'cpu', team: null },
  ], 'cpu');
  return res;
});
console.log('import:', JSON.stringify(info));
await page.waitForFunction(() => window.__sv.game && window.__sv.game.state === 'fight', { timeout: 30000 });
await page.waitForTimeout(3500); // let attachCustoms land the model + fight settle
const facing = await page.evaluate(async () => {
  const THREE = await import('three');
  const g = window.__sv.game;
  const [a, b] = g.fighters;
  // world toe direction of fighter A's attached model
  let toe = null;
  if (a.vrm) {
    const H = a.vrm.vrm.humanoid;
    const fp = new THREE.Vector3(), tp = new THREE.Vector3();
    let sx = 0, sz = 0, n = 0;
    for (const side of ['left', 'right']) {
      const f = H.getNormalizedBoneNode(side + 'Foot');
      const t = H.getNormalizedBoneNode(side + 'Toes');
      if (!f || !t) continue;
      f.getWorldPosition(fp); t.getWorldPosition(tp);
      sx += tp.x - fp.x; sz += tp.z - fp.z; n++;
    }
    if (n) { const v = new THREE.Vector3(sx, 0, sz).normalize(); toe = { x: +v.x.toFixed(2), z: +v.z.toFixed(2) }; }
  }
  return { aDef: a.defId, aFacing: a.facing, ax: +a.x.toFixed(2), bx: +b.x.toFixed(2), toe, hasVRM: !!a.vrm };
});
console.log('fight state:', JSON.stringify(facing));
await page.screenshot({ path: '/home/hatch/workspace/smashvrm/verify/v043_fight_mushy.png' });
console.log('page errors:', errors.length ? errors.join(' | ') : 'none');
await browser.close();
const toward = facing.toe && facing.ax < facing.bx ? facing.toe.x > 0.5 : facing.toe && facing.toe.x < -0.5;
console.log(facing.hasVRM && toward ? 'ok - Mushy faces his opponent in-match' : 'FAIL - Mushy not facing opponent');
process.exit(facing.hasVRM && toward ? 0 : 1);
