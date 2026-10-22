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

let data = null;
let saveTimer = null;

function file() {
  return path.join(app.getPath('userData'), 'umbra.json');
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    data = { ...DEFAULTS, ...raw, settings: { ...DEFAULTS.settings, ...(raw.settings || {}) } };
  } catch {
    data = JSON.parse(JSON.stringify(DEFAULTS));
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

function flush() {
  clearTimeout(saveTimer);
  if (!data) return;
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(data, null, 2));
}

module.exports = { load, get, save, flush };
