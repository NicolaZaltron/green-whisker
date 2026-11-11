// Uso: NODE_PATH=$PWD/node_modules node scripts/test_consolidation_units.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-amounts-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/shoppingAmounts.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { roundedWeightAmount, roundedVolumeAmount } = require(path.join(outDir, 'shoppingAmounts.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

check('990 g arrotondano a 1000 g -> 1 kg', () => {
  assert.deepStrictEqual(roundedWeightAmount(990), { amount: 1, unit: 'kg' });
});
check('975 g resta 975 g', () => {
  assert.deepStrictEqual(roundedWeightAmount(975), { amount: 975, unit: 'g' });
});
check('1010 g -> 1 kg (arrotondato a 1000)', () => {
  assert.deepStrictEqual(roundedWeightAmount(1010), { amount: 1, unit: 'kg' });
});
check('peso sotto 50 g -> minimo 50 g', () => {
  assert.deepStrictEqual(roundedWeightAmount(10), { amount: 50, unit: 'g' });
});
check('1050 g -> 1.1 kg', () => {
  assert.deepStrictEqual(roundedWeightAmount(1050), { amount: 1.1, unit: 'kg' });
});
check('990 ml arrotondano a 1000 ml -> 1 l', () => {
  assert.deepStrictEqual(roundedVolumeAmount(990), { amount: 1, unit: 'l' });
});
check('975 ml resta 975 ml', () => {
  assert.deepStrictEqual(roundedVolumeAmount(975), { amount: 975, unit: 'ml' });
});
check('500 ml arrotondati a multipli di 25', () => {
  assert.deepStrictEqual(roundedVolumeAmount(510), { amount: 500, unit: 'ml' });
});

console.log(`\n${passed} test ok`);
