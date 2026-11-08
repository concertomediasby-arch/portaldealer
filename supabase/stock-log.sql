-- CAI Hub — 🔔 Update terbaru di panel Admin (4 Nov 2026, permintaan pemilik): catatan perubahan stok (sebelum → sesudah).
-- Pemicu di tabel stock mencatat setiap perubahan status/qty dari mana pun (sinkron sheet di server, Import Excel, ketikan Admin/Editor).
-- Baris varian panjang kabel (v:...) & perubahan yang hanya mengubah catatan/OTW tidak dicatat. Catatan > 60 hari dihapus otomatis.
-- Baca: hanya Admin/Editor. Aman dijalankan ulang. Sama dengan konstanta STOCK_LOG_SQL di js/stock.js.
create table if not exists public.stock_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  product_id text not null,
  old_status text, new_status text,
  old_qty integer, new_qty integer,
  src text
);
create index if not exists stock_log_at on public.stock_log (at desc);
alter table public.stock_log enable row level security;
drop policy if exists "stock log staff read" on public.stock_log;
create policy "stock log staff read" on public.stock_log for select to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin', 'editor'));
grant select on public.stock_log to authenticated;

create or replace function public.stock_log_mark() returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  src text := case when who in ('admin', 'editor') then who else 'server' end;
begin
  if tg_op = 'DELETE' then
    if old.product_id not like 'v:%' then
      insert into stock_log (product_id, old_status, new_status, old_qty, new_qty, src) values (old.product_id, old.status, null, old.qty, null, src);
    end if;
    return old;
  end if;
  if new.product_id like 'v:%' then return new; end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.qty is not distinct from new.qty then return new; end if;
  insert into stock_log (product_id, old_status, new_status, old_qty, new_qty, src)
    values (new.product_id, case when tg_op = 'UPDATE' then old.status end, new.status, case when tg_op = 'UPDATE' then old.qty end, new.qty, src);
  if random() < 0.05 then delete from stock_log where at < now() - interval '60 days'; end if;
  return new;
end $$;
drop trigger if exists stock_log_mark on public.stock;
create trigger stock_log_mark after insert or update or delete on public.stock for each row execute function public.stock_log_mark();
revoke execute on function public.stock_log_mark() from public, anon, authenticated;   -- hanya dipakai sebagai trigger (8 Nov 2026, saran pemeriksa keamanan Supabase)
