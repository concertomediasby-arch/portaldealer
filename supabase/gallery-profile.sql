-- Galeri Instalasi: mobil "profil saja" (5 Nov 2026)
-- Tampil di Profil Partner & Contoh pemasangan produk, tidak di menu Galeri Instalasi.
-- Aman dijalankan ulang. Sama dengan konstanta GL_PROFILE_SQL di js/showcase.js.
alter table public.showcase_installs add column if not exists in_gallery boolean not null default true;
