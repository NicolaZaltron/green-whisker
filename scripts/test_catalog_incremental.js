// Checks the recipe split: lists keep summaries (no card body), the body is loaded by id.
// Runs the real database module in web mode (fake localStorage). Run: NODE_PATH=$PWD/node_modules node scripts/test_recipe_split.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'react-native') return { Platform: { OS: 'web' } };
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
const cat = require(path.join(ROOT, 'src/services/recipeCatalog.ts'));

const mk = (id, title, extra = {}) => ({
  id, title, source: 'Green Whisker', url: '', image: '',
  category: 'CAT_PRIMI_PIATTI', difficulty: 'easy', servings: 2, times: { total_minutes: 20 },
  ingredients: ['160 grammi Spaghetto'], instructions: ['x'], tips: [], tags: [],
  protein_group: 'legumi_interi', carb_family: 'pasta', veggie_color: 'green', seasons: [], is_complete_plate: false,
  diet: 'vegano', origin: 'file', created_at: 1, updated_at: 1, ...extra,
});

async function run() {
  await db.upsertCatalogRecipes([mk('a', 'Alpha'), mk('b', 'Beta'), mk('c', 'Gamma')], 'overwrite');
  await cat.loadCatalog();
  assert.strictEqual(cat.catalogRecipes.length, 3);
  const arr = cat.catalogRecipes;
  const v0 = cat.getCatalogVersion();
  let notified = 0;
  cat.subscribeCatalog(() => notified++);

  await db.upsertCatalogRecipes([mk('b', 'Beta nuova', { updated_at: 2 })], 'overwrite');
  await cat.refreshCatalog(['b']);
  assert.strictEqual(cat.getRecipeById('b').title, 'Beta nuova');
  assert.ok(cat.catalogRecipes.some(r => r.title === 'Beta nuova') && !cat.catalogRecipes.some(r => r.title === 'Beta'));
  assert.strictEqual(cat.catalogRecipes.length, 3);
  assert.strictEqual(cat.catalogRecipes, arr, 'same array');
  assert.ok(cat.getCatalogVersion() > v0 && notified === 1);
  console.log('PASS changed recipe is replaced');

  await db.deleteCatalogRecipes(['c']);
  await cat.refreshCatalog(['c']);
  assert.ok(!cat.catalogRecipes.some(r => r.id === 'c'));
  assert.strictEqual(cat.getRecipeById('c'), undefined);
  console.log('PASS deleted recipe is gone');

  await db.upsertCatalogRecipes([mk('v', 'Variante orfana', { variant_of: 'zzz' })], 'overwrite');
  await cat.refreshCatalog(['v']);
  assert.ok(cat.catalogRecipes.some(r => r.id === 'v'), 'orphan variant listed as recipe');
  assert.ok(!cat.catalogVariants.some(r => r.id === 'v'));
  await db.upsertCatalogRecipes([mk('w', 'Variante di a', { variant_of: 'a' })], 'overwrite');
  await cat.refreshCatalog(['w']);
  assert.ok(cat.catalogVariants.some(r => r.id === 'w') && !cat.catalogRecipes.some(r => r.id === 'w'));
  console.log('PASS variant placement');
}

run().then(() => console.log('ALL PASS')).catch(e => { console.error(e); process.exit(1); });
