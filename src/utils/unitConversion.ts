// Unit conversion for ingredients: brings weight and volume to a base unit (g / ml).
// Pure function, without React/Expo dependencies.
import { normalizeIngredientKey } from './ingredientAggregator';
import { densityFor, PINCH_GRAMS } from './ingredientDensity';

export type UnitFamily = 'weight' | 'volume' | 'none';

// Plurals and variants -> singular/base form. "Count" units (leaf, slice, clove, ...)
// stay separate: they are NOT converted to g/ml and are compared only with the same unit.
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
// glass = 200 ml: ASSUMPTION (a standard glass), the real size varies.
const VOLUME_TO_ML: Record<string, number> = { ml: 1, l: 1000, cucchiaio: 15, cucchiaino: 5, bicchiere: 200 };

// normalizeIngredientKey('acqua') produces a stemmed key ('acqu'): comparison on both forms.
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
  // Without a known density 1 g = 1 ml is assumed: so weight and volume of the same ingredient add up
  const density = isWater ? null : (densityFor(ingredientKey) ?? DEFAULT_DENSITY_G_PER_ML);
  if (density !== null && (u in VOLUME_TO_ML)) {
    // Ingredient with known density: volume -> grams, so it adds up with the weight
    return { amount: amount * VOLUME_TO_ML[u] * density, unit: 'g', family: 'weight' };
  }
  if (u in WEIGHT_TO_G) {
    const grams = amount * WEIGHT_TO_G[u];
    // Water rule: 1 g = 1 ml, so weight becomes volume
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
