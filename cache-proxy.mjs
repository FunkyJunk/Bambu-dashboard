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
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/';

// Mirrors the sport registry in index.html. Soccer and golf have no single
// all-competitions feed, so each sport is several upstream calls merged into
// one bundle the panel can consume in a single request.
const SPORTS = {
  nfl: [
    { path: 'football/nfl', tag: 'NFL' }
  ],
  soccer: [
    { path: 'soccer/eng.1',          tag: 'Premier League' },
    { path: 'soccer/uefa.champions', tag: 'Champions League' },
    { path: 'soccer/usa.1',          tag: 'MLS' },
    { path: 'soccer/esp.1',          tag: 'LaLiga' },
    { path: 'soccer/ita.1',          tag: 'Serie A' },
    { path: 'soccer/ger.1',          tag: 'Bundesliga' },
    { path: 'soccer/mex.1',          tag: 'Liga MX' }
  ],
  golf: [
    { path: 'golf/pga',            tag: 'PGA TOUR' },
    { path: 'golf/lpga',           tag: 'LPGA' },
    { path: 'golf/champions-tour', tag: 'PGA TOUR Champions' }
  ]
};

// one entry per sport: { body, at, error }
const cache = new Map();
const inflight = new Map();

async function pullSport(sport) {
  if (inflight.has(sport)) return inflight.get(sport);
  const job = (async () => {
    const feeds = SPORTS[sport];
    const results = await Promise.allSettled(feeds.map(async f => {
      const r = await fetch(BASE + f.path + '/scoreboard', {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' }
      });
      if (!r.ok) throw new Error(f.path + ' HTTP ' + r.status);
      const d = await r.json();
      return { tag: f.tag, events: d.events || [] };
    }));

    const groups = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected')
                          .map(r => String(r.reason?.message || r.reason));

    // A partial answer still beats a blank panel; only a total failure keeps
    // the previous payload in place.
    if (!groups.length) {
      const msg = failed.join('; ') || 'no upstream data';
      cache.set(sport, { ...(cache.get(sport) || {}), error: msg });
      console.warn('[cache-proxy]', new Date().toISOString(), sport, msg);
      return;
    }
    cache.set(sport, {
      body: JSON.stringify({ sport, groups }),
      at: Date.now(),
      error: failed.length ? failed.join('; ') : null
    });
    if (failed.length) console.warn('[cache-proxy]', sport, 'partial:', failed.join('; '));
  })().finally(() => inflight.delete(sport));

  inflight.set(sport, job);
  return job;
}

const pullAll = () => Promise.all(Object.keys(SPORTS).map(pullSport));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/plain; charset=utf-8'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // /feed/<sport>, plus bare /feed for the original NFL-only callers
  const feedMatch = url.pathname === '/feed'
    ? 'nfl'
    : (url.pathname.startsWith('/feed/') ? url.pathname.slice(6) : null);

  if (feedMatch !== null) {
    if (!SPORTS[feedMatch]) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'unknown sport', known: Object.keys(SPORTS) }));
    }
    let hit = cache.get(feedMatch);
    if (!hit || !hit.body) { await pullSport(feedMatch); hit = cache.get(feedMatch); }
    if (!hit || !hit.body) {
      res.writeHead(503, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'no upstream data yet', detail: hit?.error || null }));
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-cache-age-ms': String(Date.now() - hit.at),
      'x-upstream-error': hit.error || ''
    });
    return res.end(hit.body);
  }

  if (url.pathname === '/health') {
    const out = {};
    for (const sport of Object.keys(SPORTS)) {
      const hit = cache.get(sport);
      out[sport] = {
        ok: !!(hit && hit.body),
        ageMs: hit && hit.at ? Date.now() - hit.at : null,
        competitions: hit && hit.body ? JSON.parse(hit.body).groups.length : 0,
        lastError: hit?.error || null
      };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ intervalMs: INTERVAL, sports: out }, null, 1));
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

await pullAll();
setInterval(pullAll, INTERVAL);
server.listen(PORT, () => {
  console.log(`[cache-proxy] http://0.0.0.0:${PORT}  (upstream every ${INTERVAL / 1000}s)`);
  console.log(`[cache-proxy] sports: ${Object.keys(SPORTS).join(', ')}`);
  console.log(`[cache-proxy] point panels at  http://<this-host>:${PORT}/?feed=/feed&sport=nfl&net=FOX`);
});
