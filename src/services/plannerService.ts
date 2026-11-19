import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { RecipeSummary, MealPlanEntry } from '../types/recipe';
import { toLocalDateString, rollingDays, formatWeekday, formatMonthShort } from '../utils/dates';
import i18n from '../i18n';
import { MEAL_COLORS_LIGHT, MEAL_COLORS_DARK } from '../theme/mealColors';
import { getMealPlans, saveMealPlanEntriesBulk, deleteMealPlanEntry, getKV, setKV } from '../db/database';

import { catalogRecipes } from './recipeCatalog';

// Anti-repetition looks back this many days before the generated days
const HISTORY_DAYS = 56;

/** Date range read for the generator: the history before the given dates, up to the last of them. */
export function planHistoryRange(dates: string[]): { fromDate: string; toDate: string } | undefined {
  if (dates.length === 0) return undefined;
  const sorted = [...dates].sort();
  const from = new Date(`${sorted[0]}T00:00:00`);
  from.setDate(from.getDate() - HISTORY_DAYS);
  return { fromDate: toLocalDateString(from), toDate: sorted[sorted.length - 1] };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannerPreferences {
  servings: number;
  includeWeekend: boolean;
  maxWeekdayLunchMinutes: number | null;
  autoGenerateOnMonday: boolean;
  includeSnacks?: boolean;
  /** 'week' = Mon-Sun of the week; 'rolling' = 7 days from today */
  calendarMode: 'week' | 'rolling';
}

export interface WeekDayInfo {
  dateString: string;
  dayName: string; // full weekday name in the active language
  dayShort: string; // short weekday name in the active language
  dayNumber: number;
  monthName: string;
  isToday: boolean;
}

export interface WeekDaysResult {
  days: WeekDayInfo[];
  weekLabel: string;
  offsetWeeks: number;
}

export interface AutoPlanOptions {
  servings: number;
  includeWeekend: boolean;
  maxWeekdayLunchMinutes: number | null;
  onlyEmptySlots: boolean;
  includeSnacks?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// NUTRITIONAL ROTATION & HEALTHY PLATE DOMAIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Weekly protein frequency matrix */
export type ProteinGroup =
  | 'legumi_interi'      // chickpeas, lentils, beans, fava beans, peas, grass peas
  | 'soia_derivati'      // tofu, tempeh, edamame, seitan
  | 'cereali_proteici'   // quinoa, spelt, buckwheat, chickpea farinata
  | 'leggero_vegetale';  // velvety soups, dense vegetables with seeds/nuts

/** Rotation of cereals and carbohydrates (max 2 times/week per family) */
export type CarbFamily =
  | 'pasta'              // pasta, spaghetti, fusilli, penne
  | 'riso'               // basmati, brown, black (venere), carnaroli rice
  | 'farro_orzo'         // spelt, pearl/hulled barley
  | 'pseudocereali'      // quinoa, buckwheat, millet, amaranth
  | 'tuberi'             // potatoes, sweet potatoes, gnocchi
  | 'pane_cereali_rapidi'// couscous, bulgur, bread, piadina, polenta
  | 'nessuno';

/** Rainbow Plate: phytonutrients by dominant color */
export type VeggieColor =
  | 'verde'              // chlorophyll, folates, lutein
  | 'rosso_arancione'    // carotenoids, lycopene, beta-carotene
  | 'viola_blu'          // anthocyanins, polyphenols
  | 'bianco'             // allyl sulfides, quercetin
  | 'misto_neutro';

/** Seasonality */
export type Season = 'inverno' | 'primavera' | 'estate' | 'autunno';

/** Result of the Balanced Plate Rule classification */
export interface HealthyPlateClassification {
  proteinGroup: ProteinGroup;
  carbFamily: CarbFamily;
  veggieColor: VeggieColor;
  isSeasonal: boolean;
  hasProtein: boolean;
  hasCarb: boolean;
  hasVeggie: boolean;
  isCompleteMeal: boolean;
}

// Legacy protein type (compatibility)
export type ProteinType = 'legumi' | 'soya' | 'verdure' | null;

// Legacy carbohydrate type (compatibility)
export type CarbType = 'complessi' | 'semplici' | null;

// ─────────────────────────────────────────────────────────────────────────────
// NUTRITIONAL CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Breakfast categories (Slot Matching Rule: Breakfast Slot)
 */
export const BREAKFAST_CATEGORIES = new Set([
  'CAT_PORRIDGE_E_OVERNIGHT_OATS',
  'CAT_A_BASE_DI_YOGURT_VEGETALE',
  'CAT_BISCOTTI',
  'CAT_MERENDE_E_COLAZIONI_DOLCI',
  'CAT_FRULLATI',
  'CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO',
  'CAT_A_BASE_DI_LATTE_VEGETALE',
]);

/**
 * Categories for morning/afternoon snacks (Slot Matching Rule: Snack Slot)
 */
export const SNACK_CATEGORIES = new Set([
  'CAT_ENERGY_BALLS_E_BARRETTE',
  'CAT_FRUTTA_FRESCA_E_MACEDONIE',
  'CAT_FRUTTA_SECCA',
  'CAT_GELATI',
]);

/**
 * Self-sufficient One-Dish Meal categories (Plate Structure: Option B)
 */
export const PIATTO_UNICO_CATEGORIES = new Set([
  'CAT_BOWL',
  'CAT_INSALATE_DI_CEREALI',
  'CAT_INSALATE_DI_LEGUMI',
  'CAT_PASTA_AL_FORNO',
  'CAT_PIADINE_E_WRAPS',
  'CAT_TORTE_SALATE',
  'CAT_PIZZE_E_FOCACCIE',
  'CAT_PANINI_E_BRUSCHETTE',
]);

/**
 * First Courses and Soups categories (Plate Structure: Option A - First)
 */
export const PRIMI_CATEGORIES = new Set([
  'CAT_PRIMI_PIATTI',
  'CAT_RISOTTI',
  'CAT_GNOCCHI',
  'CAT_POLENTA',
  'CAT_ZUPPE_E_VELLUTATE',
]);

/**
 * Second Courses and Proteins categories (Plate Structure: Option A - Second)
 */
export const SECONDI_CATEGORIES = new Set([
  'CAT_SECONDI_PIATTI',
  'CAT_PIATTI_A_BASE_DI_LEGUMI',
  'CAT_SECONDI_A_BASE_DI_TOFU',
  'CAT_SECONDI_A_BASE_DI_TEMPEH',
  'CAT_SECONDI_A_BASE_DI_SEITAN',
  'CAT_SECONDI_A_BASE_DI_SOIA',
  'CAT_FARINATE_E_FRITTATE',
  'CAT_POLPETTE_E_BURGER',
  'CAT_COTOLETTE',
]);

/**
 * Side Dishes and Vegetables categories (Plate Structure: Side Dish Pairing)
 */
export const CONTORNI_CATEGORIES = new Set([
  'CAT_CONTORNI',
  'CAT_VERDURE_AL_FORNO',
  'CAT_VERDURE_IN_PADELLA',
  'CAT_VERDURE_BOLLITE_E_A_VAPORE',
]);

/** Daily slot type (5 daily meals) */
export type MealSlot = 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';

/** Canonical order of the 5 slots in the day (for display and loops) */
export const SLOT_ORDER: MealSlot[] = [
  'colazione',
  'spuntino_mattina',
  'pranzo',
  'spuntino_pomeriggio',
  'cena',
];

/** Ionicons icons for each slot */
export const SLOT_ICONS: Record<MealSlot, string> = {
  colazione: 'cafe-outline',
  spuntino_mattina: 'nutrition-outline',
  pranzo: 'sunny-outline',
  spuntino_pomeriggio: 'leaf-outline',
  cena: 'moon-outline',
};

/** Colors for each slot (light in color/bgColor, dark in darkColor/darkBgColor) */
export const SLOT_COLORS: Record<
  MealSlot,
  { color: string; bgColor: string; darkColor: string; darkBgColor: string }
> = Object.fromEntries(
  (Object.keys(MEAL_COLORS_LIGHT) as MealSlot[]).map(slot => [slot, {
    color: MEAL_COLORS_LIGHT[slot].color,
    bgColor: MEAL_COLORS_LIGHT[slot].bgColor,
    darkColor: MEAL_COLORS_DARK[slot].color,
    darkBgColor: MEAL_COLORS_DARK[slot].bgColor,
  }]),
) as Record<MealSlot, { color: string; bgColor: string; darkColor: string; darkBgColor: string }>;

/**
 * Returns the suitable and recommended recipes for each of the 5 meal slots,
 * based on the canonical category mapping per slot (Slot Matching Rule).
 */
export function getRecipesForSlot(slot: MealSlot): RecipeSummary[] {
  if (slot === 'colazione') {
    return catalogRecipes.filter(r => BREAKFAST_CATEGORIES.has(r.category));
  }
  if (slot === 'spuntino_mattina' || slot === 'spuntino_pomeriggio') {
    return catalogRecipes.filter(r => SNACK_CATEGORIES.has(r.category));
  }
  // Lunch and Dinner: One-dish meals, First courses, Second courses and Side dishes
  return catalogRecipes.filter(r =>
    PIATTO_UNICO_CATEGORIES.has(r.category) ||
    PRIMI_CATEGORIES.has(r.category) ||
    SECONDI_CATEGORIES.has(r.category) ||
    CONTORNI_CATEGORIES.has(r.category)
  );
}

export function isAuthenticSideDish(r: RecipeSummary): boolean {
  return (
    r.category === 'CAT_CONTORNI' ||
    r.category === 'CAT_VERDURE_AL_FORNO' ||
    r.category === 'CAT_VERDURE_IN_PADELLA' ||
    r.category === 'CAT_VERDURE_BOLLITE_E_A_VAPORE'
  );
}

export function getSideRecipes(recipes: RecipeSummary[] = catalogRecipes): RecipeSummary[] {
  return recipes.filter(isAuthenticSideDish);
}

/**
 * Returns the current season based on the date
 */
export function getCurrentSeason(date: Date = new Date()): Season {
  const m = date.getMonth() + 1; // 1 - 12
  if (m === 12 || m === 1 || m === 2) return 'inverno';
  if (m >= 3 && m <= 5) return 'primavera';
  if (m >= 6 && m <= 8) return 'estate';
  return 'autunno';
}

/**
 * O(1) classifier of the Balanced Plate Rule based on the recipe's normalized metadata.
 */
export function classifyHealthyPlate(recipe: RecipeSummary, season: Season = getCurrentSeason()): HealthyPlateClassification {
  const proteinGroup: ProteinGroup = recipe.protein_group || 'leggero_vegetale';
  const rawCarb = (recipe.carb_family as string) || 'nessuno';
  const carbFamily: CarbFamily = rawCarb === 'none' ? 'nessuno' : (rawCarb as CarbFamily);

  const rawColor = (recipe.veggie_color as string) || 'misto_neutro';
  const colorMap: Record<string, VeggieColor> = {
    green: 'verde',
    red_orange: 'rosso_arancione',
    purple_blue: 'viola_blu',
    yellow_white: 'bianco',
    neutral: 'misto_neutro',
    verde: 'verde',
    rosso_arancione: 'rosso_arancione',
    viola_blu: 'viola_blu',
    bianco: 'bianco',
    misto_neutro: 'misto_neutro',
  };
  const veggieColor: VeggieColor = colorMap[rawColor] || 'misto_neutro';

  const isSeasonal = recipe.seasons ? recipe.seasons.includes(season) : true;
  const hasProtein =
    proteinGroup !== 'leggero_vegetale' ||
    Boolean(recipe.food_groups?.includes('cibi_proteici'));
  const hasCarb =
    carbFamily !== 'nessuno' ||
    Boolean(recipe.food_groups?.includes('cereali'));
  const hasVeggie =
    veggieColor !== 'misto_neutro' ||
    Boolean(recipe.food_groups?.includes('verdura'));
  const isCompleteMeal = recipe.is_complete_plate ?? (hasProtein && hasCarb && hasVeggie);

  return {
    proteinGroup,
    carbFamily,
    veggieColor,
    isSeasonal,
    hasProtein,
    hasCarb,
    hasVeggie,
    isCompleteMeal,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY CLASSIFIERS (for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export function classifyProtein(recipe: RecipeSummary): ProteinType {
  const hp = classifyHealthyPlate(recipe);
  if (hp.proteinGroup === 'soia_derivati') return 'soya';
  if (hp.proteinGroup === 'legumi_interi') return 'legumi';
  return 'verdure';
}

export function classifyCarb(recipe: RecipeSummary): CarbType {
  const hp = classifyHealthyPlate(recipe);
  if (['farro_orzo', 'pseudocereali', 'tuberi'].includes(hp.carbFamily)) return 'complessi';
  if (['pasta', 'riso', 'pane_cereali_rapidi'].includes(hp.carbFamily)) return 'semplici';
  return null;
}

export function extractMainCarb(recipe: RecipeSummary): string | null {
  const hp = classifyHealthyPlate(recipe);
  return hp.carbFamily !== 'nessuno' ? hp.carbFamily : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK DAYS HELPER
// ─────────────────────────────────────────────────────────────────────────────

// Active app language, same source as the UI (i18next)
function activeLocale(): 'it' | 'en' {
  return i18n.language?.startsWith('en') ? 'en' : 'it';
}

export function getWeekDays(offsetWeeks: number = 0, locale: 'it' | 'en' = activeLocale()): WeekDaysResult {
  const now = new Date();
  const base = new Date();
  base.setDate(now.getDate() + offsetWeeks * 7);

  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.setDate(diff));

  const todayStr = toLocalDateString(new Date());

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateString = toLocalDateString(current);
    days.push({
      dateString,
      dayName: formatWeekday(current, locale, 'long'),
      dayShort: formatWeekday(current, locale, 'short'),
      dayNumber: current.getDate(),
      monthName: formatMonthShort(current, locale),
      isToday: dateString === todayStr,
    });
  }

  const tr = i18n.getFixedT(locale);
  let weekLabel = tr('planner.week.this');
  if (offsetWeeks === 1) weekLabel = tr('planner.week.next');
  else if (offsetWeeks === -1) weekLabel = tr('planner.week.last');
  else if (offsetWeeks !== 0) weekLabel = tr('planner.week.from', { day: days[0].dayNumber, month: days[0].monthName });

  return { days, weekLabel, offsetWeeks };
}

// Planner days based on calendar mode: 'week' uses getWeekDays, 'rolling' 7 days from today + offset*7
export function getPlannerDays(mode: 'week' | 'rolling', offset: number, locale: 'it' | 'en' = activeLocale()): { days: WeekDayInfo[]; label: string } {
  if (mode === 'week') {
    const { days, weekLabel } = getWeekDays(offset, locale);
    return { days, label: weekLabel };
  }
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * 7);
  const todayStr = toLocalDateString(now);
  const rolling = rollingDays(start, 7, locale);
  return {
    days: rolling.days.map(d => {
      const [y, m, dd] = d.dateString.split('-').map(Number);
      const date = new Date(y, m - 1, dd);
      return {
        dateString: d.dateString,
        dayName: formatWeekday(date, locale, 'long'),
        dayShort: formatWeekday(date, locale, 'short'),
        dayNumber: d.dayNumber,
        monthName: formatMonthShort(date, locale),
        isToday: d.dateString === todayStr,
      };
    }),
    label: rolling.label,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENCES
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: PlannerPreferences = {
  servings: 2,
  includeWeekend: true,
  maxWeekdayLunchMinutes: 30,
  autoGenerateOnMonday: true,
  calendarMode: 'week',
};

const PLANNER_PREFS_KEY = 'gw_planner_prefs';

// Same logic as the theme/language settings: SecureStore on device, localStorage on web.
// If the key does not exist yet in the new storage, the old copy in the database KV is read (migration).
async function readPlannerPrefsRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return window.localStorage.getItem(PLANNER_PREFS_KEY);
  }
  return SecureStore.getItemAsync(PLANNER_PREFS_KEY);
}

export async function getPlannerPreferences(): Promise<PlannerPreferences> {
  try {
    let json = await readPlannerPrefsRaw();
    if (!json) json = await getKV(PLANNER_PREFS_KEY);
    if (json) return { ...DEFAULT_PREFERENCES, ...JSON.parse(json) };
  } catch (e) {
    console.warn('getPlannerPreferences error', e);
  }
  return DEFAULT_PREFERENCES;
}

export async function savePlannerPreferences(prefs: Partial<PlannerPreferences>): Promise<void> {
  try {
    const current = await getPlannerPreferences();
    const json = JSON.stringify({ ...current, ...prefs });
    if (Platform.OS === 'web') {
      window.localStorage.setItem(PLANNER_PREFS_KEY, json);
    } else {
      await SecureStore.setItemAsync(PLANNER_PREFS_KEY, json);
    }
  } catch (e) {
    console.warn('savePlannerPreferences error', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BALANCED GENERATION ALGORITHM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fisher-Yates (Knuth) shuffle — O(N), uniform distribution.
 * Returns a new array; the original is not mutated.
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates a nutritionally balanced and varied weekly plan respecting:
 *
 * 1. ASSIGNMENT TO THE DAY'S SLOTS (Slot Matching Rule):
 *    - Breakfast: CAT_PORRIDGE_E_OVERNIGHT_OATS, CAT_A_BASE_DI_YOGURT_VEGETALE, CAT_A_BASE_DI_LATTE_VEGETALE,
 *      CAT_BISCOTTI, CAT_MERENDE_E_COLAZIONI_DOLCI, CAT_FRULLATI, CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO, CAT_FRUTTA_SECCA.
 *    - Snacks: CAT_ENERGY_BALLS_E_BARRETTE, CAT_FRUTTA_FRESCA_E_MACEDONIE, CAT_FRUTTA_SECCA, CAT_GELATI, CAT_FRULLATI.
 *    - Lunch and Dinner: CAT_PRIMI_PIATTI, CAT_RISOTTI, CAT_GNOCCHI, CAT_POLENTA, CAT_PIATTI_A_BASE_DI_LEGUMI,
 *      CAT_SECONDI_A_BASE_DI_TOFU/TEMPEH/SEITAN/SOIA, CAT_POLPETTE_E_BURGER, CAT_COTOLETTE, CAT_BOWL, CAT_ZUPPE_E_VELLUTATE,
 *      CAT_PASTA_AL_FORNO, CAT_PIADINE_E_WRAPS, CAT_TORTE_SALATE, CAT_PIZZE_E_FOCACCIE, CAT_PANINI_E_BRUSCHETTE.
 *
 * 2. PLATE STRUCTURE (Structured Meal vs One-Dish Meal):
 *    - Option A - Structured Meal: Picks a First (CAT_PRIMI_PIATTI / CAT_RISOTTI / CAT_GNOCCHI) or a Second
 *      and pairs it with an authentic side recipe from CAT_CONTORNI, CAT_VERDURE_... or CAT_ZUPPE_E_VELLUTATE.
 *    - Option B - One-Dish Meal: Picks a complete and self-sufficient recipe (CAT_BOWL, CAT_INSALATE_DI_CEREALI,
 *      CAT_INSALATE_DI_LEGUMI, CAT_PASTA_AL_FORNO, CAT_PIADINE_E_WRAPS, CAT_TORTE_SALATE, CAT_PIZZE_E_FOCACCIE)
 *      without forcing an additional side (no second entry in the slot).
 *
 * 3. ANTI-MONOTONY ROTATION (Anti-Repetition Score):
 *    - Sliding window of the categories used in the last 3 main meals with decreasing penalty.
 *    - Continuous rotation among the different protein sources (tofu -> legumes -> farinate -> tempeh...).
 *    - No carbohydrate family repeated for 2 consecutive main meals.
 *    - Format alternation: if lunch is a One-Dish Meal, dinner is a structured meal; first/second alternation.
 *    - Rainbow Plate & Seasonality: color contrast between lunch and dinner of the same day and seasonal bonus.
 */
/**
 * Maps a protein category to its macro-subfamily to guarantee
 * anti-monotony alternation (e.g. soy/tofu -> legumes -> farinate/burger).
 */
export function getProteinSubgroup(category: string): string {
  if (
    category === 'CAT_SECONDI_A_BASE_DI_TOFU' ||
    category === 'CAT_SECONDI_A_BASE_DI_TEMPEH' ||
    category === 'CAT_SECONDI_A_BASE_DI_SEITAN' ||
    category === 'CAT_SECONDI_A_BASE_DI_SOIA'
  ) {
    return 'soia_derivati';
  }
  if (
    category === 'CAT_PIATTI_A_BASE_DI_LEGUMI' ||
    category === 'CAT_INSALATE_DI_LEGUMI'
  ) {
    return 'legumi';
  }
  if (
    category === 'CAT_FARINATE_E_FRITTATE' ||
    category === 'CAT_POLPETTE_E_BURGER' ||
    category === 'CAT_COTOLETTE'
  ) {
    return 'alternative_veg';
  }
  return category;
}

export function generateBalancedWeekPlan(
  days: WeekDayInfo[],
  existingPlans: MealPlanEntry[],
  options: AutoPlanOptions,
): MealPlanEntry[] {
  const currentSeason = getCurrentSeason();

  // ── Pre-processing of pools per unique category (CAT_...) ──────────────────
  const breakfastPool   = catalogRecipes.filter(r => BREAKFAST_CATEGORIES.has(r.category));
  const snackPool       = catalogRecipes.filter(r => SNACK_CATEGORIES.has(r.category));
  const piattoUnicoPool = catalogRecipes.filter(r => PIATTO_UNICO_CATEGORIES.has(r.category));
  const primiPool       = catalogRecipes.filter(r => PRIMI_CATEGORIES.has(r.category));
  const secondiPool     = catalogRecipes.filter(r => SECONDI_CATEGORIES.has(r.category));
  const sidePool        = catalogRecipes.filter(r => CONTORNI_CATEGORIES.has(r.category));

  // Complete nutritional pre-classification with the Balanced Plate Rule
  const nutritionIndex = new Map<string, HealthyPlateClassification>();
  for (const r of catalogRecipes) {
    nutritionIndex.set(r.id, classifyHealthyPlate(r, currentSeason));
  }

  // ── Anti-monotony memory (Anti-Repetition Tracking) ───────────────────────
  const usedRecipeIds = new Set<string>(existingPlans.map(p => p.recipe_id).filter((id): id is string => !!id));
  const usedSideIds = new Set<string>(); // side dishes chosen in this generation (existing ones are already in usedRecipeIds)
  const existingMap: Record<string, MealPlanEntry> = {};
  existingPlans.forEach(p => { existingMap[`${p.date}-${p.slot}`] = p; });

  const recentCategories: string[] = []; // Categories used in recent main meals
  const recentProteinCategories: string[] = []; // Recent protein subfamilies
  let lastCarbFamily: CarbFamily | null = null;
  let lastFormat: 'piatto_unico' | 'primo' | 'secondo' | null = null;
  const dayLunchColors: Record<string, VeggieColor> = {};

  // Breakfast and snack rotation tracking
  let lastBreakfastCat: string | null = null;
  let lastSnackMorningCat: string | null = null;
  let lastSnackAfternoonCat: string | null = null;
  const usedBreakfastIds = new Set<string>(existingPlans.filter(p => p.slot === 'colazione').map(p => p.recipe_id).filter((id): id is string => !!id));
  const usedSnackIds = new Set<string>(existingPlans.filter(p => p.slot === 'spuntino_mattina' || p.slot === 'spuntino_pomeriggio').map(p => p.recipe_id).filter((id): id is string => !!id));

  // Pre-populates statistics from the meals already in the plan
  existingPlans.forEach(p => {
    if ((p.slot === 'pranzo' || p.slot === 'cena') && p.recipe_id) {
      const r = catalogRecipes.find(x => x.id === p.recipe_id);
      if (r) {
        recentCategories.push(r.category);
        if (SECONDI_CATEGORIES.has(r.category)) recentProteinCategories.push(getProteinSubgroup(r.category));
      }
      const ni = nutritionIndex.get(p.recipe_id);
      if (ni && ni.carbFamily !== 'nessuno') lastCarbFamily = ni.carbFamily;
      if (p.slot === 'pranzo' && ni) dayLunchColors[p.date] = ni.veggieColor;
    }
  });

  const newEntries: MealPlanEntry[] = [];

  // Definition of the slots to plan in canonical chronological order
  const slots: {
    dateString: string;
    slot: MealSlot;
    isWeekend: boolean;
    isWeekdayLunch: boolean;
    isMeal: boolean;
    isBreakfast: boolean;
    isSnackMat: boolean;
    isSnackPom: boolean;
  }[] = [];

  const shouldIncludeSnacks = options.includeSnacks ?? true;

  days.forEach((day, idx) => {
    const isWeekend = idx >= 5;
    if (isWeekend && !options.includeWeekend) return;
    slots.push({ dateString: day.dateString, slot: 'colazione',           isWeekend, isWeekdayLunch: false,       isMeal: false, isBreakfast: true,  isSnackMat: false, isSnackPom: false });
    if (shouldIncludeSnacks) {
      slots.push({ dateString: day.dateString, slot: 'spuntino_mattina',   isWeekend, isWeekdayLunch: false,       isMeal: false, isBreakfast: false, isSnackMat: true,  isSnackPom: false });
    }
    slots.push({ dateString: day.dateString, slot: 'pranzo',              isWeekend, isWeekdayLunch: !isWeekend,  isMeal: true,  isBreakfast: false, isSnackMat: false, isSnackPom: false });
    if (shouldIncludeSnacks) {
      slots.push({ dateString: day.dateString, slot: 'spuntino_pomeriggio',isWeekend, isWeekdayLunch: false,       isMeal: false, isBreakfast: false, isSnackMat: false, isSnackPom: true });
    }
    slots.push({ dateString: day.dateString, slot: 'cena',                isWeekend, isWeekdayLunch: false,       isMeal: true,  isBreakfast: false, isSnackMat: false, isSnackPom: false });
  });

  for (const slotInfo of slots) {
    const key = `${slotInfo.dateString}-${slotInfo.slot}`;

    if (options.onlyEmptySlots && existingMap[key]) {
      const existing = existingMap[key];
      const r = existing.recipe_id ? catalogRecipes.find(x => x.id === existing.recipe_id) : undefined;
      const ni = existing.recipe_id ? nutritionIndex.get(existing.recipe_id) : undefined;
      if (slotInfo.isMeal && r && ni) {
        recentCategories.push(r.category);
        if (SECONDI_CATEGORIES.has(r.category)) recentProteinCategories.push(getProteinSubgroup(r.category));
        lastCarbFamily = ni.carbFamily !== 'nessuno' ? ni.carbFamily : null;
        if (slotInfo.slot === 'pranzo') dayLunchColors[slotInfo.dateString] = ni.veggieColor;
      }
      continue;
    }

    // ── 1. BREAKFAST ─────────────────────────────────────────────────────────
    if (slotInfo.isBreakfast) {
      const bfCandidates = breakfastPool.filter(r =>
        !usedBreakfastIds.has(r.id) && r.category !== lastBreakfastCat
      );
      const selectedBf = shuffle(bfCandidates)[0] ?? shuffle(breakfastPool.filter(r => !usedBreakfastIds.has(r.id)))[0] ?? shuffle(breakfastPool)[0];
      if (!selectedBf) continue;
      usedBreakfastIds.add(selectedBf.id);
      lastBreakfastCat = selectedBf.category;
      newEntries.push({
        kind: 'recipe',
        id: `plan-${slotInfo.dateString}-colazione-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: 'colazione',
        recipe_id: selectedBf.id,
        servings: options.servings,
        created_at: Date.now(),
      });
      continue;
    }

    // ── 2. MORNING SNACK ─────────────────────────────────────────────────────
    if (slotInfo.isSnackMat) {
      const snkCandidates = snackPool.filter(r =>
        !usedSnackIds.has(r.id) && r.category !== lastSnackMorningCat
      );
      const selectedSnk = shuffle(snkCandidates)[0] ?? shuffle(snackPool.filter(r => !usedSnackIds.has(r.id)))[0] ?? shuffle(snackPool)[0];
      if (!selectedSnk) continue;
      usedSnackIds.add(selectedSnk.id);
      lastSnackMorningCat = selectedSnk.category;
      newEntries.push({
        kind: 'recipe',
        id: `plan-${slotInfo.dateString}-spuntino_mattina-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: 'spuntino_mattina',
        recipe_id: selectedSnk.id,
        servings: options.servings,
        created_at: Date.now(),
      });
      continue;
    }

    // ── 3. AFTERNOON SNACK ───────────────────────────────────────────────────
    if (slotInfo.isSnackPom) {
      const snkCandidates = snackPool.filter(r =>
        !usedSnackIds.has(r.id) && r.category !== lastSnackMorningCat && r.category !== lastSnackAfternoonCat
      );
      const selectedSnk = shuffle(snkCandidates)[0] ?? shuffle(snackPool.filter(r => !usedSnackIds.has(r.id)))[0] ?? shuffle(snackPool)[0];
      if (!selectedSnk) continue;
      usedSnackIds.add(selectedSnk.id);
      lastSnackAfternoonCat = selectedSnk.category;
      newEntries.push({
        kind: 'recipe',
        id: `plan-${slotInfo.dateString}-spuntino_pomeriggio-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: 'spuntino_pomeriggio',
        recipe_id: selectedSnk.id,
        servings: options.servings,
        created_at: Date.now(),
      });
      continue;
    }

    // ── 4. LUNCH AND DINNER (PLATE STRUCTURE & ANTI-MONOTONY ROTATION) ───────

    // Meal structure decision: One-Dish Meal vs Structured Meal
    // Rule: never 2 consecutive one-dish meals. If lunch was a one-dish meal, dinner is structured.
    const allowPiattoUnico = lastFormat !== 'piatto_unico' && (slotInfo.slot === 'pranzo' ? Math.random() < 0.40 : Math.random() < 0.25);

    let chosenFormat: 'piatto_unico' | 'primo' | 'secondo';
    let candidatePool: RecipeSummary[];

    if (allowPiattoUnico) {
      chosenFormat = 'piatto_unico';
      candidatePool = piattoUnicoPool;
    } else {
      // Structured meal: alternates between First and Second relative to the last structured meal
      if (lastFormat === 'primo') {
        chosenFormat = 'secondo';
        candidatePool = secondiPool;
      } else if (lastFormat === 'secondo') {
        chosenFormat = 'primo';
        candidatePool = primiPool;
      } else {
        // If coming from a one-dish meal, lunch prefers First, dinner Second
        chosenFormat = slotInfo.slot === 'pranzo' ? 'primo' : 'secondo';
        candidatePool = chosenFormat === 'primo' ? primiPool : secondiPool;
      }
    }

    // Anti-Monotony and Nutritional scoring on the candidates of the selected pool
    const lunchColor = dayLunchColors[slotInfo.dateString];
    let scoredCandidates = candidatePool.map(r => {
      let score = Math.random() * 5;
      const ni = nutritionIndex.get(r.id);

      // Strong penalty if the recipe is already used in the current plan
      if (usedRecipeIds.has(r.id)) score -= 150;

      // Anti-Monotony penalty on the category (sliding window of the last 6 meals / 2-3 days)
      const catIdx = recentCategories.lastIndexOf(r.category);
      if (catIdx !== -1) {
        const recency = recentCategories.length - catIdx; // 1 = immediately preceding meal
        if (recency === 1) score -= 80;
        else if (recency === 2) score -= 60;
        else if (recency === 3) score -= 40;
        else if (recency <= 6) score -= 20;
      }

      // Anti-Monotony penalty on protein group (e.g. Tofu/Soy vs Legumes vs Farinate/Burger)
      if (SECONDI_CATEGORIES.has(r.category)) {
        const pg = getProteinSubgroup(r.category);
        const lastPgIdx = recentProteinCategories.lastIndexOf(pg);
        if (lastPgIdx !== -1) {
          const recency = recentProteinCategories.length - lastPgIdx;
          if (recency === 1) score -= 75;
          else if (recency === 2) score -= 50;
        }
      }

      // Anti-Monotony penalty on consecutive carbohydrate family
      if (ni && ni.carbFamily !== 'nessuno' && lastCarbFamily && ni.carbFamily === lastCarbFamily) {
        score -= 45;
      }

      // Seasonality bonus
      if (ni?.isSeasonal) score += 10;

      // Rainbow Plate color alternation bonus at dinner relative to lunch of the same day
      if (slotInfo.slot === 'cena' && lunchColor && ni) {
        if (lunchColor === 'verde' && (ni.veggieColor === 'rosso_arancione' || ni.veggieColor === 'viola_blu')) score += 14;
        else if (lunchColor !== 'verde' && ni.veggieColor === 'verde') score += 14;
      }

      // Quick lunch bonus on weekdays if requested
      if (slotInfo.isWeekdayLunch && options.maxWeekdayLunchMinutes && r.times?.total_minutes > 0) {
        if (r.times.total_minutes <= options.maxWeekdayLunchMinutes) score += 12;
      }

      return { recipe: r, score, ni };
    });

    scoredCandidates.sort((a, b) => b.score - a.score);
    const chosen = scoredCandidates[0]?.recipe ?? shuffle(candidatePool)[0];
    if (!chosen) continue;

    const chosenNi = nutritionIndex.get(chosen.id);

    // Updates memories
    usedRecipeIds.add(chosen.id);
    recentCategories.push(chosen.category);
    if (recentCategories.length > 6) recentCategories.shift();

    if (SECONDI_CATEGORIES.has(chosen.category)) {
      recentProteinCategories.push(getProteinSubgroup(chosen.category));
      if (recentProteinCategories.length > 4) recentProteinCategories.shift();
    }

    if (chosenNi && chosenNi.carbFamily !== 'nessuno') {
      lastCarbFamily = chosenNi.carbFamily;
    }
    if (slotInfo.slot === 'pranzo' && chosenNi) {
      dayLunchColors[slotInfo.dateString] = chosenNi.veggieColor;
    }
    lastFormat = chosenFormat;

    // Side Dish pairing for Structured Meals (Option A)
    let chosenSide: RecipeSummary | undefined = undefined;
    if (chosenFormat !== 'piatto_unico') {
      const availableSides = sidePool.filter(s => !usedSideIds.has(s.id) && !usedRecipeIds.has(s.id));
      availableSides.sort((a, b) => {
        let sA = Math.random() * 5;
        let sB = Math.random() * 5;
        const siA = nutritionIndex.get(a.id);
        const siB = nutritionIndex.get(b.id);
        if (!siA || !siB) return sB - sA;

        // Color contrast of the vegetable
        if (chosenNi && siA.veggieColor !== chosenNi.veggieColor && siA.veggieColor !== 'misto_neutro') sA += 10;
        if (chosenNi && siB.veggieColor !== chosenNi.veggieColor && siB.veggieColor !== 'misto_neutro') sB += 10;

        // Seasonality of the side dish
        if (siA.isSeasonal) sA += 8;
        if (siB.isSeasonal) sB += 8;

        return sB - sA;
      });

      chosenSide = availableSides[0] ?? shuffle(sidePool)[0];
      if (chosenSide) {
        usedSideIds.add(chosenSide.id);
      }
    }

    newEntries.push({
        kind: 'recipe',
      id: `plan-${slotInfo.dateString}-${slotInfo.slot}-${Math.random().toString(36).slice(2, 7)}`,
      date: slotInfo.dateString,
      slot: slotInfo.slot,
      recipe_id: chosen.id,
      servings: options.servings,
      created_at: Date.now(),
    });
    if (chosenSide) {
      newEntries.push({
        kind: 'recipe',
        id: `plan-${slotInfo.dateString}-${slotInfo.slot}-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: slotInfo.slot,
        recipe_id: chosenSide.id,
        servings: options.servings,
        created_at: Date.now() + 1, // after the main dish in the ordering
      });
    }
  }

  return newEntries;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERATION (Monday)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAndAutoGeneratePlan(): Promise<{ generated: boolean; entriesCount: number }> {
  try {
    // Outside Monday neither the database nor the KV is read
    const today = new Date();
    const isMonday = today.getDay() === 1;
    if (!isMonday) return { generated: false, entriesCount: 0 };
    const dayOfWeek = today.getDay();

    const prefs = await getPlannerPreferences();
    if (!prefs.autoGenerateOnMonday) return { generated: false, entriesCount: 0 };

    const monday = new Date(today);
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = toLocalDateString(monday);

    const lastGen = await getKV('gw_planner_last_gen');
    if (!isMonday || lastGen === mondayStr) return { generated: false, entriesCount: 0 };

    const { days } = getPlannerDays(prefs.calendarMode, 0);
    const weekDates = new Set(days.map(d => d.dateString));
    // The plan is read only after the checks (Monday, preference, last generation): the generator
    // reads the history it needs for anti-repetition, not the whole plan
    const existingPlans = await getMealPlans(planHistoryRange([...weekDates]));
    const weekPlans = existingPlans.filter(p => weekDates.has(p.date));

    // A meal can contain several recipes: occupied meals are counted, not entries
    const maxSlots = days.length * SLOT_ORDER.length;
    const filledSlots = new Set(weekPlans.map(p => `${p.date}-${p.slot}`)).size;
    if (filledSlots >= maxSlots) {
      await setKV('gw_planner_last_gen', mondayStr);
      return { generated: false, entriesCount: 0 };
    }

    const options: AutoPlanOptions = {
      servings: prefs.servings,
      includeWeekend: prefs.includeWeekend,
      maxWeekdayLunchMinutes: prefs.maxWeekdayLunchMinutes,
      onlyEmptySlots: true,
      includeSnacks: prefs.includeSnacks ?? true,
    };

    const newEntries = generateBalancedWeekPlan(days, existingPlans, options);
    if (newEntries.length > 0) await saveMealPlanEntriesBulk(newEntries);

    await setKV('gw_planner_last_gen', mondayStr);
    return { generated: true, entriesCount: newEntries.length };
  } catch (e) {
    console.warn('checkAndAutoGeneratePlan error', e);
    return { generated: false, entriesCount: 0 };
  }
}

/**
 * Manually generates a plan for the current week.
 */
export async function manualGeneratePlan(
  overwrite: boolean = false,
  scope: 'day' | 'week' = 'week',
  selectedDate?: string,
): Promise<number> {
  try {
    const prefs = await getPlannerPreferences();
    const weekDays = getPlannerDays(prefs.calendarMode, 0).days;
    const days = scope === 'day'
      ? weekDays.filter(d => !!selectedDate && d.dateString === selectedDate)
      : weekDays;
    if (days.length === 0) return 0;

    // The plan read here covers the history and the days to generate (not the screen state, which shows a single week)
    const existingPlans = await getMealPlans(planHistoryRange(weekDays.map(d => d.dateString)));

    const options: AutoPlanOptions = {
      servings: prefs.servings,
      includeWeekend: prefs.includeWeekend,
      maxWeekdayLunchMinutes: prefs.maxWeekdayLunchMinutes,
      onlyEmptySlots: !overwrite,
      includeSnacks: prefs.includeSnacks ?? true,
    };

    const newEntries = generateBalancedWeekPlan(days, existingPlans, options);
    if (newEntries.length > 0 && overwrite) {
      // Overwrite: removes the existing entries only of the slots that will be filled
      const filledSlots = new Set(newEntries.map(e => `${e.date}-${e.slot}`));
      const toRemove = existingPlans.filter(p => filledSlots.has(`${p.date}-${p.slot}`));
      for (const p of toRemove) {
        await deleteMealPlanEntry(p.id);
      }
    }
    if (newEntries.length > 0) await saveMealPlanEntriesBulk(newEntries);
    return newEntries.length;
  } catch (e) {
    console.warn('manualGeneratePlan error', e);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT FOR SHARING
// ─────────────────────────────────────────────────────────────────────────────

export function formatWeekPlanShareText(
  days: WeekDayInfo[],
  plans: MealPlanEntry[],
  recipesMap: Record<string, RecipeSummary>,
  weekLabel: string,
): string {
  const lines: string[] = [];
  lines.push(`🗓️ *${i18n.t('planner.share.title')}*`);
  lines.push(`_${weekLabel}_\n`);

  const planMap: Record<string, MealPlanEntry[]> = {};
  plans.forEach(p => {
    if (!p.recipe_id) return;
    (planMap[`${p.date}-${p.slot}`] ??= []).push(p);
  });

  const SLOT_EMOJIS: Record<MealSlot, string> = {
    colazione: '☕',
    spuntino_mattina: '🍎',
    pranzo: '☀️',
    spuntino_pomeriggio: '🥑',
    cena: '🌙',
  };

  days.forEach(d => {
    const dayEntries = SLOT_ORDER
      .flatMap(slot => (planMap[`${d.dateString}-${slot}`] ?? []).map(entry => ({ slot, entry })));

    if (dayEntries.length === 0) return;

    lines.push(`*${d.dayName} ${d.dayNumber} ${d.monthName}:*`);
    dayEntries.forEach(({ slot, entry }) => {
      const r = recipesMap[entry.recipe_id!];
      const emoji = SLOT_EMOJIS[slot];
      const label = i18n.t(`planner.slots.${slot}`);
      lines.push(`  ${emoji} ${label}: ${r ? r.title : i18n.t('planner.share.recipe')} (${i18n.t('planner.share.servings', { count: entry.servings })})`);
    });
    lines.push('');
  });

  lines.push(`— ${i18n.t('planner.share.footer')} 🐾`);
  return lines.join('\n');
}
