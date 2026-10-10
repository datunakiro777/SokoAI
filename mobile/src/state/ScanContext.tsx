import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Decision } from '../lib/decision';
import type { Photo } from '../lib/inference';

type ScanState = {
  photos: Photo[];
  setPhotos: (photos: Photo[]) => void;
  result: Decision | null;
  setResult: (result: Decision | null) => void;
  analysisError: string | null;
  setAnalysisError: (message: string | null) => void;
  inRegion: boolean;
  setInRegion: (inRegion: boolean) => void;
  reset: () => void;
};

const ScanContext = createContext<ScanState | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<Decision | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [inRegion, setInRegion] = useState(false);
  const value = useMemo(() => ({
    photos, setPhotos, result, setResult, analysisError, setAnalysisError, inRegion, setInRegion,
    reset: () => { setPhotos([]); setResult(null); setAnalysisError(null); },
  }), [photos, result, analysisError, inRegion]);
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) throw new Error('ScanProvider is missing.');
  return context;
}
