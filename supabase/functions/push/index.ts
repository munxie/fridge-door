// Fridge Door push sender. Deployed as a Supabase Edge Function (no JWT check; auth is the house code or the cron secret).
// Two callers: the app (kind "full" / "over", with x-house-code) and pg_cron every hour (kind "tick", with x-cron-secret).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const APP_URL = Deno.env.get("APP_URL") || "https://munxie.github.io/fridge-door/";
const TZ = "Europe/Amsterdam";

// Same facts as index.html. Keep in sync.
const ANCHOR_UTC = Date.UTC(2026, 9, 5); // Monday 5 Oct 2026 = week 0
const WEEK = 7 * 864e5;
const ORDER = ["theo", "andrei", "maria"];
const NAME: Record<string, string> = { theo: "Theo", andrei: "Andrei", maria: "Maria" };
const DUTY_IDS = ["oven", "sweep"];
const DUTY_NAME: Record<string, string> = { oven: "Oven", sweep: "Sweeping" };
const ROTA = [["theo", "andrei"], ["maria", "theo"], ["andrei", "maria"]];

type Docs = Record<string, any>;
type Msg = { to: string; title: string; body: string; tag: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-house-code, x-cron-secret, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Local (Amsterdam) calendar facts for "now".
function local(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", weekday: "short", hour12: false });
  const p: Record<string, string> = {};
  f.formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  const day = Date.UTC(+p.year, +p.month - 1, +p.day);
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday);
  return { day, hour: +p.hour % 24, wd };
}
const pad = (n: number) => (n < 10 ? "0" : "") + n;
function ymd(utcDay: number) { const d = new Date(utcDay); return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
function mondayOf(day: number, wd: number) { return day - wd * 864e5; }
function weekIndex(monday: number) { return Math.round((monday - ANCHOR_UTC) / WEEK); }
function weekStart(i: number) { return ANCHOR_UTC + i * WEEK; }
function assign(docs: Docs, i: number) {
  const base = ROTA[((i % 3) + 3) % 3];
  const over = (docs["weeks/" + ymd(weekStart(i))] || {}).over || {};
  const out: Record<string, string> = {};
  DUTY_IDS.forEach((d, k) => { out[d] = over[d] ? over[d].to : base[k]; });
  return out;
}
function done(docs: Docs, i: number, d: string) { return !!((docs["weeks/" + ymd(weekStart(i))] || {}).done || {})[d]; }
function trashNext(docs: Docs) {
  const t = (docs["trash/log"] || {}).turns || [];
  if (!t.length) return null;
  return ORDER[(ORDER.indexOf(t[t.length - 1].by) + 1) % 3];
}

function scheduled(docs: Docs, now: Date, msgs: Msg[]) {
  const { day, hour, wd } = local(now);
  const i = weekIndex(mondayOf(day, wd));
  const due = (idx: number, text: string) => {
    const a = assign(docs, idx);
    DUTY_IDS.forEach((d) => { if (!done(docs, idx, d)) msgs.push({ to: a[d], title: DUTY_NAME[d] + " — " + text, body: "Tick it on the fridge when it’s done.", tag: "duty-" + d }); });
  };
  if (i >= 0 && wd === 5 && hour === 10) due(i, "due tomorrow 21:00");
  if (i >= 0 && wd === 6 && hour === 18) due(i, "due tonight 21:00");
  if (wd === 0 && hour === 10) {
    if (i >= 1) {
      const a = assign(docs, i - 1);
      DUTY_IDS.forEach((d) => { if (!done(docs, i - 1, d)) msgs.push({ to: a[d], title: DUTY_NAME[d] + " from last week is still open", body: "It’s marked late on the sheet.", tag: "duty-" + d }); });
    }
    if (i >= 0) {
      const a = assign(docs, i);
      ORDER.forEach((p) => {
        const mine = DUTY_IDS.filter((d) => a[d] === p).map((d) => DUTY_NAME[d]);
        if (mine.length) msgs.push({ to: p, title: "New week: " + mine.join(" + "), body: "Due Sunday 21:00.", tag: "week" });
      });
    }
  }
  if (hour === 10) {
    const full = (docs["trash/log"] || {}).full;
    const next = trashNext(docs);
    if (full && next && now.getTime() - new Date(full.at).getTime() > 20 * 3600e3) msgs.push({ to: next, title: "Trash: still full", body: "You’re up.", tag: "trash" });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const isCron = !!CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;
  const code = req.headers.get("x-house-code") || "";
  const db = createClient(SB_URL, SERVICE_KEY, { global: { headers: { "x-house-code": code } } });
  if (!isCron) {
    const { data: ok } = await db.rpc("house_ok");
    if (ok !== true) return json({ error: "wrong house code" }, 403);
  }
  const { data: rows, error } = await db.from("docs").select("id,data");
  if (error) return json({ error: error.message }, 500);
  const docs: Docs = {};
  rows.forEach((r: any) => { docs[r.id] = r.data || {}; });
  const subs = rows.filter((r: any) => r.id.startsWith("push/") && r.data && r.data.endpoint && NAME[r.data.by]);

  const msgs: Msg[] = [];
  const now = new Date();
  if (body.kind === "tick") {
    if (!isCron) return json({ error: "cron only" }, 403);
    scheduled(docs, now, msgs);
  } else if (body.kind === "full") {
    const by = NAME[body.by] ? body.by : null;
    const next = trashNext(docs);
    const to = next ? (next === by ? [] : [next]) : ORDER.filter((p) => p !== by);
    to.forEach((p) => msgs.push({ to: p, title: "Trash: you’re up", body: (by ? NAME[by] : "Someone") + " says it’s full.", tag: "trash" }));
  } else if (body.kind === "over") {
    if (NAME[body.to] && NAME[body.by] && DUTY_NAME[body.duty] && body.to !== body.by) {
      msgs.push({ to: body.to, title: NAME[body.by] + " handed you " + DUTY_NAME[body.duty], body: "Week of " + body.week + ". It’s on the sheet.", tag: "over" });
    }
  } else if (body.kind === "test") {
    if (NAME[body.to]) msgs.push({ to: body.to, title: "Reminders are on", body: "This is what they look like.", tag: "test" });
  } else {
    return json({ error: "unknown kind" }, 400);
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return json({ error: "VAPID keys not set", planned: msgs.length }, 500);
  webpush.setVapidDetails(APP_URL, VAPID_PUBLIC, VAPID_PRIVATE);
  let sent = 0, dropped = 0;
  const errors: string[] = [];
  for (const m of msgs) {
    for (const s of subs.filter((x: any) => x.data.by === m.to)) {
      try {
        await webpush.sendNotification({ endpoint: s.data.endpoint, keys: s.data.keys }, JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: APP_URL }), { TTL: 12 * 3600 });
        sent++;
      } catch (e: any) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) { await db.from("docs").delete().eq("id", s.id); dropped++; }
        else errors.push(String(e && e.message || e));
      }
    }
  }
  return json({ planned: msgs.length, sent, dropped, errors, subs: subs.length });
});
