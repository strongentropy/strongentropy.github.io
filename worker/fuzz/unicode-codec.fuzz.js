'use strict';
// Fuzz target: btoaUnicode/atobUnicode — round-trip must be identity for any UTF-8 string
const { FuzzedDataProvider } = require('@jazzer.js/core');

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

module.exports.fuzz = function (data) {
  const provider = new FuzzedDataProvider(data);
  const str = provider.consumeRemainingAsString();
  const encoded = btoaUnicode(str);
  if (typeof encoded !== 'string') throw new Error('btoaUnicode must return string');
  const decoded = atobUnicode(encoded);
  if (decoded !== str) throw new Error(`Round-trip mismatch for input of length ${str.length}`);
};
