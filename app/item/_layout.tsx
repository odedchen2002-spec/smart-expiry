/**
 * Item route layout
 * Handles dynamic item routes like /item/[id]
 */

import { Stack } from 'expo-router';

export default function ItemLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="[id]" />
    </Stack>
  );
}

