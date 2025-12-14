import React from 'react';
import { StyleSheet, View, TouchableOpacity, Platform } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';

export function LanguageOnboarding() {
  const { setLanguage } = useLanguage();

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <LinearGradient
        colors={['#FFFFFF', '#F8F9FA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.container}>
          {/* Logo/Icon Section */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <LinearGradient
                colors={THEME_COLORS.primaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoGradient}
              >
                <MaterialCommunityIcons name="calendar-clock" size={64} color="#FFFFFF" />
              </LinearGradient>
            </View>
          </View>

          {/* Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.welcomeTitle}>
              Welcome
            </Text>
            <Text style={styles.title}>
              Choose your language
            </Text>
            <Text style={styles.subtitle}>
              You can change the language later from Settings.
            </Text>
          </View>

          {/* Language Selection Cards */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={styles.languageCard}
              activeOpacity={0.8}
              onPress={() => setLanguage('he')}
            >
              <Surface style={styles.cardSurface} elevation={2}>
                <View style={styles.cardContent}>
                  <View style={styles.cardIconContainer}>
                    <MaterialCommunityIcons name="translate" size={32} color={THEME_COLORS.primary} />
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={styles.cardTitle}>עברית</Text>
                    <Text style={styles.cardSubtitle}>Hebrew</Text>
                  </View>
                  <MaterialCommunityIcons 
                    name="chevron-left" 
                    size={24} 
                    color={THEME_COLORS.textSecondary} 
                    style={styles.cardChevron}
                  />
                </View>
              </Surface>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.languageCard}
              activeOpacity={0.8}
              onPress={() => setLanguage('en')}
            >
              <Surface style={styles.cardSurface} elevation={2}>
                <View style={styles.cardContent}>
                  <View style={styles.cardIconContainer}>
                    <MaterialCommunityIcons name="translate" size={32} color={THEME_COLORS.primary} />
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={styles.cardTitle}>English</Text>
                  </View>
                  <MaterialCommunityIcons 
                    name="chevron-right" 
                    size={24} 
                    color={THEME_COLORS.textSecondary} 
                    style={styles.cardChevron}
                  />
                </View>
              </Surface>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  gradient: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  logoGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  welcomeTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: THEME_COLORS.primary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: THEME_COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: THEME_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  buttonsContainer: {
    gap: 16,
  },
  languageCard: {
    marginBottom: 4,
  },
  cardSurface: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  cardIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: THEME_COLORS.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME_COLORS.text,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: THEME_COLORS.textSecondary,
  },
  cardChevron: {
    opacity: 0.5,
  },
});


