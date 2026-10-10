# Concerto Dealer Portal — Panduan Proyek (untuk Claude Code)

Portal informasi produk (katalog digital) untuk dealer & distributor **Concerto Audio Indonesia (CAI)**.
Menampilkan brand yang dinaungi beserta produk, spesifikasi, media, dan spec sheet PDF. **Tanpa harga.**

## Arsitektur

- **Satu file statis: `index.html`** — berisi seluruh HTML, CSS, JavaScript, dan data katalog dalam satu dokumen. Tidak ada build step, tidak ada server sendiri, tidak ada dependency npm. Satu-satunya data dinamis adalah **stok produk** di Supabase (lihat bagian *Sistem stok*).
- Dependency eksternal via CDN (dimuat saat runtime di browser):
  - Google Fonts: **Sora**, **Inter**, **JetBrains Mono**
  - **jsPDF** (cdnjs) — untuk generate spec sheet PDF per produk.
  - **supabase-js v2** (jsdelivr) — baca/tulis stok + realtime.
- Logo CAI di-embed sebagai **data URI base64** di dua konstanta JS: `LOGO_WHITE` (untuk latar gelap) dan `LOGO_NAVY` (untuk latar terang). Cari `const LOGO_WHITE` / `const LOGO_NAVY` di dalam `<script>`.

## Menjalankan

Buka `index.html` langsung di browser (double-click), atau jalankan server statis lokal:

```bash
python3 -m http.server 8000   # lalu buka http://localhost:8000
```

Tidak perlu instalasi apa pun.

## Model data (paling sering diedit)

Data katalog ada di array **`BRANDS`** di dalam `<script>` (cari `const BRANDS = [`). Strukturnya:

```
BRANDS = [
  {
    id, name, tagline, color, bg, text, abbr, desc,
    logo?,   // opsional: path logo brand (versi untuk latar gelap); jika kosong → nama brand sebagai teks
    lines: [
      { name: "<nama line/seri>", products: [
        { id, name, model, category, emoji, hasVideo, desc,
          specs: { "Key": "Value", ... },
          photo?            // opsional: URL/path foto asli; jika kosong → pakai placeholder emoji
          photos?           // opsional: beberapa foto [..]; foto pertama jadi foto utama, tiap foto dapat thumbnail sendiri
          video?            // opsional: path video MP4 (H.264); diputar di thumbnail "Video" (butuh hasVideo:true)
          videoPoster?      // opsional: gambar sampul video untuk thumbnail & sebelum diputar
        },
        ...
      ]}
    ]
  },
  ...
]
```

- **Kategori** yang dipakai untuk filter: `Speaker`, `Subwoofer`, `Amplifier`, `DSP`, `Tweeter`, `Midrange`, `Cable`, `Accessories`.
- `color` = warna identitas brand (hex), dipakai untuk aksen & header kartu brand.
- Jumlah brand/produk/line di dashboard dihitung otomatis dari `BRANDS` (helper `brandProducts`, `brandCategories`).

### Cara menambah / mengubah data
- **Tambah produk:** tambahkan objek produk ke `products` pada line yang sesuai.
- **Tambah line:** tambahkan objek `{ name, products: [...] }` ke `lines` sebuah brand.
- **Tambah brand:** tambahkan objek brand baru ke `BRANDS` (wajib `id` unik, `lines`).
- **Tambah foto asli:** isi field `photo` pada produk dengan URL/path gambar (mis. `"assets/og-pc65.jpg"`). Foto otomatis muncul di kartu, halaman detail, dan di-embed ke PDF. Jika `photo` kosong, dipakai ikon emoji placeholder.
- **Tambah video:** simpan MP4 di `assets/`, isi `video` (dan `videoPoster`), set `hasVideo:true`. Kompres dulu agar ringan, mis.:
  `ffmpeg -i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 24 -c:a aac -b:a 128k -movflags +faststart assets/<id>.mp4`
- **Logo brand:** simpan di `assets/brands/<id-brand>.webp` (latar transparan, ruang kosong dipangkas, versi **terang untuk latar gelap** — kartu brand & landing selalu gelap), isi field `logo`. Logo dipakai di strip brand landing, kartu dashboard, dan header halaman brand; ukurannya diseimbangkan otomatis oleh `fitLogo()`.
- **File media** disimpan di folder `assets/` dengan nama `<id-produk>.<ext>` (mis. `assets/ac-prow6c.jpg`).
- **JANGAN masukkan harga** — portal ini sengaja hanya referensi produk.

## Struktur UI & fungsi kunci (dalam `index.html` `<script>`)

- `init()` — inisialisasi: stats dashboard, sidebar brand, kartu brand, logo, visualizer landing.
- **Landing:** `initViz()` (canvas equalizer emas), `enterPortal()`, `backToLanding()`, `landingGo(target)` (link nav landing → `dashboard` / `catalog` / `products` / `brands`). Layout: nav (logo · link tengah · tombol Masuk Portal), headline "Know Your Products. Build With *Confidence.*", ring tipis + sparkle emas, strip brand berjalan.
- **Navigasi:** `showView(id)` — view: `dashboard`, `catalog`, `brand`, `product`.
- **Brand:** `showBrand(id)`, `renderProducts(brand, filter)` (dikelompokkan per line), `filterProducts()`.
- **Semua Brand / katalog:** `openCatalog()`, `renderCatalog()`, `setCatalogBrand()` — pencarian + filter brand.
- **Detail produk:** `showProduct(brandId, productId)`, `selectMedia()`.
- **Spec sheet PDF:** `openSpecSheet()` (modal pratinjau), `downloadPdf()` (jsPDF), `makePhotoPlaceholder()`.
- **Paket Audio:** array `PAKET_AUDIO` (PDF di `assets/paket/`), pratinjau via `openPdfPreview()` (di mobile dibuka di tab baru). PDF sumber boleh memuat harga, tapi teks kartu di portal tidak boleh.
- **Tema:** `toggleTheme()` (dark ⇄ light), `applyThemeIcon()`, `updateTopbarLogo()`. Preferensi disimpan di `localStorage` key `cai-theme`.

## Sistem stok (Supabase)

Katalog tetap di `BRANDS` (GitHub); Supabase **hanya** menyimpan status stok per produk. Kode di blok `STOCK SYSTEM` di akhir `<script>`.

- **Project:** `portaldealer-stock` — URL & publishable key ada di konstanta `SUPA_URL` / `SUPA_KEY`. Key ini memang publik (aman di repo); akses tulis dibatasi RLS.
- **Tabel `stock`:** `product_id` (text PK, = `id` produk di `BRANDS`), `status` (`ready` | `indent` | `habis`), `note` (text), `qty` (integer ≥ 0, nullable), `incoming` (text, mis. `100 set` — barang OTW/belum datang), `updated_at` (auto via trigger).
- **RLS:** publik hanya `SELECT`; tulis (`FOR ALL`) hanya user ter-autentikasi. Tabel sudah masuk publication `supabase_realtime`.
- **Admin:** tombol gembok 🔒 di topbar → `openAdmin()` → login email/password (Supabase Auth; akun dibuat manual di dashboard Authentication). Sesi dipulihkan saat refresh.
- **Aturan qty:** isi Qty → status otomatis (0 → `habis`, >0 → `ready`; `indent` dipertahankan jika dipilih manual). Status "— Belum diatur" = baris dihapus dari tabel → dealer tidak melihat badge.
- **Tampilan dealer:** badge di kartu (`Ready · 12`) dan detail (`Ready — Sisa 12 unit`). Fungsi: `loadStock()`, `subscribeStock()` (realtime), `refreshStockUI()`, `stockBadgeSmall()`, `renderProductStockBadge()`; stok dimuat ulang saat tab kembali aktif.
- **Admin panel:** `renderAdminList()`, `adminQtyChange()`, `scheduleSave()` (debounce 700 ms) → `saveStock()` (upsert/delete).
- **Import massal:** tombol *Template Excel* (`downloadStockTemplate()`, .xlsx berisi semua produk + stok saat ini) dan *Import dari Excel* (`importFile()` untuk .xlsx/.csv, `parseImportText()` untuk paste) → `buildImportPreview()` mencocokkan model (abaikan huruf besar/spasi/tanda baca; kolom Brand opsional untuk model kembar) → `saveImport()` satu kali upsert. Kolom dikenali dari header (Model/Qty/Status/Catatan/Brand) atau urutan Model · Qty · Catatan; baris tanpa Qty & Status dilewati; Catatan kosong tidak menghapus catatan lama. SheetJS (`xlsx` 0.18.5, cdnjs) dimuat hanya saat fitur ini dipakai.
- **Format data admin CAI** (didukung langsung): sheet stok gudang `No · Kode Barang · Data CAI · Baru · 2ND · FREE · PASANG · PINJAM` → qty diambil dari kolom **Baru** (stok baru siap jual; `Data CAI` = total semua kolom). Sheet OTW berjudul "BARANG BLM DATANG … (OTW)" dengan `No inv · Keterangan · Qty` ("100 SET", "40 FOC 2") → mode OTW mengisi `incoming` saja (stok tidak berubah; produk tanpa stok → `indent`; produk yang tak lagi ada di daftar OTW dikosongkan `incoming`-nya). No. invoice & FOC tidak ditampilkan ke dealer. Header boleh tidak di baris pertama; sheet, jenis data, dan kolom jumlah bisa diganti di pratinjau.
- **Kode gudang ≠ model katalog:** peta tetap di `STOCK_ALIASES` (mis. `PL-*` → `PRO-*`, `HL-M2 MK II` → HL-M2, `SSF-1` → SFF1, `SSPDSP16II` → SS-DSP16 II). Kode lain dipilih admin di pratinjau dan diingat di `localStorage` key `cai-stock-alias` (`-` = abaikan).
- **Produk di luar katalog:** kode yang tidak cocok **default ikut disimpan** dengan `product_id` = `x:<KODE>` (`extraId()`, huruf besar, spasi dirapikan). Tampil di grup "Produk Lain (di luar katalog)" (`EXTRA_GROUP`, chip *Lainnya*) di menu Stok, panel admin, dan template; tanpa halaman detail. Hapus = set "— Belum diatur" di admin. Jika produk itu kelak ditambahkan ke `BRANDS`, petakan kodenya (alias) lalu hapus baris `x:` lamanya.
- **Deteksi OTW** hanya dari nama sheet atau baris judul di atas header (`looksOtw`), bukan dari isi data. Beberapa kode berbeda ke satu produk dijumlahkan (mis. kabel per panjang); kode identik berulang tidak dijumlah. Jika pilihan manual sering dipakai, pindahkan ke `STOCK_ALIASES`.
- **Menu dealer:** view `stock` (`openStockView()`, `renderStockView()`) — publik, tanpa login.
- **Ubah skema:** jalankan SQL di Supabase → SQL Editor, **hanya statement baru** (editor menjalankan semua baris dalam satu transaksi; satu error membatalkan semuanya).
- Panel admin selalu gelap; warna teksnya dikunci eksplisit agar tetap terbaca di mode terang.
- Jangan tambahkan harga ke tabel stok.

## Design system (CSS)

- Token di `:root` dalam `<style>`. Tema default **gelap** (hitam pekat + aksen **emas sampanye** `--accent`), dengan panel kaca (glassmorphism).
- **Mode terang** didefinisikan di blok `@media (prefers-color-scheme: light)` dan `:root[data-theme="light"]` (palet platinum + emas lebih pekat).
- Token bar/panel: `--glass-bar`, `--surface`, `--border`, `--accent`, `--accent-hi`, dll.
- Font role: `--f-display` (Sora), `--f-body` (Inter), `--f-mono` (JetBrains Mono).
- **Landing page selalu gelap** di kedua tema (token di-override di selector `#landing`).

## Catatan
- Foto produk sebagian besar masih **placeholder** (ikon per kategori) — tinggal isi field `photo` saat foto asli siap. Sudah berfoto: seluruh **Audiocircle Pro Line** — PRO-W6C NEO, PRO-M3C, PRO-T28, PRO-M3P, PRO-M3P Nextel (`assets/ac-pro*.jpg`); **Audiocircle Concerto Line** — CL-W6, CL-M3, CL-T27 (2 foto) (`assets/ac-cl*.jpg`); **Audiocircle Berlin Line** — BL-W6 MKIII, BL-T26 MKII, BL-M3 MKII, BL-X3 (`assets/ac-bl*.jpg`). Foto sumber PNG transparan berukuran besar diratakan ke latar putih, dipangkas, dan diperkecil ke ≤1400 px JPG. Sudah ber-video: PRO-W6C NEO, PRO-M3C, PRO-T28 — ketiganya memakai satu video bersama `assets/ac-proline.mp4`, masing-masing mulai di segmen produknya lewat suffix `#t=<detik>` pada field `video` (W6C `#t=14`, M3C `#t=26`, T28 `#t=36`, setelah `?v=N`).
- Video Pro Line saat ini = `Audiocircle_Professional_Line_60s_16x9` (60 dtk, dikompres ke 720p). Saat mengganti file video/poster dengan nama yang sama, naikkan suffix `?v=N` di field `video`/`videoPoster` agar cache browser/GitHub Pages ikut terbarui.
- **Data spesifikasi di portal (`BRANDS`) adalah acuan** (dikonfirmasi pemilik). Video lama sempat menampilkan angka berbeda; video yang sekarang sudah sesuai dengan data portal. Jangan ubah data mengikuti materi video.
- Logo brand: keenam brand sudah punya logo. Diosdela (aslinya hitam) dan huruf STEG (aslinya biru) dibuat **putih** agar terbaca di latar gelap.
- PDF memakai font bawaan jsPDF yang tidak punya karakter `Ω` → otomatis ditulis `Ohm` di PDF.
- Foto hanya bisa di-embed ke PDF saat portal dibuka via server (http/https); jika dibuka langsung sebagai file (`file://`), PDF memakai placeholder.
- Semua data berasal dari katalog resmi CAI 2026. Jaga agar tetap tanpa harga.
- Tidak ada rahasia/kredensial di repo ini — aman dipublikasikan. (Supabase publishable key bersifat publik; jangan pernah commit `service_role` key atau password admin.)
