// Production server: serves the built app from ../dist and the AI API from the same origin.
// Usage: npm run build && npm start      (reads .env if present; PORT defaults to 8787)
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from './api.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
// Minimal .env loader (no dependency). Existing environment variables win.
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const dist = join(root, 'dist');
const api = createApiHandler(process.env);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/')) return api(req, res);
  let p = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  let file = join(dist, p);
  try {
    if (!file.startsWith(dist) || !(await stat(file)).isFile()) file = join(dist, 'index.html');
  } catch { file = join(dist, 'index.html'); }
  try {
    const data = await readFile(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    if (file.includes(`${join(dist, 'assets')}`)) res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    res.end(data);
  } catch {
    res.statusCode = 500;
    res.end('PosePilot has not been built yet. Run "npm run build" first.');
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => console.log(`PosePilot running at http://localhost:${port}`));
