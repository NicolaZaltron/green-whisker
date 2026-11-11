import type { RecommendedSlot, Recipe } from '../types/recipe';

const BREAKFAST_SLOTS = ['colazione'];
const SNACK_SLOTS = ['spuntino_mattina', 'spuntino_pomeriggio'];
const MEAL_SLOTS = ['pranzo', 'cena'];

// Slot del planner compatibili con ciascun recommended_slot
const SLOTS_BY_RECOMMENDED: Partial<Record<RecommendedSlot, string[]>> = {
  colazione: BREAKFAST_SLOTS,
  breakfast: BREAKFAST_SLOTS,
  spuntino: SNACK_SLOTS,
  snack: SNACK_SLOTS,
  pranzo_cena: MEAL_SLOTS,
  lunch_dinner: MEAL_SLOTS,
};

/**
 * Ricetta compatibile con uno slot del planner.
 * Senza recommended_slot (o con valore sconosciuto): tutti gli slot tranne colazione e spuntini.
 */
export function isRecipeForSlot(recipe: Recipe, slot: string): boolean {
  const recommended = recipe.recommended_slot;
  const allowed = recommended ? SLOTS_BY_RECOMMENDED[recommended] : undefined;
  if (allowed) return allowed.includes(slot);
  return slot !== 'colazione' && !slot.startsWith('spuntino_');
}
