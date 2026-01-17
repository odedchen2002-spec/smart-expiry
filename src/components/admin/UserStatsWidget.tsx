import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useUserStatistics } from '@/lib/hooks/useUserStatistics';

/**
 * Simple User Statistics Widget
 * 
 * A minimal example showing how to display user statistics.
 * Perfect for adding to an existing admin screen or dashboard.
 * 
 * @example
 * // Add to any screen:
 * import { UserStatsWidget } from '@/components/admin/UserStatsWidget';
 * 
 * function AdminScreen() {
 *   return (
 *     <View>
 *       <UserStatsWidget />
 *       {/* other content *\/}
 *     </View>
 *   );
 * }
 */
export function UserStatsWidget() {
  const { data: stats, isLoading, error } = useUserStatistics();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>טוען סטטיסטיקות...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>שגיאה בטעינת סטטיסטיקות</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>סטטיסטיקות משתמשים</Text>
      
      <View style={styles.row}>
        <StatItem label="סה״כ" value={stats?.total_users} color="#3B82F6" />
        <StatItem label="חינמי" value={stats?.free_users} color="#9CA3AF" />
      </View>
      
      <View style={styles.row}>
        <StatItem label="Pro" value={stats?.pro_users} color="#007AFF" />
        <StatItem label="Pro+" value={stats?.pro_plus_users} color="#6d28d9" />
      </View>
      
      <View style={styles.row}>
        <StatItem label="פעילים" value={stats?.active_paid_users} color="#10B981" />
        <StatItem label="חדשים (7d)" value={stats?.new_users_last_7_days} color="#F59E0B" />
      </View>
    </View>
  );
}

function StatItem({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <View style={[styles.statItem, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value?.toLocaleString('he-IL') || 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statItem: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    borderLeftWidth: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#EF4444',
    textAlign: 'center',
  },
});
