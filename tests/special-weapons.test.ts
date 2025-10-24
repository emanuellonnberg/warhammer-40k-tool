/**
 * Tests for special weapon rules
 */

import { describe, it, expect } from 'vitest';
import type { Weapon } from '../src/types';
import { applySpecialRules } from '../src/rules/special-weapons';

describe('applySpecialRules', () => {
  const baseWeapon: Weapon = {
    id: 'test-1',
    name: 'Test Weapon',
    type: 'Ranged Weapons',
    characteristics: {
      keywords: ''
    },
    count: 1,
    models_with_weapon: 1
  };

  it('should apply Rapid Fire bonus at optimal range', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Rapid Fire 2' }
    };

    const result = applySpecialRules(weapon, 10, 0.5, 0.5, 1, 4, true);
    expect(result.breakdown).toContain('Rapid Fire');
    // Base: 10 attacks, Rapid Fire adds 2 → 12 attacks total
    // Expected damage: 12 × 0.5 (hit) × 0.5 (wound) × 1 (damage) = 3
    expect(result.totalDamage).toBeCloseTo(3.0, 1);
  });

  it('should not apply Rapid Fire at max range', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Rapid Fire 2' }
    };

    const result = applySpecialRules(weapon, 10, 0.5, 0.5, 1, 4, false);
    expect(result.breakdown).not.toContain('Rapid Fire');
    // Base: 10 attacks, no bonus
    // Expected damage: 10 × 0.5 (hit) × 0.5 (wound) × 1 (damage) = 2.5
    expect(result.totalDamage).toBeCloseTo(2.5, 1);
  });

  it('should apply Melta bonus at optimal range', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Melta 2' }
    };

    const result = applySpecialRules(weapon, 1, 0.5, 0.5, 3, 4, true);
    expect(result.breakdown).toContain('Melta');
    // Damage increased from 3 to 5 (3 + 2 melta bonus)
    // Expected damage: 1 × 0.5 (hit) × 0.5 (wound) × 5 (damage) = 1.25
    expect(result.totalDamage).toBeCloseTo(1.25, 1);
  });

  it('should apply Sustained Hits correctly', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Sustained Hits 1' }
    };

    const result = applySpecialRules(weapon, 6, 0.5, 0.5, 1, 4, true);
    expect(result.breakdown).toContain('Sustained Hits');
    // 6 attacks × 1/6 crit rate = 1 crit hit
    // 1 crit × 1 extra hit = 1 bonus hit
    // Total hits: (6 × 0.5) + 1 = 4 hits
    // Expected damage: 4 × 0.5 (wound) × 1 (damage) = 2
    expect(result.totalDamage).toBeCloseTo(2.0, 1);
  });

  it('should apply Lethal Hits correctly', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Lethal Hits' }
    };

    const result = applySpecialRules(weapon, 6, 0.5, 0.5, 1, 4, true);
    expect(result.breakdown).toContain('Lethal Hits');
    // 6 attacks × 1/6 crit rate = 1 auto-wound
    // Normal hits: (6 × 0.5) - 1 = 2 hits × 0.5 wound = 1 wound
    // Total wounds: 1 (lethal) + 1 (normal) = 2
    // Expected damage: 2 × 1 (damage) = 2
    expect(result.totalDamage).toBeCloseTo(2.0, 1);
  });

  it('should apply Devastating Wounds correctly', () => {
    const weapon = {
      ...baseWeapon,
      characteristics: { keywords: 'Devastating Wounds' }
    };

    const result = applySpecialRules(weapon, 6, 0.5, 0.5, 3, 4, true);
    expect(result.breakdown).toContain('Devastating Wounds');
    // Total hits: 6 × 0.5 = 3
    // Critical wounds (1/6 of wounds): 3 × 0.5 × 1/6 = 0.25 mortal wounds
    // Normal wounds: (3 × 0.5) - 0.25 = 1.25 wounds × 3 damage = 3.75
    // Total: 0.25 (mortal) + 3.75 (normal) = 4.0
    expect(result.totalDamage).toBeCloseTo(4.0, 1);
  });
});
