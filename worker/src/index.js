export default {
  async fetch(request, env, ctx) {
    ctx.waitUntil(logVisit(request, env));
    return proxyToGitHubPages(request, env);
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

async function logVisit(request, env) {
  const cf = request.cf || {};
  const url = new URL(request.url);

  // Skip non-page requests
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
    ua:      request.headers.get('User-Agent'),
    ref:     request.headers.get('Referer'),
    path:    url.pathname,
    method:  request.method,
  };

  const key = `log:${Date.now()}:${crypto.randomUUID()}`;
  // 7-day TTL as safety net in case flush fails repeatedly
  await env.VISITS.put(key, JSON.stringify(entry), { expirationTtl: 604800 });
}

async function flushToGitHub(env) {
  const list = await env.VISITS.list({ prefix: 'log:' });
  if (list.keys.length === 0) return;

  // Fetch all buffered entries
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const val = await env.VISITS.get(k.name);
      return val ? { key: k.name, data: JSON.parse(val) } : null;
    })
  );
  const valid = entries.filter(Boolean);

  // Group by UTC date
  const byDate = {};
  for (const entry of valid) {
    const date = entry.data.ts.slice(0, 10);
    (byDate[date] ??= []).push(entry);
  }

  // Append each day's entries to its log file
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

  // Delete flushed KV entries
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
