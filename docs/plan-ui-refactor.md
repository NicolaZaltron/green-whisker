# Piano: refactoring della UI

Stato: **bozza, da approvare**. Fonte: verifiche di codice del 18 novembre 2026 sul branch `feature/ui-refactoring`. I numeri sono da rifare al momento di ogni fase, con la stessa ricerca.

## 1. Requisiti

**Obbligatorio: riuso dei componenti comuni.** Ogni controllo deve nascere da un componente condiviso. Le personalizzazioni ad hoc (stili inline, `borderRadius` e dimensioni scritti a mano nelle schermate) vanno ridotte drasticamente. Una schermata non deve più definire una forma o una dimensione propria.

**Forma.**
- Tutti i controlli cliccabili (bottoni, campi di testo, barre di ricerca, badge, pill, chip) hanno bordi perfettamente tondi: `borderRadius` uguale a metà altezza, quindi valore `full`.
- I bottoni quadrati diventano cerchi.
- Le barre di ricerca sono tonde alle estremità (capsula).

**Icone.** Un'unica libreria, senza licenze da gestire.

**Testi.** Ogni etichetta e testo dell'app è tradotto, compresi i giorni della settimana e i mesi.

**Dimensioni.** Al massimo tre altezze per ogni tipo di componente, tutte prese da token condivisi.

## 2. Stato attuale (rilevato)

| Area | Rilevato | Conseguenza |
|---|---|---|
| Valori di `borderRadius` | 228 occorrenze, con circa 20 valori diversi (8, 10, 12, 14, 16, 18, 20, 24, 32, …). Solo 3 usano `999` | Serve un token unico per il tondo |
| Dimensioni fisse 30–80 px per larghezza o altezza | 83 occorrenze | Da ridurre a tre taglie per tipo |
| Icone | `@expo/vector-icons` in 26 file. Due famiglie: **Ionicons** (circa 189 usi) e **MaterialCommunityIcons** (6 usi) | Ionicons è già la scelta dominante |
| Testi hardcoded | `planner.tsx:453` "pasti pianificati" (non tradotto). `plannerService.ts:344-349`: giorni e mesi in italiano fisso (`ITALIAN_DAYS`, `ITALIAN_MONTHS`), usati per `dayName` e `monthName` | Giorni e mesi vanno tradotti; le etichette "lun", "mar", … e "questa settimana" vanno ricercate per intero (non ancora individuate nel codice) |
| Alert e dialog | Già passano da `t()` | Nessun intervento |
| Componenti comuni esistenti | `src/components/ui/`: `AppTextField`, `CenterDialog`, `ConfirmModal`, `ScreenHeader`, più `SheetModal` | Base da cui partire, non da riscrivere |

## 3. Decisioni proposte

**D-UI1. Taglie dei cerchi.** Tre taglie per i bottoni tondi: **S 34**, **M 40**, **L 75**. Ogni taglia è un token in `src/theme/`. Nessun'altra dimensione è ammessa per i bottoni tondi.

**D-UI2. Altezze degli altri controlli.**
- Campi di testo e barre di ricerca: **M 40**, **L 52**. Bordo `full`.
- Badge e pill: **S 24**, **M 32**. Bordo `full`.

**D-UI3. Icone.** Standard unico **Ionicons** (MIT). Le sei icone di MaterialCommunityIcons passano a Ionicons. Prima di applicarlo, verificare che Ionicons abbia ogni glifo usato e confermare la licenza nel repository della libreria.

**D-UI4. Card cliccabili.** Le card (es. `RecipeCard`) sono cliccabili, ma una card a bordi completamente tondi starebbe male. Proposta: le card mantengono un raggio contenuto e fisso, definito nel token. Solo i controlli veri (bottoni, campi, badge, pill) diventano `full`. **Confermato: raggio 20** (`cardRadius`), come le card attuali. Nelle linee guida moderne le card stanno tra 12 e 20: 20 è nella fascia alta e l'utente lo trova già gradevole.

**D-UI6. Colori solo dal tema.** Nessun colore hardcoded nei componenti e nelle schermate: ogni colore passa da `useTheme()` e da `src/theme/palette.ts`. Non sono ammessi valori esadecimali, `rgb()` o `rgba()` fuori dal tema. Oggi ci sono 65 letterali di colore in 12 file fuori da `src/theme/` (es. `#D97757` in `index.tsx` e `favorites.tsx`, `rgba(...)` in `index.tsx`, `#5A3634`/`#E8B4B1` in `planner.tsx`). Le varianti di stato (es. rosa per il delete, verde per Telegram/WhatsApp) diventano token semantici nella palette, sia in chiaro sia in scuro. Eccezione: i colori di marchio dei servizi esterni (Telegram, WhatsApp) restano in un solo file dedicato, con commento.

**D-UI5. Giorni e mesi.** Non più array italiani fissi. Si formattano con `Intl.DateTimeFormat` nella lingua attiva (`it`, `en`), oppure con chiavi i18n per i nomi brevi. Da scegliere in fase 5 dopo aver letto la documentazione Expo su `expo-localization`.

## 4. Componenti da creare (in `src/components/ui/`)

| Componente | Sostituisce | Varianti |
|---|---|---|
| `CircleButton` | Bottoni quadrati e icon button sparsi | `size`: S, M, L. Icona Ionicons obbligatoria. `variant`: pieno, contorno, neutro |
| `Button` | Bottoni rettangolari con testo | `size`: M, L. Radius `full` |
| `AppTextField` (esteso) | Input ad hoc | `size`: M, L. Radius `full`. Supporta `leftIcon` |
| `SearchBar` | Barre di ricerca ad hoc | Basata su `AppTextField`, con icona lente e pulsante di pulizia |
| `Pill` / `Badge` | Chip, badge e tag | `size`: S, M. Radius `full` |
| `IconButton` alias | — | Non creare: si usa `CircleButton` |
| `ConfirmDialog` | Overlay e card delle conferme in `ConfirmModal`, `CenterDialog`, `PlannerDeleteModal`, `PlannerRegenModal`, `IngredientsModal`, `RecipeModal` | Un solo dialogo: titolo, testo, due azioni. `variant`: normale, distruttiva |
| `ModalHeader` | Header ripetuto in `AISettingsModal`, `MagicRecipeImporterModal`, `RecipeBookModal` | Titolo, sottotitolo opzionale, chiusura a destra |
| `Toast` | `toastBanner` in `planner`, `RecipeModal`, `PantryView` | `position`: top o bottom, nessun altro valore |
| `EmptyState` | `emptyContainer` ed `emptyIconCircle` in `index`, `shopping`, `favorites`, `PantryView` | Icona, titolo, sottotitolo, azione opzionale |
| `Checkbox` | `checkbox` in `shopping`, `RecipeModal`, `ShoppingPlanModal` | Una sola taglia |
| `SectionTitle` | `sectionTitle` e `sectionSubtitle` in `shopping`, `index`, `MagicRecipeImporterModal`, `HeaderMenu`, `RecipeModal` | Titolo con sottotitolo opzionale |
| `IconBadge` | `stepBadge` in `AISettingsModal` e `RecipeModal`, cerchi con icona in `EmptyState` | Taglia S o M, come `CircleButton` |
| `Spinner` | `ActivityIndicator` in 8 file | Colore e dimensione dal tema |
| `ProgressBar` | `progressBar` e `progressFill` in `planner` | Valore da 0 a 1 |

Token in `src/theme/` (accanto a `palette`): `radius.full`, `size.circle.{S,M,L}`, `size.field.{M,L}`, `size.pill.{S,M}`, e il raggio fisso delle card. Si aggiungono `elevation.{1,2,3}` (le 71 occorrenze di `shadowColor` ed `elevation` oggi variano) e `space` per i padding e i gap ricorrenti.

## 4b. Componenti ricorrenti da centralizzare

Oltre ai componenti della sezione 4, il codice ha pattern duplicati. Quelli a priorità alta riguardano l'uso quotidiano dell'app.

**Priorità alta**

1. **Bottoni primari e secondari.** `primaryBtn` e `secondaryBtn` in `AISettingsModal`, `RecipeBookModal`, `IngredientsModal`, `RecipePreviewCard`. Padding e radius variano tra le copie. → `Button` con `variant`: primary, secondary, danger, ghost.
2. **Modali.** Ci sono 12 `<Modal>` diretti, anche se `SheetModal` esiste già. `HeaderMenu`, `TransferModal`, `UnresolvedIngredientsModal`, `MealPickerModal` e le modali di conferma li aprono direttamente. → Tutte le modali passano da `SheetModal` (o `ConfirmDialog` per le conferme).
3. **Header dei modali.** → `ModalHeader`. `HeaderIconButton` (oggi in `ScreenHeader`) si sposta in `ui/`.
4. **Toast.** → `Toast` con posizione top o bottom. Oggi radius 12 o 14, zIndex 100 o 999.
5. **Stato vuoto.** → `EmptyState`. Il padding cambia da 20 a 70 tra le schermate.

**Priorità media**

6. **Chip e pill.** Ripetuti in `MagicRecipeImporterModal`, `IngredientsModal`, `RecipeBookModal`, `AISettingsModal`, `UnresolvedIngredientsModal`, più `pill` in `PlannerPreferencesModal` e `_layout.tsx`. → `Pill`.
7. **Checkbox.** → `Checkbox`.
8. **Titoli di sezione.** → `SectionTitle`.
9. **Icone in cerchio.** → `IconBadge`.
10. **Barre di avanzamento.** → `ProgressBar`.
11. **Indicatori di caricamento.** → `Spinner`.

**Trasversali**

- **Ombre ed elevation.** → token `elevation.{1,2,3}`.
- **Layout ripetuto.** `alignItems: 'center'` (197 volte), `flexDirection: 'row'` (145), `justifyContent: 'center'` (89). Una piccola libreria di layout (`Row`, `Center`) riduce il rumore. Da valutare caso per caso, senza forzarla.
- **Colori hardcoded.** 65 letterali di colore in 12 file fuori da `src/theme/` (decisione D-UI6). Si correggono durante la migrazione, con l'aggiunta di token semantici alla palette dove serve.

**Non centralizzare:** il contenitore delle card (`RecipeCard`, `RecipePreviewCard`) e le righe della spesa. Sono di domini diversi. Si unificano solo le parti interne che si ripetono (bottoni, badge, checkbox).

## 5. Fasi

**Fase 0. Token e decisioni.** Creare i token in `src/theme/`. Confermare D-UI1, D-UI2 e D-UI4.

**Fase 1. Inventario.** Per ogni file: elencare i `borderRadius`, le dimensioni fisse e i testi hardcoded. Il risultato è una checklist per file, con la componente che la sostituisce.

**Fase 1b. Colori.** Elencare i 65 letterali fuori dal tema, mapparli su token esistenti o nuovi della palette, e aggiungere la regola al lint (divieto di letterali di colore fuori da `src/theme/`, con eccezioni esplicite). Verifica in chiaro e scuro.

#### Inventario colori

Token nuovi aggiunti a `Palette` (chiaro e scuro): `accent`, `accentSoft`, `dangerBorder`, `warningText`, `warningSoft`, `infoSoft`, `infoBorder`, `successSoft`, `successBorder`, `neutralStrong`, `neutralText`, `neutralIcon`, `surfaceGlass`, `surfaceAltGlass`, `onPrimaryFaint`. I colori di marchio sono in `src/theme/brandColors.ts`.

| File:riga | Letterale | Token |
|---|---|---|
| `(tabs)/planner.tsx:694` | `#5A3634` / `#E8B4B1` | `dangerBorder` (nuovo) |
| `(tabs)/index.tsx:793` | `rgba(17,22,17,.7)` / `rgba(247,249,246,.7)` | `surfaceAltGlass` (nuovo) |
| `(tabs)/index.tsx:902, 929` | `#D97757` | `accent` (nuovo) |
| `(tabs)/favorites.tsx:120` | `#D97757` | `accent` (nuovo) |
| `components/RecipeModal.tsx:634` | `#D97757` | `accent` (nuovo) |
| `components/RecipeModal.tsx:1554` | `#D97757` | `accent` (nuovo) |
| `components/RecipeCard.tsx:295` | `#D97757` | `accent` (nuovo) |
| `components/RecipeModal.tsx:1544` | `#3A2A22` / `#FBEFEA` | `accentSoft` (nuovo) |
| `components/TransferModal.tsx:95` | `rgba(0,0,0,0.4)` | `overlay` (esistente) |
| `components/UnresolvedIngredientsModal.tsx:138` | `rgba(0,0,0,0.4)` | `overlay` (esistente) |
| `components/planner/MealPickerModal.tsx:939` | `rgba(0,0,0,0.4)` | `overlay` (esistente) |
| `components/RecipeCard.tsx:143, 373` | `#F2B66D` / `#995200` | `warningText` (nuovo) |
| `components/RecipeCard.tsx:363` | `#3A2E1C` / `#FFF4E5` | `warningSoft` (nuovo) |
| `components/MagicRecipeImporterModal.tsx:1126` | `#FCD34D`/`#B45309`, `#3D2E0E`/`#FEF3C7` | `warningText`, `warningSoft` (lieve cambio di tinta, da verificare) |
| `components/RecipeCard.tsx:340` | `#27302A` / `#F3F5F3` | `surfaceAlt` (esistente, valore vicino) |
| `components/PantryView.tsx:563` | `rgba(255,255,255,0.25)` | `onPrimaryFaint` (nuovo) |
| `components/RecipeModal.tsx:1233, 1240` | `#2AABEE`, `#8ED3F5` / `#0E73A6` | `brandColors.telegram`, `brandTextColors` |
| `components/RecipeModal.tsx:1249, 1253, 1256` | `#25D366`, `#7FD39C` / `#1B8742` | `brandColors.whatsapp`, `brandTextColors` |
| `components/RecipeModal.tsx:1240` (chevron) | `#2AABEE` | `brandColors.telegram` |
| `components/RecipeModal.tsx:1281` | `#455A64` / `#607D8B` | `neutralStrong` (nuovo) |
| `components/RecipeModal.tsx:1285` | `#CFD8DC` / `#37474F` | `neutralText` (nuovo) |
| `components/RecipeModal.tsx:1288` | `#90A4AE` / `#607D8B` | `neutralIcon` (nuovo) |
| `components/RecipeModal.tsx:1503` | `rgba(27,35,28,.95)` / `rgba(255,255,255,.95)` | `surfaceGlass` (nuovo) |
| `components/RecipeModal.tsx:2159` | `#132630` / `#F0F8FD` | `infoSoft` (nuovo) |
| `components/RecipeModal.tsx:2160` | `#1E3A48` / `#D1EAF8` | `infoBorder` (nuovo) |
| `components/RecipeModal.tsx:2163` | `#13261A` / `#F0FAF3` | `successSoft` (nuovo) |
| `components/RecipeModal.tsx:2164` | `#1F3D2A` / `#D2F2DD` | `successBorder` (nuovo) |
| `constants/shoppingDepartments.ts:36-75` | 13 reparti x (bg, text, border) x chiaro/scuro, più 2 fallback | Tabella dati di categoria: da spostare in `src/theme/categoryColors.ts` nella migrazione (i fallback si mappano su `primarySoft`/`primaryText`/`borderStrong`) |
| `services/plannerService.ts:219-223` | 5 tipi di pasto x (color, bgColor, darkColor, darkBgColor) | Tabella dati di categoria: da spostare in `src/theme/mealColors.ts` (`pranzo` e `cena` coincidono quasi con `primarySoft` e `dangerSoft`/`accent`) |

Regola lint: `no-restricted-syntax` in `eslint.config.js`, a `warn`, su `src/**` esclusa `src/theme/**`. Da portare a `error` a fine migrazione.

**Fase 2. Icone.** Sostituire MaterialCommunityIcons con Ionicons. Rimuovere l'import della famiglia non più usata. Verifica: `npx tsc --noEmit`, `npx expo lint`.

**Fase 3. Componenti base.** Creare `CircleButton`, `Button`, `SearchBar`, `Pill`/`Badge`, estendendo `AppTextField`. Ogni componente ha test visivo in chiaro e scuro.

Stato (componenti creati in `src/components/ui/`, schermate non ancora migrate):
- `CircleButton` (`CircleButton.tsx`): sì. `size` S/M/L, `variant` filled/outline/neutral (= pieno/contorno/neutro, nomi inglesi), `disabled`. Deviazione: hitSlop porta l'area di tocco a 44pt.
- `Button` (`Button.tsx`): sì. `size` M/L (altezza minima da `size.field` 40/52, deviazione: riuso dei token dei campi), `variant` primary/secondary/danger/ghost, `disabled`, `icon` opzionale.
- `AppTextField` (`AppTextField.tsx`): esteso. `size` M/L opzionale (token + radius full); senza `size` resta il vecchio 44pt/radius 12, per compatibilità con i 10 file chiamanti. `leftIcon` esisteva già. Il default passerà a M a fine migrazione.
- `SearchBar` (`SearchBar.tsx`): sì. `size` M/L; icona `search`; la pulizia viene da `AppTextField`.
- `Pill` e alias `Badge` (`Pill.tsx`): sì. `size` S/M, `variant` neutral/primary/accent.

**Fase 3b. Componenti strutturali.** Creare `ConfirmDialog`, `ModalHeader`, `Toast`, `EmptyState`, `Checkbox`, `SectionTitle`, `IconBadge`, `Spinner`, `ProgressBar`. Spostare `HeaderIconButton` in `ui/`. Aggiungere i token `elevation` e `space`.

Stato (token `elevation` e `space` già presenti in `tokens.ts`):
- `ConfirmDialog` (`ConfirmDialog.tsx`): sì. Basato su `CenterDialog` (non su `ConfirmModal`, che ha icona e un solo bottone opzionale); `variant` normal/destructive; due azioni obbligatorie, nessuna icona (deviazione: `ConfirmModal` ha l'icona). I vecchi componenti non sono rimossi.
- `ModalHeader` (`ModalHeader.tsx`): sì. Titolo, sottotitolo, chiusura con `CircleButton` S (`closeLabel` obbligatoria).
- `Toast` (`Toast.tsx`): sì. `position` top/bottom, `cardRadius`, `elevation(3)`; mostra/nasconde lo decide il chiamante (nessun timer).
- `EmptyState` (`EmptyState.tsx`): sì. Icona (`IconBadge` M), titolo, sottotitolo, `action` opzionale (Button).
- `Checkbox` (`Checkbox.tsx`): sì. Taglia unica 24 (costante locale, non token), hitSlop 44pt.
- `SectionTitle` (`SectionTitle.tsx`): sì. Titolo e sottotitolo opzionale.
- `IconBadge` (`IconBadge.tsx`): sì. `size` S/M (34/40 da `size.circle`), icona o testo.
- `Spinner` (`Spinner.tsx`): sì. `size` small/large, `tone` primary/onPrimary/muted.
- `ProgressBar` (`ProgressBar.tsx`): sì. `value` 0..1 (limitato), radius full, altezza 8 locale.
- `HeaderIconButton`: spostato in `HeaderIconButton.tsx` (usa `size.circle.M`, `elevation(2)`); `ScreenHeader` lo importa e lo riesporta, quindi gli import esistenti funzionano.

**Fase 4. Migrazione delle schermate.** Una cartella alla volta (`planner`, `shopping`, `index`, modali). Ogni file perde stili locali di forma e dimensione. Il numero di `borderRadius` in `src/` deve scendere a un insieme chiuso di token. Ordine: prima le priorità alte della sezione 4b, poi la media.

**Fase 5. Traduzioni.**
- Tradurre "pasti pianificati" e cercare tutte le altre stringhe non tradotte (inclusi "questa settimana" e i nomi brevi dei giorni).
- Sostituire `ITALIAN_DAYS` e `ITALIAN_MONTHS` con formattazione localizzata (D-UI5).
- Controllo di parità: `en.json` e `it.json` hanno le stesse chiavi (oggi entrambi 2447 righe) e nessun valore inglese contiene testo italiano.

**Fase 6. Verifica.** `npx tsc --noEmit`, `npx expo lint`, `npx expo-doctor`. Prova visiva su telefono e web, in chiaro e scuro, con il comando `run` o con screenshot.

## 6. Regole per i nuovi codici

- Nessun `borderRadius` numerico in una schermata: si usa `radius.full` o il raggio delle card.
- Nessuna dimensione fissa per i controlli: si usa un token di taglia.
- Nessuna icona fuori da Ionicons.
- Nessun testo visibile fuori da `t()`.

## 7. Domande aperte

1. Confermi le taglie S 34 / M 40 / L 75 per i cerchi, e M 40 / L 52 per i campi?
2. Le card restano con raggio contenuto (D-UI4), o vuoi anche quelle tonde?
3. Per giorni e mesi preferisci `Intl` (formato del sistema) o chiavi i18n (controllo completo sulle abbreviazioni)?

## Stato migrazione

**Tranche modali e dialoghi.**

- File toccati: `ConfirmDialog`, `IconBadge` (ui); `planner/PlannerDeleteModal`, `planner/PlannerRegenModal`, `planner/MealPickerModal`; `HeaderMenu`, `TransferModal`, `UnresolvedIngredientsModal`, `RecipePreviewCard`, `ShoppingPlanModal`, `AISettingsModal`, `MagicRecipeImporterModal`, `RecipeBookModal`, `IngredientsModal`, `RecipeModal`; `app/(tabs)/shopping.tsx`.
- Componenti sostituiti: `ConfirmModal` (eliminato, nessun import residuo), dialoghi di conferma ad hoc (planner, `IngredientsModal`, `RecipeModal` variante) con `ConfirmDialog`; `<Modal>` diretti con `SheetModal` (tutti, tranne `SheetModal` e `CenterDialog` stessi); header di `AISettingsModal`, `MagicRecipeImporterModal`, `RecipeBookModal` con `ModalHeader`; `primaryBtn`/`secondaryBtn`/`dangerBtn` con `Button` (`AISettingsModal`, `RecipeBookModal`, `IngredientsModal`, `RecipePreviewCard`, `TransferModal`); `ActivityIndicator` con `Spinner` nelle modali; `toastBanner` di `RecipeModal` con `Toast` (top).
- Prop aggiunte: `ConfirmDialog` ha `icon`, `children`, `extraAction` e `cancelLabel` opzionale (senza, il dialogo ha un solo bottone); `IconBadge` ha `tone` primary/danger.
- Deviazioni: l'icona di `ConfirmDialog` è un `IconBadge` M (40) invece del cerchio da 64. `PlannerRegenModal` perde l'icona chef-hat (ora `restaurant-outline`) e resetta lo scope con un reset in render (il `Modal` non smonta più il corpo). Il menu di `HeaderMenu` diventa un bottom sheet, non più un popup ancorato in alto a destra. `MagicRecipeImporterModal` perde l'icona sparkles e lo sfondo dell'header. `RecipePreviewCard` e le modali centrate passano a bottom sheet (centrato su schermi larghi). Il `Toast` di `RecipeModal` perde l'icona e diventa flottante. `dangerBtn` diventa pieno rosso (era contorno o sfondo tenue). Taglie `Button`: M (40) per i footer di `IngredientsModal` e per "elimina selezionati", L (52) per gli altri.
- Resta: `CenterDialog` diretto in `shopping.tsx` (conferma e quantità), header di `IngredientsModal` e del filtro di `RecipeBookModal`, conferma inline di eliminazione in `RecipeModal`/`RecipeBookModal`, stili scope di `PlannerRegenModal`, colori di marca in `RecipeModal`, toast di `planner.tsx` e `PantryView.tsx` (altra tranche). Prova visiva non eseguita.

**Tranche 2: schermate e componenti rimanenti.**

- File toccati: `app/(tabs)/favorites`, `index`, `planner`, `shopping`; `PantryView`, `RecipeModal`, `ShoppingPlanModal`, `AISettingsModal`, `HeaderMenu`, `MagicRecipeImporterModal`; `i18n/locales/it.json` e `en.json` (nuove chiavi `planner.plannedMeals`, `planner.prevWeek`, `planner.nextWeek`).
- Componenti sostituiti:
  - `EmptyState`: favorites, index, shopping, PantryView (due stati vuoti, dentro un contenitore card locale).
  - `SearchBar`: favorites, index.
  - `CircleButton`: FAB di index (L), filtro e chiusura del foglio filtri di index, aggiunta/eliminazione/chiusura selettore reparto di shopping, navigazione settimana e aggiunta pasto di planner.
  - `Button`: reset/applica filtri (index), conferme e quantità (shopping), azioni dello stato vuoto di shopping, Pianifica/Elimina (planner), Aggiungi (PantryView).
  - `Checkbox`: shopping, RecipeModal (ingredienti e inclusione note nella condivisione), ShoppingPlanModal.
  - `SectionTitle`: RecipeModal (preparazione), HeaderMenu (lingua, tema), MagicRecipeImporterModal (due titoli con sottotitolo).
  - `IconBadge`: stepBadge di AISettingsModal e RecipeModal.
  - `Toast`: planner (bottom, avvolto in `Animated.View` per mantenere la dissolvenza), shopping (bottom), PantryView (top).
  - `ProgressBar`: planner. `Spinner`: index, planner. `Pill`: badge pagina in MagicRecipeImporterModal.
  - Stringa "pasti pianificati" di planner ora passa da `t()`.
- Deviazioni visive:
  - Stati vuoti: padding uniforme 40 (prima 60-70 verticale, 20-30 orizzontale); icona in `IconBadge` M da 40 (prima 68-80 o icona nuda); titolo 17, sottotitolo 13. In favorites e shopping l'azione perde la sua ombra; in favorites perde l'icona compass (`EmptyState.action` non ha icona). In shopping i due pulsanti sono `Button` sotto lo stato vuoto, non più a tutta larghezza.
  - FAB di index: solo icona, senza l'etichetta "Importa" sotto (resta come `accessibilityLabel`); ombra `elevation(3)`.
  - Filtro index: da quadrato 46 a cerchio 40, il contatore resta sovrapposto.
  - Barra di avanzamento planner: altezza 8 (prima 4), traccia `surfaceMuted`.
  - Toast: niente icona; colore invertito (`colors.text` su `background`, prima verde); planner e shopping ora a larghezza piena con raggio card; shopping prima era una pillola centrata; posizione verticale = safe area + 20 (planner: prima 16 fisso); PantryView top = safe area + 20 (prima 10).
  - Planner: "Elimina" diventa `Button` danger pieno (prima sfondo soft con bordo rosato); "Pianifica" usa l'icona `restaurant-outline` (prima chef-hat); durante la generazione resta un riquadro verde con `Spinner`; frecce settimana da 32 a 34; il pulsante aggiungi pasto perde il colore dello slot (ora neutro, 34).
  - Shopping: checkbox da cerchio 22 a quadrato arrotondato 24; pulsante elimina riga da icona nuda a cerchio neutro 34 (righe più alte); pulsante aggiungi da 42 quadrato a cerchio 40; "Annulla" dei dialoghi è `secondary` (verde soft, prima grigio).
  - RecipeModal: checkbox da 22 a 24; stepBadge da 28 a 34, il completato resta soft con segno di spunta (prima verde pieno); titolo "Preparazione" da 18 a 16.
  - AISettingsModal: stepBadge da 24 a 34, soft con testo verde (prima verde pieno con testo bianco).
  - HeaderMenu: etichette Lingua e Tema da 12 a 16.
  - MagicRecipeImporterModal: sottotitolo sotto il titolo, a sinistra del pulsante Incolla/Rimuovi (prima a tutta larghezza sotto la riga), colore `textMuted`; badge pagina soft invece di verde traslucido.
  - Colori: `#D97757` in index sostituito da `colors.accent` (filtro badge e pillola filtri attivi); rimossi due letterali del bordo di Elimina in planner. Warning colori da 153 a 148.
- Senza equivalente nei componenti comuni (lasciati ad hoc):
  - Chip selezionabili/toggle (`chip`, `filterPill`, `quickPill`, `suggestionChip`, `selectedChip`, `dayChip`, pill di `PlannerPreferencesModal`, `activeFiltersPill`): `Pill` non è cliccabile e non ha stato selezionato. Per questo i punti 1 (tranne il badge pagina) non sono migrati.
  - Il `pill` di `_layout.tsx` è lo stato attivo della tab bar: escluso.
  - `sectionTitle` di shopping (riga con badge "completato", titolo 14), `sheetSectionTitle` di index (con icona), `slotBadge` di planner, `readyBadge` di PantryView (icona + colore): `SectionTitle` e `Pill` non hanno icona né slot a destra.
  - `Button` senza stato di caricamento; `AppTextField` di aggiunta in shopping e PantryView non è una ricerca (senza lente), resta `AppTextField`.
  - Selettore modalità catalogo/dispensa di index (segmented control), `CenterDialog` con form quantità di shopping, `pageDeleteBtn` e rimozione chip di PantryView (icone 18-24 sopra altri contenuti).
- Resta: chip selezionabili (serve un componente `Chip` con `selected` e `onPress`, o una prop su `Pill`), `PlannerPreferencesModal`, `IngredientsModal`, `RecipeBookModal`, `UnresolvedIngredientsModal` (solo chip), dialoghi di shopping verso `ConfirmDialog`, `sectionTitle` di shopping, prove visive.

**Tranche 3: chip, raggi e dimensioni.**

- File toccati: `ui/Pill`, `theme/tokens`; `app/(tabs)/index`, `shopping`; `PantryView`, `IngredientsModal`, `RecipeBookModal`, `UnresolvedIngredientsModal`, `MagicRecipeImporterModal`, `AISettingsModal`, `RecipeModal`; `planner/PlannerPreferencesModal`, `MealPickerModal`, `PlannerRegenModal`, `RecipeServingsStep`, `PlannedItemCards`; raggi sostituiti anche in `app/_layout`, `planner` (tab), `RecipeCard`, `OutOfHomeList`, `SheetModal`, `HeaderMenu`, `ShoppingPlanModal`, `ui/AppTextField`, `ui/CenterDialog`; `i18n` (`common.decrease`, `common.increase`, `common.view`).
- Componenti estesi: `Pill` ha ora `onPress` (rende un `Pressable`, `accessibilityRole="button"`, `accessibilityState` con `selected`/`disabled`), `selected` (sfondo `primary`, testo `onPrimary`), `icon` (Ionicons a sinistra), `fill` (flex 1 in una riga), `disabled`, `accessibilityLabel`. Un `Pill` premibile non selezionato ha bordo `border`. Tokens: `radius.md` (12) e `radius.sm` (8), per contenitori non cliccabili.
- Migrati a `Pill`: chip di categoria/sottocategoria, chip del foglio filtri e pillola filtri attivi (index); filtri reparto e quick quantity (shopping); suggerimenti, selezionati, quick, filtri (PantryView); chip di Ingredients, RecipeBook, Unresolved, Magic importer, AISettings; pill calendario (PlannerPreferences); chip di RecipeModal (porzioni e piano), MealPicker, RecipeServingsStep, scope di PlannerRegenModal. `CircleButton` S al posto di quadrati/cerchi da 30-36 ad hoc: chiusura di PlannerPreferences e MealPicker, stepper (PlannerPreferences, RecipeServingsStep), vedi/elimina pasto (PlannedItemCards).
- Raggi: mappa per valore. 999, 13-19, 36, 1.5-2.5 -> `radius.full`; 14, 16, 20, 24 -> `cardRadius`; 11, 12 -> `radius.md`; 6, 8, 9, 10 -> `radius.sm`; `dietCard` e `substitutionsCard` (18) -> `cardRadius`. Rimossi gli stili locali inutilizzati (chip e relativi testi, `itemQty`, `placeholder`, `dietHintText`, `retryBtn`, ecc.).
- Deviazioni visive:
  - Chip: altezza 32, testo 13, bordo sottile; selezionato = verde pieno con testo `onPrimary`. I chip dei reparti di shopping perdono i colori per reparto (selezionato verde) e l'icona di spunta "tutto completato"; in index la pillola filtri attivi diventa `accent` soft (era arancio pieno) con testo accent.
  - PantryView: il chip selezionato non ha più il bottone "x" separato: tutta la pillola è premibile, con icona "x" a sinistra; i chip suggerimento e quick hanno icona "+" a sinistra.
  - Pill calendario di PlannerPreferences: altezza 32 (prima padding 8).
  - Raggi: elementi con 14/16 passano a 20 (card); 9-10 a 8; 11 a 12. I tab versione di `RecipeModal` (14/11) diventano 20/12. `SheetModal` da 24 a 20; tab bar `_layout` 20 invariato. Gli elementi con 17-19 su controlli piccoli (36-38) restano tondi.
  - Stepper e chiusura: da 30/36 a 34; vedi/elimina pasto da 32 a 34, perdono il tono soft (primary/danger) e diventano neutri; stepper in `outline`.
- Ancora ad hoc, con motivo:
  - `dayChip` di planner: tessera verticale (giorno, numero, puntini), non una pillola.
  - `favButton`/`variantButton` di `RecipeCard` (34, sovrapposti all'immagine), `menuBtn` di `HeaderMenu` (40), `addSlotCircle` (36, icona dentro un bottone più grande), `dietIconCircle`/`shareIconCircle` (36/38, illustrazioni), `pageDeleteBtn` (24), `toggle` (46x26, interruttore custom), altezze dei campi numerici (40-44, input inline) e `parseButton`/`saveRecipeBtn` (ombra, solo valori 0 e 4 sotto `shadowOffset`).
  - Tab bar di `_layout` non toccata a livello di componenti.
- Conteggi finali: `borderRadius: <numero>` in `src/**/*.tsx` fuori da `theme`: 0 (erano 166). Warning lint 147 (erano 148), 0 errori; `tsc` pulito. Prova visiva non eseguita.

**Tranche 4: colori fuori dal tema, giorni e mesi localizzati.**

- File toccati: `eslint.config.js`; `theme/palette.ts`, `theme/categoryColors.ts` (nuovo), `theme/mealColors.ts` (nuovo); `constants/shoppingDepartments.ts`; `services/plannerService.ts`; `utils/dates.ts`; `app/(tabs)/index.tsx`, `planner.tsx`; `RecipeCard`, `RecipeModal`, `MagicRecipeImporterModal`; `i18n/locales/it.json` e `en.json`.
- Token aggiunti in `palette.ts` (light e dark): `surfaceNeutral` (badge difficoltà di `RecipeCard`), `cautionText`, `cautionSoft` (avviso di revisione in `MagicRecipeImporterModal`). Il resto dei letterali corrispondeva a token esistenti (`accent`, `accentSoft`, `warningText`, `warningSoft`, `infoSoft/Border`, `successSoft/Border`, `neutralStrong/Text/Icon`, `surfaceGlass`, `surfaceAltGlass`). Colori di marca di `RecipeModal` da `brandColors.ts` (`brandColors`, `brandTextColors`).
- Tabelle: `theme/categoryColors.ts` (reparti, chiara e scura, più i due fallback) e `theme/mealColors.ts` (pasti, chiara e scura). `shoppingDepartments.ts` e `plannerService.ts` le importano; `SLOT_COLORS` mantiene la stessa forma di prima, costruita dalle due tabelle.
- Regola lint colori: da `warn` a `error`, nessuna eccezione. Letterali di colore fuori da `src/theme/`: 0 (erano 57).
- Giorni e mesi (D-UI5): `Intl` (`toLocaleDateString`) con la lingua attiva di i18next (`i18n.language`, la stessa fonte di `planner.tsx`), non chiavi i18n. Motivo: 7 giorni e 12 mesi in due lingue, forma breve e lunga corrette per ogni lingua senza duplicare 38 chiavi; niente cache a livello di modulo, il calcolo avviene a ogni chiamata e `planner.tsx` e `RecipeModal` hanno `i18n.language` tra le dipendenze dei `useMemo`. `utils/dates.ts` ha `formatWeekday(date, locale, 'long' | 'short')` e `formatMonthShort`; `WeekDayInfo` ha il nuovo campo `dayShort`, al posto di `dayName.slice(0, 3)`. `ITALIAN_DAYS` e `ITALIAN_MONTHS` rimossi.
- Stringhe passate da `t()`: etichette settimana (`planner.week.*`), toast "Pianificato per" (`planner.scheduledFor`), testo di condivisione del piano (`planner.share.*`). `SLOT_LABELS` rimosso (la condivisione usa `planner.slots.*`).
- Deviazioni visive: abbreviazioni dei giorni ora "Lun"/"Mon" (maiuscola iniziale come prima); i mesi brevi in italiano ora sono quelli di `Intl` ("Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"), con il punto finale tolto; in inglese "Jan"..."Dec". Nessun colore cambia.
- Limiti: prova visiva non eseguita; da verificare le etichette dei giorni in italiano e in inglese e il cambio lingua a runtime su Hermes (Android e iOS). Le etichette del mese nel range del calendario "rolling" (`utils/dates.ts`, tabella `MONTHS`) restano due tabelle it/en. `formatWeekPlanShareText` non ha chiamanti.

**SegmentedControl.**

- Componente: `ui/SegmentedControl.tsx`. Props: `options: { key; label; icon? }[]`, `accessibilityLabel` (obbligatoria, sul gruppo), `value` + `onChange(key)` per la selezione singola, oppure `multiple` + `values` + `onChange(keys)` per la multipla, `disabled`, `size` ('M'), `testID`. Ogni opzione è un `Pressable` con `accessibilityRole="button"` e `accessibilityState` con `selected`. Capsula `radius.full` su `surfaceAlt`, indicatore attivo a capsula `primary` con testo `onPrimary`, nessun letterale di colore o numero fuori dai token.
- Decisione su `size`: altezza dell'opzione `size.pill.M` (32) più `space.xs` di padding per lato = 40 = `size.field.M`, quindi la capsula è alta come i campi di testo e come lo switch Ricette/Dispensa. Una sola taglia (M).
- Decisione su scroll: la capsula è una `ScrollView` orizzontale (`showsHorizontalScrollIndicator={false}`, `width: '100%'`, `flexGrow: 0`, niente `alignSelf`); le opzioni hanno `flexGrow: 1` e si dividono la larghezza se ci stanno, altrimenti scorrono dentro la capsula.
- Gruppi migrati (file:riga):
  - `app/(tabs)/index.tsx`: categorie 410, sottocategorie 421, ordinamento chiave 507 e direzione 518, tempo massimo 535, difficoltà 549, dieta 563, origine 582, caratteristiche/tag 597. Il chip "filtri attivi" (reset) resta `Pill` ed è ora sopra la capsula delle categorie.
  - `app/(tabs)/shopping.tsx` 674: filtro reparto (mantiene il toggle: ripremere il reparto attivo torna a "Tutti").
  - `PantryView.tsx` 314: filtro tutte/pronte/quasi.
  - `AISettingsModal.tsx` 128 (provider) e 258 (preset modello).
  - `RecipeModal.tsx` 658 (porzioni), 857 (origine piano), 976 (batch, con `disabled`).
  - `MagicRecipeImporterModal.tsx` 714, 730 (categoria, sottocategoria), 742 (slot), 758 (dieta), 789 (difficoltà): sostituito anche il `SegmentedSelector` locale (con relativi stili `diffSelector*`, `chipsScroll`).
  - `RecipeBookModal.tsx` 276 (gruppi filtro).
  - `IngredientsModal.tsx`: 614 tipo, 624 tag (multiple), 715 categoria, 725 tag (multiple), 736 slot (multiple), 777 filtro tipo, 866 filtro categoria, 874 filtro tag (selezione singola con deselezione).
  - `planner/PlannerPreferencesModal.tsx` 154 (calendario), `PlannerRegenModal.tsx` 87 (scope), `RecipeServingsStep.tsx` 40 (origine), `MealPickerModal.tsx` 616 (tab), 635 (suggeriti/tutti), 649 (tag).
- Rimasti a `Pill` (azioni o badge, non gruppi di selezione): `index.tsx` 402 (reset filtri), `shopping.tsx` 861 (quick quantity: azione), `PantryView.tsx` 220/246/268 (suggerimenti, selezionati da rimuovere, quick add: azioni add/remove), `MagicRecipeImporterModal.tsx` 572 (badge pagina), `UnresolvedIngredientsModal.tsx` 74-75 ("collega esistente" apre un elenco, "aggiungi nuovo" è un'azione: non sono opzioni di uno stesso gruppo).
- Chiavi aggiunte (it/en): `explore.categoriesLabel`, `explore.subcategoriesLabel`, `shopping.departmentFilter`, `pantry.filtersLabel`, `recipeDetail.servingsLabel`, `mealPicker.filtersLabel`.
- Deviazioni: le opzioni hanno ora tutte la stessa forma (niente bordo, niente chip a capo): i gruppi che prima andavano a capo (tag, categorie di `IngredientsModal`, filtri di index) ora scorrono in orizzontale. Il filtro pronti di `IngredientsModal` è su due capsule (categoria, tag) invece di una riga unica. La difficoltà di `MagicRecipeImporterModal` sta in un terzo di riga e scorre. Nessun gruppo usa ancora `multiple` come filtro di ricerca (solo i tag dei form di `IngredientsModal`). Lo switch Ricette/Dispensa di `index.tsx` non è stato toccato. Prova visiva non eseguita.

**Correzioni utente.**

1. FAB importazione IA: ripristinato il testo `explore.importButton` (come prima della migrazione). Scelta: resta il cerchio `size.circle.L` (testo di 11px sotto l'icona ci sta, come nell'originale); `CircleButton` ha una prop opzionale `label` (solo per il FAB).
2. Switch Ricette/Dispensa (solo in `app/(tabs)/index.tsx`, non ripetuto: nessun `SegmentedControl` creato): contenitore e indicatore attivo con `radius.full`, padding `space.xs`.
3. Impostazioni: erano già una `SheetModal` `fullScreen` con `ModalHeader`; scelta: nessuna route (si apre solo da `HeaderMenu`, stato locale). Titolo e voce di menu ora "Settings" / "Impostazioni" tramite chiavi `aiSettings.title` e `menu.aiSettings`.
4. Ordinamento (filtri avanzati, `index.tsx`): le tre pills stanno in una capsula (`radius.full`, `colors.surfaceAlt`) con `ScrollView` orizzontale, `maxWidth: '100%'`, padding `space.xs`, gap `space.md`. Asc/Desc non toccati.
