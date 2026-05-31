'use strict';
// Fuzz target: buildGraph — arbitrary log entries should not throw or corrupt state
const { FuzzedDataProvider } = require('@jazzer.js/core');

function parseUA(ua) {
  if (!ua) return 'Unknown';
  const tests = [
    [/Googlebot/i,       'Googlebot'],
    [/bingbot/i,         'Bingbot'],
    [/Slurp/i,           'Yahoo'],
    [/DuckDuckBot/i,     'DuckDuckBot'],
    [/Baiduspider/i,     'Baidu'],
    [/YandexBot/i,       'Yandex'],
    [/curl\//i,          'curl'],
    [/python-requests/i, 'Python'],
    [/Go-http/i,         'Go HTTP'],
    [/Java\//i,          'Java'],
    [/okhttp/i,          'OkHttp'],
    [/Edg\//i,           'Edge'],
    [/OPR\//i,           'Opera'],
    [/Firefox\//i,       'Firefox'],
    [/Chrome\//i,        'Chrome'],
    [/Safari\//i,        'Safari'],
    [/Mobile/i,          'Mobile Browser'],
  ];
  for (const [re, name] of tests) if (re.test(ua)) return name;
  return ua.slice(0, 28);
}

function buildGraph(entries) {
  const nodeMap = new Map();
  const edgeMap = new Map();

  function addNode(id, type, label, rawLabel) {
    if (!nodeMap.has(id)) nodeMap.set(id, { id, type, label, rawLabel: rawLabel || label, count: 0 });
    nodeMap.get(id).count++;
  }

  function addEdge(a, b) {
    if (!nodeMap.has(a) || !nodeMap.has(b)) return;
    const key = a < b ? `${a}|||${b}` : `${b}|||${a}`;
    if (!edgeMap.has(key)) edgeMap.set(key, { source: a, target: b, weight: 0 });
    edgeMap.get(key).weight++;
  }

  for (const e of entries) {
    if (!e.ip) continue;
    const ipId      = `ip:${e.ip}`;
    const countryId = e.country ? `country:${e.country}` : null;
    const cityId    = e.city    ? `city:${e.city}`        : null;
    const asnId     = e.asn    ? `asn:${e.asn}`           : null;
    const orgId     = e.org    ? `org:${e.org}`            : null;
    const uaLabel   = parseUA(e.ua);
    const uaId      = e.ua    ? `ua:${uaLabel}`            : null;
    const pathId    = (e.path && e.path !== '/') ? `path:${e.path}` : null;
    let refId       = null;
    if (e.ref) {
      try { refId = `ref:${new URL(e.ref).hostname}`; } catch {}
    }
    addNode(ipId, 'ip', e.ip, e.ip);
    if (countryId) addNode(countryId, 'country', e.country, e.country);
    if (cityId)    addNode(cityId,    'city',    e.city,    e.city);
    if (asnId)     addNode(asnId,     'asn',     `ASN ${e.asn}`, String(e.asn));
    if (orgId)     addNode(orgId,     'org',     e.org,     e.org);
    if (uaId)      addNode(uaId,      'ua',      uaLabel,   e.ua);
    if (pathId)    addNode(pathId,    'path',    e.path,    e.path);
    if (refId)     addNode(refId,     'ref',     refId.replace('ref:',''), refId.replace('ref:',''));
    if (countryId) addEdge(ipId, countryId);
    if (cityId)    { addEdge(ipId, cityId); if (countryId) addEdge(countryId, cityId); }
    if (asnId)     addEdge(ipId, asnId);
    if (orgId)     { addEdge(ipId, orgId); if (asnId) addEdge(asnId, orgId); }
    if (uaId)      addEdge(ipId, uaId);
    if (pathId)    addEdge(ipId, pathId);
    if (refId)     addEdge(ipId, refId);
  }

  return { nodes: [...nodeMap.values()], links: [...edgeMap.values()] };
}

module.exports.fuzz = function (data) {
  const provider = new FuzzedDataProvider(data);
  const numEntries = provider.consumeIntegralInRange(0, 20);
  const entries = [];
  for (let i = 0; i < numEntries; i++) {
    entries.push({
      ip:      provider.consumeBoolean() ? provider.consumeString(50)  : null,
      country: provider.consumeBoolean() ? provider.consumeString(5)   : null,
      city:    provider.consumeBoolean() ? provider.consumeString(40)  : null,
      asn:     provider.consumeBoolean() ? provider.consumeIntegralInRange(1, 4294967295) : null,
      org:     provider.consumeBoolean() ? provider.consumeString(60)  : null,
      ua:      provider.consumeBoolean() ? provider.consumeString(200) : null,
      path:    provider.consumeBoolean() ? provider.consumeString(80)  : null,
      ref:     provider.consumeBoolean() ? provider.consumeString(100) : null,
      ts:      provider.consumeString(30),
    });
  }
  const { nodes, links } = buildGraph(entries);
  if (!Array.isArray(nodes) || !Array.isArray(links)) throw new Error('buildGraph must return {nodes, links}');
};
