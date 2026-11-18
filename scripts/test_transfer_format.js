// Shared transfer format (ingredients and out-of-home files): header checked, items cleaned.
// Run: node scripts/test_transfer_format.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const T = require(path.join(ROOT, 'src/utils/transferFormat.ts'));

const ok = JSON.stringify({ format: T.OUT_OF_HOME_FORMAT, version: 1, items: ['Ristorante'] });
assert.deepStrictEqual(T.parseEnvelope(ok, T.OUT_OF_HOME_FORMAT), ['Ristorante']);
console.log('PASS a file with the right header is read');

assert.throws(() => T.parseEnvelope(ok, T.INGREDIENTS_FORMAT), /transfer_invalid_format/, 'wrong kind of file');
assert.throws(() => T.parseEnvelope(JSON.stringify({ format: T.OUT_OF_HOME_FORMAT, version: 2, items: [] }), T.OUT_OF_HOME_FORMAT), /transfer_invalid_format/, 'newer version');
assert.throws(() => T.parseEnvelope('[{"name":"x"}]', T.INGREDIENTS_FORMAT), /transfer_invalid_format/, 'plain array (recipe book format)');
assert.throws(() => T.parseEnvelope('{not json', T.INGREDIENTS_FORMAT), /transfer_invalid_json/, 'not JSON');
console.log('PASS wrong kind, newer version, plain list and broken JSON are refused');

assert.deepStrictEqual(T.outOfHomeLabelsOf(['  Bar ', 'Bar', '', 7, 'Pub']), ['Bar', 'Pub']);
console.log('PASS out-of-home labels are trimmed, de-duplicated and non-text values dropped');

console.log('All checks passed');
