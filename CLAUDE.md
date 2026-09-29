# Fridge Door

Shared-house chore sheet for three housemates (Theo, Andrei, Maria), styled as a squared-paper sheet on a fridge. Single static page, no build step.

## Files
- `index.html` — the whole app (CSS + JS inline). Constants at the top of the script: `ANCHOR` (Mon 5 Oct 2026 = week 1), `ORDER`, `NAME`, `DUTIES`, `ROTA` (3-week cycle, two duties per week, one person off), `ROOMS`, `QUIPS`.
- `config.js` — Supabase project URL + publishable key (safe to commit).
- `schema.sql` — table `docs(id text pk, data jsonb, updated_at)`, RLS policies, `house_ok()` which checks the `x-house-code` request header. The house code itself lives only in that function in Supabase, never in this repo.
- `sw.js`, `manifest.webmanifest`, `icon-*.png`, `apple-touch-icon.png`, `badge.png` (white silhouette for Android's status bar) — PWA shell. Icons are rendered by a PIL script, not hand-drawn; regenerate all sizes together.
- `supabase/functions/push/index.ts` — Edge Function that sends web push. Called by the app (`kind: test`, auth = `x-house-code`) and by pg_cron every 5 min (`kind: tick`, auth = `x-cron-secret`). Duplicates ANCHOR/ORDER/ROTA; keep in sync with index.html. Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET. Deploy: `supabase functions deploy push` (verify_jwt off in supabase/config.toml).
- `README.md` — setup and usage.

## Data model (one row per doc id)
- `weeks/YYYY-MM-DD` (Monday): `{done:{oven|sweep:{by,at,q}}, over:{oven|sweep:{to,by}}}`
- `trash/log`: `{turns:[{by,at,q}] (last 60), full:{by,at}|null}` — next person = ORDER after last taker
- `rooms/<id>`: `{marks:{<person>:{e:'👏'|'?',at}}}` — expire after 3 days
- `_house`: marker row; the app treats its absence as "wrong house code"
- `push/<hash(endpoint)>`: `{endpoint, keys, by, ua, at}` one per phone that turned reminders on; `{}` when turned off. The function deletes rows the push service rejects.

## Sync
- "I did it" on someone else's open duty = handover to me + tick in one write (`over[d]={to:me,by:me}` and `done[d]`).

Writes are upserts via supabase-js; a realtime broadcast on channel `house-<hash(code)>` tells other phones to refetch. Also refetches on visibilitychange and every 60 s.

## Reminders
Decided inside the function in Europe/Amsterdam time; pg_cron fires it every 5 minutes. (1) Saturday 10:00: an open duty goes to its assignee ("due tomorrow 21:00"); Monday 10:00: last week's still-open duty ("still open"). Timed ones only fire on the first tick of the hour (minute < 5). (2) `trash/log.full` at least 5 min old (so a mis-tap can be undone) → next person gets "you're up"; the function stamps `full.nudgedAt` and repeats once a day while it stays full. Turning reminders on sends one test push (`kind: test`).

## Hosting
Static; GitHub Pages from `main` root. Supabase project: qxblhbnxadztoksjhtes (already set up, schema applied).

## Conventions
- Keep it minimal: one screen, your own duty first, no explanatory copy. Details live behind the three tabs at the bottom.
- Pen colours/handwriting per person: Theo green (Gloria Hallelujah), Andrei ochre (Nanum Pen Script), Maria red (Covered By Your Grace). Printed parts in Special Elite.
- Test with `python3 -m http.server` in this folder; the service worker needs http(s), not file://.
