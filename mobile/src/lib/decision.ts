export type Toxicity = 'poisonous' | 'unknown';

export type Species = {
  id: string;
  scientificName: string;
  commonName?: string;
  toxicity: Toxicity;
  toxicitySource?: string;
};

export type Match = {
  /** Catalog species index. */
  id: string;
  scientificName: string;
  commonName?: string;
  confidence: number;
};

export type GenusWarning = {
  genus: string;
  toxin: string;
  source: string;
};

/** The app never reports a mushroom as safe to eat; every result is at most a possible match. */
export type Decision = {
  kind: 'notDetected' | 'unknown' | 'notSafe' | 'uncertain';
  modelName: string;
  modelDetails: string;
  species?: Species;
  /** Uncalibrated match score, not the chance the species is correct. */
  speciesConfidence?: number;
  genus?: { name: string; confidence: number };
  alternatives?: Match[];
  warning?: GenusWarning;
  reason: string;
};
