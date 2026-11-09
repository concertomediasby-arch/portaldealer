-- ═══════════════════════════════════════════════════════════════════════════
-- Peran "Ricky" (app_metadata.role = 'manager') — 9 Nov 2026, permintaan pemilik
-- Akun atasan: masuk dengan Kode Akses (form partner). Boleh: tulis/ubah/hapus News,
-- lihat Pengunjung Portal (+ Minat Pengunjung), Laporan Partner & Rapor Bulanan.
-- Aman dijalankan ulang. Tidak mengubah izin Editor / Admin / partner.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Fungsi laporan: izinkan peran manager (definisi yang sedang dipakai ditambal di tempat)
do $$
declare r record; d text; d2 text;
begin
  for r in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('monthly_report', 'channel_stats', 'partner_report', 'interest_stats', 'site_visit_stats', 'app_event_stats')
  loop
    d := pg_get_functiondef(r.oid);
    d2 := replace(d, '->> ''role'', '''') <> ''editor''', '->> ''role'', '''') not in (''editor'', ''manager'')');
    d2 := replace(d2, '->> ''role'', '''') not in (''admin'', ''editor'')', '->> ''role'', '''') not in (''admin'', ''editor'', ''manager'')');
    if d2 <> d then execute d2; end if;
  end loop;
end $$;

-- 2) News: baca draf + tulis/ubah/hapus
drop policy if exists "news manager" on public.cai_news;
create policy "news manager" on public.cai_news for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');

-- 3) Gambar News (Storage publik showcase, folder news/)
drop policy if exists "showcase manager news read" on storage.objects;
create policy "showcase manager news read" on storage.objects for select to authenticated
  using (bucket_id = 'showcase' and name like 'news/%' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');
drop policy if exists "showcase manager news insert" on storage.objects;
create policy "showcase manager news insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'showcase' and name like 'news/%' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');
drop policy if exists "showcase manager news update" on storage.objects;
create policy "showcase manager news update" on storage.objects for update to authenticated
  using (bucket_id = 'showcase' and name like 'news/%' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');
drop policy if exists "showcase manager news delete" on storage.objects;
create policy "showcase manager news delete" on storage.objects for delete to authenticated
  using (bucket_id = 'showcase' and name like 'news/%' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');

-- 4) Laporan Partner: tanda "✓ Dikirim"
drop policy if exists "partner report manager" on public.partner_report_sent;
create policy "partner report manager" on public.partner_report_sent for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager');

-- 5) Rapor Bulanan: kotak Google Search (baca saja; mengisi angka tetap khusus Editor)
do $$ begin
  if to_regclass('public.gsc_monthly') is not null then
    execute 'drop policy if exists "gsc manager read" on public.gsc_monthly';
    execute $p$create policy "gsc manager read" on public.gsc_monthly for select to authenticated
      using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'manager')$p$;
  end if;
end $$;

-- 6) Notifikasi HP 📊 Rapor Bulanan untuk akun Ricky (juga ada di supabase/cway-push.sql)
alter table public.cway_push_subs add column if not exists rapor boolean not null default false;

-- 7) Akun: buat dulu di Authentication → Users → Add user
--    email concertosoerabaya@gmail.com · password = kode akses HURUF BESAR · Auto Confirm User. Lalu:
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"manager"}'::jsonb
where email = 'concertosoerabaya@gmail.com';
