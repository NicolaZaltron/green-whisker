// Uso: NODE_PATH=$PWD/node_modules node scripts/test_shopping_plan_save.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-plansave-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/services/shoppingPlanSave.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { buildShoppingInputs } = require(path.join(outDir, 'services/shoppingPlanSave.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

check('amount null: solo nome', () => {
  const r = buildShoppingInputs([{ name: 'sale', unit: '', amount: null }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].ingredientText, 'sale');
  assert.equal(r[0].amount, null);
});
check('trim nomi', () => {
  const r = buildShoppingInputs([{ name: '  uova  ', unit: ' pz ', amount: 2 }]);
  assert.equal(r[0].name, 'uova');
  assert.equal(r[0].unit, 'pz');
});
check('zero e nome vuoto saltati', () => {
  assert.equal(buildShoppingInputs([{ name: 'a', unit: 'g', amount: 0 }, { name: '  ', unit: 'g', amount: 5 }]).length, 0);
});
check('duplicati rimossi', () => {
  const r = buildShoppingInputs([
    { name: 'uova', unit: 'pz', amount: 2 },
    { name: ' Uova ', unit: 'pz', amount: 6 },
    { name: 'uova', unit: 'g', amount: 100 },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].amount, 2);
});
check('ingredientText formato', () => {
  assert.equal(buildShoppingInputs([{ name: 'uova', unit: 'pz', amount: 2 }])[0].ingredientText, '2 pz uova');
  assert.equal(buildShoppingInputs([{ name: 'banane', unit: '', amount: 10 }])[0].ingredientText, '10 banane');
});
check('quantita digitata non modificata, sourceLabel -> recipeTitle', () => {
  const r = buildShoppingInputs([{ name: 'banane', unit: 'pz', amount: 10, sourceLabel: 'Lun cena' }])[0];
  assert.equal(r.amount, 10);
  assert.equal(r.recipeTitle, 'Lun cena');
  assert.equal(r.recipeId, undefined);
});
check('amount non valido lancia', () => {
  for (const bad of [-1, NaN, Infinity, '3']) {
    assert.throws(() => buildShoppingInputs([{ name: 'x', unit: 'g', amount: bad }]), /invalid_amount/);
  }
});

console.log(`\n${passed} test passati`);
