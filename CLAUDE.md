# Concerto Dealer Portal — Panduan Proyek (untuk Claude Code)

Portal informasi produk (katalog digital) untuk dealer & distributor **Concerto Audio Indonesia (CAI)**.
Menampilkan brand yang dinaungi beserta produk, spesifikasi, media, dan spec sheet PDF. **Tanpa harga.**

## Arsitektur

- **Satu file statis: `index.html`** — berisi seluruh HTML, CSS, JavaScript, dan data katalog dalam satu dokumen. Tidak ada build step, tidak ada backend, tidak ada dependency npm.
- Dependency eksternal via CDN (dimuat saat runtime di browser):
  - Google Fonts: **Sora**, **Inter**, **JetBrains Mono**
  - **jsPDF** (cdnjs) — untuk generate spec sheet PDF per produk.
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
- **Tema:** `toggleTheme()` (dark ⇄ light), `applyThemeIcon()`, `updateTopbarLogo()`. Preferensi disimpan di `localStorage` key `cai-theme`.

## Design system (CSS)

- Token di `:root` dalam `<style>`. Tema default **gelap** (hitam pekat + aksen **emas sampanye** `--accent`), dengan panel kaca (glassmorphism).
- **Mode terang** didefinisikan di blok `@media (prefers-color-scheme: light)` dan `:root[data-theme="light"]` (palet platinum + emas lebih pekat).
- Token bar/panel: `--glass-bar`, `--surface`, `--border`, `--accent`, `--accent-hi`, dll.
- Font role: `--f-display` (Sora), `--f-body` (Inter), `--f-mono` (JetBrains Mono).
- **Landing page selalu gelap** di kedua tema (token di-override di selector `#landing`).

## Catatan
- Foto produk sebagian besar masih **placeholder** (ikon per kategori) — tinggal isi field `photo` saat foto asli siap. Sudah berfoto: **PRO-W6C NEO** (`ac-prow6c`). Sudah ber-video: PRO-W6C NEO, PRO-M3C, PRO-T28 — ketiganya memakai satu video bersama `assets/ac-proline.mp4`, masing-masing mulai di segmen produknya lewat suffix `#t=<detik>` pada field `video` (W6C `#t=14`, M3C `#t=26`, T28 `#t=36`).
- Angka spesifikasi yang tampil di video Pro Line (mis. PRO-M3C freq. response, PRO-T28 SPL/power/Fs) berbeda dengan data portal. **Data di portal (`BRANDS`) yang benar** — sudah dikonfirmasi pemilik; jangan ubah data mengikuti video.
- Logo brand: keenam brand sudah punya logo. Diosdela (aslinya hitam) dan huruf STEG (aslinya biru) dibuat **putih** agar terbaca di latar gelap.
- PDF memakai font bawaan jsPDF yang tidak punya karakter `Ω` → otomatis ditulis `Ohm` di PDF.
- Foto hanya bisa di-embed ke PDF saat portal dibuka via server (http/https); jika dibuka langsung sebagai file (`file://`), PDF memakai placeholder.
- Semua data berasal dari katalog resmi CAI 2026. Jaga agar tetap tanpa harga.
- Tidak ada rahasia/kredensial di repo ini — aman dipublikasikan.
