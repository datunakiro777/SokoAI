import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveCheck } from '../lib/history';
import { MAX_PHOTOS, analyzePhotos, prepareModel, type Photo } from '../lib/inference';
import { useScan } from '../state/ScanContext';
import { Body, Button, Display, ItemTitle, Label, Rule } from '../ui/components';
import { colors, fonts, gutter, rule, type } from '../ui/theme';

const guides = [
  { title: 'Photograph the mushroom', subtitle: 'Cap and stem from the side, filling the frame.' },
  { title: 'Optional: the underside', subtitle: 'Gills, pores, or ridges help separate look-alikes.' },
  { title: 'Optional: the base', subtitle: 'Include where the stem meets the ground.' },
];

export default function CaptureScreen() {
  const camera = useRef<CameraView>(null);
  const { width } = useWindowDimensions();
  const pad = gutter(width);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const { photos, setPhotos, setResult } = useScan();
  const step = Math.min(photos.length, MAX_PHOTOS - 1);

  // Start loading the model while the user frames the first photo.
  useEffect(() => {
    prepareModel().then(() => setModelReady(true), () => { /* Reported when the user taps Identify. */ });
  }, []);

  async function identify(list: Photo[]) {
    setBusy(true);
    try {
      const decision = await analyzePhotos(list);
      setModelReady(true);
      const createdAt = new Date().toISOString();
      // A history failure must not hide the result; the result screen says it was not saved.
      const saved = await saveCheck(list, decision).catch(() => null);
      setResult(saved ? { ...saved, historyId: saved.id } : { decision, photos: list, createdAt });
      router.replace('/result');
    } catch (error) {
      // Drop the last photo of a full set so the next shutter press retakes it.
      if (list.length === MAX_PHOTOS) setPhotos(list.slice(0, -1));
      Alert.alert('Could not analyze photos', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (!ready || busy || !camera.current || photos.length >= MAX_PHOTOS) return;
    setBusy(true);
    let next: Photo[] | null = null;
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.92, skipProcessing: false });
      if (!photo) throw new Error('The camera did not return a photo.');
      next = [...photos, { uri: photo.uri, width: photo.width, height: photo.height }];
      setPhotos(next);
    } catch (error) {
      Alert.alert('Could not take photo', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
    if (next?.length === MAX_PHOTOS) await identify(next);
  }

  if (!permission) return <SafeAreaView style={styles.center}><ActivityIndicator color={colors.ink} /></SafeAreaView>;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.permission, { paddingHorizontal: pad }]} edges={['top', 'bottom']}>
        <Label>Camera</Label>
        <Display size={52} style={styles.permissionTitle}>Camera access needed.</Display>
        <Body>Take a photo to identify a mushroom offline. Photos stay on your phone.</Body>
        <View style={styles.permissionActions}>
          <Button label="Allow camera" onPress={requestPermission} />
          <Button label="Go back" variant="secondary" trailing="←" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  const status = busy
    ? (photos.length && !modelReady ? 'Loading offline model…' : photos.length ? 'Identifying…' : 'Taking photo…')
    : null;

  return (
    <View style={styles.root}>
      <CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onCameraReady={() => setReady(true)} onMountError={(event) => Alert.alert('Camera error', event.message)} />
      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={[styles.topRow, { paddingHorizontal: pad }]}>
          <OverlayButton label="←" accessibilityLabel="Back" onPress={() => router.back()} />
          <View style={styles.stepTag}>
            <Label inverse>{photos.length ? `Photo ${step + 1} · optional` : 'Photo 1 · required'}</Label>
          </View>
          <OverlayButton label={torch ? 'Light on' : 'Light'} accessibilityLabel={torch ? 'Turn light off' : 'Turn light on'} selected={torch} onPress={() => setTorch(!torch)} />
        </View>

        <View style={styles.frame} pointerEvents="none">
          <View style={styles.cornerTL} /><View style={styles.cornerTR} /><View style={styles.cornerBL} /><View style={styles.cornerBR} />
        </View>

        <View style={styles.panel}>
          <Rule />
          <View style={styles.slots} accessibilityLabel={`${photos.length} of ${MAX_PHOTOS} photos taken`}>
            {guides.map((guide, index) => {
              const taken = index < photos.length;
              return (
                <View key={guide.title} style={[styles.slot, index > 0 && styles.slotRuled, taken && styles.slotTaken]}>
                  <Label inverse={taken}>{`0${index + 1}`}</Label>
                  <Label inverse={taken} style={styles.slotState}>{taken ? 'Taken' : index === 0 ? 'Required' : 'Optional'}</Label>
                </View>
              );
            })}
          </View>
          <Rule />
          <View style={{ paddingHorizontal: pad, paddingTop: 16, paddingBottom: 12 }}>
            <ItemTitle>{guides[step].title}</ItemTitle>
            <Body style={styles.subtitle}>{guides[step].subtitle}</Body>
            <View style={styles.controls}>
              <View style={styles.thumbnail}>
                {photos.length > 0 && <Image source={{ uri: photos[photos.length - 1].uri }} style={styles.thumbnailImage} accessibilityLabel="Last photo taken" />}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Take photo"
                accessibilityState={{ disabled: !ready || busy || photos.length >= MAX_PHOTOS, busy }}
                onPress={capture}
                disabled={!ready || busy || photos.length >= MAX_PHOTOS}
              >
                {({ pressed }) => (
                  <View style={[styles.shutter, pressed && styles.shutterPressed]}>
                    {busy ? <ActivityIndicator color={colors.ground} /> : <View style={[styles.shutterInner, pressed && styles.shutterInnerPressed]} />}
                  </View>
                )}
              </Pressable>
              {photos.length > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retake last photo"
                  accessibilityState={{ disabled: busy }}
                  onPress={() => setPhotos(photos.slice(0, -1))}
                  disabled={busy}
                  hitSlop={8}
                >
                  {({ pressed }) => <Text style={[styles.retake, pressed && styles.retakePressed]}>Retake</Text>}
                </Pressable>
              ) : <View style={styles.retakeSpace} />}
            </View>
            {photos.length > 0 && (
              <Button
                label={status ?? `Identify with ${photos.length} photo${photos.length > 1 ? 's' : ''}`}
                onPress={() => identify(photos)}
                disabled={busy}
              />
            )}
            <Label style={styles.note}>A photo result cannot prove a mushroom is safe to eat.</Label>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function OverlayButton({ label, accessibilityLabel, onPress, selected }: { label: string; accessibilityLabel: string; onPress: () => void; selected?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ selected }} onPress={onPress} hitSlop={6}>
      {({ pressed }) => {
        const dark = selected ? !pressed : pressed;
        return (
          <View style={[styles.overlayButton, { backgroundColor: dark ? colors.ink : colors.ground }]}>
            <Text style={[styles.overlayButtonText, { color: dark ? colors.ground : colors.ink }]}>{label}</Text>
          </View>
        );
      }}
    </Pressable>
  );
}

const corner = { width: 28, height: 28, position: 'absolute' as const, borderColor: colors.ground, borderWidth: 3 };
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink },
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.ground },
  overlay: { flex: 1, justifyContent: 'space-between' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, gap: 10 },
  stepTag: { backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 12, flexShrink: 1 },
  overlayButton: { minWidth: 48, height: 44, paddingHorizontal: 12, borderWidth: rule, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  overlayButtonText: { fontFamily: fonts.strong, fontSize: type.metadata },
  frame: { width: '72%', aspectRatio: 0.9, alignSelf: 'center' },
  cornerTL: { ...corner, top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0 },
  cornerTR: { ...corner, top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0 },
  cornerBL: { ...corner, bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0 },
  cornerBR: { ...corner, bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0 },
  panel: { backgroundColor: colors.ground },
  slots: { flexDirection: 'row' },
  slot: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, gap: 2, backgroundColor: colors.ground },
  slotRuled: { borderLeftWidth: rule, borderColor: colors.ink },
  slotTaken: { backgroundColor: colors.ink },
  slotState: { fontFamily: fonts.regular, textTransform: 'none', letterSpacing: 0 },
  subtitle: { marginTop: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 18 },
  thumbnail: { width: 56, height: 56, borderWidth: rule, borderColor: colors.ink, backgroundColor: colors.surface, overflow: 'hidden' },
  thumbnailImage: { width: '100%', height: '100%' },
  shutter: { width: 76, height: 76, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  shutterPressed: { backgroundColor: colors.ground, borderWidth: rule, borderColor: colors.ink },
  shutterInner: { width: 52, height: 52, borderWidth: 3, borderColor: colors.ground },
  shutterInnerPressed: { borderColor: colors.ink },
  retake: { width: 56, fontFamily: fonts.strong, fontSize: type.metadata, color: colors.ink, textAlign: 'center', textDecorationLine: 'underline' },
  retakeSpace: { width: 56 },
  retakePressed: { color: colors.accent },
  note: { marginTop: 14, textTransform: 'none', letterSpacing: 0, fontFamily: fonts.regular },
  permission: { flex: 1, backgroundColor: colors.ground, justifyContent: 'center' },
  permissionTitle: { marginVertical: 18 },
  permissionActions: { marginTop: 28, gap: 10 },
});
