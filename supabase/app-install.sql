-- Pengukuran pemasangan CAI Hub (ajakan "Pasang CAI Hub", 4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.site_app_events (
  day date not null,
  vid text not null,
  kind text not null,          -- standalone (dibuka dari ikon) | install (baru dipasang) | shown (ajakan tampil) | dismiss (ajakan ditutup) | qr (datang dari kartu QR toko partner, ?src=kartu)
  plat text,                   -- android | ios | other
  n int not null default 1,
  primary key (day, vid, kind)
);
alter table public.site_app_events enable row level security;

create or replace function public.log_app_event(p_vid text, p_kind text, p_plat text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then return; end if;
  if p_kind not in ('standalone', 'install', 'shown', 'dismiss', 'qr') then return; end if;
  insert into site_app_events (day, vid, kind, plat)
  values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, left(coalesce(p_plat, 'other'), 10))
  on conflict (day, vid, kind) do update set n = site_app_events.n + 1;
end $$;
grant execute on function public.log_app_event(text, text, text) to anon, authenticated;

create or replace function public.app_event_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; nd int := least(greatest(coalesce(p_days, 30), 1), 366);
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('admin', 'editor') then raise exception 'not allowed'; end if;
  return json_build_object(
    'standalone', (select count(distinct vid) from site_app_events where kind = 'standalone' and day > today - nd),
    'install', (select count(distinct vid) from site_app_events where kind = 'install' and day > today - nd),
    'install_android', (select count(distinct vid) from site_app_events where kind = 'install' and plat = 'android' and day > today - nd),
    'install_ios', (select count(distinct vid) from site_app_events where kind = 'install' and plat = 'ios' and day > today - nd),
    'shown', (select count(distinct vid) from site_app_events where kind = 'shown' and day > today - nd),
    'dismiss', (select count(distinct vid) from site_app_events where kind = 'dismiss' and day > today - nd),
    'visitors', (select count(distinct vid) from site_visits where day > today - nd),
    'qr', (select count(distinct vid) from site_app_events where kind = 'qr' and day > today - nd),
    'qr_install', (select count(distinct e.vid) from site_app_events e where e.kind = 'install' and e.day > today - nd
                    and exists (select 1 from site_app_events q where q.vid = e.vid and q.kind = 'qr')),
    'total_install', (select count(distinct vid) from site_app_events where kind = 'install'));
end $$;
grant execute on function public.app_event_stats(int) to authenticated;
