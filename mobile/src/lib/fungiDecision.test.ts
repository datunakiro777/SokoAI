import assert from 'node:assert/strict';
import test from 'node:test';
import { decideFungi } from './fungiDecision';
import { SPECIES_COUNT, scientificName } from './fungiCatalog';

function indexOf(name: string): number {
  for (let i = 0; i < SPECIES_COUNT; i += 1) if (scientificName(i) === name) return i;
  throw new Error(`${name} is not in the catalog`);
}

/** Similarities where each named species stands out by the given margin over a 0.70 background. */
function view(peaks: Record<string, number>, qualityPass = true) {
  const similarities = new Float32Array(SPECIES_COUNT).fill(0.70);
  for (const [name, similarity] of Object.entries(peaks)) similarities[indexOf(name)] = similarity;
  return { similarities, qualityPass };
}

test('a strong death cap match warns and names the species', () => {
  const decision = decideFungi([view({ 'Amanita phalloides': 0.90 })]);
  assert.equal(decision.kind, 'notSafe');
  assert.equal(decision.species?.scientificName, 'Amanita phalloides');
  assert.equal(decision.warning?.genus, 'Amanita');
  assert.equal(decision.scoreCalibrated, false);
});

test('a strong match outside toxic genera stays uncertain, never edible', () => {
  const decision = decideFungi([view({ 'Cantharellus cibarius': 0.90 })]);
  assert.equal(decision.kind, 'uncertain');
  assert.equal(decision.species?.scientificName, 'Cantharellus cibarius');
  assert.equal(decision.warning, undefined);
});

test('documented poisonous species warn even in a mostly harmless genus', () => {
  const decision = decideFungi([view({ 'Hypholoma fasciculare': 0.90 })]);
  assert.equal(decision.kind, 'notSafe');
  assert.equal(decision.species?.toxicity, 'poisonous');
});

test('a split between species of one genus names only the genus', () => {
  const decision = decideFungi([view({ 'Russula emetica': 0.85, 'Russula nobilis': 0.85 })]);
  assert.equal(decision.kind, 'uncertain');
  assert.equal(decision.species, undefined);
  assert.equal(decision.genus?.name, 'Russula');
  assert.equal(decision.alternatives?.length, 3);
});

test('a small share for a toxic genus still warns', () => {
  const decision = decideFungi([view({ 'Agaricus campestris': 0.85, 'Amanita virosa': 0.83 })]);
  assert.equal(decision.kind, 'notSafe');
  assert.equal(decision.warning?.genus, 'Amanita');
});

test('extra photos are averaged with the first', () => {
  const decision = decideFungi([view({ 'Boletus edulis': 0.90 }), view({ 'Boletus edulis': 0.88 })]);
  assert.equal(decision.species?.scientificName, 'Boletus edulis');
});

test('photos without a fungus are not detected and poor photos abstain', () => {
  const blank = { similarities: new Float32Array(SPECIES_COUNT).fill(0.6), qualityPass: true };
  assert.equal(decideFungi([blank]).kind, 'notDetected');
  assert.equal(decideFungi([view({ 'Boletus edulis': 0.90 }, false)]).kind, 'unknown');
});

test('invalid model output is rejected', () => {
  assert.throws(() => decideFungi([{ similarities: new Float32Array(3), qualityPass: true }]));
  assert.throws(() => decideFungi([]));
});
