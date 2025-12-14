/**
 * Hook to get the user's preferred date picker style
 */

import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveOwner } from './useActiveOwner';
import type { DatePickerStyle } from '@/app/settings/products';

const DEFAULT_STYLE: DatePickerStyle = 'spinner';

export function useDatePickerStyle() {
  const { activeOwnerId } = useActiveOwner();
  const [datePickerStyle, setDatePickerStyle] = useState<DatePickerStyle>(DEFAULT_STYLE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStyle = async () => {
      if (!activeOwnerId) {
        setDatePickerStyle(DEFAULT_STYLE);
        setLoading(false);
        return;
      }

      try {
        const key = `date_picker_style_${activeOwnerId}`;
        const savedStyle = await AsyncStorage.getItem(key);
        if (savedStyle === 'calendar' || savedStyle === 'spinner') {
          setDatePickerStyle(savedStyle as DatePickerStyle);
        } else {
          setDatePickerStyle(DEFAULT_STYLE);
        }
      } catch (error) {
        console.error('[useDatePickerStyle] Error loading style:', error);
        setDatePickerStyle(DEFAULT_STYLE);
      } finally {
        setLoading(false);
      }
    };

    loadStyle();
  }, [activeOwnerId]);

  return { datePickerStyle, loading };
}

