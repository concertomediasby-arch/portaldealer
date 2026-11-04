-- Laporan Minat Pengunjung (Tahap 4, 4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Tahap 9 (4 Nov 2026): + car (halaman mobil dibuka) · carq (kotak Cari per Mobil, hit/miss) · finder (jawaban Temukan Sistem) · fdgo (hasil Temukan Sistem dibuka di Simulator / dikirim ke partner / dibagikan).
-- Tanpa data pribadi: vid = ID acak per browser (sama dengan Pengunjung Portal). Akun Admin/Editor tidak mencatat.
create table if not exists public.site_interest (
  day date not null,
  vid text not null,
  kind text not null,   -- view (produk dibuka) | wa | maps | ig (klik partner) | city (kota/provinsi dicari) | search | fav | cmp | rk | share | car | carq | finder | fdgo
  ref text not null,    -- id produk / nama partner / kota / kata dicari / pasangan id dibandingkan / cmp|rk (share)
  src text not null default '',   -- sumber klik partner (produk, partner, cek, hof, galeri, google, lain) · hit|miss (search)
  n int not null default 1,
  primary key (day, vid, kind, ref, src)
);
create index if not exists site_interest_kind_day on public.site_interest (kind, day);
alter table public.site_interest enable row level security;

create or replace function public.log_interest(p_vid text, p_kind text, p_ref text, p_src text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r text := left(btrim(coalesce(p_ref, '')), 120); s text := left(coalesce(p_src, ''), 20);
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 or r = '' then return; end if;
  if p_kind not in ('view', 'wa', 'maps', 'ig', 'city', 'search', 'fav', 'cmp', 'rk', 'share', 'car', 'carq', 'finder', 'fdgo') then return; end if;
  if p_kind in ('search', 'carq') then r := lower(r); end if;
  insert into site_interest (day, vid, kind, ref, src) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, r, s)
  on conflict (day, vid, kind, ref, src) do update set n = least(site_interest.n + 1, 50)
    where site_interest.kind not in ('view', 'car', 'finder');   -- lihat produk: 1× per orang per hari
end $$;
grant execute on function public.log_interest(text, text, text, text) to anon, authenticated;

create or replace function public.interest_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; nd int := least(greatest(coalesce(p_days, 30), 1), 366);
  a date := today - nd; b date := today - 2 * nd;   -- periode ini: day > a · periode sebelumnya: b < day <= a
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' then raise exception 'not allowed'; end if;   -- khusus Editor
  return json_build_object(
    'days', nd,
    'first_day', (select min(day) from site_interest),
    'tot', (select json_build_object(
        'view', count(*) filter (where kind = 'view' and day > a), 'view0', count(*) filter (where kind = 'view' and day <= a),
        'click', coalesce(sum(n) filter (where kind in ('wa','maps','ig') and day > a), 0), 'click0', coalesce(sum(n) filter (where kind in ('wa','maps','ig') and day <= a), 0),
        'search', coalesce(sum(n) filter (where kind = 'search' and day > a), 0), 'search0', coalesce(sum(n) filter (where kind = 'search' and day <= a), 0),
        'share', coalesce(sum(n) filter (where kind = 'share' and day > a), 0), 'share0', coalesce(sum(n) filter (where kind = 'share' and day <= a), 0),
        'people', count(distinct vid) filter (where day > a))
      from site_interest where day > b),
    'views', (select coalesce(json_agg(t), '[]') from (
        select ref, count(*) filter (where day > a) n, count(*) filter (where day <= a) n0
        from site_interest where kind = 'view' and day > b group by ref having count(*) filter (where day > a) > 0
        order by 2 desc, 1 limit 15) t),
    'partners', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) filter (where kind = 'wa') wa, sum(n) filter (where kind = 'maps') maps, sum(n) filter (where kind = 'ig') ig, sum(n) total
        from site_interest where kind in ('wa','maps','ig') and day > a group by ref order by total desc, ref limit 20) t),
    'psrc', (select coalesce(json_agg(t), '[]') from (
        select src, sum(n) n from site_interest where kind in ('wa','maps','ig') and day > a group by src order by 2 desc) t),
    'cities', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'city' and day > a group by ref order by 2 desc, 1 limit 15) t),
    'search_hit', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'search' and src = 'hit' and day > a group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 20) t),
    'search_miss', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'search' and src = 'miss' and day > a group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 20) t),
    'fav', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'fav' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'cmp', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'cmp' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'rk', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'rk' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'share', (select coalesce(json_object_agg(ref, n), '{}') from (
        select ref, sum(n) n from site_interest where kind = 'share' and day > a group by ref) t),
    'cars', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'car' and day > a group by ref order by 2 desc, 1 limit 10) t),
    'car_miss', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'carq' and src = 'miss' and day > a and length(ref) >= 3 group by ref order by 2 desc, 1 limit 12) t),
    'finder', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'finder' and day > a group by ref order by 2 desc, 1 limit 60) t),
    'fdgo', (select coalesce(json_object_agg(ref, n), '{}') from (
        select ref, sum(n) n from site_interest where kind = 'fdgo' and day > a group by ref) t));
end $$;
grant execute on function public.interest_stats(int) to authenticated;
