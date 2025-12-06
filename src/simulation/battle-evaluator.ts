import type { ArmyState, ObjectiveMarker } from './types';
import type { StrategyProfile } from './planner';

/**
 * Battle state metrics for adaptive strategy decisions
 */
export interface BattleState {
  // Victory point metrics
  vpDifferential: number; // Positive = winning, negative = losing
  vpLead: number; // Absolute VP lead
  
  // Army strength metrics
  strengthRatio: number; // Our strength / enemy strength (1.0 = equal, >1 = winning, <1 = losing)
  ourStrength: number; // 0-1 scale of remaining army power
  enemyStrength: number; // 0-1 scale of enemy remaining power
  
  // Objective control
  objectivesControlled: number; // How many objectives we control
  objectivesContested: number; // How many objectives are contested
  
  // Tactical position
  averageDistanceToObjectives: number; // How close we are to objectives
  unitsInDanger: number; // Units below half strength or heavily threatened
  totalUnits: number; // Total number of active units on battlefield
}

/**
 * Calculate army strength as a 0-1 ratio based on points remaining
 */
function calculateArmyStrength(army: ArmyState): number {
  let totalPoints = 0;
  let remainingPoints = 0;
  
  for (const unit of army.units) {
    const unitPoints = unit.unit.points;
    totalPoints += unitPoints;
    
    // Estimate remaining value based on model count
    if (unit.unit.count > 0) {
      const survivalRatio = unit.remainingModels / unit.unit.count;
      remainingPoints += unitPoints * survivalRatio;
    }
  }
  
  return totalPoints > 0 ? remainingPoints / totalPoints : 0;
}

/**
 * Count units below half strength (in danger of Battle Shock)
 */
function countUnitsInDanger(army: ArmyState): number {
  let count = 0;
  
  for (const unit of army.units) {
    if (unit.remainingModels <= 0 || unit.inReserves) continue;
    
    // Single model unit
    if (unit.unit.count === 1) {
      const maxWounds = parseInt(unit.unit.stats.wounds, 10);
      if (unit.remainingWounds < maxWounds / 2) count++;
    } else {
      // Multi-model unit
      if (unit.remainingModels < unit.unit.count / 2) count++;
    }
  }
  
  return count;
}

/**
 * Calculate average distance from our units to objectives
 */
function calculateAverageDistanceToObjectives(
  army: ArmyState,
  objectives: ObjectiveMarker[]
): number {
  if (objectives.length === 0) return 0;
  
  let totalDistance = 0;
  let unitCount = 0;
  
  for (const unit of army.units) {
    if (unit.remainingModels <= 0 || unit.inReserves) continue;
    
    // Find closest objective
    let minDist = Infinity;
    for (const obj of objectives) {
      const dist = Math.sqrt(
        Math.pow(unit.position.x - obj.x, 2) + 
        Math.pow(unit.position.y - obj.y, 2)
      );
      if (dist < minDist) minDist = dist;
    }
    
    if (minDist < Infinity) {
      totalDistance += minDist;
      unitCount++;
    }
  }
  
  return unitCount > 0 ? totalDistance / unitCount : 0;
}

/**
 * Evaluate current battle state for adaptive strategy decisions
 */
export function evaluateBattleState(
  ourArmy: ArmyState,
  enemyArmy: ArmyState,
  objectives: ObjectiveMarker[],
  ourVP: number,
  enemyVP: number
): BattleState {
  const ourStrength = calculateArmyStrength(ourArmy);
  const enemyStrength = calculateArmyStrength(enemyArmy);
  const strengthRatio = enemyStrength > 0 ? ourStrength / enemyStrength : 1.0;
  
  const vpDifferential = ourVP - enemyVP;
  const vpLead = Math.abs(vpDifferential);
  
  let objectivesControlled = 0;
  let objectivesContested = 0;
  
  for (const obj of objectives) {
    if (obj.controlledBy === ourArmy.tag) objectivesControlled++;
    else if (obj.controlledBy === 'contested') objectivesContested++;
  }
  
  // Count total active units (not destroyed, not in reserves)
  const totalUnits = ourArmy.units.filter(u => u.remainingModels > 0 && !u.inReserves).length;
  
  return {
    vpDifferential,
    vpLead,
    strengthRatio,
    ourStrength,
    enemyStrength,
    objectivesControlled,
    objectivesContested,
    averageDistanceToObjectives: calculateAverageDistanceToObjectives(ourArmy, objectives),
    unitsInDanger: countUnitsInDanger(ourArmy),
    totalUnits
  };
}

/**
 * Recommend strategy profile based on battle state
 * Returns adaptive strategy or null to keep current strategy
 */
export function recommendStrategy(
  state: BattleState,
  currentTurn: number,
  maxTurns: number
): StrategyProfile | null {
  // Early game (turns 1-2): Aggressive push for objectives
  if (currentTurn <= 2) {
    return 'objective-focused';
  }
  
  // Late game (last 2 turns): Strategy depends on VP situation
  if (currentTurn >= maxTurns - 1) {
    if (state.vpDifferential >= 10) {
      // Big VP lead: Play defensively, protect it
      return 'defensive';
    } else if (state.vpDifferential <= -10) {
      // Big VP deficit: All-in aggressive push
      return 'aggressive';
    } else {
      // Close game: Focus on objectives
      return 'objective-focused';
    }
  }
  
  // Mid-game: Adapt based on combined metrics
  
  // Winning on both fronts (VP and strength): Play defensive
  if (state.vpDifferential > 5 && state.strengthRatio > 1.2) {
    return 'defensive';
  }
  
  // Losing badly (VP deficit and weak): Desperate aggression
  if (state.vpDifferential < -10 && state.strengthRatio < 0.8) {
    return 'aggressive';
  }
  
  // Losing VP but strong army: Push for objectives aggressively
  if (state.vpDifferential < -5 && state.strengthRatio >= 1.0) {
    return 'objective-focused';
  }
  
  // Winning VP but weak army: Hold objectives defensively
  if (state.vpDifferential > 5 && state.strengthRatio < 0.9) {
    return 'defensive';
  }
  
  // Most units in danger of Battle Shock: Consolidate defensively
  if (state.totalUnits > 0 && state.unitsInDanger / state.totalUnits > 0.5) {
    return 'defensive';
  }
  
  // Default: No change, keep current strategy
  return null;
}

/**
 * Get human-readable explanation of strategy recommendation
 */
export function explainStrategyChoice(
  state: BattleState,
  strategy: StrategyProfile,
  currentTurn: number
): string {
  const reasons: string[] = [];
  
  if (currentTurn <= 2) {
    reasons.push('Early game objective rush');
  } else if (state.vpDifferential >= 10) {
    reasons.push(`VP lead +${state.vpDifferential}`);
  } else if (state.vpDifferential <= -10) {
    reasons.push(`VP deficit ${state.vpDifferential}`);
  }
  
  if (state.strengthRatio > 1.2) {
    reasons.push('Army advantage');
  } else if (state.strengthRatio < 0.8) {
    reasons.push('Army disadvantage');
  }
  
  if (state.unitsInDanger > 2) {
    reasons.push(`${state.unitsInDanger} units in danger`);
  }
  
  return reasons.length > 0 ? reasons.join(', ') : 'Balanced situation';
}
