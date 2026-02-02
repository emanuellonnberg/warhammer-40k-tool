import type { Army } from '../types';
import type {
  ArmyState,
  UnitState,
  SimulationConfig,
  SimulationResult,
  PhaseLog,
  ActionLog,
  CasualtyLog,
  MovementDetail,
  ObjectiveMarker,
  UnitRoleInfo
} from './types';
import { classifyArmyRoles } from './role-classifier';
import { pickStartingDistance } from './distance';
import { calculateUnitDamage, calculateWeaponDamage } from '../calculators';
import type { Weapon, Unit } from '../types';
import { getWeaponType } from '../utils/weapon';
import { lookupBaseSizeMM } from '../data/base-sizes';
import { calculateUnitDamageWithDice, calculateWeaponDamageWithDice } from './dice-damage';
import { resolveBattleShock, formatBattleShockResult } from './battle-shock';
import { evaluateBattleState, recommendStrategy, explainStrategyChoice } from './battle-evaluator';
import { rollMultipleD6 } from './dice';
import { parseNumeric } from '../utils/numeric';
import { planMovement, type StrategyProfile, generateNavMesh, isUnitInfantry, isUnitLargeModel, getUnitBaseRadius, unitIgnoresObscuring } from './planner';
import {
  calculateVictoryPoints as calculateVictoryPointsEnhanced,
  getObjectiveSummary as getObjectiveSummaryEnhanced,
  DEFAULT_OBJECTIVE_SCORING,
  getMissionScoringConfig,
  type ObjectiveScoringConfig
} from './objective-scoring';
import type { TerrainFeature, TerrainLayout, Point } from './terrain';
import { createGTLayout, isMovementBlocked, checkLineOfSight, getTerrainCover, isPositionBlockedByTerrain } from './terrain';
import { findPath, euclideanDistance, getMaxTravelPoint } from './pathfinding';
import type { NavMesh } from './pathfinding';

const DEFAULT_INITIATIVE: 'armyA' | 'armyB' = 'armyA';
const DEPLOY_SPREAD_Y = 3; // inches between unit centers vertically
const DEFAULT_MODEL_SPACING = 1.25;
const INCHES_PER_MM = 1 / 25.4;
const MODEL_PER_ROW = 5;
const TERRAIN_PUSH_BUFFER = 0.5; // extra clearance when pushing units out of terrain
const BASE_RADII: { match: RegExp; radius: number }[] = [
  { match: /(knight|lord of|baneblade|wraithknight)/i, radius: 3 },
  { match: /(land raider|predator|hammerhead|riptide|monolith|castigator)/i, radius: 2.5 },
  { match: /(dread|crisis|terminator|broadsides|wraithlord)/i, radius: 1.25 },
  { match: /(infantry|squad|team|sisters|cultist|pathfinder|fire warrior|boyz|gaunt|guardian)/i, radius: 1 }
];

function getUnitModelCount(unit: Unit): number {
  if (Array.isArray(unit.models) && unit.models.length) {
    const sum = unit.models.reduce((acc, model) => acc + (model.count || 0), 0);
    if (sum > 0) return sum;
  }
  if (unit.count && unit.count > 1) return unit.count;
  const weaponMax = unit.weapons.reduce((max, weapon) => {
    const modelsWith = weapon.models_with_weapon ?? weapon.count ?? 0;
    return Math.max(max, modelsWith);
  }, 0);
  if (weaponMax > 0) return weaponMax;
  return Math.max(1, unit.count || 1);
}

/**
 * Create model formation following unit coherency rules:
 * - All models within 2" horizontal (and 5" vertical) of at least one other model
 * - Units with 7+ models: within 2" of at least TWO other models
 * - Models are arranged in lines/blocks for tactical realism
 */
function createModelFormation(
  count: number,
  centerX: number,
  centerY: number,
  spacing: number = DEFAULT_MODEL_SPACING
): { x: number; y: number; alive: boolean }[] {
  if (count <= 0) return [];

  // Ensure spacing is at least enough for coherency (2" rule)
  // But models should be within 2" of each other, so max spacing is ~2"
  const coherentSpacing = Math.min(spacing, 2.0);

  const perRow = Math.max(1, Math.min(MODEL_PER_ROW, Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / perRow);
  const positions: { x: number; y: number; alive: boolean }[] = [];
  const rowOffset = (rows - 1) / 2;
  const colOffset = (perRow - 1) / 2;

  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = centerX + (col - colOffset) * coherentSpacing;
    const y = centerY + (row - rowOffset) * coherentSpacing;
    positions.push({ x, y, alive: true });
  }
  return positions;
}

/**
 * Shift model positions by the given delta (immutable operation)
 * Returns true if positions were updated, false otherwise
 */
function shiftModelPositions(unit: UnitState, dx: number, dy: number): boolean {
  if ((!dx && !dy) || !unit.modelPositions) return false;
  unit.modelPositions = unit.modelPositions.map(model => ({
    ...model,
    x: model.x + dx,
    y: model.y + dy
  }));
  return true;
}

/**
 * Update model alive status based on remaining models (immutable operation)
 * Ensures all alive models come first, then all dead models
 */
function updateModelLife(unit: UnitState): void {
  if (!unit.modelPositions) return;
  unit.modelPositions = unit.modelPositions.map((model, idx) => ({
    ...model,
    alive: idx < unit.remainingModels
  }));
}

/**
 * Check if unit has Scout ability and extract the distance
 * Returns the scout distance in inches (e.g., "Scouts 6\"" returns 6)
 * Returns 0 if no Scout ability
 */
function getScoutDistance(unit: Unit): number {
  const text = [
    ...(unit.rules || []).map(r => r.toLowerCase?.() || ''),
    ...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : ''))
  ].join(' ');

  // Look for "scout X" or "scouts X"
  const scoutMatch = text.match(/scouts?\s+(\d+)/);
  if (scoutMatch) {
    return parseInt(scoutMatch[1], 10);
  }

  // Default scout distance if "scout" keyword exists
  if (text.includes('scout')) {
    return 6; // Default scout move
  }

  return 0;
}

function hasScout(unit: Unit): boolean {
  return getScoutDistance(unit) > 0;
}

/**
 * Check if unit has Infiltrator ability
 * Infiltrators can deploy anywhere more than 9" from enemy deployment zone and enemy models
 */
function hasInfiltrator(unit: Unit): boolean {
  const text = [
    ...(unit.rules || []).map(r => r.toLowerCase?.() || ''),
    ...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : ''))
  ].join(' ');
  return text.includes('infiltrator');
}

function hasDeepStrike(unit: Unit, army?: Army): boolean {
  // Collect text from rules and abilities
  const textParts: string[] = [];

  // If army rules are available, look up actual rule names/descriptions by ID
  if (army?.rules) {
    for (const ruleId of unit.rules || []) {
      const rule = army.rules[ruleId];
      if (rule) {
        textParts.push(rule.name.toLowerCase());
        textParts.push(rule.description.toLowerCase());
      }
    }
  }

  // If army abilities are available, look up actual ability names/descriptions by ID
  if (army?.abilities) {
    for (const abilityId of unit.abilities || []) {
      const ability = army.abilities[abilityId];
      if (ability) {
        textParts.push(ability.name.toLowerCase());
        textParts.push(ability.description.toLowerCase());
      }
    }
  }

  // Fallback: if no army provided, try direct string matching (for old format or tests)
  if (!army) {
    textParts.push(...(unit.rules || []).map(r => r.toLowerCase?.() || ''));
    textParts.push(...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : '')));
  }

  const text = textParts.join(' ');
  return text.includes('deep strike') || text.includes('deepstrike');
}

function hasStrategicReserves(unit: Unit, army?: Army): boolean {
  // Collect text from rules and abilities
  const textParts: string[] = [];

  // If army rules are available, look up actual rule names/descriptions by ID
  if (army?.rules) {
    for (const ruleId of unit.rules || []) {
      const rule = army.rules[ruleId];
      if (rule) {
        textParts.push(rule.name.toLowerCase());
        textParts.push(rule.description.toLowerCase());
      }
    }
  }

  // If army abilities are available, look up actual ability names/descriptions by ID
  if (army?.abilities) {
    for (const abilityId of unit.abilities || []) {
      const ability = army.abilities[abilityId];
      if (ability) {
        textParts.push(ability.name.toLowerCase());
        textParts.push(ability.description.toLowerCase());
      }
    }
  }

  // Fallback: if no army provided, try direct string matching (for old format or tests)
  if (!army) {
    textParts.push(...(unit.rules || []).map(r => r.toLowerCase?.() || ''));
    textParts.push(...(unit.abilities || []).map(a => (typeof a === 'string' ? a.toLowerCase() : '')));
  }

  const text = textParts.join(' ');
  return text.includes('strategic reserve');
}

/**
 * Determine reserve type for a unit
 * Returns 'deep-strike', 'strategic-reserves', or null
 */
function getReserveType(unit: Unit, army?: Army): 'deep-strike' | 'strategic-reserves' | null {
  if (hasDeepStrike(unit, army)) return 'deep-strike';
  if (hasStrategicReserves(unit, army)) return 'strategic-reserves';
  return null;
}

/**
 * Create 5 objective markers following standard mission layout:
 * - 1 in center
 * - 2 in no-man's land (between deployment zones)
 * - 1 in each deployment zone
 */
function createObjectiveMarkers(
  battlefieldWidth: number,
  battlefieldHeight: number,
  deployDepth: number
): ObjectiveMarker[] {
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;

  return [
    // Center objective (primary - most contested)
    {
      id: 'obj-center',
      name: 'Center Objective',
      x: 0,
      y: 0,
      priority: 'primary',
      controlledBy: 'contested',
      levelOfControlA: 0,
      levelOfControlB: 0,
      heldByA: 0,
      heldByB: 0,
      vpRewardA: 0,
      vpRewardB: 0,
      scoringUnitsA: [],
      scoringUnitsB: []
    },

    // No-man's land objectives (between deployment zones, left and right) - secondary
    {
      id: 'obj-nml-left',
      name: 'Left Flank Objective',
      x: 0,
      y: -halfH / 2,
      priority: 'secondary',
      controlledBy: 'contested',
      levelOfControlA: 0,
      levelOfControlB: 0,
      heldByA: 0,
      heldByB: 0,
      vpRewardA: 0,
      vpRewardB: 0,
      scoringUnitsA: [],
      scoringUnitsB: []
    },
    {
      id: 'obj-nml-right',
      name: 'Right Flank Objective',
      x: 0,
      y: halfH / 2,
      priority: 'secondary',
      controlledBy: 'contested',
      levelOfControlA: 0,
      levelOfControlB: 0,
      heldByA: 0,
      heldByB: 0,
      vpRewardA: 0,
      vpRewardB: 0,
      scoringUnitsA: [],
      scoringUnitsB: []
    },

    // Deployment zone objectives (one in each DZ, positioned 9" from edge) - primary
    {
      id: 'obj-dz-armyA',
      name: "Army A's Objective",
      x: -halfW + 9,
      y: 0,
      priority: 'primary',
      controlledBy: 'contested',
      levelOfControlA: 0,
      levelOfControlB: 0,
      heldByA: 0,
      heldByB: 0,
      vpRewardA: 0,
      vpRewardB: 0,
      scoringUnitsA: [],
      scoringUnitsB: []
    },
    {
      id: 'obj-dz-armyB',
      name: "Army B's Objective",
      x: halfW - 9,
      y: 0,
      priority: 'primary',
      controlledBy: 'contested',
      levelOfControlA: 0,
      levelOfControlB: 0,
      heldByA: 0,
      heldByB: 0,
      vpRewardA: 0,
      vpRewardB: 0,
      scoringUnitsA: [],
      scoringUnitsB: []
    }
  ];
}

/**
 * Calculate victory points based on objective control
 * Uses mission scoring config (default matched play: 5 VP for controlling more objectives than opponent at end of turn)
 */
function calculateVictoryPoints(objectives: ObjectiveMarker[], config?: any): { armyA: number; armyB: number } {
  return calculateVictoryPointsEnhanced(objectives, config || DEFAULT_OBJECTIVE_SCORING);
}

/**
 * Update objective control based on models within range
 * Per 40K 10th Edition Core Rules:
 * - A model can control an objective if within 3" horizontally AND 5" vertically
 * - Level of Control = sum of all OC (Objective Control) values from models in range
 * - A model's contribution = OC stat × number of remaining models in that unit
 * 
 * Objectives are updated immutably with new control values and owner
 */
function updateObjectiveControl(
  objectives: ObjectiveMarker[],
  stateA: ArmyState,
  stateB: ArmyState
): void {
  // Range requirements: 3" horizontal (x-axis in battlefield) and 5" vertical (y-axis)
  const CONTROL_RANGE_HORIZONTAL = 3;
  const CONTROL_RANGE_VERTICAL = 5;

  for (let i = 0; i < objectives.length; i++) {
    const obj = objectives[i];
    let levelOfControlA = 0;
    let levelOfControlB = 0;
    const unitsControllingA: string[] = [];
    const unitsControllingB: string[] = [];

    // Calculate Level of Control for armyA
    for (const u of stateA.units) {
      // Skip units with no remaining models or units in reserves (not on battlefield)
      if (u.remainingModels <= 0 || u.inReserves) continue;

      // Battle-shocked units have OC of 0 per 40K rules
      if (u.battleShocked) continue;

      const dx = Math.abs(u.position.x - obj.x);
      const dy = Math.abs(u.position.y - obj.y);

      // Check if unit is within control range
      if (dx <= CONTROL_RANGE_HORIZONTAL && dy <= CONTROL_RANGE_VERTICAL) {
        const oc = parseInt(u.unit.stats.objectiveControl || '0', 10);
        const contribution = oc * u.remainingModels;
        levelOfControlA += contribution;

        // Track which units contribute for debugging
        if (oc > 0) {
          unitsControllingA.push(`${u.unit.name} (${u.remainingModels} models × OC${oc} = ${contribution})`);
        }
      }
    }

    // Calculate Level of Control for armyB
    for (const u of stateB.units) {
      // Skip units with no remaining models or units in reserves (not on battlefield)
      if (u.remainingModels <= 0 || u.inReserves) continue;

      // Battle-shocked units have OC of 0 per 40K rules
      if (u.battleShocked) continue;

      const dx = Math.abs(u.position.x - obj.x);
      const dy = Math.abs(u.position.y - obj.y);

      // Check if unit is within control range
      if (dx <= CONTROL_RANGE_HORIZONTAL && dy <= CONTROL_RANGE_VERTICAL) {
        const oc = parseInt(u.unit.stats.objectiveControl || '0', 10);
        const contribution = oc * u.remainingModels;
        levelOfControlB += contribution;

        // Track which units contribute for debugging
        if (oc > 0) {
          unitsControllingB.push(`${u.unit.name} (${u.remainingModels} models × OC${oc} = ${contribution})`);
        }
      }
    }

    // Determine control based on Level of Control comparison
    let controlledBy: 'armyA' | 'armyB' | 'contested';
    if (levelOfControlA > levelOfControlB) {
      controlledBy = 'armyA';
    } else if (levelOfControlB > levelOfControlA) {
      controlledBy = 'armyB';
    } else {
      // Tied or both zero = contested
      controlledBy = 'contested';
    }

    // Determine control and update hold time
    const previousController = obj.controlledBy;

    // Update hold timers
    let heldByA = obj.heldByA || 0;
    let heldByB = obj.heldByB || 0;

    if (controlledBy === 'armyA') {
      heldByA = (previousController === 'armyA' ? heldByA : 0) + 1;
      heldByB = 0;
    } else if (controlledBy === 'armyB') {
      heldByB = (previousController === 'armyB' ? heldByB : 0) + 1;
      heldByA = 0;
    } else {
      // Contested - reset hold times
      heldByA = 0;
      heldByB = 0;
    }

    // Update objective with new values (create new object for immutability)
    objectives[i] = {
      ...obj,
      levelOfControlA,
      levelOfControlB,
      controlledBy,
      heldByA,
      heldByB,
      scoringUnitsA: unitsControllingA,
      scoringUnitsB: unitsControllingB
    };
  }
}

/**
 * Calculate X position based on unit role and deployment zone
 * - Infiltrators: Deploy forward in no-man's land (beyond deployment zone but >9" from enemy zone)
 * - Artillery/Gunline: Back of deployment (0-4" from edge)
 * - Mobile firepower: Mid deployment (4-8" from edge)
 * - Melee/Anvil: Forward deployment (8-12" from edge)
 */
function calculateDeploymentX(
  role: string,
  tag: 'armyA' | 'armyB',
  deployDepth: number,
  battlefieldWidth: number,
  hasScoutAbility: boolean,
  hasInfiltratorAbility: boolean
): number {
  const halfW = battlefieldWidth / 2;
  const edgePosition = tag === 'armyA' ? -halfW : halfW;

  // Infiltrators deploy in no-man's land, beyond deployment zone
  // Must be >9" from enemy deployment zone (which starts at 12" from their edge)
  if (hasInfiltratorAbility) {
    // Enemy deployment zone edge is at ±(halfW - deployDepth) from center
    // We need to be >9" from that, so max advance is deployDepth + 9" toward enemy
    // But stay a bit conservative to ensure >9" rule
    const maxAdvance = deployDepth + 6; // 12" + 6" = 18" from our edge
    return tag === 'armyA'
      ? edgePosition + maxAdvance
      : edgePosition - maxAdvance;
  }

  // Base deployment depth based on role
  let depthFromEdge: number;
  switch (role) {
    case 'gunline':
    case 'artillery':
      depthFromEdge = 2; // 0-4" from edge
      break;
    case 'anvil':
    case 'melee-missile':
      depthFromEdge = 10; // 8-12" from edge
      break;
    default: // mobile, skirmisher, etc.
      depthFromEdge = 6; // 4-8" from edge
  }

  // Scouts deploy at forward edge of deployment zone
  if (hasScoutAbility) {
    depthFromEdge = Math.min(11, deployDepth - 1);
  }

  // Calculate position (positive means toward center)
  return tag === 'armyA'
    ? edgePosition + depthFromEdge
    : edgePosition - depthFromEdge;
}

/**
 * Assess the threat level of an enemy unit
 * Higher score = more dangerous
 */
function assessUnitThreat(
  unit: Unit,
  role: UnitRoleInfo | undefined
): number {
  let threat = 0;

  // Base threat from role
  switch (role?.primary) {
    case 'melee-missile':
      threat += 10; // High threat, can close distance and wreck havoc
      break;
    case 'gunline':
      threat += 8; // High ranged damage output
      break;
    case 'artillery':
      threat += 7; // Devastating long-range firepower
      break;
    case 'mobile-firepower':
      threat += 6; // Flexible and dangerous
      break;
    case 'anvil':
      threat += 4; // Durable but less threatening offensively
      break;
    case 'skirmisher':
      threat += 5; // Moderate threat
      break;
    default:
      threat += 3;
  }

  // Boost threat based on weapon characteristics
  for (const weapon of unit.weapons) {
    const chars = weapon.characteristics;
    const attacks = parseInt(chars.a || '0', 10) || 0;
    const ap = Math.abs(parseInt(chars.ap || '0', 10));

    // High volume of attacks increases threat
    if (attacks > 10) threat += 2;
    else if (attacks > 5) threat += 1;

    // High AP increases threat
    if (ap >= 3) threat += 2;
    else if (ap >= 2) threat += 1;
  }

  // Scout and Infiltrator abilities increase threat (they can get close fast)
  if (hasScout(unit)) threat += 2;
  if (hasInfiltrator(unit)) threat += 3;

  return threat;
}

/**
 * Find the most threatening enemy units already deployed
 */
function identifyThreats(
  opponentDeployed: UnitState[]
): UnitState[] {
  const threatsWithScores = opponentDeployed.map(enemy => ({
    unit: enemy,
    threat: assessUnitThreat(enemy.unit, enemy.role)
  }));

  // Sort by threat level (highest first)
  threatsWithScores.sort((a, b) => b.threat - a.threat);

  // Return top 3 threats
  return threatsWithScores.slice(0, 3).map(t => t.unit);
}

/**
 * Calculate Y position for a unit being deployed with counter-deployment strategy
 * Spreads units across the battlefield width, considering already-deployed units
 * and threats from opponent
 */
function calculateDeploymentY(
  deployedUnits: UnitState[],
  battlefieldHeight: number,
  tag: 'armyA' | 'armyB',
  myRole: UnitRoleInfo | undefined,
  opponentDeployed: UnitState[],
  myUnit: Unit,
  isDefender: boolean
): number {
  if (deployedUnits.length === 0) {
    // First unit goes in the center
    return 0;
  }

  const halfH = battlefieldHeight / 2;

  // If we're the defender, use threat assessment for counter-deployment
  if (isDefender && opponentDeployed.length > 0) {
    const threats = identifyThreats(opponentDeployed);

    // Counter-deployment strategy based on our role
    if (myRole?.primary === 'melee-missile') {
      // Melee units: avoid enemy gunlines, target anvils or other melee
      const gunlineThreats = threats.filter(t =>
        t.role?.primary === 'gunline' || t.role?.primary === 'artillery'
      );

      if (gunlineThreats.length > 0) {
        // Deploy away from gunlines
        const avgGunlineY = gunlineThreats.reduce((sum, t) => sum + t.position.y, 0) / gunlineThreats.length;
        // Deploy on opposite flank
        return avgGunlineY > 0 ? -halfH / 2 : halfH / 2;
      }
    } else if (myRole?.primary === 'gunline' || myRole?.primary === 'artillery') {
      // Gunline units: position to shoot enemy melee threats
      const meleeThreats = threats.filter(t => t.role?.primary === 'melee-missile');

      if (meleeThreats.length > 0) {
        // Match Y position to target them
        const mostDangerousMelee = meleeThreats[0];
        return mostDangerousMelee.position.y;
      }
    } else if (myRole?.primary === 'mobile-firepower' || myRole?.primary === 'skirmisher') {
      // Mobile units: position for flanking
      const enemyConcentration = opponentDeployed.reduce((sum, u) => sum + u.position.y, 0) / opponentDeployed.length;

      // Deploy on the flank opposite to enemy concentration for flanking
      return enemyConcentration > 0 ? -halfH / 2 : halfH / 2;
    } else if (myRole?.primary === 'anvil') {
      // Anvil units: protect backline, stay near our important units
      const ownGunlines = deployedUnits.filter(u =>
        u.role?.primary === 'gunline' || u.role?.primary === 'artillery'
      );

      if (ownGunlines.length > 0) {
        // Stay near our gunlines to protect them
        const avgGunlineY = ownGunlines.reduce((sum, u) => sum + u.position.y, 0) / ownGunlines.length;
        return avgGunlineY;
      }
    }
  }

  // Default: Find gaps in Y positioning and place new unit to spread out
  const yPositions = deployedUnits.map(u => u.position.y).sort((a, b) => a - b);

  let bestY = 0;
  let maxGap = 0;

  for (let i = 0; i <= yPositions.length; i++) {
    const prevY = i === 0 ? -halfH : yPositions[i - 1];
    const nextY = i === yPositions.length ? halfH : yPositions[i];
    const gap = nextY - prevY;

    if (gap > maxGap) {
      maxGap = gap;
      bestY = (prevY + nextY) / 2;
    }
  }

  return bestY;
}

/**
 * Initialize a single unit's state for deployment
 */
function createUnitState(
  unit: Unit,
  role: ReturnType<typeof classifyArmyRoles>[string],
  tag: 'armyA' | 'armyB',
  deployDepth: number,
  battlefieldWidth: number,
  xPos: number,
  yPos: number,
  inReserves?: boolean,
  reserveType?: 'deep-strike' | 'strategic-reserves'
): UnitState {
  const modelCount = getUnitModelCount(unit);
  const woundsPerModel = parseInt(unit.stats.wounds || '1', 10) || 1;
  const baseSizeMM = lookupBaseSizeMM(unit.name);
  const baseSizeInches = baseSizeMM ? baseSizeMM * INCHES_PER_MM : undefined;
  const spacing = Math.max(baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);

  return {
    unit,
    remainingModels: modelCount,
    remainingWounds: modelCount * woundsPerModel,
    role,
    position: { x: xPos, y: yPos },
    engaged: false,
    modelPositions: inReserves ? [] : createModelFormation(modelCount, xPos, yPos, spacing),
    baseSizeInches,
    baseSizeMM,
    advanced: false,
    fellBack: false,
    roleLabel: role?.primary,
    inReserves,
    reserveType
  };
}

/**
 * Create a unit in reserves (off-table)
 */
function createUnitInReserves(
  unit: Unit,
  role: ReturnType<typeof classifyArmyRoles>[string],
  tag: 'armyA' | 'armyB',
  reserveType: 'deep-strike' | 'strategic-reserves'
): UnitState {
  const modelCount = getUnitModelCount(unit);
  const woundsPerModel = parseInt(unit.stats.wounds || '1', 10) || 1;
  const baseSizeMM = lookupBaseSizeMM(unit.name);
  const baseSizeInches = baseSizeMM ? baseSizeMM * INCHES_PER_MM : undefined;

  return {
    unit,
    remainingModels: modelCount,
    remainingWounds: modelCount * woundsPerModel,
    role,
    position: { x: 0, y: 0 }, // Off-table position
    engaged: false,
    modelPositions: [], // No model positions until deployed
    baseSizeInches,
    baseSizeMM,
    advanced: false,
    fellBack: false,
    roleLabel: role?.primary,
    inReserves: true,
    reserveType
  };
}

/**
 * Deploy a unit from reserves to the battlefield
 */
function deployFromReserves(
  unitState: UnitState,
  turn: number,
  deployDepth: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  tag: 'armyA' | 'armyB',
  opponentUnits: UnitState[]
): { success: boolean; position?: { x: number; y: number } } {
  if (!unitState.inReserves) {
    return { success: false };
  }

  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;
  const edgePosition = tag === 'armyA' ? -halfW : halfW;

  if (unitState.reserveType === 'deep-strike') {
    // Mission Pack: Reserves cannot arrive on turn 1
    if (turn < 2) {
      return { success: false };
    }

    // Deep Strike: Can arrive anywhere >9" from all enemy models
    // Try to deploy in mid-field, checking distance constraints
    let targetX = tag === 'armyA' ? edgePosition + 24 : edgePosition - 24; // ~24" from edge
    let targetY = 0; // Try center first

    // Check if position is >9" from all enemies (horizontally on the battlefield)
    // Rules: "more than 9 inches horizontally away from all enemy models"
    const MIN_DISTANCE = 9.0;
    let validPosition = true;
    for (const enemy of opponentUnits) {
      if (enemy.inReserves) continue; // Skip units still in reserves
      const dist = Math.sqrt(Math.pow(targetX - enemy.position.x, 2) + Math.pow(targetY - enemy.position.y, 2));
      if (dist <= MIN_DISTANCE) { // Must be MORE than 9"
        validPosition = false;
        break;
      }
    }

    if (!validPosition) {
      // Try different Y positions to find valid placement
      for (const tryY of [halfH / 2, -halfH / 2, halfH / 4, -halfH / 4, halfH * 0.75, -halfH * 0.75]) {
        validPosition = true;
        for (const enemy of opponentUnits) {
          if (enemy.inReserves) continue;
          const dist = Math.sqrt(Math.pow(targetX - enemy.position.x, 2) + Math.pow(tryY - enemy.position.y, 2));
          if (dist <= MIN_DISTANCE) { // Must be MORE than 9"
            validPosition = false;
            break;
          }
        }
        if (validPosition) {
          targetY = tryY;
          break;
        }
      }
    }

    // If still no valid position, try deploying further back
    if (!validPosition) {
      const fallbackX = tag === 'armyA' ? edgePosition + 15 : edgePosition - 15; // Closer to own edge
      for (const tryY of [0, halfH / 2, -halfH / 2, halfH / 4, -halfH / 4]) {
        validPosition = true;
        for (const enemy of opponentUnits) {
          if (enemy.inReserves) continue;
          const dist = Math.sqrt(Math.pow(fallbackX - enemy.position.x, 2) + Math.pow(tryY - enemy.position.y, 2));
          if (dist <= MIN_DISTANCE) {
            validPosition = false;
            break;
          }
        }
        if (validPosition) {
          targetX = fallbackX;
          targetY = tryY;
          break;
        }
      }
    }

    if (validPosition) {
      unitState.position = { x: targetX, y: targetY };
      unitState.inReserves = false;
      unitState.arrivedTurn = turn;
      // Create model formation now that unit is on table
      const spacing = Math.max(unitState.baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
      unitState.modelPositions = createModelFormation(unitState.remainingModels, targetX, targetY, spacing);
      return { success: true, position: { x: targetX, y: targetY } };
    }

    // Couldn't find valid position - all spots too close to enemies
    console.warn(`Deep Strike failed for ${unitState.unit.name}: No valid position >9" from all enemies on turn ${turn}`);
    return { success: false };
  } else if (unitState.reserveType === 'strategic-reserves') {
    // Strategic Reserves: Must arrive within 6" of any battlefield edge
    // Cannot arrive turn 1, must arrive turn 2+
    if (turn < 2) {
      return { success: false };
    }

    // Deploy on our battlefield edge, within 6" of edge
    const xPos = tag === 'armyA' ? edgePosition + 3 : edgePosition - 3; // 3" from edge
    const yPos = 0; // Center of edge

    unitState.position = { x: xPos, y: yPos };
    unitState.inReserves = false;
    unitState.arrivedTurn = turn;
    // Create model formation
    const spacing = Math.max(unitState.baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
    unitState.modelPositions = createModelFormation(unitState.remainingModels, xPos, yPos, spacing);
    return { success: true, position: { x: xPos, y: yPos } };
  }

  return { success: false };
}

/**
 * Deploy armies using alternating deployment (Attacker deploys first, then alternate)
 * This allows later-deploying units to react to opponent positioning
 * Returns deployed army states and movement details for logging
 */
function deployArmiesAlternating(
  armyA: Army,
  armyB: Army,
  attackerTag: 'armyA' | 'armyB',
  deployDepth: number,
  battlefieldWidth: number,
  battlefieldHeight: number
): {
  stateA: ArmyState;
  stateB: ArmyState;
  deploymentActions: MovementDetail[];
} {
  const rolesA = classifyArmyRoles(armyA);
  const rolesB = classifyArmyRoles(armyB);

  // Separate units that start in reserves from those deploying normally
  const unitsToDeployA: { unit: Unit; role: UnitRoleInfo; tag: 'armyA' }[] = [];
  const reservesA: { unit: Unit; role: UnitRoleInfo; tag: 'armyA'; reserveType: 'deep-strike' | 'strategic-reserves' }[] = [];

  for (const u of armyA.units) {
    const reserveType = getReserveType(u, armyA);
    if (reserveType) {
      reservesA.push({ unit: u, role: rolesA[u.id], tag: 'armyA', reserveType });
    } else {
      unitsToDeployA.push({ unit: u, role: rolesA[u.id], tag: 'armyA' });
    }
  }

  const unitsToDeployB: { unit: Unit; role: UnitRoleInfo; tag: 'armyB' }[] = [];
  const reservesB: { unit: Unit; role: UnitRoleInfo; tag: 'armyB'; reserveType: 'deep-strike' | 'strategic-reserves' }[] = [];

  for (const u of armyB.units) {
    const reserveType = getReserveType(u, armyB);
    if (reserveType) {
      reservesB.push({ unit: u, role: rolesB[u.id], tag: 'armyB', reserveType });
    } else {
      unitsToDeployB.push({ unit: u, role: rolesB[u.id], tag: 'armyB' });
    }
  }

  // Enforce reserve limits per 40K 10th Edition Mission Pack rules:
  // - ALL Reserves (Deep Strike + Strategic Reserves): Max 50% of units AND 50% of points
  // - Strategic Reserves specifically: Max 25% of points (additional restriction)
  const MAX_RESERVES_PERCENT = 0.5; // 50% for all reserves combined (Mission Pack)
  const MAX_STRATEGIC_RESERVES_PERCENT = 0.25; // 25% for Strategic Reserves specifically (Core Rules)

  const validateReserves = (
    army: Army,
    reserves: any[],
    normalDeploy: any[],
    armyLabel: string
  ) => {
    const totalPoints = army.pointsTotal || army.units.reduce((sum, u) => sum + (u.points || 0), 0);
    const totalUnits = army.units.length;
    const reservesPoints = reserves.reduce((sum, r) => sum + (r.unit.points || 0), 0);
    const reservesUnitCount = reserves.length;
    const strategicReservesPoints = reserves
      .filter(r => r.reserveType === 'strategic-reserves')
      .reduce((sum, r) => sum + (r.unit.points || 0), 0);

    const unitsToMove: typeof reserves = [];

    // Check 1: Total reserves cannot exceed 50% of units (Mission Pack)
    const maxUnits = Math.floor(totalUnits * MAX_RESERVES_PERCENT);
    if (reservesUnitCount > maxUnits) {
      const excessCount = reservesUnitCount - maxUnits;
      // Remove lowest-point units first to maximize tactical value
      const sorted = [...reserves].sort((a, b) => (a.unit.points || 0) - (b.unit.points || 0));
      unitsToMove.push(...sorted.slice(0, excessCount));
      console.warn(`${armyLabel}: Exceeded 50% reserves unit limit (${reservesUnitCount}/${totalUnits} units, max ${maxUnits}). Moving ${excessCount} unit(s) to normal deployment.`);
    }

    // Check 2: Total reserves cannot exceed 50% of points (Mission Pack)
    const maxReservesPoints = totalPoints * MAX_RESERVES_PERCENT;
    if (reservesPoints > maxReservesPoints) {
      // Remove units until under points limit (prioritize already-flagged units)
      const sorted = [...reserves]
        .filter(r => !unitsToMove.includes(r))
        .sort((a, b) => (a.unit.points || 0) - (b.unit.points || 0));

      let currentPoints = reservesPoints;
      for (const unit of sorted) {
        if (currentPoints <= maxReservesPoints) break;
        if (!unitsToMove.includes(unit)) {
          unitsToMove.push(unit);
          currentPoints -= unit.unit.points || 0;
        }
      }
      console.warn(`${armyLabel}: Exceeded 50% reserves points limit (${reservesPoints.toFixed(0)}/${totalPoints} pts, max ${maxReservesPoints.toFixed(0)}). Moving additional units to normal deployment.`);
    }

    // Check 3: Strategic Reserves cannot exceed 25% of points (Core Rules)
    const maxSRPoints = totalPoints * MAX_STRATEGIC_RESERVES_PERCENT;
    if (strategicReservesPoints > maxSRPoints) {
      const srUnits = reserves
        .filter(r => r.reserveType === 'strategic-reserves' && !unitsToMove.includes(r))
        .sort((a, b) => (a.unit.points || 0) - (b.unit.points || 0));

      let currentSRPoints = strategicReservesPoints;
      for (const srUnit of srUnits) {
        if (currentSRPoints <= maxSRPoints) break;
        unitsToMove.push(srUnit);
        currentSRPoints -= srUnit.unit.points || 0;
      }
      console.warn(`${armyLabel}: Exceeded 25% Strategic Reserves points limit (${strategicReservesPoints.toFixed(0)}/${totalPoints} pts, max ${maxSRPoints.toFixed(0)}).`);
    }

    // Apply all movements
    unitsToMove.forEach(e => {
      const idx = reserves.indexOf(e);
      if (idx >= 0) {
        reserves.splice(idx, 1);
        normalDeploy.push({ unit: e.unit, role: e.role, tag: e.tag });
      }
    });
  };

  validateReserves(armyA, reservesA, unitsToDeployA, armyA.armyName || 'Army A');
  validateReserves(armyB, reservesB, unitsToDeployB, armyB.armyName || 'Army B');

  const deployedA: UnitState[] = [];
  const deployedB: UnitState[] = [];
  const deploymentActions: MovementDetail[] = [];

  const attacker = attackerTag === 'armyA' ? unitsToDeployA : unitsToDeployB;
  const defender = attackerTag === 'armyA' ? unitsToDeployB : unitsToDeployA;
  const attackerDeployed = attackerTag === 'armyA' ? deployedA : deployedB;
  const defenderDeployed = attackerTag === 'armyA' ? deployedB : deployedA;

  // Alternate deployment: attacker first, then defender, repeat
  while (attacker.length > 0 || defender.length > 0) {
    // Attacker deploys
    if (attacker.length > 0) {
      const { unit, role, tag } = attacker.shift()!;
      const scoutAbility = hasScout(unit);
      const infiltratorAbility = hasInfiltrator(unit);
      const xPos = calculateDeploymentX(role?.primary || 'mobile', tag, deployDepth, battlefieldWidth, scoutAbility, infiltratorAbility);
      // Attacker doesn't get to react to opponent (isDefender = false)
      const yPos = calculateDeploymentY(attackerDeployed, battlefieldHeight, tag, role, defenderDeployed, unit, false);

      const unitState = createUnitState(unit, role, tag, deployDepth, battlefieldWidth, xPos, yPos);
      attackerDeployed.push(unitState);

      // Log deployment
      const specialDeployment = infiltratorAbility ? ' (Infiltrator)' : '';
      deploymentActions.push({
        unitId: unit.id,
        unitName: unit.name + specialDeployment,
        army: tag,
        from: { x: 0, y: 0 },
        to: { x: xPos, y: yPos },
        distance: 0,
        advanced: false
      });
    }

    // Defender deploys (reacting to attacker's placement)
    if (defender.length > 0) {
      const { unit, role, tag } = defender.shift()!;
      const scoutAbility = hasScout(unit);
      const infiltratorAbility = hasInfiltrator(unit);

      const xPos = calculateDeploymentX(role?.primary || 'mobile', tag, deployDepth, battlefieldWidth, scoutAbility, infiltratorAbility);

      // Defender uses threat assessment and counter-deployment (isDefender = true)
      const yPos = calculateDeploymentY(defenderDeployed, battlefieldHeight, tag, role, attackerDeployed, unit, true);

      const unitState = createUnitState(unit, role, tag, deployDepth, battlefieldWidth, xPos, yPos);
      defenderDeployed.push(unitState);

      // Log deployment
      const specialDeployment = infiltratorAbility ? ' (Infiltrator)' : '';
      deploymentActions.push({
        unitId: unit.id,
        unitName: unit.name + specialDeployment,
        army: tag,
        from: { x: 0, y: 0 },
        to: { x: xPos, y: yPos },
        distance: 0,
        advanced: false
      });
    }
  }

  // Add units in reserves to deployed arrays (they're part of army but off-table)
  for (const res of reservesA) {
    const unitState = createUnitInReserves(res.unit, res.role, res.tag, res.reserveType);
    deployedA.push(unitState);

    // Log deployment to reserves
    deploymentActions.push({
      unitId: res.unit.id,
      unitName: `${res.unit.name} (${res.reserveType === 'deep-strike' ? 'Deep Strike' : 'Strategic Reserves'})`,
      army: res.tag,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 }, // Off-table
      distance: 0,
      advanced: false
    });
  }

  for (const res of reservesB) {
    const unitState = createUnitInReserves(res.unit, res.role, res.tag, res.reserveType);
    deployedB.push(unitState);

    // Log deployment to reserves
    deploymentActions.push({
      unitId: res.unit.id,
      unitName: `${res.unit.name} (${res.reserveType === 'deep-strike' ? 'Deep Strike' : 'Strategic Reserves'})`,
      army: res.tag,
      from: { x: 0, y: 0 },
      to: { x: 0, y: 0 }, // Off-table
      distance: 0,
      advanced: false
    });
  }

  return {
    stateA: { army: armyA, units: deployedA, tag: 'armyA' },
    stateB: { army: armyB, units: deployedB, tag: 'armyB' },
    deploymentActions
  };
}

function summarizePhase(
  phase: PhaseLog['phase'],
  turn: number,
  actor: PhaseLog['actor'],
  description: string,
  damageDealt?: number,
  distanceAfter?: number,
  actions?: ActionLog[],
  advancedUnits?: string[],
  movementDetails?: MovementDetail[],
  objectiveStates?: PhaseLog['objectiveStates']
): PhaseLog {
  return { phase, turn, actor, description, damageDealt, distanceAfter, actions, advancedUnits, movementDetails, objectiveStates };
}

/**
 * Generate a detailed summary of objective control status
 * Shows which objectives are controlled and by whom, and the Level of Control values
 */
function getObjectiveSummary(objectives: ObjectiveMarker[]): string {
  const objA = objectives.filter(o => o.controlledBy === 'armyA').length;
  const objB = objectives.filter(o => o.controlledBy === 'armyB').length;
  const objContested = objectives.filter(o => o.controlledBy === 'contested').length;

  const detail = getObjectiveSummaryEnhanced(objectives);
  return `Objectives - Army A: ${objA}, Army B: ${objB}, Contested: ${objContested} | ${detail}`;
}

function mapObjectiveStatesForLog(
  objectives: ObjectiveMarker[],
  config: ObjectiveScoringConfig
): PhaseLog['objectiveStates'] {
  const holdNeeded = config.holdTimerRequired ?? 0;
  return objectives.map(obj => {
    const baseVp = config.vpPerObjective + (obj.priority === 'primary' ? config.primaryObjectiveBonus : 0);
    const heldA = obj.heldByA || 0;
    const heldB = obj.heldByB || 0;
    const readyA = obj.controlledBy === 'armyA' && (holdNeeded === 0 || heldA >= holdNeeded);
    const readyB = obj.controlledBy === 'armyB' && (holdNeeded === 0 || heldB >= holdNeeded);

    return {
      id: obj.id,
      name: obj.name,
      priority: obj.priority,
      controlledBy: obj.controlledBy,
      heldByA: heldA,
      heldByB: heldB,
      baseVp,
      holdNeeded,
      readyFor: readyA ? 'armyA' : readyB ? 'armyB' : null
    };
  });
}

function expectedShootingDamage(
  attacker: UnitState,
  defender: UnitState,
  includeOneTimeWeapons: boolean,
  useDiceRolls: boolean
): number {
  const defenderToughness = parseInt(defender.unit.stats.toughness || '4', 10);
  const defenderSave = defender.unit.stats.save || null;

  if (useDiceRolls) {
    return calculateUnitDamageWithDice(
      attacker.unit,
      defenderToughness,
      defenderSave,
      false, // useOvercharge
      includeOneTimeWeapons,
      false, // isCharging
      undefined // targetFNP - TODO: parse from defender abilities
    );
  } else {
    return calculateUnitDamage(
      attacker.unit,
      defenderToughness,
      false,
      undefined,
      includeOneTimeWeapons,
      true
    ).total;
  }
}

/**
 * Apply damage to a unit with proper state consistency checks
 * Uses atomic updates to ensure state integrity
 */
function applyDamage(target: UnitState, damage: number, casualties?: CasualtyLog[]): {
  modelsKilled: number;
  damagePerModel: number;
  remainingWoundsOnDamagedModel: number;
  totalModelsInUnit: number;
} {
  const woundsPerModel = parseInt(target.unit.stats.wounds || '1', 10);
  const beforeModels = target.remainingModels;
  const beforeWounds = target.remainingWounds;

  // Calculate new state
  let woundsRemaining = beforeWounds - damage;
  woundsRemaining = Math.max(0, woundsRemaining);
  const modelsRemaining = woundsRemaining === 0
    ? 0
    : Math.max(1, Math.ceil(woundsRemaining / woundsPerModel));

  // Update state atomically
  target.remainingWounds = woundsRemaining;
  target.remainingModels = Math.max(0, modelsRemaining);

  // Update model alive status
  updateModelLife(target);

  // Calculate results
  const modelsKilled = beforeModels - target.remainingModels;
  const damagePerModel = beforeModels > 0 ? damage / beforeModels : 0;
  const remainingWoundsOnDamagedModel = woundsRemaining % woundsPerModel;

  // Validate consistency
  if (target.modelPositions.length > 0) {
    const aliveCount = target.modelPositions.filter(m => m.alive).length;
    if (aliveCount !== target.remainingModels) {
      console.warn(
        `State inconsistency for ${target.unit.name}: ` +
        `alive models (${aliveCount}) !== remainingModels (${target.remainingModels})`
      );
    }
  }

  if (casualties && modelsKilled > 0) {
    casualties.push({
      unitId: target.unit.id,
      unitName: target.unit.name,
      modelsLost: modelsKilled
    });
  }

  return {
    modelsKilled,
    damagePerModel,
    remainingWoundsOnDamagedModel,
    totalModelsInUnit: target.remainingModels
  };
}

/**
 * Run a single-round deterministic engagement where both armies close to optimal range and exchange blows once.
 */
export function runSimpleEngagement(
  armyA: Army,
  armyB: Army,
  config: SimulationConfig = {}
): SimulationResult {
  const includeOneTimeWeapons = config.includeOneTimeWeapons ?? false;
  const initiative = config.initiative ?? DEFAULT_INITIATIVE;
  const maxRounds = config.maxRounds ?? 5;
  const allowAdvance = config.allowAdvance ?? true;
  const randomCharge = config.randomCharge ?? false;
  const useDiceRolls = config.useDiceRolls ?? false;
  const strategyProfile = config.strategyProfile ?? 'greedy';
  const useBeamSearch = config.useBeamSearch ?? false;
  const beamWidth = config.beamWidth ?? 3;
  const useAdaptiveStrategy = config.useAdaptiveStrategy ?? false;
  const missionScoring = getMissionScoringConfig(config.missionScoring);
  const maxPoints = Math.max(armyA.pointsTotal || 2000, armyB.pointsTotal || 2000);
  const battlefield = battlefieldFromPoints(maxPoints);

  // TERRAIN SETUP
  // Priority: custom terrain > terrain layout > no terrain (empty)
  let terrain: TerrainFeature[] = [];
  if (config.terrain && config.terrain.length > 0) {
    terrain = config.terrain;
  } else if (config.terrainLayout) {
    terrain = config.terrainLayout.features;
  }
  // Generate navigation mesh if we have terrain
  const navMesh: NavMesh | undefined = terrain.length > 0
    ? generateNavMesh(terrain, battlefield.width, battlefield.height)
    : undefined;

  const perTurnPositions: SimulationResult['positionsPerTurn'] = [];
  const timeline: NonNullable<SimulationResult['positionsTimeline']> = [];
  const logs: PhaseLog[] = [];
  const damageTally = { armyA: 0, armyB: 0 };
  const victoryPoints = { armyA: 0, armyB: 0 };
  const survivorsCount = (state: ArmyState) => state.units.filter(u => u.remainingModels > 0).length;
  let endReason: 'maxRounds' | 'armyDestroyed' = 'maxRounds';

  // CREATE OBJECTIVE MARKERS
  const objectives = createObjectiveMarkers(battlefield.width, battlefield.height, battlefield.deployDepth);

  // DEPLOYMENT PHASE: Use alternating deployment - initiative player is the "Attacker" and deploys first
  const { stateA, stateB, deploymentActions } = deployArmiesAlternating(
    armyA,
    armyB,
    initiative, // Attacker deploys first
    battlefield.deployDepth,
    battlefield.width,
    battlefield.height
  );

  // Log deployment phase
  logs.push(summarizePhase(
    'movement',
    0,
    initiative,
    `Deployment: ${initiative === 'armyA' ? armyA.armyName : armyB.armyName} deploys first (Attacker)`,
    undefined,
    minDistanceBetweenArmies(stateA, stateB),
    undefined,
    undefined,
    deploymentActions
  ));
  timeline.push({ phaseIndex: logs.length - 1, turn: 0, actor: initiative, ...snapshotState(stateA, stateB) });

  const turnOrder = initiative === 'armyA' ? [stateA, stateB] : [stateB, stateA];

  // PRE-BATTLE SCOUT MOVES (player taking first turn moves Scouts first)
  const scoutMovements: MovementDetail[] = [];
  for (const state of turnOrder) {
    const opponent = state === stateA ? stateB : stateA;

    state.units.forEach(u => {
      const scoutDist = getScoutDistance(u.unit);
      if (scoutDist > 0 && u.remainingModels > 0) {
        const startPos = { x: u.position.x, y: u.position.y };
        // Move toward enemy deployment zone (toward center of battlefield)
        const direction = state.tag === 'armyA' ? 1 : -1;
        const moveX = direction * scoutDist;
        // Update position immutably
        u.position = { x: u.position.x + moveX, y: u.position.y };
        shiftModelPositions(u, moveX, 0);
        clampToBoard(u, battlefield.width, battlefield.height);

        // Must end more than 9" from all enemy models (per Scout rules)
        const tooClose = opponent.units.some(enemy => {
          if (enemy.remainingModels <= 0) return false;
          return distanceBetween(u, enemy) < 9;
        });

        if (tooClose) {
          // Revert the move: restore original position immutably
          u.position = { x: startPos.x, y: startPos.y };
          // Recreate model positions at original location
          const modelCount = u.modelPositions.length;
          const spacing = Math.max(u.baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
          u.modelPositions = createModelFormation(modelCount, startPos.x, startPos.y, spacing);
        } else {
          const actualDistance = Math.abs(u.position.x - startPos.x);
          if (actualDistance > 0.05) {
            scoutMovements.push({
              unitId: u.unit.id,
              unitName: u.unit.name + ` (Scout ${scoutDist}")`,
              army: state.tag,
              from: startPos,
              to: { x: u.position.x, y: u.position.y },
              distance: actualDistance,
              advanced: false
            });
          }
        }
      }
    });
  }

  // Ensure units don't overlap after Scout moves
  clampAllSpacing(stateA, stateB, terrain);
  validateTerrainPositions(stateA, stateB, terrain, battlefield.width, battlefield.height);

  // Log Scout moves if any occurred
  if (scoutMovements.length > 0) {
    logs.push(summarizePhase('movement', 0, initiative, 'Pre-battle: Scout moves', undefined, minDistanceBetweenArmies(stateA, stateB), undefined, undefined, scoutMovements));
    timeline.push({ phaseIndex: logs.length - 1, turn: 0, actor: initiative, ...snapshotState(stateA, stateB) });
  }

  const startPositions = snapshotPositions(stateA, stateB);
  const startingDistance = minDistanceBetweenArmies(stateA, stateB);

  for (let round = 1; round <= maxRounds; round++) {
    // RESERVES ARRIVAL PHASE - happens at start of each player's turn
    const reservesArrivals: MovementDetail[] = [];
    for (const active of turnOrder) {
      const opponent = active === stateA ? stateB : stateA;

      // Attempt to deploy units from reserves
      for (const unit of active.units) {
        if (unit.inReserves) {
          const result = deployFromReserves(
            unit,
            round,
            battlefield.deployDepth,
            battlefield.width,
            battlefield.height,
            active.tag,
            opponent.units
          );

          if (result.success && result.position) {
            reservesArrivals.push({
              unitId: unit.unit.id,
              unitName: `${unit.unit.name} (${unit.reserveType === 'deep-strike' ? 'Deep Strike' : 'Strategic Reserves'} arrival)`,
              army: active.tag,
              from: { x: 0, y: 0 }, // Off-table
              to: result.position,
              distance: 0,
              advanced: false
            });
          }
        }
      }
    }

    // Log reserves arrivals if any
    if (reservesArrivals.length > 0) {
      logs.push(summarizePhase('movement', round, initiative, `Round ${round}: Reinforcements arrive`, undefined, undefined, undefined, undefined, reservesArrivals));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: initiative, ...snapshotState(stateA, stateB) });
    }

    for (const active of turnOrder) {
      const opponent = active === stateA ? stateB : stateA;

      // COMMAND PHASE: Objective control and battle shock
      updateObjectiveControl(objectives, stateA, stateB);
      const objSummary = getObjectiveSummary(objectives);
      const objectiveStatesForLog = mapObjectiveStatesForLog(objectives, missionScoring);

      // Resolve Battle Shock tests
      const battleShockResults = resolveBattleShock(active, round);
      const battleShockSummary = battleShockResults.length > 0
        ? battleShockResults.map(r => formatBattleShockResult(r)).join('; ')
        : 'No Battle Shock tests required.';

      logs.push(summarizePhase(
        'command',
        round,
        active.tag,
        `Round ${round}: ${active.tag} - Command Phase. Objectives: ${objSummary}. Battle Shock: ${battleShockSummary}`,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        objectiveStatesForLog
      ));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      // Adaptive strategy: Evaluate battle state and potentially switch strategy
      let currentStrategy = strategyProfile;
      let strategyExplanation = '';

      if (useAdaptiveStrategy) {
        const ourVP = active.tag === 'armyA' ? victoryPoints.armyA : victoryPoints.armyB;
        const enemyVP = active.tag === 'armyA' ? victoryPoints.armyB : victoryPoints.armyA;

        const battleState = evaluateBattleState(active, opponent, objectives, ourVP, enemyVP);
        const recommendedStrategy = recommendStrategy(battleState, round, maxRounds);

        if (recommendedStrategy) {
          currentStrategy = recommendedStrategy;
          strategyExplanation = ` [AI: ${recommendedStrategy} - ${explainStrategyChoice(battleState, recommendedStrategy, round)}]`;
        }
      }

      // Planner-driven movement (with terrain awareness)
      const { movements } = planMovement(
        active,
        opponent,
        objectives,
        allowAdvance,
        battlefield.width,
        battlefield.height,
        currentStrategy,
        useBeamSearch,
        beamWidth,
        terrain,
        navMesh
      );

      const movementDetails: MovementDetail[] = [];
      movements.forEach(({ unit, to, path }) => {
        const startPos = { x: unit.position.x, y: unit.position.y };
        const isInfantry = isUnitInfantry(unit);
        const isLarge = isUnitLargeModel(unit);
        const baseRadius = getUnitBaseRadius(unit);

        let actualDistance = 0;
        let finalPos = to;

        // If we have a path with waypoints, follow it to avoid terrain
        if (path && path.length > 2 && terrain.length > 0) {
          // Move along path, checking each segment for terrain collisions
          let currentPos = startPos;
          for (let i = 1; i < path.length; i++) {
            const nextWaypoint = path[i];

            // Check if this segment is blocked (accounting for base size)
            const blocked = isMovementBlocked(
              currentPos,
              nextWaypoint,
              terrain,
              isInfantry,
              isLarge,
              baseRadius
            );

            if (blocked.blocked) {
              // Stop at current position if blocked
              finalPos = currentPos;
              break;
            }

            // Check if destination waypoint is inside terrain
            const posBlocked = isPositionBlockedByTerrain(
              nextWaypoint,
              baseRadius,
              terrain,
              isInfantry,
              isLarge
            );

            if (posBlocked.blocked) {
              // Stop at current position if next waypoint is inside terrain
              finalPos = currentPos;
              break;
            }

            // Add segment distance
            const segmentDist = Math.sqrt(
              (nextWaypoint.x - currentPos.x) ** 2 + (nextWaypoint.y - currentPos.y) ** 2
            );
            actualDistance += segmentDist;
            currentPos = nextWaypoint;
            finalPos = nextWaypoint;
          }
        } else {
          // Direct movement (no path or no terrain)
          actualDistance = Math.sqrt((to.x - startPos.x) ** 2 + (to.y - startPos.y) ** 2);

          // Even for direct movement, check if blocked
          if (terrain.length > 0) {
            const blocked = isMovementBlocked(startPos, to, terrain, isInfantry, isLarge, baseRadius);
            if (blocked.blocked) {
              // If direct path is blocked, don't move
              finalPos = startPos;
              actualDistance = 0;
            }
          }
        }

        // Apply final position
        const dx = finalPos.x - startPos.x;
        const dy = finalPos.y - startPos.y;
        unit.position = { x: finalPos.x, y: finalPos.y };
        shiftModelPositions(unit, dx, dy);

        // Store position before clamping to check if it changed
        const preclampPos = { x: unit.position.x, y: unit.position.y };
        clampToBoard(unit, battlefield.width, battlefield.height);

        // Only recalculate distance if clamping moved the unit (use straight-line from start)
        // Otherwise preserve the accumulated path distance which accounts for terrain navigation
        if (unit.position.x !== preclampPos.x || unit.position.y !== preclampPos.y) {
          actualDistance = Math.sqrt(
            (unit.position.x - startPos.x) ** 2 + (unit.position.y - startPos.y) ** 2
          );
        }
        unit.advanced = allowAdvance && actualDistance > parseInt(unit.unit.stats.move || '0', 10);

        if (actualDistance > 0.05) {
          movementDetails.push({
            unitId: unit.unit.id,
            unitName: unit.unit.name,
            army: active.tag,
            from: startPos,
            to: { x: unit.position.x, y: unit.position.y },
            distance: actualDistance,
            advanced: unit.advanced ?? false
          });
        }
      });

      clampAllSpacing(stateA, stateB, terrain);
      validateTerrainPositions(stateA, stateB, terrain, battlefield.width, battlefield.height);
      const postMoveDistance = Math.max(0, minDistanceBetweenArmies(stateA, stateB));
      const advancedUnits = active.units.filter(u => u.advanced).map(u => u.unit.name);
      logs.push(summarizePhase('movement', round, active.tag, `Round ${round}: ${active.tag} moves.${strategyExplanation}`, undefined, postMoveDistance, undefined, advancedUnits.length ? advancedUnits : undefined, movementDetails.length ? movementDetails : undefined));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const shootActions: ActionLog[] = [];
      const shootCasualties: CasualtyLog[] = [];
      const shootDamage = expectedShootingDamageBatch(active, opponent, includeOneTimeWeapons, useDiceRolls, shootActions, shootCasualties, terrain);
      logs.push(summarizePhase('shooting', round, active.tag, `Round ${round}: ${active.tag} shooting.`, shootDamage, undefined, shootActions));
      damageTally[active.tag] += shootDamage;
      logs[logs.length - 1].casualties = shootCasualties;
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const chargeActions: ActionLog[] = [];
      performCharges(active, opponent, randomCharge, chargeActions, terrain, navMesh);
      clampAllSpacing(stateA, stateB, terrain);
      validateTerrainPositions(stateA, stateB, terrain, battlefield.width, battlefield.height);
      setEngagements(stateA, stateB);
      const postChargeDistance = Math.max(0, minDistanceBetweenArmies(stateA, stateB));
      logs.push(summarizePhase('charge', round, active.tag, `Round ${round}: ${active.tag} charges.`, undefined, postChargeDistance, chargeActions));
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      const meleeActions: ActionLog[] = [];
      const meleeCasualties: CasualtyLog[] = [];
      const meleeDamage = expectedMeleeDamageBatch(active, opponent, includeOneTimeWeapons, useDiceRolls, meleeActions, meleeCasualties);
      logs.push(summarizePhase('melee', round, active.tag, `Round ${round}: ${active.tag} fights.`, meleeDamage, undefined, meleeActions));
      damageTally[active.tag] += meleeDamage;
      logs[logs.length - 1].casualties = meleeCasualties;
      timeline.push({ phaseIndex: logs.length - 1, turn: round, actor: active.tag, ...snapshotState(stateA, stateB) });

      // Score victory points at end of each battle round (after both players have taken turns)
      if (active === turnOrder[1]) {
        const roundVP = calculateVictoryPoints(objectives, missionScoring);
        victoryPoints.armyA += roundVP.armyA;
        victoryPoints.armyB += roundVP.armyB;

        // Log objective scoring with detailed information
        logs.push(summarizePhase(
          'movement',
          round,
          'armyA',
          `END OF ROUND ${round} - VICTORY POINTS SCORED: Army A +${roundVP.armyA}VP, Army B +${roundVP.armyB}VP. Cumulative: A ${victoryPoints.armyA}VP, B ${victoryPoints.armyB}VP`,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined
        ));
      }

      perTurnPositions.push({ turn: round, ...snapshotPositions(stateA, stateB) });

      if (stateA.units.every(u => u.remainingModels <= 0) || stateB.units.every(u => u.remainingModels <= 0)) {
        endReason = 'armyDestroyed';
        break;
      }
    }
    if (endReason === 'armyDestroyed') break;
  }

  const survA = survivorsCount(stateA);
  const survB = survivorsCount(stateB);
  let winner: 'armyA' | 'armyB' | null = null;
  if (endReason === 'armyDestroyed') {
    if (survA > 0 && survB <= 0) winner = 'armyA';
    else if (survB > 0 && survA <= 0) winner = 'armyB';
  } else if (survA !== survB) {
    winner = survA > survB ? 'armyA' : 'armyB';
  }

  // Final objective control update
  updateObjectiveControl(objectives, stateA, stateB);

  console.log('Simulation complete. Terrain features in result:', terrain.length);

  return {
    startingDistance,
    initiative,
    logs,
    armyAState: stateA,
    armyBState: stateB,
    battlefield,
    terrain,
    objectives,
    positions: {
      start: startPositions,
      end: snapshotPositions(stateA, stateB)
    },
    positionsPerTurn: perTurnPositions,
    positionsTimeline: timeline,
    endReason,
    winner,
    summary: {
      armyA: {
        damageDealt: damageTally.armyA,
        damageTaken: damageTally.armyB,
        survivors: survA,
        totalUnits: stateA.units.length,
        victoryPoints: victoryPoints.armyA
      },
      armyB: {
        damageDealt: damageTally.armyB,
        damageTaken: damageTally.armyA,
        survivors: survB,
        totalUnits: stateB.units.length,
        victoryPoints: victoryPoints.armyB
      }
    }
  };
}
function averageMove(state: ArmyState): number {
  if (!state.units.length) return 0;
  const total = state.units.reduce((sum, u) => sum + parseInt(u.unit.stats.move || '0', 10), 0);
  return total / state.units.length;
}

function moveArmiesTowardEachOther(
  active: ArmyState,
  opponent: ArmyState,
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number
): MovementDetail[] {
  const movements: MovementDetail[] = [];
  const desiredGap = (unit: UnitState) => {
    // Melee-primary units keep closing to engagement range
    if (unit.role.primary === 'melee-missile') return 1.1;
    return Math.max(6, unit.role.optimalRange || 12);
  };

  active.units.forEach(u => {
    if (u.remainingModels <= 0 || u.inReserves) return; // Skip destroyed units and units in reserves
    const mv = parseInt(u.unit.stats.move || '0', 10) || 0;
    const startPos = { x: u.position.x, y: u.position.y };
    // Nearest defender
    const targets = opponent.units.filter(t => t.remainingModels > 0);
    if (!targets.length) return;
    targets.sort((a, b) => distanceBetween(u, a) - distanceBetween(u, b));
    const target = targets[0];
    const dist = distanceBetween(u, target);
    const desired = desiredGap(u);
    const delta = Math.max(0, dist - desired);
    const wantsAdvance = allowAdvance && delta > mv;
    const moveCap = wantsAdvance ? mv + 3 : mv;
    const step = Math.min(moveCap, delta);
    const dx = target.position.x - u.position.x;
    const dy = target.position.y - u.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const moveX = (dx / len) * step;
    const moveY = (dy / len) * step;
    // Update position immutably
    u.position = { x: u.position.x + moveX, y: u.position.y + moveY };
    shiftModelPositions(u, moveX, moveY);
    clampToBoard(u, battlefieldWidth, battlefieldHeight);
    u.engaged = false;
    const actualDistance = Math.sqrt((u.position.x - startPos.x) ** 2 + (u.position.y - startPos.y) ** 2);
    u.advanced = wantsAdvance && actualDistance > 0;
    if (actualDistance > 0.05) {
      movements.push({
        unitId: u.unit.id,
        unitName: u.unit.name,
        army: active.tag,
        from: startPos,
        to: { x: u.position.x, y: u.position.y },
        distance: actualDistance,
        advanced: u.advanced ?? false
      });
    }
  });

  return movements;
}

function minDistanceBetweenArmies(stateA: ArmyState, stateB: ArmyState): number {
  let minDist = Infinity;
  stateA.units.forEach(a => {
    if (a.remainingModels <= 0 || a.inReserves) return; // Skip units in reserves
    stateB.units.forEach(b => {
      if (b.remainingModels <= 0 || b.inReserves) return; // Skip units in reserves
      const d = distanceBetween(a, b);
      if (d < minDist) minDist = d;
    });
  });
  return minDist === Infinity ? 0 : minDist;
}

function minOptimalRange(state: ArmyState): number {
  const ranges = state.units.map(u => u.role.optimalRange || 12);
  return ranges.length ? Math.min(...ranges) : 12;
}

function setEngagements(stateA: ArmyState, stateB: ArmyState): void {
  const ENGAGE_RANGE = 1.1;
  stateA.units.forEach(a => a.engaged = false);
  stateB.units.forEach(b => b.engaged = false);

  stateA.units.forEach(a => {
    if (a.remainingModels <= 0) return;
    stateB.units.forEach(b => {
      if (b.remainingModels <= 0) return;
      const d = distanceBetween(a, b);
      if (d <= ENGAGE_RANGE) {
        a.engaged = true;
        b.engaged = true;
      }
    });
  });
}

function clampAllSpacing(stateA: ArmyState, stateB: ArmyState, terrain: TerrainFeature[] = []): void {
  clampArmySpacing(stateA, terrain);
  clampArmySpacing(stateB, terrain);
  clampInterArmySpacing(stateA, stateB, terrain);
}

function clampArmySpacing(state: ArmyState, terrain: TerrainFeature[] = []): void {
  const units = state.units.filter(u => u.remainingModels > 0 && !u.inReserves);
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      resolveOverlap(a, b, terrain);
    }
  }
}

function clampInterArmySpacing(stateA: ArmyState, stateB: ArmyState, terrain: TerrainFeature[] = []): void {
  stateA.units
    .filter(a => a.remainingModels > 0 && !a.inReserves)
    .forEach(a => {
      stateB.units
        .filter(b => b.remainingModels > 0 && !b.inReserves)
        .forEach(b => {
          resolveOverlap(a, b, terrain);
        });
    });
}

/**
 * Check if a unit's position is blocked by terrain
 */
function isUnitPositionBlockedByTerrain(
  unit: UnitState,
  position: Point,
  terrain: TerrainFeature[]
): boolean {
  if (terrain.length === 0) return false;
  const isInfantry = isUnitInfantry(unit);
  const isLarge = isUnitLargeModel(unit);
  const baseRadius = getUnitBaseRadius(unit);
  const result = isPositionBlockedByTerrain(position, baseRadius, terrain, isInfantry, isLarge);
  return result.blocked;
}

/**
 * Resolve overlap between two units by pushing them apart (immutable position updates)
 * Now checks for terrain collisions and adjusts push direction if needed
 */
function resolveOverlap(a: UnitState, b: UnitState, terrain: TerrainFeature[] = []): void {
  if (a.remainingModels <= 0 || b.remainingModels <= 0) return;
  const minDist = unitCollisionRadius(a) + unitCollisionRadius(b) + 0.1;
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= minDist && dist > 0.001) return;

  const primaryDx = dist > 0.001 ? dx : (a.position.x <= b.position.x ? -0.01 : 0.01);
  const primaryDy = dist > 0.001 ? dy : 0;
  const actualDist = dist > 0.001 ? dist : Math.sqrt(primaryDx * primaryDx + primaryDy * primaryDy);
  const scale = (minDist - actualDist) / Math.max(actualDist, 0.001) / 2;

  let adjustAx = -primaryDx * scale;
  let adjustAy = -primaryDy * scale;
  let adjustBx = primaryDx * scale;
  let adjustBy = primaryDy * scale;

  // Calculate proposed new positions
  const newPosA = { x: a.position.x + adjustAx, y: a.position.y + adjustAy };
  const newPosB = { x: b.position.x + adjustBx, y: b.position.y + adjustBy };

  // Check if new positions are blocked by terrain
  const aBlocked = isUnitPositionBlockedByTerrain(a, newPosA, terrain);
  const bBlocked = isUnitPositionBlockedByTerrain(b, newPosB, terrain);

  if (aBlocked && !bBlocked) {
    // Unit A would be pushed into terrain - push B twice as much instead
    adjustAx = 0;
    adjustAy = 0;
    adjustBx *= 2;
    adjustBy *= 2;
  } else if (!aBlocked && bBlocked) {
    // Unit B would be pushed into terrain - push A twice as much instead
    adjustAx *= 2;
    adjustAy *= 2;
    adjustBx = 0;
    adjustBy = 0;
  } else if (aBlocked && bBlocked) {
    // Both blocked - try perpendicular direction
    const perpX = -primaryDy;
    const perpY = primaryDx;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);
    if (perpLen > 0.001) {
      const perpScale = scale / perpLen;
      // Try perpendicular push
      const perpPosA = { x: a.position.x + perpX * perpScale, y: a.position.y + perpY * perpScale };
      const perpPosB = { x: b.position.x - perpX * perpScale, y: b.position.y - perpY * perpScale };

      if (!isUnitPositionBlockedByTerrain(a, perpPosA, terrain)) {
        adjustAx = perpX * perpScale;
        adjustAy = perpY * perpScale;
      } else {
        adjustAx = 0;
        adjustAy = 0;
      }
      if (!isUnitPositionBlockedByTerrain(b, perpPosB, terrain)) {
        adjustBx = -perpX * perpScale;
        adjustBy = -perpY * perpScale;
      } else {
        adjustBx = 0;
        adjustBy = 0;
      }
    }
  }

  // Apply final adjustments
  if (adjustAx !== 0 || adjustAy !== 0) {
    a.position = { x: a.position.x + adjustAx, y: a.position.y + adjustAy };
    shiftModelPositions(a, adjustAx, adjustAy);
  }
  if (adjustBx !== 0 || adjustBy !== 0) {
    b.position = { x: b.position.x + adjustBx, y: b.position.y + adjustBy };
    shiftModelPositions(b, adjustBx, adjustBy);
  }
}

/**
 * Validate and fix unit positions that are inside terrain
 * Pushes units out of terrain to the nearest valid position
 */
function validateTerrainPositions(
  stateA: ArmyState,
  stateB: ArmyState,
  terrain: TerrainFeature[],
  battlefieldWidth: number,
  battlefieldHeight: number
): void {
  if (terrain.length === 0) return;

  const allUnits = [...stateA.units, ...stateB.units].filter(u => u.remainingModels > 0 && !u.inReserves);

  for (const unit of allUnits) {
    const isInfantry = isUnitInfantry(unit);
    const isLarge = isUnitLargeModel(unit);
    const baseRadius = getUnitBaseRadius(unit);

    // Check if current position is blocked
    const blocked = isPositionBlockedByTerrain(unit.position, baseRadius, terrain, isInfantry, isLarge);

    if (blocked.blocked && blocked.blockedBy) {
      // Find direction away from terrain center
      const terrainCenter = { x: blocked.blockedBy.x, y: blocked.blockedBy.y };
      let dx = unit.position.x - terrainCenter.x;
      let dy = unit.position.y - terrainCenter.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len < 0.001) {
        // Unit is at terrain center - push in any direction
        dx = 1;
        dy = 0;
      } else {
        dx /= len;
        dy /= len;
      }

      // Calculate how far to push based on terrain size and base radius
      const terrainRadius = Math.max(blocked.blockedBy.width, blocked.blockedBy.height) / 2;
      const pushDistance = terrainRadius + baseRadius + TERRAIN_PUSH_BUFFER;

      // Calculate new position
      let newX = terrainCenter.x + dx * pushDistance;
      let newY = terrainCenter.y + dy * pushDistance;

      // Clamp to battlefield bounds
      const halfW = battlefieldWidth / 2;
      const halfH = battlefieldHeight / 2;
      newX = Math.max(-halfW + baseRadius, Math.min(halfW - baseRadius, newX));
      newY = Math.max(-halfH + baseRadius, Math.min(halfH - baseRadius, newY));

      // Apply the position change
      const moveX = newX - unit.position.x;
      const moveY = newY - unit.position.y;
      unit.position = { x: newX, y: newY };
      shiftModelPositions(unit, moveX, moveY);
    }
  }
}

function parseRangeStr(rangeValue?: string): number {
  if (!rangeValue) return 12;
  const match = rangeValue.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 12;
}

function battlefieldFromPoints(maxPoints: number) {
  // Short edge 44", long edge 60" for Strike Force/Onslaught; smaller for Incursion
  if (maxPoints >= 1500) {
    return { width: 60, height: 44, deployDepth: 12 };
  }
  return { width: 44, height: 30, deployDepth: 9 };
}

function clampToBoard(u: UnitState, battlefieldWidth: number, battlefieldHeight: number) {
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;
  const beforeX = u.position.x;
  const beforeY = u.position.y;
  const clampedX = Math.max(-halfW, Math.min(halfW, u.position.x));
  const clampedY = Math.max(-halfH, Math.min(halfH, u.position.y));

  // Update position immutably
  u.position = { x: clampedX, y: clampedY };

  const dx = clampedX - beforeX;
  const dy = clampedY - beforeY;
  shiftModelPositions(u, dx, dy);
}

function baseRadius(unit: UnitState): number {
  if (unit.baseSizeInches) return unit.baseSizeInches / 2;
  const name = unit.unit.name.toLowerCase();
  for (const { match, radius } of BASE_RADII) {
    if (match.test(name)) return radius;
  }
  return 1;
}

function unitCollisionRadius(unit: UnitState): number {
  const base = baseRadius(unit);
  if (!unit.modelPositions?.length) return base;
  const maxDist = unit.modelPositions.reduce((max, model) => {
    const dx = model.x - unit.position.x;
    const dy = model.y - unit.position.y;
    return Math.max(max, Math.sqrt(dx * dx + dy * dy));
  }, 0);
  const spacing = Math.max(unit.baseSizeInches ?? DEFAULT_MODEL_SPACING, DEFAULT_MODEL_SPACING);
  return Math.max(base, maxDist + spacing / 2);
}

function maxWeaponRange(unit: Unit): number {
  let maxRange = 0;
  unit.weapons.forEach(w => {
    const r = parseRangeStr(w.characteristics?.range);
    if (r > maxRange) maxRange = r;
  });
  return maxRange || 12;
}

function distanceBetween(a: UnitState, b: UnitState): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Apply cover save bonus to a save value string
 * E.g., "3+" with +1 cover becomes "2+"
 * Minimum save is 2+ (can't go lower)
 */
function applyCoverToSave(baseSave: string | null, coverBonus: number): string | null {
  if (!baseSave || coverBonus === 0) return baseSave;
  const match = baseSave.match(/(\d+)\+/);
  if (!match) return baseSave;
  const saveValue = parseInt(match[1]);
  // Cover improves save, so we subtract (3+ becomes 2+ with +1 cover)
  const improvedSave = Math.max(2, saveValue - coverBonus);
  return `${improvedSave}+`;
}

function expectedShootingDamageBatch(
  attackerArmy: ArmyState,
  defenderArmy: ArmyState,
  includeOneTimeWeapons: boolean,
  useDiceRolls: boolean,
  actions?: ActionLog[],
  casualties?: CasualtyLog[],
  terrain: TerrainFeature[] = []
): number {
  let total = 0;
  const attackers = attackerArmy.units.filter(u => u.remainingModels > 0 && !u.inReserves);
  const defenders = defenderArmy.units.filter(d => d.remainingModels > 0 && !d.inReserves);
  const fired = new Set<string>();

  for (const attacker of attackers) {
    if (fired.has(attacker.unit.id)) continue; // ensure each unit fires once
    fired.add(attacker.unit.id);
    if (!defenders.length) break;

    // If the unit advanced and has no Assault weapons, skip shooting
    const hasAssault = attacker.unit.weapons.some(w => (w.characteristics?.keywords || '').toLowerCase().includes('assault'));
    if (attacker.advanced && !hasAssault) continue;

    // Fire each weapon at its own best in-range target
    attacker.unit.weapons.forEach((weapon: Weapon) => {
      const keywords = (weapon.characteristics?.keywords || '').toLowerCase();
      const isAssault = keywords.includes('assault');
      if (attacker.advanced && !isAssault) return; // cannot fire non-Assault after advance
      const wType = getWeaponType(weapon);
      if (attacker.engaged && wType !== 'pistol') return; // in engagement, only pistols can fire

      const candidates = defenders
        .filter(d => d.remainingModels > 0)
        .map(def => {
          const dist = distanceBetween(attacker, def);
          const range = parseRangeStr(weapon.characteristics?.range);

          // Check line of sight through terrain
          // Towering and Aircraft units ignore Obscuring terrain
          const losCheck = terrain.length > 0
            ? checkLineOfSight(
              attacker.position,
              def.position,
              terrain,
              unitIgnoresObscuring(attacker),
              unitIgnoresObscuring(def)
            )
            : { hasLoS: true, throughDense: false };

          // If LoS is blocked, can't shoot this target
          if (!losCheck.hasLoS) {
            return { def, dist, dmg: 0, hasLoS: false, cover: null, throughDense: false };
          }

          // Get cover information
          const cover = terrain.length > 0
            ? getTerrainCover(def.position, attacker.position, terrain)
            : { hasCover: false, coverType: 'none' as const, denseCover: false };

          // Calculate cover save bonus (light = +1, heavy = +2 in most cases)
          const coverBonus = cover.hasCover ? (cover.coverType === 'heavy' ? 2 : 1) : 0;

          // Apply cover save bonus to defender's save
          const baseSave = def.unit.stats.save || null;
          const effectiveSave = applyCoverToSave(baseSave, coverBonus);

          // Dense cover OR shooting through dense terrain = -1 to hit
          const densePenalty = (cover.denseCover || losCheck.throughDense) ? -1 : 0;

          // Calculate damage with terrain modifiers
          const dmg = dist <= range
            ? calculateWeaponDamage(
              weapon,
              parseInt(def.unit.stats.toughness || '4', 10),
              false, // useOvercharge
              includeOneTimeWeapons,
              true, // optimalRange
              [], // targetKeywords
              1, // targetUnitSize
              false, // isCharging
              effectiveSave,
              undefined, // unitRerolls
              undefined, // scenarioRerolls
              undefined, // targetFNP
              densePenalty !== 0 ? { hit: densePenalty } : undefined // unitModifiers for dense cover
            )
            : 0;

          return {
            def,
            dist,
            dmg,
            hasLoS: true,
            cover,
            throughDense: losCheck.throughDense,
            effectiveSave,
            densePenalty
          };
        })
        .filter(c => c.dmg > 0 && c.hasLoS)
        .sort((a, b) => b.dmg - a.dmg);

      if (!candidates.length) return;
      const best = candidates[0];

      // If using dice rolls, re-roll the actual damage with dice
      let actualDamage = best.dmg;
      let diceBreakdown;
      const defenderToughness = parseInt(best.def.unit.stats.toughness || '4', 10);
      // Use the effective save (with cover) for dice rolls too
      const defenderSave = best.effectiveSave || best.def.unit.stats.save || null;

      if (useDiceRolls) {
        diceBreakdown = calculateWeaponDamageWithDice(
          weapon,
          defenderToughness,
          defenderSave,
          false, // useOvercharge
          includeOneTimeWeapons,
          false, // isCharging
          attacker.unit.unitRerolls,
          undefined, // targetFNP
          best.densePenalty || 0 // hit modifier for dense cover
        );
        actualDamage = diceBreakdown.totalDamage;
      }

      const casualtyDetails = applyDamage(best.def, actualDamage, casualties);
      total += actualDamage;

      // Get weapon characteristics for tooltip
      const chars = weapon.characteristics;

      actions?.push({
        attackerId: attacker.unit.id,
        attackerName: attacker.unit.name,
        defenderId: best.def.unit.id,
        defenderName: best.def.unit.name,
        damage: actualDamage,
        phase: 'shooting',
        weaponName: weapon.name,
        distance: best.dist,
        attacks: diceBreakdown?.attacks,
        hits: diceBreakdown?.hits,
        wounds: diceBreakdown?.wounds,
        failedSaves: diceBreakdown?.failedSaves,
        mortalWounds: diceBreakdown?.mortalWounds,
        skill: chars?.bs || chars?.ws,
        strength: parseInt(chars?.s || '0'),
        ap: parseInt(chars?.ap || '0'),
        damageCharacteristic: chars?.d,
        targetToughness: defenderToughness,
        targetSave: defenderSave || undefined,
        modelsKilled: casualtyDetails.modelsKilled,
        damagePerModel: casualtyDetails.damagePerModel,
        remainingWounds: casualtyDetails.remainingWoundsOnDamagedModel,
        totalModelsInUnit: casualtyDetails.totalModelsInUnit,
        lethalHits: diceBreakdown?.lethalHits,
        sustainedHits: diceBreakdown?.sustainedHits,
        devastatingWounds: diceBreakdown?.devastatingWounds
      });

      // remove defender if dead
      if (best.def.remainingModels <= 0) {
        const idx = defenders.indexOf(best.def);
        if (idx >= 0) defenders.splice(idx, 1);
      }
    });
  }

  return total;
}

function expectedMeleeDamageBatch(attackerArmy: ArmyState, defenderArmy: ArmyState, includeOneTimeWeapons: boolean, useDiceRolls: boolean, actions?: ActionLog[], casualties?: CasualtyLog[]): number {
  let total = 0;

  const meleeAttackers = attackerArmy.units.filter(u => u.remainingModels > 0 && !u.inReserves && (u.engaged || u.role.primary === 'melee-missile'));
  const defenders = defenderArmy.units.filter(d => d.remainingModels > 0 && !d.inReserves);

  for (const attacker of meleeAttackers) {
    if (!defenders.length) break;

    // Find best target
    const best = defenders
      .map(def => ({
        def,
        dmg: expectedMeleeDamage(attacker, def, includeOneTimeWeapons, useDiceRolls)
      }))
      .sort((a, b) => b.dmg - a.dmg)[0];

    const dist = distanceBetween(attacker, best.def);
    const inRange = dist <= 1.1 || attacker.engaged;

    if (best && best.dmg > 0 && inRange) {
      const defenderToughness = parseInt(best.def.unit.stats.toughness || '4', 10);
      const defenderSave = best.def.unit.stats.save || null;

      // Process each melee weapon individually (like shooting)
      const meleeWeapons = (attacker.unit.weapons || []).filter(w => !w.characteristics?.range || w.characteristics.range === 'Melee');

      if (meleeWeapons.length > 0 && useDiceRolls) {
        // With dice rolls, process each weapon
        meleeWeapons.forEach(weapon => {
          const diceBreakdown = calculateWeaponDamageWithDice(
            weapon,
            defenderToughness,
            defenderSave,
            false, // useOvercharge
            includeOneTimeWeapons,
            true, // isCharging
            attacker.unit.unitRerolls,
            undefined // targetFNP
          );

          const weaponDamage = diceBreakdown.totalDamage;
          if (weaponDamage > 0) {
            const casualtyDetails = applyDamage(best.def, weaponDamage, casualties);
            total += weaponDamage;

            const chars = weapon.characteristics;
            actions?.push({
              attackerId: attacker.unit.id,
              attackerName: attacker.unit.name,
              defenderId: best.def.unit.id,
              defenderName: best.def.unit.name,
              damage: weaponDamage,
              phase: 'melee',
              weaponName: weapon.name,
              distance: dist,
              attacks: diceBreakdown?.attacks,
              hits: diceBreakdown?.hits,
              wounds: diceBreakdown?.wounds,
              failedSaves: diceBreakdown?.failedSaves,
              mortalWounds: diceBreakdown?.mortalWounds,
              skill: chars?.ws,
              strength: parseInt(chars?.s || '0'),
              ap: parseInt(chars?.ap || '0'),
              damageCharacteristic: chars?.d,
              targetToughness: defenderToughness,
              targetSave: defenderSave || undefined,
              modelsKilled: casualtyDetails.modelsKilled,
              damagePerModel: casualtyDetails.damagePerModel,
              remainingWounds: casualtyDetails.remainingWoundsOnDamagedModel,
              totalModelsInUnit: casualtyDetails.totalModelsInUnit,
              lethalHits: diceBreakdown?.lethalHits,
              sustainedHits: diceBreakdown?.sustainedHits,
              devastatingWounds: diceBreakdown?.devastatingWounds
            });
          }
        });
      } else {
        // Without dice rolls or no melee weapons, use old method
        const casualtyDetails = applyDamage(best.def, best.dmg, casualties);
        total += best.dmg;
        actions?.push({
          attackerId: attacker.unit.id,
          attackerName: attacker.unit.name,
          defenderId: best.def.unit.id,
          defenderName: best.def.unit.name,
          damage: best.dmg,
          phase: 'melee',
          weaponName: 'Melee',
          distance: dist,
          modelsKilled: casualtyDetails.modelsKilled,
          damagePerModel: casualtyDetails.damagePerModel,
          remainingWounds: casualtyDetails.remainingWoundsOnDamagedModel,
          totalModelsInUnit: casualtyDetails.totalModelsInUnit
        });
      }

      if (best.def.remainingModels <= 0) {
        const idx = defenders.indexOf(best.def);
        if (idx >= 0) defenders.splice(idx, 1);
      }
    }
  }

  return total;
}

function expectedMeleeDamage(attacker: UnitState, defender: UnitState, includeOneTimeWeapons: boolean, useDiceRolls: boolean): number {
  const defenderToughness = parseInt(defender.unit.stats.toughness || '4', 10);
  const defenderSave = defender.unit.stats.save || null;

  if (useDiceRolls) {
    return calculateUnitDamageWithDice(
      attacker.unit,
      defenderToughness,
      defenderSave,
      false, // useOvercharge
      includeOneTimeWeapons,
      true, // isCharging - treat as charging to favor melee-first units
      undefined // targetFNP - TODO: parse from defender abilities
    );
  }

  return calculateUnitDamage(
    attacker.unit,
    defenderToughness,
    false,
    undefined,
    includeOneTimeWeapons,
    true,
    [],
    1,
    true // treat as charging to favor melee-first units
  ).melee;
}

function totalWoundsForUnit(u: UnitState): number {
  const perModel = parseInt(u.unit.stats.wounds || '1', 10) || 1;
  const totalModels = u.modelPositions.length || getUnitModelCount(u.unit);
  return perModel * totalModels;
}

function snapshotUnit(u: UnitState) {
  return {
    unitId: u.unit.id,
    name: u.unit.name,
    x: u.position.x,
    y: u.position.y,
    remaining: u.remainingModels,
    engaged: !!u.engaged,
    role: u.roleLabel || u.role.primary,
    remainingWounds: Math.max(0, Math.round(u.remainingWounds)),
    totalWounds: totalWoundsForUnit(u),
    baseSizeMM: u.baseSizeMM,
    baseSizeInches: u.baseSizeInches,
    baseRadius: unitCollisionRadius(u),
    inReserves: u.inReserves,
    reserveType: u.reserveType,
    arrivedTurn: u.arrivedTurn,
    models: u.modelPositions.map((pos, idx) => ({
      index: idx,
      x: pos.x,
      y: pos.y,
      alive: pos.alive
    }))
  };
}

function snapshotPositions(stateA: ArmyState, stateB: ArmyState) {
  return {
    armyA: stateA.units.map(snapshotUnit),
    armyB: stateB.units.map(snapshotUnit)
  };
}

function snapshotState(stateA: ArmyState, stateB: ArmyState) {
  return {
    armyA: stateA.units.map(snapshotUnit),
    armyB: stateB.units.map(snapshotUnit)
  };
}

function performCharges(
  stateA: ArmyState,
  stateB: ArmyState,
  randomCharge: boolean,
  actions?: ActionLog[],
  terrain: TerrainFeature[] = [],
  navMesh?: NavMesh
): void {
  const ENGAGE_RANGE = 1.0;
  const rollCharge = () => randomCharge ? rollMultipleD6(2) : 7;

  const attemptCharge = (attacker: UnitState, targets: UnitState[]) => {
    if (attacker.remainingModels <= 0 || attacker.inReserves) return; // Skip units in reserves
    const targetsAlive = targets.filter(t => t.remainingModels > 0 && !t.inReserves); // Only charge units on table
    if (!targetsAlive.length) return;
    // Closest target (using path distance if terrain exists)
    targetsAlive.sort((a, b) => {
      if (terrain.length === 0 || !navMesh) {
        return distanceBetween(attacker, a) - distanceBetween(attacker, b);
      }
      // Use pathfinding distance for sorting
      const pathA = findPath(attacker.position, a.position, navMesh, terrain);
      const pathB = findPath(attacker.position, b.position, navMesh, terrain);
      return pathA.distance - pathB.distance;
    });
    const target = targetsAlive[0];
    const straightDist = distanceBetween(attacker, target);

    // Check if already engaged
    if (straightDist <= ENGAGE_RANGE) {
      attacker.engaged = true;
      target.engaged = true;
      actions?.push({
        attackerId: attacker.unit.id,
        attackerName: attacker.unit.name,
        defenderId: target.unit.id,
        defenderName: target.unit.name,
        damage: 0,
        phase: 'charge',
        distance: straightDist,
        description: 'Already engaged at start of charge'
      } as ActionLog);
      return;
    }

    // Calculate path distance (accounting for terrain)
    let chargePath: { x: number; y: number }[] = [attacker.position, target.position];
    let pathDist = straightDist;

    if (terrain.length > 0 && navMesh) {
      const pathResult = findPath(attacker.position, target.position, navMesh, terrain);
      if (pathResult.found) {
        chargePath = pathResult.path;
        pathDist = pathResult.distance;
      } else {
        // Path blocked by terrain - charge impossible
        actions?.push({
          attackerId: attacker.unit.id,
          attackerName: attacker.unit.name,
          defenderId: target.unit.id,
          defenderName: target.unit.name,
          damage: 0,
          phase: 'charge',
          distance: straightDist,
          description: `Charge blocked by terrain`
        } as ActionLog);
        return;
      }
    }

    const chargeReach = rollCharge();
    if (pathDist > chargeReach) {
      actions?.push({
        attackerId: attacker.unit.id,
        attackerName: attacker.unit.name,
        defenderId: target.unit.id,
        defenderName: target.unit.name,
        damage: 0,
        phase: 'charge',
        distance: pathDist,
        description: `Charge failed (needed ${pathDist.toFixed(2)}\", rolled ${chargeReach})`
      } as ActionLog);
      return; // failed charge
    }

    // Move along path
    const maxTravel = getMaxTravelPoint(chargePath, Math.min(chargeReach, pathDist - ENGAGE_RANGE), terrain);
    const moveX = maxTravel.point.x - attacker.position.x;
    const moveY = maxTravel.point.y - attacker.position.y;

    attacker.position = { x: maxTravel.point.x, y: maxTravel.point.y };
    shiftModelPositions(attacker, moveX, moveY);

    const newDist = distanceBetween(attacker, target);
    const succeeded = newDist <= ENGAGE_RANGE;
    if (succeeded) {
      attacker.engaged = true;
      target.engaged = true;
    }
    actions?.push({
      attackerId: attacker.unit.id,
      attackerName: attacker.unit.name,
      defenderId: target.unit.id,
      defenderName: target.unit.name,
      damage: 0,
      phase: 'charge',
      distance: pathDist,
      description: succeeded
        ? `Charge successful (rolled ${chargeReach}, moved ${maxTravel.distanceTraveled.toFixed(2)}\"${terrain.length > 0 ? ' around terrain' : ''})`
        : `Charge fell short after move (rolled ${chargeReach})`
    } as ActionLog);
  };

  stateA.units.forEach(a => {
    if (a.role.primary === 'melee-missile') {
      attemptCharge(a, stateB.units);
    }
  });
  stateB.units.forEach(b => {
    if (b.role.primary === 'melee-missile') {
      attemptCharge(b, stateA.units);
    }
  });
}
