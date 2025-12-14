import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';

export default function OnboardingScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text variant="headlineLarge" style={styles.title}>
          {t('home.title')}
        </Text>
        <Text variant="bodyLarge" style={styles.description}>
          Track expiry dates, scan barcodes, and never miss an expiring product again.
        </Text>
      </View>

      <View style={styles.actions}>
        <Button
          mode="contained"
          onPress={() => router.push('/(auth)/signup')}
          style={styles.button}
        >
          {t('auth.signup')}
        </Button>
        <Button
          mode="outlined"
          onPress={() => router.push('/(auth)/login')}
          style={styles.button}
        >
          {t('auth.login')}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
    opacity: 0.7,
  },
  actions: {
    gap: 12,
  },
  button: {
    paddingVertical: 4,
  },
});

