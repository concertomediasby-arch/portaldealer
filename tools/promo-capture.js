const { chromium } = require('playwright');
const FPS = 30, DUR = 40, TOTAL = FPS * DUR, WORKERS = 3;
(async () => {
  const b = await chromium.launch();
  const work = async (w) => {
    const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto('http://localhost:8765/promo40.html?seek'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    for (let f = w; f < TOTAL; f += WORKERS) {
      await p.evaluate(t => seek(t), f / FPS);
      await p.screenshot({ path: `promo/frames/f_${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    await p.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => work(i)));
  await b.close(); console.log('done');
})();
