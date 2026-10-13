import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import type { Decision } from './decision';
import { decidePretrained, type PretrainedView } from './pretrainedDecision';
import { MODEL_CLASS_COUNT } from './pretrainedCatalog';
import type { TfliteModel } from 'react-native-fast-tflite';

export type Photo = { uri: string; width: number; height: number };

const PRETRAINED_IMAGE_SIZE = 299;

let pretrainedModelPromise: Promise<TfliteModel> | null = null;

async function loadPretrainedModel(): Promise<TfliteModel> {
  if (!pretrainedModelPromise) {
    pretrainedModelPromise = (async () => {
      // This import must remain lazy: Expo Go does not contain the native TFLite module.
      const { loadTensorflowModel } = await import('react-native-fast-tflite');
      // Metro needs a static require to package this local model asset.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const model = await loadTensorflowModel(require('../../assets/inat-small-v25.01.15.tflite'), []);
      const input = model.inputs[0];
      const output = model.outputs[0];
      if (model.inputs.length !== 1 || input.dataType !== 'float32'
        || input.shape.join(',') !== `1,${PRETRAINED_IMAGE_SIZE},${PRETRAINED_IMAGE_SIZE},3`
        || model.outputs.length !== 1 || output.dataType !== 'float32'
        || output.shape.join(',') !== `1,${MODEL_CLASS_COUNT}`) {
        throw new Error('The pretrained model shape does not match its catalog.');
      }
      return model;
    })().catch((error) => {
      pretrainedModelPromise = null;
      throw error;
    });
  }
  return pretrainedModelPromise;
}

async function pretrainedPhotoTensor(photo: Photo): Promise<{ data: Float32Array; qualityPass: boolean }> {
  const side = Math.min(photo.width, photo.height);
  const image = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  image.crop({
    originX: Math.floor((photo.width - side) / 2),
    originY: Math.floor((photo.height - side) / 2),
    width: side,
    height: side,
  });
  image.resize({ width: PRETRAINED_IMAGE_SIZE, height: PRETRAINED_IMAGE_SIZE });
  const rendered = await image.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.95 });
  if (!saved.base64) throw new Error('Image preprocessing failed.');
  const decoded = jpeg.decode(toByteArray(saved.base64), { useTArray: true });
  if (decoded.width !== PRETRAINED_IMAGE_SIZE || decoded.height !== PRETRAINED_IMAGE_SIZE) {
    throw new Error('Unexpected image dimensions.');
  }
  const pixels = PRETRAINED_IMAGE_SIZE * PRETRAINED_IMAGE_SIZE;
  const data = new Float32Array(pixels * 3);
  let luminanceSum = 0;
  let luminanceSquares = 0;
  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    const r = decoded.data[offset];
    const g = decoded.data[offset + 1];
    const b = decoded.data[offset + 2];
    // The official v2 Android implementation feeds RGB floats in [0, 255], NHWC.
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

async function analyzePretrained(photos: Photo[]): Promise<Decision> {
  const model = await loadPretrainedModel();
  const views: PretrainedView[] = [];
  for (const photo of photos) {
    const { data, qualityPass } = await pretrainedPhotoTensor(photo);
    const outputs = await model.run([data.buffer as ArrayBuffer]);
    if (outputs.length !== 1 || outputs[0].byteLength !== MODEL_CLASS_COUNT * 4) {
      throw new Error('The pretrained model returned an unexpected result.');
    }
    views.push({ scores: Array.from(new Float32Array(outputs[0])), qualityPass });
  }
  return decidePretrained(views);
}

export async function analyzePhotos(photos: Photo[], _inRegion: boolean): Promise<Decision> {
  if (photos.length !== 3) throw new Error('Three photos are required.');
  if (Constants.appOwnership === 'expo') {
    throw new Error('The offline pretrained model needs a SokoAI development build. Expo Go cannot run its native AI module.');
  }
  return analyzePretrained(photos);
}
