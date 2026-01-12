/**
 * Locations / Storage Management Screen
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
  Appbar,
  List,
  FAB,
  Dialog,
  TextInput,
  Button,
  HelperText,
  Portal,
  IconButton,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/context/LanguageContext';
import { useActiveOwner } from '@/lib/hooks/useActiveOwner';
import { supabase } from '@/lib/supabase/client';
import { createLocation, updateLocation, deleteLocation, reorderLocations } from '@/lib/supabase/mutations/locations';
import { getRtlTextStyles } from '@/lib/utils/rtlStyles';
import type { Database } from '@/types/database';

type Location = Database['public']['Tables']['locations']['Row'];

export default function LocationsScreen() {
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const rtlText = getRtlTextStyles(isRTL);
  const { activeOwnerId } = useActiveOwner();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [locationName, setLocationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (activeOwnerId) {
      loadLocations();
    }
  }, [activeOwnerId]);

  const loadLocations = async () => {
    if (!activeOwnerId) return;

    setLoading(true);
    try {
      const { data, error: fetchError } = await supabase
        .from('locations')
        .select('*')
        .eq('owner_id', activeOwnerId)
        .order('display_order', { ascending: true });

      if (fetchError) throw fetchError;

      setLocations(data || []);

      // Get item counts for each location
      if (data && data.length > 0) {
        const counts: Record<string, number> = {};
        for (const loc of data) {
          const { count } = await supabase
            .from('items')
            .select('*', { count: 'exact', head: true })
            .eq('location_id', loc.id);
          counts[loc.id] = count || 0;
        }
        setItemCounts(counts);
      }
    } catch (err: any) {
      console.error('Error loading locations:', err);
      Alert.alert(
        t('common.error') || 'שגיאה',
        err.message || t('settings.locations.loadError') || 'לא ניתן לטעון מיקומים'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingLocation(null);
    setLocationName('');
    setError(null);
    setDialogVisible(true);
  };

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setLocationName(location.name);
    setError(null);
    setDialogVisible(true);
  };

  const handleDelete = async (location: Location) => {
    const itemCount = itemCounts[location.id] || 0;

    if (itemCount > 0) {
      Alert.alert(
        t('settings.locations.deleteConfirm') || 'מחיקת מיקום',
        t('settings.locations.deleteWithItems', { count: itemCount }) || 
        `למיקום זה יש ${itemCount} מוצרים. האם אתה בטוח שברצונך למחוק אותו?`,
        [
          { text: t('common.cancel') || 'ביטול', style: 'cancel' },
          {
            text: t('common.delete') || 'מחק',
            style: 'destructive',
            onPress: async () => {
              try {
                // Set items to null location
                await supabase
                  .from('items')
                  .update({ location_id: null })
                  .eq('location_id', location.id);

                await deleteLocation(location.id);
                await loadLocations();
              } catch (err: any) {
                Alert.alert(
                  t('common.error') || 'שגיאה',
                  err.message || t('settings.locations.deleteError') || 'לא ניתן למחוק את המיקום'
                );
              }
            },
          },
        ]
      );
    } else {
      Alert.alert(
        t('settings.locations.deleteConfirm') || 'מחיקת מיקום',
        t('settings.locations.deleteConfirmMessage') || 'האם אתה בטוח שברצונך למחוק את המיקום הזה?',
        [
          { text: t('common.cancel') || 'ביטול', style: 'cancel' },
          {
            text: t('common.delete') || 'מחק',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteLocation(location.id);
                await loadLocations();
              } catch (err: any) {
                Alert.alert(
                  t('common.error') || 'שגיאה',
                  err.message || t('settings.locations.deleteError') || 'לא ניתן למחוק את המיקום'
                );
              }
            },
          },
        ]
      );
    }
  };

  const handleSave = async () => {
    if (!activeOwnerId) return;

    // Validation
    if (!locationName.trim()) {
      setError(t('settings.locations.nameRequired') || 'שם המיקום נדרש');
      return;
    }

    if (locationName.length < 2) {
      setError(t('settings.locations.nameMinLength') || 'שם המיקום חייב להכיל לפחות 2 תווים');
      return;
    }

    if (locationName.length > 40) {
      setError(t('settings.locations.nameMaxLength') || 'שם המיקום לא יכול להכיל יותר מ-40 תווים');
      return;
    }

    // Check for duplicate names (case-insensitive)
    const existing = locations.find(
      (loc) =>
        loc.name.toLowerCase() === locationName.toLowerCase().trim() &&
        loc.id !== editingLocation?.id
    );

    if (existing) {
      setError(t('settings.locations.nameDuplicate') || 'מיקום עם שם זה כבר קיים');
      return;
    }

    try {
      if (editingLocation) {
        await updateLocation(editingLocation.id, {
          name: locationName.trim(),
        });
      } else {
        await createLocation({
          owner_id: activeOwnerId,
          name: locationName.trim(),
          display_order: locations.length,
        } as any);
      }

      setDialogVisible(false);
      await loadLocations();
    } catch (err: any) {
      console.error('Error saving location:', err);
      setError(err.message || t('settings.locations.saveError') || 'לא ניתן לשמור את המיקום');
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: '#F5F5F5' }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={t('settings.locationsTitle') || 'מיקומים / אחסון'} />
      </Appbar.Header>

      <ScrollView style={styles.content}>
        {loading ? (
          <HelperText type="info" style={rtlText}>
            {t('common.loading') || 'טוען...'}
          </HelperText>
        ) : locations.length === 0 ? (
          <HelperText type="info" style={rtlText}>
            {t('settings.locations.noLocations') || 'אין מיקומים. הוסף מיקום חדש'}
          </HelperText>
        ) : (
          locations.map((location) => (
            <List.Item
              key={location.id}
              title={location.name}
              description={
                itemCounts[location.id] > 0
                  ? `${itemCounts[location.id]} ${t('settings.locations.items') || 'מוצרים'}`
                  : t('settings.locations.noItems') || 'אין מוצרים'
              }
              left={(props) => <List.Icon {...props} icon="map-marker" />}
              right={(props) => (
                <View style={styles.actions}>
                  <IconButton
                    {...props}
                    icon="pencil"
                    size={20}
                    onPress={() => handleEdit(location)}
                  />
                  <IconButton
                    {...props}
                    icon="delete"
                    size={20}
                    onPress={() => handleDelete(location)}
                  />
                </View>
              )}
            />
          ))
        )}
      </ScrollView>

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={handleAdd}
        label={t('settings.locations.add') || 'הוסף מיקום'}
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title style={rtlText}>
            {editingLocation
              ? t('settings.locations.editLocation') || 'ערוך מיקום'
              : t('settings.locations.addLocation') || 'הוסף מיקום'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('settings.locations.name') || 'שם המיקום'}
              value={locationName}
              onChangeText={(text) => {
                setLocationName(text);
                setError(null);
              }}
              error={!!error}
              style={rtlText}
              mode="outlined"
              autoFocus
            />
            {error && (
              <HelperText type="error" visible={!!error} style={rtlText}>
                {error}
              </HelperText>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>
              {t('common.cancel') || 'ביטול'}
            </Button>
            <Button onPress={handleSave} mode="contained">
              {t('common.save') || 'שמור'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  actions: {
    flexDirection: 'row',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});

