/**
 * Internationalization setup
 * Supports Hebrew (RTL) and English
 */

import { I18n } from 'i18n-js';
import * as Localization from 'expo-localization';
import en from './locales/en.json';
import he from './locales/he.json';

const i18n = new I18n({
  en,
  he,
});

// Set the locale once at the beginning of your app
// Default to Hebrew for RTL support
const locales = Localization.getLocales();
const locale = locales.length > 0 ? locales[0].languageCode || 'he' : 'he';
i18n.locale = locale;

// When a value is missing from a language it'll fallback to another language with the key present
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Suppress missing translation warnings (we use fallbacks in code)
// Note: Don't override missingTranslation as it may break i18n-js internal methods
// Instead, ensure translations exist or use fallback values in components

// Helper function to check if current locale is RTL
export const isRTL = () => {
  return i18n.locale === 'he';
};

// Helper function to set locale
export const setLocale = (locale: 'en' | 'he') => {
  i18n.locale = locale;
};

// Helper function to get current locale
export const getLocale = () => {
  return i18n.locale as 'en' | 'he';
};

// Export t function for translations
export const t = (key: string, params?: Record<string, any>): string => {
  const result = i18n.t(key, params);
  // Ensure we always return a string, not an object
  if (typeof result === 'object' && result !== null) {
    console.warn(`[i18n] Translation key "${key}" returned an object instead of a string. Returning key as fallback.`);
    return key;
  }
  if (typeof result !== 'string') {
    return String(result);
  }
  return result;
};

export default i18n;

// Export i18n instance for use in context
export { i18n };

