// Umbra accounts run on Supabase (https://supabase.com). See ACCOUNTS.md for the setup.
// Umbra's own Supabase project is built in; the env vars, or a config.local.json written
// from the repo's Actions secrets, can point a build at a different project.
// The anon key is meant to ship inside apps: bans and admin rights are enforced by
// the database (supabase/schema.sql), not by this key.
let local = {};
try { local = require('./config.local.json'); } catch {}

module.exports = {
  supabaseUrl: process.env.UMBRA_SUPABASE_URL || local.supabaseUrl || 'https://pnafduofvweodcxeydal.supabase.co',
  supabaseAnonKey: process.env.UMBRA_SUPABASE_ANON_KEY || local.supabaseAnonKey || 'sb_publishable_qpts0fpi9T-_PBwOWkSZBA_Dd_FBAcH',
  // Sign-in buttons, in order. Each must also be enabled under Authentication → Providers
  // (Supabase also supports apple, twitch, twitter, gitlab, slack, spotify and more).
  // Only providers already set up in the Supabase project; a button for one that isn't
  // fails with "provider is not enabled". Add 'discord', 'github', 'google' as they're ready.
  providers: (local.providers || []),
};
