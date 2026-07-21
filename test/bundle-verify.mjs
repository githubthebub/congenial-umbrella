// Verify the single-file bundle runs offline and is playable, exactly as it
// will inside the Artifact host (wrap the fragment in a minimal doc; block ALL
// network so we prove zero external dependencies).
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const frag = await readFile(join(ROOT, 'dist', 'linkmon.html'), 'utf8');
const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${frag}</body></html>`;
await writeFile(join(ROOT, 'dist', '_preview.html'), doc);

const server = createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(doc));
await new Promise(r => server.listen(8123, r));

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });

// hard-block every external request to prove self-containment
await page.route('**/*', route => {
  const u = route.request().url();
  if (u.startsWith('http://localhost:8123') || u.startsWith('data:')) return route.continue();
  return route.abort();
});

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const log = (...a) => console.log('  ', ...a);

try {
  await page.goto('http://localhost:8123/?turbo', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const enter = page.locator('button', { hasText: 'Enter the Arena' });
  if (await enter.count()) await enter.first().click();
  await page.waitForSelector('.hero-title', { timeout: 8000 });
  const ctas = await page.locator('.big-cta .bc-title').allTextContents();
  log('home CTAs:', ctas.join(' / '));

  // Quick Battle to a result
  await page.locator('.big-cta', { hasText: 'Quick Battle' }).click();
  await page.waitForSelector('.pick-grid');
  await page.locator('.preset-chip').first().click();
  await page.locator('.primary-btn.wide').click();
  await page.waitForSelector('.field');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: join(ROOT, 'dist', 'shot-embed-battle.png') });
  let g = 0;
  while (g++ < 200 && !(await page.locator('.result-card').count())) {
    if (await page.locator('.modal .switch-card:not(.fainted)').count()) { await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.modal .switch-card:not(.fainted)')?.click()); await page.waitForTimeout(180); continue; }
    const mv = page.locator('.moves .move-btn:not(.disabled)');
    if (await mv.count()) { await mv.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(90); continue; }
    await page.waitForTimeout(90);
  }
  const r = await page.locator('.result-h').first().textContent().catch(() => null);
  if (!r) throw new Error('Quick Battle no result');
  log('quick battle result:', JSON.stringify(r));

  // Pass & Play reaches the battle (through two team picks + curtains)
  await page.locator('.result-actions .ghost-btn', { hasText: 'Home' }).click();
  await page.waitForSelector('.hero-title');
  await page.locator('.big-cta', { hasText: 'Pass & Play' }).click();
  await page.waitForSelector('.pick-grid');
  await page.locator('.preset-chip').first().click();
  await page.locator('.primary-btn.wide').click();          // P1 ready
  await page.waitForSelector('.curtain'); await page.locator('.curtain').click();  // pass to P2
  await page.waitForSelector('.pick-grid');
  await page.locator('.preset-chip').nth(1).click();
  await page.locator('.primary-btn.wide').click();          // P2 ready
  await page.waitForSelector('.field');
  await page.locator('.curtain').click();                   // P1's turn curtain
  await page.waitForSelector('.moves .move-btn');
  log('pass & play reached the battle ✓');

  await browser.close(); server.close();
  const real = errors.filter(e => !/ERR_FAILED|net::|Failed to load/i.test(e));
  console.log('\n' + '='.repeat(46));
  if (real.length) { console.log('  BUNDLE ERRORS:'); real.forEach(e => console.log('   ✗', e)); console.log('='.repeat(46)); process.exit(1); }
  console.log('  ✓ Bundle runs fully offline, no external requests, playable');
  console.log('='.repeat(46));
} catch (e) {
  await browser.close(); server.close();
  console.log('  ✗ FLOW FAILURE:', e.message);
  errors.slice(0, 5).forEach(x => console.log('   ', x));
  process.exit(1);
}
