-- 🏪 Logo toko partner (Enthusiast Partner) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Kolom `logo` = path file di Storage publik showcase/partners/<waktu>-<acak>.webp
-- (boleh berakhiran posisi "#x,y,z" seperti sampul News). Kosong = tampil inisial nama seperti sekarang.
-- Izin baca: ikut policy tabel yang sudah ada ("auth dealers read" — publik untuk partner yang tidak disembunyikan).
-- Izin tulis & unggah file: ikut policy yang sudah ada ("auth dealers write" untuk tabel, "showcase upload/update/delete" untuk Storage).
alter table public.auth_dealers add column if not exists logo text;
notify pgrst, 'reload schema';
