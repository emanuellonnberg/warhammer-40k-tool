import type { Army, Unit } from '../types';

export type UnitRole =
  | 'gunline'
  | 'mobile-firepower'
  | 'skirmisher'
  | 'artillery'
  | 'melee-missile'
  | 'anvil'
  | 'utility';

export interface UnitRoleInfo {
  primary: UnitRole;
  secondary?: UnitRole;
  optimalRange: number;   // Preferred standoff distance (inches) for shooting
  chargeThreat: number;   // Threat distance to make melee contact (move + expected charge)
  notes?: string[];
}

export interface UnitState {
  unit: Unit;
  remainingModels: number;
  remainingWounds: number;
  role: UnitRoleInfo;
  position: { x: number; y: number }; // 2D position in inches
  engaged: boolean;
  modelPositions: { x: number; y: number; alive: boolean }[];
  baseSizeInches?: number;
  baseSizeMM?: number;
  advanced?: boolean;
  fellBack?: boolean;
  roleLabel?: string;
  // Battle Shock state
  battleShocked?: boolean;
  battleShockedUntilTurn?: number; // The Command phase turn when this status expires
  // Reserves tracking
  inReserves?: boolean;
  reserveType?: 'deep-strike' | 'strategic-reserves';
  arrivedTurn?: number; // Track which turn the unit arrived from reserves
}

export interface ArmyState {
  army: Army;
  units: UnitState[];
  tag: 'armyA' | 'armyB';
}

export type PhaseType = 'movement' | 'shooting' | 'charge' | 'melee' | 'command';

export interface ActionLog {
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  damage: number;
  phase: PhaseType;
  // Optional detailed breakdown for tooltips
  weaponName?: string;
  hits?: number;
  wounds?: number;
  failedSaves?: number;
  mortalWounds?: number;
  distance?: number;
  // Weapon characteristics for detailed tooltip
  attacks?: number;
  skill?: string;
  strength?: number;
  ap?: number;
  damageCharacteristic?: string;
  // Target stats
  targetToughness?: number;
  targetSave?: string;
  // Casualty details from this specific attack
  modelsKilled?: number;
  damagePerModel?: number;
  remainingWounds?: number;  // Wounds left on a partially damaged model
  totalModelsInUnit?: number; // Total models in defender unit after attack
  // Weapon ability results
  lethalHits?: number;
  sustainedHits?: number;
  devastatingWounds?: number;
}

export interface MovementDetail {
  unitId: string;
  unitName: string;
  army: 'armyA' | 'armyB';
  from: { x: number; y: number };
  to: { x: number; y: number };
  distance: number;
  advanced: boolean;
}

export interface CasualtyLog {
  unitId: string;
  unitName: string;
  modelsLost: number;
}

export interface PhaseLog {
  phase: PhaseType;
  turn: number;
  actor: 'armyA' | 'armyB';
  description: string;
  damageDealt?: number;
  casualties?: CasualtyLog[];
  distanceAfter?: number;
  actions?: ActionLog[];
  advancedUnits?: string[];
  movementDetails?: MovementDetail[];
  objectiveStates?: Array<{
    id: string;
    name: string;
    priority: 'primary' | 'secondary';
    controlledBy: 'armyA' | 'armyB' | 'contested';
    heldByA: number;
    heldByB: number;
    baseVp: number;
    holdNeeded: number;
    readyFor: 'armyA' | 'armyB' | null;
  }>;
}

export interface ObjectiveMarker {
  id: string;
  name: string;
  x: number;
  y: number;
  priority: 'primary' | 'secondary'; // Primary objectives worth more VP
  controlledBy: 'armyA' | 'armyB' | 'contested';
  levelOfControlA: number; // Sum of OC for armyA models in range
  levelOfControlB: number; // Sum of OC for armyB models in range
  // Hold tracking for hold-based VP scoring (e.g., "score VP after holding for 2 rounds")
  heldByA: number; // Number of consecutive rounds controlled by armyA
  heldByB: number; // Number of consecutive rounds controlled by armyB
  // Scoring info
  vpRewardA: number; // VP scored by armyA for controlling this objective this round
  vpRewardB: number; // VP scored by armyB for controlling this objective this round
  scoringUnitsA: string[]; // Unit names contributing to control (for logging)
  scoringUnitsB: string[]; // Unit names contributing to control (for logging)
}

export interface SimulationConfig {
  startingDistance?: number;
  includeOneTimeWeapons?: boolean;
  initiative?: 'armyA' | 'armyB';
  maxRounds?: number;
  allowAdvance?: boolean;
  randomCharge?: boolean;
  useDiceRolls?: boolean;  // If true, use actual dice rolls; if false, use expected values
  strategyProfile?: import('./planner').StrategyProfile;
  useBeamSearch?: boolean;
  beamWidth?: number;
  useAdaptiveStrategy?: boolean;  // If true, AI adapts strategy based on battle state
  missionScoring?: 'matched-play' | 'hold-2' | 'high-stakes';  // Mission scoring variant
}

export interface SimulationResult {
  startingDistance: number;
  initiative: 'armyA' | 'armyB';
  logs: PhaseLog[];
  armyAState: ArmyState;
  armyBState: ArmyState;
  battlefield: {
    width: number;
    height: number;
    deployDepth: number;
  };
  objectives?: ObjectiveMarker[];

  positions: {
    start: {
      armyA: SnapshotUnitState[];
      armyB: SnapshotUnitState[];
    };
    end: {
      armyA: SnapshotUnitState[];
      armyB: SnapshotUnitState[];
    };
  };
  positionsPerTurn?: Array<{
    turn: number;
    armyA: SnapshotUnitState[];
    armyB: SnapshotUnitState[];
  }>;
  positionsTimeline?: Array<{
    phaseIndex: number;
    turn: number;
    actor: 'armyA' | 'armyB';
    armyA: SnapshotUnitState[];
    armyB: SnapshotUnitState[];
  }>;
  endReason?: 'maxRounds' | 'armyDestroyed';
  winner?: 'armyA' | 'armyB' | null;
  summary: {
    armyA: {
      damageDealt: number;
      damageTaken: number;
      survivors: number;
      totalUnits: number;
      victoryPoints?: number;
    };
    armyB: {
      damageDealt: number;
      damageTaken: number;
      survivors: number;
      totalUnits: number;
      victoryPoints?: number;
    };
  };
}

export interface SnapshotModelPoint {
  index: number;
  x: number;
  y: number;
  alive?: boolean;
}

export interface SnapshotUnitState {
  unitId: string;
  name: string;
  x: number;
  y: number;
  remaining?: number;
  remainingWounds?: number;
  totalWounds?: number;
  engaged?: boolean;
  role?: string;
  baseRadius?: number;
  baseSizeMM?: number;
  baseSizeInches?: number;
  models?: SnapshotModelPoint[];
}
