// Accounts: sign-in (email, Google, Discord, …), device registration and bans.
// Runs in the main process; the renderer only talks to it over IPC.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { app, shell } = require('electron');
const config = require('./config');
// Used through auth.js, only when config.js has a Supabase project.

const REDIRECT = 'umbra://auth/callback';
const RECHECK_MS = 5 * 60 * 1000;
// With no connection, a signed-in device that passed its last check keeps working this long.
const OFFLINE_GRACE_MS = 3 * 24 * 3600 * 1000;

let client = null;
let emit = () => {};
let hwid = null;
let session = null;
let check = null; // { role, banned, reason, at } from the last successful device check
let deviceBan = null; // { reason } when this machine is banned (checked before sign-in)
let pending = null; // OAuth provider waiting for the browser
let recovery = false; // signed in from a password-reset link; must set a new password
let ready = false;
let providers = []; // sign-in buttons: config.providers that are switched on in Supabase
let error = null;
let queuedUrl = null;
let timer = null;

const configured = () => Boolean(config.supabaseUrl && config.supabaseAnonKey);

// ---------- session storage ----------
const file = () => path.join(app.getPath('userData'), 'account.json');
let disk = null;
function readDisk() {
  if (disk) return disk;
  try { disk = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { disk = {}; }
  return disk;
}
function writeDisk() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(disk), { mode: 0o600 });
  fs.renameSync(tmp, file());
}
const storage = {
  getItem: (k) => readDisk()[k] ?? null,
  setItem: (k, v) => { readDisk()[k] = v; writeDisk(); },
  removeItem: (k) => { delete readDisk()[k]; writeDisk(); },
};

// ---------- hardware id ----------
function run(cmd, args) {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 8000 }, (err, out) => resolve(err ? '' : String(out))));
}

// A stable per-machine id, hashed so the raw hardware UUID never leaves the Mac.
async function hardwareId() {
  let raw = '';
  if (process.platform === 'darwin') {
    raw = ((await run('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'])).match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/) || [])[1] || '';
  } else if (process.platform === 'win32') {
    raw = ((await run('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'])).match(/MachineGuid\s+REG_SZ\s+(\S+)/) || [])[1] || '';
  } else {
    for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      try { raw = fs.readFileSync(f, 'utf8').trim(); if (raw) break; } catch {}
    }
  }
  if (!raw) {
    const macs = Object.values(os.networkInterfaces()).flat().filter((n) => n && !n.internal && n.mac !== '00:00:00:00:00:00').map((n) => n.mac).sort();
    raw = `${os.hostname()}|${macs[0] || ''}`;
  }
  return crypto.createHash('sha256').update(`umbra-hwid:${raw}`).digest('hex');
}

// ---------- state ----------
function userInfo(u) {
  if (!u) return null;
  const m = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || m.email || '',
    name: m.full_name || m.name || m.user_name || m.preferred_username || (u.email || '').split('@')[0] || 'Player',
    avatar: m.avatar_url || m.picture || null,
    provider: u.app_metadata?.provider || 'email',
  };
}

function banned() {
  if (deviceBan) return deviceBan;
  if (session && check?.banned) return { reason: check.reason };
  return null;
}

function state() {
  if (!configured()) return { required: false };
  const user = session ? userInfo(session.user) : null;
  return {
    required: true,
    ready,
    user,
    role: user && check ? check.role : 'user',
    banned: banned(),
    pending,
    recovery,
    error,
    deviceId: hwid ? hwid.slice(0, 12) : null,
    providers,
  };
}

// True while the app must stay behind the sign-in (or banned) screen.
function locked() {
  if (!configured()) return false;
  if (!ready || !session || banned() || recovery) return true;
  // Signed in but never verified this device (e.g. first sign-in while offline).
  return !check;
}

function changed() { emit(state()); }

// ---------- device checks ----------
async function checkDevice() {
  if (!client) return;
  try {
    const { data, error: e } = await rpc('hwid_status', { p_hwid: hwid });
    if (e) throw e;
    deviceBan = data?.banned ? { reason: data.reason || null } : null;
  } catch (e) {
    console.warn('Umbra: device check failed:', e.message);
  }
  if (!session) return;
  try {
    const { data, error: e } = await rpc('register_device', { p_hwid: hwid, p_platform: `${process.platform}-${process.arch}`, p_version: app.getVersion() });
    if (e) throw e;
    check = { role: data.role, banned: data.banned, reason: data.reason, at: Date.now() };
    storage.setItem('umbra.check', JSON.stringify({ ...check, user: session.user.id }));
    error = null;
  } catch (e) {
    // Offline: keep the last good check for a while instead of locking people out.
    if (!check || Date.now() - check.at > OFFLINE_GRACE_MS) {
      check = null;
      error = `Couldn’t reach the Umbra account server (${e.message}). Check your connection and try again.`;
    }
  }
}

async function refresh() {
  await checkDevice();
  changed();
}

// ---------- lifecycle ----------
async function init(onChange) {
  emit = onChange;
  if (!configured()) { ready = true; return state(); }
  try {
    await start();
  } catch (e) {
    error = `Couldn’t start sign-in (${e.message})`;
  }
  ready = true;
  clearInterval(timer);
  timer = setInterval(refresh, RECHECK_MS);
  if (queuedUrl) handleUrl(queuedUrl);
  return state();
}

// Asks Supabase which sign-in providers are switched on, so turning one on in the
// dashboard is all it takes for its button to appear.
async function enabledProviders() {
  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/settings`, { headers: { apikey: config.supabaseAnonKey } });
    const on = (await res.json()).external || {};
    return config.providers.filter((p) => on[p]);
  } catch (e) {
    console.warn('Umbra: could not read sign-in providers:', e.message);
    return [];
  }
}

async function start() {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  hwid = await hardwareId();
  providers = await enabledProviders();
  try {
    const saved = JSON.parse(storage.getItem('umbra.check') || 'null');
    if (saved) check = saved;
  } catch {}
  const { data } = await client.auth.getSession();
  session = data.session;
  if (!session || check?.user !== session.user.id) check = null;
  client.auth.onAuthStateChange((event, s) => {
    const before = session?.user?.id;
    session = s;
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    if (event === 'SIGNED_OUT') { check = null; recovery = false; storage.removeItem('umbra.check'); }
    // A fresh sign-in can change admin rights (password vs Google), so re-check then too.
    if (s && (s.user.id !== before || event === 'SIGNED_IN')) { pending = null; check = null; setImmediate(refresh); }
    changed();
  });
  await checkDevice();
}

// umbra://auth/callback?code=… from the browser (OAuth, email confirmation, password reset).
async function handleUrl(url) {
  if (!client) { queuedUrl = url; return; }
  queuedUrl = null;
  let u;
  try { u = new URL(url); } catch { return; }
  const params = new URLSearchParams(u.search || u.hash.slice(1));
  const hash = new URLSearchParams(u.hash.slice(1));
  const err = params.get('error_description') || hash.get('error_description');
  pending = null;
  if (err) { error = err.replace(/\+/g, ' ').slice(0, 300); changed(); return; }
  const code = params.get('code');
  if (!code) { changed(); return; }
  const { error: e } = await client.auth.exchangeCodeForSession(code);
  error = e ? e.message : null;
  // Only a reset link that actually signed in asks for a new password. Any web page can
  // open umbra:// links, so the link's own "type=recovery" isn't trusted on its own.
  if (!e && (params.get('type') === 'recovery' || hash.get('type') === 'recovery')) recovery = true;
  changed();
}

function need() {
  if (!client) throw new Error('Accounts aren’t set up in this build of Umbra');
}
function fail(e) {
  if (e) throw new Error(e.message === 'Invalid login credentials' ? 'Wrong email or password' : e.message);
}

// Supabase access tokens expire after about an hour. In the main process the
// auto-refresh timer can miss (the app was idle or the Mac was asleep), so an
// authed RPC can come back "JWT expired". Refresh the token when it's stale, and
// again if a call still reports it expired, then retry once — instead of failing.
function tokenExpired(e) {
  const m = (e && e.message || '').toLowerCase();
  return (e && e.code === 'PGRST301') || m.includes('jwt expired') || m.includes('token is expired') || m.includes('invalid jwt');
}
async function freshenSession() {
  if (!session) return;
  const expMs = (session.expires_at || 0) * 1000;
  if (!expMs || expMs - Date.now() > 60000) return;
  const { data } = await client.auth.refreshSession();
  if (data && data.session) session = data.session;
}
async function rpc(fn, args) {
  await freshenSession().catch(() => {});
  let res = await client.rpc(fn, args);
  if (res.error && tokenExpired(res.error)) {
    const { data } = await client.auth.refreshSession().catch(() => ({ data: null }));
    if (data && data.session) session = data.session;
    res = await client.rpc(fn, args);
  }
  return res;
}

async function signInEmail(email, password) {
  need();
  if (deviceBan) throw new Error('This device is banned from Umbra');
  const { error: e } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
  fail(e);
  return state();
}

async function signUpEmail(email, password, name) {
  need();
  if (deviceBan) throw new Error('This device is banned from Umbra');
  if (String(password).length < 8) throw new Error('Use at least 8 characters for your password');
  const { data, error: e } = await client.auth.signUp({
    email: String(email).trim(),
    password,
    options: { data: { full_name: String(name || '').trim() || undefined }, emailRedirectTo: REDIRECT },
  });
  fail(e);
  // With email confirmation on, there's no session until the link is clicked.
  return { confirm: !data.session };
}

async function signInProvider(provider) {
  need();
  if (deviceBan) throw new Error('This device is banned from Umbra');
  if (!providers.includes(provider)) throw new Error(`Unknown sign-in provider ${provider}`);
  const { data, error: e } = await client.auth.signInWithOAuth({ provider, options: { redirectTo: REDIRECT, skipBrowserRedirect: true } });
  fail(e);
  pending = provider;
  error = null;
  changed();
  await shell.openExternal(data.url);
}

function cancelPending() { pending = null; changed(); }

async function resetPassword(email) {
  need();
  const { error: e } = await client.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: REDIRECT });
  fail(e);
}

async function setPassword(password) {
  need();
  if (String(password).length < 8) throw new Error('Use at least 8 characters for your password');
  const { error: e } = await client.auth.updateUser({ password });
  fail(e);
  recovery = false;
  changed();
}

async function signOut() {
  if (!client) return;
  await client.auth.signOut().catch(() => {});
  session = null;
  check = null;
  changed();
}

async function retry() {
  error = null;
  await refresh();
}

// ---------- admin ----------
async function admin(fn, args) {
  need();
  if (state().role !== 'admin') throw new Error('Admins only');
  const { data, error: e } = await rpc(fn, args);
  fail(e);
  return data;
}
const adminList = () => admin('admin_list_users', {});
const adminHwidBan = (h, banned, reason) => admin('admin_set_hwid_ban', { p_hwid: String(h).trim().toLowerCase(), p_banned: banned, p_reason: reason || null });
const adminUserBan = (id, banned, reason, devices) => admin('admin_set_user_ban', { p_user: id, p_banned: banned, p_reason: reason || null, p_devices: Boolean(devices) });

module.exports = {
  REDIRECT, configured, init, state, locked, handleUrl, refresh, retry,
  signInEmail, signUpEmail, signInProvider, cancelPending, resetPassword, setPassword, signOut,
  adminList, adminHwidBan, adminUserBan, hardwareId,
};
