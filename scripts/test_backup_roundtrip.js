// Backup round trip: data created in one database is collected, then restored into an empty database,
// and the counts match. Runs the real services on in-memory SQLite. Run: NODE_PATH=$PWD/node_modules node scripts/test_backup_roundtrip.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const adapterFor = raw => ({
  execAsync: async sql => raw.exec(sql),
  closeAsync: async () => {},
  withTransactionAsync: async task => { await task(); },
  getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
  getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
  runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
});
let current = null;
const store = new Map();
global.window = { localStorage: {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, v),
  removeItem: k => store.delete(k),
} };

const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (req === 'expo-sqlite') return { openDatabaseAsync: async () => current, deleteDatabaseAsync: async () => {} };
  if (req === 'react-native') return { Platform: { OS: 'web' } };
  if (req === 'react-i18next') return { initReactI18next: { type: '3rdParty', init() {} }, useTranslation: () => ({ t: k => k }) };
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

const db = require(path.join(ROOT, 'src/db/database.ts'));
const seed = require(path.join(ROOT, 'src/services/ingredientsService.ts'));
const catalogSeed = require(path.join(ROOT, 'src/services/catalogSeedService.ts'));
const backup = require(path.join(ROOT, 'src/services/backupService.ts'));

async function openFresh() {
  current = adapterFor(new DatabaseSync(':memory:'));
  await db.initDatabase();
  return current;
}
const count = async (sql) => (await current.getFirstAsync(sql)).n;

async function run() {
  // 1. a database with real data
  await openFresh();
  await seed.seedIngredientsV2();
  await catalogSeed.seedReadyMealsV2();
  await catalogSeed.seedBundledRecipesV1();
  await current.runAsync("INSERT INTO meal_plan (id, date, slot, kind, recipe_id, recipe_source, servings, unit, count, created_at) VALUES ('p1', '2026-11-20', 'pranzo', 'recipe', 'pasta-al-pomodoro', 'prepare', 2, '', 1, 1)");
  await current.runAsync("INSERT INTO meal_plan (id, date, slot, kind, ready_meal_id, unit, count, servings, created_at) VALUES ('p2', '2026-11-21', 'cena', 'ready', 'minestrone_surgelato', '', 1, 2, 1)");
  await current.runAsync("INSERT INTO favorite (recipe_id, created_at) VALUES ('pasta-al-pomodoro', 1)");
  await current.runAsync("INSERT INTO recipe_note (recipe_id, notes, updated_at) VALUES ('pasta-al-pomodoro', 'provata', 1)");
  await db.setKV('gw_planner_last_gen', '2026-11-16');
  const before = {
    ingredients: await count('SELECT COUNT(*) AS n FROM ingredient'),
    recipes: await count('SELECT COUNT(*) AS n FROM recipe'),
    readyMeals: await count('SELECT COUNT(*) AS n FROM ready_meal'),
    planner: await count('SELECT COUNT(*) AS n FROM meal_plan'),
    favorites: await count('SELECT COUNT(*) AS n FROM favorite'),
    notes: await count('SELECT COUNT(*) AS n FROM recipe_note'),
  };
  const data = JSON.parse(JSON.stringify(await backup.collectBackup()));

  // 2. an empty database receives the backup
  await openFresh();
  const summary = await backup.restoreBackup(data);
  const after = {
    ingredients: await count('SELECT COUNT(*) AS n FROM ingredient'),
    recipes: await count('SELECT COUNT(*) AS n FROM recipe'),
    readyMeals: await count('SELECT COUNT(*) AS n FROM ready_meal'),
    planner: await count('SELECT COUNT(*) AS n FROM meal_plan'),
    favorites: await count('SELECT COUNT(*) AS n FROM favorite'),
    notes: await count('SELECT COUNT(*) AS n FROM recipe_note'),
  };
  assert.deepStrictEqual(after, before, 'every table has the same count after the restore');
  console.log(`PASS restore reproduces the counts: ${JSON.stringify(after)}`);
  assert.strictEqual(summary.droppedPlannerEntries, 0, 'no planner entry dropped');
  assert.strictEqual(await db.getKV('gw_planner_last_gen'), '2026-11-16', 'key-value settings restored');
  console.log('PASS planner entries and settings restored, nothing dropped');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
