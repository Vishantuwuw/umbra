const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  bottles: [],
  apps: [],
  settings: {
    enginePath: null,
    msync: true,
    esync: false,
    metalHud: false,
    verboseLogs: false,
    lastBottleId: null,
  },
};

// A fresh copy each time: the bottles/apps arrays get pushed to, and must never be shared.
const defaults = () => JSON.parse(JSON.stringify(DEFAULTS));

let data = null;
let saveTimer = null;

function file() {
  return path.join(app.getPath('userData'), 'umbra.json');
}

function read(f) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not a settings object');
  const d = defaults();
  return { ...d, ...raw, settings: { ...d.settings, ...(raw.settings || {}) } };
}

// Falls back to the last good copy; a file that can't be read is moved aside
// rather than overwritten with empty defaults on the next save.
function load() {
  const f = file();
  try {
    data = read(f);
    return data;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`Could not read ${f}: ${e.message}`);
  }
  try {
    data = read(`${f}.bak`);
    console.error(`Loaded the backup copy ${f}.bak`);
  } catch {
    data = defaults();
  }
  if (fs.existsSync(f)) {
    try { fs.renameSync(f, `${f}.corrupt-${Date.now()}`); } catch (e) { console.error(`Could not move aside ${f}: ${e.message}`); }
  }
  return data;
}

function get() {
  return data || load();
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

// Writes to a temp file and renames it over the old one, so a crash mid-write
// never leaves a half-written umbra.json; the previous version is kept as .bak.
function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  const f = file();
  const tmp = `${f}.tmp`;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    if (fs.existsSync(f)) fs.copyFileSync(f, `${f}.bak`);
    fs.renameSync(tmp, f);
  } catch (e) {
    console.error(`Could not save ${f}: ${e.message}`);
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

module.exports = { load, get, save, flush };
