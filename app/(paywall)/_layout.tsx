import { Stack } from 'expo-router';

export default function PaywallLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: {
          backgroundColor: '#F5F7FA',
        },
      }}
    >
      <Stack.Screen 
        name="subscribe" 
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="current-plan" 
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen 
        name="manage-subscription" 
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}

