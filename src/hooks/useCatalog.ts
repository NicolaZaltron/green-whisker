import { useSyncExternalStore } from 'react';
import { getCatalogVersion, subscribeCatalog } from '../services/recipeCatalog';

/** Cambia a ogni modifica del catalogo: chi lo usa si ridisegna con i dati aggiornati */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribeCatalog, getCatalogVersion);
}
