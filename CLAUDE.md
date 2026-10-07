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
    lines: [
      { name: "<nama line/seri>", products: [
        { id, name, model, category, emoji, hasVideo, desc,
          specs: { "Key": "Value", ... },
          photo?            // opsional: URL/path foto asli; jika kosong → pakai placeholder emoji
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
- **JANGAN masukkan harga** — portal ini sengaja hanya referensi produk.

## Struktur UI & fungsi kunci (dalam `index.html` `<script>`)

- `init()` — inisialisasi: stats dashboard, sidebar brand, kartu brand, logo, visualizer landing.
- **Landing:** `initViz()` (canvas equalizer emas), `enterPortal()`, `backToLanding()`.
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
- Foto produk saat ini **placeholder** (ikon per kategori) atas permintaan pemilik — tinggal isi field `photo` saat foto asli siap.
- Semua data berasal dari katalog resmi CAI 2026. Jaga agar tetap tanpa harga.
- Tidak ada rahasia/kredensial di repo ini — aman dipublikasikan.
