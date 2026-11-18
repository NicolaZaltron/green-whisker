// Import resolution: which ingredient rows of an imported recipe book have no match in the database,
// and how the user decided to resolve them. Pure functions, without database or React.
import { matchCatalogName, normalizeIngredientName } from './catalogNameMatch';
import type { IngredientItem } from '../types/recipe';

export interface ImportLinkEntry {
  recipeId: string;
  recipeTitle: string;
  items: IngredientItem[];
}

export interface KnownIngredient {
  id: string;
  name: string;
  aliases?: readonly string[];
}

// Unknown ingredient name, grouped: the user decides once for all the recipes that use it
export interface UnresolvedIngredient {
  key: string;
  name: string;
  recipeTitles: string[];
}

export type ImportChoice = { kind: 'existing'; ingredientId: string } | { kind: 'new' };

export function rowName(item: IngredientItem): string {
  return (item.ingredient || item.text || '').trim();
}

/** Id of the ingredient the row points to: by its own id, otherwise by name or alias. Null if unknown. */
export function resolveRowId(
  item: IngredientItem,
  knownIds: ReadonlySet<string>,
  names: readonly KnownIngredient[],
): string | null {
  if (item.ingredient_id && knownIds.has(item.ingredient_id)) return item.ingredient_id;
  return matchCatalogName(rowName(item), names).id ?? null;
}

/** Same as resolveRowId, then the choices made by the user for the unknown names (keyed by normalized name). */
export function resolveRowIdWithChoices(
  item: IngredientItem,
  knownIds: ReadonlySet<string>,
  names: readonly KnownIngredient[],
  choiceIds: ReadonlyMap<string, string>,
): string | null {
  return resolveRowId(item, knownIds, names) ?? choiceIds.get(normalizeIngredientName(rowName(item))) ?? null;
}

/** Groups the rows that have no match. Rows without a name are ignored. */
export function findUnresolvedIngredients(
  entries: readonly ImportLinkEntry[],
  known: readonly KnownIngredient[],
): UnresolvedIngredient[] {
  const knownIds = new Set(known.map(k => k.id));
  const groups = new Map<string, UnresolvedIngredient>();
  for (const entry of entries) {
    for (const item of entry.items) {
      if (resolveRowId(item, knownIds, known)) continue;
      const name = rowName(item);
      const key = normalizeIngredientName(name);
      if (!key) continue;
      const group = groups.get(key) ?? { key, name, recipeTitles: [] };
      if (!group.recipeTitles.includes(entry.recipeTitle)) group.recipeTitles.push(entry.recipeTitle);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }));
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Id of an ingredient created by the user: user_<slug of the name>, with a numeric suffix on collision. */
export function userIngredientId(name: string, taken: Set<string>): string {
  const base = `user_${slug(name) || 'ingrediente'}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
  taken.add(id);
  return id;
}
