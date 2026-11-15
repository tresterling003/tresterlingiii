// Builds dist/: the game for static hosts that won't serve .glb files.
// Models are packed into assets/models.js as base64.  Usage: node tools/build-packed.mjs
import { cpSync, rmSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
rmSync('dist', { recursive: true, force: true });
cpSync('public', 'dist', { recursive: true });
const models = {};
for (const f of readdirSync('dist/assets')) {
  if (!f.endsWith('.glb')) continue;
  models[f.slice(0, -4)] = readFileSync(`dist/assets/${f}`).toString('base64');
  rmSync(`dist/assets/${f}`);
}
writeFileSync('dist/assets/models.js', `export default ${JSON.stringify(models)};\n`);
const html = readFileSync('dist/index.html', 'utf8').replace('<script src="game.js">', '<script>window.HOLLOWMOON_PACKED = true;</script>\n<script src="game.js">');
writeFileSync('dist/index.html', html);
