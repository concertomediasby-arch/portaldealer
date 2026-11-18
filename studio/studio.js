/* ══════════════════════════════════════════
   CAI HUB STUDIO — panel kerja khusus Editor di /studio/ (18 Nov 2026, permintaan pemilik — pratinjau .mockup/studio/ disetujui).
   Tahap 1: Beranda · Jadwal tayang · Katalog Produk (form js/catedit.js) · News. Tahap 2: Concerto Way. Tahap 3: Academy. Tahap 4: Galeri Instalasi. Tahap 5: Panduan Partner. Menu lain = portal disematkan (stEmbed, #m/<menu>).
   Sesi login sama dengan portal (supabase-js menyimpan sesi per domain), jadi Editor yang sudah login di portal langsung masuk.
   Hanya role `editor`; akun lain melihat layar "Khusus Editor". Data & aturan sama dengan portal — hanya SRP.
══════════════════════════════════════════ */
const SUPA_URL = 'https://cvffltbxsaiugccexmtf.supabase.co';
const SUPA_KEY = 'sb_publishable_Y4AMvOdGfunEZhvvpsMzbg_NBbxNqGW';
const TURNSTILE_SITE_KEY = '0x4AAAAAAFsZqb8OVeHuLCXo';
const STUDIO_ACCOUNT = 'concertomediasby@gmail.com';
let supabase = null, authUser = null;

// ── Pembantu yang juga dipakai js/catedit.js (nama sama dengan portal) ──
const userRole = () => authUser?.app_metadata?.role || 'dealer';
const isEditor = () => userRole() === 'editor';
const fmtRp = n => 'Rp ' + Number(n).toLocaleString('id-ID');
const fmtNum = n => Number(n || 0).toLocaleString('id-ID');
const hasPrice = p => !!(p.price || (p.priceList && Object.keys(p.priceList).length));
const srpFrom = p => !p.price && hasPrice(p);
const srpAmount = p => p.price || (hasPrice(p) ? Math.min(...Object.values(p.priceList)) : 0);
const eolTag = p => p.soon ? '<span class="eol-tag soon-tag">COMING SOON</span>' : '';
const srpRow = p => hasPrice(p) ? `<div class="product-price-row"><span class="pp-tag">${srpFrom(p) ? 'Mulai' : 'SRP'}</span><span class="product-price">${fmtRp(srpAmount(p))}${p.priceUnit ? `<small> / ${p.priceUnit}</small>` : ''}</span></div>` : '';
let currentBrandId = null, currentProductId = null;
function showToast(t, ms = 3500) { const el = document.getElementById('st-toast'); el.textContent = t; el.classList.add('on'); clearTimeout(showToast.t); showToast.t = setTimeout(() => el.classList.remove('on'), ms); }
function dashErr(e, what) { showToast(`⚠ Gagal ${what}: ` + (e?.message || e), 8000); }
function glResize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b && b.type === 'image/webp' ? res(b) : c.toBlob(j => j ? res(j) : rej(new Error('Gagal memproses foto')), 'image/jpeg', .85), 'image/webp', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar: ' + file.name)); };
    img.src = url;
  });
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pubUrl = path => path ? `${SUPA_URL}/storage/v1/object/public/showcase/${String(path).split('#')[0]}` : '';
const todayWIB = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);
const wibDate = (ms, o) => new Date(ms).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', ...o });
const PRODS = () => BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => ({ b, l, p }))));
// Aktivitas di Studio ikut menunda "keluar otomatis" portal (portal membaca kunci yang sama)
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, () => { const n = Date.now(); if (n - (stTouch.t || 0) > 15000) { stTouch.t = n; try { localStorage.setItem('cai-last-active', String(n)); } catch (e) {} } }, { passive: true, capture: true }));
function stTouch() {}

// ── Menu ──
const ST_NAV = [
  { id: 'home', i: '◧', t: 'Beranda' }, { id: 'jadwal', i: '⏰', t: 'Jadwal tayang' },
  { g: 'Konten' }, { id: 'news', i: '📰', t: 'News' },
  { id: 'cway', i: '☕', t: 'Concerto Way' }, { id: 'academy', i: '🎓', t: 'Academy' },
  { id: 'galeri', i: '🚗', t: 'Galeri Instalasi' }, { id: 'guides', i: '📘', t: 'Panduan Partner' },
  { g: 'Katalog' }, { id: 'produk', i: '🔊', t: 'Produk' }, { m: 'paket', i: '📦', t: 'Paket Audio' }, { m: 'stock', i: '📊', t: 'Stok' },
  { g: 'Partner' }, { m: 'partner', i: '🏪', t: 'Enthusiast Partner' }, { m: 'dealers', i: '🔑', t: 'Akun & Kode Akses' },
  { g: 'Laporan' }, { m: 'visitors', i: '📈', t: 'Pengunjung & Minat' }, { m: 'rapor', i: '📊', t: 'Rapor Bulanan' }, { m: 'prapor', i: '📨', t: 'Laporan Partner' },
];
function stNavHtml(cur) {
  return ST_NAV.map(n => n.g ? `<div class="st-grp">${n.g}</div>`
    : n.m ? `<a class="st-nav${cur === 'm/' + n.m ? ' on' : ''}" href="#m/${n.m}" onclick="stMenu(false)"><span class="i">${n.i}</span>${n.t}</a>`
    : `<a class="st-nav${cur === n.id ? ' on' : ''}" href="#${n.id}" onclick="stMenu(false)"><span class="i">${n.i}</span>${n.t}${n.id === 'jadwal' && stCache.sched ? `<span class="n">${stCache.sched.length}</span>` : ''}</a>`).join('');
}
function stMenu(on) { document.getElementById('st-app').classList.toggle('menu', !!on); }
function stNewMenu(e) {
  e.stopPropagation();
  const m = document.getElementById('st-newmenu');
  m.innerHTML = `<a href="#news/new">📰 Berita</a><a href="#" onclick="ceOpen(null);return false">🔊 Produk</a>
    <a href="#cway/new">☕ Concerto Way</a><a href="#academy/new">🎓 Materi Academy</a><a href="#guides/new">📘 PDF Panduan</a><a href="#galeri/new">🚗 Instalasi Galeri</a>`;
  m.classList.toggle('on');
}
addEventListener('click', () => document.getElementById('st-newmenu')?.classList.remove('on'));
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.getElementById('st-q')?.focus(); } });

// ── Login (sesi bersama portal) ──
async function stInit() {
  if (!window.supabase?.createClient) { document.getElementById('st-gate-body').innerHTML = '<h2>Tidak bisa terhubung</h2><p class="st-mu">Pustaka database gagal dimuat. Periksa koneksi internet lalu muat ulang halaman.</p>'; return; }
  supabase = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  const { data } = await supabase.auth.getSession();
  authUser = data?.session?.user || null;
  supabase.auth.onAuthStateChange((_e, s) => { const u = s?.user || null; if ((u?.id || '') !== (authUser?.id || '')) { authUser = u; stGate(); } });
  stGate();
}
function stGate() {
  const gate = document.getElementById('st-gate'), app = document.getElementById('st-app'), body = document.getElementById('st-gate-body');
  if (authUser && isEditor()) { gate.hidden = true; app.hidden = false; document.getElementById('st-email').textContent = authUser.email || ''; stRoute(); return; }
  app.hidden = true; gate.hidden = false;
  if (authUser) {
    body.innerHTML = `<h2>Khusus Editor</h2><p class="st-mu">Akun ini (${esc(authUser.email || 'partner')}) tidak punya akses ke CAI Hub Studio.</p>
      <div class="st-row2"><a class="st-btn" href="/">← Ke CAI Hub</a><button class="st-btn pri" onclick="stLogout()">Keluar</button></div>`;
    return;
  }
  body.innerHTML = `<h2>Masuk ke Studio</h2><p class="st-mu">Khusus Editor CAI Hub.</p>
    <label class="st-fl">Email<input class="st-in" id="st-le" type="email" value="${STUDIO_ACCOUNT}" autocomplete="username"></label>
    <label class="st-fl">Password<input class="st-in" id="st-lp" type="password" autocomplete="current-password" onkeydown="if(event.key==='Enter')stLogin()"></label>
    <div id="st-cap" class="st-cap"></div>
    <button class="st-btn pri st-wide" id="st-lb" onclick="stLogin()">Masuk</button><p class="st-err" id="st-lerr"></p>
    <a class="st-mu" href="/" style="display:block;margin-top:14px;font-size:13px">← Kembali ke CAI Hub</a>`;
  setTimeout(() => document.getElementById('st-lp')?.focus(), 50);
}
let tsLoading = null, tsWid = null;
function tsLoad() {
  if (window.turnstile) return Promise.resolve();
  return tsLoading || (tsLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async = true; s.onload = res; s.onerror = () => { tsLoading = null; rej(new Error('Verifikasi keamanan tidak bisa dimuat.')); }; document.head.appendChild(s); }));
}
async function stCaptcha() {
  await tsLoad();
  if (tsWid != null) { try { turnstile.remove(tsWid); } catch (e) {} tsWid = null; }
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('Verifikasi keamanan terlalu lama — coba lagi.')), 90000);
    tsWid = turnstile.render(document.getElementById('st-cap'), { sitekey: TURNSTILE_SITE_KEY, appearance: 'interaction-only', size: 'flexible', language: 'id',
      callback: tok => { clearTimeout(t); res(tok); }, 'error-callback': () => { clearTimeout(t); rej(new Error('Verifikasi keamanan gagal — coba lagi.')); } });
  });
}
async function stLogin() {
  const email = document.getElementById('st-le').value.trim(), password = document.getElementById('st-lp').value, btn = document.getElementById('st-lb'), err = document.getElementById('st-lerr');
  if (!email || !password) { err.textContent = 'Isi email & password.'; return; }
  btn.disabled = true; btn.textContent = '⏳ Memeriksa…'; err.textContent = '';
  try {
    try { localStorage.setItem('cai-last-active', String(Date.now())); } catch (e) {}
    const captchaToken = await stCaptcha();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) throw error;
    authUser = data.user; stGate();
  } catch (e) { err.textContent = /invalid login/i.test(e.message) ? 'Email atau password salah.' : e.message; btn.disabled = false; btn.textContent = 'Masuk'; }
}
async function stLogout() { try { await supabase.auth.signOut({ scope: 'local' }); } catch (e) {} authUser = null; stGate(); }

// ── Routing (#home, #jadwal, #produk, #news, #news/new, #news/<id>) ──
addEventListener('hashchange', () => stRoute());
function stRoute() {
  if (!authUser || !isEditor()) return;
  const h = (location.hash || '#home').slice(1), [pg, arg] = h.split('/');
  const cur = pg === 'm' && STUDIO_EMBED[arg] ? 'm/' + arg : ST_PAGES.includes(pg) ? pg : 'home';
  document.getElementById('st-nav').innerHTML = stNavHtml(cur);
  document.getElementById('st-bnav').innerHTML = [['home', '◧', 'Beranda'], ['jadwal', '⏰', 'Jadwal'], ['cway', '☕', 'C. Way'], ['news', '📰', 'News']]
    .map(([id, i, t]) => `<a href="#${id}" class="${cur === id ? 'on' : ''}"><b>${i}</b>${t}</a>`).join('') + `<a href="#" onclick="stMenu(true);return false"><b>☰</b>Menu</a>`;
  document.querySelector('.st-main').scrollTo?.(0, 0); scrollTo(0, 0);
  if (pg === 'm' && STUDIO_EMBED[arg]) return stEmbed(arg);
  if (cur === 'news' && arg) return stNewsEdit(arg === 'new' ? null : arg);
  if (cur === 'cway' && arg) return stCwEdit(arg === 'new' ? null : arg);
  if (cur === 'academy' && arg === 'new') return stAcadNew();
  if (cur === 'galeri' && arg) return stGlEdit(arg === 'new' ? null : arg);
  if (cur === 'guides' && arg === 'new') return stGdNew(h.split('/')[2]);
  ({ home: stHome, jadwal: stJadwal, produk: stProduk, news: stNews, cway: stCway, academy: stAcademy, galeri: stGaleri, guides: stGuides })[cur]();
}
const ST_PAGES = ['home', 'jadwal', 'produk', 'news', 'cway', 'academy', 'galeri', 'guides'];
const stPage = html => { const p = document.getElementById('st-page'); p.classList.remove('emb'); p.innerHTML = html; };
const stCache = {};

// ── Data jadwal (dipakai Beranda & Jadwal) ──
const SK = { cway: ['☕', 'Concerto Way', '#B8893A'], gl: ['🚗', 'Galeri', '#2F6BCB'], guide: ['📘', 'Panduan Partner', '#1F9D6B'], prod: ['🆕', 'Pengumuman produk', '#C8463B'], acad: ['🎓', 'Academy', '#7A4FD0'] };
async function stLoadSched(force) {
  if (stCache.sched && !force && Date.now() - stCache.schedAt < 60000) return stCache.sched;
  const now = new Date().toISOString(), out = [];
  const [cw, gl, gd, pp, ac] = await Promise.all([
    supabase.from('concerto_way').select('id, day, title, series, publish_at').eq('published', true).gt('publish_at', now).order('publish_at'),
    supabase.from('showcase_installs').select('id, car_make, car_model, dealer, publish_at').eq('published', true).gt('publish_at', now).order('publish_at'),
    supabase.from('guide_schedule').select('id, title, publish_at, error').is('done_at', null).order('publish_at'),
    supabase.from('product_push').select('id, product_id, title, publish_at').is('sent_at', null).order('publish_at'),
    fetch(pubUrl('academy/items.json') + '?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : { items: [] }).catch(() => ({ items: [] })),
  ]);
  (cw.data || []).forEach(x => out.push({ k: 'cway', at: Date.parse(x.publish_at), t: (x.day != null ? `Day ${x.day} · ` : '') + x.title, s: x.series || '', href: '#cway/' + x.id }));
  (gl.data || []).forEach(x => out.push({ k: 'gl', at: Date.parse(x.publish_at), t: `${x.car_make || ''} ${x.car_model || ''}`.trim(), s: x.dealer || '', href: '#galeri/' + x.id }));
  (gd.data || []).forEach(x => out.push({ k: 'guide', at: Date.parse(x.publish_at), t: x.title, s: x.error ? '⚠ ' + x.error : '', err: !!x.error, href: '#guides' }));
  (pp.data || []).forEach(x => out.push({ k: 'prod', at: Date.parse(x.publish_at || now), t: x.title || x.product_id, s: x.product_id }));
  (ac.items || []).filter(a => a.at && Date.parse(a.at) > Date.now()).forEach(a => out.push({ k: 'acad', at: Date.parse(a.at), t: `#${a.no} · ${a.title}`, s: a.series || '', href: '#academy' }));
  out.sort((a, b) => a.at - b.at);
  stCache.sched = out; stCache.schedAt = Date.now(); stCache.cwLast = (cw.data || []).slice(-1)[0] || null;
  return out;
}
function stSchedList(items, max) {
  if (!items.length) return '<p class="st-empty">Belum ada konten terjadwal.</p>';
  let day = '', h = '';
  const dkey = ms => wibDate(ms, { weekday: 'long', day: 'numeric', month: 'long' });
  const today = dkey(Date.now()), tom = dkey(Date.now() + 864e5);
  for (const x of items.slice(0, max || 999)) {
    const d = dkey(x.at);
    if (d !== day) { day = d; h += `<div class="st-day">${d === today ? 'Hari ini' : d === tom ? 'Besok' : d}</div>`; }
    const [ic, nm, col] = SK[x.k];
    h += `<${x.href ? `a href="${x.href}"` : 'div'} class="st-ev"><span class="h">${wibDate(x.at, { hour: '2-digit', minute: '2-digit' }).replace(':', '.')}</span><span class="bar" style="background:${col}"></span>
      <div class="tx"><b>${ic} ${esc(x.t)}</b><small>${nm}${x.s ? ' · ' + esc(x.s) : ''}</small></div>${x.err ? '<span class="st-pill red">Gagal</span>' : '<span class="st-pill ok">Siap</span>'}</${x.href ? 'a' : 'div'}>`;
  }
  return h;
}

// ── BERANDA ──
async function stHome() {
  const jam = +wibDate(Date.now(), { hour: 'numeric', hour12: false });
  const sapa = jam < 11 ? 'pagi' : jam < 15 ? 'siang' : jam < 18 ? 'sore' : 'malam';
  stPage(`<div class="st-ph"><div><p>${wibDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h1>Selamat ${sapa}, Editor 👋</h1></div></div>
    <div class="st-kpis" id="st-kpis">${[1, 2, 3, 4].map(() => '<div class="st-card st-kpi"><div class="l">⏳</div><div class="v">…</div></div>').join('')}</div>
    <div class="st-g2"><div class="st-col"><div class="st-card"><div class="st-ch"><h3>📥 Perlu tindakan</h3></div><div id="st-todo"><p class="st-empty">⏳ Memeriksa…</p></div></div>
      <div class="st-card"><div class="st-ch"><h3>⚡ Buat cepat</h3></div><div class="st-quick">
        <a class="st-qb" href="#news/new"><b>📰</b>Berita</a><a class="st-qb" href="#" onclick="ceOpen(null);return false"><b>🔊</b>Produk</a>
        <a class="st-qb" href="#cway/new"><b>☕</b>Concerto Way</a><a class="st-qb" href="#academy/new"><b>🎓</b>Academy</a>
        <a class="st-qb" href="#galeri/new"><b>🚗</b>Galeri</a><a class="st-qb" href="#m/stock"><b>📊</b>Stok </a></div></div></div>
      <div class="st-card"><div class="st-ch"><h3>⏰ Jadwal tayang</h3><a href="#jadwal">Semua ›</a></div><div class="st-tl" id="st-hsched"><p class="st-empty">⏳ Memuat…</p></div></div></div>`);
  const [vis, int, sched, stock, pend] = await Promise.all([
    supabase.rpc('site_visit_stats', { p_days: 7 }).then(r => r.error ? null : (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)).catch(() => null),
    supabase.rpc('interest_stats', { p_days: 7 }).then(r => r.error ? null : (typeof r.data === 'string' ? JSON.parse(r.data) : r.data)).catch(() => null),
    stLoadSched(true).catch(() => []),
    supabase.from('stock').select('product_id, status, qty').then(r => r.data || []).catch(() => []),
    supabase.from('showcase_installs').select('id', { count: 'exact', head: true }).eq('published', false).in('source', ['dealer', 'admin']).then(r => r.count || 0).catch(() => 0),
  ]);
  if (!document.getElementById('st-kpis')) return;
  const ids = new Set(PRODS().map(x => x.p.id));
  const habis = stock.filter(s => ids.has(s.product_id) && s.status === 'habis').length;
  const td = vis?.daily?.find(x => x.day === vis.today);
  const in7 = sched.filter(x => x.at < Date.now() + 7 * 864e5).length;
  const tr = (v, v0) => v0 ? (v >= v0 ? `<span class="up">▲ ${fmtNum(v - v0)}</span>` : `<span class="dn">▼ ${fmtNum(v0 - v)}</span>`) + ' vs periode lalu' : '&nbsp;';
  const spark = arr => arr?.length ? `<div class="st-spark">${arr.map((n, i, a) => `<i style="height:${Math.max(6, n / Math.max(1, ...a) * 100)}%"${i === a.length - 1 ? ' class="on"' : ''}></i>`).join('')}</div>` : '';
  const daily = (vis?.daily || []).slice().sort((a, b) => a.day < b.day ? -1 : 1).slice(-7).map(d => +d.visitors || 0);
  document.getElementById('st-kpis').innerHTML = `
    <div class="st-card st-kpi"><div class="l">Pengunjung hari ini</div><div class="v">${vis ? fmtNum(td?.visitors) : '—'}</div><div class="d">${vis ? `7 hari: ${fmtNum(vis.v7)} orang` : 'data belum tersedia'}</div>${spark(daily)}</div>
    <div class="st-card st-kpi"><div class="l">Klik ke partner (7 hari)</div><div class="v">${int ? fmtNum(int.tot?.click) : '—'}</div><div class="d">${int ? tr(+int.tot?.click || 0, +int.tot?.click0 || 0) : 'data belum tersedia'}</div></div>
    <div class="st-card st-kpi"><div class="l">Terjadwal 7 hari</div><div class="v">${in7}</div><div class="d">dari ${sched.length} konten terjadwal</div></div>
    <div class="st-card st-kpi"><div class="l">Produk stok habis</div><div class="v">${fmtNum(habis)}</div><div class="d"><a href="#m/stock">Lihat di menu Stok </a></div></div>`;
  document.getElementById('st-hsched').innerHTML = stSchedList(sched, 7);
  // Perlu tindakan
  const todo = [];
  const last = stCache.cwLast, days = last ? Math.floor((Date.parse(last.publish_at) - Date.now()) / 864e5) : -1;
  if (days < 5) todo.push(['☕', 'red', last ? `Antrian Concerto Way habis ${days <= 0 ? 'hari ini' : days + ' hari lagi'}` : 'Antrian Concerto Way kosong',
    last ? `Terjadwal terakhir: ${last.day != null ? 'Day ' + last.day : esc(last.title)} · ${wibDate(Date.parse(last.publish_at), { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Belum ada Day yang dijadwalkan', '#cway/new', '＋ Tambah Day']);
  if (pend) todo.push(['🚗', 'warn', `${pend} kiriman Galeri menunggu persetujuan`, 'Kiriman foto/video dari partner', '#galeri', 'Tinjau']);
  sched.filter(x => x.err).forEach(x => todo.push(['📘', 'red', 'PDF Panduan gagal dipindah', esc(x.t), '#guides', 'Periksa']));
  const d = new Date(Date.now() + 7 * 36e5);
  if (d.getUTCDate() >= 3) {
    const pm = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
    const g = await supabase.from('gsc_monthly').select('month').eq('month', pm).maybeSingle().then(r => r, () => ({ error: true }));
    if (!g?.error && !g?.data) todo.push(['🔎', 'gold', `Isi angka Google Search ${new Date(pm + '-01').toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`, 'Rapor Bulanan · dari Search Console', '#m/rapor', 'Isi']);
  }
  const el = document.getElementById('st-todo'); if (!el) return;
  el.innerHTML = todo.length ? todo.map(([ic, c, t, s, href, b]) => `<div class="st-row"><span class="st-ic ${c}">${ic}</span><div class="tx"><b>${t}</b><small>${s}</small></div><a class="st-btn" href="${href}">${b}</a></div>`).join('')
    : '<p class="st-empty">✅ Semua beres — tidak ada yang perlu ditindaklanjuti.</p>';
  stRefreshNavBadge();
}
function stRefreshNavBadge() { const h = (location.hash || '#home').slice(1).split('/')[0]; const a = (location.hash || '').slice(1).split('/')[1]; document.getElementById('st-nav').innerHTML = stNavHtml(h === 'm' && STUDIO_EMBED[a] ? 'm/' + a : ST_PAGES.includes(h) ? h : 'home'); }

// ── JADWAL ──
let stSchedK = 'all';
async function stJadwal() {
  stPage(`<div class="st-ph"><div><p>Semua menu</p><h1>Jadwal tayang</h1></div><button class="st-btn" style="margin-left:auto" onclick="stLoadSched(true).then(stJadwalPaint)">↻ Muat ulang</button></div>
    <div class="st-card"><div class="st-filters" id="st-jf"></div><div class="st-tl" id="st-jl"><p class="st-empty">⏳ Memuat…</p></div></div>
    <p class="st-note">Ubah jadwal tiap konten lewat menunya di Studio. Waktu dalam WIB.</p>`);
  await stLoadSched(); stJadwalPaint(); stRefreshNavBadge();
}
function stJadwalPaint() {
  const all = stCache.sched || [], f = document.getElementById('st-jf'); if (!f) return;
  f.innerHTML = `<button class="st-chip${stSchedK === 'all' ? ' on' : ''}" onclick="stSchedK='all';stJadwalPaint()">Semua ${all.length}</button>` +
    Object.entries(SK).map(([k, [ic, nm]]) => { const n = all.filter(x => x.k === k).length; return n ? `<button class="st-chip${stSchedK === k ? ' on' : ''}" onclick="stSchedK='${k}';stJadwalPaint()">${ic} ${nm} ${n}</button>` : ''; }).join('');
  document.getElementById('st-jl').innerHTML = stSchedList(stSchedK === 'all' ? all : all.filter(x => x.k === stSchedK));
}

// ── PRODUK ──
let stPB = 'all', stPQ = '';
const stNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function stProduk() {
  stPage(`<div class="st-ph"><div><p>Katalog</p><h1>Produk</h1></div><div class="st-acts"><button class="st-btn gold" onclick="ceOpen(null, stPB !== 'all' ? stPB : null)">＋ Tambah produk</button></div></div>
    <div class="st-card"><div class="st-filters" id="st-pf"></div><div class="st-tw"><table class="st-tbl"><thead><tr><th>Produk</th><th class="st-hm">Brand · Line</th><th class="st-hm">Kategori</th><th>SRP</th><th class="st-hm">Status</th><th></th></tr></thead><tbody id="st-ptb"></tbody></table></div>
    <div class="st-tfoot" id="st-pfoot"></div></div>`);
  if (!stCache.stock) supabase.from('stock').select('product_id, status, qty').then(r => { stCache.stock = Object.fromEntries((r.data || []).map(s => [s.product_id, s])); stProdukPaint(); });
  stProdukPaint();
}
function stProdukPaint() {
  const f = document.getElementById('st-pf'); if (!f) return;
  const all = PRODS();
  f.innerHTML = `<button class="st-chip${stPB === 'all' ? ' on' : ''}" onclick="stPB='all';stProdukPaint()">Semua ${all.length}</button>` +
    BRANDS.map(b => `<button class="st-chip${stPB === b.id ? ' on' : ''}" onclick="stPB='${b.id}';stProdukPaint()">${esc(b.name)}</button>`).join('') +
    `<label class="st-search sm"><span>🔍</span><input placeholder="Cari model…" value="${esc(stPQ)}" oninput="stPQ=this.value;stProdukRows()"></label>`;
  stProdukRows();
}
function stProdukRows() {
  const q = stNorm(stPQ);
  const rows = PRODS().filter(x => (stPB === 'all' || x.b.id === stPB) && (!q || stNorm(x.p.name + x.p.model + x.p.id + x.l.name + x.p.category).includes(q)));
  const stk = stCache.stock || {};
  const stTag = id => { const s = stk[id]; if (!s) return ''; return s.status === 'ready' ? `<span class="st-pill ok">Ready${s.qty != null ? ' · ' + s.qty : ''}</span>` : s.status === 'indent' ? '<span class="st-pill warn">Indent</span>' : '<span class="st-pill red">Habis</span>'; };
  document.getElementById('st-ptb').innerHTML = rows.map(({ b, l, p }) => {
    const ph = (p.photos || [p.photo]).filter(Boolean)[0];
    const price = hasPrice(p) ? (srpFrom(p) ? 'mulai ' : '') + fmtRp(srpAmount(p)) + (p.priceUnit ? ` <small>/ ${esc(p.priceUnit)}</small>` : '') : '<span class="st-mu">—</span>';
    return `<tr><td><div class="st-pr"><span class="st-th">${ph ? `<img src="${esc(ph)}" alt="" loading="lazy">` : esc(p.emoji || '🔊')}</span><div><b>${esc(p.name)}</b><small>${esc(p.id)}</small></div></div></td>
      <td class="st-hm">${esc(b.name)}<small>${esc(l.name)}</small></td><td class="st-hm">${esc(p.category)}</td><td class="st-price">${price}</td>
      <td class="st-hm">${CE_PENDING.has(p.id) ? '<span class="st-pill gold">⏳ Menunggu tayang</span> ' : ''}${p.soon ? '<span class="st-pill blue">COMING SOON</span> ' : ''}${stTag(p.id)}</td>
      <td class="st-tact"><a class="st-btn sm st-hm" href="/?p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener" title="Lihat di situs">↗</a><button class="st-btn sm" onclick="ceOpen('${p.id}')">✏️ Edit</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="st-empty">Tidak ada produk yang cocok.</td></tr>';
  document.getElementById('st-pfoot').textContent = `${rows.length} produk · Simpan = tayang di situs ±2–3 menit (kartu WA & halaman Google ikut diperbarui). Hapus produk: minta lewat Claude.`;
}
function studioRefresh() { if ((location.hash || '').startsWith('#produk')) stProdukRows(); }   // dipanggil js/catedit.js setelah menyimpan

// ── NEWS ──
const NEWS_CATS = ['Product', 'Event', 'Promo', 'Info'];
async function stLoadNews(force) {
  if (stCache.news && !force) return stCache.news;
  const { data, error } = await supabase.from('cai_news').select('*').order('post_date', { ascending: false }).order('created_at', { ascending: false });
  if (error) throw error; stCache.news = data || []; return stCache.news;
}
async function stNews() {
  stPage(`<div class="st-ph"><div><p>Konten</p><h1>News</h1></div><div class="st-acts"><a class="st-btn gold" href="#news/new">＋ Tulis berita</a></div></div>
    <div class="st-card"><div class="st-filters"><label class="st-search sm" style="margin-left:0"><span>🔍</span><input id="st-nq" placeholder="Cari judul…" oninput="stNewsRows()"></label></div><div id="st-nl"><p class="st-empty">⏳ Memuat…</p></div></div>`);
  try { await stLoadNews(true); stNewsRows(); } catch (e) { document.getElementById('st-nl').innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
function stNewsRows() {
  const el = document.getElementById('st-nl'); if (!el) return;
  const q = (document.getElementById('st-nq')?.value || '').toLowerCase();
  const rows = (stCache.news || []).filter(n => !q || (n.title || '').toLowerCase().includes(q));
  el.innerHTML = rows.map(n => `<a class="st-nrow" href="#news/${n.id}"><span class="st-nth">${n.image ? `<img src="${esc(pubUrl(n.image))}" alt="" loading="lazy">` : '📰'}</span>
    <div class="tx"><b>${esc(n.title)}</b><small>${esc(n.category || '—')} · ${new Date(n.post_date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
    ${n.published ? '<span class="st-pill ok">Tayang</span>' : '<span class="st-pill mu">Draf</span>'}<span class="st-chev">›</span></a>`).join('') || '<p class="st-empty">Belum ada berita.</p>';
}
let nf = null;
async function stNewsEdit(id) {
  let it = null;
  if (id) { try { await stLoadNews(); it = stCache.news.find(n => n.id === id) || (await stLoadNews(true)).find(n => n.id === id); } catch (e) {} if (!it) { showToast('Berita tidak ditemukan.'); location.hash = '#news'; return; } }
  nf = { id: it?.id || null, title: it?.title || '', summary: it?.summary || '', body: it?.body || '', category: it?.category || 'Product', image: it?.image || '', file: null, preview: '',
    link_url: it?.link_url || '', link_label: it?.link_label || '', post_date: it?.post_date || todayWIB(), published: it ? !!it.published : false, wasPub: !!it?.published, notify: true, busy: false };
  const extra = it && ((it.projects || []).length || (it.photos || []).length);
  stPage(`<div class="st-ph"><div><p><a href="#news">News</a> › ${it ? 'Edit' : 'Baru'}</p><h1>${it ? 'Edit berita' : 'Tulis berita'}</h1></div>
      <div class="st-acts">${it ? `<button class="st-btn red" onclick="stNewsDel()">🗑</button><a class="st-btn" href="/?news=${it.id}" target="_blank" rel="noopener">↗ Lihat</a>` : ''}<button class="st-btn pri" id="nf-save" onclick="stNewsSave()">💾 Simpan</button></div></div>
    <div class="st-ed"><div class="st-card st-pad">
      <input class="st-in st-title" id="nf-title" placeholder="Judul berita" value="${esc(nf.title)}" oninput="stNf()">
      <label class="st-fl">Ringkasan <small>(tampil di headline Dashboard)</small><input class="st-in" id="nf-summary" value="${esc(nf.summary)}" oninput="stNf()"></label>
      <div class="st-fl">Gambar sampul <small>(16:9 disarankan)</small>
        <label class="st-img16" id="nf-img">${nf.image ? `<img src="${esc(pubUrl(nf.image))}" alt="">` : '<span>🖼 Pilih gambar sampul</span>'}<input type="file" accept="image/*" hidden onchange="stNfImg(this)"></label>
        ${nf.image ? '<button class="st-link" onclick="stNfImgDel()">Hapus gambar</button>' : ''}</div>
      <label class="st-fl">Isi berita <small>(paragraf dipisah baris kosong · *tebal* _miring_)</small><textarea class="st-in st-body" id="nf-body" oninput="stNf()">${esc(nf.body)}</textarea></label>
      ${extra ? `<p class="st-note">🔧 Berita ini punya project/foto tambahan — tetap tersimpan. Ubah bagian itu lewat <a href="/?news=${it.id}" target="_blank" rel="noopener">editor lengkap di portal ↗</a> (buka berita → ✏️ Edit).</p>` : '<p class="st-note">Project &amp; partner pemasang, perangkat terpasang, dan foto tambahan di antara paragraf: pakai editor lengkap di portal (setelah disimpan).</p>'}
      <div class="st-warn">⚠️ News publik — jangan memuat harga dealer, diskon, atau info internal.</div>
    </div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl">Status<div class="st-seg" id="nf-pub"><button onclick="stNfPub(false)">Draf</button><button onclick="stNfPub(true)">Tayang</button></div></div>
      <label class="st-fl">Tanggal<input class="st-in" type="date" id="nf-date" value="${esc(nf.post_date)}" oninput="stNf()"></label>
      <label class="st-fl">Kategori<input class="st-in" id="nf-cat" list="nf-cats" value="${esc(nf.category)}" oninput="stNf()"><datalist id="nf-cats">${NEWS_CATS.map(c => `<option value="${c}">`).join('')}</datalist></label>
      <label class="st-fl">Tombol link <small>(opsional · link YouTube = pemutar video)</small><input class="st-in" id="nf-link" placeholder="https://… atau /?p=<id produk>" value="${esc(nf.link_url)}" oninput="stNf()"></label>
      <label class="st-fl">Teks tombol<input class="st-in" id="nf-lab" placeholder="mis. Lihat Produk" value="${esc(nf.link_label)}" oninput="stNf()"></label>
      <label class="st-ck" id="nf-notif"><input type="checkbox" checked onchange="nf.notify=this.checked"> Kirim notifikasi 📰 ke HP pengunjung saat pertama tayang</label>
    </div>
    <div class="st-card st-pad"><div class="st-fl" style="margin:0 0 12px">Pratinjau di Dashboard (HP)</div><div class="st-phone" id="nf-prev"></div></div></div></div>`);
  stNfPaint();
}
function stNf() {
  const v = id => document.getElementById(id)?.value ?? '';
  Object.assign(nf, { title: v('nf-title'), summary: v('nf-summary'), body: v('nf-body'), post_date: v('nf-date'), category: v('nf-cat'), link_url: v('nf-link'), link_label: v('nf-lab') });
  stNfPrev();
}
function stNfPub(on) { nf.published = on; stNfPaint(); }
function stNfPaint() {
  document.querySelectorAll('#nf-pub button').forEach((b, i) => b.classList.toggle('on', i === (nf.published ? 1 : 0)));
  const n = document.getElementById('nf-notif'); if (n) n.style.display = nf.published && !nf.wasPub ? '' : 'none';
  const s = document.getElementById('nf-save'); if (s) s.textContent = nf.published ? (nf.wasPub ? '💾 Simpan' : '🚀 Terbitkan') : '💾 Simpan draf';
  stNfPrev();
}
function stNfPrev() {
  const el = document.getElementById('nf-prev'); if (!el) return;
  const img = nf.preview || (nf.image ? pubUrl(nf.image) : '');
  el.innerHTML = `<div class="pi">${img ? `<img src="${esc(img)}" alt="">` : '📰'}</div><div class="pb"><div class="k">NEWS${nf.category ? ' · ' + esc(nf.category.toUpperCase()) : ''}</div><h4>${esc(nf.title || 'Judul berita')}</h4><p>${esc(nf.summary || 'Ringkasan berita.')}</p><span class="more">Baca selengkapnya ›</span></div>`;
}
function stNfImg(input) {
  const f = input.files[0]; if (!f) return; nf.file = f; nf.preview = URL.createObjectURL(f);
  document.getElementById('nf-img').innerHTML = `<img src="${nf.preview}" alt=""><input type="file" accept="image/*" hidden onchange="stNfImg(this)">`; stNfPrev();
}
function stNfImgDel() { nf.image = ''; nf.file = null; nf.preview = ''; document.getElementById('nf-img').innerHTML = '<span>🖼 Pilih gambar sampul</span><input type="file" accept="image/*" hidden onchange="stNfImg(this)">'; stNfPrev(); }
async function stNewsSave() {
  if (!nf || nf.busy) return; stNf();
  if (!nf.title.trim()) return showToast('Judul belum terisi.');
  nf.busy = true; const btn = document.getElementById('nf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  const old = nf.id ? (stCache.news || []).find(n => n.id === nf.id)?.image : null;
  let uploaded = null;
  try {
    let image = nf.image || null;
    if (nf.file) {
      const blob = await glResize(nf.file, 1600);
      uploaded = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await supabase.storage.from('showcase').upload(uploaded, blob, { contentType: blob.type, cacheControl: '3600' });
      if (error) throw error; image = uploaded;
    }
    const row = { title: nf.title.trim(), summary: nf.summary.trim() || null, body: nf.body.trim() || null, category: nf.category.trim() || null, image,
      link_url: nf.link_url.trim() || null, link_label: nf.link_label.trim() || null, post_date: nf.post_date || todayWIB(), published: !!nf.published, updated_at: new Date().toISOString() };
    const q = nf.id ? supabase.from('cai_news').update(row).eq('id', nf.id).select().single() : supabase.from('cai_news').insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (data.published && !nf.wasPub && nf.notify) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'news', id: data.id } }).catch(() => {});
    const oldPath = old && String(old).split('#')[0];
    if (oldPath && oldPath !== String(image || '').split('#')[0] && /^news\//.test(oldPath)) supabase.storage.from('showcase').remove([oldPath]).catch(() => {});
    showToast(data.published ? (nf.wasPub ? '✓ Berita diperbarui' : '🚀 Berita diterbitkan') : '✓ Draf disimpan');
    await stLoadNews(true); nf = null; location.hash = '#news';
  } catch (e) {
    if (uploaded) supabase.storage.from('showcase').remove([uploaded]).catch(() => {});
    nf.busy = false; btn.disabled = false; stNfPaint(); showToast('⚠ Gagal menyimpan: ' + (e.message || e), 8000);
  }
}
async function stNewsDel() {
  const it = (stCache.news || []).find(n => n.id === nf?.id); if (!it) return;
  if (!confirm(`Hapus berita "${it.title}"?`)) return;
  const { error } = await supabase.from('cai_news').delete().eq('id', it.id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  const p = it.image && String(it.image).split('#')[0];
  if (p && /^news\//.test(p)) supabase.storage.from('showcase').remove([p]).catch(() => {});
  const ph = (it.photos || []).map(x => x.path).filter(x => /^news\//.test(x || ''));
  if (ph.length) supabase.storage.from('showcase').remove(ph).catch(() => {});
  showToast('🗑 Berita dihapus'); await stLoadNews(true); location.hash = '#news';
}

// ── CONCERTO WAY (tahap 2, 18 Nov 2026) — sama dengan form portal js/cway.js; pengenal teks WA = js/cw-parse.js ──
const CW_LINK_DAYS = 60;   // samakan dengan CWAY_SHARE_DAYS di js/cway.js
const cwWaHtml = s => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?])/g, '$1<i>$2</i>').replace(/~([^~\n]+)~/g, '<s>$1</s>');
const cwDueS = x => !x.publish_at || Date.parse(x.publish_at) <= Date.now();
const cwWhenS = iso => wibDate(Date.parse(iso), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/\./g, ':').replace(/(\d{2}):(\d{2})$/, '$1.$2') + ' WIB';
const waEnc = t => encodeURIComponent(String(t).replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}][️‍\p{Extended_Pictographic}\p{Emoji_Modifier}]*[ \t]?/gu, ''));
async function stLoadCw(force) {
  if (stCache.cw && !force) return stCache.cw;
  const { data, error } = await supabase.from('concerto_way').select('*');
  if (error) throw error;
  stCache.cw = (data || []).sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)) || (b.day || 0) - (a.day || 0) || String(b.created_at).localeCompare(String(a.created_at)));
  return stCache.cw;
}
const cwNextDay = () => Math.max(0, ...(stCache.cw || []).map(x => +x.day || 0)) + 1;
let stCwF = 'all', stCwQ = '';
async function stCway() {
  stPage(`<div class="st-ph"><div><p>Konten · khusus partner</p><h1>Concerto Way</h1></div><div class="st-acts"><button class="st-btn" onclick="stLoadCw(true).then(stCwPaint)">↻</button><a class="st-btn gold" href="#cway/new" id="cw-addbtn">＋ Tambah Day</a></div></div>
    <div id="cw-queue"></div>
    <div class="st-card"><div class="st-filters" id="cw-f"></div><div id="cw-list"><p class="st-empty">⏳ Memuat…</p></div></div>`);
  try { await stLoadCw(true); stCwPaint(); } catch (e) { document.getElementById('cw-list').innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
function stCwStatus(x) {
  if (!x.published) return '<span class="st-pill mu">Draf</span>';
  if (!cwDueS(x)) return `<span class="st-pill gold">⏰ ${esc(cwWhenS(x.publish_at))}</span>`;
  return '<span class="st-pill ok">Tayang</span>';
}
function stCwPaint() {
  const all = stCache.cw || [], el = document.getElementById('cw-list'); if (!el) return;
  const add = document.getElementById('cw-addbtn'); if (add) add.textContent = `＋ Tambah Day ${cwNextDay()}`;
  const sched = all.filter(x => x.published && !cwDueS(x)).sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  const last = sched[sched.length - 1], days = last ? Math.floor((Date.parse(last.publish_at) - Date.now()) / 864e5) : -1;
  document.getElementById('cw-queue').innerHTML = `<div class="st-card st-cwq${days < 5 ? ' warn' : ''}"><div><b>⏰ Antrian tayang: ${sched.length} Day</b><small>${last ? `Terjadwal sampai ${esc(cwWhenS(last.publish_at))}${days < 5 ? ' — tambah Day agar partner tidak kosong' : ''}` : 'Belum ada Day yang dijadwalkan'}</small></div>
    <div class="st-cwq-days">${sched.slice(0, 8).map(x => `<a href="#cway/${x.id}" class="st-cwq-d"><b>${x.day ?? '—'}</b><small>${wibDate(Date.parse(x.publish_at), { weekday: 'short', day: 'numeric' })}</small></a>`).join('')}</div></div>`;
  const cnt = { all: all.length, live: all.filter(x => x.published && cwDueS(x)).length, sched: sched.length, draft: all.filter(x => !x.published).length };
  document.getElementById('cw-f').innerHTML = [['all', 'Semua'], ['live', 'Tayang'], ['sched', '⏰ Terjadwal'], ['draft', 'Draf']]
    .map(([k, t]) => `<button class="st-chip${stCwF === k ? ' on' : ''}" onclick="stCwF='${k}';stCwPaint()">${t} ${cnt[k]}</button>`).join('') +
    `<label class="st-search sm"><span>🔍</span><input placeholder="Cari judul / seri / Day…" value="${esc(stCwQ)}" oninput="stCwQ=this.value;stCwRows()"></label>`;
  stCwRows();
}
function stCwRows() {
  const el = document.getElementById('cw-list'); if (!el) return;
  const q = stCwQ.trim().toLowerCase();
  const rows = (stCache.cw || []).filter(x => (stCwF === 'all' || (stCwF === 'live' ? x.published && cwDueS(x) : stCwF === 'sched' ? x.published && !cwDueS(x) : !x.published))
    && (!q || `${x.title} ${x.series || ''} day ${x.day ?? ''}`.toLowerCase().includes(q)));
  el.innerHTML = rows.map(x => `<a class="st-nrow" href="#cway/${x.id}"><span class="st-cwday"><small>DAY</small>${x.day ?? '—'}</span>
    <div class="tx"><b>${esc(x.title)}</b><small>${esc(x.series || '—')} · ${new Date(x.post_date + 'T12:00:00+07:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div>
    ${stCwStatus(x)}<span class="st-chev">›</span></a>`).join('') || '<p class="st-empty">Tidak ada postingan.</p>';
}
let cf = null;
function cwDefSched() {   // bawaan jadwal: sehari setelah Day terjadwal terakhir (atau besok) pukul 09.00 WIB
  const sched = (stCache.cw || []).filter(x => x.published && !cwDueS(x)).map(x => Date.parse(x.publish_at));
  const base = sched.length ? Math.max(...sched) + 864e5 : Date.now() + 864e5;
  return { sd: new Date(base + 7 * 36e5).toISOString().slice(0, 10), st: '09:00' };
}
async function stCwEdit(id) {
  try { await stLoadCw(); } catch (e) { return stPage(`<p class="st-empty">⚠ ${esc(e.message)}</p>`); }
  const it = id ? stCache.cw.find(x => x.id === id) : null;
  if (id && !it) { showToast('Postingan tidak ditemukan.'); location.hash = '#cway'; return; }
  const d = cwDefSched();
  const mode = !it ? 'at' : !it.published ? 'draft' : cwDueS(it) ? 'now' : 'at';
  const w = it?.publish_at && !cwDueS(it) ? new Date(Date.parse(it.publish_at) + 7 * 36e5).toISOString() : null;
  cf = { id: it?.id || null, body: it?.body || '', day: it?.day ?? (it ? '' : cwNextDay()), series: it?.series || '', title: it?.title || '', subtitle: it?.subtitle || '',
    post_date: it?.post_date || todayWIB(), mode, sd: w ? w.slice(0, 10) : d.sd, st: w ? w.slice(11, 16) : d.st,
    wasLive: !!(it && it.published && cwDueS(it)), touched: it ? { day: 1, series: 1, title: 1, subtitle: 1 } : {}, busy: false };
  stPage(`<div class="st-ph"><div><p><a href="#cway">Concerto Way</a> › ${it ? 'Edit' : 'Baru'}</p><h1>${it ? `Edit Day ${esc(it.day ?? '')}` : 'Tambah Concerto Way'}</h1></div>
      <div class="st-acts">${it ? `<button class="st-btn red" onclick="stCwDel()">🗑</button><button class="st-btn" onclick="stCwShare()">💬 Bagikan ke WA</button><a class="st-btn" href="/?cw=${it.id}" target="_blank" rel="noopener">↗ Lihat</a>` : ''}<button class="st-btn pri" id="cf-save" onclick="stCwSave()">💾 Simpan</button></div></div>
    <div class="st-ed"><div class="st-card st-pad">
      <label class="st-fl" style="margin-top:0">1 · Tempel teks persis seperti yang dikirim ke grup WA
        <textarea class="st-in st-body st-cwbody" id="cf-body" placeholder="CONCERTO WAY&#10;DAY 19&#10;&#10;JUAL: …&#10;&#10;Judul…" oninput="stCfBody(this.value)">${esc(cf.body)}</textarea></label>
      <p class="st-note" style="margin-top:8px">Day, seri, judul, <b>Resume hari ini</b> &amp; <b>Tugas Hari Ini</b> dikenali otomatis. Format WA *tebal* dan _miring_ ikut terbaca.</p>
      <div class="st-g2b">
        <label class="st-fl">Day<input class="st-in" type="number" min="0" id="cf-day" value="${esc(cf.day)}" oninput="stCfSet('day',this.value)"></label>
        <label class="st-fl">Seri<input class="st-in" id="cf-series" value="${esc(cf.series)}" placeholder="mis. BASIC: Kalau Saya Jadi Customer" oninput="stCfSet('series',this.value)"></label></div>
      <label class="st-fl">Judul<input class="st-in" id="cf-title" value="${esc(cf.title)}" oninput="stCfSet('title',this.value)"></label>
      <label class="st-fl">Subjudul<input class="st-in" id="cf-subtitle" value="${esc(cf.subtitle)}" oninput="stCfSet('subtitle',this.value)"></label>
    </div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl" style="margin-top:0">Tayang<div class="st-seg" id="cf-mode"><button onclick="stCfMode('draft')">Draf</button><button onclick="stCfMode('now')">Sekarang</button><button onclick="stCfMode('at')">⏰ Jadwalkan</button></div></div>
      <div id="cf-sched"></div><p class="st-note" id="cf-snote"></p>
    </div>
    <div class="st-card st-pad"><div class="st-fl" style="margin:0 0 12px">Pratinjau untuk partner</div><div class="st-cwprev" id="cf-prev"></div></div></div></div>`);
  stCfPaint();
  if (!it) setTimeout(() => document.getElementById('cf-body')?.focus(), 50);
}
function stCfBody(v) {
  cf.body = v; const p = cwParse(v);
  for (const k of ['day', 'series', 'title', 'subtitle']) if (!cf.touched[k]) { cf[k] = p[k] ?? (k === 'day' ? cf.day : ''); const el = document.getElementById('cf-' + k); if (el) el.value = cf[k] ?? ''; }
  stCfPrev();
}
function stCfSet(k, v) { cf[k] = v; cf.touched[k] = 1; stCfPrev(); }
function stCfMode(m) { cf.mode = m; stCfPaint(); }
const cfIso = () => cf.mode === 'at' && cf.sd && cf.st ? new Date(`${cf.sd}T${cf.st}:00+07:00`).toISOString() : null;
function stCfPaint() {
  document.querySelectorAll('#cf-mode button').forEach((b, i) => b.classList.toggle('on', ['draft', 'now', 'at'][i] === cf.mode));
  document.getElementById('cf-sched').innerHTML = cf.mode === 'at'
    ? `<div class="st-g2b"><label class="st-fl">Tanggal<input class="st-in" type="date" value="${esc(cf.sd)}" min="${todayWIB()}" oninput="cf.sd=this.value;stCfNote()"></label><label class="st-fl">Jam (WIB)<input class="st-in" type="time" step="300" value="${esc(cf.st)}" oninput="cf.st=this.value;stCfNote()"></label></div>`
    : cf.mode === 'now' ? `<label class="st-fl">Tanggal postingan<input class="st-in" type="date" value="${esc(cf.post_date)}" oninput="cf.post_date=this.value"></label>` : '';
  stCfNote(); stCfPrev();
}
function stCfNote() {
  const el = document.getElementById('cf-snote'), btn = document.getElementById('cf-save'), iso = cfIso(), past = iso && Date.parse(iso) <= Date.now();
  if (el) el.innerHTML = cf.mode === 'draft' ? 'Draf hanya terlihat oleh Editor.'
    : cf.mode === 'now' ? (cf.wasLive ? 'Sudah tayang — perubahan langsung terlihat partner.' : 'Tayang untuk partner begitu disimpan + notifikasi ☕ ke HP partner.')
    : past ? '⚠ Waktu ini sudah lewat — postingan langsung tayang saat disimpan.'
    : `Otomatis tayang <b>${esc(cwWhenS(iso))}</b> + notifikasi ☕ ke HP partner. Sebelum itu terkunci untuk partner.`;
  if (btn && !cf.busy) btn.textContent = cf.mode === 'draft' ? '💾 Simpan draf' : cf.mode === 'at' && !past ? '⏰ Simpan jadwal' : cf.wasLive ? '💾 Simpan' : '🚀 Terbitkan';
}
function stCfPrev() {
  const el = document.getElementById('cf-prev'); if (!el) return;
  const blocks = cwParse(cf.body).blocks.map(b => {
    if (b.t === 'p') return `<p>${b.v.map(cwWaHtml).join('<br>')}</p>`;
    if (b.t === 'close') return `<p class="close">${b.v.map(cwWaHtml).join('<br>')}</p>`;
    if (b.t === 'src') return `<p class="src">${cwWaHtml(b.v)}</p>`;
    if (b.t === 'stats') return `<div class="stats">${b.v.map(x => `<div><b>${esc(x.n)}</b>${cwWaHtml(x.v)}</div>`).join('')}</div>`;
    if (b.t === 'resume') return `<div class="res"><small>📌 Resume hari ini</small>${cwWaHtml(b.v)}</div>`;
    if (b.t === 'task') return `<div class="task"><small>✅ Tugas hari ini</small>${b.v.map(x => `<label><span></span>${cwWaHtml(x)}</label>`).join('')}</div>`;
    return '';
  }).join('');
  el.innerHTML = `<div class="hd"><span class="b">☕ CONCERTO WAY</span>${cf.day !== '' && cf.day != null ? `<span class="d">DAY ${esc(cf.day)}</span>` : ''}</div>
    ${cf.series ? `<div class="ser">${esc(cf.series)}</div>` : ''}<h4>${esc(cf.title || '(judul)')}</h4>${cf.subtitle ? `<p class="sub">${esc(cf.subtitle)}</p>` : ''}
    <div class="bd">${blocks || '<p class="src">Isi postingan tampil di sini.</p>'}</div>`;
}
async function stCwSave() {
  if (!cf || cf.busy) return;
  if (!cf.body.trim()) return showToast('Tempel teks Concerto Way dulu.');
  if (!String(cf.title).trim()) return showToast('Judul belum terisi.');
  const iso = cfIso(), future = iso && Date.parse(iso) > Date.now();
  const row = { body: cf.body.trim(), day: cf.day === '' || cf.day == null ? null : parseInt(cf.day, 10), series: String(cf.series).trim() || null, title: String(cf.title).trim(),
    subtitle: String(cf.subtitle).trim() || null, post_date: future ? cf.sd : (cf.post_date || todayWIB()), published: cf.mode !== 'draft', publish_at: future ? iso : null, updated_at: new Date().toISOString() };
  cf.busy = true; const btn = document.getElementById('cf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  try {
    const q = cf.id ? supabase.from('concerto_way').update(row).eq('id', cf.id).select().single() : supabase.from('concerto_way').insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (data.published && cwDueS(data) && !cf.wasLive) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'cway', id: data.id } }).catch(() => {});
    showToast(future ? `⏰ Dijadwalkan — tayang ${cwWhenS(iso)}` : !row.published ? '✓ Draf disimpan' : cf.wasLive ? '✓ Concerto Way diperbarui' : '🚀 Concerto Way diterbitkan', 6000);
    await stLoadCw(true); stCache.sched = null; cf = null; location.hash = '#cway';
  } catch (e) { cf.busy = false; btn.disabled = false; stCfNote(); showToast('⚠ Gagal menyimpan: ' + (e.message || e), 8000); }
}
async function stCwDel() {
  const it = (stCache.cw || []).find(x => x.id === cf?.id); if (!it) return;
  if (!confirm(`Hapus Concerto Way ${it.day != null ? 'Day ' + it.day + ' — ' : ''}"${it.title}"?\n\nPostingan hilang dari portal untuk semua partner.`)) return;
  const { error } = await supabase.from('concerto_way').delete().eq('id', it.id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  showToast('🗑 Postingan dihapus'); await stLoadCw(true); stCache.sched = null; cf = null; location.hash = '#cway';
}
function stCwShare() {
  const it = (stCache.cw || []).find(x => x.id === cf?.id); if (!it) return;
  const d = +it.day, link = `https://hub.concerto.id/cway/${d >= 1 && d <= CW_LINK_DAYS && Number.isInteger(d) ? d + '/' : ''}?cw=${encodeURIComponent(it.id)}`;
  window.open(`https://wa.me/?text=${waEnc(`Concerto Way${it.day != null ? ' — Day ' + it.day : ''}: ${it.title}\nKhusus partner CAI — buka di CAI Hub dengan Kode Akses:\n${link}`)}`, '_blank', 'noopener');
}

// ── ACADEMY (tahap 3, 18 Nov 2026) — sama dengan portal js/core.js (loadAcadExtra/saveAcadItems/acadReschedule/acadDelete) ──
// Materi bawaan = ACADEMY di js/core.js (dibaca dari teks file, data murni); materi portal = Storage publik showcase/academy/items.json.
const ACAD_MANIFEST = 'academy/items.json', ACAD_NEW_DAYS = 5;
const acadPad2 = n => String(n).padStart(2, '0');
const acadImgS = (a, thumb) => a.img ? pubUrl(thumb ? (a.thumb || a.img) : a.img) : `assets/academy/fundamental-${acadPad2(a.no)}${thumb ? '-thumb' : ''}.webp`;
const acadDueS = a => a.at ? Date.parse(a.at) <= Date.now() : a.date <= todayWIB();
const wibYmd = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
async function stLoadAcad(force) {
  if (stCache.acad && !force) return stCache.acad;
  if (!stCache.acadBase) {
    try { const t = await (await fetch('js/core.js?t=' + Date.now(), { cache: 'no-store' })).text(); const m = t.match(/const ACADEMY = (\[[\s\S]*?\n\]);/); stCache.acadBase = m ? Function('return ' + m[1])() : []; }
    catch (e) { stCache.acadBase = []; }
  }
  const r = await fetch(pubUrl(ACAD_MANIFEST) + '?t=' + Date.now(), { cache: 'no-store' });
  const j = r.ok ? await r.json() : { items: [] };
  stCache.acadExtra = (j.items || []).filter(a => a && a.no && a.img && a.date);
  stCache.acad = [...stCache.acadBase, ...stCache.acadExtra];
  supabase.rpc('academy_view_counts').then(({ data, error }) => { if (error) return; stCache.acadViews = new Map((data || []).map(x => [+x.no, x])); if ((location.hash || '').startsWith('#academy')) stAcadGrid(); }).catch(() => {});
  return stCache.acad;
}
async function stAcadSave(items) {
  const { error } = await supabase.storage.from('showcase').upload(ACAD_MANIFEST, new Blob([JSON.stringify({ items })], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '0' });
  if (error) throw error; stCache.acadExtra = items; stCache.acad = [...(stCache.acadBase || []), ...items]; stCache.sched = null;
}
let stAcF = 'all', stAcQ = '';
async function stAcademy() {
  stPage(`<div class="st-ph"><div><p>Konten · publik</p><h1>Concerto Academy</h1></div><div class="st-acts"><button class="st-btn" onclick="stLoadAcad(true).then(stAcadPaint)">↻</button><a class="st-btn gold" href="#academy/new">＋ Tambah materi</a></div></div>
    <div id="ac-queue"></div><div class="st-card"><div class="st-filters" id="ac-f"></div><div class="st-acgrid" id="ac-grid"><p class="st-empty">⏳ Memuat…</p></div></div>`);
  try { await stLoadAcad(true); stAcadPaint(); } catch (e) { document.getElementById('ac-grid').innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
function stAcadPaint() {
  const all = stCache.acad || [], q = document.getElementById('ac-queue'); if (!q) return;
  const sched = all.filter(a => !acadDueS(a)).sort((x, y) => Date.parse(x.at || x.date) - Date.parse(y.at || y.date) || x.no - y.no);
  q.innerHTML = sched.length ? `<div class="st-card st-acq"><div class="st-ch"><h3>⏰ Antrian tayang · ${sched.length} materi</h3><span class="st-note" style="margin:0 0 0 auto">otomatis muncul pada jamnya + notifikasi 🎓</span></div>
    ${sched.map(a => `<div class="st-row"><span class="st-acqt">${esc(cwWhenS(a.at || a.date + 'T00:00:00+07:00'))}</span><div class="tx"><b>#${a.no} · ${esc(a.title)}</b><small>${esc(a.series || 'Fundamental')}</small></div>${a.img ? `<button class="st-btn sm" onclick="stAcadResched(${a.no})">✏️ Jadwal</button>` : ''}</div>`).join('')}</div>` : '';
  const live = all.filter(acadDueS).length;
  document.getElementById('ac-f').innerHTML = [['all', 'Semua', all.length], ['live', 'Tayang', live], ['sched', '⏰ Terjadwal', sched.length]]
    .map(([k, t, n]) => `<button class="st-chip${stAcF === k ? ' on' : ''}" onclick="stAcF='${k}';stAcadPaint()">${t} ${n}</button>`).join('') +
    `<label class="st-search sm"><span>🔍</span><input placeholder="Cari judul / nomor…" value="${esc(stAcQ)}" oninput="stAcQ=this.value;stAcadGrid()"></label>`;
  stAcadGrid();
}
function stAcadGrid() {
  const el = document.getElementById('ac-grid'); if (!el) return;
  const q = stAcQ.trim().toLowerCase(), V = stCache.acadViews;
  const rows = (stCache.acad || []).filter(a => (stAcF === 'all' || (stAcF === 'live') === acadDueS(a)) && (!q || `#${a.no} ${a.title} ${a.series || ''}`.toLowerCase().includes(q))).sort((x, y) => y.no - x.no);
  el.innerHTML = rows.map(a => {
    const due = acadDueS(a), d = Math.round((Date.parse(todayWIB()) - Date.parse(a.date)) / 864e5), v = V?.get(a.no);
    return `<div class="st-acc${due ? '' : ' sched'}"><button class="st-acth" onclick="stAcadView(${a.no})"><img src="${esc(acadImgS(a, true))}" alt="" loading="lazy">
      ${!due ? '<span class="st-pill gold">⏰ Terjadwal</span>' : d >= 0 && d < ACAD_NEW_DAYS ? '<span class="st-pill gold">★ Baru</span>' : ''}</button>
      <div class="st-acb"><small>${esc(a.series || 'Fundamental')} #${a.no}</small><b>${esc(a.title)}</b>
      <div class="st-acm"><span>${due ? new Date(a.date + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : esc(cwWhenS(a.at || a.date + 'T00:00:00+07:00'))}</span>${v ? `<span>👁 ${fmtNum(v.views)}</span>` : ''}</div>
      ${a.img ? `<div class="st-aca"><button onclick="stAcadTitle(${a.no})" title="Ubah judul">✏️ Judul</button><button onclick="stAcadResched(${a.no})" title="Ubah jadwal">⏰ Jadwal</button><button onclick="stAcadDel(${a.no})" title="Hapus">🗑</button></div>` : '<div class="st-aca st-mu"><span>materi bawaan</span></div>'}</div></div>`;
  }).join('') || '<p class="st-empty">Tidak ada materi.</p>';
}
function stAcadView(no) {
  const a = (stCache.acad || []).find(x => x.no === no); if (!a) return;
  let ov = document.getElementById('st-lb'); if (!ov) { ov = document.createElement('div'); ov.id = 'st-lb'; ov.className = 'st-lb'; ov.onclick = e => { if (e.target === ov || e.target.dataset.x) ov.classList.remove('on'); }; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="st-lbb"><div class="st-lbh"><b>#${a.no} · ${esc(a.title)}</b><a class="st-btn sm" href="/?acad=${a.no}" target="_blank" rel="noopener">↗ Lihat di situs</a><button class="st-btn sm" data-x="1">✕</button></div><img src="${esc(acadImgS(a))}" alt=""></div>`;
  ov.classList.add('on');
}
async function stAcadTitle(no) {
  const a = (stCache.acadExtra || []).find(x => x.no === no); if (!a) return;
  const t = prompt('Judul materi:', a.title); if (t == null || !t.trim() || t.trim() === a.title) return;
  try { await stAcadSave(stCache.acadExtra.map(x => x.no === no ? { ...x, title: t.trim() } : x)); stAcadPaint(); showToast('✓ Judul diperbarui'); } catch (e) { showToast('⚠ Gagal menyimpan: ' + e.message, 7000); }
}
async function stAcadResched(no) {
  const a = (stCache.acadExtra || []).find(x => x.no === no); if (!a) return;
  const cur = a.at ? new Date(a.at).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16) : '';
  const v = prompt(`Jadwal tayang materi #${no} (WIB), format YYYY-MM-DD HH:MM.\nKetik "sekarang" untuk langsung tayang.`, cur); if (v == null) return;
  let at = null;
  if (!/^\s*(sekarang)?\s*$/i.test(v)) {
    const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) return showToast('⚠ Format salah. Contoh: 2026-11-20 09:00', 5000);
    at = new Date(Date.parse(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+07:00`)).toISOString();
    if (!(Date.parse(at) > Date.now())) return showToast('⚠ Waktu sudah lewat — pilih waktu yang akan datang.', 5000);
  }
  const items = stCache.acadExtra.map(x => { if (x.no !== no) return x; const y = { ...x }; delete y.at; return at ? { ...y, at, date: wibYmd(at) } : { ...y, date: todayWIB() }; });
  try {
    await stAcadSave(items); stAcadPaint();
    if (!at) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'acad', id: [no] } }).catch(() => {});
    showToast(at ? `⏰ Dijadwalkan ${cwWhenS(at)}` : '✓ Materi tayang sekarang');
  } catch (e) { showToast('⚠ Gagal menyimpan: ' + e.message, 7000); }
}
async function stAcadDel(no) {
  const a = (stCache.acadExtra || []).find(x => x.no === no); if (!a) return;
  if (!confirm(`Hapus materi #${no} "${a.title}"?`)) return;
  try { await stAcadSave(stCache.acadExtra.filter(x => x.no !== no)); supabase.storage.from('showcase').remove([a.img, a.thumb].filter(Boolean)).catch(() => {}); stAcadPaint(); showToast('🗑 Materi dihapus'); }
  catch (e) { showToast('⚠ Gagal menghapus: ' + e.message, 7000); }
}
// Tambah materi: gambar (1 gambar = 1 materi) atau PDF (tiap halaman = 1 materi)
let af = null, pdfLibP = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  return pdfLibP || (pdfLibP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(pdfjsLib); };
    s.onerror = () => { pdfLibP = null; rej(new Error('Gagal memuat pembaca PDF. Periksa koneksi internet.')); }; document.head.appendChild(s); }));
}
async function acadPdfPagesS(f) {
  const lib = await loadPdfJs(), doc = await lib.getDocument({ data: await f.arrayBuffer() }).promise, out = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 1080 / v1.width });
      const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      out.push({ blob: await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('halaman kosong')), 'image/png')), name: f.name.replace(/\.pdf$/i, '') + (doc.numPages > 1 ? ' ' + i : '') });
    }
  } finally { doc.destroy(); }
  return out;
}
async function acadImgBlobsS(src) {   // sama dengan acadImgBlobs() portal: lebar maks 1080 + thumbnail 540×360 bagian atas
  const bmp = await createImageBitmap(src);
  const toBlob = c => new Promise((res, rej) => c.toBlob(b => b && b.type === 'image/webp' ? res(b) : c.toBlob(j => j ? res(j) : rej(new Error('Gagal memproses gambar')), 'image/jpeg', .88), 'image/webp', .85));
  const s = Math.min(1, 1080 / bmp.width), c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  const t = document.createElement('canvas'); t.width = 540; t.height = 360; const ts = 540 / bmp.width, tg = t.getContext('2d');
  tg.fillStyle = '#fff'; tg.fillRect(0, 0, 540, 360); tg.drawImage(bmp, 0, 0, bmp.width, Math.min(bmp.height, 360 / ts), 0, 0, 540, Math.min(360, bmp.height * ts));
  return { img: await toBlob(c), thumb: await toBlob(t) };
}
const acTitle = n => n.replace(/\.(pdf|jpe?g|png|webp)$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
async function stAcadNew() {
  try { await stLoadAcad(); } catch (e) {}
  const all = stCache.acad || [], last = all.filter(a => a.series).slice(-1)[0];
  const sched = all.filter(a => !acadDueS(a) && a.at).map(a => Date.parse(a.at));
  const base = sched.length ? Math.max(...sched) + 864e5 : Date.now() + 864e5;
  af = { series: last?.series || 'Fundamental', items: [], mode: 'now', sd: new Date(base + 7 * 36e5).toISOString().slice(0, 10), st: '19:00', stag: false, per: 1, busy: false };
  stPage(`<div class="st-ph"><div><p><a href="#academy">Academy</a> › Tambah</p><h1>Tambah materi Academy</h1></div><div class="st-acts"><button class="st-btn pri" id="af-save" onclick="stAcadSaveNew()" disabled>💾 Simpan</button></div></div>
    <div class="st-ed"><div class="st-card st-pad">
      <label class="st-fl" style="margin-top:0">Nama seri<input class="st-in" value="${esc(af.series)}" oninput="af.series=this.value;stAfList()"></label>
      <label class="st-drop"><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple hidden onchange="stAfFiles(this)"><b>📄 Pilih gambar / PDF</b><small>1 gambar = 1 materi (tegak seperti materi yang ada) · PDF: setiap halaman jadi 1 materi</small></label>
      <div id="af-list"></div></div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl" style="margin-top:0">Tayang<div class="st-seg" id="af-mode"><button onclick="af.mode='now';stAfSched()">Sekarang</button><button onclick="af.mode='sched';stAfSched()">⏰ Jadwalkan</button></div></div>
      <div id="af-sched"></div><p class="st-note" id="af-note"></p></div>
      <div class="st-card st-pad"><p class="st-note" style="margin:0">Materi baru bertanda <b>★ Baru</b> ${ACAD_NEW_DAYS} hari. Saat tayang, HP yang mengaktifkan notifikasi 🎓 Academy dikabari. Nomor materi melanjutkan nomor terakhir (#${Math.max(0, ...all.map(a => a.no)) + 1}).</p></div></div></div>`);
  stAfSched(); stAfList();
}
const afAt = i => new Date(Date.parse(`${af.sd}T${af.st || '09:00'}:00+07:00`) + (af.stag ? Math.floor(i / Math.max(1, +af.per || 1)) : 0) * 864e5).toISOString();
function stAfSched() {
  document.querySelectorAll('#af-mode button').forEach((b, i) => b.classList.toggle('on', ['now', 'sched'][i] === af.mode));
  document.getElementById('af-sched').innerHTML = af.mode === 'sched' ? `<div class="st-g2b"><label class="st-fl">Tanggal<input class="st-in" type="date" value="${af.sd}" min="${todayWIB()}" onchange="af.sd=this.value;stAfSched();stAfList()"></label><label class="st-fl">Jam (WIB)<input class="st-in" type="time" step="300" value="${af.st}" onchange="af.st=this.value;stAfSched();stAfList()"></label></div>
    <label class="st-ck"><input type="checkbox"${af.stag ? ' checked' : ''} onchange="af.stag=this.checked;stAfSched();stAfList()"> Rilis bertahap: <input class="st-in st-num" type="number" min="1" max="50" value="${af.per}" onchange="af.per=Math.max(1,Math.min(50,parseInt(this.value)||1));stAfSched();stAfList()"> materi per hari</label>` : '';
  const n = af.items.length, past = af.mode === 'sched' && !(Date.parse(afAt(0)) > Date.now());
  document.getElementById('af-note').innerHTML = af.mode === 'now' ? 'Langsung tayang untuk publik saat disimpan.' : past ? '⚠ Jam tayang sudah lewat — pilih waktu yang akan datang.'
    : `⏰ ${n > 1 && af.stag ? `Mulai ${esc(cwWhenS(afAt(0)))} sampai ${esc(cwWhenS(afAt(n - 1)))}` : `Tayang ${esc(cwWhenS(afAt(0)))}`}. Sebelum itu hanya Editor yang melihat.`;
  const b = document.getElementById('af-save'); if (b && !af.busy) { b.disabled = !n; b.textContent = af.mode === 'sched' ? `⏰ Simpan jadwal (${n})` : `🚀 Terbitkan (${n})`; }
}
function stAfList() {
  const el = document.getElementById('af-list'); if (!el) return;
  const next = Math.max(0, ...(stCache.acad || []).map(a => a.no)) + 1;
  el.innerHTML = af.items.length ? af.items.map((x, i) => `<div class="st-afit"><img src="${x.url}" alt=""><div class="tx"><small>${esc(af.series || 'Fundamental')} #${next + i}${af.mode === 'sched' ? ` · ⏰ ${esc(cwWhenS(afAt(i)))}` : ''}</small>
    <input class="st-in" value="${esc(x.title)}" placeholder="Judul materi" oninput="af.items[${i}].title=this.value"></div><button class="st-btn sm" onclick="stAfDrop(${i})">🗑</button></div>`).join('') : '<p class="st-empty">Belum ada file dipilih.</p>';
}
async function stAfFiles(input) {
  const files = [...(input.files || [])]; input.value = '';
  for (const f of files) {
    try {
      const parts = /\.pdf$/i.test(f.name) || /pdf$/i.test(f.type) ? (showToast(`Mengubah ${f.name} jadi gambar…`, 20000), await acadPdfPagesS(f)) : /^image\//.test(f.type) ? [{ blob: f, name: f.name }] : null;
      if (!parts) { showToast(`${f.name}: pilih gambar JPG/PNG/WebP atau PDF.`, 5000); continue; }
      parts.forEach(p => af.items.push({ blob: p.blob, url: URL.createObjectURL(p.blob), title: acTitle(p.name) }));
    } catch (e) { showToast(`⚠ ${f.name}: ${e.message || e}`, 6000); }
  }
  showToast(`${af.items.length} materi siap — periksa judulnya lalu simpan.`); stAfList(); stAfSched();
}
function stAfDrop(i) { const [x] = af.items.splice(i, 1); if (x) URL.revokeObjectURL(x.url); stAfList(); stAfSched(); }
async function stAcadSaveNew() {
  if (!af || af.busy || !af.items.length) return;
  if (af.items.some(x => !x.title.trim())) return showToast('⚠ Isi judul untuk setiap materi.');
  if (af.mode === 'sched' && !(Date.parse(afAt(0)) > Date.now())) return showToast('⚠ Jam tayang sudah lewat — ubah tanggal/jam.');
  af.busy = true; const btn = document.getElementById('af-save'); btn.disabled = true; btn.textContent = '⏳ Mengunggah…';
  const store = supabase.storage.from('showcase'), up = [], added = [];
  try {
    await stLoadAcad(true);   // nomor terbaru (cegah bentrok bila materi baru ditambah dari tempat lain)
    let no = Math.max(0, ...stCache.acad.map(a => a.no)) + 1;
    for (const [i, x] of af.items.entries()) {
      btn.textContent = `⏳ Mengunggah ${i + 1}/${af.items.length}…`;
      const b = await acadImgBlobsS(x.blob), ext = b.img.type === 'image/webp' ? 'webp' : 'jpg', ts = Date.now();
      const img = `academy/${acadPad2(no)}-${ts}.${ext}`, thumb = `academy/${acadPad2(no)}-${ts}-thumb.${ext}`;
      for (const [path, blob] of [[img, b.img], [thumb, b.thumb]]) { const { error } = await store.upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false }); if (error) throw error; up.push(path); }
      const at = af.mode === 'sched' ? afAt(i) : null;
      added.push({ no, date: at ? wibYmd(at) : todayWIB(), ...(at ? { at } : {}), title: x.title.trim(), series: (af.series || '').trim() || 'Fundamental', img, thumb }); no++;
    }
    await stAcadSave([...stCache.acadExtra, ...added]);
    const sch = added.filter(a => a.at);
    if (!sch.length) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'acad', id: added.map(a => a.no) } }).catch(() => {});
    showToast(sch.length ? `⏰ ${added.length} materi dijadwalkan — mulai ${cwWhenS(sch[0].at)}` : `🚀 ${added.length} materi diterbitkan`, 6000);
    af.items.forEach(x => URL.revokeObjectURL(x.url)); af = null; location.hash = '#academy';
  } catch (e) {
    if (up.length) store.remove(up).catch(() => {});
    af.busy = false; stAfSched(); showToast('⚠ Gagal menyimpan: ' + (e.message || e), 8000);
  }
}

// ── GALERI INSTALASI (tahap 4, 18 Nov 2026) — sama dengan portal js/showcase.js (saveGlItem/approveGlItem/deleteGlItem/glCmDel) ──
// Tabel showcase_installs + Storage publik showcase/<id>/… (kiriman partner: pending/<id>/…). Posisi/zoom/putar foto & sampul loop tetap diatur di portal
// (field pos/zoom/cover di item photos dipertahankan apa adanya). Logika ada di dua tempat — ubah keduanya bila aturan berubah.
const GL_T = 'showcase_installs', GL_VMAX = 15;
const GL_MAKES_S = ['Toyota', 'Honda', 'Mitsubishi', 'Suzuki', 'Daihatsu', 'Nissan', 'Mazda', 'Hyundai', 'Kia', 'Wuling', 'Chery', 'BYD', 'Isuzu', 'Subaru', 'Lexus', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche', 'Mini', 'Volvo', 'Ford',
  'Aion', 'Denza', 'Geely', 'GWM', 'Jaecoo', 'MG', 'Neta', 'Omoda', 'Polytron', 'Seres', 'Tesla', 'VinFast', 'Xpeng', 'Zeekr', 'Lainnya'];
const GL_BODY_S = [['Bensin / Diesel', ['SUV', 'MPV', 'Sedan', 'Hatchback', 'Double Cabin', 'Coupe']],
  ['Mobil Listrik & Hybrid', ['SUV Listrik (EV)', 'MPV Listrik (EV)', 'Sedan Listrik (EV)', 'Hatchback Listrik (EV)', 'Hybrid (HEV)', 'Plug-in Hybrid (PHEV)']], ['', ['Lainnya']]];
const GL_AREA_S = [['Mobil', ['Tampak Luar', 'Interior', 'Dasbor', 'Pintu', 'Bagasi / Sub']], ['Speaker', ['Tweeter', 'Midrange', 'Midbass', 'Coaxial', 'Subwoofer', 'Box Subwoofer']],
  ['Perangkat', ['Head Unit', 'DSP', 'Amplifier', 'Remote / Controller']], ['Kabel & Instalasi', ['Kabel RCA', 'Kabel Power', 'Kabel Speaker', 'Fuse / Distribution Block', 'Aki / Kapasitor', 'Peredam', 'Rak / Panel Custom', 'Wiring / Kerapian']], ['', ['Lainnya']]];
const glVid = p => p?.type === 'video' || /\.(mp4|m4v|mov|webm)$/i.test(p?.path || '');
const glPend = it => (it?.source === 'dealer' || it?.source === 'admin') && !it.published;
const glSch = it => !!(it?.published && it.publish_at && Date.parse(it.publish_at) > Date.now());
const glTit = it => [it.car_make, it.car_model].filter(Boolean).join(' ');
const glMediaUrl = path => { const m = stCache.media?.[String(path || '').split('#')[0]]; return m?.f ? m.f.split('/').map(encodeURIComponent).join('/') : pubUrl(path); };   // salinan repo (hemat kuota) bila ada
const glPos = p => { const m = String(p?.pos || '').match(/^(\d{1,3}) (\d{1,3})$/); return m ? `${m[1]}% ${m[2]}%` : '50% 50%'; };
const glHof = id => (typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME : []).find(h => h.id === id);
const glHofLabel = h => `${h.place >= 1 && h.place <= 3 ? ['🥇', '🥈', '🥉'][h.place - 1] + ' Juara ' + h.place : '🏆 ' + (h.award || 'Penghargaan')} · ${h.cls || ''} — ${h.car || '?'}${h.name ? ' (' + h.name + ')' : ''} · ${h.event} ${h.year}`;
function glStatus(it) {
  if (glPend(it)) return ['warn', '📥 Menunggu'];
  if (!it.published) return ['mu', 'Draf'];
  if (glSch(it)) return ['gold', '⏰ ' + cwWhenS(it.publish_at)];
  return it.in_gallery === false ? ['blue', '🏪 Profil saja'] : ['ok', 'Tayang'];
}
async function stLoadGl(force) {
  if (stCache.gl && !force) return stCache.gl;
  const [r, mm, ad] = await Promise.all([
    supabase.from(GL_T).select('*').order('sort', { ascending: true }).order('created_at', { ascending: false }),
    stCache.media ? null : fetch('media/map.json?build=' + Date.now(), { cache: 'no-store' }).then(x => x.ok ? x.json() : null).catch(() => null),
    stCache.partners ? null : supabase.from('auth_dealers').select('name, city, region, hidden').order('name').then(x => x.data || []).catch(() => []),
  ]);
  if (r.error) throw r.error;
  if (mm) stCache.media = mm.files || {}; else stCache.media = stCache.media || {};
  if (ad) stCache.partners = ad.filter(d => !d.hidden);
  stCache.gl = r.data || [];
  stCache.glIng = stCache.gl.some(x => 'in_gallery' in x);
  supabase.rpc('gl_social', { p_ids: stCache.gl.map(x => x.id), p_vid: '' }).then(s => { if (s.error) return; stCache.glSoc = new Map((s.data || []).map(x => [x.id, x])); if (document.getElementById('gl-grid')) stGlGrid(); }, () => {});
  return stCache.gl;
}
let stGlF = 'all', stGlQ = '';
async function stGaleri() {
  stPage(`<div class="st-ph"><div><p>Konten · publik</p><h1>Galeri Instalasi</h1></div><div class="st-acts"><button class="st-btn" onclick="stLoadGl(true).then(stGlPaint)">↻</button><a class="st-btn gold" href="#galeri/new">＋ Tambah instalasi</a></div></div>
    <div id="gl-top"></div><div class="st-card"><div class="st-filters" id="gl-f"></div><div class="st-acgrid st-glgrid" id="gl-grid"><p class="st-empty">⏳ Memuat…</p></div></div>`);
  try { await stLoadGl(true); stGlPaint(); } catch (e) { document.getElementById('gl-grid').innerHTML = `<p class="st-empty">⚠ ${esc(e.message)}</p>`; }
}
function stGlPaint() {
  const all = stCache.gl || [], top = document.getElementById('gl-top'); if (!top) return;
  const pend = all.filter(glPend), sched = all.filter(glSch).sort((a, b) => Date.parse(a.publish_at) - Date.parse(b.publish_at));
  top.innerHTML = (pend.length ? `<div class="st-card st-acq"><div class="st-ch"><h3>📥 Kiriman menunggu persetujuan · ${pend.length}</h3></div>
    ${pend.map(it => `<div class="st-row st-glpr"><span class="st-ic warn">🚗</span><div class="tx"><b>${esc(glTit(it))}${it.car_year ? ' ' + it.car_year : ''}</b><small>dari ${esc(it.submitter || it.dealer || 'partner')} · ${(it.photos || []).length} file${it.submitted_at ? ' · ' + wibDate(Date.parse(it.submitted_at), { day: 'numeric', month: 'short' }) : ''}</small></div>
      <a class="st-btn sm" href="#galeri/${it.id}">✏️ Tinjau</a><button class="st-btn sm" onclick="stGlApprove('${it.id}')">✓ Setujui</button><button class="st-btn sm red" onclick="stGlDelete('${it.id}',true)">✕</button></div>`).join('')}</div>` : '') +
    (sched.length ? `<div class="st-card st-acq"><div class="st-ch"><h3>⏰ Antrian tayang · ${sched.length} mobil</h3><span class="st-note" style="margin:0 0 0 auto">otomatis tayang pada jamnya + notifikasi 🚗</span></div>
    ${sched.map(it => `<a class="st-row" href="#galeri/${it.id}"><span class="st-acqt">${esc(cwWhenS(it.publish_at))}</span><div class="tx"><b>${esc(glTit(it))}</b><small>${esc(it.dealer || '—')}</small></div><span class="st-chev">›</span></a>`).join('')}</div>` : '');
  const live = all.filter(it => it.published && !glSch(it));
  const cnt = { all: all.length, live: live.filter(it => it.in_gallery !== false).length, prof: live.filter(it => it.in_gallery === false).length, sched: sched.length, draft: all.filter(it => !it.published && !glPend(it)).length, hof: all.filter(it => it.hof_id).length };
  document.getElementById('gl-f').innerHTML = [['all', 'Semua'], ['live', 'Tayang'], ['prof', '🏪 Profil saja'], ['sched', '⏰ Terjadwal'], ['draft', 'Draf'], ['hof', '🏆 Juara']].filter(([k]) => k === 'all' || cnt[k] || stGlF === k)
    .map(([k, t]) => `<button class="st-chip${stGlF === k ? ' on' : ''}" onclick="stGlF='${k}';stGlPaint()">${t} ${cnt[k]}</button>`).join('') +
    `<label class="st-search sm"><span>🔍</span><input placeholder="Cari mobil / partner / kota…" value="${esc(stGlQ)}" oninput="stGlQ=this.value;stGlGrid()"></label>`;
  stGlGrid();
}
function stGlGrid() {
  const el = document.getElementById('gl-grid'); if (!el) return;
  const q = stGlQ.trim().toLowerCase(), S = stCache.glSoc;
  const ok = it => stGlF === 'all' || (stGlF === 'live' ? it.published && !glSch(it) && it.in_gallery !== false : stGlF === 'prof' ? it.published && !glSch(it) && it.in_gallery === false
    : stGlF === 'sched' ? glSch(it) : stGlF === 'draft' ? !it.published && !glPend(it) : !!it.hof_id);
  const rows = (stCache.gl || []).filter(it => ok(it) && (!q || `${glTit(it)} ${it.car_year || ''} ${it.dealer || ''} ${it.city || ''}`.toLowerCase().includes(q)));
  el.innerHTML = rows.map(it => {
    const ph = (it.photos || []).find(p => !glVid(p)) || it.photos?.[0], nV = (it.photos || []).filter(glVid).length, nI = (it.photos || []).length - nV, [c, t] = glStatus(it), s = S?.get(it.id);
    return `<a class="st-acc${glSch(it) || glPend(it) ? ' sched' : ''}" href="#galeri/${it.id}"><span class="st-acth st-glth">${ph ? (glVid(ph) ? `<video src="${esc(glMediaUrl(ph.path))}#t=0.5" muted playsinline preload="metadata" style="object-position:${glPos(ph)}"></video>` : `<img src="${esc(glMediaUrl(ph.path))}" alt="" loading="lazy" style="object-position:${glPos(ph)}">`) : '<i>🚗</i>'}
      <span class="st-pill ${c}">${esc(t)}</span>${it.hof_id ? '<span class="st-glhof">🏆</span>' : ''}</span>
      <div class="st-acb"><small>${esc(it.car_make || '')}${it.body ? ' · ' + esc(it.body) : ''}</small><b>${esc(it.car_model || '')}${it.car_year ? ' ' + it.car_year : ''}</b>
      <div class="st-acm"><span>${esc(it.dealer || '—')}${it.city ? ' · ' + esc(it.city) : ''}</span></div>
      <div class="st-acm"><span>${[nI ? '📷 ' + nI : '', nV ? '🎬 ' + nV : ''].filter(Boolean).join(' · ') || 'tanpa media'}</span>${s ? `<span>❤ ${s.likes} · 💬 ${s.comments}</span>` : ''}</div></div></a>`;
  }).join('') || '<p class="st-empty">Tidak ada instalasi.</p>';
}
// ── Form tambah / edit ──
let gf = null;
async function stGlEdit(id) {
  try { await stLoadGl(); } catch (e) { return stPage(`<p class="st-empty">⚠ ${esc(e.message)}</p>`); }
  const it = id ? stCache.gl.find(x => x.id === id) : null;
  if (id && !it) { showToast('Instalasi tidak ditemukan.'); location.hash = '#galeri'; return; }
  const tom = new Date(Date.parse(todayWIB() + 'T00:00:00Z') + 864e5).toISOString().slice(0, 10);
  const w = it && glSch(it) ? new Date(Date.parse(it.publish_at) + 7 * 36e5).toISOString() : null;
  gf = { id: it?.id || null, car_make: it?.car_make || '', car_model: it?.car_model || '', car_year: it?.car_year || '', body: it?.body || '', dealer: it?.dealer || '', city: it?.city || '', note: it?.note || '',
    products: [...(it?.products || [])], photos: (it?.photos || []).map(p => ({ ...p, url: glMediaUrl(p.path) })), removed: [], hof_id: it?.hof_id || '', sort: it?.sort || 0,
    in_gallery: it ? it.in_gallery !== false : true, notify: it ? it.notify !== false : true, pend: it ? glPend(it) : false,
    mode: !it ? 'now' : w ? 'sched' : it.published ? 'now' : 'draft', sd: w ? w.slice(0, 10) : tom, st: w ? w.slice(11, 16) : '19:00',
    wasLive: !!(it && it.published && !glPend(it) && !glSch(it)), busy: false };
  const prodOpts = PRODS().map(x => `<option value="${esc(x.b.name + ' · ' + x.p.name)}"></option>`).join('');
  const hofOpts = (typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME : []).map(h => `<option value="${esc(h.id)}"${gf.hof_id === h.id ? ' selected' : ''}>${esc(glHofLabel(h))}</option>`).join('');
  stPage(`<div class="st-ph"><div><p><a href="#galeri">Galeri Instalasi</a> › ${it ? 'Edit' : 'Baru'}</p><h1>${it ? esc(glTit(it)) + (it.car_year ? ' ' + it.car_year : '') : 'Tambah instalasi'}</h1></div>
      <div class="st-acts">${it ? `<button class="st-btn red" onclick="stGlDelete('${it.id}',${gf.pend})">${gf.pend ? '✕ Tolak' : '🗑'}</button>${!gf.pend && it.published && !glSch(it) ? `<a class="st-btn" href="/?gl=${it.id}" target="_blank" rel="noopener">↗ Lihat · atur posisi foto</a>` : ''}` : ''}<button class="st-btn pri" id="gf-save" onclick="stGlSave()">💾 Simpan</button></div></div>
    ${gf.pend ? `<div class="st-card st-pad st-glpend">📥 <b>Kiriman dari ${esc(it.submitter || it.dealer || 'partner')}</b> — belum tampil. Periksa foto/video (plat nomor harus diburamkan), lalu pilih <b>Sekarang</b> atau <b>Jadwalkan</b> dan simpan untuk menyetujui.</div>` : ''}
    <div class="st-ed"><div class="st-col"><div class="st-card st-pad">
      <div class="st-g2b st-gle"><label class="st-fl" style="margin-top:0">Merek<select class="st-in" onchange="gf.car_make=this.value"><option value="">— Pilih merek —</option>${GL_MAKES_S.map(m => `<option${gf.car_make === m ? ' selected' : ''}>${m}</option>`).join('')}${gf.car_make && !GL_MAKES_S.includes(gf.car_make) ? `<option selected>${esc(gf.car_make)}</option>` : ''}</select></label>
        <label class="st-fl" style="margin-top:0">Model<input class="st-in" value="${esc(gf.car_model)}" placeholder="mis. Fortuner GR" oninput="gf.car_model=this.value"></label></div>
      <div class="st-g2b"><label class="st-fl">Tahun<input class="st-in" type="number" min="1980" max="2100" value="${esc(gf.car_year)}" oninput="gf.car_year=this.value"></label>
        <label class="st-fl">Tipe<select class="st-in" onchange="gf.body=this.value"><option value="">—</option>${GL_BODY_S.map(([g, a]) => (g ? `<optgroup label="${g}">` : '') + a.map(b => `<option${gf.body === b ? ' selected' : ''}>${b}</option>`).join('') + (g ? '</optgroup>' : '')).join('')}${gf.body && !GL_BODY_S.some(g => g[1].includes(gf.body)) ? `<option selected>${esc(gf.body)}</option>` : ''}</select></label></div>
      <div class="st-g2b st-gle"><label class="st-fl">Partner pemasang<input class="st-in" list="gf-dl" value="${esc(gf.dealer)}" placeholder="Nama partner resmi" oninput="stGfDealer(this.value)"><datalist id="gf-dl">${(stCache.partners || []).map(d => `<option value="${esc(d.name)}">${esc(d.city || '')}</option>`).join('')}</datalist></label>
        <label class="st-fl">Kota<input class="st-in" id="gf-city" value="${esc(gf.city)}" oninput="gf.city=this.value"></label></div>
      <label class="st-fl">Catatan <small>(opsional, tampil di detail)</small><textarea class="st-in" rows="2" oninput="gf.note=this.value">${esc(gf.note)}</textarea></label>
      <label class="st-fl">Perangkat CAI yang dipasang<input class="st-in" list="gf-pl" placeholder="Ketik produk lalu Enter…" onchange="stGfProd(this)" onkeydown="if(event.key==='Enter'){event.preventDefault();stGfProd(this)}"><datalist id="gf-pl">${prodOpts}</datalist></label>
      <div class="st-glchips" id="gf-prods"></div>
      <label class="st-fl">🏆 Prestasi Hall of Fame <small>(bila mobil ini juara)</small><select class="st-in" onchange="gf.hof_id=this.value"><option value="">— Bukan mobil juara —</option>${hofOpts}</select></label>
    </div>
    <div class="st-card st-pad"><div class="st-ch" style="padding:0;border:0"><h3>📷 Foto &amp; video</h3><span class="st-note" style="margin:0 0 0 auto" id="gf-cnt"></span></div>
      <div class="st-row2"><label class="st-drop sm"><input type="file" accept="image/*" multiple hidden onchange="stGfPhotos(this)"><b>＋ Foto</b><small>diperkecil otomatis ≤1600 px</small></label>
        <label class="st-drop sm"><input type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" multiple hidden onchange="stGfVideos(this)"><b>＋ Video</b><small>MP4 maks. ${GL_VMAX} MB · kompres dulu</small></label></div>
      <div class="st-glmed" id="gf-media"></div>
      <p class="st-note">Foto pertama = sampul kartu. <b>📲 WA</b> = sampul kartu pratinjau WhatsApp — pilih foto/detik video <b>tanpa plat nomor</b>. Geser posisi, zoom, putar foto &amp; sampul loop: buka di portal (↗ Lihat).</p></div></div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl" style="margin-top:0">Tayang<div class="st-seg" id="gf-mode"><button onclick="stGfMode('draft')">Draf</button><button onclick="stGfMode('now')">Sekarang</button><button onclick="stGfMode('sched')">⏰ Jadwalkan</button></div></div>
      <div id="gf-sched"></div><p class="st-note" id="gf-snote"></p>
      <div class="st-fl">📍 Tampil di</div>
      <label class="st-ck" style="margin-top:8px"><input type="checkbox" checked disabled><span class="st-ckt">🏪 Profil partner &amp; Contoh pemasangan di halaman produk</span></label>
      <label class="st-ck" style="margin-top:8px"><input type="checkbox"${gf.in_gallery ? ' checked' : ''} onchange="gf.in_gallery=this.checked;stGfNote()"><span class="st-ckt">🚗 Galeri Instalasi <small class="st-mu" style="font-weight:400">— menu Galeri, Dashboard, Baru minggu ini</small></span></label>
      <label class="st-ck" id="gf-notw"><input type="checkbox"${gf.notify ? ' checked' : ''} onchange="gf.notify=this.checked;stGfNote()"><span class="st-ckt">🔔 Kirim notifikasi “Instalasi baru”</span></label>
      <label class="st-fl">Urutan <small>(kecil = lebih depan)</small><input class="st-in st-num" style="width:90px" type="number" value="${esc(gf.sort)}" oninput="gf.sort=this.value"></label>
    </div>
    ${it ? `<div class="st-card"><div class="st-ch"><h3>💬 Komentar</h3><span class="st-note" style="margin:0 0 0 auto" id="gf-likes"></span></div><div id="gf-cm"><p class="st-empty">⏳ Memuat…</p></div></div>` : ''}</div></div>`);
  stGfProds(); stGfMedia(); stGfPaint();
  if (it) stGlCm(it.id);
}
function stGfDealer(v) { gf.dealer = v; const d = (stCache.partners || []).find(x => x.name.toLowerCase() === v.trim().toLowerCase()); if (d && !gf.city) { gf.city = d.city || ''; const c = document.getElementById('gf-city'); if (c) c.value = gf.city; } }
function stGfProd(inp) {
  const v = inp.value.trim(); if (!v) return;
  const x = PRODS().find(r => r.b.name + ' · ' + r.p.name === v || r.p.name.toLowerCase() === v.toLowerCase() || String(r.p.model || '').toLowerCase() === v.toLowerCase());
  if (!x) return showToast('Produk tidak ditemukan — pilih dari daftar.');
  if (!gf.products.includes(x.p.id)) gf.products.push(x.p.id); inp.value = ''; stGfProds();
}
function stGfProds() {
  const el = document.getElementById('gf-prods'); if (!el) return;
  el.innerHTML = gf.products.map((id, i) => { const x = PRODS().find(r => r.p.id === id); return `<span class="st-glchip">${esc(x ? x.b.name + ' · ' + x.p.name : id)}<button onclick="gf.products.splice(${i},1);stGfProds()" aria-label="Hapus">✕</button></span>`; }).join('') || '<span class="st-mu" style="font-size:12.5px">Belum ada produk.</span>';
}
async function stGfPhotos(input) {
  const files = [...input.files]; input.value = '';
  for (const f of files) { try { const blob = await glResize(f); gf.photos.push({ blob, url: URL.createObjectURL(blob), area: '' }); } catch (e) { showToast('⚠ ' + e.message); } }
  stGfMedia();
}
function stGfVideos(input) {
  const files = [...input.files]; input.value = '';
  for (const f of files) {
    if (!/^video\//.test(f.type) && !/\.(mp4|m4v|mov|webm)$/i.test(f.name)) { showToast('⚠ Bukan file video: ' + f.name); continue; }
    const mb = f.size / 1048576;
    if (mb > GL_VMAX) { showToast(`⚠ ${f.name} ${mb.toFixed(1)} MB — maksimal ${GL_VMAX} MB per video. Kompres dulu lalu unggah lagi.`, 7000); continue; }
    gf.photos.push({ blob: f, video: true, url: URL.createObjectURL(f), area: '' });
  }
  stGfMedia();
}
function stGfMedia() {
  const el = document.getElementById('gf-media'); if (!el) return;
  const nV = gf.photos.filter(p => p.video || glVid(p)).length; document.getElementById('gf-cnt').textContent = `📷 ${gf.photos.length - nV} · 🎬 ${nV}`;
  el.innerHTML = gf.photos.map((p, i) => {
    const v = !!(p.video || glVid(p)), area = p.area || '';
    const opts = GL_AREA_S.map(([g, a]) => (g ? `<optgroup label="${g}">` : '') + a.map(x => `<option${area === x ? ' selected' : ''}>${x}</option>`).join('') + (g ? '</optgroup>' : '')).join('') + (area && !GL_AREA_S.some(g => g[1].includes(area)) ? `<option selected>${esc(area)}</option>` : '');
    return `<div class="st-glm${p.wa ? ' wa' : ''}"><div class="st-glmv">${v ? `<video src="${esc(p.url)}${p.blob ? '' : '#t=' + (p.waT ?? 0.5)}" muted playsinline controls preload="metadata" id="gfv-${i}"></video>` : `<img src="${esc(p.url)}" alt="" style="object-position:${glPos(p)}">`}
      ${i === 0 ? '<span class="st-pill gold">Sampul</span>' : ''}${p.blob ? '<span class="st-pill blue r">Baru</span>' : ''}${p.cover ? '<span class="st-pill mu r">🎞 loop</span>' : ''}</div>
      <select class="st-in sm" onchange="gf.photos[${i}].area=this.value"><option value="">— Keterangan —</option>${opts}</select>
      <div class="st-glma"><button onclick="stGfMove(${i},-1)" title="Geser ke kiri"${i ? '' : ' disabled'}>◀</button><button onclick="stGfMove(${i},1)" title="Geser ke kanan"${i < gf.photos.length - 1 ? '' : ' disabled'}>▶</button>
        <button class="${p.wa ? 'on' : ''}" onclick="stGfWa(${i})" title="${v ? 'Jeda video di detik yang aman lalu tekan' : 'Jadikan sampul kartu WA'}">📲 WA${p.wa && v && p.waT != null ? ' ' + (+p.waT).toFixed(1) + 's' : ''}</button>
        ${v ? `<button class="${p.mute ? 'on' : ''}" onclick="gf.photos[${i}].mute=!gf.photos[${i}].mute;stGfMedia()" title="Tayang tanpa suara untuk semua penonton">${p.mute ? '🔇' : '🔊'}</button>` : ''}<button onclick="stGfDel(${i})" title="Hapus">🗑</button></div></div>`;
  }).join('') || '<p class="st-empty">Belum ada foto / video.</p>';
}
function stGfMove(i, d) { const a = gf.photos, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; stGfMedia(); }
function stGfDel(i) { const [p] = gf.photos.splice(i, 1); if (p.path) gf.removed.push(p.path); if (p.blob) URL.revokeObjectURL(p.url); stGfMedia(); }
function stGfWa(i) {
  const p = gf.photos[i], v = !!(p.video || glVid(p));
  if (p.wa && !v) { delete p.wa; delete p.waT; return stGfMedia(); }
  let t = null;
  if (v) { const el = document.getElementById('gfv-' + i); if (!el || (!el.currentTime && !p.wa)) return showToast('▶ Putar videonya, jeda di detik yang aman (tanpa plat nomor), lalu tekan 📲 WA.', 6000); t = Math.round(el.currentTime * 10) / 10; }
  gf.photos.forEach(q => { delete q.wa; delete q.waT; });
  p.wa = true; if (v) p.waT = t; stGfMedia();
}
function stGfMode(m) { gf.mode = m; stGfPaint(); }
const gfIso = () => gf.mode === 'sched' && gf.sd && gf.st ? new Date(`${gf.sd}T${gf.st}:00+07:00`).toISOString() : null;
function stGfPaint() {
  document.querySelectorAll('#gf-mode button').forEach((b, i) => b.classList.toggle('on', ['draft', 'now', 'sched'][i] === gf.mode));
  document.getElementById('gf-sched').innerHTML = gf.mode === 'sched' ? `<div class="st-g2b"><label class="st-fl">Tanggal<input class="st-in" type="date" value="${esc(gf.sd)}" min="${todayWIB()}" oninput="gf.sd=this.value;stGfNote()"></label><label class="st-fl">Jam (WIB)<input class="st-in" type="time" step="300" value="${esc(gf.st)}" oninput="gf.st=this.value;stGfNote()"></label></div>` : '';
  stGfNote();
}
function stGfNote() {
  const iso = gfIso(), past = iso && Date.parse(iso) <= Date.now(), el = document.getElementById('gf-snote'), btn = document.getElementById('gf-save');
  const nw = document.getElementById('gf-notw'); if (nw) nw.style.display = gf.wasLive || gf.mode === 'draft' || !gf.in_gallery ? 'none' : '';
  if (el) el.innerHTML = gf.mode === 'draft' ? (gf.pend ? 'Tetap menunggu — belum tampil untuk pengunjung.' : 'Draf hanya terlihat oleh Editor.')
    : gf.mode === 'now' ? (gf.wasLive ? 'Sudah tayang — perubahan langsung terlihat.' : `Tayang begitu disimpan${gf.in_gallery && gf.notify ? ' + notifikasi 🚗 ke HP pengunjung' : ''}.`)
    : past ? '⚠ Waktu ini sudah lewat — pilih waktu yang akan datang.' : `Otomatis tayang <b>${esc(cwWhenS(iso))}</b>${gf.in_gallery && gf.notify ? ' + notifikasi 🚗' : ''}. Sebelum itu hanya Editor yang melihat.`;
  if (btn && !gf.busy) btn.textContent = gf.mode === 'draft' ? '💾 Simpan draf' : gf.mode === 'sched' ? '⏰ Simpan jadwal' : gf.wasLive ? '💾 Simpan' : gf.pend ? '✓ Setujui & tayangkan' : '🚀 Tayangkan';
}
async function stGlSave() {
  if (!gf || gf.busy) return;
  if (!gf.car_make || !String(gf.car_model).trim()) return showToast('⚠ Isi merek & model mobil dulu.');
  const iso = gfIso();
  if (gf.mode === 'sched' && !(Date.parse(iso) > Date.now())) return showToast('⚠ Jam tayang sudah lewat — ubah tanggal/jam.');
  if (gf.mode !== 'draft' && !gf.photos.length && !confirm('Instalasi ini belum punya foto/video. Tetap tayangkan?')) return;
  gf.busy = true; const btn = document.getElementById('gf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  const store = supabase.storage.from('showcase'), up = [];
  try {
    const old = gf.id ? stCache.gl.find(x => x.id === gf.id) : null;
    const row = { car_make: gf.car_make, car_model: String(gf.car_model).trim(), car_year: gf.car_year ? +gf.car_year : null, body: gf.body || null,
      dealer: gf.dealer.trim() || null, city: gf.city.trim() || null, note: gf.note.trim() || null, products: gf.products, hof_id: gf.hof_id || null,
      published: gf.mode !== 'draft', sort: +gf.sort || 0, updated_at: new Date().toISOString(),
      publish_at: gf.mode === 'sched' ? iso : gf.mode === 'now' && old?.publish_at && Date.parse(old.publish_at) <= Date.now() ? old.publish_at : null,
      notify: !!gf.notify && gf.in_gallery };
    if (iso && iso !== old?.publish_at) row.remind_at = null;
    if (stCache.glIng || !gf.in_gallery) row.in_gallery = !!gf.in_gallery;
    let id = gf.id;
    if (!id) { const { data, error } = await supabase.from(GL_T).insert({ ...row, photos: [] }).select('id').single(); if (error) throw error; id = gf.id = data.id; }
    const photos = [];
    for (const [i, p] of gf.photos.entries()) {
      let path = p.path;
      if (p.blob) {
        const ext = p.video ? ((p.blob.name?.match(/\.(mp4|m4v|mov|webm)$/i)?.[1] || 'mp4').toLowerCase()) : p.blob.type === 'image/webp' ? 'webp' : 'jpg';
        path = `${id}/${Date.now()}-${i}.${ext}`; btn.textContent = `⏳ Mengunggah ${i + 1}/${gf.photos.length}…`;
        const { error } = await store.upload(path, p.blob, { contentType: p.blob.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4'), cacheControl: '31536000', upsert: false });
        if (error) throw new Error(/exceeded|too large|413|maximum/i.test(error.message || '') ? `${p.video ? 'Video' : 'Foto'} terlalu besar untuk batas unggah Supabase (${error.message})` : error.message);
        up.push(path);
      }
      const v = !!(p.video || glVid(p)), r = { path, area: p.area || '' };   // field sama dengan glPhotoRow() portal
      if (v) r.type = 'video'; if (/^\d{1,3} \d{1,3}$/.test(p.pos || '')) r.pos = p.pos; if (+p.zoom > 1) r.zoom = +p.zoom;
      if (v && p.mute) r.mute = true; if (v && p.cover) r.cover = true; if (p.wa) { r.wa = true; if (v && p.waT != null) r.waT = +p.waT; }
      photos.push(r);
    }
    const { error } = await supabase.from(GL_T).update({ ...row, photos }).eq('id', id); if (error) throw error;
    if (gf.removed.length) store.remove(gf.removed).catch(() => {});
    const goLive = gf.mode === 'now' && !gf.wasLive;
    if (goLive && row.notify) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'gallery', id } }).catch(() => {});
    showToast(gf.mode === 'sched' ? `⏰ Dijadwalkan tayang ${cwWhenS(iso)}` : goLive ? (gf.pend ? '✓ Kiriman disetujui & tayang' : '🚀 Instalasi tayang') + (row.notify ? ' — notifikasi 🚗 dikirim' : '') : '✓ Instalasi disimpan', 6000);
    gf.photos.forEach(p => p.blob && URL.revokeObjectURL(p.url)); gf = null; stCache.sched = null;
    await stLoadGl(true); location.hash = '#galeri';
  } catch (e) {
    const m = String(e.message || e);
    if (up.length) store.remove(up).catch(() => {});
    gf.busy = false; btn.disabled = false; stGfNote();
    showToast(/in_gallery|publish_at|remind_at|notify|schema cache/i.test(m) ? '⚠ Kolom database belum lengkap — jalankan SQL Galeri dari menu portal (📋 Salin SQL). ' + m : '⚠ Gagal menyimpan: ' + m, 9000);
  }
}
async function stGlApprove(id) {
  const it = stCache.gl?.find(x => x.id === id); if (!it) return;
  if (!confirm(`Setujui & tayangkan ${glTit(it)} sekarang?\n\nPastikan plat nomor sudah diburamkan.`)) return;
  const { error } = await supabase.from(GL_T).update({ published: true, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return showToast('⚠ Gagal menyetujui: ' + error.message, 6000);
  if (it.in_gallery !== false) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'gallery', id } }).catch(() => {});
  showToast(`✓ ${glTit(it)} disetujui — kini tayang`); await stLoadGl(true); stGlPaint();
}
async function stGlDelete(id, reject) {
  const it = stCache.gl?.find(x => x.id === id); if (!it) return;
  if (!confirm(reject ? `Tolak kiriman ${glTit(it)} dari ${it.submitter || 'partner'}?\n\nKiriman & semua foto/videonya dihapus permanen.` : `Hapus instalasi ${glTit(it)}${it.car_year ? ' ' + it.car_year : ''} beserta semua foto/videonya?`)) return;
  const { error } = await supabase.from(GL_T).delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 6000);
  const paths = (it.photos || []).map(p => p.path).filter(Boolean); if (paths.length) supabase.storage.from('showcase').remove(paths).catch(() => {});
  showToast(reject ? '✓ Kiriman ditolak & dihapus' : '🗑 Instalasi dihapus'); gf = null; stCache.sched = null;
  await stLoadGl(true); if (location.hash === '#galeri') stGlPaint(); else location.hash = '#galeri';
}
async function stGlCm(id) {
  const el = document.getElementById('gf-cm'); if (!el) return;
  const s = stCache.glSoc?.get(id), lk = document.getElementById('gf-likes'); if (lk && s) lk.textContent = `❤ ${s.likes} suka`;
  const { data, error } = await supabase.rpc('gl_comment_list', { p_id: id });
  if (!document.getElementById('gf-cm')) return;
  if (error) { el.innerHTML = `<p class="st-empty">${/function|schema cache|PGRST202/i.test(error.message) ? 'Fitur suka & komentar belum aktif.' : '⚠ ' + esc(error.message)}</p>`; return; }
  el.innerHTML = (data || []).map(c => `<div class="st-row"><div class="tx"><b>${esc(c.name)}${c.badge === 'partner' ? ' <span class="st-pill ok">✓ Partner</span>' : c.badge === 'cai' ? ' <span class="st-pill gold">✓ Tim CAI</span>' : ''}</b>
    <small style="color:var(--tx);font-size:13px">${esc(c.body)}</small><small>${wibDate(Date.parse(c.created_at), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
    <button class="st-btn sm" onclick="stGlCmDel('${id}','${c.id}')" title="Hapus komentar">🗑</button></div>`).join('') || '<p class="st-empty">Belum ada komentar.</p>';
}
async function stGlCmDel(id, cid) {
  if (!confirm('Hapus komentar ini? Tidak bisa dikembalikan.')) return;
  const { error } = await supabase.rpc('gl_comment_del', { p_cid: cid });
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 6000);
  showToast('✓ Komentar dihapus'); stGlCm(id);
}

// ── PANDUAN PARTNER (tahap 5, 18 Nov 2026) — sama dengan portal js/core.js (loadGuideFiles/saveGuideUpload/guideReschedule/deleteGuideFile) ──
// PDF privat di Storage `guides/<folder>/…`; terjadwal = `guides/pending/<folder>/…` + tabel guide_schedule (dipindah cway-push pada jamnya).
// Kartu panduan = DEALER_GUIDES di js/core.js (dibaca dari teks file, data murni). Sampul = thumbs/<path pdf>.jpg (dibuat pdf.js bila belum ada).
const GD_BUCKET = 'guides', GD_TTL = 600, GD_NEW_DAYS = 5;
const gdTitle = n => n.replace(/\.pdf$/i, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim() || n;
function gdSafe(n) {
  const base = String(n).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.pdf$/i, '').replace(/[^\w.\- ]+/g, ' ').trim().replace(/\s+/g, '_').slice(0, 120);
  return (base || 'panduan-' + Date.now()) + '.pdf';
}
const gdSize = b => b ? (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB') : '';
const gdThumbPath = key => `thumbs/${key}.jpg`;
async function stLoadGd(force) {
  if (stCache.gd && !force) return stCache.gd;
  if (!stCache.gdCards) {
    try { const t = await (await fetch('js/core.js?t=' + Date.now(), { cache: 'no-store' })).text(); const m = t.match(/const DEALER_GUIDES = (\[[\s\S]*?\n\]);/); stCache.gdCards = m ? Function('return ' + m[1])() : []; }
    catch (e) { stCache.gdCards = []; }
  }
  const cards = stCache.gdCards.filter(g => !g.hidden && g.folder), store = supabase.storage.from(GD_BUCKET);
  const list = async dir => { const { data, error } = await store.list(dir, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } }); if (error) throw error; return (data || []).filter(f => f.id); };
  const [root, sch, ...folders] = await Promise.all([list(''), supabase.from('guide_schedule').select('id, folder, src, dest, title, publish_at, error').is('done_at', null).order('publish_at'), ...cards.map(g => list(g.folder))]);
  const rootMap = new Map(root.map(f => [f.name, f])), row = (key, title, f) => ({ key, title, date: f.updated_at || f.created_at, size: f.metadata?.size || 0 });
  stCache.gd = cards.map((g, i) => {
    const files = folders[i].filter(f => /\.pdf$/i.test(f.name)).map(f => row(`${g.folder}/${f.name}`, gdTitle(f.name), f));
    const legacy = g.path && rootMap.get(g.path); if (legacy) files.push(row(g.path, g.pathTitle || gdTitle(g.path), legacy));
    files.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { ...g, files };
  });
  stCache.gdSchedMissing = !!sch.error; stCache.gdSched = sch.error ? [] : (sch.data || []);
  return stCache.gd;
}
async function stGuides() {
  stPage(`<div class="st-ph"><div><p>Konten · khusus partner (Kode Akses)</p><h1>Panduan Partner</h1></div><div class="st-acts"><button class="st-btn" onclick="stLoadGd(true).then(stGdPaint)">↻</button><a class="st-btn gold" href="#guides/new">＋ Tambah PDF</a></div></div>
    <div id="gd-body"><div class="st-card"><p class="st-empty">⏳ Memuat…</p></div></div>`);
  try { await stLoadGd(true); stGdPaint(); } catch (e) { document.getElementById('gd-body').innerHTML = `<div class="st-card"><p class="st-empty">⚠ ${esc(e.message)}</p></div>`; }
}
function stGdPaint() {
  const el = document.getElementById('gd-body'); if (!el) return;
  const q = stCache.gdSched || [];
  const fileCard = (f, g) => {
    const d = Date.now() - new Date(f.date) < GD_NEW_DAYS * 864e5;
    return `<div class="st-acc"><button class="st-acth st-gdth" data-gd="${esc(f.key)}" onclick="stGdOpen('${esc(f.key)}')"><i>📄</i><img alt="">${d ? '<span class="st-pill gold">BARU</span>' : ''}<span class="st-pill mu r">PDF${f.size ? ' · ' + gdSize(f.size) : ''}</span></button>
      <div class="st-acb"><b>${esc(f.title)}</b><div class="st-acm"><span>${new Date(f.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}</span></div>
      <div class="st-aca"><button onclick="stGdOpen('${esc(f.key)}')">Buka</button><button onclick="stGdOpen('${esc(f.key)}',true)">⬇ Unduh</button><button onclick="stGdShare('${esc(f.key)}')" title="Bagikan link ke WA (penerima perlu Kode Akses)">💬 WA</button><button onclick="stGdDel('${esc(f.key)}')" title="Hapus">🗑</button></div></div></div>`;
  };
  el.innerHTML = (stCache.gdSchedMissing ? '<div class="st-card st-pad st-glpend" style="margin-bottom:16px">Jadwal tayang Panduan butuh SQL sekali — salin lewat menu Panduan Partner di portal (📋 Salin SQL Notifikasi &amp; Jadwal).</div>' : '') +
    (q.length ? `<div class="st-card st-acq"><div class="st-ch"><h3>⏰ Antrian tayang · ${q.length} PDF</h3><span class="st-note" style="margin:0 0 0 auto">otomatis tampil untuk partner pada jamnya + notifikasi 📘</span></div>
    ${q.map(r => `<div class="st-row st-glpr"><span class="st-acqt">${esc(cwWhenS(r.publish_at))}</span><div class="tx"><b>${esc(r.title || gdTitle(r.dest.split('/').pop()))}</b><small>${esc((stCache.gd.find(g => g.folder === r.folder) || {}).title || r.folder)}${r.error ? ` · <span style="color:var(--red)">⚠ ${esc(r.error)}</span>` : ''}</small></div>
      <button class="st-btn sm" onclick="stGdOpen('${esc(r.src)}')">Buka</button><button class="st-btn sm" onclick="stGdResched('${r.id}')">✏️ Jadwal</button><button class="st-btn sm red" onclick="stGdSchedDel('${r.id}')">🗑</button></div>`).join('')}</div>` : '') +
    stCache.gd.map(g => `<div class="st-card st-gdsec"><div class="st-ch"><h3>${g.icon || '📘'} ${esc(g.title)}</h3><span class="st-pill gold">${esc(g.category || '')}</span><span class="st-note" style="margin:0 0 0 auto">${g.files.length} file</span><a class="st-btn sm" href="#guides/new/${esc(g.id)}">＋ PDF</a></div>
      <div class="st-acgrid">${g.files.map(f => fileCard(f, g)).join('') || '<p class="st-empty" style="grid-column:1/-1">Belum ada PDF.</p>'}</div></div>`).join('');
  stGdThumbs();
}
let stGdRun = 0;
async function stGdThumbs() {
  const run = ++stGdRun, store = supabase.storage.from(GD_BUCKET), T = stCache.gdThumbs = stCache.gdThumbs || new Map();
  const all = (stCache.gd || []).flatMap(g => g.files), apply = () => document.querySelectorAll('[data-gd]').forEach(b => { const u = T.get(b.dataset.gd); const img = b.querySelector('img'); if (u && img.getAttribute('src') !== u) { img.onload = () => img.classList.add('on'); img.src = u; } });
  const need = all.filter(f => !T.has(f.key)); if (!need.length) return apply();
  const meta = new Map();
  await Promise.all(['', ...new Set(stCache.gd.map(g => g.folder))].map(async f => { const dir = f ? `thumbs/${f}` : 'thumbs'; const { data } = await store.list(dir, { limit: 1000 }).catch(() => ({})); (data || []).filter(x => x.id).forEach(x => meta.set(`${dir}/${x.name}`, x.updated_at || x.created_at)); }));
  const fresh = need.filter(f => { const t = meta.get(gdThumbPath(f.key)); return t && new Date(t) >= new Date(f.date); });
  if (fresh.length) { const { data } = await store.createSignedUrls(fresh.map(f => gdThumbPath(f.key)), 3600).catch(() => ({})); (data || []).forEach((d, i) => d?.signedUrl && T.set(fresh[i].key, d.signedUrl)); apply(); }
  for (const f of need.filter(x => !T.has(x.key))) {   // sampul belum ada → halaman 1 PDF digambar pdf.js lalu disimpan untuk semua partner
    if (run !== stGdRun) return;
    try {
      const lib = await loadPdfJs(), { data, error } = await store.createSignedUrl(f.key, 600); if (error) throw error;
      const doc = await lib.getDocument({ url: data.signedUrl, disableAutoFetch: true, disableStream: true, rangeChunkSize: 262144 }).promise;
      try {
        const page = await doc.getPage(1), v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: 640 / Math.max(v1.width, v1.height) }), cv = document.createElement('canvas');
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
        const blob = await new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error('kosong')), 'image/jpeg', .82));
        T.set(f.key, URL.createObjectURL(blob)); apply();
        store.upload(gdThumbPath(f.key), blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' }).catch(() => {});
      } finally { doc.destroy(); }
    } catch (e) { console.warn('cover', f.key, e); }
  }
}
async function stGdOpen(key, dl) {
  const win = dl ? null : window.open('', '_blank');   // dibuka di dalam klik agar tidak diblokir browser HP
  const { data, error } = await supabase.storage.from(GD_BUCKET).createSignedUrl(key, GD_TTL, dl ? { download: key.split('/').pop() } : undefined);
  if (error) { win?.close(); return showToast('⚠ PDF tidak bisa dibuka: ' + error.message, 6000); }
  if (win) win.location.href = data.signedUrl; else location.href = data.signedUrl;
}
function stGdShare(key) {
  const f = (stCache.gd || []).flatMap(g => g.files).find(x => x.key === key); if (!f) return;
  window.open(`https://wa.me/?text=${waEnc(`Panduan Partner: ${f.title}\nKhusus partner CAI — buka di CAI Hub dengan Kode Akses:\nhttps://hub.concerto.id/panduan/?guide=${encodeURIComponent(key)}`)}`, '_blank', 'noopener');
}
async function stGdDel(key) {
  const f = (stCache.gd || []).flatMap(g => g.files).find(x => x.key === key); if (!f) return;
  if (!confirm(`Hapus "${f.title}" dari Panduan Partner?\n\nFile akan hilang untuk semua partner.`)) return;
  const { data, error } = await supabase.storage.from(GD_BUCKET).remove([key]);
  if (error || !data?.length) return showToast('⚠ Gagal menghapus: ' + (error?.message || 'izin hapus bucket "guides" belum ada untuk akun ini'), 8000);
  supabase.storage.from(GD_BUCKET).remove([gdThumbPath(key)]).catch(() => {}); stCache.gdThumbs?.delete(key);
  showToast(`🗑 "${f.title}" dihapus`); await stLoadGd(true); stGdPaint();
}
async function stGdResched(id) {
  const r = (stCache.gdSched || []).find(x => x.id === id); if (!r) return;
  const cur = new Date(r.publish_at).toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(0, 16);
  const v = prompt('Jadwal tayang PDF ini (WIB), format YYYY-MM-DD HH:MM.\nKetik "sekarang" untuk langsung tayang (± 1 menit).', cur); if (v == null) return;
  let at;
  if (/^\s*sekarang\s*$/i.test(v)) at = new Date().toISOString();
  else {
    const m = v.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) return showToast('⚠ Format salah. Contoh: 2026-11-20 08:00', 5000);
    at = new Date(Date.parse(`${m[1]}T${m[2].padStart(2, '0')}:${m[3]}:00+07:00`)).toISOString();
    if (!(Date.parse(at) > Date.now())) return showToast('⚠ Waktu sudah lewat — pilih waktu yang akan datang, atau ketik "sekarang".', 5000);
  }
  const { error } = await supabase.from('guide_schedule').update({ publish_at: at, error: null }).eq('id', id);
  if (error) return showToast('⚠ Gagal menyimpan jadwal: ' + error.message, 7000);
  showToast(Date.parse(at) <= Date.now() + 5000 ? '✓ PDF akan tayang dalam ± 1 menit' : `⏰ Dijadwalkan ${cwWhenS(at)}`); stCache.sched = null;
  await stLoadGd(true); stGdPaint();
}
async function stGdSchedDel(id) {
  const r = (stCache.gdSched || []).find(x => x.id === id); if (!r) return;
  if (!confirm(`Hapus PDF terjadwal "${r.title || r.dest}"?\n\nPDF batal tayang dan dihapus.`)) return;
  await supabase.storage.from(GD_BUCKET).remove([r.src]);
  const { error } = await supabase.from('guide_schedule').delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  showToast('🗑 PDF terjadwal dihapus'); stCache.sched = null; await stLoadGd(true); stGdPaint();
}
// Tambah PDF: tayang sekarang (langsung ke folder + notifikasi 📘) atau ⏰ jadwalkan (pending/ + guide_schedule), rilis bertahap n PDF per hari
let gu = null;
async function stGdNew(cardId) {
  try { await stLoadGd(); } catch (e) { return stPage(`<p class="st-empty">⚠ ${esc(e.message)}</p>`); }
  const cards = stCache.gd; if (!cards.length) return stPage('<p class="st-empty">Belum ada kartu panduan.</p>');
  const tm = new Date(Date.now() + 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  gu = { card: (cards.find(g => g.id === cardId) || cards[0]).id, items: [], mode: 'now', sd: tm, st: '08:00', stag: false, per: 1, busy: false };
  stPage(`<div class="st-ph"><div><p><a href="#guides">Panduan Partner</a> › Tambah</p><h1>Tambah PDF panduan</h1></div><div class="st-acts"><button class="st-btn pri" id="gu-save" onclick="stGuSave()" disabled>💾 Simpan</button></div></div>
    <div class="st-ed"><div class="st-card st-pad">
      <label class="st-fl" style="margin-top:0">Kartu panduan<select class="st-in" onchange="gu.card=this.value;stGuList()">${cards.map(g => `<option value="${esc(g.id)}"${g.id === gu.card ? ' selected' : ''}>${g.icon || ''} ${esc(g.title)}</option>`).join('')}</select></label>
      <label class="st-drop"><input type="file" accept="application/pdf,.pdf" multiple hidden onchange="stGuFiles(this)"><b>📄 Pilih PDF</b><small>Bisa beberapa sekaligus · judul = nama file di portal · judul sama dengan PDF yang ada = menggantikan</small></label>
      <div id="gu-list"></div></div>
    <div class="st-col"><div class="st-card st-pad">
      <div class="st-fl" style="margin-top:0">Tayang<div class="st-seg" id="gu-mode"><button onclick="gu.mode='now';stGuSched()">Sekarang</button><button onclick="gu.mode='sched';stGuSched()">⏰ Jadwalkan</button></div></div>
      <div id="gu-sched"></div><p class="st-note" id="gu-note"></p></div>
      <div class="st-card st-pad"><p class="st-note" style="margin:0">🔒 PDF hanya bisa dibuka partner yang masuk dengan Kode Akses. Notifikasi 📘 ke HP partner <b>tanpa judul</b>. Jangan unggah panduan partner di tempat publik (katalog, Academy, repo).</p></div></div></div>`);
  stGuSched(); stGuList();
}
const guAt = i => new Date(Date.parse(`${gu.sd}T${gu.st || '08:00'}:00+07:00`) + (gu.stag ? Math.floor(i / Math.max(1, +gu.per || 1)) : 0) * 864e5).toISOString();
function stGuSched() {
  document.querySelectorAll('#gu-mode button').forEach((b, i) => b.classList.toggle('on', ['now', 'sched'][i] === gu.mode));
  document.getElementById('gu-sched').innerHTML = gu.mode === 'sched' ? `<div class="st-g2b"><label class="st-fl">Tanggal<input class="st-in" type="date" value="${gu.sd}" min="${todayWIB()}" onchange="gu.sd=this.value;stGuSched();stGuList()"></label><label class="st-fl">Jam (WIB)<input class="st-in" type="time" step="300" value="${gu.st}" onchange="gu.st=this.value;stGuSched();stGuList()"></label></div>
    <label class="st-ck"><input type="checkbox"${gu.stag ? ' checked' : ''} onchange="gu.stag=this.checked;stGuSched();stGuList()"> Rilis bertahap: <input class="st-in st-num" type="number" min="1" max="50" value="${gu.per}" onchange="gu.per=Math.max(1,Math.min(50,parseInt(this.value)||1));stGuSched();stGuList()"> PDF per hari</label>` : '';
  const n = gu.items.length, past = gu.mode === 'sched' && !(Date.parse(guAt(0)) > Date.now());
  document.getElementById('gu-note').innerHTML = gu.mode === 'now' ? 'PDF langsung tampil untuk partner + notifikasi 📘 ke HP partner.' : past ? '⚠ Jam tayang sudah lewat — pilih waktu yang akan datang.'
    : `⏰ ${n > 1 && gu.stag ? `Mulai ${esc(cwWhenS(guAt(0)))} sampai ${esc(cwWhenS(guAt(n - 1)))}` : `Tayang ${esc(cwWhenS(guAt(0)))}`}. Sampai jamnya PDF terkunci — hanya Editor yang bisa membuka.`;
  const b = document.getElementById('gu-save'); if (b && !gu.busy) { b.disabled = !n || past; b.textContent = gu.mode === 'sched' ? `⏰ Simpan jadwal (${n})` : `🚀 Unggah & tayangkan (${n})`; }
}
function stGuList() {
  const el = document.getElementById('gu-list'); if (!el) return;
  const g = stCache.gd.find(x => x.id === gu.card), have = new Set((g?.files || []).map(f => f.key));
  el.innerHTML = gu.items.length ? gu.items.map((x, i) => { const rep = have.has(`${g.folder}/${gdSafe(x.title.trim())}`);
    return `<div class="st-afit"><span class="st-gdic">📄</span><div class="tx"><small>${esc(x.file.name)} · ${gdSize(x.file.size)}${gu.mode === 'sched' ? ` · ⏰ ${esc(cwWhenS(guAt(i)))}` : ''}${rep ? ' · <b style="color:var(--warn)">menggantikan PDF lama</b>' : ''}</small>
    <input class="st-in" value="${esc(x.title)}" placeholder="Judul panduan" oninput="gu.items[${i}].title=this.value"></div><button class="st-btn sm" onclick="gu.items.splice(${i},1);stGuList();stGuSched()">🗑</button></div>`; }).join('') : '<p class="st-empty">Belum ada PDF dipilih.</p>';
}
function stGuFiles(input) {
  const files = [...(input.files || [])]; input.value = '';
  files.forEach(f => { if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return showToast('Hanya PDF: ' + f.name, 5000); gu.items.push({ file: f, title: gdTitle(f.name) }); });
  stGuList(); stGuSched();
}
async function stGuSave() {
  if (!gu || gu.busy || !gu.items.length) return;
  if (gu.items.some(x => !x.title.trim())) return showToast('⚠ Isi judul untuk setiap PDF.');
  const sched = gu.mode === 'sched'; if (sched && !(Date.parse(guAt(0)) > Date.now())) return showToast('⚠ Jam tayang sudah lewat — ubah tanggal/jam.');
  const g = stCache.gd.find(x => x.id === gu.card); if (!g) return;
  gu.busy = true; const btn = document.getElementById('gu-save'); btn.disabled = true;
  const store = supabase.storage.from(GD_BUCKET), live = [], failed = []; let ok = 0;
  for (const [i, x] of gu.items.entries()) {
    const dest = `${g.folder}/${gdSafe(x.title.trim())}`, path = sched ? `pending/${dest}` : dest;
    btn.textContent = `⏳ Mengunggah ${i + 1}/${gu.items.length}…`;
    try {
      const { error } = await store.upload(path, x.file, { upsert: true, contentType: 'application/pdf', cacheControl: '60' }); if (error) throw error;
      if (sched) {
        await supabase.from('guide_schedule').delete().eq('src', path).is('done_at', null);
        const { error: e2 } = await supabase.from('guide_schedule').insert({ folder: g.folder, src: path, dest, title: x.title.trim(), publish_at: guAt(i) });
        if (e2) { store.remove([path]); throw e2; }
      } else { stCache.gdThumbs?.delete(dest); live.push(dest); }
      ok++;
    } catch (e) { failed.push(x.title + ': ' + (e.message || e)); }
  }
  if (live.length) supabase.functions.invoke('cway-push', { body: { action: 'notify', type: 'guide', id: live } }).catch(() => {});
  if (failed.length) { gu.busy = false; gu.items = gu.items.filter(x => failed.some(f => f.startsWith(x.title + ':'))); stGuList(); stGuSched(); return showToast(`${ok ? `✓ ${ok} PDF tersimpan. ` : ''}Gagal: ${failed.join(' | ')}`, 12000); }
  showToast(sched ? `⏰ ${ok} PDF dijadwalkan — mulai ${cwWhenS(guAt(0))}` : `🚀 ${ok} PDF tayang di "${g.title}"`, 6000);
  gu = null; stCache.sched = null; location.hash = '#guides';
}

// ── Menu portal yang disematkan di Studio (tahap 2b, 18 Nov 2026 — cara A): /?studio=<menu>&embed=1 dalam iframe ──
// Portal dalam mode sematan menyembunyikan header, sidebar & menu bawahnya (html.embed di index.html/style.css). Sesi login sama.
const STUDIO_EMBED = { paket: 'Paket Audio', stock: 'Stok', partner: 'Enthusiast Partner',
  dealers: 'Akun & Kode Akses', visitors: 'Pengunjung & Minat', rapor: 'Rapor Bulanan', prapor: 'Laporan Partner', cway: 'Concerto Way (portal)' };
function stEmbed(k) {
  document.getElementById('st-page').innerHTML = `<div class="st-emb"><div class="st-embh"><b>${esc(STUDIO_EMBED[k])}</b><span class="st-pill mu">tampilan portal</span>
    <button class="st-btn sm" onclick="document.getElementById('st-ifr').contentWindow.location.reload()">↻ Muat ulang</button>
    <a class="st-btn sm" href="/?studio=${k}" target="_blank" rel="noopener">Buka di tab baru</a></div>
    <iframe id="st-ifr" class="st-ifr" src="/?studio=${k}&embed=1" title="${esc(STUDIO_EMBED[k])}"></iframe></div>`;
  document.getElementById('st-page').classList.add('emb');
}

// ── Pencarian cepat (produk & berita) ──
function stSearch(v) {
  const q = v.trim(); if (!q) return;
  if (location.hash.startsWith('#news')) { const i = document.getElementById('st-nq'); if (i) { i.value = q; stNewsRows(); } return; }
  stPQ = q; if (!location.hash.startsWith('#produk')) location.hash = '#produk'; else stProdukPaint();
}

stInit();
