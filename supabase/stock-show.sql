-- CAI Hub — izin tampil "Produk Lain (di luar katalog)" (7 Nov 2026, permintaan pemilik).
-- Baris stok x:<KODE> (kode gudang yang belum ada di katalog) hanya terlihat di panel Admin;
-- partner baru melihatnya di menu Stok setelah Editor menekan "Tampilkan di katalog" (show = true).
-- Sinkron sheet / Import tidak mengirim kolom ini, jadi pilihan Editor tetap tersimpan. Aman dijalankan ulang.
-- Sama dengan konstanta STOCK_SHOW_SQL di js/stock.js.
alter table public.stock add column if not exists show boolean not null default false;
