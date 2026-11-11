# Piano: id stabili, traduzioni in i18n e remapping delle ricette

Obiettivo: ogni ingrediente del seme ha un **id inglese stabile** (es. `orange`), i **nomi visualizzati** stanno nei file di traduzione `it.json` / `en.json` (singolare e plurale, come le altre stringhe i18n), e le **ricette** si collegano agli id, non ai nomi.

Destinatario: un agente locale (qwen3.6). Esegui un passo alla volta. Ogni passo ha: input, output, regole, verifica. Se una regola non è chiara o un caso è ambiguo, **non indovinare**: marca il caso in `review` e passa oltre.

---

## 0. Vincoli generali (leggere prima di tutto)

- [ ] 0.1 Non fare `git commit`, `git push` o modifiche a file fuori da quelli elencati nei passi.
- [ ] 0.2 I file di lavoro vanno in `work/` (già ignorata da git). Crea sotto-cartelle `work/ingredients-ids/` e `work/recipes-remap/` quando servono.
- [ ] 0.3 Non inviare mai a Gemini o ad altri servizi la lista dei prodotti. Il catalogo resta locale.
- [ ] 0.4 Lingue supportate: solo `it` e `en` (file `src/i18n/locales/it.json` e `en.json`). Le due chiavi devono avere lo stesso insieme di chiavi.
- [ ] 0.5 Formato JSON: indent 1 per il seme (`src/data/ingredients.seed.json`), indent 2 per i locale. `ensure_ascii=False`. Mantieni il newline finale come nel file originale.
- [ ] 0.6 Prima di ogni modifica a un file in `src/`, crea un backup in `work/backup/<nome>.<data>.json`.
- [ ] 0.7 Dopo ogni passo esegui: `npx tsc --noEmit` (zero errori) e `for f in scripts/test_*.js; do NODE_PATH=$PWD/node_modules node $f >/tmp/o.txt 2>&1 || echo FAIL $f; done` (nessun FAIL). Se fallisce, fermati e riporta l'output.

**Stato di partenza noto:**
- Seme attuale: `src/data/ingredients.seed.json`, 752 voci. Campi per voce: `name`, `type`, `tags`, `edible_alone`, `default_amount`, `default_unit`, `purchase_amount`, `purchase_unit`, `density_g_per_ml`, `nutrients`. **Nessun campo `id`.**
- Ricette del catalogo: `src/data/recipes.catalog.json`, 835 ricette, 8333 righe `{ingredient, amount, unit, note, position}` in cui `ingredient` è il nome del seme.
- Ricette AI pulite: `work/ai-recipes/green-whisker-ai-clean-2026-11-11.json`, 22 ricette, campo `detailed_ingredients[].ingredient`.
- Lo schema `meal_plan` e la tabella `recipe_ingredients` usano `ingredient_id` (oggi uguale all'id del DB, generato a runtime). Vedi passo 7.

---

## 1. Schema dell'id

- [ ] 1.1 Regola per l'id: minuscolo, ASCII, parole separate da `_`, nessun accento, nessun articolo iniziale se il nome inglese è chiaro. Esempi: `orange`, `almond`, `dry_yeast`, `chickpea_flour`, `egg`, `egg_white`, `egg_yolk`.
- [ ] 1.2 Il nome inglese si ricava dal nome italiano usando la tabella `work/ingredients-ids/en_names.json` (costruiscila nel passo 2). Se un nome inglese non è sicuro, scrivi `"needs_review": true`.
- [ ] 1.3 Due voci non possono avere lo stesso id. Se capita, aggiungi il suffisso di tipo (`_fresh`, `_dried`, `_flour`), ma solo se la differenza è reale (es. `apple` vs `apple_juice`).
- [ ] 1.4 Output: `work/ingredients-ids/ids_draft.json`, un oggetto `{ "<name_it>": { "id": "...", "needs_review": false } }` per tutti i 752 nomi del seme.

Verifica 1: 752 chiavi, tutti gli id unici, tutti in formato `^[a-z][a-z0-9_]*$`.

---

## 2. Raggruppamento dei duplicati e degli alias

Obiettivo: più voci che indicano lo stesso prodotto (es. `Arancia` e `Arance`) diventano un solo id con alias.

- [ ] 2.1 Calcola una **chiave di gruppo** per ogni nome: minuscolo, senza accenti, senza `d'`/`di`/`del`, senza plurale finale (`-e`, `-i`, `-a` → forma base semplificata). Raggruppa per chiave.
- [ ] 2.2 Ogni gruppo con più di una voce va marcato. Scrivi `work/ingredients-ids/groups.json`: `[{ "key": "...", "members": ["Arancia", "Arance"], "proposed_id": "orange" }]`.
- [ ] 2.3 Decidi il **nome canonico** del gruppo: il singolare italiano più comune (per `Arancia`/`Arance` → `Arancia`). Il canonico diventa il nome di visualizzazione.
- [ ] 2.4 Le altre voci del gruppo diventano **alias** del canonico. Non cancellare nulla senza conferma: marca le voci da rimuovere in `work/ingredients-ids/to_remove.json` con motivo.
- [ ] 2.5 Non unire voci con differenza di prodotto acquistabile. Esempi che NON si uniscono: `Farina 0` e `Farina 00`; `Latte` e `Latte di soia`; `Pomodori pelati` e `Pomodori secchi`; `Yogurt bianco` e `Yogurt di soia`. Se dubbio, `needs_review: true` e nessuna unione.
- [ ] 2.6 Il numero di gruppi con più di 3 membri va verificato a mano: riportali nel report.

Verifica 2: ogni nome del seme appare in esattamente un gruppo o come voce singola; nessun nome perso (conta: voci in input = voci nei gruppi + voci singole).

---

## 3. Alias per la ricerca

Gli alias servono al riconoscimento (ricette importate, testo libero), non alla visualizzazione.

- [ ] 3.1 Per ogni id, costruisci la lista `aliases`: forma singolare e plurale in italiano, forma singolare e plurale in inglese, sinonimi reali (es. `Pomodori pelati` → alias di `Pomodori pelati in scatola` se è lo stesso prodotto).
- [ ] 3.2 Gli alias sono in minuscolo, senza accenti. Niente alias che coincidono con un altro id.
- [ ] 3.3 Salva in `work/ingredients-ids/aliases.json`: `{ "<id>": ["arancia", "arance", "orange", "oranges"] }`.

Verifica 3: nessun alias duplicato tra id diversi (se capita, elimina l'alias e segnala).

---

## 4. Traduzioni nei file i18n

Modello da seguire: le chiavi plurali di i18next usano `_one` e `_other` (già usate per `units.*`).

- [ ] 4.1 Per ogni id (con il canonico del gruppo), crea nei locale:
  - `ingredients.names.<id>_one`: nome singolare (it: `Arancia`; en: `Orange`);
  - `ingredients.names.<id>_other`: nome plurale (it: `Arance`; en: `Oranges`).
  Se il prodotto non ha un plurale naturale (es. `Sale`), usa lo stesso testo in `_one` e `_other`.
- [ ] 4.2 Ogni voce deve avere entrambe le lingue. Le chiavi devono essere identiche in `it.json` e `en.json`.
- [ ] 4.3 Scrivi i locale con `json.dump(indent=2, ensure_ascii=False)` e il newline finale, preservando tutte le altre chiavi. Fai un backup prima.
- [ ] 4.4 Non tradurre a mano le voci `needs_review`: lasciale con il nome italiano in entrambe le lingue e riportale nel report.

Verifica 4: script `node -e` che carica i due file, controlla che `Object.keys(it.ingredients.names)` sia uguale a quella di `en`, e che ogni id del seme abbia `_one` e `_other`.

---

## 5. Campi nel seme

- [ ] 5.1 Aggiungi a ogni voce del seme due campi, in quest'ordine, subito prima di `name`: `id` (stringa) e `aliases` (array di stringhe).
- [ ] 5.2 **Mantieni `name`** come nome italiano canonico: serve al fallback e agli script esistenti. Non rimuoverlo in questo piano.
- [ ] 5.3 Per le voci unite (passo 2), la voce canonica resta; le altre diventano alias e vengono rimosse dal seme solo dopo conferma (`to_remove.json`).
- [ ] 5.4 Scrivi il nuovo seme in `work/ingredients-ids/ingredients.seed.with_ids.json` prima di toccare `src/data/`. Verifica i conteggi, poi copia in `src/data/ingredients.seed.json` con backup.

Verifica 5: ogni voce ha `id` unico; `aliases` è un array; nessun campo perso; i conteggi di `to_remove` coincidono con la differenza di voci.

---

## 6. Codice: visualizzazione tramite i18n

Non fare questo passo finché i passi 1–5 non sono verificati.

- [ ] 6.1 Crea la funzione `ingredientDisplayName(ingredient, t)` in `src/utils/ingredientNames.ts`: ritorna `t('ingredients.names.' + id, { count, defaultValue: name })`. Parametro `count` opzionale per il plurale.
- [ ] 6.2 Usa la funzione dove oggi si mostra `ingredient.name` in UI: picker del planner (`MealPickerModal.tsx`), gestione ingredienti (`IngredientsModal.tsx`), lista spesa (`shopping.tsx`, solo dove è un nome di ingrediente da catalogo). Non cambiare i testi memorizzati (ingredient_text, name della lista spesa).
- [ ] 6.3 Il matching testuale (`matchCatalogName`, `src/utils/catalogNameMatch.ts`) usa `aliases` oltre a `name`.
- [ ] 6.4 Ogni modifica UI: `npx tsc --noEmit` e `npx eslint <file>` senza nuovi errori.

Verifica 6: cambiando lingua nell'app il nome visualizzato cambia (verifica manuale su dispositivo, da riportare come "non verificato" se non possibile).

---

## 7. Remapping delle ricette (id invece di nomi)

- [ ] 7.1 Tabella di mapping: `work/recipes-remap/name_to_id.json`, `{ "<name_it>": "<id>" }` per tutti i nomi del seme (passo 2 e 5).
- [ ] 7.2 Per `src/data/recipes.catalog.json`: aggiungi a ogni riga il campo `ingredient_id` calcolato dal mapping, lasciando `ingredient` invariato. Scrivi in `work/recipes-remap/recipes.catalog.with_ids.json`.
- [ ] 7.3 Per le ricette AI (`work/ai-recipes/green-whisker-ai-clean-2026-11-11.json`): per ogni `detailed_ingredients[]` aggiungi `ingredient_id`. Scrivi in `work/recipes-remap/ai-recipes.with_ids.json`.
- [ ] 7.4 Ogni nome senza mapping: non inventare. Lista in `work/recipes-remap/unmapped.json` con ricetta e riga. Il conteggio deve essere 0 per le ricette del catalogo.
- [ ] 7.5 Il codice che carica `recipe_ingredients` (`src/db/recipeIngredientsDb.ts`, `catalogSeedService.ts`) deve usare `ingredient_id` quando presente, e il nome come fallback. Modifica solo dopo i passi 1–7.1–7.4 verificati.
- [ ] 7.6 Il seed delle ricette (`seedRecipeLinksV2` ecc.) deve usare il nuovo campo; dopo la modifica, aggiungi un test che verifica che ogni riga di `recipes.catalog.json` abbia un `ingredient_id` esistente nel seme.

Verifica 7: `unmapped` vuoto per il catalogo; tutti i test `scripts/test_*.js` passano; il numero di righe ricetta resta 8333 per il catalogo.

---

## 8. Reseed e migrazione dei dati utente

- [ ] 8.1 Alza i flag di reseed per ingredienti e collegamenti (oggi v8). Usa i nomi `ingredients_seed_v9` e `recipe_links_v9` (costante `..._V9`), come già fatto in passato. Non toccare `READY_MEALS_FLAG_KEY_V3`.
- [ ] 8.2 Decisione già presa con l'utente: i pasti pianificati esistenti vengono azzerati dal reseed. Non scrivere una migrazione per loro.
- [ ] 8.3 La lista della spesa non cambia: resta testo (`name`, `ingredient_text`).
- [ ] 8.4 Documenta in un commento nel service che il reseed v9 cancella le voci planner legate agli ingredienti.

Verifica 8: flag letti dal codice = flag scritti; nessun flag precedente rimasto nel codice (`grep -rn "_v8'" src` deve essere vuoto per ingredienti e link).

---

## 9. Verifica finale e report

- [ ] 9.1 `npx tsc --noEmit`: zero errori.
- [ ] 9.2 `npx expo lint`: nessun errore nuovo rispetto alla baseline (25 problemi, 9 errori preesistenti).
- [ ] 9.3 Tutti gli script `scripts/test_*.js` passano.
- [ ] 9.4 Controllo i18n: `it.json` e `en.json` con chiavi identiche in `ingredients.names`.
- [ ] 9.5 Scrivi `docs/improve_ingredients_seed_report.md` con: numero di id, numero di gruppi uniti, lista `needs_review`, lista `to_remove`, lista `unmapped` (deve essere vuota), flag usati, risultati dei test.
- [ ] 9.6 Non committare. Lascia le modifiche nel working tree.

---

## 10. Condizioni di arresto

Fermati e riporta, senza continuare:
- un test o `tsc` fallisce e non è chiaro perché;
- un gruppo di unione contiene prodotti con acquisto diverso (passo 2.5 violato);
- ci sono più di 20 casi `needs_review` in un solo passo;
- un file da modificare non corrisponde a quanto descritto in "Stato di partenza noto".

In questi casi scrivi il problema in `docs/improve_ingredients_seed_report.md` sotto "Bloccanti" e non proseguire con i passi successivi.
