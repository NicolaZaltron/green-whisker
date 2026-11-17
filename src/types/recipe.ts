import type { SimpleTag } from '../constants/simpleTags';
export interface IngredientItem {
  section: string;
  text: string;
  amount: number | null;
  unit: string;
  ingredient: string;
  // Id of the ingredients seed, assigned by matching with the catalog; absent if the row is not catalogued
  ingredient_id?: string;
}

export interface IngredientSection {
  section: string;
  ingredients: string[];
}

export interface RecipeTimes {
  total_minutes: number;
  prep_time: string | null;
  cook_time: string | null;
  display_time: string;
}

export type RecommendedSlot = 'colazione' | 'spuntino' | 'pranzo_cena' | 'breakfast' | 'snack' | 'lunch_dinner';
export type SlotConsigliato = RecommendedSlot;
export type GruppoAlimentare = 'cereali' | 'verdura' | 'frutta' | 'frutta_secca_semi' | 'cibi_proteici' | 'grassi';

export type ProteinGroup = 'legumi_interi' | 'soia_derivati' | 'cereali_proteici' | 'leggero_vegetale';
export type CarbFamily = 'pasta' | 'riso' | 'farro_orzo' | 'pseudocereali' | 'tuberi' | 'pane_cereali_rapidi' | 'none';
export type VeggieColor = 'green' | 'red_orange' | 'purple_blue' | 'yellow_white' | 'neutral';
export type Season = 'inverno' | 'primavera' | 'estate' | 'autunno';

export interface Recipe {
  id: string;
  title: string;
  source: string;
  url: string;
  image: string;
  category: string;
  macro_category?: string;
  subcategory?: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'Facile' | 'Media' | 'Difficile';
  servings: number;
  servings_text?: string;
  times: RecipeTimes;
  ingredients: string[];
  ingredients_by_section?: IngredientSection[];
  detailed_ingredients?: IngredientItem[];
  instructions: string[];
  tips?: string[];
  tags: string[];
  recommended_slot?: RecommendedSlot;
  food_groups?: GruppoAlimentare[];

  protein_group: ProteinGroup;
  carb_family: CarbFamily;
  veggie_color: VeggieColor;
  seasons: Season[];
  is_complete_plate: boolean;

  // Catalog fields (optional: old files do not have them)
  diet?: RecipeDiet;
  diet_source?: 'auto' | 'manual';
  origin?: RecipeOrigin;
  modified?: boolean;
  variant_of?: string;
  needs_review?: boolean;
  created_at?: number;
  updated_at?: number;
}

export type RecipeDiet = 'omnivore' | 'vegetarian' | 'vegan';
export type RecipeOrigin = 'file' | 'ai' | 'manual';

export interface ShoppingItem {
  id: string;
  recipe_id?: string;
  recipe_title?: string;
  ingredient_text: string;
  name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  category: string;
  created_at: number;
}

export type SimpleSlot = 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';

export interface SimpleItem {
  id: string;
  name: string;
  tags: SimpleTag[];
  amount: number | null;
  unit: string;
  recipe_ids: string[];
  slots: SimpleSlot[];
  created_at: number;
  updated_at: number;
}

// Recipe to prepare (goes into the shopping list) or servings already ready (does not)
export type RecipeSource = 'prepare' | 'ready';

export interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  slot: 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';
  kind: 'recipe' | 'ingredient' | 'ready' | 'out';
  recipe_id?: string;
  recipe_source?: RecipeSource; // only for kind 'recipe'; absent = 'prepare'
  ingredient_id?: string;
  ready_meal_id?: string;
  label?: string; // only for kind 'out': name of the out-of-home meal
  amount?: number | null;
  unit?: string;
  count?: number;
  servings: number;
  notes?: string;
  created_at: number;
}
