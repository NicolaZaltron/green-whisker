import type { SimpleSlot } from '../types/recipe';

export const ALL_SIMPLE_SLOTS: SimpleSlot[] = ['colazione', 'spuntino_mattina', 'pranzo', 'spuntino_pomeriggio', 'cena'];

const BREAKFAST_PATTERN = /uova|avocado|melone|frutta|yogurt|pane|toast/i;
const OUTDOOR_PATTERN = /picnic|al sacco|ufficio/i;
const BREAKFAST_SLOTS: SimpleSlot[] = ['colazione', 'spuntino_mattina', 'spuntino_pomeriggio'];
const LUNCH_SLOTS: SimpleSlot[] = ['pranzo'];
const SNACK_LUNCH_DINNER_SLOTS: SimpleSlot[] = ['pranzo', 'cena', 'spuntino_pomeriggio'];
const DEFAULT_SLOTS: SimpleSlot[] = ['pranzo', 'cena'];

// Tags that do not describe the kind of meal (so they do not count as "other meal tag").
const NON_MEAL_TAGS = ['VEGETARIANO', 'VEGANO', 'SURGELATO', 'FUORI CASA', 'FORMAGGIO', 'AVANZI'];

export function suggestedSlots(item: { name: string; tags: string[] }): SimpleSlot[] {
  if (
    BREAKFAST_PATTERN.test(item.name) ||
    item.tags.some(tag => BREAKFAST_PATTERN.test(tag)) ||
    item.tags.includes('FRUTTA')
  ) {
    return [...BREAKFAST_SLOTS];
  }

  if (item.tags.includes('FUORI CASA') && OUTDOOR_PATTERN.test(item.name)) {
    return [...LUNCH_SLOTS];
  }

  const hasCheeseOrLeftovers = item.tags.includes('FORMAGGIO') || item.tags.includes('AVANZI');
  const hasOtherMealTag = item.tags.some(tag => !NON_MEAL_TAGS.includes(tag));
  if (hasCheeseOrLeftovers && !hasOtherMealTag) {
    return [...SNACK_LUNCH_DINNER_SLOTS];
  }

  return [...DEFAULT_SLOTS];
}

export function effectiveSlots(item: {
  name: string;
  tags: string[];
  slots?: SimpleSlot[] | null;
}): SimpleSlot[] {
  if (Array.isArray(item.slots) && item.slots.length > 0) {
    return item.slots;
  }
  return suggestedSlots(item);
}
