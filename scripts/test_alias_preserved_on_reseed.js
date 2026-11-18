// Ingredient aliases on native SQLite: a seed re-run keeps the aliases the user added (real code on an
// in-memory SQLite via node:sqlite, expo-sqlite mocked). Run: NODE_PATH=$PWD/node_modules node scripts/test_alias_preserved_on_reseed.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
const raw = new DatabaseSync(':memory:');
const adapter = {
  execAsync: async sql => raw.exec(sql),
  getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
  getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
  runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
  // Same contract as expo-sqlite: the callback runs inside BEGIN/COMMIT, a throw rolls back
  withTransactionAsync: async fn => {
    raw.exec('BEGIN');
    try {
      await fn();
      raw.exec('COMMIT');
    } catch (e) {
      raw.exec('ROLLBACK');
      throw e;
    }
  },
};
require('module')._load = function (req) {
  if (req === 'react-native') return { Platform: { OS: 'ios' } };
  if (req === 'expo-sqlite') return { openDatabaseAsync: async () => adapter };
  if (/^(@expo|expo|react|i18next)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

const seedItem = (id, name, aliases) => ({
  id, name, type: 'condimenti', tags: [], edible_alone: true, default_amount: null, default_unit: '',
  purchase_amount: null, purchase_unit: '', density_g_per_ml: null, nutrients: {}, aliases,
});
const aliasesOf = id => raw.prepare("SELECT alias_key, source FROM ingredient_alias WHERE ingredient_id = ? ORDER BY alias_key").all(id).map(r => ({ ...r }));

(async () => {
  const { initDatabase } = require(path.join(ROOT, 'src/db/connection.ts'));
  const { SCHEMA_VERSION } = require(path.join(ROOT, 'src/db/schema.ts'));
  const { upsertIngredientsByName, writeImportIngredientsInTx } = require(path.join(ROOT, 'src/db/ingredientsDb.ts'));
  const { getDatabase } = require(path.join(ROOT, 'src/db/database.ts'));
  const { normalizeIngredientName } = require(path.join(ROOT, 'src/utils/catalogNameMatch.ts'));
  // Aliases are stored normalized (the seed path normalizes its own): the user key goes through the same function
  const USER_KEY = normalizeIngredientName('pepe');

  await initDatabase();
  assert.strictEqual(raw.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION, 'schema version');

  // T1: first seed, then the user adds an alias through an import choice
  await upsertIngredientsByName([seedItem('salt', 'Sale', ['sal']), seedItem('sugar', 'Zucchero', ['zucchero semolato'])]);
  await writeImportIngredientsInTx(getDatabase(), { created: [], aliases: [{ key: USER_KEY, ingredientId: 'salt' }] });
  assert.deepStrictEqual(aliasesOf('salt'), [{ alias_key: USER_KEY, source: 'user' }, { alias_key: 'sal', source: 'seed' }]);
  console.log('PASS T1 alias utente e seed salvati con la sorgente');

  // T2: re-seed with the same seed list keeps the user alias
  await upsertIngredientsByName([seedItem('salt', 'Sale', ['sal'])]);
  assert.ok(aliasesOf('salt').some(a => a.alias_key === USER_KEY && a.source === 'user'), 'alias utente conservato');
  console.log('PASS T2 re-seed: alias utente conservato');

  // T3: a seed alias that is removed from the seed list goes away; the user alias stays
  await upsertIngredientsByName([seedItem('salt', 'Sale', [])]);
  assert.deepStrictEqual(aliasesOf('salt'), [{ alias_key: USER_KEY, source: 'user' }], 'solo l alias utente');
  console.log('PASS T3 re-seed: alias seed rimosso, alias utente conservato');

  // T4: a seed alias never takes a key the user already owns on another ingredient
  await upsertIngredientsByName([seedItem('sugar', 'Zucchero', ['pepe'])]);
  assert.deepStrictEqual(aliasesOf('salt'), [{ alias_key: USER_KEY, source: 'user' }], 'pepe resta dell utente');
  assert.deepStrictEqual(aliasesOf('sugar'), [], 'nessun alias seed rubato');
  console.log('PASS T4 seed non ruba un alias utente');

  // T5: the schema rejects an owner other than seed or user
  assert.throws(() => raw.prepare("INSERT INTO ingredient_alias (alias_key, ingredient_id, source) VALUES ('x', 'salt', 'altro')").run(), /CHECK/);
  console.log('PASS T5 sorgente alias limitata a seed/user');
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
