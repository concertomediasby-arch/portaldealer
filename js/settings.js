// ── MENU SETTING (4 Nov 2026, permintaan pemilik) ──
// Satu tempat untuk semua pengaturan di HP/browser ini: 🔔 Notifikasi (semua pilihan), ⏰ Pengingat tayang (Editor),
// 🔔 produk dipantau, 📲 pasang CAI Hub di Layar Utama, tampilan (tema & musik latar), dan akun.
// Menu lain (News, Academy, Concerto Way, Panduan, Stok) kini hanya menampilkan tautan kecil ke sini (pnHtml(where) di js/push.js).

function openSettings() {
  showView('settings');
  renderSettings();
  if (authUser && typeof swLoad === 'function') swLoad();
  const m = document.querySelector('.main'); if (m) m.scrollTop = 0; window.scrollTo(0, 0);
}
function setRow(ico, title, sub, ctrl) {
  return `<div class="set-row"><span class="set-ico">${ico}</span><div class="set-tx"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><div class="set-ctl">${ctrl}</div></div>`;
}
function setSwitch(on, fn, label) {
  return `<button class="set-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" onclick="${fn}"><i></i></button>`;
}
function setAppHtml() {
  if (insStandalone()) return setRow('📲', 'CAI Hub terpasang di Layar Utama', 'Sedang dibuka dari ikon CAI Hub di HP ini.', '<span class="set-ok">✅</span>');
  if (insIos() || insAndroid()) return setRow('📲', 'Pasang CAI Hub di Layar Utama', 'Buka katalog dengan 1 ketuk' + (insIos() ? ' — di iPhone juga syarat agar notifikasi bisa aktif.' : ' dan terima notifikasi.'),
    `<button class="gt-btn" onclick="insOpen(true)">Pasang</button>`);
  return setRow('📲', 'Aplikasi CAI Hub di HP', 'Buka <b>hub.concerto.id</b> di HP, lalu pasang ke Layar Utama dari menu Setting di HP.', '');
}
function renderSettings() {
  const el = document.getElementById('settings-body'); if (!el) return;
  const light = isLightTheme(), music = pmPref();
  const acct = authUser
    ? setRow('👤', `Masuk sebagai ${escHtml(ROLE_LABEL[userRole()] || 'Partner')}`, isAdmin() ? escHtml(accountLabel(authUser)) : 'Akun partner CAI (Kode Akses).', `<button class="gt-btn ghost" onclick="doLogout()">Keluar</button>`)
    : setRow('🔑', 'Partner resmi CAI?', 'Masuk dengan Kode Akses untuk stok, Panduan Partner, Concerto Way & notifikasi khusus partner.', `<button class="gt-btn" onclick="openLogin()">Masuk</button>`);
  el.innerHTML = `
    <section class="set-sec"><h3>🔔 Notifikasi</h3>${pnHtml('settings')}${typeof cwPushHtml === 'function' ? cwPushHtml() : ''}</section>
    <section class="set-sec"><h3>📲 Aplikasi</h3><div class="set-card">${setAppHtml()}</div></section>
    <section class="set-sec"><h3>🎨 Tampilan</h3><div class="set-card">
      ${setRow(light ? '☀️' : '🌙', 'Mode terang', light ? 'Tampilan terang sedang dipakai.' : 'Tampilan gelap sedang dipakai.', setSwitch(light, 'toggleTheme(); renderSettings()', 'Mode terang'))}
      ${setRow('🎵', 'Musik latar portal', 'Musik santai bebas royalti, berhenti sendiri saat video diputar.', setSwitch(music, 'toggleMusic(); renderSettings()', 'Musik latar'))}
    </div></section>
    <section class="set-sec"><h3>👤 Akun</h3><div class="set-card">${acct}</div></section>
    <p class="set-foot">Pengaturan ini berlaku untuk HP / browser ini saja.</p>`;
}
// Dipanggil saat status login berubah — isi Setting mengikuti akun (pilihan notifikasi khusus partner, tombol Masuk/Keluar)
function settingsAuthChanged() { if (document.getElementById('view-settings')?.classList.contains('active')) renderSettings(); }
