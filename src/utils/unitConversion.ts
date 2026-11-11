// Conversione unità per ingredienti: porta peso e volume a un'unità base (g / ml).
// Funzione pura, senza dipendenze React/Expo.
import { normalizeIngredientKey } from './ingredientAggregator';
import { densityFor, PINCH_GRAMS } from './ingredientDensity';

export type UnitFamily = 'weight' | 'volume' | 'none';

// Plurali e varianti -> forma singolare/base. Le unità "a conteggio" (foglia, fetta, spicchio, ...)
// restano separate: NON si convertono in g/ml e si confrontano solo con la stessa unità.
const ALIASES: Record<string, string> = {
  grammi: 'g', gr: 'g', gramo: 'g', grammo: 'g',
  chilogrammi: 'kg', chilogrammo: 'kg', kilogrammi: 'kg', kg: 'kg',
  millilitri: 'ml', millilitro: 'ml', ml: 'ml',
  litri: 'l', litro: 'l', lt: 'l', l: 'l',
  cucchiai: 'cucchiaio', cucchiaio: 'cucchiaio',
  cucchiaini: 'cucchiaino', cucchiaino: 'cucchiaino',
  bicchieri: 'bicchiere', bicchiere: 'bicchiere',
  pizzichi: 'pizzico', pizzico: 'pizzico',
  spicchi: 'spicchio', panetti: 'panetto', fette: 'fetta', rametti: 'rametto',
  foglie: 'foglia', rotoli: 'rotolo', vasetti: 'vasetto', barattoli: 'barattolo',
  bustine: 'bustina', gocce: 'goccia', coste: 'costa', pezzi: 'pezzo',
  mazzetti: 'mazzetto', ciuffi: 'ciuffo', confezioni: 'confezione',
};

export function normalizeUnit(unit: string): string {
  const u = (unit || '').trim().toLowerCase().replace(/\.$/, '').trim();
  return ALIASES[u] || u;
}

const DEFAULT_DENSITY_G_PER_ML = 1;

const WEIGHT_TO_G: Record<string, number> = { g: 1, kg: 1000 };
// bicchiere = 200 ml: ASSUNZIONE (un bicchiere standard), la dimensione reale varia.
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, cucchiaio: 15, cucchiaino: 5, bicchiere: 200 };

// normalizeIngredientKey('acqua') produce una chiave stemmata ('acqu'): confronto su entrambe le forme.
const WATER_KEY = normalizeIngredientKey('acqua');
function isWaterKey(k: string): boolean {
  return k === 'acqua' || k === WATER_KEY || normalizeIngredientKey(k) === WATER_KEY;
}

export function toBase(
  amount: number,
  unit: string,
  ingredientKey: string
): { amount: number; unit: 'g' | 'ml' | string; family: UnitFamily } {
  const u = normalizeUnit(unit);
  const isWater = isWaterKey(ingredientKey);
  if (u === 'pizzico') return { amount: amount * PINCH_GRAMS, unit: 'g', family: 'weight' };
  // Senza densità nota si assume 1 g = 1 ml: così peso e volume dello stesso ingrediente si sommano
  const density = isWater ? null : (densityFor(ingredientKey) ?? DEFAULT_DENSITY_G_PER_ML);
  if (density !== null && (u in VOLUME_TO_ML)) {
    // Ingrediente con densità nota: volume -> grammi, così si somma con il peso
    return { amount: amount * VOLUME_TO_ML[u] * density, unit: 'g', family: 'weight' };
  }
  if (u in WEIGHT_TO_G) {
    const grams = amount * WEIGHT_TO_G[u];
    // Regola acqua: 1 g = 1 ml, quindi il peso diventa volume
    if (isWater) return { amount: grams, unit: 'ml', family: 'volume' };
    return { amount: grams, unit: 'g', family: 'weight' };
  }
  if (u in VOLUME_TO_ML) {
    return { amount: amount * VOLUME_TO_ML[u], unit: 'ml', family: 'volume' };
  }
  return { amount, unit, family: 'none' };
}

export function sameFamilyKey(ingredientKey: string, unit: string): string {
  const b = toBase(1, unit, ingredientKey);
  if (b.family === 'none') return `${ingredientKey}|${normalizeUnit(unit)}`;
  return `${ingredientKey}|${b.unit}`;
}
