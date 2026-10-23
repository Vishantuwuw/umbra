const api = window.umbra;
const $ = (s, el = document) => el.querySelector(s);

const I = {
  library: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  bottle: '<path d="M10 2h4M10 2v5l-4 4v9a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-9l-4-4V2"/><path d="M6 14h12"/>',
  steam: '<circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.5"/><path d="m3.5 14 5 2a2.5 2.5 0 1 0 3.3-2.6"/>',
  engine: '<path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/>',
  console: '<path d="m4 17 6-5-6-5M12 19h8"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  alert: '<path d="M12 3 2 21h20zM12 10v5M12 18h0"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  gamepad: '<path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 15h-4l-1 .6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4zM8 10v4M6 12h4"/><circle cx="16" cy="11" r=".6"/><circle cx="18" cy="13" r=".6"/>',
};
const icon = (n) => `<svg viewBox="0 0 24 24">${I[n] || ''}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const WINVERS = [['win11', 'Windows 11'], ['win10', 'Windows 10'], ['win81', 'Windows 8.1'], ['win7', 'Windows 7'], ['winxp', 'Windows XP']];
const winverName = (v) => (WINVERS.find((w) => w[0] === v) || [v, v])[1];

let S = null; // app state from main
let view = 'library';
let logs = [];
const taskPct = {};

const VIEWS = {
  library: { title: 'Library', icon: 'library', sub: () => 'Your Windows games and apps. Click one to play.' },
  store: { title: 'Get Apps', icon: 'download', sub: () => 'One-click installs for game stores and popular apps.' },
  settings: { title: 'Settings', icon: 'sliders', sub: () => 'Performance, setup and the Windows engine.' },
  bottles: { title: 'Bottles', icon: 'bottle', sub: () => 'Advanced: separate Windows environments, each with its own C: drive.', advanced: true },
  console: { title: 'Console', icon: 'console', sub: () => 'Advanced: live output from everything running in Umbra.', advanced: true },
  admin: { title: 'Admin', icon: 'shield', sub: () => 'Accounts, devices and bans.', advanced: true, hidden: () => S.auth?.role !== 'admin' },
};

// Always in the sidebar once Windows is set up: [tool id in runtime.tool(), label, icon].
const QUICK_TOOLS = [['cmd', 'Command Prompt', 'terminal'], ['taskmgr', 'Task Manager', 'chip'], ['explorer', 'File Explorer', 'folder'], ['control', 'Control Panel', 'sliders']];

// ---------- helpers ----------
function hash(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function artFor(name) {
  const h = hash(name || '?');
  const a = h % 360;
  const b = (a + 40 + (h >> 4) % 80) % 360;
  return `radial-gradient(120% 90% at 20% 10%, hsl(${a} 70% 42%) 0%, transparent 60%), radial-gradient(100% 100% at 100% 100%, hsl(${b} 80% 30%) 0%, transparent 65%), linear-gradient(160deg, hsl(${a} 40% 12%), #050507)`;
}
const initial = (n) => (n || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase() || '?';
function fmtTime(sec) {
  if (!sec) return 'Never played';
  if (sec < 60) return `${sec}s played`;
  if (sec < 3600) return `${Math.round(sec / 60)} min played`;
  return `${(sec / 3600).toFixed(1)} h played`;
}
function ago(t) {
  if (!t) return '';
  const d = (Date.now() - t) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}
const basename = (p) => p.split(/[\\/]/).pop();
const fileUrl = (p) => `file://${encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
const steamImgs = (id, kind) => [
  `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/${kind}`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${kind}`,
];
// <img> that walks a list of fallback URLs, then removes itself (see the error listener below).
const img = (urls, cls) => `<img class="${cls}" src="${esc(urls[0])}" data-fallbacks="${esc(urls.slice(1).join('|'))}" alt="" draggable="false">`;
function appArt(a, big) {
  const own = a.icon ? img([fileUrl(a.icon)], big ? 'hero-icon' : 'app-icon') : '';
  if (a.steamAppId) {
    return own + (big ? img([...steamImgs(a.steamAppId, 'library_hero.jpg'), ...steamImgs(a.steamAppId, 'header.jpg')], 'cover')
      : img([...steamImgs(a.steamAppId, 'library_600x900_2x.jpg'), ...steamImgs(a.steamAppId, 'library_600x900.jpg'), ...steamImgs(a.steamAppId, 'header.jpg')], 'cover'));
  }
  return own;
}
const bottleName = (id) => S.bottles.find((b) => b.id === id)?.name || 'Missing bottle';
const isRunning = (appId) => S.running.some((r) => r.appId === appId);

async function call(ch, ...args) {
  try {
    return await api.call(ch, ...args);
  } catch (e) {
    toast(e.message, 'error');
    e.shown = true;
    throw e;
  }
}

// Errors from call() have already been shown as a toast; show anything else once.
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  if (!e.reason?.shown) toast(e.reason?.message || String(e.reason), 'error');
});

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
}

// ---------- shell ----------
function renderNav() {
  const counts = { library: S.apps.filter((a) => a.category !== 'tool' && fitsEngine(a)).length || '', bottles: S.bottles.length, console: S.running.length || '' };
  $('#nav').innerHTML = Object.entries(VIEWS).filter(([, v]) => !v.hidden?.()).map(([k, v], i) => `
    ${i === 3 ? '<div class="nav-sep"></div><div class="nav-label">Advanced</div>' : ''}
    <button class="nav-item ${v.advanced ? 'small' : ''} ${view === k ? 'active' : ''}" data-nav="${k}">${icon(v.icon)}${v.title}<span class="count">${counts[k] ?? ''}</span></button>`).join('')
    + (S.bottles.length && S.engine ? `<div class="nav-sep"></div><div class="nav-label">Windows Tools</div>
    ${QUICK_TOOLS.map(([tool, label, ic]) => `<button class="nav-item small" data-act="quick-tool" data-tool="${tool}">${icon(ic)}${label}</button>`).join('')}` : '');

  const e = S.engine;
  const rosettaMissing = S.cpu.appleSilicon && !S.cpu.rosetta;
  $('#side-foot').innerHTML = `
    ${accountPill()}
    ${S.running.length ? `<div class="pill" data-nav="console" style="cursor:pointer"><div class="dot live"></div><div><b>${S.running.length} running</b><span>${esc(S.running.map((r) => r.name).join(', '))}</span></div></div>` : ''}
    ${S.update ? `<div class="pill update" data-act="open-update" style="cursor:pointer"><div class="dot live"></div><div><b>Update available</b><span>Umbra ${esc(S.update.version)} · click to download</span></div></div>` : ''}
    <div class="pill" data-nav="settings" style="cursor:pointer">
      <div class="dot ${e && !rosettaMissing ? 'ok' : 'warn'}"></div>
      <div><b>${e && S.settings.setupDone ? 'Ready to play' : 'Setup needed'}</b><span>${e ? esc(e.version || e.source) : 'Click to set up'}${rosettaMissing ? ' · Rosetta needed' : ''}</span></div>
    </div>`;
}

function renderTop() {
  const v = VIEWS[view];
  $('#title').textContent = v.title;
  $('#subtitle').textContent = v.sub();
  const actions = {
    library: `${S.apps.length > 1 ? `<label class="search">${icon('search')}<input id="search" placeholder="Search" value="${esc(query)}" spellcheck="false"></label>` : ''}<button class="btn primary" data-act="add-menu">${icon('plus')}Add</button>`,
    store: '',
    settings: '',
    bottles: `<button class="btn primary" data-act="new-bottle">${icon('plus')}New Bottle</button>`,
    console: `<button class="btn" data-act="clear-logs">${icon('trash')}Clear</button>`,
    admin: `<label class="search">${icon('search')}<input id="admin-search" placeholder="Search name, email or HWID" value="${esc(adminQuery)}" spellcheck="false"></label><button class="btn" data-act="admin-refresh">${icon('refresh')}Refresh</button>`,
  };
  $('#top-actions').innerHTML = actions[view];
}

let topFor = null;
function render() {
  if (!S) return;
  renderAuth();
  if (VIEWS[view].hidden?.()) view = 'library';
  renderNav();
  // Keep the header (and the search box being typed in) unless the view changed.
  if (topFor !== view || !/^(admin-)?search$/.test(document.activeElement?.id || '')) { renderTop(); topFor = view; }
  const fn = { library: viewLibrary, store: viewStore, settings: viewSettings, bottles: viewBottles, console: viewConsole, admin: viewAdmin }[view] || viewLibrary;
  const scroll = $('#view').scrollTop;
  $('#view').innerHTML = fn();
  $('#view').scrollTop = scroll;
  if (view === 'console') paintLogs();
  renderDock();
}

function go(v) {
  view = v;
  if (v === 'settings') loadEngines();
  if (v === 'admin') loadAdmin();
  $('#view').style.animation = 'none';
  void $('#view').offsetWidth;
  $('#view').style.animation = '';
  $('#view').scrollTop = 0;
  render();
}

// Shown until setup has finished; the welcome wizard does the actual work.
// Apps in bottles built by another engine can't run on this one (after switching
// engines, setup reinstalls them in a fresh bottle).
const RECOMMENDED_ENGINE = 'CrossOver engine';
const fitsEngine = (a) => (S.bottles.find((b) => b.id === a.bottleId)?.engineKind || 'wine') === S.engineKind;

function engineBanner() {
  const busy = S.tasks.find((t) => t.id === 'setup');
  const upgrading = S.tasks.find((t) => t.id === 'engine');
  if (S.platform === 'darwin' && S.engine && S.engine.source !== RECOMMENDED_ENGINE && !busy) {
    const why = 'CrossOver’s engine with DirectX 11 → Metal, so games like Unity ones can start. Setup then reinstalls Steam with it.';
    return `<div class="banner"><div class="badge-icon">${icon('bolt')}</div><div class="grow"><b>${upgrading ? 'Installing the recommended engine…' : 'Switch to the recommended engine'}</b><span>${upgrading ? esc(taskPct.engine?.detail || upgrading.detail) : why}</span></div>
      <button class="btn glow" data-act="upgrade-engine" ${upgrading ? 'disabled' : ''}>${upgrading ? `${Math.round((taskPct.engine?.pct ?? 0) * 100)}%` : `${icon('download')}Switch`}</button></div>`;
  }
  if (S.settings.setupDone && S.engine && S.bottles.length && !(S.cpu.appleSilicon && !S.cpu.rosetta)) return '';
  return `<div class="banner"><div class="badge-icon">${icon('bolt')}</div><div class="grow"><b>${busy ? 'Setting up Umbra…' : 'Umbra isn’t set up yet'}</b><span>${busy ? esc(taskPct.setup?.detail || busy.detail) : 'One click installs everything needed to run Windows games and apps.'}</span></div>
    <button class="btn glow" data-act="open-wizard">${busy ? 'Show progress' : `${icon('bolt')}Set up now`}</button></div>`;
}

// ---------- Library ----------
const canUninstall = (a) => a.category !== 'tool' && /[\\/](Program Files( \(x86\))?|Games|GOG Games|steamapps[\\/]common|AppData[\\/]Local[\\/]Programs)[\\/]/i.test(a.exe);
const isSteam = (a) => /[\\/]steam\.exe$/i.test(a.exe);
const appSub = (a) => `${S.bottles.length > 1 ? `${esc(bottleName(a.bottleId))} · ` : ''}${fmtTime(a.playtime)}`;

function tile(a) {
  const live = isRunning(a.id);
  return `<div class="tile" data-app="${a.id}">
    <div class="art" data-act="play" data-id="${a.id}">
      <div class="art-bg" style="background:${artFor(a.name)}"></div>
      ${a.icon ? '' : `<div class="letter">${esc(initial(a.name))}</div>`}
      ${appArt(a)}
      ${live ? '<div class="live-badge"><div class="dot live"></div>Running</div>' : ''}
      ${a.favorite ? `<div class="fav-badge">${icon('star')}</div>` : ''}
      <div class="play"><div class="play-circle">${icon('play')}</div></div>
    </div>
    <div class="body"><div class="t"><b>${esc(a.name)}</b><span>${appSub(a)}</span></div>
    <button class="icon-btn" title="Settings" data-act="app-settings" data-id="${a.id}">${icon('sliders')}</button>
    <button class="icon-btn" title="More" data-act="app-menu" data-id="${a.id}">${icon('more')}</button></div>
  </div>`;
}

function toolTile(a) {
  return `<button class="tool-tile ${isRunning(a.id) ? 'live' : ''}" data-act="play" data-id="${a.id}" title="Open ${esc(a.name)}">
    <span class="tool-icon" style="background:${artFor(a.name)}">${a.icon ? img([fileUrl(a.icon)], 'tool-img') : esc(initial(a.name))}</span>
    <span class="tool-name">${esc(a.name)}</span>
  </button>`;
}

let query = '';
function viewLibrary() {
  const all = S.apps.filter(fitsEngine).sort((x, y) => (y.lastPlayed || y.added) - (x.lastPlayed || x.added));
  const match = (a) => !query || `${a.name} ${bottleName(a.bottleId)}`.toLowerCase().includes(query.toLowerCase());
  const main = all.filter((a) => a.category !== 'tool');
  const tools = all.filter((a) => a.category === 'tool').sort((x, y) => x.name.localeCompare(y.name));
  const shown = [...main.filter((a) => a.favorite && match(a)), ...main.filter((a) => !a.favorite && match(a))];
  const toolsShown = tools.filter(match);
  const toolsSection = toolsShown.length ? `<div class="section-h"><h2>Windows Tools</h2><span class="faint">Built into Windows</span></div>
    <div class="tools-grid">${toolsShown.map(toolTile).join('')}</div>` : '';
  if (!main.length) {
    return `${engineBanner()}
      <div class="empty-hero">
        <div class="big-icon">${icon('gamepad')}</div>
        <h3>Let’s add your first game or app</h3>
        <p>Install a game store like Steam, or run any Windows program you already have. You can also drag an .exe straight onto this window.</p>
        <div class="row">
          <button class="btn lg glow" data-nav="store">${icon('download')}Get Apps</button>
          <button class="btn lg" data-act="run-exe">${icon('file')}Run a Windows Program…</button>
        </div>
      </div>
      ${toolsSection}`;
  }
  const hero = main[0];
  return `${engineBanner()}
    ${query ? '' : `<div class="hero">
      <div class="art" style="background:${artFor(hero.name)}">${hero.icon ? '' : `<div class="letter">${esc(initial(hero.name))}</div>`}${appArt(hero, true)}</div>
      <div class="info">
        <div class="kicker">${isRunning(hero.id) ? 'Now playing' : hero.lastPlayed ? `Last played ${ago(hero.lastPlayed)}` : 'Recently added'}</div>
        <h3>${esc(hero.name)}</h3>
        <div class="meta">${appSub(hero)}</div>
        <div class="row">
          ${isRunning(hero.id)
            ? `<button class="btn lg" data-act="stop-app" data-id="${hero.id}">${icon('stop')}Stop</button>`
            : `<button class="btn lg primary" data-act="play" data-id="${hero.id}">${icon('play')}Play</button>`}
          <button class="btn lg" data-act="app-settings" data-id="${hero.id}">${icon('sliders')}Settings</button>
          <button class="btn lg" data-act="app-menu" data-id="${hero.id}">${icon('more')}</button>
        </div>
      </div>
    </div>`}
    <div class="section-h"><h2>${query ? `Results for “${esc(query)}”` : 'Games & Apps'}</h2><span class="faint">${shown.length} of ${main.length}</span></div>
    ${shown.length ? `<div class="grid">${shown.map(tile).join('')}</div>` : '<p class="muted">Nothing matches that search.</p>'}
    ${toolsSection}`;
}

// ---------- Bottles ----------
function viewBottles() {
  if (!S.bottles.length) {
    return `${engineBanner()}<div class="empty" data-act="new-bottle"><div class="big-icon">${icon('bottle')}</div><h3>No bottles yet</h3><p>A bottle is a self-contained Windows install with its own C: drive, registry and settings. Create one to begin.</p></div>`;
  }
  return `${engineBanner()}<div class="bottles">${S.bottles.map((b) => {
    const n = S.apps.filter((a) => a.bottleId === b.id).length;
    const live = S.running.filter((r) => r.bottleId === b.id).length;
    const busy = S.tasks.some((t) => t.id === `bottle:${b.name}`);
    return `<div class="card bottle">
      <div class="head">
        <div class="glass" style="background:${artFor(b.name)}">${esc(initial(b.name))}</div>
        <div class="t"><b>${esc(b.name)}</b><span>${busy ? 'Setting up…' : `Created ${new Date(b.created).toLocaleDateString()}`}</span></div>
        ${live ? `<div class="dot live" title="${live} running"></div>` : ''}
        <button class="icon-btn" data-act="bottle-menu" data-id="${b.id}">${icon('more')}</button>
      </div>
      <div class="stats">
        <div class="stat"><small>Windows</small><b>${winverName(b.winver)}</b></div>
        <div class="stat"><small>Apps</small><b>${n}</b></div>
        <div class="stat"><small>Status</small><b>${live ? `${live} running` : b.ready ? 'Idle' : busy ? 'Building' : 'Incomplete'}</b></div>
      </div>
      <div class="tools">
        <button class="btn sm primary" data-act="bottle-run" data-id="${b.id}">${icon('play')}Run .exe</button>
        <button class="btn sm" data-act="bottle-drive" data-id="${b.id}">${icon('folder')}C: Drive</button>
        <button class="btn sm" data-act="bottle-scan" data-id="${b.id}">${icon('search')}Find Apps</button>
        <button class="btn sm" data-act="bottle-components" data-id="${b.id}">${icon('chip')}Components${b.components && Object.keys(b.components).length ? ` · ${Object.keys(b.components).length}` : ''}</button>
        <button class="btn sm" data-act="bottle-tool" data-tool="winecfg" data-id="${b.id}">${icon('sliders')}Config</button>
        ${live ? `<button class="btn sm danger" data-act="bottle-kill" data-id="${b.id}">${icon('stop')}Stop All</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Get Apps ----------
const COMPAT = { good: ['Works great', 'var(--green)'], ok: ['Works', 'var(--cyan)'], limited: ['Some games won’t run', 'var(--amber)'] };

function storeButton(x) {
  const t = S.tasks.find((k) => k.id === `store:${x.id}` || (x.id === 'steam' && k.id === 'steam'));
  if (t) return `<button class="btn" disabled>Installing… ${Math.round((taskPct[t.id]?.pct ?? t.pct ?? 0) * 100)}%</button>`;
  if (x.id === 'steam' && S.steam.installed && !x.appId) {
    return `<button class="btn primary" data-act="steam-readd">${icon('plus')}Add Steam to Library</button>`;
  }
  if (x.appId) {
    return isRunning(x.appId)
      ? `<button class="btn" data-act="stop-app" data-id="${x.appId}">${icon('stop')}Stop</button>`
      : `<button class="btn primary" data-act="play" data-id="${x.appId}">${icon('play')}Open</button>`;
  }
  return `<button class="btn glow" data-act="store-install" data-id="${x.id}" ${S.engine ? '' : 'disabled'}>${icon('download')}Install</button>`;
}

function viewStore() {
  const steam = S.store.find((x) => x.id === 'steam');
  const rest = S.store.filter((x) => x.id !== 'steam');
  const card = (x) => `<div class="card store-card">
    <div class="store-top"><div class="store-icon" style="background:${artFor(x.name)}">${esc(initial(x.name))}</div>
      <div class="t"><b>${esc(x.name)}</b><span>${esc(x.kind)}</span></div></div>
    <p>${esc(x.desc)}</p>
    <div class="store-foot"><span class="compat" style="color:${COMPAT[x.compat][1]}">● ${COMPAT[x.compat][0]}</span>${storeButton(x)}</div>
  </div>`;
  return `${engineBanner()}
    <div class="steam-hero">
      <div class="orb"></div>
      <div class="kicker" style="color:var(--cyan)">Recommended</div>
      <h2>${S.steam.installed ? 'Steam is installed.' : 'Play your Steam games on your Mac.'}</h2>
      <p>${S.steam.installed ? 'Open Steam, sign in and install games as usual. When Steam closes, your installed games show up in the Library with their cover art.'
        : 'Installs Valve’s official Steam for Windows. No Windows license needed.'}</p>
      <p class="faint" style="font-size:12.5px;margin-top:-16px;margin-bottom:22px">Tip: Steam’s first launch installs a big update, so let it finish. If macOS asks to let it find devices on your local network, click <b>Allow</b>.</p>
      <div class="row" style="display:flex;gap:10px;flex-wrap:wrap">${storeButton(steam)}${S.steam.installed ? ` <button class="btn" data-act="steam-import">${icon('download')}Import my Steam games</button> <button class="btn" data-act="steam-repair">${icon('refresh')}Repair Steam</button>` : ''}</div>
    </div>
    <div class="section-h"><h2>Game Stores</h2></div>
    <div class="store-grid">${rest.filter((x) => x.kind === 'Game store').map(card).join('')}</div>
    <div class="section-h"><h2>Apps</h2></div>
    <div class="store-grid">${rest.filter((x) => x.kind !== 'Game store').map(card).join('')}</div>
    <div class="section-h"><h2>Have something else?</h2></div>
    <div class="empty" data-act="run-exe"><div class="big-icon">${icon('file')}</div><h3>Run any Windows installer or program</h3><p>Choose an .exe or .msi, or drag it onto this window. Installed programs are added to your Library automatically.</p></div>
    <div class="section-h"><h2>What to expect</h2></div>
    <div class="notes">
      <div class="card"><b style="color:var(--green)">${icon('check')}Works well</b><span>Most DirectX 9–11 games, indie titles, older classics and many launchers.</span></div>
      <div class="card"><b style="color:var(--amber)">${icon('bolt')}Depends</b><span>DirectX 12 games need D3DMetal. See Settings → Windows engine.</span></div>
      <div class="card"><b style="color:var(--red)">${icon('shield')}Won’t work</b><span>Games with kernel anti-cheat (Valorant, many online shooters).</span></div>
    </div>`;
}

// ---------- Settings ----------
function viewSettings() {
  const e = S.engine;
  const t = S.tasks.find((x) => x.id === 'engine');
  const s = S.settings;
  const toggle = (key, title, desc) => `<div class="toggle-row"><div class="t"><b>${title}</b><span>${desc}</span></div><button class="switch ${s[key] ? 'on' : ''}" data-act="toggle" data-key="${key}"></button></div>`;
  const pct = Math.round((taskPct.engine?.pct ?? t?.pct ?? 0) * 100);
  return `${engineBanner()}${accountCard()}<div class="card engine-card setup-again">
      <div><b>Setup</b><span>Reinstall Steam, Windows essentials or game components any time.</span></div>
      <button class="btn" data-act="open-wizard">${icon('bolt')}Run Setup Again</button>
    </div>
    <div class="engine-grid">
    <div class="card engine-card">
      <h3>Windows Engine</h3>
      <div class="engine-status">
        <div class="ring"><i>${icon(e ? 'check' : 'alert')}</i></div>
        <div><b>${e ? esc(e.version || 'Wine') : 'Not installed'}</b><span class="muted">${e ? `Source: ${esc(e.source)}` : 'Umbra needs Wine to translate Windows programs.'}</span></div>
      </div>
      <dl class="kv">
        <dt>Binary</dt><dd class="mono">${e ? esc(e.path) : '—'}</dd>
        <dt>Platform</dt><dd>${S.platform === 'darwin' ? 'macOS' : esc(S.platform)}${S.cpu.appleSilicon ? ' · Apple Silicon' : ''}</dd>
        ${S.cpu.appleSilicon ? `<dt>Rosetta 2</dt><dd>${S.cpu.rosetta ? 'Installed' : '<span style="color:var(--amber)">Not installed</span>'}</dd>` : ''}
        <dt>Umbra</dt><dd>v${esc(S.version)}</dd>
      </dl>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${t ? `<button class="btn glow" disabled>Installing… ${pct}%</button>`
          : `<button class="btn ${e ? '' : 'glow'}" data-act="install-engine" ${S.platform === 'darwin' ? '' : 'disabled'}>${icon('download')}${e && e.source === RECOMMENDED_ENGINE ? 'Reinstall Engine' : 'Install Recommended Engine'}</button>`}
        <button class="btn" data-act="choose-engine">${icon('file')}Use Custom Wine…</button>
        ${s.enginePath ? '<button class="btn ghost" data-act="reset-engine">Reset to automatic</button>' : ''}
        ${S.cpu.appleSilicon && !S.cpu.rosetta ? '<button class="btn glow" data-act="rosetta">Install Rosetta</button>' : ''}
      </div>
    </div>
    <div class="card engine-card">
      <h3>Performance</h3>
      ${toggle('msync', 'Faster games', 'Uses MSync, which speeds up most games. Leave this on.')}
      ${toggle('metalHud', 'Show FPS in every game', 'Adds Apple’s frame-rate counter. You can also turn it on for single games.')}
      ${toggle('esync', 'Compatibility mode', 'Try this if a game freezes or stutters (ESync).')}
      ${toggle('verboseLogs', 'Detailed logs', 'For troubleshooting: shows more in the Console.')}
    </div>
  </div>
  <div class="card engine-card" style="margin-top:18px">
    <h3>Windows Engines on this Mac</h3>
    ${ENGINES === null ? '<p class="muted">Looking for Wine engines…</p>' : ENGINES.length ? `<div class="comp-list">${ENGINES.map((x) => `
      <div class="comp"><div class="t"><b>${esc(x.source)} ${x.d3dmetal ? '<span class="tag-exp tag-dx">D3DMetal · DirectX 12</span>' : ''}</b><span class="mono">${esc(x.version || '')} · ${esc(x.path)}</span></div>
      ${S.engine?.path === x.path ? `<span class="comp-ok">${icon('check')}In use</span>` : `<button class="btn sm" data-act="use-engine" data-path="${esc(x.path)}">Use</button>`}</div>`).join('')}</div>`
      : '<p class="muted">None found yet. Install the Umbra engine above.</p>'}
    <p class="faint" style="margin-top:12px;font-size:12px">Have <b>Whisky</b> or Apple’s <b>Game Porting Toolkit</b>? Umbra finds their D3DMetal engine here. Use it for DirectX 12 games.</p>
  </div>
  <div class="card engine-card credits">
    <h3>Credits</h3>
    <div class="credit-hero"><div class="mark"><i></i></div><div><b>Umbra v${esc(S.version)}</b><span>Made by Vini</span> <button class="credit-link" data-act="open-url" data-url="https://github.com/coldvini">@coldvini</button></div></div>
    <p class="muted">Umbra stands on the shoulders of these open-source projects:</p>
    <ul class="credit-list">
      ${CREDITS.map(([name, what, url]) => `<li><button class="credit-link" data-act="open-url" data-url="${url}">${esc(name)}</button><span>${esc(what)}</span></li>`).join('')}
    </ul>
  </div>`;
}

const CREDITS = [
  ['Wine', 'The compatibility layer that runs Windows programs', 'https://www.winehq.org'],
  ['Gcenx macOS Wine builds', 'Prebuilt Wine for macOS that Umbra installs', 'https://github.com/Gcenx/macOS_Wine_builds'],
  ['DXVK-macOS', 'DirectX 10/11 to Vulkan translation', 'https://github.com/Gcenx/DXVK-macOS'],
  ['MoltenVK', 'Vulkan on Apple Metal', 'https://github.com/KhronosGroup/MoltenVK'],
  ['Winetricks', 'Extra Windows components', 'https://github.com/Winetricks/winetricks'],
  ['Electron', 'The app framework', 'https://www.electronjs.org'],
  ['Inter', 'Typeface by Rasmus Andersson', 'https://rsms.me/inter/'],
];

// ---------- Console ----------
function viewConsole() {
  return `<div class="console">
    <div class="running">${S.running.length ? S.running.map((r) => `<div class="run-chip"><div class="dot live"></div><div><b>${esc(r.name)}</b> <span>${esc(bottleName(r.bottleId))} · pid ${r.pid ?? '?'}</span></div><button class="btn sm danger" data-act="stop-run" data-run="${r.runId}">${icon('stop')}Stop</button></div>`).join('')
      : '<span class="faint">Nothing running right now.</span>'}</div>
    <div class="log mono" id="log"></div>
  </div>`;
}
function logLine(l) {
  const t = new Date(l.t).toLocaleTimeString([], { hour12: false });
  return `<div class="${l.level}"><time>${t}</time>${esc(l.line)}</div>`;
}
function paintLogs() {
  const el = $('#log');
  if (!el) return;
  el.innerHTML = logs.length ? logs.slice(-1500).map(logLine).join('') : '<div class="faint">Output from Wine and your apps appears here.</div>';
  el.scrollTop = el.scrollHeight;
}

// ---------- dock (task progress) ----------
function renderDock() {
  const dock = $('#dock');
  const ids = new Set(S.tasks.map((t) => t.id));
  for (const el of [...dock.children]) if (!ids.has(el.dataset.id)) el.remove();
  for (const t of S.tasks) {
    const pct = Math.round((taskPct[t.id]?.pct ?? t.pct ?? 0) * 100);
    const detail = taskPct[t.id]?.detail ?? t.detail;
    let el = [...dock.children].find((c) => c.dataset.id === t.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'task';
      el.dataset.id = t.id;
      el.innerHTML = `<div class="r"><span>${esc(t.label)}</span><em></em></div><div class="d"></div><div class="track"><i></i></div>`;
      dock.appendChild(el);
    }
    el.querySelector('em').textContent = `${pct}%`;
    el.querySelector('.d').textContent = detail;
    el.querySelector('.track i').style.width = `${Math.max(2, pct)}%`;
  }
}

// ---------- modals ----------
function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  const close = () => bg.remove();
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  $('#modal-root').appendChild(bg);
  onMount?.(bg, close);
  bg.querySelector('input,select')?.focus();
  return close;
}

// The last-used bottle if it still exists, else the first one.
const defaultBottleId = () => (S.bottles.some((b) => b.id === S.settings.lastBottleId) ? S.settings.lastBottleId : S.bottles[0]?.id);
const bottleOptions = (sel) => S.bottles.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)} — ${winverName(b.winver)}</option>`).join('');

async function ensureBottle() {
  if (S.bottles.length) return true;
  if (!S.engine) { openWizard(); return false; }
  toast('Creating your first bottle…');
  await call('bottle:create', { name: 'Default', winver: 'win10' });
  return true;
}

async function runFileFlow(file, presetBottle) {
  if (!S.engine || !S.bottles.length) { openWizard(); return; }
  const def = presetBottle || defaultBottleId();
  const guess = basename(file).replace(/\.(exe|msi|bat|cmd|lnk)$/i, '');
  const installer = /\.msi$/i.test(file) || /(setup|install|^inst[_-]|_inst\b)/i.test(basename(file));
  modal(`<h3>${installer ? 'Install this program?' : 'Run this program?'}</h3><p>${installer ? 'It installs like it would on a PC. When it finishes, Umbra adds it to your Library.' : 'It opens in its own window on your Mac.'}</p>
    <div class="file-box"><div class="fi">${icon(installer ? 'download' : 'file')}</div><div><b>${esc(basename(file))}</b><span>${esc(file)}</span></div></div>
    ${installer ? '' : `<label class="check"><input type="checkbox" id="m-add" checked><div><b>Add to my Library</b><span>So you can open it again with one click</span></div></label>`}
    <details class="more-opts"><summary>More options</summary>
      ${S.bottles.length > 1 ? `<div class="field"><label>Windows environment</label><select class="input" id="m-bottle">${bottleOptions(def)}</select></div>` : ''}
      <div class="field"><label>Launch options (optional)</label><input class="input" id="m-args" placeholder="e.g. -windowed"></div>
    </details>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-go">${icon(installer ? 'download' : 'play')}${installer ? 'Install' : 'Run'}</button></div>`,
  (el, close) => {
    $('#m-go', el).onclick = async () => {
      const bottleId = $('#m-bottle', el)?.value || def;
      const args = $('#m-args', el).value;
      close();
      if ($('#m-add', el)?.checked) {
        const a = await call('app:add', { bottleId, exe: file, name: guess, args });
        await call('app:run', a.id);
      } else await call('run:file', { bottleId, file, args });
      toast(installer ? `Installing ${guess}… it’ll appear in your Library when done` : `Opening ${guess}…`);
    };
  });
}

async function pickAndRun(bottleId) {
  const f = await call('dialog:exe');
  if (f) runFileFlow(f, bottleId);
}

function newBottleModal() {
  if (!S.engine) { openWizard(); return; }
  modal(`<h3>New Bottle</h3><p>A clean Windows environment with its own C: drive.</p>
    <div class="field"><label>Name</label><input class="input" id="m-name" placeholder="Games" value="${S.bottles.length ? '' : 'Default'}"></div>
    <div class="field"><label>Windows version</label><select class="input" id="m-ver">${WINVERS.map(([v, n]) => `<option value="${v}" ${v === 'win10' ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-go">Create Bottle</button></div>`,
  (el, close) => {
    const go_ = async () => {
      const name = $('#m-name', el).value.trim();
      if (!name) return $('#m-name', el).focus();
      close();
      await call('bottle:create', { name, winver: $('#m-ver', el).value });
      toast(`Bottle “${name}” is ready`);
    };
    $('#m-go', el).onclick = go_;
    $('#m-name', el).onkeydown = (e) => e.key === 'Enter' && go_();
  });
}

async function addAppModal() {
  if (!(await ensureBottle().catch(() => false))) return;
  const f = await call('dialog:exe');
  if (!f) return;
  editAppModal({ exe: f, name: basename(f).replace(/\.[^.]+$/, ''), args: '', bottleId: defaultBottleId() }, true);
}

function editAppModal(a, isNew) {
  modal(`<h3>${isNew ? 'Add to Library' : 'Edit App'}</h3><p>${esc(a.exe)}</p>
    <div class="field"><label>Name</label><input class="input" id="m-name" value="${esc(a.name)}"></div>
    <div class="field"><label>Bottle</label><select class="input" id="m-bottle">${bottleOptions(a.bottleId)}</select></div>
    <div class="field"><label>Launch arguments</label><input class="input" id="m-args" value="${esc(a.args)}"></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-go">${isNew ? 'Add' : 'Save'}</button></div>`,
  (el, close) => {
    $('#m-go', el).onclick = async () => {
      const patch = { name: $('#m-name', el).value.trim() || a.name, bottleId: $('#m-bottle', el).value, args: $('#m-args', el).value };
      close();
      if (isNew) await call('app:add', { ...patch, exe: a.exe });
      else await call('app:update', a.id, patch);
    };
  });
}

async function scanModal(bottleId) {
  const found = await call('bottle:scan', bottleId);
  if (!found.length) return toast('No new programs found in this bottle');
  pickAppsModal(bottleId, found, `Found ${found.length} program${found.length === 1 ? '' : 's'}`, 'Select what to add to your Library.');
}

function pickAppsModal(bottleId, found, title, sub) {
  modal(`<h3>${esc(title)}</h3><p>${esc(sub)}</p>
    <div style="max-height:320px;overflow:auto;margin-bottom:12px">${found.map((f, i) => `<label class="check"><input type="checkbox" data-i="${i}" ${i < 8 ? 'checked' : ''}><div><b>${esc(f.name)}</b><span>${esc(f.exe.split('drive_c').pop())}</span></div></label>`).join('')}</div>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-go">Add Selected</button></div>`,
  (el, close) => {
    $('#m-go', el).onclick = async () => {
      const picks = [...el.querySelectorAll('input[data-i]:checked')].map((c) => found[+c.dataset.i]);
      close();
      for (const p of picks) await call('app:add', { bottleId, exe: p.exe, name: p.name });
      toast(`Added ${picks.length} app${picks.length === 1 ? '' : 's'} to your Library`);
    };
  });
}

let COMPONENTS = null;
let ENGINES = null;
async function loadEngines() {
  ENGINES = await call('engine:list').catch(() => []);
  if (view === 'settings') render();
}
async function componentsModal(bottleId) {
  COMPONENTS ||= await call('components:list');
  const b = S.bottles.find((x) => x.id === bottleId);
  const have = b.components || {};
  modal(`<h3>Components · ${esc(b.name)}</h3><p>Windows runtimes that apps and games often need. If something won’t start, install these first.</p>
    <div class="comp-list">
      ${COMPONENTS.map((c) => `<div class="comp"><div class="t"><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></div>
        ${have[c.id] ? `<span class="comp-ok">${icon('check')}Installed</span><button class="btn sm ghost" data-comp="${c.id}">Reinstall</button>`
          : `<button class="btn sm primary" data-comp="${c.id}">${icon('download')}Install</button>`}</div>`).join('')}
      <div class="comp"><div class="t"><b>DXVK <span class="tag-exp">Experimental</span></b><span>Faster DirectX 10/11 games: translates to Vulkan, then Metal via MoltenVK.</span></div>
        <button class="switch ${b.dxvk ? 'on' : ''}" id="m-dxvk"></button></div>
    </div>
    <div class="field" style="margin-top:14px"><label>Winetricks (advanced)</label>
      <div style="display:flex;gap:8px"><input class="input" id="m-wt" placeholder="e.g. corefonts d3dcompiler_47" style="flex:1"><button class="btn" id="m-wt-go">Run</button></div></div>
    <div class="modal-actions"><button class="btn ghost" data-close>Done</button></div>`,
  (el, close) => {
    el.querySelectorAll('[data-comp]').forEach((btn) => btn.onclick = async () => {
      const c = COMPONENTS.find((x) => x.id === btn.dataset.comp);
      close();
      await call('bottle:component', bottleId, c.id);
      toast(`${c.name} installed in “${b.name}”`);
    });
    $('#m-dxvk', el).onclick = async () => {
      close();
      await call('bottle:dxvk', bottleId, !b.dxvk);
      toast(`DXVK ${b.dxvk ? 'disabled' : 'enabled'} in “${b.name}”`);
    };
    $('#m-wt-go', el).onclick = async () => {
      const verb = $('#m-wt', el).value.trim();
      if (!verb) return;
      close();
      await call('bottle:winetricks', bottleId, verb);
      toast(`winetricks ${verb} finished`);
    };
  });
}

// ---------- per-app settings ----------
function appSettingsModal(id) {
  const a = S.apps.find((x) => x.id === id);
  const b = S.bottles.find((x) => x.id === a.bottleId) || {};
  const sw = (key, on, title, desc) => `<div class="toggle-row"><div class="t"><b>${title}</b><span>${desc}</span></div><button class="switch ${on ? 'on' : ''}" data-sw="${key}"></button></div>`;
  const shared = S.apps.filter((x) => x.bottleId === a.bottleId).length > 1;
  const fixing = S.tasks.some((t) => t.id === `fix:${a.id}`);
  const missing = ['vcrun', 'directx9'].filter((c) => !b.components?.[c]).length;
  modal(`<div class="settings-head"><div class="tool-icon big" style="background:${artFor(a.name)}">${a.icon ? img([fileUrl(a.icon)], 'tool-img') : esc(initial(a.name))}</div>
      <div><h3>${esc(a.name)}</h3><p class="muted">${fmtTime(a.playtime)}</p></div></div>
    <div class="field"><label>Name</label><input class="input" id="s-name" value="${esc(a.name)}"></div>
    <div class="settings-group">
      ${sw('hud', a.hud, 'Show FPS counter', 'Frame rate and GPU overlay while it runs.')}
      ${sw('dxvk', !!b.dxvk, 'Faster graphics (DXVK)', `Speeds up most DirectX 10/11 games. Turn off if it looks wrong.${shared ? ' Applies to everything in this Windows environment.' : ''}`)}
      ${sw('retina', !!b.retina, 'Sharper on Retina screens', 'Full resolution instead of upscaled. Can lower FPS.')}
    </div>
    <div class="field"><label>Windows version</label><select class="input" id="s-ver">${WINVERS.map(([v, n]) => `<option value="${v}" ${v === b.winver ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <span class="hint">Older games sometimes need Windows 7 or XP.</span></div>
    <details class="more-opts"><summary>Launch options</summary>
      <div class="field"><input class="input" id="s-args" value="${esc(a.args)}" placeholder="e.g. -windowed -dx11"></div>
    </details>
    ${isSteam(a) ? `<div class="fix-box"><div><b>Steam can’t connect or won’t update?</b><span>Clears Steam’s download and web caches and restarts it. Your games stay installed.</span></div>
      <button class="btn" id="s-repair">${icon('refresh')}Repair Steam</button></div>` : ''}
    <div class="fix-box"><div><b>Won’t start or crashes?</b><span>${missing ? 'Installs Visual C++ and DirectX, which most games need.' : 'Visual C++ and DirectX are already installed.'}</span></div>
      <button class="btn" id="s-fix" ${fixing || !missing ? 'disabled' : ''}>${icon('bolt')}${fixing ? 'Fixing…' : 'Fix Common Problems'}</button></div>
    <div class="modal-actions spread">
      <div><button class="btn ghost" id="s-remove">Remove from Library</button>${canUninstall(a) ? `<button class="btn ghost danger" id="s-uninstall">${icon('trash')}Uninstall</button>` : ''}</div>
      <div><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="s-save">Save</button></div>
    </div>`,
  (el, close) => {
    const state = { hud: !!a.hud, dxvk: !!b.dxvk, retina: !!b.retina };
    el.querySelectorAll('[data-sw]').forEach((btn) => btn.onclick = () => { state[btn.dataset.sw] = !state[btn.dataset.sw]; btn.classList.toggle('on'); });
    $('#s-fix', el).onclick = async () => { close(); await call('app:fix', a.id); toast(`${a.name}: Visual C++ and DirectX installed`); };
    $('#s-remove', el).onclick = async () => { close(); await call('app:remove', a.id); toast(`Removed ${a.name} from your Library`); };
    const rp = $('#s-repair', el);
    if (rp) rp.onclick = () => { close(); repairSteam(); };
    const un = $('#s-uninstall', el);
    if (un) un.onclick = () => { close(); uninstall(a); };
    $('#s-save', el).onclick = async () => {
      close();
      await call('app:update', a.id, { name: $('#s-name', el).value.trim() || a.name, args: $('#s-args', el).value, hud: state.hud });
      const ver = $('#s-ver', el).value;
      if (ver !== b.winver) await call('bottle:winver', b.id, ver);
      if (state.retina !== !!b.retina) await call('bottle:retina', b.id, state.retina);
      if (state.dxvk !== !!b.dxvk) await call('bottle:dxvk', b.id, state.dxvk);
      toast('Settings saved');
    };
  });
}

// ---------- welcome wizard ----------
let wizard = null; // { el, step }
let wizardDismissed = false;
const SETUP_CHOICES = [
  ['steam', 'Steam', 'Valve’s game store and your PC game library.', true],
  ['tools', 'Windows essentials', 'Task Manager, File Explorer, Notepad, Command Prompt, Control Panel and more.', true],
  ['components', 'Game components', 'Visual C++ and DirectX. Most games need these.', true],
  ['dotnet', '.NET for apps', 'Needed by some Windows apps and mod managers.', false],
];

function openWizard() {
  if (wizard) return;
  const el = document.createElement('div');
  el.className = 'wizard';
  $('#modal-root').appendChild(el);
  wizard = { el, step: S.tasks.some((t) => t.id === 'setup') ? 'progress' : 'welcome', choices: Object.fromEntries(SETUP_CHOICES.map(([k, , , on]) => [k, on])) };
  paintWizard();
}

function closeWizard() {
  wizard?.el.remove();
  wizard = null;
  wizardDismissed = true;
}

function paintWizard(t) {
  if (!wizard) return;
  const w = wizard;
  const eclipse = '<div class="eclipse sm"><div class="corona"></div><div class="ring"></div><div class="moon"></div></div>';
  let body;
  if (w.step === 'welcome') {
    body = `${eclipse}<h1>Welcome to Umbra</h1>
      <p>Play Windows games and use Windows apps on your Mac. Let’s get everything ready. It takes a few minutes and you only do it once.</p>
      <div class="wz-actions"><button class="btn lg glow" data-wz="choose">Get Started</button></div>
      <button class="wz-skip" data-wz="skip">Skip for now</button>`;
  } else if (w.step === 'choose') {
    body = `<h2>What should we install?</h2><p>You can change this later in Settings.</p>
      <div class="wz-choices">${SETUP_CHOICES.map(([k, name, desc]) => `<label class="wz-choice ${w.choices[k] ? 'on' : ''}"><input type="checkbox" data-choice="${k}" ${w.choices[k] ? 'checked' : ''}>
        <span class="wz-check">${icon('check')}</span><span><b>${name}</b><small>${desc}</small></span></label>`).join('')}</div>
      <p class="faint wz-note">Always included: the Windows compatibility engine${S.cpu.appleSilicon ? ', Rosetta 2' : ''} and a Windows 10 environment.</p>
      <div class="wz-actions"><button class="btn lg ghost" data-wz="welcome">Back</button><button class="btn lg glow" data-wz="install">${icon('download')}Install</button></div>`;
  } else if (w.step === 'progress') {
    const task = t || S.tasks.find((x) => x.id === 'setup') || {};
    const steps = task.steps || w.steps || [];
    w.steps = steps;
    const pct = Math.round((task.pct ?? 0) * 100);
    body = `${eclipse}<h2>Setting things up…</h2><p>${esc(task.detail || 'Starting…')}</p>
      <div class="wz-bar"><i style="width:${Math.max(2, pct)}%"></i></div><div class="wz-pct">${pct}%</div>
      <ul class="wz-steps">${steps.map((x) => `<li class="${x.state}"><span class="wz-dot">${x.state === 'done' ? icon('check') : x.state === 'failed' ? icon('alert') : ''}</span>${esc(x.label)}${x.state === 'failed' ? `<small>${esc(x.error || 'Failed')}</small>` : ''}</li>`).join('')}</ul>
      <button class="wz-skip" data-wz="hide">Hide (keeps going in the background)</button>`;
  } else if (w.step === 'done') {
    const failed = (w.steps || []).filter((x) => x.state === 'failed');
    body = `${eclipse}<h1>You’re all set</h1>
      <p>${failed.length ? `Almost everything is ready. ${failed.map((x) => x.label).join(', ')} couldn’t be installed right now. You can retry from Get Apps or Settings.` : 'Everything is installed. Pick something from your Library, or get more apps.'}</p>
      <div class="wz-actions"><button class="btn lg glow" data-wz="finish">${icon('library')}Open My Library</button>${S.steam.appId ? `<button class="btn lg" data-wz="steam">${icon('play')}Open Steam</button>` : ''}</div>`;
  } else if (w.step === 'error') {
    body = `<h2>Setup hit a problem</h2><p>${esc(w.error)}</p>
      <div class="wz-actions"><button class="btn lg ghost" data-wz="skip">Close</button><button class="btn lg glow" data-wz="install">Try Again</button></div>`;
  }
  // Only animate in when the step changes, not on every progress update.
  w.el.innerHTML = `<div class="wz-card ${w.painted === w.step ? 'still' : ''}">${body}</div><div class="wz-foot">MADE BY VINI</div>`;
  w.painted = w.step;
  w.el.querySelectorAll('[data-choice]').forEach((c) => c.onchange = () => { w.choices[c.dataset.choice] = c.checked; paintWizard(); });
  w.el.querySelectorAll('[data-wz]').forEach((b) => b.onclick = () => wizardAction(b.dataset.wz));
}

async function wizardAction(a) {
  const w = wizard;
  if (!w) return;
  if (a === 'skip' || a === 'hide') return closeWizard();
  if (a === 'finish') { closeWizard(); return go('library'); }
  if (a === 'steam') { closeWizard(); go('library'); return call('app:run', S.steam.appId); }
  if (a !== 'install') { w.step = a; return paintWizard(); }
  w.step = 'progress';
  w.steps = null;
  paintWizard();
  try {
    const steps = await api.call('setup:all', w.choices);
    if (!wizard) return toast('Umbra is set up and ready');
    wizard.steps = steps;
    wizard.step = 'done';
  } catch (e) {
    if (!wizard) return toast(`Setup failed: ${e.message}`, 'error');
    wizard.step = 'error';
    wizard.error = e.message;
  }
  paintWizard();
}

async function uninstall(a) {
  const gone = await call('app:uninstall', a.id);
  if (gone) toast(`Uninstalled ${gone.join(', ')}`);
}

async function repairSteam() {
  if (!(await call('steam:repair'))) return;
  toast('Repairing Steam… it will re-download its update and open. This can take a few minutes.');
}

function addMenu(anchor) {
  menu(anchor, [
    { icon: 'file', label: 'Run or install a Windows program…', run: () => pickAndRun() },
    { icon: 'download', label: 'Get Apps (Steam, Epic, GOG…)', run: () => go('store') },
    { icon: 'plus', label: 'Add a program to the Library…', run: () => addAppModal() },
  ]);
}

function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = items.map((it, i) => (it === '-' ? '<div class="nav-sep" style="margin:4px 6px"></div>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`)).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  const h = m.offsetHeight;
  m.style.left = `${Math.min(r.right - w, window.innerWidth - w - 10)}px`;
  m.style.top = `${r.bottom + h + 6 > window.innerHeight ? r.top - h - 6 : r.bottom + 6}px`;
  m.onclick = (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    m.remove();
    items[+b.dataset.i].run();
  };
  setTimeout(() => document.addEventListener('mousedown', function off(e) {
    if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); }
  }));
}

// ---------- actions ----------
const actions = {
  'run-exe': () => pickAndRun(),
  'add-menu': (el) => addMenu(el),
  'app-settings': (el) => appSettingsModal(el.dataset.id),
  'open-wizard': () => openWizard(),
  'steam-readd': async () => { await call('steam:readd'); toast('Steam is back in your Library'); },
  'steam-repair': () => repairSteam(),
  'store-install': async (el) => {
    const item = S.store.find((x) => x.id === el.dataset.id);
    await call('store:install', item.id);
    toast(`${item.name} is installed and in your Library`);
  },
  'add-app': addAppModal,
  'new-bottle': newBottleModal,
  play: async (el) => {
    const id = el.dataset.id;
    if (isRunning(id)) return go('console');
    const a = S.apps.find((x) => x.id === id);
    await call('app:run', id);
    toast(`Launching ${a?.name}`);
  },
  'stop-app': (el) => S.running.filter((r) => r.appId === el.dataset.id).forEach((r) => call('run:stop', r.runId)),
  'stop-run': (el) => call('run:stop', +el.dataset.run),
  'app-menu': (el) => {
    const a = S.apps.find((x) => x.id === el.dataset.id);
    menu(el, [
      { icon: 'play', label: 'Play', run: () => call('app:run', a.id) },
      { icon: 'star', label: a.favorite ? 'Remove from Favorites' : 'Add to Favorites', run: () => call('app:update', a.id, { favorite: !a.favorite }) },
      { icon: 'sliders', label: 'Settings…', run: () => appSettingsModal(a.id) },
      { icon: 'folder', label: 'Show in Finder', run: () => call('app:reveal', a.id) },
      { icon: 'window', label: 'Add to Mac Applications', run: async () => { await call('app:launcher', a.id); toast(`${a.name} is now in ~/Applications/Umbra — find it in Launchpad or Spotlight`); } },
      '-',
      ...(isSteam(a) ? [{ icon: 'refresh', label: 'Repair Steam (connection problems)', run: () => repairSteam() }] : []),
      { icon: 'trash', label: 'Remove from Library', run: () => call('app:remove', a.id) },
      ...(canUninstall(a) ? [{ icon: 'trash', label: `Uninstall ${a.name}…`, danger: true, run: () => uninstall(a) }] : []),
    ]);
  },
  'bottle-menu': (el) => {
    const id = el.dataset.id;
    const b = S.bottles.find((x) => x.id === id);
    menu(el, [
      { icon: 'chip', label: 'Components…', run: () => componentsModal(id) },
      { icon: 'sliders', label: 'Wine Configuration', run: () => call('bottle:tool', id, 'winecfg') },
      { icon: 'window', label: 'Registry Editor', run: () => call('bottle:tool', id, 'regedit') },
      { icon: 'chip', label: 'Task Manager', run: () => call('bottle:tool', id, 'taskmgr') },
      { icon: 'terminal', label: 'Command Prompt', run: () => call('bottle:tool', id, 'cmd') },
      { icon: 'folder', label: 'Windows Explorer', run: () => call('bottle:tool', id, 'explorer') },
      '-',
      ...WINVERS.filter(([v]) => v !== b.winver).slice(0, 3).map(([v, n]) => ({ icon: 'refresh', label: `Switch to ${n}`, run: async () => { await call('bottle:winver', id, v); toast(`Now ${n}`); } })),
      { icon: 'window', label: `${b.retina ? 'Disable' : 'Enable'} Retina mode`, run: () => call('bottle:retina', id, !b.retina) },
      { icon: 'stop', label: 'Force-quit everything', run: () => call('bottle:kill', id) },
      { icon: 'download', label: 'Back Up Bottle…', run: async () => { const f = await call('bottle:backup', id); if (f) toast(`Backup saved: ${basename(f)}`); } },
      '-',
      { icon: 'trash', label: 'Delete Bottle…', danger: true, run: () => call('bottle:delete', id) },
    ]);
  },
  'bottle-run': (el) => pickAndRun(el.dataset.id),
  'bottle-components': (el) => componentsModal(el.dataset.id),
  'bottle-drive': (el) => call('bottle:drive', el.dataset.id),
  'bottle-scan': (el) => scanModal(el.dataset.id),
  'bottle-tool': (el) => call('bottle:tool', el.dataset.id, el.dataset.tool),
  'quick-tool': async (el) => {
    await call('bottle:tool', defaultBottleId(), el.dataset.tool);
    toast(`Opening ${QUICK_TOOLS.find((t) => t[0] === el.dataset.tool)[1]}…`);
  },
  'bottle-kill': (el) => call('bottle:kill', el.dataset.id),
  'setup-all': async () => {
    await call('setup:all');
    toast('Umbra is ready — drop in any .exe, or install Steam');
  },
  'upgrade-engine': async () => {
    await call('engine:install');
    // Moving between Wine 11 builds keeps the same bottles; only a new kind needs setup.
    setTimeout(() => {
      if (S.settings.setupDone) toast('Engine installed. Open Steam once so it can set up games for the new engine.');
      else { toast('Engine installed. Now let’s set things up with it.'); openWizard(); }
    }, 600);
  },
  'install-engine': async () => {
    go('settings');
    const e = await call('engine:install');
    toast(`Engine installed: ${e?.version || 'Wine'}`);
  },
  'choose-engine': async () => {
    const e = await call('engine:choose');
    if (e) toast(`Using ${e.version || e.path}`);
  },
  'reset-engine': async () => { await call('settings:set', { enginePath: null }); await call('engine:redetect'); },
  'use-engine': async (el) => {
    const e = await call('engine:use', el.dataset.path);
    toast(`Now using ${e.source}${e.d3dmetal ? ' (DirectX 12 ready)' : ''}`);
    loadEngines();
  },
  redetect: async () => {
    loadEngines();
    const e = await call('engine:redetect'); toast(e ? `Found ${e.version || e.path}` : 'No Wine engine found', e ? 'ok' : 'error'); },
  rosetta: async () => { await call('engine:rosetta'); toast('Rosetta 2 installed'); },
  'install-steam': async () => {
    await call('steam:install');
    toast('Steam installed — launch it from here or your Library');
  },
  'steam-import': async () => {
    const names = await call('steam:import');
    toast(names.length ? `Imported ${names.length} game${names.length === 1 ? '' : 's'}: ${names.join(', ')}` : 'No new Steam games found');
    if (names.length) go('library');
  },
  'open-update': () => call('open:external', S.update.url),
  'open-url': (el) => call('open:external', el.dataset.url),
  toggle: (el) => call('settings:set', { [el.dataset.key]: !S.settings[el.dataset.key] }),
  'clear-logs': async () => { await call('logs:clear'); logs = []; paintLogs(); },
};

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) return go(nav.dataset.nav);
  const act = e.target.closest('[data-act]');
  if (act && actions[act.dataset.act]) {
    e.stopPropagation();
    Promise.resolve(actions[act.dataset.act](act)).catch(() => {});
  }
});

window.addEventListener('error', (e) => {
  const el = e.target;
  if (el.tagName !== 'IMG' || el.dataset.fallbacks === undefined) return;
  const [next, ...rest] = el.dataset.fallbacks.split('|').filter(Boolean);
  if (!next) { el.remove(); return; }
  el.dataset.fallbacks = rest.join('|');
  el.src = next;
}, true);

document.addEventListener('input', (e) => {
  if (e.target.id !== 'search') return;
  query = e.target.value;
  if (view === 'library') { $('#view').innerHTML = viewLibrary(); }
});

// ---------- drag & drop ----------
let dragDepth = 0;
const RUNNABLE = /\.(exe|msi|bat|cmd|lnk)$/i;
window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; $('#drop').classList.add('show'); });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop').classList.remove('show'); } });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop').classList.remove('show');
  const file = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).find((p) => RUNNABLE.test(p));
  if (file) runFileFlow(file);
  else toast('Drop a Windows program (.exe, .msi or .bat)', 'error');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelector('.menu')?.remove();
    const last = $('#modal-root').lastElementChild;
    if (last && !last.classList.contains('wizard')) last.remove();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); pickAndRun(); }
  if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) go(Object.keys(VIEWS)[+e.key - 1]);
  if (e.key === 'Escape' && wizard && wizard.step !== 'progress') closeWizard();
});

// ---------- live updates ----------
api.on('state', (s) => {
  for (const id of Object.keys(taskPct)) if (!s.tasks.some((t) => t.id === id)) delete taskPct[id];
  S = s;
  render();
});
api.on('task', (t) => {
  taskPct[t.id] = { pct: t.pct, detail: t.detail };
  if (t.id === 'setup' && wizard?.step === 'progress') paintWizard(t);
  renderDock();
  if (view === 'settings' || view === 'store' || (view === 'library' && t.id === 'setup')) renderSoon();
});

// Progress arrives per download chunk; redrawing the view that often eats clicks.
let renderTimer = null;
function renderSoon() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = null; render(); }, 400);
}
api.on('log', (l) => {
  logs.push(l);
  if (logs.length > 3000) logs = logs.slice(-2000);
  const el = $('#log');
  if (el) {
    if (logs.length === 1) el.innerHTML = '';
    const stick = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.insertAdjacentHTML('beforeend', logLine(l));
    if (stick) el.scrollTop = el.scrollHeight;
  }
});
api.on('installed', ({ bottleId, installer, added, candidates }) => {
  if (added.length) {
    toast(`Installed — added ${added.join(', ')} to your Library`);
    if (view !== 'console') go('library');
  } else if (candidates.length) {
    pickAppsModal(bottleId, candidates, `${installer} finished`, 'Pick the programs you want in your Library.');
  } else {
    toast(`${installer} finished — no new programs found`);
  }
});
api.on('menu', (name) => {
  if (name.startsWith('nav:')) return go(name.slice(4));
  actions[name]?.();
});
api.on('crashed', ({ name, code }) => {
  toast(`${name} closed right away (code ${code}). It may need Visual C++ or .NET: open Bottles → Components. The Console has details.`, 'error');
});
api.on('steam-failed', ({ lastLine }) => {
  toast(`Steam couldn’t start after 3 tries${lastLine ? ` (“${lastLine}”)` : ''}. Open Steam’s settings and choose Repair Steam, or check the Console.`, 'error');
});
api.on('open-files', (files) => { const f = files.find((p) => RUNNABLE.test(p)); if (f) runFileFlow(f); });

(async () => {
  S = await api.call('state');
  logs = await api.call('logs');
  render();
  if (!S.settings.setupDone && !isLocked()) openWizard();
})();
