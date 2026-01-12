/**
 * Skeleton Item Card
 * Placeholder for item cards while loading (no cached data)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';

interface SkeletonItemCardProps {
  index: number;
}

export function SkeletonItemCard({ index }: SkeletonItemCardProps) {
  // Slight delay for staggered animation effect
  const delay = index * 50;
  
  return (
    <Surface style={[styles.container, { opacity: 1 - (index * 0.08) }]} elevation={1}>
      <View style={styles.content}>
        {/* Left side - Status indicator placeholder */}
        <View style={styles.leftSection}>
          <View style={styles.statusDot} />
        </View>
        
        {/* Center - Product info placeholders */}
        <View style={styles.centerSection}>
          {/* Product name placeholder */}
          <View style={[styles.skeleton, styles.titleSkeleton]} />
          
          {/* Category/Date placeholder */}
          <View style={[styles.skeleton, styles.subtitleSkeleton]} />
        </View>
        
        {/* Right side - Days remaining placeholder */}
        <View style={styles.rightSection}>
          <View style={[styles.skeleton, styles.daysSkeleton]} />
        </View>
      </View>
    </Surface>
  );
}

/**
 * Skeleton List Component
 * Renders multiple skeleton cards
 */
interface SkeletonItemListProps {
  count?: number;
}

export function SkeletonItemList({ count = 8 }: SkeletonItemListProps) {
  return (
    <View style={styles.listContainer}>
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonItemCard key={`skeleton-${index}`} index={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 72,
  },
  leftSection: {
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
  },
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
  },
  rightSection: {
    marginLeft: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  skeleton: {
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
  },
  titleSkeleton: {
    height: 18,
    width: '70%',
  },
  subtitleSkeleton: {
    height: 14,
    width: '50%',
  },
  daysSkeleton: {
    width: 50,
    height: 50,
    borderRadius: 12,
  },
});
