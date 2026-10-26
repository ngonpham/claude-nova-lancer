// Build script: bundles a game's main.js (with three.js) into a single self-contained HTML file.
//   node tools/build.mjs              → minified build of NOVA LANCER (src/)
//   node tools/build.mjs --game=asia  → minified build of SKYLINE ASIA (asia/src/)
//   node tools/build.mjs --game=pandora → minified build of PANDORA RIDERS (pandora/src/)
//   add --dev   → unminified build with inline sourcemap (for debugging)
//   add --watch → dev build, rebuilds on change
//
// Outputs
//   NOVA LANCER   index.html, dist/nova-lancer.html
//   SKYLINE ASIA  asia/index.html, dist/skyline-asia.html
//   PANDORA RIDERS pandora/index.html, dist/pandora-riders.html
//   (the dist/ file is the same page without the <html>/<head>/<body> wrapper, for hosting as an Artifact)
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const GAMES = {
  nova: { src: 'src', out: 'index.html', fragment: 'nova-lancer.html', lang: 'ja' },
  asia: { src: path.join('asia', 'src'), out: path.join('asia', 'index.html'), fragment: 'skyline-asia.html', lang: 'vi' },
  pandora: { src: path.join('pandora', 'src'), out: path.join('pandora', 'index.html'), fragment: 'pandora-riders.html', lang: 'vi' },
};
const gameArg = (process.argv.find(a => a.startsWith('--game=')) || '--game=nova').slice(7);
const GAME = GAMES[gameArg];
if (!GAME) { console.error(`[build] unknown game "${gameArg}" (expected: ${Object.keys(GAMES).join(', ')})`); process.exit(1); }
const SRC = path.join(root, GAME.src);
const TEMPLATE = path.join(SRC, 'template.html');
const OUT_FULL = path.join(root, GAME.out);
const OUT_FRAGMENT = path.join(root, 'dist', GAME.fragment);

function writeHtml(js) {
  const tpl = fs.readFileSync(TEMPLATE, 'utf8');
  const [head, body] = tpl.split('<!-- @@BODY@@ -->');
  if (body === undefined) throw new Error('template.html is missing the <!-- @@BODY@@ --> marker');
  const safeJs = js.replace(/<\/script/gi, '<\\/script');
  const bodyWithScript = body.replace('<!-- @@SCRIPT@@ -->', () => `<script>\n${safeJs}\n</script>`);
  const full =
    `<!doctype html>\n<html lang="${GAME.lang}">\n<head>\n<meta charset="utf-8">\n` +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' +
    head.trim() + '\n</head>\n<body>\n' + bodyWithScript.trim() + '\n</body>\n</html>\n';
  const fragment = head.trim() + '\n' + bodyWithScript.trim() + '\n';
  fs.mkdirSync(path.dirname(OUT_FRAGMENT), { recursive: true });
  fs.writeFileSync(OUT_FULL, full);
  fs.writeFileSync(OUT_FRAGMENT, fragment);
  const kb = (Buffer.byteLength(full) / 1024).toFixed(0);
  console.log(`[build] ${new Date().toLocaleTimeString()}  ${GAME.out} ${kb} KB${dev ? ' (dev)' : ''}`);
}

const options = {
  entryPoints: [path.join(SRC, 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'eof',
  write: false,
  logLevel: 'warning',
  define: { __DEV__: dev ? 'true' : 'false' },
  plugins: [{
    name: 'html-writer',
    setup(build) {
      build.onEnd(result => {
        if (result.errors.length) return;
        try { writeHtml(result.outputFiles[0].text); } catch (e) { console.error(e); }
      });
    },
  }],
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  fs.watch(TEMPLATE, () => ctx.rebuild().catch(() => {}));
  console.log(`[build] watching ${GAME.src}/ …`);
} else {
  const result = await esbuild.build(options);
  if (result.errors.length) process.exit(1);
}
