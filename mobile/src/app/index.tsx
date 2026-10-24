import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MODEL_LICENSE } from '../lib/modelLicense';
import { useScan } from '../state/ScanContext';
import { colors } from '../ui/theme';

const expoGo = Constants.appOwnership === 'expo';

export default function HomeScreen() {
  const { reset } = useScan();

  function start() {
    if (expoGo) {
      Alert.alert('Development build needed', 'Expo Go cannot run the offline fungus model. Install a SokoAI development build to test identification.');
      return;
    }
    reset();
    router.push('/capture');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandIcon}><Text style={styles.brandEmoji}>🍄</Text></View>
          <View><Text style={styles.brand}>SokoAI</Text><Text style={styles.brandSub}>MUSHROOM FIELD GUIDE</Text></View>
          <View style={styles.offlinePill}><Text style={styles.offlineText}>● OFFLINE</Text></View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.eyebrow}>EXPLORE WITH CARE</Text>
          <Text style={styles.heroTitle}>A closer look at what you found.</Text>
          <Text style={styles.heroBody}>Take one clear photo. The offline model compares it with 51,406 fungal species from around the world.</Text>
          <View style={styles.heroIllustration}>
            <Text style={styles.heroMushroom}>🍄</Text>
            <View style={styles.heroRing} />
          </View>
        </View>

        <View style={styles.warning}>
          <Text style={styles.warningIcon}>!</Text>
          <View style={styles.warningBody}>
            <Text style={styles.warningTitle}>Never eat based on an app result</Text>
            <Text style={styles.warningText}>Photo identification can be wrong. Even a high confidence score does not prove a wild mushroom is safe to eat.</Text>
          </View>
        </View>

        <View style={styles.modelNotice}>
          <Text style={styles.modelTitle}>Experimental species preview</Text>
          <Text style={styles.modelText}>{expoGo
            ? 'Expo Go cannot run this offline model. Install the SokoAI development build to test species identification.'
            : 'BioCLIP 2 runs on this phone and suggests likely species from 51,406 fungi worldwide. It has not been validated to tell you a mushroom is safe to eat.'}</Text>
          <Pressable onPress={() => Alert.alert('BioCLIP 2 model license', MODEL_LICENSE)}>
            <Text style={styles.modelLicense}>Model credit and MIT license</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>One photo is enough. More angles help.</Text>
        <View style={styles.steps}>
          {[
            ['01', 'Mushroom', 'Cap and stem from the side'],
            ['02', 'Underside', 'Optional: gills, pores, or ridges'],
            ['03', 'Base', 'Optional: where the stem meets the ground'],
          ].map(([number, title, detail]) => (
            <View key={number} style={styles.step}>
              <Text style={styles.stepNumber}>{number}</Text>
              <View><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDetail}>{detail}</Text></View>
            </View>
          ))}
        </View>

        <Pressable style={styles.startButton} onPress={start}>
          <Text style={styles.startText}>{expoGo ? 'Development build needed' : 'Start identification'}</Text>
          <Text style={styles.startArrow}>↗</Text>
        </Pressable>
        <Text style={styles.footer}>Worldwide fungi · species preview · English beta</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingBottom: 36 },
  brandRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 22 },
  brandIcon: { width: 47, height: 47, borderRadius: 16, backgroundColor: '#E2E9D9', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  brandEmoji: { fontSize: 25 },
  brand: { color: colors.pine, fontSize: 23, fontWeight: '800', letterSpacing: -0.7 },
  brandSub: { color: colors.sage, fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  offlinePill: { marginLeft: 'auto', backgroundColor: '#E4EDDF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14 },
  offlineText: { color: colors.forest, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  hero: { backgroundColor: colors.pine, borderRadius: 28, minHeight: 310, padding: 25, overflow: 'hidden' },
  eyebrow: { color: '#A7C69A', fontSize: 11, fontWeight: '800', letterSpacing: 2.2, marginBottom: 12 },
  heroTitle: { color: '#FAF9F1', fontSize: 34, lineHeight: 37, letterSpacing: -1.1, fontWeight: '700', width: '76%' },
  heroBody: { color: '#D0DED3', fontSize: 14, lineHeight: 21, marginTop: 13, width: '72%' },
  heroIllustration: { position: 'absolute', right: -18, bottom: -10, width: 155, height: 180, alignItems: 'center', justifyContent: 'center' },
  heroMushroom: { fontSize: 104, zIndex: 1 },
  heroRing: { width: 155, height: 155, borderColor: '#7DA284', borderWidth: 1, borderRadius: 100, position: 'absolute', opacity: 0.5 },
  warning: { flexDirection: 'row', backgroundColor: colors.amberPale, borderRadius: 20, padding: 17, marginTop: 18, alignItems: 'flex-start' },
  warningIcon: { backgroundColor: colors.amber, color: 'white', overflow: 'hidden', borderRadius: 15, width: 27, height: 27, textAlign: 'center', lineHeight: 27, fontWeight: '900', marginRight: 12 },
  warningBody: { flex: 1 },
  warningTitle: { color: '#69451F', fontWeight: '800', fontSize: 15 },
  warningText: { color: '#765B3D', fontSize: 13, lineHeight: 19, marginTop: 4 },
  modelNotice: { backgroundColor: '#E9EEF0', borderRadius: 18, padding: 15, marginTop: 14 },
  modelTitle: { color: '#375363', fontSize: 14, fontWeight: '800' },
  modelText: { color: '#4F6975', fontSize: 12, lineHeight: 18, marginTop: 5 },
  modelLicense: { color: colors.forest, fontSize: 12, fontWeight: '700', marginTop: 10, textDecorationLine: 'underline' },
  sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 27, marginBottom: 13, letterSpacing: -0.3 },
  steps: { backgroundColor: colors.paper, borderRadius: 22, paddingHorizontal: 18 },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0E9' },
  stepNumber: { color: colors.sage, fontSize: 13, fontWeight: '900', width: 36 },
  stepTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  stepDetail: { color: colors.muted, fontSize: 12, marginTop: 2 },
  startButton: { backgroundColor: colors.forest, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 21, paddingVertical: 19, marginTop: 22 },
  startText: { color: 'white', fontSize: 17, fontWeight: '800' },
  startArrow: { color: 'white', fontSize: 22 },
  footer: { color: colors.muted, textAlign: 'center', fontSize: 11, marginTop: 18 },
});
