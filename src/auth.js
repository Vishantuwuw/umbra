// Accounts. With a Supabase project configured (see ACCOUNTS.md) people sign in with
// email, Google, Discord or GitHub and admins get the Admin page; without one, accounts
// are kept on this Mac instead. Either way there is no guest mode.
const config = require('./config');

const cloud = Boolean(config.supabaseUrl && config.supabaseAnonKey);
const impl = cloud ? require('./auth-cloud') : require('./auth-local');
const needsCloud = () => { throw new Error('This needs Umbra’s account server (see ACCOUNTS.md)'); };

module.exports = {
  configured: () => cloud,
  init: impl.init,
  state: () => ({ ...impl.state(), mode: cloud ? 'cloud' : 'local' }),
  locked: impl.locked,
  signInEmail: impl.signInEmail,
  signUpEmail: impl.signUpEmail,
  signOut: impl.signOut,
  handleUrl: impl.handleUrl || (() => {}),
  retry: impl.retry || (async () => {}),
  signInProvider: impl.signInProvider || needsCloud,
  cancelPending: impl.cancelPending || (() => {}),
  resetPassword: impl.resetPassword || needsCloud,
  setPassword: impl.setPassword || needsCloud,
  adminList: impl.adminList || needsCloud,
  adminHwidBan: impl.adminHwidBan || needsCloud,
  adminUserBan: impl.adminUserBan || needsCloud,
};
