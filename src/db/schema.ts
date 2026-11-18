import { INGREDIENT_TYPES, NUTRIENTS, READY_MEAL_CATEGORIES } from '../types/catalog';

// Schema version stored in PRAGMA user_version. Each version is a full rebuild: the data of older
// versions is not migrated (the app is in alpha and the user accepted the reset). Version 2 splits the
// recipe catalog into the light index 'recipe' and the card body 'recipe_body'. Version 3 uses singular
// table names and one wide row per ingredient for the nutrients. Version 5 records who owns each alias
// ('seed' or 'user'), so a re-seed replaces only the seed aliases and keeps the ones the user added.
export const SCHEMA_VERSION = 5;

const quoted = (values: readonly string[]) => values.map(v => `'${v}'`).join(', ');

// One column per nutrient, NULL when the value is unknown
const NUTRIENT_COLUMNS = NUTRIENTS.map(n => `    ${n} REAL,`).join('\n').replace(/,$/, '');

// Children first, parents last: dropping a parent with foreign keys on would cascade into live children
const LEGACY_TABLES = [
  'meal_plan_v2',
  'meal_plan_new',
  'custom_recipes',
  'recipe_body',
  'simple_items',
  'meal_plan',
  'shopping_item',
  'shopping_items',
  'favorite',
  'favorites',
  'recipe_note',
  'recipe_notes',
  'recipe_ingredient',
  'recipe_ingredients',
  'ingredient_nutrition',
  'ingredient_nutrients',
  'ingredient_aliases',
  'ingredient_alias',
  'ingredient',
  'ingredients',
  'ready_meal',
  'ready_meals',
  'recipe',
  'catalog',
  'out_of_home_option',
  'kv_store',
  'seed_meta',
];

const DDL_V1 = `
  CREATE TABLE recipe (
    id TEXT PRIMARY KEY,
    summary_json TEXT NOT NULL,
    category TEXT NOT NULL,
    diet TEXT NOT NULL,
    origin TEXT NOT NULL,
    variant_of TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_recipe_category ON recipe(category);
  CREATE INDEX idx_recipe_diet ON recipe(diet);
  CREATE INDEX idx_recipe_origin ON recipe(origin);
  CREATE INDEX idx_recipe_variant ON recipe(variant_of);

  CREATE TABLE recipe_body (
    recipe_id TEXT PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
    body_json TEXT NOT NULL
  );

  CREATE TABLE ingredient (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN (${quoted(INGREDIENT_TYPES)})),
    tags TEXT NOT NULL DEFAULT '[]',
    edible_alone INTEGER NOT NULL DEFAULT 1 CHECK (edible_alone IN (0, 1)),
    default_amount REAL,
    default_unit TEXT NOT NULL DEFAULT '',
    purchase_amount REAL,
    purchase_unit TEXT NOT NULL DEFAULT '',
    density_g_per_ml REAL,
    source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'user')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX idx_ingredients_name_key ON ingredient(name_key);
  CREATE INDEX idx_ingredients_type ON ingredient(type);

  CREATE TABLE ingredient_nutrition (
    ingredient_id TEXT PRIMARY KEY REFERENCES ingredient(id) ON DELETE CASCADE,
${NUTRIENT_COLUMNS}
  );
  CREATE TABLE ingredient_alias (
    alias_key TEXT PRIMARY KEY,
    ingredient_id TEXT NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
    source TEXT NOT NULL DEFAULT 'seed' CHECK (source IN ('seed', 'user'))
  );
  CREATE INDEX idx_ingredient_alias_ingredient ON ingredient_alias(ingredient_id);

  CREATE TABLE ready_meal (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (${quoted(READY_MEAL_CATEGORIES)})),
    tags TEXT NOT NULL DEFAULT '[]',
    slots TEXT NOT NULL DEFAULT '[]',
    default_count INTEGER NOT NULL DEFAULT 1 CHECK (default_count >= 1),
    nutrients TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE recipe_ingredient (
    recipe_id TEXT NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
    ingredient_id TEXT NOT NULL REFERENCES ingredient(id) ON DELETE CASCADE,
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    PRIMARY KEY (recipe_id, position)
  );
  CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredient(ingredient_id);

  CREATE TABLE meal_plan (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('recipe', 'ingredient', 'ready', 'out')),
    recipe_id TEXT REFERENCES recipe(id) ON DELETE CASCADE,
    ingredient_id TEXT REFERENCES ingredient(id) ON DELETE CASCADE,
    ready_meal_id TEXT REFERENCES ready_meal(id) ON DELETE CASCADE,
    label TEXT,
    amount REAL,
    unit TEXT NOT NULL DEFAULT '',
    count INTEGER NOT NULL DEFAULT 1,
    servings INTEGER NOT NULL DEFAULT 2 CHECK (servings BETWEEN 1 AND 24),
    recipe_source TEXT CHECK (recipe_source IS NULL OR recipe_source IN ('prepare', 'ready')),
    notes TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_meal_plan_date ON meal_plan(date);
  CREATE INDEX idx_meal_plan_date_slot ON meal_plan(date, slot);
  CREATE INDEX idx_meal_plan_recipe ON meal_plan(recipe_id);
  CREATE INDEX idx_meal_plan_ingredient ON meal_plan(ingredient_id);
  CREATE INDEX idx_meal_plan_ready_meal ON meal_plan(ready_meal_id);

  CREATE TABLE shopping_item (
    id TEXT PRIMARY KEY,
    recipe_id TEXT,
    recipe_title TEXT,
    ingredient_text TEXT NOT NULL,
    name TEXT NOT NULL,
    amount REAL,
    unit TEXT,
    checked INTEGER NOT NULL DEFAULT 0,
    category TEXT NOT NULL DEFAULT 'CAT_SHOPPING_VARIE',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_shopping_items_checked ON shopping_item(checked, category);

  CREATE TABLE favorite (
    recipe_id TEXT PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE recipe_note (
    recipe_id TEXT PRIMARY KEY REFERENCES recipe(id) ON DELETE CASCADE,
    notes TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE out_of_home_option (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE kv_store (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE seed_meta (
    name TEXT PRIMARY KEY,
    version INTEGER NOT NULL,
    applied_at INTEGER NOT NULL
  );
`;

/**
 * Creates the schema on an empty or older database. Foreign keys are enabled first: SQLite ignores
 * PRAGMA foreign_keys inside a transaction. Idempotent: a database already at SCHEMA_VERSION is left as is.
 */
export async function applySchema(db: any): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row: any = await db.getFirstAsync('PRAGMA user_version');
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;

  await db.execAsync('BEGIN');
  try {
    for (const table of LEGACY_TABLES) {
      await db.execAsync(`DROP TABLE IF EXISTS ${table}`);
    }
    await db.execAsync(DDL_V1);
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    await db.execAsync('COMMIT');
  } catch (e) {
    await db.execAsync('ROLLBACK');
    throw e;
  }
}
