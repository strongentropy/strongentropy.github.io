'use strict';
// Fuzz target: timingSafeEqual — must always return boolean, identity must hold, symmetry must hold
const { FuzzedDataProvider } = require('@jazzer.js/core');

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

module.exports.fuzz = function (data) {
  const provider = new FuzzedDataProvider(data);
  const a = provider.consumeString(200);
  const b = provider.consumeRemainingAsString();

  const ab = timingSafeEqual(a, b);
  const ba = timingSafeEqual(b, a);

  if (typeof ab !== 'boolean') throw new Error('timingSafeEqual must return boolean');
  if (ab !== ba)               throw new Error('timingSafeEqual must be symmetric');
  if (!timingSafeEqual(a, a)) throw new Error('timingSafeEqual(x,x) must be true');
  if (!timingSafeEqual(b, b)) throw new Error('timingSafeEqual(x,x) must be true');
  if (a === b && !ab)         throw new Error('equal strings must compare equal');
};
