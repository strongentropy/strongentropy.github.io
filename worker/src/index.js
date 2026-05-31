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

async function checkRateLimit(ip, env) {
  const key = `rl:${ip}`;
  const now = Math.floor(Date.now() / 1000);
  const windowKey = `${key}:${Math.floor(now / RATE_WINDOW)}`;
  const count = parseInt(await env.VISITS.get(windowKey) || '0') + 1;
  await env.VISITS.put(windowKey, String(count), { expirationTtl: RATE_WINDOW * 2 });
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

    // On-demand log flush — token auth
    if (url.pathname === '/flush') {
      const token = url.searchParams.get('token');
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
      if (!isAuthenticated(request, env)) return authChallenge();
      return serveLogs(url, env);
    }

    // Graph page — basic auth, relaxed CSP
    if (url.pathname === '/graph' || url.pathname.startsWith('/graph/')) {
      if (!isAuthenticated(request, env)) return authChallenge();
      const response = await proxyToGitHubPages(request, env);
      return applySecurityHeaders(response, true);
    }

    if (!isOwner) ctx.waitUntil(logVisit(request, env));
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

async function logVisit(request, env) {
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
  };

  const key = `log:${Date.now()}:${crypto.randomUUID()}`;
  await env.VISITS.put(key, JSON.stringify(entry), { expirationTtl: 604800 });
}

async function flushToGitHub(env) {
  const list = await env.VISITS.list({ prefix: 'log:' });
  if (list.keys.length === 0) return;

  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const val = await env.VISITS.get(k.name);
      if (!val) return null;
      try { return { key: k.name, data: JSON.parse(val) }; } catch { return null; }
    })
  );
  const valid = entries.filter(Boolean);

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

  await Promise.all(valid.map((e) => env.VISITS.delete(e.key)));
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
