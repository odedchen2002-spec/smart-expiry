/**
 * DDMMKeypadSheet - Reusable numeric keypad for DDMM date entry
 * 
 * Used in:
 * - Fast Scan screen
 * - Pending Expiry Dates screen
 * 
 * Features:
 * - 4-digit DDMM input
 * - Auto-year selection (current year if upcoming, else next year)
 * - Visual feedback for valid/invalid dates
 * - Haptic feedback on key press
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { Text, IconButton, ActivityIndicator } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { THEME_COLORS } from '@/lib/constants/colors';
import { useLanguage } from '@/context/LanguageContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ============================================================================
// DATE UTILITIES (exported for reuse)
// ============================================================================

export const isValidDayMonth = (day: number, month: number): boolean => {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
};

export const getAutoYear = (day: number, month: number): number => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  if (month > currentMonth || (month === currentMonth && day >= currentDay)) {
    return currentYear;
  }
  return currentYear + 1;
};

export const formatDateForDB = (day: number, month: number, year: number): string => {
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

export const parseDDMMInput = (input: string): { day: number; month: number; year: number } | null => {
  if (input.length !== 4) return null;
  const day = parseInt(input.substring(0, 2), 10);
  const month = parseInt(input.substring(2, 4), 10);
  if (!isValidDayMonth(day, month)) return null;
  const year = getAutoYear(day, month);
  return { day, month, year };
};

// ============================================================================
// TYPES
// ============================================================================

export interface DDMMKeypadSheetProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (dateStr: string, day: number, month: number, year: number) => void;
  productName?: string | null;
  barcode?: string | null;
  isLoading?: boolean;
  title?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DDMMKeypadSheet({
  visible,
  onClose,
  onConfirm,
  productName,
  barcode,
  isLoading = false,
  title,
}: DDMMKeypadSheetProps) {
  const { t, isRTL } = useLanguage();
  const insets = useSafeAreaInsets();
  const [keypadInput, setKeypadInput] = useState('');
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  // Reset input when sheet opens
  useEffect(() => {
    if (visible) {
      setKeypadInput('');
      Animated.spring(slideAnim, {
        toValue: 1,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleKeypadPress = useCallback((key: string) => {
    if (key === 'clear') {
      setKeypadInput('');
      return;
    }
    if (key === 'back') {
      setKeypadInput(prev => prev.slice(0, -1));
      return;
    }
    if (keypadInput.length >= 4) return;
    
    const newInput = keypadInput + key;
    setKeypadInput(newInput);
    
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  }, [keypadInput]);

  const getDisplayParts = useCallback((): { day: string; month: string } => {
    const chars = keypadInput.split('');
    return {
      day: (chars[0] || '_') + (chars[1] || '_'),
      month: (chars[2] || '_') + (chars[3] || '_'),
    };
  }, [keypadInput]);

  const isInputValid = useCallback((): boolean => {
    if (keypadInput.length !== 4) return false;
    const day = parseInt(keypadInput.substring(0, 2), 10);
    const month = parseInt(keypadInput.substring(2, 4), 10);
    return isValidDayMonth(day, month);
  }, [keypadInput]);

  const handleConfirm = useCallback(() => {
    const parsed = parseDDMMInput(keypadInput);
    if (!parsed) return;
    
    const dateStr = formatDateForDB(parsed.day, parsed.month, parsed.year);
    onConfirm(dateStr, parsed.day, parsed.month, parsed.year);
  }, [keypadInput, onConfirm]);

  const displayParts = getDisplayParts();
  const canConfirm = isInputValid();

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.dimArea} onPress={onClose} activeOpacity={1} />
        
        <Animated.View
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            {
              transform: [{
                translateY: slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [400, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.sheetHandle} />
          
          {/* Header with product info */}
          <View style={styles.header}>
            <Text style={styles.sheetTitle}>
              {title || t('fastScan.expiryDate') || 'תאריך תפוגה'}
            </Text>
            {productName && (
              <Text style={styles.productName} numberOfLines={1}>{productName}</Text>
            )}
            {barcode && (
              <Text style={styles.barcode}>{barcode}</Text>
            )}
          </View>
          
          {/* Date hint */}
          <Text style={styles.dateHint}>
            {t('fastScan.enterDDMM') || 'הקלד יום וחודש (DDMM)'}
          </Text>
          
          {/* Date display */}
          <View style={styles.dateDisplay}>
            <Text style={[
              styles.dateDigits,
              keypadInput.length >= 2 && canConfirm && styles.dateDigitsValid
            ]}>
              {displayParts.day}
            </Text>
            <Text style={styles.dateSeparator}>/</Text>
            <Text style={[
              styles.dateDigits,
              keypadInput.length === 4 && canConfirm && styles.dateDigitsValid
            ]}>
              {displayParts.month}
            </Text>
          </View>
          
          {/* Invalid hint */}
          {keypadInput.length === 4 && !canConfirm && (
            <Text style={styles.invalidHint}>
              {t('fastScan.invalidDate') || 'תאריך לא תקין'}
            </Text>
          )}
          
          {/* Keypad */}
          <View style={styles.keypadGrid}>
            {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['clear', '0', 'back']].map((row, i) => (
              <View key={i} style={styles.keypadRow}>
                {row.map((key) => (
                  <TouchableOpacity
                    key={key}
                    style={[
                      styles.keypadKey,
                      (key === 'clear' || key === 'back') && styles.keypadKeyAction
                    ]}
                    onPress={() => handleKeypadPress(key)}
                    activeOpacity={0.6}
                  >
                    {key === 'clear' ? (
                      <MaterialCommunityIcons name="close" size={24} color="#666" />
                    ) : key === 'back' ? (
                      <MaterialCommunityIcons name="backspace-outline" size={24} color="#666" />
                    ) : (
                      <Text style={styles.keypadKeyText}>{key}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
          </View>
          
          {/* Confirm button */}
          <TouchableOpacity
            style={[styles.confirmButton, !canConfirm && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialCommunityIcons name="check" size={24} color="#FFF" />
                <Text style={styles.confirmButtonText}>
                  {t('fastScan.confirm') || 'אישור'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  dimArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 24,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#DDD',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    marginBottom: 12,
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  barcode: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  dateHint: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 4,
  },
  dateDigits: {
    fontSize: 44,
    fontWeight: '300',
    color: '#333',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minWidth: 70,
    textAlign: 'center',
  },
  dateDigitsValid: {
    color: '#4CAF50',
  },
  dateSeparator: {
    fontSize: 44,
    fontWeight: '300',
    color: '#999',
  },
  invalidHint: {
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
    marginBottom: 8,
  },
  keypadGrid: {
    gap: 6,
    marginBottom: 12,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  keypadKey: {
    width: 68,
    height: 52,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadKeyAction: {
    backgroundColor: '#EEEEEE',
  },
  keypadKeyText: {
    fontSize: 26,
    fontWeight: '500',
    color: '#333',
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  confirmButtonDisabled: {
    backgroundColor: '#CCC',
  },
  confirmButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default DDMMKeypadSheet;

