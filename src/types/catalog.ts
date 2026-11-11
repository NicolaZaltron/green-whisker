export const INGREDIENT_TYPES = ['frutta','verdura','legumi','cereali','carne','pesce','frutta_secca','semi','latticini','dolcificanti','condimenti','uova','bevande','spezie','pronti','altro'] as const;
export type IngredientType = typeof INGREDIENT_TYPES[number];

export const INGREDIENT_TAGS = ['vegetariano','vegano','senza_glutine','confezionato','surgelato','in_scatola','solo_ricetta'] as const;
export type IngredientTag = typeof INGREDIENT_TAGS[number];

export const NUTRIENTS = ['proteine','calcio','potassio','zinco','omega3','iodio','vitamina_b2','vitamina_c','ferro','fibre','kcal'] as const;
export type Nutrient = typeof NUTRIENTS[number];

/** Raw food. Nutrients are per 100 g. */
export interface Ingredient {
  id: string;
  name: string;
  type: IngredientType;
  tags: IngredientTag[];
  edible_alone: boolean;
  default_amount: number | null;
  default_unit: string;
  purchase_amount: number | null;
  purchase_unit: string;
  density_g_per_ml: number | null;
  nutrients: Partial<Record<Nutrient, number>>;
  created_at: number;
  updated_at: number;
}

export const READY_MEAL_CATEGORIES = ['pronto'] as const;
export type ReadyMealCategory = typeof READY_MEAL_CATEGORIES[number];

/** Ready-to-eat product or takeaway. Nutrients are per portion. */
export interface ReadyMeal {
  id: string;
  name: string;
  category: ReadyMealCategory;
  tags: IngredientTag[] | string[];
  slots: string[];
  default_count: number;
  nutrients: Partial<Record<Nutrient, number>>;
  created_at: number;
  updated_at: number;
}

export interface RecipeIngredient {
  recipe_id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string;
  note: string;
  position: number;
}

export interface RecipeLink {
  recipe_id: string;
  ingredients: RecipeIngredient[];
}
