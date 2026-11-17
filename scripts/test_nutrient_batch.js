// Regression: an ingredient's nutrients are written with a single multi-row INSERT (native, fake database).
// Run: NODE_PATH=$PWD/node_modules node scripts/test_nutrient_batch.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'react-native') return { Platform: { OS: 'android' } };
  if (req === 'expo-sqlite') return { openDatabaseAsync: async () => fakeDb };
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

const statements = [];
const fakeDb = {
  execAsync: async () => {},
  closeAsync: async () => {},
  withTransactionAsync: async task => { await task(); },
  runAsync: async (sql, params = []) => { statements.push({ sql, params }); return { changes: 1 }; },
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
};

(async () => {
  // initDatabase opens the database through expo-sqlite (replaced by the fake database)
  const dbMod = require(path.join(ROOT, 'src/db/database.ts'));
  await dbMod.initDatabase();
  statements.length = 0;
  const ingMod = require(path.join(ROOT, 'src/db/ingredientsDb.ts'));
  await ingMod.upsertIngredientsByName([{
    name: 'Test', type: 'altro', tags: [], edible_alone: false, default_amount: null, default_unit: '',
    purchase_amount: null, purchase_unit: '', density_g_per_ml: null,
    nutrients: { kcal: 10, proteine: 2, fibre: 1 },
  }]);
  const nutrientInserts = statements.filter(s => s.sql.includes('ingredient_nutrients'));
  assert.strictEqual(nutrientInserts.length, 1, 'una sola INSERT per tutti i nutrienti');
  const { sql, params } = nutrientInserts[0];
  const placeholders = (sql.match(/\?/g) || []).length;
  assert.strictEqual(placeholders, params.length, 'segnaposto e parametri coincidono');
  assert.strictEqual(params.length, 9, 'tre nutrienti per tre colonne');
  console.log('PASS insertNutrientRows: una INSERT multi-riga con parametri coerenti');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
