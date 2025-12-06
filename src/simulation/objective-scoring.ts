import type { ObjectiveMarker } from './types';

/**
 * Objective scoring configuration for different mission types
 */
export interface ObjectiveScoringConfig {
  // VP per objective held (before priority modifiers)
  vpPerObjective: number;
  // Additional VP for primary objectives
  primaryObjectiveBonus: number;
  // VP earned only if held for N consecutive rounds (0 = score immediately)
  holdTimerRequired: number;
  // VP earned at end of round for holding an objective
  endOfRoundScore: boolean;
}

/**
 * Default 40K matched play objective scoring: 
 * - 3 VP per objective at end of round
 * - +2 VP bonus if objective is primary
 * - Primary objectives worth 5 VP, secondary worth 3 VP
 */
export const DEFAULT_OBJECTIVE_SCORING: ObjectiveScoringConfig = {
  vpPerObjective: 3,
  primaryObjectiveBonus: 2,
  holdTimerRequired: 0, // Score immediately
  endOfRoundScore: true // Score at end of round
};

/**
 * Mission scoring presets per variant
 */
export const MISSION_SCORING_PRESETS: Record<string, ObjectiveScoringConfig> = {
  'matched-play': DEFAULT_OBJECTIVE_SCORING,
  'hold-2': {
    vpPerObjective: 3,
    primaryObjectiveBonus: 2,
    holdTimerRequired: 2, // Must hold for 2 rounds to score
    endOfRoundScore: true
  },
  'high-stakes': {
    vpPerObjective: 5,
    primaryObjectiveBonus: 3,
    holdTimerRequired: 0,
    endOfRoundScore: true
  }
};

/**
 * Get scoring config by mission name
 */
export function getMissionScoringConfig(missionName?: string): ObjectiveScoringConfig {
  if (!missionName || !MISSION_SCORING_PRESETS[missionName]) {
    return DEFAULT_OBJECTIVE_SCORING;
  }
  return MISSION_SCORING_PRESETS[missionName];
}

/**
 * Update objective control based on current unit positions
 * Also accumulates hold time for objectives
 */
export function updateObjectiveControl(
  objectives: ObjectiveMarker[],
  stateA: any,
  stateB: any,
  updateHoldTime: boolean = false
): void {
  const CONTROL_RANGE_HORIZONTAL = 3;
  const CONTROL_RANGE_VERTICAL = 5;

  for (const obj of objectives) {
    let levelOfControlA = 0;
    let levelOfControlB = 0;
    const unitsControllingA: string[] = [];
    const unitsControllingB: string[] = [];

    // Calculate Level of Control for armyA
    for (const u of stateA.units) {
      if (u.remainingModels <= 0 || u.inReserves) continue;
      if (u.battleShocked) continue; // Battle-shocked units have OC of 0
      
      const dx = Math.abs(u.position.x - obj.x);
      const dy = Math.abs(u.position.y - obj.y);
      
      if (dx <= CONTROL_RANGE_HORIZONTAL && dy <= CONTROL_RANGE_VERTICAL) {
        const oc = parseInt(u.unit.stats.objectiveControl || '0', 10);
        const contribution = oc * u.remainingModels;
        levelOfControlA += contribution;
        
        if (oc > 0) {
          unitsControllingA.push(u.unit.name);
        }
      }
    }

    // Calculate Level of Control for armyB
    for (const u of stateB.units) {
      if (u.remainingModels <= 0 || u.inReserves) continue;
      if (u.battleShocked) continue;
      
      const dx = Math.abs(u.position.x - obj.x);
      const dy = Math.abs(u.position.y - obj.y);
      
      if (dx <= CONTROL_RANGE_HORIZONTAL && dy <= CONTROL_RANGE_VERTICAL) {
        const oc = parseInt(u.unit.stats.objectiveControl || '0', 10);
        const contribution = oc * u.remainingModels;
        levelOfControlB += contribution;
        
        if (oc > 0) {
          unitsControllingB.push(u.unit.name);
        }
      }
    }

    obj.levelOfControlA = levelOfControlA;
    obj.levelOfControlB = levelOfControlB;
    obj.scoringUnitsA = unitsControllingA;
    obj.scoringUnitsB = unitsControllingB;

    // Determine control and update hold time
    const previousController = obj.controlledBy;
    
    if (levelOfControlA > levelOfControlB) {
      obj.controlledBy = 'armyA';
    } else if (levelOfControlB > levelOfControlA) {
      obj.controlledBy = 'armyB';
    } else {
      obj.controlledBy = 'contested';
    }

    // Update hold timers
    if (updateHoldTime) {
      if (obj.controlledBy === 'armyA') {
        obj.heldByA = (previousController === 'armyA' ? obj.heldByA : 0) + 1;
        obj.heldByB = 0;
      } else if (obj.controlledBy === 'armyB') {
        obj.heldByB = (previousController === 'armyB' ? obj.heldByB : 0) + 1;
        obj.heldByA = 0;
      } else {
        obj.heldByA = 0;
        obj.heldByB = 0;
      }
    }
  }
}

/**
 * Calculate VP rewards for each army based on objective control
 */
export function calculateVictoryPoints(
  objectives: ObjectiveMarker[],
  config: ObjectiveScoringConfig = DEFAULT_OBJECTIVE_SCORING
): { armyA: number; armyB: number } {
  let vpA = 0;
  let vpB = 0;

  for (const obj of objectives) {
    if (!config.endOfRoundScore) continue; // Only score at end of round if enabled

    let baseVp = config.vpPerObjective;
    
    // Add bonus for primary objectives
    if (obj.priority === 'primary') {
      baseVp += config.primaryObjectiveBonus;
    }

    // Check hold time requirements
    if (config.holdTimerRequired > 0) {
      if (obj.controlledBy === 'armyA' && obj.heldByA >= config.holdTimerRequired) {
        vpA += baseVp;
      } else if (obj.controlledBy === 'armyB' && obj.heldByB >= config.holdTimerRequired) {
        vpB += baseVp;
      }
    } else {
      // Score immediately without hold timer
      if (obj.controlledBy === 'armyA') {
        vpA += baseVp;
      } else if (obj.controlledBy === 'armyB') {
        vpB += baseVp;
      }
    }
  }

  return { armyA: vpA, armyB: vpB };
}

/**
 * Get human-readable objective summary
 */
export function getObjectiveSummary(
  objectives: ObjectiveMarker[],
  config: ObjectiveScoringConfig = DEFAULT_OBJECTIVE_SCORING
): string {
  const summary: string[] = [];
  
  for (const obj of objectives) {
    const priorityLabel = obj.priority === 'primary' ? 'P' : 'S';
    const baseVp = config.vpPerObjective + (obj.priority === 'primary' ? config.primaryObjectiveBonus : 0);
    const holdNeeded = config.holdTimerRequired;

    let status = '';
    if (obj.controlledBy === 'armyA') {
      const remaining = Math.max(0, holdNeeded - (obj.heldByA || 0));
      const vpHint = remaining > 0 ? `in ${remaining}r` : `+${baseVp}VP`;
      status = `${obj.name} [${priorityLabel}]: A (h${obj.heldByA || 0}, ${vpHint})`;
    } else if (obj.controlledBy === 'armyB') {
      const remaining = Math.max(0, holdNeeded - (obj.heldByB || 0));
      const vpHint = remaining > 0 ? `in ${remaining}r` : `+${baseVp}VP`;
      status = `${obj.name} [${priorityLabel}]: B (h${obj.heldByB || 0}, ${vpHint})`;
    } else {
      status = `${obj.name} [${priorityLabel}]: Contested (0VP)`;
    }
    summary.push(status);
  }
  
  return summary.join(' | ');
}
