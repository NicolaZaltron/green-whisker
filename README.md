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

### 🛒 5. Smart Grocery List
- 🏷️ **15 Department Categories**: Items are automatically classified into exact supermarket aisles: *Banco frigo, Bevande vegetali, Cereali da colazione, Condimenti, Conserve, Dolcificanti, Farine, Frutta secca e semi oleosi, Legumi, Pane e prodotti da forno, Pasta, Riso e altri cereali, Spezie ed erbe aromatiche, Verdura, Varie*.
- ➕ **Custom Items & Quantities**: Add manual items with real-time smart department auto-detection.
- ✔️ **Interactive Checklist**: Check off items in the supermarket and clear completed items with one tap.

### 📱 6. Offline-First & Cross-Platform
- Runs smoothly on **iOS**, **Android**, and **Web**.
- **Local SQLite Database**: Native storage powered by **Expo SQLite** with automatic browser LocalStorage fallback on the web. Zero cloud dependency required for day-to-day use.

---

## 🛠️ Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) (v0.86) with [Expo](https://expo.dev/) (SDK 57)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Local Database**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- **Search Engine**: [Fuse.js](https://fusejs.io/)
- **Media & Images**: [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/) & [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- **AI Engine**: Google Gemini API, OpenAI, Claude, OpenRouter, or Local LLMs via REST + [Jina Reader](https://jina.ai/reader/)

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

3. **Initialize the Recipe Dataset (BYOR):**
   > [!NOTE]
   > For copyright and licensing reasons, proprietary/curated recipe datasets are **not included** in the public repository (`assets/ricette.json` is gitignored). 
   > 
   > To start with a starter sample recipe, copy the provided example template:
   ```bash
   cp assets/ricette.example.json assets/ricette.json
   ```
   *(Or create an empty catalog `echo "[]" > assets/ricette.json` and populate it using the AI Magic Importer).*

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
├── src/
│   ├── app/                    # Expo Router tab screens (index, planner, shopping, favorites)
│   ├── components/             # UI components (RecipeCard, RecipeModal, MagicRecipeImporterModal, PantryView)
│   ├── constants/              # Category definitions, food groups, icons
│   ├── db/                     # Expo SQLite schema & web LocalStorage abstraction
│   ├── hooks/                  # Custom hooks (responsive layout, debouncing)
│   ├── services/               # AI parser (Gemini/OpenAI/Claude/Ollama), Fuse.js search, Meal Planner
│   ├── types/                  # TypeScript interfaces (Recipe, MealPlan, ShoppingItem)
│   └── utils/                  # Servings scaler, text cleaners, share utilities
├── .env.example                # AI provider configuration template
├── eas.json                    # EAS Build & Submit configuration (APK / AAB)
├── recipe-example.json         # Single recipe JSON schema specification
└── package.json                # Dependencies and npm scripts
```

---

## 📝 Custom Recipe Schema

Custom recipes imported or manually created adhere to the schema documented in [`recipe-example.json`](./recipe-example.json). Each recipe includes:
- Unique `id`, `titolo`, `categoria`, `difficolta`, `porzioni`
- `tempi` object (`tempo_preparazione`, `tempo_cottura`, `tempo_totale_minuti`)
- `ingredienti_dettagliati` with normalized quantities and units for dynamic serving scaling
- `istruzioni` array for step-by-step cooking checklists
- Nutritional classifications (`gruppi_alimentari`, `tags`, `slot_consigliato`)

---

## 📄 License

This project is licensed under the MIT License - feel free to use and adapt it for your own plant-based cooking adventures!
