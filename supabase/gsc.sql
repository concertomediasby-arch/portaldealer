-- 🔎 Google Search di Rapor Bulanan (Branding CAI Hub no. 8 C) — SQL sekali jalan, aman dijalankan ulang.
-- Editor mengetik angka dari Google Search Console tiap bulan; khusus Editor (baca & tulis).
create table if not exists public.gsc_monthly (
  month text primary key check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  clicks integer not null default 0 check (clicks >= 0),
  impressions integer not null default 0 check (impressions >= 0),
  position numeric(5,1) check (position is null or position > 0),
  queries jsonb not null default '[]'::jsonb check (jsonb_typeof(queries) = 'array'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.gsc_monthly enable row level security;
drop policy if exists "gsc editor" on public.gsc_monthly;
create policy "gsc editor" on public.gsc_monthly for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
revoke all on public.gsc_monthly from anon;
grant select, insert, update, delete on public.gsc_monthly to authenticated;
