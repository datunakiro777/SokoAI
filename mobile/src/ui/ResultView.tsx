import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { Image, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Decision } from '../lib/decision';
import type { Photo } from '../lib/inference';
import { Body, Display, ItemTitle, Label, Lead, Marker, Meta, Rule, RowLink, Section } from './components';
import { colors, displaySize, fonts, gutter, rule } from './theme';
import { formatDate, percentage, verdictTitle } from './verdict';

const photoLabels = ['Mushroom', 'Underside', 'Base'];

/** A finished check, fresh or from history. */
export function ResultView({ decision, photos, createdAt, note, actions }: {
  decision: Decision;
  photos: Photo[];
  createdAt: string;
  note?: string;
  actions: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const pad = gutter(width);
  const danger = decision.kind === 'notSafe';
  const hasMatch = !!(decision.species || decision.genus);
  const hasWarning = !!(decision.warning || decision.species?.toxicity === 'poisonous');
  const hasAlternatives = !!decision.alternatives?.length;
  // Sections are numbered after the opening result (01) in the order they appear.
  const shown = [hasMatch && 'match', hasWarning && 'warning', hasAlternatives && 'alternatives', 'model', 'safety'].filter(Boolean);
  const number = (key: string) => String(shown.indexOf(key) + 2).padStart(2, '0');
  const openSpecies = (id: string) => router.push({ pathname: '/species/[id]', params: { id } });

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.photos}>
        {photos.map((photo, index) => (
          <View key={`${photo.uri}-${index}`} style={[styles.photoCell, index > 0 && styles.photoRuled]}>
            <Image source={{ uri: photo.uri }} style={[styles.photo, { aspectRatio: photos.length === 1 ? 1.5 : 1 }]} accessibilityLabel={`${photoLabels[index]} photo`} />
            <Label style={styles.photoLabel}>{`0${index + 1} ${photoLabels[index]}`}</Label>
          </View>
        ))}
      </View>
      <Rule />

      <View style={{ paddingHorizontal: pad, paddingTop: 18, paddingBottom: 26 }}>
        <View style={styles.resultLabel}>
          {danger && <Marker />}
          <Label>{`01 — Result · ${formatDate(createdAt)}`}</Label>
        </View>
        <Display size={Math.round(displaySize(width) * 0.8)} style={styles.verdict}>{verdictTitle(decision.kind)}</Display>
        {decision.kind !== 'notDetected' && <ItemTitle style={danger ? styles.dangerText : undefined}>Do not eat.</ItemTitle>}
        <Lead style={styles.reason}>{decision.reason}</Lead>
        {note && <Meta style={styles.note}>{note}</Meta>}
      </View>

      {hasMatch && (
        <Section index={number('match')} title={decision.species ? 'Possible species' : 'Possible genus'}>
          {decision.species ? (
            <RowLink accessibilityLabel={`Species information for ${decision.species.scientificName}`} onPress={() => openSpecies(decision.species!.id)}>
              <ItemTitle style={styles.scientific}>{decision.species.scientificName}</ItemTitle>
              {decision.species.commonName && <Meta>{decision.species.commonName}</Meta>}
              <Label style={styles.rowHint}>Species information</Label>
            </RowLink>
          ) : (
            <View style={styles.genusBlock}>
              <ItemTitle style={styles.scientific}>{decision.genus!.name}</ItemTitle>
              <Meta>The species could not be told apart from these photos. Open a close match below for details.</Meta>
            </View>
          )}
          <Rule />
          {decision.speciesConfidence !== undefined && <ScoreRow label="Species match score" value={decision.speciesConfidence} />}
          {decision.genus && <ScoreRow label={`Genus ${decision.genus.name}`} value={decision.genus.confidence} />}
          <Meta style={styles.scoreNote}>Scores are not the chance that a match is correct and never a poison probability.</Meta>
        </Section>
      )}

      {hasWarning && (
        <Section index={number('warning')} title="Warning" accent>
          {decision.species?.toxicity === 'poisonous' && (
            <View style={styles.warningItem}>
              <Label style={styles.dangerText}>Documented poisonous species</Label>
              <Body>{decision.species.scientificName} is documented as poisonous.</Body>
              {decision.species.toxicitySource && <Meta style={styles.source}>Source: {decision.species.toxicitySource}</Meta>}
            </View>
          )}
          {decision.warning && (
            <View style={styles.warningItem}>
              <Label style={styles.dangerText}>Toxic genus</Label>
              <Body>{decision.warning.genus} includes species containing {decision.warning.toxin}.</Body>
              <Meta style={styles.source}>Source: {decision.warning.source}</Meta>
            </View>
          )}
        </Section>
      )}

      {hasAlternatives && (
        <Section index={number('alternatives')} title="Closest matches">
          {decision.alternatives!.map((match) => (
            <RowLink key={match.id} accessibilityLabel={`Species information for ${match.scientificName}, ${percentage(match.confidence)}`} onPress={() => openSpecies(match.id)}>
              <View style={styles.matchRow}>
                <View style={styles.matchName}>
                  <Body style={styles.scientificBody}>{match.scientificName}</Body>
                  {match.commonName && <Meta>{match.commonName}</Meta>}
                </View>
                <Label>{percentage(match.confidence)}</Label>
              </View>
            </RowLink>
          ))}
          <Rule />
          <Meta style={styles.scoreNote}>Compare with a field guide or a local expert. Look-alikes can be deadly.</Meta>
        </Section>
      )}

      <Section index={number('model')} title="Model" surface>
        <Label>{decision.modelName}</Label>
        <Body style={styles.modelText}>{decision.modelDetails}</Body>
      </Section>

      <Section index={number('safety')} title="Safety" inverse>
        <ItemTitle inverse>Never eat a wild mushroom based on a photo or a score.</ItemTitle>
        <Body inverse style={styles.modelText}>If one has been eaten and poisoning is possible, get emergency medical advice immediately.</Body>
      </Section>

      <Rule />
      <View style={[styles.actions, { paddingHorizontal: pad }]}>{actions}</View>
    </ScrollView>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.scoreRow}>
      <Body>{label}</Body>
      <Label>{percentage(value)}</Label>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28 },
  photos: { flexDirection: 'row' },
  photoCell: { flex: 1 },
  photoRuled: { borderLeftWidth: rule, borderColor: colors.ink },
  photo: { width: '100%', backgroundColor: colors.surface },
  photoLabel: { paddingHorizontal: 8, paddingVertical: 8 },
  resultLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  verdict: { marginTop: 16, marginBottom: 10 },
  dangerText: { color: colors.accent },
  reason: { marginTop: 10 },
  note: { marginTop: 12 },
  scientific: { fontFamily: fonts.displayItalic },
  scientificBody: { fontFamily: fonts.italic },
  rowHint: { marginTop: 8 },
  genusBlock: { borderTopWidth: rule, borderColor: colors.ink, paddingVertical: 14, gap: 6 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  scoreNote: { marginTop: 10 },
  warningItem: { gap: 6, marginBottom: 14 },
  source: { marginTop: 2 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  matchName: { flex: 1 },
  modelText: { marginTop: 8 },
  actions: { gap: 10, paddingTop: 20 },
});
