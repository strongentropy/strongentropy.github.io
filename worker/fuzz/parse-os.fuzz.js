'use strict';
const { FuzzedDataProvider } = require('@jazzer.js/core');

const KNOWN_OS = ['iOS', 'iPadOS', 'Android', 'ChromeOS', 'Windows', 'macOS', 'Linux'];

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

module.exports.fuzz = function (data) {
  const provider = new FuzzedDataProvider(data);
  const ua = provider.consumeRemainingAsString();
  const result = parseOS(ua);
  if (result !== null && !KNOWN_OS.includes(result)) {
    throw new Error(`parseOS returned unexpected value: ${result}`);
  }
};
