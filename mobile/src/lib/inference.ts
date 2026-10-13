import { Asset } from 'expo-asset';
import Constants from 'expo-constants';
import * as ImageManipulator from 'expo-image-manipulator';
import { toByteArray } from 'base64-js';
import jpeg from 'jpeg-js';
import { decide, DEFAULT_DECISION_CONFIG, type Decision, type ViewScore } from './decision';
import { modelAsset, modelMetadata } from './modelBundle';
import { decidePretrained, type PretrainedView } from './pretrainedDecision';
import { MODEL_CLASS_COUNT } from './pretrainedCatalog';
import type { TfliteModel } from 'react-native-fast-tflite';

export type Photo = { uri: string; width: number; height: number };

const IMAGE_SIZE = 224;
const PRETRAINED_IMAGE_SIZE = 299;
const RGB_MEAN = [0.485, 0.456, 0.406];
const RGB_STD = [0.229, 0.224, 0.225];

const sigmoid = (value: number) => 1 / (1 + Math.exp(-value));

function softmax(values: number[], temperature: number): number[] {
  const scaled = values.map((value) => value / temperature);
  const maximum = Math.max(...scaled);
  const exponents = scaled.map((value) => Math.exp(value - maximum));
  const sum = exponents.reduce((total, value) => total + value, 0);
  return exponents.map((value) => value / sum);
}

async function photoTensor(photo: Photo, imageSize = IMAGE_SIZE): Promise<{ data: Float32Array; qualityPass: boolean }> {
  const side = Math.min(photo.width, photo.height);
  const image = ImageManipulator.ImageManipulator.manipulate(photo.uri);
  image.crop({
    originX: Math.floor((photo.width - side) / 2),
    originY: Math.floor((photo.height - side) / 2),
    width: side,
    height: side,
  });
  image.resize({ width: imageSize, height: imageSize });
  const rendered = await image.renderAsync();
  const saved = await rendered.saveAsync({ format: ImageManipulator.SaveFormat.JPEG, base64: true, compress: 0.95 });
  if (!saved.base64) throw new Error('Image preprocessing failed.');

  const decoded = jpeg.decode(toByteArray(saved.base64), { useTArray: true });
  if (decoded.width !== imageSize || decoded.height !== imageSize) {
    throw new Error('Unexpected image dimensions.');
  }
  const pixels = imageSize * imageSize;
  const tensor = new Float32Array(pixels * 3);
  let luminanceSum = 0;
  let luminanceSquares = 0;
  for (let i = 0; i < pixels; i += 1) {
    const offset = i * 4;
    const r = decoded.data[offset] / 255;
    const g = decoded.data[offset + 1] / 255;
    const b = decoded.data[offset + 2] / 255;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luminanceSum += luminance;
    luminanceSquares += luminance * luminance;
    tensor[i] = (r - RGB_MEAN[0]) / RGB_STD[0];
    tensor[pixels + i] = (g - RGB_MEAN[1]) / RGB_STD[1];
    tensor[pixels * 2 + i] = (b - RGB_MEAN[2]) / RGB_STD[2];
  }
  const brightness = luminanceSum / pixels;
  const variance = luminanceSquares / pixels - brightness * brightness;
  // This gate only withholds the edible verdict; it never creates one.
  const qualityPass = brightness >= 0.12 && brightness <= 0.88 && variance >= 0.008;
  return { data: tensor, qualityPass };
}

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

export async function analyzePhotos(photos: Photo[], inRegion: boolean): Promise<Decision> {
  if (photos.length !== 3) throw new Error('Three photos are required.');
  if (!modelAsset || !modelMetadata.species.length) {
    if (Constants.appOwnership === 'expo') {
      throw new Error('The offline pretrained model needs a SokoAI development build. Expo Go cannot run its native AI module.');
    }
    return analyzePretrained(photos);
  }

  const asset = await Asset.fromModule(modelAsset).downloadAsync();
  if (!asset.localUri) throw new Error('The offline model is missing.');
  const ort = await import('onnxruntime-react-native');
  const session = await ort.InferenceSession.create(asset.localUri);
  const views: ViewScore[] = [];

  for (const photo of photos) {
    const { data, qualityPass } = await photoTensor(photo);
    const output = await session.run({ image: new ort.Tensor('float32', data, [1, 3, IMAGE_SIZE, IMAGE_SIZE]) });
    const presenceLogit = Number(output.presence_logit?.data[0]);
    const toxicLogit = Number(output.toxic_logit?.data[0]);
    const speciesLogits = Array.from(output.species_logits?.data ?? [], Number);
    if (!Number.isFinite(presenceLogit) || !Number.isFinite(toxicLogit)
      || speciesLogits.some((logit) => !Number.isFinite(logit))
      || speciesLogits.length !== modelMetadata.species.length) {
      throw new Error('The model output does not match its catalog.');
    }
    views.push({
      presence: sigmoid(presenceLogit / modelMetadata.presenceTemperature),
      toxic: sigmoid(toxicLogit / modelMetadata.toxicTemperature),
      species: softmax(speciesLogits, modelMetadata.speciesTemperature),
      qualityPass,
    });
  }

  return decide(views, modelMetadata.species, {
    ...DEFAULT_DECISION_CONFIG,
    releaseGatePassed: modelMetadata.releaseGatePassed,
  }, inRegion);
}
