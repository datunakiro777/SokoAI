import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Decision } from '../lib/decision';
import type { Photo } from '../lib/inference';

/** A finished check. `historyId` is missing when saving it to history failed. */
export type ScanResult = { decision: Decision; photos: Photo[]; createdAt: string; historyId?: string };

type ScanState = {
  photos: Photo[];
  setPhotos: (photos: Photo[]) => void;
  result: ScanResult | null;
  setResult: (result: ScanResult | null) => void;
  reset: () => void;
};

const ScanContext = createContext<ScanState | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [result, setResult] = useState<ScanResult | null>(null);
  const value = useMemo(() => ({
    photos, setPhotos, result, setResult,
    reset: () => { setPhotos([]); setResult(null); },
  }), [photos, result]);
  return <ScanContext.Provider value={value}>{children}</ScanContext.Provider>;
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) throw new Error('ScanProvider is missing.');
  return context;
}
