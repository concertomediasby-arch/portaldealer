/* CAI Hub (Concerto Audio Indonesia) — js/main.js
   Hubungi CAI (WhatsApp), link berbagi produk, dan urutan start-up portal — dimuat PALING AKHIR.
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   HUBUNGI CAI — tombol WhatsApp dengan pesan otomatis
══════════════════════════════════════════ */
// Nomor WhatsApp tim sales CAI, format internasional tanpa "+" / spasi (mis. '6281234567890').
// Kosong = semua tombol WhatsApp disembunyikan.
const CAI_WHATSAPP = '6281325988588';
const hasWa = () => /^\d{8,15}$/.test(CAI_WHATSAPP);
// Tombol "Tanya CAI via WhatsApp" (class wa-only) hanya untuk akun DEALER yang login — tidak untuk pengunjung umum maupun staff
// Tombol WA: dealer yang login + Editor (agar Editor bisa mengecek tampilan dealer); admin staff tidak
function updateWaAccess() { document.body.classList.toggle('has-wa', hasWa() && !!authUser && (!isAdmin() || isEditor())); }
updateWaAccess();

function waIntro() {
  const m = authUser?.user_metadata || {};
  const who = m.store ? `${m.store}${m.city ? ' (' + m.city + ')' : ''}` : '';
  return `Halo Tim Concerto Audio Indonesia,${who ? ` saya dari *${who}*.` : ''}`;
}
function openWa(text) {
  if (!hasWa()) return;
  window.open(`https://wa.me/${CAI_WHATSAPP}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
function contactProduct(brandId, productId, intent) {
  const extra = String(productId || '').startsWith(EXTRA_PREFIX);
  const { brand, product } = extra ? {} : findProduct(brandId, productId);
  const label = extra ? productId.slice(EXTRA_PREFIX.length) : product ? `${brand.name} ${product.model}${product.name !== product.model ? ' — ' + product.name : ''}` : '';
  if (!label) return contactGeneral();
  const s = stockShown(productId);
  const stock = s ? `\nStatus di portal: ${STOCK_LABEL[s.status] || s.status}${s.status === 'ready' && s.qty != null ? ' · ' + s.qty + ' unit' : ''}${s.incoming ? ' · OTW ' + s.incoming : ''}` : '';
  const ask = intent === 'order' ? 'ingin order / cek ketersediaan' : 'ingin bertanya tentang produk';
  openWa(`${waIntro()}\nSaya ${ask}:\n• *${label}*${stock}\n\n(dari ${PORTAL_URL})`);
}
function contactPaket(id) {
  const p = PAKET_AUDIO.find(x => x.id === id);
  if (!p) return contactGeneral();
  openWa(`${waIntro()}\nSaya ingin bertanya tentang paket:\n• *${p.title}*\n\n(dari ${PORTAL_URL})`);
}
// ── Link berbagi: ?p=<id produk> membuka halaman produk, &v=1 langsung ke videonya ──
const WA_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.8L.1 24l6.4-1.7A11.8 11.8 0 0 0 24 12a11.7 11.7 0 0 0-3.6-8.4z"/></svg>';
const productLink = (pid, video) => `${PORTAL_URL}/?p=${encodeURIComponent(pid)}${video ? '&v=1' : ''}`;
function findProductAny(pid) {
  for (const b of BRANDS) { const r = findProduct(b.id, pid); if (r.product) return r; }
  return {};
}
function shareVideo() {
  const { brand, product } = currentProduct();
  if (!product) return;
  const text = `🎬 Video ${brand.name} *${product.model}*${product.name !== product.model ? ' — ' + product.name : ''}\n` +
    `Tonton di CAI Hub:\n${productLink(product.id, true)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}
// Dibuka dari link berbagi → lewati landing, buka produknya (dan videonya bila &v=1)
function openDeepLink() {
  const q = new URLSearchParams(location.search);
  const pid = q.get('p');
  const { brand, product } = pid ? findProductAny(pid) : {};
  if (!product) return;
  enterPortal();
  hideViews();   // link produk: tombol kembali → halaman brand (bukan dashboard)
  showProduct(brand.id, product.id);
  if (q.get('v') === '1' && product.video)
    [...document.querySelectorAll('#media-thumbs .media-thumb')].find(el => /'video'/.test(el.getAttribute('onclick')))?.click();
}

function contactGeneral() {
  openWa(`${waIntro()}\nSaya ingin bertanya…\n\n(dari ${PORTAL_URL})`);
}

init();
initQaScreen();
if (!QA_SCREEN_MODE) openDeepLink();
updateAcademyStar();
initSupabase();
setTimeout(visitLog, 2500);   // catat kunjungan setelah status login diketahui
if (!QA_SCREEN_MODE) { pmIcon(); pmArm(); }   // musik latar portal: tunggu klik pertama
idleInit();   // keluar otomatis bila tidak ada aktivitas
