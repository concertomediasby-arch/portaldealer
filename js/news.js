/* CAI Hub (Concerto Audio Indonesia) — js/news.js
   NEWS (3 Nov 2026, permintaan pemilik): berita PUBLIK (tanpa login) di headline paling atas Dashboard, satu kotak dengan
   Concerto Way (khusus login). Dealer yang login melihat dua tab 📰 News | ☕ Concerto Way yang berganti otomatis tiap
   NEWS_ROTATE_MS; pengunjung umum hanya melihat News. Ditulis HANYA oleh Editor. Data di tabel Supabase `cai_news`
   (RLS baca = publik untuk yang terbit, tulis = editor), gambar di Storage publik `showcase/news/`.
   JANGAN pernah memuat harga dealer/diskon/info internal di News — isinya bisa dibaca siapa saja.
   Dimuat setelah cway.js, sebelum main.js. */

const NEWS_TABLE = 'cai_news';
const NEWS_NEW_DAYS = 5;
const NEWS_ROTATE_MS = 8000;
const NEWS_HL_MAX = 3;                    // berita terbaru yang ikut bergantian di headline
// 4 Nov 2026 (permintaan pemilik): sempat dimatikan (false) lalu diaktifkan lagi di hari yang sama. false = News tidak tampil di headline Dashboard.
const NEWS_ON_DASH = true;
const NEWS_SEEN_KEY = 'cai-news-seen';
const NEWS_CATS = ['Product', 'Event', 'Promo', 'Info'];
const NEWS_SQL = `-- News (CAI Hub) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.cai_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text,
  category text,
  image text,
  link_url text,
  link_label text,
  post_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
alter table public.cai_news enable row level security;
drop policy if exists "news read" on public.cai_news;
create policy "news read" on public.cai_news for select to anon, authenticated
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
drop policy if exists "news write" on public.cai_news;
create policy "news write" on public.cai_news for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'editor');
grant select on public.cai_news to anon;
grant select, insert, update, delete on public.cai_news to authenticated;
-- Project & partner pemasang (5 Nov 2026)
alter table public.cai_news add column if not exists projects jsonb not null default '[]'::jsonb;
-- Foto tambahan (6 Nov 2026)
alter table public.cai_news add column if not exists photos jsonb not null default '[]'::jsonb;`;
// Project & partner pemasang di berita kontes (5 Nov 2026, permintaan pemilik): kolom jsonb [{car, owner, result, partner, gl}]
const NEWS_PROJ_SQL = `-- CAI Hub News: project & partner pemasang — jalankan sekali di Supabase → SQL Editor → Run
alter table public.cai_news add column if not exists projects jsonb not null default '[]'::jsonb;`;

// Foto tambahan berita (6 Nov 2026, permintaan pemilik): kolom jsonb [{path, cap}] — disisipkan di isi lewat [foto 1] / [foto 2 3]
const NEWS_PH_SQL = `-- CAI Hub News: foto tambahan — jalankan sekali di Supabase → SQL Editor → Run
alter table public.cai_news add column if not exists photos jsonb not null default '[]'::jsonb;`;
const NEWS_PH_MAX = 12;
const NW_PH_RE = /\[\s*foto\s+([\d\s,]+)\]/gi;
let nwItems = null, nwMissing = false, nwErr = '', nwLoading = null, nwCur = null, nwPending = null, nwForm = null, nwQ = '', nwCat = '';
const nwImgCache = {};
// Posisi/zoom gambar sampul disimpan di kolom `image` yang sama: "news/123.webp#x,y,z" (x/y = titik fokus %, z = zoom 1–2,5)
// — tanpa kolom/SQL baru (3 Nov 2026, permintaan pemilik: atur posisi gambar).
const nwImgPath = v => String(v || '').split('#')[0];
function nwImgFr(v) {
  const m = String(v || '').split('#')[1]; const [x, y, z] = m ? m.split(',').map(s => s === '' ? NaN : Number(s)) : [];
  return { x: isFinite(x) ? x : 50, y: isFinite(y) ? y : 50, z: isFinite(z) && z >= 1 ? z : 1 };
}
const nwFrStyle = f => (f.x === 50 && f.y === 50 && f.z === 1) ? '' : ` style="object-position:${f.x}% ${f.y}%;transform-origin:${f.x}% ${f.y}%;scale:${f.z}"`;
const nwImgStyle = v => nwFrStyle(nwImgFr(v));
const nwImgUrl = p => { p = nwImgPath(p); return !p ? '' : /^https?:/i.test(p) ? p : dashPublicUrl(p); };
// Video YouTube di News (4 Nov 2026, permintaan pemilik): link YouTube di "Tombol link" otomatis jadi pemutar video di halaman baca
// (klik → iframe youtube-nocookie, dimuat hanya saat diputar) dan thumbnail-nya dipakai bila berita tanpa gambar sampul (+ ikon ▶).
function nwYt(u) {
  let x; try { x = new URL(String(u || '').trim()); } catch (e) { return ''; }
  const h = x.hostname.replace(/^(www|m|music)\./, '');
  let id = '';
  if (h === 'youtu.be') id = x.pathname.slice(1).split('/')[0];
  else if (/^youtube(-nocookie)?\.com$/.test(h)) id = x.searchParams.get('v') || (x.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/?#]+)/) || [])[1] || '';
  return /^[\w-]{11}$/.test(id) ? id : '';
}
const nwYtThumb = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const nwThumb = it => nwImgUrl(it.image) || (nwYt(it.link_url) ? nwYtThumb(nwYt(it.link_url)) : '');
const nwPlayIc = it => nwYt(it.link_url) ? '<span class="nw-play" aria-label="Video"></span>' : '';
/* ── 🔧 Project & partner pemasang (berita kontes) ── */
const nwProj = it => (Array.isArray(it?.projects) ? it.projects : []).filter(p => p && (p.car || p.partner));
const nwPhotos = it => (Array.isArray(it?.photos) ? it.photos : []).filter(p => p && p.path);
const nwPhUrl = p => /^(https?:|blob:)/i.test(p || '') ? p : p ? dashPublicUrl(p) : '';
const nwPhNums = t => String(t || '').split(/[\s,]+/).map(Number).filter(n => n > 0);
const nwPhCount = it => nwPhotos(it).length ? `<span class="nw-phn">📷 ${nwPhotos(it).length + (it.image ? 1 : 0)} foto</span>` : '';
// Isi berita: paragraf + foto di posisi tanda [foto n] (paragraf yang hanya berisi tanda = foto; tanda di tengah teks → foto setelah paragraf itu).
// Foto yang tidak disisipkan tampil sebagai "Foto lainnya" di bawah isi.
function nwBodyHtml(it) {
  const ph = nwPhotos(it), used = new Set(), base = it.image && !nwYt(it.link_url) ? 1 : 0;
  const fig = nums => { const ok = [...new Set(nums)].filter(n => n <= ph.length); if (!ok.length) return ''; ok.forEach(n => used.add(n));
    const caps = ok.map(n => ph[n - 1].cap).filter(Boolean).join(' · ');
    return `<figure class="nw-fig n${Math.min(ok.length, 3)}"><div class="nw-fgrid">${ok.map(n => `<button type="button" onclick="nwLbOpen('${it.id}',${base + n - 1})" aria-label="Lihat foto ${n}"><img src="${escHtml(nwPhUrl(ph[n - 1].path))}" alt="${escHtml(ph[n - 1].cap || '')}" loading="lazy"></button>`).join('')}</div>${caps ? `<figcaption>${escHtml(caps)}</figcaption>` : ''}</figure>`; };
  const paras = String(it.body || '').replace(/\r/g, '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const out = paras.map(p => {
    const only = p.replace(NW_PH_RE, '').trim() === '';
    const nums = []; p.replace(NW_PH_RE, (m, g) => { nums.push(...nwPhNums(g)); return ''; });
    if (only) return [...p.matchAll(NW_PH_RE)].map(m => fig(nwPhNums(m[1]))).join('');
    const txt = p.replace(NW_PH_RE, '').replace(/[ \t]+\n/g, '\n').trim();
    return `<p>${txt.split('\n').map(cwWa).join('<br>')}</p>${nums.length ? fig(nums) : ''}`;
  }).join('');
  const rest = ph.map((x, i) => i + 1).filter(n => !used.has(n));
  return out + (rest.length ? `<div class="nw-more"><div class="nw-more-h">📷 Foto lainnya <span>${rest.length} foto · ketuk untuk lihat penuh</span></div>
    <div class="nw-more-s">${rest.map(n => `<button type="button" onclick="nwLbOpen('${it.id}',${base + n - 1})" aria-label="Lihat foto ${n}"><img src="${escHtml(nwPhUrl(ph[n - 1].path))}" alt="${escHtml(ph[n - 1].cap || '')}" loading="lazy"></button>`).join('')}</div></div>` : '');
}
/* Lihat foto layar penuh: sampul (bila bukan video YouTube) + semua foto tambahan, ‹ › / geser / Esc / back HP */
let nwLb = null;
function nwLbOpen(id, i) {
  const it = nwItems?.find(x => x.id === id); if (!it) return;
  const list = [...(it.image && !nwYt(it.link_url) ? [{ src: nwImgUrl(it.image), cap: '' }] : []), ...nwPhotos(it).map(p => ({ src: nwPhUrl(p.path), cap: p.cap || '' }))];
  if (!list.length) return;
  nwLb = { list, i: Math.max(0, Math.min(list.length - 1, i || 0)) };
  let ov = document.getElementById('nw-lb');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'nw-lb'; ov.className = 'nw-lb';
    ov.onclick = e => { if (e.target === ov || e.target.classList.contains('nw-lb-stage')) nwLbClose(); };
    let x0 = null;
    ov.addEventListener('pointerdown', e => { x0 = e.clientX; });
    ov.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 50) nwLbStep(dx < 0 ? 1 : -1); });
    document.body.appendChild(ov);
  }
  nwLbPaint(); ov.classList.add('open'); document.body.classList.add('modal-open');
  if (!history.state?.nwlb) history.pushState({ nwlb: 1 }, '');
}
function nwLbPaint() {
  const ov = document.getElementById('nw-lb'); if (!ov || !nwLb) return;
  const { list, i } = nwLb, c = list[i], n = list.length;
  ov.innerHTML = `<div class="nw-lb-top"><span>${i + 1} / ${n}</span><button onclick="nwLbClose()" aria-label="Tutup">✕</button></div>
    <div class="nw-lb-stage"><img src="${escHtml(c.src)}" alt="${escHtml(c.cap)}" draggable="false"></div>
    ${n > 1 ? `<button class="nw-lb-ar l" onclick="nwLbStep(-1)" aria-label="Sebelumnya">‹</button><button class="nw-lb-ar r" onclick="nwLbStep(1)" aria-label="Berikutnya">›</button>` : ''}
    ${c.cap ? `<div class="nw-lb-cap">${escHtml(c.cap)}</div>` : ''}
    ${n > 1 ? `<div class="nw-lb-dots">${list.map((x, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}`;
}
function nwLbStep(d) { if (!nwLb) return; const n = nwLb.list.length; nwLb.i = (nwLb.i + d + n) % n; nwLbPaint(); }
function nwLbClose(fromPop) {
  const ov = document.getElementById('nw-lb'); if (!ov || !ov.classList.contains('open')) return;
  ov.classList.remove('open'); document.body.classList.remove('modal-open'); nwLb = null;
  if (!fromPop && history.state?.nwlb) history.back();
}
window.addEventListener('popstate', () => nwLbClose(true));
document.addEventListener('keydown', e => { if (!nwLb) return; if (e.key === 'Escape') nwLbClose(); else if (e.key === 'ArrowRight') nwLbStep(1); else if (e.key === 'ArrowLeft') nwLbStep(-1); });
const nwPd = name => { const n = normKey(name || ''); return n ? adPublic().find(d => normKey(d.n) === n) : null; };
const nwIni = n => String(n || '?').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
function nwMedal(r) { const m = String(r || '').match(/juara\s*(\d)/i); return m ? ({ 1: ['🥇', ''], 2: ['🥈', ' s'], 3: ['🥉', ' b'] }[m[1]] || ['🏅', '']) : ['🏅', '']; }
function nwProjStat(it) { const pj = nwProj(it); if (!pj.length) return ''; const n = new Set(pj.map(p => normKey(p.partner || '')).filter(Boolean)).size;
  return `🏪 ${pj.length} project${n ? ` · ${n} partner resmi CAI` : ''}`; }
// 🔊 Perangkat terpasang per mobil project (7 Nov 2026): p.products = id katalog, p.other = teks perangkat di luar katalog
const nwPjProds = p => [...new Set(Array.isArray(p?.products) ? p.products : [])].filter(id => findProductAny(id).product);
const nwPjOther = p => String(p?.other || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const nwPrLabel = (b, p) => `${b.name} ${p.model || p.name}`;
function nwPrImg(p) { return (Array.isArray(p.photos) && p.photos[0]) || p.photo || ''; }
function nwPrItem(pid) {
  const { brand: b, product: p } = findProductAny(pid); if (!p) return '';
  const im = nwPrImg(p);
  return `<button class="nw-pr" onclick="showProduct('${b.id}','${p.id}')"><span class="nw-pr-im">${im ? `<img src="${escHtml(im)}" alt="" loading="lazy">` : (p.emoji || '🔊')}</span>
    <span class="nw-pr-t"><small>${escHtml(b.name)} · ${escHtml(p.category || '')}</small><b>${escHtml(p.name)}</b><em>${hasPrice(p) ? 'SRP ' + escHtml(srpText(p)) : 'Harga: hubungi partner resmi'}</em></span><span class="nw-pr-go">›</span></button>`;
}
function nwPjGearHtml(p) {
  const ids = nwPjProds(p), oth = nwPjOther(p); if (!ids.length && !oth.length) return '';
  return `<div class="nw-pg"><div class="nw-pg-h"><b>🔊 Perangkat terpasang</b>${ids.length ? `<span>${ids.length} produk CAI</span>` : ''}</div>
    ${ids.length ? `<div class="nw-pg-g">${ids.map(nwPrItem).join('')}</div>` : ''}
    ${oth.length ? `<div class="nw-pg-o">Perangkat lain: ${oth.map(x => `<span>${escHtml(x)}</span>`).join('')}</div>` : ''}
    ${ids.length ? `<button class="nw-pg-rk" onclick='coRakit(${JSON.stringify(ids)})'>🔧 Rakit sistem seperti mobil ini</button>` : ''}</div>`;
}
function nwProdSide(it) {
  const m = new Map(); nwProj(it).forEach(p => nwPjProds(p).forEach(id => m.set(id, (m.get(id) || 0) + 1)));
  if (!m.size) return '';
  return `<div class="nw-sbox nw-pps" id="nw-pps"><div class="nw-sh">🔊 Produk di berita ini</div>${[...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, n]) => {
    const { brand: b, product: p } = findProductAny(id); const im = nwPrImg(p);
    return `<button class="nw-pl" onclick="showProduct('${b.id}','${p.id}')"><span class="nw-ini nw-pp-im">${im ? `<img src="${escHtml(im)}" alt="" loading="lazy">` : '🔊'}</span><span class="nw-pl-t"><b>${escHtml(p.name)}</b><small>${escHtml(b.name)}</small></span><em>${n} mobil</em></button>`; }).join('')}</div>`;
}
function nwProjHtml(it) {
  const pj = nwProj(it); if (!pj.length) return '';
  return `<div class="nw-pj" id="nw-pj"><div class="nw-pj-h"><b>🔧 Project &amp; partner pemasang</b><span>${escHtml(nwProjStat(it).replace('🏪 ', ''))}</span></div>
    <div class="nw-pj-g">${pj.map(p => { const d = nwPd(p.partner), md = nwMedal(p.result);
      const wa = d?.wa ? `https://wa.me/${d.wa}?text=${waText(`Halo ${d.n}, saya lihat project ${p.car || 'mobil'} di berita CAI Hub "${it.title}". Saya ingin bertanya tentang pemasangan audio.`)}` : '';
      return `<div class="nw-pc">${p.result ? `<span class="nw-res${md[1]}">${md[0]} ${escHtml(p.result)}</span>` : ''}
        ${p.car ? `<div class="nw-pc-car">${escHtml(p.car)}</div>` : ''}${p.owner ? `<div class="nw-pc-who">Peserta: ${escHtml(p.owner)}</div>` : ''}
        ${p.partner ? `<div class="nw-pc-pt"><span class="nw-ini">${escHtml(nwIni(d?.n || p.partner))}</span><span class="nw-pc-nm">${escHtml(d?.n || p.partner)}${d?.c ? ` <small>· ${escHtml(d.c)}</small>` : ''}</span>
          ${d ? `<div class="ad-btns nw-pc-btns">${wa ? `<a class="ad-btn wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a>${typeof pfBtn === 'function' ? pfBtn(d) : ''}</div>` : ''}</div>` : ''}
        ${nwPjGearHtml(p)}
        ${p.gl ? `<button class="nw-pc-gl" onclick="nwOpenGl('${escHtml(p.gl)}')">📷 Lihat di Galeri ›</button>` : ''}</div>`; }).join('')}</div></div>`;
}
function nwProjSide(it) {
  const pj = nwProj(it); if (!pj.length) return '';
  const m = new Map(); pj.forEach(p => { if (!p.partner) return; const k = normKey(p.partner); m.set(k, { name: p.partner, n: (m.get(k)?.n || 0) + 1 }); });
  if (!m.size) return '';
  return `<div class="nw-sbox nw-pjs" id="nw-pjs"><div class="nw-sh">🏪 Partner di berita ini</div>${[...m.values()].sort((a, b) => b.n - a.n).map(x => { const d = nwPd(x.name);
    return `<${d ? `button onclick="openPartner('${shareSlug(d.n)}')"` : 'div'} class="nw-pl"><span class="nw-ini">${escHtml(nwIni(d?.n || x.name))}</span><span class="nw-pl-t"><b>${escHtml(d?.n || x.name)}</b>${d ? `<small>${escHtml(d.c || d.r || '')} · Profil ›</small>` : ''}</span><em>${x.n} project</em></${d ? 'button' : 'div'}>`; }).join('')}</div>`;
}
async function nwOpenGl(id) {
  if (typeof loadGaleri === 'function' && !glItems) { try { await loadGaleri(); } catch (e) {} }
  if (glItems?.some(x => x.id === id)) openGlDetail(id); else showToast('Mobil ini belum tampil di Galeri.');
}
function nwYtPlay(el, id) {
  el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1" title="Video YouTube" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  el.classList.add('on'); el.onclick = null;
}
const nwSorted = () => (nwItems || []).slice().sort((a, b) => String(b.post_date).localeCompare(String(a.post_date)) || String(b.created_at).localeCompare(String(a.created_at)));
const nwLive = () => nwSorted().filter(x => x.published);
const nwShown = () => isEditor() ? nwSorted() : nwLive();
const nwLink = id => liveLink('n', id) || `${PORTAL_URL}/news/?news=${encodeURIComponent(id)}`;   // /n/<id>/ = kartu WA berita itu (bila sudah dibuat jadwal GitHub)   // /news/ = kartu pratinjau WA News, lalu diteruskan ke /?news=
const nwIsNew = it => it?.published && cwDaysAgo(it.post_date) < NEWS_NEW_DAYS && !cwLS(NEWS_SEEN_KEY)[it.id];
const nwDate = d => cwDate(d);

async function loadNews(force) {
  if (!supabase) {   // pustaka Supabase gagal dimuat → salinan cadangan (Tahap 3)
    const bk = await backupJson('data/news.json'); if (bk) { nwItems = bk; hlRender(); nwStar(); if (nwPending) { const id = nwPending; nwPending = null; openNews(id); } }
    return;
  }
  if (nwLoading && !force) return nwLoading;
  nwLoading = (async () => {
    try {
      await mediaP;
      const { data, error } = await supabase.from(NEWS_TABLE).select('*');
      if (error) throw error;
      nwItems = data || []; nwMissing = false; nwErr = '';
    } catch (e) {
      const m = e?.message || String(e);
      nwMissing = /does not exist|schema cache|42P01|PGRST205/i.test(m + ' ' + (e?.code || ''));
      nwErr = m; nwItems = [];
      if (!nwMissing) { const bk = await backupJson('data/news.json'); if (bk) { nwItems = bk; nwErr = ''; } }
    }
    nwLoading = null;
    hlRender(); nwStar();
    if (document.getElementById('view-news')?.classList.contains('active')) renderNews();
    if (nwPending) { const id = nwPending; nwPending = null; openNews(id); }
  })();
  return nwLoading;
}
function newsAuthChanged() { if (supabase) loadNews(true); }   // draf terlihat/tersembunyi saat Editor login/logout
function nwStar() {
  const on = nwLive().some(nwIsNew);
  ['nav-news-star', 'mnav-news-star'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = !on; });
}

/* ── Headline gabungan (News publik + Concerto Way khusus login) ── */
let hlIdx = 0, hlTimer = null, hlPause = 0;
function hlSlides() {
  const s = [];
  if (typeof cwHlHtml === 'function' && authUser && cwLive().length) s.push({ t: 'cw' });
  if (typeof evHlList === 'function') evHlList().forEach(e => s.push({ t: 'ev', e }));   // 📅 Acara terdekat (js/events.js)
  if (NEWS_ON_DASH) nwLive().slice(0, NEWS_HL_MAX).forEach(n => s.push({ t: 'news', n }));
  return s;
}
function nwHlHtml(n) {
  const img = nwThumb(n);
  return `<div class="nw-hl" role="button" tabindex="0" onclick="openNews('${n.id}')" onkeydown="if(event.key==='Enter')openNews('${n.id}')">
    <div class="nw-img${img ? '' : ' ph'}">${img ? `<img src="${escHtml(img)}" alt="" decoding="async" draggable="false"${nwImgStyle(n.image)}>` : '<span>📰</span>'}${nwPlayIc(n)}${nwPhCount(n)}</div>
    <div class="nw-main"><div class="nw-top">📰 News${nwIsNew(n) ? ' <span class="nw-new">BARU</span>' : ''}${n.category ? ` <span class="nw-cat">${escHtml(n.category)}</span>` : ''}</div>
      <div class="nw-t">${escHtml(n.title)}</div>${n.summary ? `<div class="nw-s">${escHtml(n.summary)}</div>` : ''}
      <div class="nw-foot"><span class="nw-date">${escHtml(nwDate(n.post_date))}${nwProjStat(n) ? ` · <b class="nw-hlpj">${escHtml(nwProjStat(n))}</b>` : ''}</span>
        <span class="nw-btn">Baca selengkapnya ›</span></div></div></div>`;
}
/* Carousel: semua slide berjajar di satu "track" (+ salinan slide terakhir di depan & slide pertama di belakang
   agar geser berputar mulus). Geser = memindah track (GPU), tanpa merender ulang. Titik di bawah kotak, tetap. */
let hlPos = 1, hlN = 0, hlBusy = false, hlFixT = null;
const hlReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HL_EASE = 'transform .5s cubic-bezier(.22,.61,.36,1)';
function hlRender() {
  const el = document.getElementById('cway-hl'); if (!el) return;
  const slides = hlSlides();
  if (!slides.length) { el.hidden = true; el.innerHTML = ''; hlN = 0; return; }
  if (hlIdx >= slides.length) hlIdx = 0;
  hlN = slides.length;
  const hasCw = slides.some(x => x.t === 'cw'), news = slides.filter(x => x.t === 'news'), evs = slides.filter(x => x.t === 'ev');
  const tabs = [news.length && `<button class="hl-tab" data-hlt="news" onclick="hlGo('news')">${news.some(x => nwIsNew(x.n)) ? '<i class="dot"></i>' : ''}📰 News</button>`,
    evs.length && `<button class="hl-tab" data-hlt="ev" onclick="hlGo('ev')">📅 Acara</button>`,
    hasCw && `<button class="hl-tab" data-hlt="cw" onclick="hlGo('cw')">☕ Concerto Way <span class="lk">· khusus partner</span>${typeof cwIsNew === 'function' && cwLive().some(cwIsNew) ? '<i class="hl-star" title="Ada materi baru">★</i>' : ''}</button>`].filter(Boolean);
  const tabsHtml = tabs.length > 1 ? `<div class="hl-tabs" role="tablist">${tabs.join('')}</div>` : '';
  const html = slides.map(x => x.t === 'cw' ? cwHlHtml() : x.t === 'ev' ? evHlHtml(x.e) : nwHlHtml(x.n));
  const items = hlN > 1 ? [html[hlN - 1], ...html, html[0]] : html;
  const dots = hlN > 1 ? `<div class="hl-dots">${slides.map((x, i) => `<button class="hl-dot${x.t === 'news' ? '' : ' ' + x.t}" aria-label="Slide ${i + 1}" onclick="hlGoIdx(${i})"></button>`).join('')}</div>` : '';
  el.hidden = false;
  el.innerHTML = `${tabsHtml}<div class="hl-view"><div class="hl-track">${items.map((h, i) => {
    const clone = hlN > 1 && (i === 0 || i === items.length - 1);
    return `<div class="hl-slide"${clone ? ' aria-hidden="true" inert' : ''}>${h}</div>`; }).join('')}</div></div>${dots}`;
  hlBusy = false; hlTarget = -1; clearTimeout(hlFixT);
  hlPos = hlN > 1 ? hlIdx + 1 : 0;
  hlSet(0, false); hlMark();
  slides.forEach(x => { const u = x.t === 'news' ? nwThumb(x.n) : x.t === 'ev' && typeof evPoster === 'function' && evPoster(x.e); if (u && !hlPre[u]) { hlPre[u] = new Image(); hlPre[u].src = u; } });
  hlArm(slides.length);
}
const hlPre = {};
function hlTrack() { return document.querySelector('#cway-hl .hl-track'); }
// Posisi track sebagai bilangan pecahan (pf = indeks slide yang tampil, termasuk salinan).
// Parallax (opsi A, pilihan pemilik): foto bergerak berlawanan 55% (lebih lambat dari kotak), teks ikut bergeser
// 18% & memudar; slide tujuan: teks disembunyikan selama meluncur lalu muncul berurutan dari bawah (.hl-arrive).
let hlTarget = -1;
const HL_FX = 'transform .5s cubic-bezier(.22,.61,.36,1), opacity .35s ease';
function hlParts() {
  return [...document.querySelectorAll('#cway-hl .hl-track > .hl-slide')].map(sl => sl._p || (sl._p = {
    sl, img: sl.querySelector('.nw-img .ev-fw, .nw-img img, .nw-img > span, .cw-hl-day'),
    txt: [...sl.querySelectorAll('.nw-main > *, .cw-hl-main > *, .cw-hl-side')] }));
}
function hlSetF(pf, anim) {
  const t = hlTrack(); if (!t) return;
  const on = anim && !hlReduced();
  t.style.transition = on ? HL_EASE : 'none';
  t.style.transform = `translate3d(${-pf * 100}%,0,0)`;
  if (hlReduced()) return;
  hlParts().forEach((p, j) => {
    const o = j - pf, a = Math.abs(o);
    if (p.img) { p.img.style.transition = on ? HL_EASE : 'none'; p.img.style.transform = `translate3d(${(-o * 55).toFixed(3)}%,0,0)`; }
    const hide = j === hlTarget && on;
    p.txt.forEach(x => {
      x.style.transition = on ? HL_FX : 'none';
      x.style.transform = `translate3d(${(o * 18).toFixed(3)}%,0,0)`;
      x.style.opacity = hide ? '0' : String(Math.max(0, 1 - a * 1.6));
    });
  });
}
function hlSet(dx, anim) { const w = document.querySelector('#cway-hl .hl-view')?.offsetWidth || 1; hlSetF(hlPos - (dx || 0) / w, anim); }
function hlMark() {   // tab & titik aktif mengikuti slide yang tampil
  const s = hlSlides(), cur = s[hlIdx]; if (!cur) return;
  document.querySelectorAll('#cway-hl .hl-tab').forEach(b => b.classList.toggle('on', b.dataset.hlt === cur.t));
  document.querySelectorAll('#cway-hl .hl-dot').forEach((d, i) => d.classList.toggle('on', i === hlIdx));
}
function hlArrive(j) {   // teks slide yang baru tiba muncul berurutan dari bawah
  const p = hlParts()[j]; if (!p || hlReduced()) return;
  p.txt.forEach((x, k) => {
    x.style.transition = 'none'; x.style.transform = 'translate3d(0,14px,0)'; x.style.opacity = '0'; x.offsetWidth;
    x.style.transition = `transform .42s cubic-bezier(.22,.61,.36,1) ${k * 70}ms, opacity .42s ease ${k * 70}ms`;
    x.style.transform = 'translate3d(0,0,0)'; x.style.opacity = '1';
  });
}
function hlMoveTo(pos, dx) {   // dx = geseran jari terhadap posisi lama; pindah ke posisi track (boleh salinan), lalu lompat diam-diam ke slide asli
  if (hlN < 2) return;
  const w = document.querySelector('#cway-hl .hl-view')?.offsetWidth || 1, from = hlPos - (dx || 0) / w;
  hlPos = pos; hlIdx = ((pos - 1) % hlN + hlN) % hlN; hlMark();
  hlTarget = pos;
  hlSetF(from, false); hlTrack()?.offsetWidth;
  hlSetF(pos, true); hlBusy = true; clearTimeout(hlFixT);
  hlFixT = setTimeout(() => {
    hlBusy = false; hlTarget = -1;
    if (hlPos === 0 || hlPos === hlN + 1) { hlPos = hlIdx + 1; hlSetF(hlPos, false); }
    hlArrive(hlPos);
  }, hlReduced() ? 0 : 500);
}
function hlStep(d, fromDx) { if (hlN < 2) return; if (hlBusy) { hlTarget = -1; hlPos = hlIdx + 1; hlSet(0, false); } hlMoveTo(hlPos + d, fromDx); }
function hlGoIdx(i) { hlPause = Date.now() + 15000; if (i !== hlIdx) hlMoveTo(i + 1); }
function hlGo(k) {
  const s = hlSlides(); let i = -1;
  if (k === 'cw' || k === 'ev') i = s.findIndex(x => x.t === k);
  else if (k === 'news') i = s.findIndex(x => x.t === 'news');
  else if (/^n\d+$/.test(k)) { const ns = s.map((x, j) => x.t === 'news' ? j : -1).filter(j => j >= 0); i = ns[+k.slice(1)] ?? -1; }
  if (i < 0) return;
  hlGoIdx(i);
}
/* Geser (swipe HP / seret mouse): track mengikuti jari 1:1; dilepas > 80 px (atau 15% lebar) atau dikibas cepat → pindah */
function hlSwipeBind(el) {
  let x0 = null, y0 = 0, t0 = 0, id = null, drag = false, lastX = 0, lastT = 0, vx = 0, swiped = 0, w = 1;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || hlN < 2 || !e.target.closest('.hl-view')) return;
    if (hlBusy) { hlBusy = false; hlTarget = -1; clearTimeout(hlFixT); if (hlPos === 0 || hlPos === hlN + 1) hlPos = hlIdx + 1; hlSet(0, false); }
    x0 = lastX = e.clientX; y0 = e.clientY; t0 = lastT = performance.now(); id = e.pointerId; drag = false; vx = 0;
    w = el.querySelector('.hl-view')?.offsetWidth || 1;
  });
  el.addEventListener('pointermove', e => {
    if (x0 === null || e.pointerId !== id) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!drag) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { x0 = null; return; }   // gulir vertikal → biarkan
      if (Math.abs(dx) < 8) return;
      drag = true; try { el.setPointerCapture(id); } catch (_) {}
      hlPause = Date.now() + 15000; el.classList.add('dragging');
    }
    const now = performance.now(); vx = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    hlSet(dx, false);
  });
  const end = e => {
    if (x0 === null || e.pointerId !== id) return;
    const dx = e.clientX - x0; x0 = null; id = null;
    if (!drag) return;
    drag = false; swiped = Date.now(); el.classList.remove('dragging');
    const fling = Math.abs(vx) > .3 && Math.sign(vx) === Math.sign(dx);
    if (e.type === 'pointerup' && (Math.abs(dx) > Math.min(w * .15, 80) || (fling && Math.abs(dx) > 20))) hlMoveTo(hlPos + (dx < 0 ? 1 : -1), dx);
    else { hlSet(dx, false); hlTrack()?.offsetWidth; hlSet(0, true); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // klik setelah menggeser jangan membuka berita
  el.addEventListener('click', e => { if (Date.now() - swiped < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  el.addEventListener('dragstart', e => { if (e.target.closest('.hl-view')) e.preventDefault(); });
}
function hlArm(n) {
  const el = document.getElementById('cway-hl');
  if (el && !el._hlBound) {
    el._hlBound = true;
    el.addEventListener('mouseenter', () => { hlPause = Infinity; });
    el.addEventListener('mouseleave', () => { hlPause = Date.now() + 2000; });
    el.addEventListener('touchstart', () => { hlPause = Date.now() + 15000; }, { passive: true });
    el.addEventListener('focusin', () => { hlPause = Date.now() + 15000; });
    hlSwipeBind(el);
  }
  clearInterval(hlTimer); hlTimer = null;
  if (n < 2) return;
  hlTimer = setInterval(() => {
    if (document.hidden || Date.now() < hlPause || !document.getElementById('view-dashboard')?.classList.contains('active')) return;
    hlStep(1);
  }, NEWS_ROTATE_MS);
}

/* ── View News (publik) ── */
function openNews(id) {
  nwCur = id || null;
  showView('news');
  document.getElementById('nav-news')?.classList.add('active');
  document.getElementById('mnav-news')?.classList.add('active');
  window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0);
  renderNews();
  if (!nwItems) loadNews();
}
function nwBack() { nwCur = null; renderNews(); window.scrollTo(0, 0); document.querySelector('.main')?.scrollTo?.(0, 0); }
function renderNews() {
  const body = document.getElementById('news-body'), tools = document.getElementById('news-tools'), hd = document.getElementById('news-head');
  if (!body) return;
  if (hd) hd.hidden = !!nwCur;
  if (tools) tools.innerHTML = isEditor() ? `<button class="gt-btn" onclick="openNwForm()">＋ Tambah Berita</button>${nwMissing ? ' <button class="gt-btn ghost" onclick="nwCopySql()">📋 Salin SQL</button>' : ''}` : '';
  if (!nwItems) { body.innerHTML = '<div class="stock-empty">Memuat…</div>'; return; }
  if (nwMissing) { body.innerHTML = `<div class="stock-empty">${isEditor() ? 'Tabel <b>cai_news</b> belum dibuat. Klik <b>📋 Salin SQL</b>, jalankan sekali di Supabase → SQL Editor → Run, lalu muat ulang halaman.' : 'Belum ada berita.'}</div>`; return; }
  const it = nwCur && nwShown().find(x => x.id === nwCur);
  if (nwCur && !it) { nwCur = null; showToast('Berita tidak ditemukan.'); }
  if (it) return renderNwPost(body, it);
  const list = nwShown(), cats = [...new Set(list.map(x => x.category).filter(Boolean))];
  body.innerHTML = `<div class="cw-tools"><input type="search" class="cw-search" placeholder="Cari berita…" value="${escHtml(nwQ)}" oninput="nwQ=this.value;nwListOnly()">
    ${cats.length > 1 ? `<div class="cw-chips"><button class="cw-chip${nwCat ? '' : ' on'}" onclick="nwCat='';renderNews()">Semua</button>${cats.map(c => `<button class="cw-chip${nwCat === c ? ' on' : ''}" onclick="nwCat=${escHtml(JSON.stringify(c))};renderNews()">${escHtml(c)}</button>`).join('')}</div>` : ''}</div>
    ${pnHtml('news')}<div id="nw-list">${nwListHtml()}</div>`;
}
function nwListOnly() { const el = document.getElementById('nw-list'); if (el) el.innerHTML = nwListHtml(); }
function nwListHtml() {
  const all = nwShown(); if (!all.length) return `<div class="stock-empty">${isEditor() ? 'Belum ada berita. Klik <b>＋ Tambah Berita</b>.' : 'Belum ada berita.'}</div>`;
  const q = nwQ.trim().toLowerCase();
  const list = all.filter(x => (!nwCat || x.category === nwCat) && (!q || [x.title, x.summary, x.body, x.category].join(' ').toLowerCase().includes(q)));
  if (!list.length) return '<div class="stock-empty">Tidak ada berita yang cocok.</div>';
  return `<div class="nw-grid">${list.map(x => { const img = nwThumb(x); return `<button class="nw-card${x.published ? '' : ' draft'}" onclick="openNews('${x.id}')">
    <div class="nw-cimg">${img ? `<img src="${escHtml(img)}" alt="" loading="lazy"${nwImgStyle(x.image)}>` : '<span>📰</span>'}${nwPlayIc(x)}${nwIsNew(x) ? '<span class="nw-new abs">BARU</span>' : ''}${x.published ? '' : '<span class="cw-draft">DRAF</span>'}${nwPhCount(x)}</div>
    <div class="nw-cb"><div class="nw-cm">${x.category ? `<span class="nw-cat">${escHtml(x.category)}</span>` : ''}<span>${escHtml(nwDate(x.post_date))}</span></div>
      <div class="nw-ct">${escHtml(x.title)}</div>${x.summary ? `<div class="nw-cs">${escHtml(x.summary)}</div>` : ''}${nwProjStat(x) ? `<div class="nw-cpj">${escHtml(nwProjStat(x))}</div>` : ''}</div></button>`; }).join('')}</div>`;
}
function renderNwPost(body, it) {
  if (it.published) if (typeof intLog === 'function') intLog('open', 'news:' + it.id, '', true);   // ⭐ Konten paling dibuka (Rapor Bulanan)
  const s = cwLS(NEWS_SEEN_KEY); if (it.published && !s[it.id]) { s[it.id] = 1; cwLS(NEWS_SEEN_KEY, s); hlRender(); nwStar(); }
  const img = nwImgUrl(it.image), yt = nwYt(it.link_url);
  const lbl = escHtml(it.link_label || (yt ? 'Tonton di YouTube' : 'Lihat selengkapnya'));
  const others = nwLive().filter(x => x.id !== it.id).slice(0, 5);
  const acts = `<button class="gt-btn ghost" onclick="nwShare('${it.id}')">${SHARE_ICON} Bagikan</button>
        ${isEditor() ? `<button class="gt-btn ghost" onclick="openNwForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost" onclick="deleteNw('${it.id}')">🗑 Hapus</button>` : ''}`;
  body.innerHTML = `<div class="cw-reader nw-reader">
    <button class="cw-back" onclick="nwBack()">← Semua berita</button>
    <div class="nw-layout">
    <article class="nw-art">
    ${yt ? `<div class="nw-yt" role="button" tabindex="0" aria-label="Putar video" onclick="nwYtPlay(this,'${yt}')"><img src="${escHtml(nwYtThumb(yt))}" alt=""><span class="nw-ytbtn"></span><span class="nw-ytlbl">▶ Putar video</span></div>`
      : img ? `<div class="nw-hero-img${nwPhotos(it).length ? ' zm' : ''}"${nwPhotos(it).length ? ` role="button" tabindex="0" onclick="nwLbOpen('${it.id}',0)"` : ''}><img src="${escHtml(img)}" alt=""${nwImgStyle(it.image)}>${nwPhCount(it)}</div>` : ''}
    <div class="nw-meta">📰 News${it.category ? ` · <b>${escHtml(it.category)}</b>` : ''} · ${escHtml(nwDate(it.post_date))}${it.published ? '' : ' · <span class="cw-draft-note">DRAF — belum tampil untuk publik</span>'}</div>
    <h2 class="nw-title">${escHtml(it.title)}</h2>
    ${it.summary ? `<p class="nw-lead">${escHtml(it.summary)}</p>` : ''}
    <div class="cw-body">${nwBodyHtml(it)}</div>
    ${nwProjHtml(it)}
    ${it.link_url ? `<div class="nw-cta"><button class="gt-btn" onclick="nwOpenLink('${it.id}')">${lbl} ›</button></div>` : ''}
    <div class="cw-foot"><span class="cw-date">CAI Hub · Concerto Audio Indonesia</span>
      <div class="cw-acts">${acts}</div></div>
    </article>
    <aside class="nw-side">
      <div class="nw-sbox nw-sact">
        <div class="nw-sh">Berita ini</div>
        <div class="nw-sinfo">${it.category ? `<b>${escHtml(it.category)}</b> · ` : ''}${escHtml(nwDate(it.post_date))}</div>
        ${it.link_url ? `<button class="gt-btn" onclick="nwOpenLink('${it.id}')">${lbl} ›</button>` : ''}
        <div class="nw-sbtns">${acts}</div>
      </div>
      ${nwProjSide(it)}
      ${nwProdSide(it)}
      ${others.length ? `<div class="nw-sbox"><div class="nw-sh">Berita lainnya</div>
        ${others.map(x => { const im = nwThumb(x); return `<button class="nw-oth" onclick="openNews('${x.id}')">
          <span class="nw-oimg${im ? '' : ' ph'}">${im ? `<img src="${escHtml(im)}" alt="" loading="lazy"${nwImgStyle(x.image)}>` : '📰'}${nwPlayIc(x)}</span>
          <span class="nw-otx"><b>${escHtml(x.title)}</b><small>${x.category ? escHtml(x.category) + ' · ' : ''}${escHtml(nwDate(x.post_date))}</small></span></button>`; }).join('')}
        <button class="nw-sall" onclick="nwBack()">Lihat semua berita ›</button></div>` : ''}
    </aside>
    </div>
  </div>`;
  document.querySelector('.main')?.scrollTo?.({ top: 0 }); window.scrollTo({ top: 0 });
  // Partner yang baru ditambahkan lewat Editor hanya ada di tabel database (belum di AUTH_DEALERS bawaan):
  // muat daftar terbaru agar WhatsApp/Instagram/Maps tetap muncul — nwProjRefresh() menggambar ulang kotaknya
  if (nwProj(it).some(p => p.partner) && typeof adEnsure === 'function') adEnsure();
}
// Dipanggil adRerender() (js/core.js) setelah daftar partner dari database dimuat: hanya kotak partner yang diganti
// (tanpa render ulang halaman — posisi gulir & catatan "dibuka" tidak berubah)
function nwProjRefresh() {
  if (!nwCur || !document.getElementById('view-news')?.classList.contains('active')) return;
  const it = nwShown().find(x => x.id === nwCur); if (!it) return;
  const swap = (id, html) => { const el = document.getElementById(id); if (el && html) el.outerHTML = html; };
  swap('nw-pj', nwProjHtml(it)); swap('nw-pjs', nwProjSide(it));
}
// Tombol link: link produk portal (?p=… / ?news=… / ?cw=…) dibuka di dalam portal, selain itu tab baru
function nwOpenLink(id) {
  const it = nwItems?.find(x => x.id === id); if (!it?.link_url) return;
  let u; try { u = new URL(it.link_url, location.href); } catch (e) { return; }
  const own = u.origin === location.origin || /(^|\.)concerto\.id$/i.test(u.hostname) && /^(hub|dealer)\./i.test(u.hostname);
  if (own) {
    const p = u.searchParams.get('p'), n = u.searchParams.get('news'), c = u.searchParams.get('cw');
    if (p) { const r = findProductAny(p); if (r.product) return showProduct(r.brand.id, r.product.id); }
    if (n) return openNews(n);
    if (c) return openCway(c);
  }
  window.open(u.href, '_blank', 'noopener');
}

/* ── Form Editor ── */
function openNwForm(id) {
  if (!isEditor()) return;
  if (nwMissing) { nwCopySql(); return; }
  const it = id && nwItems?.find(x => x.id === id);
  nwForm = it ? { id: it.id, title: it.title, summary: it.summary || '', body: it.body || '', category: it.category || '', image: nwImgPath(it.image), fr: nwImgFr(it.image), file: null, preview: '', link_url: it.link_url || '', link_label: it.link_label || '', post_date: it.post_date, published: it.published, projects: nwProj(it).map(p => ({ ...p })), hadProj: 'projects' in it, photos: nwPhotos(it).map(p => ({ ...p })), hadPh: 'photos' in it, sel: null, busy: false }
    : { id: null, title: '', summary: '', body: '', category: NEWS_CATS[0], image: '', fr: { x: 50, y: 50, z: 1 }, file: null, preview: '', link_url: '', link_label: '', post_date: todayWIB(), published: true, projects: [], hadProj: false, photos: [], hadPh: false, sel: null, busy: false };
  if (typeof loadGaleri === 'function' && !glItems) loadGaleri().then(() => nwForm && renderNwForm()).catch(() => {});
  if (typeof adEnsure === 'function') adEnsure();
  let ov = document.getElementById('nw-form');
  if (!ov) {
    ov = document.createElement('div'); ov.id = 'nw-form'; ov.className = 'rk-pick gl-ov';
    ov.onclick = e => { if (e.target === ov) closeNwForm(); };
    ov.innerHTML = '<div class="rk-pick-box gl-fbox cw-fbox" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
  }
  renderNwForm(); ov.classList.add('open');
}
function closeNwForm() { if (nwForm?.preview) URL.revokeObjectURL(nwForm.preview); (nwForm?.photos || []).forEach(p => p.preview && URL.revokeObjectURL(p.preview)); nwForm = null; document.getElementById('nw-form')?.classList.remove('open'); }
function renderNwForm() {
  const f = nwForm, box = document.querySelector('#nw-form .rk-pick-box'); if (!f || !box) return;
  const img = f.preview || nwImgUrl(f.image);
  const prods = BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => `<option value="${escHtml(p.id)}">${escHtml(b.name + ' · ' + p.name)}</option>`))).join('');
  box.innerHTML = `<div class="rk-pick-hd"><div class="rk-pick-t">${f.id ? '✏️ Edit' : '＋ Tambah'} Berita</div><button class="rk-pick-x" onclick="closeNwForm()" aria-label="Tutup">✕</button></div>
    <div class="cwf">
      <div class="cwf-col">
        <label class="cwf-l">Judul<input value="${escHtml(f.title)}" maxlength="140" oninput="nwForm.title=this.value"></label>
        <label class="cwf-l">Ringkasan (1–2 kalimat, tampil di headline)<textarea class="nw-sum" maxlength="260" oninput="nwForm.summary=this.value">${escHtml(f.summary)}</textarea></label>
        <label class="cwf-l">Isi berita<textarea class="nw-body" placeholder="Pisahkan paragraf dengan baris kosong. Format WA *tebal* _miring_ ikut terbaca." oninput="nwForm.body=this.value" onblur="nwForm.sel=this.selectionStart">${escHtml(f.body)}</textarea></label>
        <small class="nw-ythint">Sisipkan foto tambahan di antara paragraf: <code>[foto 1]</code> = satu foto lebar · <code>[foto 2 3]</code> = foto berdampingan (atau klik <b>↳ Sisipkan</b> di bawah).</small>
        <div class="gl-hint">⚠️ Berita bisa dibaca semua orang — jangan masukkan harga dealer, diskon, atau info internal.</div>
      </div>
      <div class="cwf-col">
        <div class="cwf-l">Gambar sampul (disarankan landscape 16:9)
          <div class="nw-fimg${img ? ' adj' : ''}"${img ? ' onpointerdown="nwFrDrag(event)"' : ''}>${img ? `<img src="${escHtml(img)}" alt="" draggable="false"${nwFrStyle(f.fr)}><span class="nw-fhint">✥ Geser gambar untuk mengatur bagian yang tampil</span>` : '<span>Belum ada gambar</span>'}</div>
          ${img ? `<div class="nw-fz"><span>🔍 Zoom</span><input type="range" min="1" max="2.5" step="0.05" value="${f.fr.z}" oninput="nwFrZoom(this.value)" aria-label="Zoom gambar"><button type="button" class="gt-btn ghost" onclick="nwFrReset()">⊙ Reset</button></div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap"><label class="gt-btn ghost">🖼 Pilih gambar<input type="file" accept="image/jpeg,image/png,image/webp" hidden onchange="nwPickImg(this)"></label>${img ? '<button class="gt-btn ghost" onclick="nwDropImg()">Hapus gambar</button>' : ''}</div></div>
        <div class="cwf-row"><label>Kategori<input list="nw-cats" value="${escHtml(f.category)}" oninput="nwForm.category=this.value"><datalist id="nw-cats">${NEWS_CATS.map(c => `<option value="${c}">`).join('')}</datalist></label>
          <label>Tanggal<input type="date" value="${escHtml(f.post_date)}" oninput="nwForm.post_date=this.value"></label></div>
        <label class="cwf-l">Tombol link (opsional)
          <select onchange="nwPickProduct(this.value)"><option value="">— Pilih produk katalog —</option>${prods}</select>
          <input value="${escHtml(f.link_url)}" placeholder="atau tempel link, mis. https://… / link YouTube" oninput="nwForm.link_url=this.value"><small class="nw-ythint">▶ Link YouTube otomatis jadi video di halaman berita (thumbnail-nya dipakai bila tanpa gambar sampul).</small></label>
        <label class="cwf-l">Teks tombol<input value="${escHtml(f.link_label)}" placeholder="mis. Lihat Produk" oninput="nwForm.link_label=this.value"></label>
        <label class="cwf-chk"><input type="checkbox"${f.published ? ' checked' : ''} onchange="nwForm.published=this.checked"> Tampilkan untuk publik (hapus centang = draf)</label>
      </div>
    </div>
    ${nwPhFormHtml(f)}
    ${nwProjFormHtml(f)}
    <div class="acf-foot"><button class="gt-btn ghost" onclick="closeNwForm()">Batal</button><button class="gt-btn" onclick="saveNw()"${f.busy ? ' disabled' : ''}>${f.busy ? '⏳ Menyimpan…' : '💾 Simpan & Terbitkan'}</button></div>`;
}
function nwPickProduct(pid) {
  if (!pid || !nwForm) return;
  nwForm.link_url = `${PORTAL_URL}/?p=${encodeURIComponent(pid)}`;
  if (!nwForm.link_label) nwForm.link_label = 'Lihat Produk';
  renderNwForm();
}
function nwPickImg(input) {
  const file = input.files?.[0]; input.value = ''; if (!file || !nwForm) return;
  if (nwForm.preview) URL.revokeObjectURL(nwForm.preview);
  nwForm.file = file; nwForm.preview = URL.createObjectURL(file); nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm();
}
function nwDropImg() { if (!nwForm) return; if (nwForm.preview) URL.revokeObjectURL(nwForm.preview); nwForm.file = null; nwForm.preview = ''; nwForm.image = ''; nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm(); }
// Atur posisi: geser gambar di kotak pratinjau (titik fokus x/y %), slider zoom 1–2,5×
function nwFrApply() {
  const im = document.querySelector('#nw-form .nw-fimg img'); if (!im || !nwForm) return;
  const f = nwForm.fr; im.style.objectPosition = `${f.x}% ${f.y}%`; im.style.transformOrigin = `${f.x}% ${f.y}%`; im.style.scale = f.z;
}
function nwFrDrag(e) {
  const box = e.currentTarget, f = nwForm?.fr; if (!f || e.button > 0) return;
  e.preventDefault(); box.setPointerCapture?.(e.pointerId); box.classList.add('drag');
  const r = box.getBoundingClientRect(), x0 = e.clientX, y0 = e.clientY, fx = f.x, fy = f.y;
  const mv = ev => {   // gambar ikut jari: geser kanan = bagian kiri gambar terlihat
    const k = 100 / Math.max(1, f.z - 1 + .6);
    f.x = Math.round(Math.min(100, Math.max(0, fx - (ev.clientX - x0) / r.width * k)));
    f.y = Math.round(Math.min(100, Math.max(0, fy - (ev.clientY - y0) / r.height * k)));
    nwFrApply();
  };
  const up = () => { box.classList.remove('drag'); box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
  box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
}
function nwFrZoom(v) { if (!nwForm) return; nwForm.fr.z = Math.round(Number(v) * 100) / 100; nwFrApply(); }
function nwFrReset() { if (!nwForm) return; nwForm.fr = { x: 50, y: 50, z: 1 }; renderNwForm(); }
const nwFrSuffix = f => (f && (f.x !== 50 || f.y !== 50 || f.z !== 1)) ? `#${f.x},${f.y},${f.z}` : '';
/* Foto tambahan di form */
function nwPhFormHtml(f) {
  const used = new Set(); String(f.body || '').replace(NW_PH_RE, (m, g) => { nwPhNums(g).forEach(n => used.add(n)); return ''; });
  const gl = typeof glLiveAll === 'function' && glItems ? glLiveAll().filter(g => (g.photos || []).some(p => !glIsVid(p))) : [];
  const carOf = g => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
  return `<div class="cwf-l nw-phf"><div class="nw-phf-h"><span>📷 Foto tambahan <small>· ${f.photos.length} dari maks. ${NEWS_PH_MAX} · otomatis diperkecil</small></span>
    <span class="nw-phf-a">${f.photos.length < NEWS_PH_MAX ? `<label class="gt-btn">＋ Tambah foto<input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onchange="nwPhAdd(this)"></label>` : ''}
      ${gl.length && f.photos.length < NEWS_PH_MAX ? `<select onchange="nwPhFromGl(this.value);this.value=''"><option value="">📷 Ambil dari Galeri Instalasi…</option>${gl.map(g => `<option value="${escHtml(g.id)}">${escHtml(carOf(g) + (g.dealer ? ' · ' + g.dealer : ''))}</option>`).join('')}</select>` : ''}</span></div>
    ${f.photos.length ? `<div class="nw-phf-g">${f.photos.map((p, i) => `<div class="nw-phf-t"><span class="nw-phf-no">${i + 1}</span>${used.has(i + 1) ? '<span class="nw-phf-u">di isi ✓</span>' : ''}
      <img src="${escHtml(p.preview || nwPhUrl(p.path))}" alt="" loading="lazy">
      <input value="${escHtml(p.cap || '')}" maxlength="80" placeholder="+ keterangan" oninput="nwForm.photos[${i}].cap=this.value">
      <div class="nw-phf-b"><button type="button" onclick="nwPhMove(${i},-1)"${i ? '' : ' disabled'} aria-label="Geser kiri">◀</button><button type="button" class="ins" onclick="nwPhInsert(${i})">↳ Sisipkan</button><button type="button" onclick="nwPhMove(${i},1)"${i < f.photos.length - 1 ? '' : ' disabled'} aria-label="Geser kanan">▶</button><button type="button" onclick="nwPhDel(${i})" aria-label="Hapus">🗑</button></div></div>`).join('')}</div>`
      : '<small class="nw-ythint">Belum ada foto tambahan. Foto yang tidak disisipkan ke isi tampil sebagai “Foto lainnya” di bawah berita.</small>'}</div>`;
}
function nwPhAdd(input) {
  const f = nwForm, files = [...(input.files || [])]; input.value = ''; if (!f) return;
  const room = NEWS_PH_MAX - f.photos.length; if (files.length > room) showToast(`Maksimal ${NEWS_PH_MAX} foto — ${files.length - room} foto tidak ditambahkan.`);
  files.slice(0, Math.max(0, room)).forEach(file => f.photos.push({ file, preview: URL.createObjectURL(file), cap: '' }));
  renderNwForm();
}
function nwPhFromGl(id) {
  const g = glItems?.find(x => x.id === id), f = nwForm; if (!g || !f) return;
  const have = new Set(f.photos.map(p => p.path)), add = (g.photos || []).filter(p => !glIsVid(p) && p.path && !have.has(p.path));
  const room = NEWS_PH_MAX - f.photos.length;
  add.slice(0, room).forEach(p => f.photos.push({ path: p.path, cap: p.area || '' }));
  if (add.length > room) showToast(`Maksimal ${NEWS_PH_MAX} foto — ${add.length - room} foto tidak ditambahkan.`);
  renderNwForm();
}
// Nomor di tanda [foto n] ikut berubah saat foto digeser/dihapus (map: nomor lama → nomor baru, 0 = dibuang)
function nwPhRenum(map) {
  const f = nwForm; if (!f) return;
  f.body = String(f.body || '').replace(NW_PH_RE, (m, g) => { const n = nwPhNums(g).map(x => map[x] ?? x).filter(x => x > 0); return n.length ? `[foto ${n.join(' ')}]` : ''; })
    .replace(/\n{3,}/g, '\n\n');
}
function nwPhMove(i, d) {
  const f = nwForm, j = i + d; if (!f || j < 0 || j >= f.photos.length) return;
  [f.photos[i], f.photos[j]] = [f.photos[j], f.photos[i]]; nwPhRenum({ [i + 1]: j + 1, [j + 1]: i + 1 }); renderNwForm();
}
function nwPhDel(i) {
  const f = nwForm; if (!f) return; const p = f.photos[i]; if (p?.preview) URL.revokeObjectURL(p.preview);
  f.photos.splice(i, 1); const map = { [i + 1]: 0 }; for (let k = i + 2; k <= f.photos.length + 1; k++) map[k] = k - 1; nwPhRenum(map); renderNwForm();
}
function nwPhInsert(i) {
  const f = nwForm; if (!f) return; const b = String(f.body || ''), at = f.sel == null ? b.length : Math.min(f.sel, b.length);
  const pre = b.slice(0, at).replace(/\s+$/, ''), post = b.slice(at).replace(/^\s+/, ''), tag = `[foto ${i + 1}]`;
  f.body = (pre ? pre + '\n\n' : '') + tag + (post ? '\n\n' + post : ''); f.sel = (pre ? pre.length + 2 : 0) + tag.length; renderNwForm();
  const ta = document.querySelector('#nw-form .nw-body'); if (ta) { ta.focus(); ta.setSelectionRange(f.sel, f.sel); }
}
function nwCopyPhSql() {
  (navigator.clipboard?.writeText(NEWS_PH_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL "Foto tambahan" DISALIN — jalankan di Supabase → SQL Editor → Run, lalu simpan berita lagi.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', NEWS_PH_SQL));
}
function nwProjFormHtml(f) {
  const gl = typeof glLiveAll === 'function' && glItems ? glLiveAll() : [];
  const carOf = g => [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' ');
  return `<div class="cwf-l nw-pjf">🔧 Project &amp; partner pemasang <small>(opsional — untuk berita kontes / acara)</small>
    ${f.projects.length ? `<div class="nw-pjf-h"><span>Mobil</span><span>Peserta / pemilik</span><span>Hasil (opsional)</span><span>Partner pemasang</span><span></span></div>` : ''}
    ${f.projects.map((p, i) => `<div class="nw-pjf-r">
      <input value="${escHtml(p.car || '')}" placeholder="Merek Model Mobil" oninput="nwPjSet(${i},'car',this.value)">
      <input value="${escHtml(p.owner || '')}" placeholder="nama peserta" oninput="nwPjSet(${i},'owner',this.value)">
      <input value="${escHtml(p.result || '')}" placeholder="mis. Juara 1 · Kelas …" oninput="nwPjSet(${i},'result',this.value)">
      <input class="pt" list="nw-dl-pt" value="${escHtml(p.partner || '')}" placeholder="pilih partner resmi" oninput="nwPjSet(${i},'partner',this.value)">
      <button type="button" class="nw-pjf-x" onclick="nwPjDel(${i})" aria-label="Hapus">🗑</button></div>
      <div class="nw-pjf-p"><div class="nw-pjf-ph">🔊 Perangkat terpasang <span>${nwPjProds(p).length} produk</span></div>
        ${nwPjProds(p).length ? `<div class="nw-pjf-ch">${nwPjProds(p).map(id => { const { product: q } = findProductAny(id); return `<span>${escHtml(q.model || q.name)}<button type="button" onclick="nwPjPDel(${i},'${id}')" aria-label="Hapus">✕</button></span>`; }).join('')}</div>` : ''}
        <div class="nw-pjf-pa"><input id="nw-pjp-${i}" list="nw-dl-pr" placeholder="Ketik produk katalog, mis. “SQW”…" onkeydown="if(event.key==='Enter'){event.preventDefault();nwPjPAdd(${i})}"><button type="button" class="gt-btn ghost" onclick="nwPjPAdd(${i})">＋ Tambah</button></div>
        <input class="nw-pjf-oth" value="${escHtml(p.other || '')}" placeholder="Perangkat lain di luar katalog (opsional), pisahkan dengan koma" oninput="nwPjSet(${i},'other',this.value)"></div>`).join('')}
    <datalist id="nw-dl-pr">${BRANDS.flatMap(b => brandProducts(b).map(q => `<option value="${escHtml(nwPrLabel(b, q))}">`)).join('')}</datalist>
    <datalist id="nw-dl-pt">${adPublic().map(d => `<option value="${escHtml(d.n)}">`).join('')}</datalist>
    <div class="nw-pjf-a"><button type="button" class="gt-btn ghost" onclick="nwPjAdd()">＋ Tambah project</button>
      ${gl.length ? `<select onchange="nwPjFromGl(this.value);this.value=''"><option value="">📷 Ambil dari Galeri Instalasi…</option>${gl.map(g => `<option value="${escHtml(g.id)}">${escHtml(carOf(g) + (g.dealer ? ' · ' + g.dealer : ''))}</option>`).join('')}</select>` : ''}</div>
    <small class="nw-ythint">Perangkat terisi otomatis bila project diambil dari Galeri Instalasi (bisa diubah). Partner diambil dari daftar Enthusiast Partner sehingga tombol Profil &amp; WhatsApp tersambung otomatis. Nama di luar daftar tetap tampil sebagai teks.</small></div>`;
}
function nwPjSet(i, k, v) { if (nwForm?.projects[i]) nwForm.projects[i][k] = v; }
function nwPjAdd() { if (!nwForm) return; nwForm.projects.push({ car: '', owner: '', result: '', partner: '' }); renderNwForm(); }
function nwPrFind(txt) {
  const k = normKey(txt || ''); if (!k) return null;
  for (const b of BRANDS) for (const q of brandProducts(b)) if ([nwPrLabel(b, q), q.model, q.name, `${b.name} ${q.name}`].some(x => x && normKey(x) === k)) return q.id;
  return null;
}
function nwPjPAdd(i) {
  const pj = nwForm?.projects[i], inp = document.getElementById('nw-pjp-' + i); if (!pj || !inp) return;
  const id = nwPrFind(inp.value); if (!id) { showToast('Produk tidak ditemukan — pilih dari daftar katalog.'); return; }
  pj.products = [...new Set([...(pj.products || []), id])]; renderNwForm();
  document.getElementById('nw-pjp-' + i)?.focus();
}
function nwPjPDel(i, id) { const pj = nwForm?.projects[i]; if (!pj) return; pj.products = (pj.products || []).filter(x => x !== id); renderNwForm(); }
function nwPjDel(i) { if (!nwForm) return; nwForm.projects.splice(i, 1); renderNwForm(); }
function nwPjFromGl(id) {
  const g = glItems?.find(x => x.id === id); if (!g || !nwForm) return;
  const d = nwPd(g.dealer);
  let prods = (Array.isArray(g.products) ? g.products : []).filter(id => findProductAny(id).product), other = '';
  const h = g.hof_id && typeof HALL_OF_FAME !== 'undefined' ? HALL_OF_FAME.find(e => e.id === g.hof_id) : null;
  if (!prods.length && h?.products) prods = h.products.filter(id => findProductAny(id).product);
  if (h?.other?.length) other = h.other.join(', ');
  nwForm.projects.push({ car: [g.car_make, g.car_model, g.car_year].filter(Boolean).join(' '), owner: h?.name || '', result: h ? [h.award, h.cls].filter(Boolean).join(' · ') : '', partner: d?.n || g.dealer || '', gl: g.id, products: [...new Set(prods)], other });
  renderNwForm();
}
function nwCopyProjSql() {
  (navigator.clipboard?.writeText(NEWS_PROJ_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL "Project & partner" DISALIN — jalankan di Supabase → SQL Editor → Run, lalu simpan berita lagi.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', NEWS_PROJ_SQL));
}
async function saveNw() {
  const f = nwForm; if (!f || f.busy || !isEditor()) return;
  if (!f.title.trim()) return showToast('Judul belum terisi.');
  f.busy = true; renderNwForm();
  const old = f.id && nwImgPath(nwItems?.find(x => x.id === f.id)?.image);
  let uploaded = null; const upPh = [];
  const oldPh = f.id ? nwPhotos(nwItems?.find(x => x.id === f.id)).map(p => p.path) : [];
  try {
    let image = f.image || null;
    if (f.file) {
      const blob = await glResize(f.file, 1600);
      uploaded = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      const { error } = await supabase.storage.from('showcase').upload(uploaded, blob, { contentType: blob.type, cacheControl: '3600' });
      if (error) throw error;
      image = uploaded;
    }
    const path = image;
    if (image) image += nwFrSuffix(f.fr);
    const row = { title: f.title.trim(), summary: f.summary.trim() || null, body: f.body.trim() || null, category: f.category.trim() || null, image,
      link_url: f.link_url.trim() || null, link_label: f.link_label.trim() || null, post_date: f.post_date || todayWIB(), published: !!f.published, updated_at: new Date().toISOString() };
    const pj = f.projects.map(p => { const pr = nwPjProds(p), ot = (p.other || '').trim();
      return { car: (p.car || '').trim(), owner: (p.owner || '').trim(), result: (p.result || '').trim(), partner: (p.partner || '').trim(), ...(p.gl ? { gl: p.gl } : {}), ...(pr.length ? { products: pr } : {}), ...(ot ? { other: ot } : {}) }; })
      .filter(p => p.car || p.partner).map(p => Object.fromEntries(Object.entries(p).filter(([, v]) => v)));
    if (pj.length || f.hadProj) row.projects = pj;
    const ph = [];
    for (const p of f.photos) {
      if (p.file) {
        const blob = await glResize(p.file, 1600);
        const path = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
        const { error } = await supabase.storage.from('showcase').upload(path, blob, { contentType: blob.type, cacheControl: '3600' });
        if (error) throw error; upPh.push(path); p.path = path;
      }
      if (p.path) ph.push(Object.fromEntries(Object.entries({ path: p.path, cap: (p.cap || '').trim() }).filter(([, v]) => v)));
    }
    if (ph.length || f.hadPh) row.photos = ph;   // kolom baru: hanya dikirim bila dipakai   // kolom baru: hanya dikirim bila dipakai (berita lama tetap bisa disimpan sebelum SQL)
    const wasPub = !!(f.id && nwItems?.find(x => x.id === f.id)?.published);
    const q = f.id ? supabase.from(NEWS_TABLE).update(row).eq('id', f.id).select().single() : supabase.from(NEWS_TABLE).insert(row).select().single();
    const { data, error } = await q; if (error) throw error;
    if (data.published && !wasPub) pushNotify('news', data.id);   // notifikasi HP "CAI Hub News" (sekali per berita, js/push.js)
    if (old && old !== path && /^news\//.test(old)) supabase.storage.from('showcase').remove([old]).catch(() => {});
    const gone = oldPh.filter(x => /^news\//.test(x) && !ph.some(p => p.path === x));   // foto dari Galeri tidak ikut dihapus
    if (gone.length) supabase.storage.from('showcase').remove(gone).catch(() => {});
    closeNwForm(); showToast(f.id ? '✓ Berita diperbarui' : '✓ Berita diterbitkan');
    await loadNews(true); openNews(data.id);
  } catch (e) {
    if (uploaded) supabase.storage.from('showcase').remove([uploaded]).catch(() => {});
    if (upPh.length) { supabase.storage.from('showcase').remove(upPh).catch(() => {}); f.photos.forEach(p => { if (p.file && upPh.includes(p.path)) delete p.path; }); }
    f.busy = false; renderNwForm();
    const m = e?.message || String(e);
    if (/projects/i.test(m) && /column|schema cache/i.test(m)) nwCopyProjSql();
    else if (/photos/i.test(m) && /column|schema cache/i.test(m)) nwCopyPhSql();
    else if (/does not exist|schema cache/i.test(m)) { nwMissing = true; nwCopySql(); }
    else dashErr(e, 'menyimpan berita');   // izin Storage `showcase` kurang → SQL perbaikan disalin otomatis
  }
}
async function deleteNw(id) {
  const it = nwItems?.find(x => x.id === id); if (!it || !isEditor()) return;
  if (!confirm(`Hapus berita "${it.title}"?`)) return;
  const { error } = await supabase.from(NEWS_TABLE).delete().eq('id', id);
  if (error) return showToast('⚠ Gagal menghapus: ' + error.message, 7000);
  if (it.image && /^news\//.test(it.image)) supabase.storage.from('showcase').remove([nwImgPath(it.image)]).catch(() => {});
  const ph = nwPhotos(it).map(p => p.path).filter(x => /^news\//.test(x)); if (ph.length) supabase.storage.from('showcase').remove(ph).catch(() => {});
  showToast('Berita dihapus'); nwCur = null; await loadNews(true); renderNews();
}
function nwCopySql() {
  (navigator.clipboard?.writeText(NEWS_SQL) || Promise.reject()).then(
    () => showToast('📋 SQL News DISALIN — tempel di Supabase → SQL Editor → Run, lalu muat ulang portal.', 9000),
    () => prompt('Jalankan SQL ini sekali di Supabase → SQL Editor → Run:', NEWS_SQL));
}

/* ── Bagikan ke WA: gambar sampul berita (bila ada) + teks + link ?news=<id> ── */
function nwPrepImage(it) {
  const src = nwImgUrl(it.image); if (!src || nwImgCache[it.id]?.src === src) return;
  nwImgCache[it.id] = { src, file: null };
  fetch(src).then(r => r.ok ? r.blob() : null).then(b => { if (b && nwImgCache[it.id]?.src === src) nwImgCache[it.id].file = new File([b], 'CAI-Hub-News.' + (b.type.includes('png') ? 'png' : b.type.includes('webp') ? 'webp' : 'jpg'), { type: b.type }); }).catch(() => {});
}
// Bagikan = teks + link saja (4 Nov 2026, permintaan pemilik — sama seperti Concerto Way & Panduan Partner): WhatsApp lalu
// menampilkan kartu pratinjau link /news/ (CAI Hub News). Dulu gambar sampul ikut dilampirkan sehingga WA tidak menampilkan kartu.
function nwShare(id) {
  const it = nwItems?.find(x => x.id === id); if (!it) return;
  const text = `📰 *CAI Hub News: ${it.title}*${it.summary ? '\n' + it.summary : ''}\nBaca selengkapnya di CAI Hub:\n${nwLink(it.id)}`;
  window.open(`https://wa.me/?text=${waText(text)}`, '_blank', 'noopener');
}
