// Bundles the ES modules + CSS into ONE self-contained HTML file for a
// strict-CSP embed (no external requests). Strips static import/export, keeps
// the dynamic import() in net.js (it fails gracefully offline). Sets the
// LINKMON_TOKENS + LINKMON_OFFLINE flags so sprites become emoji tokens and the
// online button explains itself instead of hanging.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const order = ['rng', 'data', 'engine', 'ai', 'audio', 'ui', 'net', 'main'];

function strip(code) {
  return code
    // drop multi-line and single-line static imports
    .replace(/^import\s+[^;]*?from\s+['"][^'"]+['"];\s*$/gms, '')
    // drop bare side-effect imports
    .replace(/^import\s+['"][^'"]+['"];\s*$/gm, '')
    // turn `export function/const/class` into plain declarations
    .replace(/^export\s+(function|const|let|class|async function)\b/gm, '$1')
    // remove any remaining `export { ... };`
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '');
}

let js = '';
for (const name of order) {
  const src = await readFile(join(ROOT, 'src', `${name}.js`), 'utf8');
  js += `\n/* ===== ${name}.js ===== */\n` + strip(src) + '\n';
}

const css = await readFile(join(ROOT, 'styles.css'), 'utf8');

const html = `<style>
${css}
</style>
<div id="app">
  <div class="screen" style="padding:40px 16px;text-align:center">
    <div class="spinner" style="margin:60px auto"></div>
    <p class="muted">Loading the Arena…</p>
  </div>
</div>
<div id="toasts"></div>
<script>
globalThis.LINKMON_TOKENS = true;   // emoji tokens instead of CDN sprites
globalThis.LINKMON_OFFLINE = true;  // online button explains itself
try {
${js}
} catch (e) {
  document.getElementById('app').innerHTML =
    '<div class="screen" style="padding:40px 16px;text-align:center"><h2>Something broke</h2><pre style="white-space:pre-wrap;color:#ff5d6c">'
    + (e && e.stack || e) + '</pre></div>';
}
</script>
`;

await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', 'linkmon.html'), html);   // fragment for the Artifact host

// Full standalone doc — double-click to play offline, no server, no network.
const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>LINKMON — offline</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%E2%9A%A1%3C/text%3E%3C/svg%3E">
</head>
<body>
${html}
</body>
</html>
`;
await writeFile(join(ROOT, 'linkmon-offline.html'), standalone);
console.log('wrote dist/linkmon.html —', (html.length / 1024).toFixed(1), 'KB');
console.log('wrote linkmon-offline.html (standalone) —', (standalone.length / 1024).toFixed(1), 'KB');
