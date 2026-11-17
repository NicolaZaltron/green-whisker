import { useSyncExternalStore } from 'react';
import { getCatalogVersion, subscribeCatalog } from '../services/recipeCatalog';

/** Changes on every catalog modification: whoever uses it re-renders with the updated data */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribeCatalog, getCatalogVersion);
}
