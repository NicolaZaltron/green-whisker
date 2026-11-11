export const SIMPLE_TAGS = ['PIATTO FREDDO', 'ZUPPA/MINESTRA', 'DA FORNO', 'PASTA', 'RISO', 'PASTA FRESCA', 'CARNE', 'PESCE', 'VEGETARIANO', 'VEGANO', 'VERDURA CONTORNO', 'FORMAGGIO', 'FUORI CASA', 'AVANZI', 'FRUTTA', 'VERDURA', 'SURGELATO'] as const;
export type SimpleTag = typeof SIMPLE_TAGS[number];

type TranslateFn = (key: string, opts?: { defaultValue?: string; count?: number }) => string;

/** Chiave i18n (sotto "tags") di un tag: minuscolo, spazi e barre diventano underscore. */
export function tagKey(tag: string): string {
  return tag.toLowerCase().replace(/[\s/]/g, '_');
}

/** Testo tradotto per un tag; il fallback è la prima lettera maiuscola. Il valore salvato resta invariato. */
export function formatTagLabel(tag: string, t: TranslateFn): string {
  return t(`tags.${tagKey(tag)}`, { defaultValue: tag.charAt(0).toUpperCase() + tag.slice(1).toLowerCase() });
}

/** Testo tradotto per un'unità (sotto "units"), al plurale in base a `count`; stringa vuota se non c'è unità. Il valore salvato resta invariato. */
export function unitLabel(unit: string, t: TranslateFn, count?: number): string {
  if (!unit) return '';
  return t(`units.${unit}`, { count: count ?? 1, defaultValue: unit });
}
