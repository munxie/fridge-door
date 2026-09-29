// Fridge Door push sender. Deployed as a Supabase Edge Function (no JWT check; auth is the house code or the cron secret).
// Two callers: the app (kind "full" | "test", with x-house-code) and pg_cron every hour (kind "tick", with x-cron-secret).
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

function scheduled(docs: Docs, now: Date, msgs: Msg[], updates: { id: string; data: any }[]) {
  const { day, hour, wd } = local(now);
  const i = weekIndex(mondayOf(day, wd));
  // 1. One day to go (Saturday 10:00) and the chore is still open → its assignee.
  if (i >= 0 && wd === 5 && hour === 10) {
    const a = assign(docs, i);
    DUTY_IDS.forEach((d) => { if (!done(docs, i, d)) msgs.push({ to: a[d], title: DUTY_NAME[d] + " — due tomorrow 21:00", body: "Still open on the sheet.", tag: "duty-" + d }); });
  }
  // 2. Bin full for a day and it's your turn → once a day until someone takes it out.
  const td = docs["trash/log"] || {};
  const full = td.full;
  const next = trashNext(docs);
  if (full && next) {
    const age = now.getTime() - new Date(full.at).getTime();
    const since = full.nudgedAt ? now.getTime() - new Date(full.nudgedAt).getTime() : Infinity;
    if (age >= 24 * 3600e3 && since >= 24 * 3600e3) {
      msgs.push({ to: next, title: "Trash: you’re up", body: "The bin’s been full since " + (full.by && NAME[full.by] ? NAME[full.by] + " flagged it " : "") + "yesterday.", tag: "trash" });
      updates.push({ id: "trash/log", data: { ...td, full: { ...full, nudgedAt: now.toISOString() } } });
    }
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
  const updates: { id: string; data: any }[] = [];
  const now = new Date();
  if (body.kind === "tick") {
    if (!isCron) return json({ error: "cron only" }, 403);
    scheduled(docs, now, msgs, updates);
  } else if (body.kind === "full") {
    // Someone just flagged the bin: tell whoever is next, right away (unless that's the flagger).
    const by = NAME[body.by] ? body.by : null;
    const next = trashNext(docs);
    const to = next ? (next === by ? [] : [next]) : ORDER.filter((p) => p !== by);
    to.forEach((p) => msgs.push({ to: p, title: "Trash: you’re up", body: (by ? NAME[by] : "Someone") + " says the bin’s full.", tag: "trash" }));
  } else if (body.kind === "test") {
    if (NAME[body.to]) msgs.push({ to: body.to, title: "Reminders are on", body: "You’ll hear from the fridge the day before a chore is due, or when the bin’s been full for a day and it’s your turn.", tag: "test" });
  } else {
    return json({ error: "unknown kind" }, 400);
  }
  for (const u of updates) await db.from("docs").upsert({ id: u.id, data: u.data, updated_at: now.toISOString() });

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
