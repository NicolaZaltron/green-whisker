// Check of the ready meals seed (without database).
// Run: NODE_PATH=$PWD/node_modules node scripts/test_ready_meals_seed.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const READY_MEALS_PATH = path.join(ROOT, 'src/data/readyMeals.seed.json');

const EXPECTED_READY_MEALS = 63;
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

let readyMeals = [];
try {
  readyMeals = JSON.parse(fs.readFileSync(READY_MEALS_PATH, 'utf8'));
  check(Array.isArray(readyMeals), 'readyMeals.seed.json parses as an array');
} catch (err) {
  check(false, `readyMeals.seed.json parses (${err.message})`);
}

check(
  readyMeals.length === EXPECTED_READY_MEALS,
  `ready meal count is ${EXPECTED_READY_MEALS} (got ${readyMeals.length})`,
);

const readyIds = readyMeals.map(m => m.id);
check(readyIds.every(id => typeof id === 'string' && id.length > 0), 'every ready meal has an id');
check(new Set(readyIds).size === readyIds.length, 'ready meal ids are unique');

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
