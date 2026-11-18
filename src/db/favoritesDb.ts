import { getDatabase, isWebMode, runWrite } from './connection';
import { WEB_STORAGE_KEYS, getWebData, setWebData } from './webStorage';

// --- FAVORITES ---
export async function getFavoriteIds(): Promise<string[]> {
  if (isWebMode()) {
    return getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
  }

  try {
    const rows = await getDatabase().getAllAsync('SELECT recipe_id FROM favorite ORDER BY created_at DESC');
    return rows.map((r: any) => r.recipe_id);
  } catch (e) {
    console.error('getFavoriteIds error', e);
    return [];
  }
}

export async function isFavorite(recipeId: string): Promise<boolean> {
  if (isWebMode()) {
    const favs = getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
    return favs.includes(recipeId);
  }

  try {
    const row = await getDatabase().getFirstAsync('SELECT recipe_id FROM favorite WHERE recipe_id = ?', [recipeId]);
    return !!row;
  } catch (e) {
    console.error('isFavorite error', e);
    return false;
  }
}

export async function toggleFavorite(recipeId: string): Promise<boolean> {
  const currentlyFav = await isFavorite(recipeId);

  if (isWebMode()) {
    let favs = getWebData<string[]>(WEB_STORAGE_KEYS.FAVORITES, []);
    if (currentlyFav) {
      favs = favs.filter(id => id !== recipeId);
    } else {
      favs = [recipeId, ...favs];
    }
    setWebData(WEB_STORAGE_KEYS.FAVORITES, favs);
    return !currentlyFav;
  }

  try {
    if (currentlyFav) {
      await runWrite(() => getDatabase().runAsync('DELETE FROM favorite WHERE recipe_id = ?', [recipeId]));
      return false;
    } else {
      await runWrite(() => getDatabase().runAsync('INSERT INTO favorite (recipe_id, created_at) VALUES (?, ?)', [recipeId, Date.now()]));
      return true;
    }
  } catch (e) {
    console.error('toggleFavorite error', e);
    return currentlyFav;
  }
}


// --- RECIPE NOTES ---
export async function getRecipeNote(recipeId: string): Promise<string> {
  if (isWebMode()) {
    const notesMap = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    return notesMap[recipeId] || '';
  }

  try {
    const row = await getDatabase().getFirstAsync('SELECT notes FROM recipe_note WHERE recipe_id = ?', [recipeId]);
    return row ? (row as any).notes : '';
  } catch (e) {
    console.error('getRecipeNote error', e);
    return '';
  }
}

export async function saveRecipeNote(recipeId: string, notes: string): Promise<void> {
  const trimmed = notes.trim();

  if (isWebMode()) {
    const notesMap = getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
    if (!trimmed) {
      delete notesMap[recipeId];
    } else {
      notesMap[recipeId] = trimmed;
    }
    setWebData(WEB_STORAGE_KEYS.NOTES, notesMap);
    return;
  }

  try {
    if (!trimmed) {
      await runWrite(() => getDatabase().runAsync('DELETE FROM recipe_note WHERE recipe_id = ?', [recipeId]));
    } else {
      await runWrite(() => getDatabase().runAsync(`
        INSERT INTO recipe_note (recipe_id, notes, updated_at) 
        VALUES (?, ?, ?)
        ON CONFLICT(recipe_id) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
      `, [recipeId, trimmed, Date.now()]));
    }
  } catch (e) {
    console.error('saveRecipeNote error', e);
  }
}

export async function getAllRecipeNotes(): Promise<Record<string, string>> {
  if (isWebMode()) {
    return getWebData<Record<string, string>>(WEB_STORAGE_KEYS.NOTES, {});
  }

  try {
    const rows = await getDatabase().getAllAsync('SELECT recipe_id, notes FROM recipe_note');
    const result: Record<string, string> = {};
    for (const r of rows as any[]) {
      result[r.recipe_id] = r.notes;
    }
    return result;
  } catch (e) {
    console.error('getAllRecipeNotes error', e);
    return {};
  }
}
