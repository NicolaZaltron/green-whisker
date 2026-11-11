// Uso: NODE_PATH=$PWD/node_modules node scripts/test_out_of_home_labels.js
// Testa la mappa delle rinomine e la lista opzioni fuori casa. Il database non viene testato
// (richiede expo-sqlite): il modulo viene caricato con react-native ed expo-sqlite stubbati.
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const Module = require('module');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-labels-'));
// tsc emette anche con errori di tipo nel grafo degli import: si controlla l'output, non il codice di uscita
spawnSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/constants/outOfHome.ts'), path.join(root, 'src/db/database.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'ignore' }
);
for (const f of ['constants/outOfHome.js', 'db/database.js']) {
  assert.ok(fs.existsSync(path.join(outDir, f)), `tsc non ha emesso ${f}`);
}

const stubs = { 'react-native': { Platform: { OS: 'ios' } }, 'expo-sqlite': {} };
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
  return originalLoad.call(this, request, ...rest);
};

const { OUT_OF_HOME_OPTIONS } = require(path.join(outDir, 'constants/outOfHome.js'));
const { OUT_OF_HOME_LABEL_RENAMES } = require(path.join(outDir, 'db/database.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

check('mappa: Asporto pizza -> Asporto - Pizza', () => {
  assert.equal(OUT_OF_HOME_LABEL_RENAMES['Asporto pizza'], 'Asporto - Pizza');
});
check('mappa: Asporto cinese -> Asporto - Cinese', () => {
  assert.equal(OUT_OF_HOME_LABEL_RENAMES['Asporto cinese'], 'Asporto - Cinese');
});
check('mappa: esattamente due coppie', () => {
  assert.deepEqual(Object.keys(OUT_OF_HOME_LABEL_RENAMES).sort(), ['Asporto cinese', 'Asporto pizza']);
});
check('mappa: nessun nuovo nome e anche una chiave (idempotenza)', () => {
  for (const newLabel of Object.values(OUT_OF_HOME_LABEL_RENAMES)) {
    assert.ok(!Object.prototype.hasOwnProperty.call(OUT_OF_HOME_LABEL_RENAMES, newLabel), newLabel);
  }
});
check('opzioni: ogni nuovo nome e presente in OUT_OF_HOME_OPTIONS', () => {
  for (const newLabel of Object.values(OUT_OF_HOME_LABEL_RENAMES)) {
    assert.ok(OUT_OF_HOME_OPTIONS.includes(newLabel), `manca: ${newLabel}`);
  }
});
check('opzioni: nessun vecchio nome e piu in OUT_OF_HOME_OPTIONS', () => {
  for (const oldLabel of Object.keys(OUT_OF_HOME_LABEL_RENAMES)) {
    assert.ok(!OUT_OF_HOME_OPTIONS.includes(oldLabel), `ancora presente: ${oldLabel}`);
  }
});

console.log(`\n${passed} test superati`);
