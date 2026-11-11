export async function migrateCatalogSchema(db: any): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      edible_alone INTEGER NOT NULL DEFAULT 1,
      default_amount REAL,
      default_unit TEXT NOT NULL DEFAULT '',
      purchase_amount REAL,
      purchase_unit TEXT NOT NULL DEFAULT '',
      density_g_per_ml REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ingredient_nutrients (
      ingredient_id TEXT NOT NULL,
      nutrient TEXT NOT NULL,
      value REAL NOT NULL,
      PRIMARY KEY (ingredient_id, nutrient)
    );
    CREATE TABLE IF NOT EXISTS ready_meals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      slots TEXT NOT NULL DEFAULT '[]',
      default_count INTEGER NOT NULL DEFAULT 1,
      nutrients TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      recipe_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      amount REAL,
      unit TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL,
      PRIMARY KEY (recipe_id, position)
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_ingredient_nutrients_ingredient ON ingredient_nutrients(ingredient_id);
  `);

  // Migrazione idempotente: aggiunge le colonne di quantità da acquistare alle installazioni già esistenti
  const ingredientCols: any[] = await db.getAllAsync('PRAGMA table_info(ingredients)');
  if (!ingredientCols.some(c => c.name === 'purchase_amount')) {
    await db.execAsync('ALTER TABLE ingredients ADD COLUMN purchase_amount REAL');
  }
  if (!ingredientCols.some(c => c.name === 'purchase_unit')) {
    await db.execAsync("ALTER TABLE ingredients ADD COLUMN purchase_unit TEXT NOT NULL DEFAULT ''");
  }

  const cols: any[] = await db.getAllAsync('PRAGMA table_info(meal_plan)');
  if (cols.some(c => c.name === 'label')) return;

  // Le tabelle già con le colonne per ingrediente/pronto vengono copiate per intero; le più vecchie solo le ricette
  const hasKindColumns = cols.some(c => c.name === 'ingredient_id');
  // Righe con un valore di kind non previsto dal CHECK (es. dati vecchi o corrotti) farebbero fallire
  // la migrazione e il rollback la bloccherebbe ad ogni avvio: quelle righe vengono copiate come 'recipe'.
  const copySql = hasKindColumns
    ? `INSERT INTO meal_plan_v2 (id, date, slot, kind, recipe_id, ingredient_id, ready_meal_id, amount, unit, count, servings, notes, created_at)
        SELECT id, date, slot, CASE WHEN kind IN ('recipe','ingredient','ready','out') THEN kind ELSE 'recipe' END, recipe_id, ingredient_id, ready_meal_id, amount, unit, count, servings, notes, created_at
        FROM meal_plan;`
    : `INSERT INTO meal_plan_v2 (id, date, slot, kind, recipe_id, servings, notes, created_at)
        SELECT id, date, slot, 'recipe', recipe_id, servings, notes, created_at
        FROM meal_plan WHERE recipe_id IS NOT NULL;`;

  await db.execAsync('BEGIN');
  try {
    await db.execAsync(`
      DROP TABLE IF EXISTS meal_plan_v2;
      CREATE TABLE meal_plan_v2 (
        id TEXT PRIMARY KEY,
        date TEXT NOT NULL,
        slot TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('recipe','ingredient','ready','out')),
        recipe_id TEXT,
        ingredient_id TEXT,
        ready_meal_id TEXT,
        label TEXT,
        amount REAL,
        unit TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        servings INTEGER NOT NULL DEFAULT 2,
        notes TEXT,
        created_at INTEGER NOT NULL
      );
      ${copySql}
      DROP TABLE meal_plan;
      ALTER TABLE meal_plan_v2 RENAME TO meal_plan;
      CREATE INDEX IF NOT EXISTS idx_meal_plan_date ON meal_plan(date);
      CREATE INDEX IF NOT EXISTS idx_meal_plan_date_slot ON meal_plan(date, slot);
    `);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
