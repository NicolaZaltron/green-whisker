// Verifica del formato del ricettario sui file in scripts/fixtures/catalog.
// Uso: node scripts/test_catalog.js   (compila i moduli TypeScript in una cartella temporanea)
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-catalog-'));

execFileSync(
  path.join(root, 'node_modules/.bin/tsc'),
  ['--ignoreConfig', path.join(root, 'src/services/catalogFormat.ts'),
   '--outDir', outDir, '--module', 'commonjs', '--target', 'es2019', '--skipLibCheck'],
  { stdio: 'inherit' }
);
const format = require(path.join(outDir, 'services/catalogFormat.js'));

const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures/catalog', name), 'utf-8');
let passed = 0;
const check = (label, fn) => {
  fn();
  passed++;
  console.log('ok  ', label);
};

check('file nuovo con varianti: 2 ricette valide', () => {
  const r = format.parseCatalogText(fixture('nuovo-con-varianti.json'));
  assert.equal(r.recipes.length, 2);
  assert.equal(r.invalid, 0);
  assert.equal(r.recipes[1].variant_of, 'polpette-di-manzo-al-pomodoro');
});

check('file vecchio senza campi nuovi: ricetta valida, nessun campo variante', () => {
  const r = format.parseCatalogText(fixture('vecchio-senza-varianti.json'));
  assert.equal(r.recipes.length, 1);
  assert.equal(r.recipes[0].diet, undefined);
  assert.equal(r.recipes[0].variant_of, undefined);
});

check('variante senza originale nel file: valida (il raggruppamento avviene più tardi)', () => {
  const r = format.parseCatalogText(fixture('variante-orfana.json'));
  assert.equal(r.recipes.length, 1);
  assert.equal(r.recipes[0].variant_of, 'polpette-di-manzo-al-pomodoro');
});

check('id duplicati: una ricetta, con conteggio', () => {
  const r = format.parseCatalogText(fixture('id-duplicati.json'));
  assert.equal(r.recipes.length, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.recipes[0].title, 'Polpette (copia)', 'resta l\'ultima occorrenza');
});

check('ricette non valide: scartate e contate', () => {
  const r = format.parseCatalogText(fixture('non-valide.json'));
  assert.equal(r.recipes.length, 0);
  assert.equal(r.invalid, 3);
});

check('campi sconosciuti: la ricetta è valida e i campi restano', () => {
  const r = format.parseCatalogText(fixture('campi-sconosciuti.json'));
  assert.equal(r.recipes.length, 1);
  assert.deepEqual(r.recipes[0].campo_futuro, { x: 1 });
});

check('file con BOM in testa: letto correttamente', () => {
  const r = format.parseCatalogText('\uFEFF' + fixture('nuovo-con-varianti.json'));
  assert.equal(r.recipes.length, 2);
});
check('file che non è un elenco: errore', () => {
  assert.throws(() => format.parseCatalogText(fixture('non-elenco.json')), /CATALOG_NOT_LIST/);
});

check('id variante: fisso per base e dieta', () => {
  assert.equal(format.variantId('abc', 'vegetarian'), 'abc--vegetariana');
  assert.equal(format.variantId('abc', 'vegan'), 'abc--vegana');
});

const base = { id: 'a', title: 'A', category: 'C', ingredients: [], instructions: [], tags: [], times: {} };
const catalog = [
  { ...base, id: 'a', diet: 'omnivore', origin: 'ai' },
  { ...base, id: 'a--vegana', variant_of: 'a', diet: 'vegan', origin: 'ai' },
  { ...base, id: 'b', diet: 'vegan', origin: 'file' },
  { ...base, id: 'c', diet: 'vegetarian', origin: 'manual', modified: true },
];
const f = (over) => ({ scope: 'all', kind: 'both', diet: 'all', origin: 'all', ...over });

check('filtro: solo vegane', () => {
  assert.deepEqual(format.filterCatalog(catalog, f({ diet: 'vegan' })).map(r => r.id), ['a--vegana', 'b']);
});
check('filtro: solo importate da AI', () => {
  assert.deepEqual(format.filterCatalog(catalog, f({ origin: 'ai' })).map(r => r.id), ['a', 'a--vegana']);
});
check('filtro: solo personali (origine diversa da file o modificate)', () => {
  assert.deepEqual(format.filterCatalog(catalog, f({ scope: 'personal' })).map(r => r.id), ['a', 'a--vegana', 'c']);
});
check('filtro: solo varianti / solo originali', () => {
  assert.deepEqual(format.filterCatalog(catalog, f({ kind: 'variants' })).map(r => r.id), ['a--vegana']);
  assert.deepEqual(format.filterCatalog(catalog, f({ kind: 'originals' })).map(r => r.id), ['a', 'b', 'c']);
});
check('varianti delle originali selezionate, senza duplicati', () => {
  const sel = format.filterCatalog(catalog, f({ kind: 'originals' }));
  assert.deepEqual(format.withVariants(sel, catalog).map(r => r.id), ['a', 'b', 'c', 'a--vegana']);
});
check('nome file con i filtri', () => {
  assert.equal(format.exportFileName(f({ diet: 'vegan' }), '2026-11-05'), 'green-whisker-vegane-2026-11-05.json');
  assert.equal(format.exportFileName(f({ scope: 'personal', origin: 'ai', kind: 'originals' }), '2026-11-05'),
    'green-whisker-personali-ai-originali-2026-11-05.json');
  assert.equal(format.exportFileName(f({}), '2026-11-05'), 'green-whisker-2026-11-05.json');
});

check('normalizzazione: file vecchio riceve i campi del catalogo', () => {
  const r = format.normalizeImported({ ...base, id: 'x' }, 1000);
  assert.equal(r.diet, 'vegan', 'senza ingredienti animali, calcolata vegana');
  assert.equal(r.origin, 'file');
  assert.equal(r.modified, false);
  assert.equal(r.created_at, 1000);
});
check('normalizzazione: variante senza dieta la ricava dal suffisso', () => {
  assert.equal(format.normalizeImported({ ...base, id: 'a--vegana', variant_of: 'a' }, 1).diet, 'vegan');
  assert.equal(format.normalizeImported({ ...base, id: 'a--vegetariana', variant_of: 'a' }, 1).diet, 'vegetarian');
});
check('normalizzazione: valori già presenti e campi sconosciuti restano', () => {
  const r = format.normalizeImported({ ...base, id: 'x', diet: 'vegan', origin: 'ai', extra: 1 }, 1);
  assert.equal(r.diet, 'vegan');
  assert.equal(r.origin, 'ai');
  assert.equal(r.extra, 1);
});

const diet = require(path.join(outDir, 'utils/dietClassifier.js'));
const withIngredients = list => ({ ...base, id: 'd', ingredients: list });
const cls = list => diet.classifyDiet(withIngredients(list));

check('classificazione: carne rende onnivora', () => {
  assert.equal(cls(['200 g di pollo', '1 uovo']), 'omnivore');
  assert.equal(cls(['100 g di tonno']), 'omnivore');
});
check('classificazione: "vegetale" dopo un nome animale non è carne', () => {
  assert.equal(cls(['100 g di pollo vegetale']), 'vegan');
  assert.equal(cls(['200 g di würstel vegetali']), 'vegan');
});
check('classificazione: uova e latticini rendono vegetariana', () => {
  assert.equal(cls(['200 g di farina', '1 uovo']), 'vegetarian');
  assert.equal(cls(['100 g di mozzarella']), 'vegetarian');
});
check('classificazione: ricotta di mandorla (singolare) e formaggio vegetale restano vegani', () => {
  assert.equal(cls(['q.b. spinaci e ricotta di mandorla', 'q.b. formaggio vegetale filante', '125 g di farina']), 'vegan');
});
check('classificazione: prodotti veg chiamati con nome animale restano vegani', () => {
  assert.equal(cls(['86 g di "tuorlo Veg"', '200 g di farina']), 'vegan');
});
check('classificazione: latte vegetale e "senza uova" restano vegani', () => {
  assert.equal(cls(['200 ml di latte di mandorle']), 'vegan');
  assert.equal(cls(['200 g di farina', 'senza uova']), 'vegan');
  assert.equal(cls(['200 g di formaggio vegetale']), 'vegan');
});
check('classificazione: miele rende vegetariana', () => {
  assert.equal(cls(['1 cucchiaio di miele', '200 g di farina']), 'vegetarian');
});
check('classificazione: dettagli per la revisione', () => {
  const d = diet.classifyDietDetailed(withIngredients(['100 g di pollo vegetale', '1 uovo']));
  assert.equal(d.diet, 'vegetarian');
  assert.ok(d.exceptionsUsed.length >= 1);
});
check('variante: dieta dal suffisso, revisione se non regge agli ingredienti', () => {
  const v = format.normalizeImported({ ...base, id: 'x--vegana', variant_of: 'x', ingredients: ['1 uovo'] }, 1);
  assert.equal(v.diet, 'vegan');
  assert.equal(v.needs_review, true);
});
check('tag 100% Vegetale: presente solo sulle vegane', () => {
  const vegan = format.normalizeImported({ ...base, id: 'v', ingredients: ['100 g di tofu'], tags: [] }, 1);
  assert.ok(vegan.tags.includes('100% Vegetale'));
  const onn = format.normalizeImported({ ...base, id: 'o', ingredients: ['100 g di pollo'], tags: ['100% Vegetale', 'X'] }, 1);
  assert.deepEqual(onn.tags, ['X']);
});
check('dieta manuale: non ricalcolata', () => {
  const r = format.normalizeImported({ ...base, id: 'm', diet: 'omnivore', diet_source: 'manual', ingredients: ['100 g di tofu'] }, 1);
  assert.equal(r.diet, 'omnivore');
  assert.equal(r.diet_source, 'manual');
});

check('eliminazione: cancellare un\'originale cancella le sue varianti', () => {
  assert.deepEqual(format.expandDeletion(['a'], catalog).sort(), ['a', 'a--vegana']);
  assert.deepEqual(format.expandDeletion(['a--vegana'], catalog), ['a--vegana']);
  assert.deepEqual(format.expandDeletion(['b'], catalog), ['b']);
});

check('varianti disponibili: onnivora → entrambe, vegetariana → vegana, vegana → nessuna, senza doppioni', () => {
  const omn = { ...base, id: 'o', diet: 'omnivore' };
  const veg = { ...base, id: 'v', diet: 'vegetarian' };
  const van = { ...base, id: 'w', diet: 'vegan' };
  assert.deepEqual(format.availableVariantDiets(omn, []), ['vegetarian', 'vegan']);
  assert.deepEqual(format.availableVariantDiets(veg, []), ['vegan']);
  assert.deepEqual(format.availableVariantDiets(van, []), []);
  const existing = [{ ...base, id: 'o--vegetariana', variant_of: 'o', diet: 'vegetarian' }];
  assert.deepEqual(format.availableVariantDiets(omn, existing), ['vegan']);
});
check('variante costruita: id, titolo con suffisso, dieta dichiarata, revisione se gli ingredienti non la reggono', () => {
  const source = { ...base, id: 'pol', title: 'Polpette', url: 'https://x', diet: 'omnivore' };
  const adapted = { ...base, id: 'custom-polpette', title: 'Polpette di lenticchie (vegetariana)', ingredients: ['1 uovo'], diet: 'omnivore' };
  const v = format.buildVariantRecord(source, adapted, 'vegan', 5);
  assert.equal(v.id, 'pol--vegana');
  assert.equal(v.title, 'Polpette di lenticchie (vegana)');
  assert.equal(v.variant_of, 'pol');
  assert.equal(v.diet, 'vegan');
  assert.equal(v.diet_source, 'manual');
  assert.equal(v.url, 'https://x');
  assert.equal(v.needs_review, true, 'con un uovo non è vegana');
  const ok = format.buildVariantRecord(source, { ...adapted, ingredients: ['100 g di lenticchie'] }, 'vegetarian', 5);
  assert.equal(ok.needs_review, false);
});

check('filtro dieta: una ricetta compare anche se la compatibile è la sua variante', () => {
  const omn = { ...base, id: 'o', diet: 'omnivore' };
  const vegVariant = { ...base, id: 'o--vegetariana', variant_of: 'o', diet: 'vegetarian' };
  const veganVariant = { ...base, id: 'o--vegana', variant_of: 'o', diet: 'vegan' };
  assert.equal(format.matchesDiet(omn, [], 'all'), true);
  assert.equal(format.matchesDiet(omn, [], 'vegetarian'), false);
  assert.equal(format.matchesDiet(omn, [vegVariant], 'vegetarian'), true);
  assert.equal(format.matchesDiet(omn, [vegVariant], 'vegan'), false);
  assert.equal(format.matchesDiet(omn, [veganVariant], 'vegan'), true);
  assert.equal(format.matchesDiet({ ...base, id: 'v', diet: 'vegan' }, [], 'vegetarian'), true, 'una vegana è anche vegetariana');
});

fs.rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} controlli superati`);
