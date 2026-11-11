// Uso: NODE_PATH=$PWD/node_modules node scripts/test_shopping_preview.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-preview-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/services/shoppingPreview.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { computeShoppingPreview } = require(path.join(outDir, 'services/shoppingPreview.js'));

let passed = 0;
const check = (label, fn) => { fn(); passed++; console.log('ok  ', label); };

const ing = (ingredient, amount, unit) => ({ section: 'S', text: `${amount ?? ''} ${unit} ${ingredient}`.trim(), amount, unit, ingredient });
const recipe = (id, servings, list) => ({ id, title: 'R' + id, servings, detailed_ingredients: list, ingredients: [] });
const entry = (id, date, recipe_id, servings = 4, ingredient_id, extra = {}) => ({ id, date, slot: 'cena', kind: ingredient_id ? 'ingredient' : 'recipe', recipe_id, ingredient_id, servings, created_at: 0, ...extra });
const shop = (name, amount, unit, checked = false) => ({ id: name + unit, name, ingredient_text: name, amount, unit, checked, category: '', created_at: 0 });
const food = (id, name, amount, unit) => ({ id, name, type: 'simple', default_amount: amount, default_unit: unit });
// Deriva le mappe dai recipe(...) di test: ingredienti per ricetta alle porzioni base
const toRI = rs => Object.fromEntries(Object.values(rs).map(r => [r.id, r.detailed_ingredients.map(i => ({ ingredient_name: i.ingredient, amount: i.amount, unit: i.unit }))]));
const run = o => computeShoppingPreview({
  today: '2026-06-10', entries: [], recipes: {}, ingredients: {}, readyMeals: {}, shoppingItems: [],
  ...o, recipeIngredients: o.recipeIngredients || toRI(o.recipes || {}),
});
const find = (rows, key) => rows.filter(r => r.name.toLowerCase().includes(key));

const recipes = {
  a: recipe('a', 4, [ing('farina', 200, 'g')]),
  b: recipe('b', 4, [ing('farina', 300, 'g')]),
};

check('passato ignorato', () => {
  assert.equal(run({ recipes, entries: [entry('e1', '2026-06-09', 'a')] }).length, 0);
});
check('oggi incluso', () => {
  assert.equal(run({ recipes, entries: [entry('e1', '2026-06-10', 'a')] })[0].need, 200);
});
check('tra 3 settimane incluso', () => {
  assert.equal(run({ recipes, entries: [entry('e1', '2026-07-01', 'a')] })[0].need, 200);
});
check('stesso ingrediente e unita si somma', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a'), entry('e2', '2026-06-11', 'b')] });
  assert.equal(r.length, 1);
  assert.equal(r[0].need, 500);
  assert.equal(r[0].sources.length, 2);
});
check('scaling per porzioni', () => {
  assert.equal(run({ recipes, entries: [entry('e1', '2026-06-10', 'a', 8)] })[0].need, 400);
});
check('food con amount null: need null', () => {
  const r = run({ ingredients: { f: food('f', 'Latte', null, null) }, entries: [entry('e1', '2026-06-10', undefined, 3, 'f')] });
  assert.equal(r[0].need, null);
  assert.equal(r[0].unit, '');
  assert.equal(r[0].missing, null);
});
check('food non moltiplicato per porzioni', () => {
  const r = run({ ingredients: { f: food('f', 'Yogurt', 2, 'vasetti') }, entries: [entry('e1', '2026-06-10', undefined, 5, 'f')] });
  assert.equal(r[0].need, 2);
});
check('in lista stessa unita: missing = need - inList', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a')], shoppingItems: [shop('Farina', 150, 'g')] });
  assert.equal(r[0].inList, 150);
  assert.equal(r[0].missing, 50);
  assert.equal(r[0].comparable, true);
});
check('missing mai negativo', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a')], shoppingItems: [shop('Farina', 500, 'g')] });
  assert.equal(r[0].missing, 0);
});
check('unita non convertibile: comparable=false, missing=null', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a')], shoppingItems: [shop('Farina', 1, 'pz')] });
  assert.equal(r[0].comparable, false);
  assert.equal(r[0].missing, null);
  assert.equal(r[0].inList, null);
});
check('voce spuntata conta come in lista', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a')], shoppingItems: [shop('Farina', 200, 'g', true)] });
  assert.equal(r[0].inList, 200);
  assert.equal(r[0].missing, 0);
});
check('non in lista: missing = need', () => {
  const r = run({ recipes, entries: [entry('e1', '2026-06-10', 'a')] });
  assert.equal(r[0].inList, null);
  assert.equal(r[0].missing, 200);
});
check("spicchi d'aglio / Aglio / aglio nella stessa riga", () => {
  const rs = {
    a: recipe('a', 4, [ing("spicchi d'aglio", 2, '')]),
    b: recipe('b', 4, [ing('Aglio', 1, '')]),
    c: recipe('c', 4, [ing('aglio', 1, '')]),
  };
  const r = run({ recipes: rs, entries: [entry('e1', '2026-06-10', 'a'), entry('e2', '2026-06-10', 'b'), entry('e3', '2026-06-10', 'c')] });
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.equal(r[0].need, 4);
});
check('ordinamento per nome', () => {
  const rs = { a: recipe('a', 4, [ing('zucchero', 1, 'g'), ing('Burro', 1, 'g'), ing('acqua', 1, 'g')]) };
  const r = run({ recipes: rs, entries: [entry('e1', '2026-06-10', 'a')] });
  assert.deepEqual(r.map(x => x.name.toLowerCase()), ['acqua', 'burro', 'zucchero']);
});

const day = '2026-06-10';
check('acqua in l, g, ml, cucchiai: una riga in ml = 1730', () => {
  const rs = { a: recipe('a', 4, [ing('acqua', 1, 'litro'), ing('acqua', 500, 'g'), ing('acqua', 200, 'ml'), ing('acqua', 2, 'cucchiai')]) };
  const r = run({ recipes: rs, entries: [entry('e1', day, 'a')] });
  assert.equal(r.length, 1, JSON.stringify(r));
  assert.equal(r[0].unit, 'ml');
  assert.equal(r[0].need, 1730);
});
check('farina in g e kg: una riga in g', () => {
  const rs = { a: recipe('a', 4, [ing('farina', 200, 'g'), ing('farina', 1, 'kg')]) };
  const r = run({ recipes: rs, entries: [entry('e1', day, 'a')] });
  assert.equal(r.length, 1);
  assert.equal(r[0].unit, 'g');
  assert.equal(r[0].need, 1200);
});
check('uova in pz e in g non si uniscono', () => {
  const rs = { a: recipe('a', 4, [ing('uova', 2, 'pz'), ing('uova', 100, 'g')]) };
  assert.equal(run({ recipes: rs, entries: [entry('e1', day, 'a')] }).length, 2);
});
check('latte con densita: 500 ml -> 515 g (1,03 g/ml)', () => {
  const rs = { a: recipe('a', 4, [ing('latte', 100, 'ml'), ing('latte', 2, 'bicchieri')]) };
  const r = run({ recipes: rs, entries: [entry('e1', day, 'a')] });
  assert.equal(r.length, 1);
  assert.equal(r[0].unit, 'g');
  assert.equal(r[0].need, 515);
});
check('lista in litri conta per need in ml (acqua)', () => {
  const rs = { a: recipe('a', 4, [ing('acqua', 1500, 'ml')]) };
  const r = run({ recipes: rs, entries: [entry('e1', day, 'a')], shoppingItems: [shop('Acqua', 1, 'litro')] });
  assert.equal(r[0].inList, 1000);
  assert.equal(r[0].missing, 500);
  assert.equal(r[0].comparable, true);
});
check('alias unita: grammi e g sono uguali', () => {
  const rs = { a: recipe('a', 4, [ing('zucchero', 100, 'grammi'), ing('zucchero', 50, 'g')]) };
  const r = run({ recipes: rs, entries: [entry('e1', day, 'a')] });
  assert.equal(r.length, 1);
  assert.equal(r[0].need, 150);
});

check('ingrediente 200 g, in lista 100 g: missing 100', () => {
  const ingredients = { i: food('i', 'Riso', null, 'g') };
  const r = run({ ingredients, entries: [entry('e1', day, undefined, 4, 'i', { amount: 200, unit: 'g' })], shoppingItems: [shop('Riso', 100, 'g')] });
  assert.equal(r[0].need, 200);
  assert.equal(r[0].missing, 100);
});
check('ingrediente senza amount usa il default', () => {
  const ingredients = { i: food('i', 'Riso', 500, 'g') };
  const r = run({ ingredients, entries: [entry('e1', day, undefined, 4, 'i', { amount: null, unit: null })] });
  assert.equal(r[0].need, 500);
  assert.equal(r[0].unit, 'g');
});
check('ready con count 2: need 2 confezione', () => {
  const readyMeals = { m: { id: 'm', name: 'Lasagne pronte', default_count: 1 } };
  const r = run({ readyMeals, entries: [{ id: 'e1', date: day, slot: 'cena', kind: 'ready', ready_meal_id: 'm', count: 2, servings: 4, created_at: 0 }] });
  assert.equal(r.length, 1);
  assert.equal(r[0].need, 2);
  assert.equal(r[0].unit, 'confezione');
  assert.equal(r[0].sources[0].label, 'Lasagne pronte');
});
check('ricetta espansa da recipeIngredients e scalata', () => {
  const recipes = { a: recipe('a', 2, []) };
  const recipeIngredients = { a: [{ ingredient_name: 'pasta', amount: 100, unit: 'g' }, { ingredient_name: 'sale', amount: null, unit: '' }] };
  const r = run({ recipes, recipeIngredients, entries: [entry('e1', day, 'a', 6)] });
  assert.equal(find(r, 'pasta')[0].need, 300);
  assert.equal(find(r, 'sale')[0].need, null);
  assert.equal(find(r, 'pasta')[0].sources[0].label, 'Ra');
});

console.log(`\n${passed} controlli superati`);
