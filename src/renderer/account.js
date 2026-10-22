// Accounts: the sign-in screen (no guests), the account chip and the admin panel.
// Loaded before app.js and shares its globals (S, call, toast, modal, icon, esc, go…),
// which are only used once app.js has run.

const PROVIDERS = {
  google: { name: 'Google', svg: '<svg viewBox="0 0 24 24" class="brand-ic"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>' },
  discord: { name: 'Discord', svg: '<svg viewBox="0 0 24 24" class="brand-ic"><path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4C.6 9 0 13.6.3 18.1a19.9 19.9 0 0 0 6 3l1.3-2a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8.5 15.3c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4zm7 0c-1.2 0-2.1-1.1-2.1-2.4s.9-2.4 2.1-2.4 2.2 1.1 2.1 2.4c0 1.3-.9 2.4-2.1 2.4z"/></svg>' },
  github: { name: 'GitHub', svg: '<svg viewBox="0 0 24 24" class="brand-ic"><path fill="#fff" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.9 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>' },
  apple: { name: 'Apple', svg: '<svg viewBox="0 0 24 24" class="brand-ic"><path fill="#fff" d="M16.4 12.6c0-2.6 2.1-3.8 2.2-3.9a4.8 4.8 0 0 0-3.8-2c-1.6-.2-3.1.9-3.9.9s-2-.9-3.4-.9a5 5 0 0 0-4.2 2.6c-1.8 3.1-.5 7.7 1.3 10.2.8 1.2 1.8 2.6 3.1 2.5 1.2 0 1.7-.8 3.2-.8s1.9.8 3.2.8c1.3 0 2.2-1.2 3-2.4a10 10 0 0 0 1.4-2.8 4.4 4.4 0 0 1-2.1-4.2zM13.9 5c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z"/></svg>' },
  twitch: { name: 'Twitch', svg: '<svg viewBox="0 0 24 24" class="brand-ic"><path fill="#9146FF" d="M3 2 1.5 6v14h5v3h3l3-3h4l6-6V2zm17 11-3.5 3.5h-4l-3 3v-3H5V4h15zM15.5 7.5h2v5h-2zm-5 0h2v5h-2z"/></svg>' },
};
const providerName = (p) => PROVIDERS[p]?.name || (p ? p[0].toUpperCase() + p.slice(1) : 'Email');

let authUi = { mode: null, sent: null, busy: false };
// On-device accounts open on "Create account" until the first one exists.
const authMode = () => authUi.mode || (S.auth.mode === 'local' && !S.auth.hasAccounts ? 'up' : 'in');
let wasLocked = null;

const isLocked = () => Boolean(S?.auth?.required && S.auth.locked);
const avatarHtml = (u, cls = 'avatar') => (u?.avatar
  ? `<span class="${cls}"><img src="${esc(u.avatar)}" alt="" draggable="false" referrerpolicy="no-referrer" data-fallbacks=""><b>${esc(initial(u.name || u.email))}</b></span>`
  : `<span class="${cls}"><b>${esc(initial(u?.name || u?.email))}</b></span>`);

// Full-screen gate shown until someone signs in. Called from render().
function renderAuth() {
  const locked = isLocked();
  let root = $('#auth-root');
  if (!locked) {
    root?.remove();
    if (wasLocked && !S.settings.setupDone && !wizardDismissed) openWizard();
    wasLocked = false;
    return;
  }
  wasLocked = true;
  document.querySelector('.menu')?.remove();
  if (wizard) { wizard.el.remove(); wizard = null; }
  $('#modal-root').innerHTML = '';
  if (!root) {
    root = document.createElement('div');
    root.id = 'auth-root';
    root.className = 'auth';
    document.body.appendChild(root);
  }
  const key = authKey();
  // Don't wipe what someone is typing on unrelated state pushes.
  if (root.dataset.key === key) return;
  root.dataset.key = key;
  root.innerHTML = `<div class="auth-card">${authBody()}</div><div class="wz-foot">MADE BY VINI</div>`;
  root.querySelector('input')?.focus();
}

function authKey() {
  const a = S.auth;
  return JSON.stringify([a.ready, a.user?.id, a.banned, a.pending, a.recovery, a.error, authMode(), authUi.sent, authUi.busy, authUi.err]);
}

function authBody() {
  const a = S.auth;
  const eclipse = (cls = '') => `<div class="eclipse sm ${cls}"><div class="corona"></div><div class="ring"></div><div class="moon"></div></div>`;
  if (!a.ready) return `${eclipse()}<h2>Checking your account…</h2>`;
  if (a.banned) {
    return `${eclipse('banned')}<h1>This device is banned</h1>
      <p>Umbra can’t be used on this Mac.${a.banned.reason ? ` Reason: <b>${esc(a.banned.reason)}</b>` : ''}</p>
      <p class="faint mono auth-id">Device ID ${esc(a.deviceId || '')}</p>
      ${a.user ? '<div class="wz-actions"><button class="btn lg" data-auth="sign-out">Sign out</button></div>' : ''}`;
  }
  if (a.recovery) {
    return `${eclipse()}<h2>Choose a new password</h2><p>For ${esc(a.user?.email || 'your account')}.</p>
      <form class="auth-form" data-form="set-password">
        <input class="input" type="password" name="password" placeholder="New password (8+ characters)" autocomplete="new-password" required minlength="8">
        ${authUi.err ? `<div class="auth-err">${esc(authUi.err)}</div>` : ''}
        <button class="btn lg glow" ${authUi.busy ? 'disabled' : ''}>Save password</button>
      </form>`;
  }
  if (a.user) {
    // Signed in but the device check couldn't reach the server.
    return `${eclipse()}<h2>Can’t reach Umbra</h2><p>${esc(a.error || 'Checking this device…')}</p>
      <div class="wz-actions"><button class="btn lg ghost" data-auth="sign-out">Sign out</button><button class="btn lg glow" data-auth="retry">${icon('refresh')}Try again</button></div>`;
  }
  if (a.pending) {
    return `${eclipse()}<h2>Continue in your browser</h2>
      <p>Finish signing in with ${esc(providerName(a.pending))} in the browser window that just opened. You’ll come right back here.</p>
      <div class="wz-actions"><button class="btn lg ghost" data-auth="cancel">Cancel</button><button class="btn lg" data-auth-provider="${esc(a.pending)}">Open it again</button></div>`;
  }
  if (authUi.sent) {
    return `${eclipse()}<h2>Check your email</h2>
      <p>${authUi.sent.kind === 'reset' ? 'We sent a password reset link to' : 'We sent a confirmation link to'} <b>${esc(authUi.sent.email)}</b>. Open it on this Mac to ${authUi.sent.kind === 'reset' ? 'choose a new password' : 'finish creating your account'}.</p>
      <div class="wz-actions"><button class="btn lg" data-auth-mode="in">Back to sign in</button></div>`;
  }
  const local = a.mode === 'local';
  const up = authMode() === 'up';
  const reset = authMode() === 'reset';
  const err = authUi.err || a.error;
  return `${eclipse()}<h1>${reset ? 'Reset your password' : up ? 'Create your account' : 'Sign in to Umbra'}</h1>
    <p>${reset ? 'Enter your email and we’ll send you a reset link.' : up ? `An account is needed to use Umbra. It’s free${local ? ' and stays on this Mac' : ''}.` : 'Welcome back. Sign in to play your Windows games and apps.'}</p>
    ${reset || !a.providers.length ? '' : `<div class="auth-providers">${a.providers.map((p) => `<button class="btn lg auth-provider" data-auth-provider="${esc(p)}" ${authUi.busy ? 'disabled' : ''}>${PROVIDERS[p]?.svg || icon('shield')}Continue with ${esc(providerName(p))}</button>`).join('')}</div>
    <div class="auth-or"><span>or with email</span></div>`}
    <form class="auth-form" data-form="${reset ? 'reset' : up ? 'up' : 'in'}">
      ${up ? '<input class="input" name="name" placeholder="Name (optional)" autocomplete="nickname" maxlength="40">' : ''}
      <input class="input" type="email" name="email" placeholder="Email" autocomplete="email" required value="${esc(authUi.email || '')}">
      ${reset ? '' : `<input class="input" type="password" name="password" placeholder="${up ? 'Password (8+ characters)' : 'Password'}" autocomplete="${up ? 'new-password' : 'current-password'}" required ${up ? 'minlength="8"' : ''}>`}
      ${up && local ? '<input class="input" type="password" name="confirm" placeholder="Confirm password" autocomplete="new-password" required minlength="8">' : ''}
      ${err ? `<div class="auth-err">${esc(err)}</div>` : ''}
      <button class="btn lg glow" ${authUi.busy ? 'disabled' : ''}>${authUi.busy ? 'Please wait…' : reset ? 'Send reset link' : up ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="auth-links">
      ${up || reset ? '<button data-auth-mode="in">Already have an account? <b>Sign in</b></button>'
        : `<button data-auth-mode="up">New here? <b>Create an account</b></button>${local ? '' : '<button data-auth-mode="reset">Forgot password?</button>'}`}
    </div>`;
}

async function authSubmit(form) {
  const f = Object.fromEntries(new FormData(form));
  authUi = { ...authUi, busy: true, err: null, email: f.email ?? authUi.email };
  renderAuth();
  try {
    const kind = form.dataset.form;
    if (kind === 'in') await api.call('auth:email-in', f.email, f.password);
    else if (kind === 'up') {
      if (f.confirm !== undefined && f.password !== f.confirm) throw new Error('The passwords don’t match');
      const r = await api.call('auth:email-up', f.email, f.password, f.name);
      if (r.confirm) authUi.sent = { kind: 'confirm', email: f.email };
    } else if (kind === 'reset') {
      await api.call('auth:reset', f.email);
      authUi.sent = { kind: 'reset', email: f.email };
    } else if (kind === 'set-password') {
      await api.call('auth:set-password', f.password);
      toast('Password updated');
    }
  } catch (e) {
    authUi.err = e.message;
  }
  authUi.busy = false;
  renderAuth();
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form || !form.closest('#auth-root')) return;
  e.preventDefault();
  authSubmit(form);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#auth-root')) return;
  const mode = e.target.closest('[data-auth-mode]');
  const prov = e.target.closest('[data-auth-provider]');
  const act = e.target.closest('[data-auth]');
  if (mode) { authUi = { mode: mode.dataset.authMode, email: authUi.email }; renderAuth(); }
  if (prov) {
    authUi.err = null;
    api.call('auth:provider', prov.dataset.authProvider).catch((err) => { authUi.err = err.message; renderAuth(); });
  }
  if (act) {
    const a = act.dataset.auth;
    const ch = { 'sign-out': 'auth:sign-out', retry: 'auth:retry', cancel: 'auth:cancel' }[a];
    api.call(ch).catch((err) => toast(err.message, 'error'));
    if (a === 'sign-out') authUi = { mode: 'in' };
  }
}, true);

// ---------- account chip + settings card ----------
function accountPill() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="pill account" data-act="account-menu" style="cursor:pointer">${avatarHtml(a.user)}
    <div><b>${esc(a.user.name)}${a.role === 'admin' ? ' <span class="tag-admin">Admin</span>' : ''}</b><span>${esc(a.user.email || providerName(a.user.provider))}</span></div></div>`;
}

function accountCard() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="card engine-card account-card">
    ${avatarHtml(a.user, 'avatar lg')}
    <div class="grow"><b>${esc(a.user.name)}${a.role === 'admin' ? ' <span class="tag-admin">Admin</span>' : ''}</b>
      <span>${esc(a.user.email)} · ${a.mode === 'local' ? 'account on this Mac' : `signed in with ${esc(providerName(a.user.provider))}`}</span>
      ${a.deviceId ? `<span class="faint mono">Device ID ${esc(a.deviceId)}</span>` : ''}</div>
    ${a.role === 'admin' ? `<button class="btn" data-nav="admin">${icon('shield')}Admin Panel</button>` : ''}
    <button class="btn" data-act="sign-out">Sign out</button>
  </div>`;
}

// ---------- admin panel ----------
let ADMIN = null; // { users, bans } from the server
let adminQuery = '';
let adminErr = null;

async function loadAdmin() {
  try {
    ADMIN = await api.call('admin:list');
    adminErr = null;
  } catch (e) {
    adminErr = e.message;
  }
  if (view === 'admin') render();
}

const shortId = (h) => `${String(h).slice(0, 8)}…${String(h).slice(-4)}`;
const when = (t) => (t ? ago(new Date(t).getTime()) : 'never');

function viewAdmin() {
  if (S.auth?.role !== 'admin') return '<p class="muted">Admins only.</p>';
  if (adminErr) return `<div class="banner"><div class="badge-icon">${icon('alert')}</div><div class="grow"><b>Couldn’t load accounts</b><span>${esc(adminErr)}</span></div><button class="btn" data-act="admin-refresh">${icon('refresh')}Retry</button></div>`;
  if (!ADMIN) return '<p class="muted">Loading accounts…</p>';
  const q = adminQuery.trim().toLowerCase();
  const users = ADMIN.users.filter((u) => !q || [u.name, u.email, u.provider, u.id, ...u.devices.map((d) => d.hwid)].some((x) => String(x || '').toLowerCase().includes(q)));
  const devices = ADMIN.users.reduce((n, u) => n + u.devices.length, 0);
  const me = S.auth.user.id;
  const stat = (n, label, cls = '') => `<div class="card admin-stat ${cls}"><b>${n}</b><span>${label}</span></div>`;
  return `<div class="admin-stats">
      ${stat(ADMIN.users.length, 'Accounts')}
      ${stat(devices, 'Devices')}
      ${stat(ADMIN.users.filter((u) => u.banned).length, 'Banned accounts', 'red')}
      ${stat(ADMIN.bans.length, 'Banned devices', 'red')}
    </div>
    <div class="section-h"><h2>Accounts</h2><span class="faint">${users.length} of ${ADMIN.users.length}</span></div>
    <div class="admin-users">${users.map((u) => `
      <div class="card admin-user ${u.banned ? 'is-banned' : ''}">
        <div class="admin-user-head">
          ${avatarHtml(u, 'avatar lg')}
          <div class="grow"><b>${esc(u.name || u.email)} ${u.role === 'admin' ? '<span class="tag-admin">Admin</span>' : ''} ${u.banned ? '<span class="tag-ban">Banned</span>' : ''} ${u.id === me ? '<span class="tag-you">You</span>' : ''}</b>
            <span>${esc(u.email || '')} · ${esc(providerName(u.provider))} · joined ${when(u.created)} · last seen ${when(u.lastSeen)}</span>
            ${u.banned && u.reason ? `<span class="ban-reason">Reason: ${esc(u.reason)}</span>` : ''}</div>
          ${u.id === me ? '' : `${u.banned ? `<button class="btn sm" data-act="admin-unban-user" data-id="${esc(u.id)}">Unban</button>`
            : `<button class="btn sm danger" data-act="admin-ban-user" data-id="${esc(u.id)}">${icon('shield')}Ban…</button>`}
            <button class="btn sm ghost" data-act="admin-user-menu" data-id="${esc(u.id)}">${icon('more')}</button>`}
        </div>
        ${u.devices.length ? `<div class="admin-devices">${u.devices.map((d) => `
          <div class="admin-device ${d.banned ? 'is-banned' : ''}">
            ${icon('chip')}<span class="mono" title="${esc(d.hwid)}">${esc(shortId(d.hwid))}</span>
            <span class="faint">${esc(d.platform || '')} · v${esc(d.version || '?')} · ${when(d.lastSeen)}</span>
            ${d.hwid.startsWith(S.auth.deviceId || '-') ? '<span class="tag-you">This Mac</span>' : ''}
            ${d.banned ? '<span class="tag-ban">HWID banned</span>' : ''}
            <span class="grow"></span>
            <button class="btn sm ghost" data-act="admin-copy" data-hwid="${esc(d.hwid)}">Copy</button>
            ${d.banned ? `<button class="btn sm" data-act="admin-unban-hwid" data-hwid="${esc(d.hwid)}">Unban HWID</button>`
              : d.hwid.startsWith(S.auth.deviceId || '-') ? '' : `<button class="btn sm danger" data-act="admin-ban-hwid" data-hwid="${esc(d.hwid)}">Ban HWID…</button>`}
          </div>`).join('')}</div>` : '<div class="faint admin-nodev">No devices yet</div>'}
      </div>`).join('') || '<p class="muted">No accounts match.</p>'}</div>
    <div class="section-h"><h2>Banned devices (HWIDs)</h2><button class="btn sm" data-act="admin-ban-hwid">${icon('plus')}Ban a device ID…</button></div>
    <div class="card admin-bans">${ADMIN.bans.length ? ADMIN.bans.map((b) => `
      <div class="admin-device is-banned">${icon('chip')}<span class="mono" title="${esc(b.hwid)}">${esc(shortId(b.hwid))}</span>
        <span class="faint">${b.reason ? esc(b.reason) : 'No reason given'} · ${when(b.created)}${b.by ? ` · by ${esc(b.by)}` : ''}</span><span class="grow"></span>
        <button class="btn sm" data-act="admin-unban-hwid" data-hwid="${esc(b.hwid)}">Unban</button></div>`).join('') : '<div class="faint admin-nodev">No banned devices</div>'}</div>`;
}

function banModal({ title, text, devices, hwidInput, run }) {
  modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p>
    ${hwidInput ? '<div class="field"><label>Device ID (HWID)</label><input class="input mono" id="ban-hwid" placeholder="64-character device ID" spellcheck="false"></div>' : ''}
    <div class="field"><label>Reason (shown to them)</label><input class="input" id="ban-reason" placeholder="e.g. Cheating, abuse, chargeback" maxlength="200"></div>
    ${devices ? '<label class="check-row"><input type="checkbox" id="ban-devices" checked> Also ban every device they used (HWID ban), so new accounts on those Macs are blocked too</label>' : ''}
    <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn danger-solid" id="m-go">${icon('shield')}Ban</button></div>`,
  (el, close) => {
    $('#m-go', el).onclick = async () => {
      const hwid = hwidInput ? $('#ban-hwid', el).value.trim().toLowerCase() : null;
      if (hwidInput && !/^[0-9a-f]{16,128}$/.test(hwid)) return toast('Paste the full device ID (letters a–f and numbers)', 'error');
      await run({ reason: $('#ban-reason', el).value.trim(), devices: devices && $('#ban-devices', el).checked, hwid });
      close();
      loadAdmin();
    };
  });
}

const adminUser = (id) => ADMIN?.users.find((u) => u.id === id);

document.addEventListener('DOMContentLoaded', () => Object.assign(actions, {
  'account-menu': (el) => menu(el, [
    { icon: 'sliders', label: 'Account settings', run: () => go('settings') },
    ...(S.auth.role === 'admin' ? [{ icon: 'shield', label: 'Admin panel', run: () => go('admin') }] : []),
    '-',
    { icon: 'stop', label: 'Sign out', danger: true, run: () => actions['sign-out']() },
  ]),
  'sign-out': async () => {
    if (S.running.length && !confirm(`Signing out closes everything that’s running (${S.running.map((r) => r.name).join(', ')}). Sign out?`)) return;
    authUi = { mode: 'in' };
    await call('auth:sign-out');
  },
  'admin-refresh': () => { ADMIN = null; adminErr = null; render(); loadAdmin(); },
  'admin-copy': (el) => { navigator.clipboard.writeText(el.dataset.hwid); toast('Device ID copied'); },
  'admin-ban-hwid': (el) => {
    const hwid = el.dataset.hwid;
    banModal({
      title: hwid ? `Ban device ${shortId(hwid)}` : 'Ban a device ID',
      text: 'A banned device can’t sign in or use Umbra with any account, including new ones.',
      hwidInput: !hwid,
      run: ({ reason, hwid: typed }) => call('admin:hwid', hwid || typed, true, reason).then(() => toast('Device banned')),
    });
  },
  'admin-unban-hwid': async (el) => { await call('admin:hwid', el.dataset.hwid, false); toast('Device unbanned'); loadAdmin(); },
  'admin-ban-user': (el) => {
    const u = adminUser(el.dataset.id);
    banModal({
      title: `Ban ${u.name || u.email}`,
      text: 'They’ll be signed out of Umbra within a few minutes and can’t sign back in.',
      devices: true,
      run: ({ reason, devices }) => call('admin:user', u.id, true, reason, devices).then(() => toast(`${u.name || u.email} is banned`)),
    });
  },
  'admin-unban-user': async (el) => {
    const u = adminUser(el.dataset.id);
    const devices = u.devices.some((d) => d.banned) && confirm('Also unban the devices they used?');
    await call('admin:user', u.id, false, null, devices);
    toast(`${u.name || u.email} is unbanned`);
    loadAdmin();
  },
  'admin-user-menu': (el) => {
    const u = adminUser(el.dataset.id);
    menu(el, [
      { icon: 'chip', label: 'Ban all their devices…', danger: true, run: () => banModal({
        title: `Ban ${u.name || u.email}’s devices`,
        text: `Bans the account and all ${u.devices.length} device(s) it used.`,
        run: ({ reason }) => call('admin:user', u.id, true, reason, true).then(() => toast('Account and devices banned')),
      }) },
    ]);
  },
}));

document.addEventListener('input', (e) => {
  if (e.target.id !== 'admin-search') return;
  adminQuery = e.target.value;
  if (view === 'admin') $('#view').innerHTML = viewAdmin();
});
