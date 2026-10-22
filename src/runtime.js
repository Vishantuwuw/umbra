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
const components = require('./components');
const catalog = require('./catalog');

const STEAM_SETUP_URL = 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe';
// Steam's built-in browser (sign-in, store, library) needs its sandbox and GPU
// acceleration turned off to load under Wine.
const STEAM_ARGS = '-no-cef-sandbox -cef-disable-gpu -cef-disable-gpu-compositing';
const OLD_STEAM_ARGS = ['-cef-disable-gpu -cef-disable-sandbox'];
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
  if (s.settings.lastBottleId === id) s.settings.lastBottleId = null;
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

function rt() {
  return { wine: requireEngine(), env: wineEnv, prefix: prefixOf, waitServer, log };
}

function installComponent(bottleId, id, onProgress) {
  return components.install(rt(), bottle(bottleId), id, onProgress);
}

function runWinetricks(bottleId, verb, onProgress) {
  return components.winetricks(rt(), bottle(bottleId), verb, onProgress);
}

const DXVK_API = 'https://api.github.com/repos/Gcenx/DXVK-macOS/releases?per_page=10';

function copyDlls(from, to) {
  const names = [];
  if (!fs.existsSync(from)) return names;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    if (!/\.dll$/i.test(f)) continue;
    fs.copyFileSync(path.join(from, f), path.join(to, f));
    names.push(f.replace(/\.dll$/i, '').toLowerCase());
  }
  return names;
}

function findDir(root, name, depth = 4) {
  if (depth < 0) return null;
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) if (e.isDirectory() && e.name === name) return path.join(root, e.name);
  for (const e of entries) if (e.isDirectory()) { const hit = findDir(path.join(root, e.name), name, depth - 1); if (hit) return hit; }
  return null;
}

// DXVK-macOS translates DirectX 10/11 to Vulkan, which MoltenVK runs on Metal.
async function setDxvk(bottleId, on, onProgress = () => {}) {
  const b = bottle(bottleId);
  const key = 'HKCU\\Software\\Wine\\DllOverrides';
  if (!on) {
    for (const dll of b.dxvk || []) await wineRun(b, ['reg', 'delete', key, '/v', dll, '/f']);
    b.dxvk = null;
    store.save();
    return;
  }
  onProgress(0.05, 'Finding the latest DXVK-macOS…');
  const headers = { 'User-Agent': 'Umbra', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(DXVK_API, { headers });
  if (!res.ok) throw new Error(`Could not reach DXVK-macOS releases (HTTP ${res.status})`);
  const assets = (await res.json()).flatMap((r) => r.assets || []).filter((a) => /\.tar\.(gz|xz)$/.test(a.name));
  // Prefer the drop-in build (x64/x32 folders) over the "-builtin" one made for Wine's own lib dir.
  const asset = assets.find((a) => !/builtin/i.test(a.name)) || assets[0];
  if (!asset) throw new Error('No DXVK-macOS build found');
  const archive = path.join(engine.cacheDir(), asset.name);
  if (!fs.existsSync(archive)) await engine.download(asset.browser_download_url, archive, (f) => onProgress(0.1 + (f ?? 0) * 0.5, `Downloading ${asset.name}…`));
  onProgress(0.65, 'Installing DXVK into the bottle…');
  const tmp = path.join(engine.cacheDir(), 'dxvk-unpack');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  await engine.exec('tar', ['-xf', archive, '-C', tmp]);
  const win = path.join(prefixOf(b), 'drive_c', 'windows');
  const dlls = [...new Set([
    ...copyDlls(findDir(tmp, 'x64') || findDir(tmp, 'x86_64-windows', 6) || '', path.join(win, 'system32')),
    ...copyDlls(findDir(tmp, 'x32') || findDir(tmp, 'i386-windows', 6) || '', path.join(win, 'syswow64')),
  ])];
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!dlls.length) throw new Error('The DXVK download had no DLLs in it');
  for (const dll of dlls) await wineRun(b, ['reg', 'add', key, '/v', dll, '/t', 'REG_SZ', '/d', 'native', '/f']);
  b.dxvk = dlls;
  store.save();
  log(`DXVK enabled in “${b.name}” (${dlls.join(', ')})`);
  onProgress(1, 'DXVK enabled');
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
  const appEntry = appId && store.get().apps.find((x) => x.id === appId);
  const child = spawn(bin, [...argsFor(file), ...splitArgs(args)], { env: wineEnv(b, appEntry?.hud ? { MTL_HUD_ENABLED: '1' } : {}), cwd: path.dirname(file) });
  const entry = { runId, appId, bottleId, name: label, started: Date.now(), pid: child.pid, exe: file };
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
async function trackInstall(b, before, label, quiet = false) {
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
  const result = { bottleId: b.id, installer: label, added: added.map((a) => a.name), candidates: added.length ? [] : rest };
  if (!quiet) emit('installed', result);
  return { added, rest };
}

function prettyName(exe) {
  const base = path.basename(exe, path.extname(exe));
  const parent = path.basename(path.dirname(exe));
  const n = base.length <= 3 || /^(game|launcher|bin|start|play)$/i.test(base) ? parent : base;
  return n.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

function addApp({ bottleId, exe, name, args = '', steamAppId, category, catalogId }) {
  bottle(bottleId);
  const game = steamAppId ? null : steamlib.gameForExe(exe);
  const a = {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bottleId, exe, name: game?.name || name || prettyName(exe), args, added: Date.now(), playtime: 0,
    steamAppId: steamAppId || game?.appid || null,
    icon: icons.extract(exe),
    iconFor: exe,
    ...(category ? { category } : {}),
    ...(catalogId ? { catalogId } : {}),
  };
  store.get().apps.push(a);
  store.save();
  return a;
}

function updateApp(id, patch) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  for (const k of ['name', 'args', 'bottleId', 'exe', 'favorite', 'hud']) if (patch[k] !== undefined) a[k] = patch[k];
  store.save();
  return a;
}

// Fills in icons for apps added before icon support, or whose exe changed.
// Each exe is only tried once (iconFor records it), since exes without an icon
// would otherwise be re-read in full on every launch.
function refreshIcons() {
  let changed = false;
  for (const a of store.get().apps) {
    if (a.icon && fs.existsSync(a.icon)) continue;
    if (a.iconFor === a.exe) continue;
    a.icon = icons.extract(a.exe);
    a.iconFor = a.exe;
    changed = true;
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

const shq = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;

// Builds ~/Applications/Umbra/<name>.app, a tiny launcher that starts the app
// straight through Wine so it shows up in Launchpad, Spotlight and the Dock.
async function createMacLauncher(id) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  const b = bottle(a.bottleId);
  const bin = requireEngine();
  const safe = a.name.replace(/[\/:*?"<>|]/g, '').trim() || 'Windows App';
  const root = path.join(app.getPath('home'), 'Applications', 'Umbra', `${safe}.app`);
  const contents = path.join(root, 'Contents');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  const env = wineEnv(b);
  const keep = ['WINEPREFIX', 'WINEDEBUG', 'WINEDLLOVERRIDES', 'WINEMSYNC', 'WINEESYNC', 'MTL_HUD_ENABLED', 'PATH'];
  const script = [
    '#!/bin/sh',
    `# Launches “${a.name}” from the Umbra bottle “${b.name}”.`,
    ...keep.filter((k) => env[k] !== undefined).map((k) => `export ${k}=${shq(env[k])}`),
    `cd ${shq(path.dirname(a.exe))} || exit 1`,
    `exec ${shq(bin)} ${[...argsFor(a.exe), ...splitArgs(a.args)].map(shq).join(' ')}`,
    '',
  ].join('\n');
  const launcher = path.join(contents, 'MacOS', 'launch');
  fs.writeFileSync(launcher, script, { mode: 0o755 });
  let iconKey = '';
  if (a.icon && process.platform === 'darwin') {
    const icns = path.join(contents, 'Resources', 'icon.icns');
    await engine.exec('/usr/bin/sips', ['-s', 'format', 'icns', a.icon, '--out', icns]).catch(() => {});
    if (fs.existsSync(icns)) iconKey = '<key>CFBundleIconFile</key><string>icon</string>';
  }
  const bundleId = `app.umbra.launcher.${a.id.replace(/[^a-z0-9]/gi, '')}`;
  const xml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>${xml(a.name)}</string>
<key>CFBundleDisplayName</key><string>${xml(a.name)}</string>
<key>CFBundleIdentifier</key><string>${bundleId}</string>
<key>CFBundleExecutable</key><string>launch</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>1.0</string>
<key>LSApplicationCategoryType</key><string>public.app-category.games</string>
${iconKey}
</dict></plist>
`);
  log(`Created Mac launcher: ${root}`);
  return root;
}

// The bottle new installs go into when the user hasn't picked one.
function mainBottle() {
  const s = store.get();
  return s.bottles.find((b) => b.id === s.settings.lastBottleId) || s.bottles.find((b) => b.ready) || s.bottles[0] || null;
}

// Adds the Windows tools that ship inside every bottle to the Library.
function addWindowsTools(bottleId) {
  const c = driveC(bottleId);
  const known = new Set(store.get().apps.map((a) => a.exe.toLowerCase()));
  const added = [];
  for (const t of catalog.WINDOWS_TOOLS) {
    const exe = path.join(c, t.rel);
    if (!fs.existsSync(exe) || known.has(exe.toLowerCase())) continue;
    const a = addApp({ bottleId, exe, name: t.name, args: t.args || '', category: 'tool' });
    if (t.iconFrom) a.icon = icons.extract(path.join(c, t.iconFrom)) || a.icon;
    added.push(a);
  }
  return added;
}

function storeStatus() {
  const apps = store.get().apps;
  const steam = steamStatus();
  return catalog.STORE.map(({ id, name, kind, compat, desc }) => {
    const app = id === 'steam' ? apps.find((a) => a.id === steam.appId) : apps.find((a) => a.catalogId === id);
    return { id, name, kind, compat, desc, appId: app?.id || null };
  });
}

// Downloads a Get Apps item and installs it into the main bottle.
async function installFromStore(id, onProgress) {
  const item = catalog.STORE.find((x) => x.id === id);
  if (!item) throw new Error('Unknown app');
  if (item.special === 'steam') return installSteam(onProgress);
  requireEngine();
  const b = mainBottle();
  if (!b) throw new Error('Run setup first so there is a Windows environment to install into');
  const file = path.join(engine.cacheDir(), item.file);
  if (!fs.existsSync(file)) {
    await engine.download(item.url, file, (f) => onProgress(0.05 + (f ?? 0) * 0.5, `Downloading ${item.name}…`));
  }
  onProgress(0.6, item.args ? `Installing ${item.name}…` : `Follow the ${item.name} installer window…`);
  const before = snapshot(b.id);
  const code = await wineRun(b, [...argsFor(file), ...item.args || []], { tag: item.name, cwd: path.dirname(file) });
  if (code && code !== 3010) log(`${item.name} installer exited with code ${code}`, 'warn');
  onProgress(0.9, 'Adding it to your Library…');
  let { added, rest } = await trackInstall(b, before, item.name, true);
  if (!added.length) {
    const pick = rest.find((r) => item.match?.test(r.exe)) || rest[0];
    if (pick) added = [addApp({ bottleId: b.id, exe: pick.exe, name: item.name })];
  }
  const main = added.find((a) => item.match?.test(a.exe)) || added[0];
  if (!main) throw new Error(`${item.name} didn’t finish installing. Check the Console for details.`);
  main.catalogId = item.id;
  main.name = item.name;
  store.save();
  onProgress(1, `${item.name} is installed`);
  return main;
}

// Installs Visual C++ and DirectX 9 extras if the app's bottle is missing them.
async function fixCommonProblems(appId, onProgress) {
  const a = store.get().apps.find((x) => x.id === appId);
  if (!a) throw new Error('App not found');
  const b = bottle(a.bottleId);
  const todo = ['vcrun', 'directx9'].filter((c) => !b.components?.[c]);
  if (!todo.length) { onProgress(1, 'Nothing missing'); return []; }
  for (const [i, c] of todo.entries()) {
    await installComponent(b.id, c, (f, l) => onProgress((i + (f ?? 0)) / todo.length, l));
  }
  return todo;
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

// Puts an installed Steam back in the Library after it was removed from it.
function readdSteam() {
  const st = steamStatus();
  if (!st.installed) throw new Error('Steam isn’t installed');
  if (st.appId) return st.appId;
  return addApp({ bottleId: st.bottleId, exe: findSteam(bottle(st.bottleId)), name: 'Steam', args: STEAM_ARGS }).id;
}

// Updates Steam entries made by older versions of Umbra to the current launch flags.
function migrateSteamArgs() {
  let changed = false;
  for (const a of store.get().apps) {
    if (/steam\.exe$/i.test(a.exe) && OLD_STEAM_ARGS.includes(a.args)) { a.args = STEAM_ARGS; changed = true; }
  }
  if (changed) store.save();
}

// Common fix for Steam that can't connect or update: stop it, clear its
// downloaded client package and web cache so it re-downloads cleanly, then relaunch.
async function repairSteam() {
  const st = steamStatus();
  if (!st.installed) throw new Error('Steam isn’t installed');
  const b = bottle(st.bottleId);
  await kill(b.id).catch(() => {});
  const root = path.dirname(findSteam(b));
  for (const d of ['package', 'appcache/httpcache', 'config/htmlcache']) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  if (b.winver !== 'win10' && b.winver !== 'win11') await setWinver(b.id, 'win10');
  const id = readdSteam();
  const a = store.get().apps.find((x) => x.id === id);
  if (OLD_STEAM_ARGS.includes(a.args) || !a.args) a.args = STEAM_ARGS;
  store.save();
  log('Steam repaired: cleared its package and web caches. Relaunching — it will re-download its update.');
  return launch({ bottleId: b.id, file: a.exe, args: a.args, appId: a.id, name: 'Steam' });
}

// The folder an app was installed into, if Umbra can safely remove it.
function uninstallTarget(exe) {
  const m = exe.match(/^(.*[\\/]steamapps[\\/]common[\\/][^\\/]+)[\\/]/i)
    || exe.match(/^(.*[\\/]drive_c[\\/](?:Program Files(?: \(x86\))?|Games|GOG Games)[\\/][^\\/]+)[\\/]/i)
    || exe.match(/^(.*[\\/]AppData[\\/]Local[\\/]Programs[\\/][^\\/]+)[\\/]/i);
  return m ? m[1] : null;
}

function uninstallInfo(id) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  const dir = a.category === 'tool' ? null : uninstallTarget(a.exe);
  const inside = dir ? store.get().apps.filter((x) => x.id !== a.id && x.exe.startsWith(dir + path.sep)) : [];
  return { app: a, dir, alsoRemoves: inside.map((x) => x.name) };
}

// Deletes an installed program (and any Library entries inside its folder).
async function uninstallApp(id) {
  const { app: a, dir } = uninstallInfo(id);
  if (!dir) throw new Error(`${a.name} can’t be uninstalled automatically. You can still remove it from your Library.`);
  for (const r of running.values()) if (r.appId === a.id || (r.exe || '').startsWith(dir)) r.child.kill('SIGKILL');
  if (/steam\.exe$/i.test(a.exe)) await kill(a.bottleId).catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
  const s = store.get();
  const gone = s.apps.filter((x) => x.id === a.id || x.exe.startsWith(dir + path.sep));
  s.apps = s.apps.filter((x) => !gone.includes(x));
  store.save();
  log(`Uninstalled ${a.name} (${dir})`);
  return gone.map((x) => x.name);
}

let steamInstall = null;

// Setup and Get Apps can both ask for Steam; share one install instead of racing.
function installSteam(onProgress) {
  steamInstall ||= doInstallSteam(onProgress).finally(() => { steamInstall = null; });
  return steamInstall;
}

async function doInstallSteam(onProgress) {
  requireEngine();
  const s = store.get();
  let b = s.bottles.find((x) => x.steam) || mainBottle();
  if (!b) b = await createBottle({ name: 'Default', winver: 'win10' }, (f, label) => onProgress(f * 0.35, label));
  b.steam = true;
  store.save();
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
  tool, driveC, scan, isInstaller, readdSteam, migrateSteamArgs, repairSteam, uninstallInfo, uninstallApp, mainBottle, addWindowsTools, storeStatus, installFromStore, fixCommonProblems, createMacLauncher, installComponent, runWinetricks, setDxvk, addApp, refreshIcons, importSteamGames, updateApp, removeApp, runApp, steamStatus, installSteam, prefixOf, bottle,
};
