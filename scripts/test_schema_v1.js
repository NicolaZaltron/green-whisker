// Checks the database schema (src/db/schema.ts) on an in-memory SQLite (Node's built-in node:sqlite,
// wrapped to the expo-sqlite async API). Run: node scripts/test_schema_v1.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.resolve(__dirname, '..');
const origLoad = require('module')._load;
require('module')._load = function (req) {
  if (/^(@expo|expo|react)/.test(req)) return new Proxy({}, { get: (t, k) => (k === '__esModule' ? true : () => ({})) });
  return origLoad.apply(this, arguments);
};
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};

const { applySchema, SCHEMA_VERSION } = require(path.join(ROOT, 'src/db/schema.ts'));

// Adapter with the expo-sqlite async names used by the app
function open() {
  const raw = new DatabaseSync(':memory:');
  return {
    raw,
    execAsync: async sql => raw.exec(sql),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
  };
}

const INGREDIENT = "INSERT INTO ingredient (id, name, name_key, type, created_at, updated_at) VALUES ('salt', 'Sale', 'sale', 'condimenti', 1, 1)";
const RECIPE = "INSERT INTO recipe (id, summary_json, category, diet, origin, created_at, updated_at) VALUES ('r1', '{}', 'CAT_PASTA', 'vegano', 'file', 1, 1)";
const LINK = "INSERT INTO recipe_ingredient (recipe_id, ingredient_id, position) VALUES ('r1', 'salt', 0)";
const PLAN = "INSERT INTO meal_plan (id, date, slot, kind, ingredient_id, created_at) VALUES ('p1', '2026-11-17', 'pranzo', 'ingredient', 'salt', 1)";

async function run() {
  const db = open();
  await applySchema(db);

  const version = db.raw.prepare('PRAGMA user_version').get().user_version;
  assert.strictEqual(version, SCHEMA_VERSION, 'user_version set');
  console.log(`PASS schema created at version ${version}`);

  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name);
  for (const t of ['recipe', 'recipe_body', 'ingredient', 'ingredient_alias', 'recipe_ingredient', 'meal_plan', 'ready_meal', 'favorite', 'recipe_note', 'ingredient_nutrition', 'kv_store', 'seed_meta']) {
    assert.ok(tables.includes(t), `table ${t} exists`);
  }
  console.log(`PASS ${tables.length} tables created`);

  assert.strictEqual(db.raw.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'foreign keys on');
  console.log('PASS foreign keys enabled');

  // Cascade: deleting an ingredient removes its links and planned entries, not the recipe
  await db.runAsync(INGREDIENT);
  await db.runAsync(RECIPE);
  await db.runAsync(LINK);
  await db.runAsync(PLAN);
  await db.runAsync("DELETE FROM ingredient WHERE id = 'salt'");
  assert.strictEqual((await db.getFirstAsync('SELECT COUNT(*) AS n FROM recipe_ingredient')).n, 0, 'links cascade');
  assert.strictEqual((await db.getFirstAsync('SELECT COUNT(*) AS n FROM meal_plan')).n, 0, 'planned entries cascade');
  assert.strictEqual((await db.getFirstAsync('SELECT COUNT(*) AS n FROM recipe')).n, 1, 'recipe kept');
  console.log('PASS deleting an ingredient cascades to links and planned entries, not to recipes');

  // A link to an unknown ingredient is refused (no orphan rows)
  await assert.rejects(db.runAsync(LINK.replace("'salt'", "'missing'")), /FOREIGN KEY/);
  console.log('PASS link to an unknown ingredient is refused');

  // CHECK constraints
  await db.runAsync(INGREDIENT.replace("'salt'", "'x'").replace("'Sale', 'sale'", "'X', 'x'"));
  await assert.rejects(db.runAsync("INSERT INTO ingredient (id, name, name_key, type, created_at, updated_at) VALUES ('bad', 'B', 'b', 'inesistente', 1, 1)"), /CHECK/);
  await assert.rejects(db.runAsync("INSERT INTO meal_plan (id, date, slot, kind, servings, created_at) VALUES ('p2', '2026-11-17', 'pranzo', 'recipe', 25, 1)"), /CHECK/);
  console.log('PASS CHECK constraints refuse invalid type and servings above 24');

  // Idempotent: a second call keeps the data
  await db.runAsync(INGREDIENT);
  await applySchema(db);
  assert.strictEqual((await db.getFirstAsync("SELECT COUNT(*) AS n FROM ingredient WHERE id = 'salt'")).n, 1, 'data kept on second call');
  console.log('PASS applySchema is idempotent');

  // The ingredient writes must never replace a row that has children
  const src = fs.readFileSync(path.join(ROOT, 'src/db/ingredientsDb.ts'), 'utf8');
  assert.ok(!/INSERT OR REPLACE INTO ingredient\b/.test(src), 'no INSERT OR REPLACE on ingredients');
  const meals = fs.readFileSync(path.join(ROOT, 'src/db/readyMealsDb.ts'), 'utf8');
  assert.ok(!/INSERT OR REPLACE INTO ready_meal\b/.test(meals), 'no INSERT OR REPLACE on ready_meals');
  console.log('PASS no REPLACE writes on tables with children');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
