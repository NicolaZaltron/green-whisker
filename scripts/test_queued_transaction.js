// Regression: runQueuedTransaction must return the task value.
// expo-sqlite (withTransactionAsync) returns void, so the value must be captured inside the transaction.
// Run: NODE_PATH=$PWD/node_modules node scripts/test_queued_transaction.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const stubs = { 'react-native': { Platform: { OS: 'web' } } };
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (stubs[req]) return stubs[req];
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

// Like expo-sqlite: runs the task and returns nothing
const fakeDb = { withTransactionAsync: async task => { await task(); } };

(async () => {
  const { runQueuedTransaction } = require(path.join(ROOT, 'src/db/database.ts'));
  const value = await runQueuedTransaction(fakeDb, async () => ({ inserted: 3, updated: 1 }));
  assert.deepStrictEqual(value, { inserted: 3, updated: 1 }, 'il valore del task deve arrivare al chiamante');

  await assert.rejects(runQueuedTransaction(fakeDb, async () => { throw new Error('boom'); }), /boom/, 'l\'errore deve propagarsi');

  console.log('PASS: runQueuedTransaction restituisce il valore e propaga gli errori');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
