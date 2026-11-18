
// Fallback in-memory/localStorage store for Web if SQLite WASM is unavailable
export const WEB_STORAGE_KEYS = {
  FAVORITES: 'gw_favorites',
  SHOPPING: 'gw_shopping',
  PLANNER: 'gw_planner',
  NOTES: 'gw_notes',
  PLANNER_PREFS: 'gw_planner_prefs',
  PLANNER_LAST_GEN: 'gw_planner_last_gen',
  CATALOG: 'gw_catalog',
  INGREDIENTS: 'gw_ingredients',
  READY_MEALS: 'gw_ready_meals',
  RECIPE_INGREDIENTS: 'gw_recipe_ingredients',
};


// Fallback in-memory store if localStorage or SQLite is unavailable
export const memoryFallback = new Map<string, string>();

export function getWebData<T>(key: string, defaultValue: T): T {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(key);
      return saved ? JSON.parse(saved) : defaultValue;
    }
  } catch (e) {
    console.warn('Error reading from localStorage', e);
  }
  const mem = memoryFallback.get(key);
  return mem ? JSON.parse(mem) : defaultValue;
}

// Known limit (web only, used for debugging): localStorage has a quota of about 5 MB per origin.
// The catalog, ingredients and recipe-ingredient links (tens of thousands of rows with
// the full recipe book) may exceed it: in that case setItem fails and it falls back to volatile
// memory (memoryFallback), so data is lost on reload. On device SQLite is used.
export function setWebData<T>(key: string, value: T): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, JSON.stringify(value));
      return;
    }
  } catch (e) {
    console.warn('Error saving to localStorage', e);
  }
  memoryFallback.set(key, JSON.stringify(value));
}
