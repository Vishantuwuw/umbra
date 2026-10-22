const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const store = require('./store');
const engine = require('./engine');
const runtime = require('./runtime');
const components = require('./components');

const RENDERER = path.join(__dirname, 'renderer');
const MIN_SPLASH_MS = 2600;
const REPO_URL = 'https://github.com/Vishantuwuw/umbra';
const LATEST_API = 'https://api.github.com/repos/Vishantuwuw/umbra/releases/latest';

let splash = null;
let main = null;
let cpuInfo = { appleSilicon: false, rosetta: true };
let logs = [];
let pendingFiles = [];
const tasks = new Map();
let update = null; // { version, url } when a newer release exists

const newer = (a, b) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function checkForUpdate() {
  try {
    const res = await fetch(LATEST_API, { headers: { 'User-Agent': 'Umbra', Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    const rel = await res.json();
    const v = String(rel.tag_name || '').replace(/^v/, '');
    if (v && newer(v, app.getVersion())) {
      update = { version: v, url: rel.html_url };
      pushState();
    }
  } catch {}
}

app.setName('Umbra');
if (process.env.UMBRA_HOME) app.setPath('userData', process.env.UMBRA_HOME);

// Files opened from Finder ("Open With → Umbra" or double-clicking an .exe).
app.on('open-file', (e, file) => {
  e.preventDefault();
  pendingFiles.push(file);
  flushFiles();
});

function flushFiles() {
  if (!main || main.webContents.isLoading() || !pendingFiles.length) return;
  send('open-files', pendingFiles.splice(0));
}

function send(channel, payload) {
  if (main && !main.isDestroyed()) main.webContents.send(channel, payload);
}

function onRuntimeEvent(type, payload) {
  if (type === 'log') {
    logs.push(payload);
    if (logs.length > 3000) logs = logs.slice(-2000);
    send('log', payload);
  } else if (type === 'running') {
    pushState();
  } else if (type === 'crashed') {
    send('crashed', payload);
  } else if (type === 'installed') {
    pushState();
    send('installed', payload);
  }
}

function state() {
  const s = store.get();
  return {
    bottles: s.bottles,
    apps: s.apps,
    settings: s.settings,
    engine: runtime.getEngine(),
    platform: process.platform,
    cpu: cpuInfo,
    running: runtime.runningList(),
    steam: runtime.steamStatus(),
    tasks: [...tasks.values()],
    version: app.getVersion(),
    update,
  };
}

function pushState() {
  send('state', state());
}

// Long-running jobs report progress to the UI as a task.
async function task(id, label, fn) {
  if (tasks.has(id)) throw new Error('That is already in progress');
  const t = { id, label, pct: 0, detail: 'Starting…' };
  tasks.set(id, t);
  pushState();
  try {
    return await fn((pct, detail) => {
      t.pct = pct;
      if (detail) t.detail = detail;
      send('task', t);
    });
  } finally {
    tasks.delete(id);
    pushState();
  }
}

function createSplash() {
  splash = new BrowserWindow({
    width: 560,
    height: 380,
    frame: false,
    resizable: false,
    movable: true,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    center: true,
    hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  splash.loadFile(path.join(RENDERER, 'splash.html'));
  splash.once('ready-to-show', () => splash.show());
  return new Promise((r) => splash.webContents.once('did-finish-load', r));
}

function splashStep(pct, label) {
  if (splash && !splash.isDestroyed()) splash.webContents.send('splash:progress', { pct, label });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const started = Date.now();
  await createSplash();
  splashStep(8, 'Loading configuration');
  store.load();
  await sleep(250);
  splashStep(22, 'Detecting Wine engine');
  runtime.init(onRuntimeEvent);
  const eng = await engine.detect(store.get().settings.enginePath);
  runtime.setEngine(eng);
  splashStep(46, eng ? `Engine found — ${eng.version || eng.source}` : 'No engine yet — you can install it in a click');
  await sleep(250);
  cpuInfo = await engine.cpu();
  splashStep(60, cpuInfo.appleSilicon ? (cpuInfo.rosetta ? 'Rosetta 2 ready' : 'Rosetta 2 not installed') : 'Checking processor');
  await sleep(200);
  splashStep(74, `Loading ${store.get().bottles.length} bottle(s) and ${store.get().apps.length} app(s)`);
  runtime.refreshIcons();
  createMain();
  await new Promise((r) => main.once('ready-to-show', r));
  splashStep(90, 'Preparing interface');
  await sleep(Math.max(0, MIN_SPLASH_MS - (Date.now() - started)));
  const done = new Promise((r) => ipcMain.once('splash:done', r));
  splashStep(100, 'Ready');
  await done;
  main.show();
  splash.close();
  splash = null;
  flushFiles();
  checkForUpdate();
}

function createMain() {
  main = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    show: false,
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  main.loadFile(path.join(RENDERER, 'index.html'));
  main.webContents.on('did-finish-load', flushFiles);
  main.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  main.on('closed', () => { main = null; });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (_e, ...args) => {
    try {
      const value = await fn(...args);
      return { ok: true, value };
    } catch (err) {
      runtimeLog(err.message, 'error');
      return { ok: false, error: err.message };
    } finally {
      if (!READ_ONLY.has(channel)) pushState();
    }
  });
}

const READ_ONLY = new Set(['state', 'logs']);

function runtimeLog(line, level) {
  onRuntimeEvent('log', { t: Date.now(), level, line });
}

handle('state', () => state());
handle('logs', () => logs);
handle('logs:clear', () => { logs = []; });

handle('engine:install', () => task('engine', 'Installing Wine engine', async (p) => {
  const eng = await engine.install(p);
  runtime.setEngine(eng);
  store.get().settings.enginePath = null;
  store.save();
  return eng;
}));
handle('engine:choose', async () => {
  const r = await dialog.showOpenDialog(main, { title: 'Choose a wine or wine64 binary', properties: ['openFile', 'treatPackageAsDirectory'] });
  if (r.canceled) return null;
  const eng = await engine.detect(r.filePaths[0]);
  if (!eng || eng.source !== 'Custom') throw new Error('That file is not a runnable Wine binary');
  store.get().settings.enginePath = eng.path;
  store.save();
  runtime.setEngine(eng);
  return eng;
});
handle('engine:redetect', async () => {
  const eng = await engine.detect(store.get().settings.enginePath);
  runtime.setEngine(eng);
  cpuInfo = await engine.cpu();
  return eng;
});
handle('engine:rosetta', async () => {
  await engine.installRosetta();
  cpuInfo = await engine.cpu();
});

handle('settings:set', (patch) => {
  Object.assign(store.get().settings, patch);
  store.save();
});

handle('bottle:create', (opts) => task(`bottle:${opts.name}`, `Creating bottle “${opts.name}”`, (p) => runtime.createBottle(opts, p)));
handle('bottle:delete', async (id) => {
  const b = runtime.bottle(id);
  const r = await dialog.showMessageBox(main, {
    type: 'warning', buttons: ['Delete', 'Cancel'], defaultId: 1, cancelId: 1,
    message: `Delete “${b.name}”?`, detail: 'Everything installed in this bottle will be permanently removed.',
  });
  if (r.response === 0) await runtime.deleteBottle(id);
});
handle('bottle:winver', (id, v) => runtime.setWinver(id, v));
handle('bottle:retina', (id, on) => runtime.setRetina(id, on));
handle('components:list', () => components.LIST);
handle('bottle:component', (id, comp) => {
  const b = runtime.bottle(id);
  const c = components.LIST.find((x) => x.id === comp);
  return task(`comp:${id}:${comp}`, `${c?.name || comp} → ${b.name}`, (p) => runtime.installComponent(id, comp, p));
});
handle('bottle:winetricks', (id, verb) => task(`wt:${id}`, `winetricks ${verb}`, (p) => runtime.runWinetricks(id, verb, p)));
handle('bottle:dxvk', (id, on) => task(`dxvk:${id}`, `${on ? 'Enabling' : 'Disabling'} DXVK`, (p) => runtime.setDxvk(id, on, p)));
handle('bottle:tool', (id, name) => runtime.tool(id, name));
handle('bottle:drive', (id) => shell.openPath(runtime.driveC(id)));
handle('bottle:kill', (id) => runtime.kill(id));
handle('bottle:scan', (id) => runtime.scan(id));

handle('app:add', (opts) => runtime.addApp(opts));
handle('app:update', (id, patch) => runtime.updateApp(id, patch));
handle('app:remove', (id) => runtime.removeApp(id));
handle('app:run', (id) => runtime.runApp(id));
handle('app:reveal', (id) => {
  const a = store.get().apps.find((x) => x.id === id);
  if (a) shell.showItemInFolder(a.exe);
});

handle('run:file', (opts) => runtime.launch(opts));
handle('run:stop', (runId) => runtime.stop(runId));

handle('dialog:exe', async () => {
  const r = await dialog.showOpenDialog(main, {
    title: 'Choose a Windows program',
    properties: ['openFile'],
    filters: [{ name: 'Windows programs', extensions: ['exe', 'msi', 'bat', 'cmd', 'lnk'] }, { name: 'All files', extensions: ['*'] }],
  });
  return r.canceled ? null : r.filePaths[0];
});

handle('steam:import', () => {
  const st = runtime.steamStatus();
  if (!st.bottleId) throw new Error('Install Steam first');
  return runtime.importSteamGames(st.bottleId).map((a) => a.name);
});
handle('steam:install', () => task('steam', 'Installing Steam', (p) => runtime.installSteam(p)));

handle('open:external', (url) => shell.openExternal(url));

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const cmd = (name) => () => send('menu', name);
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { label: 'Run Windows Program…', accelerator: 'Cmd+O', click: cmd('run-exe') },
          { label: 'Add App to Library…', accelerator: 'Cmd+Shift+A', click: cmd('add-app') },
          { label: 'New Bottle…', accelerator: 'Cmd+N', click: cmd('new-bottle') },
          { type: 'separator' },
          { label: 'Install Steam', click: cmd('install-steam') },
          { type: 'separator' },
          { role: 'close' },
        ],
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          ...['Library', 'Bottles', 'Steam', 'Engine', 'Console'].map((v, i) => ({ label: v, accelerator: `Cmd+${i + 1}`, click: () => send('menu', `nav:${v.toLowerCase()}`) })),
          { type: 'separator' },
          { role: 'reload' }, { role: 'togglefullscreen' },
        ],
      },
      { role: 'windowMenu' },
      { role: 'help', submenu: [{ label: 'Umbra on GitHub', click: () => shell.openExternal(REPO_URL) }] },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  boot();
});

app.on('activate', () => {
  if (main || splash) return;
  createMain();
  main.once('ready-to-show', () => main.show());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => store.flush());
