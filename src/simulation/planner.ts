import type { ArmyState, ObjectiveMarker, UnitState } from './types';
import type { Unit } from '../types';
import type { TerrainFeature, Point } from './terrain';
import type { NavMesh, PathResult } from './pathfinding';
import { isMovementBlocked, getMovementPenalty, isPositionBlockedByTerrain, getTerrainCover, checkLineOfSight } from './terrain';
import { findPath, euclideanDistance, getMaxTravelPoint, generateNavMesh } from './pathfinding';
import { abilityParser } from './ability-parser';

export interface NavMeshSet {
  default: NavMesh;
  infantry?: NavMesh;
  vehicle?: NavMesh;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Default base radii in inches (approximate conversions from mm)
const DEFAULT_LARGE_MODEL_BASE_RADIUS = 2.5; // ~130mm oval base
const DEFAULT_INFANTRY_BASE_RADIUS = 0.5; // ~25mm round base

// ============================================================================
// UNIT TYPE HELPERS
// ============================================================================

/**
 * Determine if a unit is infantry based on its type
 */
export function isUnitInfantry(unit: UnitState): boolean {
  const type = unit.unit.type?.toLowerCase() || '';
  // Infantry types that can move through breachable terrain
  return type.includes('infantry') ||
    type.includes('character') ||
    type.includes('beast') ||
    type.includes('swarm');
}

/**
 * Determine if a unit is a large model (Vehicle/Monster) that may be blocked by certain terrain
 */
export function isUnitLargeModel(unit: UnitState): boolean {
  const type = unit.unit.type?.toLowerCase() || '';
  // Large model types
  return type.includes('vehicle') ||
    type.includes('monster') ||
    type.includes('titanic') ||
    type.includes('knight') ||
    type.includes('walker');
}

/**
 * Determine if a unit has the Towering keyword
 * Towering models can see and be seen over Obscuring terrain
 */
export function isUnitTowering(unit: UnitState): boolean {
  const type = unit.unit.type?.toLowerCase() || '';
  const name = unit.unit.name?.toLowerCase() || '';

  // Check type for Titanic (which typically includes Towering)
  if (type.includes('titanic')) return true;

  // Check for common Towering units by name patterns
  if (name.includes('knight') && !name.includes('armiger')) return true;
  if (name.includes('titan')) return true;
  if (name.includes('baneblade')) return true;
  if (name.includes('stormlord')) return true;
  if (name.includes('shadowsword')) return true;
  if (name.includes('wraithknight')) return true;
  if (name.includes('riptide')) return true;
  if (name.includes('stormsurge')) return true;
  if (name.includes('hierophant')) return true;
  if (name.includes('harridan')) return true;

  // Check keywords/rules if available
  const rules = unit.unit.rules || [];
  const abilities = unit.unit.abilities || [];
  const allKeywords = [...rules, ...abilities].map(k => k.toLowerCase());

  return allKeywords.some(k => k.includes('towering'));
}

/**
 * Determine if a unit is an Aircraft
 * Aircraft can see and be seen over Obscuring terrain
 */
export function isUnitAircraft(unit: UnitState): boolean {
  const type = unit.unit.type?.toLowerCase() || '';

  // Direct type check
  if (type.includes('aircraft')) return true;
  if (type.includes('flyer')) return true;

  // Check keywords/rules if available
  const rules = unit.unit.rules || [];
  const abilities = unit.unit.abilities || [];
  const allKeywords = [...rules, ...abilities].map(k => k.toLowerCase());

  return allKeywords.some(k => k.includes('aircraft') || k.includes('hover'));
}

/**
 * Determine if a unit ignores Obscuring terrain for visibility
 */
export function unitIgnoresObscuring(unit: UnitState): boolean {
  return isUnitTowering(unit) || isUnitAircraft(unit);
}

/**
 * Get the base radius for a unit in inches
 */
export function getUnitBaseRadius(unit: UnitState): number {
  if (unit.baseSizeInches) {
    return unit.baseSizeInches / 2;
  }
  // Default fallback based on unit type
  if (isUnitLargeModel(unit)) {
    return DEFAULT_LARGE_MODEL_BASE_RADIUS;
  }
  return DEFAULT_INFANTRY_BASE_RADIUS;
}

export interface PlannerWeights {
  objectiveValue: number;
  threatPenalty: number;
  damageBias: number;
  distancePenalty: number;
  coverBonus: number;
  losBonus: number;
}

export type StrategyProfile = 'greedy' | 'aggressive' | 'defensive' | 'objective-focused';

export function getStrategyWeights(profile: StrategyProfile): PlannerWeights {
  switch (profile) {
    case 'aggressive':
      return { objectiveValue: 0.5, threatPenalty: 0.3, damageBias: 1.5, distancePenalty: 0.1, coverBonus: 0.5, losBonus: 2.0 };
    case 'defensive':
      return { objectiveValue: 0.8, threatPenalty: 1.5, damageBias: 0.2, distancePenalty: 0.3, coverBonus: 3.0, losBonus: 0.5 };
    case 'objective-focused':
      return { objectiveValue: 2.0, threatPenalty: 0.5, damageBias: 0.2, distancePenalty: 0.1, coverBonus: 0.5, losBonus: 1.0 };
    case 'greedy':
    default:
      return { objectiveValue: 1.0, threatPenalty: 0.7, damageBias: 0.4, distancePenalty: 0.2, coverBonus: 1.0, losBonus: 1.0 };
  }
}

const DEFAULT_WEIGHTS: PlannerWeights = getStrategyWeights('greedy');

interface ThreatEstimate {
  incoming: number; // abstract threat score
  closeRange: boolean; // within ~6" engagement range
  chargeableTurn: boolean; // can likely charge next turn
}

interface RangeProfile {
  shortRange: number; // 0-12"
  mediumRange: number; // 12-24"
  longRange: number; // 24"+
  meleeThreat: number; // multiplier for melee units
}

function getRangeProfile(unit: Unit, enemyDist: number): RangeProfile {
  const maxRange = maxWeaponRange(unit);
  const move = parseInt(unit.stats.move || '0', 10) || 0;
  const isMelee = (unit.weapons || []).some(w => {
    const r = parseRangeStr(w.characteristics?.range);
    return r <= 1;
  });

  return {
    shortRange: Math.min(enemyDist, 12),
    mediumRange: Math.min(Math.max(enemyDist - 12, 0), 12),
    longRange: Math.max(enemyDist - 24, 0),
    meleeThreat: isMelee ? 1.5 : 0.3
  };
}

interface CandidateMove {
  x: number;
  y: number;
  label: string;
}

const ENGAGE_RANGE = 1.1;

function parseRangeStr(rangeValue?: string): number {
  if (!rangeValue) return 12;
  const match = rangeValue.match(/(\d+(\.\d+)?)/);
  return match ? parseFloat(match[1]) : 12;
}

function maxWeaponRange(unit: Unit): number {
  let maxRange = 0;
  unit.weapons.forEach(w => {
    const r = parseRangeStr(w.characteristics?.range);
    if (r > maxRange) maxRange = r;
  });
  return maxRange || 12;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate path distance between two points, accounting for terrain obstacles.
 * Falls back to euclidean distance if no navmesh is provided.
 * Now accepts unit information for proper terrain interaction.
 */
function pathDistance(
  a: Point,
  b: Point,
  navMesh: NavMesh | undefined,
  terrain: TerrainFeature[],
  unit?: UnitState
): { distance: number; path: Point[]; blocked: boolean } {
  // Defaults when unit is not provided:
  // - isInfantry=true: allows breachable terrain passage (conservative, infantry is most common)
  // - isLarge=false: won't trigger large model blocking (safe default)
  // - baseRadius=0: point-based collision only (may allow clipping, but won't reject valid paths)
  const isInfantry = unit ? isUnitInfantry(unit) : true;
  const isLarge = unit ? isUnitLargeModel(unit) : false;
  const baseRadius = unit ? getUnitBaseRadius(unit) : DEFAULT_INFANTRY_BASE_RADIUS;

  if (!navMesh || terrain.length === 0) {
    // Even without navmesh, check if direct path is blocked
    const blocked = isMovementBlocked(a, b, terrain, isInfantry, isLarge, baseRadius);
    return { distance: euclideanDistance(a, b), path: [a, b], blocked: blocked.blocked };
  }

  const result = findPath(a, b, navMesh, terrain, isInfantry, isLarge, baseRadius);
  return {
    distance: result.distance + result.movementPenalty,
    path: result.path,
    blocked: !result.found,
  };
}

function buildThreatMap(active: ArmyState, opponent: ArmyState): Map<string, ThreatEstimate> {
  const map = new Map<string, ThreatEstimate>();
  opponent.units.forEach(enemy => {
    if (enemy.remainingModels <= 0 || enemy.inReserves) return;
    const maxRange = maxWeaponRange(enemy.unit);
    const move = parseInt(enemy.unit.stats.move || '0', 10) || 0;
    const threatRadius = maxRange + move;

    active.units.forEach(ally => {
      if (ally.remainingModels <= 0 || ally.inReserves) return;
      const d = distance(enemy.position, ally.position);

      // Base threat from range + movement
      let baseThreat = Math.max(0, threatRadius - d) / Math.max(1, threatRadius);

      // === DEFENSIVE ABILITY MODIFIERS ===
      // Stealth reduces incoming ranged threat (-1 to hit = ~16% reduction)
      if (abilityParser.hasStealth(ally.unit)) {
        baseThreat *= 0.83;
      }

      // Feel No Pain reduces effective threat (5+ FNP = ~33% damage reduction)
      if (abilityParser.hasFeelNoPain(ally.unit)) {
        const fnpValue = abilityParser.getFeelNoPainValue(ally.unit);
        // FNP 5+ = 0.67, FNP 6+ = 0.83, FNP 4+ = 0.5
        const fnpReduction = (7 - fnpValue) / 6;
        baseThreat *= (1 - fnpReduction);
      }

      // Invulnerable save makes unit more resilient (4++ = ~50% better vs AP)
      if (abilityParser.hasInvulnerableSave(ally.unit)) {
        const invulnValue = abilityParser.getInvulnerableSaveValue(ally.unit);
        // Better invuln = more threat reduction (4++ = 0.85, 3++ = 0.75)
        const invulnFactor = 0.7 + (invulnValue * 0.05);
        baseThreat *= invulnFactor;
      }

      // Boost threat if within close engagement range
      const inCloseRange = d <= 6;
      const closeThreatBoost = inCloseRange ? 1.2 : 1.0;

      // Estimate if can charge next turn (current + move + 2d6 charge)
      const chargeDistance = move + 7; // ~average of 2d6
      const canChargeNextTurn = d <= chargeDistance;

      const prev = map.get(ally.unit.id) || { incoming: 0, closeRange: false, chargeableTurn: false };
      const existingIncoming = prev.incoming || 0;
      const updatedThreat = existingIncoming + (baseThreat * closeThreatBoost);

      map.set(ally.unit.id, {
        incoming: updatedThreat,
        closeRange: inCloseRange || prev.closeRange,
        chargeableTurn: canChargeNextTurn || prev.chargeableTurn
      });
    });
  });
  return map;
}

function findNearestObjective(unit: UnitState, objectives: ObjectiveMarker[]): ObjectiveMarker | undefined {
  let best: ObjectiveMarker | undefined;
  let bestDist = Infinity;
  objectives.forEach(o => {
    const d = distance(unit.position, { x: o.x, y: o.y });
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  });
  return best;
}

interface CandidateMoveWithPath extends CandidateMove {
  /** Path to reach this candidate (if pathfinding was used) */
  path?: Point[];
  /** Effective distance accounting for terrain */
  effectiveDistance?: number;
}

function generateCandidates(
  unit: UnitState,
  objectives: ObjectiveMarker[],
  moveAllowance: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  terrain: TerrainFeature[] = [],
  navMeshOrSet?: NavMesh | NavMeshSet
): CandidateMoveWithPath[] {
  // Resolve correct NavMesh
  let navMesh: NavMesh | undefined;
  if (navMeshOrSet) {
    if ('default' in navMeshOrSet && !('waypoints' in navMeshOrSet)) {
      const set = navMeshOrSet as NavMeshSet;
      if (isUnitInfantry(unit) && set.infantry) {
        navMesh = set.infantry;
      } else {
        navMesh = set.default;
      }
    } else {
      navMesh = navMeshOrSet as NavMesh;
    }
  }
  const candidates: CandidateMoveWithPath[] = [];
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;
  const unitPos: Point = { x: unit.position.x, y: unit.position.y };

  // Hold - always valid
  candidates.push({ x: unit.position.x, y: unit.position.y, label: 'hold' });

  const nearestObj = findNearestObjective(unit, objectives);

  // Helper to add a candidate if reachable
  const addCandidate = (targetX: number, targetY: number, label: string) => {
    const target: Point = { x: targetX, y: targetY };

    // Calculate path to this candidate (now with unit type awareness)
    const pathResult = pathDistance(unitPos, target, navMesh, terrain, unit);

    if (pathResult.blocked && terrain.length > 0) {
      // Try to find a reachable point along the path
      if (pathResult.path.length > 2) {
        // Use intermediate waypoint as candidate
        const maxTravel = getMaxTravelPoint(pathResult.path, moveAllowance, terrain);
        if (distance(unitPos, maxTravel.point) > 0.5) {
          candidates.push({
            x: maxTravel.point.x,
            y: maxTravel.point.y,
            label: label + '-partial',
            path: pathResult.path.slice(0, maxTravel.pathIndex + 2),
            effectiveDistance: maxTravel.distanceTraveled,
          });
        }
      }
      return; // Don't add fully blocked candidate
    }

    // Check if we can reach within movement allowance
    if (pathResult.distance <= moveAllowance) {
      candidates.push({
        x: targetX,
        y: targetY,
        label,
        path: pathResult.path,
        effectiveDistance: pathResult.distance,
      });
    } else {
      // Can only move part way - find maximum reachable point
      const maxTravel = getMaxTravelPoint(pathResult.path, moveAllowance, terrain);
      candidates.push({
        x: maxTravel.point.x,
        y: maxTravel.point.y,
        label: label + '-partial',
        path: pathResult.path.slice(0, maxTravel.pathIndex + 2),
        effectiveDistance: maxTravel.distanceTraveled,
      });
    }
  };

  // Advance toward nearest objective
  if (nearestObj) {
    const dx = nearestObj.x - unit.position.x;
    const dy = nearestObj.y - unit.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    // Target the objective directly (let pathfinding handle obstacles)
    const targetX = len <= moveAllowance ? nearestObj.x : unit.position.x + (dx / len) * moveAllowance;
    const targetY = len <= moveAllowance ? nearestObj.y : unit.position.y + (dy / len) * moveAllowance;
    addCandidate(targetX, targetY, 'advance-obj');
  }

  // Backstep from center (defensive)
  const awayX = unit.position.x + (unit.position.x >= 0 ? moveAllowance : -moveAllowance);
  addCandidate(clamp(awayX, -halfW, halfW), unit.position.y, 'backstep');

  // Flank up/down
  addCandidate(unit.position.x, clamp(unit.position.y + moveAllowance, -halfH, halfH), 'flank-up');
  addCandidate(unit.position.x, clamp(unit.position.y - moveAllowance, -halfH, halfH), 'flank-down');

  // Seek Cover: Move towards nearby cover features
  if (terrain.length > 0) {
    for (const t of terrain) {
      // Only consider cover that isn't exposed (hills) and isn't too far away
      if ((t.traits.coverLight || t.traits.coverHeavy) && !t.traits.exposedPosition) {
        const d = distance(unitPos, { x: t.x, y: t.y });
        // Optimization: Only if within 2.5x movement (don't path across map for one ruin)
        if (d < moveAllowance * 2.5) {
          addCandidate(t.x, t.y, 'seek-cover');
        }
      }
    }
  }

  // Additional candidates: move around nearby terrain
  if (terrain.length > 0 && navMesh) {
    // Find nearby waypoints that could be tactical positions
    for (const wp of navMesh.waypoints.values()) {
      const wpDist = distance(unitPos, { x: wp.x, y: wp.y });
      if (wpDist <= moveAllowance && wpDist > 2) {
        // Check if this gives us a new angle (with unit type awareness)
        const pathResult = pathDistance(unitPos, { x: wp.x, y: wp.y }, navMesh, terrain, unit);
        if (!pathResult.blocked && pathResult.distance <= moveAllowance) {
          // Only add if not too close to existing candidates
          const tooClose = candidates.some(c =>
            distance({ x: c.x, y: c.y }, { x: wp.x, y: wp.y }) < 2
          );
          if (!tooClose) {
            candidates.push({
              x: wp.x,
              y: wp.y,
              label: 'waypoint',
              path: pathResult.path,
              effectiveDistance: pathResult.distance,
            });
          }
        }
      }
    }
  }

  return candidates;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function scoreCandidate(
  unit: UnitState,
  candidate: CandidateMove,
  objectives: ObjectiveMarker[],
  threatMap: Map<string, ThreatEstimate>,
  weights: PlannerWeights,
  activeTag: 'armyA' | 'armyB' = 'armyA',
  terrain: TerrainFeature[] = [],
  opponent?: ArmyState // Optional opponent to check LoS
): number {
  const nearestObj = findNearestObjective({ ...unit, position: { x: candidate.x, y: candidate.y } } as UnitState, objectives);
  const distToObj = nearestObj ? distance({ x: candidate.x, y: candidate.y }, { x: nearestObj.x, y: nearestObj.y }) : 0;

  // Calculate how far we're moving from current position
  const moveDistance = distance(unit.position, { x: candidate.x, y: candidate.y });

  // Calculate current distance to objective (before move)
  const currentDistToObj = nearestObj
    ? distance(unit.position, { x: nearestObj.x, y: nearestObj.y })
    : 0;

  // Prioritize primaries and enemy-held markers more heavily
  let priorityWeight = 1.0;
  if (nearestObj?.priority === 'primary') {
    priorityWeight = 1.5;
  }

  let controlWeight = 1.0;
  const controller = nearestObj?.controlledBy;
  if (controller && controller !== 'contested') {
    if (controller === activeTag) {
      controlWeight = 0.8; // already ours, smaller incentive to move
    } else {
      controlWeight = 1.25; // enemy held, push harder
    }
  }

  // Base objective value - inversely proportional to distance
  const objValue = nearestObj ? (weights.objectiveValue * priorityWeight * controlWeight) / Math.max(1, distToObj) : 0;

  // CLOSING BONUS: Strongly reward getting CLOSER to objectives
  // This is the key to encouraging movement toward objectives
  const distanceClosed = currentDistToObj - distToObj; // Positive if getting closer
  const closingBonus = nearestObj ? distanceClosed * weights.objectiveValue * 0.15 * priorityWeight * controlWeight : 0;

  const threat = threatMap.get(unit.unit.id);
  let threatPenalty = (threat?.incoming || 0) * weights.threatPenalty;

  // Increase penalty if in close range or under charge threat
  if (threat?.closeRange) {
    threatPenalty *= 1.3;
  }
  if (threat?.chargeableTurn) {
    threatPenalty *= 1.1;
  }

  // Favor melee closing in, ranged units want optimal range (12-24")
  const role = unit.role?.primary || 'mobile-firepower';
  let distanceBias = 0;
  if (role === 'melee-missile') {
    distanceBias = weights.damageBias * (1 / Math.max(ENGAGE_RANGE, distToObj));
  } else {
    // Ranged units prefer to be in their optimal firing range
    const optimalRange = 18;
    const rangeDeviation = Math.abs(distToObj - optimalRange);
    const rangeScore = 1 - Math.min(rangeDeviation / 24, 1);
    distanceBias = weights.damageBias * rangeScore;
  }

  // Movement cost - keep it LOW so it doesn't dominate
  // This should be a minor factor, not prevent movement entirely
  const moveCost = weights.distancePenalty * moveDistance * 0.1;

  // Small bonus for actually moving (to break close ties)
  const movementBonus = moveDistance > 0.5 ? 0.02 : 0;

  // NEW: Cover and LoS Scoring
  let tacticalScore = 0;

  if (terrain.length > 0) {
    // 1. Cover Bonus: Check if this position is in cover relative to threats
    const candidatePos = { x: candidate.x, y: candidate.y };
    // Check coverage from 'center' as a heuristic if no opponent is provided, 
    // or arguably just being IN terrain is valuable.
    const coverCheck = getTerrainCover(candidatePos, { x: 0, y: 0 }, terrain);

    if (coverCheck.hasCover) {
      tacticalScore += weights.coverBonus;
      // Heavy cover is worth more
      if (coverCheck.coverType === 'heavy') tacticalScore += weights.coverBonus * 0.5;
    }

    // 2. LoS Bonus: Can we see targets?
    if (opponent && weights.losBonus > 0) {
      const targets = opponent.units.filter(u => u.remainingModels > 0);
      let visibleTargets = 0;

      // Optimization: Check nearest 3 targets only to keep performance reasonable
      targets.sort((a, b) => distance({ x: a.position.x, y: a.position.y }, candidatePos) - distance({ x: b.position.x, y: b.position.y }, candidatePos));

      for (let i = 0; i < Math.min(3, targets.length); i++) {
        const target = targets[i];
        const los = checkLineOfSight(
          candidatePos,
          { x: target.position.x, y: target.position.y },
          terrain,
          unitIgnoresObscuring(unit),
          unitIgnoresObscuring(target)
        );

        if (los.hasLoS) {
          visibleTargets++;
        }
      }

      if (visibleTargets > 0) {
        // Cap bonus at 3 targets
        tacticalScore += weights.losBonus * Math.min(visibleTargets, 3);
      }
    }
  }

  return objValue + closingBonus + distanceBias - threatPenalty - moveCost + movementBonus + tacticalScore;
}

/** Movement plan for a single unit */
export interface PlannedMovement {
  unit: UnitState;
  to: { x: number; y: number };
  /** Path to follow (if using pathfinding) */
  path?: Point[];
  /** Whether unit is advancing */
  advanced?: boolean;
}

export function planGreedyMovement(
  active: ArmyState,
  opponent: ArmyState,
  objectives: ObjectiveMarker[],
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
  terrain: TerrainFeature[] = [],
  navMesh?: NavMesh | NavMeshSet
): { movements: PlannedMovement[] } {
  const threatMap = buildThreatMap(active, opponent);
  const movements: PlannedMovement[] = [];
  const activeTag = (active as any).tag ?? 'armyA';

  // Higher impact units move first: melee > mobile > others
  const priority = (u: UnitState) => {
    switch (u.role?.primary) {
      case 'melee-missile':
        return 0;
      case 'mobile-firepower':
      case 'skirmisher':
        return 1;
      default:
        return 2;
    }
  };

  const sorted = [...active.units]
    .filter(u => u.remainingModels > 0 && !u.inReserves)
    .sort((a, b) => priority(a) - priority(b));

  for (const u of sorted) {
    const mv = parseInt(u.unit.stats.move || '0', 10) || 0;
    const moveAllowance = allowAdvance ? mv + 3 : mv;
    const candidates = generateCandidates(u, objectives, moveAllowance, battlefieldWidth, battlefieldHeight, terrain, navMesh);
    let best: CandidateMoveWithPath = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const score = scoreCandidate(u, c, objectives, threatMap, weights, activeTag, terrain, opponent);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    // Determine if this was an advance move
    const actualDistance = best.effectiveDistance ?? distance(u.position, { x: best.x, y: best.y });
    const isAdvance = allowAdvance && actualDistance > mv;

    movements.push({
      unit: u,
      to: { x: best.x, y: best.y },
      path: best.path,
      advanced: isAdvance,
    });
  }

  return { movements };
}

interface BeamState {
  moves: Map<string, { x: number; y: number; path?: Point[] }>;
  score: number;
}

export function planBeamMovement(
  active: ArmyState,
  opponent: ArmyState,
  objectives: ObjectiveMarker[],
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number,
  weights: PlannerWeights = DEFAULT_WEIGHTS,
  beamWidth: number = 3,
  terrain: TerrainFeature[] = [],
  navMesh?: NavMesh | NavMeshSet
): { movements: PlannedMovement[] } {
  const threatMap = buildThreatMap(active, opponent);
  const activeTag = (active as any).tag ?? 'armyA';
  const sorted = [...active.units]
    .filter(u => u.remainingModels > 0 && !u.inReserves)
    .sort((a, b) => {
      const priority = (u: UnitState) => {
        switch (u.role?.primary) {
          case 'melee-missile':
            return 0;
          case 'mobile-firepower':
          case 'skirmisher':
            return 1;
          default:
            return 2;
        }
      };
      return priority(a) - priority(b);
    });

  // Start with one empty state
  let beam: BeamState[] = [{ moves: new Map(), score: 0 }];

  for (const unit of sorted) {
    const mv = parseInt(unit.unit.stats.move || '0', 10) || 0;
    const moveAllowance = allowAdvance ? mv + 3 : mv;
    const candidates = generateCandidates(unit, objectives, moveAllowance, battlefieldWidth, battlefieldHeight, terrain, navMesh);

    // Generate next states by adding each candidate to each beam state
    const nextStates: BeamState[] = [];
    for (const state of beam) {
      for (const candidate of candidates) {
        const newMoves = new Map(state.moves);
        newMoves.set(unit.unit.id, { x: candidate.x, y: candidate.y, path: candidate.path });
        const score = state.score + scoreCandidate(unit, candidate, objectives, threatMap, weights, activeTag, terrain, opponent);
        nextStates.push({ moves: newMoves, score });
      }
    }

    // Keep top-K states by score
    nextStates.sort((a, b) => b.score - a.score);
    beam = nextStates.slice(0, beamWidth);
  }

  // Extract best state
  const bestState = beam[0] || { moves: new Map(), score: 0 };
  const movements: PlannedMovement[] = [];
  for (const unit of sorted) {
    const mv = parseInt(unit.unit.stats.move || '0', 10) || 0;
    const move = bestState.moves.get(unit.unit.id) || { x: unit.position.x, y: unit.position.y };
    const actualDist = distance(unit.position, { x: move.x, y: move.y });
    movements.push({
      unit,
      to: { x: move.x, y: move.y },
      path: move.path,
      advanced: allowAdvance && actualDist > mv,
    });
  }

  return { movements };
}

export function planMovement(
  active: ArmyState,
  opponent: ArmyState,
  objectives: ObjectiveMarker[],
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number,
  strategy: StrategyProfile = 'greedy',
  useBeamSearch: boolean = false,
  beamWidth: number = 3,
  terrain: TerrainFeature[] = [],
  navMesh?: NavMesh | NavMeshSet
): { movements: PlannedMovement[] } {
  const weights = getStrategyWeights(strategy);
  if (useBeamSearch) {
    return planBeamMovement(active, opponent, objectives, allowAdvance, battlefieldWidth, battlefieldHeight, weights, beamWidth, terrain, navMesh);
  } else {
    return planGreedyMovement(active, opponent, objectives, allowAdvance, battlefieldWidth, battlefieldHeight, weights, terrain, navMesh);
  }
}

// Re-export for convenience
export { generateNavMesh } from './pathfinding';
