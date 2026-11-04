-- Notifikasi HP CAI Hub (Edge Function "cway-push"). 4 Nov 2026, permintaan pemilik:
-- pengingat Editor/Admin 5 menit sebelum Concerto Way tayang + notifikasi partner saat tayang + News baru (semua pengunjung).
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
-- Jenis notifikasi per HP. Baris lama (dibuat sebelum kolom ini ada) = pengingat Editor/Admin → staff true.
alter table public.cway_push_subs add column if not exists staff boolean default true;
alter table public.cway_push_subs alter column staff set default false;
alter table public.cway_push_subs add column if not exists cway boolean default false;
alter table public.cway_push_subs add column if not exists news boolean default false;
alter table public.concerto_way add column if not exists push_live_at timestamptz;   -- notifikasi partner "sudah tayang" terkirim
alter table if exists public.cai_news add column if not exists push_at timestamptz;   -- notifikasi News terkirim
alter table public.cway_push_subs add column if not exists acad boolean default false;   -- notifikasi materi Academy baru
create table if not exists public.academy_push (no int primary key, sent_at timestamptz default now());   -- materi Academy yang sudah dikirimi notifikasi
alter table public.academy_push enable row level security;
alter table public.cway_push_subs add column if not exists guide boolean default false;   -- notifikasi Panduan Partner baru (khusus partner login)

-- Panduan Partner terjadwal (4 Nov 2026): PDF disimpan dulu di folder tunggu guides/pending/ (hanya Editor yang bisa membaca),
-- lalu dipindah Edge Function cway-push ke folder kartunya pada jam tayang.
create table if not exists public.guide_schedule (
  id uuid primary key default gen_random_uuid(),
  folder text not null,
  src text not null,            -- pending/<folder>/<file>.pdf
  dest text not null,           -- <folder>/<file>.pdf
  title text,
  publish_at timestamptz not null,
  done_at timestamptz,
  error text,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.guide_schedule enable row level security;
drop policy if exists "guide schedule editor" on public.guide_schedule;
create policy "guide schedule editor" on public.guide_schedule for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- Storage bucket guides: aturan PEMBATAS (restrictive) — ditambahkan di atas izin yang sudah ada, tidak menggantinya.
-- 1) Folder tunggu pending/ hanya bisa dibaca Editor.  2) PDF panduan hanya bisa ditulis/dihapus Editor
--    (folder gathering/ (PKS, flier, lagu) & thumbs/ (sampul) tetap mengikuti izin lama Admin/Editor).
drop policy if exists "guides pending editor only" on storage.objects;
create policy "guides pending editor only" on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'guides' or name not like 'pending/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides insert editor only" on storage.objects;
create policy "guides insert editor only" on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides update editor only" on storage.objects;
create policy "guides update editor only" on storage.objects as restrictive for update to authenticated
  using (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "guides delete editor only" on storage.objects;
create policy "guides delete editor only" on storage.objects as restrictive for delete to authenticated
  using (bucket_id <> 'guides' or name like 'gathering/%' or name like 'thumbs/%' or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
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
