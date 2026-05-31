'use strict';
// Fuzz target: parseUA — arbitrary user-agent strings should never throw
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

module.exports.fuzz = function (data) {
  const provider = new FuzzedDataProvider(data);
  const ua = provider.consumeRemainingAsString();
  const result = parseUA(ua);
  if (typeof result !== 'string') throw new Error(`parseUA must return string, got ${typeof result}`);
  if (result.length > 28 && !['Googlebot','Bingbot','Yahoo','DuckDuckBot','Baidu','Yandex','curl',
      'Python','Go HTTP','Java','OkHttp','Edge','Opera','Firefox','Chrome','Safari','Mobile Browser',
      'Unknown'].includes(result)) {
    throw new Error(`parseUA truncation violated: returned ${result.length} chars`);
  }
};
