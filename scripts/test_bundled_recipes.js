// Check of the bundled simple recipes (src/data/bundledRecipes.json) against the ingredients seed.
// Run: node scripts/test_bundled_recipes.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/bundledRecipes.json'), 'utf8'));
const ingredientIds = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ingredients.seed.json'), 'utf8')).map(i => i.id));

const EXPECTED_RECIPES = 117;
let failures = 0;
function check(condition, message) {
  if (condition) console.log(`PASS ${message}`);
  else {
    console.log(`FAIL ${message}`);
    failures++;
  }
}

check(Array.isArray(recipes), 'bundledRecipes.json is an array');
check(recipes.length === EXPECTED_RECIPES, `recipe count is ${EXPECTED_RECIPES} (got ${recipes.length})`);

const ids = recipes.map(r => r.id);
check(new Set(ids).size === ids.length, 'recipe ids are unique');

const badServings = recipes.filter(r => r.servings !== 2);
check(badServings.length === 0, `every recipe serves 2 (bad: ${badServings.length})`);

const unresolved = [];
for (const recipe of recipes) {
  for (const row of recipe.detailed_ingredients || []) {
    if (!ingredientIds.has(row.ingredient_id)) unresolved.push(`${recipe.id}: ${row.ingredient_id}`);
  }
}
check(unresolved.length === 0, `every ingredient row resolves to a seed id (unresolved: ${unresolved.length})`);

const noSteps = recipes.filter(r => !Array.isArray(r.instructions) || r.instructions.length === 0);
check(noSteps.length === 0, `every recipe has instructions (missing: ${noSteps.length})`);

if (failures > 0) {
  console.log(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All checks passed');
