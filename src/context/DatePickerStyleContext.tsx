/**
 * Date Picker Style Context
 * Holds the date picker style preference in memory for instant access
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';

export type DatePickerStyle = 'calendar' | 'spinner';

const DEFAULT_STYLE: DatePickerStyle = 'spinner';

interface DatePickerStyleContextType {
  datePickerStyle: DatePickerStyle;
  setDatePickerStyle: (style: DatePickerStyle) => Promise<void>;
  loading: boolean;
}

const DatePickerStyleContext = createContext<DatePickerStyleContextType | undefined>(undefined);

export function DatePickerStyleProvider({ children }: { children: ReactNode }) {
  const { activeOwnerId, loading: ownerLoading } = useActiveOwner();
  const [datePickerStyle, setDatePickerStyleState] = useState<DatePickerStyle>(DEFAULT_STYLE);
  const [loading, setLoading] = useState(true);
  const [lastLoadedOwnerId, setLastLoadedOwnerId] = useState<string | null>(null);

  // Load style from storage when owner changes
  useEffect(() => {
    const loadStyle = async () => {
      // Wait for owner to be loaded
      if (ownerLoading) {
        return;
      }

      // Don't reload if we already loaded for this owner
      if (lastLoadedOwnerId === activeOwnerId) {
        return;
      }

      if (!activeOwnerId) {
        setDatePickerStyleState(DEFAULT_STYLE);
        setLoading(false);
        setLastLoadedOwnerId(null);
        return;
      }

      try {
        const key = `date_picker_style_${activeOwnerId}`;
        const savedStyle = await AsyncStorage.getItem(key);
        if (savedStyle === 'calendar' || savedStyle === 'spinner') {
          setDatePickerStyleState(savedStyle as DatePickerStyle);
        } else {
          setDatePickerStyleState(DEFAULT_STYLE);
        }
      } catch (error) {
        console.error('[DatePickerStyleContext] Error loading style:', error);
        setDatePickerStyleState(DEFAULT_STYLE);
      } finally {
        setLoading(false);
        setLastLoadedOwnerId(activeOwnerId);
      }
    };

    loadStyle();
  }, [activeOwnerId, ownerLoading, lastLoadedOwnerId]);

  // Function to update the style (saves to memory immediately and to storage)
  const setDatePickerStyle = useCallback(async (style: DatePickerStyle) => {
    // Update memory immediately
    setDatePickerStyleState(style);

    // Save to storage
    if (activeOwnerId) {
      try {
        const key = `date_picker_style_${activeOwnerId}`;
        await AsyncStorage.setItem(key, style);
        console.log(`[DatePickerStyleContext] Saved style "${style}" for owner ${activeOwnerId}`);
      } catch (error) {
        console.error('[DatePickerStyleContext] Error saving style:', error);
      }
    }
  }, [activeOwnerId]);

  return (
    <DatePickerStyleContext.Provider value={{ datePickerStyle, setDatePickerStyle, loading }}>
      {children}
    </DatePickerStyleContext.Provider>
  );
}

export function useDatePickerStyleContext() {
  const context = useContext(DatePickerStyleContext);
  if (context === undefined) {
    throw new Error('useDatePickerStyleContext must be used within a DatePickerStyleProvider');
  }
  return context;
}

