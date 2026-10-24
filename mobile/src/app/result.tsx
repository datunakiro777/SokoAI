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
    case 'notSafe': return { title: 'Not safe to eat', subtitle: 'Possible poisonous match. Do not eat.', icon: '!', color: colors.red, background: colors.redPale };
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
              <Text style={styles.photoLabel}>{['MUSHROOM', 'UNDERSIDE', 'BASE'][index]}</Text>
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

        {result && (
          <View style={styles.previewNotice}>
            <Text style={styles.previewTitle}>{result.modelName.toUpperCase()}</Text>
            <Text style={styles.previewText}>{result.modelDetails} A match can be wrong. Do not eat based on this result.</Text>
          </View>
        )}

        {result?.species && (
          <View style={styles.card}>
            <Text style={styles.label}>POSSIBLE SPECIES · EXPERIMENTAL</Text>
            <Text style={styles.speciesName}>{result.species.commonName || result.species.scientificName}</Text>
            {result.species.commonName && <Text style={styles.latin}>{result.species.scientificName}</Text>}
            {result.species.toxicity === 'poisonous' && <>
              <View style={styles.divider} />
              <Text style={styles.fieldLabel}>Published species risk</Text>
              <Text style={styles.fieldValue}>Poisonous</Text>
              {result.species.toxicitySource && <Text style={styles.source}>Source: {result.species.toxicitySource}</Text>}
            </>}
          </View>
        )}

        {!result?.species && result?.genus && (
          <View style={styles.card}>
            <Text style={styles.label}>POSSIBLE GENUS · EXPERIMENTAL</Text>
            <Text style={styles.speciesName}>{result.genus.name}</Text>
            <Text style={styles.latin}>The species could not be told apart from these photos.</Text>
          </View>
        )}

        {result?.warning && (
          <View style={[styles.card, styles.dangerCard]}>
            <Text style={[styles.label, styles.dangerLabel]}>WHY THIS WARNING</Text>
            <Text style={styles.fieldValue}>{result.warning.genus} includes species containing {result.warning.toxin}.</Text>
            <Text style={styles.source}>Source: {result.warning.source}</Text>
          </View>
        )}

        {(result?.speciesConfidence !== undefined || result?.genus) && (
          <View style={styles.card}>
            <Text style={styles.label}>UNCALIBRATED MODEL MATCH</Text>
            {result?.speciesConfidence !== undefined && (
              <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Species match score</Text><Text style={styles.score}>{percentage(result.speciesConfidence)}</Text></View>
            )}
            {result?.genus && (
              <View style={styles.scoreRow}><Text style={styles.scoreLabel}>Genus {result.genus.name}</Text><Text style={styles.score}>{percentage(result.genus.confidence)}</Text></View>
            )}
            <Text style={styles.scoreNote}>These scores are not the chance that the match is correct and are not a poison probability.</Text>
          </View>
        )}

        {!!result?.alternatives?.length && (
          <View style={styles.card}>
            <Text style={styles.label}>CLOSEST MATCHES</Text>
            {result.alternatives.map((match) => (
              <View key={match.scientificName} style={styles.scoreRow}>
                <View style={styles.matchName}>
                  <Text style={styles.matchLatin}>{match.scientificName}</Text>
                  {match.commonName && <Text style={styles.matchCommon}>{match.commonName}</Text>}
                </View>
                <Text style={styles.score}>{percentage(match.confidence)}</Text>
              </View>
            ))}
            <Text style={styles.scoreNote}>Compare these with a field guide or a local expert. Look-alikes can be deadly.</Text>
          </View>
        )}

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
  previewNotice: { backgroundColor: colors.amberPale, borderRadius: 18, padding: 17, marginBottom: 14 },
  previewTitle: { color: '#69451F', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  previewText: { color: '#765B3D', fontSize: 12, lineHeight: 18, marginTop: 6 },
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
  matchName: { flex: 1, paddingRight: 12 },
  matchLatin: { color: colors.text, fontSize: 14, fontStyle: 'italic' },
  matchCommon: { color: colors.muted, fontSize: 12, marginTop: 2 },
  dangerCard: { backgroundColor: colors.redPale },
  dangerLabel: { color: colors.red },
  scoreNote: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 9 },
  warning: { backgroundColor: colors.amberPale, padding: 18, borderRadius: 20, marginTop: 12 },
  warningTitle: { color: '#69451F', fontSize: 14, fontWeight: '800' },
  warningText: { color: '#765B3D', fontSize: 12, lineHeight: 18, marginTop: 6 },
  retryButton: { backgroundColor: colors.forest, borderRadius: 18, alignItems: 'center', padding: 18, marginTop: 19 },
  retryText: { color: 'white', fontSize: 15, fontWeight: '800' },
});
