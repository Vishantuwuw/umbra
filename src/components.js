// One-click installs of the Windows runtimes most programs depend on. Each
// downloads Microsoft's official redistributable and runs it silently.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const engine = require('./engine');
const store = require('./store');

const WINETRICKS_URL = 'https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks';

const LIST = [
  {
    id: 'vcrun',
    name: 'Visual C++ 2015–2022',
    desc: 'Needed by most modern games and apps. Installs both 64- and 32-bit.',
    steps: [
      { url: 'https://aka.ms/vs/17/release/vc_redist.x64.exe', file: 'vc_redist.x64.exe', args: ['/install', '/quiet', '/norestart'] },
      { url: 'https://aka.ms/vs/17/release/vc_redist.x86.exe', file: 'vc_redist.x86.exe', args: ['/install', '/quiet', '/norestart'] },
    ],
  },
  {
    id: 'dotnet8',
    name: '.NET Desktop Runtime 8',
    desc: 'For apps and launchers built on modern .NET (WPF / WinForms).',
    steps: [
      { url: 'https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe', file: 'windowsdesktop-runtime-8-x64.exe', args: ['/install', '/quiet', '/norestart'] },
    ],
  },
  {
    id: 'directx9',
    name: 'DirectX 9 extras (June 2010)',
    desc: 'D3DX9/XAudio/XInput libraries that many older games ship without.',
    steps: [
      { url: 'https://download.microsoft.com/download/8/4/A/84A35BF1-DAFE-4AE8-82AF-AD2AE20B6B14/directx_Jun2010_redist.exe', file: 'directx_Jun2010_redist.exe', args: ['/Q', '/T:C:\\umbra-directx'] },
      { inPrefix: 'drive_c/umbra-directx/DXSETUP.exe', args: ['/silent'], cleanup: 'drive_c/umbra-directx' },
    ],
  },
  {
    id: 'wineaddons',
    name: 'Wine Mono & Gecko',
    desc: 'Wine’s built-in .NET Framework and web-view support. Wine will ask to download them.',
    wineboot: true,
  },
];

function cacheFile(name) {
  return path.join(engine.cacheDir(), name);
}

function run(bin, args, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env, cwd });
    child.on('error', reject);
    child.on('exit', resolve);
    child.stdout.on('data', () => {});
    child.stderr.on('data', () => {});
  });
}

// rt: { wine, env(bottle, extra), prefix(bottle), waitServer(bottle), log }
async function install(rt, b, id, onProgress) {
  const comp = LIST.find((c) => c.id === id);
  if (!comp) throw new Error(`Unknown component ${id}`);
  const prefix = rt.prefix(b);
  if (comp.wineboot) {
    onProgress(0.3, 'Wine will ask to install Mono/Gecko — click Install');
    await run(rt.wine, ['wineboot', '-u'], rt.env(b, { WINEDLLOVERRIDES: 'winemenubuilder.exe=d' }), prefix);
    await rt.waitServer(b);
  } else {
    const n = comp.steps.length;
    for (const [i, step] of comp.steps.entries()) {
      const base = i / n;
      let exe;
      if (step.url) {
        exe = cacheFile(step.file);
        if (!fs.existsSync(exe)) {
          await engine.download(step.url, exe, (f) => onProgress(base + (f ?? 0) * 0.5 / n, `Downloading ${step.file}…`));
        }
      } else {
        exe = path.join(prefix, step.inPrefix);
      }
      onProgress(base + 0.55 / n, `Installing ${path.basename(exe)}…`);
      rt.log(`Installing ${comp.name}: ${path.basename(exe)} ${step.args.join(' ')}`);
      const code = await run(rt.wine, [exe, ...step.args], rt.env(b), path.dirname(exe));
      await rt.waitServer(b);
      if (step.cleanup) fs.rmSync(path.join(prefix, step.cleanup), { recursive: true, force: true });
      // Visual C++ returns 1638 when a newer version is already installed.
      if (code && code !== 1638 && code !== 3010) {
        // The cached download may be damaged; fetch it fresh next time.
        if (step.url) fs.rmSync(exe, { force: true });
        throw new Error(`${path.basename(exe)} failed (exit code ${code})`);
      }
    }
  }
  b.components = { ...(b.components || {}), [id]: Date.now() };
  store.save();
  onProgress(1, `${comp.name} installed`);
}

// Runs a winetricks verb for anything not in the list above.
async function winetricks(rt, b, verb, onProgress) {
  if (!/^[a-z0-9_=.-]+( [a-z0-9_=.-]+)*$/i.test(verb)) throw new Error('Enter winetricks verbs like: corefonts d3dcompiler_47');
  const script = cacheFile('winetricks');
  if (!fs.existsSync(script)) {
    await engine.download(WINETRICKS_URL, script, () => onProgress(0.05, 'Downloading winetricks…'));
    fs.chmodSync(script, 0o755);
  }
  onProgress(0.2, `winetricks ${verb}…`);
  const server = engine.wineserverFor(rt.wine);
  const env = rt.env(b, { WINE: rt.wine, ...(server ? { WINESERVER: server } : {}), WINETRICKS_LATEST_VERSION_CHECK: 'disabled' });
  const code = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', [script, '-q', ...verb.split(' ')], { env, cwd: rt.prefix(b) });
    const pipe = (d) => d.toString().split('\n').filter((l) => l.trim()).forEach((l) => rt.log(`[winetricks] ${l}`));
    child.stdout.on('data', pipe);
    child.stderr.on('data', pipe);
    child.on('error', reject);
    child.on('exit', resolve);
  });
  if (code) throw new Error(`winetricks ${verb} failed (exit code ${code}). See the Console.`);
  onProgress(1, `winetricks ${verb} done`);
}

module.exports = { LIST: LIST.map(({ id, name, desc }) => ({ id, name, desc })), install, winetricks };
