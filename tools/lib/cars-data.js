/* CAI Hub — data "Cari per Mobil" & "Profil Partner" untuk skrip Node (Tahap 8 B, 4 Nov 2026).
   Logika SAMA dengan carList()/pfData() di js/cars.js — alias nama mobil (CAR_ALIAS, CAR_LABEL), daftar merek (GL_MAKES)
   dan alias nama partner Hall of Fame (HOF_DEALER_ALIAS) dibaca langsung dari file portal, jadi cukup diubah di sana.
   Dipakai tools/gen-live-cards.js (kartu WA /m/ & /pp/) dan tools/gen-seo-pages.js (halaman Google /mobil/ & profil di /partner/). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const lit = (src, name) => { const m = src.match(new RegExp(`const ${name} = ([\\[{][\\s\\S]*?[\\]}]);`)); return m ? vm.runInNewContext('(' + m[1] + ')') : null; };
const carsJs = read('js/cars.js'), scJs = read('js/showcase.js');
const CAR_ALIAS = lit(carsJs, 'CAR_ALIAS') || {}, CAR_LABEL = lit(carsJs, 'CAR_LABEL') || {};
const GL_MAKES = lit(scJs, 'GL_MAKES') || [], HOF_DEALER_ALIAS = lit(scJs, 'HOF_DEALER_ALIAS') || {};
const ctx = {}; vm.createContext(ctx);
vm.runInContext(read('katalog.js') + ';this.BRANDS=BRANDS;this.HALL_OF_FAME=typeof HALL_OF_FAME!=="undefined"?HALL_OF_FAME:[];', ctx);
const { BRANDS } = ctx;
// HOF_ON / CARS_ON di js/core.js (5 Nov 2026: Hall of Fame & Cari per Mobil disembunyikan) — false = data Hall of Fame tidak dipakai di halaman Google/kartu WA
const coreJs = read('js/core.js');
const HOF_ON = !/const HOF_ON\s*=\s*false/.test(coreJs), CARS_ON = !/CARS_ON\s*=\s*false/.test(coreJs);
const HALL_OF_FAME = HOF_ON ? ctx.HALL_OF_FAME : [];

const normKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const shareSlug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const carNorm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const carKey = (make, model) => { const k = carNorm(make) + '|' + carNorm(model); return CAR_ALIAS[k] || k; };
function carSplit(txt) {
  const t = String(txt || '').trim(); if (!t) return null;
  const mk = [...GL_MAKES].sort((a, b) => b.length - a.length).find(m => t.toLowerCase().startsWith(m.toLowerCase() + ' ') || t.toLowerCase() === m.toLowerCase());
  if (mk) return { make: mk, model: t.slice(mk.length).trim() };
  const i = t.indexOf(' '); return i < 0 ? { make: t, model: '' } : { make: t.slice(0, i), model: t.slice(i + 1) };
}
const hofCarKey = e => normKey([e.name, e.car, e.dealer].join('|'));
const isEv = b => /listrik|hybrid|\bev\b/i.test(b || '');
const prod = id => { for (const b of BRANDS) for (const l of b.lines) for (const p of l.products) if (p.id === id) return { b, l, p }; return null; };

// gallery = baris showcase_installs yang tayang · partners = [{ r, n, c, a, wa, ig, map }]
function build(gallery, partners) {
  const partnerOf = name => { const k = normKey(name || ''); if (!k) return null; const n = normKey(HOF_DEALER_ALIAS[k] || name); return partners.find(d => normKey(d.n) === n) || null; };
  const map = new Map(), names = new Map();
  const get = (make, model) => {
    const key = carKey(make, model);
    if (!map.has(key)) map.set(key, { key, make, body: '', ev: false, gl: [], hof: [], dealers: new Set() });
    const nm = `${make} ${model}`.trim(), cur = names.get(key); if (!cur || nm.length > cur.length) names.set(key, nm);
    return map.get(key);
  };
  for (const g of gallery) { if (!g.car_make) continue; const c = get(g.car_make, g.car_model || ''); c.gl.push(g); if (!c.body) c.body = g.body || ''; if (isEv(g.body)) c.ev = true; if (g.dealer) c.dealers.add(g.dealer); }
  for (const e of HALL_OF_FAME) { const s = carSplit(e.car); if (!s) continue; const c = get(s.make, s.model); c.hof.push(e); if (e.dealer) c.dealers.add(e.dealer); }
  const cars = [...map.values()].map(c => {
    const linked = new Set(c.gl.filter(g => g.hof_id).map(g => { const e = HALL_OF_FAME.find(x => x.id === g.hof_id); return e ? hofCarKey(e) : ''; }).filter(Boolean));
    const hofCars = new Set(c.hof.map(hofCarKey).filter(k => !linked.has(k)));
    const name = CAR_LABEL[c.key] || names.get(c.key);
    const partnersL = [...new Map([...c.dealers].map(n => { const d = partnerOf(n); return [d ? d.n : n, d || { n }]; })).values()];
    // perangkat: dihitung per mobil (Galeri + prestasi berdaftar perangkat; daftar identik sekali)
    const sets = new Map(); for (const x of [...c.gl, ...c.hof]) if ((x.products || []).length) sets.set([...x.products].sort().join(','), x.products);
    const cnt = new Map(); for (const ps of sets.values()) for (const id of new Set(ps)) if (prod(id)) cnt.set(id, (cnt.get(id) || 0) + 1);
    return { ...c, name, slug: shareSlug(name), cars: c.gl.length + hofCars.size, partners: partnersL, wins: c.hof.length, j1: c.hof.filter(e => e.place === 1).length,
      products: [...cnt.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]), hof: [...c.hof].sort((a, b) => (a.place || 9) - (b.place || 9)) };
  }).sort((a, b) => b.wins - a.wins || b.cars - a.cars || b.gl.length - a.gl.length || a.name.localeCompare(b.name));
  const partnerData = d => {
    const own = n => { const x = partnerOf(n); return x ? normKey(x.n) === normKey(d.n) : normKey(n || '') === normKey(d.n); };
    const gl = gallery.filter(g => own(g.dealer)), hof = HALL_OF_FAME.filter(e => own(e.dealer)).sort((a, b) => (a.place || 9) - (b.place || 9));
    const carKeys = new Set([...gl.map(g => carKey(g.car_make, g.car_model)), ...hof.map(e => { const s = carSplit(e.car); return s ? carKey(s.make, s.model) : ''; }).filter(Boolean)]);
    return { gl, hof, j1: hof.filter(e => e.place === 1).length, cars: cars.filter(c => carKeys.has(c.key)) };
  };
  return { cars, partnerData, partnerOf };
}
module.exports = { build, prod, shareSlug, normKey, carSplit, carKey, hofCarKey, BRANDS, HALL_OF_FAME, HOF_ON, CARS_ON };
