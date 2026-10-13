import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { join } from 'node:path';
import { runPilotCnn } from './pilotCnn';
import { decidePilot } from './pilotDecision';
import type { Species, ViewScore } from './decision';

const bytes = readFileSync(join(process.cwd(), 'assets/pilot-weights.bin'));
const weights = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const bundleSource = readFileSync(join(process.cwd(), 'src/lib/pilotModelBundle.ts'), 'utf8');
const spec = JSON.parse(bundleSource.slice(bundleSource.lastIndexOf(' = ') + 3).replace(/;\s*$/, ''));
const species: Species[] = [{ id: 'a', scientificName: 'A', toxicity: 'edible' }, { id: 'b', scientificName: 'B', toxicity: 'poisonous' }];
const view = (scores: number[], presence = 0.99): ViewScore => ({ presence, toxic: 0, species: scores, qualityPass: true });

test('JavaScript CNN matches the PyTorch checkpoint on deterministic input', async () => {
  const input = Float32Array.from({ length: 3 * 32 * 32 }, (_, i) => Math.sin(i * 0.01));
  const result = await runPilotCnn(input, weights, spec, 32, async () => {});
  const expected = [4.032572746, -4.531879425, -3.526745558, -1.070760489, 4.869699955, -1.878492117];
  const actual = [result.presence, result.toxic, ...result.species];
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 0.002, `${index}: ${value} vs ${expected[index]}`));
});

test('pilot can suggest a species but never an edible verdict', () => {
  const result = decidePilot([view([0.96, 0.04]), view([0.93, 0.07]), view([0.91, 0.09])], species);
  assert.equal(result.kind, 'uncertain');
  assert.equal(result.pilot, true);
  assert.equal(result.species?.id, 'a');
});

test('pilot abstains when views disagree or a mushroom is absent', () => {
  assert.equal(decidePilot([view([0.9, 0.1]), view([0.1, 0.9]), view([0.9, 0.1])], species).kind, 'unknown');
  assert.equal(decidePilot([view([0.9, 0.1], 0.1), view([0.9, 0.1], 0.2), view([0.9, 0.1], 0.1)], species).kind, 'notDetected');
});
