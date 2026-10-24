import { useRef, useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyzePhotos } from '../lib/inference';
import { useScan } from '../state/ScanContext';
import { colors } from '../ui/theme';

const guides = [
  { title: 'Photograph the cap', subtitle: 'Center the top and show its outer edge.' },
  { title: 'Show the underside', subtitle: 'Capture gills, pores, or ridges in clear light.' },
  { title: 'Show stem and base', subtitle: 'Include the whole stem and where it meets the ground.' },
];

export default function CaptureScreen() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const { photos, setPhotos, setResult, setAnalysisError, inRegion } = useScan();
  const step = Math.min(photos.length, 2);

  async function capture() {
    if (!ready || busy || !camera.current) return;
    setBusy(true);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.92, skipProcessing: false });
      if (!photo) throw new Error('The camera did not return a photo.');
      const next = [...photos, { uri: photo.uri, width: photo.width, height: photo.height }];
      setPhotos(next);
      if (next.length === 3) {
        const decision = await analyzePhotos(next, inRegion);
        setResult(decision);
        setAnalysisError(null);
        router.replace('/result');
      }
    } catch (error) {
      // Drop the last photo so the next shutter press retakes it instead of adding a fourth.
      if (photos.length === 2) setPhotos(photos);
      Alert.alert('Could not analyze photos', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!permission) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.forest} /></SafeAreaView>;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>Take three guided photos to identify a mushroom offline. Photos stay on your phone.</Text>
        <Pressable style={styles.permissionButton} onPress={requestPermission}><Text style={styles.permissionButtonText}>Allow camera</Text></Pressable>
        <Pressable onPress={() => router.back()}><Text style={styles.backText}>Go back</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onCameraReady={() => setReady(true)} onMountError={(event) => Alert.alert('Camera error', event.message)} />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.topRow}>
          <Pressable style={styles.roundButton} onPress={() => router.back()}><Text style={styles.topIcon}>‹</Text></Pressable>
          <Text style={styles.stepText}>PHOTO {Math.min(photos.length + 1, 3)} OF 3</Text>
          <Pressable style={styles.roundButton} onPress={() => setTorch(!torch)}><Text style={styles.topIcon}>{torch ? '☀' : 'ϟ'}</Text></Pressable>
        </View>
        <View style={styles.guideBox}>
          <View style={styles.cornerTL} /><View style={styles.cornerTR} /><View style={styles.cornerBL} /><View style={styles.cornerBR} />
          <Text style={styles.guideEmoji}>🍄</Text>
          <Text style={styles.guideHint}>Keep one mushroom inside the frame</Text>
        </View>
        <View style={styles.bottomPanel}>
          <View style={styles.progressRow}>
            {guides.map((guide, index) => (
              <View key={guide.title} style={[styles.progressItem, index <= photos.length && styles.progressActive]} />
            ))}
          </View>
          <Text style={styles.captureTitle}>{guides[step].title}</Text>
          <Text style={styles.captureSubtitle}>{guides[step].subtitle}</Text>
          <View style={styles.controls}>
            <View style={styles.thumbnail}>{photos.length > 0 && <Image source={{ uri: photos[photos.length - 1].uri }} style={styles.thumbnailImage} />}</View>
            <Pressable style={styles.shutterOuter} onPress={capture} disabled={!ready || busy}>
              {busy ? <ActivityIndicator color={colors.forest} /> : <View style={styles.shutterInner} />}
            </Pressable>
            <Pressable style={styles.retake} onPress={() => setPhotos(photos.slice(0, -1))} disabled={!photos.length || busy}>
              <Text style={styles.retakeText}>Retake</Text>
            </Pressable>
          </View>
          <Text style={styles.captureNote}>A photo result cannot prove a mushroom is safe to eat.</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const cornerBase = { width: 27, height: 27, position: 'absolute' as const, borderColor: '#FFFFFF', borderWidth: 3 };
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#151D18' },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.cream },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 23, paddingTop: 12 },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#16271F99', alignItems: 'center', justifyContent: 'center' },
  topIcon: { fontSize: 28, color: 'white', lineHeight: 33 },
  stepText: { color: 'white', fontWeight: '800', fontSize: 12, letterSpacing: 2, backgroundColor: '#16271F99', paddingHorizontal: 15, paddingVertical: 11, borderRadius: 18 },
  guideBox: { width: '76%', aspectRatio: 0.9, alignSelf: 'center', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  cornerTL: { ...cornerBase, top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 9 },
  cornerTR: { ...cornerBase, top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 9 },
  cornerBL: { ...cornerBase, bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 9 },
  cornerBR: { ...cornerBase, bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 9 },
  guideEmoji: { fontSize: 70, opacity: 0.28 },
  guideHint: { color: 'white', fontSize: 12, fontWeight: '700', marginTop: 20, backgroundColor: '#16271F99', padding: 10, borderRadius: 15 },
  bottomPanel: { backgroundColor: colors.cream, borderTopLeftRadius: 29, borderTopRightRadius: 29, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 13 },
  progressRow: { flexDirection: 'row', gap: 6, marginBottom: 17 },
  progressItem: { height: 5, flex: 1, backgroundColor: '#D6DDD3', borderRadius: 4 },
  progressActive: { backgroundColor: colors.sage },
  captureTitle: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  captureSubtitle: { color: colors.muted, fontSize: 14, marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 26, marginBottom: 12 },
  thumbnail: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#E7E9DE', overflow: 'hidden' },
  thumbnailImage: { width: 50, height: 50 },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.forest },
  retake: { width: 50 },
  retakeText: { color: colors.forest, fontWeight: '700', fontSize: 12, textAlign: 'center' },
  captureNote: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  permission: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: 30 },
  permissionEmoji: { fontSize: 62 },
  permissionTitle: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 16 },
  permissionText: { textAlign: 'center', color: colors.muted, lineHeight: 22, marginTop: 10 },
  permissionButton: { backgroundColor: colors.forest, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 16, marginTop: 25 },
  permissionButtonText: { color: 'white', fontWeight: '800' },
  backText: { color: colors.forest, fontWeight: '700', marginTop: 20 },
});
