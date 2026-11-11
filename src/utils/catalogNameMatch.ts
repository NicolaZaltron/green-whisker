// Confronto dei nomi ingrediente prodotti dall'AI con i nomi del catalogo Green-Whisker.
// Modulo puro (nessun import): i nomi del catalogo arrivano dal chiamante.

export interface CatalogNameMatch {
  name: string;
  matched: boolean;
}

// Sinonimi espliciti: chiave = nome prodotto dall'AI, valore = nome nel catalogo
const SYNONYMS: Record<string, string> = {
  'Carne macinata di manzo': 'Manzo macinato',
  'Pomodori pelati': 'Pomodori pelati in scatola',
  'Lievito in polvere per dolci': 'Lievito per dolci',
  'Yogurt bianco magro': 'Yogurt bianco',
  'Ditaloni rigati': 'Ditalini rigati',
  'Gherigli di noci': 'Noci',
  'Biscotti vegani tipo savoiardi o pavesini': 'Pavesini',
  'Pollo grigliato o cotto in padella': 'Petto di pollo',
  'Avena': 'Fiocchi di avena',
};

// Unità (singolare e plurale) da rimuovere in testa al nome, dopo la quantità
const LEADING_UNIT = /^(?:g|gr|grammi|kg|ml|l|litri?|cucchi(?:aio|ai|aino|aini)|pizzic(?:o|hi)|bicchier[ei]|pezz[oi]|spicch[io]|fett[ae]|foglie?|rametti?|rametto|mazzett[oi]|ciuff[oi]|cost[ae]|coste|cubett[oi]|panett[oi]|rotol[oi]|bustin[ae]|confezion[ei]|vasett[oi]|barattol[oi]|gocc[ia]e?)\s+/;

// Forma canonica: minuscolo, senza accenti, senza parentesi, quantità, unità e "q.b."
// Le parole di 3+ lettere perdono la vocale finale (-a/-e/-i/-o equivalenti)
export function normalizeIngredientName(raw: string): string {
  let s = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/\([^)]*\)?/g, ' ');       // parentesi, anche non chiuse
  s = s.split(',')[0];                     // "Pollo, a dadini" -> "Pollo"
  s = s.replace(/\bq\.\s*b\b\.?/g, ' ');   // "q.b."
  s = s.replace(/\bd'\s*/g, 'di ');        // "d'oliva" -> "di oliva"
  s = s.replace(/[^a-z0-9\s]/g, ' ');      // punteggio residuo
  s = s.trim().replace(/^[\d\s\/-]+/, ''); // quantità iniziale
  s = s.replace(LEADING_UNIT, '');         // unità iniziale
  s = s.trim().replace(/^di\s+/, '');      // "di" residuo dopo quantità/unità
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.length > 2 ? w.replace(/[aeio]$/, '') : w))
    .join(' ');
}

const SYNONYM_KEYS = new Map<string, string>(
  Object.entries(SYNONYMS).map(([from, to]) => [normalizeIngredientName(from), normalizeIngredientName(to)])
);

// Restituisce il nome del catalogo se il nome corrisponde (dopo normalizzazione o sinonimo),
// altrimenti il nome originale con matched false. Il nome non viene mai scartato.
export function matchCatalogName(name: string, catalogNames: string[]): CatalogNameMatch {
  const original = typeof name === 'string' ? name : '';
  const key = normalizeIngredientName(original);
  if (!key || !Array.isArray(catalogNames) || catalogNames.length === 0) {
    return { name: original, matched: false };
  }

  const index = new Map<string, string>();
  for (const catalogName of catalogNames) {
    const catalogKey = normalizeIngredientName(catalogName);
    if (catalogKey && !index.has(catalogKey)) index.set(catalogKey, catalogName);
  }

  const direct = index.get(key);
  if (direct) return { name: direct, matched: true };

  const synonymKey = SYNONYM_KEYS.get(key);
  const viaSynonym = synonymKey ? index.get(synonymKey) : undefined;
  if (viaSynonym) return { name: viaSynonym, matched: true };

  return { name: original, matched: false };
}
