import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getFavoriteIds, toggleFavorite as dbToggleFavorite } from '../db/database';

interface FavoritesContextType {
  favoriteIds: Set<string>;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => Promise<boolean>;
  refreshFavorites: () => Promise<void>;
}

const FavoritesContext = createContext<FavoritesContextType | null>(null);

// Stessi id (stessa dimensione e ogni id presente): evita di ridisegnare tutti i consumer
function sameIds(prev: Set<string>, ids: string[]): boolean {
  const next = new Set(ids);
  if (next.size !== prev.size) return false;
  for (const id of next) {
    if (!prev.has(id)) return false;
  }
  return true;
}

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // Load favorite IDs from SQLite into memory once
  const refreshFavorites = useCallback(async () => {
    try {
      const ids = await getFavoriteIds();
      // Se il contenuto è uguale tiene il Set precedente: nessun nuovo render
      setFavoriteIds(prev => (sameIds(prev, ids) ? prev : new Set(ids)));
    } catch (e) {
      console.error('Failed to load favorites from database:', e);
    }
  }, []);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  // Synchronous O(1) favorite lookup
  const isFavorite = useCallback(
    (id: string) => favoriteIds.has(id),
    [favoriteIds]
  );

  // Optimistic toggle for instantaneous UI response
  const toggleFavorite = useCallback(
    async (id: string) => {
      let isFav = false;
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
          isFav = false;
        } else {
          next.add(id);
          isFav = true;
        }
        return next;
      });

      try {
        const result = await dbToggleFavorite(id);
        return result;
      } catch (e) {
        console.error('Failed to toggle favorite in database, rolling back:', e);
        await refreshFavorites();
        return isFav;
      }
    },
    [refreshFavorites]
  );

  const value = useMemo(
    () => ({
      favoriteIds,
      isFavorite,
      toggleFavorite,
      refreshFavorites,
    }),
    [favoriteIds, isFavorite, toggleFavorite, refreshFavorites]
  );

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};

export function useFavorites(): FavoritesContextType {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}

// Safe hook that does not throw if context is temporarily unavailable
export function useFavoritesSafe(): FavoritesContextType | null {
  return useContext(FavoritesContext);
}
