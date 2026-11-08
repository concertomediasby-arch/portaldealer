-- ❤ Suka & 💬 Komentar Galeri Instalasi (6 Nov 2026, permintaan pemilik) — jalankan sekali di Supabase → SQL Editor → Run.
-- Semua pengunjung (tanpa login) boleh menyukai & berkomentar; komentar langsung tampil (tanpa persetujuan).
-- Tabel tanpa policy RLS = hanya bisa diakses lewat fungsi di bawah (SECURITY DEFINER). Aman dijalankan ulang.

create table if not exists public.gl_likes (
  install_id uuid not null references public.showcase_installs(id) on delete cascade,
  vid text not null,
  created_at timestamptz not null default now(),
  primary key (install_id, vid)
);
alter table public.gl_likes enable row level security;

create table if not exists public.gl_comments (
  id uuid primary key default gen_random_uuid(),
  install_id uuid not null references public.showcase_installs(id) on delete cascade,
  name text not null,
  body text not null,
  badge text,                    -- null = pengunjung, 'partner' = partner login, 'cai' = Tim CAI (Admin/Editor)
  vid text,
  created_at timestamptz not null default now(),
  notified_at timestamptz        -- notifikasi HP Editor sudah dikirim (Edge Function cway-push)
);
create index if not exists gl_comments_install on public.gl_comments (install_id, created_at desc);
create index if not exists gl_comments_vid on public.gl_comments (vid, created_at desc);
alter table public.gl_comments enable row level security;

create or replace function public.gl_visible(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from showcase_installs where id = p and published and (publish_at is null or publish_at <= now()));
$$;
revoke all on function public.gl_visible(uuid) from public, anon, authenticated;

-- Hitungan untuk kartu & jendela detail: suka, komentar, dan apakah browser ini sudah menyukai
create or replace function public.gl_social(p_ids uuid[], p_vid text)
returns table (id uuid, likes int, comments int, liked boolean)
language sql stable security definer set search_path = public as $$
  select i,
    (select count(*)::int from gl_likes l where l.install_id = i),
    (select count(*)::int from gl_comments c where c.install_id = i),
    coalesce(p_vid <> '' and exists (select 1 from gl_likes l where l.install_id = i and l.vid = p_vid), false)
  from unnest(p_ids[1:400]) as i;
$$;

-- Suka / batal suka (sekali per browser)
create or replace function public.gl_like(p_id uuid, p_vid text, p_on boolean)
returns int language plpgsql security definer set search_path = public as $$
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then raise exception 'gl:vid'; end if;
  if not gl_visible(p_id) then raise exception 'gl:gone'; end if;
  if p_on then insert into gl_likes (install_id, vid) values (p_id, p_vid) on conflict do nothing;
  else delete from gl_likes where install_id = p_id and vid = p_vid; end if;
  return (select count(*)::int from gl_likes where install_id = p_id);
end $$;

-- Daftar komentar (terbaru dulu)
create or replace function public.gl_comment_list(p_id uuid)
returns table (id uuid, name text, body text, badge text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.body, c.badge, c.created_at from gl_comments c
  where c.install_id = p_id and (gl_visible(p_id) or coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'editor')
  order by c.created_at desc limit 200;
$$;

-- Kirim komentar — pengaman otomatis: panjang, link, nomor HP/WA, kata kasar, maks. 3 per browser per jam,
-- nama partner resmi / Concerto / CAI hanya untuk yang login. Kesalahan dikirim sebagai 'gl:<kode>'.
create or replace function public.gl_comment_add(p_id uuid, p_vid text, p_name text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  nm text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
  bd text := regexp_replace(btrim(coalesce(p_body, '')), '[ \t]+', ' ', 'g');
  role text := coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
  bdg text := case when auth.uid() is null then null when role in ('admin', 'editor') then 'cai' else 'partner' end;
  nk text; all_txt text; nid uuid;
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 then raise exception 'gl:vid'; end if;
  if not gl_visible(p_id) then raise exception 'gl:gone'; end if;
  bd := regexp_replace(bd, '\n{3,}', E'\n\n', 'g');
  if length(nm) < 2 or length(nm) > 40 then raise exception 'gl:name'; end if;
  if length(bd) < 2 or length(bd) > 300 then raise exception 'gl:len'; end if;
  all_txt := lower(nm || ' ' || bd);
  if all_txt ~ '(https?://|www\.|wa\.me|bit\.ly|t\.me/|\m[a-z0-9-]+\.(com|id|net|org|co|xyz|me|io|info|biz|shop|store|link|ly|site|online|my)\M)' then raise exception 'gl:link'; end if;
  if regexp_replace(all_txt, '[\s\.\-\(\)\+/]', '', 'g') ~ '\d{9,}' then raise exception 'gl:phone'; end if;
  if all_txt ~ '\m(anjing|anjir|anjg|bangsat|babi|kontol|memek|ngentot|ngentod|entot|goblok|goblog|tolol|bajingan|keparat|jancok|jancuk|cuk|jembut|kampret|asu|tai|tahi|bego|idiot|pepek|peler|lonte|fuck|fucking|shit|bitch|bastard)\M' then raise exception 'gl:rude'; end if;
  if bdg is null then
    nk := regexp_replace(lower(nm), '[^a-z0-9]', '', 'g');
    if nk ~ '(concerto|caihub|^cai$|^admin|^editor)' then raise exception 'gl:reserved'; end if;
    if exists (select 1 from auth_dealers d where regexp_replace(lower(d.name), '[^a-z0-9]', '', 'g') = nk) then raise exception 'gl:partner'; end if;
    if (select count(*) from gl_comments where vid = p_vid and created_at > now() - interval '1 hour') >= 3 then raise exception 'gl:rate'; end if;
  end if;
  insert into gl_comments (install_id, name, body, badge, vid) values (p_id, nm, bd, bdg, p_vid) returning id into nid;
  return nid;
end $$;

-- Hapus komentar — khusus Editor
create or replace function public.gl_comment_del(p_cid uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' then raise exception 'gl:role'; end if;
  delete from gl_comments where id = p_cid;
  return found;
end $$;

revoke all on function public.gl_social(uuid[], text), public.gl_like(uuid, text, boolean), public.gl_comment_list(uuid),
  public.gl_comment_add(uuid, text, text, text), public.gl_comment_del(uuid) from public;
grant execute on function public.gl_social(uuid[], text), public.gl_like(uuid, text, boolean), public.gl_comment_list(uuid),
  public.gl_comment_add(uuid, text, text, text) to anon, authenticated;
revoke execute on function public.gl_comment_del(uuid) from public, anon;
grant execute on function public.gl_comment_del(uuid) to authenticated;
