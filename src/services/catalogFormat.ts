import { Recipe, RecipeDiet, RecipeOrigin } from '../types/recipe';
import { classifyDiet } from '../utils/dietClassifier';

// Modulo senza dipendenze da React Native: si può testare anche da Node (vedi scripts/test_catalog.js)

const REQUIRED_STRING_FIELDS = ['id', 'title', 'category'] as const;
const REQUIRED_ARRAY_FIELDS = ['ingredients', 'instructions', 'tags'] as const;
const DIETS: RecipeDiet[] = ['omnivore', 'vegetarian', 'vegan'];
const VEGAN_TAG = '100% Vegetale';

// Quanto una dieta è restrittiva: la vegana include la vegetariana, che include l'onnivora
const DIET_RANK: Record<RecipeDiet, number> = { omnivore: 0, vegetarian: 1, vegan: 2 };

export function isValidRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return REQUIRED_STRING_FIELDS.every(f => typeof r[f] === 'string' && (r[f] as string).trim() !== '')
    && REQUIRED_ARRAY_FIELDS.every(f => Array.isArray(r[f]))
    && typeof r.times === 'object' && r.times !== null;
}

/** Id della variante: fisso, così rigenerarla sostituisce la stessa ricetta anche su altri telefoni */
export function variantId(baseId: string, diet: Exclude<RecipeDiet, 'omnivore'>): string {
  return `${baseId}--${diet === 'vegan' ? 'vegana' : 'vegetariana'}`;
}

/** La dieta di una variante è quella dichiarata dal suffisso dell'id */
function dietFromVariantId(id: string): RecipeDiet | undefined {
  if (id.endsWith('--vegana')) return 'vegan';
  if (id.endsWith('--vegetariana')) return 'vegetarian';
  return undefined;
}

export interface ParsedCatalogFile {
  recipes: Recipe[];
  invalid: number;
  // Id ripetuti nel file: resta l'ultima occorrenza
  duplicates: number;
}

/**
 * Legge il testo di un ricettario JSON. Lancia un errore se il contenuto non è un elenco.
 * Le ricette non valide vengono contate e scartate; i campi sconosciuti restano nell'oggetto.
 */
export function parseCatalogText(text: string): ParsedCatalogFile {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('Il file non contiene un elenco di ricette');

  const byId = new Map<string, Recipe>();
  let invalid = 0;
  let duplicates = 0;
  for (const item of parsed) {
    if (!isValidRecipe(item)) {
      invalid++;
      continue;
    }
    if (byId.has(item.id)) duplicates++;
    byId.set(item.id, item);
  }
  return { recipes: Array.from(byId.values()), invalid, duplicates };
}

/**
 * Riempie i campi del catalogo che un file vecchio non ha e ricalcola la dieta.
 * Una dieta impostata a mano (diet_source 'manual') non viene toccata. I campi sconosciuti restano.
 */
export function normalizeImported(recipe: Recipe, now: number): Recipe {
  const declared = recipe.diet && DIETS.includes(recipe.diet) ? recipe.diet : undefined;
  const variantDiet = recipe.variant_of ? dietFromVariantId(recipe.id) : undefined;

  let diet: RecipeDiet;
  let dietSource: 'auto' | 'manual' = recipe.diet_source ?? 'auto';
  if (dietSource === 'manual' && declared) {
    diet = declared;
  } else if (variantDiet) {
    diet = variantDiet;
  } else {
    diet = classifyDiet(recipe);
    dietSource = 'auto';
  }

  const tags = recipe.tags.filter(tag => tag !== VEGAN_TAG);
  if (diet === 'vegan') tags.unshift(VEGAN_TAG);

  // Una variante la cui dieta dichiarata non regge agli ingredienti va verificata
  const needsReview = variantDiet !== undefined && DIET_RANK[classifyDiet(recipe)] < DIET_RANK[variantDiet];

  return {
    ...recipe,
    diet,
    diet_source: dietSource,
    needs_review: needsReview || recipe.needs_review,
    tags,
    origin: recipe.origin ?? 'file',
    modified: recipe.modified ?? false,
    created_at: recipe.created_at ?? now,
    updated_at: recipe.updated_at ?? now,
  };
}

/** Ricette personali: importate dall'AI, create a mano o modificate dall'utente */
export function isPersonalRecipe(recipe: Recipe): boolean {
  return (recipe.origin ?? 'file') !== 'file' || recipe.modified === true;
}

export type ExportScope = 'all' | 'personal';
export type ExportKind = 'both' | 'originals' | 'variants';

export interface ExportFilter {
  scope: ExportScope;
  kind: ExportKind;
  diet: 'all' | RecipeDiet;
  origin: 'all' | RecipeOrigin;
}

/** Ricette che soddisfano il filtro di export, nell'ordine del catalogo */
export function filterCatalog(recipes: Recipe[], filter: ExportFilter): Recipe[] {
  return recipes.filter(r => {
    if (filter.scope === 'personal' && !isPersonalRecipe(r)) return false;
    if (filter.kind === 'originals' && r.variant_of) return false;
    if (filter.kind === 'variants' && !r.variant_of) return false;
    if (filter.diet !== 'all' && (r.diet ?? 'omnivore') !== filter.diet) return false;
    if (filter.origin !== 'all' && (r.origin ?? 'file') !== filter.origin) return false;
    return true;
  });
}

/** Aggiunge le varianti delle originali selezionate (senza duplicati) */
export function withVariants(selected: Recipe[], all: Recipe[]): Recipe[] {
  const baseIds = new Set(selected.filter(r => !r.variant_of).map(r => r.id));
  const ids = new Set(selected.map(r => r.id));
  const extra = all.filter(r => r.variant_of && baseIds.has(r.variant_of) && !ids.has(r.id));
  return [...selected, ...extra];
}

/** Nome del file con i filtri usati, es. green-whisker-vegane-2026-11-05.json */
export function exportFileName(filter: ExportFilter, date: string): string {
  const parts = ['green-whisker'];
  if (filter.scope === 'personal') parts.push('personali');
  if (filter.diet !== 'all') parts.push({ omnivore: 'onnivore', vegetarian: 'vegetariane', vegan: 'vegane' }[filter.diet]);
  if (filter.origin !== 'all') parts.push(filter.origin);
  if (filter.kind !== 'both') parts.push(filter.kind === 'variants' ? 'varianti' : 'originali');
  parts.push(date);
  return `${parts.join('-')}.json`;
}

/** Ids da eliminare: quelli scelti più le varianti delle originali scelte */
export function expandDeletion(ids: string[], all: Recipe[]): string[] {
  const toDelete = new Set(ids);
  all.forEach(r => { if (r.variant_of && toDelete.has(r.variant_of)) toDelete.add(r.id); });
  return Array.from(toDelete);
}

export type VariantDiet = Exclude<RecipeDiet, 'omnivore'>;

const VARIANT_LABEL: Record<VariantDiet, string> = { vegetarian: 'vegetariana', vegan: 'vegana' };

/**
 * Varianti che si possono generare da una ricetta: un'onnivora può avere entrambe, una vegetariana
 * solo la vegana, una vegana nessuna. Non si propone una variante che esiste già.
 */
export function availableVariantDiets(source: Recipe, existing: Recipe[]): VariantDiet[] {
  const taken = new Set(existing.filter(r => r.variant_of === source.id).map(r => r.diet));
  const candidates: VariantDiet[] = [];
  if (source.diet !== 'vegetarian' && source.diet !== 'vegan') candidates.push('vegetarian');
  if (source.diet !== 'vegan') candidates.push('vegan');
  return candidates.filter(d => !taken.has(d));
}

/**
 * Costruisce la variante a partire dalla ricetta adattata dall'AI. Id e titolo sono fissi per dieta,
 * così rigenerare sostituisce la stessa variante e l'export mostra il tipo nel titolo.
 */
export function buildVariantRecord(source: Recipe, adapted: Recipe, diet: VariantDiet, now: number): Recipe {
  const baseTitle = adapted.title.replace(/\s*\((?:vegetariana|vegana)\)\s*$/i, '').trim();
  const variant: Recipe = {
    ...adapted,
    id: variantId(source.id, diet),
    title: `${baseTitle} (${VARIANT_LABEL[diet]})`,
    variant_of: source.id,
    diet,
    diet_source: 'manual',
    origin: 'ai',
    modified: false,
    url: source.url,
    image: adapted.image || source.image,
    created_at: now,
    updated_at: now,
    needs_review: false,
  };
  variant.needs_review = DIET_RANK[classifyDiet(variant)] < DIET_RANK[diet];
  return variant;
}

export type DietFilter = 'all' | 'vegetarian' | 'vegan';

/**
 * Una ricetta soddisfa il filtro dieta se è di quella dieta, più restrittiva compresa,
 * oppure se una sua variante lo è (la variante si apre dalla scheda).
 */
export function matchesDiet(recipe: Recipe, variants: Recipe[], filter: DietFilter): boolean {
  if (filter === 'all') return true;
  const needed = DIET_RANK[filter];
  const ownDiet = recipe.diet ?? 'omnivore';
  return DIET_RANK[ownDiet] >= needed || variants.some(v => DIET_RANK[v.diet ?? 'omnivore'] >= needed);
}
