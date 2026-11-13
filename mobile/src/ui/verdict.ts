import type { Decision } from '../lib/decision';

export function verdictTitle(kind: Decision['kind']): string {
  switch (kind) {
    case 'notDetected': return 'No fungus found.';
    case 'unknown': return 'Unknown.';
    case 'notSafe': return 'Not safe to eat.';
    case 'uncertain': return 'Possible match.';
  }
}

/** The best name a result offers, for lists. */
export function matchSummary(decision: Decision): string {
  if (decision.species) return decision.species.commonName ? `${decision.species.commonName} · ${decision.species.scientificName}` : decision.species.scientificName;
  if (decision.genus) return `Genus ${decision.genus.name}`;
  if (decision.alternatives?.length) return `Closest: ${decision.alternatives[0].scientificName}`;
  return 'No match';
}

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export const percentage = (value: number) => `${(value * 100).toFixed(value > 0.99 ? 2 : 1)}%`;
