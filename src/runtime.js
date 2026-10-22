// Bottles (isolated Windows environments, i.e. Wine prefixes) and running
// Windows programs inside them.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');
const store = require('./store');
const engine = require('./engine');

const STEAM_SETUP_URL = 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe';
const STEAM_ARGS = '-cef-disable-gpu -cef-disable-sandbox';
const SKIP_EXE = /(unins|uninstall|setup|install|update|crash|report|helper|redist|vcredist|dxsetup|dotnet|directx|notification|service|webhelper|7z|^winver|^cef)/i;
const SKIP_DIR = /^(windows|common files|internet explorer|windows media player|windows nt|windowspowershell|microsoft\.net)$/i;

let wine = null; // { path, version, source }
const running = new Map(); // runId -> { child, appId, bottleId, name, started }
let runSeq = 0;
let emit = () => {};

function init(onEvent) { emit = onEvent; }
function setEngine(e) { wine = e; }
function getEngine() { return wine; }

function log(line, level = 'info') {
  emit('log', { t: Date.now(), level, line });
}

function bottlesRoot() {
  return path.join(app.getPath('userData'), 'bottles');
}

function bottle(id) {
  const b = store.get().bottles.find((x) => x.id === id);
  if (!b) throw new Error('Bottle not found');
  return b;
}

function prefixOf(b) {
  return path.join(bottlesRoot(), b.id);
}

function requireEngine() {
  if (!wine) throw new Error('No Wine engine installed yet. Open Engine and install it first.');
  return wine.path;
}

function wineEnv(b, extra = {}) {
  const s = store.get().settings;
  const env = {
    ...process.env,
    PATH: engine.envPath(),
    WINEPREFIX: prefixOf(b),
    WINEDEBUG: s.verboseLogs ? 'err+all,warn+all,fixme-all' : '-all',
    WINEDLLOVERRIDES: 'winemenubuilder.exe=d',
    WINEMSYNC: s.msync ? '1' : '0',
    WINEESYNC: s.esync ? '1' : '0',
    ...extra,
  };
  if (s.metalHud) env.MTL_HUD_ENABLED = '1';
  return env;
}

// Runs wine with args and resolves when it exits; output is streamed to the console.
function wineRun(b, args, { env = {}, cwd, tag } = {}) {
  const bin = requireEngine();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: wineEnv(b, env), cwd: cwd || prefixOf(b) });
    pipe(child, tag || b.name);
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
}

function pipe(child, tag) {
  for (const [stream, level] of [[child.stdout, 'info'], [child.stderr, 'warn']]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) if (l.trim()) log(`[${tag}] ${l}`, level);
    });
  }
}

function slug(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'bottle';
  const ids = new Set(store.get().bottles.map((b) => b.id));
  let id = base;
  for (let i = 2; ids.has(id); i++) id = `${base}-${i}`;
  return id;
}

async function createBottle({ name, winver = 'win10' }, onProgress = () => {}) {
  requireEngine();
  const b = { id: slug(name), name: name.trim() || 'Bottle', winver, created: Date.now(), retina: false };
  fs.mkdirSync(prefixOf(b), { recursive: true });
  store.get().bottles.push(b);
  store.save();
  emit('running');
  log(`Creating bottle “${b.name}” at ${prefixOf(b)}`);
  // wineboot gives no progress of its own, so ease toward 75% while it works.
  let pct = 0.05;
  const creep = setInterval(() => { pct += (0.75 - pct) * 0.06; onProgress(pct, 'Building Windows environment…'); }, 400);
  try {
    // Mono/Gecko are skipped so the first boot never blocks on download prompts.
    await wineRun(b, ['wineboot', '--init'], { env: { WINEDLLOVERRIDES: 'mscoree,mshtml=;winemenubuilder.exe=d' } });
  } finally {
    clearInterval(creep);
  }
  onProgress(0.8, `Setting Windows version to ${winver}…`);
  await wineRun(b, ['winecfg', '-v', winver]);
  await waitServer(b);
  b.ready = true;
  store.save();
  onProgress(1, 'Bottle ready');
  log(`Bottle “${b.name}” is ready`);
  return b;
}

async function waitServer(b) {
  const server = engine.wineserverFor(wine.path);
  if (!server) return;
  await new Promise((resolve) => {
    const child = spawn(server, ['-w'], { env: wineEnv(b) });
    child.on('exit', resolve);
    child.on('error', resolve);
  });
}

async function deleteBottle(id) {
  const b = bottle(id);
  await kill(id).catch(() => {});
  fs.rmSync(prefixOf(b), { recursive: true, force: true });
  const s = store.get();
  s.bottles = s.bottles.filter((x) => x.id !== id);
  s.apps = s.apps.filter((a) => a.bottleId !== id);
  store.save();
  log(`Deleted bottle “${b.name}”`);
}

async function setWinver(id, winver) {
  const b = bottle(id);
  await wineRun(b, ['winecfg', '-v', winver]);
  b.winver = winver;
  store.save();
}

async function setRetina(id, on) {
  const b = bottle(id);
  await wineRun(b, ['reg', 'add', 'HKCU\\Software\\Wine\\Mac Driver', '/v', 'RetinaMode', '/t', 'REG_SZ', '/d', on ? 'y' : 'n', '/f']);
  b.retina = on;
  store.save();
}

function argsFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.msi') return ['msiexec', '/i', file];
  if (ext === '.bat' || ext === '.cmd') return ['cmd', '/c', file];
  if (ext === '.lnk') return ['start', '/unix', file];
  return [file];
}

function splitArgs(s) {
  return (s || '').match(/"[^"]*"|\S+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [];
}

// Launches a Windows program without waiting for it; tracks it as running.
function launch({ bottleId, file, args = '', appId = null, name }) {
  const bin = requireEngine();
  const b = bottle(bottleId);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const runId = ++runSeq;
  const label = name || path.basename(file);
  const child = spawn(bin, [...argsFor(file), ...splitArgs(args)], { env: wineEnv(b), cwd: path.dirname(file) });
  const entry = { runId, appId, bottleId, name: label, started: Date.now(), pid: child.pid };
  running.set(runId, { ...entry, child });
  pipe(child, label);
  log(`▶ Launching ${label} in “${b.name}”`);
  store.get().settings.lastBottleId = bottleId;
  if (appId) {
    const a = store.get().apps.find((x) => x.id === appId);
    if (a) a.lastPlayed = Date.now();
  }
  store.save();
  const done = (code) => {
    if (!running.has(runId)) return;
    running.delete(runId);
    const secs = Math.round((Date.now() - entry.started) / 1000);
    if (appId) {
      const a = store.get().apps.find((x) => x.id === appId);
      if (a) a.playtime = (a.playtime || 0) + secs;
      store.save();
    }
    log(`■ ${label} exited (code ${code ?? '?'}) after ${secs}s`, code ? 'warn' : 'info');
    emit('running');
  };
  child.on('exit', done);
  child.on('error', (e) => { log(`${label}: ${e.message}`, 'error'); done(-1); });
  emit('running');
  return entry;
}

function runningList() {
  return [...running.values()].map(({ child, ...rest }) => rest);
}

function stop(runId) {
  const r = running.get(runId);
  if (r) r.child.kill('SIGTERM');
}

async function kill(bottleId) {
  const b = bottle(bottleId);
  const server = wine && engine.wineserverFor(wine.path);
  if (server) {
    await new Promise((resolve) => {
      const c = spawn(server, ['-k'], { env: wineEnv(b) });
      c.on('exit', resolve);
      c.on('error', resolve);
    });
  }
  for (const r of running.values()) if (r.bottleId === bottleId) r.child.kill('SIGKILL');
  log(`Stopped everything in “${b.name}”`);
}

function tool(bottleId, name) {
  const tools = { winecfg: 'winecfg', regedit: 'regedit', taskmgr: 'taskmgr', explorer: 'explorer', cmd: 'wineconsole', control: 'control' };
  const b = bottle(bottleId);
  const bin = requireEngine();
  const args = name === 'cmd' ? ['wineconsole', 'cmd'] : [tools[name]];
  if (!args[0]) throw new Error(`Unknown tool ${name}`);
  const child = spawn(bin, args, { env: wineEnv(b), cwd: prefixOf(b) });
  pipe(child, `${b.name}:${name}`);
  log(`Opened ${name} in “${b.name}”`);
}

function driveC(bottleId) {
  return path.join(prefixOf(bottle(bottleId)), 'drive_c');
}

function walk(dir, depth, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !SKIP_DIR.test(e.name)) walk(p, depth - 1, out);
    else if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name)) out.push(p);
  }
}

// Finds programs that were installed into a bottle so they can be added to the library.
function scan(bottleId) {
  const c = driveC(bottleId);
  const roots = ['Program Files', 'Program Files (x86)', 'Games', 'GOG Games'].map((r) => path.join(c, r));
  const users = path.join(c, 'users');
  try {
    for (const u of fs.readdirSync(users)) roots.push(path.join(users, u, 'AppData', 'Local', 'Programs'), path.join(users, u, 'Desktop'));
  } catch {}
  const found = [];
  for (const r of roots) walk(r, 3, found);
  const known = new Set(store.get().apps.map((a) => a.exe));
  return found.filter((f) => !known.has(f)).map((exe) => ({ exe, name: prettyName(exe) }));
}

function prettyName(exe) {
  const base = path.basename(exe, path.extname(exe));
  const parent = path.basename(path.dirname(exe));
  const n = base.length <= 3 || /^(game|launcher|bin|start|play)$/i.test(base) ? parent : base;
  return n.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function addApp({ bottleId, exe, name, args = '' }) {
  bottle(bottleId);
  const a = { id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, bottleId, exe, name: name || prettyName(exe), args, added: Date.now(), playtime: 0 };
  store.get().apps.push(a);
  store.save();
  return a;
}

function updateApp(id, patch) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  for (const k of ['name', 'args', 'bottleId', 'exe']) if (patch[k] !== undefined) a[k] = patch[k];
  store.save();
  return a;
}

function removeApp(id) {
  const s = store.get();
  s.apps = s.apps.filter((a) => a.id !== id);
  store.save();
}

function runApp(id) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  return launch({ bottleId: a.bottleId, file: a.exe, args: a.args, appId: a.id, name: a.name });
}

function findSteam(b) {
  const c = path.join(prefixOf(b), 'drive_c');
  return ['Program Files (x86)/Steam/steam.exe', 'Program Files/Steam/steam.exe']
    .map((p) => path.join(c, p)).find((p) => fs.existsSync(p)) || null;
}

function steamStatus() {
  const s = store.get();
  const b = s.bottles.find((x) => x.steam);
  const exe = b && findSteam(b);
  const appEntry = exe && s.apps.find((a) => a.exe === exe);
  return { bottleId: b?.id || null, installed: !!exe, appId: appEntry?.id || null };
}

async function installSteam(onProgress) {
  requireEngine();
  const s = store.get();
  let b = s.bottles.find((x) => x.steam);
  if (!b) {
    b = await createBottle({ name: 'Steam', winver: 'win10' }, (f, label) => onProgress(f * 0.35, label));
    b.steam = true;
    store.save();
  }
  const setup = path.join(engine.cacheDir(), 'SteamSetup.exe');
  if (!fs.existsSync(setup)) {
    await engine.download(STEAM_SETUP_URL, setup, (f) => onProgress(0.35 + (f ?? 0) * 0.25, 'Downloading Steam installer…'));
  }
  onProgress(0.62, 'Installing Steam for Windows…');
  await wineRun(b, [setup, '/S'], { tag: 'SteamSetup' });
  await waitServer(b);
  const exe = findSteam(b);
  if (!exe) throw new Error('Steam installer finished but steam.exe was not found. Check the Console for details.');
  let a = s.apps.find((x) => x.exe === exe);
  if (!a) a = addApp({ bottleId: b.id, exe, name: 'Steam', args: STEAM_ARGS });
  onProgress(1, 'Steam is installed');
  return a;
}

module.exports = {
  init, setEngine, getEngine, createBottle, deleteBottle, setWinver, setRetina, launch, runningList, stop, kill,
  tool, driveC, scan, addApp, updateApp, removeApp, runApp, steamStatus, installSteam, prefixOf, bottle,
};
