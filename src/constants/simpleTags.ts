export const SIMPLE_TAGS = ['PIATTO FREDDO', 'ZUPPA/MINESTRA', 'DA FORNO', 'PASTA', 'RISO', 'PASTA FRESCA', 'CARNE', 'PESCE', 'VEGETARIANO', 'VEGANO', 'VERDURA CONTORNO', 'FORMAGGIO', 'FUORI CASA', 'AVANZI', 'FRUTTA', 'VERDURA', 'SURGELATO'] as const;
export type SimpleTag = typeof SIMPLE_TAGS[number];

type TranslateFn = (key: string, opts?: { defaultValue?: string; count?: number }) => string;

/** i18n key (under "tags") of a tag: lowercase, spaces and slashes become underscores. */
export function tagKey(tag: string): string {
  return tag.toLowerCase().replace(/[\s/]/g, '_');
}

/** Translated text for a tag; the fallback is the capitalized first letter. The stored value stays unchanged. */
export function formatTagLabel(tag: string, t: TranslateFn): string {
  return t(`tags.${tagKey(tag)}`, { defaultValue: tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase() });
}

/** Translated text for a unit (under "units"), pluralized according to `count`; empty string if there is no unit. The stored value stays unchanged. */
export function unitLabel(unit: string, t: TranslateFn, count?: number): string {
  if (!unit) return '';
  return t(`units.${unit}`, { count: count ?? 1, defaultValue: unit });
}
