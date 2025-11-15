/**
 * Type definitions for Warhammer 40K Unit Efficiency Analyzer
 */

/**
 * Types of re-roll mechanics in Warhammer 40K
 */
export enum RerollType {
  NONE = "none",           // No re-roll
  ONES = "ones",           // Re-roll 1s only
  FAILED = "failed",       // Re-roll failed rolls
  ALL = "all"              // Re-roll all rolls
}

/**
 * Re-roll configuration for a specific roll type
 */
export interface RerollConfig {
  hits?: RerollType;       // Re-roll for hit rolls
  wounds?: RerollType;     // Re-roll for wound rolls
  damage?: RerollType;     // Re-roll for damage rolls
}

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
  is_hazardous?: boolean;  // Whether the weapon has the Hazardous keyword
  rerolls?: RerollConfig;  // Re-roll configuration for this weapon
}

/**
 * Summary of a leader attached to a bodyguard unit
 */
export interface AttachedLeaderInfo {
  id: string;
  name: string;
  points: number;
  type: string;
  stats: UnitStats;
  weapons: Weapon[];
  rules?: string[];
  abilities?: string[];
}

export interface AttackModifiers {
  hit?: number;
  wound?: number;
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
  unitRerolls?: RerollConfig;  // Unit-wide re-roll abilities
  unitModifiers?: AttackModifiers; // Unit-wide hit/wound modifiers
  rules?: string[];            // Array of rule IDs
  abilities?: string[];        // Array of ability IDs
  isLeader?: boolean;          // Indicates if the unit can attach as a leader
  leaderOptions?: string[];    // Names of units this leader can join
  attachedLeaders?: AttachedLeaderInfo[]; // Leaders currently attached to this unit
  defaultHostId?: string;      // Host unit ID if roster pre-attached this leader
  leaderAuraRerolls?: RerollConfig; // Rerolls granted to a unit this leader is attached to
  leaderAuraModifiers?: AttackModifiers; // Hit/wound modifiers granted while leading
}

/**
 * Complete army roster
 */
export interface Army {
  armyName: string;
  faction: string;
  pointsTotal: number;
  units: Unit[];
  rules?: {
    [id: string]: {
      id: string;
      name: string;
      description: string;
      hidden?: boolean;
    }
  };
  abilities?: {
    [id: string]: {
      id: string;
      name: string;
      description: string;
      hidden?: boolean;
    }
  };
  attachments?: AttachmentMap;
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
  hazardousMortalWounds?: number;  // Expected mortal wounds from Hazardous tests
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

/**
 * Mapping of host unit IDs to the leader IDs currently attached
 */
export type AttachmentMap = Record<string, string[]>;
