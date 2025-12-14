/**
 * Dice-based damage calculation for battle simulation
 * Wraps the existing damage calculator with actual dice rolls
 */

import type { Unit, Weapon } from '../types';
import { calculateWeaponDamage } from '../calculators/damage';
import { rollDiceTest, rollDiceTestWithRerolls, rollDamage, rollAttacks } from './dice';
import { RerollType } from '../types';

export interface DiceRollBreakdown {
  totalDamage: number;
  attacks: number;
  hits: number;
  wounds: number;
  failedSaves: number;
  damageBeforeFNP?: number;
  fnpSaves?: number;
  lethalHits?: number;
  sustainedHits?: number;
  devastatingWounds?: number;
  mortalWounds?: number;
}

/**
 * Parse skill characteristic (e.g., "3+", "4+") to target number
 */
function parseSkill(skillStr: string): number {
  const match = skillStr.match(/(\d+)\+/);
  return match ? parseInt(match[1]) : 4;
}

/**
 * Parse save characteristic
 */
function parseSave(saveStr: string | null): number {
  if (!saveStr) return 7; // No save
  const match = saveStr.match(/(\d+)\+/);
  return match ? parseInt(match[1]) : 7;
}

/**
 * Calculate wound target based on S vs T
 */
function calculateWoundTarget(strength: number, toughness: number): number {
  if (strength >= toughness * 2) return 2; // S >= 2T: 2+
  if (strength > toughness) return 3;      // S > T: 3+
  if (strength === toughness) return 4;    // S = T: 4+
  if (strength * 2 <= toughness) return 6; // S <= T/2: 6+
  return 5;                                 // S < T: 5+
}

/**
 * Calculate damage for a single weapon using dice rolls
 * This simulates the actual attack sequence with dice
 * @param hitModifier - Modifier to hit rolls (e.g., -1 for dense cover)
 */
export function calculateWeaponDamageWithDice(
  weapon: Weapon,
  targetToughness: number,
  targetSave: string | null,
  useOvercharge: boolean = false,
  includeOneTimeWeapons: boolean = false,
  isCharging: boolean = false,
  unitRerolls?: { hits?: RerollType; wounds?: RerollType },
  targetFNP?: number,
  hitModifier: number = 0
): DiceRollBreakdown {
  // First, get the expected damage from the base calculator
  // This handles all the special rules, modifiers, etc.
  const expectedDamage = calculateWeaponDamage(
    weapon,
    targetToughness,
    useOvercharge,
    includeOneTimeWeapons,
    true, // optimalRange
    [], // targetKeywords
    1, // targetUnitSize
    isCharging,
    targetSave,
    unitRerolls,
    undefined, // scenarioRerolls
    targetFNP,
    undefined // unitModifiers
  );

  // If expected damage is 0, return 0 (weapon can't damage target)
  if (expectedDamage <= 0) {
    return { totalDamage: 0, attacks: 0, hits: 0, wounds: 0, failedSaves: 0 };
  }

  const chars = weapon.characteristics;

  // Get weapon stats
  let attacksStr = chars.a || '1';
  const skillStr = chars.bs || chars.ws || '4+';
  let strength = parseInt(chars.s || '0');
  let damageStr = chars.d || '1';
  let ap = parseInt(chars.ap || '0');

  // Handle overcharge mode
  if (useOvercharge && weapon.overcharge_mode) {
    const overchargeChars = weapon.overcharge_mode.split(',').reduce((acc, curr) => {
      const [key, value] = curr.trim().split(':').map(s => s.trim());
      acc[key] = value;
      return acc;
    }, {} as { [key: string]: string });

    if (overchargeChars.s) strength = parseInt(overchargeChars.s);
    if (overchargeChars.d) damageStr = overchargeChars.d;
    if (overchargeChars.ap) ap = parseInt(overchargeChars.ap);
  }

  const keywords = (chars.keywords || '').toLowerCase();

  // Parse weapon abilities
  const isTorrent = keywords.includes('torrent');
  const hasTwinLinked = keywords.includes('twin-linked');
  const hasLethalHits = keywords.includes('lethal hits');
  const hasSustainedHits = keywords.includes('sustained hits');
  const sustainedHitsMatch = keywords.match(/sustained hits (\d+)/);
  const sustainedHitsValue = sustainedHitsMatch ? parseInt(sustainedHitsMatch[1]) : 1;
  const hasDevastatingWounds = keywords.includes('devastating wounds');

  // Step 1: Roll number of attacks
  const numAttacks = rollAttacks(attacksStr) * weapon.count;

  if (numAttacks <= 0) return { totalDamage: 0, attacks: numAttacks, hits: 0, wounds: 0, failedSaves: 0 };

  // Step 2: Roll to hit (with potential for Lethal Hits and Sustained Hits)
  let hits: number;
  let lethalHits = 0;
  let sustainedHitsGenerated = 0;

  if (isTorrent) {
    hits = numAttacks; // Auto-hit
  } else {
    const hitTarget = parseSkill(skillStr);
    const hitReroll = unitRerolls?.hits;

    // Roll each attack individually to track critical hits (6s)
    let totalHits = 0;
    for (let i = 0; i < numAttacks; i++) {
      let roll = Math.floor(Math.random() * 6) + 1;
      const unmodifiedRoll = roll;

      // Handle rerolls (based on unmodified roll)
      if (hitReroll === RerollType.ONES && roll === 1) {
        roll = Math.floor(Math.random() * 6) + 1;
      } else if ((hitReroll === RerollType.ALL || hitReroll === RerollType.FAILED) && roll < hitTarget) {
        roll = Math.floor(Math.random() * 6) + 1;
      }

      // Apply hit modifier (e.g., -1 for dense cover)
      // In 10th edition, modifiers are capped at ±1 and natural 1s always fail, 6s always hit
      const modifiedRoll = Math.max(1, Math.min(6, roll + Math.max(-1, Math.min(1, hitModifier))));

      // Natural 1s always miss, natural 6s always hit
      const isNat1 = roll === 1;
      const isNat6 = roll === 6;

      if (isNat1) {
        // Natural 1 always misses
        continue;
      }

      if (isNat6 || modifiedRoll >= hitTarget) {
        totalHits++;

        // Check for critical hit (unmodified 6)
        if (roll === 6) {
          // Lethal Hits: critical hits auto-wound
          if (hasLethalHits) {
            lethalHits++;
          }

          // Sustained Hits: critical hits generate extra hits
          if (hasSustainedHits) {
            totalHits += sustainedHitsValue;
            sustainedHitsGenerated += sustainedHitsValue;
          }
        }
      }
    }

    hits = totalHits;
  }

  if (hits <= 0) return { totalDamage: 0, attacks: numAttacks, hits: 0, wounds: 0, failedSaves: 0 };

  // Step 3: Roll to wound (with Lethal Hits auto-wounding and Devastating Wounds)
  const woundTarget = calculateWoundTarget(strength, targetToughness);
  const woundReroll = unitRerolls?.wounds;

  // Lethal hits auto-wound, regular hits need to roll
  const regularHits = hits - lethalHits;
  let wounds = lethalHits; // Lethal hits auto-wound
  let devastatingWounds = 0;

  if (regularHits > 0) {
    // Roll each wound individually to track critical wounds (6s) for Devastating Wounds
    for (let i = 0; i < regularHits; i++) {
      let roll = Math.floor(Math.random() * 6) + 1;

      // Handle rerolls
      if (woundReroll === RerollType.ONES && roll === 1) {
        roll = Math.floor(Math.random() * 6) + 1;
      } else if (hasTwinLinked && roll === 1) {
        roll = Math.floor(Math.random() * 6) + 1;
      } else if ((woundReroll === RerollType.ALL || woundReroll === RerollType.FAILED) && roll < woundTarget) {
        roll = Math.floor(Math.random() * 6) + 1;
      }

      if (roll >= woundTarget) {
        wounds++;

        // Check for critical wound (6)
        if (roll === 6 && hasDevastatingWounds) {
          devastatingWounds++;
        }
      }
    }
  }

  if (wounds <= 0) return { totalDamage: 0, attacks: numAttacks, hits, wounds: 0, failedSaves: 0 };

  // Step 4: Roll saves (Devastating Wounds bypass saves and become mortal wounds)
  const saveTarget = parseSave(targetSave);
  const modifiedSave = Math.min(7, Math.max(2, saveTarget + Math.abs(ap)));

  const regularWounds = wounds - devastatingWounds;
  let failedSaves = 0;

  if (regularWounds > 0) {
    failedSaves = regularWounds - rollDiceTest(regularWounds, modifiedSave);
  }

  // Step 5: Roll damage for each failed save
  let totalDamage = 0;
  for (let i = 0; i < failedSaves; i++) {
    totalDamage += rollDamage(damageStr);
  }

  // Devastating Wounds become mortal wounds (1 damage each, no save)
  const mortalWounds = devastatingWounds;
  totalDamage += mortalWounds;

  const damageBeforeFNP = totalDamage;

  // Step 6: Roll Feel No Pain if present
  let fnpSaves = 0;
  if (targetFNP && targetFNP >= 2 && targetFNP <= 6 && totalDamage > 0) {
    fnpSaves = rollDiceTest(totalDamage, targetFNP);
    totalDamage = Math.max(0, totalDamage - fnpSaves);
  }

  return {
    totalDamage,
    attacks: numAttacks,
    hits,
    wounds,
    failedSaves,
    damageBeforeFNP: fnpSaves > 0 ? damageBeforeFNP : undefined,
    fnpSaves: fnpSaves > 0 ? fnpSaves : undefined,
    lethalHits: lethalHits > 0 ? lethalHits : undefined,
    sustainedHits: sustainedHitsGenerated > 0 ? sustainedHitsGenerated : undefined,
    devastatingWounds: devastatingWounds > 0 ? devastatingWounds : undefined,
    mortalWounds: mortalWounds > 0 ? mortalWounds : undefined
  };
}

/**
 * Calculate total damage for a unit using dice rolls
 */
export function calculateUnitDamageWithDice(
  unit: Unit,
  targetToughness: number,
  targetSave: string | null,
  useOvercharge: boolean = false,
  includeOneTimeWeapons: boolean = false,
  isCharging: boolean = false,
  targetFNP?: number
): number {
  let totalDamage = 0;

  for (const weapon of unit.weapons || []) {
    const result = calculateWeaponDamageWithDice(
      weapon,
      targetToughness,
      targetSave,
      useOvercharge,
      includeOneTimeWeapons,
      isCharging,
      unit.unitRerolls,
      targetFNP
    );

    totalDamage += result.totalDamage;
  }

  return totalDamage;
}
