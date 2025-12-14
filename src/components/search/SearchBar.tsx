/**
 * Search Bar Component
 * Provides a search input with clear functionality
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Searchbar, IconButton } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  const { t, isRTL } = useLanguage();
  const rtlTextCenter = getRtlTextStyles(isRTL, 'center');

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder={placeholder || t('search.placeholder') || 'חפש מוצרים...'}
        onChangeText={onChangeText}
        value={value}
        style={styles.searchbar}
        inputStyle={[
          styles.input, 
          rtlTextCenter,
          { paddingLeft: isRTL ? 0 : 12, paddingRight: isRTL ? 12 : 0 }
        ]}
        icon={() => (
          <MaterialCommunityIcons 
            name="magnify" 
            size={29} 
            color="#666" 
            style={[styles.searchIcon, isRTL && styles.searchIconRTL]}
          />
        )}
        clearIcon={() => (
          value ? (
            <IconButton
              icon="close-circle"
              size={18}
              iconColor="#666"
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
    paddingHorizontal: '3%', // Use percentage for responsive padding
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  searchbar: {
    elevation: 0, // Remove elevation for flat design
    backgroundColor: '#F5F8FF',
    minHeight: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E1E5EE',
  },
  input: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 15,
    includeFontPadding: false,
    paddingVertical: 0,
    marginTop: -4,
  },
  searchIcon: {
    marginLeft: 8, // Add margin for icon positioning in LTR
  },
  searchIconRTL: {
    marginLeft: 0,
    marginRight: 8, // Add margin for icon positioning in RTL
  },
});

