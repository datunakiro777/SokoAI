import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScanProvider } from '../state/ScanContext';
import { colors } from '../ui/theme';

export default function Layout() {
  return (
    <ScanProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }} />
    </ScanProvider>
  );
}
