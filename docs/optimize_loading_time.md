# Piano di ottimizzazione delle performance

Obiettivo: rendere l'app molto più reattiva, in particolare planner, meal picker, cambio di schede e lista della spesa. Il piano è di **implementazione diretta**: niente strumentazione, niente misure di baseline. Ogni passo si giustifica con la lettura del codice.

Chi esegue: **Haiku** per le modifiche meccaniche e localizzate, **Sonnet** per i passi che richiedono di capire il flusso dei dati o di riorganizzare componenti. Ogni passo indica il modello.

## 0. Regole comuni (leggere prima)

- Non committare. Lavorare nel working tree.
- Prima di modificare un file, copiarlo in `work/backup/perf/` con lo stesso nome.
- Non cambiare l'avvio dell'app.
- Non toccare la logica dei preferiti (le varianti non hanno il cuore).
- Non toccare import ed export del ricettario.
- Non usare `InteractionManager` (rimosso in React Native 0.88). Per il lavoro differito usare `requestIdleCallback`, globale in RN.
- Il catalogo ricette resta completo in memoria: non paginarlo.
- Ordine dei risultati del picker e test in `scripts/` invariati.
- Dopo ogni passo: `npx tsc --noEmit`, `npx expo lint` sui file toccati, e `for f in scripts/test_*.js; do NODE_PATH=$PWD/node_modules node $f >/tmp/o.txt 2>&1 || echo FAIL $f; done`. Nessun errore nuovo.
- Se un passo rompe qualcosa e non si risolve in due tentativi, annotarlo in `work/perf/blockers.md` e passare oltre.

---

## 1. Meal picker (`src/components/planner/MealPickerModal.tsx`, circa 1037 righe)

### 1.1 Lista ordinata e filtrata una sola volta [SONNET]
- Leggere `sortedRecipes` e `visibleRecipes`. `sortedRecipes` deve dipendere solo da `allRecipes`, `query`, `favoriteIds`. `visibleRecipes` deve filtrare solo per slot, senza riordinare.
- Se `sortedRecipes` si ricalcola al cambio di scheda (Ingredienti, Pronti, Fuori casa), togliere la dipendenza che lo causa.
- Spostare il calcolo costoso fuori dal render o in `useMemo` con dipendenze minime.

### 1.2 Collator una sola volta [HAIKU]
- Creare `const collator = new Intl.Collator('it', { sensitivity: 'base' })` a livello di modulo in `pickerRanking.ts` (o dove vive il ranking) e in `MealPickerModal.tsx`.
- Sostituire `localeCompare('it', ...)` nei sort con `collator.compare`.
- Verificare con `scripts/test_picker_ranking.js` che l'ordine non cambi.

### 1.3 Ricerca differita [HAIKU]
- Mantenere `query` immediata per il campo di testo.
- Per la lista usare `useDeferredValue(query)` (React 18+) e passare il valore differito a `rankPickerMatches`.
- Il campo deve restare reattivo; la lista si aggiorna subito dopo.

### 1.4 Righe stabili [HAIKU]
- `renderRow` memoizzato con `useCallback` e dipendenze corrette. `keyExtractor` stabile.
- Nelle righe, `expo-image` con `cachePolicy="disk"` (non cambiarlo). Togliere icone o componenti non necessari dalla riga.
- Su `FlatList`: `initialNumToRender`, `windowSize` e `removeClippedSubviews` ragionevoli per liste lunghe (valori tipici: `initialNumToRender={12}`, `windowSize={5}`). Verificare su Android e iOS che non ci siano scatti visibili.

### 1.5 Montaggio e chiusura [SONNET]
- Verificare che il picker venga montato solo quando serve, senza perdere l'animazione di uscita.
- Se serve, tenere `visible` gestito dal padre con `Modal` senza smontare il contenuto a ogni apertura.

---

## 2. Planner (`src/app/(tabs)/planner.tsx`, circa 751 righe)

### 2.1 Conteggi per giorno e slot calcolati una volta [HAIKU]
- Introdurre `planCounts` (un `useMemo` su `plans`, `weekDays`) che raggruppa per data e slot.
- Sostituire nel JSX ogni `plans.filter(...)` ripetuto con la lettura da `planCounts`.

### 2.2 Handler stabili nelle card [HAIKU]
- Nel JSX di `MealSlotCard` e `PlannedItemCards.tsx` eliminare arrow inline che creano nuove funzioni a ogni render. Usare `useCallback` con argomenti (id) passati dal figlio, oppure handler stabili dal padre.
- Memoizzare le card con `React.memo` se ricevono props stabili.

### 2.3 Lettura del piano solo per la settimana visibile [SONNET]
- `getMealPlans()` (`src/db/database.ts`, circa riga 719) legge tutta la tabella `meal_plan`. Aggiungere un parametro opzionale `{ fromDate, toDate }` con `WHERE date BETWEEN ? AND ?`. Il default resta la lettura completa.
- Verificare in `src/db/catalogSchema.ts` gli indici su `meal_plan`: non duplicarne uno già esistente (`meal_plan(date, slot)` secondo l'audit).
- In `planner.tsx`, caricare solo la settimana mostrata (dai `weekDays`), anche quando l'utente sfoglia settimane precedenti o successive.
- Dopo aggiunte e cancellazioni, aggiornare lo stato locale senza ricaricare ingredienti e pronti, che hanno già una cache.

### 2.4 Confronto dei piani senza JSON.stringify [HAIKU]
- Rimuovere `sameContent` basato su `JSON.stringify` in `planner.tsx`. Confrontare per lunghezza e id, oppure lasciare che React confronti per riferimento dopo `setPlans`.

---

## 3. Planner: service (`src/services/plannerService.ts`, circa 1020 righe) [SONNET]

- Individuare nel service le funzioni che rileggono l'intero piano o l'intero catalogo per ogni singola operazione (aggiunta, rigenerazione, preferenze).
- Per ogni caso, passare solo i dati necessari (settimana o ids) senza cambiare il risultato.
- Non cambiare la logica di generazione del piano: solo come i dati arrivano.

---

## 4. Transizioni tra schede (`src/app/(tabs)/_layout.tsx`, `index.tsx`, `favorites.tsx`, `shopping.tsx`)

### 4.1 Lavoro al focus ridotto [SONNET]
- `_layout.tsx`: verificare che `freezeOnBlur: true` sia attivo e che nessuna scheda rifaccia caricamenti completi al focus.
- `planner.tsx`: al focus caricare solo la settimana e le preferenze, non ingredienti e pronti.
- `shopping.tsx`: al focus `loadItems()` senza consolidamento a ogni passaggio (il consolidamento solo al primo focus o dopo una modifica).
- `favorites.tsx`: `refreshFavorites()` non deve fare lavoro se nulla è cambiato.

### 4.2 Lavoro non urgente differito [HAIKU]
- Il consolidamento della spesa e altre operazioni non urgenti passano per `requestIdleCallback`, con fallback a `setTimeout(fn, 0)` se non disponibile. Non usare `InteractionManager`.

---

## 5. Immagini [HAIKU]

- Le miniature (picker 52 px, card) usano `expo-image` con una dimensione coerente al display (`contentFit="cover"`, `recyclingKey` nelle liste, `transition={0}` dove l'animazione non serve).
- Aggiungere un `placeholder` di colore neutro dove manca.
- Non cambiare `cachePolicy` rispetto a quanto già impostato.

---

## 6. Lista della spesa (`src/app/(tabs)/shopping.tsx`, circa 1412 righe) [SONNET]

- `groupedSections` ricalcola a ogni cambio di `items`. Memoizzarlo per reparto: ricalcolare solo il reparto cambiato, oppure tenere una mappa per reparto con `useMemo`.
- Le pillole dei reparti usano lo stesso `paddingHorizontal` già impostato; non alterarlo.
- Non cambiare l'ordine di visualizzazione dei reparti.

---

## 7. Database (`src/db/database.ts`, `ingredientsDb.ts`, `readyMealsDb.ts`) [HAIKU]

- Ogni query di lista usa `SELECT` con colonne necessarie, non `SELECT *` dove la tabella è grande.
- Operazioni multiple di scrittura in una transazione (`BEGIN`/`COMMIT`) se non lo sono già.
- Nessun cambiamento di schema senza una migrazione esplicita.

---

## 8. Verifica finale [HAIKU]

- `npx tsc --noEmit` zero errori.
- `npx expo lint` nessun errore nuovo rispetto a prima dei cambiamenti.
- `scripts/test_*.js` tutti verdi (nessun `FAIL`).
- Elenco dei file modificati e dei backup in `work/perf/changes.md`, con una riga per passo: cosa è cambiato e perché.
- Il controllo sul dispositivo (fluidità del picker, cambio di scheda) resta all'utente.

---

## 9. Condizioni di arresto

Fermarsi e scrivere in `work/perf/blockers.md` se:
- una modifica rompe un test o `tsc` e non si risolve in due tentativi;
- una modifica cambia l'ordine dei risultati del picker o il comportamento dei preferiti;
- una modifica cambia import o export del ricettario;
- serve uno schema del database diverso da quello attuale.
