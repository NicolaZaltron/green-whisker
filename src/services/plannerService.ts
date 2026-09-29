import { Recipe, MealPlanEntry, IngredientItem } from '../types/recipe';
import { addShoppingItems, saveMealPlanEntriesBulk, getKV, setKV } from '../db/database';
import { scaleIngredient } from '../utils/servingsScaler';

const rawRecipes = require('../../assets/ricette.json') as Recipe[];

// ─────────────────────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface PlannerPreferences {
  servings: number;
  includeWeekend: boolean;
  maxWeekdayLunchMinutes: number | null;
  autoGenerateOnMonday: boolean;
}

export interface WeekDayInfo {
  dateString: string;
  dayName: string;
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
}

// Tipo proteico estratto da una ricetta
export type ProteinType = 'legumi' | 'soya' | 'verdure' | null;

// Tipo carboidrato estratto da una ricetta
export type CarbType = 'complessi' | 'semplici' | null;

// ─────────────────────────────────────────────────────────────────────────────
// COSTANTI NUTRIZIONALI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Categorie di ricette valide per pranzo e cena (regola 50-25-25)
 */
const MEAL_CATEGORIES = new Set([
  'Primi piatti',
  'Secondi piatti',
  'Piatti unici e bowl',
  'Zuppe e vellutate',
]);

/**
 * Categorie per la colazione.
 * Pool esteso: colazione + dolci veloci (<=15min) + bevande + lievitati base.
 * I dolci veloci e i lievitati vengono pre-filtrati per tempo nella build dei pool.
 */
const BREAKFAST_CATEGORIES = new Set([
  'Colazione e merende',
  'Bevande e frullati',
  // Dolci veloci e lievitati vengono aggiunti dinamicamente con filtro tempo
]);

/**
 * Categorie per lo spuntino pomeridiano.
 */
const SNACK_CATEGORIES = new Set([
  'Antipasti e snack',
  'Colazione e merende',
  'Bevande e frullati',
]);

/** Tipo slot giornaliero */
export type MealSlot = 'colazione' | 'spuntino' | 'pranzo' | 'cena';

/** Ordine canonico degli slot nel giorno (per display e loop) */
export const SLOT_ORDER: MealSlot[] = ['colazione', 'pranzo', 'spuntino', 'cena'];

/** Etichette italiane degli slot */
export const SLOT_LABELS: Record<MealSlot, string> = {
  colazione: 'Colazione',
  spuntino: 'Spuntino',
  pranzo: 'Pranzo',
  cena: 'Cena',
};

/** Icone Ionicons per ogni slot */
export const SLOT_ICONS: Record<MealSlot, string> = {
  colazione: 'cafe-outline',
  spuntino: 'nutrition-outline',
  pranzo: 'sunny-outline',
  cena: 'moon-outline',
};

/** Colori per ogni slot */
export const SLOT_COLORS: Record<MealSlot, { color: string; bgColor: string }> = {
  colazione: { color: '#C07A3A', bgColor: '#FDF5EC' },
  spuntino:  { color: '#7B6FA3', bgColor: '#F2F0FA' },
  pranzo:    { color: '#4A6B53', bgColor: '#EAF0EB' },
  cena:      { color: '#D97757', bgColor: '#FDF0EE' },
};

/**
 * Restituisce le ricette adatte e consigliate per ciascuno slot pasto.
 */
export function getRecipesForSlot(slot: MealSlot): Recipe[] {
  if (slot === 'colazione') {
    return rawRecipes.filter(r =>
      BREAKFAST_CATEGORIES.has(r.categoria) ||
      (r.categoria === 'Dolci' && r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= 25) ||
      (r.categoria === 'Lievitati, pane e pizze' && r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= 30)
    );
  }
  if (slot === 'spuntino') {
    return rawRecipes.filter(r =>
      SNACK_CATEGORIES.has(r.categoria) ||
      (r.categoria === 'Dolci' && r.tempi.tempo_totale_minuti > 0 && r.tempi.tempo_totale_minuti <= 20)
    );
  }
  return rawRecipes.filter(r => MEAL_CATEGORIES.has(r.categoria));
}

/**
 * Ingredienti che identificano legumi interi o frullati (priorità: legumi specifici vs generici)
 */
const LEGUME_KEYWORDS = [
  'ceci', 'lenticchie', 'fagioli cannellini', 'fagioli borlotti',
  'fagioli neri', 'fagioli', 'cicerchia', 'lupini', 'piselli',
  'fave', 'edamame', 'hummus',
];

/**
 * Ingredienti che identificano derivati della soia e proteine lavorate
 */
const SOYA_KEYWORDS = [
  'tofu', 'tempeh', 'granulare di soia', 'seitan',
];

/**
 * Cereali integrali e tuberi (carboidrati complessi)
 */
const COMPLEX_CARB_KEYWORDS = [
  'riso integrale', 'farro', 'orzo perlato', 'orzo', 'quinoa',
  'bulgur', 'polenta', 'grano saraceno', 'amaranto', 'miglio',
  'patate', 'patata dolce',
];

/**
 * Cereali raffinati (carboidrati semplici)
 */
const SIMPLE_CARB_KEYWORDS = [
  'pasta', 'spaghetti', 'rigatoni', 'penne', 'fusilli', 'orecchiette',
  'tagliatelle', 'gnocchi', 'cous cous', 'couscous', 'riso',
  'pane', 'pizza',
];

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICATORI NUTRIZIONALI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifica la fonte proteica principale di una ricetta analizzando
 * `ingredienti_dettagliati` (più preciso) con fallback sugli `ingredienti` raw.
 */
export function classifyProtein(recipe: Recipe): ProteinType {
  const ingredients = recipe.ingredienti_dettagliati.length > 0
    ? recipe.ingredienti_dettagliati.map(i => i.ingrediente.toLowerCase())
    : recipe.ingredienti.map(i => i.toLowerCase());

  // Soya ha priorità (ingrediente meno comune, più specifico)
  const hasSoya = ingredients.some(ing =>
    SOYA_KEYWORDS.some(kw => ing.includes(kw))
  );
  if (hasSoya) return 'soya';

  const hasLegume = ingredients.some(ing =>
    LEGUME_KEYWORDS.some(kw => ing.includes(kw))
  );
  if (hasLegume) return 'legumi';

  return 'verdure';
}

/**
 * Classifica il tipo di carboidrato principale di una ricetta.
 */
export function classifyCarb(recipe: Recipe): CarbType {
  const ingredients = recipe.ingredienti_dettagliati.length > 0
    ? recipe.ingredienti_dettagliati.map(i => i.ingrediente.toLowerCase())
    : recipe.ingredienti.map(i => i.toLowerCase());

  const hasComplex = ingredients.some(ing =>
    COMPLEX_CARB_KEYWORDS.some(kw => ing.includes(kw))
  );
  if (hasComplex) return 'complessi';

  const hasSimple = ingredients.some(ing =>
    SIMPLE_CARB_KEYWORDS.some(kw => ing.includes(kw))
  );
  if (hasSimple) return 'semplici';

  return null;
}

/**
 * Estrae il cereale/tubero principale di una ricetta (per anti-ripetizione).
 * Restituisce la keyword trovata o null.
 */
export function extractMainCarb(recipe: Recipe): string | null {
  const ingredients = recipe.ingredienti_dettagliati.length > 0
    ? recipe.ingredienti_dettagliati.map(i => i.ingrediente.toLowerCase())
    : recipe.ingredienti.map(i => i.toLowerCase());

  for (const kw of [...COMPLEX_CARB_KEYWORDS, ...SIMPLE_CARB_KEYWORDS]) {
    if (ingredients.some(ing => ing.includes(kw))) return kw;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK DAYS HELPER
// ─────────────────────────────────────────────────────────────────────────────

const ITALIAN_DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const ITALIAN_MONTHS = [
  'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
  'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic',
];

export function getWeekDays(offsetWeeks: number = 0): WeekDaysResult {
  const now = new Date();
  const base = new Date();
  base.setDate(now.getDate() + offsetWeeks * 7);

  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(base.setDate(diff));

  const todayStr = new Date().toISOString().split('T')[0];

  const days: WeekDayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateString = current.toISOString().split('T')[0];
    days.push({
      dateString,
      dayName: ITALIAN_DAYS[i],
      dayNumber: current.getDate(),
      monthName: ITALIAN_MONTHS[current.getMonth()],
      isToday: dateString === todayStr,
    });
  }

  let weekLabel = 'Questa Settimana';
  if (offsetWeeks === 1) weekLabel = 'Prossima Settimana';
  else if (offsetWeeks === -1) weekLabel = 'Settimana Scorsa';
  else if (offsetWeeks !== 0) weekLabel = `Settimana dal ${days[0].dayNumber} ${days[0].monthName}`;

  return { days, weekLabel, offsetWeeks };
}

// ─────────────────────────────────────────────────────────────────────────────
// PREFERENZE
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_PREFERENCES: PlannerPreferences = {
  servings: 2,
  includeWeekend: true,
  maxWeekdayLunchMinutes: 30,
  autoGenerateOnMonday: true,
};

export async function getPlannerPreferences(): Promise<PlannerPreferences> {
  try {
    const json = await getKV('gw_planner_prefs');
    if (json) return { ...DEFAULT_PREFERENCES, ...JSON.parse(json) };
  } catch (e) {
    console.warn('getPlannerPreferences error', e);
  }
  return DEFAULT_PREFERENCES;
}

export async function savePlannerPreferences(prefs: Partial<PlannerPreferences>): Promise<void> {
  try {
    const current = await getPlannerPreferences();
    await setKV('gw_planner_prefs', JSON.stringify({ ...current, ...prefs }));
  } catch (e) {
    console.warn('savePlannerPreferences error', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALGORITMO DI GENERAZIONE BILANCIATA
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
 * Genera un piano settimanale nutrizionalmente bilanciato rispettando:
 *
 * 1. REGOLA 50-25-25: ogni pasto dovrebbe avere verdure (50%), proteine (25%),
 *    carboidrati complessi (25%). Approssimata su base settimanale bilanciando
 *    le frequenze dei pasti proteici e quelli vegetariani/fibrosi.
 *
 * 2. ROTAZIONE PROTEICA:
 *    - Legumi: 4-5 volte/settimana sui 14 slot
 *    - Soya/derivati: 3-4 volte/settimana sui 14 slot
 *    - Verdure/Neutro: restanti (5-7 slot)
 *    - Non più di 2 pasti consecutivi con la stessa macro-proteina
 *
 * 3. ANTI-RIPETIZIONE CARBOIDRATI:
 *    - Stessa ricetta non può comparire due volte
 *    - Lo stesso cereale principale non può comparire in pasti consecutivi
 *      (es. pranzo+cena stesso giorno, o cena ieri + pranzo oggi)
 *
 * 4. PRANZO VELOCE: nei giorni feriali filtra ricette <= maxWeekdayLunchMinutes
 */
export function generateBalancedWeekPlan(
  days: WeekDayInfo[],
  existingPlans: MealPlanEntry[],
  options: AutoPlanOptions,
): MealPlanEntry[] {

  // ── Pre-processing del pool ricette ──────────────────────────────────────
  const mealPool = getRecipesForSlot('pranzo');
  const breakfastPool = getRecipesForSlot('colazione');
  const snackPool = getRecipesForSlot('spuntino');
  const sidePool = rawRecipes.filter(r => r.categoria === 'Contorni e insalate');

  // Indice nutrizionale pre-calcolato per evitare ricalcoli nel loop
  // Solo sui pasti principali (pranzo/cena) che hanno logica proteica
  const nutritionIndex = new Map<string, { protein: ProteinType; carb: CarbType; mainCarb: string | null }>();
  for (const r of mealPool) {
    nutritionIndex.set(r.id, {
      protein: classifyProtein(r),
      carb: classifyCarb(r),
      mainCarb: extractMainCarb(r),
    });
  }

  // Pool pasti principali divisi per tipo proteico
  const legumePool = mealPool.filter(r => nutritionIndex.get(r.id)?.protein === 'legumi');
  const soyaPool   = mealPool.filter(r => nutritionIndex.get(r.id)?.protein === 'soya');
  const verduPool  = mealPool.filter(r => nutritionIndex.get(r.id)?.protein === 'verdure');

  // ── Stato corrente ────────────────────────────────────────────────────────
  const usedRecipeIds = new Set<string>(existingPlans.map(p => p.recipe_id));
  const usedSideIds = new Set<string>(existingPlans.filter(p => p.side_recipe_id).map(p => p.side_recipe_id!));
  const existingMap: Record<string, MealPlanEntry> = {};
  existingPlans.forEach(p => { existingMap[`${p.date}-${p.slot}`] = p; });

  // Contatori proteici settimanali (target su pasti principali: legumi 4-5, soya 3-4)
  const TARGET_LEGUMI = { min: 4, max: 5 };
  const TARGET_SOYA   = { min: 3, max: 4 };
  // totalSlots conta solo pranzo+cena per i target proteici
  const mealDaysCount = days.filter((_, i) => options.includeWeekend || i < 5).length;

  // Calcola quanti slot proteici già presenti (per onlyEmptySlots)
  let legumiCount = existingPlans.filter(p =>
    nutritionIndex.get(p.recipe_id)?.protein === 'legumi'
  ).length;
  let soyaCount = existingPlans.filter(p =>
    nutritionIndex.get(p.recipe_id)?.protein === 'soya'
  ).length;

  const newEntries: MealPlanEntry[] = [];

  // Sequenza di tutte le "ultime 2 proteine" usate (per regola anti-consecutiva)
  // Partiamo dall'ultimo pasto esistente prima di questa settimana (se c'è)
  const recentProteins: ProteinType[] = [];

  // ── Loop sui giorni: 4 slot per giorno nell'ordine canonico ─────────────
  // colazione → pranzo → spuntino → cena
  const slots: Array<{
    dateString: string;
    slot: MealSlot;
    isWeekend: boolean;
    isWeekdayLunch: boolean;
    isMeal: boolean;      // true = pranzo/cena (logica proteica)
    isBreakfast: boolean; // true = colazione
    isSnack: boolean;     // true = spuntino
  }> = [];

  days.forEach((day, idx) => {
    const isWeekend = idx >= 5;
    if (isWeekend && !options.includeWeekend) return;
    slots.push({ dateString: day.dateString, slot: 'colazione', isWeekend, isWeekdayLunch: false, isMeal: false, isBreakfast: true, isSnack: false });
    slots.push({ dateString: day.dateString, slot: 'pranzo',    isWeekend, isWeekdayLunch: !isWeekend, isMeal: true,  isBreakfast: false, isSnack: false });
    slots.push({ dateString: day.dateString, slot: 'spuntino',  isWeekend, isWeekdayLunch: false, isMeal: false, isBreakfast: false, isSnack: true });
    slots.push({ dateString: day.dateString, slot: 'cena',      isWeekend, isWeekdayLunch: false, isMeal: true,  isBreakfast: false, isSnack: false });
  });

  // Quanti slot rimangono vuoti da riempire
  const emptySlots = slots.filter(s =>
    !options.onlyEmptySlots || !existingMap[`${s.dateString}-${s.slot}`]
  );
  const remainingSlots = emptySlots.length;

  // Budget proteico: conta solo i pasti principali (pranzo/cena)
  const mealSlotEntries = existingPlans.filter(p => p.slot === 'pranzo' || p.slot === 'cena');
  let legumiRemaining = Math.max(0, TARGET_LEGUMI.min -
    mealSlotEntries.filter(p => nutritionIndex.get(p.recipe_id)?.protein === 'legumi').length
  );
  let soyaRemaining = Math.max(0, TARGET_SOYA.min -
    mealSlotEntries.filter(p => nutritionIndex.get(p.recipe_id)?.protein === 'soya').length
  );

  // Set separati per anti-ripetizione di ricette per slot tipo
  const usedBreakfastIds = new Set<string>(
    existingPlans.filter(p => p.slot === 'colazione').map(p => p.recipe_id)
  );
  const usedSnackIds = new Set<string>(
    existingPlans.filter(p => p.slot === 'spuntino').map(p => p.recipe_id)
  );
  // lastBreakfast e lastSnack per anti-ripetizione consecutiva
  const bfEntries = existingPlans.filter(p => p.slot === 'colazione').sort((a, b) => a.date < b.date ? -1 : 1);
  let lastBreakfastId: string | null = bfEntries.length > 0 ? bfEntries[bfEntries.length - 1].recipe_id : null;
  const snkEntries = existingPlans.filter(p => p.slot === 'spuntino').sort((a, b) => a.date < b.date ? -1 : 1);
  let lastSnackId: string | null = snkEntries.length > 0 ? snkEntries[snkEntries.length - 1].recipe_id : null;

  // ── Sliding window: ultime 2 proteine assegnate (solo su pranzo/cena) ────
  const lastTwoProteins: ProteinType[] = [];
  if (existingPlans.length > 0) {
    const slotOrder: Record<MealSlot, number> = { colazione: 0, pranzo: 1, spuntino: 2, cena: 3 };
    const sorted = [...existingPlans]
      .filter(p => p.slot === 'pranzo' || p.slot === 'cena')
      .sort((a, b) => {
        const ka = `${a.date}-${slotOrder[a.slot]}`;
        const kb = `${b.date}-${slotOrder[b.slot]}`;
        return ka < kb ? -1 : 1;
      });
    sorted.slice(-2).forEach(p => {
      lastTwoProteins.push(nutritionIndex.get(p.recipe_id)?.protein ?? null);
    });
  }

  let lastCarb: string | null = null; // Anti-ripetizione carboidrati tra slot adiacenti

  for (const slotInfo of slots) {
    const key = `${slotInfo.dateString}-${slotInfo.slot}`;

    if (options.onlyEmptySlots && existingMap[key]) {
      // Slot già occupato: aggiorna stato sliding window/anti-ripetizione per continuità
      const existing = existingMap[key];
      const ni = nutritionIndex.get(existing.recipe_id);
      if (slotInfo.isMeal && ni) {
        lastCarb = ni.mainCarb;
        lastTwoProteins.push(ni.protein);
        if (lastTwoProteins.length > 2) lastTwoProteins.shift();
      } else if (slotInfo.isBreakfast) {
        lastBreakfastId = existing.recipe_id;
      } else if (slotInfo.isSnack) {
        lastSnackId = existing.recipe_id;
      }
      continue;
    }

    // ── COLAZIONE ────────────────────────────────────────────────────────────
    if (slotInfo.isBreakfast) {
      const bfCandidates = shuffle(breakfastPool).filter(r =>
        !usedBreakfastIds.has(r.id) && r.id !== lastBreakfastId
      );
      const selectedBf = bfCandidates[0] ??
        shuffle(breakfastPool).find(r => !usedBreakfastIds.has(r.id)) ??
        shuffle(breakfastPool)[0];
      if (!selectedBf) continue;

      usedBreakfastIds.add(selectedBf.id);
      lastBreakfastId = selectedBf.id;
      newEntries.push({
        id: `plan-${slotInfo.dateString}-colazione-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: 'colazione',
        recipe_id: selectedBf.id,
        servings: options.servings,
        created_at: Date.now(),
      });
      continue;
    }

    // ── SPUNTINO ─────────────────────────────────────────────────────────────
    if (slotInfo.isSnack) {
      const snkCandidates = shuffle(snackPool).filter(r =>
        !usedSnackIds.has(r.id) && r.id !== lastSnackId
      );
      const selectedSnk = snkCandidates[0] ??
        shuffle(snackPool).find(r => !usedSnackIds.has(r.id)) ??
        shuffle(snackPool)[0];
      if (!selectedSnk) continue;

      usedSnackIds.add(selectedSnk.id);
      lastSnackId = selectedSnk.id;
      newEntries.push({
        id: `plan-${slotInfo.dateString}-spuntino-${Math.random().toString(36).slice(2, 7)}`,
        date: slotInfo.dateString,
        slot: 'spuntino',
        recipe_id: selectedSnk.id,
        servings: options.servings,
        created_at: Date.now(),
      });
      continue;
    }

    // ── PRANZO / CENA (logica proteica + anti-ripetizione carb) ─────────────
    const lastProtein = lastTwoProteins[lastTwoProteins.length - 1] ?? null;
    const blockedProtein: ProteinType | null =
      lastTwoProteins.length === 2 && lastTwoProteins[0] === lastTwoProteins[1]
        ? lastTwoProteins[0]
        : null;

    // Priorità: rispetta i budget settimanali rimanenti, evita il tipo bloccato
    let targetProtein: ProteinType;
    if (legumiRemaining > 0 && blockedProtein !== 'legumi') {
      targetProtein = 'legumi';
    } else if (soyaRemaining > 0 && blockedProtein !== 'soya') {
      targetProtein = 'soya';
    } else {
      targetProtein = 'verdure';
    }

    // Scegli il pool giusto
    let pool: Recipe[];
    if (targetProtein === 'legumi') pool = legumePool;
    else if (targetProtein === 'soya') pool = soyaPool;
    else pool = verduPool;

    // Filtra: non già usate, no stesso cereale del pasto precedente
    let candidates = shuffle(pool).filter(r => {
      if (usedRecipeIds.has(r.id)) return false;
      const ni = nutritionIndex.get(r.id);
      if (!ni) return false;
      // Anti-ripetizione carboidrato
      if (lastCarb && ni.mainCarb && ni.mainCarb === lastCarb) return false;
      return true;
    });

    // Filtro tempo per pranzo feriale
    if (slotInfo.isWeekdayLunch && options.maxWeekdayLunchMinutes) {
      const fast = candidates.filter(r =>
        r.tempi.tempo_totale_minuti > 0 &&
        r.tempi.tempo_totale_minuti <= options.maxWeekdayLunchMinutes!
      );
      if (fast.length > 0) candidates = fast;
    }

    // Fallback: se il pool specifico è esaurito, usa tutti i pasti validi
    if (candidates.length === 0) {
      candidates = shuffle(mealPool).filter(r => {
        if (usedRecipeIds.has(r.id)) return false;
        const ni = nutritionIndex.get(r.id);
        return !ni?.mainCarb || ni.mainCarb !== lastCarb;
      });
    }

    // Fallback finale: ignora anti-ripetizione carboidrato se necessario
    if (candidates.length === 0) {
      candidates = shuffle(mealPool).filter(r => !usedRecipeIds.has(r.id));
    }

    if (candidates.length === 0) continue; // Dataset esaurito (non dovrebbe accadere)

    const selected = candidates[0];
    const ni = nutritionIndex.get(selected.id)!;

    usedRecipeIds.add(selected.id);
    lastCarb = ni.mainCarb;

    // Aggiorna sliding window lastTwoProteins
    lastTwoProteins.push(ni.protein);
    if (lastTwoProteins.length > 2) lastTwoProteins.shift();

    // Decrementa budget proteico settimanale
    if (ni.protein === 'legumi') { legumiCount++; legumiRemaining = Math.max(0, legumiRemaining - 1); }
    else if (ni.protein === 'soya') { soyaCount++; soyaRemaining = Math.max(0, soyaRemaining - 1); }

    // Scegli un contorno/insalata di accompagnamento per il pasto principale
    const sideCandidates = shuffle(sidePool).filter(r => !usedSideIds.has(r.id));
    const selectedSide = sideCandidates[0] ?? shuffle(sidePool)[0];
    if (selectedSide) usedSideIds.add(selectedSide.id);

    newEntries.push({
      id: `plan-${slotInfo.dateString}-${slotInfo.slot}-${Math.random().toString(36).slice(2, 7)}`,
      date: slotInfo.dateString,
      slot: slotInfo.slot,
      recipe_id: selected.id,
      side_recipe_id: selectedSide?.id,
      servings: options.servings,
      created_at: Date.now(),
    });
  }

  return newEntries;
}

/**
 * Costruisce una sequenza di tipi proteici per i nuovi slot,
 * rispettando la regola "max 2 consecutivi dello stesso tipo".
 */
function buildProteinSequence(
  legumiTarget: number,
  soyaTarget: number,
  verdureTarget: number,
  totalSlots: number,
): ProteinType[] {
  const bag: ProteinType[] = [
    ...Array(legumiTarget).fill('legumi'),
    ...Array(soyaTarget).fill('soya'),
    ...Array(verdureTarget).fill('verdure'),
  ];

  // Completa se i target non coprono tutti gli slot (arrotondamenti)
  while (bag.length < totalSlots) bag.push('verdure');

  // Fisher-Yates via shared shuffle utility
  const shuffled = shuffle(bag);
  shuffled.forEach((v, i) => { bag[i] = v; });

  // Rimuovi sequenze di 3+ uguali spostando elementi
  for (let i = 2; i < bag.length; i++) {
    if (bag[i] === bag[i - 1] && bag[i] === bag[i - 2]) {
      // Cerca il prossimo elemento diverso dopo i
      let swapIdx = -1;
      for (let j = i + 1; j < bag.length; j++) {
        if (bag[j] !== bag[i]) { swapIdx = j; break; }
      }
      // Se trovato, scambia
      if (swapIdx !== -1) {
        [bag[i], bag[swapIdx]] = [bag[swapIdx], bag[i]];
      }
      // Se non trovato, inverti la coppia precedente (edge case con pool piccolo)
      else if (i >= 1) {
        [bag[i - 1], bag[i]] = [bag[i], bag[i - 1]];
      }
    }
  }

  return bag;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-GENERAZIONE (lunedì)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAndAutoGeneratePlan(
  existingPlans: MealPlanEntry[],
): Promise<{ generated: boolean; entriesCount: number }> {
  try {
    const prefs = await getPlannerPreferences();
    if (!prefs.autoGenerateOnMonday) return { generated: false, entriesCount: 0 };

    const today = new Date();
    const dayOfWeek = today.getDay();
    const isMonday = dayOfWeek === 1;

    const monday = new Date(today);
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    monday.setDate(diff);
    const mondayStr = monday.toISOString().split('T')[0];

    const lastGen = await getKV('gw_planner_last_gen');
    if (!isMonday || lastGen === mondayStr) return { generated: false, entriesCount: 0 };

    const { days } = getWeekDays(0);
    const weekDates = new Set(days.map(d => d.dateString));
    const weekPlans = existingPlans.filter(p => weekDates.has(p.date));

    const maxSlots = days.length * SLOT_ORDER.length;
    if (weekPlans.length >= maxSlots) {
      await setKV('gw_planner_last_gen', mondayStr);
      return { generated: false, entriesCount: 0 };
    }

    const options: AutoPlanOptions = {
      servings: prefs.servings,
      includeWeekend: prefs.includeWeekend,
      maxWeekdayLunchMinutes: prefs.maxWeekdayLunchMinutes,
      onlyEmptySlots: true,
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
 * Genera manualmente un piano per la settimana corrente.
 */
export async function manualGeneratePlan(
  existingPlans: MealPlanEntry[],
  overwrite: boolean = false,
): Promise<number> {
  try {
    const prefs = await getPlannerPreferences();
    const { days } = getWeekDays(0);

    const options: AutoPlanOptions = {
      servings: prefs.servings,
      includeWeekend: prefs.includeWeekend,
      maxWeekdayLunchMinutes: prefs.maxWeekdayLunchMinutes,
      onlyEmptySlots: !overwrite,
    };

    const newEntries = generateBalancedWeekPlan(days, existingPlans, options);
    if (newEntries.length > 0) await saveMealPlanEntriesBulk(newEntries);
    return newEntries.length;
  } catch (e) {
    console.warn('manualGeneratePlan error', e);
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LISTA DELLA SPESA AGGREGATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggrega ingredienti di tutti i pasti pianificati sommando quantità omogenee
 * e li inserisce nella spesa per categoria.
 */
export async function aggregateAndAddToShopping(
  entries: MealPlanEntry[],
  recipesMap: Record<string, Recipe>,
): Promise<number> {

  // Mappa di aggregazione: chiave = "nome_ingrediente||unità"
  const aggregated = new Map<string, {
    recipeId: string;
    recipeTitle: string;
    name: string;
    unit: string;
    totalAmount: number | null;
    category: string;
    ingredientText: string;
    countQb: number; // quante volte era q.b.
  }>();

  for (const entry of entries) {
    const targetRecipeIds = [entry.recipe_id, entry.side_recipe_id].filter(Boolean) as string[];
    for (const rId of targetRecipeIds) {
      const recipe = recipesMap[rId];
      if (!recipe) continue;

      const baseServings = recipe.porzioni || 4;
      const factor = entry.servings / baseServings;
      const titleWithServings = `${recipe.titolo} (${entry.servings} porz.)`;

      const ingredients: IngredientItem[] = recipe.ingredienti_dettagliati.length > 0
        ? recipe.ingredienti_dettagliati
      : recipe.ingredienti.map(s => ({
          sezione: 'Generale',
          testo: s,
          quantita: null,
          unita: '',
          ingrediente: s,
        }));

    for (const ing of ingredients) {
      const scaled = scaleIngredient(ing.quantita, ing.unita, ing.ingrediente, ing.testo, factor);
      const isQb = !scaled.scaledAmount || scaled.unit?.toLowerCase().includes('q.b');

      // Normalizza la chiave: nome + unità (minuscolo, senza spazi ridondanti)
      const normName = scaled.name.toLowerCase().trim();
      const normUnit = isQb ? '__qb__' : (scaled.unit?.toLowerCase().trim() || '__no_unit__');
      const aggKey = `${normName}||${normUnit}`;

      // Categoria: usa la sezione dell'ingrediente, fallback 'Generale'
      const category = ing.sezione && ing.sezione !== '' ? ing.sezione : 'Generale';

      if (aggregated.has(aggKey)) {
        const existing = aggregated.get(aggKey)!;
        if (isQb) {
          existing.countQb++;
        } else if (scaled.scaledAmount != null && existing.totalAmount != null) {
          existing.totalAmount += scaled.scaledAmount;
        }
      } else {
        aggregated.set(aggKey, {
          recipeId: recipe.id,
          recipeTitle: titleWithServings,
          name: scaled.name,
          unit: isQb ? '' : (scaled.unit || ''),
          totalAmount: isQb ? null : (scaled.scaledAmount ?? null),
          category,
          ingredientText: scaled.formattedText,
          countQb: isQb ? 1 : 0,
        });
      }
    }
  }
}

  if (aggregated.size === 0) return 0;

  const itemsToAdd = [...aggregated.values()].map(item => ({
    recipeId: item.recipeId,
    recipeTitle: item.recipeTitle,
    ingredientText: item.totalAmount != null
      ? `${item.totalAmount % 1 === 0 ? item.totalAmount : item.totalAmount.toFixed(1)} ${item.unit} ${item.name}`.trim()
      : item.name,
    name: item.name,
    amount: item.totalAmount,
    unit: item.unit,
    category: item.category,
  }));

  await addShoppingItems(itemsToAdd);
  return itemsToAdd.length;
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT PER CONDIVISIONE
// ─────────────────────────────────────────────────────────────────────────────

export function formatWeekPlanShareText(
  days: WeekDayInfo[],
  plans: MealPlanEntry[],
  recipesMap: Record<string, Recipe>,
  weekLabel: string,
): string {
  const lines: string[] = [];
  lines.push(`🗓️ *Menù Settimanale Green-Whisker*`);
  lines.push(`_${weekLabel}_\n`);

  const planMap: Record<string, MealPlanEntry> = {};
  plans.forEach(p => { planMap[`${p.date}-${p.slot}`] = p; });

  const SLOT_EMOJIS: Record<MealSlot, string> = {
    colazione: '☕',
    pranzo: '☀️',
    spuntino: '🍎',
    cena: '🌙',
  };

  days.forEach(d => {
    const dayEntries = SLOT_ORDER
      .map(slot => ({ slot, entry: planMap[`${d.dateString}-${slot}`] }))
      .filter(x => !!x.entry);

    if (dayEntries.length === 0) return;

    lines.push(`*${d.dayName} ${d.dayNumber} ${d.monthName}:*`);
    dayEntries.forEach(({ slot, entry }) => {
      const r = recipesMap[entry!.recipe_id];
      const emoji = SLOT_EMOJIS[slot];
      const label = SLOT_LABELS[slot];
      lines.push(`  ${emoji} ${label}: ${r ? r.titolo : 'Ricetta'} (${entry!.servings} p)`);
    });
    lines.push('');
  });

  lines.push('— Generato con Green-Whisker 🐾');
  return lines.join('\n');
}
