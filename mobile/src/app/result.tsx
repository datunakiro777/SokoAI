import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useScan } from '../state/ScanContext';
import { Body, Button, TopBar } from '../ui/components';
import { ResultView } from '../ui/ResultView';
import { colors } from '../ui/theme';

export default function ResultScreen() {
  const { result, reset } = useScan();

  function photographAnother() {
    reset();
    router.replace('/capture');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <TopBar title="Assessment" onBack={() => router.replace('/')} backLabel="Home" />
      {result ? (
        <ResultView
          decision={result.decision}
          photos={result.photos}
          createdAt={result.createdAt}
          note={result.historyId ? 'Saved to history.' : 'This check could not be saved to history.'}
          actions={<>
            <Button label="Photograph another mushroom" onPress={photographAnother} />
            <Button label="History" variant="secondary" onPress={() => router.push('/history')} />
          </>}
        />
      ) : (
        <View style={styles.empty}>
          <Body>No result to show.</Body>
          <Button label="Start identification" onPress={photographAnother} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  empty: { padding: 20, gap: 16 },
});
