#!/usr/bin/env node
/**
 * NFL Rail cache proxy — optional, zero dependencies.
 *
 * Serves the static panel files AND a single cached copy of the ESPN
 * scoreboard feed. One machine on the bar's network polls upstream; every
 * panel reads from it. Six TVs then cost the outside world one request every
 * ten seconds instead of twenty-four a minute, and if ESPN hiccups the panels
 * keep showing the last good payload instead of going blank.
 *
 *   node cache-proxy.mjs [--port 8080] [--interval 10]
 *
 * Then point each panel at:  http://<this-host>:8080/?feed=/feed&net=FOX
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const PORT     = Number(arg('--port', process.env.PORT || 8080));
const INTERVAL = Number(arg('--interval', 10)) * 1000;
const UPSTREAM = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

let cache = null;          // last good body
let cachedAt = 0;
let lastError = null;
let inflight = null;

async function pull() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ctl = AbortSignal.timeout(8000);
      const r = await fetch(UPSTREAM, { signal: ctl, headers: { 'accept': 'application/json' } });
      if (!r.ok) throw new Error('upstream HTTP ' + r.status);
      const body = await r.text();
      JSON.parse(body);                            // refuse to cache garbage
      cache = body; cachedAt = Date.now(); lastError = null;
    } catch (e) {
      lastError = String(e.message || e);
      console.warn('[cache-proxy]', new Date().toISOString(), lastError);
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (url.pathname === '/feed') {
    if (!cache) await pull();
    if (!cache) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'no upstream data yet', detail: lastError }));
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-cache-age-ms': String(Date.now() - cachedAt),
      'x-upstream-error': lastError || ''
    });
    return res.end(cache);
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      ok: !!cache, ageMs: cache ? Date.now() - cachedAt : null,
      intervalMs: INTERVAL, lastError
    }, null, 1));
  }

  // static files, confined to this directory
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = join(ROOT, normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  try {
    const buf = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});

await pull();
setInterval(pull, INTERVAL);
server.listen(PORT, () => {
  console.log(`[cache-proxy] http://0.0.0.0:${PORT}  (upstream every ${INTERVAL / 1000}s)`);
  console.log(`[cache-proxy] point panels at  http://<this-host>:${PORT}/?feed=/feed&net=FOX`);
});
