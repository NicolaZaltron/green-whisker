// Regression: an ingredient's nutrients are written as ONE wide row (one column per nutrient, NULL when unknown).
// Runs against a fake database. Run: NODE_PATH=$PWD/node_modules node scripts/test_nutrient_batch.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'expo-sqlite') return { openDatabaseAsync: async () => fakeDb, deleteDatabaseAsync: async () => {} };
  if (req === 'react-native') return { Platform: { OS: 'web' } };
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

const statements = [];
let fakeDb = {
  execAsync: async () => {},
  closeAsync: async () => {},
  withTransactionAsync: async task => { await task(); },
  runAsync: async (sql, params = []) => { statements.push({ sql, params }); return { changes: 1 }; },
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
};

(async () => {
  // initDatabase opens the database through expo-sqlite: the fake database above
  const dbMod = require(path.join(ROOT, 'src/db/database.ts'));
  await dbMod.initDatabase();
  const ingMod = require(path.join(ROOT, 'src/db/ingredientsDb.ts'));
  statements.length = 0;
  await ingMod.upsertIngredientsByName([{
    name: 'Test', type: 'altro', tags: [], edible_alone: false, default_amount: null, default_unit: '',
    purchase_amount: null, purchase_unit: '', density_g_per_ml: null,
    nutrients: { kcal: 10, proteine: 2, fibre: 1 },
  }]);
  const nutrientInserts = statements.filter(s => s.sql.includes('ingredient_nutrition'));
  assert.strictEqual(nutrientInserts.length, 1, 'one INSERT for all the nutrients of an ingredient');
  const { sql, params } = nutrientInserts[0];
  const placeholders = (sql.match(/\?/g) || []).length;
  assert.strictEqual(placeholders, params.length, 'placeholders and parameters match');
  assert.strictEqual(params.length, 17, 'ingredient id plus the 16 nutrient columns');
  console.log('PASS insertNutrientRows: one wide INSERT with 16 nutrient columns');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
