// Anteprima lista della spesa: cosa serve al planner vs cosa c'è già in lista.
// Funzione pura, senza dipendenze React/Expo.
import type { MealPlanEntry, Recipe, ShoppingItem } from '../types/recipe';
import type { Ingredient, ReadyMeal } from '../types/catalog';
import { cleanSupermarketIngredientName, normalizeIngredientKey } from '../utils/ingredientAggregator';
import { normalizeUnit, sameFamilyKey, toBase } from '../utils/unitConversion';

/** Le voci già spuntate contano come "già in lista" (cambiare qui per escluderle). */
export const CHECKED_COUNTS_AS_IN_LIST = true;

export interface ShoppingPreviewSource {
  entryId: string;
  label: string;
}

export interface ShoppingPreviewRow {
  key: string;
  name: string;
  unit: string;
  need: number | null;
  inList: number | null;
  missing: number | null;
  sources: ShoppingPreviewSource[];
  /** false se in lista c'è lo stesso ingrediente ma in un'unità diversa (non confrontabile). */
  comparable: boolean;
}

export interface ShoppingPreviewInput {
  today: string;
  entries: MealPlanEntry[];
  /** Solo per titolo (etichetta) e porzioni base della ricetta. */
  recipes: Record<string, Recipe>;
  ingredients: Record<string, Ingredient>;
  /** Righe ingredienti per id ricetta, già riferite alle porzioni base della ricetta. */
  recipeIngredients: Record<string, Array<{ ingredient_name: string; amount: number | null; unit: string }>>;
  readyMeals: Record<string, ReadyMeal>;
  shoppingItems: ShoppingItem[];
}

// Singolare/plurale delle unità, in modo che "spicchio" e "spicchi" siano la stessa unità.
const UNIT_ALIASES: Record<string, string> = {
  spicchi: 'spicchio', rotoli: 'rotolo', cucchiai: 'cucchiaio', cucchiaini: 'cucchiaino',
  pizzichi: 'pizzico', foglie: 'foglia', rametti: 'rametto', bustine: 'bustina',
  confezioni: 'confezione', fette: 'fetta', tazze: 'tazza', bicchieri: 'bicchiere',
  ciuffi: 'ciuffo', mazzi: 'mazzo', gambi: 'gambo', pezzi: 'pezzo', scatole: 'scatola',
  lattine: 'lattina', barattoli: 'barattolo', cubetti: 'cubetto', noci: 'noce', gr: 'g',
};

function unitKey(unit: string): string {
  const u = normalizeUnit(unit);
  return UNIT_ALIASES[u] || u;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
// Quantità della spesa senza cifre decimali: per eccesso, così la lista copre sempre il fabbisogno
export const wholeAmount = (n: number) => Math.ceil(round2(n));

interface Need {
  key: string;
  name: string;
  unit: string;
  amount: number | null;
  entryId: string;
  label: string;
}

function collectNeeds(input: ShoppingPreviewInput): Need[] {
  const needs: Need[] = [];
  for (const entry of input.entries) {
    if (entry.date < input.today) continue;

    const push = (rawName: string, unit: string, amount: number | null, label: string, keyPrefix = '') => {
      const name = cleanSupermarketIngredientName(rawName);
      const base = normalizeIngredientKey(name);
      if (!base) return;
      const key = keyPrefix + base;
      needs.push({ key, name, unit, amount, entryId: entry.id, label });
    };

    if (entry.kind === 'recipe' && entry.recipe_id) {
      const rows = input.recipeIngredients[entry.recipe_id];
      if (!rows) continue;
      const recipe = input.recipes[entry.recipe_id];
      const factor = entry.servings / (recipe?.servings || 4);
      const label = recipe?.title ?? '';
      for (const r of rows) {
        const amount = r.amount === null || r.amount === undefined ? null : r.amount * factor;
        push(r.ingredient_name, amount === null ? '' : r.unit || '', amount, label);
      }
    } else if (entry.kind === 'ingredient' && entry.ingredient_id) {
      const ing = input.ingredients[entry.ingredient_id];
      if (!ing) continue;
      let amount: number | null = null;
      let unit = '';
      // Una voce pianificata aggiunge una sola quantità da comprare
      if (ing.purchase_amount !== null && ing.purchase_amount !== undefined) {
        amount = ing.purchase_amount;
        unit = ing.purchase_unit || '';
      } else if (entry.amount !== null && entry.amount !== undefined) {
        amount = entry.amount;
        unit = entry.unit || ing.default_unit || '';
      } else if (ing.default_amount !== null && ing.default_amount !== undefined) {
        amount = ing.default_amount;
        unit = ing.default_unit || '';
      }
      push(ing.name, unit, amount, ing.name);
    } else if (entry.kind === 'ready' && entry.ready_meal_id) {
      const meal = input.readyMeals[entry.ready_meal_id];
      if (!meal) continue;
      push(meal.name, 'confezione', entry.count ?? 1, meal.name, 'ready:');
    }
  }
  return needs;
}

/** Porta una quantità all'unità base se convertibile; altrimenti unità normalizzata invariata. */
function convert(amount: number, unit: string, key: string) {
  const u = unitKey(unit);
  const b = toBase(amount, u, key);
  return { amount: b.amount, unit: b.family === 'none' ? u : b.unit, group: sameFamilyKey(key, u), family: b.family };
}

export function computeShoppingPreview(input: ShoppingPreviewInput): ShoppingPreviewRow[] {
  const groups = new Map<string, ShoppingPreviewRow & { gk: string; baseKey: string }>();
  const keysWithNeed = new Set<string>();

  for (const n of collectNeeds(input)) {
    keysWithNeed.add(n.key);
    // Le righe senza quantità (need null) sono separate da quelle con quantità
    const conv = n.amount === null ? null : convert(n.amount, n.unit, n.key);
    const gk = conv ? conv.group : `${n.key}|null`;
    let row = groups.get(gk);
    if (!row) {
      row = {
        key: gk, name: n.name, unit: conv ? conv.unit : '',
        need: null, inList: null, missing: null, sources: [], comparable: true, gk, baseKey: n.key,
      };
      groups.set(gk, row);
    }
    if (conv) row.need = (row.need ?? 0) + conv.amount;
    if (!row.sources.some(s => s.entryId === n.entryId && s.label === n.label)) {
      row.sources.push({ entryId: n.entryId, label: n.label });
    }
  }

  // Le righe senza quantità si fondono con la riga quantificata dello stesso ingrediente
  for (const nullRow of [...groups.values()]) {
    if (nullRow.need !== null) continue;
    const target = [...groups.values()].find(o => o !== nullRow && o.baseKey === nullRow.baseKey && o.need !== null);
    if (!target) continue;
    for (const source of nullRow.sources) {
      if (!target.sources.some(s => s.entryId === source.entryId && s.label === source.label)) target.sources.push(source);
    }
    groups.delete(nullRow.gk);
  }

  // Voci in lista per chiave
  const listByKey = new Map<string, ShoppingItem[]>();
  for (const it of input.shoppingItems) {
    if (!CHECKED_COUNTS_AS_IN_LIST && it.checked) continue;
    const key = normalizeIngredientKey(cleanSupermarketIngredientName(it.name));
    if (!key || !keysWithNeed.has(key)) continue;
    const arr = listByKey.get(key) || [];
    arr.push(it);
    listByKey.set(key, arr);
  }

  const rows: ShoppingPreviewRow[] = [];
  for (const row of groups.values()) {
    const { gk, baseKey, ...pub } = row;
    if (pub.need !== null) pub.need = wholeAmount(pub.need);
    const listed = listByKey.get(baseKey) || [];
    if (pub.need === null) {
      // Senza quantità non c'è nulla da confrontare
      pub.inList = null;
      pub.missing = null;
    } else {
      const sameAmounts = listed
        .filter(i => i.amount !== null)
        .map(i => convert(i.amount as number, i.unit, baseKey))
        .filter(c => c.group === gk)
        .map(c => c.amount);
      if (sameAmounts.length > 0) {
        pub.inList = wholeAmount(sameAmounts.reduce((s, a) => s + a, 0));
        pub.missing = Math.max(0, wholeAmount(pub.need) - pub.inList);
      } else {
        pub.missing = pub.need;
        // In lista c'è lo stesso ingrediente ma con altra unità (o senza quantità)
        if (listed.length > 0) {
          pub.comparable = false;
          pub.missing = null;
        }
      }
    }
    rows.push(pub);
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'it', { sensitivity: 'base' }) || a.unit.localeCompare(b.unit));
  return rows;
}
