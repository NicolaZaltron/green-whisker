// Comparison of the ingredient names produced by the AI with the Green-Whisker catalog names.
// Pure module (no imports): catalog names come from the caller.

export interface CatalogNameMatch {
  name: string;
  matched: boolean;
  // Id of the seed ingredient, when the name matches
  id?: string;
}

// Explicit synonyms: key = name produced by the AI, value = name in the catalog
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

// Units (singular and plural) to remove at the start of the name, after the quantity
const LEADING_UNIT = /^(?:g|gr|grammi|kg|ml|l|litri?|cucchi(?:aio|ai|aino|aini)|pizzic(?:o|hi)|bicchier[ei]|pezz[oi]|spicch[io]|fett[ae]|foglie?|rametti?|rametto|mazzett[oi]|ciuff[oi]|cost[ae]|coste|cubett[oi]|panett[oi]|rotol[oi]|bustin[ae]|confezion[ei]|vasett[oi]|barattol[oi]|gocc[ia]e?)\s+/;

// Canonical form: lowercase, no accents, no parentheses, quantity, unit or "q.b."
// Words of 3+ letters lose the final vowel (-a/-e/-i/-o equivalent)
export function normalizeIngredientName(raw: string): string {
  let s = (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/\([^)]*\)?/g, ' ');       // parentheses, even unclosed
  s = s.split(',')[0];                     // "Pollo, a dadini" -> "Pollo"
  s = s.replace(/\bq\.\s*b\b\.?/g, ' ');   // "q.b."
  s = s.replace(/\bd'\s*/g, 'di ');        // "d'oliva" -> "di oliva"
  s = s.replace(/[^a-z0-9\s]/g, ' ');      // residual score
  s = s.trim().replace(/^[\d\s\/-]+/, ''); // leading quantity
  s = s.replace(LEADING_UNIT, '');         // leading unit
  s = s.trim().replace(/^di\s+/, '');      // leftover "di" after quantity/unit
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map(w => (w.length > 2 ? w.replace(/[aeio]$/, '') : w))
    .join(' ');
}

const SYNONYM_KEYS = new Map<string, string>(
  Object.entries(SYNONYMS).map(([from, to]) => [normalizeIngredientName(from), normalizeIngredientName(to)])
);

function foundMatch(target: { name: string; id?: string }): CatalogNameMatch {
  return target.id ? { name: target.name, matched: true, id: target.id } : { name: target.name, matched: true };
}

// Returns the catalog name if the name matches (after normalization or synonym),
// otherwise the original name with matched false. The name is never discarded.
// If catalogEntries contains aliases, those are indexed too for matching.
export function matchCatalogName(
  name: string,
  catalogEntries: readonly { name: string; id?: string; aliases?: readonly string[] }[],
): CatalogNameMatch {
  const original = typeof name === 'string' ? name : '';
  const key = normalizeIngredientName(original);
  if (!key || catalogEntries.length === 0) {
    return { name: original, matched: false };
  }

  const index = new Map<string, { name: string; id?: string }>();
  for (const entry of catalogEntries) {
    const target = { name: entry.name, id: entry.id };
    const catalogKey = normalizeIngredientName(entry.name);
    if (catalogKey && !index.has(catalogKey)) {
      index.set(catalogKey, target);
    }
    // Also add the aliases to the index: normalize them like the catalog names
    if (Array.isArray(entry.aliases)) {
      for (const alias of entry.aliases) {
        const aliasKey = normalizeIngredientName(alias);
        if (aliasKey && !index.has(aliasKey)) {
          index.set(aliasKey, target);
        }
      }
    }
  }

  const direct = index.get(key);
  if (direct) return foundMatch(direct);

  const synonymKey = SYNONYM_KEYS.get(key);
  const viaSynonym = synonymKey ? index.get(synonymKey) : undefined;
  if (viaSynonym) return foundMatch(viaSynonym);

  return { name: original, matched: false };
}
