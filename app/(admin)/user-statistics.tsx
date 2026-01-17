import React from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Card, ActivityIndicator, Divider } from 'react-native-paper';
import { useUserStatistics, calculateConversionRates } from '@/lib/hooks/useUserStatistics';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_COLORS } from '@/lib/constants/colors';

/**
 * Admin Dashboard Screen - User Statistics
 * 
 * Displays real-time aggregated statistics about users and subscriptions.
 * This component demonstrates how to use the useUserStatistics hook.
 * 
 * @example
 * // In your navigation:
 * <Stack.Screen name="admin-stats" component={AdminUserStatistics} />
 */
export default function AdminUserStatistics() {
  const { t, isRTL } = useLanguage();
  const { data: stats, isLoading, error, refetch, isRefetching } = useUserStatistics({
    refetchInterval: 60000, // Auto-refresh every 1 minute
  });

  const rates = calculateConversionRates(stats);

  if (isLoading && !stats) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={THEME_COLORS.primary} />
        <Text style={styles.loadingText}>טוען סטטיסטיקות...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>שגיאה בטעינת סטטיסטיקות</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
      </View>
    );
  }

  const statCards = [
    {
      title: 'סה״כ משתמשים',
      value: stats?.total_users || 0,
      icon: '👥',
      color: '#3B82F6',
      description: 'כל המשתמשים הרשומים',
    },
    {
      title: 'משתמשי Pro',
      value: stats?.pro_users || 0,
      icon: '📦',
      color: '#007AFF',
      description: 'התוכנית הסטנדרטית',
    },
    {
      title: 'משתמשי Pro+',
      value: stats?.pro_plus_users || 0,
      icon: '👑',
      color: '#6d28d9',
      description: 'התוכנית המתקדמת',
    },
    {
      title: 'משתמשים חינמיים',
      value: stats?.free_users || 0,
      icon: '🆓',
      color: '#9CA3AF',
      description: 'ללא מנוי בתשלום',
    },
    {
      title: 'פעילים בתשלום',
      value: stats?.active_paid_users || 0,
      icon: '✅',
      color: '#10B981',
      description: 'מנוי תקף ופעיל',
    },
    {
      title: 'מנויים שפגו',
      value: stats?.expired_paid_users || 0,
      icon: '⏰',
      color: '#EF4444',
      description: 'מנוי פג תוקף',
    },
    {
      title: 'חידוש אוטומטי',
      value: stats?.auto_renew_users || 0,
      icon: '🔄',
      color: '#8B5CF6',
      description: 'הפעילו חידוש אוטומטי',
    },
    {
      title: 'משתמשים חדשים (7 ימים)',
      value: stats?.new_users_last_7_days || 0,
      icon: '🆕',
      color: '#F59E0B',
      description: 'נרשמו בשבוע האחרון',
    },
    {
      title: 'משתמשים חדשים (30 ימים)',
      value: stats?.new_users_last_30_days || 0,
      icon: '📈',
      color: '#06B6D4',
      description: 'נרשמו בחודש האחרון',
    },
  ];

  const lastUpdate = stats?.calculated_at 
    ? new Date(stats.calculated_at).toLocaleString('he-IL', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          colors={[THEME_COLORS.primary]}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>סטטיסטיקות משתמשים</Text>
        <Text style={styles.headerSubtitle}>עודכן לאחרונה: {lastUpdate}</Text>
      </View>

      {/* Conversion Rates Section */}
      <Card style={styles.conversionCard}>
        <Card.Content>
          <Text style={styles.sectionTitle}>שיעורי המרה</Text>
          <Divider style={styles.divider} />
          
          <View style={styles.conversionRow}>
            <Text style={styles.conversionLabel}>המרה מחינמי לתשלום:</Text>
            <Text style={styles.conversionValue}>{rates.freeToPaid}%</Text>
          </View>
          
          <View style={styles.conversionRow}>
            <Text style={styles.conversionLabel}>שימור משתמשים משלמים:</Text>
            <Text style={styles.conversionValue}>{rates.paidRetention}%</Text>
          </View>
          
          <View style={styles.conversionRow}>
            <Text style={styles.conversionLabel}>שיעור חידוש אוטומטי:</Text>
            <Text style={styles.conversionValue}>{rates.autoRenewRate}%</Text>
          </View>
        </Card.Content>
      </Card>

      {/* Statistics Cards Grid */}
      <View style={styles.grid}>
        {statCards.map((card, index) => (
          <Card 
            key={index} 
            style={[styles.statCard, { borderLeftColor: card.color, borderLeftWidth: 4 }]}
          >
            <Card.Content>
              <View style={styles.statCardHeader}>
                <Text style={styles.statIcon}>{card.icon}</Text>
                <Text style={styles.statValue}>{card.value.toLocaleString('he-IL')}</Text>
              </View>
              <Text style={styles.statTitle}>{card.title}</Text>
              <Text style={styles.statDescription}>{card.description}</Text>
            </Card.Content>
          </Card>
        ))}
      </View>

      {/* Footer Note */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          💡 הנתונים מתעדכנים אוטומטית כל דקה
        </Text>
        <Text style={styles.footerText}>
          🔄 משוך למטה לרענון ידני
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  contentContainer: {
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EF4444',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  conversionCard: {
    marginBottom: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  divider: {
    marginBottom: 12,
  },
  conversionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  conversionLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  conversionValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: THEME_COLORS.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statIcon: {
    fontSize: 28,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  statTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  statDescription: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    gap: 8,
  },
  footerText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
  },
});
