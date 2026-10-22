// Umbra accounts run on Supabase (https://supabase.com). See ACCOUNTS.md for the setup.
// Release builds get the project URL and anon key from the repo's Actions secrets
// (written to config.local.json at build time); for local runs use the env vars below.
// While both are empty, accounts are off and Umbra opens without signing in.
// The anon key is meant to ship inside apps: bans and admin rights are enforced by
// the database (supabase/schema.sql), not by this key.
let local = {};
try { local = require('./config.local.json'); } catch {}

module.exports = {
  supabaseUrl: process.env.UMBRA_SUPABASE_URL || local.supabaseUrl || '',
  supabaseAnonKey: process.env.UMBRA_SUPABASE_ANON_KEY || local.supabaseAnonKey || '',
  // Sign-in buttons, in order. Each must also be enabled under Authentication → Providers
  // (Supabase also supports apple, twitch, twitter, gitlab, slack, spotify and more).
  providers: (local.providers || ['google', 'discord', 'github']),
};
