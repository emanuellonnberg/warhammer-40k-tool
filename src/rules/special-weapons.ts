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
 * @param targetKeywords - Array of target unit keywords (for Anti- rules)
 * @returns Total damage and breakdown explanation
 */
export function applySpecialRules(
  weapon: Weapon,
  baseAttacks: number,
  hitChance: number,
  woundChance: number,
  baseDamage: number,
  targetToughness: number,
  optimalRange: boolean,
  targetKeywords: string[] = []
): SpecialRulesResult {
  const keywords = weapon.characteristics.keywords || "";
  let effectiveAttacks = baseAttacks;
  let effectiveHitChance = hitChance;
  let effectiveWoundChance = woundChance;
  let effectiveDamage = baseDamage;
  let criticalWoundThreshold = 6; // Default: only 6s are critical wounds
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

  // Twin-Linked - re-roll wound rolls
  if (keywords.toLowerCase().includes("twin-linked")) {
    // Re-rolling wounds: new chance = original + (1-original) * original
    const originalWoundChance = effectiveWoundChance;
    effectiveWoundChance = originalWoundChance + (1 - originalWoundChance) * originalWoundChance;
    breakdown.push(`Twin-Linked (wound chance ${originalWoundChance.toFixed(3)} -> ${effectiveWoundChance.toFixed(3)})`);
  }

  // Anti- Keywords - improve critical wound threshold against specific keywords
  // Match patterns like "Anti-INFANTRY 4+", "Anti-CHAOS 2+", etc.
  const antiMatch = keywords.match(/Anti-([\w-]+)\s+(\d+)\+/i);
  if (antiMatch) {
    const targetKeyword = antiMatch[1].toUpperCase();
    const threshold = parseInt(antiMatch[2]);

    // Check if target has the matching keyword
    if (targetKeywords.some(k => k.toUpperCase() === targetKeyword)) {
      criticalWoundThreshold = threshold;
      breakdown.push(`Anti-${targetKeyword} ${threshold}+ (crits on ${threshold}+ vs ${targetKeyword})`);
    }
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
    regularWounds = normalHits * effectiveWoundChance;
    lethalWounds = criticalHits; // Auto-wound
    breakdown.push(`Lethal Hits: ${lethalWounds.toFixed(2)} auto-wounds`);
  } else {
    regularWounds = totalHits * effectiveWoundChance;
  }

  const totalWounds = regularWounds + lethalWounds;

  // Devastating Wounds - critical wounds become mortal wounds
  let normalWounds = totalWounds;
  if (keywords.toLowerCase().includes("devastating wounds")) {
    // Calculate critical wound chance based on threshold (default 6, but Anti- can lower it)
    const criticalWoundChance = (7 - criticalWoundThreshold) / 6;
    const criticalWounds = totalHits * effectiveWoundChance * criticalWoundChance;
    mortalWounds = criticalWounds;
    normalWounds = totalWounds - criticalWounds;
    breakdown.push(`Devastating Wounds: ${mortalWounds.toFixed(2)} mortal wounds (crits on ${criticalWoundThreshold}+)`);
  }

  // Calculate total damage
  const normalDamage = normalWounds * effectiveDamage;
  const totalDamage = normalDamage + mortalWounds; // Mortal wounds = 1 damage each

  return {
    totalDamage,
    breakdown: breakdown.join(", ")
  };
}
