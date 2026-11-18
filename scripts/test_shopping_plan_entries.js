// Shopping list input (phase 7): from today on, and without the servings already prepared.
// Runs the real database module in web mode. Run: NODE_PATH=$PWD/node_modules node scripts/test_shopping_plan_entries.js
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
const plannerService = require(path.join(ROOT, 'src/services/plannerService.ts'));

const entry = (id, date, extra) => ({ id, date, slot: 'pranzo', kind: 'recipe', recipe_id: 'r', recipe_source: 'prepare', servings: 2, count: 1, unit: '', created_at: 1, ...extra });

async function run() {
  store.set(db.WEB_STORAGE_KEYS.PLANNER, JSON.stringify([
    entry('past', '2026-11-10', {}),
    entry('today-prepare', '2026-11-17', {}),
    entry('future-ready', '2026-11-20', { recipe_source: 'ready' }),
    entry('future-prepare', '2026-11-21', {}),
    entry('future-ingredient', '2026-11-22', { kind: 'ingredient', recipe_id: null, ingredient_id: 'salt', recipe_source: null }),
  ]));

  const ids = (await db.getShoppingPlanEntries('2026-11-17')).map(e => e.id);
  assert.deepStrictEqual(ids, ['today-prepare', 'future-prepare', 'future-ingredient'], 'past and ready servings are excluded');
  console.log('PASS shopping input: from today on, ready servings excluded');

  const range = plannerService.planHistoryRange(['2026-11-17', '2026-11-23']);
  assert.deepStrictEqual(range, { fromDate: '2026-09-22', toDate: '2026-11-23' }, 'eight weeks of history before the first day');
  assert.strictEqual(plannerService.planHistoryRange([]), undefined, 'no dates: no range');
  console.log('PASS planner history window: 56 days before the first generated day');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
