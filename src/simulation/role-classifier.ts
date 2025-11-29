import type { Army, Unit, Weapon } from '../types';
import type { UnitRoleInfo, UnitRole } from './types';
import { getWeaponType } from '../utils/weapon';
import { parseNumeric } from '../utils/numeric';

function parseRange(rangeValue?: string): number {
  if (!rangeValue) return 12;
  // Remove quotes and non-digit characters then parse
  const match = rangeValue.match(/(\d+(\.\d+)?)/);
  if (!match) return 12;
  return parseFloat(match[1]);
}

function averageMove(unit: Unit): number {
  const moveStr = unit.stats.move || '';
  const match = moveStr.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 6;
}

function summarizeWeapons(unit: Unit) {
  let rangedAttacks = 0;
  let meleeAttacks = 0;
  let maxRange = 0;
  let hasIndirect = false;
  let hasTorrent = false;
  let hasMeltaOrRapid = false;

  unit.weapons.forEach((weapon: Weapon) => {
    const type = getWeaponType(weapon);
    const attacks = parseNumeric(weapon.characteristics?.a || '0') * (weapon.count || 1);
    const keywords = (weapon.characteristics?.keywords || '').toLowerCase();

    if (type === 'ranged' || type === 'pistol') {
      rangedAttacks += attacks;
      const range = parseRange(weapon.characteristics?.range);
      maxRange = Math.max(maxRange, range);
      if (keywords.includes('indirect')) hasIndirect = true;
      if (keywords.includes('torrent')) hasTorrent = true;
      if (keywords.includes('rapid fire') || keywords.includes('melta')) {
        hasMeltaOrRapid = true;
      }
    } else if (type === 'melee') {
      meleeAttacks += attacks;
    }
  });

  return { rangedAttacks, meleeAttacks, maxRange, hasIndirect, hasTorrent, hasMeltaOrRapid };
}

function deriveOptimalRange(unit: Unit, weaponSummary: ReturnType<typeof summarizeWeapons>): number {
  // No ranged weapons: optimal range is base contact
  if (weaponSummary.maxRange === 0) {
    return 0;
  }

  // Prefer half-range when leveraging Rapid Fire / Melta; otherwise drift to 75% of range
  const base = weaponSummary.hasMeltaOrRapid
    ? Math.max(6, weaponSummary.maxRange / 2)
    : Math.max(8, weaponSummary.maxRange * 0.75);

  // Torrent/in-your-face units often want to be closer to guarantee hits
  if (weaponSummary.hasTorrent) {
    return Math.max(6, base * 0.75);
  }

  return base;
}

function derivePrimaryRole(unit: Unit, weaponSummary: ReturnType<typeof summarizeWeapons>): UnitRole {
  const move = averageMove(unit);
  const toughness = parseNumeric(unit.stats.toughness || '0');
  const wounds = parseNumeric(unit.stats.wounds || '0');
  const oc = parseNumeric(unit.stats.objectiveControl || '1');
  const durabilityScore = toughness + wounds * 0.5 + oc * 0.25;

  if (weaponSummary.hasIndirect || weaponSummary.maxRange >= 36) {
    return 'artillery';
  }

  const isMeleePrimary = weaponSummary.meleeAttacks > weaponSummary.rangedAttacks * 1.2;
  if (isMeleePrimary && move >= 8) {
    return 'melee-missile';
  }

  if (durabilityScore >= 14 && oc >= 3) {
    return 'anvil';
  }

  const isRangedPrimary = weaponSummary.rangedAttacks >= weaponSummary.meleeAttacks * 1.1;
  const isShortRange = weaponSummary.maxRange > 0 && weaponSummary.maxRange <= 18;

  if (isRangedPrimary && move <= 6 && !isShortRange) {
    return 'gunline';
  }

  if (isRangedPrimary && move > 6) {
    return weaponSummary.maxRange <= 24 ? 'skirmisher' : 'mobile-firepower';
  }

  if (isShortRange) {
    return 'skirmisher';
  }

  return 'utility';
}

/**
 * Classify a unit into a coarse battlefield role and determine an optimal standoff/charge distance.
 */
export function classifyUnitRole(unit: Unit): UnitRoleInfo {
  const weaponSummary = summarizeWeapons(unit);
  const primary = derivePrimaryRole(unit, weaponSummary);
  const move = averageMove(unit);
  const optimalRange = deriveOptimalRange(unit, weaponSummary);

  // Expected charge range: move + average 2D6 (7")
  const chargeThreat = move + 7;

  const notes: string[] = [];
  if (weaponSummary.hasIndirect) notes.push('Indirect');
  if (weaponSummary.hasMeltaOrRapid) notes.push('Half-range spike');
  if (weaponSummary.hasTorrent) notes.push('Auto-hits up close');

  return {
    primary,
    secondary: weaponSummary.hasIndirect && primary !== 'artillery' ? 'artillery' : undefined,
    optimalRange,
    chargeThreat,
    notes: notes.length ? notes : undefined
  };
}

/**
 * Classify all units in an army to avoid recomputing per sim run.
 */
export function classifyArmyRoles(army: Army): Record<string, UnitRoleInfo> {
  const roleMap: Record<string, UnitRoleInfo> = {};
  army.units.forEach(unit => {
    roleMap[unit.id] = classifyUnitRole(unit);
  });
  return roleMap;
}
