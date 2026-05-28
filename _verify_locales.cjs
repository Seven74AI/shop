#!/usr/bin/env node
const en = require('./app/locales/en/common.json');
console.log('en OK');
const fr = require('./app/locales/fr/common.json');
console.log('fr OK');

// Key counts
const enKeys = Object.keys(en).filter(k => k.startsWith('cookie.consent'));
const frKeys = Object.keys(fr).filter(k => k.startsWith('cookie.consent'));
console.log(`en cookie.consent keys: ${enKeys.length}`);
console.log(`fr cookie.consent keys: ${frKeys.length}`);

if (enKeys.length !== 15) {
  console.error(`FAIL: en has ${enKeys.length} cookie keys, expected 15`);
  process.exit(1);
}
if (frKeys.length !== 15) {
  console.error(`FAIL: fr has ${frKeys.length} cookie keys, expected 15`);
  process.exit(1);
}
console.log('ALL CHECKS PASSED');
