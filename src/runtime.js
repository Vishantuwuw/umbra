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
const STEAM_CLIENT_CDN = 'https://cdn.steamstatic.com/client/';
// Steam's built-in browser (sign-in, store, library) needs its sandbox and GPU
// acceleration turned off to load under Wine.
const STEAM_ARGS = '-no-cef-sandbox -cef-disable-gpu -cef-disable-gpu-compositing';
const OLD_STEAM_ARGS = ['-cef-disable-gpu -cef-disable-sandbox', '-noverifyfiles -no-cef-sandbox -cef-disable-gpu -cef-disable-gpu-compositing'];
const SKIP_EXE = /(unins|uninstall|setup|install|update|crash|report|helper|redist|vcredist|dxsetup|dotnet|directx|notification|service|webhelper|^7z\.exe$|^winver|^cef)/i;
const INSTALLER = /(setup|install|^inst[_-]|_inst\b)/i;
const SKIP_DIR = /^(windows|common files|internet explorer|windows media player|windows nt|windowspowershell|microsoft\.net)$/i;
// Folders inside one program that hold its binaries or parts, not separate programs.
const ARCH_DIR = /^(x64|x86|x86_64|amd64|i386|bin|bin32|bin64|binaries|win64|win32|win|retail)$/i;
const PART_DIR = /^(engine|redist|_?commonredist|redistributables?|directx|vcredist|dotnet|support|tools|extras|prereqs?|plugins|updater|update|uninstall|data|content|resources|locales?|localization|lang|languages|lib|libs|runtime|cef|easyanticheat|battleye|eac|crashreporter|logs|cache)$/i;
// Folders that hold several separately installed programs (GOG Galaxy/Games, Steam/steamapps/common…).
const CONTAINER_DIR = /^(games|apps|library|programs|steamapps|common)$/i;

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
  if (wine?.cx) Object.assign(env, cxEnv(wine.cx), extra);
  return env;
}

// What CrossOver's own launcher sets: its Mac libraries (MoltenVK, freetype, gnutls,
// GStreamer…) live outside the engine, so point the loader at them.
function cxEnv({ root, frameworks: fw }) {
  return {
    DYLD_FALLBACK_LIBRARY_PATH: [path.join(fw, 'moltenvkcx'), fw, path.join(fw, 'GStreamer.framework', 'Libraries'), '/usr/lib', '/usr/local/lib'].join(':'),
    CX_ROOT: root,
    MVK_CONFIG_RESUME_LOST_DEVICE: '1',
    ROSETTA_ADVERTISE_AVX: '1',
  };
}

// Bottles remember which kind of engine built them; the CrossOver engine and plain
// Wine lay out a prefix differently, so they aren't mixed.
const engineKind = () => wine?.cx?.kind || 'wine';
const bottleKind = (b) => b.engineKind || 'wine';

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
  const b = { id: slug(name), name: name.trim() || 'Bottle', winver, created: Date.now(), retina: false, engineKind: engineKind() };
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

// Waits for every Wine process in the bottle to exit, giving up after `timeout`
// ms, since a game left running would otherwise keep this waiting forever.
async function waitServer(b, timeout = 120000) {
  const server = engine.wineserverFor(wine.path);
  if (!server) return;
  await new Promise((resolve) => {
    const child = spawn(server, ['-w'], { env: wineEnv(b) });
    const timer = setTimeout(() => { child.kill(); resolve(); }, timeout);
    const done = () => { clearTimeout(timer); resolve(); };
    child.on('exit', done);
    child.on('error', done);
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
  await engine.exec('tar', ['-xf', archive, '-C', tmp]).catch((e) => {
    fs.rmSync(archive, { force: true });
    throw new Error(`Could not unpack ${asset.name}, so it was deleted. Try again. (${e.message})`);
  });
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

// DXMT translates Direct3D 10/11 straight to Metal. It's what Wine-based Mac launchers use
// for current games: Wine's own Direct3D 11 can't start Unity games on a Mac, and
// DXVK-macOS can't create its DXGI factory on Wine 11 (both fail on the Mac test).
const DXMT = { version: 'v0.80', url: 'https://github.com/3Shain/dxmt/releases/download/v0.80/dxmt-v0.80-builtin.tar.gz' };
const DXMT_DLLS = ['d3d11', 'dxgi', 'd3d10core'];

// The release's DLLs are made for Wine's own lib folder. Wine treats a DLL marked
// "Wine builtin DLL" in system32 as a placeholder for its own copy, so the Direct3D
// ones get the mark cleared to load as real (native) DLLs from the bottle instead,
// leaving Wine's own d3d11/dxgi untouched for everything else (Steam's windows).
function copyAsNative(from, to) {
  const buf = fs.readFileSync(from);
  if (buf.toString('latin1', 0x40, 0x50) === 'Wine builtin DLL') buf.fill(0, 0x40, 0x50);
  fs.writeFileSync(to, buf);
}

// source: 'release' (DXMT's own build), 'bundled' (the one Sikarugir ships next to its
// engine, in Frameworks/renderer/dxmt) or 'auto' (bundled when the engine has it).
async function setDxmt(bottleId, on, onProgress = () => {}, { source = 'auto' } = {}) {
  const b = bottle(bottleId);
  const key = 'HKCU\\Software\\Wine\\DllOverrides';
  if (!on) {
    for (const dll of DXMT_DLLS) await wineRun(b, ['reg', 'delete', key, '/v', dll, '/f']);
    b.dxmt = null;
    store.save();
    return;
  }
  if (b.dxvk) await setDxvk(bottleId, false);
  const bin = requireEngine();
  const libDir = findDir(path.dirname(path.dirname(bin)), 'x86_64-unix', 4);
  if (!libDir) throw new Error('This Wine engine has no x86_64-unix library folder, so DXMT can’t be added');
  const bundled = wine?.cx && path.join(wine.cx.frameworks, 'renderer', 'dxmt', 'wine');
  const useBundled = source === 'bundled' || (source === 'auto' && bundled && fs.existsSync(bundled));
  let version = DXMT.version;
  const tmp = path.join(engine.cacheDir(), 'dxmt-unpack');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  if (useBundled) {
    if (!bundled || !fs.existsSync(bundled)) throw new Error('This engine doesn’t come with DXMT');
    fs.cpSync(bundled, tmp, { recursive: true });
    try { version = fs.readFileSync(path.join(bundled, '..', 'version'), 'utf8').trim(); } catch { version = 'bundled'; }
  } else {
    const archive = path.join(engine.cacheDir(), path.basename(DXMT.url));
    if (!fs.existsSync(archive)) await engine.download(DXMT.url, archive, (f) => onProgress(0.05 + (f ?? 0) * 0.6, `Downloading DXMT ${DXMT.version}…`));
    await engine.exec('tar', ['-xf', archive, '-C', tmp]).catch((e) => {
      fs.rmSync(archive, { force: true });
      throw new Error(`Could not unpack DXMT, so the download was deleted. Try again. (${e.message})`);
    });
  }
  onProgress(0.7, 'Installing DXMT…');
  const src = (arch) => findDir(tmp, arch, 3);
  if (!src('x86_64-unix') || !src('x86_64-windows')) throw new Error('The DXMT download is missing its files');
  // winemetal is DXMT's bridge between Windows and Metal: its Unix half lives in the engine.
  const wineLib = path.dirname(libDir);
  fs.copyFileSync(path.join(src('x86_64-unix'), 'winemetal.so'), path.join(libDir, 'winemetal.so'));
  const win = path.join(prefixOf(b), 'drive_c', 'windows');
  for (const [arch, sys] of [['x86_64-windows', 'system32'], ['i386-windows', 'syswow64']]) {
    const from = src(arch);
    if (!from) continue;
    const engineDir = path.join(wineLib, arch);
    if (fs.existsSync(engineDir)) fs.copyFileSync(path.join(from, 'winemetal.dll'), path.join(engineDir, 'winemetal.dll'));
    fs.mkdirSync(path.join(win, sys), { recursive: true });
    fs.copyFileSync(path.join(from, 'winemetal.dll'), path.join(win, sys, 'winemetal.dll'));
    for (const dll of DXMT_DLLS) if (fs.existsSync(path.join(from, `${dll}.dll`))) copyAsNative(path.join(from, `${dll}.dll`), path.join(win, sys, `${dll}.dll`));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  for (const dll of DXMT_DLLS) await wineRun(b, ['reg', 'add', key, '/v', dll, '/t', 'REG_SZ', '/d', 'native,builtin', '/f']);
  b.dxmt = version;
  b.dxmtEngine = wine?.path;
  store.save();
  log(`DXMT ${version} (Direct3D 11 → Metal) enabled in “${b.name}”`);
  onProgress(1, 'DXMT enabled');
}

function argsFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.msi') return ['msiexec', '/i', file];
  if (ext === '.bat' || ext === '.cmd') return ['cmd', '/c', file];
  if (ext === '.lnk') return ['start', '/wait', '/unix', file];
  return [file];
}

// Splits a command line like Windows does for simple cases: quotes can start
// mid-word (-config="C:\My Games\a.ini") and are removed.
function splitArgs(s) {
  const out = [];
  let cur = '';
  let quoted = false;
  let started = false;
  for (const ch of s || '') {
    if (ch === '"') { quoted = !quoted; started = true; } else if (!quoted && /\s/.test(ch)) {
      if (started) out.push(cur);
      cur = '';
      started = false;
    } else { cur += ch; started = true; }
  }
  if (started) out.push(cur);
  return out;
}

// Launches a Windows program without waiting for it; tracks it as running.
function launch({ bottleId, file, args = '', appId = null, name, steamAttempt = 0 }) {
  const bin = requireEngine();
  const b = bottle(bottleId);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  if (bottleKind(b) !== engineKind()) {
    throw new Error(`“${b.name}” was set up with ${{ cx: 'the CrossOver engine', sk: 'Sikarugir Wine 10' }[bottleKind(b)] || 'the Wine 11 engine'}. Run setup again (Settings → Run Setup Again) and reinstall this app there.`);
  }
  const runId = ++runSeq;
  const label = name || path.basename(file);
  const installer = !appId && isInstaller(file);
  const before = installer ? snapshot(b.id) : null;
  const appEntry = appId && store.get().apps.find((x) => x.id === appId);
  const isSteamExe = /^steam\.exe$/i.test(path.basename(file));
  const wrapped = isSteamExe && deployCefWrapper(path.dirname(file));
  if (isSteamExe) {
    // -noverifyfiles keeps Steam's startup file check from putting its own
    // steamwebhelper.exe back over the wrapper. Only once Steam is fully installed:
    // on a fresh install it stops Steam finishing ("Failed to load steamui.dll").
    args = args.replace(/(^|\s)-noverifyfiles(?=\s|$)/gi, ' ').trim();
    if (wrapped && fs.existsSync(path.join(path.dirname(file), 'steamui.dll'))) args = `-noverifyfiles ${args}`.trim();
  }
  const steamReady = isSteamExe && /-noverifyfiles/.test(args);
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
    const { stopped, started } = running.get(runId);
    running.delete(runId);
    const secs = Math.round((Date.now() - entry.started) / 1000);
    if (appId) {
      const a = store.get().apps.find((x) => x.id === appId);
      if (a) a.playtime = (a.playtime || 0) + Math.round((Date.now() - started) / 1000);
      store.save();
    }
    log(`■ ${label} exited (code ${code ?? '?'}) after ${secs}s`, code ? 'warn' : 'info');
    emit('running');
    // steam.exe often exits early while Steam keeps starting; watchSteam reports real failures.
    const isSteam = /^steam\.exe$/i.test(path.basename(file));
    if (code && !stopped && !installer && !isSteam && secs < 6) emit('crashed', { name: label, code });
    if (installer) trackInstall(b, before, label).catch((e) => log(`Could not detect installed apps: ${e.message}`, 'warn'));
    if (/^steam\.exe$/i.test(path.basename(file))) {
      const added = importSteamGames(b.id);
      if (added.length) emit('installed', { bottleId: b.id, installer: 'Steam', added: added.map((a) => a.name), candidates: [] });
    }
  };
  child.on('exit', done);
  child.on('error', (e) => { log(`${label}: ${e.message}`, 'error'); done(-1); });
  // A second click while Steam is already open just hands off to it; nothing to watch then.
  const steamOpen = [...running.values()].some((r) => r.runId !== runId && r.bottleId === bottleId && /steam\.exe$/i.test(r.exe || ''));
  if (isSteamExe && !steamOpen) watchSteam(runId, { bottleId, file, args, appId, name, steamReady }, steamAttempt);
  if (/^steam\.exe$/i.test(path.basename(file))) startWindowFix(b);
  emit('running');
  return entry;
}

// Steam's updater sometimes hangs under Wine: on a download that never comes back, or
// on "Cleaning up…" after it says it is relaunching Steam. Watch its log until the real
// client starts, and restart Steam (at most three times) when it gets stuck. Steam's
// updater also sometimes exits after "launching Steam…" without the new client starting.
const STEAM_STALL_MS = 5 * 60 * 1000;
const STEAM_RELAUNCH_MS = 45 * 1000;

function steamProgress(logs, from, since) {
  let text = '';
  try { text = fs.readFileSync(path.join(logs, 'bootstrap_log.txt')).subarray(from).toString('utf8'); } catch {}
  const mtime = (f) => { try { return fs.statSync(path.join(logs, f)).mtimeMs; } catch { return 0; } };
  const clientUp = ['connection_log.txt', 'webhelper.txt', 'cef_log.txt', 'console_log.txt'].some((f) => mtime(f) > since);
  const handoff = text.lastIndexOf('Update complete, launching Steam');
  // After a handoff the relaunched updater logs a fresh "Startup" line.
  const handedOff = handoff >= 0 && !/Startup/.test(text.slice(handoff));
  // Under Wine, Steam often writes its log only when it exits, so count bytes landing
  // in its package folder (the update downloading) as progress too.
  let pkg = 0;
  try { for (const f of fs.readdirSync(path.join(logs, '..', 'package'))) pkg += fs.statSync(path.join(logs, '..', 'package', f)).size; } catch {}
  return { size: from + Buffer.byteLength(text) + pkg, clientUp, handedOff };
}

// Under Wine 11 on macOS, Steam's built-in browser (steamwebhelper.exe) paints its
// windows black and its separate network process can't finish sign-in. cefwrap.exe
// (src/bin/cefwrap.c) takes its place and starts the real one, renamed
// steamwebhelper.orig.exe, with --disable-gpu --single-process. Steam's updates put the
// original back, so this runs before every launch. Returns true once the wrapper is in.
function deployCefWrapper(steamRoot) {
  const dir = path.join(steamRoot, 'bin', 'cef', 'cef.win64');
  const helper = path.join(dir, 'steamwebhelper.exe');
  const real = path.join(dir, 'steamwebhelper.orig.exe');
  try {
    const wrapper = fs.readFileSync(path.join(__dirname, 'bin', 'cefwrap.exe'));
    if (!fs.existsSync(helper) && !fs.existsSync(real)) return false;
    if (fs.existsSync(helper)) {
      if (fs.readFileSync(helper).equals(wrapper)) return fs.existsSync(real);
      fs.renameSync(helper, real);
    }
    fs.writeFileSync(helper, wrapper);
    return true;
  } catch (e) {
    log(`Couldn’t set up Steam’s window fix: ${e.message}`, 'warn');
    return false;
  }
}

function steamLastLine(logs) {
  try {
    const lines = fs.readFileSync(path.join(logs, 'bootstrap_log.txt'), 'utf8').trim().split('\n');
    return lines[lines.length - 1].replace(/^\[[^\]]*\]\s*/, '').slice(0, 160);
  } catch { return ''; }
}

// Makes Steam's updater download and reinstall its whole client on the next launch
// (games and settings are kept). Fixes "Failed to load steamui.dll".
function resetSteamClient(root) {
  for (const d of ['package', 'appcache/httpcache', 'config/htmlcache']) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'steamui.dll'), { force: true });
}

function watchSteam(runId, opts, attempt) {
  const logs = path.join(path.dirname(opts.file), 'logs');
  let from = 0;
  try { from = fs.statSync(path.join(logs, 'bootstrap_log.txt')).size; } catch {}
  const t0 = Date.now();
  let lastSize = from;
  let lastGrowth = t0;
  let handedOffAt = 0;
  const timer = setInterval(() => {
    if (Date.now() - t0 > 30 * 60 * 1000) return clearInterval(timer);
    const p = steamProgress(logs, from, t0);
    if (p.clientUp) {
      clearInterval(timer);
      // On a first start Steam installs (or, without -noverifyfiles, restores) its browser
      // after Umbra launched it, so the wrapper isn't in use and the window would be black:
      // put it back and restart once, now with -noverifyfiles.
      if (!opts.steamReady && deployCefWrapper(path.dirname(opts.file)) && fs.existsSync(path.join(path.dirname(opts.file), 'steamui.dll'))) {
        log('Restarting Steam once so its window draws properly…');
        kill(opts.bottleId)
          .then(() => new Promise((r) => setTimeout(r, 2000)))
          .then(() => launch({ ...opts, steamAttempt: attempt }))
          .catch((e) => log(`Couldn’t restart Steam: ${e.message}`, 'error'));
      }
      return;
    }
    const alive = running.has(runId);
    if (p.size !== lastSize) { lastSize = p.size; lastGrowth = Date.now(); }
    handedOffAt = p.handedOff ? handedOffAt || Date.now() : 0;
    const reopenStuck = handedOffAt && Date.now() - handedOffAt > STEAM_RELAUNCH_MS;
    // Once the first steam.exe has exited, a quiet minute means nothing took over from it.
    const stalled = Date.now() - lastGrowth > (alive ? STEAM_STALL_MS : STEAM_RELAUNCH_MS);
    if (!reopenStuck && !stalled) return;
    clearInterval(timer);
    // Relaunching after a finished update is harmless, so it gets a few extra tries.
    if (reopenStuck ? attempt >= 5 : attempt >= 3) {
      const last = steamLastLine(logs);
      log(`Steam couldn’t start${last ? ` (its log ends with: ${last})` : ''}. Try Repair Steam from its settings.`, 'warn');
      emit('steam-failed', { lastLine: last });
      return;
    }
    // Closing before the client opens usually means broken client files ("Failed to load
    // steamui.dll", often from an interrupted update); a restart alone brings the same
    // files back, so make Steam reinstall them.
    // Only when steam.exe itself died: a slow but running Steam is left to finish.
    // A Steam stuck on "Failed to load steamui.dll" stays open, so check for the file too.
    const reinstall = !reopenStuck && (!alive || !fs.existsSync(path.join(path.dirname(opts.file), 'steamui.dll')));
    log(reopenStuck ? 'Steam finished updating but didn’t reopen. Restarting it…'
      : reinstall ? 'Steam didn’t open. Reinstalling its client files and starting it again…'
        : 'Restarting Steam…', 'warn');
    kill(opts.bottleId)
      .then(() => { if (reinstall) resetSteamClient(path.dirname(opts.file)); })
      .then(() => new Promise((r) => setTimeout(r, 2000)))
      .then(() => launch({ ...opts, steamAttempt: attempt + 1 }))
      .catch((e) => log(`Couldn’t restart Steam: ${e.message}`, 'error'));
  }, 5000);
}

// Under Wine on macOS, Steam opens its sign-in and main windows far off-screen, so it
// looks like Steam never started. winfix.exe (src/bin/winfix.c) runs alongside it and
// moves such windows to the middle of the screen; it quits a minute after Steam does.
const windowFixes = new Map();
function startWindowFix(b) {
  if (windowFixes.get(b.id)?.exitCode === null) return;
  try {
    const dest = path.join(prefixOf(b), 'drive_c', 'umbra', 'winfix.exe');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(path.join(__dirname, 'bin', 'winfix.exe')));
    const child = spawn(requireEngine(), [dest], { env: wineEnv(b), stdio: 'ignore' });
    child.on('error', () => {});
    windowFixes.set(b.id, child);
  } catch (e) {
    log(`Couldn’t start the Steam window fix: ${e.message}`, 'warn');
  }
}

function runningList() {
  return [...running.values()].map(({ child, stopped, ...rest }) => rest);
}

// What's running in a bottle, e.g. to warn before Repair Steam stops it all.
function runningIn(bottleId) {
  return runningList().filter((r) => r.bottleId === bottleId);
}

// Adds the time played so far for apps still running (call before quitting) and
// restarts their clocks so nothing is counted twice; saves right away.
function creditPlaytime() {
  const now = Date.now();
  for (const r of running.values()) {
    const a = r.appId && store.get().apps.find((x) => x.id === r.appId);
    if (a) a.playtime = (a.playtime || 0) + Math.round((now - r.started) / 1000);
    r.started = now;
  }
  store.flush();
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

// `keep` matches files that are listed even if they look like helpers or installers.
function walk(dir, depth, out, ext = /\.exe$/i, keep = null) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !SKIP_DIR.test(e.name)) walk(p, depth - 1, out, ext, keep);
    else if (e.isFile() && ext.test(e.name) && (!SKIP_EXE.test(e.name) || keep?.test(p))) out.push(p);
  }
}

function userDirs(c) {
  try { return fs.readdirSync(path.join(c, 'users')).map((u) => path.join(c, 'users', u)); } catch { return []; }
}

// Every program in a bottle's usual install locations, including Steam games.
function listExes(bottleId, keep = null) {
  const c = driveC(bottleId);
  const found = [];
  const pf = ['Program Files', 'Program Files (x86)'].map((r) => path.join(c, r));
  for (const r of [...pf, path.join(c, 'Games'), path.join(c, 'GOG Games')]) walk(r, 3, found, undefined, keep);
  for (const r of pf) walk(path.join(r, 'Steam', 'steamapps', 'common'), 2, found, undefined, keep);
  for (const u of userDirs(c)) {
    walk(path.join(u, 'AppData', 'Local', 'Programs'), 3, found, undefined, keep);
    walk(path.join(u, 'Desktop'), 1, found, undefined, keep);
  }
  return [...new Set(found)];
}

// Exes matching `re` anywhere in the install locations, searching deeper than
// listExes (Epic's launcher sits 6 folders down in Program Files).
function findMatching(bottleId, re) {
  const c = driveC(bottleId);
  const found = [];
  const roots = ['Program Files', 'Program Files (x86)', 'Games', 'GOG Games'].map((r) => path.join(c, r));
  for (const u of userDirs(c)) roots.push(path.join(u, 'AppData', 'Local', 'Programs'));
  for (const r of roots) walk(r, 7, found, /\.exe$/i, re);
  return found.filter((f) => re.test(f));
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
  return { exes: new Set(listExes(bottleId)), lnks: new Set(listShortcuts(bottleId)), started: Date.now() };
}

// .lnk files store their target path as plain or UTF-16 text, so a name match is enough.
function shortcutTargets(lnk, exe) {
  let buf;
  try { buf = fs.readFileSync(lnk); } catch { return false; }
  const name = path.basename(exe).toLowerCase();
  return buf.toString('latin1').toLowerCase().includes(name) || buf.toString('utf16le').toLowerCase().includes(name);
}

// The Windows path a .lnk points to (C:\...), read from its LinkInfo block, else
// from the first drive path found in its text.
function lnkTargetWin(buf) {
  try {
    if (buf.readUInt32LE(0) === 0x4c) {
      const flags = buf.readUInt32LE(0x14);
      let at = 0x4c;
      if (flags & 1) at += 2 + buf.readUInt16LE(at);
      if (flags & 2) {
        const hdr = buf.readUInt32LE(at + 4);
        const cstr = (o, wide) => {
          if (!o) return '';
          if (wide) { let e = at + o; while (buf.readUInt16LE(e)) e += 2; return buf.toString('utf16le', at + o, e); }
          const e = buf.indexOf(0, at + o);
          return buf.toString('latin1', at + o, e);
        };
        const base = hdr >= 0x24 ? cstr(buf.readUInt32LE(at + 28), true) : cstr(buf.readUInt32LE(at + 16), false);
        const suffix = hdr >= 0x24 ? cstr(buf.readUInt32LE(at + 32), true) : cstr(buf.readUInt32LE(at + 24), false);
        if (/^[a-z]:\\/i.test(base)) return base + suffix;
      }
    }
  } catch {}
  for (const enc of ['utf16le', 'latin1']) {
    const m = buf.toString(enc).match(/[a-z]:\\[^\0"*?<>|\r\n]*?\.exe/i);
    if (m) return m[0];
  }
  return null;
}

// Maps C:\... to the bottle's drive_c, matching each folder name case-insensitively.
function lnkTarget(bottleId, lnk) {
  let win;
  try { win = lnkTargetWin(fs.readFileSync(lnk)); } catch { return null; }
  if (!win || !/^c:\\/i.test(win)) return null;
  let p = driveC(bottleId);
  for (const part of win.slice(3).split('\\').filter(Boolean)) {
    if (part === '..' || part === '.') return null;
    let names = [];
    try { names = fs.readdirSync(p); } catch { return null; }
    const hit = names.find((n) => n === part) || names.find((n) => n.toLowerCase() === part.toLowerCase());
    if (!hit) return null;
    p = path.join(p, hit);
  }
  return p;
}

function changedSince(f, t) {
  try { return fs.statSync(f).ctimeMs >= t; } catch { return false; }
}

// After an installer finishes, adds what it installed to the library. `match`
// (from Get Apps) marks the main program, which is never skipped as a helper.
async function trackInstall(b, before, label, quiet = false, match = null) {
  log(`Installer finished — looking for what ${label} installed…`);
  // Installers often hand off to child processes; wait for the bottle to go idle (capped,
  // since "launch now" checkboxes can start the installed app right away).
  await waitServer(b, 120000);
  const known = new Set(store.get().apps.map((a) => a.exe));
  // Reinstalling over an existing copy keeps the same paths, so files written since
  // the installer started count as new too (ctime, as installers keep the original mtime).
  const since = (before.started || Date.now()) - 2000;
  const fresh = (f, seen) => !seen.has(f) || changedSince(f, since);
  const lnks = listShortcuts(b.id).filter((l) => fresh(l, before.lnks));
  const exes = listExes(b.id, match).filter((e) => fresh(e, before.exes) && !known.has(e));
  const targets = new Map();
  for (const l of lnks) {
    const t = lnkTarget(b.id, l);
    if (!t || !/\.exe$/i.test(t)) continue;
    targets.set(l, t);
    if (!exes.includes(t) && !known.has(t) && (!SKIP_EXE.test(path.basename(t)) || match?.test(t))) exes.push(t);
  }
  if (match) exes.sort((x, y) => match.test(y) - match.test(x));
  const picks = [];
  for (const exe of exes) {
    const lnk = lnks.find((l) => targets.get(l) === exe) || lnks.find((l) => !targets.has(l) && shortcutTargets(l, exe));
    if (lnk) picks.push({ exe, name: path.basename(lnk, '.lnk') });
  }
  const main = match ? exes.filter((e) => match.test(e)) : [];
  if (!picks.length && (main.length || exes.length <= 2)) picks.push(...(main.length ? main : exes).map((exe) => ({ exe, name: prettyName(exe) })));
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
  const game = steamAppId ? null : steamlib.gameForExe(exe);
  const a = {
    id: `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    bottleId, exe, name: name || game?.name || prettyName(exe), args, added: Date.now(), playtime: 0,
    steamAppId: steamAppId || game?.appid || null,
    icon: icons.extract(exe),
    iconFor: exe,
    ...(category ? { category } : {}),
    ...(catalogId ? { catalogId } : {}),
  };
  const b = bottle(bottleId);
  if (a.steamAppId && b.removedSteam?.includes(String(a.steamAppId))) b.removedSteam = b.removedSteam.filter((x) => x !== String(a.steamAppId));
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

// Adds every installed Steam game in a bottle that isn't in the library yet,
// except ones the user removed from the Library.
function importSteamGames(bottleId) {
  const apps = store.get().apps;
  const known = new Set(apps.map((a) => a.exe.toLowerCase()));
  const ids = new Set(apps.filter((a) => a.bottleId === bottleId && a.steamAppId).map((a) => String(a.steamAppId)));
  for (const id of bottle(bottleId).removedSteam || []) ids.add(String(id));
  const games = steamlib.installedGames(driveC(bottleId)).filter((g) => !known.has(g.exe.toLowerCase()) && !ids.has(String(g.steamAppId)));
  const added = games.map((g) => addApp({ bottleId, exe: g.exe, name: g.name, steamAppId: g.steamAppId }));
  if (added.length) log(`Imported from Steam: ${added.map((a) => a.name).join(', ')}`);
  return added;
}

function launcherIs(root, bundleId) {
  try { return fs.readFileSync(path.join(root, 'Contents', 'Info.plist'), 'utf8').includes(`<string>${bundleId}</string>`); } catch { return false; }
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
  const bundleId = `app.umbra.launcher.${a.id.replace(/[^a-z0-9]/gi, '')}`;
  // Another app with the same name may already have a launcher; don't replace it.
  const dir = path.join(app.getPath('home'), 'Applications', 'Umbra');
  let root = path.join(dir, `${safe}.app`);
  for (let i = 2; fs.existsSync(root) && !launcherIs(root, bundleId); i++) root = path.join(dir, `${safe} ${i}.app`);
  const contents = path.join(root, 'Contents');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(contents, 'Resources'), { recursive: true });
  const env = wineEnv(b, a.hud ? { MTL_HUD_ENABLED: '1' } : {});
  const keep = ['WINEPREFIX', 'WINEDEBUG', 'WINEDLLOVERRIDES', 'WINEMSYNC', 'WINEESYNC', 'MTL_HUD_ENABLED', 'PATH', 'DYLD_FALLBACK_LIBRARY_PATH', 'CX_ROOT', 'MVK_CONFIG_RESUME_LOST_DEVICE', 'ROSETTA_ADVERTISE_AVX'];
  const script = [
    '#!/bin/sh',
    `# Launches “${a.name}” from the Umbra bottle “${b.name}”.`,
    ...keep.filter((k) => env[k] !== undefined).map((k) => `export ${k}=${shq(env[k])}`),
    `cd ${shq(path.dirname(a.exe))} || exit 1`,
    ...(/^steam\.exe$/i.test(path.basename(a.exe)) ? [`${shq(bin)} ${shq(path.join(prefixOf(b), 'drive_c', 'umbra', 'winfix.exe'))} >/dev/null 2>&1 &`] : []),
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
// The bottle setup, Steam and Get Apps install into: one built by the current engine.
function mainBottle() {
  const s = store.get();
  const fits = s.bottles.filter((b) => bottleKind(b) === engineKind());
  return fits.find((b) => b.id === s.settings.lastBottleId) || fits.find((b) => b.ready) || fits[0] || null;
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
  const { added, rest } = await trackInstall(b, before, item.name, true, item.match);
  const match = item.match || /$^/;
  let main = added.find((a) => match.test(a.exe));
  if (!main) {
    // Already in the Library (reinstalled over itself), or installed deeper than the usual scan.
    const apps = store.get().apps.filter((a) => a.bottleId === b.id);
    main = apps.find((a) => a.catalogId === item.id && fs.existsSync(a.exe)) || apps.find((a) => match.test(a.exe) && fs.existsSync(a.exe));
    const exe = !main && (rest.find((r) => match.test(r.exe))?.exe || (item.match && findMatching(b.id, item.match)[0]));
    if (exe) main = addApp({ bottleId: b.id, exe, name: item.name });
  }
  if (!main) main = added[0] || (rest[0] && addApp({ bottleId: b.id, exe: rest[0].exe, name: item.name }));
  if (!main) {
    // The cached installer may be damaged; download it again next time.
    if (code && code !== 3010) fs.rmSync(file, { force: true });
    throw new Error(`${item.name} didn’t finish installing. Check the Console for details.`);
  }
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
  const a = s.apps.find((x) => x.id === id);
  // Remember removed Steam games so the next Steam launch doesn't import them again.
  const b = a?.steamAppId && s.bottles.find((x) => x.id === a.bottleId);
  if (b && !/steam\.exe$/i.test(a.exe)) b.removedSteam = [...new Set([...(b.removedSteam || []), String(a.steamAppId)])];
  s.apps = s.apps.filter((x) => x.id !== id);
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
  const b = s.bottles.find((x) => x.steam && bottleKind(x) === engineKind());
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
async function repairSteam(onProgress = () => {}) {
  const st = steamStatus();
  if (!st.installed) throw new Error('Steam isn’t installed');
  const b = bottle(st.bottleId);
  await kill(b.id).catch(() => {});
  const root = path.dirname(findSteam(b));
  resetSteamClient(root);
  await prefetchSteamClient(root, onProgress);
  if (b.winver !== 'win10' && b.winver !== 'win11') await setWinver(b.id, 'win10');
  const id = readdSteam();
  const a = store.get().apps.find((x) => x.id === id);
  if (OLD_STEAM_ARGS.includes(a.args) || !a.args) a.args = STEAM_ARGS;
  store.save();
  log('Steam repaired: cleared its package and web caches. Relaunching — it will re-download its update.');
  return launch({ bottleId: b.id, file: a.exe, args: a.args, appId: a.id, name: 'Steam' });
}

const norm = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
const related = (x, y) => { x = norm(x); y = norm(y); return x.length >= 3 && y.length >= 3 && (x.startsWith(y) || y.startsWith(x)); };

function readDir(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}

// Whether a folder holds a real program (not an uninstaller or helper) within a few levels.
function hasExe(dir, depth = 3) {
  for (const e of readDir(dir)) {
    if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name)) return true;
    if (e.isDirectory() && depth > 0 && hasExe(path.join(dir, e.name), depth - 1)) return true;
  }
  return false;
}

// Child folders of `dir` that look like separate programs (skipping `except`).
function otherProgramsIn(dir, except, out = [], depth = 2) {
  for (const e of readDir(dir)) {
    if (!e.isDirectory() || e.name === except) continue;
    const p = path.join(dir, e.name);
    if (CONTAINER_DIR.test(e.name)) { if (depth > 0) otherProgramsIn(p, null, out, depth - 1); continue; }
    if (ARCH_DIR.test(e.name) || PART_DIR.test(e.name) || related(e.name, path.basename(dir))) continue;
    if (hasExe(p)) out.push(p);
  }
  return out;
}

// Whether a folder on the way down to the exe also holds other programs (or
// programs' exes) beside the folder `next` that leads to ours.
function holdsOthers(dir, next, exe) {
  if (otherProgramsIn(dir, next, [], 0).length) return true;
  return readDir(dir).some((e) => e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXE.test(e.name)
    && !related(path.parse(e.name).name, next) && !related(path.parse(e.name).name, path.parse(exe).name));
}

// The folder an app was installed into, if Umbra can safely remove it. Starts at
// the first folder under Program Files (or Games, AppData/Local/Programs) and goes
// deeper past publisher folders (Epic Games, Rockstar Games, Ubisoft/…/games) that
// also hold other programs, but not into the program's own bin/x64 folders.
function uninstallTarget(exe) {
  const steam = exe.match(/^(.*[\\/]steamapps[\\/]common[\\/][^\\/]+)[\\/]/i);
  if (steam) return steam[1];
  const m = exe.match(/^(.*[\\/]drive_c[\\/](?:Program Files(?: \(x86\))?|Games|GOG Games))[\\/]([^\\/]+)[\\/]/i)
    || exe.match(/^(.*[\\/]AppData[\\/]Local[\\/]Programs)[\\/]([^\\/]+)[\\/]/i);
  if (!m) return null;
  const root = m[1];
  const levels = [path.join(root, m[2])];
  const rest = path.relative(levels[0], path.dirname(exe)).split(path.sep).filter(Boolean);
  if (rest.includes('..')) return null;
  for (const part of rest) levels.push(path.join(levels[levels.length - 1], part));
  const k = levels.length - 1;
  let stop = k;
  for (let i = 0; i < k; i++) if (ARCH_DIR.test(path.basename(levels[i + 1]))) { stop = i; break; }
  let pick = 0;
  for (let i = 0; i < stop; i++) if (holdsOthers(levels[i], path.basename(levels[i + 1]), exe)) pick = i + 1;
  for (let i = 0; i < k; i++) if (CONTAINER_DIR.test(path.basename(levels[i])) || SKIP_DIR.test(path.basename(levels[i]))) pick = Math.max(pick, i + 1);
  const dir = levels[Math.min(pick, k)];
  const name = path.basename(dir);
  if (path.dirname(dir) === dir || /^drive_c$/i.test(name) || CONTAINER_DIR.test(name) || SKIP_DIR.test(name) || path.relative(root, dir).startsWith('..') || dir === root) return null;
  return dir;
}

// What uninstalling an app would delete. `otherPrograms` lists other programs
// found in that folder (by folder name), `exeCount` how many programs it holds.
function uninstallInfo(id) {
  const a = store.get().apps.find((x) => x.id === id);
  if (!a) throw new Error('App not found');
  const dir = a.category === 'tool' ? null : uninstallTarget(a.exe);
  const inside = dir ? store.get().apps.filter((x) => x.id !== a.id && x.exe.startsWith(dir + path.sep)) : [];
  const others = [];
  if (dir) {
    const steps = path.relative(dir, path.dirname(a.exe)).split(path.sep).filter(Boolean);
    let cur = dir;
    for (const next of [...steps, null]) {
      otherProgramsIn(cur, next, others);
      if (next) cur = path.join(cur, next);
    }
  }
  const exes = [];
  if (dir) walk(dir, 6, exes);
  return {
    app: a, dir, alsoRemoves: inside.map((x) => x.name),
    otherPrograms: [...new Set(others.map((p) => path.basename(p)))],
    exeCount: exes.length,
  };
}

// Deletes an installed program (and any Library entries inside its folder).
async function uninstallApp(id) {
  const { app: a, dir } = uninstallInfo(id);
  if (!dir) throw new Error(`${a.name} can’t be uninstalled automatically. You can still remove it from your Library.`);
  for (const r of running.values()) if (r.appId === a.id || (r.exe || '').startsWith(dir + path.sep)) r.child.kill('SIGKILL');
  if (/steam\.exe$/i.test(a.exe)) await kill(a.bottleId).catch(() => {});
  fs.rmSync(dir, { recursive: true, force: true });
  // Steam would otherwise still list the game as installed (and Umbra re-import it).
  const sa = dir.match(/^(.*[\\/]steamapps)[\\/]common[\\/][^\\/]+$/i);
  if (sa) {
    const appid = a.steamAppId || steamlib.gameForExe(a.exe)?.appid;
    if (appid && /^\d+$/.test(String(appid))) fs.rmSync(path.join(sa[1], `appmanifest_${appid}.acf`), { force: true });
  }
  const s = store.get();
  const gone = s.apps.filter((x) => x.id === a.id || x.exe.startsWith(dir + path.sep));
  s.apps = s.apps.filter((x) => !gone.includes(x));
  store.save();
  log(`Uninstalled ${a.name} (${dir})`);
  return gone.map((x) => x.name);
}

// Steam's first-run updater can stall on its first download under Wine, so the
// client packages are fetched here first and it only has to check and unpack
// them. Best effort: on any failure Steam downloads them itself as before.
async function prefetchSteamClient(root, onProgress = () => {}) {
  try {
    const res = await fetch(`${STEAM_CLIENT_CDN}steam_client_win32`, { headers: { 'User-Agent': 'Umbra' }, signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const manifest = await res.text();
    const pkgs = steamlib.clientPackages(manifest);
    if (!pkgs.length) throw new Error('its manifest listed no packages');
    const dir = path.join(root, 'package');
    fs.mkdirSync(dir, { recursive: true });
    const total = pkgs.reduce((n, p) => n + p.size, 0) || 1;
    let done = 0;
    for (const p of pkgs) {
      const dest = path.join(dir, p.file);
      const label = `Downloading Steam (${p.name})…`;
      if (!fs.existsSync(dest) || !fs.statSync(dest).size) {
        await engine.download(STEAM_CLIENT_CDN + p.file, dest, (f) => onProgress(Math.min(1, (done + (f ?? 0) * p.size) / total), label),
          { signal: AbortSignal.timeout(15 * 60000) });
      }
      done += p.size;
      onProgress(Math.min(1, done / total), label);
    }
    fs.writeFileSync(path.join(dir, 'steam_client_win32.manifest'), manifest);
    log(`Downloaded Steam’s ${pkgs.length} client packages ahead of its first launch`);
    return true;
  } catch (e) {
    log(`Couldn’t download Steam’s update ahead of time (${e.message}). Steam will download it itself.`, 'warn');
    return false;
  }
}

let steamInstall = null;

// Setup and Get Apps can both ask for Steam; share one install instead of racing.
function installSteam(onProgress) {
  steamInstall ||= doInstallSteam(onProgress).finally(() => { steamInstall = null; });
  return steamInstall;
}

// Steam won't start without the Visual C++ runtimes ("Steam needs Microsoft Visual C++…"),
// and its sign-in and store pages use Wine's web engine (Gecko).
const STEAM_NEEDS = ['vcrun', 'wineaddons'];
const STEAM_GFX = 3;
// DXMT's bridge is installed into the engine itself, so a new engine needs it again.
const steamGfxStale = (b) => b.steamGfx !== STEAM_GFX || (process.platform === 'darwin' && b.dxmtEngine !== wine?.path);
const steamNeedsRuntimes = (bottleId) => STEAM_NEEDS.some((c) => !bottle(bottleId).components?.[c]) || steamGfxStale(bottle(bottleId));

// Games in Steam's bottle get DXMT (see setDxmt): Wine's built-in Direct3D 11 can't start
// Unity and most current games on a Mac ("Failed to initialize graphics... make sure you
// have DirectX 11"). Steam's own windows draw through Direct3D 11 too and came up blank
// with DXVK on the Mac test, so steam.exe and steamwebhelper.exe always use Wine's
// built-in Direct3D.
async function steamGraphics(b) {
  if (process.platform === 'darwin' && b.dxmtEngine !== wine?.path) {
    try { await setDxmt(b.id, true); } catch (e) {
      b.dxmtEngine = wine?.path; // don't retry on every launch
      log(`Couldn’t turn on DXMT for Steam games: ${e.message}`, 'warn');
    }
  }
  for (const exe of ['steam.exe', 'steamwebhelper.exe']) {
    const key = `HKCU\\Software\\Wine\\AppDefaults\\${exe}\\DllOverrides`;
    for (const dll of ['d3d11', 'd3d10core', 'd3d10', 'd3d10_1', 'dxgi', 'd3d9']) {
      await wineRun(b, ['reg', 'add', key, '/v', dll, '/d', 'builtin', '/f']);
    }
  }
  b.steamGfx = STEAM_GFX;
  store.save();
}

async function ensureSteamRuntimes(bottleId, onProgress = () => {}) {
  const missing = STEAM_NEEDS.filter((c) => !bottle(bottleId).components?.[c]);
  for (const [i, c] of missing.entries()) {
    await installComponent(bottleId, c, (f, l) => onProgress((i + (f ?? 0)) / missing.length, l));
  }
  if (steamGfxStale(bottle(bottleId))) await steamGraphics(bottle(bottleId));
}

async function doInstallSteam(onProgress) {
  requireEngine();
  const s = store.get();
  let b = s.bottles.find((x) => x.steam && bottleKind(x) === engineKind()) || mainBottle();
  if (!b) b = await createBottle({ name: 'Default', winver: 'win10' }, (f, label) => onProgress(f * 0.35, label));
  b.steam = true;
  store.save();
  await ensureSteamRuntimes(b.id, (f, label) => onProgress(0.35 + f * 0.15, label || 'Installing Visual C++ for Steam…'));
  const setup = path.join(engine.cacheDir(), 'SteamSetup.exe');
  if (!fs.existsSync(setup)) {
    await engine.download(STEAM_SETUP_URL, setup, (f) => onProgress(0.5 + (f ?? 0) * 0.1, 'Downloading Steam installer…'));
  }
  onProgress(0.62, 'Installing Steam for Windows…');
  await wineRun(b, [setup, '/S'], { tag: 'SteamSetup' });
  await waitServer(b);
  const exe = findSteam(b);
  if (!exe) {
    fs.rmSync(setup, { force: true });
    throw new Error('Steam installer finished but steam.exe was not found. Check the Console for details.');
  }
  await prefetchSteamClient(path.dirname(exe), (f, label) => onProgress(0.7 + f * 0.28, label));
  let a = s.apps.find((x) => x.exe === exe);
  if (!a) a = addApp({ bottleId: b.id, exe, name: 'Steam', args: STEAM_ARGS });
  onProgress(1, 'Steam is installed');
  return a;
}

module.exports = {
  steamProgress, deployCefWrapper, engineKind, bottleKind, wineRun,
  init, setEngine, getEngine, createBottle, deleteBottle, setWinver, setRetina, launch, runningList, runningIn, creditPlaytime, stop, kill,
  uninstallTarget, splitArgs, prefetchSteamClient, steamNeedsRuntimes, ensureSteamRuntimes,
  tool, driveC, scan, isInstaller, readdSteam, migrateSteamArgs, repairSteam, uninstallInfo, uninstallApp, mainBottle, addWindowsTools, storeStatus, installFromStore, fixCommonProblems, createMacLauncher, installComponent, runWinetricks, setDxvk, setDxmt, addApp, refreshIcons, importSteamGames, updateApp, removeApp, runApp, steamStatus, installSteam, prefixOf, bottle,
};
