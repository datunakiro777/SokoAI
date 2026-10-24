import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import type { Decision } from './decision';
import { decideFungi, type FungiView } from './fungiDecision';
import {
  FUNGI_IMAGE_SIZE, FUNGI_MODEL_BYTES, FUNGI_MODEL_NAME, FUNGI_MODEL_PARTS, FUNGI_MODEL_SHA256, FUNGI_SPECIES_COUNT,
} from './fungiModel';
import type { TfliteModel } from 'react-native-fast-tflite';

export type Photo = { uri: string; width: number; height: number };

export const MAX_PHOTOS = 3;

let modelPromise: Promise<TfliteModel> | null = null;

// Named after the model hash so a model from an older app version is never reused.
const MODEL_FILE_NAME = `${FUNGI_MODEL_NAME}-${FUNGI_MODEL_SHA256.slice(0, 12)}.tflite`;

function deleteOldModels() {
  for (const entry of Paths.document.list()) {
    if (entry instanceof File && entry.name.startsWith(FUNGI_MODEL_NAME) && entry.name !== MODEL_FILE_NAME) {
      try { entry.delete(); } catch { /* Retried on the next launch. */ }
    }
  }
}

async function loadModel(): Promise<TfliteModel> {
  // This import must remain lazy: Expo Go does not contain the native TFLite module.
  const { loadTensorflowModel } = await import('react-native-fast-tflite');
  // The model ships in parts (GitHub limits file size). On first use the native
  // loader joins them into one file in app storage, then memory-maps that file.
  deleteOldModels();
  const model = new File(Paths.document, MODEL_FILE_NAME);
  let parts: File[] = [];
  let url = model.uri;
  if (!model.exists || model.size !== FUNGI_MODEL_BYTES) {
    const assets = await Asset.loadAsync(FUNGI_MODEL_PARTS);
    if (assets.some((asset) => !asset.localUri)) throw new Error('The offline model files could not be prepared.');
    parts = assets.map((asset) => new File(asset.localUri!));
    url = [model.uri, ...parts.map((part) => part.uri)].join('|');
  }
  const loaded = await loadTensorflowModel({ url }, []);
  // The joined model is kept; the copied parts are no longer needed.
  for (const part of parts) {
    try { part.delete(); } catch { /* Cache files are cleaned up by the OS anyway. */ }
  }
  const input = loaded.inputs[0];
  const output = loaded.outputs[0];
  if (loaded.inputs.length !== 1 || input.dataType !== 'float32'
    || input.shape.join(',') !== `1,${FUNGI_IMAGE_SIZE},${FUNGI_IMAGE_SIZE},3`
    || loaded.outputs.length !== 1 || output.dataType !== 'float32'
    || output.shape.join(',') !== `1,${FUNGI_SPECIES_COUNT}`) {
    throw new Error('The fungus model does not match its species catalog.');
  }
  return loaded;
}

/** Loads the model once; later calls reuse it. Safe to call early to warm up. */
export function prepareModel(): Promise<TfliteModel> {
  if (Constants.appOwnership === 'expo') {
    return Promise.reject(new Error('The offline fungus model needs a SokoAI development build. Expo Go cannot run its native AI module.'));
  }
  if (!modelPromise) {
    modelPromise = loadModel().catch((error) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

async function photoTensor(photo: Photo): Promise<{ data: Float32Array; qualityPass: boolean }> {
  const side = Math.min(photo.width, photo.height);
  const image = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  image.crop({
    originX: Math.floor((photo.width - side) / 2),
    originY: Math.floor((photo.height - side) / 2),
    width: side,
    height: side,
  });
  image.resize({ width: FUNGI_IMAGE_SIZE, height: FUNGI_IMAGE_SIZE });
  const rendered = await image.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.95 });
  if (!saved.base64) throw new Error('Image preprocessing failed.');
  const decoded = jpeg.decode(toByteArray(saved.base64), { useTArray: true });
  if (decoded.width !== FUNGI_IMAGE_SIZE || decoded.height !== FUNGI_IMAGE_SIZE) {
    throw new Error('Unexpected image dimensions.');
  }
  const pixels = FUNGI_IMAGE_SIZE * FUNGI_IMAGE_SIZE;
  const data = new Float32Array(pixels * 3);
  let luminanceSum = 0;
  let luminanceSquares = 0;
  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    // The model takes RGB values in [0, 255], NHWC, and normalizes internally.
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    luminanceSum += luminance;
    luminanceSquares += luminance * luminance;
  }
  const brightness = luminanceSum / pixels;
  const variance = luminanceSquares / pixels - brightness * brightness;
  return { data, qualityPass: brightness >= 0.12 && brightness <= 0.88 && variance >= 0.008 };
}

export async function analyzePhotos(photos: Photo[]): Promise<Decision> {
  if (photos.length < 1 || photos.length > MAX_PHOTOS) throw new Error(`Take between 1 and ${MAX_PHOTOS} photos.`);
  const model = await prepareModel();
  const views: FungiView[] = [];
  for (const photo of photos) {
    const { data, qualityPass } = await photoTensor(photo);
    const outputs = await model.run([data.buffer as ArrayBuffer]);
    if (outputs.length !== 1 || outputs[0].byteLength !== FUNGI_SPECIES_COUNT * 4) {
      throw new Error('The fungus model returned an unexpected result.');
    }
    // Copy: the native output buffer is reused by the next run.
    views.push({ similarities: new Float32Array(outputs[0].slice(0)), qualityPass });
  }
  return decideFungi(views);
}
