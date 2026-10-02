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

/**
 * Rimuove 'q.b.', 'quanto basta' e simili dai testi degli ingredienti per la lista della spesa,
 * restituendo il nome pulito dell'alimento (es. "Olio evo", "Sale fino", "Pepe").
 */
export function cleanShoppingIngredientText(text: string, fallbackName?: string): string {
  if (!text) return fallbackName || '';

  let cleaned = text;

  // Rimuovi parentesi e commenti
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, ' ');

  // Separa parole attaccate da scraping
  cleaned = cleaned.replace(/([a-z]{3,})([A-Z][a-z]+)/g, '$1 $2');
  cleaned = cleaned.replace(/([a-zA-Z]{3,})a\s+(pezzetti|cubetti|fette|fettine|spicchi)\b/gi, '$1 a $2');

  // Rimuove 'q.b.' / 'quanto basta'
  cleaned = cleaned.replace(/^(?:q\.?\s*b\.?|quanto basta)\s*(?:di\s+|d')?/i, '').trim();
  cleaned = cleaned.replace(/[,;\s]*\(?(?:q\.?\s*b\.?|quanto basta)\)?\s*$/i, '').trim();
  cleaned = cleaned.replace(/,\s*\(?(?:q\.?\s*b\.?|quanto basta)\)?/i, '').trim();

  // Rimuove prefissi rotti derivanti da vecchie regex ('no raso', 'no di', 'no ', 'o di', 'o ')
  cleaned = cleaned.replace(/^(?:no\s+raso\s*(?:di\s+|d')?|no\s+(?:di\s+|d')?|no\s+|o\s+(?:di\s+|d')?|o\s+)/i, '');

  // Rimuove espressioni di quantità o introduzione da ricetta tipo "abbondante di", "un filo di", "un goccio di"
  cleaned = cleaned.replace(/^(?:abbondante\s*(?:di\s+|d')?|generoso\s*(?:di\s+|d')?|un\s+filo\s*(?:di\s+|d')?|un\s+goccio\s*(?:di\s+|d')?|qualche\s+goccia\s*(?:di\s+|d')?|una\s+presa\s*(?:di\s+|d')?|un\s+pizzico\s*(?:di\s+|d')?)/i, '');

  // Rimuove unità da cucina residue
  const KITCHEN_REGEX = /^(?:(?:un|uno|una|mezzo|mezza|due|tre|\d+(?:[.,]\d+)?|\d+\/\d+)\s+)?(?:cucchiaini|cucchiaino|cucchiai|cucchiaio|pizzichi|pizzico|spicchi\s*o|spicchi|spicchio|foglioline|fogliolina|foglie|foglia|ciuffi|ciuffo|rametti|rametto|mazzetti|mazzetto|gambi|gambo|bustine|bustina|fili|filo|gocce|goccia|prese|presa|manciate|manciata|tazze|tazza|tazzine|tazzina|bicchieri|bicchiere|cubetti|cubetto)\s*(?:di|d'|del|della|dei|degli|delle|da)?\s*/i;
  cleaned = cleaned.replace(KITCHEN_REGEX, '');
  cleaned = cleaned.replace(/^(?:no\s+raso\s*(?:di\s+|d')?|no\s+(?:di\s+|d')?|no\s+|o\s+(?:di\s+|d')?|o\s+|abbondante\s*(?:di\s+|d')?|generoso\s*(?:di\s+|d')?|un\s+filo\s*(?:di\s+|d')?|un\s+goccio\s*(?:di\s+|d')?)/i, '');

  // Pulisci aggettivi di taglio
  cleaned = cleaned.replace(/\b(a cubetti|a fette|a pezzetti|a fettine|a spicchi|tritat[oaei]|sminuzzat[oaei]|grattugiat[oaei]|raso|colmo)\b/gi, ' ');
  cleaned = cleaned.replace(/[,;:\-\.]+/g, ' ').replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/^(?:di|d'|del|della|dei|degli|delle)\s+/i, '');

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned || fallbackName || text;
}

/**
 * Divide la dicitura di un ingrediente per la spesa in Nome (a sinistra) e Quantità (a destra).
 * Esempi:
 * - "260 g Carote" -> { displayName: "Carote", displayQuantity: "260 g" }
 * - "1 spicchio e 1/2 Aglio" -> { displayName: "Aglio", displayQuantity: "1 spicchio e ½" }
 * - "Barbabietola cotta", amount: 60, unit: "g" -> { displayName: "Barbabietola cotta", displayQuantity: "60 g" }
 * - "Olio EVO" -> { displayName: "Olio EVO", displayQuantity: "" }
 */
export function splitShoppingItemDisplay(
  ingredientText: string,
  fallbackName?: string,
  amount?: number | null,
  unit?: string
): { displayName: string; displayQuantity: string } {
  const cleanFallback = (fallbackName || '').trim();
  const rawText = cleanShoppingIngredientText(ingredientText, cleanFallback).trim();

  // Pattern esatto per le sole unità di misura reali (mai parole di cibo come burro, latte, olio)
  const unitPattern = '(?:g|gr|grammi|grammo|kg|chili|chilo|chilogrammi|ml|millilitri|cl|dl|l|litri|litro|tazzin[oaei]?|tazz[oaei]?|cucchiai[oaei]?|cucchiain[oaei]?|pizzic[oaei]?|spicchi[oaei]?|fogli[oaei]?|fogliolin[oaei]?|rotol[oaei]?|panett[oaei]?|confezion[oaei]?|barattol[oaei]?|vasett[oaei]?|scatolett[oaei]?|lattin[oaei]?|bustin[oaei]?|fett[oaei]?|ciuff[oaei]?|ramett[oaei]?)';

  // 1. Se abbiamo amount numerico valido
  if (amount !== null && amount !== undefined && amount > 0) {
    let qtyStr = '';
    if (amount === 0.5) {
      qtyStr = '½';
    } else if (amount === 0.25) {
      qtyStr = '¼';
    } else if (amount === 0.75) {
      qtyStr = '¾';
    } else if (amount === 1.5) {
      qtyStr = '1 e ½';
    } else if (amount % 1 === 0) {
      qtyStr = amount.toString();
    } else {
      qtyStr = amount.toFixed(1).replace('.0', '');
    }

    const unitStr = (unit || '').trim();
    let qtyFull = unitStr ? `${qtyStr} ${unitStr}` : qtyStr;
    if (unitStr === 'spicchio' && amount > 1) {
      qtyFull = amount === 1.5 ? '1 spicchio e ½' : `${qtyStr} spicchi`;
    }

    let nameToUse = cleanFallback;
    if (!nameToUse || nameToUse.toLowerCase() === rawText.toLowerCase()) {
      // Rimuovi SOLO numero e unità di misura reale all'inizio
      const stripRegex = new RegExp(`^(?:\\d+(?:[.,]\\d+)?|\\d+/\\d+|½|¼|¾)\\s*(?:${unitPattern}\\.?\\s*)?(?:di\\s+|d')?\\s*`, 'i');
      nameToUse = rawText.replace(stripRegex, '').trim();
    }

    if (!nameToUse) nameToUse = rawText;
    nameToUse = cleanShoppingIngredientText(nameToUse);
    return {
      displayName: nameToUse.charAt(0).toUpperCase() + nameToUse.slice(1),
      displayQuantity: qtyFull,
    };
  }

  // 2. Analizza eventuale quantità iniziale nel testo originale
  const leadingQtyRegex = new RegExp(`^((?:\\d+(?:[.,]\\d+)?|\\d+/\\d+|½|¼|¾)\\s*(?:${unitPattern}\\.?\\s*(?:e\\s+(?:½|1/2|\\d+)\\s*)?)?)\\s*(?:di\\s+|d')?\\s*(.+)$`, 'i');
  const match = (ingredientText || rawText).trim().match(leadingQtyRegex);
  if (match) {
    let qtyPart = match[1].trim();
    qtyPart = qtyPart.replace(/1\/2/g, '½').replace(/1\/4/g, '¼').replace(/3\/4/g, '¾');
    const namePart = cleanShoppingIngredientText(match[2].trim(), cleanFallback);
    return {
      displayName: namePart.charAt(0).toUpperCase() + namePart.slice(1),
      displayQuantity: qtyPart,
    };
  }

  // 3. Fallback: solo nome
  const finalName = cleanShoppingIngredientText(rawText || cleanFallback);
  return {
    displayName: finalName.charAt(0).toUpperCase() + finalName.slice(1),
    displayQuantity: '',
  };
}

