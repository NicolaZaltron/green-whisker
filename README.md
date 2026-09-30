# 🌿🐾 Green Whisker

> A modern, intuitive, and 100% plant-based recipe manager, smart meal planner, and grocery assistant built with React Native and Expo.

---

## 📖 Overview

**Green Whisker** is an offline-first culinary companion designed for vegan cooking enthusiasts, meal preppers, and anyone looking to eat more plants. It combines an extensive recipe catalog with an intelligent pantry matcher, a visual weekly meal planner, an automated shopping list generator, and an AI-powered recipe importer.

---

## ✨ Key Features

### 🔍 1. Recipe Catalog & Smart Search
- **Curated Vegan Recipes**: Browse high-protein mains, wholesome breakfasts, quick dinners, desserts, and sides.
- **Fuzzy Search Engine**: Powered by **Fuse.js**, instantly search by recipe title, ingredient names, tags, or personal notes.
- **Dynamic Servings Scaler**: Effortlessly adjust portions (1 to 12 servings) with automatic recalculation of all ingredient quantities and units.
- **Interactive Checklist & Notes**: Check off steps as you cook and write personal notes saved directly to your device.
- **Favorites**: Bookmark your go-to meals with a single tap.

### 🥦 2. "Svuotafrigo" (Pantry Matcher)
- Select the vegetables, grains, and pantry staples you currently have in your kitchen.
- The app instantly matches and ranks recipes you can make right away, minimizing food waste and saving time.

### 🪄 3. Magic Recipe Importer (AI-Powered)
- **One-Click URL Import**: Paste any recipe link from your favorite food blog.
- **Zero-Fuss AI Parsing**: Leverages **Jina Reader** and **Google Gemini** (or OpenAI / Claude) to extract the dish name, exact ingredient quantities, step-by-step instructions, and original photo.
- **Custom Recipe Vault**: Edit and store imported recipes locally in your private catalog.

### 📅 4. Weekly Meal Planner
- **Full 7-Day Matrix**: Organize breakfast, snacks, lunch, and dinner for the week ahead.
- **Balanced Meal Suggestions**: Group recipes by essential nutritional categories (plant proteins, whole grains, vegetables, healthy fats, nuts & seeds).
- **Plan Auto-Generator**: Create a complete weekly plan based on your preferences in seconds.

### 🛒 5. Smart Grocery List
- **Automated Sync**: Add ingredients from any recipe or your entire weekly plan directly into your shopping list.
- **Department Sorting**: Automatically categorizes items into Produce, Pantry, Refrigerated, Legumes, Spices, and Bakery.
- **Interactive Cart**: Check off items as you shop in the supermarket.

### 📱 6. Cross-Platform & Offline-First
- Works seamlessly on **iOS**, **Android**, and **Web**.
- **Offline-Ready**: Local storage powered by **Expo SQLite** on native devices with browser LocalStorage fallback on the web.

---

## 🛠️ Tech Stack

- **Framework**: [React Native](https://reactnative.dev/) (v0.86) with [Expo](https://expo.dev/) (SDK 57)
- **Routing**: [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Local Database**: [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/)
- **Search Engine**: [Fuse.js](https://fusejs.io/)
- **Media & Images**: [Expo Image](https://docs.expo.dev/versions/latest/sdk/image/)
- **AI Engine**: Google Gemini API (`@google/genai` / REST) + [Jina Reader](https://jina.ai/reader/)

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or newer recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)
- [Expo Go](https://expo.dev/client) app installed on your iOS or Android device (for mobile testing)

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

3. **Configure Environment Variables:**
   Create a `.env` file in the root directory by copying the sample template:
   ```bash
   cp .env.example .env
   ```
   Add your Google Gemini API key (free tier available at [Google AI Studio](https://aistudio.google.com/)):
   ```env
   EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key_here
   EXPO_PUBLIC_AI_PROVIDER=gemini
   ```

### Running the App

- **Start Expo Development Server:**
  ```bash
  npm start
  ```
- **Run in Web Browser:**
  ```bash
  npm run web
  ```
- **Run on Android Emulator / Device:**
  ```bash
  npm run android
  ```
- **Run on iOS Simulator:**
  ```bash
  npm run ios
  ```

---

## 📁 Project Structure

```text
green-whisker/
├── assets/                 # App icons, splash screen, images, and seed recipe dataset
├── src/
│   ├── app/                # Expo Router screens ((tabs)/index, planner, shopping, etc.)
│   ├── components/         # Reusable UI components (RecipeCard, RecipeModal, ImporterModal)
│   ├── db/                 # SQLite & Web storage database layer
│   ├── hooks/              # Custom React hooks (responsive dimensions, debouncing)
│   ├── services/           # Search (Fuse.js), Pantry matching, AI parsing services
│   ├── types/              # TypeScript interfaces (Recipe, ShoppingItem, MealPlan)
│   └── utils/              # Serving scalers, ingredient text cleaners, sharing helpers
├── .env.example            # Environment variables template
├── recipe-example.json     # Schema blueprint for recipes
└── package.json            # Project dependencies and npm scripts
```

---

## 📄 License

This project is licensed under the MIT License - feel free to use and adapt it for your own cooking adventures!
