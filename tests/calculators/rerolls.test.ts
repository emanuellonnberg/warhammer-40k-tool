/**
 * Tests for re-roll mechanics
 */

import { describe, it, expect } from 'vitest';
import { applyReroll, getBestReroll, calculateHitChanceWithReroll, calculateWoundChanceWithReroll } from '../../src/calculators/rerolls';
import { RerollType } from '../../src/types';

describe('Re-roll Mechanics', () => {
  describe('applyReroll', () => {
    it('should return base chance when no re-roll', () => {
      expect(applyReroll(0.5, RerollType.NONE)).toBe(0.5);
      expect(applyReroll(2/3, RerollType.NONE)).toBeCloseTo(2/3, 5);
    });

    it('should calculate re-roll 1s correctly for BS 3+', () => {
      const baseChance = 4/6; // 66.67%
      const result = applyReroll(baseChance, RerollType.ONES);
      // Formula: P × (7/6) = (4/6) × (7/6) = 28/36 = 7/9
      expect(result).toBeCloseTo(7/9, 5); // 77.78%
    });

    it('should calculate re-roll 1s correctly for BS 4+', () => {
      const baseChance = 3/6; // 50%
      const result = applyReroll(baseChance, RerollType.ONES);
      // Formula: P × (7/6) = (3/6) × (7/6) = 21/36 = 7/12
      expect(result).toBeCloseTo(7/12, 5); // 58.33%
    });

    it('should calculate re-roll failed correctly for BS 3+', () => {
      const baseChance = 4/6; // 66.67%
      const result = applyReroll(baseChance, RerollType.FAILED);
      // Formula: P × (2 - P) = (4/6) × (2 - 4/6) = (4/6) × (8/6) = 32/36 = 8/9
      expect(result).toBeCloseTo(8/9, 5); // 88.89%
    });

    it('should calculate re-roll failed correctly for BS 4+', () => {
      const baseChance = 3/6; // 50%
      const result = applyReroll(baseChance, RerollType.FAILED);
      // Formula: P × (2 - P) = (3/6) × (2 - 3/6) = (3/6) × (9/6) = 27/36 = 3/4
      expect(result).toBeCloseTo(3/4, 5); // 75%
    });

    it('should calculate re-roll all correctly (same as failed)', () => {
      const baseChance = 0.5;
      const resultFailed = applyReroll(baseChance, RerollType.FAILED);
      const resultAll = applyReroll(baseChance, RerollType.ALL);
      expect(resultAll).toBe(resultFailed);
      expect(resultAll).toBe(0.75); // 50% × (2 - 0.5) = 50% × 1.5 = 75%
    });

    it('should handle edge cases - 100% chance', () => {
      // Re-rolling 1s on a guaranteed success doesn't change anything
      expect(applyReroll(1, RerollType.ONES)).toBeCloseTo(7/6, 5);
      // Re-rolling failures when you can't fail
      expect(applyReroll(1, RerollType.FAILED)).toBe(1);
    });

    it('should handle edge cases - 0% chance', () => {
      // Re-rolling 1s when you always fail
      expect(applyReroll(0, RerollType.ONES)).toBe(0);
      // Re-rolling failures when you always fail
      expect(applyReroll(0, RerollType.FAILED)).toBe(0);
    });

    it('should correctly calculate re-roll 1s for BS 2+', () => {
      const baseChance = 5/6; // 83.33%
      const result = applyReroll(baseChance, RerollType.ONES);
      // Formula: P × (7/6) = (5/6) × (7/6) = 35/36
      expect(result).toBeCloseTo(35/36, 5); // 97.22%
    });

    it('should correctly calculate re-roll failed for BS 2+', () => {
      const baseChance = 5/6; // 83.33%
      const result = applyReroll(baseChance, RerollType.FAILED);
      // Formula: P × (2 - P) = (5/6) × (2 - 5/6) = (5/6) × (7/6) = 35/36
      expect(result).toBeCloseTo(35/36, 5); // 97.22%
    });

    it('should correctly calculate re-roll 1s for BS 6+', () => {
      const baseChance = 1/6; // 16.67%
      const result = applyReroll(baseChance, RerollType.ONES);
      // Formula: P × (7/6) = (1/6) × (7/6) = 7/36
      expect(result).toBeCloseTo(7/36, 5); // 19.44%
    });

    it('should correctly calculate re-roll failed for BS 6+', () => {
      const baseChance = 1/6; // 16.67%
      const result = applyReroll(baseChance, RerollType.FAILED);
      // Formula: P × (2 - P) = (1/6) × (2 - 1/6) = (1/6) × (11/6) = 11/36
      expect(result).toBeCloseTo(11/36, 5); // 30.56%
    });
  });

  describe('getBestReroll', () => {
    it('should return NONE when no re-rolls available', () => {
      expect(getBestReroll()).toBe(RerollType.NONE);
      expect(getBestReroll(undefined, undefined)).toBe(RerollType.NONE);
    });

    it('should return ONES when only ones available', () => {
      expect(getBestReroll(RerollType.ONES)).toBe(RerollType.ONES);
      expect(getBestReroll(undefined, RerollType.ONES)).toBe(RerollType.ONES);
    });

    it('should prioritize FAILED over ONES', () => {
      expect(getBestReroll(RerollType.ONES, RerollType.FAILED)).toBe(RerollType.FAILED);
      expect(getBestReroll(RerollType.FAILED, RerollType.ONES)).toBe(RerollType.FAILED);
    });

    it('should prioritize ALL over FAILED', () => {
      expect(getBestReroll(RerollType.FAILED, RerollType.ALL)).toBe(RerollType.ALL);
      expect(getBestReroll(RerollType.ALL, RerollType.FAILED)).toBe(RerollType.ALL);
    });

    it('should prioritize ALL over ONES', () => {
      expect(getBestReroll(RerollType.ONES, RerollType.ALL)).toBe(RerollType.ALL);
      expect(getBestReroll(RerollType.ALL, RerollType.ONES)).toBe(RerollType.ALL);
    });

    it('should handle mixed with undefined values', () => {
      expect(getBestReroll(undefined, RerollType.ONES, undefined)).toBe(RerollType.ONES);
      expect(getBestReroll(RerollType.ONES, undefined, RerollType.FAILED)).toBe(RerollType.FAILED);
      expect(getBestReroll(undefined, undefined, RerollType.ALL)).toBe(RerollType.ALL);
    });

    it('should select best from three different sources', () => {
      // Weapon has re-roll 1s, unit has re-roll failed, scenario has none
      expect(getBestReroll(RerollType.ONES, RerollType.FAILED, RerollType.NONE)).toBe(RerollType.FAILED);

      // All three have different re-rolls
      expect(getBestReroll(RerollType.ONES, RerollType.FAILED, RerollType.ALL)).toBe(RerollType.ALL);
    });
  });

  describe('calculateHitChanceWithReroll', () => {
    it('should calculate BS 3+ with no re-roll', () => {
      const result = calculateHitChanceWithReroll(3);
      expect(result).toBeCloseTo(4/6, 5);
    });

    it('should calculate BS 4+ with no re-roll', () => {
      const result = calculateHitChanceWithReroll(4);
      expect(result).toBeCloseTo(3/6, 5);
    });

    it('should calculate BS 2+ with no re-roll', () => {
      const result = calculateHitChanceWithReroll(2);
      expect(result).toBeCloseTo(5/6, 5);
    });

    it('should calculate BS 3+ with weapon re-roll 1s', () => {
      const result = calculateHitChanceWithReroll(3, RerollType.ONES);
      expect(result).toBeCloseTo(7/9, 5); // 77.78%
    });

    it('should calculate BS 3+ with weapon re-roll failed', () => {
      const result = calculateHitChanceWithReroll(3, RerollType.FAILED);
      expect(result).toBeCloseTo(8/9, 5); // 88.89%
    });

    it('should use best available re-roll - weapon vs unit', () => {
      // Weapon has re-roll 1s, unit has re-roll failed
      const result = calculateHitChanceWithReroll(
        3,
        RerollType.ONES,
        RerollType.FAILED
      );
      // Should use FAILED (better)
      expect(result).toBeCloseTo(8/9, 5);
    });

    it('should use best available re-roll - all three sources', () => {
      // Weapon has re-roll 1s, unit has re-roll failed, scenario has re-roll all
      const result = calculateHitChanceWithReroll(
        3,
        RerollType.ONES,
        RerollType.FAILED,
        RerollType.ALL
      );
      // Should use ALL (best), which equals FAILED
      expect(result).toBeCloseTo(8/9, 5);
    });

    it('should use unit re-roll when weapon has none', () => {
      const result = calculateHitChanceWithReroll(
        4,
        undefined,
        RerollType.ONES
      );
      expect(result).toBeCloseTo(7/12, 5); // 58.33%
    });

    it('should use scenario re-roll when weapon and unit have none', () => {
      const result = calculateHitChanceWithReroll(
        4,
        undefined,
        undefined,
        RerollType.FAILED
      );
      expect(result).toBeCloseTo(3/4, 5); // 75%
    });
  });

  describe('calculateWoundChanceWithReroll', () => {
    it('should calculate S4 vs T4 with no re-roll', () => {
      const result = calculateWoundChanceWithReroll(4, 4);
      expect(result).toBeCloseTo(3/6, 5); // 4+ to wound
    });

    it('should calculate S8 vs T4 with no re-roll (S >= 2×T)', () => {
      const result = calculateWoundChanceWithReroll(8, 4);
      expect(result).toBeCloseTo(5/6, 5); // 2+ to wound
    });

    it('should calculate S5 vs T4 with no re-roll (S > T)', () => {
      const result = calculateWoundChanceWithReroll(5, 4);
      expect(result).toBeCloseTo(4/6, 5); // 3+ to wound
    });

    it('should calculate S3 vs T4 with no re-roll (S < T)', () => {
      const result = calculateWoundChanceWithReroll(3, 4);
      expect(result).toBeCloseTo(2/6, 5); // 5+ to wound
    });

    it('should calculate S2 vs T4 with no re-roll (S × 2 <= T)', () => {
      const result = calculateWoundChanceWithReroll(2, 4);
      expect(result).toBeCloseTo(1/6, 5); // 6+ to wound
    });

    it('should calculate wound with weapon re-roll 1s', () => {
      const result = calculateWoundChanceWithReroll(4, 4, RerollType.ONES);
      // Base: 3/6 = 50%, with re-roll 1s: 50% × (7/6) = 58.33%
      expect(result).toBeCloseTo(7/12, 5);
    });

    it('should calculate wound with weapon re-roll failed', () => {
      const result = calculateWoundChanceWithReroll(4, 4, RerollType.FAILED);
      // Base: 3/6 = 50%, with re-roll failed: 50% × (2 - 0.5) = 75%
      expect(result).toBeCloseTo(3/4, 5);
    });

    it('should use best available re-roll for wounds', () => {
      // Weapon has re-roll 1s, unit has re-roll failed
      const result = calculateWoundChanceWithReroll(
        4,
        4,
        RerollType.ONES,
        RerollType.FAILED
      );
      // Should use FAILED (better)
      expect(result).toBeCloseTo(3/4, 5);
    });

    it('should handle all strength vs toughness combinations with re-rolls', () => {
      // S8 vs T4 (2+) with re-roll 1s
      const result1 = calculateWoundChanceWithReroll(8, 4, RerollType.ONES);
      expect(result1).toBeCloseTo((5/6) * (7/6), 5); // 97.22%

      // S5 vs T4 (3+) with re-roll failed
      const result2 = calculateWoundChanceWithReroll(5, 4, RerollType.FAILED);
      expect(result2).toBeCloseTo((4/6) * (2 - 4/6), 5); // 88.89%

      // S2 vs T4 (6+) with re-roll failed
      const result3 = calculateWoundChanceWithReroll(2, 4, RerollType.FAILED);
      expect(result3).toBeCloseTo((1/6) * (2 - 1/6), 5); // 30.56%
    });

    it('should use scenario re-roll when weapon and unit have none', () => {
      const result = calculateWoundChanceWithReroll(
        4,
        4,
        undefined,
        undefined,
        RerollType.FAILED
      );
      expect(result).toBeCloseTo(3/4, 5);
    });
  });

  describe('Integration with Warhammer 40K rules', () => {
    it('should match lookup table values for BS 2+ with re-roll 1s', () => {
      const result = calculateHitChanceWithReroll(2, RerollType.ONES);
      expect(result).toBeCloseTo(35/36, 5); // 97.22%
    });

    it('should match lookup table values for BS 3+ with re-roll failed', () => {
      const result = calculateHitChanceWithReroll(3, RerollType.FAILED);
      expect(result).toBeCloseTo(8/9, 5); // 88.89%
    });

    it('should match lookup table values for BS 4+ with re-roll 1s', () => {
      const result = calculateHitChanceWithReroll(4, RerollType.ONES);
      expect(result).toBeCloseTo(7/12, 5); // 58.33%
    });

    it('should match lookup table values for BS 4+ with re-roll failed', () => {
      const result = calculateHitChanceWithReroll(4, RerollType.FAILED);
      expect(result).toBeCloseTo(3/4, 5); // 75%
    });

    it('should match lookup table values for BS 5+ with re-roll failed', () => {
      const result = calculateHitChanceWithReroll(5, RerollType.FAILED);
      expect(result).toBeCloseTo(5/9, 5); // 55.56%
    });

    it('should match lookup table values for BS 6+ with re-roll failed', () => {
      const result = calculateHitChanceWithReroll(6, RerollType.FAILED);
      expect(result).toBeCloseTo(11/36, 5); // 30.56%
    });

    it('should correctly prevent re-roll stacking by choosing best', () => {
      // If a weapon has re-roll 1s and unit has re-roll 1s, should not stack
      const result = getBestReroll(RerollType.ONES, RerollType.ONES);
      expect(result).toBe(RerollType.ONES);

      // The probability should only apply once
      const hitChance = calculateHitChanceWithReroll(3, RerollType.ONES, RerollType.ONES);
      expect(hitChance).toBeCloseTo(7/9, 5); // Not double-applied
    });
  });
});
