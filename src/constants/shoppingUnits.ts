// Unità selezionabili nella lista della spesa: l'utente non digita unità libere
export const SHOPPING_UNITS = [
  'g', 'kg', 'ml', 'l',
  'cucchiaio', 'cucchiaino', 'pizzico', 'bicchiere',
  'pezzo', 'spicchio', 'fetta', 'foglia', 'rametto', 'mazzetto', 'ciuffo', 'costa', 'cubetto',
  'panetto', 'rotolo', 'bustina', 'confezione', 'vasetto', 'barattolo', 'goccia',
] as const;

// Unità valida o stringa vuota (nessuna unità) per valori provenienti da ingredienti o ricette
export function toSelectableUnit(unit: string | null | undefined): string {
  const value = (unit ?? '').trim().toLowerCase();
  return (SHOPPING_UNITS as readonly string[]).includes(value) ? value : '';
}
