# Piano di ottimizzazione delle performance (riscritto)

Destinatario: un agente locale (qwen3.6). Esegui un passo alla volta. Ogni passo ha: obiettivo, file, azioni, verifica. **Se una misura non è disponibile, non indovinare: marca il passo come `BLOCCATO-MISURA` e passa oltre.**

## 0. Contesto e decisioni già prese (leggere prima)

- L'**avvio** dell'app è accettabile. Non ottimizzarlo in questo piano.
- Il problema reale è il **ritardo tra tap e azione** nel planner, in particolare nel meal picker (cambio scheda Ricette / Ingredienti / Pronti / Fuori casa, ricerca, aggiunta), e le **transizioni** tra schede, soprattutto verso planner e lista della spesa.
- Obiettivo misurabile: **un tap nel planner deve produrre l'effetto visibile in meno di 300 ms** in build di release, su un telefono di fascia media.
- Il catalogo ricette resta **completo in memoria** (serve a ricerca, filtri dieta e raggruppamento varianti). Non paginarlo.
- Le varianti non hanno il cuore nei preferiti: non toccare la logica dei preferiti.
- Import ed export del ricettario funzionano: non toccarli.
- Non usare `InteractionManager` (rimosso in React Native 0.88). Usare `requestIdleCallback` (globale in RN) solo dove serve.
- Non committare. Lavorare nel working tree. Backup prima di ogni modifica in `work/backup/`.

### Vincoli di misura (obbligatori)
- Le misure in **sviluppo** non sono valide (Hermes non ottimizzato, StrictMode). Ogni verifica di prestazione va fatta in **build di release**. Se non puoi produrla, marca `BLOCCATO-MISURA`.
- La build di release si fa con EAS, usando un profilo già presente in `eas.json` (es. `npx eas-cli@latest build --profile preview --platform android`). Se l'agente non può eseguire EAS, lascia la misura all'utente e documentala.

---

## 1. Strumentazione temporanea (passo di misura)

Obiettivo: misurare, non cambiare comportamento.

- [ ] 1.1 Crea `src/utils/perfMark.ts` con una funzione `perfMark(label: string)` che, solo se `__DEV__` o una costante `PERF_ENABLED = true` locale, registra `Date.now()` in un array globale e stampa con `console.log('[perf]', label, delta)`. Quando `PERF_ENABLED` è falso non deve fare nulla. Default: `false`.
- [ ] 1.2 Aggiungi `perfMark` ai punti seguenti, senza altre modifiche:
  - `src/components/planner/MealPickerModal.tsx`: all'inizio di `handleTabChange`, poi in un `useEffect` che parte dopo il cambio di `tab` (marca `picker-tab-changed`).
  - `src/app/(tabs)/planner.tsx`: all'inizio di `handleOpenPicker` (`picker-open`), e nella funzione che registra un'aggiunta (`add-start`, `add-end`).
  - `src/app/(tabs)/_layout.tsx` (solo se possibile): un listener `tabPress` di expo-router (`tab-press:<nome>`).
- [ ] 1.3 Verifica: `npx tsc --noEmit` zero errori.

**Uscita**: la strumentazione è pronta; i numeri si leggono nei log della build di release (`PERF_ENABLED = true` solo per la misura, poi di nuovo `false`).

---

## 2. Misure di base (BLOCCATO-MISURA se non in release)

Per ogni scenario, ripeti 5 volte e registra la mediana in `work/perf/baseline.md`:

| ID | Scenario | Punto di inizio | Punto di fine |
|----|----------|-----------------|---------------|
| S1 | Apri il picker da uno slot | `picker-open` | primo frame della lista (Modal `onShow` o primo `onLayout`) |
| S2 | Cambia scheda nel picker: Ricette → Ingredienti | `picker-tab-changed` | prima riga visibile della nuova scheda |
| S3 | Cambia scheda nel picker: Ingredienti → Pronti → Fuori casa | come S2 | come S2 |
| S4 | Scrivi una lettera nella ricerca del picker | `onChangeText` | risultati visibili |
| S5 | Aggiungi una ricetta al pasto (chiudi la modale o resta aperta) | `add-start` | `add-end` e banner visibile |
| S6 | Cambia scheda principale: Esplora → Preferiti → Planner | `tab-press` | prima UI della scheda |
| S7 | Cambia scheda principale: Planner → Lista della spesa | `tab-press` | prima UI della scheda |

- [ ] 2.1 Esegui S1..S7 e scrivi `work/perf/baseline.md` con la tabella dei tempi mediani.
- [ ] 2.2 Scrivi la data, il commit, il dispositivo e il tipo di build in cima al file.
- [ ] 2.3 Verifica: il file contiene 7 righe con 5 misure ciascuna. Se una misura manca, marca la riga `BLOCCATO-MISURA`.

**Uscita**: baseline confrontabile. Nessuna ottimizzazione prima di questo passo.

---

## 3. Planner e meal picker: rendering (priorità alta)

Ogni punto è indipendente: fai un punto alla volta, misura, poi passa al successivo.

### 3.A Picker: lista ricette calcolata una volta
- [ ] 3.A.1 `MealPickerModal.tsx`: verifica che `sortedRecipes` dipenda solo da `allRecipes`, `query`, `favoriteIds`, e che `visibleRecipes` filtri solo per slot. Se una delle due dipendenze è sbagliata, correggila.
- [ ] 3.A.2 Verifica: nel cambio di scheda Ingredienti/Pronti/Fuori casa, `sortedRecipes` non deve ricalcolarsi (strumenta con `perfMark` dentro il memo, temporaneo).
- [ ] 3.A.3 Misura S2, S3. Confronta con la baseline.

### 3.B Picker: righe stabili e leggere
- [ ] 3.B.1 Ogni riga usa `expo-image` con `cachePolicy="disk"`. Su liste lunghe cambia in `"memory-disk"` solo se la misura lo giustifica (vedi 6). Non cambiarlo a caso.
- [ ] 3.B.2 Le icone `Ionicons` in una riga: riduci a quelle strettamente necessarie (il cuore e la freccia). Misura prima.
- [ ] 3.B.3 Verifica: `renderRow` è memoizzato (`useCallback`) con dipendenze corrette. Lo `eslint` non deve dare nuovi warning `exhaustive-deps`.

### 3.C Picker: ricerca senza ricalcolo completo
- [ ] 3.C.1 La ricerca (S4) passa per `rankPickerMatches`. Aggiungi un `useDeferredValue` (React 18+) o un debounce di 120 ms su `query` per la lista, lasciando il campo di testo immediato.
- [ ] 3.C.2 Verifica: il campo di testo reagisce subito; la lista si aggiorna entro 120 ms.

### 3.D Picker: collator una sola volta
- [ ] 3.D.1 `pickerRanking.ts` e `MealPickerModal.tsx` usano `localeCompare('it', ...)` in sort. Crea un `const collator = new Intl.Collator('it', { sensitivity: 'base' })` a livello di modulo e usa `collator.compare` nei sort. Verifica che l'ordine dei test in `scripts/test_picker_ranking.js` non cambi.
- [ ] 3.D.2 Misura S1 e S4.

### 3.E Planner: conteggi e liste una volta
- [ ] 3.E.1 `planner.tsx`: i conteggi per giorno e per slot (`planCounts`) dipendono solo da `plans`, `weekDays`, `selectedDate`. Verifica che non ci siano altri `plans.filter` nel JSX che si rifanno a ogni render: sostituiscili con i valori di `planCounts`.
- [ ] 3.E.2 `MealSlotCard` riceve handler stabili (già fatto: verifica che non ci siano arrow inline nel JSX delle card).
- [ ] 3.E.3 Misura S5 (aggiunta).

### 3.F Modale: montaggio condizionale
- [ ] 3.F.1 Il picker è montato solo quando è aperto (`pickerVisible && ...`). Verifica sul dispositivo che la chiusura funzioni. Se l'animazione di uscita manca, valuta `animationType="slide"` con `visible` gestito dal padre senza smontaggio: decidi con una misura, non in astratto.

---

## 4. Planner: lettura dati (priorità alta)

- [ ] 4.1 `getMealPlans()` (`src/db/database.ts`, circa riga 719) legge **tutta** la tabella `meal_plan` senza filtri. Aggiungi un parametro opzionale `{ fromDate, toDate }` con `WHERE date BETWEEN ? AND ?`. Il default resta la lettura completa per compatibilità.
- [ ] 4.2 Crea l'indice `idx_meal_plan_date` se non esiste già (verifica in `src/db/catalogSchema.ts`; esiste `meal_plan(date, slot)` secondo l'audit: NON duplicarlo).
- [ ] 4.3 `planner.tsx` chiama `loadPlans()` dopo ogni aggiunta/cancellazione. Sostituisci con: caricare solo la settimana visibile (`fromDate`/`toDate` dei `weekDays`) e aggiornare lo stato locale senza ricaricare ingredienti e pronti (che già hanno una cache).
- [ ] 4.4 Rimuovi `sameContent` basato su `JSON.stringify` in `planner.tsx`: confronta solo lunghezza e id, oppure lascia che React confronti per riferimento dopo `setPlans`.
- [ ] 4.5 Misura S5 e il tempo di `loadPlans` (`perfMark` attorno alla chiamata).

**Attenzione**: le viste di settimana diversa dalla corrente (settimana precedente o successiva) devono ancora funzionare: usa `fromDate`/`toDate` in base alla settimana mostrata, non solo a quella corrente.

---

## 5. Transizioni tra schede (priorità media)

- [ ] 5.1 `(tabs)/_layout.tsx` ha già `freezeOnBlur: true`. Verifica che sia effettivo: misura S6 e S7 prima e dopo, senza modifiche.
- [ ] 5.2 Ogni scheda con `useFocusEffect` deve fare solo il lavoro necessario:
  - `planner.tsx`: `getMealPlans` della settimana + preferenze. Ingredienti e pronti non si ricaricano al focus (già così: verifica).
  - `shopping.tsx`: al focus, `loadItems()` senza consolidamento (già così dopo il primo focus: verifica).
  - `favorites.tsx`: `refreshFavorites()` è no-op se nulla è cambiato (già così).
- [ ] 5.3 Il lavoro non urgente (consolidamento spesa al primo focus, auto-generazione piano) va spostato con `requestIdleCallback`, che è globale in RN. Non usare `InteractionManager`.
- [ ] 5.4 Misura S6, S7.

---

## 6. Immagini (priorità media, solo se la misura lo indica)

- [ ] 6.1 Le miniature delle ricette nel picker (52 px) e nelle card usano `expo-image`. Verifica che le immagini abbiano una dimensione richiesta coerente con il display (es. `contentFit`, dimensione dell'URL o `recyclingKey` nella FlatList) senza cambiare l'aspetto.
- [ ] 6.2 Se nelle misure S1/S2 il tempo è dominato dal caricamento immagini (confronta con un picker senza immagini in una build di test), aggiungi un `placeholder` leggero (colore di fondo) e `transition={0}`.
- [ ] 6.3 Non cambiare `cachePolicy` senza una misura che lo giustifichi.

---

## 7. Shopping list (priorità bassa, dopo le misure)

- [ ] 7.1 `shopping.tsx`: `groupedSections` ricalcola a ogni cambio di `items`. Verifica con `perfMark` quanto costa a 100 voci e a 300 voci, in release.
- [ ] 7.2 Se il costo è sopra 16 ms per frame: memoizza per reparto e ricalcola solo il reparto cambiato.
- [ ] 7.3 Misura S7.

---

## 8. Chiusura e verifica

- [ ] 8.1 Rimuovi la strumentazione temporanea (`perfMark` e le chiamate) o lasciala con `PERF_ENABLED = false` se è utile: decidi con l'utente.
- [ ] 8.2 Ripeti le misure S1..S7 in release e scrivi `work/perf/after.md` con la tabella a confronto con `baseline.md`.
- [ ] 8.3 Criterio di accettazione: S1, S2, S3, S4, S5 sotto 300 ms mediana in release. Se un criterio non è raggiunto, scrivi quale e non proseguire con altri punti senza conferma.
- [ ] 8.4 `npx tsc --noEmit` zero errori; `npx expo lint` nessun errore nuovo; `for f in scripts/test_*.js; do NODE_PATH=$PWD/node_modules node $f >/tmp/o.txt 2>&1 || echo FAIL $f; done` nessun FAIL.
- [ ] 8.5 Non committare.

---

## 9. Condizioni di arresto

Fermati e scrivi in `work/perf/blockers.md`:
- non puoi produrre una build di release: indica `BLOCCATO-MISURA` per tutti i passi che la richiedono e termina;
- una modifica rompe un test o `tsc`;
- una modifica cambia l'ordine dei risultati del picker o il comportamento dei preferiti;
- una modifica cambia il comportamento di import o export del ricettario.
