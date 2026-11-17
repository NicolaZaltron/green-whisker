// Regression: saveRecipeLinks links rows by existing id, otherwise by name; the others stay text.
// Uses the real code in web mode (fake localStorage). Run: NODE_PATH=$PWD/node_modules node scripts/test_recipe_links.js
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

// Database ingredients (as the import leaves them): random id, Italian name
const ingredients = [
  { id: 'ing-1-abc', name: 'Olio extravergine di oliva', aliases: [], type: 'condimenti', tags: [], edible_alone: false, default_amount: null, default_unit: '', purchase_amount: null, purchase_unit: '', density_g_per_ml: null, nutrients: {}, created_at: 1, updated_at: 1 },
  { id: 'ing-2-def', name: 'Sale', aliases: [], type: 'condimenti', tags: [], edible_alone: false, default_amount: null, default_unit: '', purchase_amount: null, purchase_unit: '', density_g_per_ml: null, nutrients: {}, created_at: 1, updated_at: 1 },
];
store.set('gw_ingredients', JSON.stringify(ingredients));

(async () => {
  const { saveRecipeLinks } = require(path.join(ROOT, 'src/db/recipeIngredientsDb.ts'));
  const { getWebData, WEB_STORAGE_KEYS } = require(path.join(ROOT, 'src/db/database.ts'));

  const result = await saveRecipeLinks('ricetta-test', [
    { section: 'Principale', text: '3 cucchiai di olio extravergine', amount: 3, unit: 'cucchiaio', ingredient: 'Olio extravergine di oliva', ingredient_id: 'ing-1-abc' },
    { section: 'Principale', text: 'q.b. sale', amount: null, unit: '', ingredient: 'Sale', ingredient_id: 'sale_slug' },
    { section: 'Principale', text: '2 cucchiai di olio evo', amount: 2, unit: 'cucchiaio', ingredient: 'Olio evo' },
    { section: 'Principale', text: 'q.b. limocello', amount: null, unit: '', ingredient: 'Limocello' },
  ]);

  // Without persisted aliases "Olio evo" is not linked: it stays text, as expected
  assert.deepStrictEqual(result, { linked: 2, unresolved: 2 }, 'due righe collegate, due senza corrispondenza');
  const rows = getWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []).filter(r => r.recipe_id === 'ricetta-test');
  assert.deepStrictEqual(rows.map(r => r.ingredient_id), ['ing-1-abc', 'ing-2-def'], 'id esistente usato così com\'è; nome usato per le altre');
  assert.deepStrictEqual(rows.map(r => r.position), [0, 1], 'la posizione è quella della riga originale');

  // Rewrite: replaces the links of the same recipe
  await saveRecipeLinks('ricetta-test', [{ section: 'Principale', text: 'q.b. sale', amount: null, unit: '', ingredient: 'Sale' }]);
  const again = getWebData(WEB_STORAGE_KEYS.RECIPE_INGREDIENTS, []).filter(r => r.recipe_id === 'ricetta-test');
  assert.strictEqual(again.length, 1, 'la riscrittura sostituisce, non accumula');

  console.log('PASS saveRecipeLinks: collegamento per id e per nome, righe senza corrispondenza contate');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
