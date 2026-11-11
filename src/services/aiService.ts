import { IngredientItem, Recipe, RecipeDiet, SlotConsigliato } from '../types/recipe';
import { RECIPE_TAXONOMY, MacroCategory, MACRO_CATEGORIES } from '../constants/categories';
import { SHOPPING_UNITS } from '../constants/shoppingUnits';
import { loadAISettings } from './settingsService';
import { ingredientItemFromText } from '../utils/servingsScaler';
import { matchCatalogName } from '../utils/catalogNameMatch';
import { buildRecipeRequestPayload, namesFromSeed } from './recipePayload';
import SEED_INGREDIENTS from '../data/ingredients.seed.json';
import i18n from '../i18n';

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'openrouter' | 'custom';

// Modalità di estrazione: 'original' non adatta la ricetta, le altre generano una variante
export type ExtractMode = 'original' | 'vegetarian' | 'vegan';

// Ruolo del modello: 'simple' per testo semplice, 'complex' per immagini e adattamenti
export type ModelRole = 'simple' | 'complex';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

interface ProviderDefaults {
  label: string;
  model: string;
  // Modello per ricette complesse (immagini, adattamenti)
  complexModel: string;
  modelPresets?: string[];
  baseUrl?: string;
  // Indirizzo modificabile dall'utente (server compatibili OpenAI, modelli locali)
  baseUrlEditable?: boolean;
}

/**
 * Valori predefiniti per provider, usati quando né le impostazioni dell'app né il .env indicano altro
 */
export const PROVIDER_DEFAULTS: Record<AIProvider, ProviderDefaults> = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-flash-lite-latest',
    complexModel: 'gemini-flash-latest',
    modelPresets: ['gemini-flash-latest', 'gemini-flash-lite-latest'],
  },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', complexModel: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1', baseUrlEditable: true },
  claude: { label: 'Claude', model: 'claude-3-5-sonnet-20241022', complexModel: 'claude-3-5-sonnet-20241022' },
  openrouter: { label: 'OpenRouter', model: 'deepseek/deepseek-chat', complexModel: 'deepseek/deepseek-chat', baseUrl: 'https://openrouter.ai/api/v1' },
  custom: { label: 'Custom', model: 'llama3.2', complexModel: 'llama3.2', baseUrl: 'http://localhost:11434/v1', baseUrlEditable: true },
};

// Expo requires direct static member access on process.env.EXPO_PUBLIC_* for Metro AST inlining
function getEnvApiKey(provider: AIProvider): string {
  switch (provider) {
    case 'openai': return process.env.EXPO_PUBLIC_OPENAI_API_KEY || '';
    case 'claude': return process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';
    case 'openrouter': return process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';
    case 'custom': return process.env.EXPO_PUBLIC_AI_API_KEY || '';
    default: return process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
  }
}

/**
 * Configurazione da file .env (inclusa nell'APK solo se impostata al momento della build)
 */
export function getEnvAIConfig(providerOverride?: AIProvider): AIConfig {
  const envProvider = (process.env.EXPO_PUBLIC_AI_PROVIDER || 'gemini').toLowerCase() as AIProvider;
  const provider = providerOverride ?? (envProvider in PROVIDER_DEFAULTS ? envProvider : 'gemini');
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    apiKey: getEnvApiKey(provider),
    model: process.env.EXPO_PUBLIC_AI_MODEL || defaults.model,
    baseUrl: defaults.baseUrlEditable ? process.env.EXPO_PUBLIC_AI_BASE_URL || defaults.baseUrl : defaults.baseUrl,
  };
}

/**
 * Configurazione di un provider: le impostazioni salvate nell'app hanno la precedenza sul .env
 */
export async function getAIConfigFor(provider: AIProvider, role: ModelRole = 'simple'): Promise<AIConfig> {
  const settings = await loadAISettings();
  const envConfig = getEnvAIConfig(provider);
  const saved = settings.providers[provider] ?? {};

  // EXPO_PUBLIC_AI_MODEL vale solo per il ruolo 'simple'
  const model = role === 'complex'
    ? saved.complexModel || PROVIDER_DEFAULTS[provider].complexModel
    : saved.simpleModel || saved.model || envConfig.model;

  return {
    ...envConfig,
    apiKey: saved.apiKey || envConfig.apiKey,
    model,
    baseUrl: saved.baseUrl || envConfig.baseUrl,
  };
}

/**
 * Configurazione del provider attivo per il ruolo richiesto
 */
export async function getAIConfig(role: ModelRole = 'simple'): Promise<AIConfig> {
  const settings = await loadAISettings();
  // Senza provider salvato si usa quello del .env
  const provider = settings.provider ?? getEnvAIConfig().provider;
  return getAIConfigFor(provider, role);
}

/**
 * Resilient fetch wrapper with AbortController timeout to prevent hanging UI
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 35000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(i18n.t('errors.requestTimeout', { seconds: Math.round(timeoutMs / 1000) }));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Ritardi tra i tentativi, solo per errori di rete (l'app può andare in background durante la chiamata)
const NETWORK_RETRY_DELAYS_MS = [1500, 3000];
const NETWORK_ERROR_MARKERS = ['fetch failed', 'Network request failed', 'UnknownHost', 'Unable to resolve host'];

function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = String((error as any)?.message ?? '');
  return NETWORK_ERROR_MARKERS.some(marker => message.includes(marker));
}

/**
 * fetchWithTimeout con nuovi tentativi solo su errori di rete; gli errori HTTP non vengono ritentati
 */
async function fetchWithNetworkRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 35000
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (error) {
      if (!isNetworkError(error) || attempt >= NETWORK_RETRY_DELAYS_MS.length) throw error;
      await new Promise(resolve => setTimeout(resolve, NETWORK_RETRY_DELAYS_MS[attempt]));
    }
  }
}

// Pattern di immagini da scartare (loghi, avatar, icone, miniature)
const EXCLUDED_IMAGE_PATTERNS = ['profile_pic', 'avatar', 'logo', 'icon', 'emoji', 'sprite', 'favicon', 's150x150'];
const IMAGE_SIZE_SEGMENT = /\/s\d{2,3}x\d{2,3}/;

function isExcludedImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return EXCLUDED_IMAGE_PATTERNS.some(pattern => lower.includes(pattern)) || IMAGE_SIZE_SEGMENT.test(lower);
}

// Legge og:image / twitter:image dalla pagina, con attributi in entrambi gli ordini
async function fetchPageImage(url: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html'
      }
    }, 12000);
    if (!res.ok) return '';
    const html = await res.text();

    const findImage = (key: string): string => {
      const attr = `(?:property|name)=["']${key}["']`;
      const contentAttr = `content=["']([^"']+)["']`;
      const patterns = [
        new RegExp(`<meta\\s+${attr}\\s+${contentAttr}[^>]*>`, 'i'),
        new RegExp(`<meta\\s+${contentAttr}\\s+${attr}[^>]*>`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) return match[1].replace(/&amp;/g, '&').trim();
      }
      return '';
    };

    const image = findImage('og:image') || findImage('twitter:image');
    return /^https?:\/\//i.test(image) ? image : '';
  } catch {
    return '';
  }
}

// Prima immagine non scartata nel markdown di Jina (sintassi ![..](url) o URL diretti)
function pickMarkdownImage(markdown: string): string {
  const imageRegex = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)"'<>]+\.(?:jpe?g|png|webp)(?=[?#\s)"'<>]|$))/gi;
  for (const match of markdown.matchAll(imageRegex)) {
    const url = match[1] ?? match[2];
    if (url && !isExcludedImageUrl(url)) return url;
  }
  return '';
}

export const VALID_MACRO_CATEGORIES = MACRO_CATEGORIES;

export const VALID_SLOTS: SlotConsigliato[] = ['colazione', 'spuntino', 'pranzo_cena'];

const LEGACY_MACRO_MAP: Record<string, MacroCategory> = {
  'primi e cereali': 'MACRO_PRIMI_E_CEREALI',
  'proteine vegetali & secondi': 'MACRO_PROTEINE_E_SECONDI',
  'secondi piatti': 'MACRO_PROTEINE_E_SECONDI',
  'panificati e piatti unici': 'MACRO_PANIFICATI_E_PIATTI_UNICI',
  'verdure e contorni': 'MACRO_VERDURE_E_CONTORNI',
  'dolci, colazioni e snack': 'MACRO_COLAZIONI_DOLCI',
  'dolci e colazioni': 'MACRO_COLAZIONI_DOLCI',
};

const LEGACY_CAT_MAP: Record<string, string> = {
  'primi piatti': 'CAT_PRIMI_PIATTI',
  'risotti': 'CAT_RISOTTI',
  'gnocchi': 'CAT_GNOCCHI',
  'pasta al forno': 'CAT_PASTA_AL_FORNO',
  'polenta': 'CAT_POLENTA',
  'bowl': 'CAT_BOWL',
  'porridge & overnight oats': 'CAT_PORRIDGE_E_OVERNIGHT_OATS',
  'porridge': 'CAT_PORRIDGE_E_OVERNIGHT_OATS',
  'insalate di cereali': 'CAT_INSALATE_DI_CEREALI',
  'secondi piatti': 'CAT_SECONDI_PIATTI',
  'piatti a base di legumi': 'CAT_PIATTI_A_BASE_DI_LEGUMI',
  'insalate di legumi': 'CAT_INSALATE_DI_LEGUMI',
  'secondi a base di tofu': 'CAT_SECONDI_A_BASE_DI_TOFU',
  'tofu': 'CAT_SECONDI_A_BASE_DI_TOFU',
  'secondi a base di tempeh': 'CAT_SECONDI_A_BASE_DI_TEMPEH',
  'tempeh': 'CAT_SECONDI_A_BASE_DI_TEMPEH',
  'secondi a base di seitan': 'CAT_SECONDI_A_BASE_DI_SEITAN',
  'seitan': 'CAT_SECONDI_A_BASE_DI_SEITAN',
  'secondi a base di soia': 'CAT_SECONDI_A_BASE_DI_SOIA',
  'soia': 'CAT_SECONDI_A_BASE_DI_SOIA',
  'farinate e frittate': 'CAT_FARINATE_E_FRITTATE',
  'farinate & frittate': 'CAT_FARINATE_E_FRITTATE',
  'polpette e burger': 'CAT_POLPETTE_E_BURGER',
  'polpette & burger': 'CAT_POLPETTE_E_BURGER',
  'cotolette': 'CAT_COTOLETTE',
  'piadine e wraps': 'CAT_PIADINE_E_WRAPS',
  'piadine & wraps': 'CAT_PIADINE_E_WRAPS',
  'panini e bruschette': 'CAT_PANINI_E_BRUSCHETTE',
  'panini & bruschette': 'CAT_PANINI_E_BRUSCHETTE',
  'pizze e focacce': 'CAT_PIZZE_E_FOCACCIE',
  'pizze & focacce': 'CAT_PIZZE_E_FOCACCIE',
  'torte salate': 'CAT_TORTE_SALATE',
  'contorni': 'CAT_CONTORNI',
  'verdure al forno': 'CAT_VERDURE_AL_FORNO',
  'verdure in padella': 'CAT_VERDURE_IN_PADELLA',
  'verdure bollite e a vapore': 'CAT_VERDURE_BOLLITE_E_A_VAPORE',
  'zuppe e vellutate': 'CAT_ZUPPE_E_VELLUTATE',
  'salse e condimenti': 'CAT_SALSE_E_CONDIMENTI',
  'colazioni e merende dolci': 'CAT_MERENDE_E_COLAZIONI_DOLCI',
  'merende e colazioni dolci': 'CAT_MERENDE_E_COLAZIONI_DOLCI',
  'colazioni e merende salate': 'CAT_MERENDE_E_COLAZIONI_SALATE',
  'biscotti': 'CAT_BISCOTTI',
  'torte e dolci da forno': 'CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO',
  'torte da forno': 'CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO',
  'barrette e energy balls': 'CAT_ENERGY_BALLS_E_BARRETTE',
  'energy balls & barrette': 'CAT_ENERGY_BALLS_E_BARRETTE',
  'frullati': 'CAT_FRULLATI',
  'frutta fresca e macedonie': 'CAT_FRUTTA_FRESCA_E_MACEDONIE',
  'frutta secca': 'CAT_FRUTTA_SECCA',
  'gelati': 'CAT_GELATI',
  'a base di latte vegetale': 'CAT_A_BASE_DI_LATTE_VEGETALE',
  'a base di yogurt vegetale': 'CAT_A_BASE_DI_YOGURT_VEGETALE',
};

// Unità degli ingredienti strutturati: quelle della lista della spesa più "q.b." (nessuna quantità)
const INGREDIENT_UNITS: string[] = [...SHOPPING_UNITS, 'q.b.'];
const INGREDIENT_UNIT_LIST = INGREDIENT_UNITS.map(u => `"${u}"`).join(', ');
const RECIPE_DIETS: RecipeDiet[] = ['omnivore', 'vegetarian', 'vegan'];
// Difficoltà richieste al modello in italiano; l'app salva easy/medium/hard
const DIFFICULTY_FROM_MODEL = new Map<string, 'easy' | 'medium' | 'hard'>([
  ['Facile', 'easy'], ['Media', 'medium'], ['Difficile', 'hard'],
  ['easy', 'easy'], ['medium', 'medium'], ['hard', 'hard'],
]);

const RECIPE_TASK_VEGAN = `
You adapt recipes for the Italian app 'Green Whisker'. Rewrite the source recipe as fully plant-based: replace every animal-derived ingredient (meat, fish, eggs, dairy, honey, gelatin, broth) with suitable plant-based ingredients, adjusting quantities and steps. Keep everything else unchanged. List each replacement in the 'substitutions' array as {"from": "...", "to": "..."}. Return EXCLUSIVELY a valid JSON object matching the required schema.
`;

const RECIPE_TASK_ORIGINAL = `
You convert recipes for the Italian app 'Green Whisker'. Transcribe the source recipe faithfully into the schema: keep every ingredient, quantity and step; do not substitute, remove or add ingredients. Return EXCLUSIVELY a valid JSON object matching the required schema.
`;

const RECIPE_TASK_VEGETARIAN = `
You adapt recipes for the Italian app 'Green Whisker'. Rewrite the source recipe as vegetarian: replace meat, fish and their derivatives (broth, anchovies, gelatin) with suitable vegetarian ingredients, adjusting quantities and steps. Keep eggs, dairy and everything else unchanged. List each replacement in the 'substitutions' array as {"from": "...", "to": "..."}. Return EXCLUSIVELY a valid JSON object matching the required schema.
`;

const RECIPE_PROMPT_RULES = `
IMPORTANT LANGUAGE INSTRUCTION:
- All generated recipe fields (title, ingredients, instructions, tips, etc.) MUST be written in natural, fluent Italian.

CONTENT RULES:
- Never invent quantities: if a quantity is missing write 'q.b.'.
- Do not add steps that are not implied by the source recipe.

STRICT SCHEMA & PARSING RULES:
1. "title": Clean Italian recipe title (e.g., "Trofie al Pesto con Patate e Fagiolini"). Do not prepend unnecessary words or brand labels.
2. "macro_category": Exactly one of the 5 canonical Macro IDs:
   - "MACRO_PRIMI_E_CEREALI"
   - "MACRO_PROTEINE_E_SECONDI"
   - "MACRO_PANIFICATI_E_PIATTI_UNICI"
   - "MACRO_VERDURE_E_CONTORNI"
   - "MACRO_COLAZIONI_DOLCI"
3. "category": Exactly one of the canonical Category IDs matching the macro_category:
   - For MACRO_PRIMI_E_CEREALI:
     "CAT_PRIMI_PIATTI", "CAT_RISOTTI", "CAT_GNOCCHI", "CAT_PASTA_AL_FORNO", "CAT_POLENTA", "CAT_BOWL", "CAT_PORRIDGE_E_OVERNIGHT_OATS", "CAT_INSALATE_DI_CEREALI"
   - For MACRO_PROTEINE_E_SECONDI:
     "CAT_SECONDI_PIATTI", "CAT_PIATTI_A_BASE_DI_LEGUMI", "CAT_INSALATE_DI_LEGUMI", "CAT_SECONDI_A_BASE_DI_TOFU", "CAT_SECONDI_A_BASE_DI_TEMPEH", "CAT_SECONDI_A_BASE_DI_SEITAN", "CAT_SECONDI_A_BASE_DI_SOIA", "CAT_FARINATE_E_FRITTATE", "CAT_POLPETTE_E_BURGER", "CAT_COTOLETTE"
   - For MACRO_PANIFICATI_E_PIATTI_UNICI:
     "CAT_PIADINE_E_WRAPS", "CAT_PANINI_E_BRUSCHETTE", "CAT_PIZZE_E_FOCACCIE", "CAT_TORTE_SALATE"
   - For MACRO_VERDURE_E_CONTORNI:
     "CAT_CONTORNI", "CAT_VERDURE_AL_FORNO", "CAT_VERDURE_IN_PADELLA", "CAT_VERDURE_BOLLITE_E_A_VAPORE", "CAT_ZUPPE_E_VELLUTATE", "CAT_SALSE_E_CONDIMENTI"
   - For MACRO_COLAZIONI_DOLCI:
     "CAT_MERENDE_E_COLAZIONI_DOLCI", "CAT_MERENDE_E_COLAZIONI_SALATE", "CAT_BISCOTTI", "CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO", "CAT_ENERGY_BALLS_E_BARRETTE", "CAT_FRULLATI", "CAT_FRUTTA_FRESCA_E_MACEDONIE", "CAT_FRUTTA_SECCA", "CAT_GELATI", "CAT_A_BASE_DI_LATTE_VEGETALE", "CAT_A_BASE_DI_YOGURT_VEGETALE"
4. "subcategory": Set exactly equal to "category".
5. "recommended_slot": Exactly one of: "colazione", "spuntino", "pranzo_cena".
6. "food_groups": Array containing one or more from: ["cereali", "verdura", "frutta", "frutta_secca_semi", "cibi_proteici", "grassi"].
7. "protein_group": Exactly one of: "legumi_interi", "soia_derivati", "cereali_proteici", "leggero_vegetale".
8. "carb_family": Exactly one of: "pasta", "riso", "farro_orzo", "pseudocereali", "tuberi", "pane_cereali_rapidi", "none".
9. "veggie_color": Dominant vegetable phytocolor: "green", "red_orange", "purple_blue", "yellow_white", "neutral".
10. "is_complete_plate": Boolean (true if self-contained balanced meal, false if structured component needing side/main).
11. "difficulty": Exactly one of: "Facile", "Media", "Difficile".
12. "servings": Integer number of servings (e.g. 4, 2).
13. "servings_text": Description in Italian (e.g. "4 porzioni", "2 porzioni").
14. "times": Object with:
    - "total_minutes": Integer number (e.g. 30)
    - "prep_time": String in Italian (e.g. "10 minuti")
    - "cook_time": String in Italian (e.g. "20 minuti")
    - "display_time": String formatted as "Prep: 10 min, Cottura: 20 min"
15. "detailed_ingredients": Array of objects, one per ingredient, in Italian. Each object has:
    - "section": Section name (e.g. "Principale"; use another name such as "Impasto" or "Copertura" only for clearly separate parts).
    - "amount": Number (e.g. 200, 0.5, 2), or null when the source gives no quantity. Never invent quantities.
    - "unit": Exactly one of: ${INGREDIENT_UNIT_LIST}. Use "q.b." when there is no quantity, and "pezzo" for countable items (e.g. 2 uova).
    - "name": Product name without quantity, unit or preparation, singular, first letter capitalized, without parentheses (e.g. "Uova", "Farina 0", "Fiocchi di avena", "Mandorle", "Olio di oliva"). If an ingredient is a preparation (tostato, tritato, cotto), name the base product and describe the preparation in the instructions.
17. "instructions": Array of strings, where each element is an orderly, concise cooking step in Italian.
18. "tips": Array of strings with 1-2 helpful chef tips in Italian.
19. "tags": short descriptive tags in Italian (e.g. Senza Glutine, Veloce).
20. "image": Direct URL string of the main recipe photo if available, or "".
21. "substitutions": Optional array of {"from": "...", "to": "..."} strings, one per replaced ingredient; empty array when nothing is substituted.

22. "diet": Exactly one of: "omnivore" (contains meat or fish), "vegetarian" (no meat or fish, but eggs or dairy), "vegan" (no animal products). Evaluate the final recipe, after any substitution.

Respond ONLY with the JSON object, without any additional markdown explanation or surrounding commentary.
`;

const RECIPE_TASKS: Record<ExtractMode, string> = {
  original: RECIPE_TASK_ORIGINAL,
  vegetarian: RECIPE_TASK_VEGETARIAN,
  vegan: RECIPE_TASK_VEGAN,
};

function buildRecipePrompt(diet: ExtractMode = 'original'): string {
  return RECIPE_TASKS[diet] + RECIPE_PROMPT_RULES;
}

const ALL_CATEGORY_IDS: string[] = Object.values(RECIPE_TAXONOMY).flat();

// Schema per Gemini: tipi e, dove esistono valori validi, enum
const RECIPE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    image: { type: 'STRING' },
    url: { type: 'STRING' },
    source: { type: 'STRING' },
    servings_text: { type: 'STRING' },
    times: {
      type: 'OBJECT',
      properties: {
        total_minutes: { type: 'INTEGER' },
        prep_time: { type: 'STRING' },
        cook_time: { type: 'STRING' },
        display_time: { type: 'STRING' }
      },
      required: ['total_minutes']
    },
    detailed_ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: { type: 'STRING' },
          amount: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', enum: INGREDIENT_UNITS },
          name: { type: 'STRING' }
        },
        required: ['section', 'amount', 'unit', 'name']
      }
    },
    seasons: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: ['inverno', 'primavera', 'estate', 'autunno'] }
    },
    category: { type: 'STRING', enum: ALL_CATEGORY_IDS },
    subcategory: { type: 'STRING', enum: ALL_CATEGORY_IDS },
    macro_category: { type: 'STRING', enum: MACRO_CATEGORIES },
    difficulty: { type: 'STRING', enum: ['Facile', 'Media', 'Difficile'] },
    diet: { type: 'STRING', enum: RECIPE_DIETS },
    servings: { type: 'INTEGER' },
    is_complete_plate: { type: 'BOOLEAN' },
    recommended_slot: { type: 'STRING', enum: ['colazione', 'spuntino', 'pranzo_cena'] },
    food_groups: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: ['cereali', 'verdura', 'frutta', 'frutta_secca_semi', 'cibi_proteici', 'grassi'] }
    },
    protein_group: { type: 'STRING', enum: ['legumi_interi', 'soia_derivati', 'cereali_proteici', 'leggero_vegetale'] },
    carb_family: { type: 'STRING', enum: ['pasta', 'riso', 'farro_orzo', 'pseudocereali', 'tuberi', 'pane_cereali_rapidi', 'none'] },
    veggie_color: { type: 'STRING', enum: ['green', 'red_orange', 'purple_blue', 'yellow_white', 'neutral'] },
    instructions: { type: 'ARRAY', items: { type: 'STRING' } },
    tips: { type: 'ARRAY', items: { type: 'STRING' } },
    tags: { type: 'ARRAY', items: { type: 'STRING' } },
    substitutions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { from: { type: 'STRING' }, to: { type: 'STRING' } },
        required: ['from', 'to']
      }
    }
  },
  required: ['title', 'category', 'macro_category', 'detailed_ingredients', 'instructions']
};

export interface RecipeImageInput {
  base64: string;
  mimeType?: string;
  uri?: string;
}

export interface ParseRecipeInput {
  text?: string;
  url?: string;
  imageBase64?: string;
  imageMimeType?: string;
  images?: RecipeImageInput[];
  // Dieta a cui adattare la ricetta; 'original' la estrae senza sostituire gli ingredienti
  diet?: ExtractMode;
  // True quando si adatta una ricetta esistente a una dieta
  adapt?: boolean;
  // Nomi del catalogo per allineare gli ingredienti; vuoto = nessun allineamento
  catalogNames?: string[];
}

// Nomi di prodotto dal seed, costruiti una sola volta. Restano sul dispositivo: servono al controllo locale.
let seedNamesCache: string[] | null = null;

export function seedCatalogNames(): string[] {
  if (!seedNamesCache) {
    seedNamesCache = namesFromSeed(SEED_INGREDIENTS);
  }
  return seedNamesCache;
}

export async function parseRecipeWithAI(input: ParseRecipeInput): Promise<Recipe> {
  // Immagini e adattamenti richiedono il modello complesso
  const hasImages = (input.images?.length ?? 0) > 0 || !!input.imageBase64;
  const role: ModelRole = hasImages || input.adapt ? 'complex' : 'simple';
  const config = await getAIConfig(role);

  if (!config.apiKey && config.provider !== 'custom') {
    throw new Error(i18n.t('errors.missingApiKey', { provider: PROVIDER_DEFAULTS[config.provider].label }));
  }

  // Allineamento locale agli ingredienti del seed: i nomi non vanno nel payload verso il modello
  const effectiveInput: ParseRecipeInput = { ...input, catalogNames: input.catalogNames ?? seedCatalogNames() };
  const targetUrl = input.url || (input.text && /^https?:\/\/[^\s]+$/i.test(input.text.trim()) ? input.text.trim() : null);

  let markdownImage = '';
  const pageImagePromise = targetUrl ? fetchPageImage(targetUrl) : Promise.resolve('');

  if (targetUrl) {
    try {
      const jinaRes = await fetchWithNetworkRetry(`https://r.jina.ai/${targetUrl}`, {
        headers: { 'Accept': 'text/plain' }
      }, 12000);
      if (jinaRes.ok) {
        const markdown = await jinaRes.text();
        if (markdown && markdown.length > 50) {
          effectiveInput.text = `Recipe Source URL: ${targetUrl}\n\nWebpage Content:\n${markdown}`;
          markdownImage = pickMarkdownImage(markdown);
        }
      }
    } catch {
      // Gracefully fall back to passing the raw URL if reader times out or fails
    }
  }

  const pageImage = await pageImagePromise;
  const chosenImage = pageImage || markdownImage;

  let recipe: Recipe;
  switch (config.provider) {
    case 'gemini':
      recipe = await parseWithGemini(effectiveInput, config);
      break;
    case 'openai':
    case 'openrouter':
    case 'custom':
      recipe = await parseWithOpenAICompatible(effectiveInput, config);
      break;
    case 'claude':
      recipe = await parseWithClaude(effectiveInput, config);
      break;
    default:
      recipe = await parseWithGemini(effectiveInput, config);
  }

  if (targetUrl) {
    // L'immagine del modello si tiene solo se è valida; altrimenti si usa quella della pagina
    const modelImage = (recipe.image || '').trim();
    if (!modelImage || isExcludedImageUrl(modelImage)) {
      recipe = { ...recipe, image: chosenImage };
    }
  }

  return recipe;
}

// Alias for backwards compatibility
export const parseRecipeWithGemini = parseRecipeWithAI;

async function parseWithGemini(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  // Modello scelto, poi alternative in caso di errore (senza ripetere quello già provato)
  const candidateModels = Array.from(new Set([
    config.model,
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ]));

  // La lista dei prodotti non va mai inviata a Gemini: serve solo al controllo locale dopo la risposta.
  // Il payload contiene solo systemInstruction, contents e generationConfig (nessun catalogNames).
  const payload = buildRecipeRequestPayload(input, RECIPE_RESPONSE_SCHEMA, buildRecipePrompt(input.diet));

  let lastErrorMsg = '';

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
      const response = await fetchWithNetworkRetry(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 45000);

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.error && errJson.error.message) {
            lastErrorMsg = errJson.error.message;
          }
        } catch {}
        continue;
      }

      const data = await response.json();
      const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawContent) {
        return normalizeParsedRecipe(rawContent, input.url, input.catalogNames);
      }
    } catch (e: any) {
      // Rete non disponibile: inutile provare gli altri modelli
      if (isNetworkError(e)) {
        throw new Error(i18n.t('errors.networkUnavailable'));
      }
      lastErrorMsg = e.message;
    }
  }

  throw new Error(lastErrorMsg || i18n.t('errors.geminiExtractFailed'));
}

async function parseWithOpenAICompatible(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  let baseUrl = config.baseUrl || PROVIDER_DEFAULTS.openai.baseUrl!;
  let defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  if (config.provider === 'openrouter') {
    defaultHeaders['HTTP-Referer'] = 'https://greenwhisker.app';
    defaultHeaders['X-Title'] = 'Green Whisker';
  }

  const userContentParts: any[] = [];

  if (input.text) {
    userContentParts.push({
      type: 'text',
      text: `Extract and structure the recipe from this raw text:\n\n${input.text}`
    });
  }

  if (input.url) {
    userContentParts.push({
      type: 'text',
      text: `Extract and structure the plant-based recipe from this URL:\n\n${input.url}`
    });
  }

  const allImages: RecipeImageInput[] = input.images && input.images.length > 0
    ? input.images
    : input.imageBase64
      ? [{ base64: input.imageBase64, mimeType: input.imageMimeType || 'image/jpeg' }]
      : [];

  if (allImages.length > 0) {
    allImages.forEach(img => {
      const mime = img.mimeType || 'image/jpeg';
      userContentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${img.base64}`
        }
      });
    });
    if (allImages.length === 1) {
      userContentParts.push({
        type: 'text',
        text: 'Extract the recipe from this image.'
      });
    } else {
      userContentParts.push({
        type: 'text',
        text: `These ${allImages.length} images are consecutive pages of the SAME recipe from a cookbook. Combine all ingredients, quantities, and steps from all pages into a single complete recipe.`
      });
    }
  }

  const payload = {
    model: config.model,
    messages: [
      { role: 'system', content: buildRecipePrompt(input.diet) },
      { role: 'user', content: userContentParts.length === 1 && userContentParts[0].type === 'text' ? userContentParts[0].text : userContentParts }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(payload)
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = i18n.t('errors.apiError', { status: response.status });
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error && errJson.error.message) {
        errorMsg = errJson.error.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error(i18n.t('errors.noModelResponse'));
  }

  return normalizeParsedRecipe(rawContent, input.url, input.catalogNames);
}

async function parseWithClaude(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01'
  };

  const userContent: any[] = [];

  const allImages: RecipeImageInput[] = input.images && input.images.length > 0
    ? input.images
    : input.imageBase64
      ? [{ base64: input.imageBase64, mimeType: input.imageMimeType || 'image/jpeg' }]
      : [];

  if (allImages.length > 0) {
    allImages.forEach(img => {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      });
    });
  }

  let textPrompt = '';
  if (input.text) textPrompt += `Extract and structure the recipe from this text:\n\n${input.text}\n\n`;
  if (input.url) textPrompt += `Extract and structure the recipe from this URL: ${input.url}\n\n`;
  textPrompt += 'Output ONLY the raw JSON object adhering to the schema.';

  userContent.push({ type: 'text', text: textPrompt });

  const payload = {
    model: config.model,
    max_tokens: 2500,
    system: buildRecipePrompt(input.diet),
    messages: [
      { role: 'user', content: userContent }
    ]
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = i18n.t('errors.claudeApiError', { status: response.status });
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error && errJson.error.message) {
        errorMsg = errJson.error.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent = data?.content?.[0]?.text;

  if (!rawContent) {
    throw new Error(i18n.t('errors.noClaudeResponse'));
  }

  return normalizeParsedRecipe(rawContent, input.url, input.catalogNames);
}

interface StructuredIngredients {
  flat: string[];
  bySection: { section: string; ingredients: string[] }[];
  detailed: (IngredientItem & { catalog_matched: boolean })[];
}

// Ingredienti come oggetti {section, amount, unit, name}; null se assenti (formato vecchio: stringhe)
function parseStructuredIngredients(raw: unknown, catalogNames: string[]): StructuredIngredients | null {
  if (!Array.isArray(raw)) return null;
  const items = raw.filter((i: any) => typeof i?.name === 'string' && i.name.trim() !== '');
  if (items.length === 0) return null;

  const detailed = items.map((i: any) => {
    const amount: number | null = typeof i.amount === 'number' && Number.isFinite(i.amount) ? i.amount : null;
    const rawUnit = typeof i.unit === 'string' ? i.unit.trim().toLowerCase() : '';
    const unit = amount !== null && rawUnit !== 'q.b.' && INGREDIENT_UNITS.includes(rawUnit) ? rawUnit : '';
    const match = matchCatalogName(i.name.trim(), catalogNames);
    const section = typeof i.section === 'string' && i.section.trim() ? i.section.trim() : 'Principale';
    const text = amount === null
      ? `q.b. di ${match.name}`
      : [String(amount), unit === 'pezzo' ? '' : unit, match.name].filter(Boolean).join(' ');
    return { section, text, amount, unit, ingredient: match.name, catalog_matched: match.matched };
  });

  const bySection: { section: string; ingredients: string[] }[] = [];
  for (const item of detailed) {
    let group = bySection.find(s => s.section === item.section);
    if (!group) {
      group = { section: item.section, ingredients: [] };
      bySection.push(group);
    }
    group.ingredients.push(item.text);
  }

  return { flat: detailed.map(d => d.text), bySection, detailed };
}

function normalizeParsedRecipe(rawContent: string, sourceUrl?: string, catalogNames: string[] = []): Recipe {
  let parsed: any;
  try {
    const cleaned = rawContent.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(i18n.t('errors.invalidJsonResponse'));
  }

  const safeId = 'custom-' + (parsed.title || parsed.titolo || 'ricetta')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 6);

  // Canonical Macro and Category resolution with resilient fallback
  const rawMacro = (parsed.macro_category || parsed.macro_categoria || parsed.category || parsed.categoria || '').toString().trim();
  const rawCat = (parsed.category || parsed.categoria || parsed.subcategory || parsed.sottocategoria || '').toString().trim();

  let resolvedMacro: MacroCategory = 'MACRO_PRIMI_E_CEREALI';
  if (VALID_MACRO_CATEGORIES.includes(rawMacro as MacroCategory)) {
    resolvedMacro = rawMacro as MacroCategory;
  } else if (LEGACY_MACRO_MAP[rawMacro.toLowerCase()]) {
    resolvedMacro = LEGACY_MACRO_MAP[rawMacro.toLowerCase()];
  }

  let resolvedCat: string = '';
  const validForMacro: readonly string[] = RECIPE_TAXONOMY[resolvedMacro] || [];
  if (validForMacro.includes(rawCat)) {
    resolvedCat = rawCat;
  } else if (LEGACY_CAT_MAP[rawCat.toLowerCase()]) {
    resolvedCat = LEGACY_CAT_MAP[rawCat.toLowerCase()];
  } else {
    // Search across all taxonomy
    for (const [mKey, subs] of Object.entries(RECIPE_TAXONOMY)) {
      if ((subs as readonly string[]).includes(rawCat)) {
        resolvedCat = rawCat;
        resolvedMacro = mKey as MacroCategory;
        break;
      }
    }
  }

  if (!resolvedCat) {
    resolvedCat = validForMacro[0] || 'CAT_PRIMI_PIATTI';
  }

  const slot: SlotConsigliato = VALID_SLOTS.includes(parsed.recommended_slot || parsed.slot_consigliato)
    ? (parsed.recommended_slot || parsed.slot_consigliato)
    : 'pranzo_cena';

  const porzioni = typeof parsed.servings === 'number' && parsed.servings > 0
    ? parsed.servings
    : (typeof parsed.porzioni === 'number' && parsed.porzioni > 0 ? parsed.porzioni : 4);

  const tempoTot = parsed.times?.total_minutes || parsed.tempi?.tempo_totale_minuti || 30;

  // Sostituzioni per le varianti: incluse solo se nel formato {from, to} atteso
  const substitutions: { from: string; to: string }[] | undefined =
    Array.isArray(parsed.substitutions) && parsed.substitutions.every((s: any) => typeof s?.from === 'string' && typeof s?.to === 'string')
      ? parsed.substitutions.map((s: any) => ({ from: s.from, to: s.to }))
      : undefined;

  // Formato vecchio (sole stringhe): le quantità si ricavano dal testo mantenendo la sezione
  const legacyFlat: string[] = Array.isArray(parsed.ingredients || parsed.ingredienti) ? (parsed.ingredients || parsed.ingredienti) : [];
  const rawSections = parsed.ingredients_by_section || parsed.ingredienti_per_sezione;
  const legacySections = Array.isArray(rawSections) && rawSections.length > 0
    ? rawSections.map((s: any) => ({
        section: s.section || s.sezione || 'Principale',
        ingredients: s.ingredients || s.ingredienti || []
      }))
    : [{ section: 'Principale', ingredients: legacyFlat }];

  const sectionedDetailed = legacySections.flatMap((s: { section: string; ingredients: string[] }) =>
    s.ingredients.map((text: string) => ingredientItemFromText(text, s.section))
  );
  const fallbackDetailed = sectionedDetailed.length > 0
    ? sectionedDetailed
    : legacyFlat.map((t: string) => ingredientItemFromText(t));

  // Formato attuale: oggetti {section, amount, unit, name} con allineamento al catalogo
  const structured = parseStructuredIngredients(parsed.detailed_ingredients || parsed.ingredienti_dettagliati, catalogNames);

  const recipe: Recipe & { substitutions?: { from: string; to: string }[] } = {
    id: safeId,
    title: parsed.title || parsed.titolo || 'Nuova Ricetta',
    source: 'Personalizzata (AI)',
    url: sourceUrl || parsed.url || '',
    image: (parsed.image || (parsed.immagine && typeof parsed.immagine === 'string' && parsed.immagine.trim() && parsed.immagine !== 'null'))
      ? (parsed.image || parsed.immagine).trim()
      : '',
    category: resolvedCat,
    macro_category: resolvedMacro,
    subcategory: resolvedCat,
    difficulty: DIFFICULTY_FROM_MODEL.get(parsed.difficulty) || (parsed.difficolta === 'Difficile' ? 'hard' : parsed.difficolta === 'Media' ? 'medium' : 'easy'),
    servings: porzioni,
    servings_text: parsed.servings_text || parsed.porzioni_testo || `${porzioni} porzioni`,
    times: {
      total_minutes: tempoTot,
      prep_time: parsed.times?.prep_time || parsed.tempi?.tempo_preparazione || `${Math.round(tempoTot * 0.4)} minuti`,
      cook_time: parsed.times?.cook_time || parsed.tempi?.tempo_cottura || `${Math.round(tempoTot * 0.6)} minuti`,
      display_time: parsed.times?.display_time || parsed.tempi?.tempi_display || `Prep: ${Math.round(tempoTot * 0.4)} min, Cottura: ${Math.round(tempoTot * 0.6)} min`
    },
    ingredients: structured ? structured.flat : legacyFlat,
    ingredients_by_section: structured ? structured.bySection : legacySections,
    detailed_ingredients: structured
      ? structured.detailed
      : Array.isArray(parsed.detailed_ingredients || parsed.ingredienti_dettagliati) && (parsed.detailed_ingredients || parsed.ingredienti_dettagliati).length > 0
        ? (parsed.detailed_ingredients || parsed.ingredienti_dettagliati).map((i: any) => ({
            section: i.section || i.sezione || 'Principale',
            text: i.text || i.testo || '',
            amount: typeof i.amount !== 'undefined' ? i.amount : (typeof i.quantita !== 'undefined' ? i.quantita : null),
            unit: i.unit || i.unita || '',
            ingredient: i.ingredient || i.ingrediente || i.text || i.testo || ''
          }))
        : fallbackDetailed,
    instructions: Array.isArray(parsed.instructions || parsed.istruzioni) ? (parsed.instructions || parsed.istruzioni) : [],
    tips: Array.isArray(parsed.tips || parsed.suggerimenti) ? (parsed.tips || parsed.suggerimenti) : [],
    tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : [resolvedCat],
    recommended_slot: slot,
    food_groups: Array.isArray(parsed.food_groups || parsed.gruppi_alimentari) ? (parsed.food_groups || parsed.gruppi_alimentari) : ['verdura', 'cibi_proteici'],
    protein_group: parsed.protein_group || 'legumi_interi',
    carb_family: parsed.carb_family || 'pasta',
    veggie_color: parsed.veggie_color || 'green',
    seasons: parsed.seasons || ['inverno', 'primavera', 'estate', 'autunno'],
    is_complete_plate: typeof parsed.is_complete_plate === 'boolean' ? parsed.is_complete_plate : true,
    ...(RECIPE_DIETS.includes(parsed.diet) ? { diet: parsed.diet as RecipeDiet } : {}),
    ...(substitutions ? { substitutions } : {}),
  };

  return recipe;
}
