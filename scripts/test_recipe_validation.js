// Validation of imported recipes (point 13.1): each malformed case is refused with its reason,
// junk items inside the lists are dropped, and the official files stay fully valid.
// Run: node scripts/test_recipe_validation.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const F = require(path.join(ROOT, 'src/services/catalogFormat.ts'));

const valid = {
  id: 'pasta-test', title: 'Pasta test', category: 'CAT_PRIMI_PIATTI', servings: 2, times: { total_minutes: 10 },
  ingredients: ['160 grammi Pasta'], instructions: ['Cuocete.'], tags: ['VEGANO'],
  detailed_ingredients: [{ ingredient: 'Pasta', text: '160 grammi Pasta', amount: 160, unit: 'grammi' }],
};
const withField = (patch) => ({ ...valid, ...patch });

const CASES = [
  [null, 'not_object'],
  [[valid], 'not_object'],
  [withField({ id: '' }), 'id_missing'],
  [withField({ title: 42 }), 'title_missing'],
  [withField({ category: undefined }), 'category_missing'],
  [withField({ instructions: 'un testo, non una lista' }), 'instructions_missing'],
  [withField({ times: null }), 'times_missing'],
  [withField({ servings: 0 }), 'servings_invalid'],
  [withField({ servings: '2' }), 'servings_invalid'],
  [withField({ variant_of: 7 }), 'variant_of_invalid'],
  [withField({ detailed_ingredients: [{ amount: 1, unit: 'g' }] }), 'detailed_ingredients_invalid'],
  [withField({ detailed_ingredients: [{ ingredient: 'Sale', amount: 'molto' }] }), 'detailed_amount_invalid'],
];

for (const [value, reason] of CASES) {
  assert.strictEqual(F.invalidReason(value), reason, `reason for ${JSON.stringify(value)?.slice(0, 60)}`);
}
console.log(`PASS ${CASES.length} malformed recipes refused with the right reason`);

// Junk inside the lists: the recipe is kept, the junk is dropped
const text = JSON.stringify([withField({ instructions: ['Cuocete.', null, 3], tags: ['VEGANO', {}], ingredients: ['160 grammi Pasta', false] }), withField({ id: 'x', servings: 'due' })]);
const parsed = F.parseCatalogText(text);
assert.strictEqual(parsed.recipes.length, 1, 'the valid recipe is kept');
assert.deepStrictEqual(parsed.recipes[0].instructions, ['Cuocete.'], 'non-text instructions dropped');
assert.deepStrictEqual(parsed.recipes[0].tags, ['VEGANO'], 'non-text tags dropped');
assert.strictEqual(parsed.invalid, 1, 'one recipe counted as invalid');
assert.deepStrictEqual(parsed.invalidReasons, { servings_invalid: 1 }, 'the reason is counted');
console.log('PASS junk items are dropped, the recipe stays, the reason is counted');

// The official files stay valid
const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/bundledRecipes.json'), 'utf8'));
const official = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/ricette.json'), 'utf8'));
const pb = F.parseCatalogText(JSON.stringify(bundled));
assert.strictEqual(pb.invalid, 0, 'bundled recipes are all valid');
const po = F.parseCatalogText(JSON.stringify(official));
assert.strictEqual(po.invalid, 0, `official recipes are all valid (${JSON.stringify(po.invalidReasons)})`);
console.log(`PASS bundled (${pb.recipes.length}) and official (${po.recipes.length}) recipes are valid`);

console.log('All checks passed');
