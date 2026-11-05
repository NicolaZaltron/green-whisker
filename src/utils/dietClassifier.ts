import { Recipe, RecipeDiet } from '../types/recipe';

// Classificazione della dieta dagli ingredienti. Funzione pura: usata dall'import e dallo script di report.

// Carne e pesce: rendono la ricetta onnivora
const MEAT_AND_FISH = [
  'pollo', 'manzo', 'maiale', 'vitello', 'tacchino', 'agnello', 'coniglio', 'anatra', 'oca', 'faraona',
  'prosciutto', 'salame', 'speck', 'pancetta', 'bacon', 'wurstel', 'würstel', 'salsiccia', 'carne',
  'fegato', 'mortadella', 'bresaola', 'guanciale', 'lardo', 'cotechino', 'hamburger', 'cacciagione',
  'tonno', 'salmone', 'pesce', 'acciuga', 'acciughe', 'alici', 'merluzzo', 'baccalà', 'gambero', 'gamberi',
  'gamberetti', 'calamari', 'calamaro', 'polpo', 'seppia', 'seppie', 'cozze', 'cozza', 'vongole', 'vongola',
  'sgombro', 'sardine', 'sardina', 'surimi', 'pesce spada', 'orata', 'branzino', 'spigola', 'trota', 'anguilla',
];

// Uova e latticini: rendono la ricetta vegetariana
const EGGS_AND_DAIRY = [
  'uova', 'uovo', 'albume', 'albumi', 'tuorlo', 'tuorli',
  'latte', 'burro', 'formaggio', 'parmigiano', 'grana', 'mozzarella', 'ricotta', 'panna', 'yogurt',
  'mascarpone', 'feta', 'pecorino', 'gorgonzola', 'philadelphia', 'latticini', 'ghee', 'besciamella',
  'stracchino', 'taleggio', 'provolone', 'scamorza', 'caciotta', 'emmental', 'gouda', 'brie',
];

// Miele: non è vegano, ma è accettato dai vegetariani
const HONEY = ['miele'];

// Frasi in cui una parola animale indica in realtà un prodotto vegetale: vanno tolte prima del controllo
const VEGETAL_EXCEPTIONS: RegExp[] = [
  /\b(?:pollo|manzo|tonno|salmone|hamburger|wurstel|würstel|salsiccia|prosciutto|bacon|carne|formaggio|latte|burro|yogurt|mozzarella|ricotta|panna|parmigiano|gamberi|pesce|uova|uovo)\s+(?:vegetal[ei]|vegan[oi]|di\s+soia|di\s+seitan|di\s+tofu|di\s+tempeh|di\s+lenticchie|di\s+ceci)\b/gi,
  // Singolare e plurale: "ricotta di mandorla", "latte di mandorle"
  /\b(?:latte|yogurt|burro|formaggio|panna|mozzarella|ricotta|besciamella)\s+(?:di\s+(?:mandorl[ae]|soi[ae]|aven[ae]|ris[oi]|cocc[oi]|nocciol[ae]|anacard[io]|arachid[ei]|cacao|karit[eè]|pistacch[io]|noci|sesamo|canapa|farro|kamut|cereali|tofu|ceci|lenticchie)|vegetal[ei]|vegan[oi])\b/gi,
  // Prodotti vegetali chiamati con il nome animale: "tuorlo Veg", "burro Veg", "uova vegetali"
  /\b(?:uova?|tuorl[oi]|albumi?|burro|latte|formaggio|panna|yogurt)\s+veg\w*/gi,
  /\bsenza\s+(?:uova|uovo|latte|burro|formaggio|miele|carne|pesce)\b/gi,
  /\bsostitut[oi]\s+(?:delle?\s+)?(?:uova|uovo|latte|burro|formaggio)\b/gi,
];

function ingredientsText(recipe: Recipe): string {
  const lines = [
    ...(recipe.ingredients ?? []),
    ...(recipe.detailed_ingredients ?? []).map(i => `${i.text ?? ''} ${i.ingredient ?? ''}`),
  ];
  return lines.join('\n').toLowerCase();
}

function findTerms(text: string, terms: string[]): string[] {
  const found = new Set<string>();
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) found.add(term);
  }
  return Array.from(found);
}

export interface DietClassification {
  diet: RecipeDiet;
  // Termini che hanno determinato il risultato
  animalTerms: string[];
  // Eccezioni "vegetale" riconosciute: utili da rivedere a mano
  exceptionsUsed: string[];
}

export function classifyDietDetailed(recipe: Recipe): DietClassification {
  let text = ingredientsText(recipe);
  const exceptionsUsed: string[] = [];
  for (const exception of VEGETAL_EXCEPTIONS) {
    text = text.replace(exception, match => {
      exceptionsUsed.push(match);
      return ' ';
    });
  }

  const meatAndFish = findTerms(text, MEAT_AND_FISH);
  if (meatAndFish.length > 0) return { diet: 'omnivore', animalTerms: meatAndFish, exceptionsUsed };

  const dairyAndEggs = findTerms(text, EGGS_AND_DAIRY);
  if (dairyAndEggs.length > 0) return { diet: 'vegetarian', animalTerms: dairyAndEggs, exceptionsUsed };

  const honey = findTerms(text, HONEY);
  if (honey.length > 0) return { diet: 'vegetarian', animalTerms: honey, exceptionsUsed };

  return { diet: 'vegan', animalTerms: [], exceptionsUsed };
}

export function classifyDiet(recipe: Recipe): RecipeDiet {
  return classifyDietDetailed(recipe).diet;
}
