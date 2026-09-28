-- Fridge Door: run once in Supabase → SQL Editor.
-- Change HOUSECODE below to whatever you want the three of you to type in (letters/digits).

create table if not exists public.docs (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- The house code: sent by the app as a request header, checked here on every read and write.
create or replace function public.house_ok() returns boolean
language sql stable as $$
  select upper(coalesce(current_setting('request.headers', true)::json ->> 'x-house-code', '')) = upper('HOUSECODE');
$$;

alter table public.docs enable row level security;

drop policy if exists "house read" on public.docs;
drop policy if exists "house write" on public.docs;
drop policy if exists "house update" on public.docs;

create policy "house read"   on public.docs for select to anon using (public.house_ok());
create policy "house write"  on public.docs for insert to anon with check (public.house_ok());
create policy "house update" on public.docs for update to anon using (public.house_ok()) with check (public.house_ok());

-- Marker row: the app reads this to know the code was right.
insert into public.docs (id, data) values ('_house', '{}'::jsonb) on conflict (id) do nothing;
