// Plain Node check of the catalog seed data (no database).
// Run: NODE_PATH=$PWD/node_modules node scripts/test_catalog_seed_links.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RECIPES_PATH = path.join(ROOT, 'src/data/recipes.catalog.json');
const INGREDIENTS_PATH = path.join(ROOT, 'src/data/ingredients.seed.json');
const READY_MEALS_PATH = path.join(ROOT, 'src/data/readyMeals.seed.json');

const EXPECTED_RECIPES = 835;
const EXPECTED_READY_MEALS = 26;
const VALID_CATEGORIES = ['pronto'];
const MEAL_SLOTS = ['colazione', 'spuntino_mattina', 'pranzo', 'spuntino_pomeriggio', 'cena'];

let failures = 0;

function check(condition, message) {
  if (condition) {
    console.log(`PASS ${message}`);
  } else {
    failures += 1;
    console.log(`FAIL ${message}`);
  }
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function nameKey(name) {
  return String(name).trim().toLowerCase();
}

let recipes;
try {
  recipes = loadJson(RECIPES_PATH);
  check(Array.isArray(recipes), 'recipes.catalog.json parses as an array');
} catch (err) {
  check(false, `recipes.catalog.json parses (${err.message})`);
  recipes = [];
}

check(recipes.length === EXPECTED_RECIPES, `recipe count is ${EXPECTED_RECIPES} (got ${recipes.length})`);

const ingredientNames = new Set(
  loadJson(INGREDIENTS_PATH).map(entry => nameKey(entry.name)),
);

let linkCount = 0;
let unknownCount = 0;
const unknownNames = new Set();
for (const recipe of recipes) {
  for (const entry of recipe.ingredients || []) {
    linkCount += 1;
    const key = nameKey(entry.ingredient);
    if (!ingredientNames.has(key)) {
      unknownCount += 1;
      unknownNames.add(entry.ingredient);
    }
  }
}
console.log(`INFO links: ${linkCount}, unknown ingredient names: ${unknownCount}`);
if (unknownNames.size > 0) {
  console.log(`INFO unknown names: ${[...unknownNames].slice(0, 20).join(', ')}`);
}
check(unknownCount === 0, 'every recipe ingredient name exists in ingredients.seed.json');

let readyMeals = [];
try {
  readyMeals = loadJson(READY_MEALS_PATH);
  check(Array.isArray(readyMeals), 'readyMeals.seed.json parses as an array');
} catch (err) {
  check(false, `readyMeals.seed.json parses (${err.message})`);
}

check(
  readyMeals.length === EXPECTED_READY_MEALS,
  `ready meal count is ${EXPECTED_READY_MEALS} (got ${readyMeals.length})`,
);

const badCategory = readyMeals.filter(m => !VALID_CATEGORIES.includes(m.category));
check(badCategory.length === 0, `all ready meals have a valid category (bad: ${badCategory.length})`);

const badSlots = readyMeals.filter(
  m => !Array.isArray(m.slots) || m.slots.some(s => !MEAL_SLOTS.includes(s)),
);
check(badSlots.length === 0, `all ready meal slots are meal slots (bad: ${badSlots.length})`);

if (failures > 0) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll checks passed');
