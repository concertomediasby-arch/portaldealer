-- 📅 Kalender Acara CAI (4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Acara: kompetisi · gathering · workshop/training · launching · acara partner. Publik membaca acara yang tayang & `public`;
-- partner yang login juga membaca acara 🔒 khusus partner (public = false); Editor membaca & menulis semua (termasuk draf).
create table if not exists public.cai_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'kompetisi',   -- kompetisi | gathering | workshop | launching | partner
  start_at timestamptz not null,
  end_at timestamptz,
  online boolean not null default false,
  city text,
  venue text,
  map_url text,
  partners text[] not null default '{}',    -- nama Authorized Partner terkait
  poster text,                               -- path Storage publik showcase/events/…
  body text,
  link_url text,
  link_label text,
  hof_event text,                            -- nama event di HALL_OF_FAME (arsip kompetisi → hasil di Hall of Fame)
  public boolean not null default true,      -- false = 🔒 khusus partner yang login
  published boolean not null default true,   -- false = draf (hanya Editor)
  notify boolean not null default true,      -- kirim notifikasi "Acara baru" saat pertama tayang
  push_at timestamptz,                       -- notifikasi "Acara baru" sudah dikirim
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists cai_events_start on public.cai_events (start_at);
alter table public.cai_events enable row level security;
drop policy if exists "events read public" on public.cai_events;
create policy "events read public" on public.cai_events for select to anon using (published and public);
drop policy if exists "events read login" on public.cai_events;
create policy "events read login" on public.cai_events for select to authenticated
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "events write" on public.cai_events;
create policy "events write" on public.cai_events for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select on public.cai_events to anon;
grant select, insert, update, delete on public.cai_events to authenticated;

-- 🔔 "Ingatkan saya": per HP (endpoint langganan notifikasi), hanya lewat Edge Function cway-push (RLS tanpa policy)
create table if not exists public.event_watch (
  endpoint text not null,
  event_id uuid not null references public.cai_events (id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,                       -- pengingat H-1 sudah dikirim
  primary key (endpoint, event_id)
);
alter table public.event_watch enable row level security;

-- 📅 pilihan notifikasi "Acara & kompetisi baru" (bawaan aktif, juga untuk HP yang sudah berlangganan)
alter table public.cway_push_subs add column if not exists event boolean not null default true;
