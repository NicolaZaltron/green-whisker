import i18n, { changeLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import { loadLanguage } from '../services/preferencesService';
import it from './locales/it.json';
import en from './locales/en.json';

const resources = {
  it: { translation: it },
  en: { translation: en },
};

// Detect primary device language, defaulting to Italian if not English
const locales = Localization.getLocales();
const primaryLanguage = locales && locales.length > 0 && locales[0].languageCode ? locales[0].languageCode : 'it';
const initialLanguage = primaryLanguage.startsWith('en') ? 'en' : 'it';

// Same i18next instance: the alias keeps lint from mistaking use/init for export names
const instance = i18n;
instance.use(initReactI18next);

instance
  .init({
    compatibilityJSON: 'v4',
    resources,
    lng: initialLanguage,
    fallbackLng: 'it',
    interpolation: {
      escapeValue: false, // React already escapes values safely
    },
    react: {
      useSuspense: false, // Prevents issues with React Native Suspense during initial load
    },
  });

// Restores the language chosen manually in the menu, if present (otherwise the device language stays)
export async function restoreSavedLanguage(): Promise<void> {
  const saved = await loadLanguage();
  if (saved && saved !== i18n.language) {
    await changeLanguage(saved);
  }
}

export default i18n;
