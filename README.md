# 🌿🐾 Green Whisker

> A modern, intuitive, and 100% plant-based personal recipe vault, smart meal planner, and grocery assistant built with React Native and Expo.

---

## 📖 Overview

**Green Whisker** is an offline-first culinary companion designed for vegan cooking enthusiasts, meal preppers, and anyone looking to eat more plant-based meals. Designed around a **Bring-Your-Own-Recipes (BYOR)** philosophy, it gives you full ownership of your culinary data. 

It combines a private recipe catalog with an intelligent pantry matcher, a visual weekly meal planner, an automated grocery list generator, and a multi-modal **AI-powered recipe importer** capable of scanning physical cookbook pages, parsing web links, and structuring raw text.

---

## ✨ Key Features

### 🪄 1. Magic Recipe Importer (Multi-Modal AI)
- 📸 **Multi-Page Cookbook Scanner**: Photograph or select up to **5 consecutive pages** from physical cookbooks, culinary magazines, or handwritten notebooks. The Vision AI combines titles, ingredients from one page, instructions from the next, and tips into a single unified recipe.
- 🌐 **One-Click URL Import**: Paste any recipe URL from your favorite food blogs (powered by **Jina Reader** and AI parsing).
- 📋 **Free Text & Notes Import**: Paste unstructured text from chats, emails, or personal cooking notes.
- 🤖 **Multi-Provider AI Engine**: Built-in support for **Google Gemini** (default), **OpenAI** (GPT-4o), **Anthropic Claude**, **OpenRouter**, and **Local Offline Models** (Ollama, LM Studio, LocalAI).
- ✏️ **Zero-Friction Review**: Review and edit imported ingredients, quantities, and steps before saving directly into your private catalog.

### 🔍 2. Recipe Catalog & Smart Search
- ⚡ **Fuzzy Search Engine**: Powered by **Fuse.js**, instantly search across titles, ingredient lists, tags, or personal notes.
- ⚖️ **Dynamic Servings Scaler**: Effortlessly adjust portions (1 to 12 servings) with automatic recalculation of all ingredient quantities and unit conversions.
- 📝 **Interactive Cooking Mode & Personal Notes**: Check off steps as you cook and attach personal notes saved locally to your device.
- ❤️ **Favorites**: Bookmark your go-to meals with a single tap.

### 🥦 3. "Svuotafrigo" (Pantry Matcher)
- Select the vegetables, grains, legumes, and pantry staples you currently have at home.
- The app instantly matches and ranks recipes you can make right away, minimizing food waste and saving trips to the grocery store.

### 📅 4. Weekly Meal Planner
- 🗓️ **Full 7-Day Matrix**: Organize breakfast, lunch, snacks, and dinner for the week ahead.
- 🥗 **Balanced Nutritional Pillars**: Filter and balance recipes across plant proteins, whole grains, fresh vegetables, and healthy fats.
- 🎲 **Plan Auto-Generator**: Automatically generate a balanced weekly meal plan based on your preferences.
- 🛒 **Direct Shopping Sync**: Send missing ingredients from your planned meals straight to your shopping list with a single confirmation.

### 🛒 5. Smart Grocery List (Reparti del Supermercato)
- 🏷️ **13 Canonical Supermarket Departments**: Items are automatically routed into 13 real-world supermarket aisles: *Ortofrutta (Produce), Banco frigo (Refrigerated), Panetteria (Bakery), Pasta e Cereali (Pasta & Grains), Legumi (Legumes & Pulses), Bevande vegetali & Caffè (Plant Milks & Beverages), Condimenti (Condiments & Pestos), Conserve (Canned & Preserves), Farine (Flours & Baking), Dolcificanti (Sweeteners), Frutta secca e semi oleosi (Nuts & Seeds), Spezie ed erbe aromatiche (Herbs & Spices), Varie (Miscellaneous)*.
- ⚡ **100% Offline & Deterministic**: Powered by an instant local categorization lexicon with zero network latency, zero API costs, and full offline reliability inside supermarkets.
- 🧮 **Intelligent Ingredient Consolidation**: Merges identical ingredients across different recipes, summing weights (grams/kg), volumes (ml/l), and discrete units (spicchi, rotoli, panetti, vasetti, lattine) into unified shopping entries.
- 🧹 **Advanced Recipe Text Cleaning & Filtering**: Strips culinary narrative prefixes (e.g., *"Abbondante di..."*, *"Un filo di..."*, *"Un pizzico di..."*) while isolating quantities to the right, and automatically filters non-purchasable kitchen water (*"Acqua fredda"*, *"Acqua calda"*, *"Acqua di cottura"*).
- 🔤 **A-Z Alphabetical Sorting**: Every aisle category automatically sorts items alphabetically from A to Z for fast, stress-free navigation down the aisle.
- 🪗 **Interactive Accordion Checklist**: Collapsible cards per department with completion counters (*"X di Y presi"*), circular checkboxes, and one-tap bulk removal of completed items.
- 📤 **Department-Grouped Sharing**: Export cleanly formatted shopping lists to WhatsApp, Telegram, or Notes with emoji checkmarks and aisle headers.

### 📱 6. Offline-First, i18n & Cross-Platform
- 🌍 **Full Internationalization (i18n)**: Native bilingual support for **Italian 🇮🇹** and **English 🇬🇧** with automatic device locale detection.
- 📱 Runs smoothly on **iOS**, **Android**, and **Web**.
- 💾 **Local SQLite Database**: Native storage powered by **Expo SQLite** with automatic browser LocalStorage fallback on the web. Zero cloud dependency required for day-to-day use.

---

## 🥗 Smart Meal Planning Algorithm

Green Whisker features an intelligent, nutrition-first meal planning engine that automatically generates varied, balanced 7-day plant-based menus based on three functional pillars:

### 1. Slot Matching Rule (Canonical Category Pools)
Recipes are strictly partitioned by their canonical category IDs (`CAT_...`) to ensure every dish fits its intended time of day across the 5 daily slots:
- 🌅 **Breakfast**: Selected exclusively from `CAT_PORRIDGE_E_OVERNIGHT_OATS`, `CAT_A_BASE_DI_YOGURT_VEGETALE`, `CAT_BISCOTTI`, `CAT_MERENDE_E_COLAZIONI_DOLCI`, `CAT_FRULLATI`, `CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO`, and `CAT_A_BASE_DI_LATTE_VEGETALE`.
- 🍎 **Morning & Afternoon Snacks**: Sourced from `CAT_ENERGY_BALLS_E_BARRETTE`, `CAT_FRUTTA_FRESCA_E_MACEDONIE`, `CAT_FRUTTA_SECCA`, and `CAT_GELATI`.
- 🍝 🍲 **Main Meals (Lunch & Dinner)**: Distributed between single-dish meals, first courses, protein mains, and vegetable side dishes.

### 2. Dish Structure (Structured Meals vs. Complete Single Dishes)
For lunch and dinner, the engine dynamically alternates meal formats:
- **Option A — Structured Meal (Primo + Side or Secondo + Side)**: Alternates between a first course (`CAT_PRIMI_PIATTI`, `CAT_RISOTTI`, `CAT_GNOCCHI`, `CAT_POLENTA`, `CAT_ZUPPE_E_VELLUTATE`) or a plant protein main (`CAT_SECONDI_...`, `CAT_PIATTI_A_BASE_DI_LEGUMI`, `CAT_FARINATE_E_FRITTATE`), paired with an authentic vegetable side dish (`CAT_CONTORNI`, `CAT_VERDURE_AL_FORNO`, `CAT_VERDURE_IN_PADELLA`, `CAT_VERDURE_BOLLITE_E_A_VAPORE`).
- **Option B — Complete Single Dish (Piatto Unico)**: Selects self-contained balanced dishes from `CAT_BOWL`, `CAT_INSALATE_DI_CEREALI`, `CAT_INSALATE_DI_LEGUMI`, `CAT_PASTA_AL_FORNO`, `CAT_PIADINE_E_WRAPS`, `CAT_PIZZE_E_FOCACCIE`, or `CAT_TORTE_SALATE`, leaving the side dish empty without forcing redundant sides.
- *Continuity constraint*: Never schedules two consecutive single dishes. If lunch is a single dish or primo, dinner prioritizes a structured protein dish with vegetables.

### 3. Anti-Monotonia & Nutritional Rotation Score
The engine uses sliding-window tracking and score penalties to prevent repetition and ensure diverse nutrition:
- **Category Recency Penalties**: Tracks the last 6 main meals (2–3 days). Applying progressive penalties (-80 pts if repeated from the immediate previous meal, -60 pts from 2 meals ago, -40 pts from yesterday, -20 pts within 3 days) ensures categories like `CAT_RISOTTI` or `CAT_GNOCCHI` are not served back-to-back.
- **Protein Subgroup Rotation**: Categorizes protein sources into sub-families (`soia_derivati` such as tofu/tempeh/seitan, `legumi` such as chickpeas/lentils/beans, and `alternative_veg` like farinate/veggie burgers). If soy/tofu is chosen for dinner, a -75 pts penalty forces the next dinner to source protein from whole legumes or farinate.
- **Carb Family Alternation**: Penalizes (-45 pts) consecutive identical carbohydrate families (pasta, rice, pseudocereals, tubers, bread).
- **Rainbow Plate & Seasonality**: Rewards seasonal produce (+10 pts) and promotes phytonutrient diversity through chromatic contrast between lunch and dinner veggies (e.g. green vs. red/orange/purple).
- **Exclusion of Condiments**: Auxiliary recipes classified under `CAT_SALSE_E_CONDIMENTI` (pestos, dressings, mayo, vegan cheeses) are strictly excluded from meal and side slots.

---

## 🛠️ Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) (v0.86) with [Expo](https://expo.dev/) (SDK 57)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Internationalization**: [i18next](https://www.i18next.com/) & [react-i18next](https://react.i18next.com/) with [Expo Localization](https://docs.expo.dev/versions/latest/sdk/localization/) (IT / EN)
- **Local Database**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- **Search Engine**: [Fuse.js](https://fusejs.io/)
- **Media & Images**: [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/) & [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- **AI Engine**: Google Gemini API, OpenAI, Claude, OpenRouter, or Local LLMs via REST + [Jina Reader](https://jina.ai/reader/)
- **Classification & Consolidation**: Custom deterministic supermarket parsing & unit aggregation engine

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or newer recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/client) app installed on your physical device, or an iOS Simulator / Android Emulator.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/green-whisker.git
   cd green-whisker
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Recipes (BYOR):**
   > [!NOTE]
   > For copyright and licensing reasons, recipe datasets are **not included** in the app. The app starts with an empty catalog.
   >
   > Open the menu (chef hat, top right) → **Recipe book** → **Import JSON recipe book** and choose a JSON file from your phone. A template with the expected format is in `assets/ricette.example.json`.

4. **Configure Environment Variables:**
   Create your local `.env` file from the example template:
   ```bash
   cp .env.example .env
   ```

   Configure your preferred AI provider (Google Gemini provides a generous free tier at [Google AI Studio](https://aistudio.google.com/)):
   ```env
   # Default: Google Gemini
   EXPO_PUBLIC_AI_PROVIDER=gemini
   EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   ```

   *(Optional)* To use OpenAI, Claude, OpenRouter, or a local Ollama instance:
   ```env
   # Example: Local Ollama (100% offline & private)
   # EXPO_PUBLIC_AI_PROVIDER=custom
   # EXPO_PUBLIC_AI_BASE_URL=http://localhost:11434/v1
   # EXPO_PUBLIC_AI_MODEL=llama3.2
   ```

---

## 💻 Running the App

- **Start Expo Development Server:**
  ```bash
  npm start
  ```
- **Run in Web Browser:**
  ```bash
  npm run web
  ```
- **Run on Android Device / Emulator:**
  ```bash
  npm run android
  ```
- **Run on iOS Simulator:**
  ```bash
  npm run ios
  ```

---

## 📦 Building Standalone APK (Android)

The project includes pre-configured build profiles in `eas.json` for [Expo Application Services (EAS)](https://docs.expo.dev/build/introduction/).

To build a standalone installable Android APK (`.apk`):
```bash
# 1. Install EAS CLI globally if you haven't already
npm install -g eas-cli

# 2. Log in to your Expo account
eas login

# 3. Trigger the preview build
eas build -p android --profile preview
```

---

## 📁 Project Structure

```text
green-whisker/
├── assets/
│   ├── ricette.example.json    # Starter template recipe array
│   ├── icon.png, splash-icon   # App icons and branding assets
│   └── ...
├── scripts/                    # Recipes normalization & planner test simulations
├── src/
│   ├── app/                    # Expo Router tab screens (index, planner, shopping, favorites)
│   ├── components/             # UI components (RecipeCard, RecipeModal, MagicRecipeImporterModal, PantryView)
│   ├── constants/              # Category definitions, shopping departments, food groups, icons
│   ├── db/                     # Expo SQLite schema, migrations & web LocalStorage abstraction
│   ├── hooks/                  # Custom hooks (responsive layout, debouncing)
│   ├── i18n/                   # Multi-language localization (Italian 🇮🇹 & English 🇬🇧)
│   ├── services/               # AI parser (Gemini/OpenAI/Claude/Ollama), Fuse.js search, Meal Planner
│   ├── types/                  # TypeScript interfaces (Recipe, MealPlan, ShoppingItem)
│   └── utils/                  # Servings scaler, shopping classifier, ingredient aggregator, share helpers
├── .env.example                # AI provider configuration template
├── eas.json                    # EAS Build & Submit configuration (APK / AAB)
├── recipe-example.json         # Single recipe JSON schema specification
└── package.json                # Dependencies and npm scripts
```

---

## 📝 Custom Recipe Schema

Custom recipes imported via AI or manually maintained adhere to the canonical schema defined in [`src/types/recipe.ts`](./src/types/recipe.ts) and demonstrated in [`recipe-example.json`](./recipe-example.json):

### Core Metadata
- `id` *(string)*: Unique slug identifier (e.g. `"tofu-marinato-al-limone-ed-erbe"`).
- `title` *(string)*: Recipe title.
- `source` *(string)*: Provenance (e.g. `"Personalizzata (AI)"`, author, or blog name).
- `url` *(string)*: Original source web link.
- `image` *(string)*: Remote URL or local asset URI.
- `difficulty` *(string)*: `'easy' | 'medium' | 'hard'`.
- `servings` *(number)* & `servings_text` *(string)*: Default portion count (e.g. `2`, `"2 porzioni"`).
- `times` *(object)*: `{ total_minutes, prep_time, cook_time, display_time }`.

### Ingredients & Preparation
- `ingredients` *(string[])*: Clean plain-text list of ingredients.
- `ingredients_by_section` *(array)*: Section-grouped ingredients (e.g. `[{ section: "Marinatura", ingredients: [...] }]`).
- `detailed_ingredients` *(array)*: Structured objects `{ section, text, amount, unit, ingredient }` utilized by `servingsScaler` for portion scaling and `ingredientAggregator` for supermarket consolidation.
- `instructions` *(string[])*: Step-by-step preparation checklist.
- `tips` *(string[])*: Optional chef notes and storage recommendations.
- `tags` *(string[])*: Dietary tags and categories (e.g. `["100% Vegetale", "Senza Glutine", "Proteico"]`).

### Categorization & Smart Planner Engine
- `category` *(string)*: Canonical category ID (e.g. `CAT_SECONDI_A_BASE_DI_TOFU`).
- `macro_category` *(string)*: Top-level classification (e.g. `MACRO_PROTEINE_E_SECONDI`).
- `recommended_slot` *(string)*: Intended meal slot (`'colazione' | 'spuntino' | 'pranzo_cena'`).
- `food_groups` *(string[])*: Core plant-based food groups (`'cereali' | 'verdura' | 'frutta' | 'frutta_secca_semi' | 'cibi_proteici' | 'grassi'`).
- `protein_group` *(string)*: Plant protein family (`'soia_derivati' | 'legumi_interi' | 'cereali_proteici' | 'leggero_vegetale'`).
- `carb_family` *(string)*: Carbohydrate source (`'pasta' | 'riso' | 'farro_orzo' | 'pseudocereali' | 'tuberi' | 'pane_cereali_rapidi' | 'none'`).
- `veggie_color` *(string)*: Phytonutrient rainbow color (`'green' | 'red_orange' | 'purple_blue' | 'yellow_white' | 'neutral'`).
- `is_complete_plate` *(boolean)*: Declares whether the recipe is a complete single dish (*Piatto Unico*) or requires a vegetable side dish.
- `seasons` *(string[])*: Supported culinary seasons (`'primavera' | 'estate' | 'autunno' | 'inverno'`).

---

## 📄 License

This project is licensed under the MIT License - feel free to use and adapt it for your own plant-based cooking adventures!
