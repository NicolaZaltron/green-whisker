// Recipe book import and links (web mode, fake localStorage, real code).
// Run: NODE_PATH=$PWD/node_modules node scripts/test_recipe_import_links.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (/^\.\.\/i18n$/.test(req)) return { __esModule: true, default: { t: k => k } };
  if (req === 'react-native') return { Platform: { OS: 'web' } };
  if (/^(@expo|expo|react|i18next)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
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
const reset = () => store.clear();
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ingredients.seed.json'), 'utf8'));
const loadSeed = () => store.set('gw_ingredients', JSON.stringify(seed.map((i, n) => ({ ...i, created_at: 1, updated_at: 1 }))));

(async () => {
  const { getWebData, WEB_STORAGE_KEYS } = require(path.join(ROOT, 'src/db/database.ts'));
  const links = () => getWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []);
  const { saveRecipeLinks, saveRecipeLinksBatch, saveCatalogRecipesWithLinks } = require(path.join(ROOT, 'src/db/recipeIngredientsDb.ts'));
  const ingredientsDb = require(path.join(ROOT, 'src/db/ingredientsDb.ts'));
  const { applyCatalogImport } = require(path.join(ROOT, 'src/services/recipeBookService.ts'));
  const { parseCatalogText } = require(path.join(ROOT, 'src/services/catalogFormat.ts'));

  // T1: full recipe book import
  reset(); loadSeed();
  const text = fs.readFileSync(path.join(ROOT, 'assets/ricette.json'), 'utf8');
  const parsed = parseCatalogText(text);
  const res = await applyCatalogImport(parsed, 'overwrite');
  assert.strictEqual(res.imported, parsed.recipes.length, 'tutte le ricette importate');
  assert.strictEqual(links().length, 8385, 'righe collegate');
  const expected = parsed.recipes.reduce((n, r) => n + (r.detailed_ingredients || []).length, 0);
  assert.strictEqual(expected, 8385, 'nessuna riga non risolta');
  console.log('PASS T1 import completo: 8385 righe collegate, 0 non risolte');

  // T2: recipe without detailed_ingredients in overwrite: links unchanged
  const base = parsed.recipes.find(r => (r.detailed_ingredients || []).length > 0);
  const before = JSON.stringify(links().filter(l => l.recipe_id === base.id));
  assert.ok(before.length > 2);
  const stripped = { ...base, detailed_ingredients: undefined, ingredients: [] };
  await applyCatalogImport({ recipes: [stripped], invalid: 0, duplicates: 0 }, 'overwrite');
  assert.strictEqual(JSON.stringify(links().filter(l => l.recipe_id === base.id)), before, 'collegamenti invariati (undefined)');
  await applyCatalogImport({ recipes: [{ ...stripped, detailed_ingredients: [] }], invalid: 0, duplicates: 0 }, 'overwrite');
  assert.strictEqual(JSON.stringify(links().filter(l => l.recipe_id === base.id)), before, 'collegamenti invariati (lista vuota)');
  console.log('PASS T2 ricetta senza dettagli: collegamenti invariati');

  // T3: error midway: the import stops and creates no links for unwritten recipes (no rollback on web)
  const countBefore = links().length;
  const bad = { ...base, id: 'bad-recipe' };
  Object.defineProperty(bad, 'title', { get() { throw new Error('boom'); }, enumerable: true });
  await assert.rejects(() => applyCatalogImport({ recipes: [bad], invalid: 0, duplicates: 0 }, 'overwrite'), /boom/);
  assert.strictEqual(links().length, countBefore, 'nessun collegamento per ricette non scritte');
  assert.ok(!links().some(l => l.recipe_id === 'bad-recipe'));
  console.log('PASS T3 errore propagato, nessun collegamento orfano (web: nessun rollback, limite documentato)');

  // T4: batch == singles, a single read of the ingredients
  const sample = parsed.recipes.filter(r => (r.detailed_ingredients || []).length > 0).slice(0, 20);
  reset(); loadSeed();
  for (const r of sample) await saveRecipeLinks(r.id, r.detailed_ingredients);
  const single = JSON.stringify(links());
  reset(); loadSeed();
  let reads = 0;
  const orig = ingredientsDb.listIngredients;
  ingredientsDb.listIngredients = async () => { reads++; return orig(); };
  const out = await saveRecipeLinksBatch(sample.map(r => ({ recipeId: r.id, items: r.detailed_ingredients })));
  ingredientsDb.listIngredients = orig;
  assert.strictEqual(JSON.stringify(links()), single, 'stesso risultato');
  assert.strictEqual(out.unresolved, 0);
  assert.strictEqual(reads, 1, 'una sola lettura');
  // keep mode: no links for recipes already present
  await saveCatalogRecipesWithLinks([sample[0]], 'overwrite', [{ recipeId: sample[0].id, items: sample[0].detailed_ingredients }]);
  const k = await saveCatalogRecipesWithLinks([sample[0]], 'keep', [{ recipeId: sample[0].id, items: [] }]);
  assert.strictEqual(k.skipped, 1);
  assert.ok(links().some(l => l.recipe_id === sample[0].id), 'keep non tocca i collegamenti');
  console.log('PASS T4 batch uguale ai singoli, una sola lettura ingredienti');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
