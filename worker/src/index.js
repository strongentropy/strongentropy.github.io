const SECURITY_HEADERS = {
  'Strict-Transport-Security':   'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options':      'nosniff',
  'X-Frame-Options':             'DENY',
  'X-DNS-Prefetch-Control':      'off',
  'Referrer-Policy':             'strict-origin-when-cross-origin',
  'Permissions-Policy':          'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy':  'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; " +
    "font-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "script-src 'none'; " +
    "frame-ancestors 'none'; " +
    "form-action 'none'; " +
    "base-uri 'self'",
};

const GRAPH_CSP =
  "default-src 'self'; " +
  "font-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; " +
  "script-src 'self'; " +
  "connect-src 'self'; " +
  "frame-ancestors 'none'; " +
  "form-action 'none'; " +
  "base-uri 'self'";

function applySecurityHeaders(response, graph = false) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, graph && k === 'Content-Security-Policy' ? GRAPH_CSP : v);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const RATE_LIMIT = 60;
const RATE_WINDOW = 60;

function block(status, message) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS },
  });
}

function authChallenge() {
  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Strong Entropy", charset="UTF-8"',
      'Content-Type': 'text/plain',
    },
  });
}

function parseOS(ua) {
  if (!ua) return null;
  if (/iPhone/.test(ua))              return 'iOS';
  if (/iPad/.test(ua))                return 'iPadOS';
  if (/Android/.test(ua))             return 'Android';
  if (/CrOS/.test(ua))                return 'ChromeOS';
  if (/Windows/.test(ua))             return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua))  return 'macOS';
  if (/Linux/.test(ua))               return 'Linux';
  return null;
}

function timingSafeEqual(a, b) {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = aBytes.length !== bBytes.length ? 1 : 0;
  const len = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < len; i++) {
    result |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return result === 0;
}

function isAuthenticated(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;
  try {
    const decoded = atob(auth.slice(6));
    const colon = decoded.indexOf(':');
    const user = decoded.slice(0, colon);
    const pass = decoded.slice(colon + 1);
    return timingSafeEqual(user, 'admin') && timingSafeEqual(pass, env.GRAPH_PASSWORD);
  } catch { return false; }
}

// Scanner probe paths observed in live logs: .env variants, .git, dotfiles,
// WordPress/PHP probes, framework config files. /.well-known is excluded —
// it's the only dotfile path with legitimate traffic.
const PROBE_RE = new RegExp(
  '^/(?!\\.well-known/)\\.' +          // dotfiles: /.env, /.git, /.aws, /.gitlab-ci.yml
  '|\\.env' +                           // .env anywhere: /backend/.env, /api/.env.bak
  '|\\.php$' +                          // /info.php, /config.php
  '|^/wp([-/]|$)|^/wordpress' +         // WordPress probes incl. /wp-json, /wp/
  '|/wp-includes' +
  '|phpunit|/_profiler|/actuator' +
  '|appsettings|docker-compose' +
  '|^/env(\\.|$)' +                     // /env, /env.txt
  '|/\\.git(/|$)' +
  '|aws\\.env|\\.aws/' +
  '|config\\.(json|php|ya?ml)$',
  'i'
);

async function reportScanner(ip, request, env) {
  if (!env.ABUSEIPDB_KEY || !ip) return;
  const dedupKey = `reported:${ip}`;
  if (await env.VISITS.get(dedupKey)) return;

  const url = new URL(request.url);
  const prefix = `Malicious web recon: ${url.pathname} | UA: `;
  const ua = (request.headers.get('User-Agent') || '').slice(0, Math.max(0, 1024 - prefix.length));
  const comment = (prefix + ua).slice(0, 1024);

  // Categories: 19 = Bad Web Bot, 21 = Web App Attack
  const res = await fetch('https://api.abuseipdb.com/api/v2/report', {
    method: 'POST',
    headers: { Key: env.ABUSEIPDB_KEY, Accept: 'application/json' },
    body: new URLSearchParams({
      ip,
      categories: '19,21',
      comment,
      timestamp: new Date().toISOString(),
    }),
  });
  // Only mark as reported on success so transient failures can retry
  if (res.ok) await env.VISITS.put(dedupKey, '1', { expirationTtl: 86400 });
}

// Per-isolate rate-limit cache (issue #14). KV is read once per window per
// isolate and written every RL_SYNC_INTERVAL requests instead of every request.
// Cross-isolate counts are approximate; the GitHub-flush durability model and
// generous limit make that acceptable.
const RL_SYNC_INTERVAL = 10;
const rlCache = new Map();

function pruneRlCache(currentWindow) {
  for (const key of rlCache.keys()) {
    const win = parseInt(key.slice(key.lastIndexOf(':') + 1));
    if (win < currentWindow) rlCache.delete(key);
  }
}

async function checkRateLimit(ip, env) {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / RATE_WINDOW);
  const windowKey = `rl:${ip}:${window}`;

  let state = rlCache.get(windowKey);
  if (!state) {
    pruneRlCache(window);
    const kvCount = parseInt(await env.VISITS.get(windowKey) || '0');
    state = { kvBase: kvCount, local: 0 };
    rlCache.set(windowKey, state);
  }

  state.local++;
  const count = state.kvBase + state.local;

  if (state.local >= RL_SYNC_INTERVAL || count === RATE_LIMIT + 1) {
    await env.VISITS.put(windowKey, String(count), { expirationTtl: RATE_WINDOW * 2 });
    state.kvBase = count;
    state.local = 0;
  }

  return count > RATE_LIMIT;
}

export default {
  async fetch(request, env, ctx) {
    const ua = request.headers.get('User-Agent');
    if (!ua || ua.trim() === '') return block(403, 'Forbidden');

    const ip = request.headers.get('CF-Connecting-IP') || '';
    const url = new URL(request.url);

    const ownerIps = (env.OWNER_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    const isOwner = ownerIps.includes(ip);

    const isAsset = /\.(ico|svg|png|jpg|jpeg|css|js|woff|woff2|map|txt)$/.test(url.pathname);
    if (!isOwner && !isAsset && await checkRateLimit(ip, env)) return block(429, 'Too Many Requests');

    // Scanner probes: report to AbuseIPDB, log, and 404 without touching origin
    if (!isOwner && PROBE_RE.test(url.pathname)) {
      ctx.waitUntil(reportScanner(ip, request, env));
      ctx.waitUntil(logVisit(request, env, { scanner: true }));
      return block(404, 'Not Found');
    }

    // On-demand log flush — token auth via header (query strings end up in logs)
    if (url.pathname === '/flush') {
      const token = request.headers.get('X-Flush-Token');
      if (!token || !timingSafeEqual(token, env.FLUSH_TOKEN)) return block(403, 'Forbidden');
      ctx.waitUntil(flushToGitHub(env));
      return new Response(JSON.stringify({ ok: true, message: 'Flush triggered' }), {
        status: 202,
        headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS },
      });
    }

    // Log data API — basic auth + same-origin CORS enforcement
    if (url.pathname === '/api/logs') {
      const origin = request.headers.get('Origin');
      if (origin && origin !== 'https://strongentropy.com') return block(403, 'Forbidden');
      const fetchSite = request.headers.get('Sec-Fetch-Site');
      if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) return block(403, 'Forbidden');
      if (!isAuthenticated(request, env)) return authChallenge();
      return serveLogs(url, env);
    }

    // Graph page — basic auth, relaxed CSP
    if (url.pathname === '/graph' || url.pathname.startsWith('/graph/')) {
      if (!isAuthenticated(request, env)) return authChallenge();
      const response = await proxyToGitHubPages(request, env);
      return applySecurityHeaders(response, true);
    }

    ctx.waitUntil(logVisit(request, env, isOwner ? { owner: true } : {}));
    const response = await proxyToGitHubPages(request, env);
    return applySecurityHeaders(response);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(flushToGitHub(env));
  },
};

async function proxyToGitHubPages(request, env) {
  const url = new URL(request.url);
  const originUrl = new URL(url.pathname + url.search, env.ORIGIN);

  const headers = new Headers(request.headers);
  headers.set('Host', 'strongentropy.github.io');
  // Don't leak dashboard credentials to the upstream origin
  headers.delete('Authorization');
  headers.delete('Cookie');

  const proxyReq = new Request(originUrl.toString(), {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
  });

  return fetch(proxyReq);
}

async function serveLogs(url, env) {
  const days = Math.min(Math.max(parseInt(url.searchParams.get('days')) || 30, 1), 365);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // List files in logs/ directory
  const listRes = await ghFetch(env, 'GET', 'logs');
  if (!listRes.ok) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, 'Content-Security-Policy': GRAPH_CSP },
    });
  }

  const ct = listRes.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json', ...SECURITY_HEADERS, 'Content-Security-Policy': GRAPH_CSP },
    });
  }
  const files = await listRes.json();
  const relevant = files.filter(f =>
    f.name.endsWith('.ndjson') && f.name.replace('.ndjson', '') >= cutoffStr
  );

  const results = await Promise.all(
    relevant.map(async (file) => {
      const r = await ghFetch(env, 'GET', `logs/${file.name}`);
      if (!r.ok) return [];
      const data = await r.json();
      const content = atobUnicode(data.content.replace(/\n/g, ''));
      return content.trim().split('\n').filter(Boolean).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
    })
  );

  const entries = results.flat();

  return new Response(JSON.stringify(entries), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...SECURITY_HEADERS,
      'Content-Security-Policy': GRAPH_CSP,
    },
  });
}

// Per-isolate visit log buffer. Burst visits within a single isolate coalesce
// into one KV put (up to LOG_BUFFER_MAX). Each visit flushes immediately so
// nothing is lost when the isolate is evicted — setTimeout-based debouncing
// proved unreliable because CF evicts idle isolates even during waitUntil.
const LOG_BUFFER_MAX = 25;
const logBuffer = [];

async function logVisit(request, env, meta = {}) {
  const cf = request.cf || {};
  const url = new URL(request.url);

  if (url.pathname.match(/\.(ico|svg|png|jpg|css|js|woff|map)$/)) return;

  const entry = {
    ts:      new Date().toISOString(),
    ip:      request.headers.get('CF-Connecting-IP'),
    country: cf.country,
    city:    cf.city,
    asn:     cf.asn,
    org:     cf.asOrganization,
    lat:     cf.latitude,
    lon:     cf.longitude,
    ua:      (request.headers.get('User-Agent')  || '').slice(0, 512),
    ref:     (request.headers.get('Referer')     || '').slice(0, 512),
    os:      parseOS(request.headers.get('User-Agent')),
    device:  cf.deviceType || null,
    path:    url.pathname,
    method:  request.method,
    ...meta,
  };

  logBuffer.push(entry);
  await flushLogBuffer(env);
}

async function flushLogBuffer(env) {
  if (logBuffer.length === 0) return;
  const batch = logBuffer.splice(0, logBuffer.length);
  const key = `log:${Date.now()}:${crypto.randomUUID()}`;
  await env.VISITS.put(key, JSON.stringify(batch), { expirationTtl: 604800 });
}

async function flushToGitHub(env) {
  await flushLogBuffer(env);

  const list = await env.VISITS.list({ prefix: 'log:' });
  if (list.keys.length === 0) return;

  const results = await Promise.all(
    list.keys.map(async (k) => {
      const val = await env.VISITS.get(k.name);
      if (!val) return [];
      try {
        const parsed = JSON.parse(val);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        return items.map((data) => ({ key: k.name, data }));
      } catch { return []; }
    })
  );
  const valid = results.flat();

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const byDate = {};
  for (const entry of valid) {
    const date = typeof entry.data.ts === 'string' ? entry.data.ts.slice(0, 10) : '';
    if (!DATE_RE.test(date)) continue;
    (byDate[date] ??= []).push(entry);
  }

  for (const [date, dateEntries] of Object.entries(byDate)) {
    const path = `logs/${date}.ndjson`;
    const newLines = dateEntries.map((e) => JSON.stringify(e.data)).join('\n');

    const existing = await getGitHubFile(env, path);
    let content, sha;
    if (existing) {
      const decoded = atobUnicode(existing.content.replace(/\n/g, ''));
      content = decoded.trimEnd() + '\n' + newLines;
      sha = existing.sha;
    } else {
      content = newLines;
    }

    await putGitHubFile(env, path, content, sha, `logs: ${date} (${dateEntries.length} visits)`);
  }

  const keysToDelete = [...new Set(valid.map((e) => e.key))];
  await Promise.all(keysToDelete.map((key) => env.VISITS.delete(key)));
}

async function getGitHubFile(env, path) {
  const res = await ghFetch(env, 'GET', path);
  if (res.status === 404) return null;
  return res.json();
}

async function putGitHubFile(env, path, content, sha, message) {
  const body = {
    message,
    content: btoaUnicode(content),
    branch: env.GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
  await ghFetch(env, 'PUT', path, body);
}

function ghFetch(env, method, path, body) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${path}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'strongentropy-logger/1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function btoaUnicode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function atobUnicode(b64) {
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
