import { Recipe, RecipeDiet, RecipeOrigin, RecipeSummary } from '../types/recipe';
import { classifyDiet } from '../utils/dietClassifier';

// Module without React Native dependencies: can also be tested from Node (see scripts/test_catalog.js)

const REQUIRED_STRING_FIELDS = ['id', 'title', 'category'] as const;
const REQUIRED_ARRAY_FIELDS = ['ingredients', 'instructions', 'tags'] as const;
const DIETS: RecipeDiet[] = ['omnivore', 'vegetarian', 'vegan'];
const VEGAN_TAG = '100% Vegetale';

// How restrictive a diet is: vegan includes vegetarian, which includes omnivore
const DIET_RANK: Record<RecipeDiet, number> = { omnivore: 0, vegetarian: 1, vegan: 2 };

/**
 * Why a recipe of an imported file cannot be used, or null if it can. Structural problems reject the recipe;
 * junk inside its lists is removed by cleanRecipe instead. Servings are required (1 to 24): the app does not guess them.
 */
export function invalidReason(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not_object';
  const r = value as Record<string, unknown>;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof r[field] !== 'string' || (r[field] as string).trim() === '') return `${field}_missing`;
  }
  for (const field of REQUIRED_ARRAY_FIELDS) {
    if (!Array.isArray(r[field])) return `${field}_missing`;
  }
  if (typeof r.times !== 'object' || r.times === null) return 'times_missing';
  if (!Number.isInteger(r.servings) || (r.servings as number) < 1 || (r.servings as number) > 24) return 'servings_invalid';
  if (r.variant_of !== undefined && typeof r.variant_of !== 'string') return 'variant_of_invalid';
  if (r.detailed_ingredients !== undefined) {
    if (!Array.isArray(r.detailed_ingredients)) return 'detailed_ingredients_invalid';
    for (const item of r.detailed_ingredients) {
      if (!item || typeof item !== 'object') return 'detailed_ingredients_invalid';
      const row = item as Record<string, unknown>;
      const name = typeof row.ingredient === 'string' && row.ingredient.trim() ? row.ingredient : row.text;
      if (typeof name !== 'string' || !name.trim()) return 'detailed_ingredients_invalid';
      if (row.amount !== undefined && row.amount !== null && typeof row.amount !== 'number') return 'detailed_amount_invalid';
    }
  }
  return null;
}

/** The recipe without the non-text items of its lists (they are dropped, the recipe stays). */
export function cleanRecipe(recipe: Recipe): Recipe {
  const texts = (list: unknown[]) => list.filter((item): item is string => typeof item === 'string');
  return {
    ...recipe,
    ingredients: texts(recipe.ingredients),
    instructions: texts(recipe.instructions),
    tags: texts(recipe.tags),
  };
}

/** Variant id: fixed, so regenerating it replaces the same recipe even on other phones */
export function variantId(baseId: string, diet: Exclude<RecipeDiet, 'omnivore'>): string {
  return `${baseId}--${diet === 'vegan' ? 'vegana' : 'vegetariana'}`;
}

/** A variant's diet is the one declared by the id suffix */
function dietFromVariantId(id: string): RecipeDiet | undefined {
  if (id.endsWith('--vegana')) return 'vegan';
  if (id.endsWith('--vegetariana')) return 'vegetarian';
  return undefined;
}

export interface ParsedCatalogFile {
  recipes: Recipe[];
  invalid: number;
  // Number of invalid recipes per reason (see invalidReason)
  invalidReasons?: Record<string, number>;
  // Ids repeated in the file: the last occurrence stays
  duplicates: number;
}

/**
 * Reads the text of a JSON recipe book. Throws an error if the content is not a list.
 * Invalid recipes are counted and discarded; unknown fields stay in the object.
 */
// Error code when the file is not a list: the caller translates it
export const CATALOG_NOT_LIST_ERROR = 'CATALOG_NOT_LIST';

export function parseCatalogText(text: string): ParsedCatalogFile {
  // Some programs save the JSON with a BOM at the start, which JSON.parse does not accept
  const parsed: unknown = JSON.parse(text.replace(/^\uFEFF/, ''));
  if (!Array.isArray(parsed)) throw new Error(CATALOG_NOT_LIST_ERROR);

  const byId = new Map<string, Recipe>();
  let invalid = 0;
  let duplicates = 0;
  const invalidReasons: Record<string, number> = {};
  for (const item of parsed) {
    const reason = invalidReason(item);
    if (reason !== null) {
      invalid++;
      invalidReasons[reason] = (invalidReasons[reason] ?? 0) + 1;
      continue;
    }
    const recipe = cleanRecipe(item as Recipe);
    if (byId.has(recipe.id)) duplicates++;
    byId.set(recipe.id, recipe);
  }
  return { recipes: Array.from(byId.values()), invalid, duplicates, invalidReasons };
}

/**
 * Fills the catalog fields that an old file lacks and recomputes the diet.
 * A manually set diet (diet_source 'manual') is not touched. Unknown fields stay.
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

  // A variant whose declared diet does not hold up against the ingredients must be verified
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

/** Personal recipes: imported by the AI or edited by the user (the bundled recipes are not personal) */
export function isPersonalRecipe(recipe: RecipeSummary): boolean {
  return (recipe.origin === 'ai') || recipe.modified === true;
}

export type ExportScope = 'all' | 'personal';
export type ExportKind = 'both' | 'originals' | 'variants';

export interface ExportFilter {
  scope: ExportScope;
  kind: ExportKind;
  diet: 'all' | RecipeDiet;
  origin: 'all' | RecipeOrigin;
}

/** Recipes that satisfy the export filter, in catalog order */
export function filterCatalog<T extends RecipeSummary>(recipes: T[], filter: ExportFilter): T[] {
  return recipes.filter(r => {
    if (filter.scope === 'personal' && !isPersonalRecipe(r)) return false;
    if (filter.kind === 'originals' && r.variant_of) return false;
    if (filter.kind === 'variants' && !r.variant_of) return false;
    if (filter.diet !== 'all' && (r.diet ?? 'omnivore') !== filter.diet) return false;
    if (filter.origin !== 'all' && (r.origin ?? 'file') !== filter.origin) return false;
    return true;
  });
}

/** Adds the variants of the selected originals (without duplicates) */
export function withVariants<T extends RecipeSummary>(selected: T[], all: T[]): T[] {
  const baseIds = new Set(selected.filter(r => !r.variant_of).map(r => r.id));
  const ids = new Set(selected.map(r => r.id));
  const extra = all.filter(r => r.variant_of && baseIds.has(r.variant_of) && !ids.has(r.id));
  return [...selected, ...extra];
}

/** File name with the filters used, e.g. green-whisker-vegane-2026-11-05.json */
export function exportFileName(filter: ExportFilter, date: string): string {
  const parts = ['green-whisker'];
  if (filter.scope === 'personal') parts.push('personali');
  if (filter.diet !== 'all') parts.push({ omnivore: 'onnivore', vegetarian: 'vegetariane', vegan: 'vegane' }[filter.diet]);
  if (filter.origin !== 'all') parts.push(filter.origin);
  if (filter.kind !== 'both') parts.push(filter.kind === 'variants' ? 'varianti' : 'originali');
  parts.push(date);
  return `${parts.join('-')}.json`;
}

/** Ids to delete: the chosen ones plus the variants of the chosen originals */
export function expandDeletion(ids: string[], all: { id: string; variant_of?: string }[]): string[] {
  const toDelete = new Set(ids);
  all.forEach(r => { if (r.variant_of && toDelete.has(r.variant_of)) toDelete.add(r.id); });
  return Array.from(toDelete);
}

export type VariantDiet = Exclude<RecipeDiet, 'omnivore'>;

const VARIANT_LABEL: Record<VariantDiet, string> = { vegetarian: 'vegetariana', vegan: 'vegana' };

/**
 * Variants that can be generated from a recipe: an omnivore one can have both, a vegetarian one
 * only the vegan one, a vegan one none. A variant that already exists is not proposed.
 */
export function availableVariantDiets(source: RecipeSummary, existing: RecipeSummary[]): VariantDiet[] {
  const taken = new Set(existing.filter(r => r.variant_of === source.id).map(r => r.diet));
  const candidates: VariantDiet[] = [];
  if (source.diet !== 'vegetarian' && source.diet !== 'vegan') candidates.push('vegetarian');
  if (source.diet !== 'vegan') candidates.push('vegan');
  return candidates.filter(d => !taken.has(d));
}

/**
 * Builds the variant from the recipe adapted by the AI. Id and title are fixed per diet,
 * so regenerating replaces the same variant and the export shows the type in the title.
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
 * A recipe satisfies the diet filter if it is of that diet, more restrictive included,
 * or if one of its variants is (the variant opens from the card).
 */
export function matchesDiet(recipe: RecipeSummary, variants: RecipeSummary[], filter: DietFilter): boolean {
  if (filter === 'all') return true;
  const needed = DIET_RANK[filter];
  const ownDiet = recipe.diet ?? 'omnivore';
  return DIET_RANK[ownDiet] >= needed || variants.some(v => DIET_RANK[v.diet ?? 'omnivore'] >= needed);
}
