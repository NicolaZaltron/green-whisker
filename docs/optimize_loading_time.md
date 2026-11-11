# Checklist Ottimizzazione Tempi di Caricamento

> Data: 2026-11-11
> Branch: `feature/improve-shopping-list-and-planner`
> Dati app: 835 ricette, 723 ingredienti, 26 piatti pronti

---

## 🔴 Priorità ALTA — Impatto maggiore, rischio minore

### [ ] 1. Lazy-loading del catalogo (paginazione)

**Problema:** `initCatalog()` + `loadCatalog()` caricano **tutte le 835 ricette** in una singola query `SELECT json_data FROM catalog ORDER BY created_at DESC` ad ogni avvio.

**File coinvolti:**
- `src/app/_layout.tsx` (righe 67–76: sequenza di init)
- `src/services/recipeCatalog.ts` (`loadCatalog()` → `getCatalogRecipes()`)
- `src/db/database.ts` (`getCatalogRecipes()`, righe ~1206–1223)

**Cosa fare:**
- [ ] Creare `src/db/catalogDb.ts` con `getCatalogRecipesPaginated(offset, limit)` che usa `LIMIT ? OFFSET ?`
- [ ] Modificare `recipeCatalog.ts` per caricare le prime ~50 ricette ad avvio, e le altre on-demand quando l'utente scorre
- [ ] Mantenere `catalogRecipes` come array in-memory (già esiste), ma riempirlo progressivamente
- [ ] Aggiungere un contatore `loadedCount` per tracciare quante ricette sono state caricate

**Stima impatto:** Riduce il caricamento iniziale da ~2-3s a <500ms.

---

### [ ] 2. Lazy-loading degli ingredienti

**Problema:** `listIngredients()` in `src/db/ingredientsDb.ts` (righe ~165–195) esegue `SELECT * FROM ingredients` + `SELECT * FROM ingredient_nutrients` su **tutti i 723 ingredienti** ad ogni avvio e ad ogni cambio di tab.

**File coinvolti:**
- `src/db/ingredientsDb.ts` (`listIngredients()`, righe ~165–195)
- `src/app/(tabs)/planner.tsx` (righe ~115–125: `useEffect` su `catalogVersion`)
- `src/app/(tabs)/shopping.tsx` (righe ~145–165: `loadCatalog` locale)

**Cosa fare:**
- [ ] Modificare `listIngredients()` per supportare paginazione: `listIngredientsPaginated(offset, limit)`
- [ ] Aggiungere `ingredientsCache` con versioning (già esiste parzialmente, righe ~24–27) per evitare ricarichi
- [ ] Nel planner, caricare solo i primi 100 ingredienti ad avvio e caricare gli altri on-demand
- [ ] Aggiungere `getIngredientById(id)` ottimizzato con cache per lookup individuali

**Stima impatto:** Riduce il caricamento ingredienti da ~500ms a <100ms.

---

### [ ] 3. Sostituire `SELECT *` con colonne necessarie

**Problema:** Multiple query usano `SELECT *` invece di selezionare solo le colonne necessarie.

**File coinvolti:**
- `src/db/ingredientsDb.ts` (righe ~175, ~180): `SELECT * FROM ingredients`, `SELECT * FROM ingredient_nutrients`
- `src/db/readyMealsDb.ts` (righe ~145): `SELECT * FROM ready_meals`
- `src/db/simpleItemsDb.ts` (righe ~125): `SELECT * FROM simple_items`

**Cosa fare:**
- [ ] Sostituire `SELECT * FROM ingredients` con `SELECT id, name, type, tags, edible_alone, default_amount, default_unit, purchase_amount, purchase_unit, density_g_per_ml, created_at, updated_at FROM ingredients`
- [ ] Sostituire `SELECT * FROM ingredient_nutrients` con `SELECT ingredient_id, nutrient, value FROM ingredient_nutrients`
- [ ] Sostituire `SELECT * FROM ready_meals` con colonne esplicite
- [ ] Sostituire `SELECT * FROM simple_items` con colonne esplicite

**Stima impatto:** Riduzione memoria e tempo di parsing del 20-30%.

---

## 🟡 Priorità MEDIA — Impatto significativo

### [ ] 4. Evitare ricaricamento completo del catalogo ad ogni cambio di tab

**Problema:** `planner.tsx` e `shopping.tsx` ricaricano **tutti** gli ingredienti e piatti pronti ad ogni cambio di `catalogVersion` (anche se è cambiata solo 1 ricetta).

**File coinvolti:**
- `src/app/(tabs)/planner.tsx` (righe ~115–125: `useEffect` con `Promise.all([listIngredients(), listReadyMeals()])`)
- `src/app/(tabs)/shopping.tsx` (righe ~145–165: `loadCatalog` locale)

**Cosa fare:**
- [ ] Modificare `recipeCatalog.ts` per esporre un metodo `getChangedRecipes(sinceVersion?)` che ritorna solo le ricette cambiate
- [ ] Nel planner, invece di ricaricare tutto, fare un merge incrementale: `ingredients = prev.map(e => changedIngredients.find(c => c.id === e.id) ?? e)`
- [ ] Stesso approccio per `readyMeals`
- [ ] Aggiungere un flag `isFirstLoad` per distinguere il primo caricamento dai ricarichi

**Stima impatto:** I ricarichi di tab passano da ~500ms a <50ms.

---

### [ ] 5. Virtualizzare il planner con `SectionList`

**Problema:** Il planner usa `TabScrollView` (wrappea `ScrollView`) che non fa virtualizzazione. Mostra tutti i slot di tutte le settimane in memoria.

**File coinvolti:**
- `src/app/(tabs)/planner.tsx` (uso di `TabScrollView`)
- `src/components/TabScrollViews.tsx` (definizioni di `TabScrollView`, `TabFlatList`, `TabSectionList`)

**Cosa fare:**
- [ ] Sostituire `TabScrollView` con `TabSectionList` nel planner
- [ ] Configurare `initialNumToRender={7}`, `maxToRenderPerBatch={7}`, `windowSize={3}`
- [ ] Implementare `renderSectionHeader` per i giorni della settimana
- [ ] Implementare `renderItem` per i singoli slot (colazione, pranzo, cena)

**Stima impatto:** Riduzione memoria del 60-70% sul planner, scroll più fluido.

---

### [ ] 6. Ottimizzare il caricamento delle immagini

**Problema:** Le immagini delle ricette vengono caricate al primo visualizzazione senza lazy-loading intelligente. `cachePolicy="disk"` è impostato ma non c'è pre-fetching.

**File coinvolti:**
- `src/components/RecipeCard.tsx` (righe ~55–60: `Image` con `cachePolicy="disk"`)
- `src/components/RecipeModal.tsx` (uso di `Image` con `cachePolicy="disk"`)
- `app/(tabs)/index.tsx`, `app/(tabs)/planner.tsx`, `components/planner/MealPickerModal.tsx`

**Cosa fare:**
- [ ] Cambiare `cachePolicy="disk"` → `cachePolicy="memory"` per caricamenti più veloci (le immagini sono già in cache dal sistema)
- [ ] Aggiungere un `placeholder` leggero (SVG o data URI) per evitare flash bianchi
- [ ] Implementare `Image.prefetch()` per le immagini visibili ma non ancora caricate (lazy prefetch)
- [ ] Aggiungere `contentTransition="cross-dissolve"` per transizioni più morbide

**Stima impatto:** Riduzione flash bianchi del 80%, percezione di velocità +30%.

---

## 🟢 Priorità BASSA — Migliorie incrementali

### [ ] 7. Pre-caricamento intelligente (prefetching)

**Problema:** Non c'è alcun pre-caricamento. Le risorse vengono scaricate solo quando l'utente le richiede esplicitamente.

**Cosa fare:**
- [ ] Creare un hook `usePrefetchCatalog()` che, quando l'utente scorre, pre-carica la pagina successiva di ricette/ingredienti in background
- [ ] Usare `InteractionManager.runAfterInteractions()` per non interferire con l'interazione utente
- [ ] Aggiungere un threshold (es. quando l'utente scorre entro 200px dalla fine, pre-carica la pagina successiva)

**Stima impatto:** Navigazione più fluida, soprattutto su dispositivi lenti.

---

### [ ] 8. Migliorare il web fallback (localStorage)

**Problema:** Su web, tutte le operazioni usano localStorage che è **sincrono** e ha un limite di ~5MB.

**File coinvolti:**
- `src/db/database.ts` (tutte le funzioni hanno un branch `isWebFallback`)
- `src/db/ingredientsDb.ts`, `src/db/readyMealsDb.ts`, `src/db/simpleItemsDb.ts`

**Cosa fare:**
- [ ] Valutare IndexedDB (async) come alternativa a localStorage per il web
- [ ] Implementare chunking: dividere il catalogo in più chunk da 200 ricette ciascuno
- [ ] Aggiungere un timeout di caricamento con feedback visivo all'utente

**Stima impatto:** Web più responsive, evita blocchi del thread principale.

---

### [ ] 9. Aggiungere indici database per query frequenti

**Problema:** Alcuni query potrebbero beneficiare di indici aggiuntivi.

**File coinvolti:**
- `src/db/catalogSchema.ts` (creazione indici esistenti)

**Cosa fare:**
- [ ] Aggiungere `CREATE INDEX IF NOT EXISTS idx_catalog_created ON catalog(created_at DESC)` (già esiste)
- [ ] Valutare `CREATE INDEX IF NOT EXISTS idx_recipes_title ON catalog(json_data)` con una colonna computed per la ricerca testuale
- [ ] Valutare indicizzazione su `meal_plan(date, slot, kind)` (già esiste parzialmente)

**Stima impatto:** Query di ricerca +20-40% più veloci.

---

### [ ] 10. Code caching delle immagini in background

**Problema:** Le immagini vengono scaricate solo quando necessarie, senza un sistema di caching aggressivo.

**Cosa fare:**
- [ ] Configurare `ExpoImage` con `allowDiskCache: true` e `priority="high"` per le immagini visibili
- [ ] Implementare un sistema di cache con dimensione massima (es. 50MB) e politica LRU
- [ ] Invalidare la cache quando il catalogo viene aggiornato

**Stima impatto:** Riduzione traffico di rete del 60% dopo la prima visita.

---

## 📊 Riepilogo impatto stimato

| # | Modifica | Impatto | Rischio | Tempo stimato |
|---|----------|---------|---------|---------------|
| 1 | Lazy-loading catalogo | 🔴 Alto | Basso | 2-3 ore |
| 2 | Lazy-loading ingredienti | 🔴 Alto | Basso | 1-2 ore |
| 3 | SELECT * → colonne esplicite | 🔴 Alto | Basso | 1 ora |
| 4 | Ricarichi incrementali | 🟡 Medio | Medio | 2-3 ore |
| 5 | Virtualizzare planner | 🟡 Medio | Basso | 1-2 ore |
| 6 | Ottimizzare immagini | 🟡 Medio | Basso | 1-2 ore |
| 7 | Prefetching | 🟢 Basso | Basso | 2-3 ore |
| 8 | Web fallback IndexedDB | 🟢 Basso | Medio | 3-4 ore |
| 9 | Indici aggiuntivi | 🟢 Basso | Basso | 1 ora |
| 10 | Cache immagini background | 🟢 Basso | Basso | 1-2 ore |

**Totale tempo stimato:** ~15-21 ore
**Riduzione caricamento iniziale attesa:** da ~3-5s a <1s

---

## ⚠️ Note

- Prima di iniziare qualsiasi refactoring, fare un commit del codice attuale come snapshot
- Testare ogni modifica separatamente prima di procedere alla successiva
- Mantenere la compatibilità con il web fallback (localStorage) durante tutte le modifiche
- Misurare i tempi di caricamento con React Native Debugger o Flipper dopo ogni modifica
