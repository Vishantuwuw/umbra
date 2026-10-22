// End-to-end check on a real Mac: install the engine, build a bottle, run a
// Windows .exe and confirm it stays up. Run with: npx electron test/smoke.js
const { app } = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');

const home = process.env.UMBRA_HOME || path.join(__dirname, '..', '.smoke-home');
app.setPath('userData', home);
const shots = process.env.SHOTS_DIR || home;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (f) => `${String(Math.round((f ?? 0) * 100)).padStart(3)}%`;
// Progress printer that only logs when the message or a 10% step changes.
const progress = () => {
  let last = '';
  return (f, label) => {
    const key = `${Math.floor((f ?? 0) * 10)}|${(label || '').replace(/\d+/g, '')}`;
    if (key !== last) { last = key; console.log(pct(f), label); }
  };
};

app.whenReady().then(async () => {
  const store = require('../src/store');
  const engine = require('../src/engine');
  const runtime = require('../src/runtime');
  store.load();
  let onInstalled = () => {};
  runtime.init((type, p) => {
    if (type === 'log') console.log('  wine |', p.line);
    if (type === 'installed') onInstalled(p);
  });

  console.log('cpu:', await engine.cpu());
  for (const src of ['githubRelease', 'brewRelease']) {
    console.log(`${src}:`, await engine[src]().catch((e) => `unavailable (${e.message})`));
  }
  let eng = await engine.detect(null);
  if (!eng || (process.platform === 'darwin' && !/^(Umbra|CrossOver) engine$/.test(eng.source))) {
    let last = -1;
    eng = await engine.install((f, label) => {
      const step = Math.floor((f ?? 0) * 20);
      if (step !== last) { last = step; console.log(pct(f), label); }
    });
  }
  console.log('engine:', eng);
  if (!eng?.version) throw new Error('Engine did not report a version');
  runtime.setEngine(eng);

  const b = await runtime.createBottle({ name: 'Smoke Test', winver: 'win10' }, progress());

  // Run an installer; Umbra should add what it installed to the library.
  const installed = new Promise((r) => { onInstalled = r; });
  runtime.launch({ bottleId: b.id, file: path.join(__dirname, 'hello-setup.exe') });
  const result = await Promise.race([installed, sleep(180000).then(() => null)]);
  console.log('installed:', result);
  const app_ = store.get().apps.find((a) => a.name === 'Hello App' && a.bottleId === b.id);
  if (!app_) throw new Error('Installer ran but "Hello App" was not added to the library');
  console.log('PASS: installer output was added to the library ->', app_.exe);

  const run = runtime.runApp(app_.id);
  await sleep(25000);
  const alive = runtime.runningList().some((r) => r.runId === run.runId);
  try { execFileSync('/usr/sbin/screencapture', ['-x', path.join(shots, 'mac-exe-running.png')]); } catch (e) { console.log('screencapture failed:', e.message); }
  await runtime.kill(b.id);

  try {
    const where = await runtime.createMacLauncher(app_.id);
    const plist = path.join(where, 'Contents', 'Info.plist');
    if (process.platform === 'darwin') execFileSync('/usr/bin/plutil', ['-lint', plist], { stdio: 'inherit' });
    console.log(`PASS: Mac launcher created at ${where}`);
  } catch (e) { console.log(`WARN: Mac launcher failed: ${e.message}`); }

  // Pre-installed Windows tools: added to the library and Task Manager actually opens.
  const tools = runtime.addWindowsTools(b.id);
  console.log('Windows tools added:', tools.map((t) => t.name).join(', '));
  const tm = tools.find((t) => t.name === 'Task Manager');
  if (!tm) throw new Error('Task Manager was not added to the library');
  const tmRun = runtime.runApp(tm.id);
  await sleep(8000);
  const tmAlive = runtime.runningList().some((r) => r.runId === tmRun.runId);
  try { execFileSync('/usr/sbin/screencapture', ['-x', path.join(shots, 'mac-task-manager.png')]); } catch {}
  await runtime.kill(b.id);
  if (!tmAlive) throw new Error('Task Manager exited right away');
  console.log('PASS: Windows tools pre-installed and Task Manager runs');

  // Every Get Apps download link should still resolve.
  for (const item of require('../src/catalog').STORE.filter((x) => x.url)) {
    try {
      const res = await fetch(item.url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 Umbra' } });
      console.log(`${res.ok ? 'PASS' : 'WARN'}: Get Apps link for ${item.name} → HTTP ${res.status}`);
    } catch (e) { console.log(`WARN: Get Apps link for ${item.name} failed: ${e.message}`); }
  }

  // Components and DXVK: reported, not fatal, since they depend on third-party downloads.
  for (const [label, fn] of [
    ['Visual C++ component', () => runtime.installComponent(b.id, 'vcrun', progress())],
    ['DXVK', () => runtime.setDxvk(b.id, true, progress())],
  ]) {
    try { await fn(); console.log(`PASS: ${label}`); } catch (e) { console.log(`WARN: ${label} failed: ${e.message}`); }
  }

  // Steam: install it, launch it and report what its own logs say (diagnostic, not fatal).
  if (process.env.STEAM_TEST !== '0') {
    try {
      const steamApp = await runtime.installSteam(progress());
      console.log('PASS: Steam installed ->', steamApp.exe, 'args:', steamApp.args);
      const sr = runtime.runApp(steamApp.id);
      // Steam's first launch downloads and installs a large update before sign-in appears,
      // so wait (up to 25 min) for the sign-in window, then watch it for 3 more minutes.
      const logDir = path.join(path.dirname(steamApp.exe), 'logs');
      const has = (f, re) => { try { return re.test(require('fs').readFileSync(path.join(logDir, f), 'utf8')); } catch { return false; } };
      const t0 = Date.now();
      let signInAt = 0;
      for (let i = 1; Date.now() - t0 < 25 * 60000; i++) {
        await sleep(30000);
        if (!signInAt && has('webhelper.txt', /DesktopLoginWindow/)) { signInAt = Date.now(); console.log(`Steam sign-in window appeared after ${Math.round((signInAt - t0) / 1000)}s`); }
        if (i % 3 === 0 || signInAt) { try { execFileSync('/usr/sbin/screencapture', ['-x', path.join(shots, `mac-steam-${String(Math.round((Date.now() - t0) / 1000)).padStart(4, '0')}s.png`)]); } catch {} }
        if (signInAt && Date.now() - signInAt > 180000) break;
      }
      if (!signInAt) console.log('Steam sign-in window never appeared within 25 min');
      const logs = path.join(path.dirname(steamApp.exe), 'logs');
      for (const f of ['bootstrap_log.txt', 'connection_log.txt', 'webhelper.txt', 'cef_log.txt', 'stderr.txt']) {
        try {
          const txt = require('fs').readFileSync(path.join(logs, f), 'utf8').trim().split('\n').slice(-25).join('\n');
          console.log(`----- Steam ${f} (last lines) -----\n${txt}`);
        } catch {}
      }
      const read = (f) => { try { return require('fs').readFileSync(path.join(logs, f), 'utf8'); } catch { return ''; } };
      const cef = read('cef_log.txt');
      const pollFails = (cef.match(/Failed to poll auth session/g) || []).length;
      const netFails = (cef.match(/ERR_FAILED/g) || []).length;
      const connected = /\[Connected/.test(read('connection_log.txt'));
      console.log(`STEAM SUMMARY: engine=${eng.version} connected=${connected} signInPollFailures=${pollFails} cefNetErrors=${netFails} -> ${connected && !pollFails ? 'SIGN-IN OK' : 'SIGN-IN BROKEN'}`);
      await runtime.kill(b.id);
    } catch (e) { console.log(`WARN: Steam test failed: ${e.message}`); }
  }

  store.flush();
  console.log(alive ? `PASS: installed Hello App is running under Wine on ${process.platform}` : 'FAIL: Hello App exited early');
  app.exit(alive ? 0 : 1);
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
