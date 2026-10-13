import type { Decision, Species } from './decision';
import { FUNGAL_CLASSES, MODEL_CLASS_COUNT } from './pretrainedCatalog';

export type PretrainedView = { scores: number[]; qualityPass: boolean };

const fungusIndices = Object.keys(FUNGAL_CLASSES).map(Number);
const fungusNames = FUNGAL_CLASSES as Record<number, string>;

// These sources document toxicity of the named species, not the accuracy of this image model.
const documentedPoisonous: Record<string, { commonName: string; source: string }> = {
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

const preview = {
  preview: true as const,
  previewModel: 'iNaturalist pretrained species model',
  previewDetails: 'This offline model covers only 21 fungal classes and has not been validated for eating safety. The match score is uncalibrated and is not a poison probability.',
  scoreCalibrated: false,
};

function topClass(scores: number[]): number {
  let best = 0;
  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[best]) best = index;
  }
  return best;
}

/** Conservative species preview. The pretrained model has no toxicity head. */
export function decidePretrained(views: PretrainedView[]): Decision {
  if (views.length !== 3 || views.some((view) => view.scores.length !== MODEL_CLASS_COUNT
    || view.scores.some((score) => !Number.isFinite(score) || score < 0 || score > 1)
    || Math.abs(view.scores.reduce((sum, score) => sum + score, 0) - 1) > 0.01)) {
    throw new Error('The pretrained model returned invalid class scores.');
  }

  const fungalMasses = views.map((view) => fungusIndices.reduce((sum, index) => sum + view.scores[index], 0));
  const winners = views.map((view) => topClass(view.scores));
  const allStronglyNonFungal = views.every((view, index) =>
    !fungusNames[winners[index]] && view.scores[winners[index]] >= 0.99 && fungalMasses[index] < 0.001);
  if (allStronglyNonFungal) {
    return { kind: 'notDetected', ...preview, reason: 'No supported fungal class was detected across the three photos. Try photographing a real mushroom directly.' };
  }

  if (views.some((view) => !view.qualityPass)) {
    return { kind: 'unknown', ...preview, reason: 'One or more photos are too dark, bright, or unclear for this preview.' };
  }
  const winner = winners[0];
  if (!fungusNames[winner] || !winners.every((index) => index === winner)) {
    return { kind: 'unknown', ...preview, reason: 'The three photos did not agree on a supported fungal species.' };
  }
  const score = views.reduce((sum, view) => sum + view.scores[winner], 0) / 3;
  if (score < 0.8 || views.some((view) => view.scores[winner] < 0.5)) {
    return { kind: 'unknown', ...preview, reason: 'The model found fungal evidence but could not identify the species reliably.' };
  }

  const name = fungusNames[winner];
  const poisonous = documentedPoisonous[name];
  const species: Species = {
    id: String(winner),
    scientificName: name,
    commonName: poisonous?.commonName,
    toxicity: poisonous ? 'poisonous' : 'unknown',
    toxicitySource: poisonous?.source,
  };
  if (poisonous) {
    return {
      kind: 'notSafe', ...preview, species, speciesConfidence: score,
      reason: 'Possible match to a documented poisonous species. Do not eat. This is a species match score, not a measured poison probability.',
    };
  }
  return {
    kind: 'uncertain', ...preview, species, speciesConfidence: score,
    reason: 'Possible species match only. This model cannot assess whether this specimen is safe to eat.',
  };
}
