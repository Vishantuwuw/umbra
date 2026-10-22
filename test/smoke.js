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
  if (!eng || (process.platform === 'darwin' && eng.source !== 'Umbra engine')) {
    let last = -1;
    eng = await engine.install((f, label) => {
      const step = Math.floor((f ?? 0) * 20);
      if (step !== last) { last = step; console.log(pct(f), label); }
    });
  }
  console.log('engine:', eng);
  if (!eng?.version) throw new Error('Engine did not report a version');
  runtime.setEngine(eng);

  const b = await runtime.createBottle({ name: 'Smoke Test', winver: 'win10' }, (f, l) => console.log(pct(f), l));

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
  store.flush();
  console.log(alive ? `PASS: installed Hello App is running under Wine on ${process.platform}` : 'FAIL: Hello App exited early');
  app.exit(alive ? 0 : 1);
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
