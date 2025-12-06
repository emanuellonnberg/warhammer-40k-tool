import type { ArmyState, ObjectiveMarker, UnitState } from './types';
import type { Unit } from '../types';

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

function generateCandidates(
  unit: UnitState,
  objectives: ObjectiveMarker[],
  moveAllowance: number,
  battlefieldWidth: number,
  battlefieldHeight: number
): CandidateMove[] {
  const candidates: CandidateMove[] = [];
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;

  // Hold
  candidates.push({ x: unit.position.x, y: unit.position.y, label: 'hold' });

  const nearestObj = findNearestObjective(unit, objectives);

  // Advance toward nearest objective
  if (nearestObj) {
    const dx = nearestObj.x - unit.position.x;
    const dy = nearestObj.y - unit.position.y;
    const len = Math.max(Math.sqrt(dx * dx + dy * dy), 0.001);
    const step = Math.min(moveAllowance, len);
    candidates.push({
      x: unit.position.x + (dx / len) * step,
      y: unit.position.y + (dy / len) * step,
      label: 'advance-obj'
    });
  }

  // Backstep from center (defensive)
  const awayX = unit.position.x + (unit.position.x >= 0 ? moveAllowance : -moveAllowance);
  candidates.push({ x: clamp(awayX, -halfW, halfW), y: unit.position.y, label: 'backstep' });

  // Flank up/down
  candidates.push({ x: unit.position.x, y: clamp(unit.position.y + moveAllowance, -halfH, halfH), label: 'flank-up' });
  candidates.push({ x: unit.position.x, y: clamp(unit.position.y - moveAllowance, -halfH, halfH), label: 'flank-down' });

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

export function planGreedyMovement(
  active: ArmyState,
  opponent: ArmyState,
  objectives: ObjectiveMarker[],
  allowAdvance: boolean,
  battlefieldWidth: number,
  battlefieldHeight: number,
  weights: PlannerWeights = DEFAULT_WEIGHTS
): { movements: { unit: UnitState; to: { x: number; y: number } }[] } {
  const threatMap = buildThreatMap(active, opponent);
  const movements: { unit: UnitState; to: { x: number; y: number } }[] = [];
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
    const candidates = generateCandidates(u, objectives, moveAllowance, battlefieldWidth, battlefieldHeight);
    let best = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const score = scoreCandidate(u, c, objectives, threatMap, weights, activeTag);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    movements.push({ unit: u, to: { x: best.x, y: best.y } });
  }

  return { movements };
}

interface BeamState {
  moves: Map<string, { x: number; y: number }>;
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
  beamWidth: number = 3
): { movements: { unit: UnitState; to: { x: number; y: number } }[] } {
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
    const candidates = generateCandidates(unit, objectives, moveAllowance, battlefieldWidth, battlefieldHeight);

    // Generate next states by adding each candidate to each beam state
    const nextStates: BeamState[] = [];
    for (const state of beam) {
      for (const candidate of candidates) {
        const newMoves = new Map(state.moves);
        newMoves.set(unit.unit.id, { x: candidate.x, y: candidate.y });
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
  const movements: { unit: UnitState; to: { x: number; y: number } }[] = [];
  for (const unit of sorted) {
    const move = bestState.moves.get(unit.unit.id) || { x: unit.position.x, y: unit.position.y };
    movements.push({ unit, to: move });
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
  beamWidth: number = 3
): { movements: { unit: UnitState; to: { x: number; y: number } }[] } {
  const weights = getStrategyWeights(strategy);
  if (useBeamSearch) {
    return planBeamMovement(active, opponent, objectives, allowAdvance, battlefieldWidth, battlefieldHeight, weights, beamWidth);
  } else {
    return planGreedyMovement(active, opponent, objectives, allowAdvance, battlefieldWidth, battlefieldHeight, weights);
  }
}
