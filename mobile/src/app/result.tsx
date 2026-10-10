import { router } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScan } from '../state/ScanContext';
import { colors } from '../ui/theme';
import type { Decision } from '../lib/decision';

function presentation(result: Decision | null) {
  if (!result) return { title: 'Analysis unavailable', subtitle: 'No model result was produced.', icon: '○', color: colors.muted, background: '#E9EEF0' };
  switch (result.kind) {
    case 'notDetected': return { title: 'Not detected', subtitle: 'No mushroom found in these photos.', icon: '⌕', color: colors.muted, background: '#E9EEF0' };
    case 'unknown': return { title: 'Unknown', subtitle: 'Uncertain — do not eat.', icon: '?', color: colors.amber, background: colors.amberPale };
    case 'notSafe': return { title: 'Not safe to eat', subtitle: 'Poisonous or strongly suspected poisonous.', icon: '!', color: colors.red, background: colors.redPale };
    case 'likelyEdible': return { title: 'Likely edible', subtitle: 'Do not eat based on this app alone.', icon: '✓', color: colors.forest, background: '#E5EFDF' };
    case 'uncertain': return { title: 'Uncertain', subtitle: 'Do not eat.', icon: '?', color: colors.amber, background: colors.amberPale };
  }
}

const percentage = (value: number) => `${(value * 100).toFixed(value > 0.99 ? 2 : 1)}%`;

export default function ResultScreen() {
  const { photos, result, analysisError, reset } = useScan();
  const view = presentation(result);

  function tryAgain() {
    reset();
    router.replace('/capture');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topRow}>
          <Pressable onPress={() => router.replace('/')} style={styles.backButton}><Text style={styles.backIcon}>‹</Text></Pressable>
          <Text style={styles.pageTitle}>Assessment</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.photoRow}>
          {photos.map((photo, index) => (
            <View key={`${photo.uri}-${index}`} style={styles.photoWrap}>
              <Image source={{ uri: photo.uri }} style={styles.photo} />
              <Text style={styles.photoLabel}>{['CAP', 'UNDERSIDE', 'BASE'][index]}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.verdictCard, { backgroundColor: view.background }]}>
          <View style={[styles.verdictIcon, { backgroundColor: view.color }]}><Text style={styles.verdictIconText}>{view.icon}</Text></View>
          <Text style={[styles.verdictTitle, { color: view.color }]}>{view.title}</Text>
          <Text style={styles.verdictSubtitle}>{view.subtitle}</Text>
          {analysisError && <Text style={styles.errorText}>{analysisError}</Text>}
          {result && <Text style={styles.reason}>{result.reason}</Text>}
        </View>

        {result?.species && (
          <View style={styles.card}>
            <Text style={styles.label}>LIKELY SPECIES</Text>
            <Text style={styles.speciesName}>{result.species.commonName || result.species.scientificName}</Text>
            {result.species.commonName && <Text style={styles.latin}>{result.species.scientificName}</Text>}
            <View style={styles.divider} />
            <Text style={styles.fieldLabel}>Reference edibility</Text>
            <Text style={styles.fieldValue}>{result.species.toxicity === 'poisonous' ? 'Poisonous' : result.species.toxicity === 'edible' ? 'Listed as edible' : 'Unknown'}</Text>
            {result.species.toxicitySource && <Text style={styles.source}>Source: {result.species.toxicitySource}</Text>}
          </View>
        )}

        {result && result.kind !== 'notDetected' && (
          <View style={styles.card}>
            <Text style={styles.label}>MODEL CONFIDENCE</Text>
            {result.speciesConfidence !== undefined && (
              <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Species match</Text><Text style={styles.score}>{percentage(result.speciesConfidence)}</Text></View>
            )}
            {result.toxicProbability !== undefined && (
              <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Poisonous estimate</Text><Text style={styles.score}>{percentage(result.toxicProbability)}</Text></View>
            )}
            <Text style={styles.scoreNote}>These are calibrated model estimates, not proof of eating safety. An unfamiliar species can still be misidentified.</Text>
          </View>
        )}

        {result?.kind === 'likelyEdible' && result.species?.nutrition && (
          <View style={styles.card}>
            <Text style={styles.label}>NUTRITION · PER 100 G</Text>
            <View style={styles.nutritionRow}>
              {[
                ['Energy', `${result.species.nutrition.caloriesKcal} kcal`],
                ['Protein', `${result.species.nutrition.proteinG} g`],
                ['Carbs', `${result.species.nutrition.carbsG} g`],
                ['Fat', `${result.species.nutrition.fatG} g`],
              ].map(([name, value]) => <View key={name} style={styles.nutritionCell}><Text style={styles.nutritionValue}>{value}</Text><Text style={styles.nutritionName}>{name}</Text></View>)}
            </View>
            <Text style={styles.source}>USDA FoodData Central ID: {result.species.nutrition.sourceId}</Text>
          </View>
        )}

        {result?.kind === 'likelyEdible' && !result.species?.nutrition && <Text style={styles.nutritionUnavailable}>Exact-match nutrition data unavailable.</Text>}

        <View style={styles.warning}>
          <Text style={styles.warningTitle}>Important safety reminder</Text>
          <Text style={styles.warningText}>Never use a photo or confidence score as the sole basis for eating a wild mushroom. If one has been eaten and poisoning is possible, seek local emergency medical advice immediately.</Text>
        </View>

        <Pressable style={styles.retryButton} onPress={tryAgain}><Text style={styles.retryText}>Photograph another mushroom</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 22, paddingBottom: 35 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  backButton: { width: 38, height: 38, justifyContent: 'center' },
  backIcon: { fontSize: 34, color: colors.pine, lineHeight: 38 },
  pageTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  photoRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  photoWrap: { flex: 1, backgroundColor: colors.paper, borderRadius: 14, overflow: 'hidden' },
  photo: { width: '100%', height: 108 },
  photoLabel: { color: colors.muted, fontSize: 9, fontWeight: '800', textAlign: 'center', paddingVertical: 7, letterSpacing: 0.8 },
  verdictCard: { borderRadius: 25, alignItems: 'center', padding: 25, marginBottom: 15 },
  verdictIcon: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  verdictIconText: { color: 'white', fontSize: 32, fontWeight: '800' },
  verdictTitle: { fontSize: 27, fontWeight: '900', letterSpacing: -0.8, marginTop: 14, textAlign: 'center' },
  verdictSubtitle: { color: colors.text, fontSize: 14, textAlign: 'center', marginTop: 4 },
  errorText: { color: colors.red, fontSize: 12, textAlign: 'center', marginTop: 15, lineHeight: 18 },
  reason: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 13, lineHeight: 18 },
  card: { backgroundColor: colors.paper, borderRadius: 20, padding: 19, marginBottom: 14 },
  label: { color: colors.sage, fontSize: 10, fontWeight: '900', letterSpacing: 1.7, marginBottom: 10 },
  speciesName: { color: colors.text, fontSize: 22, fontWeight: '800' },
  latin: { color: colors.muted, fontSize: 13, fontStyle: 'italic', marginTop: 3 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 15 },
  fieldLabel: { color: colors.muted, fontSize: 12 },
  fieldValue: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 3 },
  source: { color: colors.muted, fontSize: 11, marginTop: 9 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  scoreLabel: { color: colors.text, fontSize: 14 },
  score: { color: colors.forest, fontSize: 15, fontWeight: '900' },
  scoreNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 9 },
  nutritionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionCell: { alignItems: 'center' },
  nutritionValue: { color: colors.text, fontSize: 14, fontWeight: '800' },
  nutritionName: { color: colors.muted, fontSize: 10, marginTop: 4 },
  nutritionUnavailable: { color: colors.muted, fontSize: 12, textAlign: 'center', marginVertical: 4 },
  warning: { backgroundColor: colors.amberPale, padding: 18, borderRadius: 20, marginTop: 12 },
  warningTitle: { color: '#69451F', fontSize: 14, fontWeight: '800' },
  warningText: { color: '#765B3D', fontSize: 12, lineHeight: 18, marginTop: 6 },
  retryButton: { backgroundColor: colors.forest, borderRadius: 18, alignItems: 'center', padding: 18, marginTop: 19 },
  retryText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
