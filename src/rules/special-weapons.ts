/**
 * Special weapon rules implementation for Warhammer 40K
 * Handles Rapid Fire, Melta, Sustained Hits, Lethal Hits, Devastating Wounds, etc.
 */

import type { Weapon, SpecialRulesResult } from '../types';
import { parseNumeric } from '../utils/numeric';

/**
 * Apply special weapon rules and calculate enhanced damage
 * @param weapon - Weapon with potential special rules
 * @param baseAttacks - Base number of attacks
 * @param hitChance - Probability of hitting (0-1)
 * @param woundChance - Probability of wounding (0-1)
 * @param baseDamage - Base damage value
 * @param targetToughness - Target's toughness value
 * @param optimalRange - Whether weapon is at optimal range
 * @returns Total damage and breakdown explanation
 */
export function applySpecialRules(
  weapon: Weapon,
  baseAttacks: number,
  hitChance: number,
  woundChance: number,
  baseDamage: number,
  targetToughness: number,
  optimalRange: boolean
): SpecialRulesResult {
  const keywords = weapon.characteristics.keywords || "";
  let effectiveAttacks = baseAttacks;
  let effectiveHitChance = hitChance;
  let effectiveDamage = baseDamage;
  let mortalWounds = 0;
  const breakdown: string[] = [];

  // Rapid Fire - extra attacks at optimal range
  const rapidFireMatch = keywords.match(/Rapid Fire (\d+|D\d+(?:\+\d+)?)/i);
  if (rapidFireMatch && optimalRange) {
    const bonusAttacks = parseNumeric(rapidFireMatch[1]);
    effectiveAttacks += bonusAttacks;
    breakdown.push(`Rapid Fire +${bonusAttacks} attacks (optimal range)`);
  }

  // Melta - extra damage at optimal range
  const meltaMatch = keywords.match(/Melta (\d+)/i);
  if (meltaMatch && optimalRange) {
    const bonusDamage = parseInt(meltaMatch[1]);
    effectiveDamage += bonusDamage;
    breakdown.push(`Melta +${bonusDamage} damage (optimal range)`);
  }

  // Calculate hits including sustained hits
  let totalHits = effectiveAttacks * effectiveHitChance;
  const sustainedHitsMatch = keywords.match(/Sustained Hits (\d+)/i);
  if (sustainedHitsMatch) {
    const extraHits = parseInt(sustainedHitsMatch[1]);
    const criticalHits = effectiveAttacks * (1 / 6); // 6s to hit
    const bonusHits = criticalHits * extraHits;
    totalHits += bonusHits;
    breakdown.push(`Sustained Hits +${bonusHits.toFixed(2)} hits`);
  }

  // Lethal Hits - 6s to hit auto-wound
  let regularWounds = 0;
  let lethalWounds = 0;
  if (keywords.toLowerCase().includes("lethal hits")) {
    const criticalHits = effectiveAttacks * (1 / 6);
    const normalHits = totalHits - criticalHits;
    regularWounds = normalHits * woundChance;
    lethalWounds = criticalHits; // Auto-wound
    breakdown.push(`Lethal Hits: ${lethalWounds.toFixed(2)} auto-wounds`);
  } else {
    regularWounds = totalHits * woundChance;
  }

  const totalWounds = regularWounds + lethalWounds;

  // Devastating Wounds - 6s to wound become mortal wounds
  let normalWounds = totalWounds;
  if (keywords.toLowerCase().includes("devastating wounds")) {
    const criticalWounds = totalHits * woundChance * (1 / 6); // 6s to wound
    mortalWounds = criticalWounds;
    normalWounds = totalWounds - criticalWounds;
    breakdown.push(`Devastating Wounds: ${mortalWounds.toFixed(2)} mortal wounds`);
  }

  // Calculate total damage
  const normalDamage = normalWounds * effectiveDamage;
  const totalDamage = normalDamage + mortalWounds; // Mortal wounds = 1 damage each

  return {
    totalDamage,
    breakdown: breakdown.join(", ")
  };
}
