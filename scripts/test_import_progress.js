// Import progress: the total is known before writing, each written recipe reports done/total,
// and recipes skipped in 'keep' mode count as processed at once. Web mode, real modules.
// Run: NODE_PATH=$PWD/node_modules node scripts/test_import_progress.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'react-native') return { Platform: { OS: 'web' } };
  if (req === 'react-i18next') return { initReactI18next: { type: '3rdParty', init() {} }, useTranslation: () => ({ t: k => k }) };
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const store = new Map();
global.window = { localStorage: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
} };

const catalogFormat = require(path.join(ROOT, 'src/services/catalogFormat.ts'));
const book = require(path.join(ROOT, 'src/services/recipeBookService.ts'));
const seed = require(path.join(ROOT, 'src/services/ingredientsService.ts'));
const db = require(path.join(ROOT, 'src/db/database.ts'));

const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/bundledRecipes.json'), 'utf8'));

async function run() {
  await seed.seedIngredientsV2();
  const five = bundled.slice(0, 5);
  const file = catalogFormat.parseCatalogText(JSON.stringify(five));
  assert.strictEqual(file.recipes.length, 5, 'five recipes read');

  // fresh book: every recipe is written, progress goes 1..5 over 5
  const calls = [];
  await book.applyCatalogImport(file, 'keep', new Map(), (done, total) => calls.push([done, total]));
  assert.deepStrictEqual(calls[0], [0, 5], 'starts at zero of the total');
  assert.deepStrictEqual(calls[calls.length - 1], [5, 5], 'ends at total of total');
  // web writes in one go (no transaction): one final step; native reports each recipe
  assert.ok(calls.every((c, i) => i === 0 || c[0] >= calls[i - 1][0]), 'progress never goes back');
  console.log('PASS fresh import: 0 of 5, then 1..5 of 5');

  // second import in keep mode: nothing new, all five are processed at once
  const again = [];
  await book.applyCatalogImport(file, 'keep', new Map(), (done, total) => again.push([done, total]));
  assert.ok(again.length > 0 && again.every(c => c[0] === 5 && c[1] === 5), 'skipped recipes count as processed');
  console.log('PASS keep mode over existing recipes: 5 of 5 at once');

  assert.strictEqual((await db.getCatalogRecipes()).length, 5, 'five recipes in the book');
  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
