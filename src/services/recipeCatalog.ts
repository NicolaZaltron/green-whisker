import { Recipe } from '../types/recipe';
import { initializeSearchIndex } from './searchService';

// Metro restituisce lo stesso oggetto a ogni require del JSON: tutte le schermate che lo importano
// vedono questo array. Aggiornandone il contenuto sul posto, modifiche e ricette personali valgono
// ovunque senza ricaricare l'app.
export const catalogRecipes = require('../../assets/ricette.json') as Recipe[];

// Ricette così come sono nell'APK, prima di qualsiasi modifica
const bundledRecipes = [...catalogRecipes];

/**
 * Ricalcola il catalogo e l'indice di ricerca: le ricette salvate sul dispositivo sostituiscono
 * quelle del file con lo stesso id, le altre vengono aggiunte in fondo.
 */
export function syncRecipeCatalog(customRecipes: Recipe[]): void {
  const overrides = new Map(customRecipes.map(r => [r.id, r]));
  const bundledIds = new Set(bundledRecipes.map(r => r.id));
  const merged = [
    ...bundledRecipes.map(r => overrides.get(r.id) ?? r),
    ...customRecipes.filter(r => !bundledIds.has(r.id)),
  ];
  catalogRecipes.splice(0, catalogRecipes.length, ...merged);
  initializeSearchIndex(catalogRecipes);
}
