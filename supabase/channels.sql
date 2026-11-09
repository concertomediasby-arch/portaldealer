-- 📍 Kanal kunjungan — "Pengunjung datang dari mana" (Branding CAI Hub no. 7, 6 Nov 2026)
-- Jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang). Tanpa data pribadi.
-- Butuh tabel dari SQL sebelumnya: site_visits (Pengunjung Portal), site_app_events (Pemasangan CAI Hub).
-- Setelah ini, Rapor Bulanan menampilkan kotak "📍 Pengunjung datang dari" (monthly_report di supabase/report.sql
-- memanggil channel_stats bila ada — tidak perlu menjalankan ulang report.sql bila sudah versi 6 Nov 2026).

-- 1) Kanal per orang per hari (ig, tiktok, story, wa, event, kartu, stiker, google, fb, link, … a-z0-9- maks. 20)
create table if not exists public.site_channels (
  day date not null,
  vid text not null,                              -- ID acak per browser (cai-vid), sama dengan site_visits
  ch text not null,
  n int not null default 1,
  first_at timestamptz not null default now(),    -- dipakai untuk "kanal pertama" orang itu (Pasang di HP)
  primary key (day, vid, ch)
);
alter table public.site_channels enable row level security;
create index if not exists site_channels_vid on public.site_channels (vid, first_at);

create or replace function public.log_channel(p_vid text, p_ch text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_ch is null or p_ch !~ '^[a-z0-9][a-z0-9-]{0,19}$' then return; end if;
  insert into site_channels (day, vid, ch) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_ch)
  on conflict (day, vid, ch) do update set n = least(site_channels.n + 1, 50);
end $$;
grant execute on function public.log_channel(text, text) to anon, authenticated;

-- 2) Angka per kanal untuk rentang [p_from, p_to] + pembanding [p_pfrom, p_pto]
--    n = orang berbeda yang datang lewat kanal itu · inst = pasang di HP di rentang itu, dihitung ke kanal PERTAMA orang itu
--    direct = pengunjung tanpa kanal (ketik alamat, ikon HP, bookmark, referrer lain)
create or replace function public.channel_stats(p_from date, p_to date, p_pfrom date, p_pto date)
returns json language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('editor', 'manager') and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'not allowed'; end if;   -- khusus Editor
  with cur as (select distinct vid, ch from site_channels where day between p_from and p_to),
  prev as (select distinct vid, ch from site_channels where day between p_pfrom and p_pto),
  inst as (select e.vid, (select s.ch from site_channels s where s.vid = e.vid and s.day <= e.day order by s.first_at, s.ch limit 1) ch
           from (select vid, min(day) as day from site_app_events where kind = 'install' and day between p_from and p_to group by vid) e),
  chs as (select ch from cur union select ch from prev union select ch from inst where ch is not null)
  select json_build_object(
    'rows', coalesce((select json_agg(t order by t.n desc, t.ch) from (
        select c.ch, (select count(*) from cur where cur.ch = c.ch) n, (select count(*) from prev where prev.ch = c.ch) n0,
               (select count(*) from inst where inst.ch = c.ch) inst from chs c) t), '[]'),
    'direct', json_build_object(
        'n', (select count(distinct v.vid) from site_visits v where v.day between p_from and p_to and not exists (select 1 from cur where cur.vid = v.vid)),
        'n0', (select count(distinct v.vid) from site_visits v where v.day between p_pfrom and p_pto and not exists (select 1 from prev where prev.vid = v.vid)),
        'inst', (select count(*) from inst where ch is null)),
    'since', (select min(day) from site_channels)) into r;
  return r;
end $$;
revoke all on function public.channel_stats(date, date, date, date) from public, anon;
grant execute on function public.channel_stats(date, date, date, date) to authenticated, service_role;
