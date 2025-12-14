/**
 * Development environment detection utilities
 * Used to enable dev-only features like mock upgrades
 */

/**
 * Check if we are running in a development environment
 * @returns true if in dev mode, false otherwise
 */
export function isDevEnv(): boolean {
  return (
    __DEV__ ||
    process.env.EXPO_PUBLIC_ENV === 'development' ||
    process.env.NODE_ENV === 'development'
  );
}

