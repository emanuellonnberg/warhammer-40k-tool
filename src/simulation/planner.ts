import type { ArmyState, ObjectiveMarker, UnitState } from './types';
import type { Unit } from '../types';
import type { TerrainFeature, Point } from './terrain';
import type { NavMesh, PathResult } from './pathfinding';
import { isMovementBlocked, getMovementPenalty } from './terrain';
import { findPath, euclideanDistance, getMaxTravelPoint, generateNavMesh } from './pathfinding';

export interface PlannerWeights {
  objectiveValue: number;
  threatPenalty: number;
  damageBias: number;
  distancePenalty: number;
}

export type StrategyProfile = 'greedy' | 'aggressive' | 'defensive' | 'objective-focused';

export function getStrategyWeights(profile: StrategyProfile): PlannerWeights {
  switch (profile) {
    case 'aggressive':
      return { objectiveValue: 0.5, threatPenalty: 0.3, damageBias: 1.5, distancePenalty: 0.1 };
    case 'defensive':
      return { objectiveValue: 0.8, threatPenalty: 1.5, damageBias: 0.2, distancePenalty: 0.3 };
    case 'objective-focused':
      return { objectiveValue: 2.0, threatPenalty: 0.5, damageBias: 0.2, distancePenalty: 0.1 };
    case 'greedy':
    default:
      return { objectiveValue: 1.0, threatPenalty: 0.7, damageBias: 0.4, distancePenalty: 0.2 };
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
 */
function pathDistance(
  a: Point,
  b: Point,
  navMesh: NavMesh | undefined,
  terrain: TerrainFeature[]
): { distance: number; path: Point[]; blocked: boolean } {
  if (!navMesh || terrain.length === 0) {
    return { distance: euclideanDistance(a, b), path: [a, b], blocked: false };
  }

  const result = findPath(a, b, navMesh, terrain, true, false);
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
      const baseThreat = Math.max(0, threatRadius - d) / Math.max(1, threatRadius);
      
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
  navMesh?: NavMesh
): CandidateMoveWithPath[] {
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

    // Calculate path to this candidate
    const pathResult = pathDistance(unitPos, target, navMesh, terrain);

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

  // Additional candidates: move around nearby terrain
  if (terrain.length > 0 && navMesh) {
    // Find nearby waypoints that could be tactical positions
    for (const wp of navMesh.waypoints.values()) {
      const wpDist = distance(unitPos, { x: wp.x, y: wp.y });
      if (wpDist <= moveAllowance && wpDist > 2) {
        // Check if this gives us a new angle
        const pathResult = pathDistance(unitPos, { x: wp.x, y: wp.y }, navMesh, terrain);
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
  activeTag: 'armyA' | 'armyB' = 'armyA'
): number {
  const nearestObj = findNearestObjective({ ...unit, position: { x: candidate.x, y: candidate.y } } as UnitState, objectives);
  const distToObj = nearestObj ? distance({ x: candidate.x, y: candidate.y }, { x: nearestObj.x, y: nearestObj.y }) : 0;

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

  const objValue = nearestObj ? (weights.objectiveValue * priorityWeight * controlWeight) / Math.max(1, distToObj) : 0;

  const threat = threatMap.get(unit.unit.id);
  let threatPenalty = (threat?.incoming || 0) * weights.threatPenalty;
  
  // Increase penalty if in close range or under charge threat
  if (threat?.closeRange) {
    threatPenalty *= 1.3; // 30% more weight to close range threats
  }
  if (threat?.chargeableTurn) {
    threatPenalty *= 1.1; // 10% more weight to charge threats
  }

  // Favor melee closing in, ranged keeping distance by using unit role
  const role = unit.role?.primary || 'mobile-firepower';
  let distanceBias = 0;
  if (role === 'melee-missile') {
    distanceBias = weights.damageBias * (1 / Math.max(ENGAGE_RANGE, distToObj));
  } else {
    distanceBias = weights.damageBias * (Math.min(distToObj, 24) / 24);
  }

  const moveCost = weights.distancePenalty * Math.abs(candidate.x - unit.position.x);

  return objValue + distanceBias - threatPenalty - moveCost;
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
  navMesh?: NavMesh
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
      const score = scoreCandidate(u, c, objectives, threatMap, weights, activeTag);
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
  navMesh?: NavMesh
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
        const score = state.score + scoreCandidate(unit, candidate, objectives, threatMap, weights, activeTag);
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
  navMesh?: NavMesh
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
