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
 * @param targetUnitSize - Number of models in target unit (for Blast weapons)
 * @param isCharging - Whether the attacker is charging (for Lance weapons)
 * @param targetSave - Target's save characteristic (e.g., "3+", "4+", null for no save)
 * @param weaponAP - Weapon's armor penetration value
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
  targetKeywords: string[] = [],
  targetUnitSize: number = 1,
  isCharging: boolean = false,
  targetSave: string | null = null,
  weaponAP: number = 0
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

  // Blast - bonus attacks based on target unit size
  // Add 1 attack for every 5 models in the target unit (rounding down)
  if (keywords.toLowerCase().includes("blast")) {
    const bonusAttacks = Math.floor(targetUnitSize / 5);
    if (bonusAttacks > 0) {
      effectiveAttacks += bonusAttacks;
      breakdown.push(`Blast +${bonusAttacks} attacks (${targetUnitSize} models in target unit)`);
    }
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

  // Lance - add 1 to wound roll when charging
  // This shifts the wound probability by +1 on the D6 (e.g., 4+ becomes 3+)
  if (keywords.toLowerCase().includes("lance") && isCharging) {
    const originalWoundChance = effectiveWoundChance;
    // Shifting by 1 means multiplying wound chance by 6/5 (or adding 1/6), capped at 5/6
    // Formula: if you need X+, with +1 you need (X-1)+
    // More accurate: increase by 1/6, capped at 5/6 (can't wound better than 2+)
    effectiveWoundChance = Math.min(effectiveWoundChance + (1 / 6), 5 / 6);
    breakdown.push(`Lance (wound chance ${originalWoundChance.toFixed(3)} -> ${effectiveWoundChance.toFixed(3)} when charging)`);
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
  // First, separate critical hits (6s) from normal hits
  const criticalHitChance = 1 / 6;
  const normalHitChance = effectiveHitChance - criticalHitChance;
  const criticalHits = effectiveAttacks * criticalHitChance;
  let normalHits = effectiveAttacks * normalHitChance;

  // Sustained Hits - critical hits generate extra hits
  const sustainedHitsMatch = keywords.match(/Sustained Hits (\d+)/i);
  if (sustainedHitsMatch) {
    const extraHitsPerCrit = parseInt(sustainedHitsMatch[1]);
    const bonusHits = criticalHits * extraHitsPerCrit;
    normalHits += bonusHits; // Bonus hits from Sustained Hits are treated as normal hits
    breakdown.push(`Sustained Hits +${bonusHits.toFixed(2)} hits`);
  }

  const totalHits = normalHits + criticalHits;

  // Lethal Hits - critical hits (6s to hit) auto-wound
  let regularWounds = 0;
  let lethalWounds = 0;
  if (keywords.toLowerCase().includes("lethal hits")) {
    regularWounds = normalHits * effectiveWoundChance;
    lethalWounds = criticalHits; // Critical hits auto-wound
    breakdown.push(`Lethal Hits: ${lethalWounds.toFixed(2)} auto-wounds from crits`);
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

  // Apply saves to normal wounds (mortal wounds bypass saves)
  let woundsAfterSaves = normalWounds;
  if (targetSave !== null && normalWounds > 0) {
    // Parse save characteristic (e.g., "3+" means save on 3+)
    const saveMatch = targetSave.match(/(\d+)\+/);
    if (saveMatch) {
      const saveValue = parseInt(saveMatch[1]);
      // Modify save by AP: effective save = original save + AP value
      // AP is positive (e.g., AP -3 is passed as 3), so we ADD it to make save worse
      const effectiveSaveValue = Math.min(saveValue + weaponAP, 7);
      const saveChance = effectiveSaveValue <= 6 ? (7 - effectiveSaveValue) / 6 : 0;
      woundsAfterSaves = normalWounds * (1 - saveChance);
      breakdown.push(`Save ${targetSave} (AP -${weaponAP}): ${normalWounds.toFixed(2)} wounds -> ${woundsAfterSaves.toFixed(2)} after saves`);
    }
  }

  // Calculate total damage
  const normalDamage = woundsAfterSaves * effectiveDamage;
  let totalDamage = normalDamage + mortalWounds; // Mortal wounds = 1 damage each

  // Hazardous - weapon has a chance to deal mortal wounds to the attacker
  // On each attack roll of 1, the unit suffers 3 mortal wounds
  if (keywords.toLowerCase().includes("hazardous")) {
    const hazardChance = 1 / 6; // 1 in 6 chance per attack
    const hazardousMortalWounds = effectiveAttacks * hazardChance * 3;
    totalDamage -= hazardousMortalWounds; // Subtract self-inflicted damage from total
    breakdown.push(`Hazardous: -${hazardousMortalWounds.toFixed(2)} damage (self-inflicted)`);
  }

  return {
    totalDamage,
    breakdown: breakdown.join(", ")
  };
}
