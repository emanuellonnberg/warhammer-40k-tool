/**
 * Styling and UI helper functions
 */

import type { EfficiencyClass } from '../types';

/**
 * Get efficiency class for styling based on efficiency value
 * @param efficiency - Efficiency value (damage per point)
 * @returns CSS class name for efficiency level
 */
export function getEfficiencyClass(efficiency: number): EfficiencyClass {
  if (efficiency > 0.3) return 'high-efficiency';
  if (efficiency > 0.1) return 'medium-efficiency';
  return 'low-efficiency';
}
