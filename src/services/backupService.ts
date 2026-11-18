// Backup and restore of everything the user has in one JSON file: recipes, ingredients, ready meals,
// out-of-home options, planner, shopping list, favorites, notes, settings and AI keys.
import type { Recipe, MealPlanEntry, ShoppingItem } from '../types/recipe';
import type { Ingredient, ReadyMeal } from '../types/catalog';
import { getFavoriteIds, getCatalogRecipes, getFullCatalogRecipes, getMealPlans, getShoppingItems, getAllRecipeNotes } from '../db/database';
import { readAllKv, replaceAllKv, replaceFavorites, replacePlannerEntries, replaceRecipeNotes, replaceShoppingItems } from '../db/backupDb';
import { listIngredients, saveIngredient } from '../db/ingredientsDb';
import type { SaveIngredientInput } from '../db/ingredientsDb';
import { listReadyMeals, upsertReadyMeals } from '../db/readyMealsDb';
import type { SeedReadyMealInput } from '../db/readyMealsDb';
import { refreshCatalog } from './recipeCatalog';
import { applyCatalogImport, findUnresolvedImportIngredients } from './recipeBookService';
import type { ImportChoice } from '../utils/importResolution';
import { addOutOfHomeLabels, listOutOfHomeOptions } from './outOfHomeService';
import { getPlannerPreferences, savePlannerPreferences, type PlannerPreferences } from './plannerService';
import { loadAISettings, saveAISettings, type AISettings } from './settingsService';
import { loadLanguage, loadThemeMode, saveLanguage, saveThemeMode, type ThemeMode } from './preferencesService';
import { pickJsonText, shareJsonFile } from './jsonFiles';

export const BACKUP_FORMAT = 'green-whisker/backup';
export const BACKUP_VERSION = 1;

export interface BackupData {
  recipes: Recipe[];
  ingredients: Ingredient[];
  readyMeals: ReadyMeal[];
  outOfHome: string[];
  plannerEntries: MealPlanEntry[];
  shoppingItems: ShoppingItem[];
  favorites: string[];
  recipeNotes: Record<string, string>;
  kv: Record<string, string>;
  settings: {
    themeMode: ThemeMode;
    language: 'it' | 'en' | null;
    plannerPreferences: PlannerPreferences;
    aiSettings: AISettings;
  };
}

export interface RestoreSummary {
  recipes: number;
  ingredients: number;
  invalidIngredients: number;
  plannerEntries: number;
  droppedPlannerEntries: number;
}

export async function collectBackup(): Promise<BackupData> {
  const [recipes, ingredients, readyMeals, outOfHome, plannerEntries, shoppingItems, favorites, recipeNotes, kv, themeMode, language, plannerPreferences, aiSettings] = await Promise.all([
    getFullCatalogRecipes(),
    listIngredients(),
    listReadyMeals(),
    listOutOfHomeOptions(),
    getMealPlans(),
    getShoppingItems(),
    getFavoriteIds(),
    getAllRecipeNotes(),
    readAllKv(),
    loadThemeMode(),
    loadLanguage(),
    getPlannerPreferences(),
    loadAISettings(),
  ]);
  return {
    recipes, ingredients, readyMeals, outOfHome: [...outOfHome], plannerEntries, shoppingItems, favorites, recipeNotes, kv,
    settings: { themeMode, language, plannerPreferences, aiSettings },
  };
}

/** Writes the whole backup to a file. Returns the number of recipes it contains. */
export async function exportBackupFile(): Promise<number> {
  const data = await collectBackup();
  const json = JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt: new Date().toISOString(), data });
  await shareJsonFile(json, `green-whisker-backup-${new Date().toISOString().slice(0, 10)}.json`);
  return data.recipes.length;
}

/** Reads a backup file. Returns null if the user cancels; throws if the file is not a backup of this version. */
export async function pickBackup(): Promise<BackupData | null> {
  const text = await pickJsonText();
  if (text === null) return null;
  let file: any;
  try {
    file = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new Error('transfer_invalid_json');
  }
  if (!file || file.format !== BACKUP_FORMAT || file.version !== BACKUP_VERSION || !file.data) {
    throw new Error('transfer_invalid_format');
  }
  return file.data as BackupData;
}

/**
 * Restores a backup. Ingredients, ready meals, out-of-home options and recipes are added or updated;
 * planner, shopping list, favorites, notes and settings are replaced by the backup's.
 * Entries that point to something the backup does not contain are dropped and counted.
 */
export async function restoreBackup(data: BackupData): Promise<RestoreSummary> {
  // 1. ingredients first: recipes and planned entries refer to them
  let ingredientsOk = 0;
  let invalidIngredients = 0;
  for (const item of data.ingredients) {
    try {
      await saveIngredient(item as SaveIngredientInput);
      ingredientsOk++;
    } catch {
      invalidIngredients++;
    }
  }

  // 2. ready meals and out-of-home options
  await upsertReadyMeals(data.readyMeals as SeedReadyMealInput[]);
  await addOutOfHomeLabels(data.outOfHome);

  // 3. recipes: an unknown ingredient name becomes a new ingredient, so the restore never stops on it
  const parsed = { recipes: data.recipes, invalid: 0, duplicates: 0 };
  const unknown = await findUnresolvedImportIngredients(parsed);
  const choices = new Map<string, ImportChoice>(unknown.map(item => [item.key, { kind: 'new' }]));
  const recipesResult = await applyCatalogImport(parsed, 'overwrite', choices);

  // 4. what the rest of the backup may point to, now that the tables are in place
  const recipeIds = new Set((await getCatalogRecipes()).map(r => r.id));
  const ingredientIds = new Set((await listIngredients()).map(i => i.id));
  const readyIds = new Set(data.readyMeals.map(m => m.id));
  const plannerEntries = data.plannerEntries.filter(e =>
    (!e.recipe_id || recipeIds.has(e.recipe_id))
    && (!e.ingredient_id || ingredientIds.has(e.ingredient_id))
    && (!e.ready_meal_id || readyIds.has(e.ready_meal_id)));

  await replacePlannerEntries(plannerEntries);
  await replaceShoppingItems(data.shoppingItems);
  await replaceFavorites(data.favorites.filter(id => recipeIds.has(id)));
  await replaceRecipeNotes(Object.fromEntries(Object.entries(data.recipeNotes).filter(([id]) => recipeIds.has(id))));
  await replaceAllKv(data.kv);

  // 5. settings and AI keys
  await saveThemeMode(data.settings.themeMode);
  if (data.settings.language) await saveLanguage(data.settings.language);
  await savePlannerPreferences(data.settings.plannerPreferences);
  await saveAISettings(data.settings.aiSettings);
  await refreshCatalog();

  return {
    recipes: recipesResult.imported + recipesResult.updated,
    ingredients: ingredientsOk,
    invalidIngredients,
    plannerEntries: plannerEntries.length,
    droppedPlannerEntries: data.plannerEntries.length - plannerEntries.length,
  };
}
