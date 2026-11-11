# Piano: catalogo sul telefono e varianti vegetariane/vegane

Stato: **implementato** (tutte le fasi, vedi sezione finale). Da verificare sul telefono. Ogni fase si chiude con `npx tsc --noEmit`, `npx expo lint`,
`npx expo export --platform android` e una pausa per l'ok dell'utente prima della fase successiva.

## Obiettivi

1. **APK senza ricette** (copyright): `assets/ricette.json` non viene più incluso nella build.
   Al primo avvio il catalogo è vuoto e si popola importando un JSON dalla memoria del telefono.
2. **Catalogo persistente sul telefono**: ricette aggiunte, modificate o eliminate restano dopo
   gli aggiornamenti dell'app (stesso package e stessa chiave di firma). La disinstallazione cancella
   tutto: l'export è il backup.
3. **Export completo o parziale** (es. solo vegane, solo da Importazione AI), con le varianti.
4. **Varianti** vegetariane/vegane generate con Gemini da una ricetta onnivora, verificate
   dall'utente prima del salvataggio.
5. **Retrocompatibilità**: l'app legge sia i JSON vecchi (senza varianti) sia quelli nuovi.

## Decisioni prese

| # | Tema | Decisione |
|---|------|-----------|
| 1 | Preferiti | Il cuore vale per il gruppo (originale + varianti) |
| 2 | Selettore del planner | Mostra anche le varianti, con badge. La generazione automatica usa solo le originali |
| 3 | Ricerca e filtro dieta | Un'onnivora con variante vegana compare tra le vegane e si apre sulla scheda vegana |
| 4 | Importer AI | Chiede quali varianti generare (nessuna, vegetariana, vegana, entrambe) e le fa verificare e correggere tutte prima del salvataggio |
| 5 | Titolo delle varianti | Suffisso: `Titolo (vegetariana)`, `Titolo (vegana)` |
| 6 | Lingua dei campi | Inglese, come `ricette.json` (835 ricette), `recipe-example.json` e il codice. Solo `ricette.example.json` è nel vecchio formato italiano e va convertito |
| 7 | Storage | SQLite (tabella `catalog`), non un file JSON sul telefono: scritture atomiche, modifiche per singola ricetta, filtri con query |
| 8 | Import con id già presenti | Una domanda per import: "Sovrascrivi tutte / Mantieni le mie / Annulla" |
| 9 | Ricetta modificata | Mantiene l'origine (es. `ai`) e riceve `modified: true` |
| 10 | Eliminazione con riferimenti | Rimuove anche le voci del planner, i preferiti e le note, dopo un avviso |
| 11 | Generazione variante | **Non** si salva subito: anteprima come l'import AI, con Salva / Scarta / Riprova |

### Nota sulla decisione 4

Oggi lo switch "Vegana" attiva automaticamente "Vegetariana". Con le varianti sono due ricette
distinte, quindi la scelta diventa libera: si può generare anche solo la vegana.

## Formato dei dati

### Campi nuovi della ricetta (tutti opzionali)

| Campo | Valori | Uso |
|-------|--------|-----|
| `diet` | `omnivore` \| `vegetarian` \| `vegan` | Filtri, export, pulsanti di generazione |
| `diet_source` | `auto` \| `manual` | Una correzione manuale non viene sovrascritta dal calcolo automatico |
| `origin` | `file` \| `ai` \| `manual` | Filtro export "solo Importazione AI" |
| `modified` | boolean | Segno "modificata" |
| `variant_of` | id dell'originale | Presente solo nelle varianti |
| `needs_review` | boolean | La variante contiene ancora ingredienti non compatibili con la dieta |
| `created_at`, `updated_at` | timestamp in ms | Ordinamento, avviso "originale modificato" |

- **Id delle varianti**: `<idOriginale>--vegetariana`, `<idOriginale>--vegana`. Fissi, così
  rigenerare sostituisce la stessa variante e lo stesso file importato su due telefoni non duplica.
- **Id delle ricette nuove da AI**: oggi `custom-<titolo>`; due ricette con lo stesso titolo
  collidono. Va aggiunto un suffisso univoco in caso di conflitto.

### File esportato

Un **array semplice** di ricette, prima le originali e poi le loro varianti. Nessun "contenitore".

- App nuova + JSON vecchio: i campi mancanti si calcolano all'import (`diet` automatica,
  `origin: file`, date correnti).
- APK attuale + JSON nuovo: l'import riesce, le varianti compaiono come ricette separate
  (leggibili grazie al suffisso nel titolo).
- I campi sconosciuti vengono conservati, per compatibilità con versioni future.

### Storage sul telefono

Tabella SQLite `catalog`:

| Colonna | Note |
|---------|------|
| `id` | chiave primaria |
| `json_data` | la ricetta completa; è la fonte usata per l'export |
| `base_id` | `variant_of`, `NULL` per le originali (indice) |
| `diet`, `origin` | copiati dal JSON per filtrare (indici) |
| `created_at`, `updated_at` | |

Le scritture multiple (import, eliminazione in blocco, migrazione) avvengono in una transazione.

## Checklist

### Fase 0 – Specifica e dati di prova

- [ ] Convertire `assets/ricette.example.json` nel formato attuale (inglese), con una ricetta onnivora e la sua variante vegetariana.
- [ ] File di prova: JSON vecchio, JSON con varianti, variante senza originale, id duplicati, ricette non valide, campi sconosciuti.
- [ ] Script Node di verifica per le funzioni pure (classificazione, import, migrazione), come già fatto per il parser delle quantità. Nessuna nuova dipendenza.
- [ ] Prima di iniziare: fare commit delle modifiche attuali, ancora non salvate nel repo.

### Fase 1 – Archivio del catalogo e migrazione

- [ ] Tabella `catalog` con indici in `initDatabase`, più il fallback web.
- [ ] **Catalogo condiviso** con notifiche ai componenti (stile `FavoritesContext`) che sostituisce i `require('ricette.json')` in:
  `src/app/_layout.tsx`, `src/app/(tabs)/index.tsx` (via `recipeCatalog.ts`), `planner.tsx`, `shopping.tsx`, `favorites.tsx`,
  `src/services/plannerService.ts`, `pantryService.ts`, `searchService.ts`, `recipeCatalog.ts`, `recipeBookService.ts`.
- [ ] Ogni modifica al catalogo ricostruisce l'indice di ricerca.
- [ ] **Migrazione una tantum** da `custom_recipes` a `catalog`, protetta da un flag KV (`catalog_migrated_v1`). Id `custom-…` → `origin: ai`, gli altri → `origin: file`. La vecchia tabella resta, per poter tornare indietro.
- [ ] Caricamento del catalogo prima di chiudere lo splash screen; misurare il tempo con 835 ricette.

### Fase 2 – APK senza ricette e catalogo vuoto

- [ ] Rimuovere ogni `require('ricette.json')` dal codice dell'app. `scripts/test_planner_simulation.js` resta: è uno script di sviluppo che legge il file locale.
- [ ] Aggiornare `.easignore` (oggi dice che `ricette.json` "MUST be bundled") e il README (nuovo primo avvio).
- [ ] Stato vuoto del catalogo con "Importa ricettario" e "Importa con AI".
- [ ] Planner, dispensa e preferiti funzionano con il catalogo vuoto.
- [ ] **Dispensa**: `pantryService.ts` tiene in cache l'elenco degli ingredienti (`cachedNormalizedIngredients`). Invalidarla quando il catalogo cambia.
- [ ] **Generazione automatica del planner**: `checkAndAutoGeneratePlan` considera la settimana piena quando le voci sono giorni × pasti. Con più ricette per pasto il conteggio è sbagliato: va verificato per pasto. Gestire anche i pool vuoti.

### Fase 3 – Import ed export

- [ ] **Import**: validare ogni ricetta, importare prima le originali e poi le varianti, calcolare i campi mancanti.
- [ ] Conflitti di id: una domanda per import (decisione 8).
- [ ] Variante senza originale: mostrata come ricetta normale; si raggruppa da sola se l'originale arriva dopo.
- [ ] Valori di `diet` non validi → ricalcolo automatico.
- [ ] Riepilogo: nuove, aggiornate, saltate, non valide, varianti.
- [ ] **Export**: filtri per dieta, origine e tipo (originali / varianti), selezione manuale con checkbox (già presente), opzione "includi le varianti delle ricette scelte".
- [ ] Nome del file con il filtro, es. `green-whisker-vegane-2026-11-05.json`.

### Fase 4 – Classificazione della dieta

- [ ] Classificazione automatica dagli ingredienti, con eccezioni per "pollo vegetale", "latte di soia", "formaggio vegetale" e simili. Caso reale nel file attuale: "Farro con pollo vegetale e peperoni".
- [ ] Correzione manuale dalla scheda ricetta (`diet_source: manual`).
- [ ] Elenco dei casi dubbi da rivedere dopo il primo import.
- [ ] Rimuovere il tag fisso "100% Vegetale" dove non corrisponde alla dieta calcolata (oggi è su tutte le 835 ricette).

### Fase 5 – Eliminazione (punto 2 della checklist precedente, in pausa)

- [ ] Lista con checkbox nel Ricettario, eliminazione singola o in blocco.
- [ ] Eliminare un'originale elimina anche le sue varianti, con avviso.
- [ ] Per ogni ricetta eliminata: rimuovere voci del planner, preferiti e note (`recipe_notes`). La lista della spesa resta: salva già il testo degli ingredienti.

### Fase 6 – Componente di revisione condiviso

- [ ] Estrarre il form di anteprima e modifica di `MagicRecipeImporterModal.tsx` in un componente riutilizzabile (es. `RecipeReviewForm`), usato da:
  importazione AI, generazione delle varianti, modifica di una ricetta esistente.
- [ ] Il form mantiene le quantità ricavate dal testo (già fatto in `handleSaveRecipe`) e mostra il badge della dieta.

### Fase 7 – Generazione delle varianti con Gemini

- [ ] Nuovo prompt "adatta" in `aiService.ts`: riceve la ricetta completa e la dieta, restituisce lo stesso schema. Mantiene le porzioni, riusa `normalizeParsedRecipe`.
- [ ] Campo opzionale **istruzioni aggiuntive** (es. "non usare il tofu", "mi mancano le uova"), usato soprattutto con "Riprova".
- [ ] Le varianti si generano sempre dall'originale, mai da un'altra variante.
- [ ] Controllo del risultato con la classificazione: se contiene ancora ingredienti incompatibili, avviso nell'anteprima e `needs_review: true` se salvata così.
- [ ] Errori: chiave mancante (link a Impostazioni AI), quota esaurita, rete assente, risposta non valida. Pulsante disattivato durante la richiesta.
- [ ] **Anteprima prima del salvataggio** (decisione 11): la variante si apre nel form di revisione con **Salva variante**, **Scarta**, **Riprova** (con istruzioni aggiuntive).

### Fase 8 – Interfaccia delle varianti

- [ ] **Card del catalogo**: una card per gruppo, con un'icona dedicata sotto il cuore quando esistono varianti.
- [ ] **Scheda ricetta**: schede "Originale | Vegetariana | Vegana" quando esistono varianti. Condividi, modifica, link esterno, planner, spesa e note agiscono sulla scheda aperta. Il cuore vale per il gruppo.
- [ ] **Pulsanti di generazione** (sulla scheda Originale):
  onnivora → "Rendi vegetariana" e "Rendi vegana"; vegetariana → solo "Rendi vegana"; vegana → nessuno.
  Un pulsante sparisce quando la sua variante esiste. Nella scheda della variante: "Rigenera" ed "Elimina variante".
- [ ] **Avviso** "Originale modificato dopo la creazione" con "Rigenera", quando `updated_at` dell'originale è successivo a `created_at` della variante.
- [ ] **Ricerca e filtri** (decisione 3): il gruppo compare se una qualsiasi sua versione corrisponde, e si apre sulla scheda corrispondente.
- [ ] **Preferiti** (decisione 1): legati all'id dell'originale.
- [ ] **Planner** (decisione 2): il selettore mostra anche le varianti con badge; aggiungere dalla scheda usa la versione aperta; la generazione automatica usa solo le originali.

### Fase 9 – Importazione con AI

- [ ] Prima dell'estrazione: scelta delle varianti (nessuna, vegetariana, vegana, entrambe), senza più l'obbligo "vegana ⇒ vegetariana".
- [ ] Flusso a passi: **Originale** (estratta senza adattamenti, verificabile e modificabile) → **Varianti scelte**, generate dall'originale **dopo** la sua revisione, ognuna con anteprima e Salva / Scarta / Riprova.
- [ ] Salvataggio finale: l'originale e le varianti confermate, in una transazione.
- [ ] Se una variante fallisce: l'originale si può salvare comunque; la variante si potrà generare dopo dalla scheda.
- [ ] Rimuovere il vecchio parametro `diet` della chiamata di estrazione (oggi adatta direttamente la ricetta importata).

### Fase 10 – Verifica finale

- [ ] Prova su telefono con Expo Go: catalogo vuoto, import del `ricette.json`, generazione e revisione di una variante, export solo vegane e solo AI, reimport dello stesso file (conflitti).
- [ ] Import di un JSON vecchio e di uno nuovo con varianti.
- [ ] **Aggiornamento sopra un'installazione esistente**: unico modo per verificare che i dati restino. Costa una build EAS: farla una volta sola, alla fine.
- [ ] Nota per il telefono attuale: al primo avvio della nuova versione ci saranno solo le ricette migrate. Le 835 vanno importate una volta dal file.

## Rischi noti

- **Versione web**: il browser concede circa 5 MB di memoria locale; catalogo (4,4 MB) e varianti possono superarli. La versione web resta solo per lo sviluppo e deve avvisare invece di perdere dati in silenzio.
- **Classificazione automatica**: basata su parole chiave, può sbagliare. Da qui la correzione manuale e l'elenco dei casi dubbi.
- **Costo AI**: ogni variante è una chiamata a Gemini (quota gratuita limitata). Nessuna generazione in blocco.
- **Persistenza**: i dati sopravvivono agli aggiornamenti solo con lo stesso package (`com.nicolazaltron.greenwhisker`) e la stessa chiave di firma EAS. Fare il backup del keystore.


## Stato di implementazione

Tutte le fasi sono state implementate. Le verifiche automatiche sono: `npx tsc --noEmit`, `node scripts/test_catalog.js` (30 controlli),
`node scripts/diet_report.js`, `npx expo export --platform android`, e il controllo che il bundle non contenga ricette.
Il lint non ha errori nuovi: gli errori rimasti esistevano prima di queste modifiche.

**Non verificato automaticamente** (serve il telefono): migrazione SQLite della tabella `catalog`, form di revisione,
chiamata a Gemini per le varianti, eliminazione con pulizia di planner e preferiti, comportamento della coda di revisione
nell'import AI. Vanno provati con Expo Go prima della build.

### Deviazioni dal piano

- **Fase 6:** il form non è stato estratto in un componente nuovo. L'importer ha una modalità `review` (conferma, scarta,
  riprova con istruzioni): stesso form, senza duplicarlo.
- **Fase 1:** la migrazione `initCatalog` copia solo `custom_recipes`. Le 835 ricette del file non vengono più seminate:
  vanno importate una volta dal file, come previsto.
- **Fase 4:** la correzione manuale della dieta sta nel form di revisione (matita sulla scheda), non in un controllo separato.
- **Fase 8:** nel planner il badge della variante è il suffisso nel titolo `(vegetariana)` / `(vegana)`.
- **Fase 8:** il filtro dieta nella ricerca mostra una ricetta se è compatibile come originale o come variante, ma apre
  l'originale: la versione si sceglie dalla scheda.
- **Fase 9:** le due opzioni vegetariana e vegana sono indipendenti (la vegana non attiva più la vegetariana).

### Dipende da te

- Il ricettario di 835 ricette va importato una volta dal file `assets/ricette.json` (menu → Ricettario → Importa).
- Lo script `scripts/test_planner_simulation.js` legge ancora il file locale: è uno strumento di sviluppo.
- Il report `node scripts/diet_report.js` stampa l'elenco dei casi da rivedere: non lo salvo in `docs/` perché contiene titoli di ricette.

---

## Aggiornamenti decisi (dopo l'audit)

- **F8.4 (avviso "originale modificato")**: rimosso dal piano. Non serve.
- **F8.6 (cuore dei preferiti)**: il cuore vale solo per la ricetta principale. Le varianti non mostrano il cuore: sono parte della principale e non compaiono come schede separate nella UI dei ricettari.
- **F8.7 (badge nel planner)**: da confermare. Oggi il suffisso "(vegana)" nel titolo è la sola indicazione; resta da decidere se basta.
- **F10 (test su telefono)**: da fare in questo ordine: importare un file esportato dall'app con la versione attuale; reimportare lo stesso file (non deve duplicare); esportare con e senza filtro dieta.
