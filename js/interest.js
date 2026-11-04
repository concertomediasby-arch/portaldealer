/* LAPORAN MINAT PENGUNJUNG (Tahap 4, 4 Nov 2026, permintaan pemilik — pratinjau .mockup/tahap4/ disetujui; laporan bulanan partner menyusul).
   Mencatat (tanpa data pribadi, ID browser = visitId()): produk dibuka · klik WhatsApp/Maps/Instagram partner (+ sumbernya) · kota/provinsi
   yang dicari · kata pencarian (ketemu / tidak) · ❤ simpan · ⇄ bandingkan · masuk rakitan · bagikan perbandingan/rakitan.
   RPC log_interest → tabel site_interest; angka lewat interest_stats (KHUSUS EDITOR — permintaan pemilik 4 Nov 2026) → tab "📈 Minat Pengunjung" di menu Pengunjung Portal.
   Akun Admin/Editor & layar videotron tidak mencatat. SQL sekali jalan: supabase/interest.sql = INT_SQL. */
const INT_SQL = `-- Laporan Minat Pengunjung (Tahap 4, 4 Nov 2026) — jalankan sekali di Supabase → SQL Editor → Run (aman dijalankan ulang)
-- Tanpa data pribadi: vid = ID acak per browser (sama dengan Pengunjung Portal). Akun Admin/Editor tidak mencatat.
create table if not exists public.site_interest (
  day date not null,
  vid text not null,
  kind text not null,   -- view (produk dibuka) | wa | maps | ig (klik partner) | city (kota/provinsi dicari) | search | fav | cmp | rk | share
  ref text not null,    -- id produk / nama partner / kota / kata dicari / pasangan id dibandingkan / cmp|rk (share)
  src text not null default '',   -- sumber klik partner (produk, partner, cek, hof, galeri, google, lain) · hit|miss (search)
  n int not null default 1,
  primary key (day, vid, kind, ref, src)
);
create index if not exists site_interest_kind_day on public.site_interest (kind, day);
alter table public.site_interest enable row level security;

create or replace function public.log_interest(p_vid text, p_kind text, p_ref text, p_src text default '')
returns void language plpgsql security definer set search_path = public as $$
declare r text := left(btrim(coalesce(p_ref, '')), 120); s text := left(coalesce(p_src, ''), 20);
begin
  if p_vid is null or length(p_vid) < 8 or length(p_vid) > 64 or r = '' then return; end if;
  if p_kind not in ('view', 'wa', 'maps', 'ig', 'city', 'search', 'fav', 'cmp', 'rk', 'share') then return; end if;
  if p_kind = 'search' then r := lower(r); end if;
  insert into site_interest (day, vid, kind, ref, src) values ((now() at time zone 'Asia/Jakarta')::date, p_vid, p_kind, r, s)
  on conflict (day, vid, kind, ref, src) do update set n = least(site_interest.n + 1, 50)
    where site_interest.kind <> 'view';   -- lihat produk: 1× per orang per hari
end $$;
grant execute on function public.log_interest(text, text, text, text) to anon, authenticated;

create or replace function public.interest_stats(p_days int default 30)
returns json language plpgsql security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Jakarta')::date; nd int := least(greatest(coalesce(p_days, 30), 1), 366);
  a date := today - nd; b date := today - 2 * nd;   -- periode ini: day > a · periode sebelumnya: b < day <= a
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'editor' then raise exception 'not allowed'; end if;   -- khusus Editor
  return json_build_object(
    'days', nd,
    'first_day', (select min(day) from site_interest),
    'tot', (select json_build_object(
        'view', count(*) filter (where kind = 'view' and day > a), 'view0', count(*) filter (where kind = 'view' and day <= a),
        'click', coalesce(sum(n) filter (where kind in ('wa','maps','ig') and day > a), 0), 'click0', coalesce(sum(n) filter (where kind in ('wa','maps','ig') and day <= a), 0),
        'search', coalesce(sum(n) filter (where kind = 'search' and day > a), 0), 'search0', coalesce(sum(n) filter (where kind = 'search' and day <= a), 0),
        'share', coalesce(sum(n) filter (where kind = 'share' and day > a), 0), 'share0', coalesce(sum(n) filter (where kind = 'share' and day <= a), 0),
        'people', count(distinct vid) filter (where day > a))
      from site_interest where day > b),
    'views', (select coalesce(json_agg(t), '[]') from (
        select ref, count(*) filter (where day > a) n, count(*) filter (where day <= a) n0
        from site_interest where kind = 'view' and day > b group by ref having count(*) filter (where day > a) > 0
        order by 2 desc, 1 limit 15) t),
    'partners', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) filter (where kind = 'wa') wa, sum(n) filter (where kind = 'maps') maps, sum(n) filter (where kind = 'ig') ig, sum(n) total
        from site_interest where kind in ('wa','maps','ig') and day > a group by ref order by total desc, ref limit 20) t),
    'psrc', (select coalesce(json_agg(t), '[]') from (
        select src, sum(n) n from site_interest where kind in ('wa','maps','ig') and day > a group by src order by 2 desc) t),
    'cities', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'city' and day > a group by ref order by 2 desc, 1 limit 15) t),
    'search_hit', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'search' and src = 'hit' and day > a group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 20) t),
    'search_miss', (select coalesce(json_agg(t), '[]') from (
        select ref, sum(n) n from site_interest where kind = 'search' and src = 'miss' and day > a group by ref
        having count(distinct vid) >= 2 order by 2 desc, 1 limit 20) t),
    'fav', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'fav' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'cmp', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'cmp' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'rk', (select coalesce(json_agg(t), '[]') from (
        select ref, count(distinct vid) n from site_interest where kind = 'rk' and day > a group by ref order by 2 desc, 1 limit 8) t),
    'share', (select coalesce(json_object_agg(ref, n), '{}') from (
        select ref, sum(n) n from site_interest where kind = 'share' and day > a group by ref) t));
end $$;
grant execute on function public.interest_stats(int) to authenticated;`;

// ── Pencatatan ──
const INT_SES = 'cai-int';   // sessionStorage: kejadian yang sudah dicatat di tab ini (cegah dobel)
let intOff = false;          // true bila SQL belum dijalankan (RPC tidak ada) — berhenti mencoba di sesi ini
function intLog(kind, ref, src = '', once) {
  if (intOff || typeof supabase === 'undefined' || !supabase || QA_SCREEN_MODE || (typeof isAdmin === 'function' && isAdmin())) return;
  ref = String(ref || '').trim().slice(0, 120); if (!ref) return;
  const vid = typeof visitId === 'function' ? visitId() : null; if (!vid) return;
  if (once) {   // sekali per tab per hari untuk kejadian yang sama
    const k = todayWIB() + '|' + kind + '|' + ref + '|' + src;
    let s = []; try { s = JSON.parse(sessionStorage.getItem(INT_SES) || '[]'); } catch (e) {}
    if (s.includes(k)) return;
    s.push(k); try { sessionStorage.setItem(INT_SES, JSON.stringify(s.slice(-300))); } catch (e) {}
  }
  supabase.rpc('log_interest', { p_vid: vid, p_kind: kind, p_ref: ref, p_src: src }).then(r => {
    if (r?.error && /function|does not exist|schema cache|404/i.test(r.error.message || '')) intOff = true;
  }, () => {});
}
// Kata pencarian: dicatat 1,5 dtk setelah berhenti mengetik (Katalog / Dashboard) — hit = ada produk, miss = tidak ada
let intSearchT = null;
function intSearch(q, hit) {
  clearTimeout(intSearchT);
  q = String(q || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
  if (q.length < 2) return;
  intSearchT = setTimeout(() => intLog('search', q, hit ? 'hit' : 'miss', true), 1500);
}
// Kota / provinsi: dari pilihan provinsi di halaman produk, chip provinsi & pencarian di Authorized Partner (hanya bila cocok nama kota/provinsi)
let intCityT = null;
function intCity(v, delay) {
  clearTimeout(intCityT);
  const k = normKey(v || ''); if (k.length < 3) return;
  const ds = typeof adPublic === 'function' ? adPublic() : [];
  const name = [...new Set(ds.map(d => d.c).filter(Boolean)), ...new Set(ds.map(d => d.r))].find(x => normKey(x) === k);
  if (!name) return;
  intCityT = setTimeout(() => intLog('city', name, '', true), delay || 0);
}
// Klik WhatsApp / Maps / Instagram partner — dikenali dari alamat link (wa.me/<nomor partner>, instagram.com/<akun>, link Maps partner)
function intPartnerOf(href) {
  const ds = typeof adPublic === 'function' ? adPublic() : []; if (!ds.length) return null;
  let m = href.match(/wa\.me\/(\d{8,15})/);
  if (m) { if (typeof CAI_WHATSAPP !== 'undefined' && m[1] === CAI_WHATSAPP) return null; const d = ds.find(x => x.wa && String(x.wa) === m[1]); return d && { d, kind: 'wa' }; }
  m = href.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (m) { const d = ds.find(x => x.ig && x.ig.toLowerCase() === m[1].toLowerCase()); return d && { d, kind: 'ig' }; }
  if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google/.test(href)) { const d = ds.find(x => adMaps(x) === href || (x.map && x.map === href)); return d && { d, kind: 'maps' }; }
  return null;
}
function intSrcOf(el) {
  if (el.closest('#pd-near')) return 'produk';
  if (el.closest('#dash-check')) return 'cek';
  if (el.closest('#view-authdealer')) return 'partner';
  if (el.closest('#hof-dealer, #view-halloffame, #hof-win')) return 'hof';
  if (el.closest('#gl-detail, #view-galeri')) return 'galeri';
  return 'lain';
}
document.addEventListener('click', e => {
  const a = e.target.closest?.('a[href]'); if (!a) return;
  const hit = intPartnerOf(a.href); if (hit) intLog(hit.kind, hit.d.n, intSrcOf(a));
}, true);

// ── Laporan (tab di menu Pengunjung Portal) ──
let vsTab = 'visit', intStats = null, intErr = '';
function setVsTab(t) {
  if (t === 'int' && !isEditor()) { showToast('Laporan Minat Pengunjung khusus akun Editor.'); t = 'visit'; }
  vsTab = t;
  document.querySelectorAll('[data-vstab]').forEach(b => b.classList.toggle('active', b.dataset.vstab === t));
  if (t === 'int' && !intStats) loadIntStats(); else renderVisitors();
}
async function loadIntStats() {
  if (typeof supabase === 'undefined' || !supabase || !isEditor()) return;
  try {
    const { data, error } = await supabase.rpc('interest_stats', { p_days: typeof visitDays !== 'undefined' ? visitDays : 30 });
    if (error) throw error;
    intStats = typeof data === 'string' ? JSON.parse(data) : data; intErr = '';
  } catch (e) { const m = String(e.message || e); intStats = null; intErr = /function|does not exist|schema cache|404|relation/i.test(m) ? 'setup' : 'Laporan minat tidak bisa dimuat: ' + m; }
  if (vsTab === 'int') renderVisitors();
}
function intCopySql() { (navigator.clipboard?.writeText(INT_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => prompt('Salin SQL ini:', INT_SQL)); }
const INT_SRC = { produk: ['Halaman produk “Tanya”', 'var(--accent)'], partner: ['Authorized Partner', '#6fd3e6'], cek: ['Cek Partner Resmi', '#52c38a'],
  google: ['Halaman Google /partner/', '#b48cf2'], hof: ['Hall of Fame', '#f0a35e'], galeri: ['Galeri Instalasi', '#e2685f'], lain: ['Lainnya', '#8b92a1'] };
function intTrend(n, n0) {
  if (!n0) return n ? '<small class="int-up">baru</small>' : '';
  const p = Math.round((n - n0) / n0 * 100);
  return `<small class="${p < 0 ? 'int-dn' : 'int-up'}">${p < 0 ? '▼' : '▲'} ${Math.abs(p)}%</small>`;
}
function intProd(id) { const r = findProductAny(id); return r?.product ? r : null; }
function intHtml() {
  if (intErr === 'setup') return `<div class="vs-warn">Laporan Minat Pengunjung belum diaktifkan. Jalankan SQL ini sekali di Supabase → SQL Editor → Run, lalu tekan ↻ Muat ulang. Data mulai terkumpul setelah SQL dijalankan.<br><br><button class="gt-btn" onclick="intCopySql()">📋 Salin SQL Minat Pengunjung</button></div>`;
  if (intErr) return `<div class="vs-warn">${escHtml(intErr)}</div>`;
  if (!intStats) return '<div class="vs-note">⏳ Memuat…</div>';
  const S = intStats, T = S.tot || {}, days = S.days || 30;
  const kpi = (k, v, v0) => `<div class="vs-card"><div class="vs-k">${k}</div><b>${fmtNum(v)}</b><div class="vs-sub">${intTrend(+v, +v0) || '&nbsp;'} ${v0 ? `<span>dari ${fmtNum(v0)}</span>` : ''}</div></div>`;
  const empty = t => `<div class="vs-note">${t}</div>`;
  const vmax = Math.max(1, ...(S.views || []).map(x => +x.n));
  const views = (S.views || []).map(x => ({ ...x, r: intProd(x.ref) })).filter(x => x.r).slice(0, 10).map((x, i) => {
    const ph = x.r.product.photo || x.r.product.photos?.[0];
    return `<button class="int-pr" onclick="showProduct('${x.r.brand.id}','${x.r.product.id}')"><span class="rk${i < 3 ? ' g' : ''}">${i + 1}</span>
      <span class="ph">${ph ? `<img src="${escHtml(ph)}" alt="" loading="lazy">` : `<i>${x.r.product.emoji || '🔊'}</i>`}</span>
      <span class="nm"><b>${escHtml(x.r.product.name)}</b><small>${escHtml(x.r.brand.name)} · ${escHtml(x.r.product.category)}</small></span>
      <span class="int-bar"><i style="width:${x.n / vmax * 100}%"></i></span><span class="v">${fmtNum(x.n)}${intTrend(+x.n, +x.n0)}</span></button>`;
  }).join('');
  const ds = typeof adPublic === 'function' ? adPublic() : [];
  const parts = (S.partners || []).map(x => { const d = ds.find(y => y.n === x.ref);
    return `<div class="int-pt"><div><b>${escHtml(x.ref)}</b><small>${escHtml(d ? (d.c || d.r) : '')}</small></div><span>${fmtNum(x.wa || 0)}</span><span>${fmtNum(x.maps || 0)}</span><span>${fmtNum(x.ig || 0)}</span><span class="t">${fmtNum(x.total)}</span></div>`; }).join('');
  const ps = S.psrc || [], pst = ps.reduce((a, x) => a + +x.n, 0) || 1;
  const src = ps.length ? `<div class="int-src">${ps.map(x => `<i style="width:${x.n / pst * 100}%;background:${(INT_SRC[x.src] || INT_SRC.lain)[1]}"></i>`).join('')}</div>
    <div class="int-leg">${ps.map(x => `<span style="--c:${(INT_SRC[x.src] || INT_SRC.lain)[1]}">${(INT_SRC[x.src] || INT_SRC.lain)[0]} ${Math.round(x.n / pst * 100)}%</span>`).join('')}</div>` : '';
  const chips = (a, cls = '') => a?.length ? `<div class="int-kw ${cls}">${a.map(x => `<span>${escHtml(x.ref)}<b>${fmtNum(x.n)}</b></span>`).join('')}</div>` : '';
  const pname = id => { const r = intProd(id); return r ? `${r.brand.name} ${r.product.name}` : id; };
  const list = (a, fn) => a?.length ? a.map(x => `<div class="int-li"><span>${escHtml(fn(x.ref))}</span><b>${fmtNum(x.n)}</b></div>`).join('') : empty('Belum ada data.');
  const cmpName = ref => ref.split(',').map(id => intProd(id)?.product.name || id).join(' ⇄ ');
  const sh = S.share || {};
  return `<div class="vs-cards">
      ${kpi('Produk dilihat', T.view, T.view0)}${kpi('Klik ke partner (WA · Maps · IG)', T.click, T.click0)}${kpi('Pencarian', T.search, T.search0)}
      <div class="vs-card"><div class="vs-k">Rakitan &amp; perbandingan dibagikan</div><b>${fmtNum(T.share)}</b><div class="vs-sub">rakitan ${fmtNum(sh.rk || 0)} · perbandingan ${fmtNum(sh.cmp || 0)}</div></div>
    </div>
    <div class="int-g2">
      <div class="vs-box"><h3>🔥 Produk paling dilihat · ${days} hari</h3><div class="vs-note" style="margin:2px 0 8px">1× per orang per hari. Panah = dibanding ${days} hari sebelumnya. Klik = buka produk.</div>${views || empty('Belum ada data.')}</div>
      <div>
        <div class="vs-box"><h3>📞 Klik ke partner</h3><div class="vs-note" style="margin:2px 0 8px">Tombol WhatsApp · Maps · Instagram partner yang diklik pengunjung (tercatat saat ditekan — belum tentu pesan WA terkirim).</div>
          ${parts ? `<div class="int-pt h"><span>Partner</span><span>WA</span><span>Maps</span><span>IG</span><span>Total</span></div>${parts}<div class="vs-note" style="margin:12px 0 0">Dari mana kliknya</div>${src}` : empty('Belum ada klik.')}</div>
        <div class="vs-box"><h3>📍 Kota paling banyak dicari</h3><div class="vs-note" style="margin:2px 0 8px">Provinsi di “Beli &amp; pasang di partner resmi”, chip provinsi &amp; pencarian kota di Authorized Partner.</div>${chips(S.cities) || empty('Belum ada data.')}</div>
      </div>
    </div>
    <div class="int-g2">
      <div class="vs-box"><h3>🔎 Kata yang paling dicari</h3><div class="vs-note" style="margin:2px 0 8px">Kotak cari Dashboard &amp; Katalog (kata yang dicari minimal 2 orang).</div>${chips(S.search_hit) || empty('Belum ada data.')}</div>
      <div class="vs-box"><h3>❓ Dicari tapi tidak ketemu</h3><div class="vs-note" style="margin:2px 0 8px">Peluang produk baru, nama lain yang perlu dikenali, atau salah ketik umum.</div>${chips(S.search_miss, 'miss') || empty('Belum ada data.')}</div>
    </div>
    <div class="int-g3">
      <div class="vs-box"><h3>❤ Paling banyak disimpan</h3>${list(S.fav, pname)}</div>
      <div class="vs-box"><h3>⇄ Paling sering dibandingkan</h3>${list(S.cmp, cmpName)}</div>
      <div class="vs-box"><h3>🔧 Paling sering masuk rakitan</h3>${list(S.rk, pname)}</div>
    </div>
    <div class="vs-note">Dicatat per browser tanpa data pribadi${S.first_day ? ' sejak ' + new Date(S.first_day + 'T00:00:00Z').toLocaleDateString('id-ID', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : ''}; akun Admin/Editor tidak dihitung. Satu orang di HP + laptop = 2. Angka “disimpan / dibandingkan / rakitan” = jumlah orang.</div>`;
}
