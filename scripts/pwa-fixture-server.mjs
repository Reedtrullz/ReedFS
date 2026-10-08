import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { URL } from 'node:url';

const roots = [resolve('dist/pwa-v1'), resolve('dist/pwa-v2')];
let active = 0;
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1:5174').pathname;
  if (request.method === 'POST' && ['/__fixture/version/1', '/__fixture/version/2'].includes(pathname)) {
    active = pathname.endsWith('/2') ? 1 : 0; response.writeHead(204); response.end(); return;
  }
  const suffix = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1);
  // Simulate retained immutable CDN assets, while HTML/SW always use the active version.
  const candidates = pathname.startsWith('/assets/') ? [roots[active], roots[1 - active]] : [roots[active]];
  for (const root of candidates) {
    const file = resolve(root, suffix);
    if (!file.startsWith(root + sep)) { response.writeHead(403); response.end(); return; }
    try {
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(data); return;
    } catch { /* Try the retained asset cohort, otherwise a real unavailable response. */ }
  }
  response.writeHead(404); response.end('Unavailable fixture asset');
});
server.listen(5174, '127.0.0.1');
