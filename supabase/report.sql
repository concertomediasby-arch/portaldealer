-- 📊 Rapor Bulanan Editor (4 Nov 2026; + kotak 📍 kanal 6 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Butuh tabel dari SQL sebelumnya: site_visits (Pengunjung Portal), site_app_events (Pemasangan CAI Hub),
-- site_interest (Minat Pengunjung), cway_push_subs (Notifikasi). Tanpa data pribadi.

-- 1) Catat HP yang mulai / berhenti berlangganan notifikasi (dihitung per hari, tanpa endpoint)
create table if not exists public.push_sub_log (
  day date not null,
  kind text not null,   -- on = mulai berlangganan · off = berhenti / langganan kedaluwarsa
  n int not null default 0,
  primary key (day, kind)
);
alter table public.push_sub_log enable row level security;
create or replace function public.push_sub_log_mark() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into push_sub_log (day, kind, n) values ((now() at time zone 'Asia/Jakarta')::date, case when tg_op = 'INSERT' then 'on' else 'off' end, 1)
  on conflict (day, kind) do update set n = push_sub_log.n + 1;
  return null;
end $$;
drop trigger if exists push_sub_log_mark on public.cway_push_subs;
create trigger push_sub_log_mark after insert or delete on public.cway_push_subs for each row execute function public.push_sub_log_mark();

-- 2) Minat Pengunjung: + kind 'open' (News / Galeri / Academy / Concerto Way / Acara dibuka; 1× per orang per hari)
--    (definisi sama dengan supabase/interest.sql — bila diubah, samakan kedua file & konstanta INT_SQL / REPORT_SQL)
create or replace function public.log_interest(p_vid text, p_kind text, p_ref text, p_src text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r text := left(btrim(coalesce(p_ref, '')), 120); s text := left(coalesce(p_src, ''), 20);
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 or r = '' then return; end if;
  if p_kind not in ('view', 'wa', 'maps', 'ig', 'city', 'search', 'fav', 'cmp', 'rk', 'share', 'car', 'carq', 'finder', 'fdgo', 'open') then return; end if;
  if p_kind in ('search', 'carq') then r := lower(r); end if;
  insert into site_interest (day, vid, kind, ref, src) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, r, s)
  on conflict (day, vid, kind, ref, src) do update set n = least(site_interest.n + 1, 50)
    where site_interest.kind not in ('view', 'car', 'finder', 'open');   -- dibuka: 1× per orang per hari
end $$;
grant execute on function public.log_interest(text, text, text, text) to anon, authenticated;

-- 3) Notifikasi rapor: sekali per bulan (diisi Edge Function cway-push tiap tanggal 1 pagi)
create table if not exists public.monthly_push (
  month date primary key,   -- tanggal 1 bulan yang dilaporkan
  sent_at timestamptz not null default now(),
  counts jsonb
);
alter table public.monthly_push enable row level security;

-- 4) Angka rapor untuk rentang tanggal WIB [p_from, p_to] + pembanding: rentang yang sama di bulan sebelumnya
create or replace function public.monthly_report(p_from date, p_to date)
returns json language plpgsql security definer set search_path = public as $$
declare a date := p_from; b date := least(p_to, p_from + 31);
  pa date := (p_from - interval '1 month')::date; pb date := least((b - interval '1 month')::date, p_from - 1);
  g text := coalesce(auth.jwt() ->> 'role', ''); ch json;
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' and g <> 'service_role' then raise exception 'not allowed'; end if;   -- khusus Editor
  -- 📍 kanal kunjungan (supabase/channels.sql, 6 Nov 2026) — null bila SQL kanal belum dijalankan
  begin execute 'select public.channel_stats($1, $2, $3, $4)' into ch using a, b, pa, pb;
  exception when undefined_function or undefined_table then ch := null; end;
  return json_build_object(
    'channels', ch,
    'from', a, 'to', b, 'pfrom', pa, 'pto', pb,
    'first_day', (select min(day) from site_visits),
    'vis', (select json_build_object(
        'people', count(distinct vid) filter (where day between a and b), 'people0', count(distinct vid) filter (where day between pa and pb),
        'visits', coalesce(sum(visits) filter (where day between a and b), 0), 'visits0', coalesce(sum(visits) filter (where day between pa and pb), 0),
        'logged', count(distinct vid) filter (where logged and day between a and b), 'logged0', count(distinct vid) filter (where logged and day between pa and pb))
      from site_visits where day between pa and b),
    'daily', (select coalesce(json_agg(t order by t.day), '[]') from (
        select day, count(*) n, count(*) filter (where logged) l from site_visits where day between a and b group by day) t),
    'app', (select json_build_object(
        'install', count(distinct vid) filter (where kind = 'install' and day between a and b), 'install0', count(distinct vid) filter (where kind = 'install' and day between pa and pb),
        'qr', count(distinct vid) filter (where kind = 'qr' and day between a and b),
        'standalone', count(distinct vid) filter (where kind = 'standalone' and day between a and b))
      from site_app_events where day between pa and b),
    'push', json_build_object(
        'now', (select count(*) from cway_push_subs),
        'on', (select coalesce(sum(n), 0) from push_sub_log where kind = 'on' and day between a and b),
        'off', (select coalesce(sum(n), 0) from push_sub_log where kind = 'off' and day between a and b),
        'logged', exists (select 1 from push_sub_log)),
    'views', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between a and b group by ref order by 2 desc, 1 limit 10) t),
    'views0', (select coalesce(json_agg(t.ref order by t.n desc, t.ref), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'view' and day between pa and pb group by ref order by 2 desc, 1 limit 50) t),
    'click', (select json_build_object(
        'wa', coalesce(sum(n) filter (where kind = 'wa' and day between a and b), 0), 'maps', coalesce(sum(n) filter (where kind = 'maps' and day between a and b), 0),
        'ig', coalesce(sum(n) filter (where kind = 'ig' and day between a and b), 0), 'total0', coalesce(sum(n) filter (where day between pa and pb), 0))
      from site_interest where kind in ('wa', 'maps', 'ig') and day between pa and b),
    'partners', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind in ('wa', 'maps', 'ig') and day between a and b group by ref order by 2 desc, 1 limit 5) t),
    'psrc', (select coalesce(json_agg(t), '[]') from (
        select src, sum(n) n from site_interest where kind in ('wa', 'maps', 'ig') and day between a and b group by src order by 2 desc) t),
    'miss', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'search' and src = 'miss' and day between a and b group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 6) t),
    'cars', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'car' and day between a and b group by ref order by 2 desc, 1 limit 5) t),
    'car_miss', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'carq' and src = 'miss' and length(ref) >= 3 and day between a and b group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 3) t),
    'finder', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'finder' and day between a and b group by ref order by 2 desc, 1 limit 60) t),
    'opens', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'open' and day between a and b group by ref order by 2 desc, 1 limit 8) t),
    'content', json_build_object(
        'news', (select count(*) from cai_news where published and post_date between a and b),
        'cway', (select count(*) from concerto_way where published and coalesce((publish_at at time zone 'Asia/Jakarta')::date, post_date) between a and b and (publish_at is null or publish_at <= now())),
        'cway_days', (select json_build_array(min(day), max(day)) from concerto_way where published and coalesce((publish_at at time zone 'Asia/Jakarta')::date, post_date) between a and b and (publish_at is null or publish_at <= now())),
        'gallery', (select count(*) from showcase_installs where published and (coalesce(publish_at, created_at) at time zone 'Asia/Jakarta')::date between a and b and coalesce(publish_at, created_at) <= now()),
        'events', (select count(*) from cai_events where published and (created_at at time zone 'Asia/Jakarta')::date between a and b),
        'guides', (select count(*) from storage.objects where bucket_id = 'guides' and name ~* '^[^/]+/[^/]+\.pdf$'
                    and name !~ '^(pending|thumbs|gathering)/' and (coalesce(updated_at, created_at) at time zone 'Asia/Jakarta')::date between a and b)));
end $$;
revoke all on function public.monthly_report(date, date) from public, anon;
grant execute on function public.monthly_report(date, date) to authenticated, service_role;
