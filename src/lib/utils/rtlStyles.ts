/**
 * RTL-aware style utilities
 * Provides text alignment and layout styles for RTL languages
 * 
 * All styles are now dynamic functions that accept isRTL parameter
 * to avoid static evaluation at module load time.
 */

/**
 * Get text alignment style for RTL
 * @deprecated Use getRtlTextStyles instead
 */
export const getRTLTextAlign = (isRTL: boolean) => {
  return isRTL ? 'right' : 'left';
};

/**
 * Get flex direction for RTL-aware layouts
 */
export const getRTLFlexDirection = (isRTL: boolean, direction: 'row' | 'column' = 'row') => {
  if (direction === 'column') return 'column';
  return isRTL ? 'row-reverse' : 'row';
};

/**
 * Get RTL-aware container styles
 * @param isRTL - Whether the layout should be RTL
 * @param variant - Style variant: 'default' (row), 'row', or 'column'
 */
export function getRtlContainerStyles(isRTL: boolean, variant: 'default' | 'row' | 'column' = 'default') {
  if (variant === 'column') {
    return {
      flexDirection: 'column' as const,
    };
  }
  return {
    flexDirection: (isRTL ? 'row-reverse' : 'row') as 'row' | 'row-reverse',
  };
}

/**
 * Get RTL-aware text styles
 * @param isRTL - Whether the text should be RTL
 * @param variant - Style variant: 'default', 'center', 'right', 'left', or 'date'
 */
export function getRtlTextStyles(isRTL: boolean, variant: 'default' | 'center' | 'right' | 'left' | 'date' = 'default') {
  switch (variant) {
    case 'center':
      return {
        textAlign: 'center' as const,
      };
    case 'right':
      return {
        textAlign: 'right' as const,
      };
    case 'left':
      return {
        textAlign: 'left' as const,
      };
    case 'date':
      return {
        textAlign: 'right' as const,
        writingDirection: 'ltr' as const,
      };
    case 'default':
    default:
      return {
        textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
        writingDirection: (isRTL ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
      };
  }
}

/**
 * RTL-aware margin utilities
 */
export const getRTLMargin = {
  start: (value: number) => ({ marginStart: value }),
  end: (value: number) => ({ marginEnd: value }),
  horizontal: (value: number) => ({ marginHorizontal: value }),
  vertical: (value: number) => ({ marginVertical: value }),
};

