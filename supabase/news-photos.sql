-- CAI Hub News: foto tambahan (6 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run
alter table public.cai_news add column if not exists photos jsonb not null default '[]'::jsonb;
