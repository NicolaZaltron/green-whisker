export const RECIPE_TAXONOMY = {
  'Primi e Cereali': [
    'Primi piatti',
    'Risotti',
    'Gnocchi',
    'Pasta al forno',
    'Polenta',
    'Bowl',
    'Porridge & Overnight oats',
    'Insalate di cereali',
  ],
  'Proteine Vegetali & Secondi': [
    'Secondi a base di Tofu',
    'Tempeh',
    'Seitan',
    'Soia',
    'Farinate & Frittate',
    'Polpette & Burger vegetali',
    'Piatti a base di legumi',
    'Insalate di legumi',
  ],
  'Panificati e Piatti Unici': [
    'Piadine & Wraps',
    'Panini & Bruschette',
    'Pizze & Focacce',
    'Torte salate',
  ],
  'Verdure e Contorni': [
    'Verdure al forno',
    'Verdure in padella',
    'Verdure bollite & a vapore',
    'Zuppe & Vellutate',
    'Contorni',
  ],
  'Dolci, Colazioni e Snack': [
    'Biscotti',
    'Energy balls & Barrette',
    'Frullati',
    'Frutta fresca & Macedonie',
    'Frutta secca',
    'Gelati',
    'Merende & Colazioni dolci/salate',
    'Torte da forno',
    'A base di latte/yogurt vegetale',
  ],
} as const;

export type MacroCategory = keyof typeof RECIPE_TAXONOMY;
export type SubCategory = typeof RECIPE_TAXONOMY[MacroCategory][number];

export const MACRO_CATEGORIES: MacroCategory[] = [
  'Primi e Cereali',
  'Proteine Vegetali & Secondi',
  'Panificati e Piatti Unici',
  'Verdure e Contorni',
  'Dolci, Colazioni e Snack',
];

export const MACRO_CATEGORY_ICONS: Record<MacroCategory, string> = {
  'Primi e Cereali': 'restaurant',
  'Proteine Vegetali & Secondi': 'leaf',
  'Panificati e Piatti Unici': 'pizza',
  'Verdure e Contorni': 'nutrition',
  'Dolci, Colazioni e Snack': 'ice-cream',
};
