// Accounts: sign-up and sign-in with an email and password, stored on this Mac.
// Passwords are hashed with scrypt; the app stays locked until someone signs in.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

let emit = () => {};
let db = null; // { users: [{ id, email, name, salt, hash, created }], session: { userId, at } | null }

const file = () => path.join(app.getPath('userData'), 'accounts.json');
const normEmail = (e) => String(e || '').trim().toLowerCase();

function load() {
  if (db) return db;
  try { db = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { db = {}; }
  db.users ||= [];
  db.session ||= null;
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file());
}

const hashPassword = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
});

function current() {
  const s = load().session;
  return s ? db.users.find((u) => u.id === s.userId) || null : null;
}

function state() {
  const u = current();
  return {
    required: true,
    ready: true,
    user: u ? { id: u.id, email: u.email, name: u.name, provider: 'email' } : null,
    hasAccounts: load().users.length > 0,
  };
}

// True while the app must stay behind the sign-in screen: no guests.
const locked = () => !current();

function changed() { emit(state()); }

async function init(onChange) {
  emit = onChange;
  load();
  return state();
}

function startSession(u) {
  db.session = { userId: u.id, at: Date.now() };
  save();
  changed();
  return state();
}

async function signUpEmail(email, password, name) {
  const e = normEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Enter a valid email address');
  if (String(password || '').length < 8) throw new Error('Use at least 8 characters for your password');
  if (load().users.some((u) => u.email === e)) throw new Error('There’s already an account with that email. Sign in instead.');
  const salt = crypto.randomBytes(16).toString('hex');
  const u = {
    id: crypto.randomUUID(),
    email: e,
    name: String(name || '').trim().slice(0, 40) || e.split('@')[0],
    salt,
    hash: (await hashPassword(password, salt)).toString('hex'),
    created: Date.now(),
  };
  db.users.push(u);
  startSession(u);
  return { confirm: false };
}

async function signInEmail(email, password) {
  const u = load().users.find((x) => x.email === normEmail(email));
  // Hash even when the account doesn't exist, so both cases take the same time.
  const key = await hashPassword(password, u?.salt || '0'.repeat(32));
  if (!u || !crypto.timingSafeEqual(key, Buffer.from(u.hash, 'hex'))) throw new Error('Wrong email or password');
  return startSession(u);
}

async function signOut() {
  load().session = null;
  save();
  changed();
}

module.exports = { init, state, locked, signInEmail, signUpEmail, signOut };
