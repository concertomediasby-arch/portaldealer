-- Concerto Way: notifikasi HP 5 menit sebelum tayang (Edge Function "cway-push"). 4 Nov 2026, permintaan pemilik.
-- Jalankan sekali di Supabase → SQL Editor → Run SETELAH fungsi cway-push di-deploy (Verify JWT dimatikan).
-- Sama dengan tombol "📋 Salin SQL Notifikasi" di menu Concerto Way (konstanta CWAY_PUSH_SQL di js/cway.js). Tidak berisi rahasia.
alter table public.concerto_way add column if not exists push_notified_at timestamptz;

create table if not exists public.cway_push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_id uuid default auth.uid(),
  ua text,
  created_at timestamptz default now()
);
alter table public.cway_push_subs enable row level security;
drop policy if exists "cway push own" on public.cway_push_subs;
create policy "cway push own" on public.cway_push_subs for all to authenticated
  using (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));

-- Kunci VAPID dibuat otomatis oleh fungsi; RLS tanpa policy = hanya fungsi (service role) yang bisa membaca
create table if not exists public.cway_push_config (id int primary key default 1 check (id = 1), public_key text, private_key text);
alter table public.cway_push_config enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('cway-push') where exists (select 1 from cron.job where jobname = 'cway-push');
select cron.schedule('cway-push', '* * * * *', $$
  select net.http_post(
    url := 'https://cvffltbxsaiugccexmtf.supabase.co/functions/v1/cway-push',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);
-- Mematikan jadwal: select cron.unschedule('cway-push');
