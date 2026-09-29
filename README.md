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

## Reminders (push notifications)

Each phone turns them on with the "turn on reminders" line at the bottom of the sheet (iPhone: only after adding to the Home Screen). You get: "you're up" about 5 minutes after someone marks the bin full and it's your turn (and again daily if it stays full), and a Saturday-morning note if your chore is still open (due Sunday 21:00).

Set-up (once): `supabase login`, `supabase link --project-ref <ref>`, `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… CRON_SECRET=…`, `supabase functions deploy push`, then run the cron block at the bottom of `schema.sql` in the SQL editor with the same CRON_SECRET. Generate VAPID keys with `npx web-push generate-vapid-keys`; the public one also goes in `config.js`.

## Free tier limits

Supabase pauses free projects after 7 days without any request. Three phones polling once a minute while open keeps it alive; if it ever pauses, the dashboard has a one-click Restore.
