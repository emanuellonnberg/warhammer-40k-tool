/**
 * Damage calculation logic for Warhammer 40K weapons and units
 */

import type { Weapon, Unit, DamageBreakdown } from '../types';
import { parseNumeric, parseDamage } from '../utils/numeric';
import { getWeaponType, isOneTimeWeapon } from '../utils/weapon';
import { applySpecialRules } from '../rules/special-weapons';

/**
 * Check if two weapons have identical characteristics
 */
function weaponsAreIdentical(w1: Weapon, w2: Weapon): boolean {
  const chars1 = w1.characteristics;
  const chars2 = w2.characteristics;

  // Compare all characteristics
  const keys = new Set([...Object.keys(chars1), ...Object.keys(chars2)]);
  for (const key of keys) {
    if (chars1[key] !== chars2[key]) {
      return false;
    }
  }

  // Also check if they have the same type
  return w1.type === w2.type;
}

/**
 * Combine identical weapons by summing their counts
 */
function combineIdenticalWeapons(weapons: Weapon[]): Weapon[] {
  if (weapons.length <= 1) return weapons;

  // Check if all weapons are identical
  const allIdentical = weapons.every(w => weaponsAreIdentical(w, weapons[0]));

  if (allIdentical) {
    // Combine into a single weapon with summed count and models_with_weapon
    const combined: Weapon = {
      ...weapons[0],
      count: weapons.reduce((sum, w) => sum + w.count, 0),
      models_with_weapon: weapons.reduce((sum, w) => sum + w.models_with_weapon, 0)
    };
    return [combined];
  }

  return weapons;
}


/**
 * Calculate weapon damage output with special rules
 * @param weapon - Weapon to analyze
 * @param targetToughness - Target's toughness value
 * @param useOvercharge - Whether to use overcharge mode
 * @param includeOneTimeWeapons - Whether to include one-time weapons
 * @param optimalRange - Whether at optimal range for Rapid Fire/Melta
 * @param targetKeywords - Array of target unit keywords (for Anti- rules)
 * @param targetUnitSize - Number of models in target unit (for Blast weapons)
 * @param isCharging - Whether the attacker is charging (for Lance weapons)
 * @param targetSave - Target's save characteristic (e.g., "3+", null for no save)
 * @returns Expected damage value
 */
export function calculateWeaponDamage(
  weapon: Weapon,
  targetToughness: number,
  useOvercharge: boolean = false,
  includeOneTimeWeapons: boolean = false,
  optimalRange: boolean = true,
  targetKeywords: string[] = [],
  targetUnitSize: number = 1,
  isCharging: boolean = false,
  targetSave: string | null = null
): number {
  // Skip one-time weapons if not included
  if (isOneTimeWeapon(weapon) && !includeOneTimeWeapons) {
    return 0;
  }

  const chars = weapon.characteristics;

  // Get weapon stats with correct keys
  let strength = parseNumeric(chars.s || "0");
  let attacks = parseNumeric(chars.a || "0");
  let damage = parseDamage(chars.d || "0");
  let ap = parseNumeric(chars.ap || "0");

  // Check for overcharge mode
  if (useOvercharge && weapon.overcharge_mode) {
    const overchargeChars = weapon.overcharge_mode.split(',').reduce((acc, curr) => {
      const [key, value] = curr.trim().split(':').map(s => s.trim());
      acc[key] = value;
      return acc;
    }, {} as { [key: string]: string });

    // Update stats with overcharge values
    if (overchargeChars.s) strength = parseNumeric(overchargeChars.s);
    if (overchargeChars.d) damage = parseDamage(overchargeChars.d);
    if (overchargeChars.ap) ap = parseNumeric(overchargeChars.ap);
  }

  // Calculate hit chance based on BS/WS (or special rules)
  const keywords = chars.keywords || "";
  let hitChance = 2 / 3; // Default to 4+

  // Torrent weapons automatically hit
  if (keywords.toLowerCase().includes("torrent")) {
    hitChance = 1; // 100% hit chance
  } else {
    // Check for BS (ranged) or WS (melee)
    const skill = chars.bs || chars.ws || "4+";
    if (skill === "2+") hitChance = 5 / 6;
    if (skill === "3+") hitChance = 2 / 3;
    if (skill === "4+") hitChance = 1 / 2;
    if (skill === "5+") hitChance = 1 / 3;
    if (skill === "6+") hitChance = 1 / 6;
  }

  // Calculate wound chance
  let woundChance = 0;
  if (strength >= targetToughness * 2) {
    woundChance = 5 / 6; // 2+
  } else if (strength > targetToughness) {
    woundChance = 2 / 3; // 3+
  } else if (strength === targetToughness) {
    woundChance = 1 / 2; // 4+
  } else if (strength * 2 <= targetToughness) {
    woundChance = 1 / 6; // 6+
  } else {
    woundChance = 1 / 3; // 5+
  }

  // Apply special weapon rules
  const specialRules = applySpecialRules(
    weapon,
    attacks,
    hitChance,
    woundChance,
    damage,
    targetToughness,
    optimalRange,
    targetKeywords,
    targetUnitSize,
    isCharging,
    targetSave,
    Math.abs(ap) // Convert AP to positive number (AP -3 becomes 3)
  );

  // Calculate and return expected damage
  return weapon.count * specialRules.totalDamage;
}

/**
 * Calculate total damage for a unit across all weapons
 * @param unit - Unit to analyze
 * @param targetToughness - Target's toughness value
 * @param useOvercharge - Whether to use overcharge mode
 * @param activeModes - Map of active weapon modes
 * @param includeOneTimeWeapons - Whether to include one-time weapons
 * @param optimalRange - Whether at optimal range
 * @param targetKeywords - Array of target unit keywords (for Anti- rules)
 * @param targetUnitSize - Number of models in target unit (for Blast weapons)
 * @param isCharging - Whether the attacker is charging (for Lance weapons)
 * @param targetSave - Target's save characteristic (e.g., "3+", null for no save)
 * @returns Damage breakdown by weapon type
 */
export function calculateUnitDamage(
  unit: Unit,
  targetToughness: number,
  useOvercharge: boolean = false,
  activeModes?: Map<string, number>,
  includeOneTimeWeapons: boolean = false,
  optimalRange: boolean = true,
  targetKeywords: string[] = [],
  targetUnitSize: number = 1,
  isCharging: boolean = false,
  targetSave: string | null = null
): DamageBreakdown {
  const damages: DamageBreakdown = {
    total: 0,
    ranged: 0,
    melee: 0,
    pistol: 0,
    onetime: 0
  };

  // Group weapons by base name to handle standard/overcharge variants
  const weaponGroups = new Map<string, Weapon[]>();
  unit.weapons.forEach(weapon => {
    const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
    if (!weaponGroups.has(baseName)) {
      weaponGroups.set(baseName, []);
    }
    weaponGroups.get(baseName)!.push(weapon);
  });

  // Combine identical weapons within each group
  weaponGroups.forEach((weapons, baseName) => {
    weaponGroups.set(baseName, combineIdenticalWeapons(weapons));
  });

  // Check if unit has ranged weapons
  const hasRangedWeapons = Array.from(weaponGroups.values()).some(weapons => {
    const weapon = weapons[0];
    return getWeaponType(weapon) === 'ranged' && (!isOneTimeWeapon(weapon) || includeOneTimeWeapons);
  });

  // Calculate damage for each weapon group
  weaponGroups.forEach((weapons, baseName) => {
    // Skip if there's no weapon
    if (weapons.length === 0) return;

    // Handle standard/overcharge weapons
    const standardWeapon = weapons.find(w => w.name.includes('standard') || !w.name.includes('overcharge'));
    const overchargeWeapon = weapons.find(w => w.name.includes('overcharge'));

    if (standardWeapon && overchargeWeapon) {
      // Use overcharge weapon if toggled, otherwise use standard
      const activeWeapon = useOvercharge ? overchargeWeapon : standardWeapon;
      const weaponType = getWeaponType(activeWeapon);

      // Skip pistols if there are other ranged weapons
      if (weaponType === 'pistol' && hasRangedWeapons) return;

      const damage = calculateWeaponDamage(activeWeapon, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, targetKeywords, targetUnitSize, isCharging, targetSave);

      // Track one-time weapon damage separately
      if (isOneTimeWeapon(activeWeapon) && includeOneTimeWeapons) {
        damages.onetime += damage;
      }

      damages[weaponType] += damage;
      damages.total += damage;
    }
    // Handle weapons with multiple modes (like Dawn Blade)
    else if (weapons.length > 1 && activeModes) {
      // Get the active weapon based on the toggle state
      const activeMode = activeModes.get(baseName) || 0;
      const activeWeapon = weapons[activeMode];
      const weaponType = getWeaponType(activeWeapon);

      // Skip pistols if there are other ranged weapons
      if (weaponType === 'pistol' && hasRangedWeapons) return;

      const damage = calculateWeaponDamage(activeWeapon, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, targetKeywords, targetUnitSize, isCharging, targetSave);

      // Track one-time weapon damage separately
      if (isOneTimeWeapon(activeWeapon) && includeOneTimeWeapons) {
        damages.onetime += damage;
      }

      damages[weaponType] += damage;
      damages.total += damage;
    }
    // Regular weapon
    else {
      const weapon = weapons[0];
      const weaponType = getWeaponType(weapon);

      // Skip pistols if there are other ranged weapons
      if (weaponType === 'pistol' && hasRangedWeapons) return;

      const damage = calculateWeaponDamage(weapon, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, targetKeywords, targetUnitSize, isCharging, targetSave);

      // Track one-time weapon damage separately
      if (isOneTimeWeapon(weapon) && includeOneTimeWeapons) {
        damages.onetime += damage;
      }

      damages[weaponType] += damage;
      damages.total += damage;
    }
  });

  return damages;
}
