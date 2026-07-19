import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname, PORT = 8110;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) return res.writeHead(403).end();
    res.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' }).end(await readFile(f));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(PORT, r));
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2 });
const shot = (n) => page.screenshot({ path: join(ROOT, 'test', n) });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const enter = page.locator('button', { hasText: 'Enter the Arena' }); if (await enter.count()) await enter.first().click();
await page.waitForSelector('.hero-title'); await page.waitForTimeout(400);
await shot('shot-home.png'); console.log('home ✓');

await page.locator('.big-cta', { hasText: 'Quick Battle' }).click();
await page.waitForSelector('.pick-grid'); await page.locator('.preset-chip').first().click(); await page.waitForTimeout(700);
await shot('shot-team.png'); console.log('team ✓');

await page.locator('.primary-btn.wide', { hasText: 'Find opponent' }).click();
await page.waitForSelector('.field'); await page.waitForTimeout(1600);
await shot('shot-battle.png'); console.log('battle ✓');

// take a move to catch mid-animation juice
const mv = page.locator('.moves .move-btn:not(.disabled)'); if (await mv.count()) await mv.first().click({ force: true });
await page.waitForTimeout(500); await shot('shot-battle-hit.png'); console.log('battle-hit ✓');

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(500);
await page.locator('.big-cta', { hasText: 'Co-op Raid' }).click(); await page.waitForSelector('.boss-card'); await page.waitForTimeout(700);
await shot('shot-raid-setup.png'); console.log('raid-setup ✓');

await browser.close(); server.close(); process.exit(0);
