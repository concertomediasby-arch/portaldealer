# Concerto Dealer Portal

Portal katalog produk untuk dealer & distributor **Concerto Audio Indonesia**.
Menampilkan 6 brand resmi, 112 produk, dengan spesifikasi lengkap, spec sheet PDF, pencarian, serta mode terang/gelap. **Tanpa harga.**

Situs statis satu file — tanpa backend, tanpa build.

## Fitur
- Landing page beranimasi (visualizer) + logo CAI
- Dashboard: ringkasan + kartu brand
- Halaman brand: produk dikelompokkan per line/seri + filter kategori
- Halaman **Semua Brand**: pencarian produk/model + filter per brand
- Detail produk: spesifikasi + galeri media + **unduh spec sheet PDF**
- Mode terang & gelap (tersimpan), responsif desktop & HP

## Menjalankan lokal
Buka `index.html` di browser, atau:
```bash
python3 -m http.server 8000   # http://localhost:8000
```

## Publikasi ke GitHub Pages (gratis)

1. Buat repository baru di GitHub (mis. `concerto-dealer-portal`).
2. Unggah **`index.html`**, folder **`assets/`** (dan file ini) ke branch `main`:
   ```bash
   git init
   git add index.html assets README.md CLAUDE.md
   git commit -m "Concerto Dealer Portal"
   git branch -M main
   git remote add origin https://github.com/<username>/concerto-dealer-portal.git
   git push -u origin main
   ```
3. Di GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pilih branch **`main`** dan folder **`/ (root)`**, lalu **Save**.
4. Tunggu ±1 menit. Situs tayang di:
   `https://<username>.github.io/concerto-dealer-portal/`

> GitHub Pages menyajikan `index.html` di root secara otomatis. Font (Google Fonts) dan PDF (jsPDF) dimuat dari CDN publik — berjalan normal di situs live.
>
> **Domain sendiri (opsional):** tambahkan file `CNAME` berisi domainmu, lalu arahkan DNS ke GitHub Pages.

## Struktur
```
concerto-dealer-portal/
├── index.html     # seluruh portal (HTML + CSS + JS + data katalog)
├── assets/        # foto & video produk (mis. ac-prow6c.jpg, ac-prow6c.mp4)
├── CLAUDE.md      # panduan proyek untuk Claude Code
└── README.md      # dokumen ini
```

## Mengedit data produk
Semua data ada di array `BRANDS` di dalam `index.html`. Detail struktur & cara menambah produk/line/brand/foto ada di **`CLAUDE.md`**.

## Teknologi
HTML5 · CSS (custom properties, glassmorphism) · JavaScript (vanilla) · jsPDF (CDN) · Google Fonts (Sora, Inter, JetBrains Mono).
