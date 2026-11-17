// Units selectable in the shopping list: the user does not type free units
export const SHOPPING_UNITS = [
  'g', 'kg', 'ml', 'l',
  'cucchiaio', 'cucchiaino', 'pizzico', 'bicchiere',
  'pezzo', 'spicchio', 'fetta', 'foglia', 'rametto', 'mazzetto', 'ciuffo', 'costa', 'cubetto',
  'panetto', 'rotolo', 'bustina', 'confezione', 'vasetto', 'barattolo', 'goccia',
] as const;

// Valid unit or empty string (no unit) for values coming from ingredients or recipes
export function toSelectableUnit(unit: string | null | undefined): string {
  const value = (unit ?? '').trim().toLowerCase();
  return (SHOPPING_UNITS as readonly string[]).includes(value) ? value : '';
}
