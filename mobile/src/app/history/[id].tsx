import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteCheck, loadCheck, type HistoryEntry } from '../../lib/history';
import { Body, Button, TopBar } from '../../ui/components';
import { ResultView } from '../../ui/ResultView';
import { colors } from '../../ui/theme';

export default function HistoryCheckScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<HistoryEntry | null | undefined>(undefined);

  useEffect(() => {
    loadCheck(String(id)).then((found) => setEntry(found ?? null), () => setEntry(null));
  }, [id]);

  function confirmDelete() {
    Alert.alert('Delete this check?', 'Its photos are removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { deleteCheck(String(id)).then(() => router.back()); } },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Saved check" onBack={() => router.back()} backLabel="History" />
      {entry === undefined ? (
        <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>
      ) : entry === null ? (
        <View style={styles.missing}>
          <Body>This check is no longer saved.</Body>
          <Button label="Back to history" variant="secondary" trailing="←" onPress={() => router.back()} />
        </View>
      ) : (
        <ResultView
          decision={entry.decision}
          photos={entry.photos}
          createdAt={entry.createdAt}
          actions={<>
            <Button label="Back to history" trailing="←" onPress={() => router.back()} />
            <Button label="Delete this check" variant="secondary" trailing="×" onPress={confirmDelete} />
          </>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  center: { flex: 1, justifyContent: 'center' },
  missing: { padding: 20, gap: 16 },
});
