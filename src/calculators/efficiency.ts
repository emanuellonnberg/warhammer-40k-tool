/**
 * Unit efficiency calculations (damage per point)
 */

import type { Unit } from '../types';
import { calculateUnitDamage } from './damage';

/**
 * Calculate unit efficiency as total damage per point
 * @param unit - Unit to analyze
 * @param targetToughness - Target's toughness value
 * @param useOvercharge - Whether to use overcharge mode
 * @param includeOneTimeWeapons - Whether to include one-time weapons
 * @param optimalRange - Whether at optimal range
 * @param activeModes - Map of active weapon modes
 * @returns Efficiency value (damage per point)
 */
export function calculateUnitEfficiency(
  unit: Unit,
  targetToughness: number,
  useOvercharge: boolean = false,
  includeOneTimeWeapons: boolean = false,
  optimalRange: boolean = true,
  activeModes?: Map<string, number>
): number {
  const unitDamage = calculateUnitDamage(unit, targetToughness, useOvercharge, activeModes, includeOneTimeWeapons, optimalRange);
  return unit.points > 0 ? unitDamage.total / unit.points : 0;
}
