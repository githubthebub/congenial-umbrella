/* Browser regression pass for Hookline.
 *
 *   npx serve . -l 8137          # or any static server on :8137
 *   node test/regression.js
 *
 * Needs Playwright and a Chromium build. Exits non-zero on any failure.
 */
const path = require('path');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  ({ chromium } = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')));
}

const BASE = process.env.BASE || 'http://127.0.0.1:8137/index.html';
let failed = 0;
const assert = (cond, msg) => {
  if (!cond) failed++;
  console.log((cond ? 'PASS' : 'FAIL') + '  ' + msg);
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 940 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE);
  await page.waitForTimeout(700);

  /* ── free tier ─────────────────────────────────────── */
  assert(await page.$eval('#planBadge', e => e.textContent) === 'Free', 'starts on Free');
  assert((await page.$$('.tpl.locked')).length === 5, '5 templates locked on Free');
  assert(await page.$eval('#genVariants', e => e.closest('[data-pro-feature]').classList.contains('is-locked')),
    'hook rewrites locked on Free');

  await page.click('.tab[data-view="carousel"]');
  await page.waitForTimeout(300);

  while (parseInt(await page.$eval('#slideCount', e => e.textContent), 10) < 8) {
    await page.click('#addSlide');
    await page.waitForTimeout(80);
  }
  assert((await page.$eval('#slideCount', e => e.textContent)).startsWith('8'), 'free cap holds at 8 slides');
  await page.click('#addSlide');
  await page.waitForTimeout(200);
  assert((await page.$eval('#slideCount', e => e.textContent)).startsWith('8'), 'the 9th add is refused');
  assert(await page.$eval('#upgrade', e => !e.hidden), 'hitting the cap opens the pricing');
  await page.click('#closeUpgrade');
  await page.waitForTimeout(150);
  await page.click('#addSlide');
  await page.waitForTimeout(200);
  assert(await page.$eval('#upgrade', e => e.hidden), 'pricing does not reopen straight away');

  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#exportPdf');
  const file = await dl;
  assert(file.suggestedFilename().endsWith('.pdf'), 'free tier exports a PDF');

  /* ── pro tier ──────────────────────────────────────── */
  await page.click('#openUpgrade');
  await page.click('#startPro');
  await page.waitForTimeout(500);
  assert(await page.$eval('#planBadge', e => e.textContent) === 'Pro', 'upgrades to Pro');
  assert((await page.$$('.tpl.locked')).length === 0, 'all templates unlock');
  assert(await page.$eval('#proBanner', e => !e.hidden), 'pro preview banner shows');

  await page.click('#addSlide');
  await page.waitForTimeout(150);
  assert((await page.$eval('#slideCount', e => e.textContent)).startsWith('9'), 'pro passes the 8-slide cap');

  await page.fill('#bHandle', 'acme.co');
  await page.evaluate(() => {
    const i = document.getElementById('bAccent');
    i.value = '#FF3366';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => {
    const c = document.getElementById('stage');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 80 && d[i + 2] < 130) return true;
    }
    return false;
  }), 'brand accent reaches the canvas');

  /* ── persistence ───────────────────────────────────── */
  await page.reload();
  await page.waitForTimeout(700);
  assert(await page.$eval('#planBadge', e => e.textContent) === 'Pro', 'plan survives a reload');
  await page.click('.tab[data-view="carousel"]');
  await page.waitForTimeout(300);
  assert((await page.$eval('#slideCount', e => e.textContent)).startsWith('9'), 'deck survives a reload');

  await page.click('#exitPro');
  await page.waitForTimeout(400);
  assert(await page.$eval('#planBadge', e => e.textContent) === 'Free', 'can drop back to Free');
  assert((await page.$$('.tpl.locked')).length === 5, 'templates re-lock');

  /* ── Unicode formatting round-trip ─────────────────── */
  await page.click('.tab[data-view="composer"]');
  await page.fill('#editor', 'Bold this line please');
  await page.evaluate(() => {
    const t = document.getElementById('editor');
    t.focus(); t.setSelectionRange(0, 4);
  });
  await page.click('.tbtn[data-fmt="bold"]');
  await page.waitForTimeout(100);
  assert(await page.$eval('#editor', e => e.value) !== 'Bold this line please', 'bold applies');
  await page.evaluate(() => {
    const t = document.getElementById('editor');
    t.focus(); t.setSelectionRange(0, t.value.length);
  });
  await page.click('.tbtn[data-fmt="plain"]');
  await page.waitForTimeout(100);
  assert(await page.$eval('#editor', e => e.value) === 'Bold this line please', 'Clean restores plain ASCII');

  assert(errors.length === 0, 'no console errors (' + (errors.join(' | ') || 'clean') + ')');

  await browser.close();
  console.log(failed ? '\n' + failed + ' failing' : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
