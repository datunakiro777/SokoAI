import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearHistory, loadHistory, type HistoryEntry } from '../../lib/history';
import { Body, Button, Display, Label, Lead, Marker, Meta, Rule, RowLink, TopBar } from '../../ui/components';
import { colors, displaySize, fonts, gutter, rule, type } from '../../ui/theme';
import { formatDate, matchSummary, verdictTitle } from '../../ui/verdict';

export default function HistoryScreen() {
  const { width } = useWindowDimensions();
  const pad = gutter(width);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useFocusEffect(useCallback(() => {
    loadHistory().then(setEntries, () => setEntries([]));
  }, []));

  function confirmClear() {
    Alert.alert('Delete all checks?', 'This removes every saved check and its photos from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => { clearHistory().then(() => setEntries([])); } },
    ]);
  }

  const header = (
    <View>
      <View style={{ paddingHorizontal: pad, paddingTop: 18, paddingBottom: 24 }}>
        <Label>History · on this phone</Label>
        <Display size={Math.round(displaySize(width) * 0.8)} style={styles.title}>Past checks.</Display>
        <Lead>{entries === null ? 'Loading…' : entries.length ? `${entries.length} check${entries.length === 1 ? '' : 's'} saved, newest first.` : 'No checks yet. Each identification is saved here with its photos.'}</Lead>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar
        title="History"
        onBack={() => router.back()}
        right={entries?.length ? <ClearButton onPress={confirmClear} /> : undefined}
      />
      {entries === null ? (
        <View style={styles.loading}><ActivityIndicator color={colors.ink} /></View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(entry) => entry.id}
          ListHeaderComponent={header}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: pad }}>
              <RowLink
                accessibilityLabel={`${verdictTitle(item.decision.kind)} ${matchSummary(item.decision)}, ${formatDate(item.createdAt)}`}
                onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
              >
                <View style={styles.entry}>
                  <Image source={{ uri: item.photos[0]?.uri }} style={styles.thumb} accessibilityIgnoresInvertColors />
                  <View style={styles.entryText}>
                    <View style={styles.entryLabel}>
                      {item.decision.kind === 'notSafe' && <Marker />}
                      <Label>{formatDate(item.createdAt)}</Label>
                    </View>
                    <Text style={[styles.entryTitle, item.decision.kind === 'notSafe' && styles.danger]}>{verdictTitle(item.decision.kind)}</Text>
                    <Meta numberOfLines={2}>{matchSummary(item.decision)}</Meta>
                  </View>
                </View>
              </RowLink>
            </View>
          )}
          ListFooterComponent={
            <View style={{ paddingHorizontal: pad }}>
              {entries.length > 0 && <Rule />}
              <View style={styles.footer}>
                {entries.length === 0 && <Body>Results stay on this phone. Deleting the app deletes them.</Body>}
                <Button label="Start identification" onPress={() => router.replace('/capture')} />
              </View>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ClearButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Delete all checks" onPress={onPress} hitSlop={6}>
      {({ pressed }) => (
        <View style={[styles.clear, pressed && styles.clearPressed]}>
          <Text style={[styles.clearText, pressed && { color: colors.ground }]}>Clear</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  loading: { flex: 1, justifyContent: 'center' },
  list: { paddingBottom: 28 },
  title: { marginTop: 16, marginBottom: 14 },
  entry: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  thumb: { width: 72, height: 72, backgroundColor: colors.surface },
  entryText: { flex: 1, gap: 3 },
  entryLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  entryTitle: { fontFamily: fonts.strong, fontSize: 20, lineHeight: 24, color: colors.ink },
  danger: { color: colors.accent },
  footer: { gap: 14, paddingTop: 20 },
  clear: { height: 44, paddingHorizontal: 14, borderWidth: rule, borderColor: colors.ink, justifyContent: 'center', backgroundColor: colors.ground },
  clearPressed: { backgroundColor: colors.ink },
  clearText: { fontFamily: fonts.strong, fontSize: type.metadata, color: colors.ink },
});
