import type { RecommendedSlot, RecipeSummary } from '../types/recipe';

const BREAKFAST_SLOTS = ['colazione'];
const SNACK_SLOTS = ['spuntino_mattina', 'spuntino_pomeriggio'];
const MEAL_SLOTS = ['pranzo', 'cena'];

// Planner slots compatible with each recommended_slot
const SLOTS_BY_RECOMMENDED: Partial<Record<RecommendedSlot, string[]>> = {
  colazione: BREAKFAST_SLOTS,
  breakfast: BREAKFAST_SLOTS,
  spuntino: SNACK_SLOTS,
  snack: SNACK_SLOTS,
  pranzo_cena: MEAL_SLOTS,
  lunch_dinner: MEAL_SLOTS,
};

/**
 * Recipe compatible with a planner slot.
 * Without recommended_slot (or with an unknown value): all slots except breakfast and snacks.
 */
export function isRecipeForSlot(recipe: RecipeSummary, slot: string): boolean {
  const recommended = recipe.recommended_slot;
  const allowed = recommended ? SLOTS_BY_RECOMMENDED[recommended] : undefined;
  if (allowed) return allowed.includes(slot);
  return slot !== 'colazione' && !slot.startsWith('spuntino_');
}
