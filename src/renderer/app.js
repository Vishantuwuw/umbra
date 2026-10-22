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
  library: { title: 'Library', icon: 'library', sub: () => `${S.apps.length} app${S.apps.length === 1 ? '' : 's'} · drop any .exe to run it` },
  bottles: { title: 'Bottles', icon: 'bottle', sub: () => 'Isolated Windows environments. Each one is its own C: drive.' },
  steam: { title: 'Steam', icon: 'steam', sub: () => 'Your Windows Steam library, on macOS.' },
  engine: { title: 'Engine', icon: 'engine', sub: () => 'The Wine compatibility layer that translates Windows calls for your Mac.' },
  console: { title: 'Console', icon: 'console', sub: () => 'Live output from everything running in Umbra.' },
};

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
const bottleName = (id) => S.bottles.find((b) => b.id === id)?.name || 'Missing bottle';
const isRunning = (appId) => S.running.some((r) => r.appId === appId);

async function call(ch, ...args) {
  try {
    return await api.call(ch, ...args);
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 3200);
}

// ---------- shell ----------
function renderNav() {
  const counts = { library: S.apps.length, bottles: S.bottles.length, console: S.running.length || '' };
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, v], i) => `
    ${i === 3 ? '<div class="nav-sep"></div>' : ''}
    <button class="nav-item ${view === k ? 'active' : ''}" data-nav="${k}">${icon(v.icon)}${v.title}<span class="count">${counts[k] ?? ''}</span></button>`).join('');

  const e = S.engine;
  const rosettaMissing = S.cpu.appleSilicon && !S.cpu.rosetta;
  $('#side-foot').innerHTML = `
    ${S.running.length ? `<div class="pill" data-nav="console" style="cursor:pointer"><div class="dot live"></div><div><b>${S.running.length} running</b><span>${esc(S.running.map((r) => r.name).join(', '))}</span></div></div>` : ''}
    <div class="pill" data-nav="engine" style="cursor:pointer">
      <div class="dot ${e && !rosettaMissing ? 'ok' : 'warn'}"></div>
      <div><b>${e ? 'Engine ready' : 'No engine'}</b><span>${e ? esc(e.version || e.source) : 'Click to install'}${rosettaMissing ? ' · Rosetta needed' : ''}</span></div>
    </div>`;
}

function renderTop() {
  const v = VIEWS[view];
  $('#title').textContent = v.title;
  $('#subtitle').textContent = v.sub();
  const actions = {
    library: `<button class="btn" data-act="add-app">${icon('plus')}Add App</button><button class="btn primary" data-act="run-exe">${icon('play')}Run .exe…</button>`,
    bottles: `<button class="btn primary" data-act="new-bottle">${icon('plus')}New Bottle</button>`,
    steam: '',
    engine: `<button class="btn" data-act="redetect">${icon('refresh')}Re-detect</button>`,
    console: `<button class="btn" data-act="clear-logs">${icon('trash')}Clear</button>`,
  };
  $('#top-actions').innerHTML = actions[view];
}

function render() {
  if (!S) return;
  renderNav();
  renderTop();
  const fn = { library: viewLibrary, bottles: viewBottles, steam: viewSteam, engine: viewEngine, console: viewConsole }[view];
  const scroll = $('#view').scrollTop;
  $('#view').innerHTML = fn();
  $('#view').scrollTop = scroll;
  if (view === 'console') paintLogs();
  renderDock();
}

function go(v) {
  view = v;
  $('#view').style.animation = 'none';
  void $('#view').offsetWidth;
  $('#view').style.animation = '';
  $('#view').scrollTop = 0;
  render();
}

function engineBanner() {
  if (S.engine && !(S.cpu.appleSilicon && !S.cpu.rosetta)) return '';
  if (!S.engine) return `<div class="banner"><div class="badge-icon">${icon('engine')}</div><div class="grow"><b>Install the Wine engine to start running Windows apps</b><span>One click. About 200 MB, downloaded once.</span></div><button class="btn glow" data-act="install-engine">${icon('download')}Install Engine</button></div>`;
  return `<div class="banner"><div class="badge-icon">${icon('chip')}</div><div class="grow"><b>Rosetta 2 is required on Apple Silicon</b><span>Windows programs are x86 code. Rosetta translates them for your M-series chip.</span></div><button class="btn glow" data-act="rosetta">Install Rosetta</button></div>`;
}

// ---------- Library ----------
function tile(a) {
  const live = isRunning(a.id);
  return `<div class="tile" data-app="${a.id}">
    <div class="art" data-act="play" data-id="${a.id}">
      <div class="art-bg" style="background:${artFor(a.name)}"></div>
      <div class="letter">${esc(initial(a.name))}</div>
      ${live ? '<div class="live-badge"><div class="dot live"></div>Running</div>' : ''}
      <div class="play"><div class="play-circle">${icon('play')}</div></div>
    </div>
    <div class="body"><div class="t"><b>${esc(a.name)}</b><span>${esc(bottleName(a.bottleId))} · ${fmtTime(a.playtime)}</span></div>
    <button class="icon-btn" data-act="app-menu" data-id="${a.id}">${icon('more')}</button></div>
  </div>`;
}

function viewLibrary() {
  const apps = [...S.apps].sort((x, y) => (y.lastPlayed || y.added) - (x.lastPlayed || x.added));
  if (!apps.length) {
    return `${engineBanner()}
      <div class="empty" data-act="run-exe" style="margin-top:12px">
        <div class="big-icon">${icon('file')}</div>
        <h3>Drop a Windows program here</h3>
        <p>Drag any .exe, .msi or .bat onto this window — or click to choose one. Umbra runs it inside a bottle using Wine.</p>
      </div>
      <div class="quick">
        <div class="card" data-nav="steam"><div class="qi" style="color:var(--cyan)">${icon('steam')}</div><b>Install Steam</b><span>Get the Windows Steam client and your PC library.</span></div>
        <div class="card" data-act="new-bottle"><div class="qi" style="color:var(--violet-2)">${icon('bottle')}</div><b>Create a bottle</b><span>A fresh, isolated Windows 10 environment.</span></div>
        <div class="card" data-nav="engine"><div class="qi" style="color:var(--green)">${icon('engine')}</div><b>Engine & performance</b><span>MSync, Metal HUD, Retina and more.</span></div>
      </div>`;
  }
  const hero = apps[0];
  return `${engineBanner()}
    <div class="hero">
      <div class="art" style="background:${artFor(hero.name)}"><div class="letter">${esc(initial(hero.name))}</div></div>
      <div class="info">
        <div class="kicker">${isRunning(hero.id) ? 'Now playing' : hero.lastPlayed ? `Last played ${ago(hero.lastPlayed)}` : 'Recently added'}</div>
        <h3>${esc(hero.name)}</h3>
        <div class="meta">${esc(bottleName(hero.bottleId))} · ${fmtTime(hero.playtime)}</div>
        <div class="row">
          ${isRunning(hero.id)
            ? `<button class="btn lg" data-act="stop-app" data-id="${hero.id}">${icon('stop')}Stop</button>`
            : `<button class="btn lg primary" data-act="play" data-id="${hero.id}">${icon('play')}Play</button>`}
          <button class="btn lg" data-act="app-menu" data-id="${hero.id}">${icon('more')}</button>
        </div>
      </div>
    </div>
    <div class="section-h"><h2>All Apps</h2></div>
    <div class="grid">${apps.map(tile).join('')}</div>`;
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
        <button class="btn sm" data-act="bottle-tool" data-tool="winecfg" data-id="${b.id}">${icon('sliders')}Config</button>
        ${live ? `<button class="btn sm danger" data-act="bottle-kill" data-id="${b.id}">${icon('stop')}Stop All</button>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ---------- Steam ----------
function viewSteam() {
  const st = S.steam;
  const t = S.tasks.find((x) => x.id === 'steam');
  const pct = Math.round((taskPct.steam?.pct ?? t?.pct ?? 0) * 100);
  let action;
  if (t) action = `<button class="btn lg" disabled>Installing… ${pct}%</button>`;
  else if (st.installed && st.appId) {
    action = isRunning(st.appId)
      ? `<button class="btn lg" data-act="stop-app" data-id="${st.appId}">${icon('stop')}Stop Steam</button>`
      : `<button class="btn lg primary" data-act="play" data-id="${st.appId}">${icon('play')}Launch Steam</button>`;
    action += ` <button class="btn lg" data-act="bottle-scan" data-id="${st.bottleId}">${icon('search')}Add Installed Games</button>`;
  } else action = `<button class="btn lg glow" data-act="install-steam" ${S.engine ? '' : 'disabled'}>${icon('download')}Install Steam for Windows</button>`;
  return `${engineBanner()}
    <div class="steam-hero">
      <div class="orb"></div>
      <h2>${st.installed ? 'Steam is ready.' : 'Play your Windows Steam games on macOS.'}</h2>
      <p>${st.installed ? 'Launch Steam, sign in and install games the usual way. Use “Add Installed Games” to pin them to your Library for one-click play.'
        : 'Umbra creates a dedicated Windows 10 bottle, downloads the official Steam installer from Valve and sets it up — no Windows license needed.'}</p>
      <div class="row" style="display:flex;gap:10px">${action}</div>
    </div>
    <div class="section-h"><h2>What to expect</h2></div>
    <div class="notes">
      <div class="card"><b style="color:var(--green)">${icon('check')}Works well</b><span>Most DirectX 9–11 games, indie titles, older classics and many launchers.</span></div>
      <div class="card"><b style="color:var(--amber)">${icon('bolt')}Depends</b><span>DirectX 12 titles need a DX12→Metal build of Wine (e.g. Game Porting Toolkit). Point Umbra at it in Engine.</span></div>
      <div class="card"><b style="color:var(--red)">${icon('shield')}Won’t work</b><span>Games with kernel anti-cheat (Valorant, many competitive shooters) block Wine entirely.</span></div>
    </div>`;
}

// ---------- Engine ----------
function viewEngine() {
  const e = S.engine;
  const t = S.tasks.find((x) => x.id === 'engine');
  const s = S.settings;
  const toggle = (key, title, desc) => `<div class="toggle-row"><div class="t"><b>${title}</b><span>${desc}</span></div><button class="switch ${s[key] ? 'on' : ''}" data-act="toggle" data-key="${key}"></button></div>`;
  const pct = Math.round((taskPct.engine?.pct ?? t?.pct ?? 0) * 100);
  return `<div class="engine-grid">
    <div class="card engine-card">
      <h3>Wine Engine</h3>
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
          : `<button class="btn ${e ? '' : 'glow'}" data-act="install-engine" ${S.platform === 'darwin' ? '' : 'disabled'}>${icon('download')}${e ? 'Reinstall Latest Wine' : 'Install Engine'}</button>`}
        <button class="btn" data-act="choose-engine">${icon('file')}Use Custom Wine…</button>
        ${s.enginePath ? '<button class="btn ghost" data-act="reset-engine">Reset to automatic</button>' : ''}
        ${S.cpu.appleSilicon && !S.cpu.rosetta ? '<button class="btn glow" data-act="rosetta">Install Rosetta</button>' : ''}
      </div>
    </div>
    <div class="card engine-card">
      <h3>Performance</h3>
      ${toggle('msync', 'MSync', 'Mach-based synchronization. Faster in most games.')}
      ${toggle('esync', 'ESync', 'Event-fd synchronization fallback.')}
      ${toggle('metalHud', 'Metal Performance HUD', 'FPS & GPU overlay for Metal-rendered games.')}
      ${toggle('verboseLogs', 'Verbose logging', 'Show Wine warnings in the Console for debugging.')}
    </div>
  </div>`;
}

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
  $('#dock').innerHTML = S.tasks.map((t) => {
    const pct = Math.round((taskPct[t.id]?.pct ?? t.pct ?? 0) * 100);
    const detail = taskPct[t.id]?.detail ?? t.detail;
    return `<div class="task"><div class="r"><span>${esc(t.label)}</span><em>${pct}%</em></div><div class="d">${esc(detail)}</div><div class="track"><i style="width:${Math.max(2, pct)}%"></i></div></div>`;
  }).join('');
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

const bottleOptions = (sel) => S.bottles.map((b) => `<option value="${b.id}" ${b.id === sel ? 'selected' : ''}>${esc(b.name)} — ${winverName(b.winver)}</option>`).join('');

async function ensureBottle() {
  if (S.bottles.length) return true;
  if (!S.engine) { toast('Install the Wine engine first', 'error'); go('engine'); return false; }
  toast('Creating your first bottle…');
  await call('bottle:create', { name: 'Default', winver: 'win10' });
  return true;
}

async function runFileFlow(file, presetBottle) {
  if (!S.engine) { toast('Install the Wine engine first', 'error'); go('engine'); return; }
  if (!(await ensureBottle().catch(() => false))) return;
  const def = presetBottle || S.settings.lastBottleId || S.bottles[0].id;
  const guess = basename(file).replace(/\.(exe|msi|bat|cmd|lnk)$/i, '');
  modal(`<h3>Run Windows program</h3><p>Choose where this program should run.</p>
    <div class="file-box"><div class="fi">${icon('file')}</div><div><b>${esc(basename(file))}</b><span>${esc(file)}</span></div></div>
    <div class="field"><label>Bottle</label><select class="input" id="m-bottle">${bottleOptions(def)}</select></div>
    <div class="field"><label>Arguments (optional)</label><input class="input" id="m-args" placeholder="-windowed"></div>
    <label class="check"><input type="checkbox" id="m-add" ${/setup|install/i.test(guess) || /\.msi$/i.test(file) ? '' : 'checked'}><div><b>Add to Library</b><span>Keep it for one-click launching later</span></div></label>
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="m-go">${icon('play')}Run</button></div>`,
  (el, close) => {
    $('#m-go', el).onclick = async () => {
      const bottleId = $('#m-bottle', el).value;
      const args = $('#m-args', el).value;
      close();
      if ($('#m-add', el).checked) {
        const a = await call('app:add', { bottleId, exe: file, name: guess, args });
        await call('app:run', a.id);
      } else await call('run:file', { bottleId, file, args });
      toast(`Launching ${basename(file)}`);
    };
  });
}

async function pickAndRun(bottleId) {
  const f = await call('dialog:exe');
  if (f) runFileFlow(f, bottleId);
}

function newBottleModal() {
  if (!S.engine) { toast('Install the Wine engine first', 'error'); go('engine'); return; }
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
  editAppModal({ exe: f, name: basename(f).replace(/\.[^.]+$/, ''), args: '', bottleId: S.settings.lastBottleId || S.bottles[0].id }, true);
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
  modal(`<h3>Found ${found.length} program${found.length === 1 ? '' : 's'}</h3><p>Select what to add to your Library.</p>
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

function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = items.map((it, i) => (it === '-' ? '<div class="nav-sep" style="margin:4px 6px"></div>' : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${it.label}</button>`)).join('');
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
      { icon: 'edit', label: 'Edit…', run: () => editAppModal(a) },
      { icon: 'folder', label: 'Show in Finder', run: () => call('app:reveal', a.id) },
      '-',
      { icon: 'trash', label: 'Remove from Library', danger: true, run: () => call('app:remove', a.id) },
    ]);
  },
  'bottle-menu': (el) => {
    const id = el.dataset.id;
    const b = S.bottles.find((x) => x.id === id);
    menu(el, [
      { icon: 'sliders', label: 'Wine Configuration', run: () => call('bottle:tool', id, 'winecfg') },
      { icon: 'window', label: 'Registry Editor', run: () => call('bottle:tool', id, 'regedit') },
      { icon: 'chip', label: 'Task Manager', run: () => call('bottle:tool', id, 'taskmgr') },
      { icon: 'terminal', label: 'Command Prompt', run: () => call('bottle:tool', id, 'cmd') },
      { icon: 'folder', label: 'Windows Explorer', run: () => call('bottle:tool', id, 'explorer') },
      '-',
      ...WINVERS.filter(([v]) => v !== b.winver).slice(0, 3).map(([v, n]) => ({ icon: 'refresh', label: `Switch to ${n}`, run: async () => { await call('bottle:winver', id, v); toast(`Now ${n}`); } })),
      { icon: 'window', label: `${b.retina ? 'Disable' : 'Enable'} Retina mode`, run: () => call('bottle:retina', id, !b.retina) },
      { icon: 'stop', label: 'Force-quit everything', run: () => call('bottle:kill', id) },
      '-',
      { icon: 'trash', label: 'Delete Bottle…', danger: true, run: () => call('bottle:delete', id) },
    ]);
  },
  'bottle-run': (el) => pickAndRun(el.dataset.id),
  'bottle-drive': (el) => call('bottle:drive', el.dataset.id),
  'bottle-scan': (el) => scanModal(el.dataset.id),
  'bottle-tool': (el) => call('bottle:tool', el.dataset.id, el.dataset.tool),
  'bottle-kill': (el) => call('bottle:kill', el.dataset.id),
  'install-engine': async () => {
    go('engine');
    const e = await call('engine:install');
    toast(`Engine installed: ${e?.version || 'Wine'}`);
  },
  'choose-engine': async () => {
    const e = await call('engine:choose');
    if (e) toast(`Using ${e.version || e.path}`);
  },
  'reset-engine': async () => { await call('settings:set', { enginePath: null }); await call('engine:redetect'); },
  redetect: async () => { const e = await call('engine:redetect'); toast(e ? `Found ${e.version || e.path}` : 'No Wine engine found', e ? 'ok' : 'error'); },
  rosetta: async () => { await call('engine:rosetta'); toast('Rosetta 2 installed'); },
  'install-steam': async () => {
    await call('steam:install');
    toast('Steam installed — launch it from here or your Library');
  },
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
  if (e.key === 'Escape') { document.querySelector('.menu')?.remove(); $('#modal-root').lastElementChild?.remove(); }
  if ((e.metaKey || e.ctrlKey) && e.key === 'o') { e.preventDefault(); pickAndRun(); }
  if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) go(Object.keys(VIEWS)[+e.key - 1]);
});

// ---------- live updates ----------
api.on('state', (s) => {
  for (const id of Object.keys(taskPct)) if (!s.tasks.some((t) => t.id === id)) delete taskPct[id];
  S = s;
  render();
});
api.on('task', (t) => {
  taskPct[t.id] = { pct: t.pct, detail: t.detail };
  renderDock();
  if (view === 'engine' || view === 'steam') render();
});
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
api.on('open-files', (files) => { const f = files.find((p) => RUNNABLE.test(p)); if (f) runFileFlow(f); });

(async () => {
  S = await api.call('state');
  logs = await api.call('logs');
  render();
})();
