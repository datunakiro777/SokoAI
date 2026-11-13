import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { classification, commonName, familyName, isSpeciesIndex, scientificName } from '../../lib/fungiCatalog';
import { articleFor, safetyFor, type Article } from '../../lib/fungiInfo';
import { Body, Button, Display, Label, Lead, Meta, Rule, Section, TextLink, TopBar } from '../../ui/components';
import { colors, displaySize, fonts, gutter, rule } from '../../ui/theme';

export default function SpeciesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const index = Number(id);
  const { width } = useWindowDimensions();
  const pad = gutter(width);
  const valid = isSpeciesIndex(index);
  const [article, setArticle] = useState<Article | null | undefined>(undefined);

  useEffect(() => {
    if (!valid) return;
    articleFor(index).then((found) => setArticle(found ?? null), () => setArticle(null));
  }, [index, valid]);

  if (!valid) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TopBar title="Species" onBack={() => router.back()} />
        <View style={styles.missing}><Body>This species is not in the catalog.</Body></View>
      </SafeAreaView>
    );
  }

  const name = scientificName(index);
  const common = commonName(index);
  const safety = safetyFor(index);
  const flagged = !!(safety.documented || safety.genus);
  const genusText = article?.scope === 'genus' ? article.title : undefined;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title={`Species · ${familyName(index) || 'Fungi'}`} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={{ paddingHorizontal: pad, paddingTop: 18, paddingBottom: 26 }}>
          <Label>01 — Species information</Label>
          <Display
            size={Math.round(displaySize(width) * 0.75)}
            style={styles.name}
            numberOfLines={3}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
          >
            {name}
          </Display>
          {common ? <Lead>{common}</Lead> : <Meta>No common name in the catalog.</Meta>}
        </View>

        <Section index="02" title="Safety" accent={flagged}>
          {safety.documented && (
            <View style={styles.flag}>
              <Label style={styles.danger}>Documented poisonous species</Label>
              <Body>{name} is documented as poisonous. Do not eat.</Body>
              <Meta>Source: {safety.documented.source}</Meta>
            </View>
          )}
          {safety.genus && (
            <View style={styles.flag}>
              <Label style={styles.danger}>Toxic genus</Label>
              <Body>{safety.genus.genus} includes species containing {safety.genus.toxin}.</Body>
              <Meta>Source: {safety.genus.source}</Meta>
            </View>
          )}
          {!flagged && (
            <Body>SokoAI has no toxicity record for this species. That does not mean it is safe to eat: many poisonous mushrooms have no record here.</Body>
          )}
        </Section>

        <Section index="03" title={article?.scope === 'genus' ? 'About the genus' : 'About'}>
          {article === undefined ? (
            <ActivityIndicator color={colors.ink} style={styles.loading} />
          ) : article === null ? (
            <Body>No description is bundled for this species or its genus.</Body>
          ) : (
            <>
              {genusText && <Label style={styles.scope}>{`No article for this species. About ${genusText}:`}</Label>}
              <Body>{article.text}</Body>
              <Meta style={styles.attribution}>{`From Wikipedia, “${article.title}”. Text CC BY-SA. ${article.source}.`}</Meta>
              <TextLink label="Read the full article online" onPress={() => { Linking.openURL(article.url).catch(() => undefined); }} />
            </>
          )}
        </Section>

        <Section index="04" title="Classification" surface>
          {classification(index).map(({ rank, name: taxon }, position) => (
            <View key={rank} style={[styles.rankRow, position > 0 && styles.rankRuled]}>
              <Label style={styles.rank}>{rank}</Label>
              <Body style={[styles.taxon, (rank === 'Genus' || rank === 'Species') && styles.italic]}>{taxon || 'Not recorded'}</Body>
            </View>
          ))}
        </Section>

        <Rule />
        <View style={[styles.actions, { paddingHorizontal: pad }]}>
          <Button label="Back" trailing="←" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  scroll: { paddingBottom: 28 },
  missing: { padding: 20 },
  name: { fontFamily: fonts.displayItalic, marginTop: 16, marginBottom: 12 },
  flag: { gap: 6, marginBottom: 14 },
  danger: { color: colors.accent },
  loading: { alignSelf: 'flex-start' },
  scope: { marginBottom: 10 },
  attribution: { marginTop: 14, marginBottom: 10 },
  rankRow: { flexDirection: 'row', paddingVertical: 10, gap: 12 },
  rankRuled: { borderTopWidth: rule, borderColor: colors.ink },
  rank: { width: 84, paddingTop: 3 },
  taxon: { flex: 1 },
  italic: { fontFamily: fonts.italic },
  actions: { paddingTop: 20 },
});
