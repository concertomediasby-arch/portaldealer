-- 📨 Laporan Partner bulanan (5 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Butuh tabel site_interest (SQL Minat Pengunjung). Khusus Editor. Tanpa data pribadi.

-- 1) Tanda "kartu sudah dikirim" per partner per bulan
create table if not exists public.partner_report_sent (
  month date not null,          -- tanggal 1 bulan yang dilaporkan
  partner text not null,        -- nama partner (sama dengan ref di site_interest)
  sent_at timestamptz not null default now(),
  primary key (month, partner)
);
alter table public.partner_report_sent enable row level security;
drop policy if exists "partner report editor" on public.partner_report_sent;
create policy "partner report editor" on public.partner_report_sent for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor') with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select, insert, update, delete on public.partner_report_sent to authenticated;

-- 2) Angka per partner untuk rentang tanggal WIB [p_from, p_to] + pembanding: rentang yang sama bulan sebelumnya
create or replace function public.partner_report(p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
declare a date := p_from; b date := least(p_to, p_from + 31);
  pa date := (p_from - interval '1 month')::date; pb date := least((b - interval '1 month')::date, p_from - 1);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' then raise exception 'not allowed'; end if;   -- khusus Editor
  return json_build_object(
    'from', a, 'to', b, 'pfrom', pa, 'pto', pb,
    'partners', (select coalesce(json_agg(t order by t.people desc, t.ref), '[]') from (
        select ref,
          count(distinct vid) filter (where day between a and b) people,
          count(distinct vid) filter (where day between pa and pb) people0,
          coalesce(sum(n) filter (where kind = 'wa' and day between a and b), 0) wa,
          coalesce(sum(n) filter (where kind = 'maps' and day between a and b), 0) maps,
          coalesce(sum(n) filter (where kind = 'ig' and day between a and b), 0) ig,
          (select coalesce(json_object_agg(s.src, s.n), '{}') from (
             select coalesce(nullif(src, ''), 'lain') src, sum(n) n from site_interest x
             where x.kind in ('wa', 'maps', 'ig') and x.ref = i.ref and x.day between a and b group by 1) s) src
        from site_interest i where kind in ('wa', 'maps', 'ig') and day between pa and b group by ref) t),
    'top', (select coalesce(json_agg(t.ref order by t.n desc, t.ref), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between a and b group by ref order by 2 desc, 1 limit 3) t),
    'sent', (select coalesce(json_object_agg(partner, sent_at), '{}') from partner_report_sent where month = a));
end $$;
revoke all on function public.partner_report(date, date) from public, anon;
grant execute on function public.partner_report(date, date) to authenticated;
