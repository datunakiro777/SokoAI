import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { Alert, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FUNGI_MODEL_SHA256, FUNGI_SPECIES_COUNT } from '../lib/fungiModel';
import { loadHistory } from '../lib/history';
import { MODEL_LICENSE } from '../lib/modelLicense';
import { useScan } from '../state/ScanContext';
import { Body, Button, Display, ItemTitle, Label, Lead, Meta, Rule, Section, TextLink } from '../ui/components';
import { RAIL_BREAKPOINT, colors, displaySize, fonts, gutter, rule } from '../ui/theme';

const expoGo = Constants.appOwnership === 'expo';
const speciesCount = FUNGI_SPECIES_COUNT.toLocaleString('en-US');

const steps = [
  ['01', 'Photograph', 'One mushroom, cap and stem from the side, filling the frame.'],
  ['02', 'Add angles', 'Optional: the underside and the base help separate look-alikes.'],
  ['03', 'Read the matches', 'A species or genus when the match is strong, and the closest three either way.'],
];

export default function HomeScreen() {
  const { reset } = useScan();
  const { width } = useWindowDimensions();
  const wide = width >= RAIL_BREAKPOINT;
  const pad = gutter(width);
  const [checks, setChecks] = useState<number | null>(null);

  useFocusEffect(useCallback(() => {
    loadHistory().then((entries) => setChecks(entries.length), () => setChecks(null));
  }, []));

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
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.masthead, { paddingHorizontal: pad }]}>
          <Label style={styles.brand}>SokoAI</Label>
          <Label>Offline field guide</Label>
        </View>
        <Rule />

        <View style={[{ paddingHorizontal: pad, paddingTop: 22, paddingBottom: 30 }, wide && styles.openingWide]}>
          <View style={wide ? styles.openingStatement : undefined}>
            <Label>01 — Identify</Label>
            <Display size={displaySize(width)} style={[styles.opening, { marginBottom: Math.round(displaySize(width) * 0.12) }]}>Find the fungus.</Display>
            <Lead>Take one clear photo. SokoAI compares it with {speciesCount} fungal species from around the world, on this phone, without a connection.</Lead>
          </View>
          <View style={[styles.actions, wide && styles.actionsWide]}>
            <Button label={expoGo ? 'Development build needed' : 'Start identification'} onPress={start} />
            <Button
              label={checks ? `History · ${checks} check${checks === 1 ? '' : 's'}` : 'History'}
              variant="secondary"
              onPress={() => router.push('/history')}
            />
          </View>
        </View>

        <Section index="02" title="Method" inverse>
          {steps.map(([number, title, detail], position) => (
            <View key={number} style={[styles.step, position > 0 && styles.stepRuled]}>
              <Label inverse style={styles.stepNumber}>{number}</Label>
              <View style={styles.stepBody}>
                <ItemTitle inverse>{title}</ItemTitle>
                <Body inverse style={styles.stepDetail}>{detail}</Body>
              </View>
            </View>
          ))}
        </Section>

        <Section index="03" title="Safety" accent>
          <ItemTitle>Never eat a mushroom based on an app result.</ItemTitle>
          <Body style={styles.paragraph}>
            Photo identification can be wrong, and look-alikes can be deadly. SokoAI never reports a mushroom as safe to eat. If one has been eaten and poisoning is possible, get emergency medical advice immediately.
          </Body>
        </Section>

        <Section index="04" title="Model" surface>
          <Body>
            BioCLIP 2 runs on this phone and suggests likely species from {speciesCount} fungi. It has not been validated to tell you a mushroom is safe to eat. Species descriptions come from Wikipedia.
          </Body>
          <View style={styles.links}>
            <TextLink label="Model credit and MIT license" onPress={() => Alert.alert('BioCLIP 2 model license', MODEL_LICENSE)} />
          </View>
        </Section>

        <Rule />
        <View style={styles.footer}>
          {[
            ['App', 'SokoAI · English beta'],
            ['Species', speciesCount],
            ['Model', FUNGI_MODEL_SHA256.slice(0, 8)],
            ['Text', 'Wikipedia, CC BY-SA'],
          ].map(([title, value], position) => (
            <View
              key={title}
              style={[styles.footerCell, { width: wide ? '25%' : '50%', paddingLeft: position % (wide ? 4 : 2) ? 12 : pad }, position % (wide ? 4 : 2) > 0 && styles.footerDivider]}
            >
              <Label>{title}</Label>
              <Meta>{value}</Meta>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  scroll: { paddingBottom: 24 },
  masthead: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { fontFamily: fonts.display, fontSize: 16, letterSpacing: 0 },
  openingWide: { flexDirection: 'row', alignItems: 'flex-end', gap: 24 },
  openingStatement: { width: '72%' },
  opening: { marginTop: 18 },
  actions: { gap: 10, marginTop: 26 },
  actionsWide: { flex: 1, marginTop: 0 },
  step: { flexDirection: 'row', paddingVertical: 16, gap: 16 },
  stepRuled: { borderTopWidth: rule, borderColor: colors.ground },
  stepNumber: { width: 28, paddingTop: 6 },
  stepBody: { flex: 1 },
  stepDetail: { marginTop: 6 },
  paragraph: { marginTop: 12 },
  links: { marginTop: 14, gap: 10 },
  footer: { flexDirection: 'row', flexWrap: 'wrap' },
  footerCell: { paddingVertical: 14, paddingRight: 12, gap: 4, borderBottomWidth: rule, borderColor: colors.ink },
  footerDivider: { borderLeftWidth: rule },
});
