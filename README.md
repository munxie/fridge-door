# Fridge Door

The house chore sheet as an app. One folder, no build step, free hosting, one shared database.

## Set up (once, ~10 minutes)

1. **Database.** Go to supabase.com → New project (free tier). Name it anything, pick a region near Rotterdam (eu-central).
2. **Schema.** In the project: SQL Editor → New query → paste `schema.sql`. Before running, change `HOUSECODE` (one place, near the top) to the code the three of you will type in, e.g. `PANCAKE`. Run.
3. **Keys.** Project Settings → API. Copy the **Project URL** and the **anon / publishable** key into `config.js`.
4. **Host.** Any static host works. Easiest: netlify.com/drop → drag this whole folder → you get a URL. (GitHub Pages also works: push the folder, enable Pages.)
5. **Share** the URL and the house code with Theo and Maria.

## On each phone

Open the URL → type the house code → tap your name. Then add it to the home screen:

- iPhone (Safari): Share → Add to Home Screen.
- Android (Chrome): ⋮ → Add to Home screen / Install app.

## Changing things later

- Names, rotation, duty details, quips: top of the script in `index.html` (`ANCHOR`, `ORDER`, `NAME`, `DUTIES`, `ROTA`, `ROOMS`, `QUIPS`). Re-upload.
- House code: edit `house_ok()` in the SQL editor and re-run just that function. Everyone re-enters the code.
- New week 1 date: `ANCHOR`. Keep it a Monday.

## How it works

- All data lives in one Supabase table, `docs`: one row per week, one for trash, one per room.
- The house code travels as a request header and Postgres row-level security checks it on every read and write. Without the code the database is invisible.
- Phones stay in sync through a Supabase realtime broadcast: when one phone saves, the others refetch. They also refetch when the app comes to the foreground and once a minute while open.
- Room marks expire after 3 days. The trash log keeps the last 60 take-outs; tallies count the current month.

## Push notifications (not included)

A web app can only show notifications through a server that sends them. Adding that means a Supabase Edge Function plus a scheduled job (pg_cron) and web-push keys, roughly an evening. The app is structured so nothing needs to change on the phones except granting permission when the time comes.

## Free tier limits

Supabase pauses free projects after 7 days without any request. Three phones polling once a minute while open keeps it alive; if it ever pauses, the dashboard has a one-click Restore.
