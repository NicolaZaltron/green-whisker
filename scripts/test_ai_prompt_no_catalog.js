// Usage: NODE_PATH=$PWD/node_modules node scripts/test_ai_prompt_no_catalog.js
// Checks that the Gemini payload never contains the catalog names, and that the seed provides the names locally.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-ai-payload-'));
execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/services/recipePayload.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const { buildRecipeRequestPayload, namesFromSeed } = require(path.join(outDir, 'recipePayload.js'));

const seed = JSON.parse(fs.readFileSync(path.join(root, 'src/data/ingredients.seed.json'), 'utf8'));
const catalogNames = ['Mandorle', 'Uova'];
// Neutral prompt: the real prompt contains example names in the "name" field and is not tested here
const NEUTRAL_PROMPT = 'Estrai la ricetta in JSON.';
const SCHEMA = { type: 'OBJECT', properties: { title: { type: 'STRING' } } };

let passed = 0;
let failed = 0;
const check = (label, fn) => {
  try {
    fn();
    passed++;
    console.log('ok  ', label);
  } catch (e) {
    failed++;
    console.log('FAIL', label, '-', e.message);
  }
};

// Input with catalogNames: the payload must not read them
const input = { text: 'Torta: 200 g di farina e 2 uova', catalogNames };
const payload = buildRecipeRequestPayload(input, SCHEMA, NEUTRAL_PROMPT);
const serialized = JSON.stringify(payload);

check('il payload non contiene "Mandorle"', () => {
  assert.ok(!serialized.includes('Mandorle'));
});

check('il payload non contiene "Uova" (il testo utente usa "uova" minuscolo)', () => {
  assert.ok(!serialized.includes('Uova'));
});

check('il payload non contiene l array catalogNames', () => {
  assert.ok(!serialized.includes(JSON.stringify(catalogNames)));
});

check('il payload ha solo systemInstruction, contents e generationConfig', () => {
  assert.deepEqual(Object.keys(payload).sort(), ['contents', 'generationConfig', 'systemInstruction']);
  assert.deepEqual(Object.keys(payload.generationConfig).sort(), ['responseMimeType', 'responseSchema', 'temperature']);
});

check('il payload con immagini non cambia con catalogNames', () => {
  const withImages = { images: [{ base64: 'AAAA' }], catalogNames };
  const without = { images: [{ base64: 'AAAA' }] };
  assert.equal(
    JSON.stringify(buildRecipeRequestPayload(withImages, SCHEMA, NEUTRAL_PROMPT)),
    JSON.stringify(buildRecipeRequestPayload(without, SCHEMA, NEUTRAL_PROMPT))
  );
});

check('il seed fornisce Mandorla e Uovo come nomi', () => {
  const names = namesFromSeed(seed);
  assert.ok(names.includes('Mandorla'), 'manca Mandorla');
  assert.ok(names.includes('Uovo'), 'manca Uovo');
});

console.log(`\n${passed} test passati, ${failed} falliti`);
if (failed > 0) process.exit(1);
