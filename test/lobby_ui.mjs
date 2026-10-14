/* test/lobby_ui.mjs — v0.11 lobby UI + solo-host match flow in Chromium.
   Exercises the real UI: title -> ONLINE -> create (code shown) -> fighter
   pick -> ready -> host config -> START -> net match runs with keyboard
   input, HUD chips, no waiting stall, zero console/page errors.
   Two-player P2P join is NOT possible headless (UDP wall); the 2-player
   lobby RENDERING is verified by injecting a fake guest hello into the
   host's Lobby (protocol-level, same as netproto.mjs's fake channels).
   Run: node test/lobby_ui.mjs (needs http.server 8902 + fwdproxy 8899) */
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
];
const browser = await chromium.launch({ executablePath: shell, args: BROWSER_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
const ev = (expr) => page.evaluate(expr.trimStart().startsWith('() =>') ? `(${expr})()` : expr);

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok' : 'FAIL') + ' - ' + n + (x && !c ? ' — ' + x : '')); };

await page.goto('file:///tmp/smashvrm-bootstrap.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForURL('http://127.0.0.1:8902/**', { timeout: 30000 });
await page.waitForFunction(() => {
  const b = document.getElementById('btn-online');
  return b && !document.getElementById('screen-title').classList.contains('hidden');
}, { timeout: 60000 });
check('title shows ONLINE button', true);

// ---- online screen ----
await page.click('#btn-online');
await page.waitForFunction(() => !document.getElementById('screen-online').classList.contains('hidden'), { timeout: 10000 });
check('ONLINE opens online screen', true);
await page.fill('#net-name', 'Host');
await page.click('#btn-net-create');
await page.waitForFunction(() => !document.getElementById('screen-lobby').classList.contains('hidden'), { timeout: 45000 });
const code = await ev(`() => document.getElementById('lobby-code').textContent`);
check('lobby shows 6-char code', /^[A-Z0-9]{6}$/.test(code), code);
check('host listed as player 1', await ev(`() => window.__sv.net.lobby.players.length === 1`));
check('invite link format', await ev(`() => location.origin + location.pathname + '#net=' + window.__sv.net.lobby.code`).then((u) => /#net=[A-Z0-9]{6}$/.test(u)));

// ---- 2-player lobby rendering via injected guest hello ----
await ev(`() => window.__sv.net.lobby.hostOnMsg({ k: 'hello', name: 'Guest' }, 'fakecid1')`);
await page.waitForTimeout(300);
check('guest hello adds 2nd row', await ev(`() => document.querySelectorAll('#lobby-players .lrow:not(.empty)').length === 2`));
await ev(`() => window.__sv.net.lobby.hostOnMsg({ k: 'pick', def: 'volt' }, 'fakecid1')`);
await page.waitForTimeout(300);
check('guest fighter pick renders', await ev(`() => [...document.querySelectorAll('#lobby-players .ldef')][1].value === 'volt'`));
// host picks wisp for self via the real select
await page.selectOption('#lobby-players .lrow.me .ldef', 'wisp');
await page.waitForTimeout(300);
check('host fighter pick via UI', await ev(`() => window.__sv.net.lobby.players[0].def === 'wisp'`));
// ready up: host clicks own ready button, guest via protocol
await page.click('#lobby-players .lrow.me .btn.small');
await ev(`() => window.__sv.net.lobby.hostOnMsg({ k: 'ready', ready: true }, 'fakecid1')`);
await page.waitForTimeout(300);
check('all ready -> START enabled', await ev(`() => { const b = document.getElementById('btn-lobby-start'); return !b.disabled && !b.classList.contains('hidden'); }`));
// host config: teams mode + 2 CPUs
await page.click('#btn-mode-teams');
await page.click('#btn-cpu-inc');
await page.waitForTimeout(300);
check('teams mode set', await ev(`() => window.__sv.net.lobby.config.mode === 'teams'`));
check('cpu count 2', await ev(`() => window.__sv.net.lobby.config.cpus === 2`));
// guest leaves (back to solo for the match-start flow)
await ev(`() => window.__sv.net.lobby.hostOnMsg({ k: 'bye' }, 'fakecid1')`);
await page.click('#btn-mode-ffa');
await page.waitForTimeout(200);

// ---- start solo-host match (1 human + 1 CPU): must run, not wait ----
await page.click('#btn-lobby-start');
await page.waitForTimeout(1500);
const started = await ev(`() => !!window.__sv.net.driver && !!window.__sv.game && window.__sv.game._net === window.__sv.net.driver`);
check('match started, driver attached', started);
check('host is player idx 0', await ev(`() => window.__sv.net.driver.myIdx === 0`));
check('lobby screen hidden', await ev(`() => document.getElementById('screen-lobby').classList.contains('hidden')`));
check('hud visible', await ev(`() => !document.getElementById('hud').classList.contains('hidden')`));

// countdown -> fight, then keyboard input must reach the driver's net log
// (direction asserts are flaky — the live CPU can knock the fighter around)
await page.waitForFunction(() => window.__sv.game && window.__sv.game.state === 'fight', { timeout: 15000 });
check('reached fight state', true);
await page.keyboard.down('d'); // P1 map: KeyD = right
await page.waitForTimeout(700);
await page.keyboard.up('d');
const sawInput = await ev(`() => {
  const logs = window.__sv.net.driver.logs[0];
  const t = window.__sv.game._tick;
  let n = 0;
  for (let s = Math.max(1, t - 60); s <= t; s++) if (logs[s]) n++;
  return n;
}`);
check('keyboard input sampled into net log', sawInput > 10, `non-blank inputs in last 60 ticks: ${sawInput}`);
check('no waiting stall (solo host)', await ev(`() => !window.__sv.net.driver.waiting`));
check('waiting indicator hidden', await ev(`() => document.getElementById('net-waiting').classList.contains('hidden')`));
await page.waitForFunction(() => window.__sv.game && window.__sv.game._tick > 100, { timeout: 15000 });
check('sim advancing', true);
check('HUD chips show player name', await ev(`() => document.querySelector('#hud-left .hud-name').textContent.includes('Host')`));
const pageErrs = errors.filter((e) => !e.includes('favicon'));
check('zero console/page errors', pageErrs.length === 0, pageErrs.slice(0, 3).join(' | '));

// ---- pause is disabled online (would desync); Esc must not pause ----
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc does not pause net match', await ev(`() => !window.__sv.game.paused && document.getElementById('screen-pause').classList.contains('hidden')`));

// ---- leave via the HUD button (pause is disabled online) ----
check('leave-match button visible', await ev(`() => !document.getElementById('btn-net-leave').classList.contains('hidden')`));
await page.click('#btn-net-leave');
await page.waitForTimeout(500);
check('leave returns to title', await ev(`() => !document.getElementById('screen-title').classList.contains('hidden')`));

await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
