// Accounts: the sign-in screen (no guests) and the account chip.
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

let authUi = { mode: 'in', sent: null, busy: false };
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
  return JSON.stringify([a.ready, a.user?.id, a.pending, a.recovery, a.error, authUi.mode, authUi.sent, authUi.busy, authUi.err]);
}

function authBody() {
  const a = S.auth;
  const eclipse = (cls = '') => `<div class="eclipse sm ${cls}"><div class="corona"></div><div class="ring"></div><div class="moon"></div></div>`;
  if (!a.ready) return `${eclipse()}<h2>Checking your account…</h2>`;
  if (a.recovery) {
    return `${eclipse()}<h2>Choose a new password</h2><p>For ${esc(a.user?.email || 'your account')}.</p>
      <form class="auth-form" data-form="set-password">
        <input class="input" type="password" name="password" placeholder="New password (8+ characters)" autocomplete="new-password" required minlength="8">
        ${authUi.err ? `<div class="auth-err">${esc(authUi.err)}</div>` : ''}
        <button class="btn lg glow" ${authUi.busy ? 'disabled' : ''}>Save password</button>
      </form>`;
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
  const up = authUi.mode === 'up';
  const reset = authUi.mode === 'reset';
  const err = authUi.err || a.error;
  return `${eclipse()}<h1>${reset ? 'Reset your password' : up ? 'Create your account' : 'Sign in to Umbra'}</h1>
    <p>${reset ? 'Enter your email and we’ll send you a reset link.' : up ? 'An account is needed to use Umbra. It’s free.' : 'Welcome back. Sign in to play your Windows games and apps.'}</p>
    ${reset ? '' : `<div class="auth-providers">${a.providers.map((p) => `<button class="btn lg auth-provider" data-auth-provider="${esc(p)}" ${authUi.busy ? 'disabled' : ''}>${PROVIDERS[p]?.svg || icon('shield')}Continue with ${esc(providerName(p))}</button>`).join('')}</div>
    <div class="auth-or"><span>or with email</span></div>`}
    <form class="auth-form" data-form="${reset ? 'reset' : up ? 'up' : 'in'}">
      ${up ? '<input class="input" name="name" placeholder="Name (optional)" autocomplete="nickname" maxlength="40">' : ''}
      <input class="input" type="email" name="email" placeholder="Email" autocomplete="email" required value="${esc(authUi.email || '')}">
      ${reset ? '' : `<input class="input" type="password" name="password" placeholder="${up ? 'Password (8+ characters)' : 'Password'}" autocomplete="${up ? 'new-password' : 'current-password'}" required ${up ? 'minlength="8"' : ''}>`}
      ${err ? `<div class="auth-err">${esc(err)}</div>` : ''}
      <button class="btn lg glow" ${authUi.busy ? 'disabled' : ''}>${authUi.busy ? 'Please wait…' : reset ? 'Send reset link' : up ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="auth-links">
      ${up || reset ? '<button data-auth-mode="in">Already have an account? <b>Sign in</b></button>'
        : '<button data-auth-mode="up">New here? <b>Create an account</b></button><button data-auth-mode="reset">Forgot password?</button>'}
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
    const ch = { 'sign-out': 'auth:sign-out', cancel: 'auth:cancel' }[a];
    api.call(ch).catch((err) => toast(err.message, 'error'));
    if (a === 'sign-out') authUi = { mode: 'in' };
  }
}, true);

// ---------- account chip + settings card ----------
function accountPill() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="pill account" data-act="account-menu" style="cursor:pointer">${avatarHtml(a.user)}
    <div><b>${esc(a.user.name)}</b><span>${esc(a.user.email || providerName(a.user.provider))}</span></div></div>`;
}

function accountCard() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="card engine-card account-card">
    ${avatarHtml(a.user, 'avatar lg')}
    <div class="grow"><b>${esc(a.user.name)}</b>
      <span>${esc(a.user.email)} · signed in with ${esc(providerName(a.user.provider))}</span>
</div>
    <button class="btn" data-act="sign-out">Sign out</button>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => Object.assign(actions, {
  'account-menu': (el) => menu(el, [
    { icon: 'sliders', label: 'Account settings', run: () => go('settings') },
    '-',
    { icon: 'stop', label: 'Sign out', danger: true, run: () => actions['sign-out']() },
  ]),
  'sign-out': async () => {
    if (S.running.length && !confirm(`Signing out closes everything that’s running (${S.running.map((r) => r.name).join(', ')}). Sign out?`)) return;
    authUi = { mode: 'in' };
    await call('auth:sign-out');
  },
}));
