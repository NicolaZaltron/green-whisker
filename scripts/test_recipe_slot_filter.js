// Uso: NODE_PATH=$PWD/node_modules node scripts/test_recipe_slot_filter.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-slots-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/recipeSlots.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { isRecipeForSlot } = require(path.join(outDir, 'utils/recipeSlots.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };
const recipe = recommended_slot => ({ id: 'r', title: 'R', recommended_slot });

check('colazione a colazione true, a pranzo false', () => {
  assert.equal(isRecipeForSlot(recipe('colazione'), 'colazione'), true);
  assert.equal(isRecipeForSlot(recipe('colazione'), 'pranzo'), false);
});
check('spuntino a spuntino_mattina true, a cena false', () => {
  assert.equal(isRecipeForSlot(recipe('spuntino'), 'spuntino_mattina'), true);
  assert.equal(isRecipeForSlot(recipe('spuntino'), 'cena'), false);
});
check('pranzo_cena a pranzo true, a colazione false', () => {
  assert.equal(isRecipeForSlot(recipe('pranzo_cena'), 'pranzo'), true);
  assert.equal(isRecipeForSlot(recipe('pranzo_cena'), 'colazione'), false);
});
check('senza slot: colazione false, pranzo true', () => {
  assert.equal(isRecipeForSlot(recipe(undefined), 'colazione'), false);
  assert.equal(isRecipeForSlot(recipe(undefined), 'pranzo'), true);
});
check('senza slot: spuntino_pomeriggio false, cena true', () => {
  assert.equal(isRecipeForSlot(recipe(undefined), 'spuntino_pomeriggio'), false);
  assert.equal(isRecipeForSlot(recipe(undefined), 'cena'), true);
});
check('valori inglesi breakfast, snack, lunch_dinner', () => {
  assert.equal(isRecipeForSlot(recipe('breakfast'), 'colazione'), true);
  assert.equal(isRecipeForSlot(recipe('breakfast'), 'cena'), false);
  assert.equal(isRecipeForSlot(recipe('snack'), 'spuntino_pomeriggio'), true);
  assert.equal(isRecipeForSlot(recipe('snack'), 'pranzo'), false);
  assert.equal(isRecipeForSlot(recipe('lunch_dinner'), 'cena'), true);
  assert.equal(isRecipeForSlot(recipe('lunch_dinner'), 'spuntino_mattina'), false);
});

console.log(`${passed} test passed`);
fs.rmSync(outDir, { recursive: true, force: true });
