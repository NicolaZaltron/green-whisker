import { NUTRIENTS, type Nutrient } from '../types/catalog';

export type Nutrients = Partial<Record<Nutrient, number>>;

const NUTRIENT_SET = new Set<string>(NUTRIENTS);

// Keeps only the known nutrients with a finite number: anything else is dropped
export function normalizeNutrients(input: unknown): Nutrients {
  const out: Nutrients = {};
  if (!input || typeof input !== 'object') return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (NUTRIENT_SET.has(key) && typeof value === 'number' && Number.isFinite(value)) {
      out[key as Nutrient] = value;
    }
  }
  return out;
}
