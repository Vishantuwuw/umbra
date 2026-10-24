// Umbra accounts. By default they're kept on this Mac (see auth-local.js): sign up or
// sign in with an email and password, no guest mode. A Supabase project (see ACCOUNTS.md)
// can be used instead by supplying UMBRA_SUPABASE_URL and UMBRA_SUPABASE_ANON_KEY as
// environment variables, or as a config.local.json written from them at build time —
// nothing is baked into the source. The anon key is meant to ship inside apps; when a
// project is used, data is protected by the database rules (supabase/schema.sql), not by
// keeping the key secret.
let local = {};
try { local = require('./config.local.json'); } catch {}

module.exports = {
  supabaseUrl: process.env.UMBRA_SUPABASE_URL || local.supabaseUrl || '',
  supabaseAnonKey: process.env.UMBRA_SUPABASE_ANON_KEY || local.supabaseAnonKey || '',
  // Sign-in provider buttons (Supabase mode only). Each must also be enabled under
  // Authentication → Providers in the Supabase dashboard.
  providers: (local.providers || ['google', 'discord', 'github', 'apple', 'twitch']),
};
