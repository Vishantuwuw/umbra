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
  runtime.init((type, p) => type === 'log' && console.log('  wine |', p.line));

  console.log('cpu:', await engine.cpu());
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
  const exe = path.join(__dirname, 'hello.exe');
  runtime.addApp({ bottleId: b.id, exe, name: 'Hello Windows' });
  const run = runtime.launch({ bottleId: b.id, file: exe, name: 'hello.exe' });
  await sleep(25000);
  const alive = runtime.runningList().some((r) => r.runId === run.runId);
  try { execFileSync('/usr/sbin/screencapture', ['-x', path.join(shots, 'mac-exe-running.png')]); } catch (e) { console.log('screencapture failed:', e.message); }
  await runtime.kill(b.id);
  store.flush();
  console.log(alive ? `PASS: hello.exe is running under Wine on ${process.platform}` : 'FAIL: hello.exe exited early');
  app.exit(alive ? 0 : 1);
}).catch((e) => {
  console.error(e);
  app.exit(1);
});
