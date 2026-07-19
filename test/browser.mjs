// End-to-end browser smoke test using playwright-core + bundled Chromium.
// Serves the static site and drives the real UI: Quick Battle to completion,
// then a Solo Raid, collecting any console errors / page exceptions.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 8099;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(PORT, r));

const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 } });

const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

const log = (...a) => console.log('  ', ...a);
let step = 'load';
try {
  await page.goto(`http://localhost:${PORT}/?turbo`, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
  // dismiss first-run welcome modal if present
  await page.waitForTimeout(900);
  const enter = page.locator('button', { hasText: 'Enter the Arena' });
  if (await enter.count()) { await enter.first().click(); log('dismissed welcome'); }

  await page.waitForSelector('.hero-title', { timeout: 8000 });
  log('home rendered');

  // --- QUICK BATTLE ---
  step = 'quick-battle';
  await page.locator('.big-cta', { hasText: 'Quick Battle' }).click();
  await page.waitForSelector('.pick-grid', { timeout: 8000 });
  log('team select shown');
  await page.locator('.preset-chip').first().click();          // pick a preset squad
  await page.locator('.primary-btn.wide', { hasText: 'Find opponent' }).click();
  await page.waitForSelector('.battle-root .field', { timeout: 8000 });
  log('battle scene built');

  // play the battle: keep tapping the first enabled move / forced-switch until a result
  let guard = 0;
  while (guard++ < 160) {
    if (await page.locator('.result-card').count()) break;
    // forced-switch modal? (force past the entrance animation)
    if (await page.locator('.modal .switch-card:not(.fainted)').count()) {
      await page.waitForTimeout(280);
      await page.locator('.modal .switch-card:not(.fainted)').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(200); continue;
    }
    const mv = page.locator('.moves .move-btn:not(.disabled)');
    if (await mv.count()) { await mv.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(120); continue; }
    await page.waitForTimeout(120);
  }
  const res = await page.locator('.result-h').first().textContent().catch(() => null);
  if (!res) throw new Error('Quick Battle never reached a result (guard=' + guard + ')');
  log('quick battle result:', JSON.stringify(res), 'after ~' + guard + ' polls');

  // --- SOLO RAID ---
  step = 'raid';
  await page.locator('.result-actions .ghost-btn', { hasText: 'Home' }).click();
  await page.waitForSelector('.hero-title', { timeout: 6000 });
  await page.locator('.big-cta', { hasText: 'Co-op Raid' }).click();
  await page.waitForSelector('.boss-card', { timeout: 6000 });
  await page.locator('.boss-card').first().click();            // choose boss
  await page.waitForSelector('.pick-card', { timeout: 6000 });
  await page.locator('.pick-card').first().click();            // choose your raider
  await page.waitForSelector('.layout-raid .field', { timeout: 8000 });
  log('raid scene built');
  guard = 0;
  while (guard++ < 260) {
    if (await page.locator('.result-card').count()) break;
    const mv = page.locator('.moves .move-btn:not(.disabled)');
    if (await mv.count()) { await mv.first().click({ force: true }).catch(() => {}); await page.waitForTimeout(100); continue; }
    await page.waitForTimeout(100);
  }
  const raidRes = await page.locator('.result-h').first().textContent().catch(() => null);
  if (!raidRes) throw new Error('Raid never reached a result (guard=' + guard + ')');
  log('raid result:', JSON.stringify(raidRes));

  // screenshot the raid result for the record
  await page.screenshot({ path: join(ROOT, 'test', 'shot-result.png') });

} catch (e) {
  errors.push('FLOW FAILURE @' + step + ': ' + e.message);
}

await browser.close();
server.close();

// sprite 404s from the CDN are expected in a sandbox; ignore image/network noise
const real = errors.filter(e => !/Failed to load resource|net::ERR|status of 40|status of 50/i.test(e));
console.log('\n' + '='.repeat(46));
if (real.length) { console.log('  BROWSER ERRORS:'); real.forEach(e => console.log('   ✗', e)); console.log('='.repeat(46)); process.exit(1); }
console.log('  ✓ Browser smoke test passed — no JS errors');
console.log('='.repeat(46));
process.exit(0);
