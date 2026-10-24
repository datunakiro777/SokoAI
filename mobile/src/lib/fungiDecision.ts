import type { Decision, GenusWarning, Match, Species } from './decision';
import { GENERA, SPECIES_COUNT, commonName, genusIndex, scientificName } from './fungiCatalog';

export type FungiView = { similarities: ArrayLike<number>; qualityPass: boolean };

// BioCLIP 2's learned logit scale.
const LOGIT_SCALE = 100;
// A photo counts as a fungus when its best species similarity reaches this.
// On held-out photos it kept every fungus and rejected all everyday objects
// and over 95% of plants and animals.
export const FUNGUS_SIMILARITY_GATE = 0.7;
// Species and genus names are shown from this match score. On held-out
// Danish Fungi photos, species scored this high were right 83-100% of the
// time and genera about 93% of the time.
export const NAME_THRESHOLD = 0.6;
// Warn when the photos give this much combined weight to a toxic genus.
export const WARNING_THRESHOLD = 0.05;
const CANDIDATES = 20;

const STATPEARLS = 'StatPearls, Mushroom Toxicity: https://www.ncbi.nlm.nih.gov/books/NBK537111/';
const NAMA = 'North American Mycological Association: https://namyco.org/interests/toxicology/mushroom-poisoning-syndromes/';

// Genera that include species documented to cause severe poisoning.
const TOXIC_GENERA: Record<string, Omit<GenusWarning, 'genus'>> = {
  Amanita: { toxin: 'amatoxins, which can cause fatal liver failure', source: STATPEARLS },
  Galerina: { toxin: 'amatoxins, which can cause fatal liver failure', source: STATPEARLS },
  Lepiota: { toxin: 'amatoxins, which can cause fatal liver failure', source: STATPEARLS },
  Cortinarius: { toxin: 'orellanine, which can cause kidney failure', source: STATPEARLS },
  Clitocybe: { toxin: 'muscarine', source: STATPEARLS },
  Inocybe: { toxin: 'muscarine', source: STATPEARLS },
  Gyromitra: { toxin: 'gyromitrin', source: NAMA },
};

// These sources document toxicity of the named species, not the accuracy of this image model.
const POISONOUS_SPECIES: Record<string, { commonName: string; source: string }> = {
  'Amanita muscaria': {
    commonName: 'Fly agaric',
    source: 'US FDA: https://www.fda.gov/media/184512/download',
  },
  'Chlorophyllum molybdites': {
    commonName: 'Green-spored parasol',
    source: 'University of Florida IFAS: https://ask.ifas.ufl.edu/publication/PP324',
  },
  'Hypholoma fasciculare': {
    commonName: 'Sulphur tuft',
    source: 'Norwegian Poison Information: https://www.helsenorge.no/giftinformasjon/sopp/besk-svovelsopp-er-en-giftig-sopp/',
  },
};

const model = {
  modelName: 'BioCLIP 2 · 51,406 fungal species',
  modelDetails: 'This offline model compares your photos with fungal species worldwide. It suggests species, not eating safety, and its match score is not the chance that the match is correct.',
};

function maximum(values: ArrayLike<number>): number {
  let best = -Infinity;
  for (let i = 0; i < values.length; i += 1) if (values[i] > best) best = values[i];
  return best;
}

/** Average of each photo's softmax over all fungal species. */
function speciesProbabilities(views: FungiView[]): Float64Array {
  const probabilities = new Float64Array(SPECIES_COUNT);
  for (const view of views) {
    const peak = maximum(view.similarities);
    let total = 0;
    const weights = new Float64Array(SPECIES_COUNT);
    for (let i = 0; i < SPECIES_COUNT; i += 1) {
      weights[i] = Math.exp(LOGIT_SCALE * (view.similarities[i] - peak));
      total += weights[i];
    }
    for (let i = 0; i < SPECIES_COUNT; i += 1) probabilities[i] += weights[i] / total / views.length;
  }
  return probabilities;
}

/** Highest-scoring species, merging the catalog's few duplicate names. */
function topSpecies(probabilities: Float64Array): (Match & { index: number })[] {
  const top: number[] = [];
  for (let i = 0; i < probabilities.length; i += 1) {
    if (top.length === CANDIDATES && probabilities[i] <= probabilities[top[CANDIDATES - 1]]) continue;
    let position = top.length;
    while (position > 0 && probabilities[top[position - 1]] < probabilities[i]) position -= 1;
    top.splice(position, 0, i);
    if (top.length > CANDIDATES) top.pop();
  }
  const merged = new Map<string, Match & { index: number }>();
  for (const index of top) {
    const name = scientificName(index);
    const existing = merged.get(name);
    if (existing) existing.confidence += probabilities[index];
    else merged.set(name, { index, scientificName: name, commonName: commonName(index), confidence: probabilities[index] });
  }
  return [...merged.values()].sort((a, b) => b.confidence - a.confidence);
}

function genusTotals(probabilities: Float64Array): Float64Array {
  const totals = new Float64Array(GENERA.length);
  for (let i = 0; i < probabilities.length; i += 1) totals[genusIndex(i)] += probabilities[i];
  return totals;
}

/** Conservative species suggestion. The model has no toxicity output, so it never reports a mushroom as safe. */
export function decideFungi(views: FungiView[]): Decision {
  if (views.length < 1 || views.length > 3 || views.some((view) => view.similarities.length !== SPECIES_COUNT
    || Array.prototype.some.call(view.similarities, (value: number) => !Number.isFinite(value)))) {
    throw new Error('The fungus model returned invalid scores.');
  }

  const fungal = views.filter((view) => maximum(view.similarities) >= FUNGUS_SIMILARITY_GATE);
  if (!fungal.length) {
    return { kind: 'notDetected', ...model, reason: 'No fungus was recognised. Photograph a real mushroom so it fills most of the frame.' };
  }
  const usable = fungal.filter((view) => view.qualityPass);
  if (!usable.length) {
    return { kind: 'unknown', ...model, reason: 'The photos are too dark, bright, or unclear. Retake them in better light.' };
  }

  const probabilities = speciesProbabilities(usable);
  const candidates = topSpecies(probabilities);
  const genera = genusTotals(probabilities);
  let bestGenus = 0;
  for (let i = 1; i < genera.length; i += 1) if (genera[i] > genera[bestGenus]) bestGenus = i;

  let warning: GenusWarning | undefined;
  let warningWeight = 0;
  for (const [genus, details] of Object.entries(TOXIC_GENERA)) {
    const index = GENERA.indexOf(genus);
    if (index >= 0 && genera[index] >= WARNING_THRESHOLD && genera[index] > warningWeight) {
      warning = { genus, ...details };
      warningWeight = genera[index];
    }
  }
  const poisonousCandidate = candidates.find((candidate) =>
    POISONOUS_SPECIES[candidate.scientificName] && candidate.confidence >= WARNING_THRESHOLD);

  const best = candidates[0];
  const namedSpecies = best.confidence >= NAME_THRESHOLD ? best : undefined;
  const namedGenus = genera[bestGenus] >= NAME_THRESHOLD ? { name: GENERA[bestGenus], confidence: genera[bestGenus] } : undefined;
  const documented = namedSpecies && POISONOUS_SPECIES[namedSpecies.scientificName];
  const species: Species | undefined = namedSpecies && {
    id: String(namedSpecies.index),
    scientificName: namedSpecies.scientificName,
    commonName: namedSpecies.commonName ?? documented?.commonName,
    toxicity: documented ? 'poisonous' : 'unknown',
    toxicitySource: documented?.source,
  };
  const result = {
    ...model,
    ...(species && namedSpecies ? { species, speciesConfidence: namedSpecies.confidence } : {}),
    ...(namedGenus ? { genus: namedGenus } : {}),
    alternatives: candidates.slice(0, 3).map(({ scientificName: name, commonName: common, confidence }) =>
      ({ scientificName: name, commonName: common, confidence })),
    ...(warning ? { warning } : {}),
  };

  if (documented || poisonousCandidate) {
    const name = (documented ? namedSpecies : poisonousCandidate)!.scientificName;
    return { kind: 'notSafe', ...result, reason: `Possible match to ${name}, a species documented as poisonous. Do not eat.` };
  }
  if (warning) {
    return {
      kind: 'notSafe', ...result,
      reason: `The photos resemble ${warning.genus}, a genus that includes species containing ${warning.toxin}. Do not eat.`,
    };
  }
  if (species || namedGenus) {
    return { kind: 'uncertain', ...result, reason: 'Possible match only. A photo cannot show whether a wild mushroom is safe to eat.' };
  }
  return { kind: 'unknown', ...result, reason: 'The model could not narrow this down to one species or genus. The closest matches are listed below.' };
}
