import assert from 'node:assert/strict';
import test from 'node:test';
import { decide, DEFAULT_DECISION_CONFIG, type Species, type ViewScore } from './decision';

const catalog: Species[] = [
  { id: 'edible', scientificName: 'Example edible', toxicity: 'edible' },
  { id: 'poisonous', scientificName: 'Example poisonous', toxicity: 'poisonous' },
];

const edibleView = (): ViewScore => ({
  presence: 0.9999, toxic: 0.0001, species: [0.99999, 0.00001], qualityPass: true,
});
const gated = { ...DEFAULT_DECISION_CONFIG, releaseGatePassed: true };

test('release gate keeps an otherwise eligible mushroom uncertain', () => {
  assert.equal(decide([edibleView(), edibleView(), edibleView()], catalog, DEFAULT_DECISION_CONFIG, true).kind, 'uncertain');
});

test('validated high confidence three-view result can be likely edible', () => {
  assert.equal(decide([edibleView(), edibleView(), edibleView()], catalog, gated, true).kind, 'likelyEdible');
});

test('one view without mushroom blocks the edible result', () => {
  const absent = { ...edibleView(), presence: 0.1 };
  assert.notEqual(decide([edibleView(), edibleView(), absent], catalog, gated, true).kind, 'likelyEdible');
});

test('poisonous look-alike blocks the edible result', () => {
  const risky = { ...edibleView(), species: [0.998, 0.002] };
  assert.equal(decide([risky, risky, risky], catalog, gated, true).kind, 'uncertain');
});

test('no mushroom is not detected', () => {
  const absent = { ...edibleView(), presence: 0.01 };
  assert.equal(decide([absent, absent, absent], catalog, gated, true).kind, 'notDetected');
});

test('low species confidence is unknown', () => {
  const ambiguous = { ...edibleView(), species: [0.55, 0.45] };
  assert.equal(decide([ambiguous, ambiguous, ambiguous], catalog, gated, true).kind, 'unknown');
});

test('high confidence poisonous identification is not safe', () => {
  const poisonous = { ...edibleView(), species: [0.001, 0.999], toxic: 0.99 };
  assert.equal(decide([poisonous, poisonous, poisonous], catalog, gated, true).kind, 'notSafe');
});

test('strong toxicity evidence is not safe even when the species is unknown', () => {
  const unknownPoisonous = { ...edibleView(), species: [0.55, 0.45], toxic: 0.99 };
  const result = decide([unknownPoisonous, unknownPoisonous, unknownPoisonous], catalog, gated, true);
  assert.equal(result.kind, 'notSafe');
  assert.equal(result.species, undefined);
});

test('outside supported region is unknown', () => {
  assert.equal(decide([edibleView(), edibleView(), edibleView()], catalog, gated, false).kind, 'unknown');
});
