import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isBelowHalfStrength, resolveBattleShock, formatBattleShockResult } from '../src/simulation/battle-shock';
import type { ArmyState, UnitState } from '../src/simulation/types';
import type { Unit } from '../src/types';

// Mock unit for testing
function createMockUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 'test-unit',
    name: 'Test Unit',
    type: 'Infantry',
    stats: {
      move: '6"',
      toughness: '4',
      save: '3+',
      wounds: '1',
      leadership: '8',
      objectiveControl: '2',
    },
    points: 100,
    count: 5,
    weapons: [],
    ...overrides,
  };
}

// Mock unit state for testing
function createMockUnitState(overrides: Partial<UnitState> = {}): UnitState {
  return {
    unit: createMockUnit(),
    remainingModels: 5,
    remainingWounds: 5,
    role: {
      primary: 'infantry' as any,
      optimalRange: 12,
      chargeThreat: 10,
    },
    position: { x: 0, y: 0 },
    engaged: false,
    modelPositions: [],
    ...overrides,
  };
}

// Mock army state
function createMockArmyState(units: UnitState[] = []): ArmyState {
  return {
    army: {
      armyName: 'Test Army',
      faction: 'Test Faction',
      pointsTotal: 500,
      units: units.map(u => u.unit),
    },
    units: units.length > 0 ? units : [createMockUnitState()],
    tag: 'armyA',
  };
}

describe('Battle Shock Tests', () => {
  describe('isBelowHalfStrength', () => {
    it('should return false for full-strength multi-model unit', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 5,
      });
      expect(isBelowHalfStrength(unit)).toBe(false);
    });

    it('should return true for multi-model unit below half strength', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 2, // Less than 2.5 (half of 5)
      });
      expect(isBelowHalfStrength(unit)).toBe(true);
    });

    it('should return false for single-model unit with full wounds', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 1, stats: { ...createMockUnit().stats, wounds: '4' } }),
        remainingModels: 1,
        remainingWounds: 4,
      });
      expect(isBelowHalfStrength(unit)).toBe(false);
    });

    it('should return true for single-model unit with wounds below half', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 1, stats: { ...createMockUnit().stats, wounds: '4' } }),
        remainingModels: 1,
        remainingWounds: 1, // Less than 2 (half of 4)
      });
      expect(isBelowHalfStrength(unit)).toBe(true);
    });

    it('should return false for unit at exactly half strength', () => {
      // 3 out of 6 is exactly half (not below), so should return false
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 6 }),
        remainingModels: 3,
      });
      expect(isBelowHalfStrength(unit)).toBe(false);
    });
  });

  describe('resolveBattleShock', () => {
    it('should not test units that are not below half strength', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 5,
      });
      const army = createMockArmyState([unit]);
      
      const results = resolveBattleShock(army, 1);
      expect(results).toHaveLength(0);
    });

    it('should skip destroyed units', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 0,
      });
      const army = createMockArmyState([unit]);
      
      const results = resolveBattleShock(army, 1);
      expect(results).toHaveLength(0);
    });

    it('should skip units in reserves', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 2,
        inReserves: true,
      });
      const army = createMockArmyState([unit]);
      
      const results = resolveBattleShock(army, 1);
      expect(results).toHaveLength(0);
    });

    it('should test below-half-strength units and set battleShocked flag on failure', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5, stats: { ...createMockUnit().stats, leadership: '20' } }),
        remainingModels: 2,
      });
      const army = createMockArmyState([unit]);
      
      // Mock dice rolls to always return low value (failure)
      vi.spyOn(Math, 'random').mockReturnValue(0); // Will roll 1 on each d6 = 2 total, vs Ld20
      
      const results = resolveBattleShock(army, 1);
      
      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(false);
      expect(unit.battleShocked).toBe(true);
      expect(unit.battleShockedUntilTurn).toBe(2); // Current turn + 1
      
      vi.restoreAllMocks();
    });

    it('should clear expired Battle Shock status', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 5, // Full strength so won't be re-tested
        battleShocked: true,
        battleShockedUntilTurn: 1,
      });
      const army = createMockArmyState([unit]);
      
      resolveBattleShock(army, 1); // At turn 1, should clear battleShockedUntilTurn === 1
      
      expect(unit.battleShocked).toBe(false);
      expect(unit.battleShockedUntilTurn).toBeUndefined();
    });

    it('should not clear unexpired Battle Shock status', () => {
      const unit = createMockUnitState({
        unit: createMockUnit({ count: 5 }),
        remainingModels: 2,
        battleShocked: true,
        battleShockedUntilTurn: 3,
      });
      const army = createMockArmyState([unit]);
      
      resolveBattleShock(army, 1); // At turn 1, battleShockedUntilTurn is 3, not yet expired
      
      expect(unit.battleShocked).toBe(true);
    });
  });

  describe('formatBattleShockResult', () => {
    it('should format passed test', () => {
      const unit = createMockUnitState({ unit: createMockUnit({ name: 'Intercessors' }) });
      const result = { unit, roll: 8, leadership: 8, passed: true };
      
      const formatted = formatBattleShockResult(result);
      expect(formatted).toContain('Intercessors');
      expect(formatted).toContain('rolled 8');
      expect(formatted).toContain('Ld8');
      expect(formatted).toContain('PASSED');
    });

    it('should format failed test', () => {
      const unit = createMockUnitState({ unit: createMockUnit({ name: 'Guardsmen' }) });
      const result = { unit, roll: 4, leadership: 7, passed: false };
      
      const formatted = formatBattleShockResult(result);
      expect(formatted).toContain('Guardsmen');
      expect(formatted).toContain('rolled 4');
      expect(formatted).toContain('Ld7');
      expect(formatted).toContain('FAILED');
    });
  });
});
