// Acceptance test of the tolerant search (phase 6): queries with typos must find the right recipe in the top 3.
// Runs on the bundled recipes (summaries, as the lists hold them). Run: node scripts/test_search_typos.js
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
require.extensions['.ts'] = (m, f) => {
  const out = ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  m._compile(out, f);
};
const search = require(path.join(ROOT, 'src/services/searchService.ts'));

const recipes = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/bundledRecipes.json'), 'utf8'))
  .map(({ instructions, tips, detailed_ingredients, ingredients_by_section, source, url, ...summary }) => summary);
search.initializeSearchIndex(recipes);

// [query with typos, id of the recipe that must be in the top 3]
const CASES = [
  ['risotto zafferno', 'risotto-allo-zafferano'],
  ['zuchine', 'zucchine-saltate-con-feta'],
  ['polpete di zuchine', 'polpette-di-zucchine'],
  ['pasta al pomodro', 'pasta-al-pomodoro'],
  ['hummos di ceci', 'hummus-di-ceci'],
  ['pasta al pesto', 'pasta-con-pesto'],
  ['insalta mista', 'insalata-mista'],
  ['cotolete di sedano rapa', 'cotolette-di-sedano-rapa'],
  ['gnocchi di riso', 'gnocchi-di-riso-con-verdure'],
  ['fagiolini patate', 'insalatona-di-patate-e-fagiolini'],
];

let misses = [];
for (const [query, expectedId] of CASES) {
  const top = search.searchRecipes(query, 'Tutte', null).slice(0, 3).map(r => r.id);
  if (!top.includes(expectedId)) misses.push(`"${query}" -> top3 [${top.join(', ')}], expected ${expectedId}`);
}

if (misses.length > 0) {
  console.log(`FAIL ${misses.length} of ${CASES.length} queries missed:`);
  misses.forEach(m => console.log(`  ${m}`));
  process.exit(1);
}
console.log(`PASS ${CASES.length} queries with typos find the recipe in the top 3`);
