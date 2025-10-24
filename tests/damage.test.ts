/**
 * Tests for damage calculations
 */

import { describe, it, expect } from 'vitest';
import type { Weapon } from '../src/types';
import { calculateWeaponDamage } from '../src/calculators/damage';

describe('calculateWeaponDamage', () => {
  it('should calculate basic weapon damage', () => {
    const weapon: Weapon = {
      id: 'test-1',
      name: 'Test Weapon',
      type: 'Ranged Weapons',
      characteristics: {
        a: '10',
        bs: '3+',
        s: '4',
        ap: '0',
        d: '1',
        range: '24"',
        keywords: ''
      },
      count: 1,
      models_with_weapon: 1
    };

    // Against T4 target
    // 10 attacks × 2/3 hit (3+) × 1/2 wound (S4 vs T4) × 1 damage
    // = 10 × 0.667 × 0.5 × 1 = 3.33
    const damage = calculateWeaponDamage(weapon, 4, false, false, true);
    expect(damage).toBeCloseTo(3.33, 1);
  });

  it('should handle Torrent weapons (auto-hit)', () => {
    const weapon: Weapon = {
      id: 'test-2',
      name: 'Flamer',
      type: 'Ranged Weapons',
      characteristics: {
        a: '6',
        bs: 'N/A',
        s: '4',
        ap: '0',
        d: '1',
        range: '12"',
        keywords: 'Torrent'
      },
      count: 1,
      models_with_weapon: 1
    };

    // Against T4 target
    // 6 attacks × 1.0 hit (Torrent) × 1/2 wound × 1 damage
    // = 6 × 1.0 × 0.5 × 1 = 3.0
    const damage = calculateWeaponDamage(weapon, 4, false, false, true);
    expect(damage).toBeCloseTo(3.0, 1);
  });

  it('should calculate wound chances correctly based on S vs T', () => {
    const baseWeapon: Weapon = {
      id: 'test-3',
      name: 'Variable Strength',
      type: 'Ranged Weapons',
      characteristics: {
        a: '6',
        bs: '3+',
        s: '4',
        ap: '0',
        d: '1',
        range: '24"',
        keywords: ''
      },
      count: 1,
      models_with_weapon: 1
    };

    // S8 vs T4 (S >= T*2) = 2+ wound (5/6)
    const weapon2Plus = { ...baseWeapon, characteristics: { ...baseWeapon.characteristics, s: '8' } };
    const damage2Plus = calculateWeaponDamage(weapon2Plus, 4, false, false, true);
    expect(damage2Plus).toBeCloseTo(6 * (2/3) * (5/6) * 1, 1);

    // S6 vs T4 (S > T) = 3+ wound (2/3)
    const weapon3Plus = { ...baseWeapon, characteristics: { ...baseWeapon.characteristics, s: '6' } };
    const damage3Plus = calculateWeaponDamage(weapon3Plus, 4, false, false, true);
    expect(damage3Plus).toBeCloseTo(6 * (2/3) * (2/3) * 1, 1);

    // S4 vs T4 (S = T) = 4+ wound (1/2)
    const weapon4Plus = { ...baseWeapon, characteristics: { ...baseWeapon.characteristics, s: '4' } };
    const damage4Plus = calculateWeaponDamage(weapon4Plus, 4, false, false, true);
    expect(damage4Plus).toBeCloseTo(6 * (2/3) * (1/2) * 1, 1);

    // S3 vs T4 (S < T but > T/2) = 5+ wound (1/3)
    const weapon5Plus = { ...baseWeapon, characteristics: { ...baseWeapon.characteristics, s: '3' } };
    const damage5Plus = calculateWeaponDamage(weapon5Plus, 4, false, false, true);
    expect(damage5Plus).toBeCloseTo(6 * (2/3) * (1/3) * 1, 1);

    // S2 vs T4 (S*2 <= T) = 6+ wound (1/6)
    const weapon6Plus = { ...baseWeapon, characteristics: { ...baseWeapon.characteristics, s: '2' } };
    const damage6Plus = calculateWeaponDamage(weapon6Plus, 4, false, false, true);
    expect(damage6Plus).toBeCloseTo(6 * (2/3) * (1/6) * 1, 1);
  });

  it('should skip one-time weapons when not included', () => {
    const weapon: Weapon = {
      id: 'test-4',
      name: 'Seeker Missile',
      type: 'Ranged Weapons',
      characteristics: {
        a: '1',
        bs: '4+',
        s: '8',
        ap: '-2',
        d: '3',
        range: '48"',
        keywords: ''
      },
      count: 1,
      models_with_weapon: 1,
      is_one_time: true
    };

    const damageIncluded = calculateWeaponDamage(weapon, 4, false, true, true);
    expect(damageIncluded).toBeGreaterThan(0);

    const damageExcluded = calculateWeaponDamage(weapon, 4, false, false, true);
    expect(damageExcluded).toBe(0);
  });
});
