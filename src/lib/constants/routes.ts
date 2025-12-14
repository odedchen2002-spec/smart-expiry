/**
 * Route constants for navigation
 */

export const ROUTES = {
  // Auth
  LOGIN: '/login',
  SIGNUP: '/signup',
  ONBOARDING: '/onboarding',
  
  // Main tabs
  HOME: '/',
  TOMORROW: '/tomorrow',
  WEEK: '/week',
  ALL: '/all',
  
  // Features
  SCAN: '/scan',
  ADD: '/add',
  ITEM_DETAIL: (id: string) => `/item/${id}`,
  ITEM_EDIT: (id: string) => `/item/${id}/edit`,
  
  // Settings
  SETTINGS: '/settings',
  SETTINGS_LOCATIONS: '/settings/locations',
  SETTINGS_NOTIFICATIONS: '/settings/notifications',
  SETTINGS_LANGUAGE: '/settings/language',
} as const;

