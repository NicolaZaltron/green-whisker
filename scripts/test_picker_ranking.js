// Uso: NODE_PATH=$PWD/node_modules node scripts/test_picker_ranking.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ranking-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/pickerRanking.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { rankPickerMatches, orderWithFavoritesFirst } = require(path.join(outDir, 'pickerRanking.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

const item = (kind, label) => ({ kind, label, value: label });
const labels = rows => rows.map(r => r.label);

check('query "mel": inizio prima, poi contenuti; Ristorante escluso', () => {
  const items = [
    item('ingredient', 'Aceto di mele'),
    item('ingredient', 'Mele'),
    item('ready', 'Melanzane pronte'),
    item('recipe', 'Besciamella'),
    item('out', 'Ristorante'),
  ];
  // Besciamella contiene "mel" (be-sciamella), quindi entra nel gruppo "contiene" dopo Aceto di mele
  assert.deepEqual(labels(rankPickerMatches(items, 'mel')), [
    'Mele', 'Melanzane pronte', 'Aceto di mele', 'Besciamella',
  ]);
});

check('query case-insensitive e con spazi', () => {
  const items = [item('ingredient', 'Aceto di mele'), item('ingredient', 'Mele')];
  assert.deepEqual(labels(rankPickerMatches(items, '  MEL ')), ['Mele', 'Aceto di mele']);
});

check('ordine gruppi: ingredient-inizio, ready-inizio, recipe-inizio, out-inizio, poi contenuti', () => {
  const items = [
    item('out', 'Dabba bar'),
    item('recipe', 'Lasagna con zabaione'),
    item('ready', 'Pizza tabasco'),
    item('ingredient', 'Cabina'),
    item('out', 'Abbuffata'),
    item('recipe', 'Abruzzese'),
    item('ready', 'Abbacchio pronto'),
    item('ingredient', 'Abete'),
    item('out', 'Bar Gabbiano'),
    item('recipe', 'Crostata zabaglione'),
    item('ready', 'Tabasco pronto'),
    item('ingredient', 'Sabbia'),
  ];
  assert.deepEqual(labels(rankPickerMatches(items, 'ab')), [
    'Abete',                // ingredient inizio
    'Abbacchio pronto',     // ready inizio
    'Abruzzese',            // recipe inizio
    'Abbuffata',            // out inizio
    'Cabina',               // ingredient contiene
    'Sabbia',               // ingredient contiene
    'Pizza tabasco',        // ready contiene
    'Tabasco pronto',       // ready contiene
    'Crostata zabaglione',  // recipe contiene
    'Lasagna con zabaione', // recipe contiene
    'Bar Gabbiano',         // out contiene
    'Dabba bar',            // out contiene
  ]);
});

check('ordine alfabetico dentro ogni gruppo', () => {
  const items = [
    item('ingredient', 'Zucchina'),
    item('ingredient', 'Zenzero'),
    item('recipe', 'Zuppa'),
    item('recipe', 'Zabaione'),
  ];
  assert.deepEqual(labels(rankPickerMatches(items, 'z')), [
    'Zenzero', 'Zucchina', 'Zabaione', 'Zuppa',
  ]);
});

check('query vuota: ordine di input invariato', () => {
  const items = [
    item('recipe', 'Zuppa'),
    item('ingredient', 'Aceto'),
    item('out', 'Ristorante'),
    item('ready', 'Pizza'),
  ];
  assert.deepEqual(rankPickerMatches(items, '').map(r => r.value), items.map(r => r.value));
  assert.deepEqual(rankPickerMatches(items, '   ').map(r => r.value), items.map(r => r.value));
});

const recipe = (label, id) => ({ kind: 'recipe', label, value: label, id });

check('preferiti: "las" con "Lasagna vegetariana" preferita prima di "Lasagna ai funghi"', () => {
  const items = [
    recipe('Lasagna ai funghi', 'r2'),
    recipe('Lasagna vegetariana', 'r1'),
  ];
  assert.deepEqual(labels(rankPickerMatches(items, 'las', new Set(['r1']))), [
    'Lasagna vegetariana', 'Lasagna ai funghi',
  ]);
});

check('preferiti nel gruppo "contiene" restano dopo tutti i gruppi "inizio"', () => {
  const items = [
    recipe('Crostata zabaglione', 'f1'),
    recipe('Abruzzese', 'r1'),
    recipe('Abbacchio', 'r2'),
  ];
  assert.deepEqual(labels(rankPickerMatches(items, 'ab', new Set(['f1']))), [
    'Abbacchio', 'Abruzzese', 'Crostata zabaglione',
  ]);
});

check('senza favoriteIds: ordine precedente invariato', () => {
  const items = [
    recipe('Lasagna vegetariana', 'r1'),
    recipe('Lasagna ai funghi', 'r2'),
  ];
  assert.deepEqual(labels(rankPickerMatches(items, 'las')), [
    'Lasagna ai funghi', 'Lasagna vegetariana',
  ]);
  assert.deepEqual(labels(rankPickerMatches(items, 'las', new Set())), [
    'Lasagna ai funghi', 'Lasagna vegetariana',
  ]);
});

check('nessun match: array vuoto', () => {
  assert.deepEqual(rankPickerMatches([item('recipe', 'Zuppa')], 'xyz'), []);
});

const rec = (id, title) => ({ id, title });

check('query vuota: preferite prima, poi le altre; alfabetico dentro ogni parte', () => {
  const recipes = [
    rec('r1', 'Zuppa'),
    rec('f2', 'Lasagna vegetariana'),
    rec('r2', 'Abruzzese'),
    rec('f1', 'Besciamella'),
    rec('f3', 'Crostata'),
  ];
  const ids = orderWithFavoritesFirst(recipes, new Set(['f1', 'f2', 'f3'])).map(r => r.id);
  assert.deepEqual(ids, ['f1', 'f3', 'f2', 'r2', 'r1']);
});

check('query vuota senza preferiti: ordine alfabetico', () => {
  const recipes = [rec('r1', 'Zuppa'), rec('r2', 'abbacchio'), rec('r3', 'Lasagna')];
  assert.deepEqual(orderWithFavoritesFirst(recipes, new Set()).map(r => r.title),
    ['abbacchio', 'Lasagna', 'Zuppa']);
  assert.deepEqual(orderWithFavoritesFirst(recipes, new Set(['zz'])).map(r => r.title),
    ['abbacchio', 'Lasagna', 'Zuppa']);
});

check('query vuota: nessun elemento scartato (id ignoti nei preferiti inclusi)', () => {
  const recipes = [rec('r1', 'Zuppa'), rec('r2', 'Abruzzese'), rec('r3', 'Pizza')];
  const out = orderWithFavoritesFirst(recipes, new Set(['r3', 'missing']));
  assert.equal(out.length, recipes.length);
  assert.deepEqual(out.map(r => r.id).sort(), recipes.map(r => r.id).sort());
  assert.deepEqual(out.map(r => r.id), ['r3', 'r2', 'r1']);
});

console.log(`\n${passed} test passati`);
