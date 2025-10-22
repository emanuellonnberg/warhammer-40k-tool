/**
 * Weapon-related utility functions
 */

import type { Weapon, WeaponType } from '../types';

/**
 * Determine weapon type from weapon data
 * @param weapon - Weapon object
 * @returns Weapon type classification
 */
export function getWeaponType(weapon: Weapon): WeaponType {
  const type = weapon.type.toLowerCase();
  if (type.includes('pistol')) return 'pistol';
  if (type.includes('melee')) return 'melee';
  return 'ranged';
}

/**
 * Check if a weapon is one-time use (like seeker missiles)
 * @param weapon - Weapon object
 * @returns True if weapon is one-time use
 */
export function isOneTimeWeapon(weapon: Weapon): boolean {
  // Check if explicitly marked as one-time
  if (weapon.is_one_time) return true;

  // Check weapon name with broader matching
  const oneTimeKeywords = [
    'seeker missile', 'seeker missiles',
    'missile drone', 'missile drones',
    'one time', 'one-time',
    'single-use', 'single use',
    'hunter-killer', 'hunter killer'
  ];

  // Normalize the weapon name for more reliable matching
  const lowerName = weapon.name.toLowerCase().trim();

  // Check weapon keywords - more careful handling of undefined
  const keywordsAttribute = (weapon.characteristics?.keywords || '').toLowerCase();

  // Enhanced pattern matching
  for (const keyword of oneTimeKeywords) {
    if (lowerName.includes(keyword)) {
      // Special check for "seeker missile" to exclude "seeker missile rack"
      if ((keyword === 'seeker missile' || keyword === 'seeker missiles') && lowerName.includes('seeker missile rack')) {
        continue; // It's a rack, not a one-time missile; check other keywords
      }
      return true;
    }
    if (keywordsAttribute && keywordsAttribute.includes(keyword)) {
      // Similar check for keywords attribute
      if ((keyword === 'seeker missile' || keyword === 'seeker missiles') && keywordsAttribute.includes('seeker missile rack')) {
        continue; // It's a rack, not a one-time missile; check other keywords
      }
      return true;
    }
  }

  // Special case for hammerhead gunships and Longstrike
  if ((lowerName.includes('hammerhead') || lowerName.includes('longstrike')) &&
    lowerName.includes('missile') &&
    !lowerName.includes('rack')) { // Exclude if 'rack' is present
    return true;
  }

  return false;
}
