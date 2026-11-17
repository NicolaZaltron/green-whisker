# Green Whisker: riferimento per agenti AI

Documento di partenza per lavori automatici sull'app (revisione dati, import, test, UI). Descrive lo stato del codice al momento della stesura: quando un dato viene dal codice, il file è indicato tra parentesi. Lingua del prodotto: italiano (i18n in `src/i18n/locales/it.json` e `en.json`).

## 1. Cos'è l'app

App Expo / React Native (Expo Router, SDK 58) per pianificare pasti vegetali. Un solo utente, dati sul dispositivo (SQLite via `expo-sqlite`; sul web un fallback in `localStorage`). Il catalogo ricette e il seme ingredienti sono locali e si importano da file JSON.

Schermate (`src/app/`):
- **Ricettario** (`(tabs)/index.tsx`): ricerca, filtri per categoria/slot/dieta, scheda ricetta (`RecipeModal.tsx`).
- **Preferiti** (`(tabs)/favorites.tsx`): ricette con cuore.
- **Planner** (`(tabs)/planner.tsx`): settimana o 7 giorni a partire da oggi, 5 slot al giorno, aggiunta/modifica/eliminazione dei pasti, generazione automatica.
- **Spesa** (`(tabs)/shopping.tsx`): lista della spesa, reparti, aggiunta dal planner (`ShoppingPlanModal.tsx`), svuotafrigo (`PantryView.tsx`).

Funzioni trasversali: importazione di ricette con l'AI (`MagicRecipeImporterModal.tsx`, `aiService.ts`), varianti vegetariane e vegane generate con l'AI (`variantService.ts`), import/export JSON del ricettario (`recipeBookService.ts`), gestione ingredienti e pronti (`IngredientsModal.tsx`), condivisione testo (`shareHelper.ts`).

## 2. Entità e schema dei dati

Tutte le tabelle sono in `src/db/database.ts` e `src/db/catalogSchema.ts`. Le DDL viste non dichiarano `FOREIGN KEY`: le relazioni sono logiche, mantenute dal codice.

### 2.1 Ingredienti (`ingredients`, `ingredient_nutrients`)
Tipo `Ingredient` in `src/types/catalog.ts`.
- `id` (slug inglese, es. `extra_virgin_olive_oil`), `name` (italiano, singolare), `aliases[]` (forme alternative, usate dal matching).
- `type` ∈ `INGREDIENT_TYPES` (19): frutta, verdura, legumi, cereali, carne, pesce, frutta_secca, semi, latticini, dolcificanti, condimenti, uova, bevande, spezie, dolci, surgelati, snack_salati, pronti, altro.
- `tags[]` ⊂ `INGREDIENT_TAGS` (8): vegetariano, vegano, senza_glutine, confezionato, surgelato, in_scatola, solo_ricetta, gastronomia.
- `edible_alone` (bool): mangiabile da solo. Se vero usa `default_amount` / `default_unit` come porzione.
- `purchase_amount` / `purchase_unit`: quantità di default per la spesa.
- `density_g_per_ml`: per convertire volumi in grammi.
- `nutrients`: tabella `ingredient_nutrients(ingredient_id, nutrient, value)`, PK (ingredient_id, nutrient). **Valori per 100 g.** Chiavi `NUTRIENTS` (16): proteine, calcio, potassio, zinco, omega3, iodio, vitamina_b2, vitamina_c, ferro, fibre, kcal, carboidrati, grassi, grassi_saturi, zuccheri, sale.
- Seed: `src/data/ingredients.seed.json` (980 voci, revisione nutrizionale del 13 novembre 2026). Campi: `nutrients` (per 100 g, chiavi `NUTRIENTS`), `nutrition` (per 100 g, per porzione, provenienza, attendibilità, qualificatori). 27 voci aggiunte dalla revisione sono approvate; acquisto e densità sono stime da confermare (elenco in `work/current/seed-additions-approved.json`). Per 8 di queste i nutrienti non hanno fonti e restano null (`legacy_unverified`).

### 2.2 Ricette (`catalog`, `recipe_ingredients`, `favorites`, `recipe_notes`)
Tipo `Recipe` in `src/types/recipe.ts`. In SQLite ogni ricetta è un JSON nella tabella `catalog(id, json_data, base_id, diet, origin, created_at, updated_at)`.
- `id`: slug (`cb-magnum-fatto-in-casa-alle-mandorle`) o `custom-…` per le AI.
- `title`, `source`, `url`, `image`.
- `category` ∈ `RECIPE_TAXONOMY` (`src/constants/categories.ts`): 5 macro (`MACRO_PRIMI_E_CEREALI`, `MACRO_PROTEINE_E_SECONDI`, `MACRO_PANIFICATI_E_PIATTI_UNICI`, `MACRO_VERDURE_E_CONTORNI`, `MACRO_COLAZIONI_DOLCI`), sottocategorie `CAT_*` dentro ciascuna.
- `difficulty`: `easy` | `medium` | `hard` (nei dati: easy, medium). Esistono anche le forme legacy `Facile`, `Media`, `Difficile`.
- `servings` (numero, **porzioni base**), `servings_text` (es. "250 g netti"; non sempre coerente con `servings`).
- `times`: `total_minutes`, `prep_time`, `cook_time` (testo, anche null), `display_time`.
- `ingredients: string[]` (testo come scritto dalla ricetta), `ingredients_by_section`, `detailed_ingredients: IngredientItem[]`.
  - `IngredientItem`: `section`, `text`, `amount` (null = q.b.), `unit`, `ingredient` (nome canonico), `ingredient_id?` (id del seme; assente se non censito).
- `instructions: string[]`, `tips?: string[]`, `tags: string[]`.
- `recommended_slot?` ∈ `colazione` | `spuntino` | `pranzo_cena` (+ alias inglesi `breakfast`, `snack`, `lunch_dinner`). Regola di compatibilità con gli slot in `src/utils/recipeSlots.ts`.
- Classificazioni: `protein_group` ∈ legumi_interi, soia_derivati, cereali_proteici, leggero_vegetale; `carb_family` ∈ pasta, riso, farro_orzo, pseudocereali, tuberi, pane_cereali_rapidi, none; `veggie_color` ∈ green, red_orange, purple_blue, yellow_white, neutral; `seasons[]` ⊂ inverno, primavera, estate, autunno; `food_groups[]` ⊂ cereali, verdura, frutta, frutta_secca_semi, cibi_proteici, grassi; `is_complete_plate` (bool).
- Catalogo: `diet?` ∈ omnivore | vegetarian | vegan (calcolata da `dietClassifier.ts` se manca); `diet_source?` ∈ auto | manual; `origin?` ∈ file | ai | manual; `variant_of?` (id dell'originale per le varianti); `modified?`; `needs_review?`; `created_at`, `updated_at`.
- `recipe_ingredients(recipe_id, ingredient_id, amount, unit, note, position)`: PK (recipe_id, position). Collegamento riga → ingrediente censito. Fonte: l'import del ricettario (`applyCatalogImport`, con `saveRecipeLinks`) e il salvataggio di ricette AI e varianti. Nessun file di collegamenti nel bundle. Le righe senza corrispondenza restano testo.
- `favorites(recipe_id, created_at)`: PK recipe_id. Il cuore vale per il gruppo (originale e varianti).
- `recipe_notes(recipe_id, notes, updated_at)`: nota personale.
- Catalogo completo nel repo: `assets/ricette.json` (835 ricette, con tutti i campi e il blocco `nutrition`).

### 2.3 Pronti (`ready_meals`)
Tipo `ReadyMeal`: `id`, `name`, `category` (`pronto`), `tags[]`, `slots[]`, `default_count`, `nutrients` (**schema: per porzione; il seed è per 100 g: decisione aperta**). Seed: `src/data/readyMeals.seed.json` (62 voci).

### 2.4 Planner (`meal_plan`)
Tipo `MealPlanEntry` in `src/types/recipe.ts`. Una riga per pasto pianificato.
- `date` (YYYY-MM-DD), `slot` ∈ `colazione` | `spuntino_mattina` | `pranzo` | `spuntino_pomeriggio` | `cena` (ordine canonico `SLOT_ORDER`, etichette `SLOT_LABELS`).
- `kind` ∈ `recipe` | `ingredient` | `ready` | `out` (CHECK nel DDL legacy `meal_plan_v2`).
  - `recipe`: `recipe_id`, `recipe_source`.
  - `ingredient`: `ingredient_id`, `amount`, `unit`.
  - `ready`: `ready_meal_id`, `count`.
  - `out`: `label` (es. "Pizzeria", "Asporto - Cinese"; lista `OUT_OF_HOME_OPTIONS`).
- `recipe_source` ∈ `prepare` | `ready`. Assente o `prepare` = da preparare, entra nella spesa. `ready` = porzioni già pronte, non entra nella spesa. Migrazione: default `prepare`.
- `servings` (intero, 1–24): porzioni del pasto. Per una ricetta da preparare è il numero di porzioni preparate.
- `notes`, `created_at`.

### 2.5 Lista della spesa (`shopping_items`)
Tipo `ShoppingItem`: `id`, `recipe_id?`, `recipe_title?`, `ingredient_text`, `name`, `amount`, `unit`, `checked`, `category` ∈ `SHOPPING_DEPARTMENTS` (13 `CAT_SHOPPING_*`, default `CAT_SHOPPING_VARIE`), `created_at`.
- Unità selezionabili (`SHOPPING_UNITS`, 24): g, kg, ml, l, cucchiaio, cucchiaino, pizzico, bicchiere, pezzo, spicchio, fetta, foglia, rametto, mazzetto, ciuffo, costa, cubetto, panetto, rotolo, bustina, confezione, vasetto, barattolo, goccia. Le unità delle ricette possono essere fuori da questo elenco (es. `millilitri`, `q.b`): `toSelectableUnit` le riduce a stringa vuota.

### 2.6 Voci semplici (`simple_items`)
`SimpleItem`: `name`, `tags` ⊂ `SIMPLE_TAGS` (17, es. PIATTO FREDDO, ZUPPA/MINESTRA, FUORI CASA, AVANZI…), `amount`, `unit`, `recipe_ids[]`, `slots[]` (SimpleSlot = i 5 slot del planner).

### 2.7 Tabelle di sistema
- `kv_store(key, value)`: flag dei seed (`ingredients_seed_v17`, `ready_meals_v7`), impostazioni del planner (`preferencesService.ts`) e impostazioni AI (`settingsService.ts`).
- `custom_recipes`: vecchio archivio, migrato in `catalog` (`origin: ai`).
- `shopping_items`, `meal_plan`, `simple_items`: usate direttamente dai servizi.

### 2.8 Relazioni principali
- `recipe_ingredients.ingredient_id` → `ingredients.id` (molti a uno).
- `recipe_ingredients.recipe_id` → `catalog.id` (molti a uno; le righe di una ricetta sono PK (recipe_id, position)).
- `ingredient_nutrients.ingredient_id` → `ingredients.id`.
- `meal_plan.recipe_id` → `catalog.id`; `meal_plan.ingredient_id` → `ingredients.id`; `meal_plan.ready_meal_id` → `ready_meals.id`.
- `catalog.variant_of` → `catalog.id` (variante → originale; le varianti restano fuori dalle liste principali).
- `favorites.recipe_id`, `recipe_notes.recipe_id` → `catalog.id`.
- Eliminazioni: cancellare un ingrediente elimina i suoi collegamenti e le voci del planner che lo usano (`ingredientsDb.ts`); cancellare una ricetta elimina i suoi collegamenti e le voci del planner (`database.ts`).

## 3. Regole di calcolo

- **Spesa**: per ogni voce del planner con data ≥ oggi. Ricetta `prepare`: quantità × `entry.servings / recipe.servings` (default 4 se manca). Ricetta `ready`: nessuna spesa. Ingrediente: `purchase_amount` se presente, altrimenti la quantità della voce. Pronto: `count` × "confezione". Fonte: `src/services/shoppingPreview.ts` (`collectNeeds`). Per le ricette senza collegamenti nel database si usano i `detailed_ingredients` per nome (`ShoppingPlanModal.tsx`).
- **Scaling ricetta**: `scale = porzioni scelte / porzioni base`. Quantità arrotondate a intero, mai sotto 1; "q.b." non viene scalato (`src/utils/servingsScaler.ts`).
- **Matching ingredienti**: nome normalizzato (minuscolo, senza accenti, senza q.b., senza quantità), alias, sinonimi, vocale finale tolta (`src/utils/catalogNameMatch.ts`). Ha un difetto noto: "cannello" e "cannella" collidono.
- **Dieta**: se `diet` manca, `classifyDiet` (`src/utils/dietClassifier.ts`).
- **Slot compatibili**: `isRecipeForSlot` (`src/utils/recipeSlots.ts`). Senza `recommended_slot`: tutti gli slot tranne colazione e spuntini.
- **Generazione automatica** (`plannerService.ts`, `generateBalancedWeekPlan`): settimana equilibrata con rotazioni di proteine e carboidrati, piatto sano per stagione, preferenze (weekend, pranzo veloce, spuntini, porzioni di default, lunedì automatico). Crea voci `prepare` con porzioni = preferenza.
- **Preferenze planner** (`PlannerPreferences`): `servings` (= "Porzioni da mangiare per pasto": default per i pasti aggiunti e per la generazione), `includeWeekend`, `maxWeekdayLunchMinutes`, `autoGenerateOnMonday`, `includeSnacks`, `calendarMode` ∈ week | rolling.

## 4. Casi d'uso principali

1. **Aggiungere una ricetta al planner**: Ricettario → scheda ricetta → "Aggiungi al piano" → scelta di pasti e giorni (selezione multipla) → porzioni (default: porzioni della scheda) → conferma. Ogni combinazione giorno × pasto crea una voce.
2. **Aggiungere dal picker del planner**: tocca un giorno/slot → scheda con ricette, prodotti, pronti, fuori casa. Per le ricette: "Preparo" o "Già pronte"; se si prepara più pasti, "Ogni pasto separatamente" oppure "Prepara solo la prima volta" (prima voce = porzioni preparate, le altre `ready` con porzioni per pasto).
3. **Modificare una voce**: tocca la card → passo porzioni e fonte, salva.
4. **Generare la settimana**: automatica il lunedì, o manuale con `PlannerRegenModal`.
5. **Creare la lista della spesa**: Spesa → "Aggiungi dal planner" → seleziona le voci → salvataggio con reparto automatico (`shoppingClassifier.ts`).
6. **Svuotafrigo**: ingredienti posseduti → ricette con percentuale di copertura (`searchPantryRecipes`). Suggerimenti da `POPULAR_PANTRY_ITEMS` + nomi degli ingredienti censiti.
7. **Importare una ricetta con l'AI**: testo, foto o link → Gemini (provider configurabile: gemini, openai, claude, openrouter, custom; ruoli simple/complex) → ricetta normalizzata (`normalizeParsedRecipe`) → revisione → salvataggio con collegamenti `recipe_ingredients` per gli ingredienti censiti.
8. **Creare varianti**: dalla scheda, variante vegetariana o vegana generata con l'AI, revisione, salvataggio (`variant_of`).
9. **Importare/esportare il ricettario**: JSON, modalità `overwrite` o `keep` (`recipeBookService.ts`).
10. **Gestire ingredienti e pronti**: `IngredientsModal.tsx`, con tag, nutrienti, unità; le modifiche al seme invalidano la cache (`ingredientsCacheVersion`).

## 5. Seed, versioni e file di riferimento

- Seed ingredienti: `src/data/ingredients.seed.json` (980). Flag attivo: `ingredients_seed_v17` (`ingredientsService.ts`).
- Collegamenti ricetta-ingrediente: creati dall'import delle ricette (`saveRecipeLinks`), non da un seed. Nessun flag.
- Pronti: `src/data/readyMeals.seed.json` (62, `nutrients` per porzione, `nutrients_per_100g`, `serving_weight_g`). Flag: `ready_meals_v7`.
- Ogni modifica al seme richiede un nuovo flag, altrimenti i dispositivi non reimportano. Un reseed cancella i pasti pianificati (accettato dall'utente).
- Catalogo completo con tutti i campi: `assets/ricette.json` (835, con `nutrition`). Ricette AI: `work/current/ai-recipes.json` (22). Pipeline e report nutrizione: `work/seed-review-by-gpt-6.1-sol/nutrizione/` (vedi `LEGGIMI.txt`).
- Test: `scripts/test_*.js` (plain Node, `NODE_PATH=$PWD/node_modules node scripts/…`). Controlli: `npx tsc --noEmit`, `npx expo lint`.
- Regole del progetto: non committare senza richiesta; non scrivere nel seme senza approvazione dell'elenco; le modifiche di codice si verificano con tsc, lint e test.

## 6. Problemi noti

- Matching: "cannello" → cannella (collisione dovuta alla normalizzazione della vocale finale). Va corretto nel matcher, con attenzione a plurali come noce/noci.
- Nutrienti mancanti: 8 ingredienti aggiunti (es. Pestèda, Marsala vegano) non hanno fonti e restano null. Gli altri dati di acquisto delle 27 nuove voci sono stime.
- `servings` non sempre coerente con `servings_text` (es. "Ricotta vegetale", ora corretta nella baseline).
- Valori nutrizionali: mancanti per circa 307 ingredienti (stato del passaggio di consegne); pronti per 100 g nel seed ma per porzione nello schema.
- I collegamenti vengono creati dall'import del ricettario: va verificato sul dispositivo con un file reale.
- Il vocabolario dello svuotafrigo include anche ingredienti non mangiabili da soli (es. sale, marcato `solo_ricetta`).
- Dalla scheda ricetta ogni pasto viene salvato come `prepare`: la scelta preparo / già pronte esiste solo nel picker del planner.

## 7. Convenzioni del codice

- Commenti e testi utente in italiano; chiavi i18n in entrambe le lingue.
- Componenti condivisi del planner in `src/components/planner/`; testo di ricerca con `AppTextField` (`variant="search"` per lo sfondo bianco).
- Stili con `StyleSheet.create` dentro `makeStyles(colors)` (palette in `src/theme/palette.ts`).
- Lista lunga: `FlatList` con `keyExtractor` stabile e `useCallback` sulle funzioni passate alle righe.
- Nuove API Expo: consultare la documentazione della versione del pacchetto `expo` (vedi `AGENTS.md`).
