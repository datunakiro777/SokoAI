import assert from 'node:assert/strict';
import test from 'node:test';
import { decidePretrained } from './pretrainedDecision';
import { MODEL_CLASS_COUNT } from './pretrainedCatalog';

function view(winner: number, score: number, qualityPass = true) {
  const scores = Array<number>(MODEL_CLASS_COUNT).fill(0);
  scores[winner] = score;
  scores[0] = 1 - score;
  return { scores, qualityPass };
}

test('a strong three-view poisonous species match warns but never claims a calibrated poison probability', () => {
  const decision = decidePretrained([view(53, 0.91), view(53, 0.89), view(53, 0.92)]);
  assert.equal(decision.kind, 'notSafe');
  assert.equal(decision.species?.scientificName, 'Amanita muscaria');
  assert.equal(decision.toxicProbability, undefined);
  assert.equal(decision.scoreCalibrated, false);
});

test('a strong non-poisonous-catalog match stays uncertain rather than safe', () => {
  const decision = decidePretrained([view(23, 0.91), view(23, 0.89), view(23, 0.92)]);
  assert.equal(decision.kind, 'uncertain');
  assert.equal(decision.species?.scientificName, 'Coprinus comatus');
});

test('three clear non-fungal classifications produce not detected', () => {
  assert.equal(decidePretrained([view(100, 0.99), view(100, 0.99), view(100, 0.99)]).kind, 'notDetected');
});

test('disagreeing and poor-quality views abstain', () => {
  assert.equal(decidePretrained([view(53, 0.95), view(296, 0.95), view(53, 0.95)]).kind, 'unknown');
  assert.equal(decidePretrained([view(53, 0.95), view(53, 0.95, false), view(53, 0.95)]).kind, 'unknown');
});
