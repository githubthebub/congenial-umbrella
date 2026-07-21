/* build.js — inline js/*.js into index.html to produce the single-file play.html.
 * Run: node build.js                                                          */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const files = ['data', 'engine', 'ai', 'ui'].map((n) => fs.readFileSync(path.join(dir, 'js', n + '.js'), 'utf8'));

// Safety: a literal closing script tag in a source file would break inlining.
files.forEach((f, i) => { if (/<\/script>/i.test(f)) throw new Error('closing </script> found in source ' + i); });

const inlined = files.map((f) => '<script>\n' + f + '\n</script>').join('\n');
const scriptBlockRe = /<script src="js\/data\.js"><\/script>[\s\S]*?<script src="js\/ui\.js"><\/script>/;
if (!scriptBlockRe.test(html)) throw new Error('external <script src> block not found in index.html');

const standalone = html.replace(scriptBlockRe, inlined);
fs.writeFileSync(path.join(dir, 'play.html'), standalone);
console.log('Wrote play.html (' + standalone.length + ' bytes) — open it in any browser to play.');
