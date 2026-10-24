import {
  HostGrotesk_400Regular,
  HostGrotesk_400Regular_Italic,
  HostGrotesk_700Bold,
  HostGrotesk_800ExtraBold,
  HostGrotesk_800ExtraBold_Italic,
  useFonts,
} from '@expo-google-fonts/host-grotesk';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { ScanProvider } from '../state/ScanContext';
import { colors, fonts } from '../ui/theme';

export default function Layout() {
  const [loaded, error] = useFonts({
    [fonts.regular]: HostGrotesk_400Regular,
    [fonts.italic]: HostGrotesk_400Regular_Italic,
    [fonts.strong]: HostGrotesk_700Bold,
    // Host Grotesk's heaviest static cut stands in for the 750 display weight.
    [fonts.display]: HostGrotesk_800ExtraBold,
    [fonts.displayItalic]: HostGrotesk_800ExtraBold_Italic,
  });
  // On a font error, continue with the system font rather than a blank screen.
  if (!loaded && !error) return <View style={{ flex: 1, backgroundColor: colors.ground }} />;
  return (
    <ScanProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: colors.ground } }} />
    </ScanProvider>
  );
}
