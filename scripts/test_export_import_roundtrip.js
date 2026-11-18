// Export then import of a recipe book, in web mode: the file must parse, and re-importing the same
// recipes must report them as skipped (keep) or updated (overwrite), never as invalid.
// Run: NODE_PATH=$PWD/node_modules node scripts/test_export_import_roundtrip.js
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

const db = require(path.join(ROOT, 'src/db/database.ts'));
const catalogFormat = require(path.join(ROOT, 'src/services/catalogFormat.ts'));
const book = require(path.join(ROOT, 'src/services/recipeBookService.ts'));

const ingredientsService = require(path.join(ROOT, 'src/services/ingredientsService.ts'));

const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/bundledRecipes.json'), 'utf8'));

async function run() {
  // The app loads the ingredients seed at startup: the recipes of the book refer to it
  await ingredientsService.seedIngredientsV2();
  await db.upsertCatalogRecipes(bundled.slice(0, 5), 'overwrite');
  const exported = JSON.stringify(await db.getFullCatalogRecipes(), null, 2);
  assert.strictEqual(JSON.parse(exported).length, 5, 'five recipes exported');

  const parsed = catalogFormat.parseCatalogText(exported);
  assert.strictEqual(parsed.recipes.length, 5, 'all exported recipes parse as valid');
  assert.strictEqual(parsed.invalid, 0, 'no invalid recipes in the export');
  console.log('PASS exported file parses: 5 valid, 0 invalid');

  const kept = await book.applyCatalogImport(parsed, 'keep');
  assert.deepStrictEqual([kept.imported, kept.updated, kept.skipped], [0, 0, 5], 'keep skips the existing');
  console.log('PASS re-import in keep mode: 0 imported, 0 updated, 5 skipped');

  const overwritten = await book.applyCatalogImport(parsed, 'overwrite');
  assert.deepStrictEqual([overwritten.imported, overwritten.updated, overwritten.skipped], [0, 5, 0], 'overwrite updates');
  console.log('PASS re-import in overwrite mode: 0 imported, 5 updated');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
