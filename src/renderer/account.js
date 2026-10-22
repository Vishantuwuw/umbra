// Accounts: the sign-in screen (no guests) and the account chip.
// Loaded before app.js and shares its globals (S, call, toast, modal, icon, esc, go…),
// which are only used once app.js has run.

let authUi = { mode: null, busy: false };
let wasLocked = null;

const isLocked = () => Boolean(S?.auth?.required && S.auth.locked);
const avatarHtml = (u, cls = 'avatar') => `<span class="${cls}"><b>${esc(initial(u?.name || u?.email))}</b></span>`;

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
  return JSON.stringify([S.auth.user?.id, authMode(), authUi.busy, authUi.err]);
}

// First launch opens on "Create account"; after that, "Sign in".
const authMode = () => authUi.mode || (S.auth.hasAccounts ? 'in' : 'up');

function authBody() {
  const up = authMode() === 'up';
  const eclipse = '<div class="eclipse sm"><div class="corona"></div><div class="ring"></div><div class="moon"></div></div>';
  return `${eclipse}<h1>${up ? 'Create your account' : 'Sign in to Umbra'}</h1>
    <p>${up ? 'An account is needed to use Umbra. It’s free and stays on this Mac.' : 'Welcome back. Sign in to play your Windows games and apps.'}</p>
    <form class="auth-form" data-form="${up ? 'up' : 'in'}">
      ${up ? '<input class="input" name="name" placeholder="Name (optional)" autocomplete="nickname" maxlength="40">' : ''}
      <input class="input" type="email" name="email" placeholder="Email" autocomplete="email" required value="${esc(authUi.email || '')}">
      <input class="input" type="password" name="password" placeholder="${up ? 'Password (8+ characters)' : 'Password'}" autocomplete="${up ? 'new-password' : 'current-password'}" required ${up ? 'minlength="8"' : ''}>
      ${up ? '<input class="input" type="password" name="confirm" placeholder="Confirm password" autocomplete="new-password" required minlength="8">' : ''}
      ${authUi.err ? `<div class="auth-err">${esc(authUi.err)}</div>` : ''}
      <button class="btn lg glow" ${authUi.busy ? 'disabled' : ''}>${authUi.busy ? 'Please wait…' : up ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="auth-links">
      ${up ? '<button data-auth-mode="in">Already have an account? <b>Sign in</b></button>'
        : '<button data-auth-mode="up">New here? <b>Create an account</b></button>'}
    </div>`;
}

async function authSubmit(form) {
  const f = Object.fromEntries(new FormData(form));
  authUi = { ...authUi, busy: true, err: null, email: f.email };
  renderAuth();
  try {
    if (form.dataset.form === 'up') {
      if (f.password !== f.confirm) throw new Error('The passwords don’t match');
      await api.call('auth:email-up', f.email, f.password, f.name);
    } else {
      await api.call('auth:email-in', f.email, f.password);
    }
    authUi = { mode: null, busy: false };
  } catch (e) {
    authUi.err = e.message;
    authUi.busy = false;
  }
  renderAuth();
}

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form || !form.closest('#auth-root')) return;
  e.preventDefault();
  authSubmit(form);
});

document.addEventListener('click', (e) => {
  const mode = e.target.closest('#auth-root [data-auth-mode]');
  if (mode) { authUi = { mode: mode.dataset.authMode, email: authUi.email }; renderAuth(); }
}, true);

// ---------- account chip + settings card ----------
function accountPill() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="pill account" data-act="account-menu" style="cursor:pointer">${avatarHtml(a.user)}
    <div><b>${esc(a.user.name)}</b><span>${esc(a.user.email)}</span></div></div>`;
}

function accountCard() {
  const a = S.auth;
  if (!a?.required || !a.user) return '';
  return `<div class="card engine-card account-card">
    ${avatarHtml(a.user, 'avatar lg')}
    <div class="grow"><b>${esc(a.user.name)}</b>
      <span>${esc(a.user.email)} · account on this Mac</span>
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
