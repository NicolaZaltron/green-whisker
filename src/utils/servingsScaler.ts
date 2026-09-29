export interface ScaledIngredientResult {
  formattedText: string;
  scaledAmount: number | null;
  unit: string;
  name: string;
}

const UNIT_PLURALS: Record<string, { singular: string; plural: string }> = {
  rotolo: { singular: 'rotolo', plural: 'rotoli' },
  rotoli: { singular: 'rotolo', plural: 'rotoli' },
  cucchiaio: { singular: 'cucchiaio', plural: 'cucchiai' },
  cucchiai: { singular: 'cucchiaio', plural: 'cucchiai' },
  cucchiaino: { singular: 'cucchiaino', plural: 'cucchiaini' },
  cucchiaini: { singular: 'cucchiaino', plural: 'cucchiaini' },
  spicchio: { singular: 'spicchio', plural: 'spicchi' },
  spicchi: { singular: 'spicchio', plural: 'spicchi' },
  vasetto: { singular: 'vasetto', plural: 'vasetti' },
  vasetti: { singular: 'vasetto', plural: 'vasetti' },
  fetta: { singular: 'fetta', plural: 'fette' },
  fette: { singular: 'fetta', plural: 'fette' },
  bicchiere: { singular: 'bicchiere', plural: 'bicchieri' },
  bicchieri: { singular: 'bicchiere', plural: 'bicchieri' },
  bustina: { singular: 'bustina', plural: 'bustine' },
  bustine: { singular: 'bustina', plural: 'bustine' },
  pizzico: { singular: 'pizzico', plural: 'pizzichi' },
  pizzichi: { singular: 'pizzico', plural: 'pizzichi' },
  mazzetto: { singular: 'mazzetto', plural: 'mazzetti' },
  mazzetti: { singular: 'mazzetto', plural: 'mazzetti' },
  ciuffo: { singular: 'ciuffo', plural: 'ciuffi' },
  ciuffi: { singular: 'ciuffo', plural: 'ciuffi' },
  foglia: { singular: 'foglia', plural: 'foglie' },
  foglie: { singular: 'foglia', plural: 'foglie' },
  scatoletta: { singular: 'scatoletta', plural: 'scatolette' },
  scatolette: { singular: 'scatoletta', plural: 'scatolette' },
  panetto: { singular: 'panetto', plural: 'panetti' },
  panetti: { singular: 'panetto', plural: 'panetti' },
  bustina_lievito: { singular: 'bustina', plural: 'bustine' }
};

/**
 * Scala una dose di ingrediente in base al fattore di scala
 */
export function scaleIngredient(
  amount: number | null | undefined,
  unit: string | undefined,
  ingredientName: string,
  rawText: string,
  scale: number
): ScaledIngredientResult {
  const cleanName = ingredientName || rawText;

  if (amount === null || amount === undefined || isNaN(amount) || amount <= 0) {
    return {
      formattedText: rawText,
      scaledAmount: null,
      unit: unit || '',
      name: cleanName
    };
  }

  // Se la scala è esattamente 1, mantieni l'originale
  if (scale === 1) {
    return {
      formattedText: rawText,
      scaledAmount: amount,
      unit: unit || '',
      name: cleanName
    };
  }

  const rawScaled = amount * scale;

  // Arrotondamento naturale per la cucina:
  // - Per grammi/ml >= 20g, arrotonda al numero intero più vicino (es. 150g * 1.5 = 225g)
  // - Per valori tra 5 e 20, consenti mezzi (es. 7.5)
  // - Per valori piccoli (< 5), consenti un decimale o frazioni (es. 1/2, 1/4)
  let scaledQty: number;
  if (rawScaled >= 20) {
    scaledQty = Math.round(rawScaled);
  } else if (rawScaled >= 5) {
    scaledQty = Math.round(rawScaled * 2) / 2;
  } else {
    scaledQty = Math.round(rawScaled * 10) / 10;
  }

  // Format unit con plurale/singolare intelligente
  let formattedUnit = (unit || '').trim();
  const lowerUnit = formattedUnit.toLowerCase();
  if (UNIT_PLURALS[lowerUnit]) {
    formattedUnit = scaledQty === 1 ? UNIT_PLURALS[lowerUnit].singular : UNIT_PLURALS[lowerUnit].plural;
  }

  // Rappresentazione testuale elegante (frazioni culinarie per valori comuni)
  let qtyStr: string;
  if (scaledQty === 0.5) {
    qtyStr = '1/2';
  } else if (scaledQty === 0.25) {
    qtyStr = '1/4';
  } else if (scaledQty === 0.75) {
    qtyStr = '3/4';
  } else if (scaledQty % 1 === 0) {
    qtyStr = scaledQty.toString();
  } else {
    qtyStr = scaledQty.toFixed(1).replace('.0', '');
  }

  const formattedText = formattedUnit
    ? `${qtyStr} ${formattedUnit} ${cleanName}`.trim()
    : `${qtyStr} ${cleanName}`.trim();

  return {
    formattedText,
    scaledAmount: scaledQty,
    unit: formattedUnit,
    name: cleanName
  };
}
