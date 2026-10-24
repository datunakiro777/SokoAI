import assert from 'node:assert/strict';
import test from 'node:test';
import { SPECIES_COUNT, classification, isSpeciesIndex, scientificName } from './fungiCatalog';

function indexOf(name: string): number {
  for (let i = 0; i < SPECIES_COUNT; i += 1) if (scientificName(i) === name) return i;
  throw new Error(`${name} is not in the catalog`);
}

test('classification runs from kingdom to species', () => {
  const ranks = classification(indexOf('Amanita phalloides'));
  assert.deepEqual(ranks.map((rank) => rank.rank), ['Kingdom', 'Phylum', 'Class', 'Order', 'Family', 'Genus', 'Species']);
  assert.deepEqual(ranks.map((rank) => rank.name), ['Fungi', 'Basidiomycota', 'Agaricomycetes', 'Agaricales', 'Amanitaceae', 'Amanita', 'Amanita phalloides']);
});

test('species indexes from routes are validated', () => {
  assert.equal(isSpeciesIndex(0), true);
  assert.equal(isSpeciesIndex(SPECIES_COUNT), false);
  assert.equal(isSpeciesIndex(Number('abc')), false);
  assert.equal(isSpeciesIndex(1.5), false);
});
