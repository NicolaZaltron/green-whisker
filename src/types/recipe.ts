export interface IngredientItem {
  sezione: string;
  testo: string;
  quantita: number | null;
  unita: string;
  ingrediente: string;
}

export interface IngredientSection {
  sezione: string;
  ingredienti: string[];
}

export interface RecipeTimes {
  tempo_totale_minuti: number;
  tempo_preparazione: string | null;
  tempo_cottura: string | null;
  tempi_display: string;
}

export type SlotConsigliato = 'colazione' | 'spuntino' | 'pranzo_cena';
export type GruppoAlimentare = 'cereali' | 'verdura' | 'frutta' | 'frutta_secca_semi' | 'cibi_proteici' | 'grassi';

export interface Recipe {
  id: string;
  titolo: string;
  fonte: string;
  url: string;
  immagine: string;
  categoria: string;
  macro_categoria?: string;
  sottocategoria?: string;
  difficolta: 'Facile' | 'Media' | 'Difficile';
  porzioni: number;
  porzioni_testo: string;
  tempi: RecipeTimes;
  ingredienti: string[];
  ingredienti_per_sezione: IngredientSection[];
  ingredienti_dettagliati: IngredientItem[];
  istruzioni: string[];
  suggerimenti: string[];
  tags: string[];
  slot_consigliato?: SlotConsigliato;
  gruppi_alimentari?: GruppoAlimentare[];
}

export interface ShoppingItem {
  id: string;
  recipe_id?: string;
  recipe_title?: string;
  ingredient_text: string;
  name: string;
  amount: number | null;
  unit: string;
  checked: boolean;
  category: string;
  created_at: number;
}

export interface MealPlanEntry {
  id: string;
  date: string; // YYYY-MM-DD
  slot: 'colazione' | 'spuntino_mattina' | 'pranzo' | 'spuntino_pomeriggio' | 'cena';
  recipe_id: string;
  side_recipe_id?: string;
  servings: number;
  notes?: string;
  created_at: number;
}
