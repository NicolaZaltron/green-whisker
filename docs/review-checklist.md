# Checklist di revisione — branch feature/improve-shopping-list-and-planner

Revisione in sola lettura (modello Sonnet). Le affermazioni "verificato" sono state provate dal revisore con test o calcoli; le altre sono da confermare prima di correggere. Ogni voce è pensata per essere eseguita da sola (Haiku).

## Sommario

- Rischio complessivo: **ALTO**. tsc: 0 errori. Lint: 9 errori, 16 warning. I test in `scripts/` non toccano il database.
- Top 5 rischi:
  1. Un errore in `initDatabase` attiva il fallback web anche su nativo: l'utente vede dati vuoti (A1).
  2. Il consolidamento legge la lista fuori dalla transazione e riscrive tutto: aggiunte e modifiche concorrenti si perdono (B2).
  3. I reseed possono cancellare dati utente e, se un seed fallisce, i collegamenti ricette vanno persi per sempre (A5, A6, A7).
  4. Ricette utente/AI senza ingredienti collegati vengono ignorate in silenzio; tre percorsi aggiungono la spesa dal planner e si sommano (D2, D3).
  5. Matching per sottostringa in `densityFor` e fusioni errate in `normalizeIngredientKey` (D5, D6).

Nota: D1 è un regresso introdotto nella sessione (990 g diventa "1 g"): va corretto per primo.

---

## A. Dati e migrazioni

- [ ] **A1 (P0)** `src/db/database.ts` ~168-171, catch di `initDatabase`: qualsiasi errore imposta `isWebFallback = true` anche su nativo. Fix: su nativo rilanciare e mostrare schermata d'errore con "riprova"; fallback solo se `Platform.OS === 'web'`. Verifica: forzare un errore di migrazione e controllare che l'app non si apra vuota.
- [ ] **A2 (P0)** `src/db/catalogSchema.ts` ~36-88: la copia in `meal_plan` non normalizza `kind`; valori fuori dal CHECK fanno fallire la migrazione. Fix: `CASE WHEN kind IN (...) THEN kind ELSE 'recipe' END` o scartare e contare. Verifica: test con DB che ha `kind` sporco.
- [ ] **A3 (P1)** `catalogSchema.ts` ~60-87: il ramo vecchio scarta le righe `food_id`; il ramo con colonne assume `amount, unit, count, label`. Fix: costruire la lista colonne dall'intersezione con `PRAGMA table_info`. Verifica: test con 3 schemi di partenza.
- [ ] **A4 (P1)** `database.ts` ~185-212 (`migrateMealPlanTable`) e ~108-118: due migrazioni sulla stessa tabella, indice creato due volte. Fix: una sola `CREATE TABLE meal_plan` nello schema finale; eliminare `food_id`. Verifica: `PRAGMA table_info(meal_plan)` identico su DB nuovo e vecchio.
- [ ] **A5 (P0)** `src/services/ingredientsService.ts` ~52-68 (`seedIngredientsV2`): cancella ingredienti uno a uno (non atomico), cancella anche voci planner e link, perde gli ingredienti creati dall'utente. Fix: un'unica transazione; preservare ingredienti utente e rimappare le voci planner per nome. Verifica: ingrediente personalizzato e voce planner sopravvivono al reseed.
- [ ] **A6 (P0)** `catalogSeedService.ts` ~140-150 + `src/app/_layout.tsx` ~66-80: i seed hanno try/catch indipendenti. Se fallisce quello degli ingredienti, i link girano con id vecchi e impostano il flag; al lancio successivo i link spariscono per sempre. Fix: eseguire i link solo se gli ingredienti sono riusciti (stessa sequenza), o unire i due in una transazione. Verifica: il flag dei link non deve essere impostato se il primo seed fallisce.
- [ ] **A7 (P0)** `database.ts` ~1079-1095 (`getKV`/`setKV`): `getKV` su errore restituisce `null` (il seed riparte e cancella), `setKV` ingoia l'errore. Fix: far lanciare entrambi; impostare il flag nella stessa transazione dei dati. Verifica: con `getKV` che lancia, il seed non cancella nulla.
- [ ] **A8 (P1)** `src/db/recipeIngredientsDb.ts` ~27-48 e `catalogSeedService.ts` ~80-90: `DELETE FROM recipe_ingredients` globale. Fix: cancellare solo le ricette presenti nel seed. Verifica: una riga di ricetta non-seed sopravvive.
- [ ] **A9 (P1)** `src/db/readyMealsDb.ts` ~185-215 (`replaceReadyMeals`): cancella pronti utente e voci planner `kind='ready'`. Fix: upsert per nome in `seedReadyMealsV2`, senza cancellare. Verifica: pronto personalizzato e voce planner sopravvivono.
- [ ] **A10 (P1)** `database.ts` ~418-565 (`consolidateShoppingList`): riscrive tutta la lista a ogni aggiunta. Fix: scrivere solo se `hasChanges` e solo le righe modificate. Vedi B2, E1.
- [ ] **A11 (P2)** `database.ts` ~1204-1236 (`removeRecipeReferences`): quattro DELETE senza transazione. Fix: `runQueuedTransaction`.
- [ ] **A12 (P2)** `database.ts` ~1238-1250 (`deleteCatalogRecipes`) e chiamante: cancellazione e pulizia riferimenti separate. Fix: una sola funzione transazionale.

## B. Concorrenza e transazioni

- [ ] **B1 (P0)** `database.ts` ~70-75 (`runQueuedTransaction`): le scritture non in coda (toggle, update quantità, delete, `saveMealPlanEntryDetailed`, `setKV`...) eseguite durante una transazione aperta entrano in essa e vengono annullate con il ROLLBACK. Fix: far passare tutte le scritture da un helper `runWrite` in coda, oppure usare `withExclusiveTransactionAsync` (verificare la doc SDK della major di `expo`). Verifica: scrittura durante transazione che fallisce.
- [ ] **B2 (P0)** `database.ts` ~418-455: `getShoppingItems()` è letto fuori dalla transazione, poi DELETE + reinserimento: un'aggiunta concorrente sparisce. Fix: lettura, calcolo e scrittura dentro la stessa transazione (`getAllAsync` al suo interno). Verifica: due `addShoppingItems` in parallelo più un consolidamento: tutte le righe presenti.
- [ ] **B3 (P1)** `database.ts` ~315-413 (`addShoppingItems`): consolidamento chiamato fuori dalla coda. Fix: insert e consolidamento in un'unica transazione. Verifica: stesso test di B2.
- [ ] **B4 (P1)** `typeof withTransactionAsync` ripetuto in `database.ts` (~358, ~554, ~949, ~1193), `simpleItemsDb.ts` ~336, e `runInTransaction` in `ingredientsDb.ts` ~85, `recipeIngredientsDb.ts` ~16, `readyMealsDb.ts` ~77. Se manca il metodo, la funzione gira senza transazione. Fix: un solo `runInTransaction`. Verifica: `grep -rn withTransactionAsync src` dà un solo risultato.
- [ ] **B5 (P1)** `database.ts` ~838-868 (`updateMealPlanEntryDetailed`): due UPDATE separati non atomici. Fix: un solo UPDATE o transazione.
- [ ] **B6 (P1)** `shopping.tsx` ~115-150 e ~228-240: toggle/delete ottimistici senza rollback né gestione dell'esito. Fix: rollback su errore o ricaricamento da DB.
- [ ] **B7 (P2)** `ingredientsService.ts` ~52-68: il reseed gira in `prepare()` ma la UI può già leggere. Fix: garantire che nessuna UI scriva prima della fine di `prepare()`.

## C. Parità web / nativo

- [ ] **C1 (P1)** `database.ts` ~644-660 (`getMealPlans`): SQL ordina per `slot` alfabetico, web non ordina. Fix: ordinare in un punto unico (`date`, indice di `SLOT_ORDER`, `created_at`). Verifica: tre voci inserite in ordine sparso.
- [ ] **C2 (P1)** `database.ts` ~276-300 (`getShoppingItems`): ordinamento diverso tra SQL e web. Fix: stesso sort nei due rami.
- [ ] **C3 (P1)** `database.ts` ~518-525 (ramo web di consolidamento): nessuna gestione di quota. Vedi C5.
- [ ] **C4 (P1)** `readyMealsDb.ts` ~190-195 e `ingredientsDb.ts` `deleteIngredient` ~220-228: predicato web diverso da SQL (`!e.ready_meal_id`). Fix: stesso predicato. Verifica: test di parità con fake DB.
- [ ] **C5 (P0 per web)** `database.ts` ~54-64 (`setWebData`): su `QuotaExceededError` cade in memoria e i dati si perdono al ricaricamento senza avviso. Fix: errore visibile, non persistere dati derivabili dal seed, non riscrivere tutto a ogni modifica.
- [ ] **C6 (P2)** web: ogni `deleteIngredient` riscrive tre chiavi intere (O(n²)). Fix: una sola scrittura.
- [ ] **C7 (P2)** `getKV/setKV` usano chiavi non prefissate, `getWebData/setWebData` usano `gw_*`. Fix: un solo prefisso.

## D. Correttezza (spesa, planner, unità)

- [ ] **D1 (P0, regresso mio)** `database.ts` ~414-416 e ~500-520: la scelta di unità usa il peso NON arrotondato, la conversione quello arrotondato a 25 g. Con 990 g: importo 1000, `toLargerUnit` = 1, unità `g` → "1 g". Fix: arrotondare prima, poi scegliere unità e divisione sullo stesso valore. Verifica: 990, 999, 1000, 1010 g e ml.
- [ ] **D2 (P0)** `ShoppingPlanModal.tsx` ~86-90 e `shoppingPreview.ts` ~85: ricette utente/AI non hanno righe in `recipe_ingredients` e vengono ignorate senza avviso. Fix: usare gli ingredienti della ricetta scalati, oppure mostrare "N ricette senza ingredienti collegati". Verifica: ricetta senza link in `test_shopping_preview.js`.
- [ ] **D3 (P0)** `planner.tsx` ~198-258, ~314-323 e `ShoppingPlanModal`: tre percorsi aggiungono la spesa e si sommano. Fix: un solo flusso (consigliato: `ShoppingPlanModal`); rimuovere auto-add e `aggregateAndAddToShopping` (`plannerService.ts` ~997). Verifica: stessa ricetta due volte, la lista non raddoppia.
- [ ] **D4 (P1)** `shoppingPreview.ts` ~100-110: i pronti hanno chiave `ready:` che non combacia con `listByKey`, quindi "già in lista" non si rileva mai. Fix: stessa chiave. Verifica: pronto già in lista dà `missing = 0`.
- [ ] **D5 (P1)** `ingredientDensity.ts` ~44-55 (`densityFor`): match per sottostringa su chiavi stemmate ("semola" 0.6, "olive" 0.92, "pastinaca" 0.5, "risotto" 0.8). Fix: confronto per token interi; aggiornare il commento. Verifica: i casi sopra devono dare `null`.
- [ ] **D6 (P1)** `ingredientAggregator.ts` ~196-258 (`normalizeIngredientKey`): fonde "noce di cocco" con "noci", "sedano rapa" con "sedano". Fix: regole specifiche prima delle generiche, test di non-fusione.
- [ ] **D7 (P1)** `servingsScaler.ts` ~76-80: `Math.max(1, Math.round(x))` trasforma 0.5 cucchiaino in 1 e 1.5 kg in 2 kg. Fix: interi solo per g/ml e unità a conteggio; mezzi o decimale per cucchiai, kg, l; minimo 1 solo se l'originale era >= 1. Verifica: 0.5 cucchiaino, 0.25 cucchiaino, 1.5 kg.
- [ ] **D8 (P1)** `database.ts` ~418-480: il consolidamento altera le quantità inserite a mano (minimo 50 g, arrotondamento a 25 g). Fix: non arrotondare valori manuali, marcare le righe manuali. Verifica: 30 g manuali restano 30 g.
- [ ] **D9 (P1)** `database.ts` ~425-440 (`isNonPurchasableItem`): una voce manuale "acqua..." viene scartata alla riconsolidazione. Fix: filtro solo per righe da ricetta. Verifica: "acqua frizzante" manuale resta.
- [ ] **D10 (P1)** `database.ts` ~478-487 (`hasChanges`): confronto per indice tra liste con ordine diverso. Fix: confronto per id e per tutti i campi. Verifica: due consolidamenti di fila, la seconda senza scritture.
- [ ] **D11 (P2)** `database.ts` ~432: `if (all.length === 0) return 0;` duplicato. Rimuovere.
- [ ] **D12 (P1)** `shoppingPlanSave.ts` 21-48 e `ShoppingPlanModal.tsx` ~175: usa solo `sources[0]` come titolo e dedup su `name|unit` senza sommare. Fix: concatenare le etichette, sommare i duplicati.
- [ ] **D13 (P1)** `shoppingPreview.ts` ~140-150 (fusione null): sceglie la prima riga quantificata in modo arbitrario. Fix: scelta deterministica.
- [ ] **D14 (P2)** `shoppingPreview.ts` ~14, 40-55 (`UNIT_ALIASES`) diverso da `unitConversion.ts` `ALIASES`. Vedi G2.
- [ ] **D15 (P2)** `planner.tsx` ~348: commento "4 slot" ma `SLOT_ORDER` ha 5. Allineare commento e contatore.
- [ ] **D16 (P2)** `planner.tsx` ~336-343 (`handleClearWeek`): una cancellazione per voce invece di `deleteMealPlanForDates`.
- [ ] **D17 (P2)** `shoppingPreview.ts` ~12 (`CHECKED_COUNTS_AS_IN_LIST = true`): una voce già comprata conta come "in lista". Decisione di prodotto.

## E. Prestazioni

- [ ] **E1 (P1)** `database.ts` ~315-413: ogni aggiunta rilegge, riclassifica e riscrive tutta la lista. Fix: A10, passare solo i nuovi elementi. Verifica: contare le `runAsync`.
- [ ] **E2 (P1)** `shopping.tsx` ~177-200 (`groupedSections`): crea un oggetto nuovo per ogni riga a ogni cambio, quindi le memo di riga non servono. Fix: riusare gli oggetti. Verifica: React Profiler su un toggle.
- [ ] **E3 (P1)** `planner.tsx` ~101-107 (`loadPlans`): ricarica sempre ingredienti e pronti. Fix: caricarli una volta; dopo le azioni solo `getMealPlans()`.
- [ ] **E4 (P1)** `ShoppingPlanModal.tsx` ~86 e `recipeIngredientsDb.ts` ~55-100: una query per ricetta (N+1), nel web rilettura completa per ogni ricetta. Fix: `listRecipeIngredientsBulk(ids)` con `WHERE recipe_id IN (...)`.
- [ ] **E5 (P2)** `shopping.tsx` ~120-130 e ~308: catalogo ricaricato e filtrato a ogni tasto. Fix: cache a livello di modulo con invalidazione.
- [ ] **E6 (P2)** `ingredientsService.ts` e `catalogSeedService.ts`: primo avvio con migliaia di INSERT sequenziali nella splash. Fix: insert multi-riga a blocchi.
- [ ] **E7 (P2)** `ingredientsDb.ts` ~124-142 `listIngredients`: legge sempre i nutrienti. Fix: parametro `withNutrients`.

## F. Gestione errori

- [ ] **F1 (P0)** `database.ts` ~407 e `shopping.tsx` ~245-265 (`addItemByName`): l'errore viene ingoiato e la UI mostra "aggiunto". Fix: propagare, mostrare errore, mantenere il testo.
- [ ] **F2 (P1)** `database.ts` ~543-548 (`consolidateShoppingList`): errore ingoiato. Fix: rilanciare.
- [ ] **F3 (P1)** `database.ts` ~698 e ~830 (`saveMealPlanEntry*`) e funzioni simili: restituiscono come se fossero salvate; un errore di lettura sembra un planner vuoto. Fix: lanciare e mostrare toast in `planner.tsx`.
- [ ] **F4 (P1)** `database.ts` (`getShoppingItems`, preferiti, toggle, delete, clear): `catch` che restituisce un valore di default. Fix: lanciare e gestire in UI.
- [ ] **F5 (P1)** `_layout.tsx` ~66-80: i seed falliti stampano solo `console.warn`. Fix: banner "Catalogo non aggiornato" con riprova, flag non impostato.
- [ ] **F6 (P2)** `IngredientsModal.tsx` ~133 e ~230-305: controllare cosa mostrano i catch. Non letto per intero.
- [ ] **F7 (P2)** `planner.tsx` ~308-343: nessun try/catch nei handler. Fix: wrapper `safeAction` con toast.

## G. Duplicazioni e refactoring

- [ ] **G1 (P1)** `runInTransaction` duplicato (vedi B4). Casa unica in `database.ts`.
- [ ] **G2 (P1)** Tabelle unità duplicate: `shoppingPreview.ts` 40-48, `unitConversion.ts` 9-23, `ingredientAggregator.ts` 54-79, `servingsScaler.ts` (`UNIT_PLURALS`, `KNOWN_UNITS`), `constants/shoppingUnits.ts`. Fix: `src/constants/units.ts` come unica fonte; test di parità.
- [ ] **G3 (P1)** Slot duplicati: `types/recipe.ts` 86 e 103, `plannerService.ts` 166-173, `simpleSlots.ts` 3, union in `database.ts`. Fix: `src/constants/slots.ts`.
- [ ] **G4 (P2)** `ShoppingPlanModal.tsx` 26 (`getLocalToday`) duplica `utils/dates.ts`; `recipeBookService.ts` 95 usa `toISOString` (sfasamento di un giorno). Fix: `toLocalDateString`.
- [ ] **G5 (P2)** Campo di ricerca con X ripetuto in cinque schermate. Fix: `src/components/SearchField.tsx`.
- [ ] **G6 (P2)** Pattern seed "flag, importa, setKV" ripetuto. Fix: `runSeedOnce` in `src/services/seedRunner.ts` (vedi A5-A7).
- [ ] **G7 (P2)** `requireDb` e `readWeb` ripetuti nei moduli db. Fix: helper in `database.ts`.
- [ ] **G8 (P2)** Struttura modale ripetuta in `ShoppingPlanModal`, `IngredientsModal`, `MealPickerModal`. Verificare uso di `SheetModal`.

## H. Struttura e codice morto

- [ ] **H1 (P1)** `src/db/simpleItemsDb.ts` (389 righe), `src/data/simpleItemsSeed.ts` (181 righe), `removeRecipeFromSimpleItems` e chiave `gw_simple_items`: codice legacy. Fix: eliminare il codice; la tabella nel DB utente resta (o `DROP` in migrazione).
- [ ] **H2 (P1)** Seed v1 non usati (`seedIngredientsIfEmpty`, `seedRecipeLinksIfEmpty`, `seedReadyMealsIfEmpty`). Fix: rimuovere; unificare in `ensureCatalogSeed` con un'unica versione.
- [ ] **H3 (P2)** Warning di lint su import e funzioni non usate (`database.ts` 3, 13, 14, 315; `plannerService.ts` 527, 793, 1001; `shoppingPreview.ts` 35; `ingredientAggregator.ts` 1). Fix: rimuovere o convertire.
- [ ] **H4 (P1)** File troppo grandi: `shopping.tsx` 1386 righe, `RecipeModal.tsx` 1820, `planner.tsx` 992, `MealPickerModal.tsx` 682, `IngredientsModal.tsx` 786, `plannerService.ts` 1098, `database.ts` 1293. Fix: separare per feature (`features/shopping/*`, `shoppingDb.ts`, `mealPlanDb.ts`, `kvDb.ts`) senza cambiare comportamento.
- [ ] **H5 (P2)** Logica di business nelle schermate (`planner.tsx` 198-258, `shopping.tsx` 120-130). Fix: spostare in servizi testabili.
- [ ] **H6 (P2)** Componenti per feature: creare `src/components/shopping/` e `src/components/catalog/`.
- [ ] **H7 (P2)** JSON grandi importati a livello di modulo. Fix: `import()` dinamico quando serve il seed.

## I. Test e strumenti

- [ ] **I1 (P0)** Nessun test tocca `database.ts`. Fix: `scripts/test_db_fake.js` con un fake DB in memoria (o `better-sqlite3` in dev) e test per D1, B2, A7, A2.
- [ ] **I2 (P1)** Nessun test per planner `kind='out'`, quantity sheet (`parseQuantityText`, `toSelectableUnit`) né transizioni dei flag. Fix: test unitari; estrarre `parseQuantityText` in `src/utils/`.
- [ ] **I3 (P1)** `test_ingredients_seed.js` ha `EXPECTED_COUNT` fisso (723). Fix: verificare vincoli, non il conteggio.
- [ ] **I4 (P2)** `test_recipe_units.js` stampa "need null: 2224" senza soglia. Fix: asserire un tetto.
- [ ] **I5 (P2)** Mancano casi per D2, D4, D13. Aggiungerli.
- [ ] **I6 (P1)** Lint: 9 errori, 16 warning. Errori in `RecipeModal.tsx` (100, 123, 478), `FavoritesContext.tsx` 27, e tre da rileggere. Fix: correggere quelli nei file toccati dal branch. Verifica: `npx expo lint && npx tsc --noEmit`.
- [ ] **I7 (P2)** Aggiungere `npm test` che lancia tutti gli script `scripts/test_*.js`.

## J. i18n

- [ ] **J1 (P1)** Stringhe fisse in italiano: `shopping.tsx` ~335 e ~338, `planner.tsx` ~257 e ~207, `plannerService.ts` ~1018 (`porz.`). Fix: chiavi i18n.
- [ ] **J2 (P1)** `constants/outOfHome.ts`: le etichette italiane sono salvate in `meal_plan.label`. In inglese restano italiane, e rinominarle rompe i dati salvati. Fix: chiave stabile tradotta in visualizzazione, con migrazione.
- [ ] **J3 (P2)** Chiavi i18n possibilmente morte da verificare (script che cerca anche i template dinamici) prima di rimuoverle da entrambi i file. `it.json` e `en.json` sono oggi allineati.

---

## Non verificato / serve decisione o dispositivo

- Semantica reale di `withTransactionAsync` nella SDK in uso (B1): leggere la doc della major di `expo`.
- Installazioni reali con schemi intermedi di `meal_plan` (A2, A3): controllare `PRAGMA table_info(meal_plan)` e `SELECT DISTINCT kind` su un DB reale.
- Decisioni di prodotto: D17 (voci comprate "in lista"), A5 (ingredienti utente da preservare), D3 (flusso unico della spesa dal planner).
- Quota localStorage su web (C5): misurare le dimensioni reali.
- Tempi di primo avvio (E6) e fluidità della spesa con liste lunghe (E2).
- Non letti per intero: `plannerService.ts`, `MealPickerModal.tsx`, `IngredientsModal.tsx`, `RecipeModal.tsx`, `PlannerPreferencesModal.tsx`, `simpleItemsDb.ts`. Possibili problemi di correttezza lì non sono coperti.
- Lint su HEAD non confrontato: gli errori di `RecipeModal.tsx` sono probabilmente preesistenti.
