export type Toxicity = 'poisonous' | 'edible' | 'unknown';

export type Species = {
  id: string;
  scientificName: string;
  commonName?: string;
  toxicity: Toxicity;
  toxicitySource?: string;
  nutrition?: {
    sourceId: string;
    caloriesKcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  };
};

export type ViewScore = {
  presence: number;
  toxic: number;
  species: number[];
  qualityPass: boolean;
};

export type DecisionConfig = {
  presenceThreshold: number;
  speciesNameThreshold: number;
  toxicThreshold: number;
  edibleThreshold: number;
  edibleSpeciesThreshold: number;
  toxicLookalikeThreshold: number;
  releaseGatePassed: boolean;
};

export const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  presenceThreshold: 0.5,
  speciesNameThreshold: 0.65,
  toxicThreshold: 0.95,
  edibleThreshold: 0.999,
  edibleSpeciesThreshold: 0.99,
  toxicLookalikeThreshold: 0.001,
  releaseGatePassed: false,
};

export type Decision = {
  kind: 'notDetected' | 'unknown' | 'notSafe' | 'likelyEdible' | 'uncertain';
  pilot?: true;
  species?: Species;
  speciesConfidence?: number;
  toxicProbability?: number;
  edibleProbability?: number;
  reason: string;
};

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

export function decide(
  views: ViewScore[],
  species: Species[],
  config: DecisionConfig,
  inRegion: boolean,
): Decision {
  if (views.length !== 3 || views.some((view) => view.species.length !== species.length)) {
    throw new Error('Exactly three views and matching species scores are required.');
  }
  if (views.some((view) => !Number.isFinite(view.presence) || !Number.isFinite(view.toxic)
    || view.species.some((score) => !Number.isFinite(score)))) {
    throw new Error('Invalid model scores.');
  }

  const presence = average(views.map((view) => view.presence));
  if (presence < config.presenceThreshold) {
    return { kind: 'notDetected', reason: 'No mushroom was detected in the captured views.' };
  }

  const toxicProbability = average(views.map((view) => view.toxic));
  const edibleProbability = 1 - toxicProbability;
  const candidates = species.map((item, index) => ({
    item,
    confidence: average(views.map((view) => view.species[index])),
  })).sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];

  if (toxicProbability >= config.toxicThreshold) {
    return {
      kind: 'notSafe', toxicProbability, edibleProbability,
      ...(best && best.confidence >= config.speciesNameThreshold && inRegion
        ? { species: best.item, speciesConfidence: best.confidence } : {}),
      reason: 'The model found strong evidence of toxicity.',
    };
  }

  if (!best || best.confidence < config.speciesNameThreshold || !inRegion) {
    return {
      kind: 'unknown', toxicProbability, edibleProbability,
      reason: inRegion ? 'The species could not be identified reliably.' : 'This specimen is outside the supported region.',
    };
  }

  const common = {
    species: best.item,
    speciesConfidence: best.confidence,
    toxicProbability,
    edibleProbability,
  };
  if (best.item.toxicity === 'poisonous' && best.confidence >= config.toxicThreshold) {
    return { kind: 'notSafe', ...common, reason: 'The identified species is documented as poisonous.' };
  }
  const viewWinners = views.map((view) => view.species.indexOf(Math.max(...view.species)));
  const viewsAgree = viewWinners.every((winner) => winner === viewWinners[0]);
  const toxicLookalike = candidates.some(({ item, confidence }) =>
    item.toxicity === 'poisonous' && confidence >= config.toxicLookalikeThreshold,
  );
  const eligible = config.releaseGatePassed
    && best.item.toxicity === 'edible'
    && best.confidence >= config.edibleSpeciesThreshold
    && edibleProbability >= config.edibleThreshold
    && viewsAgree
    && views.every((view) => view.presence >= config.presenceThreshold)
    && views.every((view) => view.qualityPass)
    && !toxicLookalike;

  if (eligible) {
    return { kind: 'likelyEdible', ...common, reason: 'All high-confidence checks passed.' };
  }
  return { kind: 'uncertain', ...common, reason: 'Eating safety cannot be established from these photos.' };
}
