-- CAI Hub News: project & partner pemasang (5 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run
-- Sama dengan konstanta NEWS_PROJ_SQL di js/news.js.
alter table public.cai_news add column if not exists projects jsonb not null default '[]'::jsonb;
