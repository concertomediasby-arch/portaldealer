/* CAI Hub (Concerto Audio Indonesia) — js/stock.js
   Sistem stok (Supabase), login dealer/staff, menu Stok Produk, panel admin, import & sinkron Google Sheet.
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   STOCK SYSTEM — Supabase Realtime
══════════════════════════════════════════ */
const SUPA_URL  = 'https://cvffltbxsaiugccexmtf.supabase.co';
const SUPA_KEY  = 'sb_publishable_Y4AMvOdGfunEZhvvpsMzbg_NBbxNqGW';
let   supabase  = null;
let   stockMap  = {};   // { product_id: { status, note, qty } }
let   authUser = null;   // akun yang sedang login (dealer atau admin)
// Peran admin di-set lewat SQL di app_metadata (lihat CLAUDE.md); RLS Supabase menegakkan hal yang sama di server
// Peran (app_metadata.role, di-set lewat SQL): 'editor' = pemilik/editor situs, 'admin' = admin staff, kosong = dealer.
// Editor & admin sama-sama boleh mengubah stok dan Panduan Dealer; RLS Supabase menegakkan hal yang sama.
const userRole = () => authUser?.app_metadata?.role || 'dealer';
const isEditor = () => userRole() === 'editor';
const isAdmin = () => ['admin', 'editor'].includes(userRole());
const ROLE_LABEL = { editor: 'Editor', admin: 'Admin Staff', dealer: 'Dealer' };
let   stockChannel = null, afterLogin = null, lastAuthId;

const STOCK_LABEL = { ready: 'Ready', indent: 'Indent', habis: 'Habis' };
const escHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Bagian catatan internal gudang yang tidak ditampilkan ke dealer (catatan lengkap tetap tersimpan untuk admin)
// "OTW CAI: 30 SET" di catatan gudang = barang dalam perjalanan → ditampilkan sebagai 🚚 OTW, bukan sebagai catatan
const OTW_NOTE_RE = /\botw(?:\s*cai)?\s*:?\s*(\d+)\s*(set|pcs|pc|unit|pair|psg)?\b/i;
const otwFromNote = note => { const m = String(note || '').match(OTW_NOTE_RE); return m ? `${m[1]} ${(m[2] || 'unit').toLowerCase().replace(/^pc$/, 'pcs')}` : ''; };
// No. invoice (INV0241, (INV-0237), INV 12/A) & FOC (barang bonus) hanya untuk internal → tidak tampil ke dealer
const DEALER_HIDDEN_NOTE = [/\b(free|pinjam|2nd|pasang)\s*:?\s*\d+(\s*(pcs|set|unit))?/gi, /tidak ada di template\.?/gi, new RegExp(OTW_NOTE_RE.source, 'gi'),
  /(\(\s*)?\b(no\.?\s*)?inv(oice)?[\s.:#\-]*\d[\w\-\/]*(\s*\))?/gi, /\bfoc\s*:?\s*\d+(\s*(pcs|set|unit))?/gi, /(\(\s*)?\b[a-z]{1,6}[\-\s]?\d{2,4}\/[\w\/\-]+(\s*\))?/gi, /\(\s*\)/g];
// Panel admin: keterangan gudang FREE / PINJAM / 2ND / PASANG + angka juga tidak ditampilkan (30 Okt 2026, permintaan pemilik);
// OTW & catatan lain tetap. Catatan yang sudah dibersihkan ikut tersimpan saat baris itu disimpan lagi.
const adminNote = n => String(n || '').replace(DEALER_HIDDEN_NOTE[0], '').replace(DEALER_HIDDEN_NOTE[1], '')
  .split(/[|;]/).map(x => x.replace(/^[\s.,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')).filter(Boolean).join(' | ');
const dealerNote = n => DEALER_HIDDEN_NOTE.reduce((s, re) => s.replace(re, ''), String(n || ''))
  .split(/[|;]/).map(x => x.replace(/^[\s.,]+|[\s,]+$/g, '').replace(/\s{2,}/g, ' ')).filter(Boolean).join(' | ');
const stockRow = r => ({ status: r.status, note: r.note || '', qty: r.qty ?? null, incoming: r.incoming || otwFromNote(r.note), updated_at: r.updated_at || null });
let stockLoaded = false, stockBrand = 'all', stockStatus = 'all';
// Produk di luar katalog BRANDS disimpan dengan product_id "x:<KODE GUDANG>"
const EXTRA_PREFIX = 'x:';
const EXTRA_GROUP = { id: '_extra', name: 'Produk Lain (di luar katalog)' };
const extraId = raw => EXTRA_PREFIX + String(raw).toUpperCase().replace(/[^A-Z0-9 .\-\/+]/g, '').replace(/\s+/g, ' ').trim();
const extraProducts = () => Object.keys(stockMap).filter(k => k.startsWith(EXTRA_PREFIX)).sort()
  .map(id => ({ id, name: id.slice(EXTRA_PREFIX.length), model: 'Belum ada di katalog' }));
// Stok per varian (kabel per panjang: OG-AE1M, DIOS2M, …) disimpan sebagai baris tambahan `v:<id produk>:<varian>`;
// baris produk tetap memuat jumlah total semua varian
const VARIANT_PREFIX = 'v:';
const findProductById = id => { for (const b of BRANDS) { const p = brandProducts(b).find(x => x.id === id); if (p) return p; } return null; };
const variantId = (pid, v) => VARIANT_PREFIX + pid + ':' + v;
// varian dari kode gudang: kode berakhiran salah satu kunci priceList produk (ogae1m → 1M)
const stockVariantOf = (code, p) => p?.priceList ? Object.keys(p.priceList).find(v => normKey(code).endsWith(normKey(v))) || null : null;
// Stok tak terbatas (∞) — permintaan pemilik 26 Okt 2026: kabel OG 1M semua seri; berlaku apa pun angka di sheet
const STOCK_UNLIMITED = new Set(['og-reddragon', 'og-streamline', 'og-reference', 'og-azure'].map(pid => VARIANT_PREFIX + pid + ':1M'));
const stockAt = id => STOCK_UNLIMITED.has(id) ? { status: 'ready', qty: null, inf: true } : stockMap[id];
const stockVariants = p => p?.priceList ? Object.keys(p.priceList).filter(v => stockAt(variantId(p.id, v))).map(v => ({ v, s: stockShown(variantId(p.id, v)) })) : [];
// Stok yang tampil di katalog / menu Stok / detail produk (27 Okt 2026, permintaan pemilik): angka tabel stok dikurangi
// pembelian Shopping Gathering berstatus *dikonfirmasi* (fungsi SQL gathering_sold()); *selesai* dianggap sudah dipotong dari
// sheet gudang, *batal* tidak dihitung. Hanya tampilan — tabel stok & Google Sheet tidak diubah; panel admin tetap angka asli.
let gtSold = new Map(), gtSoldErr = '', gtSoldKey = new Map();   // gtSoldKey = per kunci stok gathering (termasuk Clearance c:), tanpa penjumlahan ke total
function stockShown(id) {
  const s = stockAt(id);
  if (!s || s.inf || s.qty == null) return s;
  const n = gtSold.get(id) || 0;
  if (!n) return s;
  const qty = Math.max(0, s.qty - n);
  return { ...s, qty, status: qty === 0 && s.status === 'ready' ? (s.incoming ? 'indent' : 'habis') : s.status, sold: n };
}
async function loadGtSold() {
  if (!supabase || !authUser) return;
  try {
    const { data, error } = await supabase.rpc('gathering_sold');
    if (error) throw error;
    const m = new Map(), add = (k, q) => m.set(k, (m.get(k) || 0) + q), mk = new Map();
    (data || []).forEach(x => {
      const k = typeof gtStockKey === 'function' && gtStockKey(x), q = x.qty || 0;
      if (k && q) mk.set(k, (mk.get(k) || 0) + q);
      if (!k || !q || k.startsWith('c:')) return;
      add(k, q);
      if (k.startsWith(VARIANT_PREFIX)) add(k.slice(VARIANT_PREFIX.length).replace(/:[^:]*$/, ''), q);   // panjang kabel → total produk ikut berkurang
    });
    gtSold = m; gtSoldKey = mk; gtSoldErr = '';
  } catch (e) { gtSold = new Map(); gtSoldKey = new Map(); gtSoldErr = String(e.message || e); }
}
const variantLine = p => stockVariants(p).map(({ v, s }) => `${v} ${s.inf ? '∞' : s.qty ?? (STOCK_LABEL[s.status] || s.status)}`).join(' · ');

function initSupabase() {
  try {
    supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    qsLocalWrap();
    // Fires once on load (INITIAL_SESSION) and on every login/logout; defer so no Supabase call runs inside the callback
    supabase.auth.onAuthStateChange((_e, session) => {
      authUser = session?.user || null;
      if (authUser?.id === lastAuthId) return;
      lastAuthId = authUser?.id;
      setTimeout(onAuthChanged, 0);
    });
  } catch(e) { console.warn('Supabase init failed', e); }
  updateAuthUI();
}

function onAuthChanged() {
  updateAuthUI();
  idleCheck();   // sesi lama yang dipulihkan setelah lewat batas tidak aktif → langsung keluar
  visitLog();
  if (!GT_DEALER_MENU && !isAdmin() && document.getElementById('view-gathering')?.classList.contains('active')) showView('dashboard');
  if (isAdmin()) loadVisitStats(true);
  if (authUser) {
    loadStock();
    subscribeStock();
  } else {
    if (stockChannel) { supabase.removeChannel(stockChannel); stockChannel = null; }
    stockMap = {}; stockLoaded = false; guideFiles = null; gtItems = null; gtOrders = null; gtTop = null; rdItems = null; qaItems = null;
    if (qaChannel) { supabase.removeChannel(qaChannel); qaChannel = null; }
    refreshStockUI();
    if (['view-stock', 'view-guides', 'view-dealers', 'view-gathering', 'view-academy', 'view-visitors'].some(id => document.getElementById(id)?.classList.contains('active'))) showView('dashboard');
  }
}

/* ── Login dealer (Stok Produk & Panduan Dealer hanya untuk akun terdaftar) ── */
function requireLogin(fn) {
  if (authUser) return true;
  afterLogin = fn;
  openLogin();
  return false;
}
function openLogin() {
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setLoginMode(loginStaffMode);
}
// Dealer: cukup satu Kode Akses (= PIN akun bersama SHARED_DEALER_CODE). Staff: email + password.
let loginStaffMode = false;
function setLoginMode(staff) {
  loginStaffMode = staff || !SHARED_DEALER_CODE;
  document.getElementById('login-id-row').hidden = !loginStaffMode;
  document.getElementById('login-pass-label').textContent = loginStaffMode ? 'Password' : 'Kode Akses';
  document.getElementById('login-password').placeholder = loginStaffMode ? '••••••••' : 'Masukkan kode akses dealer';
  document.getElementById('login-mode-link').textContent = loginStaffMode ? 'Login dealer (kode akses)' : 'Login staff (email)';
  document.getElementById('login-mode-link').hidden = !SHARED_DEALER_CODE;
  document.getElementById('login-error').textContent = '';
  setTimeout(() => document.getElementById(loginStaffMode && !document.getElementById('login-email').value ? 'login-email' : 'login-password')?.focus(), 50);
}
// Ikon mata di kolom sandi/kode: klik untuk menampilkan / menyembunyikan isinya
const EYE_ON  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
function setPwVisible(input, show) {
  input.type = show ? 'text' : 'password';
  const btn = input.parentElement.querySelector('.pw-eye');
  if (!btn) return;
  btn.innerHTML = show ? EYE_OFF : EYE_ON;
  btn.title = btn.ariaLabel = show ? 'Sembunyikan' : 'Tampilkan';
}
document.querySelectorAll('input.admin-input[type=password]').forEach(input => {
  const wrap = document.createElement('div');
  wrap.className = 'pw-wrap';
  input.replaceWith(wrap);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pw-eye';
  btn.onclick = () => { setPwVisible(input, input.type === 'password'); input.focus(); };
  wrap.appendChild(btn);
  setPwVisible(input, false);
});

function closeLogin() {
  setPwVisible(document.getElementById('login-password'), false);
  document.getElementById('login-overlay').classList.remove('open');
  document.body.style.overflow = '';
  afterLogin = null;
}
/* Kode Dealer: akun dealer memakai email internal <kode>@dealer.concerto.id (tidak pernah dikirimi email).
   Dealer cukup mengetik kode + PIN; staff (dan akun dealer lama) tetap bisa login dengan email. */
const DEALER_CODE_DOMAIN = 'dealer.concerto.id';
// ID dealer bersama (satu akun untuk semua dealer: cai@dealer.concerto.id). Kosongkan '' jika kelak tiap dealer punya kode sendiri.
const SHARED_DEALER_CODE = 'CAI';
const normDealerCode = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '-');
const validDealerCode = c => /^[A-Z0-9](?:[A-Z0-9-]{1,28})[A-Z0-9]$/.test(c);
const loginEmailFor = id => id.includes('@') ? id.toLowerCase() : `${normDealerCode(id).toLowerCase()}@${DEALER_CODE_DOMAIN}`;
const codeFromEmail = e => { const m = String(e || '').toLowerCase().match(new RegExp(`^([a-z0-9-]+)@${DEALER_CODE_DOMAIN.replace(/\./g, '\\.')}$`)); return m ? m[1].toUpperCase() : ''; };
// Nama yang ditampilkan untuk akun: kode dealer jika akun berbasis kode, selain itu email
const accountLabel = u => u ? (codeFromEmail(u.email) ? 'Kode ' + codeFromEmail(u.email) : u.email) : '';
function randomPin(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint32Array(len)), n => chars[n % chars.length]).join('');
}

/* ── CAPTCHA login (Cloudflare Turnstile, 30 Okt 2026 permintaan pemilik — menahan bot penebak kode akses) ──
   Site Key bersifat publik (boleh di repo); Secret Key HANYA di Supabase → Authentication → Attack Protection → CAPTCHA.
   Kosong = CAPTCHA mati (login seperti biasa). Urutan aktivasi: isi Site Key & deploy situs DULU, baru nyalakan CAPTCHA di Supabase
   (bila Supabase dinyalakan lebih dulu, semua login gagal). Widget "interaction-only": biasanya tak terlihat, kotak centang hanya
   muncul bila Cloudflare ragu. Token sekali pakai → widget dibuat ulang tiap percobaan login. */
const TURNSTILE_SITE_KEY = '0x4AAAAAAFsZqb8OVeHuLCXo';
let tsLoading = null;
const tsWidgets = {};
function tsLoad() {
  if (window.turnstile) return Promise.resolve();
  return tsLoading || (tsLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true; s.onload = () => res(); s.onerror = () => { tsLoading = null; rej(new Error('Verifikasi keamanan tidak bisa dimuat. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  }));
}
async function captchaToken(hostId) {
  if (!TURNSTILE_SITE_KEY) return undefined;
  await tsLoad();
  const host = document.getElementById(hostId);
  if (tsWidgets[hostId] != null) { try { turnstile.remove(tsWidgets[hostId]); } catch (e) {} delete tsWidgets[hostId]; }
  return new Promise((res, rej) => {
    const fail = msg => () => rej(new Error(msg));
    const t = setTimeout(fail('Verifikasi keamanan terlalu lama — coba lagi.'), 90000);
    tsWidgets[hostId] = turnstile.render(host, {
      sitekey: TURNSTILE_SITE_KEY, appearance: 'interaction-only', size: 'flexible', language: 'id',
      callback: tok => { clearTimeout(t); res(tok); },
      'error-callback': () => { clearTimeout(t); rej(new Error('Verifikasi keamanan gagal — coba lagi.')); },
      'expired-callback': () => {}, 'timeout-callback': () => { clearTimeout(t); rej(new Error('Verifikasi keamanan kedaluwarsa — coba lagi.')); },
    });
  });
}
const signInOpts = tok => tok ? { options: { captchaToken: tok } } : {};

async function dealerLogin() {
  const ident = loginStaffMode ? document.getElementById('login-email').value.trim() : SHARED_DEALER_CODE;
  const raw   = document.getElementById('login-password').value.trim();
  const pass  = loginStaffMode ? raw : raw.toUpperCase(); // kode akses tidak peka huruf besar/kecil (disimpan HURUF BESAR)
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  if (!ident || !pass) { err.textContent = loginStaffMode ? 'Isi email dan password.' : 'Masukkan kode akses.'; return; }
  const email = loginEmailFor(ident);
  if (!supabase) { err.textContent = 'Tidak dapat terhubung ke server. Periksa koneksi internet.'; return; }
  btn.disabled = true; btn.textContent = 'Memverifikasi…'; err.textContent = '';
  try {
    idleTouch(true);   // login baru = aktivitas baru (sesi lama yang kedaluwarsa tidak ikut menendang)
    const tok = await captchaToken('login-captcha');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass, ...signInOpts(tok) });
    if (error) throw error;
    authUser = data.user;
    const next = afterLogin;
    document.getElementById('login-password').value = '';
    closeLogin();
    showToast(`Masuk sebagai ${authUser.user_metadata?.store || accountLabel(authUser)} · ${ROLE_LABEL[userRole()] || 'Dealer'}`);
    if (next) next();
  } catch (e) {
    err.textContent = /invalid login/i.test(e.message || '') ? (loginStaffMode ? 'Email atau password salah.' : 'Kode akses salah.') : 'Login gagal: ' + (e.message || e);
  } finally {
    btn.disabled = false; btn.textContent = 'Masuk';
  }
}
async function authButton() {
  if (!authUser) { afterLogin = null; openLogin(); return; }
  if (confirm(`Keluar dari akun ${authUser.user_metadata?.store || accountLabel(authUser)}?`)) await doLogout();
}
// Local sign-out always clears this browser's session, even if the server call fails (offline / expired session)
async function doLogout(msg) {
  try { await supabase?.auth.signOut({ scope: 'local' }); } catch (e) { console.warn('signOut', e); }
  authUser = null; lastAuthId = undefined;
  onAuthChanged();
  showToast(msg || 'Anda telah keluar. Portal kini tampil sebagai pengunjung umum.', msg ? 6000 : 3500);
}

/* ── Keluar otomatis bila tidak ada aktivitas (30 Okt 2026, permintaan pemilik) ──
   Berlaku untuk semua akun (dealer, admin, editor) kecuali layar videotron. Waktu aktivitas terakhir disimpan di localStorage
   IDLE_KEY (bersama semua tab), jadi browser yang ditutup lalu dibuka lagi setelah lewat batas langsung keluar.
   1 menit sebelum keluar tampil peringatan + tombol "Tetap login". */
const IDLE_LOGOUT_MIN = 15, IDLE_WARN_SEC = 60, IDLE_KEY = 'cai-last-active';
let idleWritten = 0, idleOut = false;
const idleLast = () => { try { return +localStorage.getItem(IDLE_KEY) || 0; } catch (e) { return 0; } };
function idleTouch(force) {
  const now = Date.now();
  if (!force && now - idleWritten < 15000) return;   // tulis paling sering tiap 15 dtk
  idleWritten = now;
  try { localStorage.setItem(IDLE_KEY, String(now)); } catch (e) {}
  document.getElementById('idle-warn')?.remove();
}
function idleCheck() {
  if (QA_SCREEN_MODE || !authUser) { document.getElementById('idle-warn')?.remove(); return; }
  const last = idleLast();
  if (!last) { idleTouch(true); return; }
  const left = IDLE_LOGOUT_MIN * 60000 - (Date.now() - last);
  if (left <= 0) {
    document.getElementById('idle-warn')?.remove();
    if (idleOut) return;
    idleOut = true;
    setTimeout(() => { idleOut = false; }, 5000);
    doLogout(`Anda keluar otomatis karena tidak ada aktivitas selama ${IDLE_LOGOUT_MIN} menit.`);
    return;
  }
  let w = document.getElementById('idle-warn');
  if (left > IDLE_WARN_SEC * 1000) { w?.remove(); return; }
  if (!w) {
    w = document.createElement('div'); w.id = 'idle-warn'; w.className = 'idle-warn'; w.setAttribute('role', 'alert');
    w.innerHTML = '<span></span><button class="gt-btn confirm" onclick="idleTouch(true)">Tetap login</button>';
    document.body.appendChild(w);
  }
  w.querySelector('span').textContent = `Tidak ada aktivitas — Anda akan keluar otomatis dalam ${Math.ceil(left / 1000)} detik.`;
}
function idleInit() {
  if (QA_SCREEN_MODE) return;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (authUser) idleTouch(); }, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) idleCheck(); });
  setInterval(idleCheck, 1000);
}
let toastTimer = null;
function showToast(text, ms = 3500) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}
function updateAuthUI() {
  document.body.classList.toggle('logged-in', !!authUser);
  document.body.classList.toggle('is-editor', isEditor());
  document.body.classList.toggle('is-staff', isAdmin());
  if (isAdmin()) qsRegisterSW();   // panel Admin/Editor juga bisa dibuka ulang tanpa internet (mode offline videotron)
  updateWaAccess();
  if (!isEditor() && document.getElementById('view-dealers')?.classList.contains('active')) showView('dashboard');
  if (!isAdmin() && document.getElementById('view-rundown')?.classList.contains('active')) showView('dashboard');
  qaScreenAuth();
  const btn = document.getElementById('auth-btn');
  if (btn) btn.title = authUser ? `Login sebagai ${accountLabel(authUser)} (${ROLE_LABEL[userRole()] || 'Dealer'}) — klik untuk keluar` : 'Login dealer';
}

async function loadStock() {
  if (!supabase || !authUser) return;
  try {
    const { data } = await supabase.from('stock').select('*');
    if (data) {
      stockMap = {};
      data.forEach(r => { stockMap[r.product_id] = stockRow(r); });
      await loadGtSold();   // setelah stockMap terisi (kunci per panjang kabel butuh daftar varian)
      stockLoaded = true;
      refreshStockUI();
    }
  } catch(e) {}
}
// Re-sync when a dealer comes back to the tab, in case the realtime connection dropped
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadStock(); });

function subscribeStock() {
  if (!supabase) return;
  if (stockChannel) supabase.removeChannel(stockChannel);
  stockChannel = supabase.channel('stock-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock' }, payload => {
      const r = payload.new || payload.old;
      if (!r) return;
      if (payload.eventType === 'DELETE') {
        delete stockMap[r.product_id];
      } else {
        stockMap[r.product_id] = stockRow(r);
      }
      refreshStockUI();
    })
    .subscribe();
}

function refreshStockUI() {
  // Re-render all visible product cards (katalog / brand view)
  document.querySelectorAll('.product-card').forEach(card => {
    const onclick = card.getAttribute('onclick') || '';
    const m = onclick.match(/showProduct\('([^']+)','([^']+)'\)/);
    if (!m) return;
    const pid = m[2];
    const existing = card.querySelector('.product-stock-badge');
    const sb = stockBadgeSmall(pid);
    if (existing) existing.remove();
    if (sb) {
      const span = document.createElement('span');
      span.className = 'product-stock-badge ' + sb.cls;
      span.textContent = sb.label;
      const thumb = card.querySelector('.product-thumb');
      if (thumb) thumb.appendChild(span);
    }
  });
  // Update detail panel if open
  const panelBadge = document.getElementById('panel-stock-badge');
  if (panelBadge && currentProductId) renderProductStockBadge(currentProductId);
  if (document.getElementById('view-stock')?.classList.contains('active')) renderStockView();
  if (typeof gtRerender === 'function') gtRerender();   // Shopping Gathering ikut sisa stok terbaru
  // Update admin list if open — but never while the admin is typing in it
  const list = document.getElementById('admin-stock-list');
  if (document.getElementById('admin-stock-section')?.style.display !== 'none' && !list?.contains(document.activeElement)) renderAdminList();
}

function stockBadgeSmall(pid) {
  const s = stockShown(pid);
  if (!s) return null;
  const base = STOCK_LABEL[s.status] || s.status;
  const label = s.status === 'ready' && s.qty != null ? `${base} · ${s.qty}` : base;
  return { cls: s.status, label };
}

function renderProductStockBadge(pid) {
  const el = document.getElementById('panel-stock-badge');
  if (!el) return;
  const s = stockShown(pid);
  if (!s) { el.innerHTML = ''; document.querySelectorAll('#panel-price .pp-stk').forEach(x => { x.textContent = ''; x.className = 'pp-stk'; }); return; }
  const base = STOCK_LABEL[s.status] || s.status;
  const label = s.status === 'ready' && s.qty != null ? `${base} — Sisa ${s.qty} unit` : base;
  const otw = s.incoming ? `<div class="stock-badge-note">🚚 Dalam perjalanan: ${escHtml(s.incoming)}</div>` : '';
  const dn = s.incoming ? '' : dealerNote(s.note);   // barang OTW: cukup tampilkan baris OTW, tanpa catatan di bawahnya
  const note = dn ? `<div class="stock-badge-note">📝 ${escHtml(dn)}</div>` : '';
  // stok per panjang (kabel) tampil di samping tiap harga di daftar SRP; badge utama = total semua panjang
  const vs = stockVariants(findProductById(pid));
  document.querySelectorAll('#panel-price .pp-stk').forEach(x => {
    const hit = vs.find(y => y.v === x.dataset.v), st = hit?.s;
    x.className = 'pp-stk' + (st ? ' ' + st.status : '');
    x.textContent = !st ? '' : st.inf ? 'Stok ∞' : st.qty != null ? (st.qty ? `Sisa ${st.qty}` : 'Habis') : (STOCK_LABEL[st.status] || st.status);
  });
  const lbl = vs.length && s.qty != null ? label.replace('Sisa', 'Total sisa') : label;
  el.innerHTML = `<div class="stock-badge-wrap"><span class="stock-badge ${s.status}">${lbl}</span></div>${otw}${note}`;
}

/* ── Stok Produk view (publik, tanpa login) ── */
const fmtStockTime = iso => iso
  ? new Date(iso).toLocaleString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jakarta' })
  : '';

function openStockView() {
  if (!requireLogin(openStockView)) return;
  stockBrand = 'all'; stockStatus = 'all';
  const search = document.getElementById('stock-search');
  if (search) search.value = '';
  document.getElementById('stock-brand-chips').innerHTML =
    [{id:'all', name:'Semua'}, ...BRANDS.map(b => ({id:b.id, name:b.name})), {id: EXTRA_GROUP.id, name: 'Lainnya'}].map(b =>
      `<button class="filter-chip${b.id==='all'?' active':''}" data-brand="${b.id}" onclick="setStockBrand('${b.id}')">${b.name}</button>`
    ).join('');
  renderStockView();
  showView('stock');
  document.querySelector('.main')?.scrollTo(0, 0);
  loadStock();
}
function setStockBrand(id) {
  stockBrand = id;
  document.querySelectorAll('#stock-brand-chips .filter-chip').forEach(el => el.classList.toggle('active', el.dataset.brand === id));
  renderStockView();
}
function setStockStatus(s) {
  stockStatus = stockStatus === s ? 'all' : s;
  renderStockView();
}

function renderStockView() {
  const q = (document.getElementById('stock-search')?.value || '').trim().toLowerCase();
  const all = [
    ...BRANDS.flatMap(b => brandProducts(b).filter(p => stockMap[p.id]).map(p => ({ b, p, s: stockShown(p.id) }))),
    ...extraProducts().map(p => ({ b: EXTRA_GROUP, p, s: stockMap[p.id] })),
  ];

  const counts = { ready: 0, indent: 0, habis: 0, otw: 0 };
  all.forEach(x => { if (counts[x.s.status] !== undefined) counts[x.s.status]++; if (x.s.incoming) counts.otw++; });
  document.getElementById('stock-summary').innerHTML =
    [['all','Total', all.length], ['ready','Ready', counts.ready], ['indent','Indent', counts.indent], ['habis','Habis', counts.habis], ['otw','OTW', counts.otw]]
      .map(([k, label, n]) => `<button class="stock-sum ${k}${stockStatus===k?' active':''}" onclick="setStockStatus('${k}')"><b>${n}</b><span>${label}</span></button>`).join('');

  const latest = all.map(x => x.s.updated_at).filter(Boolean).sort().pop();
  const live = document.getElementById('stock-live');
  live.classList.toggle('on', stockLoaded);
  document.getElementById('stock-updated').textContent = !stockLoaded
    ? (supabase ? 'Memuat data stok…' : 'Data stok tidak dapat dimuat — periksa koneksi internet.')
    : 'Live' + (latest ? ' · terakhir diperbarui ' + fmtStockTime(latest) + ' WIB' : '');

  const rows = all.filter(({ b, p, s }) =>
    (stockBrand === 'all' || b.id === stockBrand) &&
    (stockStatus === 'all' || (stockStatus === 'otw' ? !!s.incoming : s.status === stockStatus)) &&
    (!q || p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || b.name.toLowerCase().includes(q)));

  const el = document.getElementById('stock-results');
  if (!rows.length) {
    el.innerHTML = `<div class="stock-empty">${stockLoaded && !all.length ? 'Data stok belum tersedia.' : stockLoaded ? 'Tidak ada produk yang cocok dengan filter.' : 'Memuat…'}</div>`;
    return;
  }
  const head = `<div class="stock-row head"><span>Produk</span><span>Status</span><span>Qty</span><span>Catatan</span><span style="text-align:right">Diperbarui</span></div>`;
  el.innerHTML = [...BRANDS, EXTRA_GROUP].map(b => {
    const items = rows.filter(r => r.b === b);
    if (!items.length) return '';
    return `<div class="stock-group"><div class="stock-group-title">${b.name}</div>${head}${items.map(({ p, s }) => {
      const mq = s.status === 'ready' && s.qty != null ? `<span class="sr-mq"> · ${s.qty}</span>` : '';
      const open = b === EXTRA_GROUP ? 'style="cursor:default"' : `onclick="showProduct('${b.id}','${p.id}')"`;
      return `<div class="stock-row" ${open}>
        <div style="min-width:0"><div class="sr-name">${escHtml(p.name)}${eolTag(p)}</div><div class="sr-model">${escHtml(p.model)}${hasPrice(p) ? ` · <span class="sr-price">SRP ${srpText(p)}</span>` : ''}</div></div>
        <div><span class="stock-badge ${s.status}">${STOCK_LABEL[s.status] || s.status}${mq}</span></div>
        <div class="sr-qty">${s.qty ?? ''}</div>
        <div class="sr-note">${b !== EXTRA_GROUP && variantLine(p) ? `<div class="sr-var">📏 ${escHtml(variantLine(p))}</div>` : ''}${s.incoming ? `<div class="sr-otw">🚚 OTW ${escHtml(s.incoming)}</div>` : escHtml(dealerNote(s.note))}</div>
        <div class="sr-time">${fmtStockTime(s.updated_at)}<button class="sr-wa wa-only" title="Tanya / order via WhatsApp" onclick="event.stopPropagation(); contactProduct('${b.id}','${p.id}','order')"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3z"/></svg>Tanya</button></div>
      </div>`;
    }).join('')}</div>`;
  }).join('');
}

/* ── Admin Panel ── */
function openAdmin() {
  document.getElementById('admin-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  if (authUser) showAdminStockSection(); else resetAdminLoginUI();
}
// Menu sidebar "Update Stok (Sheet)": buka panel admin lalu langsung sinkron Google Sheet (belum login → form login admin dulu)
function staffSyncSheet() {
  openAdmin();
  if (authUser && isAdmin()) syncFromSheet();
}
function closeAdmin() {
  document.getElementById('admin-overlay').classList.remove('open');
  document.body.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAdmin(); closeLogin(); } });

// Admin staff cukup mengetik Kode Admin (= password akun ADMIN_LOGIN_EMAIL, peka huruf besar/kecil).
// Editor memakai link "Login Editor (email)".
const ADMIN_LOGIN_EMAIL = 'concerto.stock@gmail.com';
let adminEmailMode = false;
function setAdminLoginMode(emailMode) {
  adminEmailMode = emailMode || !ADMIN_LOGIN_EMAIL;
  document.getElementById('admin-email-row').hidden = !adminEmailMode;
  document.getElementById('admin-pass-label').textContent = adminEmailMode ? 'Password' : 'Kode Admin';
  document.getElementById('admin-password').placeholder = adminEmailMode ? '••••••••' : 'Masukkan kode admin';
  document.getElementById('admin-mode-link').textContent = adminEmailMode ? '← Login admin (kode)' : 'Login Editor (email)';
  document.getElementById('admin-mode-link').hidden = !ADMIN_LOGIN_EMAIL;
  document.getElementById('admin-error').textContent = '';
  setTimeout(() => document.getElementById(adminEmailMode ? 'admin-email' : 'admin-password')?.focus(), 50);
}

async function adminLogin() {
  const email = adminEmailMode ? document.getElementById('admin-email').value.trim() : ADMIN_LOGIN_EMAIL;
  const pass  = document.getElementById('admin-password').value.trim();
  const btn   = document.getElementById('admin-login-btn');
  const err   = document.getElementById('admin-error');
  if (!email || !pass) { err.textContent = adminEmailMode ? 'Isi email dan password.' : 'Masukkan kode admin.'; return; }
  btn.disabled = true; btn.textContent = 'Memverifikasi...'; err.textContent = '';
  try {
    idleTouch(true);   // login baru = aktivitas baru (sesi lama yang kedaluwarsa tidak ikut menendang)
    const tok = await captchaToken('admin-captcha');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass, ...signInOpts(tok) });
    if (error) throw error;
    authUser = data.user;
    showAdminStockSection();
  } catch(e) {
    err.textContent = /invalid login/i.test(e.message || '') ? (adminEmailMode ? 'Email atau password salah.' : 'Kode admin salah.') : 'Login gagal: ' + (e.message || e);
    btn.disabled = false; btn.textContent = 'Masuk';
  }
}

function showAdminStockSection() {
  const admin = isAdmin();
  document.getElementById('admin-login-section').style.display = 'none';
  document.getElementById('admin-noaccess').style.display = admin ? 'none' : 'block';
  document.getElementById('admin-stock-section').style.display = admin ? 'block' : 'none';
  document.getElementById('admin-footer').style.display = 'block';
  document.getElementById('admin-user-email').textContent = authUser ? `${accountLabel(authUser)} · ${ROLE_LABEL[userRole()] || 'Dealer'}` : '';
  document.getElementById('admin-subtitle').textContent = admin ? 'Kelola ketersediaan produk' : 'Akun ini tidak punya akses admin';
  if (admin) { renderAdminList(); renderSheetLink(); loadAutoSync(); }
}
// Sinkron otomatis di server (Edge Function sync-stock-sheet + pg_cron, tiap 15 menit) — status terakhir dari tabel stock_sync
async function loadAutoSync() {
  const el = document.getElementById('auto-sync');
  if (!el || !supabase) return;
  const { data, error } = await supabase.from('stock_sync').select('*').eq('id', 1).maybeSingle();
  if (error) { el.innerHTML = ''; return; }   // tabel stock_sync belum dibuat = sinkron otomatis belum dipasang
  if (!data) { el.innerHTML = `⏳ Sinkron otomatis terpasang, belum pernah berjalan · <a href="#" onclick="runAutoSync(); return false;">⚡ sinkron server sekarang</a>`; return; }
  const t = data.ran_at ? fmtStockTime(data.ran_at) + ' WIB' : '—';
  el.innerHTML = `${data.ok ? '🟢' : '🔴'} Sinkron otomatis terakhir: ${t}${data.source === 'manual' ? ' (manual)' : ''} — ${escHtml(data.message || '')}
    · <a href="#" onclick="runAutoSync(); return false;">⚡ sinkron server sekarang</a>`;
}
async function runAutoSync() {
  const el = document.getElementById('auto-sync');
  if (el) el.innerHTML = '⏳ Menyinkronkan stok dari Google Sheet di server…';
  try {
    const { data, error } = await supabase.functions.invoke('sync-stock-sheet', { body: {} });
    if (error) throw error;
    showToast(data?.ok ? 'Stok tersinkron — ' + data.message : 'Sinkron gagal: ' + (data?.error || ''));
    await loadStock();
  } catch (e) { showToast('Sinkron gagal: ' + (e.message || e)); }
  loadAutoSync();
}

function resetAdminLoginUI() {
  document.getElementById('admin-login-section').style.display = 'block';
  document.getElementById('admin-noaccess').style.display = 'none';
  document.getElementById('admin-stock-section').style.display = 'none';
  document.getElementById('admin-footer').style.display = 'none';
  document.getElementById('admin-subtitle').textContent = 'Login untuk mengelola ketersediaan produk';
  document.getElementById('admin-password').value = '';
  document.getElementById('admin-error').textContent = '';
  setPwVisible(document.getElementById('admin-password'), false);
  document.getElementById('admin-login-btn').disabled = false;
  document.getElementById('admin-login-btn').textContent = 'Masuk';
  setAdminLoginMode(false);
}

async function adminLogout() {
  await doLogout();
  resetAdminLoginUI();
}

function renderAdminList() {
  const q = (document.getElementById('admin-search')?.value || '').toLowerCase();
  const container = document.getElementById('admin-stock-list');
  if (!container) return;

  let html = '';
  [...BRANDS.map(b => [b, brandProducts(b)]), [EXTRA_GROUP, extraProducts()]].forEach(([brand, list]) => {
    const products = list.filter(p =>
      !q || p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || brand.name.toLowerCase().includes(q)
    );
    if (!products.length) return;
    html += `<div class="admin-brand-section">
      <div class="admin-brand-title">${brand.name}</div>`;
    products.forEach(p => {
      const s = stockMap[p.id] || {};
      const status = s.status || '';
      const otw    = s.incoming || '';
      const qty    = s.qty ?? '';
      html += `<div class="admin-product-row">
        <div class="admin-prod-info">
          <div class="admin-prod-name">${escHtml(p.name)}</div>
          <div class="admin-prod-model">${escHtml(p.model)}</div>
        </div>
        <select class="admin-stock-select" data-pid="${p.id}" onchange="scheduleSave('${p.id}')">
          <option value=""       ${status===''      ?'selected':''}>— Belum diatur</option>
          <option value="ready"  ${status==='ready' ?'selected':''}>🟢 Ready</option>
          <option value="indent" ${status==='indent'?'selected':''}>🟡 Indent</option>
          <option value="habis"  ${status==='habis' ?'selected':''}>🔴 Habis</option>
        </select>
        <input class="admin-qty-input" type="number" min="0" step="1" inputmode="numeric" placeholder="Qty"
          value="${qty}" data-pid="${p.id}" oninput="adminQtyChange('${p.id}',this)" title="Jumlah stok tersisa">
        <input class="admin-note-input admin-otw-input" type="text" placeholder="🚚 OTW (mis. 20 pcs)" maxlength="40"
          value="${escHtml(otw)}" data-pid="${p.id}" oninput="scheduleSave('${p.id}')" title="Barang OTW / belum datang — tampil ke dealer sebagai 🚚 OTW. Kosongkan bila tidak ada.">
        <div class="admin-save-row" id="saved-${p.id}"></div>
      </div>`;
    });
    html += `</div>`;
  });
  container.innerHTML = html || `<div style="color:var(--fg-muted);padding:20px 0;text-align:center">Tidak ada produk ditemukan.</div>`;
}

let saveTimers = {};
// Qty drives the status automatically (0 → Habis, >0 → Ready); Indent is kept if chosen manually
function adminQtyChange(pid, inp) {
  const sel = document.querySelector(`.admin-stock-select[data-pid="${pid}"]`);
  if (sel && inp.value !== '') {
    const n = parseInt(inp.value, 10);
    if (n === 0) sel.value = 'habis';
    else if (n > 0 && sel.value !== 'indent') sel.value = 'ready';
  }
  scheduleSave(pid);
}
function scheduleSave(pid) {
  clearTimeout(saveTimers[pid]);
  saveTimers[pid] = setTimeout(() => saveStock(pid), 700);
}

async function saveStock(pid) {
  const sel  = document.querySelector(`.admin-stock-select[data-pid="${pid}"]`);
  const qin  = document.querySelector(`.admin-qty-input[data-pid="${pid}"]`);
  const inp  = document.querySelector(`.admin-note-input[data-pid="${pid}"]`);
  const icon = document.getElementById('saved-' + pid);
  if (!sel || !supabase) return;
  // Kolom ketiga = status barang OTW (kolom `incoming`, 30 Okt 2026, permintaan pemilik — dulu kolom catatan).
  // Catatan lama dipertahankan tanpa keterangan gudang FREE/PINJAM/2ND/PASANG & tanpa teks OTW (OTW kini dari kolom incoming).
  const incoming = inp ? inp.value.trim() : (stockMap[pid]?.incoming || '');
  const note = adminNote(stockMap[pid]?.note).replace(new RegExp(OTW_NOTE_RE.source, 'gi'), '').split('|').map(x => x.trim()).filter(Boolean).join(' | ');
  const n    = qin && qin.value !== '' ? parseInt(qin.value, 10) : null;
  const qty  = Number.isInteger(n) && n >= 0 ? n : null;
  let status = sel.value;
  if (!status && (qty !== null || incoming)) { status = qty === 0 ? (incoming ? 'indent' : 'habis') : 'ready'; sel.value = status; }
  if (icon) { icon.textContent = '⏳'; icon.style.color = '#a3aab8'; icon.title = ''; }
  try {
    if (!status) {
      const { error } = await supabase.from('stock').delete().eq('product_id', pid);
      if (error) throw error;
      delete stockMap[pid];
    } else {
      const { error } = await supabase.from('stock').upsert({ product_id: pid, status, note, qty, incoming: incoming || null }, { onConflict: 'product_id' });
      if (error) throw error;
      stockMap[pid] = { ...stockMap[pid], status, note, qty, incoming, updated_at: new Date().toISOString() };
    }
    refreshStockUI();
    if (icon) { icon.textContent = '✓'; icon.style.color = '#52c38a'; setTimeout(() => { if(icon) icon.textContent=''; }, 2000); }
  } catch(e) {
    if (icon) { icon.textContent = '✗'; icon.style.color = '#e0675f'; icon.title = e.message || 'Gagal menyimpan'; }
    console.warn('Save stock error', e);
  }
}

/* ── Import stok dari Excel / CSV / paste ── */
let importRows = [];
const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const STATUS_WORDS = { ready:'ready', ada:'ready', tersedia:'ready', indent:'indent', inden:'indent', po:'indent', habis:'habis', kosong:'habis', soldout:'habis' };

function adminMsg(text, kind) {
  const el = document.getElementById('admin-msg');
  el.textContent = text || ''; el.className = 'admin-msg' + (kind ? ' ' + kind : '');
}
function toggleImport() {
  const box = document.getElementById('admin-import');
  const open = box.style.display === 'none';
  box.style.display = open ? 'flex' : 'none';
  if (!open) { importRows = []; importSrc = null; document.getElementById('imp-preview').innerHTML = ''; document.getElementById('imp-text').value = ''; }
  adminMsg('');
}

let xlsxLib = null;
function loadXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLib) return xlsxLib;
  xlsxLib = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => res(window.XLSX);
    s.onerror = () => { xlsxLib = null; rej(new Error('Gagal memuat pembaca Excel. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  });
  return xlsxLib;
}

async function downloadStockTemplate() {
  try {
    const XLSX = await loadXlsx();
    const rows = [['Brand', 'Model', 'Nama Produk', 'Qty', 'Status', 'Catatan']];
    BRANDS.forEach(b => brandProducts(b).forEach(p => {
      const s = stockMap[p.id] || {};
      rows.push([b.name, p.model, p.name, s.qty ?? '', s.status ? STOCK_LABEL[s.status] : '', s.note || '']);
    }));
    extraProducts().forEach(p => {
      const s = stockMap[p.id];
      rows.push(['Lainnya', p.name, p.name, s.qty ?? '', s.status ? STOCK_LABEL[s.status] : '', s.note || '']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:16}, {wch:22}, {wch:28}, {wch:7}, {wch:9}, {wch:32}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok');
    const d = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `stok-concerto-${d}.xlsx`);
  } catch (e) { adminMsg(e.message, 'err'); }
}

async function importFile(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    let rows;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      rows = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) }));
    } else {
      rows = [{ name: file.name, rows: splitDelimited(await file.text()) }];
    }
    startImport(rows, file.name);
  } catch (e) { adminMsg('Gagal membaca file: ' + e.message, 'err'); }
}

function splitDelimited(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const first = lines[0] || '';
  const delim = first.includes('\t') ? '\t' : first.includes(';') ? ';' : first.includes(',') ? ',' : '\t';
  return lines.map(l => l.split(delim).map(c => c.trim().replace(/^"(.*)"$/, '$1')));
}
// ── Sinkron dari Google Sheet ──
// Link sheet disimpan di browser admin (bukan di kode situs, karena index.html bisa dibaca publik).
// Sheet harus dibagikan "Siapa saja yang memiliki link — Pelihat". Data dibaca lewat endpoint CSV gviz.
const SHEET_KEY = 'cai-stock-sheet';
const getSheetLink = () => { try { return localStorage.getItem(SHEET_KEY) || ''; } catch (e) { return ''; } };
function sheetCsvUrl(link) {
  const id = (String(link).match(/\/d\/([\w-]{20,})/) || [])[1] || (/^[\w-]{20,}$/.test(link) ? link : '');
  if (!id) return '';
  const gid = (String(link).match(/[#&?]gid=(\d+)/) || [])[1];
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv${gid ? '&gid=' + gid : ''}&t=${Date.now()}`;
}
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function renderSheetLink() {
  const el = document.getElementById('sheet-link');
  if (!el) return;
  const link = getSheetLink();
  el.innerHTML = link
    ? `Sumber: <a href="${escHtml(link)}" target="_blank" rel="noopener">Google Sheet stok</a> · <a href="#" onclick="syncFromSheet(true); return false;">ganti link</a>`
    : '';
}
async function syncFromSheet(change) {
  let link = getSheetLink();
  if (change || !link) {
    const v = prompt('Tempel link Google Sheet stok (Bagikan → "Siapa saja yang memiliki link"):', link);
    if (v === null) return;
    if (!sheetCsvUrl(v.trim())) { adminMsg('Link Google Sheet tidak valid.', 'err'); return; }
    link = v.trim();
    try { localStorage.setItem(SHEET_KEY, link); } catch (e) {}
    renderSheetLink();
    if (change) return;
  }
  const box = document.getElementById('admin-import');
  if (box.style.display === 'none') toggleImport();
  adminMsg('Mengambil data dari Google Sheet…');
  try {
    const res = await fetch(sheetCsvUrl(link), { cache: 'no-store' });
    const text = await res.text();
    if (!res.ok || /^\s*<(!doctype|html)/i.test(text)) throw new Error('akses ditolak');
    adminMsg('');
    startImport([{ name: 'Google Sheet', rows: parseCsv(text) }], 'Google Sheet');
  } catch (e) {
    adminMsg('Gagal membaca Google Sheet — pastikan sheet dibagikan "Siapa saja yang memiliki link" (Pelihat), lalu coba lagi. (' + (e.message || e) + ')', 'err');
  }
}

function parseImportText() {
  const text = document.getElementById('imp-text').value;
  if (!text.trim()) { adminMsg('Paste data dari Excel dulu, atau pilih file.', 'err'); return; }
  startImport([{ name: 'data paste', rows: splitDelimited(text) }], 'data paste');
}


// Pilihan manual admin di pratinjau ('-' = abaikan), disimpan di browser ini
const ALIAS_KEY = 'cai-stock-alias';
function localAliases() { try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}'); } catch (e) { return {}; } }
function setImportAlias(key, pid) {
  const a = localAliases();
  if (pid) a[key] = pid; else delete a[key];
  try { localStorage.setItem(ALIAS_KEY, JSON.stringify(a)); } catch (e) {}
  renderImport();
}

let importSrc = null;   // { sheets:[{name, rows}], idx, source, mode, qtyCol }

function detectLayout(rows) {
  const isHead = r => r.some(c => /kode|model|nama|produk|barang|no\s*inv|tipe|^\s*unit\s*$/i.test(c)) && r.some(c => /qty|jumlah|stok|stock|baru|sisa/i.test(c));
  const h = rows.slice(0, 8).findIndex(isHead);
  if (h < 0) return { h: 0, head: null, body: rows, col: { model: 0, name: -1, qty: 1, note: 2, status: -1, brand: -1 } };
  const head = rows[h].map(c => String(c).trim().toLowerCase());
  const find = re => head.findIndex(x => re.test(x));
  let model = find(/kode|model|tipe|type|no\s*inv/);
  const name = find(/nama|produk|product/);
  if (model < 0) model = name;
  if (model < 0) model = find(/^unit$/);   // file STOCK DISTRIBUTOR: No · Merk · Unit · Stok Tersedia · Status
  let qty = find(/^baru$/);
  if (qty < 0) qty = find(/qty|jumlah|stok|stock|sisa/);
  return { h, head: rows[h], body: rows.slice(h + 1), col: { model, name, qty, status: find(/status/), note: find(/catatan|note/), brand: find(/brand|merek|merk/) } };
}
// OTW only when the sheet name or the title rows ABOVE the header say so — never from data cells
const OTW_RE = /\botw\b|blm\s*datang|belum\s*datang|perjalanan/i;
const looksOtw = sheet => OTW_RE.test(sheet.name) || OTW_RE.test(sheet.rows.slice(0, detectLayout(sheet.rows).h).flat().join(' '));

function startImport(sheets, source) {
  sheets = sheets.map(s => ({ name: s.name, rows: s.rows.map(r => r.map(c => String(c ?? '').trim())).filter(r => r.some(Boolean)) }))
                 .filter(s => s.rows.length);
  if (!sheets.length) { adminMsg('Tidak ada data yang terbaca.', 'err'); return; }
  importSrc = { sheets, source };
  pickImportSheet(0);
}
function pickImportSheet(i) {
  importSrc.idx = +i;
  importSrc.mode = looksOtw(importSrc.sheets[importSrc.idx]) ? 'otw' : 'gudang';
  importSrc.qtyCol = null;
  renderImport();
}
function setImportMode(m) { importSrc.mode = m; renderImport(); }
function setImportQtyCol(c) { importSrc.qtyCol = +c; renderImport(); }

function renderImport() {
  if (!importSrc) return;
  const sheet = importSrc.sheets[importSrc.idx];
  const lay = detectLayout(sheet.rows);
  const col = { ...lay.col };
  if (importSrc.qtyCol !== null) col.qty = importSrc.qtyCol;
  const otw = importSrc.mode === 'otw';
  const aliases = localAliases();

  const index = BRANDS.flatMap(b => brandProducts(b).map(p => ({ b, p,
    keys: new Set([normKey(p.model), normKey(p.name), normKey(p.id), normKey(b.name + p.model)]) })));
  const byId = Object.fromEntries(index.map(x => [x.p.id, x]));

  const matched = new Map();
  let skipped = 0, ignored = 0;
  lay.body.forEach(r => {
    const cell = k => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
    const raw = cell('model') || cell('name');
    if (!raw || /^total/i.test(raw)) return;
    const qtyRaw = cell('qty').replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1'), stRaw = cell('status'), note = cell('note');
    const num = qtyRaw.match(/^\s*(\d+)/);
    let qty = num ? parseInt(num[1], 10) : null, status = '', incoming = '';

    if (otw) {
      if (qty === null) { skipped++; return; }
      const unit = (qtyRaw.match(/^\s*\d+\s*(set|pcs|pc|unit|pair|psg)\b/i) || [])[1];
      incoming = { n: qty, unit: unit ? unit.toLowerCase().replace(/^pc$/, 'pcs') : 'unit' };
    } else {
      if (qty === null && STATUS_WORDS[normKey(qtyRaw)]) status = STATUS_WORDS[normKey(qtyRaw)];
      if (STATUS_WORDS[normKey(stRaw)]) status = status || STATUS_WORDS[normKey(stRaw)];
      if (qty === null && !status) { skipped++; return; }
      if (qty !== null && status !== 'indent') status = qty === 0 ? 'habis' : 'ready';
      // Stok kosong tapi ada barang OTW di catatan → Indent, bukan Habis
      if (status === 'habis' && otwFromNote(note)) status = 'indent';
    }

    const k = normKey(raw);
    // Kolom Brand/Merk boleh berisi nama, id, atau singkatan brand (AC, ST, AS…); nilai lain (ACC, MONA…) diabaikan
    let bk = normKey(cell('brand'));
    const brandMatch = b => [b.name, b.id, b.abbr].some(v => normKey(v || '') === bk);
    if (bk && !BRANDS.some(brandMatch)) bk = '';
    const alias = aliases[k] || STOCK_ALIASES[k];
    if (alias === '-') { ignored++; return; }
    let hit = byId[alias];
    if (!hit && aliases[k] !== '+') {
      const hits = [...new Map(index.filter(x => x.keys.has(k) && (!bk || brandMatch(x.b))).map(h => [h.p.id, h])).values()];
      if (hits.length === 1) hit = hits[0];
    }
    // Not in the catalog → kept as an extra product under its warehouse code
    const pid = hit ? hit.p.id : extraId(raw);
    if (!hit && pid === EXTRA_PREFIX) return;

    const prev = matched.get(pid);
    const variant = !otw && qty !== null && hit ? stockVariantOf(k, hit.p) : null;
    // Different warehouse codes for one catalog product (e.g. cable lengths) are summed; a repeated identical code just overwrites
    if (prev && !prev.codes.has(k)) {
      prev.codes.add(k); prev.raw += ' + ' + raw;
      if (variant) prev.variants[variant] = (prev.variants[variant] || 0) + qty;
      if (otw) prev.incoming.n += incoming.n;
      else if (qty !== null) { prev.qty = (prev.qty || 0) + qty; prev.status = prev.qty === 0 ? 'habis' : (prev.status === 'indent' ? 'indent' : 'ready'); }
      return;
    }
    matched.set(pid, { pid, hit, key: k, raw, codes: new Set([k]), qty, status, note, incoming, otwNote: otw ? '' : otwFromNote(note),
      variants: variant ? { ...(prev?.variants || {}), [variant]: qty } : {} });
  });

  importRows = [...matched.values()];
  importSrc.hasNoteCol = !!lay.head && col.note >= 0;
  const bad = importRows.filter(r => !r.hit), good = importRows.filter(r => r.hit);
  const cleared = otw ? Object.entries(stockMap).filter(([pid, s]) => s.incoming && !matched.has(pid)).length : 0;

  const opts = sel => `<option value="+" ${sel === '+' ? 'selected' : ''}>＋ Produk lain (di luar katalog)</option>
    <option value="-">Abaikan — jangan disimpan</option>` +
    BRANDS.map(b => `<optgroup label="Sama dengan produk ${escHtml(b.name)}:">${brandProducts(b).map(p => `<option value="${p.id}">${escHtml(p.model)}</option>`).join('')}</optgroup>`).join('');
  const headOpts = lay.head ? lay.head.map((h, i) => h ? `<option value="${i}" ${i === col.qty ? 'selected' : ''}>${escHtml(h)}</option>` : '').join('') : '';
  const fmtIn = x => `${x.n} ${x.unit}`;
  const cur = pid => stockMap[pid] || {};
  const stOf = r => { const c = cur(r.pid); return otw ? (c.status && c.status !== 'habis' && c.qty !== 0 ? c.status : 'indent') : r.status; };
  const amount = r => { const c = cur(r.pid);
    return (otw ? fmtIn(r.incoming) : (r.qty ?? '—')) + (!otw && c.qty != null && c.qty !== r.qty ? `<div class="muted">sebelumnya ${c.qty}</div>` : '')
      + (r.otwNote ? `<div class="muted" style="color:#5aa9e6">🚚 OTW ${escHtml(r.otwNote)}</div>` : '')
      + (!otw && Object.keys(r.variants || {}).length ? `<div class="muted">${Object.entries(r.variants).map(([v, n]) => `${escHtml(v)}: ${n}`).join(' · ')}</div>` : ''); };

  document.getElementById('imp-preview').innerHTML = `
    <div class="imp-ctrl">
      ${importSrc.sheets.length > 1 ? `<label>Sheet <select class="admin-stock-select" onchange="pickImportSheet(this.value)">${importSrc.sheets.map((s, i) => `<option value="${i}" ${i === importSrc.idx ? 'selected' : ''}>${escHtml(s.name)}</option>`).join('')}</select></label>` : ''}
      <label>Jenis data <select class="admin-stock-select" onchange="setImportMode(this.value)">
        <option value="gudang" ${!otw ? 'selected' : ''}>Stok gudang</option>
        <option value="otw" ${otw ? 'selected' : ''}>Barang OTW (belum datang)</option></select></label>
      ${headOpts ? `<label>Kolom jumlah <select class="admin-stock-select" onchange="setImportQtyCol(this.value)">${headOpts}</select></label>` : ''}
    </div>
    <div class="imp-sum">${escHtml(importSrc.source)}: <b class="ok">${good.length} cocok katalog</b>${bad.length ? ` · <b class="new">${bad.length} produk lain</b> (di luar katalog, ikut disimpan)` : ''}${ignored ? ` · ${ignored} diabaikan` : ''}${skipped ? ` · ${skipped} baris tanpa jumlah dilewati` : ''}</div>
    ${otw ? `<div class="imp-sum imp-warn">⚠ Mode <b>Barang OTW</b>: jumlah dicatat sebagai barang dalam perjalanan, <b>stok gudang tidak berubah</b>. Pastikan file ini memang daftar barang belum datang.${cleared ? ` ${cleared} produk yang sebelumnya OTW tapi tidak ada di daftar ini akan dihapus tanda OTW-nya (dianggap sudah datang).` : ''}</div>` : ''}
    ${bad.length ? `<div class="imp-sum">Produk bertanda ＋ tidak ada di katalog dan akan tampil di grup <b>Produk Lain</b>. Jika ternyata produk katalog dengan kode berbeda, pilih produknya — pilihan diingat untuk import berikutnya.</div>` : ''}
    <div class="imp-scroll"><table class="imp-table">
      <tr><th></th><th>Kode / Produk</th><th>${otw ? 'OTW' : 'Qty'}</th><th>Status</th></tr>
      ${bad.map(r => `<tr class="new">
        <td>＋</td>
        <td>${escHtml(r.raw)}<div><select class="admin-stock-select imp-map" onchange="setImportAlias('${r.key}', this.value === '+' ? '' : this.value)">${opts('+')}</select></div></td>
        <td>${amount(r)}</td><td>${STOCK_LABEL[stOf(r)] || '—'}</td>
      </tr>`).join('')}
      ${good.map(r => `<tr>
        <td>✓</td>
        <td>${escHtml(r.hit.p.name)}<div class="muted">${escHtml(r.hit.b.name)} · ${escHtml(r.hit.p.model)}${normKey(r.raw) !== normKey(r.hit.p.model) ? ` · dari "${escHtml(r.raw)}"` : ''}</div></td>
        <td>${amount(r)}</td><td>${STOCK_LABEL[stOf(r)] || '—'}</td>
      </tr>`).join('')}
    </table></div>
    ${importRows.length || cleared ? `<button class="admin-btn primary" id="imp-save" style="margin-top:10px" onclick="saveImport()">Simpan ${importRows.length} produk${otw ? ' sebagai OTW' : ''}</button>` : ''}`;
  adminMsg('');
}

async function saveImport() {
  if (!importSrc || !supabase) return;
  const otw = importSrc.mode === 'otw';
  const btn = document.getElementById('imp-save');
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  let payload;
  if (otw) {
    const listed = new Set(importRows.map(r => r.pid));
    payload = importRows.map(r => {
      const c = stockMap[r.pid] || {};
      return { product_id: r.pid, incoming: `${r.incoming.n} ${r.incoming.unit}`,
               status: c.status && c.status !== 'habis' && c.qty !== 0 ? c.status : 'indent', qty: c.qty ?? null, note: c.note || '' };
    });
    Object.entries(stockMap).forEach(([pid, c]) => {
      if (c.incoming && !listed.has(pid)) payload.push({ product_id: pid, incoming: null, status: c.status, qty: c.qty ?? null, note: c.note || '' });
    });
  } else {
    // Empty Catatan keeps the existing note instead of wiping it
    // File with a Catatan column is the source of truth for notes (empty cell clears it);
    // without that column the existing notes are kept
    const fileHasOtw = importRows.some(r => r.otwNote);
    payload = importRows.map(r => {
      const row = { product_id: r.pid, status: r.status, qty: r.qty,
        note: importSrc.hasNoteCol ? r.note : (r.note || stockMap[r.pid]?.note || '') };
      if (fileHasOtw) row.incoming = r.otwNote || null;
      return row;
    });
    importRows.forEach(r => Object.entries(r.variants || {}).forEach(([v, n]) =>
      payload.push({ product_id: variantId(r.pid, v), status: n === 0 ? 'habis' : 'ready', qty: n, note: '' })));
  }
  try {
    const { error } = await supabase.from('stock').upsert(payload, { onConflict: 'product_id' });
    if (error) throw error;
    const now = new Date().toISOString();
    payload.forEach(r => { const m = { ...stockMap[r.product_id], ...r, updated_at: now }; stockMap[r.product_id] = { ...m, incoming: r.incoming !== undefined ? (r.incoming || otwFromNote(m.note)) : (m.incoming || otwFromNote(m.note)) }; });
    toggleImport();
    refreshStockUI();
    adminMsg(`✓ ${otw ? 'Data OTW' : 'Stok'} ${importRows.length} produk berhasil diperbarui.`, 'ok');
  } catch (e) {
    btn.disabled = false; btn.textContent = `Simpan ${importRows.length} produk`;
    const m = String(e.message || e);
    adminMsg(/incoming/.test(m)
      ? 'Kolom OTW belum ada di database. Jalankan di Supabase SQL Editor: alter table stock add column if not exists incoming text;'
      : 'Gagal menyimpan: ' + m, 'err');
  }
}
