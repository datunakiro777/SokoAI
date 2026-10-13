import type { Decision, Species, ViewScore } from './decision';

/** The pilot can suggest a species, but it can never establish eating safety. */
export function decidePilot(views: ViewScore[], species: Species[]): Decision {
  if (views.length !== 3 || !species.length || views.some((view) => view.species.length !== species.length)) {
    throw new Error('The pilot needs three views and a matching species catalog.');
  }
  const pilot = { pilot: true as const };
  if (views.every((view) => view.presence < 0.5)) {
    return { kind: 'notDetected', ...pilot, reason: 'The pilot did not detect a mushroom in these photos.' };
  }
  if (views.some((view) => view.presence < 0.7 || !view.qualityPass)) {
    return { kind: 'unknown', ...pilot, reason: 'One or more photos need a clearer view of the mushroom.' };
  }
  const winners = views.map((view) => view.species.indexOf(Math.max(...view.species)));
  if (!winners.every((winner) => winner === winners[0])) {
    return { kind: 'unknown', ...pilot, reason: 'The three photos did not agree on one species.' };
  }
  const index = winners[0];
  const match = views.reduce((sum, view) => sum + view.species[index], 0) / views.length;
  if (match < 0.85) {
    return { kind: 'unknown', ...pilot, reason: 'The pilot could not match these photos confidently to its four known species.' };
  }
  return {
    kind: 'uncertain', ...pilot, species: species[index],
    reason: 'Experimental species suggestion only. This pilot cannot assess eating safety; do not eat.',
  };
}
