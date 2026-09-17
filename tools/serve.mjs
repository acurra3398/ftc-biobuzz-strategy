// Node version of serve.py, for machines that have Node but not Python.
// Same behaviour: no-cache headers, opens your browser, port 8734 by default.
//   node tools/serve.mjs [port] [--no-open]
import { createServer } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const openBrowser = !args.includes('--no-open');
const port = Number(args.find((a) => /^\d+$/.test(a))) || Number(process.env.PORT) || 8734;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  // normalize() collapses any ../ so a request cannot escape the folder.
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
  const file = join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }
  try {
    const info = await fs.stat(file);
    if (info.isDirectory()) throw new Error('is a directory');
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found: ' + rel);
  }
});

server.on('error', (err) => {
  console.error(`Could not start on port ${port}: ${err.message}`);
  console.error(`Something else is probably using it. Try:  node tools/serve.mjs 8735`);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://localhost:${port}`;
  console.log(`FTC Strategy Lab  ->  ${url}`);
  console.log('Leave this window open. Close it (or press Ctrl-C) to stop.');
  if (openBrowser) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
    setTimeout(() => { try { spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref(); } catch {} }, 700);
  }
});
