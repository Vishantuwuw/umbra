# Umbra accounts: setup

Everyone has to sign in before using Umbra. There is no guest mode. Until the steps below are done, Umbra keeps accounts on each Mac instead (email and password only, no Admin page). People can sign in with email and password, Google, Discord or GitHub. Supabase also supports Apple, Twitch, X, GitLab, Spotify and more. Admins get an **Admin** tab in the app where they can ban accounts and devices (HWIDs).

Accounts run on [Supabase](https://supabase.com), which is free for small projects. It takes about 15 minutes to set up. Until it's set up, release builds open without sign-in.

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.

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

1. In Supabase, open **Project Settings → API** and copy the **Project URL** and the **anon / publishable key**. The anon key is safe to ship inside the app. The database rules in `schema.sql` decide who can do what.
2. In the GitHub repo [coldvini/umbra](https://github.com/coldvini/umbra), open **Settings → Secrets and variables → Actions** and add two **repository secrets**:
   - `UMBRA_SUPABASE_URL`: the Project URL.
   - `UMBRA_SUPABASE_ANON_KEY`: the anon / publishable key.

From the next release on, Umbra requires sign-in.

To run it locally instead, set `UMBRA_SUPABASE_URL` and `UMBRA_SUPABASE_ANON_KEY` before `npm start`.

## 5. Your admin account

There is exactly one admin, `your-admin-email@example.com`, and nothing in the app can make anyone else an admin. That account only sees the **Admin** page when it signs in with its **email and password** after confirming the address. Signing in to the same address through Google, Discord or GitHub doesn't count. The password is stored only by Supabase, never in the app.

1. Run the latest [`supabase/schema.sql`](supabase/schema.sql) in the SQL Editor. Running it again is safe and removes any admin setup from older versions.
2. Open Umbra, choose **Create an account**, and sign up with `your-admin-email@example.com` and your password.
3. Supabase emails a confirmation link to that address. Click it on your Mac and Umbra signs you in. The **Admin** tab appears in the sidebar.

Everyone who signs up with email gets a confirmation link before they can sign in. That's Supabase's **Confirm email** setting under Authentication → Sign In / Providers → Email, and it's on by default. Supabase's built-in mailer only sends a few emails per hour. For more, add your own email service under Authentication → Emails → SMTP Settings.

## 6. Turning on Google, Discord or GitHub

Umbra shows a button for each provider that's switched on in **Authentication → Sign In / Providers**. Turn one on there (Part 3 above) and its button appears the next time Umbra opens. You don't need a new build.

## How bans work

- **Device ID (HWID).** It's a SHA-256 hash of the Mac's hardware UUID, so the raw ID never leaves the Mac. You can see it under Settings → Account and in the Admin panel.
- **Ban a device.** Nobody can sign in or use Umbra on that Mac with any account, including new ones.
- **Ban an account.** That account can't be used on any Mac. With *Also ban every device they used*, their Macs are banned too.
- **Admins are protected.** A Mac an admin has signed in on can't be banned, and admins can't ban themselves.
- **When bans are checked.** Umbra checks before sign-in, right after sign-in and every 5 minutes. A ban closes everything running in Umbra and shows the ban screen with your reason.
- **Offline use.** A signed-in Mac that passed its last check keeps working for up to 3 days without internet.

This is the same client-side approach most launchers use. Someone who modifies the app itself could get around it, because Umbra is not code-signed.
