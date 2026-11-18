# Piano: refactoring del database locale

Stato: **fasi 0–9 implementate**, con backup e ripristino completo (`src/services/backupService.ts`, modale comune `TransferModal`). Correzioni dal controllo di Sonnet: alias letti anche su nativo, versioni dei seed in `seed_meta` (il reseed non cancella più ingredienti), seed delle ricette predefinite robusto, cancellazioni affidate alle chiavi esterne. I punti di media priorità della sezione 13 sono chiusi (validazione delle ricette, cache del catalogo, divisione di `database.ts` per tabella) (fase 8 completata tranne esportazione e importazione delle opzioni Fuori casa dalle impostazioni, rimandate per decisione D20) (17 novembre 2026, branch `feature/db-refactoring`, non committate). Deviazioni rispetto al piano: i nomi delle tabelle sono ancora al plurale (`ingredients`, `recipe_ingredients`, …), la rinomina è rimandata alla fase 8; i nutrienti restano in formato lungo; `simple_items` non è ancora rimosso (D18 è da completare); il web usa ancora `localStorage` (fase 9). Fasi 6–9: ricerca tollerante con confronto parola per parola (test con refusi); spesa legge solo le porzioni future non già pronte (query dedicata) e il generatore legge una finestra di storico di 56 giorni (L14); web apre SQLite (WASM) come il telefono, con localStorage solo come riserva se SQLite non si apre; porzioni obbligatorie 1–24 all'import, senza fallback a 4. Fase 8: tabelle al singolare (schema v3), nutrienti in una riga larga per ingrediente, voci semplici rimosse (D18), opzioni Fuori casa in tabella seminata dalla costante (D20). Fase 5: il catalogo è diviso in `recipe` (riepilogo JSON più colonne indicizzate, in memoria) e `recipe_body` (corpo della scheda, caricato per id con `getRecipeDetail`). Le liste non caricano più le istruzioni. Restano da fare: lettura del planner per intervallo di date in `plannerService` (L14) e la scrittura nativa del corpo verificata solo tramite lo schema. Fase 3: schema versionato `user_version = 1` in `src/db/schema.ts`, con chiavi esterne e `CHECK`; le migrazioni vecchie sono rimosse e i dati vengono ricreati da zero. Fase 4: modale di risoluzione degli ingredienti sconosciuti (`UnresolvedIngredientsModal`), import con transazione unica e alias salvati per le scelte "collega".

Stato precedente: piano approvato. Fonti: `docs/APP_REFERENCE.md`, verifiche di codice del 13 novembre 2026, aggiornate il 17 novembre 2026 (controllo di Haiku e revisione critica di Opus). I riferimenti di riga sono indicativi. Le stime di tempo e dimensione sul telefono non sono misurate.

## 1. Obiettivo

- I file JSON (`assets/ricette.json`, `src/data/*.json`) sono solo la base per l'import.
- L'import popola tabelle locali leggere con id stabili e leggibili.
- Le letture sono query SQL mirate. Non si carica una tabella intera in JavaScript per filtrarla.
- Il web usa lo stesso motore SQLite del telefono, così il codice è uno solo.
- Obiettivi trasversali: prestazioni sul telefono, manutenibilità nel tempo.

## 2. Decisioni prese

| # | Decisione | Conseguenza |
|---|---|---|
| D1 | Il web è supportato per il debug | Stesso motore su web e nativo: `expo-sqlite` su WASM (D12) |
| D2 | La ricerca tollera errori su titoli di ricette e nomi di ingredienti | Un solo livello: Fuse su un indice leggero in memoria, uguale su nativo e web (D13) |
| D3 | Id parlanti e fissi, niente id casuali | Vedi sezione 3 |
| D4 | Le righe del planner (`meal_plan.id`) restano con id casuale | Chiavi interne, non entità condivise: nessuna migrazione |
| D5 | Il vocabolario dello svuotafrigo usa gli id del seme | Il suggerimento salva e confronta per id, non per nome |
| D6 | Gli ingredienti del seme hanno già id unici in inglese (es. `salt`) e vanno mantenuti | Il codice oggi li scarta (`upsertIngredientsByName`) e genera id casuali: va corretto. Nessuna traduzione da fare |
| D7 | Una riga di ricetta senza corrispondenza non entra nel database | Durante l'import, per ogni ingrediente sconosciuto l'utente sceglie: cercarlo tra i noti, oppure crearne uno nuovo con quel nome, oppure escludere la ricetta. Poi l'import prosegue. Non si scrive nulla finché tutte le righe non sono risolte |
| D8 | Primo avvio su dispositivo vergine | Si caricano dal seme: ingredienti, pronti confezionati e ricette predefinite (`source = 'bundled'`). Le ricette di `ricette.json` si importano dall'utente, con `source = 'catalog'` |
| D18 | Ricette semplici | Diventano ricette predefinite complete di ingredienti collegati, nel formato di `ricette.json`, generate una volta e incluse nell'app. Il tag "simple recipe" e la tabella dei simple item escono dal piano. Porzioni di default: 2. La spesa segue `recipe_source` come per ogni ricetta |
| D19 | Pronti confezionati | La tabella `ready_meal` resta solo per i prodotti confezionati, con nutrienti per porzione dove disponibili. Il seme ha 63 voci (62 più la peperonata, aggiunta il 17 novembre 2026). Tonno all'olio e sgombri sono nel seme degli ingredienti (`tonno_all_olio_di_oliva`, `sgombro_al_naturale`, `sgombro_all_olio_di_oliva`), non nei pronti. I nutrienti dello sgombro al naturale vengono da USDA sr_legacy 175121 (sgombro jack in scatola, sgocciolato), per 100 g. Lo sgombro all'olio è una stima (USDA + 10 g di olio d'oliva per 100 g), da verificare |
| D20 | "Fuori casa" in tabella | Le voci passano da `src/constants/outOfHome.ts` alla tabella `out_of_home_option`, con id stabili dal seme. Il pasto pianificato conserva il testo in `label`, senza chiave esterna. Export e import dalle impostazioni sono una funzione a parte, da decidere dopo la fase 3 |
| D21 | Ogni ingrediente delle ricette predefinite deve risolvere a un id del seme prima che il file sia incluso | Controllo fatto alla generazione: nessuna risoluzione manuale al primo avvio |
| D9 | Pronti | Nutrienti solo per porzione. Il seme dei pronti ha id slug (oggi mancano e vanno aggiunti). Seme versionato e revisionabile: l'app lo ricarica con upsert per id, senza perdere le voci del planner |
| D10 | Eliminare un ingrediente | Resta la cancellazione a cascata dei pasti pianificati che lo usano, ma una modale di avviso elenca i pasti che verranno rimossi prima della conferma |
| D11 | Porzioni delle ricette | Tutte le ricette hanno `servings`. Quelle che non lo hanno si stimano in una fase di pulizia di `ricette.json`, prima dell'import |
| D12 | Web con `expo-sqlite` su WASM, non un adattatore JS | Verificato sulla documentazione SDK 58 (`expo-sqlite` ~58.0.15): il web è supportato con wa-sqlite, senza FTS. Serve `metro.config.js` con `wasm` in `assetExts`, header COOP/COEP sull'hosting e `SharedArrayBuffer`. `withExclusiveTransactionAsync` non è supportato sul web. **Non documentato: dove e come i dati persistono sul web.** Va provato in pratica come prima attività della fase 2. Ripiego se la persistenza non regge: DB in memoria ricostruito dal JSON, solo per debug. IndexedDB escluso |
| D13 | Ricerca senza FTS5 | Solo Fuse sull'indice leggero (`title_key` più nomi degli ingredienti). FTS5 non è disponibile sul web e non tollera i refusi |
| D14 | Ingredienti creati dall'utente con id `user_<slug del nome scritto>` | Suffisso `_2` in caso di collisione. Il prefisso evita collisioni con il seme e permette al reseed di toccare solo `source = 'seed'` |
| D15 | Ricette: slug italiano del titolo (invariato) | Il vincolo dell'inglese vale solo per gli ingredienti |
| D16 | Filtri del ricettario in JavaScript sull'indice in memoria | 835 oggetti leggeri si filtrano in pochi millisecondi, con lo stesso codice su web e nativo |
| D17 | Schema snello | Eliminati: `unit_code`/`base_amount` e tabella `unit`, `department`, `status` su `meal_plan`, `updated_at` ovunque, `slot_def`, `import_report`, `source` su `shopping_item`. Restano chiavi esterne, `CHECK`, `title_key`/`name_key`, `simple_item_recipe`, alias |

## 3. Convenzione degli id

| Entità | Id attuale | Id nel piano | Note |
|---|---|---|---|
| Ingredienti del seme | casuale `ing-<timestamp>-<rnd>` (il seme ha già l'id, non viene salvato) | id del seme, es. `salt`, `extra_virgin_olive_oil` | D6: il seed salva l'id, non lo genera |
| Ingredienti creati dall'utente | casuale | `user_<slug del nome scritto>`, `_2` in collisione | D14 |
| Ricette del catalogo | slug del titolo | invariati | D15 |
| Ricette AI (`custom-…`) | `custom-<titolo>-<rnd>` | `custom-<slug del titolo>`, `-2`, `-3` in collisione | nessuna migrazione: si reimportano |
| Pronti | non hanno id nel seme; nel DB sono `rm-<rnd>` | slug nel seme, es. `chickpea_hummus_jar` | D9: id da aggiungere a `readyMeals.seed.json`, `replaceReadyMeals` diventa upsert per id |
| Righe del planner (`meal_plan.id`) | `plan-<data>-<slot>-<rnd>` | invariato (D4) | chiavi interne |

**Nessuna migrazione.** Il dispositivo riparte da zero: si cancellano i dati dell'app e si reimportano ricette e seed. Non ci sono pasti, liste della spesa o altri dati da preservare. Restano da reimportare le ricette AI, dal file `work/current/ai-recipes.json`.

**Primo avvio su dispositivo vergine (D8):** ingredienti e pronti si caricano dal seme; le ricette partono vuote e si importano da JSON (`assets/ricette.json` o file scelto dall'utente).

## 4. Tabelle

Nomi e colonne del piano. La colonna "Oggi" indica il nome attuale nel codice (`src/db/catalogSchema.ts`, `src/db/database.ts`).

| Tabella | Oggi | Contenuto | PK e indici | Letture in SQL |
|---|---|---|---|---|
| `recipe` | `catalog` (JSON intero per ricetta) | indice leggero: id, titolo, `title_key`, categoria, difficoltà, porzioni (NOT NULL), minuti, `recommended_slot` (testo, `CHECK`), `diet` (testo, `CHECK`), `tags` (JSON), `seasons` (colonna), origine, `variant_of`, `is_listed`, immagine, `user_modified` | PK `id`; indici su categoria, `variant_of` | liste, filtri (in JS, D16), planner, preferiti |
| `recipe_body` | dentro `catalog` | un'unica colonna JSON: istruzioni, consigli, fonte, URL, tempi completi, sezioni | PK `recipe_id` | apertura della scheda |
| `recipe_ingredient` | `recipe_ingredients` | posizione, sezione, testo, quantità, unità, nota, `ingredient_id` **NOT NULL**, `REFERENCES ingredient ON DELETE CASCADE` | PK (`recipe_id`, `position`); indice su `ingredient_id` | dettaglio, spesa, pasti |
| `ingredient` | `ingredients` | id del seme, nome, `name_key`, tipo, tag (JSON), mangiabile da solo, acquisto, porzione, densità, `source` (`seed`/`user`) | PK `id`; indici su tipo, `name_key` | liste, picker, spesa |
| `ingredient_alias` | non esiste | (`alias_key`, `ingredient_id`) | PK `alias_key`; indice su `ingredient_id` | matching in import e ricerca |
| `ingredient_nutrition` | `ingredient_nutrients` (formato lungo, 10.359 righe) | una riga per ingrediente, 16 colonne REAL fisse, per 100 g | PK `ingredient_id` | scheda ingrediente, calcoli; la lista leggera non li carica |
| `ready_meal` | `ready_meals` (nutrienti in JSON) | id slug, nome, categoria, tag (JSON), slot, porzione default, nutrienti per porzione (colonne REAL) | PK `id` | picker |
| `meal_plan` | `meal_plan` | come oggi, con `recipe_source` e `servings` | indici su (`date`), (`date`, `slot`), `recipe_id`, `ingredient_id`, `ready_meal_id` | settimana, spesa futura (filtro `date >= oggi` in SQL) |
| `shopping_item` | `shopping_items` | come oggi | indice su (`checked`, `category`), `recipe_id` | lista |
| `out_of_home_option` | `constants/outOfHome.ts` | voci "Fuori casa", con id stabili dal seme e modificabili dall'utente (D20) | PK `id` | picker |
| `favorite`, `recipe_note` | `favorites`, `recipe_notes` | come oggi, con chiave esterna su `recipe` | PK `recipe_id` | preferiti |
| `kv_store` | `kv_store` | solo preferenze planner e impostazioni AI | PK `key` | config |
| `seed_meta` | flag in `kv_store` | (`name`, `version`) | PK `name` | controllo import |

**Eliminate:** `catalog` (JSON intero), `custom_recipes`, `recipe_tag`, `recipe_fts`, `unit`, `department`, `slot_def`, `import_report`, `simple_items` e `recipe_ids` (D18: le voci semplici diventano ricette predefinite, quindi non serve più il collegamento voce–ricetta). I flag di seed in `kv_store` passano a `seed_meta`.

**Non entrano nel DB:** provenienza e attendibilità dei dati nutrizionali (restano nei file di lavoro), normalizzazione e consolidamento della spesa in JavaScript (regole di unità e aliasing, D17), matching fuzzy dell'import AI in JavaScript, generatore settimanale in JavaScript sui dati letti da SQL.

## 5. Ricerca tollerante (D13)

Un solo livello, lo stesso su web e nativo: **Fuse** su un indice leggero in memoria (`id`, `title_key`, nomi degli ingredienti della ricetta). L'indice è costruito dalla tabella `recipe` e da `recipe_ingredient`, non dal JSON completo.

Il corpus è piccolo (835 ricette, 980 ingredienti), quindi l'indice sta in memoria senza problemi. Il test di accettazione è un insieme di query con refusi (es. "cannlloni", "zuchine", "risotto zafferno") che devono trovare la ricetta giusta tra i primi tre risultati.

## 6. Web (D12)

- Il web usa `expo-sqlite` su WASM, lo stesso motore e le stesse query del telefono. Oggi `initDatabase` imposta `isWebFallback = true`: quel ramo e i circa 65 riferimenti a `isWebFallback`/`isWebMode` in `src` e `scripts` vanno eliminati.
- Verificato sulla documentazione SDK 58: supporto web, `wasm` in `assetExts`, header COOP/COEP, `SharedArrayBuffer`. Non verificato: la persistenza sul web (prototipo nella fase 2).
- Se il WASM non regge: DB in memoria ricostruito dal JSON a ogni caricamento. È solo per il debug.
- Il catalogo (circa 11 MB nel DB oggi) non entra in `localStorage`: il problema P1 in sezione 11 sparisce con questa scelta.

## 7. Fasi

Ogni fase ha un criterio di accettazione. Nessuna fase tocca la precedente senza il suo test. L'ordine tiene conto delle dipendenze: l'app resta funzionante a ogni fase.

| Fase | Contenuto | Modello | Rischio | Accettazione |
|---|---|---|---|---|
| 0 | Test di regressione su dati fissi (ricettario, picker, planner, spesa, ricerca), su nativo e web | Haiku | basso | tutti i test passano sulla versione attuale |
| 1 | Id del seme: ingredienti (mantenere gli id già presenti) e pronti (aggiungere gli slug). Upsert per id al posto del reseed che cancella tutto | Haiku | basso | ogni ingrediente e pronto ha l'id del seme; reseed ripetuto non cambia il planner |
| 2 | `expo-sqlite` sul web: `metro.config.js`, header, verifica persistenza | Sonnet (verifica), Haiku (codice) | medio | DB si crea e si legge sul web con gli stessi test della fase 0 |
| 3 | Schema nuovo con `user_version`: chiavi esterne con `PRAGMA foreign_keys = ON`, `CHECK`, indici sulle chiavi esterne | Haiku | medio | DB vuoto si crea senza errori su nativo e web |
| 4 | Import transazionale: risoluzione D7 nella UI (cerca, crea, escludi), poi una sola transazione con `ON CONFLICT DO UPDATE` (mai `INSERT OR REPLACE`) e `seed_meta` | Sonnet (design), Haiku (scrittura) | alto | interruzione o annullo → nessun dato scritto; secondo import identico; le ricette `user_modified` non cambiano; planner e preferiti sopravvivono a un re-import |
| 5 | Letture per indice leggero: ricettario, picker, planner, preferiti; dettaglio per chiave (`recipe_body`); Fuse sull'indice leggero (D13). Rimozione di `catalog` nello stesso passaggio, per non lasciare l'app rotta | Sonnet (piano dei punti di chiamata), Haiku (codice) | alto | risultati identici alla fase 0; nessun riferimento residuo a `catalog` |
| 6 | Ricerca tollerante: test di refusi | Haiku | basso | test di refusi superati su nativo e web |
| 7 | Spesa: query SQL per date future, con le regole di unità in JavaScript; `ShoppingPlanModal` con una sola query `IN` invece di N chiamate | Sonnet | basso | `test_shopping_preview.js` e confronto con il calcolo vecchio |
| 8 | Pulizia: eliminazione dei rami web, della migrazione, dei flag in KV e del seme in memoria; `servings || 4` tolto da `RecipeModal` e `MagicRecipeImporterModal`; `VACUUM` | Haiku | basso | nessun riferimento residuo; test completi |

Lavori collegati alle fasi, non da fare a parte:
- UI della modale D10 (avviso con elenco dei pasti) nella fase 4 o subito dopo, prima di esporre la cancellazione dell'ingrediente.
- Cancellazione di una ricetta in una sola transazione (un `DELETE` con cascata), nella fase 5.
- Validazione di `servings` e delle ricette AI all'import, nella fase 4.
- Pulizia di `ricette.json` per le porzioni mancanti (D11), prima della fase 4.

## 8. Ricette AI

Le ricette AI ricevono l'id dal titolo al momento dell'import (slug, con suffisso numerico in caso di collisione). Il file `work/current/ai-recipes.json` ha già id di questo tipo: vanno reimportate e controllate per collisioni. Le ricette AI sono l'unico caso in cui la risoluzione D7 serve davvero: le ricette di `assets/ricette.json` hanno già il collegamento su tutte le 8385 righe.

## 8b. Modifiche di schema (da includere nelle fasi 3 e 4)

| Modifica | Motivo |
|---|---|
| Chiavi esterne con `ON DELETE CASCADE` su righe ingrediente, preferiti, note, voci semplici e pasti pianificati | oggi non ci sono vincoli: la pulizia è manuale in più punti (`database.ts:1322-1325`). Per i pasti la cascata è la scelta D10: il `SET NULL` non va bene perché lascerebbe una riga `recipe` senza ricetta |
| `PRAGMA foreign_keys = ON` a ogni connessione, prima di qualsiasi transazione | le chiavi esterne non valgono se attivate dopo |
| Vincoli `CHECK` su slot, fonte del pasto, difficoltà, dieta, tipo di ingrediente, porzioni (1–24) | un import sbagliato oggi passa in silenzio |
| Indici sulle chiavi esterne (`meal_plan.recipe_id`, `ingredient_id`, `ready_meal_id`, `favorite`, `recipe_note`) | senza, ogni cancellazione a cascata scansiona la tabella figlia |
| Tabella `simple_item_recipe` al posto di `recipe_ids` JSON | relazione nascosta in una stringa; permette chiavi esterne e toglie la scansione JSON di `removeRecipeFromSimpleItems` |
| Colonne `title_key` e `name_key` calcolate all'import, indicizzate | la normalizzazione oggi avviene in JavaScript per ogni confronto |
| Ordine degli slot con costante in codice (`ORDER BY CASE slot …` o ordinamento JS) | `getMealPlans` ordina per slot come testo (`database.ts:764-767`): è un bug reale |

Escluse (D17): `unit_code`/`base_amount`, tabelle `unit` e `department`, `status` su `meal_plan` (si aggiunge con un `ALTER` quando serve), `updated_at`, `import_report`, `source` su `shopping_item`.

## 8c. Modifiche logiche (da includere nelle fasi 4, 5, 7 e 8)

| # | Area | Oggi (verificato) | Nel piano |
|---|---|---|---|
| L1 | Seed ingredienti | il reseed cancella ogni ingrediente uno alla volta, senza transazione unica (`ingredientsService.ts:79-81`) | upsert per id in un'unica transazione, con `seed_meta` nella stessa transazione |
| L2 | Ingredienti creati dall'utente | il reseed li cancella insieme al seme | flag `source` (`seed` / `user`): il reseed tocca solo i `seed` |
| L3 | Eliminazione di un ingrediente | cancella le righe di ricetta e i pasti pianificati che lo usano (`ingredientsDb.ts:268-269`) | cancellazione a cascata invariata (D10), con modale di avviso che elenca i pasti che verranno rimossi |
| L4 | Eliminazione di un pronto | cancella i pasti pianificati che lo usano (`readyMealsDb.ts:174`) | stessa regola di L3 |
| L5 | Alias | la colonna non esiste: il fallback per alias è codice morto (`catalogSeedService.ts:62-66`) | tabella `ingredient_alias`, alimentata anche dalle scelte "cerca tra i noti" in D7 |
| L6 | Collegamenti ricetta-ingrediente | la riga senza corrispondenza viene scartata e solo contata (`recipeIngredientsDb.ts:57-60`) | nessuna riga senza collegamento entra nel DB (D7): la risoluzione avviene prima della scrittura; il collegamento si cerca per id, poi per nome normalizzato, poi per alias |
| L7 | Import ricette | `upsertCatalogRecipes` riscrive tutto per default (`database.ts:1249`) | `ON CONFLICT DO UPDATE`; le ricette con `user_modified` si saltano, salvo scelta esplicita |
| L8 | Eliminazione di una ricetta | i pasti pianificati vengono cancellati (`database.ts:1324`) e la pulizia è in più chiamate separate | un `DELETE` in transazione; prima l'app mostra quanti pasti futuri rimuove; le varianti si cancellano con l'originale |
| L9 | Varianti | regola applicativa: una variante senza originale è mostrata come ricetta (`recipeCatalog.ts`) | colonna `is_listed` calcolata all'import e alla cancellazione |
| L10 | Dieta nei filtri | una ricetta compare se lei o una sua variante è compatibile (`catalogFormat.ts:205-209`) | stesso comportamento in JavaScript sull'indice in memoria |
| L11 | Preferiti | il cuore vale per il gruppo originale-varianti (`RecipeModal.tsx`) | il preferito punta all'originale; le varianti lo ereditano in query |
| L12 | Spesa | filtra le date in JavaScript; il fattore usa `recipe.servings \|\| 4` (`shoppingPreview.ts:86`) | filtro `date >= oggi` in SQL; `servings` obbligatorio e validato all'import, il fallback a 4 sparisce |
| L13 | Pasti `ready` nella spesa | esclusi dal calcolo solo dalla logica JavaScript (`shoppingPreview.ts:72`) | esclusi dalla query SQL, con un test dedicato |
| L14 | Pasti del planner | `planner.tsx` già legge per intervallo di date; restano letture complete in `plannerService.ts:857,904` e `ShoppingPlanModal.tsx:71` | lettura per intervallo di date in tutti i punti |
| L15 | Porzioni del pasto | la quantità della ricetta è `servings` del pasto; con "prepara una volta" la prima voce ha le porzioni preparate | regola documentata e testata: le voci `ready` non entrano nella spesa |
| L16 | Validazione all'import | nessun controllo sui valori: il caso di 250 porzioni è passato | regole minime (porzioni 1–24, minuti > 0, almeno un ingrediente) con avviso |
| L17 | Cancellazioni di massa | pulsanti per cancellare la spesa e il piano, con conferma solo per alcuni casi (`database.ts:696-1102`) | conferma per cancellazioni che toccano più di un elemento |
| L18 | Ricerca | Fuse indicizza titolo, ingredienti e categoria; nessuna tolleranza sui nomi degli ingredienti | ricerca tollerante su titolo e ingredienti (D13) |
| L19 | Svuotafrigo | la dispensa è in memoria e i suggerimenti confrontano per nome | dispensa persistente e confronto per id (D5) |
| L20 | Import AI | gli id dei collegamenti AI possono non risolvere il JOIN | id del seme come chiave; il test di riferimenti è obbligatorio dopo ogni import |
| L21 | Web | rami `isWebFallback` in ogni repository | un solo motore SQLite (D12) |
| L22 | Reseed e reset | `resetAllData` cancella il file e richiede un riavvio; la cache degli ingredienti non si svuota da sola (`ingredientsDb.ts:22`) | reset con svuotamento della cache; su web verificare che la cancellazione del DB funzioni |

## 9. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| `expo-sqlite` su web (WASM) non copre la persistenza o richiede header non disponibili | alto | verifica della documentazione e prototipo nella fase 2, prima di toccare lo schema |
| Import interrotto o annullato lascia dati a metà | alto | risoluzione prima della scrittura, una transazione unica, `seed_meta` nella stessa transazione |
| Re-import cancella planner, preferiti o note | alto | `ON CONFLICT DO UPDATE`, mai `INSERT OR REPLACE`; test di re-import con pasti presenti |
| Divergenza tra id del seme e id delle ricette AI | medio | test di riferimenti dopo ogni import |
| Ricerca fuzzy lenta sul web | medio | indice limitato ai campi necessari; misurare |
| Ricette AI con titoli uguali | basso | suffisso numerico |

## 10. Domande aperte

Nessuna. Decise in revisione: id degli ingredienti (D6, già nel seme) e dei pronti (D9); web con `expo-sqlite` (D12); niente FTS5 (D13); id degli ingredienti creati dall'utente (D14); ricette con slug italiano (D15); filtri in JavaScript (D16); schema snello (D17); risoluzione D7 con opzione "escludi ricetta"; cancellazione a cascata con avviso (D10); servings obbligatorio con stima in pulizia (D11); dispositivo vergine (D8).

## 11. Da fare dopo il refactoring

Lavori rimandati, non parte del refactoring principale.

| # | Lavoro | Motivo | Stato |
|---|---|---|---|
| P1 | Archivio IndexedDB per il web | superato da D12: il web usa SQLite su WASM | non più necessario |
| P2 | `localStorage` solo per le preferenze sul web | conseguenza di D12 | rimandato |

**Già risolto:** il valore delle transazioni non veniva restituito su dispositivo (`runQueuedTransaction` in `database.ts`). Coperto dal test `scripts/test_queued_transaction.js`. Lo stesso bug colpiva il conteggio del seme ingredienti, la consolidazione della spesa e le voci semplici.

## 12. Completato prima del refactoring

- `src/data/recipes.catalog.json` rimosso dal bundle. I collegamenti ricetta-ingrediente si creano all'import del ricettario (`applyCatalogImport`), all'import AI e per le varianti, tutti tramite `saveCatalogRecipesWithLinks` in un'unica transazione (`recipeIngredientsDb.ts`).
- Le righe senza corrispondenza vengono scartate e contate, non salvate come testo. Il comportamento da cambiare è descritto in D7 e in L6.
- Il ramo di risoluzione per id non è ancora verificato sui dati: gli id del database sono casuali e il seme non li salva. Tutti i collegamenti passano oggi dal nome.
- Test: `scripts/test_recipe_import_links.js` (percorso reale dell'import), `scripts/test_recipe_links.js` (rimosso: copriva `saveRecipeLinks`, senza chiamanti nell'app) e `scripts/test_ready_meals_seed.js` (pronti).

## 13. Residui da sistemare (dopo le fasi 0–9)

Emersi dal controllo di Sonnet sulla codebase finita. Non bloccano l'uso, ma vanno sistemati prima di aggiungere altre funzioni di import.

### 13.1 Validazione delle ricette importate (fatto)

**Problema.** `isValidRecipe` (`src/services/catalogFormat.ts`) controlla solo `id`, `title` e `category` come stringhe, più il fatto che `ingredients`, `instructions` e `tags` siano array. Non controlla:
- il contenuto degli array (un elemento `null` o un numero in `instructions` passa);
- la forma di `detailed_ingredients` (`ingredient`, `amount`, `unit`), che `buildImportLinks` legge direttamente: un elemento malformato può far fallire l'import a metà o creare un ingrediente con nome vuoto;
- i valori di `diet`, `origin` e la coerenza di `variant_of` con l'id della variante.

**Perché conta.** Un file esportato da un'altra versione o modificato a mano può passare la validazione e rompere l'import dopo che alcune ricette sono già state scritte. Oggi l'import è transazionale, quindi non resta niente a metà, ma l'errore arriva all'utente senza spiegazione.

**Fix.**
1. Una funzione `validateRecipe(value) → { recipe, issues }` che restituisce la ricetta normalizzata (campi mancanti riempiti con i default, elementi non stringa scartati) e la lista dei problemi con il motivo.
2. `parseCatalogText` conta le ricette non valide per motivo (`invalid`) e le mostra nel messaggio di esito, non solo il numero.
3. Ricette con `variant_of` che non corrisponde al suffisso dell'id: trattate come ricette normali, con un avviso.
4. Test con fixture malformate: elemento `null` in `instructions`, `detailed_ingredients` senza `ingredient`, `diet` sconosciuto, `servings` stringa.

**Verifica.** `scripts/test_recipe_validation.js` con almeno dieci fixture; il file `bundledRecipes.json` e `assets/ricette.json` devono restare validi senza avvisi.

**Priorità:** media. **Fase:** dopo la 13.3 (il validatore va in un modulo proprio).

### 13.2 Cache del catalogo (fatto: refreshCatalog(ids) aggiorna solo gli id toccati, Fuse si ricostruisce in differita)

**Problema.** `loadCatalog` (chiamato da `refreshCatalog`) legge tutti i riepiloghi dal database (`SELECT summary_json FROM recipe`), parsa ogni JSON e ricostruisce l'indice di ricerca Fuse su tutto il catalogo. Succede a ogni salvataggio, cancellazione, import, variante e ripristino: nove file lo chiamano, sei punti lo fanno dopo una scrittura.

**Perché conta.** Oggi con 835 ricette è probabilmente sotto il secondo, ma il costo cresce in modo lineare e l'indice viene ricostruito anche quando è cambiata una sola ricetta. Sul telefono questo si sente dopo un import grande o un ripristino.

**Fix.**
1. Misurare prima: un log di tempo (solo in sviluppo) su `loadCatalog` e `initializeSearchIndex` con il catalogo attuale e con un catalogo di 2.000 ricette generate.
2. `refreshCatalog(changedIds?)`: se sono noti gli id cambiati, aggiorna solo quelli nell'array in memoria e la mappa per id.
3. Indice di ricerca: Fuse non supporta l'aggiornamento incrementale, quindi l'indice va ricostruito in modo differito (una volta sola dopo una raffica di modifiche, con `setTimeout` o `scheduleIdle` già presente in `src/utils/idle.ts`), non a ogni chiamata.
4. Le chiamate che oggi fanno `refreshCatalog()` dopo un import devono passare gli id scritti, non ricaricare tutto.

**Verifica.** Il tempo di `refreshCatalog(ids)` con 2.000 ricette resta sotto i 50 ms (misurato nello stesso ambiente di test); nessuna chiamata a `initializeSearchIndex` per ogni singola ricetta di un import.

**Priorità:** media. **Fase:** dopo la misura (13.2.1), prima di qualunque altra modifica al catalogo.

### 13.3 Divisione di `database.ts` (fatto: `database.ts` è ora una facciata che ri-esporta `connection`, `webStorage`, `favoritesDb`, `shoppingDb`, `plannerDb`, `settingsDb`, `recipeCatalogDb`; `plannerDb.ts` è a 258 righe, sotto il limite di 400: non serve altro spostamento)

**Problema.** `src/db/database.ts` ha 1384 righe e 54 funzioni esportate. Nello stesso file ci sono: apertura del database e schema, la coda delle transazioni, il fallback web con `localStorage`, le letture e scritture del catalogo, del planner, della spesa, dei preferiti, delle note, delle impostazioni (kv) e le migrazioni residue (le etichette "Fuori casa").

**Perché conta.** Ogni modifica tocca un file che non si riesce più a leggere per intero, e i test devono importare tutto il modulo (con le stub di Expo) anche per una sola funzione. È anche il motivo per cui il fallback web e il percorso SQL sono difficili da tenere allineati.

**Fix (senza cambiare comportamento).** Stesso stile dei file già presenti in `src/db` (`ingredientsDb.ts`, `readyMealsDb.ts`): un file per gruppo di tabelle. Tutte le tabelle restano nello stesso database `greenwhisker.db`.
1. `src/db/connection.ts`: apertura del database, `applySchema`, coda delle transazioni, `isWebMode`.
2. `src/db/webStorage.ts`: chiavi di `localStorage` e lettura/scrittura del fallback web.
3. `src/db/recipeCatalogDb.ts`: tabelle `recipe` e `recipe_body`, varianti.
4. `src/db/plannerDb.ts`: tabella `meal_plan`.
5. `src/db/shoppingDb.ts`: tabella `shopping_item`.
6. `src/db/favoritesDb.ts`: tabelle `favorite` e `recipe_note`.
7. `src/db/settingsDb.ts`: tabella `kv_store` (lettura e scrittura complete, usate dal backup).
8. `database.ts` resta come facciata che ri-esporta tutto, così gli import esistenti non cambiano nella prima fase; poi si migrano gli import uno per volta e la facciata si elimina.
9. Nessun file nuovo supera le 400 righe.

**Verifica.** Tutti i test esistenti passano senza modifiche ai test (l'unica differenza ammessa è il percorso di import dentro i test). `tsc` e `lint` puliti. Il numero di funzioni esportate per file è riportato nel piano.

**Priorità:** media. **Fase:** dopo 13.1 e 13.2, perché il validatore e la cache toccano il catalogo che qui viene spostato.
### 13.4 Punti 1–5 del controllo Sonnet sul DB (fatto)

Ordine di esecuzione: 5, 3, 4, 2, 1.

1. **Alias utente persi al re-seed (fatto).** `ingredient_alias` ha la colonna `source` (`'seed'` o `'user'`), schema v5. Il re-seed sostituisce solo gli alias `seed` e non sovrascrive una chiave che appartiene all'utente (`ON CONFLICT ... WHERE source = 'seed'`). Sul web, dove non c'è la colonna, il seed unisce gli alias esistenti con quelli del seme. Test: `scripts/test_alias_preserved_on_reseed.js` (cinque controlli sul codice reale, su SQLite in memoria).
2. **`planCatalogUpsert` fuori dalla transazione (fatto).** La decisione keep/overwrite e la risoluzione dei collegamenti avvengono dentro la transazione che scrive, sulle stesse righe. Vale anche per `upsertCatalogRecipes`. Sul web il percorso è invariato. Il percorso nativo non è coperto dai test in Node.
3. **Funzioni inutilizzate (fatto).** Rimosse da `plannerDb.ts`, `ingredientsDb.ts`, `recipeIngredientsDb.ts` le funzioni senza chiamanti, più `updateMealPlanServings` e `isValidRecipe`.
4. **`knownIngredients` caricato più volte (fatto).** Su nativo legge solo id, nome e alias (due letture leggere, senza nutrienti). L'import la carica una volta sola e la passa nel piano (`ImportPlan.known`).
5. **`saveReadyMeal` legge tutta la tabella (fatto).** Legge solo la data di creazione del pronto che si sta salvando (`readCreatedAt`).

### 13.5 Verifica prima del commit (fatto)

Controlli eseguiti sui file modificati e non committati:
- commenti in italiano nel codice: nessuno (le parole italiane trovate erano dati di esempio tra virgolette);
- codice duplicato: `requireDb` e `runInTransaction` erano copiati in quattro moduli, ora sono in `connection.ts` e importati da lì; `readWeb` è ancora copiato in più moduli con tipi diversi (da lasciare, dipende dal tipo del record); `normalizeNutrients` è in `src/utils/nutrientValues.ts`, usato da entrambi i moduli;
- codice obsoleto: rimossi `isValidRecipe` e `updateMealPlanServings`. Restano da decidere, perché esistono già su `main` senza chiamanti: `getRecipesForSlot`, `getSideRecipes`, `formatWeekPlanShareText` in `plannerService.ts`;
- import inutilizzati: nessuno (`tsc --noUnusedLocals --noUnusedParameters` pulito);
- lint: nessun errore né warning (`npx expo lint`, uscita 0);
- test: 34 script su 34 passano.
