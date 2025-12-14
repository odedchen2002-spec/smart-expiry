// src/i18n/rtl.ts
// Hebrew = RTL (true), English = LTR (false)
//
// We no longer control native layout direction via I18nManager.
// Layout direction is handled purely in React styles using isRTL.
// The root layout is always LTR (React Native default).

// Hebrew = RTL (true), English = LTR (false)
export function applyLayoutDirection(isRTL: boolean) {
  console.log('[RTL] applyLayoutDirection called with isRTL =', isRTL);
  // No-op on purpose: do NOT call I18nManager.allowRTL or I18nManager.forceRTL.
  // Layout direction is controlled via styles only (flexDirection, textAlign, etc.).
}

/**
 * Legacy helper - thin wrapper for backward compatibility.
 * @deprecated Use applyLayoutDirection directly based on language selection.
 */
export function setupRTL() {
  // Thin wrapper that calls applyLayoutDirection(true)
  applyLayoutDirection(true);
}


