/**
 * Production Diagnostics Screen
 * Debug tool for production/TestFlight builds
 * 
 * Access: Only visible when EXPO_PUBLIC_ENV !== 'production' OR __DEV__ is true
 * Usage: Navigate to this screen when debugging network issues
 */

import { useLanguage } from '@/context/LanguageContext';
import { runProductionDiagnostics, formatDiagnosticResults } from '@/lib/diagnostics/productionDiagnostics';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/constants/config';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Card, Divider, Text, useTheme } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DiagnosticsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t } = useLanguage();
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setRunning(true);
    setResults(null);

    try {
      console.log('[Diagnostics] Running production diagnostics...');
      const result = await runProductionDiagnostics();
      const formatted = formatDiagnosticResults(result);
      
      console.log(formatted);
      setResults(formatted);
    } catch (error: any) {
      console.error('[Diagnostics] Error running diagnostics:', error);
      setResults(`❌ Diagnostics failed to run:\n${error?.message || String(error)}`);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    // Auto-run on mount
    runDiagnostics();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Production Diagnostics" />
      </Appbar.Header>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.headerSection}>
              <MaterialCommunityIcons name="magnify" size={40} color={theme.colors.primary} />
              <Text variant="headlineSmall" style={styles.title}>
                Network & Config Diagnostics
              </Text>
              <Text variant="bodyMedium" style={styles.subtitle}>
                Debugging tool for production builds
              </Text>
            </View>

            <Divider style={styles.divider} />

            <View style={styles.section}>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Environment Configuration
              </Text>
              <View style={styles.configRow}>
                <Text variant="bodySmall" style={styles.configLabel}>SUPABASE_URL:</Text>
                <Text variant="bodySmall" style={styles.configValue}>
                  {SUPABASE_URL ? `${SUPABASE_URL.substring(0, 50)}...` : '❌ MISSING'}
                </Text>
              </View>
              <View style={styles.configRow}>
                <Text variant="bodySmall" style={styles.configLabel}>SUPABASE_ANON_KEY:</Text>
                <Text variant="bodySmall" style={styles.configValue}>
                  {SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 30)}... (${SUPABASE_ANON_KEY.length} chars)` : '❌ MISSING'}
                </Text>
              </View>
              <View style={styles.configRow}>
                <Text variant="bodySmall" style={styles.configLabel}>__DEV__:</Text>
                <Text variant="bodySmall" style={styles.configValue}>
                  {String(__DEV__)}
                </Text>
              </View>
              <View style={styles.configRow}>
                <Text variant="bodySmall" style={styles.configLabel}>EXPO_PUBLIC_ENV:</Text>
                <Text variant="bodySmall" style={styles.configValue}>
                  {process.env.EXPO_PUBLIC_ENV || 'undefined'}
                </Text>
              </View>
              <View style={styles.configRow}>
                <Text variant="bodySmall" style={styles.configLabel}>NODE_ENV:</Text>
                <Text variant="bodySmall" style={styles.configValue}>
                  {process.env.NODE_ENV || 'undefined'}
                </Text>
              </View>
            </View>

            <Divider style={styles.divider} />

            <Button
              mode="contained"
              onPress={runDiagnostics}
              loading={running}
              disabled={running}
              style={styles.runButton}
            >
              {running ? 'Running diagnostics...' : 'Run Diagnostics'}
            </Button>

            {results && (
              <View style={styles.resultsContainer}>
                <Text variant="labelLarge" style={styles.resultsTitle}>
                  Diagnostic Results:
                </Text>
                <ScrollView style={styles.resultsScroll} nestedScrollEnabled>
                  <Text variant="bodySmall" style={styles.resultsText}>
                    {results}
                  </Text>
                </ScrollView>
              </View>
            )}
          </Card.Content>
        </Card>

        <Card style={[styles.card, styles.infoCard]}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.infoTitle}>
              📝 How to View Logs on iOS
            </Text>
            <Text variant="bodySmall" style={styles.infoText}>
              1. Connect your iPhone to Mac via cable{'\n'}
              2. Open Xcode → Window → Devices and Simulators{'\n'}
              3. Select your device → Open Console{'\n'}
              4. Filter by process: "Smart Expiry" or "expiryx"{'\n'}
              5. Look for [CONFIG], [Auth], [Supabase Client] tags{'\n\n'}
              
              Or use Console.app (Mac):{'\n'}
              1. Open Console.app{'\n'}
              2. Select your iPhone in sidebar{'\n'}
              3. Search for "CONFIG" or "Auth" in the filter
            </Text>
          </Card.Content>
        </Card>

        <Card style={[styles.card, styles.warningCard]}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.warningTitle}>
              ⚠️ Common Production Issues
            </Text>
            <Text variant="bodySmall" style={styles.warningText}>
              <Text style={styles.bold}>Network request failed:</Text>{'\n'}
              • EAS secrets not configured{'\n'}
              • Supabase URL is empty/undefined{'\n'}
              • Using localhost URL in production{'\n'}
              • Network connectivity issue{'\n\n'}
              
              <Text style={styles.bold}>Fix:</Text>{'\n'}
              1. Run: eas secret:list{'\n'}
              2. Verify both secrets exist{'\n'}
              3. Rebuild with: eas build --platform ios --profile production{'\n'}
              4. Check console logs for [CONFIG] output
            </Text>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
  },
  warningCard: {
    backgroundColor: '#FFF3E0',
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    marginTop: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    textAlign: 'center',
    color: '#666',
  },
  divider: {
    marginVertical: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 12,
  },
  configRow: {
    marginBottom: 8,
  },
  configLabel: {
    fontWeight: '600',
    color: '#555',
    marginBottom: 2,
  },
  configValue: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#333',
    backgroundColor: '#F5F5F5',
    padding: 8,
    borderRadius: 4,
  },
  runButton: {
    marginTop: 8,
  },
  resultsContainer: {
    marginTop: 16,
  },
  resultsTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  resultsScroll: {
    maxHeight: 300,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  resultsText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 10,
    lineHeight: 16,
  },
  infoTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    lineHeight: 20,
    color: '#424242',
  },
  warningTitle: {
    fontWeight: '600',
    marginBottom: 8,
    color: '#E65100',
  },
  warningText: {
    lineHeight: 20,
    color: '#424242',
  },
  bold: {
    fontWeight: '600',
  },
});
