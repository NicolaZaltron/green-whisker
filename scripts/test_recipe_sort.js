// Recipe list order: alphabetical (Italian, accents and numbers), creation and last change dates, both directions.
// Run: node scripts/test_recipe_sort.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const S = require(path.join(ROOT, 'src/utils/recipeSort.ts'));

const list = [
  { id: 'b', title: 'Risotto', created_at: 200, updated_at: 900 },
  { id: 'a', title: 'Àcqua fresca', created_at: 100, updated_at: 300 },
  { id: 'c', title: 'Pasta 10', created_at: 300, updated_at: 100 },
  { id: 'd', title: 'Pasta 2', created_at: 300, updated_at: 500 },
];
const ids = sorted => sorted.map(r => r.id).join(',');

assert.strictEqual(ids(S.sortRecipes(list, { key: 'alpha', direction: 'asc' })), 'a,d,c,b', 'alphabetical, accents and numbers');
assert.strictEqual(ids(S.sortRecipes(list, { key: 'alpha', direction: 'desc' })), 'b,c,d,a', 'alphabetical descending');
console.log('PASS alphabetical ascending and descending (Italian collation, numbers in order)');

assert.strictEqual(ids(S.sortRecipes(list, { key: 'created', direction: 'asc' })), 'a,b,d,c', 'creation date ascending, ties by title');
assert.strictEqual(ids(S.sortRecipes(list, { key: 'created', direction: 'desc' })), 'c,d,b,a', 'creation date descending');
console.log('PASS creation date ascending and descending');

assert.strictEqual(ids(S.sortRecipes(list, { key: 'updated', direction: 'asc' })), 'c,a,d,b', 'last change ascending');
assert.strictEqual(ids(S.sortRecipes(list, { key: 'updated', direction: 'desc' })), 'b,d,a,c', 'last change descending');
console.log('PASS last change ascending and descending');

const original = list.map(r => r.id).join(',');
S.sortRecipes(list, S.DEFAULT_RECIPE_SORT);
assert.strictEqual(list.map(r => r.id).join(','), original, 'the input list is not reordered');
assert.deepStrictEqual(S.DEFAULT_RECIPE_SORT, { key: 'alpha', direction: 'asc' }, 'default is alphabetical ascending');
console.log('PASS the input is not changed; default is alphabetical ascending');

console.log('All checks passed');
