import { Recipe } from '../types/recipe';
import { getCatalogRecipes, getKV, initCatalog, setKV, upsertCatalogRecipes } from '../db/database';
import { normalizeImported } from './catalogFormat';

// Ricalcolo una tantum di dieta e tag sulle ricette già presenti (le versioni precedenti non lo facevano)
const DIET_RULES_KEY = 'catalog_diet_rules_v3';
import { initializeSearchIndex } from './searchService';

// Stessi array per tutte le schermate: si aggiornano sul posto, quindi chi li ha importati vede i cambiamenti.
export const catalogRecipes: Recipe[] = []; // ricette originali: ricerca, planner, spesa, preferiti
export const catalogVariants: Recipe[] = []; // varianti: visibili solo nella scheda della ricetta

let version = 0;
const listeners = new Set<() => void>();

export function getCatalogVersion(): number {
  return version;
}

export function subscribeCatalog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setCatalog(all: Recipe[]): void {
  // Una variante senza originale nel catalogo viene mostrata come ricetta normale, finché l'originale non arriva
  const originalIds = new Set(all.filter(r => !r.variant_of).map(r => r.id));
  catalogRecipes.splice(0, catalogRecipes.length, ...all.filter(r => !r.variant_of || !originalIds.has(r.variant_of)));
  catalogVariants.splice(0, catalogVariants.length, ...all.filter(r => r.variant_of && originalIds.has(r.variant_of)));
  initializeSearchIndex(catalogRecipes);
  version++;
  listeners.forEach(listener => listener());
}

/** Carica il catalogo dal database (con la migrazione una tantum). Chiamare dopo initDatabase. */
export async function loadCatalog(): Promise<void> {
  await initCatalog();
  if ((await getKV(DIET_RULES_KEY)) !== '1') {
    const now = Date.now();
    await upsertCatalogRecipes((await getCatalogRecipes()).map(r => normalizeImported(r, now)), 'overwrite');
    await setKV(DIET_RULES_KEY, '1');
  }
  setCatalog(await getCatalogRecipes());
}

/** Da chiamare dopo ogni modifica al database: ricarica il catalogo condiviso */
export const refreshCatalog = loadCatalog;
