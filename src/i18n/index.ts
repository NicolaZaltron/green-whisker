import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

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

i18n
  .use(initReactI18next)
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

export default i18n;
