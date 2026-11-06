-- CAI Hub: pemicu bot kartu WA (6 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (juga ada di cway-push.sql)
-- 🃏 Pemicu bot kartu WA (6 Nov 2026): sidik data publik terakhir yang sudah dikirim ke GitHub. RLS tanpa policy = hanya fungsi.
create table if not exists public.card_dispatch (id int primary key default 1 check (id = 1), sig text, sent_at timestamptz);
alter table public.card_dispatch enable row level security;
