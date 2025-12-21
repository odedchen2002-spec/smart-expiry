/**
 * Search Bar Component
 * Provides a search input with clear functionality
 */

import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Searchbar, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import { THEME_COLORS } from '@/lib/constants/colors';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Make the search bar more prominent (taller, stronger border) */
  elevated?: boolean;
}

export function SearchBar({ value, onChangeText, placeholder, elevated = false }: SearchBarProps) {
  const { t, isRTL } = useLanguage();
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');

  return (
    <View style={[styles.container, elevated && styles.containerElevated]}>
      <Searchbar
        placeholder={placeholder || t('search.placeholder') || 'חפש מוצרים...'}
        onChangeText={onChangeText}
        value={value}
        style={[styles.searchbar, elevated && styles.searchbarElevated]}
        inputStyle={[
          styles.input,
          elevated && styles.inputElevated,
          rtlTextCenter,
          { paddingLeft: isRTL ? 0 : 12, paddingRight: isRTL ? 12 : 0 }
        ]}
        placeholderTextColor={elevated ? '#6B7280' : '#999'}
        icon={() => (
          <MaterialCommunityIcons 
            name="magnify" 
            size={elevated ? 24 : 29} 
            color={elevated ? THEME_COLORS.primary : '#666'}
            style={[styles.searchIcon, isRTL && styles.searchIconRTL]}
          />
        )}
        clearIcon={() => (
          value ? (
            <IconButton
              icon="close-circle"
              size={20}
              iconColor="#9CA3AF"
              onPress={() => onChangeText('')}
            />
          ) : null
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: '3%',
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  containerElevated: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  searchbar: {
    elevation: 0,
    backgroundColor: '#F5F8FF',
    minHeight: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E5EE',
  },
  searchbarElevated: {
    minHeight: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: THEME_COLORS.primary + '40',
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: THEME_COLORS.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  input: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 15,
    includeFontPadding: false,
    paddingVertical: 0,
    marginTop: -4,
  },
  inputElevated: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
    marginTop: -2,
  },
  searchIcon: {
    marginLeft: 8,
  },
  searchIconRTL: {
    marginLeft: 0,
    marginRight: 8,
  },
});

