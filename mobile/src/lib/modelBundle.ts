// Replaced by ml/install_model.py only after the independent safety gate passes.
export const modelAsset: number | null = null;
export const modelMetadata = {
  modelVersion: 'untrained',
  species: [] as import('./decision').Species[],
  presenceTemperature: 1,
  toxicTemperature: 1,
  speciesTemperature: 1,
  releaseGatePassed: false,
};
