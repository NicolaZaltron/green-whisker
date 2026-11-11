// Uso: NODE_PATH=$PWD/node_modules node scripts/test_simple_slots.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-slots-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/simpleSlots.ts'),
   '--rootDir', path.join(root, 'src'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { suggestedSlots, effectiveSlots } = require(path.join(outDir, 'utils/simpleSlots.js'));

let passed = 0;
let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed++;
    console.log('ok  ', label);
  } catch (error) {
    failed++;
    console.log('FAIL', label, '-', error.message);
  }
};

const sorted = slots => [...slots].sort();

check("'Asporto - cinese' FUORI CASA -> pranzo, cena (no colazione)", () => {
  assert.deepEqual(sorted(suggestedSlots({ name: 'Asporto - cinese', tags: ['FUORI CASA'] })), ['cena', 'pranzo']);
});
check("'Pesce surgelato' -> pranzo, cena", () => {
  assert.deepEqual(sorted(suggestedSlots({ name: 'Pesce surgelato', tags: ['PESCE', 'SURGELATO'] })), ['cena', 'pranzo']);
});
check("'Uova - sode' -> colazione", () => {
  assert.ok(suggestedSlots({ name: 'Uova - sode', tags: [] }).includes('colazione'));
});
check("'Melone' FRUTTA -> colazione", () => {
  assert.ok(suggestedSlots({ name: 'Melone', tags: ['FRUTTA'] }).includes('colazione'));
});
check("'Mozzarella' FORMAGGIO -> pranzo, cena, spuntino_pomeriggio", () => {
  assert.deepEqual(
    sorted(suggestedSlots({ name: 'Mozzarella', tags: ['FORMAGGIO'] })),
    ['cena', 'pranzo', 'spuntino_pomeriggio']
  );
});
check('effectiveSlots usa gli slot salvati se non vuoti', () => {
  assert.deepEqual(effectiveSlots({ name: 'Pesce surgelato', tags: ['PESCE'], slots: ['cena'] }), ['cena']);
});
check('effectiveSlots usa il suggerimento se slot salvati vuoti', () => {
  assert.deepEqual(
    sorted(effectiveSlots({ name: 'Melone', tags: ['FRUTTA'], slots: [] })),
    ['colazione', 'spuntino_mattina', 'spuntino_pomeriggio']
  );
});

console.log(`\n${passed} controlli superati, ${failed} falliti`);
fs.rmSync(outDir, { recursive: true, force: true });
if (failed > 0) {
  process.exit(1);
}
