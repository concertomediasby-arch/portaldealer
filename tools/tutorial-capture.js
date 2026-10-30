// Render tutorial-homescreen.html jadi frame JPEG (1080×1920, 30 fps) lewat seek(t).
// Jalankan dari akar repo dengan server statis di :8765 → frame di tut/frames/, lalu gabung dengan ffmpeg (lihat CLAUDE.md).
const { chromium } = require('playwright');
const fs = require('fs');
const FPS = 30, WORKERS = 3, OUT = process.argv[2] || 'tut/frames';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  let DUR = 0;
  const work = async (w) => {
    const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.goto('http://localhost:8765/tutorial-homescreen.html?seek'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
    DUR = await p.evaluate(() => DUR);
    const TOTAL = Math.round(FPS * DUR);
    for (let f = w; f < TOTAL; f += WORKERS) {
      await p.evaluate(t => seek(t), f / FPS);
      await p.screenshot({ path: `${OUT}/f_${String(f).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 });
    }
    await p.close();
  };
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => work(i)));
  await b.close(); console.log('done');
})();
