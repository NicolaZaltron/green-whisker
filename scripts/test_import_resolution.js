// Checks the import resolution (src/utils/importResolution.ts): unknown ingredient names are grouped,
// the user's choices resolve them, and created ingredient ids never collide. Run: node scripts/test_import_resolution.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const R = require(path.join(ROOT, 'src/utils/importResolution.ts'));

const row = (ingredient, extra = {}) => ({ section: 'Principale', text: `1 x ${ingredient}`, amount: 1, unit: 'x', ingredient, ...extra });
const known = [
  { id: 'salt', name: 'Sale', aliases: ['sale fino'] },
  { id: 'olive_oil', name: 'Olio extravergine di oliva', aliases: [] },
];
const entries = [
  { recipeId: 'r1', recipeTitle: 'Pasta al sugo', items: [row('Sale'), row('Pomodori secchi'), row('Basilico')] },
  { recipeId: 'r2', recipeTitle: 'Pesto veloce', items: [row('Basilico'), row('sale fino', { ingredient_id: 'missing' }), row('Olio extravergine di oliva', { ingredient_id: 'olive_oil' })] },
];

// 1) Unknown names are grouped once, with the recipes that use them
const unresolved = R.findUnresolvedIngredients(entries, known);
assert.deepStrictEqual(unresolved.map(u => u.name), ['Basilico', 'Pomodori secchi']);
assert.deepStrictEqual(unresolved.find(u => u.name === 'Basilico').recipeTitles, ['Pasta al sugo', 'Pesto veloce']);
console.log('PASS unknown names are grouped with their recipes');

// 2) Known names, aliases and valid ids are not reported
assert.ok(!unresolved.some(u => u.name === 'Sale' || u.name === 'sale fino'), 'name and alias resolve');
console.log('PASS known names, aliases and ids are not reported as unknown');

// 3) A user choice resolves the unknown name (by its normalized key)
const knownIds = new Set(known.map(k => k.id));
const choices = new Map([[unresolved.find(u => u.name === 'Basilico').key, 'user_basilico']]);
const basil = entries[0].items[2];
assert.strictEqual(R.resolveRowIdWithChoices(basil, knownIds, known, choices), 'user_basilico');
assert.strictEqual(R.resolveRowIdWithChoices(entries[0].items[1], knownIds, known, choices), null, 'no choice, no id');
console.log('PASS a choice resolves every row with the same name');

// 4) Created ids never collide with known ids or with each other
const taken = new Set(known.map(k => k.id));
const a = R.userIngredientId('Tempeh affumicato', taken);
const b = R.userIngredientId('Tempeh affumicato', taken);
const c = R.userIngredientId('Tempeh affumicato!', taken);
assert.strictEqual(a, 'user_tempeh_affumicato');
assert.strictEqual(b, 'user_tempeh_affumicato_2');
assert.strictEqual(c, 'user_tempeh_affumicato_3');
assert.strictEqual(R.userIngredientId('Àcqua', new Set()), 'user_acqua');
console.log('PASS created ids are user_<slug> with a suffix on collision');

console.log('All checks passed');
