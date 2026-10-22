// Reads a bottle's Steam install so installed games can be imported with their
// real names, Steam app IDs (for cover art) and main executables.
const fs = require('fs');
const path = require('path');

const SKIP = /(unins|setup|install|redist|crash|report|helper|prereq|vc_redist|dxsetup|dotnet|easyanticheat|battleye|eac_|launcherhelper|cefprocess|webhelper|unitycrashhandler|ue4prereq|^cef)/i;
const NOT_GAMES = new Set(['228980']); // Steamworks Common Redistributables

function steamappsDirs(driveC) {
  return ['Program Files (x86)/Steam/steamapps', 'Program Files/Steam/steamapps']
    .map((p) => path.join(driveC, p)).filter((p) => fs.existsSync(p));
}

function readManifest(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const get = (k) => txt.match(new RegExp(`"${k}"\\s+"([^"]*)"`, 'i'))?.[1];
    const appid = get('appid');
    return appid ? { appid, name: get('name'), installdir: get('installdir') } : null;
  } catch {
    return null;
  }
}

function manifests(steamapps) {
  let files = [];
  try { files = fs.readdirSync(steamapps).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch {}
  return files.map((f) => readManifest(path.join(steamapps, f))).filter((m) => m && m.installdir && !NOT_GAMES.has(m.appid));
}

// Steam game info for an exe that lives under steamapps/common/<game>/.
function gameForExe(exe) {
  const m = exe.match(/^(.*[\\/]steamapps)[\\/]common[\\/]([^\\/]+)[\\/]/i);
  if (!m) return null;
  return manifests(m[1]).find((x) => x.installdir.toLowerCase() === m[2].toLowerCase()) || null;
}

function exesIn(dir, depth, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !/^(redist|_commonredist|directx|vcredist|support|tools|engine)$/i.test(e.name)) exesIn(p, depth - 1, out);
    else if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP.test(e.name)) out.push(p);
  }
  return out;
}

// Picks the exe most likely to start the game: one named like the game, else the largest.
function mainExe(gameDir, name) {
  const exes = exesIn(gameDir, 3);
  if (!exes.length) return null;
  const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const want = [norm(name), norm(path.basename(gameDir))];
  const named = exes.find((e) => want.includes(norm(path.basename(e, '.exe'))));
  if (named) return named;
  return exes.map((e) => ({ e, size: fs.statSync(e).size })).sort((a, b) => b.size - a.size)[0].e;
}

function installedGames(driveC) {
  const games = [];
  for (const sa of steamappsDirs(driveC)) {
    for (const m of manifests(sa)) {
      const exe = mainExe(path.join(sa, 'common', m.installdir), m.name);
      if (exe) games.push({ exe, name: m.name || m.installdir, steamAppId: m.appid });
    }
  }
  return games;
}

// Parses Valve's KeyValues text ("key" "value" pairs and nested { } blocks).
function parseKeyValues(txt) {
  const tokens = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*|\[[^\]\n]*\]|([^\s"{}]+)/g;
  for (let m; (m = re.exec(txt));) {
    if (m[1] !== undefined) tokens.push({ s: m[1].replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t' })[c] ?? c) });
    else if (m[2]) tokens.push(m[2]);
    else if (m[3] !== undefined) tokens.push({ s: m[3] });
  }
  let i = 0;
  const block = () => {
    const obj = {};
    while (i < tokens.length) {
      const key = tokens[i++];
      if (key === '}') return obj;
      if (key === '{') { block(); continue; }
      const val = tokens[i++];
      if (val === undefined || val === '}') { if (val === '}') return obj; break; }
      obj[key.s] = val === '{' ? block() : val.s;
    }
    return obj;
  };
  return block();
}

// The package files a Steam client manifest (steam_client_win32) lists, named as
// the bootstrapper looks for them in Steam/package (the .vz variant when listed).
function clientPackages(txt) {
  const out = [];
  const visit = (obj, depth) => {
    for (const [name, v] of Object.entries(obj)) {
      if (!v || typeof v !== 'object' || depth > 4) continue;
      if (typeof v.file === 'string') {
        const vz = typeof v.zipvz === 'string' ? v.zipvz : null;
        const file = vz || v.file;
        // Only a rough size for progress: the .vz copy is compressed.
        const size = Number(v.size) || Number(file.match(/_(\d+)$/)?.[1]) || 0;
        if (/^[\w.-]+$/.test(file) && !file.startsWith('.')) out.push({ name, file, size });
      } else visit(v, depth + 1);
    }
  };
  visit(parseKeyValues(txt), 0);
  return out.filter((p, i) => out.findIndex((q) => q.file === p.file) === i);
}

module.exports = { gameForExe, installedGames, parseKeyValues, clientPackages };
