import { Linking, Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Recipe, IngredientItem, ShoppingItem } from '../types/recipe';
import { SHOPPING_DEPARTMENTS, ShoppingDepartment } from '../constants/shoppingDepartments';
import { classifyShoppingDepartment } from './shoppingClassifier';
import { cleanShoppingIngredientText } from './servingsScaler';
import i18n from '../i18n';

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
  lines.push(`🌿 *${recipe.title.trim()}*`);

  const metaParts: string[] = [];
  if (servings) metaParts.push(`👥 ${i18n.t('share.servings', { count: servings })}`);
  if (recipe.times?.display_time) {
    metaParts.push(`⏱️ ${recipe.times.display_time}`);
  } else if (recipe.times?.total_minutes) {
    metaParts.push(`⏱️ ${i18n.t('common.minutes', { count: recipe.times.total_minutes })}`);
  }
  if (recipe.difficulty) metaParts.push(`📊 ${i18n.t('share.difficulty')}: ${recipe.difficulty}`);

  if (metaParts.length > 0) {
    lines.push(metaParts.join(' • '));
  }
  lines.push('');

  // Ingredients Section
  lines.push(`🛒 *${i18n.t('share.ingredients')} (${i18n.t('share.servings', { count: servings })}):*`);
  if (scaledIngredients && scaledIngredients.length > 0) {
    let currentSection = '';
    scaledIngredients.forEach(ing => {
      const sec = (ing as any).section || (ing as any).sezione;
      if (sec && sec !== 'Principale' && sec !== 'Main' && sec !== 'Ingredienti' && sec !== currentSection) {
        currentSection = sec;
        lines.push(`\n_${currentSection}:_`);
      }
      lines.push(`• ${(ing as any).text || (ing as any).testo || ''}`);
    });
  } else if (recipe.ingredients && recipe.ingredients.length > 0) {
    recipe.ingredients.forEach(ing => {
      lines.push(`• ${ing}`);
    });
  }
  lines.push('');

  // Instructions / Steps Section
  if (recipe.instructions && recipe.instructions.length > 0) {
    lines.push(`👩‍🍳 *${i18n.t('share.preparation')}:*`);
    recipe.instructions.forEach((step, idx) => {
      lines.push(`${idx + 1}. ${step.trim()}`);
    });
    lines.push('');
  }

  // Personal Notes (if present)
  if (userNotes && userNotes.trim().length > 0) {
    lines.push(`📝 *${i18n.t('share.personalNotes')}:*`);
    lines.push(userNotes.trim());
    lines.push('');
  }

  // Source & App Footer
  if (recipe.url) {
    lines.push(`🔗 ${i18n.t('share.source')}: ${recipe.url}`);
  }
  lines.push(`✨ ${i18n.t('share.sharedBy')} 🐾`);

  return lines.join('\n');
}

/**
 * Share directly to the Telegram app via deep link.
 * Falls back to the native share sheet if the app cannot be opened.
 */
export async function shareToTelegram(text: string): Promise<boolean> {
  try {
    // Do not use Linking.canOpenURL here: on Android 11+ it returns false for
    // schemes not declared in the manifest queries, so open the link directly.
    await Linking.openURL(`tg://msg?text=${encodeURIComponent(text)}`);
    return true;
  } catch (error) {
    // Telegram is not installed: fall back to the system share sheet
    console.warn('Telegram app not available, falling back to share sheet:', error);
    return shareNative('Ricetta', text);
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
  if (!items || items.length === 0) return `🛒 ${i18n.t('share.emptyList')}`;

  const lines: string[] = [`🛒 *${i18n.t('share.listTitle')}*`, ''];
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
      list.sort((a, b) => {
        const textA = cleanShoppingIngredientText(a.ingredient_text, a.name);
        const textB = cleanShoppingIngredientText(b.ingredient_text, b.name);
        return textA.localeCompare(textB, 'it', { sensitivity: 'base' });
      });

      const deptTitle = i18n.t(`shoppingDepartments.${dept}`, { defaultValue: dept });
      lines.push(`📦 *${deptTitle.toUpperCase()}*`);
      list.forEach(i => {
        const checkMark = i.checked ? '✔️ ' : '▫️ ';
        const text = cleanShoppingIngredientText(i.ingredient_text, i.name);
        lines.push(`${checkMark}${text}`);
      });
      lines.push('');
    }
  }

  lines.push(`✨ ${i18n.t('share.generatedBy')} 🌿🐾`);
  return lines.join('\n');
}

