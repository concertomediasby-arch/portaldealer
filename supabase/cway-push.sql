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

-- ── 4 Nov 2026 (permintaan pemilik): 📦 Stok pantauan (partner) · 🚗 Galeri Instalasi baru · 🆕 Produk baru (publik)
--    + pengingat Editor 5 menit sebelum SEMUA konten terjadwal (Galeri, pengumuman produk, Academy, Panduan) ──
alter table public.cway_push_subs add column if not exists stock boolean default false;     -- 📦 produk pantauan HP ini sudah Ready
alter table public.cway_push_subs add column if not exists gallery boolean default false;   -- 🚗 Galeri Instalasi baru
alter table public.cway_push_subs add column if not exists product boolean default false;   -- 🆕 Produk baru (pengumuman Editor)

-- 📦 Daftar produk yang dipantau per HP (akun partner bersama → disimpan per HP, bukan per akun). Hanya lewat Edge Function.
create table if not exists public.stock_watch (
  endpoint text not null references public.cway_push_subs(endpoint) on delete cascade,
  product_id text not null,
  name text,
  created_at timestamptz default now(),
  primary key (endpoint, product_id)
);
alter table public.stock_watch enable row level security;
-- Antrian "baru Ready": diisi trigger tabel stok (sinkron Google Sheet, import, panel admin), dikirim jadwal cway-push tiap menit
create table if not exists public.stock_ready_q (product_id text primary key, at timestamptz default now());
alter table public.stock_ready_q enable row level security;
create or replace function public.stock_ready_mark() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if new.product_id not like 'v:%' and new.status = 'ready' and coalesce(new.qty, 1) > 0
     and (tg_op = 'INSERT' or old.status is distinct from 'ready' or coalesce(old.qty, 1) <= 0) then
    insert into public.stock_ready_q (product_id) values (new.product_id) on conflict (product_id) do update set at = now();
  end if;
  return new;
end $f$;
drop trigger if exists stock_ready_mark on public.stock;
create trigger stock_ready_mark after insert or update on public.stock for each row execute function public.stock_ready_mark();
revoke execute on function public.stock_ready_mark() from public, anon, authenticated;   -- hanya dipakai sebagai trigger (8 Nov 2026, saran pemeriksa keamanan Supabase)

-- 🚗 Galeri Instalasi: jadwal tayang + notifikasi. Sebelum publish_at, mobil dikunci (hanya Admin/Editor yang bisa membaca).
alter table public.showcase_installs add column if not exists publish_at timestamptz;
alter table public.showcase_installs add column if not exists notify boolean not null default true;
alter table public.showcase_installs add column if not exists push_at timestamptz;     -- notifikasi publik terkirim
alter table public.showcase_installs add column if not exists remind_at timestamptz;   -- pengingat Editor terkirim
drop policy if exists "showcase read" on public.showcase_installs;
create policy "showcase read" on public.showcase_installs for select
  using ((published and (publish_at is null or publish_at <= now())) or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));

-- 🆕 Pengumuman produk (Editor): kirim sekarang / terjadwal
create table if not exists public.product_push (
  id uuid primary key default gen_random_uuid(),
  product_id text not null,
  kind text,                    -- new | soon | avail
  title text not null,
  body text,
  image text,
  publish_at timestamptz not null default now(),
  sent_at timestamptz,
  remind_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid default auth.uid()
);
alter table public.product_push enable row level security;
drop policy if exists "product push editor" on public.product_push;
create policy "product push editor" on public.product_push for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');

-- ⏰ Pengingat Editor 5 menit sebelum tayang: Panduan & Academy
alter table public.guide_schedule add column if not exists remind_at timestamptz;
create table if not exists public.academy_remind (no int primary key, sent_at timestamptz default now());
alter table public.academy_remind enable row level security;

-- 🗓 Ringkasan mingguan (Tahap 6 C, 4 Nov 2026): Senin 08.00 WIB, satu notifikasi berisi semua yang baru 7 hari terakhir.
-- Bawaan aktif — termasuk HP yang sudah berlangganan (pilihan pemilik "a"); bisa dimatikan di menu Setting.
alter table public.cway_push_subs add column if not exists weekly boolean not null default true;
-- ⏰ Pengingat Editor: waktu dipilih per HP (4 Nov 2026) — { all: [60, 5], live: true, cway?: [...], gallery?: [...], acad?, guide?, product? }
alter table public.cway_push_subs add column if not exists remind jsonb;
create table if not exists public.staff_remind_log (kind text not null, ref text not null, lead int not null, at timestamptz not null default now(), primary key (kind, ref, lead));
alter table public.staff_remind_log enable row level security;   -- tanpa policy: hanya Edge Function

create table if not exists public.weekly_push (week date primary key, sent_at timestamptz default now(), counts jsonb);
alter table public.weekly_push enable row level security;

alter table public.cway_push_subs enable row level security;
drop policy if exists "cway push own" on public.cway_push_subs;
create policy "cway push own" on public.cway_push_subs for all to authenticated
  using (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check (user_id = auth.uid() and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));

-- Kunci VAPID dibuat otomatis oleh fungsi; RLS tanpa policy = hanya fungsi (service role) yang bisa membaca
create table if not exists public.cway_push_config (id int primary key default 1 check (id = 1), public_key text, private_key text);
alter table public.cway_push_config enable row level security;

-- 🃏 Pemicu bot kartu WA (6 Nov 2026): sidik data publik terakhir yang sudah dikirim ke GitHub. RLS tanpa policy = hanya fungsi.
create table if not exists public.card_dispatch (id int primary key default 1 check (id = 1), sig text, sent_at timestamptz);
alter table public.card_dispatch enable row level security;

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
