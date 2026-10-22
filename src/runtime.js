// Bottles (isolated Windows environments, i.e. Wine prefixes) and running
// Windows programs inside them.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { app } = require('electron');
const store = require('./store');
const engine = require('./engine');
const icons = require('./icons');
const steamlib = require('./steamlib');

const STEAM_SETUP_URL = 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe';
const STEAM_ARGS = '-cef-disable-gpu -cef-disable-sandbox';
const SKIP_EXE = /(unins|uninstall|setup|install|update|crash|report|helper|redist|vcredist|dxsetup|dotnet|directx|notification|service|webhelper|7z|^winver|^cef)/i;
const INSTALLER = /(setup|install|^inst[_-]|_inst\b)/i;
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
  const installer = !appId && isInstaller(file);
  const before = installer ? snapshot(b.id) : null;
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
    const { stopped } = running.get(runId);
    running.delete(runId);
    const secs = Math.round((Date.now() - entry.started) / 1000);
    if (appId) {
      const a = store.get().apps.find((x) => x.id === appId);
      if (a) a.playtime = (a.playtime || 0) + secs;
      store.save();
    }
    log(`■ ${label} exited (code ${code ?? '?'}) after ${secs}s`, code ? 'warn' : 'info');
    emit('running');
    if (code && !stopped && !installer && secs < 6) emit('crashed', { name: label, code });
    if (installer) trackInstall(b, before, label).catch((e) => log(`Could not detect installed apps: ${e.message}`, 'warn'));
    if (/^steam\.exe$/i.test(path.basename(file))) {
      const added = importSteamGames(b.id);
      if (added.length) emit('installed', { bottleId: b.id, installer: 'Steam', added: added.map((a) => a.name), candidates: [] });
    }
  };
  child.on('exit', done);
  child.on('error', (e) => { log(`${label}: ${e.message}`, 'error'); done(-1); });
  emit('running');
  return entry;
}

function runningList() {
  return [...running.values()].map(({ child, stopped, ...rest }) => rest);
}

function stop(runId) {
  const r = running.get(runId);
  if (r) { r.stopped = true; r.child.kill('SIGTERM'); }
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
  for (const r of running.values()) if (r.bottleId === bottleId) { r.stopped = true; r.child.kill('SIGKILL'); }
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

function walk(dir, depth, out, ext = /\.exe$/i) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !SKIP_DIR.test(e.name)) walk(p, depth - 1, out, ext);
    else if (e.isFile() && ext.test(e.name) && !SKIP_EXE.test(e.name)) out.push(p);
  }
}

function userDirs(c) {
  try { return fs.readdirSync(path.join(c, 'users')).map((u) => path.join(c, 'users', u)); } catch { return []; }
}

// Every program in a bottle's usual install locations, including Steam games.
function listExes(bottleId) {
  const c = driveC(bottleId);
  const found = [];
  const pf = ['Program Files', 'Program Files (x86)'].map((r) => path.join(c, r));
  for (const r of [...pf, path.join(c, 'Games'), path.join(c, 'GOG Games')]) walk(r, 3, found);
  for (const r of pf) walk(path.join(r, 'Steam', 'steamapps', 'common'), 2, found);
  for (const u of userDirs(c)) {
    walk(path.join(u, 'AppData', 'Local', 'Programs'), 3, found);
    walk(path.join(u, 'Desktop'), 1, found);
  }
  return [...new Set(found)];
}

// Start Menu and Desktop shortcuts, which installers create for their main programs.
function listShortcuts(bottleId) {
  const c = driveC(bottleId);
  const found = [];
  const menus = [path.join(c, 'ProgramData', 'Microsoft', 'Windows', 'Start Menu')];
  for (const u of userDirs(c)) menus.push(path.join(u, 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu'), path.join(u, 'Desktop'));
  for (const m of menus) walk(m, 4, found, /\.lnk$/i);
  return found;
}

// Finds programs that were installed into a bottle so they can be added to the library.
function scan(bottleId) {
  const known = new Set(store.get().apps.map((a) => a.exe));
  return listExes(bottleId).filter((f) => !known.has(f)).map((exe) => ({ exe, name: prettyName(exe) }));
}

function isInstaller(file) {
  return /\.msi$/i.test(file) || INSTALLER.test(path.basename(file));
}

function snapshot(bottleId) {
  return { exes: new Set(listExes(bottleId)), lnks: new Set(listShortcuts(bottleId)) };
}

// .lnk files store their target path as plain or UTF-16 text, so a name match is enough.
function shortcutTargets(lnk, exe) {
  let buf;
  try { buf = fs.readFileSync(lnk); } catch { return false; }
  const name = path.basename(exe).toLowerCase();
  return buf.toString('latin1').toLowerCase().includes(name) || buf.toString('utf16le').toLowerCase().includes(name);
}

// After an installer finishes, adds what it installed to the library.
async function trackInstall(b, before, label) {
  log(`Installer finished — looking for what ${label} installed…`);
  // Installers often hand off to child processes; wait for the bottle to go idle (capped,
  // since "launch now" checkboxes can start the installed app right away).
  await Promise.race([waitServer(b), new Promise((r) => setTimeout(r, 120000))]);
  const known = new Set(store.get().apps.map((a) => a.exe));
  const exes = listExes(b.id).filter((e) => !before.exes.has(e) && !known.has(e));
  const lnks = listShortcuts(b.id).filter((l) => !before.lnks.has(l));
  const picks = [];
  for (const exe of exes) {
    const lnk = lnks.find((l) => shortcutTargets(l, exe));
    if (lnk) picks.push({ exe, name: path.basename(lnk, '.lnk') });
  }
  if (!picks.length && exes.length <= 2) picks.push(...exes.map((exe) => ({ exe, name: prettyName(exe) })));
  const added = picks.slice(0, 5).map((p) => addApp({ bottleId: b.id, exe: p.exe, name: p.name }));
  const rest = exes.filter((e) => !added.some((a) => a.exe === e)).map((exe) => ({ exe, name: prettyName(exe) }));
  log(added.length ? `Added to Library: ${added.map((a) => a.name).join(', ')}` : `${exes.length} new program(s) found in “${b.name}”`);
  emit('installed', { bottleId: b.id, installer: label, added: added.map((a) => a.name), candidates: added.length ? [] : rest });
}

function prettyName(exe) {
  const base = path.basename(exe, path.extname(exe));
  const parent = path.basename(path.dirname(exe));
  const n = base.length <= 3 || /^(game|launcher|bin|start|play)$/i.test(base) ? parent : base;
  return n.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function addApp({ bottleId, exe, name, args = '', steamAppId }) {
  bottle(bottleId);
  const game = steamAppId ? null : steamlib.gameForExe(exe);
  const a = {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bottleId, exe, name: game?.name || name || prettyName(exe), args, added: Date.now(), playtime: 0,
    steamAppId: steamAppId || game?.appid || null,
    icon: icons.extract(exe),
  };
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

// Fills in icons for apps added before icon support, or whose exe changed.
function refreshIcons() {
  let changed = false;
  for (const a of store.get().apps) {
    if (a.icon && fs.existsSync(a.icon)) continue;
    const icon = icons.extract(a.exe);
    if (icon) { a.icon = icon; changed = true; }
  }
  if (changed) store.save();
}

// Adds every installed Steam game in a bottle that isn't in the library yet.
function importSteamGames(bottleId) {
  const known = new Set(store.get().apps.map((a) => a.exe.toLowerCase()));
  const games = steamlib.installedGames(driveC(bottleId)).filter((g) => !known.has(g.exe.toLowerCase()));
  const added = games.map((g) => addApp({ bottleId, exe: g.exe, name: g.name, steamAppId: g.steamAppId }));
  if (added.length) log(`Imported from Steam: ${added.map((a) => a.name).join(', ')}`);
  return added;
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
  let appEntry = exe && s.apps.find((a) => a.exe === exe);
  if (exe && !appEntry) appEntry = addApp({ bottleId: b.id, exe, name: 'Steam', args: STEAM_ARGS });
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
  tool, driveC, scan, isInstaller, addApp, refreshIcons, importSteamGames, updateApp, removeApp, runApp, steamStatus, installSteam, prefixOf, bottle,
};
