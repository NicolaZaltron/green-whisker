// Quantità della lista della spesa: arrotondamento a 25 g/ml e scelta dell'unità sul valore già arrotondato

// Quantità in g/ml -> kg/l (un decimale) quando raggiungono 1000. È l'unico punto in cui si divide.
export function toLargerUnit(amount: number, threshold: number): number {
  return amount >= threshold ? Math.round(amount / 100) / 10 : amount;
}

// Pesi: minimo 50 g, poi multipli di 25 g; l'unità si sceglie dal valore arrotondato
export function roundedWeightAmount(grams: number): { amount: number; unit: 'g' | 'kg' } {
  const rounded = grams < 50 ? 50 : Math.round(grams / 25) * 25;
  return {
    amount: toLargerUnit(rounded, 1000),
    unit: rounded >= 1000 ? 'kg' : 'g',
  };
}

// Volumi: multipli di 25 ml; l'unità si sceglie dal valore arrotondato
export function roundedVolumeAmount(ml: number): { amount: number; unit: 'ml' | 'l' } {
  const rounded = Math.round(ml / 25) * 25;
  return {
    amount: toLargerUnit(rounded, 1000),
    unit: rounded >= 1000 ? 'l' : 'ml',
  };
}
