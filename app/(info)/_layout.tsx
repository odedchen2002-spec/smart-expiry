import { Stack } from 'expo-router';

export default function InfoLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen 
        name="terms" 
        options={{ 
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }} 
      />
      <Stack.Screen 
        name="privacy" 
        options={{ 
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
        }} 
      />
    </Stack>
  );
}

