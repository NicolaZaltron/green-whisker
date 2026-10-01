import { Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Recipe, IngredientItem, ShoppingItem } from '../types/recipe';
import { SHOPPING_DEPARTMENTS, ShoppingDepartment } from '../constants/shoppingDepartments';
import { classifyShoppingDepartment } from './shoppingClassifier';
import { cleanShoppingIngredientText } from './servingsScaler';

/**
 * Formats a recipe into a clean, aesthetic plain-text message suitable for
 * Telegram, WhatsApp, SMS, or Clipboard.
 */
export function formatRecipeShareText(
  recipe: Recipe,
  scaledIngredients: IngredientItem[],
  servings: number,
  userNotes?: string
): string {
  const lines: string[] = [];

  // Header
  lines.push(`🌿 *${recipe.titolo.trim()}*`);

  const metaParts: string[] = [];
  if (servings) metaParts.push(`👥 ${servings} ${servings === 1 ? 'porzione' : 'porzioni'}`);
  if (recipe.tempi?.tempi_display) {
    metaParts.push(`⏱️ ${recipe.tempi.tempi_display}`);
  } else if (recipe.tempi?.tempo_totale_minuti) {
    metaParts.push(`⏱️ ${recipe.tempi.tempo_totale_minuti} min`);
  }
  if (recipe.difficolta) metaParts.push(`📊 Difficoltà: ${recipe.difficolta}`);

  if (metaParts.length > 0) {
    lines.push(metaParts.join(' • '));
  }
  lines.push('');

  // Ingredients Section
  lines.push(`🛒 *INGREDIENTI (${servings} ${servings === 1 ? 'porzione' : 'porzioni'}):*`);
  if (scaledIngredients && scaledIngredients.length > 0) {
    let currentSection = '';
    scaledIngredients.forEach(ing => {
      if (ing.sezione && ing.sezione !== 'Principale' && ing.sezione !== 'Ingredienti' && ing.sezione !== currentSection) {
        currentSection = ing.sezione;
        lines.push(`\n_${currentSection}:_`);
      }
      lines.push(`• ${ing.testo}`);
    });
  } else if (recipe.ingredienti && recipe.ingredienti.length > 0) {
    recipe.ingredienti.forEach(ing => {
      lines.push(`• ${ing}`);
    });
  }
  lines.push('');

  // Instructions / Steps Section
  if (recipe.istruzioni && recipe.istruzioni.length > 0) {
    lines.push('👩‍🍳 *PREPARAZIONE:*');
    recipe.istruzioni.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step.trim()}`);
    });
    lines.push('');
  }

  // Personal Notes (if present)
  if (userNotes && userNotes.trim().length > 0) {
    lines.push('📝 *NOTE PERSONALI:*');
    lines.push(userNotes.trim());
    lines.push('');
  }

  // Source & App Footer
  if (recipe.url) {
    lines.push(`🔗 Fonte ricetta: ${recipe.url}`);
  }
  lines.push('✨ Condiviso da Green-Whisker 🐾');

  return lines.join('\n');
}

/**
 * Share directly to Telegram
 * Works on Web, Desktop, iOS, and Android
 */
export async function shareToTelegram(text: string): Promise<boolean> {
  const url = `https://t.me/share/url?text=${encodeURIComponent(text)}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported || Platform.OS === 'web') {
      await Linking.openURL(url);
      return true;
    } else {
      await Linking.openURL(`https://telegram.me/share/url?text=${encodeURIComponent(text)}`);
      return true;
    }
  } catch (error) {
    console.error('Error sharing to Telegram:', error);
    return false;
  }
}

/**
 * Share directly to WhatsApp
 */
export async function shareToWhatsApp(text: string): Promise<boolean> {
  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported || Platform.OS === 'web') {
      await Linking.openURL(url);
      return true;
    } else {
      await Linking.openURL(url);
      return true;
    }
  } catch (error) {
    console.error('Error sharing to WhatsApp:', error);
    return false;
  }
}

/**
 * Native System Share sheet (iOS, Android, and supported browsers)
 */
export async function shareNative(title: string, text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && (navigator as any).share) {
      await (navigator as any).share({
        title,
        text,
      });
      return true;
    }

    const result = await Share.share({
      title,
      message: text,
    });

    return result.action !== Share.dismissedAction;
  } catch (error) {
    console.warn('Native share dismissed or not available:', error);
    return false;
  }
}

/**
 * Copy formatted text to clipboard
 */
export async function copyRecipeToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    await Clipboard.setStringAsync(text);
    return true;
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
}

/**
 * Formatta la lista della spesa raggruppata per reparti
 */
export function formatShoppingListShareText(items: ShoppingItem[]): string {
  if (!items || items.length === 0) return '🛒 La lista della spesa è vuota.';

  const lines: string[] = ['🛒 *LISTA DELLA SPESA GREEN-WHISKER*', ''];
  const map = new Map<ShoppingDepartment, ShoppingItem[]>();

  for (const dept of SHOPPING_DEPARTMENTS) {
    map.set(dept, []);
  }

  for (const item of items) {
    const dept = (SHOPPING_DEPARTMENTS.includes(item.category as any)
      ? item.category
      : classifyShoppingDepartment(item.name || item.ingredient_text)) as ShoppingDepartment;
    map.get(dept)?.push(item);
  }

  for (const dept of SHOPPING_DEPARTMENTS) {
    const list = map.get(dept) || [];
    if (list.length > 0) {
      lines.push(`📦 *${dept.toUpperCase()}*`);
      list.forEach(i => {
        const checkMark = i.checked ? '✔️ ' : '▫️ ';
        const text = cleanShoppingIngredientText(i.ingredient_text, i.name);
        lines.push(`${checkMark}${text}`);
      });
      lines.push('');
    }
  }

  lines.push('✨ Generata con Green-Whisker 🌿🐾');
  return lines.join('\n');
}

