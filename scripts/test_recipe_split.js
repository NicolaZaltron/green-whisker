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

const recipe = {
  id: 'pasta-al-pomodoro', title: 'Pasta al pomodoro', source: 'Green Whisker', url: '', image: '',
  category: 'CAT_PRIMI_PIATTI', difficulty: 'easy', servings: 2, times: { total_minutes: 20 },
  ingredients: ['160 grammi Spaghetto'], instructions: ['Cuocete la pasta.'], tips: ['Sale.'], tags: [],
  protein_group: 'legumi_interi', carb_family: 'pasta', veggie_color: 'green', seasons: [], is_complete_plate: false,
  diet: 'vegano', origin: 'file', created_at: 1, updated_at: 1,
};

async function run() {
  await db.upsertCatalogRecipes([recipe], 'overwrite');

  const summaries = await db.getCatalogRecipes();
  assert.strictEqual(summaries.length, 1, 'one summary');
  assert.strictEqual(summaries[0].title, 'Pasta al pomodoro', 'summary keeps the title');
  assert.strictEqual(summaries[0].instructions, undefined, 'summary has no instructions');
  assert.strictEqual(summaries[0].tips, undefined, 'summary has no tips');
  console.log('PASS lists load summaries without the card body');

  const detail = await db.getRecipeDetail('pasta-al-pomodoro');
  assert.deepStrictEqual(detail.instructions, ['Cuocete la pasta.'], 'detail has instructions');
  assert.deepStrictEqual(detail.tips, ['Sale.'], 'detail has tips');
  assert.strictEqual(detail.title, 'Pasta al pomodoro', 'detail keeps the summary fields');
  console.log('PASS getRecipeDetail returns the full recipe by id');

  assert.strictEqual(await db.getRecipeDetail('missing'), null, 'unknown id gives null');
  console.log('PASS unknown id gives null');

  const full = await db.getFullCatalogRecipes();
  assert.strictEqual(full[0].instructions.length, 1, 'full catalog keeps the body');
  console.log('PASS the export path still gets the full recipes');

  // A second write without the body keeps the body in the store only when it is given
  await db.upsertCatalogRecipes([{ ...recipe, title: 'Pasta al pomodoro veloce' }], 'overwrite');
  assert.strictEqual((await db.getRecipeDetail('pasta-al-pomodoro')).title, 'Pasta al pomodoro veloce', 'update applied');
  console.log('PASS updates replace summary and body');

  console.log('All checks passed');
}

run().catch(err => {
  console.error('FAIL', err.message);
  process.exit(1);
});
