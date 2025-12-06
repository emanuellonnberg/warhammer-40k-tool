import { rollD6, rollMultipleD6 } from './dice';
import type { ArmyState, UnitState } from './types';

/**
 * Determines if a unit is Below Half-strength per 40K rules
 * - Single model unit: Below Half if remaining wounds < half max wounds
 * - Multi-model unit: Below Half if remaining models < half starting strength
 */
export function isBelowHalfStrength(unit: UnitState): boolean {
  // Single model unit (character, vehicle with 1 model)
  if (unit.unit.count === 1) {
    const maxWounds = parseInt(unit.unit.stats.wounds, 10);
    return unit.remainingWounds < maxWounds / 2;
  }
  
  // Multi-model unit
  const startingStrength = unit.unit.count;
  return unit.remainingModels < startingStrength / 2;
}

/**
 * Perform Battle Shock test for a single unit
 * Returns true if the test is passed, false if unit becomes Battle-shocked
 */
export function testBattleShock(unit: UnitState): boolean {
  const leadershipStr = unit.unit.stats.leadership;
  const leadership = parseInt(leadershipStr, 10);
  
  // Roll 2D6
  const roll = rollMultipleD6(2);
  
  // Test passes if roll >= Leadership
  return roll >= leadership;
}

/**
 * Resolve Battle Shock for all below-half-strength units in an army
 * Returns list of units that became Battle-shocked
 */
export function resolveBattleShock(
  army: ArmyState,
  currentTurn: number
): { unit: UnitState; roll: number; leadership: number; passed: boolean }[] {
  const results: { unit: UnitState; roll: number; leadership: number; passed: boolean }[] = [];
  
  for (const unit of army.units) {
    // Skip if unit is already destroyed
    if (unit.remainingModels <= 0) continue;
    
    // Skip if unit is in reserves
    if (unit.inReserves) continue;
    
    // Clear expired Battle Shock (expires at start of Command phase when currentTurn reaches expiry turn)
    if (unit.battleShocked && unit.battleShockedUntilTurn !== undefined) {
      if (currentTurn >= unit.battleShockedUntilTurn) {
        unit.battleShocked = false;
        unit.battleShockedUntilTurn = undefined;
      }
    }
    
    // Check if unit qualifies for Battle Shock test
    if (!isBelowHalfStrength(unit)) continue;
    
    // Perform the test
    const leadershipStr = unit.unit.stats.leadership;
    const leadership = parseInt(leadershipStr, 10);
    const roll = rollMultipleD6(2);
    const passed = roll >= leadership;
    
    results.push({ unit, roll, leadership, passed });
    
    if (!passed) {
      // Unit fails and becomes Battle-shocked until start of next Command phase
      unit.battleShocked = true;
      unit.battleShockedUntilTurn = currentTurn + 1;
    }
  }
  
  return results;
}

/**
 * Get human-readable Battle Shock test result summary
 */
export function formatBattleShockResult(result: {
  unit: UnitState;
  roll: number;
  leadership: number;
  passed: boolean;
}): string {
  const testResult = result.passed ? 'PASSED' : 'FAILED';
  return `${result.unit.unit.name}: rolled ${result.roll} vs Ld${result.leadership} - ${testResult}`;
}
