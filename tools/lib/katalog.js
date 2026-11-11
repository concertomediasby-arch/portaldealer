/* CAI Hub — memuat katalog untuk skrip Node: katalog.js + katalog-edit.js (produk dari form Kelola Katalog portal)
   digabung lewat js/katalog-apply.js (logika sama dengan portal). Dipakai gen-share-pages, gen-seo-pages, cars-data. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '../..');
module.exports = function loadKatalog(ctx = {}) {
  if (!vm.isContext(ctx)) vm.createContext(ctx);
  const read = f => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };
  vm.runInContext(read('katalog.js') + '\n;' + read('katalog-edit.js') + '\n;' + read('js/katalog-apply.js') +
    '\n;katalogApply(BRANDS, STOCK_ALIASES, RECENT_UPDATES, typeof KATALOG_EDIT !== "undefined" ? KATALOG_EDIT : null);' +
    'this.BRANDS=BRANDS;this.STOCK_ALIASES=STOCK_ALIASES;this.RECENT_UPDATES=RECENT_UPDATES;this.HALL_OF_FAME=typeof HALL_OF_FAME!=="undefined"?HALL_OF_FAME:[];', ctx);
  return ctx;
};
