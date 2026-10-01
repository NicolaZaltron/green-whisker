import { cleanShoppingIngredientText } from './servingsScaler';

export interface AggregatableIngredient {
  name: string;
  amount: number | null;
  unit: string;
  ingredientText?: string;
  recipeId?: string;
  recipeTitle?: string;
  category?: string;
}

export interface ConsolidatedSupermarketItem {
  id: string;
  name: string;
  displayName: string;
  category: string;
  recipeTitle?: string;
  weightGrams: number | null;
  volumeMl: number | null;
  discreteCount: number | null;
  discreteUnit: string | null;
  hasKitchenUnitOnly: boolean;
}

const KITCHEN_UNITS = new Set([
  'cucchiaio',
  'cucchiai',
  'cucchiaino',
  'cucchiaini',
  'pizzico',
  'pizzichi',
  'filo',
  'goccia',
  'gocce',
  'spolverata',
  'q.b.',
  'qb',
  'quanto basta',
  'tazza',
  'tazze',
  'bicchiere',
  'bicchieri',
  'ciuffo',
  'ciuffi',
  'rametto',
  'rametti',
  'foglia',
  'foglie',
]);

const DISCRETE_UNITS: Record<string, { singular: string; plural: string }> = {
  rotolo: { singular: 'rotolo', plural: 'rotoli' },
  rotoli: { singular: 'rotolo', plural: 'rotoli' },
  confezione: { singular: 'confezione', plural: 'confezioni' },
  confezioni: { singular: 'confezione', plural: 'confezioni' },
  panetto: { singular: 'panetto', plural: 'panetti' },
  panetti: { singular: 'panetto', plural: 'panetti' },
  vasetto: { singular: 'vasetto', plural: 'vasetti' },
  vasetti: { singular: 'vasetto', plural: 'vasetti' },
  barattolo: { singular: 'barattolo', plural: 'barattoli' },
  barattoli: { singular: 'barattolo', plural: 'barattoli' },
  scatoletta: { singular: 'scatoletta', plural: 'scatolette' },
  scatolette: { singular: 'scatoletta', plural: 'scatolette' },
  lattina: { singular: 'lattina', plural: 'lattine' },
  lattine: { singular: 'lattina', plural: 'lattine' },
  bustina: { singular: 'bustina', plural: 'bustine' },
  bustine: { singular: 'bustina', plural: 'bustine' },
  fetta: { singular: 'fetta', plural: 'fette' },
  fette: { singular: 'fetta', plural: 'fette' },
  piadina: { singular: 'piadina', plural: 'piadine' },
  piadine: { singular: 'piadina', plural: 'piadine' },
  spicchio: { singular: 'spicchio', plural: 'spicchi' },
  spicchi: { singular: 'spicchio', plural: 'spicchi' },
};

const KITCHEN_MEASURE_REGEX = /^(?:(?:un|uno|una|mezzo|mezza|due|tre|\d+(?:[.,]\d+)?|\d+\/\d+)\s+)?(?:cucchiaini|cucchiaino|cucchiai|cucchiaio|pizzichi|pizzico|spicchi\s*o|spicchi|spicchio|foglioline|fogliolina|foglie|foglia|ciuffi|ciuffo|rametti|rametto|mazzetti|mazzetto|gambi|gambo|bustine|bustina|fili|filo|gocce|goccia|prese|presa|manciate|manciata|tazze|tazza|bicchieri|bicchiere|cubetti|cubetto|fette|fetta|rotoli|rotolo|panetti|panetto|vasetti|vasetto|barattoli|barattolo|scatolette|scatoletta|lattine|lattina)\s*(?:di|d'|del|della|dei|degli|delle|da)?\s*/i;

const WEIGHT_VOL_REGEX = /^(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s*(?:g|gr|grammi|kg|chili|chilo|ml|millilitri|l|litri)\s*(?:di\s+|d')?/i;

/**
 * Pulisce il nome dell'ingrediente per il supermercato, rimuovendo
 * frasi da blog, commenti tra parentesi, tagli, aggettivi di forma e cottura,
 * unità da cucina residue e duplicazioni singolare/plurale da web scraping.
 */
export function cleanSupermarketIngredientName(raw: string): string {
  if (!raw) return '';

  let name = raw;

  // 1. Rimuovi parentesi e commenti (es. "(buonissimo!)", "(facoltativo)", "(sgocciolato)")
  name = name.replace(/\s*\([^)]*\)/g, ' ');

  // 2. Separa parole CamelCase attaccate da scraping (es. MelanzanaMelanzane -> Melanzana Melanzane, aglioSpicchi -> aglio Spicchi)
  name = name.replace(/([a-z]{3,})([A-Z][a-z]+)/g, '$1 $2');

  // 3. Separa parole attaccate a 'a pezzetti' o 'a cubetti' (es. verdea pezzetti -> verde a pezzetti)
  name = name.replace(/([a-zA-Z]{3,})a\s+(pezzetti|cubetti|fette|fettine|spicchi)\b/gi, '$1 a $2');

  // 4. Rimuovi prefissi rotti derivanti da vecchie regex (es. 'no raso', 'no di', 'no ', 'o di', 'o ')
  name = name.replace(/^(?:no\s+raso\s*(?:di\s+|d')?|no\s+(?:di\s+|d')?|no\s+|o\s+(?:di\s+|d')?|o\s+)/i, '');

  // 5. Rimuovi pesi e volumi se inclusi nel nome (es. '50 g Basilico' -> 'Basilico')
  name = name.replace(WEIGHT_VOL_REGEX, '');

  // 6. Rimuovi unità da cucina all'inizio (es. 'Mezzo cucchiaino Timo' -> 'Timo', 'Foglie di basilico' -> 'Basilico')
  name = name.replace(KITCHEN_MEASURE_REGEX, '');

  // 7. Rimuovi numeri isolati all'inizio (es. '1 Melanzana' -> 'Melanzana')
  name = name.replace(/^(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s*(?:di\s+|d')?/i, '');

  // 8. Ricontrolla eventuali prefissi 'no ' o 'o ' scoperti dopo la rimozione dei numeri
  name = name.replace(/^(?:no\s+raso\s*(?:di\s+|d')?|no\s+(?:di\s+|d')?|no\s+|o\s+(?:di\s+|d')?|o\s+)/i, '');

  // 9. Taglia duplicazioni singolare/plurale da web scraping (es. 'Peperoncino verde ... Peperoncini verdi ...')
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    outer: for (let i = 0; i < words.length; i++) {
      const w1 = words[i].toLowerCase().replace(/[^a-z]/g, '');
      if (w1.length < 4) continue;
      const stem1 = w1.slice(0, w1.length - 1);
      for (let j = i + 1; j < words.length; j++) {
        const w2 = words[j].toLowerCase().replace(/[^a-z]/g, '');
        if (w2.startsWith(stem1)) {
          name = words.slice(0, j).join(' ');
          break outer;
        }
      }
    }
  }

  // 10. Rimuovi aggettivi di forma, lavorazione, tagli e formati di ricetta
  name = name.replace(
    /\b(rotonda|rettangolare|al naturale|da montare|da cucina|sgocciolat[oaei]|scolat[oaei]|lessat[oaei]|cott[oaei]|in barattolo|in scatola|in polvere|a cubetti|a fette|a pezzetti|a fettine|a spicchi|tritat[oaei]|sminuzzat[oaei]|grattugiat[oaei]|lavat[oaei]|pelat[oaei]|a piacere|facoltativo|opzionale|fresc[oaei]|secch[oaei]|ammollat[oaei]|buonissim[oaei]|raso|colmo|ben matur[oaei]|matur[oaei]|tagliat[oaei]|affettat[oaei]|sbucciat[oaei])\b/gi,
    ' '
  );

  // 10b. Rimuovi usi e scopi da ricetta (es. "per sfumare", "per la teglia", "per spennellare")
  name = name.replace(/\b(?:per\s+sfumare|per\s+spennellare|per\s+la\s+teglia|per\s+dorare|per\s+friggere|per\s+guarnire|per\s+decorare)\b/gi, ' ');

  // 10c. Rimuovi espressioni generiche (es. "qualche cucchiaio", "un po' di")
  name = name.replace(/\b(?:qualche\s+cucchiaio|qualche\s+cucchiaino|qualche\s+cucchiaiata|un\s+po'\s*di|un\s+pizzico\s*di)\b/gi, ' ');

  // 11. Rimuovi 'q.b.', 'quanto basta'
  name = name.replace(/\b(?:q\.?b\.?|quanto basta)\b/gi, ' ');

  // 12. Rimuovi opzioni secondarie dopo slash o "o al..." o "oppure:"
  name = name.replace(/\/(?:classico|normale|al\s+\w+|a\s+piacere|fresco).*/i, '');
  name = name.replace(/\s+o\s+(?:classico|normale|al\s+\w+|a\s+piacere|a\s+scelta).*/i, '');
  name = name.replace(/\s+oppure:.*/i, '');

  // 13. Rimuovi unità residue rimaste alla fine (es. 'Aglio Spicchi di' -> 'Aglio')
  name = name.replace(/\s+(?:spicchi|spicchio|cubetti|cubetto|fette|fetta|rotoli|rotolo)\s*(?:di|d')?$/i, '');

  // 14. Pulisci spazi multipli e punteggiatura
  name = name.replace(/[,;:\-\.]+/g, ' ').replace(/\s+/g, ' ').trim();
  name = name.replace(/^(?:di|d'|del|della|dei|degli|delle|mezzo|mezza|metà)\s+/i, '');

  if (name.length === 0) return raw;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Normalizza il nome dell'ingrediente per generare una chiave di raggruppamento
 * coerente che unisca alimenti identici con diciture leggermente diverse
 * (es. "Foglie di basilico" e "Basilico", "No raso Sale" e "Sale", "Olio EVO" e "Olio extravergine").
 */
export function normalizeIngredientKey(name: string): string {
  if (!name) return '';

  const cleaned = cleanSupermarketIngredientName(name);

  let norm = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  norm = norm.replace(/^(di|da|in|con|su|per|un|uno|una|del|della|dei|degli|delle)\s+/, '');
  norm = norm.replace(/\s+(a|in|al|allo|alla|ai|agli|alle)\s+/, ' ');

  // Erbe e spezie (devono fondersi perfettamente)
  if (/\b(basilico|foglie\s+di\s+basilico)\b/.test(norm)) return 'basilico';
  if (/\b(origano)\b/.test(norm)) return 'origano';
  if (/\b(timo)\b/.test(norm)) return 'timo';
  if (/\b(prezzemolo)\b/.test(norm)) return 'prezzemolo';
  if (/\b(alloro)\b/.test(norm)) return 'alloro';
  if (/\b(salvia)\b/.test(norm)) return 'salvia';
  if (/\b(rosmarino)\b/.test(norm)) return 'rosmarino';
  if (/\b(maggiorana)\b/.test(norm)) return 'maggiorana';
  if (/\b(peperoncino\s+verde|peperoncini\s+verdi)\b/.test(norm)) return 'peperoncino verde';
  if (/\b(peperoncino\s+in\s+polvere)\b/.test(norm)) return 'peperoncino in polvere';
  if (/\b(peperoncino|peperoncini)\b/.test(norm)) return 'peperoncino';
  if (/\b(sale\s+fino|sale\s+grosso|sale)\b/.test(norm)) return 'sale';
  if (/\b(pepe\s+nero|pepe\s+bianco|pepe)\b/.test(norm)) return 'pepe';
  if (/\b(cannella)\b/.test(norm)) return 'cannella';
  if (/\b(noce\s+moscata)\b/.test(norm)) return 'noce moscata';
  if (/\b(curcuma)\b/.test(norm)) return 'curcuma';
  if (/\b(zenzero)\b/.test(norm)) return 'zenzero';
  if (/\b(paprika|paprica)\b/.test(norm)) return 'paprika';
  if (/\b(cumino)\b/.test(norm)) return 'cumino';
  if (/\b(estratto\s+di\s+vaniglia|vaniglia|bacca\s+di\s+vaniglia)\b/.test(norm)) return 'estratto di vaniglia';

  // Semi e frutta secca
  if (/\b(semi\s+di\s+chia|chia)\b/.test(norm)) return 'semi di chia';
  if (/\b(semi\s+di\s+sesamo|sesamo)\b/.test(norm)) return 'semi di sesamo';
  if (/\b(semi\s+di\s+zucca)\b/.test(norm)) return 'semi di zucca';
  if (/\b(semi\s+di\s+girasole)\b/.test(norm)) return 'semi di girasole';
  if (/\b(pinoli)\b/.test(norm)) return 'pinoli';
  if (/\b(mandorle|mandorla)\b/.test(norm)) return 'mandorle';
  if (/\b(noci|noce)\b/.test(norm)) return 'noci';
  if (/\b(nocciole|nocciola)\b/.test(norm)) return 'nocciole';
  if (/\b(anacardi)\b/.test(norm)) return 'anacardi';

  // Dolcificanti e farine
  if (/\b(zucchero\s+di\s+canna)\b/.test(norm)) return 'zucchero di canna';
  if (/\b(zucchero\s+a\s+velo)\b/.test(norm)) return 'zucchero a velo';
  if (/\b(zucchero)\b/.test(norm)) return 'zucchero';
  if (/\b(sciroppo\s+d\s*acero)\b/.test(norm)) return 'sciroppo d acero';
  if (/\b(sciroppo\s+d\s*agave)\b/.test(norm)) return 'sciroppo d agave';
  if (/\b(farina\s+00|farina\s+0|farina\s+tipo\s+0|farina\s+di\s+grano)\b/.test(norm)) return 'farina 0';
  if (/\b(farina\s+integrale)\b/.test(norm)) return 'farina integrale';
  if (/\b(farina\s+di\s+ceci)\b/.test(norm)) return 'farina di ceci';
  if (/\b(farina\s+d\s*avena)\b/.test(norm)) return 'farina d avena';
  if (/\b(farina)\b/.test(norm)) return 'farina';
  if (/\b(amido\s+di\s+mais|maizena|fecola\s+di\s+patate)\b/.test(norm)) return 'amido di mais';
  if (/\b(lievito\s+alimentare)\b/.test(norm)) return 'lievito alimentare';
  if (/\b(lievito\s+per\s+dolci|lievito\s+istantaneo|cremor\s+tartaro)\b/.test(norm)) return 'lievito per dolci';
  if (/\b(lievito\s+di\s+birra)\b/.test(norm)) return 'lievito di birra';

  // Oli e condimenti
  if (/\b(olio\s+evo|olio\s+extravergine|olio\s+extra\s+vergine|olio\s+d\s*oliva)\b/.test(norm)) return 'olio extravergine d oliva';
  if (/\b(olio\s+di\s+semi|olio\s+di\s+girasole|olio\s+di\s+arachidi)\b/.test(norm)) return 'olio di semi';
  if (/\b(aceto\s+balsamico)\b/.test(norm)) return 'aceto balsamico';
  if (/\b(aceto\s+di\s+mele|aceto)\b/.test(norm)) return 'aceto';
  if (/\b(salsa\s+di\s+soia|tamari|shoyu)\b/.test(norm)) return 'salsa di soia';
  if (/\b(grattugiato\s+vegetale|formaggio\s+grattugiato|parmigiano\s+vegetale)\b/.test(norm)) return 'grattugiato vegetale';

  // Basi e prodotti freschi
  if (/\bpasta\s+sfoglia\b/.test(norm)) return 'pasta sfoglia';
  if (/\bpasta\s+bris[ee]\b/.test(norm)) return 'pasta brisee';
  if (/\b(yogurt\s+(?:di\s+)?soia|yogurt\s+vegetale|yogurt)\b/.test(norm)) return 'yogurt di soia';
  if (/\bpanna\s+(?:vegetale|di\s+soia)\b/.test(norm)) return 'panna vegetale';
  if (/\b(burro\s+vegetale|burro\s+di\s+soia|margarina)\b/.test(norm)) return 'burro vegetale';
  if (/\b(maionese\s+vegetale|maionese)\b/.test(norm)) return 'maionese vegetale';
  if (/\b(cioccolato\s+fondente|cioccolato)\b/.test(norm)) return 'cioccolato fondente';
  if (/\btofu\s+affumicato\b/.test(norm)) return 'tofu affumicato';
  if (/\btofu\s+vellutato\b/.test(norm)) return 'tofu vellutato';
  if (/\btofu\b/.test(norm)) return 'tofu';
  if (/\b(latte\s+di\s+soia|latte\s+d\s*avena|latte\s+di\s+mandorla|latte\s+vegetale)\b/.test(norm)) return 'latte vegetale';
  if (/\b(vino\s+bianco|vino\s+rosso|vino)\b/.test(norm)) return 'vino';
  if (/\b(pangrattato|pane\s+grattugiato)\b/.test(norm)) return 'pangrattato';
  if (/\b(tahina|tahine|tahini|tahin)\b/.test(norm)) return 'tahina';

  // Conserve e legumi
  if (/\b(pomodori\s+pelati|pelati|polpa\s+di\s+pomodoro|passata\s+di\s+pomodoro)\b/.test(norm)) return 'passata di pomodoro';
  if (/\b(pomodorini|pomodori\s+secchi|pomodorini\s+secchi|pomodori\s+ciliegino|pomodori\s+piccadilly)\b/.test(norm)) return 'pomodorini';
  if (/\b(pomodori|pomodoro)\b/.test(norm)) return 'pomodori';
  if (/\b(ceci\s+cotti|ceci\s+lessati|ceci\s+in\s+barattolo|ceci)\b/.test(norm)) return 'ceci';
  if (/\b(lenticchie\s+cotte|lenticchie\s+lessate|lenticchie\s+in\s+barattolo|lenticchie)\b/.test(norm)) return 'lenticchie';
  if (/\b(fagioli\s+cotti|fagioli\s+cannellini|cannellini|borlotti|fagioli\s+borlotti|fagioli\s+neri|fagioli)\b/.test(norm)) return 'fagioli';

  // Verdure
  if (/\b(cipolla\s+dorata|cipolla\s+bionda|cipolla\s+bianca|cipolla\s+rossa|cipollotto|cipollotti|cipolle|cipolla)\b/.test(norm)) return 'cipolla';
  if (/\b(spicchi\s+d\s*aglio|spicchio\s+d\s*aglio|aglio)\b/.test(norm)) return 'aglio';
  if (/\b(carote|carota)\b/.test(norm)) return 'carota';
  if (/\b(sedano|costa\s+di\s+sedano|gambo\s+di\s+sedano)\b/.test(norm)) return 'sedano';
  if (/\b(zucchine|zucchina)\b/.test(norm)) return 'zucchina';
  if (/\b(patate|patata)\b/.test(norm)) return 'patata';
  if (/\b(melanzane|melanzana)\b/.test(norm)) return 'melanzana';
  if (/\b(peperoni\s+rossi|peperone\s+rosso|peperoni\s+gialli|peperone\s+giallo|peperoni|peperone)\b/.test(norm)) return 'peperoni';
  if (/\b(funghi\s+champignon|champignon|funghi\s+pleurotus|funghi\s+porcini|funghi|fungo)\b/.test(norm)) return 'funghi';
  if (/\b(zucca\s+delica|zucca\s+butternut|zucca\s+mantovana|zucca)\b/.test(norm)) return 'zucca';
  if (/\b(banane|banana)\b/.test(norm)) return 'banana';
  if (/\b(mele|mela)\b/.test(norm)) return 'mela';
  if (/\b(limoni|limone|succo\s+di\s+limone|scorza\s+di\s+limone)\b/.test(norm)) return 'limone';

  // Fallback: stemming singolare/plurale italiano
  const words = norm.split(' ');
  const stemmedWords = words.map(w => {
    if (w.length <= 3) return w;
    let s = w;
    s = s.replace(/cchi[oaei]$/, 'cch').replace(/gghi[oaei]$/, 'ggh');
    if (s.endsWith('che') || s.endsWith('chi')) return s.slice(0, -3) + 'c';
    if (s.endsWith('ghe') || s.endsWith('ghi')) return s.slice(0, -3) + 'g';
    if (s.endsWith('ie') || s.endsWith('ii')) return s.slice(0, -2) + 'i';
    if (/[aeiou]$/.test(s)) return s.slice(0, -1);
    return s;
  });
  return stemmedWords.join(' ');
}

/**
 * Costruisce la dicitura da supermercato reale (es. "2 rotoli Pasta sfoglia", "250 g Yogurt di soia", "Olio EVO").
 */
export function formatSupermarketIngredientText(
  cleanName: string,
  discreteCount: number | null,
  discreteUnit: string | null,
  weightGrams: number | null,
  volumeMl: number | null,
  hasKitchenUnitOnly: boolean
): string {
  // 1. Se ha un conteggio discreto (rotoli, panetti, confezioni, limoni, cipolle)
  if (discreteCount !== null && discreteCount > 0) {
    // SEMPRE arrotondato per eccesso: non si comprano 1.3 rotoli o 0.3 rotoli!
    const count = Math.max(1, Math.ceil(discreteCount));

    if (discreteUnit && DISCRETE_UNITS[discreteUnit]) {
      const u = count === 1 ? DISCRETE_UNITS[discreteUnit].singular : DISCRETE_UNITS[discreteUnit].plural;
      return `${count} ${u} ${cleanName}`.trim();
    }
    // Senza unità specifica (es. 2 Limoni, 3 Cipolle)
    return `${count} ${cleanName}`.trim();
  }

  // 2. Se ha peso in grammi
  if (weightGrams !== null && weightGrams > 0) {
    if (weightGrams >= 1000) {
      const kg = (weightGrams / 1000).toFixed(1).replace(/\.0$/, '');
      return `${kg} kg ${cleanName}`.trim();
    }
    // Arrotonda ai 25g/50g più vicini per la spesa reale (minimo 50g)
    const roundedG = weightGrams < 50 ? 50 : Math.round(weightGrams / 25) * 25;
    return `${roundedG} g ${cleanName}`.trim();
  }

  // 3. Se ha volume in ml
  if (volumeMl !== null && volumeMl > 0) {
    if (volumeMl >= 1000) {
      const l = (volumeMl / 1000).toFixed(1).replace(/\.0$/, '');
      return `${l} L ${cleanName}`.trim();
    }
    const roundedMl = Math.round(volumeMl / 25) * 25;
    return `${roundedMl} ml ${cleanName}`.trim();
  }

  // 4. Se ha solo unità da cucina (cucchiai, cucchiaini, pizzichi, q.b.) o è condimento/spezia
  // Si scrive SOLO il nome del prodotto da comprare!
  return cleanName.trim();
}

/**
 * Converte e accumula quantità per un ingrediente nel supermercato.
 */
export function accumulateSupermarketItem(
  existing: ConsolidatedSupermarketItem,
  incomingAmount: number | null,
  rawUnit: string,
  recipeTitle?: string,
  rawText?: string
): void {
  let effectiveAmount = incomingAmount;
  let unitLower = (rawUnit || '').toLowerCase().trim();

  // Se l'importo è nullo o mancante ma il testo contiene dose e unità (es. '50 g Basilico', '250 ml Latte')
  if ((effectiveAmount === null || effectiveAmount === undefined) && rawText) {
    const match = rawText.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*(g|gr|grammi|kg|chili|chilo|ml|millilitri|l|litri|rotolo|rotoli|panetto|panetti|confezione|confezioni|barattolo|barattoli|vasetto|vasetti|scatoletta|scatolette|lattina|lattine|bustina|bustine|fetta|fette|spicchio|spicchi)?\b/i);
    if (match) {
      const numStr = match[1];
      if (numStr.includes('/')) {
        const [a, b] = numStr.split('/');
        effectiveAmount = parseFloat(a) / parseFloat(b);
      } else {
        effectiveAmount = parseFloat(numStr.replace(',', '.'));
      }
      if (match[2] && !unitLower) {
        unitLower = match[2].toLowerCase();
      }
    }
  }

  // 1. Unità da cucina (cucchiaio, cucchiaino, pizzico, q.b.) -> non aggiungere numeri confusi
  if (KITCHEN_UNITS.has(unitLower) || unitLower.includes('q.b') || unitLower.includes('quanto basta')) {
    // Se non ha ancora nessun peso o unità, resta contrassegnato come kitchen unit
    if (existing.weightGrams === null && existing.volumeMl === null && existing.discreteCount === null) {
      existing.hasKitchenUnitOnly = true;
    }
    if (recipeTitle) {
      existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    }
    return;
  }

  // 2. Unità discrete (rotolo, panetto, confezione, barattolo, vasetto, lattina, bustina)
  if (DISCRETE_UNITS[unitLower]) {
    existing.discreteUnit = DISCRETE_UNITS[unitLower].singular;
    const addCount = effectiveAmount ?? 1;
    existing.discreteCount = (existing.discreteCount ?? 0) + addCount;
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }

  // 3. Peso (g, kg)
  if (unitLower === 'g' || unitLower === 'gr' || unitLower === 'grammi' || unitLower === 'grammo') {
    existing.weightGrams = (existing.weightGrams ?? 0) + (effectiveAmount ?? 0);
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }
  if (unitLower === 'kg' || unitLower === 'chilo' || unitLower === 'chili' || unitLower === 'chilogrammi') {
    existing.weightGrams = (existing.weightGrams ?? 0) + (effectiveAmount ? effectiveAmount * 1000 : 1000);
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }

  // 4. Volume (ml, l)
  if (unitLower === 'ml' || unitLower === 'millilitri') {
    existing.volumeMl = (existing.volumeMl ?? 0) + (effectiveAmount ?? 0);
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }
  if (unitLower === 'l' || unitLower === 'litro' || unitLower === 'litri') {
    existing.volumeMl = (existing.volumeMl ?? 0) + (effectiveAmount ? effectiveAmount * 1000 : 1000);
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }

  // 5. Senza unità ma con numero (es. 2 limoni, 1 cipolla)
  if (!unitLower && effectiveAmount && effectiveAmount > 0) {
    existing.discreteCount = (existing.discreteCount ?? 0) + effectiveAmount;
    existing.hasKitchenUnitOnly = false;
    if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
    return;
  }

  // Altro fallback
  existing.hasKitchenUnitOnly = true;
  if (recipeTitle) existing.recipeTitle = mergeRecipeTitles(existing.recipeTitle, recipeTitle);
}

/**
 * Unisce i titoli delle ricette evitando duplicati
 */
export function mergeRecipeTitles(title1?: string, title2?: string): string {
  const set = new Set<string>();
  if (title1) {
    title1.split(/,\s*/).forEach(t => {
      const clean = t.trim();
      if (clean) set.add(clean);
    });
  }
  if (title2) {
    title2.split(/,\s*/).forEach(t => {
      const clean = t.trim();
      if (clean) set.add(clean);
    });
  }
  return Array.from(set).join(', ');
}
