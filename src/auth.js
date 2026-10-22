// Accounts: sign-in and sign-up (email, Google, Discord, …).
// Runs in the main process; the renderer only talks to it over IPC.
const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const config = require('./config');

const REDIRECT = 'umbra://auth/callback';

let client = null;
let emit = () => {};
let session = null;
let pending = null; // OAuth provider waiting for the browser
let recovery = false; // signed in from a password-reset link; must set a new password
let ready = false;
let error = null;
let queuedUrl = null;

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

function state() {
  if (!configured()) return { required: false };
  const user = session ? userInfo(session.user) : null;
  return {
    required: true,
    ready,
    user,
    pending,
    recovery,
    error,
    providers: config.providers,
  };
}

// True while the app must stay behind the sign-in screen.
function locked() {
  return configured() && (!ready || !session || recovery);
}

function changed() { emit(state()); }

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
  if (queuedUrl) handleUrl(queuedUrl);
  return state();
}

async function start() {
  const { createClient } = require('@supabase/supabase-js');
  client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { flowType: 'pkce', storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  const { data } = await client.auth.getSession();
  session = data.session;
  client.auth.onAuthStateChange((event, s) => {
    const before = session?.user?.id;
    session = s;
    if (event === 'PASSWORD_RECOVERY') recovery = true;
    if (event === 'SIGNED_OUT') recovery = false;
    if (s && s.user.id !== before) pending = null;
    changed();
  });
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
  if (err) { error = err.replace(/\+/g, ' '); changed(); return; }
  if (params.get('type') === 'recovery' || hash.get('type') === 'recovery') recovery = true;
  const code = params.get('code');
  if (!code) { changed(); return; }
  const { error: e } = await client.auth.exchangeCodeForSession(code);
  error = e ? e.message : null;
  changed();
}

function need() {
  if (!client) throw new Error('Accounts aren’t set up in this build of Umbra');
}
function fail(e) {
  if (e) throw new Error(e.message === 'Invalid login credentials' ? 'Wrong email or password' : e.message);
}

async function signInEmail(email, password) {
  need();
  const { error: e } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
  fail(e);
  return state();
}

async function signUpEmail(email, password, name) {
  need();
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
  if (!config.providers.includes(provider)) throw new Error(`Unknown sign-in provider ${provider}`);
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
  changed();
}

module.exports = {
  REDIRECT, configured, init, state, locked, handleUrl,
  signInEmail, signUpEmail, signInProvider, cancelPending, resetPassword, setPassword, signOut,
};
