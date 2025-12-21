/**
 * Hook to get the user's preferred date picker style
 * Uses the DatePickerStyleContext for instant access to the cached value
 */

import { useDatePickerStyleContext } from '@/context/DatePickerStyleContext';

export function useDatePickerStyle() {
  const { datePickerStyle, loading } = useDatePickerStyleContext();
  return { datePickerStyle, loading };
}

