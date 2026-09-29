import { Recipe, MealPlanEntry, IngredientItem } from '../types/recipe';
import { addShoppingItems } from '../db/database';
import { scaleIngredient } from '../utils/servingsScaler';

export function getWeekDays(startDate?: Date): Array<{ dateString: string; dayName: string; dayNumber: number; isToday: boolean }> {
  const base = startDate ? new Date(startDate) : new Date();
  // Get Monday of current week
  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.setDate(diff));

  const italianDays = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
  const todayStr = new Date().toISOString().split('T')[0];

  const days = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateString = current.toISOString().split('T')[0];
    days.push({
      dateString,
      dayName: italianDays[i],
      dayNumber: current.getDate(),
      isToday: dateString === todayStr
    });
  }
  return days;
}

export async function aggregateAndAddToShopping(
  entries: MealPlanEntry[],
  recipesMap: Record<string, Recipe>
): Promise<number> {
  const itemsToAdd: Array<{
    recipeId: string;
    recipeTitle: string;
    ingredientText: string;
    name: string;
    amount?: number | null;
    unit?: string;
    category?: string;
  }> = [];

  for (const entry of entries) {
    const recipe = recipesMap[entry.recipe_id];
    if (!recipe) continue;

    const baseServings = recipe.porzioni || 4;
    const factor = entry.servings / baseServings;
    const titleWithServings = `${recipe.titolo} (${entry.servings} porz.)`;

    if (recipe.ingredienti_dettagliati && recipe.ingredienti_dettagliati.length > 0) {
      for (const ing of recipe.ingredienti_dettagliati) {
        const scaled = scaleIngredient(ing.quantita, ing.unita, ing.ingrediente, ing.testo, factor);

        itemsToAdd.push({
          recipeId: recipe.id,
          recipeTitle: titleWithServings,
          ingredientText: scaled.formattedText,
          name: scaled.name,
          amount: scaled.scaledAmount,
          unit: scaled.unit,
          category: ing.sezione || 'Generale'
        });
      }
    } else {
      for (const ingStr of recipe.ingredienti) {
        itemsToAdd.push({
          recipeId: recipe.id,
          recipeTitle: titleWithServings,
          ingredientText: ingStr,
          name: ingStr,
          category: 'Generale'
        });
      }
    }
  }

  if (itemsToAdd.length > 0) {
    await addShoppingItems(itemsToAdd);
  }

  return itemsToAdd.length;
}
