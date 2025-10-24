/**
 * Type definitions for Warhammer 40K Unit Efficiency Analyzer
 */

/**
 * Weapon characteristics from army data
 */
export interface Weapon {
  id: string;
  name: string;
  type: string;
  characteristics: { [key: string]: string };
  count: number;
  models_with_weapon: number;
  base_name?: string;
  overcharge_mode?: string;
  is_one_time?: boolean;
}

/**
 * Unit statistics
 */
export interface UnitStats {
  move: string;
  toughness: string;
  save: string;
  wounds: string;
  leadership: string;
  objectiveControl: string;
}

/**
 * Combat unit with weapons and stats
 */
export interface Unit {
  id: string;
  name: string;
  type: string;
  stats: UnitStats;
  points: number;
  count: number;
  weapons: Weapon[];
  linked_weapons?: {
    [key: string]: {
      standard: string | null;
      overcharge: string | null
    }
  };
}

/**
 * Complete army roster
 */
export interface Army {
  armyName: string;
  faction: string;
  pointsTotal: number;
  units: Unit[];
}

/**
 * Damage breakdown by weapon type
 */
export interface DamageBreakdown {
  total: number;
  ranged: number;
  melee: number;
  pistol: number;
  onetime: number;
}

/**
 * Weapon type classification
 */
export type WeaponType = 'ranged' | 'melee' | 'pistol';

/**
 * Special rules calculation result
 */
export interface SpecialRulesResult {
  totalDamage: number;
  breakdown: string;
}

/**
 * Efficiency classification for styling
 */
export type EfficiencyClass = 'high-efficiency' | 'medium-efficiency' | 'low-efficiency';

/**
 * Sort column types
 */
export type SortColumn = 'name' | 'points' | 'efficiency' | 'dpp' | 'rangeddpp' | 'meleedpp' | 'ranged' | 'melee' | 'pistol' | 'onetime';

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';
