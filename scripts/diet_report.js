// Report della classificazione della dieta su un ricettario JSON (default: assets/ricette.json).
// Uso: node scripts/diet_report.js [percorso.json]
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const file = process.argv[2] || path.join(root, 'assets/ricette.json');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-diet-'));

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/utils/dietClassifier.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { classifyDietDetailed } = require(path.join(outDir, 'utils/dietClassifier.js'));
fs.rmSync(outDir, { recursive: true, force: true });

const recipes = JSON.parse(fs.readFileSync(file, 'utf-8'));
const counts = { omnivore: 0, vegetarian: 0, vegan: 0 };
const review = [];

for (const r of recipes) {
  const d = classifyDietDetailed(r);
  counts[d.diet]++;
  // Da rivedere: il tag dichiara vegana una ricetta che contiene ingredienti animali
  const tagSaysVegan = (r.tags || []).includes('100% Vegetale');
  if (tagSaysVegan && d.diet !== 'vegan') {
    review.push({ id: r.id, title: r.title, diet: d.diet, reasons: [`ingredienti: ${d.animalTerms.join(', ')}`] });
  }
}

console.log(`Ricette: ${recipes.length}`);
console.log(`  onnivore:     ${counts.omnivore}`);
console.log(`  vegetariane:  ${counts.vegetarian}`);
console.log(`  vegane:       ${counts.vegan}`);
console.log(`\nCasi da rivedere (tag "100% Vegetale" in contrasto con gli ingredienti): ${review.length}`);
for (const item of review) {
  console.log(`- ${item.title} [${item.id}] → ${item.diet}`);
  for (const reason of item.reasons) console.log(`    ${reason}`);
}
