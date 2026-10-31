/* CAI Hub (Concerto Audio Indonesia) — js/showcase.js
   SHOWCASE (31 Okt 2026, permintaan pemilik): 🏆 Hall of Fame (prestasi kompetisi per seri speaker, data HALL_OF_FAME
   di katalog.js) + 🚗 Galeri Instalasi (contoh pemasangan per mobil, tabel Supabase showcase_installs + Storage publik
   `showcase`). Sementara hanya untuk Editor (SHOWCASE_PUBLIC = false) sampai data asli terkumpul.
   Dimuat setelah videotron.js; dipanggil dari core.js (showProduct/renderProducts/productCard) & stock.js (updateAuthUI). */

const SHOWCASE_PUBLIC = false;   // true = menu & bagian Showcase tampil untuk semua pengunjung
const scOn = () => SHOWCASE_PUBLIC || isEditor();

/* ══════════════════════════════════════════
   HALL OF FAME
══════════════════════════════════════════ */
// Data contoh — HANYA tampil untuk Editor selama HALL_OF_FAME masih kosong (nama kompetisi sengaja placeholder)
const HOF_DEMO = [
  { id:'demo-1', event:'[Nama Kompetisi]', city:'Jakarta',  year:2026, cls:'SQ Pemula',  place:1, award:'Juara 1', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Fortuner', dealer:'[Nama Dealer]' },
  { id:'demo-2', event:'[Nama Kompetisi]', city:'Surabaya', year:2025, cls:'Kelas 2-Way', place:0, award:'Best Sound Quality', brand:'audiocircle', line:'Stuttgart Line', car:'Honda HR-V', dealer:'[Nama Dealer]' },
  { id:'demo-3', event:'[Nama Kompetisi]', city:'Bandung',  year:2025, cls:'SQ Entry',   place:2, award:'Juara 2', brand:'audiocircle', line:'Stuttgart Line', car:'Mitsubishi Pajero Sport', dealer:'[Nama Dealer]' },
  { id:'demo-4', event:'[Nama Kompetisi]', city:'Semarang', year:2024, cls:'SQ Pemula',  place:3, award:'Juara 3', brand:'audiocircle', line:'Stuttgart Line', car:'Toyota Innova Zenix', dealer:'[Nama Dealer]' },
  { id:'demo-5', event:'[Nama Kompetisi]', city:'Malang',   year:2025, cls:'SQ Entry',   place:1, award:'Juara 1', brand:'audiocircle', line:'Frankfurt Line', car:'Toyota Rush', dealer:'[Nama Dealer]' },
  { id:'demo-6', event:'[Nama Kompetisi]', city:'Jakarta',  year:2024, cls:'SQ 2-Way',   place:2, award:'Juara 2', brand:'audiocircle', line:'Frankfurt Line' },
  { id:'demo-7', event:'[Nama Kompetisi]', city:'Surabaya', year:2026, cls:'SQ Expert',  place:1, award:'Juara 1', brand:'audiocircle', line:'Pro Line', car:'BMW 320i', dealer:'[Nama Dealer]' },
  { id:'demo-8', event:'[Nama Kompetisi]', city:'Medan',    year:2025, cls:'SQ 3-Way',   place:3, award:'Juara 3', brand:'audiocircle', line:'Munich Line' },
];
let hofBrand = 'all', hofYear = 'all', hofOpen = {};
const hofIsDemo = () => !HALL_OF_FAME.length && isEditor();
const hofData = () => HALL_OF_FAME.length ? HALL_OF_FAME : (hofIsDemo() ? HOF_DEMO : []);
const hofKey = (b, l) => b + '|' + normKey(l);
const hofDomId = k => 'hof-' + k.replace(/[^a-z0-9]/gi, '-');
const hofMedal = (pl, n) => pl >= 1 && pl <= 3
  ? `<i class="hof-m ${['g', 's', 'b'][pl - 1]}">${n ?? pl}</i>`
  : `<i class="hof-m x">${n ?? '★'}</i>`;
const hofSort = (a, b) => (b.year || 0) - (a.year || 0) || (a.place || 9) - (b.place || 9);
function hofProducts(e) {
  const brand = BRANDS.find(b => b.id === e.brand);
  const line = brand?.lines.find(l => normKey(l.name) === normKey(e.line));
  const all = line ? line.products : [];
  return e.products?.length ? all.filter(p => e.products.includes(p.id)).concat(
    (brand ? brand.lines.flatMap(l => l.products) : []).filter(p => e.products.includes(p.id) && !all.includes(p))) : all;
}
// Prestasi yang berlaku untuk satu produk: entri yang menyebut produk itu, atau entri tanpa daftar produk di line yang sama
function hofForProduct(brandId, lineName, pid) {
  return hofData().filter(e => e.brand === brandId && (e.products?.length ? e.products.includes(pid) : normKey(e.line) === normKey(lineName || '')));
}
function hofSeries(list) {
  const map = new Map();
  list.forEach(e => {
    const k = hofKey(e.brand, e.line);
    if (!map.has(k)) map.set(k, { key: k, brand: e.brand, line: e.line, items: [], g: 0, s: 0, b: 0 });
    const s = map.get(k);
    s.items.push(e);
    if (e.place === 1) s.g++; else if (e.place === 2) s.s++; else if (e.place === 3) s.b++;
  });
  return [...map.values()].sort((a, b) => b.items.length - a.items.length || b.g - a.g || b.s - a.s);
}
const hofLineCount = (brandId, lineName) => hofData().filter(e => e.brand === brandId && normKey(e.line) === normKey(lineName)).length;
// Lencana di judul line (halaman brand) & kartu produk — dipanggil core.js
function hofLineBadge(brandId, lineName) {
  if (!scOn()) return '';
  const n = hofLineCount(brandId, lineName);
  return n ? `<button class="hof-badge" onclick="event.stopPropagation();openHallOfFame('${hofKey(brandId, lineName)}')" title="Lihat prestasi seri ini di Hall of Fame">🏆 ${n} Prestasi</button>` : '';
}
function hofCardBadge(brandId, p) {
  if (!scOn()) return '';
  const line = BRANDS.find(b => b.id === brandId)?.lines.find(l => l.products.some(x => x.id === p.id))?.name;
  const n = hofForProduct(brandId, line, p.id).length;
  return n ? `<span class="hof-cbadge" title="${n} prestasi kompetisi">🏆 ${n}</span>` : '';
}

function openHallOfFame(focusKey) {
  if (!scOn()) return;
  showView('halloffame');
  renderHallOfFame();
  const main = document.querySelector('.main');
  if (focusKey) {
    hofOpen[focusKey] = true; renderHallOfFame();
    setTimeout(() => document.getElementById(hofDomId(focusKey))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  } else main?.scrollTo(0, 0);
}
function setHofFilter(kind, v) { if (kind === 'brand') hofBrand = v; else hofYear = v; renderHallOfFame(); }
function hofToggle(k) { hofOpen[k] = !hofOpen[k]; renderHallOfFame(); }
function renderHallOfFame() {
  const box = document.getElementById('hof-body'); if (!box) return;
  const all = hofData();
  const list = all.filter(e => (hofBrand === 'all' || e.brand === hofBrand) && (hofYear === 'all' || String(e.year) === hofYear));
  const series = hofSeries(list);
  const brands = [...new Set(all.map(e => e.brand))];
  const years = [...new Set(all.map(e => e.year).filter(Boolean))].sort((a, b) => b - a);
  const brandName = id => BRANDS.find(b => b.id === id)?.name || id;
  const events = new Set(list.map(e => [e.event, e.city, e.year].join('|'))).size;
  const chip = (kind, v, label, on) => `<button class="filter-chip${on ? ' active' : ''}" onclick="setHofFilter('${kind}','${escHtml(String(v))}')">${escHtml(label)}</button>`;

  if (!all.length) {
    box.innerHTML = `<div class="stock-empty">Belum ada data prestasi. Isi <b>HALL_OF_FAME</b> di katalog.js dengan data kompetisi asli.</div>`;
    return;
  }
  const max = Math.max(1, ...series.map(s => s.items.length));
  const thumbs = s => hofProducts({ brand: s.brand, line: s.line }).slice(0, 3)
    .map(p => p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : `<span class="hof-ph">${p.emoji}</span>`).join('');
  const board = series.map((s, i) => `
    <button class="hof-row${i === 0 ? ' top' : ''}" onclick="openHallOfFame('${s.key}')">
      <span class="hof-rk">${String(i + 1).padStart(2, '0')}</span>
      <span class="hof-ser"><b>${escHtml(s.line)}${i === 0 && series.length > 1 ? '<span class="hof-flag">PALING BANYAK JUARA</span>' : ''}</b><small>${escHtml(brandName(s.brand))}</small></span>
      <span class="hof-thumbs">${thumbs(s)}</span>
      <span class="hof-c">${s.g}</span><span class="hof-c">${s.s}</span><span class="hof-c">${s.b}</span>
      <span class="hof-tot"><b>${s.items.length}</b><i class="hof-bar"><i style="width:${Math.round(s.items.length / max * 100)}%"></i></i></span>
    </button>`).join('');

  const winRow = e => `<div class="hof-win">${hofMedal(e.place)}
      <div><b>${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b>
      <div class="hof-meta">${escHtml(e.event)}${e.city ? ' · ' + escHtml(e.city) : ''}</div>
      ${e.car || e.dealer ? `<div class="hof-car">${escHtml([e.car, e.dealer ? 'dipasang oleh ' + e.dealer : ''].filter(Boolean).join(' · '))}</div>` : ''}</div>
      ${e.year ? `<span class="hof-yr">${e.year}</span>` : ''}</div>`;
  const cards = series.map(s => {
    const brand = BRANDS.find(b => b.id === s.brand);
    const prods = hofProducts({ brand: s.brand, line: s.line });
    const items = [...s.items].sort(hofSort);
    const open = hofOpen[s.key];
    const shown = open ? items : items.slice(0, 5);
    const photos = items.filter(e => e.photo);
    const special = s.items.length - s.g - s.s - s.b;
    return `<section class="hof-card" id="${hofDomId(s.key)}">
      <div class="hof-hd">
        ${brand?.logo ? `<img class="hof-logo" src="${brand.logo}" alt="${escHtml(brand.name)}">` : `<span class="hof-bn">${escHtml(brandName(s.brand))}</span>`}
        <div class="hof-ttl"><h3>${escHtml(s.line)}</h3><div class="hof-note">${prods.map(p => escHtml(p.name)).slice(0, 4).join(' · ')}</div></div>
        <div class="hof-pill"><b>${s.items.length}</b><span>PRESTASI</span><span class="hof-ms">${s.g ? hofMedal(1, s.g) : ''}${s.s ? hofMedal(2, s.s) : ''}${s.b ? hofMedal(3, s.b) : ''}${special ? hofMedal(0, special) : ''}</span></div>
      </div>
      <div class="hof-bd">
        <div class="hof-prods"><div class="hof-lbl">Produk di seri ini</div>
          ${prods.map(p => `<button class="hof-prod" onclick="showProduct('${s.brand}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>Lihat produk →</small></span></button>`).join('') || '<div class="hof-meta">—</div>'}
        </div>
        <div class="hof-wins"><div class="hof-lbl">Daftar Prestasi</div>
          ${shown.map(winRow).join('')}
          ${items.length > 5 ? `<button class="hof-more" onclick="hofToggle('${s.key}')">${open ? 'Tampilkan lebih sedikit ▴' : `+ ${items.length - 5} prestasi lainnya ▾`}</button>` : ''}
          ${photos.length ? `<div class="hof-gal">${photos.map(e => `<img src="${e.photo}" alt="${escHtml(e.award)}" loading="lazy">`).join('')}</div>` : ''}
        </div>
      </div>
    </section>`;
  }).join('');

  box.innerHTML = `
    ${hofIsDemo() ? `<div class="sc-demo">DATA CONTOH — HALL_OF_FAME masih kosong. Hanya Editor yang melihat halaman ini; isi dengan data kompetisi asli sebelum dibuka untuk publik.</div>` : ''}
    <div class="hof-stats"><div><b>${list.length}</b><span>Prestasi</span></div><div><b>${events}</b><span>Kompetisi</span></div><div><b>${series.length}</b><span>Seri juara</span></div></div>
    <div class="hof-filters">
      ${brands.length > 1 ? `<span class="hof-flbl">Brand</span>${chip('brand', 'all', 'Semua', hofBrand === 'all')}${brands.map(b => chip('brand', b, brandName(b), hofBrand === b)).join('')}` : ''}
      ${years.length > 1 ? `<span class="hof-flbl">Tahun</span>${chip('year', 'all', 'Semua', hofYear === 'all')}${years.map(y => chip('year', y, y, hofYear === String(y))).join('')}` : ''}
    </div>
    ${series.length ? `
    <div class="hof-h2">Klasemen Prestasi per Seri</div><div class="hof-sub">Diurutkan berdasarkan jumlah prestasi — bukan harga.</div>
    <div class="hof-board"><div class="hof-row head"><span>#</span><span>Seri</span><span class="hof-thumbs"></span><span class="hof-c">${hofMedal(1)}</span><span class="hof-c">${hofMedal(2)}</span><span class="hof-c">${hofMedal(3)}</span><span class="hof-tot">Total</span></div>${board}</div>
    ${cards}` : '<div class="stock-empty">Tidak ada prestasi untuk filter ini.</div>'}`;
}

/* ══════════════════════════════════════════
   GALERI INSTALASI (Supabase: tabel showcase_installs + bucket publik `showcase`)
══════════════════════════════════════════ */
const GL_TABLE = 'showcase_installs', GL_BUCKET = 'showcase';
const GL_MAKES = ['Toyota', 'Honda', 'Mitsubishi', 'Suzuki', 'Daihatsu', 'Nissan', 'Mazda', 'Hyundai', 'Kia', 'Wuling', 'Chery', 'BYD', 'Isuzu', 'Subaru', 'Lexus', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen', 'Porsche', 'Mini', 'Volvo', 'Ford', 'Lainnya'];
const GL_BODIES = ['SUV', 'MPV', 'Sedan', 'Hatchback', 'Double Cabin', 'Coupe', 'Lainnya'];
const GL_AREAS = ['Dasbor', 'Pintu', 'Tweeter', 'Midrange', 'Bagasi / Sub', 'Amplifier', 'DSP', 'Lainnya'];
const SHOWCASE_SQL = `-- Galeri Instalasi (Showcase) — jalankan sekali di Supabase → SQL Editor → Run
create table if not exists public.showcase_installs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  car_make text not null,
  car_model text not null,
  car_year int,
  body text,
  dealer text,
  city text,
  note text,
  products text[] not null default '{}',
  photos jsonb not null default '[]'::jsonb,
  hof_id text,
  published boolean not null default false,
  sort int not null default 0,
  created_by uuid default auth.uid()
);
alter table public.showcase_installs enable row level security;
create policy "showcase read" on public.showcase_installs for select
  using (published or (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase write" on public.showcase_installs for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'))
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
insert into storage.buckets (id, name, public) values ('showcase', 'showcase', true) on conflict (id) do nothing;
create policy "showcase upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase update" on storage.objects for update to authenticated
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));
create policy "showcase delete" on storage.objects for delete to authenticated
  using (bucket_id = 'showcase' and (auth.jwt() -> 'app_metadata' ->> 'role') in ('admin','editor'));`;
let glItems = null, glErr = '', glLoading = null, glMake = 'all', glBody = 'all', glHofOnly = false, glQ = '';
let glEdit = null;   // { id?, …field, photos:[{path?, area, blob?, url}], removed:[path] }

const glUrl = path => supabase ? supabase.storage.from(GL_BUCKET).getPublicUrl(path).data.publicUrl : '';
const glTitle = it => [it.car_make, it.car_model].filter(Boolean).join(' ');
const glProd = pid => findProductAny(pid);
function glCopySql() { (navigator.clipboard?.writeText(SHOWCASE_SQL) || Promise.reject()).then(() => showToast('✓ SQL disalin — tempel di Supabase → SQL Editor → Run.'), () => { prompt('Salin SQL ini:', SHOWCASE_SQL); }); }

function loadGaleri(force) {
  if (!supabase) { glErr = 'Koneksi database belum siap.'; return Promise.resolve(); }
  if (glLoading && !force) return glLoading;
  glLoading = (async () => {
    try {
      const { data, error } = await supabase.from(GL_TABLE).select('*').order('sort', { ascending: true }).order('created_at', { ascending: false });
      if (error) throw error;
      glItems = data || []; glErr = '';
    } catch (e) {
      const m = String(e.message || e);
      glItems = [];
      glErr = /relation|does not exist|schema cache|404|PGRST205/i.test(m) ? 'setup' : 'Galeri tidak bisa dimuat: ' + m;
    }
    glLoading = null;
  })();
  return glLoading;
}
async function openGaleri() {
  if (!scOn()) return;
  showView('galeri');
  document.querySelector('.main')?.scrollTo(0, 0);
  if (!glItems) { renderGaleri(); await loadGaleri(); }
  renderGaleri();
}
function setGlFilter(kind, v) {
  if (kind === 'make') glMake = v; else if (kind === 'body') glBody = v; else if (kind === 'hof') glHofOnly = !glHofOnly;
  renderGaleri();
}
const glCarSvg = '<svg class="gl-car" viewBox="0 0 200 80" fill="none"><path d="M14 58c0-8 4-12 12-13l26-4 22-17c4-3 9-4 14-4h44c6 0 11 2 15 6l18 17 18 3c7 1 11 6 11 12v4H14v-4Z" fill="rgba(255,255,255,.08)" stroke="currentColor" stroke-width="1.6"/><circle cx="54" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/><circle cx="150" cy="64" r="11" fill="#0b0c0e" stroke="currentColor" stroke-width="2"/></svg>';
function glCard(it) {
  const ph = it.photos?.[0];
  const prods = (it.products || []).map(pid => glProd(pid).product?.name).filter(Boolean);
  return `<button class="gl-card" onclick="openGlDetail('${it.id}')">
    <span class="gl-ph">${ph ? `<img src="${glUrl(ph.path)}" alt="${escHtml(glTitle(it))}" loading="lazy">` : glCarSvg}
      ${it.photos?.length ? `<span class="gl-cnt">📷 ${it.photos.length}</span>` : ''}
      ${it.hof_id ? '<span class="gl-tro">🏆 Juara</span>' : ''}
      ${!it.published ? '<span class="gl-draft">DRAF</span>' : ''}</span>
    <span class="gl-bd"><span class="gl-mk">${escHtml(it.car_make || '')}</span>
      <b>${escHtml(it.car_model || '')}${it.car_year ? ` <small>${it.car_year}</small>` : ''}</b>
      ${it.dealer || it.city ? `<span class="gl-dl">🛠 ${escHtml([it.dealer, it.city].filter(Boolean).join(' · '))}</span>` : ''}
      ${prods.length ? `<span class="gl-chips">${prods.slice(0, 4).map(n => `<span>${escHtml(n)}</span>`).join('')}${prods.length > 4 ? `<span>+${prods.length - 4}</span>` : ''}</span>` : ''}
    </span></button>`;
}
function renderGaleri() {
  const box = document.getElementById('gl-body'); if (!box) return;
  const add = isAdmin() ? `<button class="gt-btn confirm" onclick="openGlForm()">＋ Tambah Instalasi</button>` : '';
  document.getElementById('gl-tools').innerHTML = add;
  if (!glItems) { box.innerHTML = '<div class="stock-empty">⏳ Memuat galeri…</div>'; return; }
  if (glErr === 'setup') {
    box.innerHTML = `<div class="vs-warn">Galeri Instalasi belum disiapkan di database. Jalankan SQL ini sekali di Supabase → SQL Editor → Run (membuat tabel <b>showcase_installs</b> + folder foto publik <b>showcase</b>), lalu buka menu ini lagi.<br><br><button class="gt-btn" onclick="glCopySql()">📋 Salin SQL</button></div>`;
    document.getElementById('gl-tools').innerHTML = '';
    return;
  }
  if (glErr) { box.innerHTML = `<div class="vs-warn">${escHtml(glErr)}</div>`; return; }
  const q = normKey(glQ);
  const hay = it => normKey([it.car_make, it.car_model, it.car_year, it.body, it.dealer, it.city, ...(it.products || []).map(pid => glProd(pid).product?.name)].join(' '));
  const base = glItems.filter(it => (!glHofOnly || it.hof_id) && (glBody === 'all' || it.body === glBody) && (!q || hay(it).includes(q)));
  const rows = base.filter(it => glMake === 'all' || it.car_make === glMake);
  const makes = [...new Set(glItems.map(it => it.car_make).filter(Boolean))].sort();
  const bodies = [...new Set(glItems.map(it => it.body).filter(Boolean))];
  const cnt = m => base.filter(it => m === 'all' || it.car_make === m).length;
  box.innerHTML = `
    ${!SHOWCASE_PUBLIC ? '<div class="sc-demo">PRATINJAU EDITOR — menu Showcase belum tampil untuk publik.</div>' : ''}
    <div class="gl-search"><span>🔎</span><input type="search" placeholder="Cari mobil Anda — mis. Fortuner, HR-V, Pajero…" value="${escHtml(glQ)}" oninput="glQ=this.value;clearTimeout(window.glQt);window.glQt=setTimeout(()=>{renderGaleri();const i=document.querySelector('.gl-search input');i?.focus();i?.setSelectionRange(i.value.length,i.value.length)},250)"></div>
    ${glItems.length ? `<div class="gl-makes">${['all', ...makes].map(m => `<button class="gl-make${glMake === m ? ' on' : ''}" onclick="setGlFilter('make','${escHtml(m)}')">${m === 'all' ? 'SEMUA' : escHtml(m.toUpperCase())}<small>${cnt(m)} mobil</small></button>`).join('')}</div>
    <div class="hof-filters">${bodies.length > 1 ? `<button class="filter-chip${glBody === 'all' ? ' active' : ''}" onclick="setGlFilter('body','all')">Semua tipe</button>${bodies.map(b => `<button class="filter-chip${glBody === b ? ' active' : ''}" onclick="setGlFilter('body','${escHtml(b)}')">${escHtml(b)}</button>`).join('')}` : ''}
      ${glItems.some(it => it.hof_id) ? `<button class="filter-chip${glHofOnly ? ' active' : ''}" onclick="setGlFilter('hof')">🏆 Mobil juara</button>` : ''}</div>` : ''}
    ${rows.length ? `<div class="gl-grid">${rows.map(glCard).join('')}</div>`
      : `<div class="stock-empty">${glItems.length ? 'Tidak ada instalasi yang cocok. Coba kata kunci lain.' : 'Belum ada instalasi. ' + (isAdmin() ? 'Tekan <b>＋ Tambah Instalasi</b> untuk menambahkan yang pertama.' : '')}</div>`}`;
}

/* ── Detail instalasi ── */
function glDealer(name) { const n = normKey(name); return n ? AUTH_DEALERS.find(d => normKey(d.n) === n) : null; }
function openGlDetail(id, photoIdx = 0) {
  const it = glItems?.find(x => x.id === id); if (!it) return;
  const ov = document.getElementById('gl-detail');
  const photos = it.photos || [];
  const cur = photos[photoIdx];
  const d = glDealer(it.dealer);
  const hof = it.hof_id ? hofData().find(e => e.id === it.hof_id) : null;
  ov.querySelector('.gl-dbox').innerHTML = `
    <button class="rk-pick-x gl-x" onclick="closeGlDetail()" aria-label="Tutup">✕</button>
    <div class="gl-dgrid">
      <div>
        <div class="gl-big">${cur ? `<img src="${glUrl(cur.path)}" alt="">` : glCarSvg}${cur?.area ? `<span class="gl-area">${escHtml(cur.area)}</span>` : ''}</div>
        ${photos.length > 1 ? `<div class="gl-th">${photos.map((p, i) => `<button class="${i === photoIdx ? 'on' : ''}" onclick="openGlDetail('${it.id}',${i})"><img src="${glUrl(p.path)}" alt="" loading="lazy">${p.area ? `<span>${escHtml(p.area)}</span>` : ''}</button>`).join('')}</div>` : ''}
      </div>
      <div>
        <div class="gl-mk">${escHtml(it.car_make || '')}</div>
        <h3 class="gl-dt">${escHtml(it.car_model || '')}${it.car_year ? ' ' + it.car_year : ''}</h3>
        <div class="gl-tags">${hof ? `<button class="gl-tag g" onclick="closeGlDetail();openHallOfFame('${hofKey(hof.brand, hof.line)}')">🏆 ${escHtml(hof.award)}${hof.cls ? ' · ' + escHtml(hof.cls) : ''}</button>` : ''}${it.body ? `<span class="gl-tag">${escHtml(it.body)}</span>` : ''}${it.city ? `<span class="gl-tag">${escHtml(it.city)}</span>` : ''}${!it.published ? '<span class="gl-tag dr">Draf — belum tampil</span>' : ''}</div>
        ${it.note ? `<p class="gl-note">${escHtml(it.note)}</p>` : ''}
        ${(it.products || []).length ? `<div class="hof-lbl">Produk yang dipasang</div>${it.products.map(pid => { const r = glProd(pid); if (!r.product) return ''; const p = r.product;
          return `<button class="gl-prod" onclick="closeGlDetail();showProduct('${r.brand.id}','${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : `<span class="hof-ph">${p.emoji}</span>`}<span><b>${escHtml(p.name)}</b><small>${escHtml(r.brand.name)}${r.line ? ' · ' + escHtml(r.line) : ''}</small></span><em>Lihat →</em></button>`; }).join('')}` : ''}
        ${it.dealer ? `<div class="gl-dcard"><div class="hof-lbl">Dipasang oleh</div><b>${escHtml(it.dealer)}${d ? ' <span class="ad-badge">✓ Resmi</span>' : ''}</b><div class="gl-dc">${escHtml(d ? [d.c, d.r].join(', ') : it.city || '')}</div>
          ${d ? `<div class="ad-btns">${d.wa ? `<a class="ad-btn wa" href="https://wa.me/${d.wa}?text=${encodeURIComponent(`Halo ${d.n}, saya lihat contoh instalasi ${glTitle(it)} di CAI Hub (Concerto Audio Indonesia). Saya ingin bertanya.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}${d.ig ? `<a class="ad-btn" href="https://www.instagram.com/${encodeURIComponent(d.ig)}/" target="_blank" rel="noopener">Instagram</a>` : ''}<a class="ad-btn" href="${adMaps(d)}" target="_blank" rel="noopener">Maps</a></div>` : ''}</div>` : ''}
        ${isAdmin() ? `<div class="gl-adm"><button class="gt-btn" onclick="closeGlDetail();openGlForm('${it.id}')">✏️ Edit</button><button class="gt-btn ghost gt-del" onclick="deleteGlItem('${it.id}')">🗑 Hapus</button></div>` : ''}
      </div>
    </div>`;
  ov.classList.add('open');
}
function closeGlDetail() { document.getElementById('gl-detail')?.classList.remove('open'); }

/* ── Form tambah / edit (Admin & Editor) ── */
function openGlForm(id) {
  if (!isAdmin()) return;
  const it = id ? glItems?.find(x => x.id === id) : null;
  glEdit = it ? { ...it, products: [...(it.products || [])], photos: (it.photos || []).map(p => ({ ...p, url: glUrl(p.path) })), removed: [] }
    : { car_make: '', car_model: '', car_year: '', body: '', dealer: '', city: '', note: '', products: [], photos: [], hof_id: '', published: false, sort: 0, removed: [] };
  renderGlForm();
  document.getElementById('gl-form').classList.add('open');
}
function closeGlForm() { document.getElementById('gl-form')?.classList.remove('open'); glEdit?.photos.forEach(p => p.blob && URL.revokeObjectURL(p.url)); glEdit = null; }
const glProdLabel = r => `${r.brand.name} · ${r.product.name}`;
function glProdOptions() {
  return BRANDS.flatMap(b => b.lines.flatMap(l => l.products.map(p => `<option value="${escHtml(b.name + ' · ' + p.name)}"></option>`))).join('');
}
function glField(k, v) { if (glEdit) glEdit[k] = v; }
function glPickDealer(v) {
  glField('dealer', v);
  const d = glDealer(v);
  if (d && !glEdit.city) { glEdit.city = d.c; const c = document.getElementById('glf-city'); if (c) c.value = d.c; }
}
function glAddProduct(input) {
  const v = input.value.trim(); if (!v) return;
  for (const b of BRANDS) for (const l of b.lines) for (const p of l.products)
    if (b.name + ' · ' + p.name === v) { if (!glEdit.products.includes(p.id)) glEdit.products.push(p.id); input.value = ''; renderGlProducts(); return; }
}
function glDelProduct(i) { glEdit.products.splice(i, 1); renderGlProducts(); }
function renderGlProducts() {
  const el = document.getElementById('glf-prods'); if (!el) return;
  el.innerHTML = glEdit.products.map((pid, i) => { const r = glProd(pid); return r.product ? `<span class="gl-pchip">${escHtml(glProdLabel(r))}<button onclick="glDelProduct(${i})" aria-label="Hapus">✕</button></span>` : ''; }).join('') || '<span class="gl-hint">Belum ada produk.</span>';
}
// Foto diperkecil di browser (sisi terpanjang 1600 px, WebP/JPEG) sebelum diunggah
function glResize(file, max = 1600) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => b && b.type === 'image/webp' ? res(b) : c.toBlob(j => j ? res(j) : rej(new Error('Gagal memproses foto')), 'image/jpeg', .85), 'image/webp', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('File bukan gambar: ' + file.name)); };
    img.src = url;
  });
}
async function glAddPhotos(input) {
  const files = [...input.files]; input.value = '';
  for (const f of files) {
    try { const blob = await glResize(f); glEdit.photos.push({ blob, url: URL.createObjectURL(blob), area: GL_AREAS[Math.min(glEdit.photos.length, GL_AREAS.length - 1)] }); }
    catch (e) { showToast('⚠ ' + e.message); }
  }
  renderGlPhotos();
}
function glPhotoArea(i, v) { glEdit.photos[i].area = v; }
function glPhotoMove(i, d) { const a = glEdit.photos, j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; renderGlPhotos(); }
function glPhotoDel(i) { const [p] = glEdit.photos.splice(i, 1); if (p.path) glEdit.removed.push(p.path); if (p.blob) URL.revokeObjectURL(p.url); renderGlPhotos(); }
function renderGlPhotos() {
  const el = document.getElementById('glf-photos'); if (!el) return;
  el.innerHTML = glEdit.photos.map((p, i) => `<div class="gl-fph"><img src="${p.url}" alt="">
      <select onchange="glPhotoArea(${i},this.value)">${GL_AREAS.map(a => `<option${a === p.area ? ' selected' : ''}>${a}</option>`).join('')}</select>
      <div class="gl-fpb"><button onclick="glPhotoMove(${i},-1)" title="Geser kiri">◀</button>${i === 0 ? '<span>Utama</span>' : ''}<button onclick="glPhotoMove(${i},1)" title="Geser kanan">▶</button><button onclick="glPhotoDel(${i})" title="Hapus">🗑</button></div></div>`).join('')
    || '<span class="gl-hint">Belum ada foto. Foto pertama = foto utama. Pastikan plat nomor sudah diburamkan.</span>';
}
function renderGlForm() {
  const e = glEdit, box = document.querySelector('#gl-form .gl-fbox');
  const opt = (arr, v) => arr.map(a => `<option${a === v ? ' selected' : ''}>${escHtml(a)}</option>`).join('');
  const hofs = HALL_OF_FAME;
  box.innerHTML = `
    <div class="rk-pick-hd"><div class="rk-pick-t">${e.id ? 'Edit' : 'Tambah'} Instalasi</div><button class="rk-pick-x" onclick="closeGlForm()" aria-label="Tutup">✕</button></div>
    <div class="gl-fgrid">
      <label>Merek mobil<select onchange="glField('car_make',this.value)"><option value="">— pilih —</option>${opt(GL_MAKES, e.car_make)}</select></label>
      <label>Model<input value="${escHtml(e.car_model)}" placeholder="mis. Fortuner VRZ" oninput="glField('car_model',this.value)"></label>
      <label>Tahun<input type="number" min="1980" max="2100" value="${escHtml(e.car_year ?? '')}" oninput="glField('car_year',this.value)"></label>
      <label>Tipe<select onchange="glField('body',this.value)"><option value="">—</option>${opt(GL_BODIES, e.body)}</select></label>
      <label class="w2">Dealer pemasang<input list="glf-dealers" value="${escHtml(e.dealer)}" placeholder="Ketik / pilih dealer resmi" oninput="glPickDealer(this.value)"><datalist id="glf-dealers">${[...new Set(AUTH_DEALERS.map(d => d.n))].map(n => `<option value="${escHtml(n)}"></option>`).join('')}</datalist></label>
      <label>Kota<input id="glf-city" value="${escHtml(e.city)}" oninput="glField('city',this.value)"></label>
      <label>Urutan<input type="number" value="${escHtml(e.sort ?? 0)}" title="Angka kecil tampil lebih dulu" oninput="glField('sort',this.value)"></label>
      <label class="w4">Catatan singkat<textarea rows="2" placeholder="mis. Upgrade full system dengan DSP — vokal jernih, bass rapi." oninput="glField('note',this.value)">${escHtml(e.note)}</textarea></label>
      <div class="w4"><div class="gl-flbl">Produk yang dipasang</div>
        <input list="glf-plist" placeholder="Ketik nama produk lalu pilih…" onchange="glAddProduct(this)"><datalist id="glf-plist">${glProdOptions()}</datalist>
        <div class="gl-pchips" id="glf-prods"></div></div>
      <label class="w2">Prestasi (Hall of Fame)<select onchange="glField('hof_id',this.value)"><option value="">— tidak ada —</option>${hofs.map(h => `<option value="${escHtml(h.id)}"${h.id === e.hof_id ? ' selected' : ''}>${escHtml(`${h.award} · ${h.cls || ''} · ${h.event} ${h.year || ''}`)}</option>`).join('')}</select></label>
      <label class="w2 gl-pub"><input type="checkbox"${e.published ? ' checked' : ''} onchange="glField('published',this.checked)"> Tampilkan (bukan draf)</label>
      <div class="w4"><div class="gl-flbl">Foto <small>(boleh banyak sekaligus; otomatis diperkecil)</small></div>
        <label class="gt-btn gl-up">📷 Tambah Foto<input type="file" accept="image/*" multiple hidden onchange="glAddPhotos(this)"></label>
        <div class="gl-fphotos" id="glf-photos"></div></div>
    </div>
    <div class="gl-factions"><button class="gt-btn ghost" onclick="closeGlForm()">Batal</button><button class="gt-btn confirm" id="glf-save" onclick="saveGlItem()">💾 Simpan</button></div>`;
  renderGlProducts(); renderGlPhotos();
}
async function saveGlItem() {
  const e = glEdit; if (!e || !supabase) return;
  if (!e.car_make || !String(e.car_model || '').trim()) { showToast('⚠ Isi merek & model mobil dulu.'); return; }
  const btn = document.getElementById('glf-save'); btn.disabled = true; btn.textContent = '⏳ Menyimpan…';
  try {
    const row = { car_make: e.car_make, car_model: String(e.car_model).trim(), car_year: e.car_year ? +e.car_year : null, body: e.body || null,
      dealer: (e.dealer || '').trim() || null, city: (e.city || '').trim() || null, note: (e.note || '').trim() || null, products: e.products,
      hof_id: e.hof_id || null, published: !!e.published, sort: +e.sort || 0, updated_at: new Date().toISOString() };
    let id = e.id;
    if (!id) {
      const { data, error } = await supabase.from(GL_TABLE).insert({ ...row, photos: [] }).select('id').single();
      if (error) throw error; id = data.id;
    }
    const photos = [];
    for (let i = 0; i < e.photos.length; i++) {
      const p = e.photos[i];
      if (p.blob) {
        const ext = p.blob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `${id}/${Date.now()}-${i}.${ext}`;
        btn.textContent = `⏳ Mengunggah foto ${i + 1}/${e.photos.length}…`;
        const { error } = await supabase.storage.from(GL_BUCKET).upload(path, p.blob, { contentType: p.blob.type, cacheControl: '31536000', upsert: false });
        if (error) throw error;
        photos.push({ path, area: p.area || '' });
      } else photos.push({ path: p.path, area: p.area || '' });
    }
    const { error } = await supabase.from(GL_TABLE).update({ ...row, photos }).eq('id', id);
    if (error) throw error;
    if (e.removed.length) await supabase.storage.from(GL_BUCKET).remove(e.removed);
    closeGlForm();
    showToast('✓ Instalasi disimpan');
    await loadGaleri(true); renderGaleri(); refreshProductShowcase();
  } catch (err) {
    showToast('⚠ Gagal menyimpan: ' + (err.message || err), 6000);
    btn.disabled = false; btn.textContent = '💾 Simpan';
  }
}
async function deleteGlItem(id) {
  const it = glItems?.find(x => x.id === id); if (!it || !isAdmin()) return;
  if (!confirm(`Hapus instalasi ${glTitle(it)}${it.car_year ? ' ' + it.car_year : ''} beserta fotonya?`)) return;
  try {
    const { error } = await supabase.from(GL_TABLE).delete().eq('id', id);
    if (error) throw error;
    const paths = (it.photos || []).map(p => p.path).filter(Boolean);
    if (paths.length) await supabase.storage.from(GL_BUCKET).remove(paths);
    closeGlDetail(); showToast('✓ Instalasi dihapus');
    await loadGaleri(true); renderGaleri(); refreshProductShowcase();
  } catch (err) { showToast('⚠ Gagal menghapus: ' + (err.message || err), 6000); }
}

/* ══════════════════════════════════════════
   HALAMAN PRODUK — Achievement + Contoh pemasangan (dipanggil showProduct di core.js)
══════════════════════════════════════════ */
let scProduct = null;
function renderProductShowcase(product, lineName, brand) {
  scProduct = { product, lineName, brand };
  const el = document.getElementById('product-showcase'); if (!el) return;
  if (!scOn()) { el.innerHTML = ''; return; }
  const hof = hofForProduct(brand.id, lineName, product.id).sort(hofSort);
  const lineTotal = lineName ? hofLineCount(brand.id, lineName) : 0;
  const key = hofKey(brand.id, lineName || '');
  const ach = hof.length ? `<div class="psc-ach">
      <div class="psc-t">🏆 Achievement — <b>${hof.length} prestasi</b>${lineName && lineTotal ? ` bersama ${escHtml(lineName)}` : ''}${hofIsDemo() ? ' <span class="sc-tag">DATA CONTOH</span>' : ''}</div>
      <ul>${hof.slice(0, 3).map(e => `<li>${hofMedal(e.place)}<span><b>${escHtml(e.award)}${e.cls ? ' · ' + escHtml(e.cls) : ''}</b> — ${escHtml([e.event, e.city, e.year].filter(Boolean).join(' '))}</span></li>`).join('')}</ul>
      <button class="psc-link" onclick="openHallOfFame('${key}')">Lihat semua prestasi di Hall of Fame →</button></div>` : '';
  if (!glItems && !glLoading && supabase) loadGaleri().then(() => { if (scProduct?.product === product) renderProductShowcase(product, lineName, brand); });
  const inst = (glItems || []).filter(it => (it.products || []).includes(product.id));
  const gal = inst.length ? `<div class="psc-gal"><div class="psc-t">🚗 Contoh pemasangan <span>— ${inst.length} mobil memakai produk ini</span></div>
      <div class="gl-grid psc-grid">${inst.slice(0, 4).map(glCard).join('')}</div>
      ${inst.length > 4 ? `<button class="psc-link" onclick="glQ='${escHtml(product.name).replace(/'/g, '')}';openGaleri()">Lihat semua di Galeri Instalasi →</button>` : ''}</div>` : '';
  el.innerHTML = ach + gal;
}
function refreshProductShowcase() {
  if (scProduct && document.getElementById('view-product')?.classList.contains('active')) renderProductShowcase(scProduct.product, scProduct.lineName, scProduct.brand);
}
// Dipanggil updateAuthUI() (stock.js) tiap status login berubah
function scAuthChanged() {
  if (!scOn() && ['view-halloffame', 'view-galeri'].some(id => document.getElementById(id)?.classList.contains('active'))) showView('dashboard');
  glItems = null;   // muat ulang sesuai hak akun baru (draf hanya untuk Admin/Editor)
  refreshProductShowcase();
}
