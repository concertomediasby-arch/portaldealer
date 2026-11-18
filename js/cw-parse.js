/* Concerto Way — pengenal teks WA (dipakai portal js/cway.js DAN CAI Hub Studio /studio/). Fungsi murni, tanpa DOM. */
const cwPlain = s => String(s || '').replace(/[*_~]/g, '');

/* ── Teks WA → struktur postingan ──
   Pola contoh pemilik: CONCERTO WAY · DAY n · <SERI: …> · judul (+ subjudul) · paragraf … · "Resume hari ini:" · "Tugas Hari Ini" · penutup.
   Bagian yang tak dikenali tetap tampil sebagai paragraf biasa. */
function cwParse(raw) {
  const L = String(raw || '').replace(/\r/g, '').split('\n').map(s => s.trim());
  let i = 0; const skip = () => { while (i < L.length && !L[i]) i++; };
  const out = { day: null, series: '', title: '', subtitle: '', blocks: [] };
  skip(); if (/^\*?concerto\s*way\*?$/i.test(L[i] || '')) { i++; skip(); }
  const d = /^\*?day\s*(\d+)/i.exec(L[i] || ''); if (d) { out.day = +d[1]; i++; skip(); }
  if (/^\*?[A-Z][A-Z0-9 &]{1,24}:\s*\S/.test(L[i] || '')) { out.series = cwPlain(L[i]); i++; skip(); }
  const head = []; while (i < L.length && L[i]) head.push(L[i++]);
  out.title = cwPlain(head[0] || ''); out.subtitle = cwPlain(head.slice(1).join(' '));
  const paras = []; let cur = [];
  for (; i <= L.length; i++) { const s = L[i]; if (s) cur.push(s); else if (cur.length) { paras.push(cur); cur = []; } }
  for (let k = 0; k < paras.length; k++) {
    const p = paras[k], t = p.join(' '), h = cwPlain(p[0]);
    if (/^resume hari ini\s*:?$/i.test(h)) { out.blocks.push({ t: 'resume', v: p.length > 1 ? p.slice(1).join(' ') : (paras[++k] || []).join(' ') }); continue; }
    if (/^resume hari ini\s*:/i.test(h)) { out.blocks.push({ t: 'resume', v: t.replace(/^\W*resume hari ini\s*:\s*/i, '') }); continue; }
    if (/^tugas hari ini\s*:?$/i.test(h)) { out.blocks.push({ t: 'task', v: p.length > 1 ? p.slice(1) : (paras[++k] || []) }); continue; }
    if (/^\d+([.,]\d+)?\s?%/.test(t)) {
      const last = out.blocks[out.blocks.length - 1], st = { n: t.match(/^\S+/)[0], v: t.replace(/^\S+\s*/, '') };
      if (last?.t === 'stats') last.v.push(st); else out.blocks.push({ t: 'stats', v: [st] });
      continue;
    }
    if (/^sumber\s*:/i.test(h)) { out.blocks.push({ t: 'src', v: t }); continue; }
    out.blocks.push({ t: k === paras.length - 1 && paras.length > 2 ? 'close' : 'p', v: p });
  }
  return out;
}
