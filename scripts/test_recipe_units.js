/* global __dirname, require, console */
// Uso: NODE_PATH=$PWD/node_modules node scripts/test_recipe_units.js
// Verifica unità, nomi e quantità sui dati reali (assets/ricette.json, sola lettura).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-units-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/services/shoppingPreview.ts'), path.join(root, 'src/utils/servingsScaler.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { cleanSupermarketIngredientName, normalizeIngredientKey } = require(path.join(outDir, 'utils/ingredientAggregator.js'));
const { normalizeUnit, toBase } = require(path.join(outDir, 'utils/unitConversion.js'));
const { scaleIngredient, parseIngredientText } = require(path.join(outDir, 'utils/servingsScaler.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

// Casi mirati
check('Mezzo barattolo', () => {
  assert.deepStrictEqual(parseIngredientText('Mezzo barattolo Marmellata di pere'), { amount: 0.5, unit: 'barattolo', ingredient: 'Marmellata di pere' });
});
check('frazioni e intervalli', () => {
  assert.strictEqual(parseIngredientText('1/2 barattolo X').amount, 0.5);
  assert.strictEqual(parseIngredientText('1 1/2 cucchiai X').amount, 1.5);
  assert.strictEqual(parseIngredientText('2-3 bicchieri Acqua').amount, 2.5);
  assert.strictEqual(parseIngredientText('7-8 Pomodorini secchi').amount, 7.5);
  assert.strictEqual(parseIngredientText('400g ceci').amount, 400);
  assert.strictEqual(parseIngredientText('Mezza Banana').ingredient, 'Banana');
});
check('acqua a temperatura ambiente', () => {
  assert.strictEqual(cleanSupermarketIngredientName('acqua a temperatura ambiente'), 'Acqua');
  assert.strictEqual(normalizeIngredientKey('acqua a temperatura ambiente'), normalizeIngredientKey('acqua'));
});
check('conteggi non convertiti', () => {
  for (const u of ['foglie', 'fette', 'spicchi', 'panetti', 'rotoli', 'vasetti', 'barattoli', 'bustine', 'pezzi', 'coste', 'ciuffi', 'mazzetti', 'rametti', 'gocce']) {
    assert.strictEqual(toBase(1, u, 'x').family, 'none', u);
  }
  assert.strictEqual(toBase(2, 'litri', 'x').amount, 2000);
});
check('q.b. senza numero', () => {
  assert.strictEqual(scaleIngredient(3, 'q.b.', 'Sale', 'q.b. Sale', 2).scaledAmount, null);
});

// Dati reali
const recipes = JSON.parse(fs.readFileSync(path.join(root, 'assets/ricette.json'), 'utf8'));
const DESCRIPTORS = /\b(a temperatura ambiente|temperatura ambiente|tiepid[oa]|fredd[oa]|a piacere|q\.b\.?|anche dealcolato|grattugiat[oa]|tritat[oa])(?![a-z])/i;
const RAW_UNITS = new Set(['q.b.', '', 'cucchiai', 'cucchiaini', 'grammi', 'millilitri', 'pizzichi', 'spicchi', 'panetti', 'panetto', 'fette', 'rametti', 'rametto', 'foglie', 'foglia', 'rotoli', 'vasetti', 'vasetto', 'barattoli', 'barattolo', 'bustine', 'bustina', 'bicchieri', 'gocce', 'coste', 'pezzi', 'mazzetto', 'ciuffo', 'confezione', 'litri', 'litro', 'l', 'kg', 'cm', 'fetta']);
const PLURALS = new Set(['cucchiai', 'cucchiaini', 'grammi', 'millilitri', 'pizzichi', 'spicchi', 'panetti', 'fette', 'rametti', 'foglie', 'rotoli', 'vasetti', 'barattoli', 'bustine', 'bicchieri', 'gocce', 'coste', 'pezzi', 'litri']);

let total = 0, needNull = 0;
const units = new Set(), unmapped = new Set(), badNames = [], qbNumeric = [];
for (const r of recipes) {
  for (const ing of r.detailed_ingredients || []) {
    total++;
    const nu = normalizeUnit(ing.unit);
    units.add(nu);
    if (RAW_UNITS.has(ing.unit) && PLURALS.has(ing.unit) && nu === ing.unit) unmapped.add(ing.unit);
    const s = scaleIngredient(ing.amount, ing.unit, ing.ingredient, ing.text, 1);
    const name = cleanSupermarketIngredientName(s.name);
    if (DESCRIPTORS.test(name)) badNames.push(`${ing.text} -> ${name}`);
    if (s.scaledAmount === null) needNull++;
    if (/^q\.?b\.?$/i.test(ing.unit) && s.scaledAmount !== null) qbNumeric.push(ing.text);
  }
}
console.log('Ingredienti:', total);
console.log('Unita normalizzate distinte:', units.size, [...units].sort().join(', '));
console.log('Unita non mappate:', JSON.stringify([...unmapped]));
console.log('Ingredienti con need null:', needNull);
if (badNames.length) console.log('Nomi con descrittori:', badNames.slice(0, 20));
assert.strictEqual(unmapped.size, 0, 'unita non mappate');
assert.strictEqual(badNames.length, 0, 'descrittori nel nome');
assert.strictEqual(qbNumeric.length, 0, 'q.b. con need numerico');
console.log(`\n${passed} test ok`);
