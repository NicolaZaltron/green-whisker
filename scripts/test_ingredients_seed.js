// Validates src/data/ingredients.seed.json against the vocabularies in src/types/catalog.ts.
// Run: NODE_PATH=$PWD/node_modules node scripts/test_ingredients_seed.js
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const seedPath = path.join(root, 'src/data/ingredients.seed.json');
const catalogPath = path.join(root, 'src/types/catalog.ts');

const EXPECTED_COUNT = 752;
const failures = [];

function fail(msg) {
  failures.push(msg);
  console.log(`FAIL: ${msg}`);
}

function readVocabulary(source, constName) {
  const re = new RegExp(`export const ${constName} = \\[([^\\]]*)\\] as const`);
  const match = source.match(re);
  if (!match) throw new Error(`Could not find ${constName} in catalog.ts`);
  return match[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

const catalogSource = fs.readFileSync(catalogPath, 'utf8');
const INGREDIENT_TYPES = readVocabulary(catalogSource, 'INGREDIENT_TYPES');
const INGREDIENT_TAGS = readVocabulary(catalogSource, 'INGREDIENT_TAGS');
const NUTRIENTS = readVocabulary(catalogSource, 'NUTRIENTS');

let seed;
try {
  seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
} catch (e) {
  console.log(`FAIL: seed JSON does not parse: ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(seed)) {
  fail('seed is not an array');
} else {
  if (seed.length !== EXPECTED_COUNT) fail(`expected ${EXPECTED_COUNT} entries, got ${seed.length}`);

  const names = new Map();
  seed.forEach((entry, i) => {
    const label = `entry ${i} (${entry && entry.name})`;
    if (!entry || typeof entry !== 'object') {
      fail(`${label} is not an object`);
      return;
    }
    if (typeof entry.name !== 'string' || !entry.name.trim()) fail(`${label} has empty name`);
    if (!INGREDIENT_TYPES.includes(entry.type)) fail(`${label} has invalid type "${entry.type}"`);
    if (!Array.isArray(entry.tags)) {
      fail(`${label} tags is not an array`);
    } else {
      for (const tag of entry.tags) {
        if (!INGREDIENT_TAGS.includes(tag)) fail(`${label} has invalid tag "${tag}"`);
      }
    }
    if (entry.nutrients && typeof entry.nutrients === 'object') {
      for (const [key, value] of Object.entries(entry.nutrients)) {
        if (!NUTRIENTS.includes(key)) fail(`${label} has invalid nutrient key "${key}"`);
        if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${label} nutrient "${key}" is not numeric`);
      }
    } else {
      fail(`${label} nutrients is not an object`);
    }
    if (typeof entry.edible_alone !== 'boolean') fail(`${label} edible_alone is not a boolean`);
    if (entry.edible_alone === true && entry.default_amount === null) fail(`${label} is edible_alone but default_amount is null`);
    if (entry.edible_alone === false && entry.default_amount !== null) fail(`${label} is not edible_alone but default_amount is set`);
    if (typeof entry.purchase_amount !== 'number' || !(entry.purchase_amount > 0)) fail(`${label} purchase_amount must be a number > 0`);
    if (typeof entry.purchase_unit !== 'string' || !entry.purchase_unit.trim()) fail(`${label} purchase_unit must be a non-empty string`);
    if (typeof entry.name === 'string') {
      const key = entry.name.trim().toLowerCase();
      if (names.has(key)) fail(`duplicate name (case-insensitive) "${entry.name}" at entries ${names.get(key)} and ${i}`);
      else names.set(key, i);
    }
  });
}

if (failures.length === 0) {
  console.log(`PASS: ${seed.length} entries, all types/tags/nutrients valid, names unique`);
  process.exit(0);
}
console.log(`FAILED with ${failures.length} problem(s)`);
process.exit(1);
