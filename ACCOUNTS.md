# Umbra accounts: setup

Umbra can require everyone to sign in before using it. There is no guest mode. People can sign up and sign in with email and password, Google, Discord or GitHub. Supabase also supports Apple, Twitch, X, GitLab, Spotify and more.

Accounts run on [Supabase](https://supabase.com), which is free for small projects. It takes about 15 minutes to set up. Until it's set up, release builds open without sign-in.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**. This adds a profile list; sign-in works without it.

## 2. Let sign-in links come back to Umbra

Open **Authentication → URL Configuration** and make two changes:

- Set **Site URL** to `umbra://auth/callback`.
- Under **Redirect URLs**, add `umbra://auth/callback`.

## 3. Turn on sign-in methods

Configure these under **Authentication → Providers**. Every provider asks for a **callback URL**. Use the one Supabase shows on that provider's page. It looks like `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.

- **Email**: on by default. Keep **Confirm email** on so people verify their address.
- **Google**:
  1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), go to Credentials → Create credentials → OAuth client ID → Web application.
  2. Add the Supabase callback URL under *Authorized redirect URIs*.
  3. Paste the client ID and secret into Supabase.
- **Discord**:
  1. In the [Discord Developer Portal](https://discord.com/developers/applications), create a New Application and open OAuth2.
  2. Add the Supabase callback URL as a redirect.
  3. Paste the client ID and secret into Supabase.
- **GitHub**:
  1. In GitHub, go to Settings → Developer settings → [OAuth Apps](https://github.com/settings/developers) → New OAuth App.
  2. Set *Authorization callback URL* to the Supabase callback URL.
  3. Paste the client ID and secret into Supabase.

To change which buttons Umbra shows, add a repository **variable** named `UMBRA_SIGNIN_PROVIDERS` (step 4), for example `google discord github twitch`.

## 4. Connect release builds to the project

1. In Supabase, open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**. The anon key is safe to ship inside the app.
2. In this private source repo (`umbra-source`), open **Settings → Secrets and variables → Actions** and add two **repository secrets**:
   - `UMBRA_SUPABASE_URL`: the Project URL.
   - `UMBRA_SUPABASE_ANON_KEY`: the anon / publishable key.

From the next release on, Umbra requires sign-in.

To run it locally instead, set `UMBRA_SUPABASE_URL` and `UMBRA_SUPABASE_ANON_KEY` before `npm start`.

## 5. See who signed up

In Supabase, **Authentication → Users** lists every account, and **Table Editor → profiles** shows names and how each person signed in. You can delete an account from the Users page.
