/* ══════════════════════════════════════════
   QR CODE di browser, tanpa library (6 Nov 2026, Branding no. 7)
   Mode byte (UTF-8), versi 1–40, ECC L/M/Q/H, mask terbaik dipilih otomatis (aturan penalti standar).
   qrMatrix(text, ecl='Q') → { size, dark(x, y) } · qrCanvas(text, px, { ecl, margin, fg, bg }) → <canvas>
   Dipakai: pembuat link & QR promosi + template Story (js/channel.js). Hasil dicek terbaca (OpenCV & segno).
══════════════════════════════════════════ */
const QR_ECC = { L: [1, 0], M: [0, 1], Q: [3, 2], H: [2, 3] };   // [format bits, index tabel]
const QR_EC_CW = [   // kode koreksi per blok [L, M, Q, H][versi]
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]];
const QR_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]];

function qrRawModules(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
}
const qrDataCw = (v, e) => Math.floor(qrRawModules(v) / 8) - QR_EC_CW[e][v] * QR_BLOCKS[e][v];
function qrAlignPos(v) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, out = [6];
  for (let p = v * 4 + 10; out.length < n; p -= step) out.splice(1, 0, p);
  return out;
}
// Reed–Solomon GF(256), polinom 0x11D
function qrMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 255; }
function qrRsDiv(deg) {
  const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
  for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = qrMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = qrMul(root, 2); }
  return r;
}
function qrRsRem(data, div) {
  const r = div.map(() => 0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= qrMul(c, f); }); }
  return r;
}

function qrMatrix(text, ecl = 'Q', forceMask) {
  const [fmtBits, e] = QR_ECC[ecl] || QR_ECC.Q;
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let v = 1;
  for (; v <= 40; v++) { const cc = v < 10 ? 8 : 16; if (4 + cc + bytes.length * 8 <= qrDataCw(v, e) * 8) break; }
  if (v > 40) throw new Error('Teks terlalu panjang untuk QR');
  // bit data: mode byte 0100 + panjang + isi + terminator + padding
  const bits = [], put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
  const cap = qrDataCw(v, e) * 8;
  put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
  for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a << 1 | b, 0));
  // blok + kode koreksi, lalu disisipkan berselang
  const nb = QR_BLOCKS[e][v], ecLen = QR_EC_CW[e][v], raw = Math.floor(qrRawModules(v) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
  const div = qrRsDiv(ecLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1)); k += dat.length;
    const ec = qrRsRem(dat, div); if (i < nShort) dat.push(0); blocks.push(dat.concat(ec));
  }
  const cw = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) cw.push(b[i]); });

  const size = v * 4 + 17, mod = [], fn = [];
  for (let i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = qrAlignPos(v), na = al.length;
  for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = mask => {
    const d = fmtBits << 3 | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = (d << 10 | r) ^ 0x5412, bit = i => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (v >= 7) {
    let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
    const b = v << 12 | r;
    for (let i = 0; i < 18; i++) { const d = ((b >>> i) & 1) !== 0, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, d); set(c, a, d); }
  }
  // isi data zig-zag
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < cw.length * 8) { mod[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const line = get => {   // aturan 1 (deret ≥5) + aturan 3 (pola mirip finder)
      let run = 0, col = false, hist = [0, 0, 0, 0, 0, 0, 0], res = 0;
      const addHist = r => { if (hist[0] === 0) r += size; hist.pop(); hist.unshift(r); };
      const count = () => { const n = hist[1], core = n > 0 && hist[2] === n && hist[3] === n * 3 && hist[4] === n && hist[5] === n; return (core && hist[0] >= n * 4 && hist[6] >= n ? 1 : 0) + (core && hist[6] >= n * 4 && hist[0] >= n ? 1 : 0); };
      for (let k = 0; k < size; k++) {
        const c = get(k);
        if (c === col) { run++; if (run === 5) res += 3; else if (run > 5) res++; }
        else { addHist(run); if (!col) res += count() * 40; col = c; run = 1; }
      }
      // penutup deret
      if (col) { addHist(run); run = 0; }
      run += size; addHist(run); res += count() * 40;
      return res;
    };
    for (let y = 0; y < size; y++) p += line(x => mod[y][x]);
    for (let x = 0; x < size; x++) p += line(y => mod[y][x]);
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) dark++;
    const total = size * size, k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return p + k * 10;
  };
  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) { if (forceMask != null && m !== forceMask) continue; applyMask(m); drawFormat(m); const pp = penalty(); if (pp < bestP) { best = m; bestP = pp; } applyMask(m); }
  applyMask(best); drawFormat(best);
  return { size, version: v, mask: best, dark: (x, y) => x >= 0 && y >= 0 && x < size && y < size && mod[y][x] };
}

// Gambar QR ke canvas (px = lebar total termasuk margin putih); margin dalam modul (standar 4)
function qrCanvas(text, px = 1024, o = {}) {
  const q = qrMatrix(text, o.ecl || 'Q'), m = o.margin == null ? 4 : o.margin, n = q.size + m * 2;
  const cv = o.canvas || document.createElement('canvas'); cv.width = cv.height = px;
  qrDraw(cv.getContext('2d'), q, 0, 0, px, { ...o, margin: m });
  return cv;
}
// Gambar matriks QR di konteks canvas pada kotak (x, y, w) — dipakai juga oleh template Story
function qrDraw(ctx, q, x, y, w, o = {}) {
  const m = o.margin == null ? 4 : o.margin, n = q.size + m * 2, s = w / n;
  ctx.save();
  if (o.bg !== null) { ctx.fillStyle = o.bg || '#fff'; ctx.fillRect(x, y, w, w); }
  ctx.fillStyle = o.fg || '#000';
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) if (q.dark(c, r)) {
    const x0 = Math.round(x + (c + m) * s), y0 = Math.round(y + (r + m) * s);
    ctx.fillRect(x0, y0, Math.round(x + (c + m + 1) * s) - x0, Math.round(y + (r + m + 1) * s) - y0);
  }
  ctx.restore();
}
