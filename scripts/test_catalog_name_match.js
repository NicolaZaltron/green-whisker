// Uso: NODE_PATH=$PWD/node_modules node scripts/test_catalog_name_match.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-catalog-match-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/catalogNameMatch.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { matchCatalogName } = require(path.join(outDir, 'catalogNameMatch.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

// Helper: convert simple name arrays to {name} entries
const toEntries = (names) => names.map(n => ({name: n}));

check('quantita e unita rimosse, match su Mandorle', () => {
  assert.deepEqual(matchCatalogName('200 g di Mandorle', toEntries(['Mandorle', 'Uova'])), { name: 'Mandorle', matched: true });
});

check('parentesi rimosse, match su Uova', () => {
  assert.deepEqual(matchCatalogName('Uova (2 medie)', toEntries(['Uova', 'Mandorle'])), { name: 'Uova', matched: true });
});

check('sinonimo Pomodori pelati -> Pomodori pelati in scatola', () => {
  assert.deepEqual(
    matchCatalogName('Pomodori pelati', toEntries(['Pomodori pelati in scatola', 'Uova'])),
    { name: 'Pomodori pelati in scatola', matched: true }
  );
});

check('plurale/singolare e d\' -> di', () => {
  assert.deepEqual(matchCatalogName("3 cucchiai d'Olio di oliva", toEntries(['Olio di oliva'])), { name: 'Olio di oliva', matched: true });
});

check('Avena -> Fiocchi di avena', () => {
  assert.deepEqual(matchCatalogName('Avena', toEntries(['Fiocchi di avena'])), { name: 'Fiocchi di avena', matched: true });
});

check('q.b. rimosso', () => {
  assert.deepEqual(matchCatalogName('q.b. di Sale', toEntries(['Sale'])), { name: 'Sale', matched: true });
});

check('Quinoa tricolore non in catalogo: nome invariato, matched false', () => {
  assert.deepEqual(matchCatalogName('Quinoa tricolore', toEntries(['Mandorle', 'Uova'])), { name: 'Quinoa tricolore', matched: false });
});

// Test matching via aliases (nuovo: gli alias sono indicizzati per il matching)
check('match tramite alias: "orange" -> "Arancia"', () => {
  const entries = [
    {name: 'Arancia', aliases: ['arancia', 'arance', 'orange', 'oranges']},
    {name: 'Uova', aliases: ['uova', 'egg', 'eggs']},
  ];
  assert.deepEqual(matchCatalogName('orange', entries), { name: 'Arancia', matched: true });
});

check('match tramite alias: "egg" -> "Uova"', () => {
  const entries = [
    {name: 'Arancia', aliases: ['arancia', 'arance', 'orange', 'oranges']},
    {name: 'Uova', aliases: ['uova', 'egg', 'eggs']},
  ];
  assert.deepEqual(matchCatalogName('egg', entries), { name: 'Uova', matched: true });
});

check('match tramite alias: "oranges" (plurale) -> "Arancia"', () => {
  const entries = [
    {name: 'Arancia', aliases: ['arancia', 'arance', 'orange', 'oranges']},
  ];
  assert.deepEqual(matchCatalogName('oranges', entries), { name: 'Arancia', matched: true });
});

check('senza alias: comportamento identico a prima', () => {
  assert.deepEqual(matchCatalogName('Sale', toEntries(['Sale'])), { name: 'Sale', matched: true });
  assert.deepEqual(matchCatalogName('Quinoa', toEntries(['Sale'])), { name: 'Quinoa', matched: false });
});

console.log(`\n${passed} test passati`);
