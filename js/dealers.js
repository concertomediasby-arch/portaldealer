/* Concerto Dealer Portal — js/dealers.js
   Kelola Dealer (khusus Editor, lewat Edge Function manage-dealers).
   Dipisah dari index.html 30 Okt 2026 (tahap 3 pemecahan file). Semua file js/*.js adalah script klasik (bukan module):
   fungsi & const/let tingkat atas terbagi di satu lingkup global, URUTAN MUAT PENTING (lihat <script> di akhir index.html). */

/* ══════════════════════════════════════════
   KELOLA DEALER — khusus Editor, lewat Edge Function "manage-dealers"
   (kunci service role hanya ada di server Supabase, tidak pernah di situs)
══════════════════════════════════════════ */
let dealerUsers = null, dealerEditId = null, dealerCodeTouched = false;
const PORTAL_URL = 'https://dealer.concerto.id';

function randomPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(a, n => chars[n % chars.length]).join('');
}

async function callDealers(action, payload = {}) {
  if (!supabase) throw new Error('Tidak terhubung ke server.');
  const { data, error } = await supabase.functions.invoke('manage-dealers', { body: { action, ...payload } });
  if (error) {
    let msg = error.message || String(error);
    try { const b = await error.context?.json?.(); if (b?.error) msg = b.error; } catch (e) {}
    const status = error.context?.status;
    if (status === 404 || (/not found|404/i.test(msg) && !/tidak ditemukan/i.test(msg)))
      msg = 'Fungsi server "manage-dealers" belum terpasang di Supabase (Edge Functions → nama harus persis "manage-dealers").';
    else if (/failed to send|fetch/i.test(msg))
      msg = 'Tidak bisa menghubungi fungsi "manage-dealers" — fungsi belum ter-deploy, gagal berjalan (cek tab Logs di Supabase), atau koneksi internet terputus.';
    else if (status === 401 && !/sesi/i.test(msg))
      msg = 'Sesi ditolak server (401). Keluar lalu login ulang; jika tetap, cek pengaturan "Verify JWT" fungsi manage-dealers.';
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function openDealers() {
  if (!requireLogin(openDealers)) return;
  if (!isEditor()) { showToast('Menu Kelola Dealer khusus akun Editor.'); return; }
  showView('dealers');
  document.querySelector('.main')?.scrollTo(0, 0);
  document.getElementById('dl-shared').hidden = !SHARED_DEALER_CODE;
  resetDealerForm();
  loadDealers();
}

async function loadDealers() {
  const list = document.getElementById('dl-list');
  if (dealerUsers === null) list.innerHTML = '<div class="dl-empty">Memuat…</div>';
  try {
    dealerUsers = (await callDealers('list')).users || [];
    renderDealers();
  } catch (e) {
    dealerUsers = null;
    list.innerHTML = `<div class="dl-empty dl-err">${escHtml(e.message)}</div>`;
  }
}

const fmtDlDate = d => d ? new Date(d).toLocaleString('id-ID', { day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Asia/Jakarta' }) : '—';

function renderDealers() {
  if (!dealerUsers) return;
  const q = (document.getElementById('dl-search')?.value || '').trim().toLowerCase();
  const dealers = dealerUsers.filter(u => u.role === 'dealer')
    .filter(u => !q || [u.store, u.city, u.email, codeFromEmail(u.email), u.phone].some(v => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.store || a.email).localeCompare(b.store || b.email));
  const staff = dealerUsers.filter(u => u.role !== 'dealer');
  const total = dealerUsers.filter(u => u.role === 'dealer').length;
  document.getElementById('dl-count').textContent = `Daftar dealer (${total})`;
  const row = u => `<div class="dl-row${u.active ? '' : ' off'}">
      <div class="dl-main">
        <div class="dl-store">${escHtml(u.store || '(tanpa nama toko)')}${u.active ? '' : ' <span class="dl-tag off">Nonaktif</span>'}</div>
        <div class="dl-sub">${escHtml([u.city, accountLabel(u), u.phone].filter(Boolean).join(' · '))}</div>
        <div class="dl-sub">Terakhir login: ${fmtDlDate(u.last_sign_in_at)} · Dibuat: ${fmtDlDate(u.created_at)}</div>
      </div>
      <div class="dl-row-actions">
        <button class="dlr-btn ghost" onclick="editDealer('${u.id}')">Edit</button>
        <button class="dlr-btn ghost" onclick="resetDealerPassword('${u.id}')">Reset PIN</button>
        <button class="dlr-btn ghost" onclick="toggleDealer('${u.id}')">${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        <button class="dlr-btn danger" onclick="deleteDealer('${u.id}')">Hapus</button>
      </div>
    </div>`;
  document.getElementById('dl-list').innerHTML =
    (dealers.length ? dealers.map(row).join('') : `<div class="dl-empty">${total ? 'Tidak ada dealer yang cocok.' : 'Belum ada akun dealer. Tambahkan lewat formulir di atas.'}</div>`) +
    (staff.length && !q ? `<div class="dl-staff">Akun staff (tidak bisa diubah dari sini): ${staff.map(u => `${escHtml(u.email)} · ${ROLE_LABEL[u.role] || u.role}`).join(' &nbsp;|&nbsp; ')}</div>` : '');
}

function dealerMsg(text, err) {
  const el = document.getElementById('dl-msg');
  el.textContent = text || ''; el.classList.toggle('err', !!err);
}

function resetDealerForm() {
  dealerEditId = null;
  ['dl-store', 'dl-city', 'dl-phone', 'dl-code'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('dl-password').value = randomPin();
  dealerCodeTouched = false;
  document.getElementById('dl-form-title').textContent = 'Tambah dealer baru';
  document.getElementById('dl-submit').textContent = 'Buat akun dealer';
  document.getElementById('dl-cancel').hidden = true;
  document.querySelectorAll('#dl-form .dl-new').forEach(el => el.hidden = false);
  dealerMsg('');
}

function editDealer(id) {
  const u = dealerUsers?.find(x => x.id === id);
  if (!u) return;
  dealerEditId = id;
  document.getElementById('dl-store').value = u.store;
  document.getElementById('dl-city').value = u.city;
  document.getElementById('dl-phone').value = u.phone;
  document.getElementById('dl-form-title').textContent = `Edit dealer — ${accountLabel(u)}`;
  document.getElementById('dl-submit').textContent = 'Simpan perubahan';
  document.getElementById('dl-cancel').hidden = false;
  document.querySelectorAll('#dl-form .dl-new').forEach(el => el.hidden = true);
  dealerMsg('');
  document.getElementById('dl-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('dl-store').focus();
}

// Usulan kode dari kota + nama toko (mis. Sinar Audio, Surabaya → SUR-SINARAUDIO), selama belum diketik manual
function suggestDealerCode() {
  if (dealerEditId || dealerCodeTouched) return;
  const clean = t => (t || '').toUpperCase().normalize('NFD').replace(/[^A-Z0-9 ]/g, '').trim();
  const city = clean(document.getElementById('dl-city').value).split(/\s+/)[0] || '';
  let store = clean(document.getElementById('dl-store').value).replace(/\s+/g, '');
  if (city) store = store.replace(city, '') || store;
  const code = [city.slice(0, 3), store.slice(0, 14)].filter(Boolean).join('-');
  document.getElementById('dl-code').value = code;
}

async function submitDealerForm() {
  const v = id => document.getElementById(id).value.trim();
  const btn = document.getElementById('dl-submit');
  const store = v('dl-store'), city = v('dl-city'), phone = v('dl-phone');
  if (!store) { dealerMsg('Isi nama toko.', true); return; }
  btn.disabled = true; dealerMsg('Menyimpan…');
  try {
    if (dealerEditId) {
      await callDealers('update', { id: dealerEditId, store, city, phone });
      showToast(`✓ Data ${store} diperbarui.`);
    } else {
      const code = normDealerCode(v('dl-code')), password = v('dl-password');
      if (!validDealerCode(code)) throw new Error('Kode Dealer 3–30 karakter: huruf, angka, dan tanda - (tidak di awal/akhir).');
      if (password.length < 6) throw new Error('PIN minimal 6 karakter.');
      if (dealerUsers?.some(u => codeFromEmail(u.email) === code)) throw new Error(`Kode ${code} sudah dipakai dealer lain.`);
      await callDealers('create', { code, email: loginEmailFor(code), password, store, city, phone });
      showCredentials({ store, email: loginEmailFor(code), password, phone }, 'Akun dealer berhasil dibuat');
    }
    resetDealerForm();
    loadDealers();
  } catch (e) {
    dealerMsg(/minimal 8/i.test(e.message) ? 'Fungsi server "manage-dealers" masih versi lama — deploy ulang dari repo agar PIN 6 karakter diterima.' : e.message, true);
  } finally {
    btn.disabled = false;
  }
}

function credentialMessage(c) {
  return `Halo ${c.store}, berikut akun Concerto Dealer Portal Anda:\n\n` +
    `🔗 ${PORTAL_URL}\n` +
    (codeFromEmail(c.email) ? `🏷️ Kode Dealer: ${codeFromEmail(c.email)}\n🔑 PIN: ${c.password}\n\n` : `📧 Email: ${c.email}\n🔑 Password: ${c.password}\n\n`) +
    `Login lewat ikon akun di kanan atas portal untuk membuka Stok Produk & Panduan Dealer. Mohon jaga kerahasiaan akun ini. Terima kasih — Concerto Audio Indonesia`;
}

function showCredentials(c, title) {
  const box = document.getElementById('dl-cred');
  const msg = credentialMessage(c);
  const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g, '').replace(/^0/, '62')}?text=${encodeURIComponent(msg)}` : '';
  box.hidden = false;
  box.innerHTML = `
    <div class="dl-card-title">✓ ${escHtml(title)}</div>
    <div class="dl-sub">Kirim data login ini ke dealer. PIN tidak bisa dilihat lagi setelah kotak ini ditutup.</div>
    <pre class="dl-pre">${escHtml(msg)}</pre>
    <div class="dl-actions">
      <button class="dlr-btn primary" onclick="copyCredentials()">Salin pesan</button>
      ${wa ? `<a class="dlr-btn ghost" href="${wa}" target="_blank" rel="noopener">Kirim via WhatsApp</a>` : ''}
      <button class="dlr-btn ghost" onclick="document.getElementById('dl-cred').hidden = true">Tutup</button>
    </div>`;
  box.dataset.msg = msg;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function copyCredentials() {
  const msg = document.getElementById('dl-cred').dataset.msg || '';
  try { await navigator.clipboard.writeText(msg); showToast('Pesan login disalin.'); }
  catch (e) { showToast('Tidak bisa menyalin otomatis — blok teksnya lalu salin manual.'); }
}

async function resetDealerPassword(id) {
  const u = dealerUsers?.find(x => x.id === id);
  const isCode = !!codeFromEmail(u?.email);
  if (!u || !confirm(`Buat ${isCode ? 'PIN' : 'password'} baru untuk ${u.store || accountLabel(u)}? ${isCode ? 'PIN' : 'Password'} lama tidak berlaku lagi.`)) return;
  const password = isCode ? randomPin() : randomPassword();
  try {
    await callDealers('reset_password', { id, password });
    showCredentials({ store: u.store || u.email, email: u.email, password, phone: u.phone }, isCode ? 'PIN baru dibuat' : 'Password baru dibuat');
  } catch (e) { showToast('Gagal reset: ' + e.message, 8000); }
}

async function toggleDealer(id) {
  const u = dealerUsers?.find(x => x.id === id);
  if (!u) return;
  if (u.active && !confirm(`Nonaktifkan ${u.store || u.email}? Dealer ini tidak bisa login sampai diaktifkan lagi.`)) return;
  try {
    await callDealers('set_active', { id, active: !u.active });
    showToast(u.active ? `${u.store || u.email} dinonaktifkan.` : `${u.store || u.email} diaktifkan kembali.`);
    loadDealers();
  } catch (e) { showToast('Gagal mengubah status: ' + e.message, 8000); }
}

async function deleteDealer(id) {
  const u = dealerUsers?.find(x => x.id === id);
  if (!u || !confirm(`Hapus akun ${u.store || accountLabel(u)} (${accountLabel(u)}) secara permanen?\n\nSaran: pilih "Nonaktifkan" jika mungkin akan dipakai lagi.`)) return;
  try {
    await callDealers('delete', { id });
    showToast(`Akun ${u.store || u.email} dihapus.`);
    if (dealerEditId === id) resetDealerForm();
    loadDealers();
  } catch (e) { showToast('Gagal menghapus: ' + e.message, 8000); }
}
