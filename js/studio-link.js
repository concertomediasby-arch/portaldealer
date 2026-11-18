/* ══════════════════════════════════════════
   CAI HUB ↔ STUDIO — sistem editor gaya Black Amethyst (18 Nov 2026, permintaan pemilik — pratinjau .mockup/studio-ba/ disetujui).
   • Mengedit hanya di Studio: form Editor di CAI Hub untuk menu yang sudah pindah ke Studio (produk, Concerto Way, Academy,
     Galeri, Panduan Partner) diarahkan ke /studio/ (tab "cai-studio" yang sama dipakai ulang).
   • Pensil "✏️ Edit di Studio" di tiap bagian halaman untuk Editor; klik = Studio terbuka tepat di kolom itu.
   • Bilah "Mode Edit" di atas konten: sakelar pensil + tampilan pengunjung (semua tombol Editor di konten disembunyikan).
   Hanya role editor; Ricky (manager) & Admin tetap memakai CAI Hub seperti biasa. Tidak aktif di mode sematan (?embed=1).
   News: sejak 19 Nov 2026 form lengkap (posisi sampul, foto tambahan, project & perangkat) ada di Studio — openNwForm juga dialihkan.
══════════════════════════════════════════ */
const STUDIO_PATH = '/studio/';
const ED_EMBED = document.documentElement.classList.contains('embed');
const edOn = () => typeof isEditor === 'function' && isEditor();
function studioGo(hash) {
  hash = hash || '#home';
  if (ED_EMBED && window.top !== window) { try { window.top.location.hash = hash; return; } catch (e) {} }   // di dalam Studio: pindah halaman Studio
  const w = window.open(STUDIO_PATH + hash, 'cai-studio');
  if (!w) location.href = STUDIO_PATH + hash; else try { w.focus(); } catch (e) {}
}
// Form Editor lama di CAI Hub → Studio (fungsi asli tetap dipakai akun lain)
(() => {
  const wrap = (name, fn) => {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = function (...a) { return edOn() ? fn(...a) : orig.apply(this, a); };
  };
  wrap('ceOpen', (id, brandId) => studioGo(id ? '#produk/' + id : '#produk/new' + (brandId ? '/' + brandId : '')));
  wrap('openCwForm', id => studioGo(id ? '#cway/' + id : '#cway/new'));
  wrap('openAcadForm', () => studioGo('#academy/new'));
  wrap('openGlForm', id => studioGo(id ? '#galeri/' + id : '#galeri/new'));
  wrap('openGlForHof', () => studioGo('#galeri/new'));
  wrap('openNwForm', id => studioGo(id ? '#news/' + id : '#news/new'));   // 19 Nov 2026: project, perangkat & foto tambahan kini ada di Studio
  // Tahap 6 (18 Nov 2026): menu laporan & kelola pindah ke Studio — tidak dialihkan di dalam sematan (#m/<menu> = cadangan, mis. Import Excel stok)
  const wrapTop = (name, fn) => { const orig = window[name]; if (typeof orig !== 'function') return; window[name] = function (...a) { return edOn() && !ED_EMBED ? fn(...a) : orig.apply(this, a); }; };
  wrapTop('openDealers', () => studioGo('#akun'));
  wrapTop('openProdAnn', () => studioGo('#umumkan' + (typeof currentProductId !== 'undefined' && currentProductId ? '/' + currentProductId : '')));
  wrapTop('openAdForm', id => studioGo(id ? '#partner/' + id : '#partner/new'));
  wrapTop('openVisitors', () => studioGo('#pengunjung'));
  wrapTop('openRapor', m => studioGo('#rapor' + (m && /^\d{4}-\d{2}$/.test(m) ? '/' + m : '')));
  wrapTop('openPartnerReport', m => studioGo('#lappartner' + (m && /^\d{4}-\d{2}$/.test(m) ? '/' + m : '')));
  wrapTop('openAdmin', () => studioGo('#stok'));
  wrapTop('staffSyncSheet', () => studioGo('#stok'));
})();
// 🎬 Sorotan Brand (19 Nov 2026): tombol Ganti video / ✏️ / ↺ di kotak Dashboard → halaman Sorotan Brand di Studio
document.addEventListener('click', e => {
  const b = e.target.closest?.('.dt-edit .dt-btn'); if (!b || !edOn() || ED_EMBED) return;
  e.preventDefault(); e.stopPropagation(); studioGo('#sorotan');
}, true);
// ＋ Tambah PDF Panduan = label berisi input file → cegah jendela pilih file, buka Studio
document.addEventListener('click', e => {
  const l = e.target.closest?.('.guide-upload'); if (!l || !edOn()) return;
  e.preventDefault(); e.stopPropagation();
  const m = l.querySelector('input')?.getAttribute('onchange')?.match(/openGuideUpload\('([^']+)'/);
  studioGo('#guides/new' + (m ? '/' + m[1] : ''));
}, true);

// ── Mode Edit: pensil + tampilan pengunjung ──
const ED_KEY = 'cai-edpen';
const edPenOn = () => { try { return localStorage.getItem(ED_KEY) !== '0'; } catch (e) { return true; } };
function edToggle(on) {
  try { localStorage.setItem(ED_KEY, on ? '1' : '0'); } catch (e) {}
  document.body.classList.toggle('ed-off', !on); edBar();
}
function edBar() {
  let b = document.getElementById('ed-bar');
  if (ED_EMBED || !edOn()) { b?.remove(); document.body.classList.remove('ed-off'); return; }
  if (!b) { b = document.createElement('div'); b.id = 'ed-bar'; document.querySelector('.main')?.prepend(b); }
  const on = edPenOn(); document.body.classList.toggle('ed-off', !on);
  b.innerHTML = `<span class="ed-t">✏️ Mode Edit</span>
    <button class="ed-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" onclick="edToggle(${!on})" title="${on ? 'Sembunyikan pensil — lihat seperti pengunjung' : 'Tampilkan pensil Edit di Studio'}"><i></i></button>
    <span class="ed-s">${on ? 'pensil tampil · klik pensil = edit di Studio' : 'tampilan pengunjung'}</span>
    <button class="ed-go" onclick="studioGo('#home')">Buka Studio ↗</button>`;
}
const edPen = (label, hash, cls = '') => `<button type="button" class="ed-pen${cls ? ' ' + cls : ''}" onclick="event.stopPropagation();studioGo('${hash}')" title="Edit di CAI Hub Studio">✏️ ${label}</button>`;
function edPut(host, html, where = 'beforeend') {
  if (!host || ED_EMBED || !edOn()) return;
  host.querySelectorAll(':scope > .ed-pen, :scope > .ed-penrow').forEach(x => x.remove());
  host.insertAdjacentHTML(where, html);
}
// Pensil di halaman yang dirender ulang: dipasang setelah fungsi aslinya selesai
(() => {
  const after = (name, fn) => {
    const orig = window[name]; if (typeof orig !== 'function') return;
    window[name] = function (...a) { const r = orig.apply(this, a); try { if (edOn() && !ED_EMBED) fn(a, r); } catch (e) {} return r; };
  };
  after('showProduct', a => {
    const pid = a[1];
    edPut(document.getElementById('media-main')?.parentElement, edPen('Foto & video', `#produk/${pid}/foto`, 'abs'));
    const pr = document.getElementById('panel-price'); pr?.parentElement?.querySelectorAll('.ed-pen.np').forEach(x => x.remove());
    pr?.insertAdjacentHTML('afterend', edPen('Nama & SRP', `#produk/${pid}/harga`, 'np'));
    const sl = document.getElementById('specs-list'); sl?.parentElement?.querySelectorAll('.ed-pen.sp').forEach(x => x.remove());
    sl?.insertAdjacentHTML('beforebegin', edPen('Spesifikasi', `#produk/${pid}/spek`, 'sp'));
  });
  after('renderNwPost', a => edPut(a[0], `<div class="ed-penrow">${edPen('Edit berita ini di Studio', '#news/' + a[1].id)}</div>`, 'afterbegin'));
  after('renderCwPost', a => edPut(a[0], `<div class="ed-penrow">${edPen('Edit Day ini di Studio', '#cway/' + a[1].id)}</div>`, 'afterbegin'));
  after('openGlDetail', a => { const box = document.querySelector('#gl-detail .gl-dbox .gl-dgrid > div:last-child'); edPut(box, `<div class="ed-penrow">${edPen('Edit mobil ini di Studio', '#galeri/' + a[0])}</div>`, 'afterbegin'); });
  after('openAcademyItem', () => { const k = document.getElementById('acad-viewer-title'); k?.parentElement?.querySelectorAll('.ed-pen').forEach(x => x.remove()); k?.insertAdjacentHTML('afterend', edPen('Kelola Academy di Studio', '#academy')); });
  after('renderGuides', () => edPut(document.getElementById('guides-list'), `<div class="ed-penrow">${edPen('Kelola Panduan Partner di Studio', '#guides')}</div>`, 'afterbegin'));
})();
(() => { const o = window.updateAuthUI; if (typeof o === 'function') window.updateAuthUI = function (...a) { const r = o.apply(this, a); try { edBar(); } catch (e) {} return r; }; })();
