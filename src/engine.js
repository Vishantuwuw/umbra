// Locates, installs and describes the Wine engine that Umbra runs Windows
// programs with. On macOS the engine is downloaded from Gcenx's prebuilt
// macOS Wine builds (the same upstream CrossOver-style builds Homebrew uses).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');

const RELEASES_API = 'https://api.github.com/repos/Gcenx/macOS_Wine_builds/releases?per_page=40';
// CrossOver's Wine (CodeWeavers' open-source tree, the engine inside CrossOver), as packaged
// by the Sikarugir/Wineskin project, plus the Mac libraries it loads at runtime.
const CX_ENGINE = { version: '24.0.7', url: 'https://github.com/Sikarugir-App/Engines/releases/download/v1.0/WS12WineCX24.0.7_7.tar.xz' };
// Sikarugir's Wine 11: the same Wine as Umbra's plain engine, plus the Metal hooks
// (CrossOver-style macdrv_functions) that DXMT needs to draw Direct3D 11 games.
const SK_ENGINE = { version: '11.0_1', url: 'https://github.com/Sikarugir-App/Engines/releases/download/v1.0/WS12WineSikarugir11.0_1.tar.xz' };
const CX_LIBS = { url: 'https://github.com/Sikarugir-App/Wrapper/releases/download/v1.0/Template-1.0.tar.xz', dir: 'Template-1.0.app/Contents/Frameworks' };
const BREW_CASK_API = 'https://formulae.brew.sh/api/cask';
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

function engineDir() {
  return path.join(app.getPath('userData'), 'engine');
}

function cxDir() {
  return path.join(app.getPath('userData'), 'engine-cx');
}

function skDir() {
  return path.join(app.getPath('userData'), 'engine-sk');
}

function cacheDir() {
  const dir = path.join(app.getPath('userData'), 'cache');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function envPath() {
  const parts = (process.env.PATH || '').split(':').filter(Boolean);
  for (const p of EXTRA_PATH) if (!parts.includes(p)) parts.push(p);
  return parts.join(':');
}

function exec(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024, ...opts, env: { ...process.env, PATH: envPath(), ...(opts.env || {}) } },
      (err, stdout, stderr) => (err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr })));
  });
}

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// Prefer wine64 where a build still ships it (pre-WoW64 builds); newer builds
// only ship a single `wine` loader that handles both 32- and 64-bit programs.
function pickInBin(bin) {
  for (const name of ['wine64', 'wine']) {
    const p = path.join(bin, name);
    if (isExecutable(p)) return p;
  }
  return null;
}

function findWineIn(root, depth = 7) {
  if (!fs.existsSync(root)) return null;
  const queue = [[root, 0]];
  while (queue.length) {
    const [dir, d] = queue.shift();
    if (path.basename(dir) === 'bin') {
      const hit = pickInBin(dir);
      if (hit) return hit;
    }
    if (d >= depth) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) if (e.isDirectory()) queue.push([path.join(dir, e.name), d + 1]);
  }
  return null;
}

function candidates() {
  const home = os.homedir();
  const list = [
    { source: 'Sikarugir Wine 11', find: () => pickInBin(path.join(skDir(), 'wine', 'bin')) },
    { source: 'Umbra engine', find: () => findWineIn(engineDir()) },
    { source: 'CrossOver engine', find: () => pickInBin(path.join(cxDir(), 'wine', 'bin')) },
  ];
  // Engines with Apple's D3DMetal (DirectX 11/12 → Metal), from Whisky or the Game Porting Toolkit.
  list.push({ source: 'Whisky (D3DMetal)', find: () => pickInBin(path.join(home, 'Library/Application Support/com.isaacmarovitz.Whisky/Libraries/Wine/bin')) });
  for (const base of ['/opt/homebrew/opt', '/usr/local/opt']) {
    list.push({ source: 'Game Porting Toolkit', find: () => pickInBin(path.join(base, 'game-porting-toolkit/bin')) });
  }
  for (const flavor of ['Stable', 'Staging', 'Devel', 'Crossover']) {
    for (const base of ['/Applications', path.join(home, 'Applications')]) {
      list.push({ source: `Wine ${flavor}.app`, find: () => pickInBin(path.join(base, `Wine ${flavor}.app/Contents/Resources/wine/bin`)) });
    }
  }
  for (const bin of envPath().split(':')) list.push({ source: 'System', find: () => pickInBin(bin) });
  return list;
}

// D3DMetal ships next to Wine as a framework in Whisky/GPTK builds.
function hasD3DMetal(bin) {
  const root = path.dirname(path.dirname(bin));
  return ['lib/external/D3DMetal.framework', 'lib/external/libd3dshared.dylib', 'lib/D3DMetal.framework']
    .some((p) => fs.existsSync(path.join(root, p)));
}

// CrossOver's engine loads freetype, gnutls, MoltenVK and friends from a separate
// Frameworks folder; runtime.wineEnv points the loader there.
// kind 'cx' (WineCX 24) builds bottles that other engines can't share; Sikarugir's Wine 11
// counts as plain Wine 11, so bottles carry over between it and Umbra's plain engine.
function cxInfo(bin) {
  for (const [root, kind] of [[cxDir(), 'cx'], [skDir(), 'wine']]) {
    if (path.resolve(bin).startsWith(path.join(root, 'wine') + path.sep)) {
      return { root: path.join(root, 'wine'), frameworks: path.join(root, 'Frameworks'), kind };
    }
  }
  return null;
}

async function describe(p, source) {
  return { path: p, source, version: await version(p), d3dmetal: hasD3DMetal(p), cx: cxInfo(p) };
}

// Every Wine engine on this Mac, for the engine picker.
async function detectAll() {
  const seen = new Set();
  const out = [];
  for (const c of candidates()) {
    const p = c.find();
    if (!p) continue;
    let real = p;
    try { real = fs.realpathSync(p); } catch {}
    if (seen.has(real)) continue;
    seen.add(real);
    out.push(await describe(p, c.source));
  }
  return out;
}

async function version(bin) {
  try {
    const { stdout } = await exec(bin, ['--version'], { timeout: 20000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

// With strict, a custom path that isn't a runnable Wine returns null instead of
// falling back to whatever engine is found automatically.
async function detect(customPath, { strict = false } = {}) {
  if (customPath && isExecutable(customPath)) {
    const known = candidates().find((c) => c.find() === customPath);
    return describe(customPath, known ? known.source : 'Custom');
  }
  if (customPath && strict) return null;
  for (const c of candidates()) {
    const p = c.find();
    if (p) return describe(p, c.source);
  }
  return null;
}

function wineserverFor(bin) {
  const sibling = path.join(path.dirname(bin), 'wineserver');
  if (isExecutable(sibling)) return sibling;
  for (const dir of envPath().split(':')) {
    const p = path.join(dir, 'wineserver');
    if (isExecutable(p)) return p;
  }
  return null;
}

async function cpu() {
  if (process.platform !== 'darwin') return { appleSilicon: false, rosetta: true };
  let appleSilicon = process.arch === 'arm64';
  try {
    const { stdout } = await exec('/usr/sbin/sysctl', ['-in', 'hw.optional.arm64']);
    appleSilicon = stdout.trim() === '1';
  } catch {}
  const rosetta = !appleSilicon || fs.existsSync('/Library/Apple/usr/share/rosetta/rosetta');
  return { appleSilicon, rosetta };
}

function installRosetta() {
  const script = 'do shell script "/usr/sbin/softwareupdate --install-rosetta --agree-to-license" with administrator privileges';
  return exec('/usr/bin/osascript', ['-e', script], { timeout: 15 * 60 * 1000 });
}

let partSeq = 0;

// Each download writes its own temp file, so two downloads of the same file can't mix.
async function download(url, dest, onProgress, { signal } = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Umbra' }, redirect: 'follow', signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  const total = Number(res.headers.get('content-length')) || 0;
  const whole = !res.headers.get('content-encoding');
  const part = `${dest}.${process.pid}-${++partSeq}.part`;
  const out = fs.createWriteStream(part);
  let failed = null;
  const failure = new Promise((_, reject) => out.on('error', (e) => { failed = e; reject(e); }));
  failure.catch(() => {});
  let received = 0;
  try {
    for await (const chunk of res.body) {
      if (failed) throw failed;
      received += chunk.length;
      if (!out.write(chunk)) await Promise.race([new Promise((r) => out.once('drain', r)), failure]);
      onProgress?.(total ? received / total : null, received, total);
    }
    await Promise.race([new Promise((r) => out.end(r)), failure]);
    if (failed) throw failed;
    if (whole && total && received < total) throw new Error(`Download was cut off (${received} of ${total} bytes)`);
    fs.renameSync(part, dest);
  } catch (e) {
    out.destroy();
    fs.rmSync(part, { force: true });
    throw e;
  }
  return dest;
}

// Which Wine build flavor to prefer; UMBRA_ENGINE_FLAVOR=devel|staging puts that one first.
// Sikarugir's Wine 11 is the default: Steam runs on Wine 11 (the CrossOver engine,
// WineCX 24 based on Wine 9, stops with error 0x3008), and its Metal hooks let DXMT run
// Direct3D 11 games. UMBRA_ENGINE_FLAVOR=cx installs the CrossOver engine instead, and
// stable|staging|devel a plain Gcenx Wine build.

function flavorOrder() {
  const order = ['stable', 'staging', 'devel'];
  const want = process.env.UMBRA_ENGINE_FLAVOR;
  return order.includes(want) ? [want, ...order.filter((f) => f !== want)] : order;
}

// Picks the newest Wine Stable build, falling back to Staging/Devel if a
// recent stable one is not published.
async function githubRelease() {
  const headers = { 'User-Agent': 'Umbra', Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(RELEASES_API, { headers });
  if (!res.ok) throw new Error(`GitHub release feed returned HTTP ${res.status}`);
  const releases = (await res.json()).filter((r) => !r.draft);
  for (const re of flavorOrder().map((f) => new RegExp(`^wine-${f}-.*\\.tar\\.xz$`)).concat([/\.tar\.xz$/])) {
    for (const rel of releases) {
      const asset = (rel.assets || []).find((a) => re.test(a.name));
      if (asset) return { tag: rel.tag_name, name: asset.name, url: asset.browser_download_url, size: asset.size };
    }
  }
  throw new Error('No macOS Wine build found in recent releases');
}

// Homebrew's cask index points at the same builds and is not rate-limited
// like the anonymous GitHub API.
async function brewRelease() {
  for (const cask of flavorOrder().map((f) => (f === 'stable' ? 'wine-stable' : `wine@${f}`))) {
    try {
      const res = await fetch(`${BREW_CASK_API}/${cask}.json`, { headers: { 'User-Agent': 'Umbra' } });
      if (!res.ok) continue;
      const c = await res.json();
      if (c.url && /\.tar\.xz$/.test(c.url)) return { tag: c.version, name: path.basename(new URL(c.url).pathname), url: c.url, size: 0 };
    } catch {}
  }
  throw new Error('Homebrew cask index had no Wine build');
}

async function latestRelease() {
  try {
    return await githubRelease();
  } catch (err) {
    try {
      return await brewRelease();
    } catch {
      throw new Error(`Could not find a Wine build to download (${err.message})`);
    }
  }
}

let engineInstall = null;

// Setup and the Engine page can both start an install; share one instead of racing.
function install(onProgress, { flavor = process.env.UMBRA_ENGINE_FLAVOR } = {}) {
  const run = flavor === 'cx' ? () => installBundle(CX_ENGINE, cxDir(), 'the CrossOver engine', onProgress)
    : ['stable', 'staging', 'devel'].includes(flavor) ? () => doInstall(onProgress)
      : () => installBundle(SK_ENGINE, skDir(), 'Wine 11 with Metal support', onProgress);
  engineInstall ||= run().finally(() => { engineInstall = null; });
  return engineInstall;
}

async function fetchArchive(url, label, onProgress) {
  const archive = path.join(cacheDir(), path.basename(new URL(url).pathname));
  if (!fs.existsSync(archive)) {
    await download(url, archive, (f, got, total) => {
      const mb = (n) => (n / 1048576).toFixed(0);
      onProgress(f, `Downloading ${label} — ${mb(got)} / ${mb(total)} MB`);
    });
  }
  return archive;
}

// Downloads a Sikarugir-packaged Wine (wswine.bundle) and the Mac libraries it loads at
// runtime (from Sikarugir's app template) into dir/wine and dir/Frameworks.
async function installBundle(eng, dir, label, onProgress) {
  if (process.platform !== 'darwin') throw new Error(`${label} is macOS-only`);
  const engineTar = await fetchArchive(eng.url, label, (f, l) => onProgress(0.01 + (f ?? 0) * 0.55, l));
  const libsTar = await fetchArchive(CX_LIBS.url, 'engine libraries', (f, l) => onProgress(0.56 + (f ?? 0) * 0.3, l));
  onProgress(0.87, `Unpacking ${label}…`);
  const staging = `${dir}.new`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, 'wine'), { recursive: true });
  fs.mkdirSync(path.join(staging, 'Frameworks'), { recursive: true });
  try {
    await exec('/usr/bin/tar', ['-xJf', engineTar, '-C', path.join(staging, 'wine'), '--strip-components', '1'], { timeout: 10 * 60 * 1000 });
    await exec('/usr/bin/tar', ['-xJf', libsTar, '-C', path.join(staging, 'Frameworks'), '--strip-components', '3', CX_LIBS.dir], { timeout: 10 * 60 * 1000 });
  } catch (e) {
    for (const f of [engineTar, libsTar, staging]) fs.rmSync(f, { recursive: true, force: true });
    throw new Error(`Could not unpack ${label}, so the download was deleted. Try again. (${e.message})`);
  }
  await exec('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', staging]).catch(() => {});
  if (!pickInBin(path.join(staging, 'wine', 'bin'))) throw new Error(`The ${label} download did not contain Wine`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(staging, dir);
  fs.rmSync(engineTar, { force: true });
  onProgress(1, `Installed ${label} (${eng.version})`);
  return detect(null);
}

// Downloads and unpacks the latest Wine build into Umbra's own engine folder.
async function doInstall(onProgress) {
  if (process.platform !== 'darwin') {
    throw new Error('Automatic engine install is macOS-only. Install Wine with your package manager instead.');
  }
  onProgress(0.01, 'Finding the latest Wine build…');
  const rel = await latestRelease();
  const archive = path.join(cacheDir(), rel.name);
  if (!fs.existsSync(archive)) {
    await download(rel.url, archive, (f, got, total) => {
      const mb = (n) => (n / 1048576).toFixed(0);
      onProgress(0.02 + (f ?? 0) * 0.83, `Downloading ${rel.name} — ${mb(got)} / ${mb(total || rel.size)} MB`);
    });
  }
  onProgress(0.86, 'Unpacking engine…');
  const dir = engineDir();
  const staging = `${dir}.new`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  try {
    await exec('/usr/bin/tar', ['-xJf', archive, '-C', staging], { timeout: 10 * 60 * 1000 });
  } catch (e) {
    fs.rmSync(archive, { force: true });
    fs.rmSync(staging, { recursive: true, force: true });
    throw new Error(`Could not unpack the engine download, so it was deleted. Try again. (${e.message})`);
  }
  onProgress(0.95, 'Finishing up…');
  await exec('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', staging]).catch(() => {});
  if (!findWineIn(staging)) {
    fs.rmSync(archive, { force: true });
    throw new Error('The downloaded engine did not contain a Wine binary');
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.renameSync(staging, dir);
  fs.rmSync(archive, { force: true });
  onProgress(1, `Installed Wine ${rel.tag}`);
  return detect(null);
}

module.exports = { detect, detectAll, install, cxDir, skDir, githubRelease, brewRelease, download, cpu, installRosetta, wineserverFor, envPath, exec, cacheDir };
