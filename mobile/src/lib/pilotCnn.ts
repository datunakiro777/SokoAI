/** Small PyTorch CNN interpreter for the Expo Go pilot preview.
 *  This model is not validated for eating decisions.
 */

export type WeightSlice = { offset: number; length: number };
export type PilotLayerSpec = {
  inputChannels: number;
  outputChannels: number;
  conv: WeightSlice;
  gamma: WeightSlice;
  beta: WeightSlice;
};
export type PilotModelSpec = {
  layers: PilotLayerSpec[];
  heads: Record<'presence' | 'toxic' | 'species', { weight: WeightSlice; bias: WeightSlice }>;
  floatCount: number;
};

export type PilotLogits = { presence: number; toxic: number; species: number[] };

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function normaliseAndActivate(
  values: Float32Array,
  width: number,
  channels: number,
  weights: Float32Array,
  gamma: WeightSlice,
  beta: WeightSlice,
) {
  const pixels = width * width;
  const channelsPerGroup = channels / 8;
  const groupSize = channelsPerGroup * pixels;
  for (let group = 0; group < 8; group += 1) {
    const start = group * groupSize;
    let sum = 0;
    for (let i = start; i < start + groupSize; i += 1) sum += values[i];
    const mean = sum / groupSize;
    let squared = 0;
    for (let i = start; i < start + groupSize; i += 1) {
      const delta = values[i] - mean;
      squared += delta * delta;
    }
    const inverseStd = 1 / Math.sqrt(squared / groupSize + 1e-5);
    for (let channel = group * channelsPerGroup; channel < (group + 1) * channelsPerGroup; channel += 1) {
      const scale = weights[gamma.offset + channel];
      const shift = weights[beta.offset + channel];
      const channelStart = channel * pixels;
      for (let i = channelStart; i < channelStart + pixels; i += 1) {
        const value = (values[i] - mean) * inverseStd * scale + shift;
        values[i] = value / (1 + Math.exp(-value));
      }
    }
  }
}

async function convBlock(
  input: Float32Array,
  width: number,
  layer: PilotLayerSpec,
  weights: Float32Array,
  yieldToUi: () => Promise<void>,
): Promise<{ values: Float32Array; width: number }> {
  const outWidth = Math.ceil(width / 2);
  const outPixels = outWidth * outWidth;
  const inputPixels = width * width;
  const output = new Float32Array(layer.outputChannels * outPixels);
  const kernelPerChannel = layer.inputChannels * 9;

  for (let outChannel = 0; outChannel < layer.outputChannels; outChannel += 1) {
    const outputStart = outChannel * outPixels;
    const kernelStart = layer.conv.offset + outChannel * kernelPerChannel;
    for (let outY = 0; outY < outWidth; outY += 1) {
      const inY = outY * 2 - 1;
      for (let outX = 0; outX < outWidth; outX += 1) {
        const inX = outX * 2 - 1;
        let sum = 0;
        for (let inChannel = 0; inChannel < layer.inputChannels; inChannel += 1) {
          const imageStart = inChannel * inputPixels;
          const channelKernel = kernelStart + inChannel * 9;
          for (let ky = 0; ky < 3; ky += 1) {
            const y = inY + ky;
            if (y < 0 || y >= width) continue;
            const row = imageStart + y * width;
            const kernelRow = channelKernel + ky * 3;
            for (let kx = 0; kx < 3; kx += 1) {
              const x = inX + kx;
              if (x >= 0 && x < width) sum += input[row + x] * weights[kernelRow + kx];
            }
          }
        }
        output[outputStart + outY * outWidth + outX] = sum;
      }
    }
    if (outChannel % 8 === 7) await yieldToUi();
  }

  normaliseAndActivate(output, outWidth, layer.outputChannels, weights, layer.gamma, layer.beta);
  return { values: output, width: outWidth };
}

function linear(features: Float32Array, weights: Float32Array, head: { weight: WeightSlice; bias: WeightSlice }) {
  const scores: number[] = [];
  for (let output = 0; output < head.bias.length; output += 1) {
    let sum = weights[head.bias.offset + output];
    for (let i = 0; i < features.length; i += 1) {
      sum += features[i] * weights[head.weight.offset + output * features.length + i];
    }
    scores.push(sum);
  }
  return scores;
}

export async function runPilotCnn(
  input: Float32Array,
  weights: Float32Array,
  spec: PilotModelSpec,
  side = 112,
  yieldToUi: () => Promise<void> = pause,
): Promise<PilotLogits> {
  if (input.length !== 3 * side * side || weights.length !== spec.floatCount) {
    throw new Error('Pilot model input or weights do not match the exported model.');
  }
  let values = input;
  let width = side;
  for (const layer of spec.layers) {
    ({ values, width } = await convBlock(values, width, layer, weights, yieldToUi));
  }
  const pixels = width * width;
  const features = new Float32Array(spec.layers[spec.layers.length - 1].outputChannels);
  for (let channel = 0; channel < features.length; channel += 1) {
    let sum = 0;
    for (let i = 0; i < pixels; i += 1) sum += values[channel * pixels + i];
    features[channel] = sum / pixels;
  }
  return {
    presence: linear(features, weights, spec.heads.presence)[0],
    toxic: linear(features, weights, spec.heads.toxic)[0],
    species: linear(features, weights, spec.heads.species),
  };
}
