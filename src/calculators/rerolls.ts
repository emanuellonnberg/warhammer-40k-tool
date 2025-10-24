/**
 * Re-roll mechanics calculator for Warhammer 40K
 * Handles probability calculations for different re-roll types
 */

import { RerollType } from '../types';

/**
 * Calculate probability of success with re-roll applied
 *
 * Formula reference:
 * - Re-roll 1s: P × (7/6)
 * - Re-roll failed: P × (2 - P)
 * - Re-roll all: P × (2 - P) (optimal play = re-roll failures only)
 *
 * @param baseChance - Base probability of success (0-1)
 * @param rerollType - Type of re-roll available
 * @returns Modified probability with re-roll applied
 */
export function applyReroll(baseChance: number, rerollType: RerollType): number {
  switch (rerollType) {
    case RerollType.NONE:
      return baseChance;

    case RerollType.ONES:
      // P(success) × (7/6)
      // This accounts for the 1/6 chance to roll a 1 and re-roll it
      return baseChance * (7 / 6);

    case RerollType.FAILED:
    case RerollType.ALL:
      // P(success) × (2 - P(success))
      // Get a second chance on all failures
      return baseChance * (2 - baseChance);

    default:
      return baseChance;
  }
}

/**
 * Determine the best available re-roll from multiple sources
 * Priority: ALL > FAILED > ONES > NONE
 *
 * As per Warhammer 40K rules:
 * "You can never re-roll a dice more than once, regardless of the source of the re-roll."
 *
 * @param rerolls - Variable number of re-roll types from different sources
 * @returns The best re-roll to apply
 */
export function getBestReroll(...rerolls: (RerollType | undefined)[]): RerollType {
  const validRerolls = rerolls.filter((r): r is RerollType => r !== undefined);

  if (validRerolls.includes(RerollType.ALL)) return RerollType.ALL;
  if (validRerolls.includes(RerollType.FAILED)) return RerollType.FAILED;
  if (validRerolls.includes(RerollType.ONES)) return RerollType.ONES;
  return RerollType.NONE;
}

/**
 * Calculate hit probability with best available re-roll
 *
 * @param skill - Skill value (2-6, representing 2+ through 6+)
 * @param weaponReroll - Re-roll from weapon ability
 * @param unitReroll - Re-roll from unit ability
 * @param scenarioReroll - Re-roll from scenario/buff/stratagem
 * @returns Probability of hitting with best re-roll applied
 */
export function calculateHitChanceWithReroll(
  skill: number,
  weaponReroll?: RerollType,
  unitReroll?: RerollType,
  scenarioReroll?: RerollType
): number {
  const baseChance = (7 - skill) / 6;
  const bestReroll = getBestReroll(weaponReroll, unitReroll, scenarioReroll);
  return applyReroll(baseChance, bestReroll);
}

/**
 * Calculate wound probability with best available re-roll
 *
 * @param strength - Weapon strength value
 * @param toughness - Target toughness value
 * @param weaponReroll - Re-roll from weapon ability
 * @param unitReroll - Re-roll from unit ability
 * @param scenarioReroll - Re-roll from scenario/buff/stratagem
 * @returns Probability of wounding with best re-roll applied
 */
export function calculateWoundChanceWithReroll(
  strength: number,
  toughness: number,
  weaponReroll?: RerollType,
  unitReroll?: RerollType,
  scenarioReroll?: RerollType
): number {
  // Calculate wound target based on S vs T comparison
  let woundTarget: number;

  if (strength >= toughness * 2) {
    woundTarget = 2;
  } else if (strength > toughness) {
    woundTarget = 3;
  } else if (strength === toughness) {
    woundTarget = 4;
  } else if (strength * 2 <= toughness) {
    woundTarget = 6;
  } else {
    woundTarget = 5;
  }

  const baseChance = (7 - woundTarget) / 6;
  const bestReroll = getBestReroll(weaponReroll, unitReroll, scenarioReroll);
  return applyReroll(baseChance, bestReroll);
}
