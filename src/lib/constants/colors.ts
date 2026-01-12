/**
 * Color constants for the app
 * Status colors and theme colors
 */

export const STATUS_COLORS = {
  ok: '#4CAF50',      // Green
  soon: '#FF9800',     // Amber/Orange
  expired: '#F44336', // Red
  resolved: '#9E9E9E', // Gray
} as const;

export const THEME_COLORS = {
  primary: '#42A5F5', // Blue 400 (lighter)
  primaryLight: '#90CAF9', // Blue 200 (lighter)
  primaryGradient: ['#90CAF9', '#42A5F5'], // Blue gradient (lighter)
  secondary: '#03DAC6',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceVariant: '#F8F9FA',
  error: '#B00020',
  warning: '#FF9800', // Orange/Amber for trial/experimental features
  text: '#212121',
  textSecondary: '#757575',
  textTertiary: '#9E9E9E',
  border: '#E0E0E0',
  shadow: 'rgba(0, 0, 0, 0.1)',
} as const;

