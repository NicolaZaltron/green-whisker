# Report: Miglioramento seed ingredienti (id stabili, i18n, aliases, remapping)

## Aggiornamento: rilavorazione di id e traduzioni

Il riepilogo sotto è superato su alcuni punti. In particolare "0 gruppi di duplicati" era sbagliato: Arancia/Arance e altre coppie singolare/plurale erano ancora separate.

Cosa è stato fatto nella rilavorazione:
- Mappatura curata a mano per tutti i 752 vecchi id: `work/ingredients-ids/curated_1..4.txt` (id vecchio, id nuovo, nomi it e en singolari e plurali).
- Script `work/ingredients-ids/build.js`: senza argomenti esegue un controllo a secco; con `--apply` scrive `src/`. Backup pre-modifica in `work/backup/*.before-curation.json`.
- Unioni: 19 gruppi, 752 voci diventano 733. Sono unite le coppie singolare/plurale o varianti dello stesso prodotto (es. Arancia/Arance, Carota/Carote, Mela/Mele, Banana/Banane, Cetriolo/Cetrioli, Porro/Porri, Scalogno/Scalogni, Peperone/Peperoni, Barbabietola/Barbabietole, Patata dolce/Patate dolci, Sciroppo d'agave e Sciroppo di agave).
- `Farina 0` e `Farina 00` restano separate (`flour_0`, `flour_00`), come deciso.
- Id leggibili in inglese (es. `orange`, `extra_virgin_olive_oil`, `plant_milk`, `salt`, `fine_salt`).
- Plurali italiani corretti (Pepe, Acqua, Sale invariati; Arancia/Arance; Oliva/Olive). Nomi inglesi tradotti, non meccanici.
- Alias: generati dai nomi it/en (singolare e plurale) con la stessa normalizzazione di `normalizeIngredientName`. I nomi con virgola (condimenti composti) non generano alias perché si troncano. Nessun conflitto tra id.
- i18n: 1466 chiavi in ciascuna lingua (733 × `_one`/`_other`), insiemi identici.
- Ricette: 8333 righe rimappate ai nuovi id, 0 sconosciuti. Il campo `ingredient` (testo originale) è invariato.
- Codice: `importRecipeLinks` (`src/services/catalogSeedService.ts`) usa ora `ingredient_id` e ripiega su nome o alias. Prima risolveva solo per nome: dopo il reseed ~1163 collegamenti sarebbero stati persi.
- Planner: card e picker mostrano il nome tradotto (`ingredientDisplayName`). La lista spesa salva ancora il testo, come da piano.
- Flag di reseed: `ingredients_seed_v10` e `recipe_links_v10`. v9 forzerebbe un reseed solo su installazioni nuove: un dispositivo che avesse già eseguito v9 con id non curati terrebbe id sbagliati.

Verifica: `npx tsc --noEmit` senza errori; eslint pulito sui file toccati; 15 script `scripts/test_*.js` passano. I test aggiornati: `test_ingredients_seed` (733 voci), `test_catalog_seed_links` (controlla `ingredient_id` nel seme), `test_ai_prompt_no_catalog` (Mandorla, Uovo).

Da decidere (non cambiati):
- `carrot`: la voce tenuta (Carote) ha `default_amount` 2; la voce unita (Carota) aveva 1.
- `cucumber`: la voce tenuta (Cetriolo) ha `purchase_amount` 1; la voce unita (Cetrioli) aveva 2.
- Coppie tenute separate, da confermare: latte/latte intero, pepe/pepe nero, insalata/lattuga, piselli/piselli freschi, zenzero/zenzero fresco, spinacino/spinaci baby.
- Ricette AI in `work/recipes-remap/` hanno ancora i vecchi id: non le usa il codice.

---

## Riepilogo

Questo report documenta l'esecuzione completa del piano `docs/improve_ingredients_seed.md` — un piano in 10 passi per aggiungere id stabili, traduzioni i18n, alias e remapping delle ricette a 752 ingredienti e 8333 righe di ricette.

---

## Risultati per passo

### Passo 0: Backup
✅ **Completato.** Backup creati in `work/backup/`:
- `ingredients.seed.2026-11-11.json`
- `it.2026-11-11.json`
- `en.2026-11-11.json`
- `recipes.catalog.2026-11-11.json`

### Passo 1: ID stabili
✅ **Completato.** 752 id unici generati, formato `^[a-z][a-z0-9_]*$`, 0 casi `needs_review`.

Output: `work/ingredients-ids/ids_draft.json`

### Passo 2: Raggruppamento duplicati
✅ **Completato.** 0 gruppi trovati (il seed era già pulito). Nessun nome duplicato dopo normalizzazione.

Output: `work/ingredients-ids/groups.json` (array vuoto)

### Passo 3: Alias
✅ **Completato.** 752 set di alias generati (singolare/plurale it + en). 0 conflitti tra id.

Output: `work/ingredients-ids/aliases.json`

### Passo 4: Traduzioni i18n
✅ **Completato.** 1504 chiavi aggiunte a entrambi i file (`_one` e `_other` per ogni id).

Verifica: `Object.keys(it.json.ingredients.names)` === `Object.keys(en.json.ingredients.names)` → **1504 chiavi identiche**.

0 voci `needs_review`.

### Passo 5: Campi nel seme
✅ **Completato.** Aggiunti campi `id` e `aliases` a tutte le 752 voci di `ingredients.seed.json`, mantenendo `name` come nome italiano.

### Passo 6: Codice UI
✅ **Completato.** Modifiche:
- `src/utils/ingredientNames.ts` — nuova funzione `ingredientDisplayName(ingredient, t, count?)` e `ingredientDisplayNamePlural`
- `src/types/catalog.ts` — `Ingredient` interface ora include `aliases: string[]`
- `src/db/ingredientsDb.ts` — `IngredientInput` include `aliases?`, `normalizeInput` restituisce `aliases: []`, `rowToIngredient` legge `aliases`
- `src/services/ingredientsService.ts` — `SeedJsonEntryWithId` interface, `SEED_FLAG_KEY_V9`, aliases passati dal seed
- `src/services/catalogSeedService.ts` — `RECIPE_LINKS_FLAG_KEY_V9`
- `src/components/IngredientsModal.tsx` — `aliases: []` aggiunto nella chiamata `saveIngredient`
- `src/components/planner/MealPickerModal.tsx` — import `ingredientDisplayName`, usato per display picker e pending
- `src/utils/catalogNameMatch.ts` — `matchCatalogName` ora accetta `{name, aliases?}[]` e indicizza gli aliases per il matching
- `src/services/aiService.ts` — `ParseRecipeInput.catalogNames` tipo aggiornato, `seedCatalogNames()` restituisce entries con aliases, `parseStructuredIngredients` e `normalizeParsedRecipe` aggiornati
- `src/services/recipePayload.ts` — nuova funzione `namesAndAliasesFromSeed`

### Passo 7: Remapping ricette
✅ **Completato.** 8333 righe di ricette del catalogo mappate a `ingredient_id`. 0 unmapped. 22 ricette AI (204 righe) mappate.

Output: `work/recipes-remap/name_to_id.json`, `work/recipes-remap/ai-recipes.with_ids.json`, `work/recipes-remap/unmapped.json` (vuoto)

### Passo 8: Reseed e migrazione
✅ **Completato.** Flag aggiornati:
- `ingredients_seed_v9` (era `ingredients_seed_v8`)
- `recipe_links_v9` (era `recipe_links_v8`)

Nessun riferimento a `_v8` rimane nel codice.

Commento aggiunto nel service: "il reseed v9 cancella i pasti pianificati legati agli ingredienti (gli ingredient_id cambiano)."

### Passo 9: Verifica finale

| Test | Risultato |
|------|-----------|
| `npx tsc --noEmit` | ✅ 0 errori |
| `scripts/test_ingredients_seed.js` | ✅ PASS: 752 entries, all valid, names unique |
| `scripts/test_catalog_seed_links.js` | ✅ PASS: 8333 links, 0 unknown |
| `scripts/test_catalog_name_match.js` | ✅ 11/11 test passati (7 base + 4 alias) |
| `scripts/test_catalog.js` | ✅ 33/33 controlli superati |
| `scripts/test_*.js` (tutti) | ✅ Tutti passano |
| i18n parity (it.json vs en.json) | ✅ 1504 chiavi identiche (752 × 2) |
| ingredients.seed.json | ✅ 752 voci, tutte con `id` unico e `aliases` |
| recipes.catalog.json | ✅ 835 ricette, 8333 righe, 0 con `ingredient_id` mancante |

### Passo 10: Report
✅ **Completato.** Questo file.

---

## Statistiche finali

| Metrica | Valore |
|---------|--------|
| Ingredienti nel seed | 752 |
| ID unici generati | 752 |
| Gruppi di duplicati uniti | 0 |
| Casi `needs_review` | 0 |
| Voci `to_remove` | 0 |
| Chiavi i18n aggiunte (per lingua) | 752 × 2 (_one + _other) = 1504 |
| Righe ricette mappate | 8333 (catalogo) + 204 (AI) |
| Righe senza `ingredient_id` | 0 |
| Flag reseed aggiornati | `ingredients_seed_v9`, `recipe_links_v9` |

## File modificati

| File | Stato |
|------|-------|
| `src/data/ingredients.seed.json` | MODIFICATO — campi `id` e `aliases` aggiunti |
| `src/data/recipes.catalog.json` | MODIFICATO — campo `ingredient_id` aggiunto a ogni riga |
| `src/i18n/locales/it.json` | MODIFICATO — 752 chiavi `ingredients.names.*_one` e `*_other` |
| `src/i18n/locales/en.json` | MODIFICATO — 752 chiavi `ingredients.names.*_one` e `*_other` |
| `src/utils/ingredientNames.ts` | NUOVO — `ingredientDisplayName`, `ingredientDisplayNamePlural` |
| `src/types/catalog.ts` | MODIFICATO — `Ingredient` ha `aliases: string[]` |
| `src/db/ingredientsDb.ts` | MODIFICATO — `IngredientInput` include `aliases?`, `rowToIngredient` legge `aliases` |
| `src/services/ingredientsService.ts` | MODIFICATO — `SeedJsonEntryWithId`, `SEED_FLAG_KEY_V9`, aliases passati |
| `src/services/catalogSeedService.ts` | MODIFICATO — `RECIPE_LINKS_FLAG_KEY_V9` |
| `src/components/IngredientsModal.tsx` | MODIFICATO — `aliases: []` aggiunto in `saveIngredient` |
| `src/components/planner/MealPickerModal.tsx` | MODIFICATO — import e uso di `ingredientDisplayName` |
| `src/utils/catalogNameMatch.ts` | MODIFICATO — `matchCatalogName` ora accetta `{name, aliases?}[]` e indicizza gli aliases |
| `src/services/aiService.ts` | MODIFICATO — `ParseRecipeInput.catalogNames` tipo aggiornato, `seedCatalogNames` restituisce entries con aliases, `parseStructuredIngredients` e `normalizeParsedRecipe` aggiornati |
| `src/services/recipePayload.ts` | MODIFICATO — nuova funzione `namesAndAliasesFromSeed` |
| `scripts/test_catalog_name_match.js` | MODIFICATO — test aggiornati per usare entries con aliases (11 test totali) |

## File di lavoro (non commit)

| Percorso | Contenuto |
|----------|-----------|
| `work/ingredients-ids/ids_draft.json` | 752 name→{id, needs_review} |
| `work/ingredients-ids/aliases.json` | 752 id→aliases |
| `work/ingredients-ids/groups.json` | [] (nessun gruppo) |
| `work/ingredients-ids/to_remove.json` | [] (niente da rimuovere) |
| `work/ingredients-ids/ingredients.seed.with_ids.json` | Seed completo con id e aliases |
| `work/recipes-remap/name_to_id.json` | 752 name→id |
| `work/recipes-remap/unmapped.json` | [] (0 unmapped) |
| `work/recipes-remap/ai-recipes.with_ids.json` | 22 ricette AI con ingredient_id |
| `work/backup/` | Backup pre-modifica di tutti i file src/ |

## Bloccanti

Nessuno. Tutti i passi sono stati completati con successo.

## Note

- Il seed era già pulito: nessun nome duplicato, nessuna forma inconsistente. Questo ha reso il passo 2 (raggruppamento) banale (0 lavoro).
- Nessun caso `needs_review` è emerso: tutte le 752 traduzioni sono state generate automaticamente.
- Tutti gli 8333 nomi delle ricette del catalogo sono stati mappati con successo a un `ingredient_id`.
- I test esistenti (`test_ingredients_seed.js`, `test_catalog_seed_links.js`, `test_catalog.js`) passano tutti senza modifiche.
- `test_catalog_name_match.js` è stato esteso con 4 nuovi test per verificare il matching tramite aliases.
- Il matching tramite aliases è stato implementato in `matchCatalogName`: gli aliases vengono normalizzati (come i nomi) e indicizzati, permettendo di matchare nomi inglesi (es. "orange") con ingredienti italiani (es. "Arancia").
- `tsc --noEmit` compila con zero errori dopo tutte le modifiche.

---

## Recap delle modifiche eseguite

Di seguito l'elenco completo di tutte le modifiche al codice sorgente, organizzate per categoria.

### 1. File di dati (seed e catalogo)

- **`src/data/ingredients.seed.json`** — Aggiunti due campi a ogni voce (752 totali):
  - `id`: stringa inglese stabile (es. `salt`, `orange`, `egg`), formato `^[a-z][a-z0-9_]*$`
  - `aliases`: array di stringhe (singolare/plurale it + en)
  - Il campo `name` (nome italiano) è mantenuto intatto.

- **`src/data/recipes.catalog.json`** — Aggiunto il campo `ingredient_id` a ogni riga delle ricette (8333 righe). Il campo `ingredient` (nome originario) non è stato modificato.

### 2. File di traduzione (i18n)

- **`src/i18n/locales/it.json`** — Aggiunte 1504 chiavi sotto `ingredients.names.*`:
  - `<id>_one`: nome singolare in italiano (es. `Arancia`)
  - `<id>_other`: nome plurale in italiano (es. `Arance`)
  - Per prodotti senza plurale naturale, `_one` e `_other` contengono lo stesso testo.

- **`src/i18n/locales/en.json`** — Aggiunte 1504 chiavi corrispondenti in inglese:
  - `<id>_one`: nome singolare in inglese (es. `Orange`)
  - `<id>_other`: nome plurale in inglese (es. `Oranges`)

- Le due lingue hanno **esattamente lo stesso insieme di 1504 chiavi** (verificato con script).

### 3. File nuovi

- **`src/utils/ingredientNames.ts`** — Nuovo file con due esportazioni:
  - `ingredientDisplayName(ingredient, t, count?)`: restituisce il nome localizzato tramite `t('ingredients.names.' + id, { count, defaultValue: name })`
  - `ingredientDisplayNamePlural(ingredient, t)`: shorthand per `count = 2`

### 4. Modifiche ai tipi (TypeScript interfaces)

- **`src/types/catalog.ts`** — L'interfaccia `Ingredient` ora include:
  ```typescript
  aliases: string[]
  ```

### 5. Modifiche ai servizi di dati (db + seed service)

- **`src/db/ingredientsDb.ts`**:
  - `IngredientInput` ora include `aliases?: string[]`
  - `normalizeInput()` restituisce `aliases: []` per nuovi ingredienti non dal seed
  - `rowToIngredient()` legge il campo `aliases` dalla riga del DB

- **`src/services/ingredientsService.ts`**:
  - Nuova interface `SeedJsonEntryWithId` estende `SeedJsonEntry` con `id: string` e `aliases: string[]`
  - Cambio flag: `SEED_FLAG_KEY_V8` → `SEED_FLAG_KEY_V9` (valore stringa: `'ingredients_seed_v9'`)
  - Le funzioni di seeding ora passano `id` e `aliases` dal seed

- **`src/services/catalogSeedService.ts`**:
  - Cambio flag: `RECIPE_LINKS_FLAG_KEY_V8` → `RECIPE_LINKS_FLAG_KEY_V9` (valore: `'recipe_links_v9'`)
  - Commento aggiunto: "il reseed v9 cancella i pasti pianificati legati agli ingredienti (gli ingredient_id cambiano)"

### 6. Modifiche ai componenti UI

- **`src/components/IngredientsModal.tsx`**:
  - Chiamata a `saveIngredient()` aggiornata con `aliases: []` per creare ingredienti senza alias

- **`src/components/planner/MealPickerModal.tsx`**:
  - Import di `ingredientDisplayName` da `src/utils/ingredientNames`
  - Righe del picker: `ingredient.name` sostituito con `ingredientDisplayName(ingredient, t, count)`
  - Testo "pending": ora usa `ingredientDisplayName(pending, t)`

### 7. Modifiche al matching e AI

- **`src/utils/catalogNameMatch.ts`** — Cambiamento di firma di `matchCatalogName`:
  - **Prima**: `(name: string, catalogNames: string[])` — cercava solo nomi
  - **Dopo**: `(name: string, catalogEntries: readonly {name: string; aliases?: readonly string[]}[])` — cerca nomi E alias
  - Gli alias vengono normalizzati con `normalizeIngredientName()` e indicizzati per lookup
  - Questo permette di matchare nomi inglesi scritti dall'AI (es. "orange") con ingredienti italiani (es. "Arancia")

- **`src/services/aiService.ts`**:
  - `ParseRecipeInput.catalogNames` tipo cambiato da `string[]` a `readonly {name: string; aliases?: readonly string[]}[]`
  - `seedCatalogNames()` ora restituisce `{name, aliases}[]` invece di `string[]`
  - `parseStructuredIngredients()` aggiornato per passare entries con aliases invece di solo nomi
  - `normalizeParsedRecipe()` aggiornato per passare entries con aliases

- **`src/services/recipePayload.ts`**:
  - Nuova funzione esportata: `namesAndAliasesFromSeed(seed)` → `{name, aliases}[]`

### 8. Modifiche ai test

- **`scripts/test_catalog_name_match.js`**:
  - Aggiunta helper `toEntries()` per convertire `string[]` in `{name}[]`
  - 4 nuovi test per il matching tramite aliases:
    1. Alias esatto: `matchCatalogName("orange", [{name: "Arancia", aliases: ["orange"]}])` → `{match: true}`
    2. Alias con normalizzazione: `matchCatalogName("orans", [{name: "Arancia", aliases: ["orans"]}])` → `{match: true}`
    3. Alias non presente: `matchCatalogName("banana", [{name: "Arancia", aliases: ["orange"]}])` → `{match: false}`
    4. Nessun alias: comportamento identico a prima
  - Totale: 11 test (7 base + 4 nuovi)

---

*Report generato il 2026-11-11. Non effettuare git commit.*
