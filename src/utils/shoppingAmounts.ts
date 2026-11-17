// Shopping list quantities: rounding to 25 g/ml and unit choice on the already rounded value

// Quantities in g/ml -> kg/l (one decimal) when they reach 1000. It is the only place where division happens.
export function toLargerUnit(amount: number, threshold: number): number {
  return amount >= threshold ? Math.round(amount / 100) / 10 : amount;
}

// Weights: minimum 50 g, then multiples of 25 g; the unit is chosen from the rounded value
export function roundedWeightAmount(grams: number): { amount: number; unit: 'g' | 'kg' } {
  const rounded = grams < 50 ? 50 : Math.round(grams / 25) * 25;
  return {
    amount: toLargerUnit(rounded, 1000),
    unit: rounded >= 1000 ? 'kg' : 'g',
  };
}

// Volumes: multiples of 25 ml; the unit is chosen from the rounded value
export function roundedVolumeAmount(ml: number): { amount: number; unit: 'ml' | 'l' } {
  const rounded = Math.round(ml / 25) * 25;
  return {
    amount: toLargerUnit(rounded, 1000),
    unit: rounded >= 1000 ? 'l' : 'ml',
  };
}
