/**
 * Helpers for selecting sensible starting distances based on army size.
 */

import type { Army } from '../types';

/**
 * Default starting gaps (in inches) keyed by common game sizes.
 */
const DISTANCE_DEFAULTS: Record<'incursion' | 'strikeForce' | 'onslaught', number> = {
  incursion: 18,     // ~1000 points, tighter boards
  strikeForce: 24,   // ~2000 points, standard Strike Force
  onslaught: 30      // ~3000 points, larger boards/deployments
};

/**
 * Map an army's point total to a reasonable default starting distance.
 * Falls back to Strike Force if the value is in between bands.
 */
export function startingDistanceFromPoints(pointsTotal: number | undefined | null): number {
  if (!pointsTotal || Number.isNaN(pointsTotal)) {
    return DISTANCE_DEFAULTS.strikeForce;
  }

  if (pointsTotal >= 2500) {
    return DISTANCE_DEFAULTS.onslaught;
  }

  if (pointsTotal >= 1500) {
    return DISTANCE_DEFAULTS.strikeForce;
  }

  return DISTANCE_DEFAULTS.incursion;
}

/**
 * Pick an encounter distance for two armies, respecting a manual override when present.
 * Uses the larger of the two inferred defaults so the bigger army doesn't get compressed.
 */
export function pickStartingDistance(
  armyA: Army | undefined,
  armyB: Army | undefined,
  overrideDistance?: number | null
): number {
  if (typeof overrideDistance === 'number' && overrideDistance > 0) {
    return overrideDistance;
  }

  const distanceA = startingDistanceFromPoints(armyA?.pointsTotal);
  const distanceB = startingDistanceFromPoints(armyB?.pointsTotal);

  return Math.max(distanceA, distanceB);
}

export { DISTANCE_DEFAULTS };
