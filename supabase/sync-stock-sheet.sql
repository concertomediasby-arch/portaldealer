-- Sinkron otomatis stok dari Google Sheet (Edge Function "sync-stock-sheet").
-- Jalankan di Supabase → SQL Editor SETELAH fungsi di-deploy & secrets diisi.
-- Ganti GANTI_DENGAN_SYNC_SECRET dengan nilai secret SYNC_SECRET yang sama (jangan commit nilai aslinya ke repo).

-- 1) Catatan hasil sinkron terakhir (tampil di panel admin)
create table if not exists public.stock_sync (
  id int primary key default 1 check (id = 1),
  ran_at timestamptz,
  ok boolean,
  message text,
  matched int,
  changed int,
  source text
);
alter table public.stock_sync enable row level security;
drop policy if exists "Staff read stock_sync" on public.stock_sync;
create policy "Staff read stock_sync" on public.stock_sync for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));

-- 2) Jadwal tiap 15 menit (ubah '*/15 * * * *' bila perlu, mis. '0 * * * *' = tiap jam)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('sync-stock-sheet') where exists (select 1 from cron.job where jobname = 'sync-stock-sheet');
select cron.schedule('sync-stock-sheet', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://cvffltbxsaiugccexmtf.supabase.co/functions/v1/sync-stock-sheet',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', 'GANTI_DENGAN_SYNC_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

-- Mematikan jadwal: select cron.unschedule('sync-stock-sheet');
