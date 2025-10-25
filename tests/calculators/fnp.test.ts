/**
 * Tests for Feel No Pain (FNP) mechanics
 */

import { describe, it, expect } from 'vitest';
import { applySpecialRules } from '../../src/rules/special-weapons';
import type { Weapon } from '../../src/types';

describe('Feel No Pain Mechanics', () => {
  // Helper function to create a basic weapon
  const createBasicWeapon = (overrides = {}): Weapon => ({
    id: 'test-weapon',
    name: 'Test Weapon',
    type: 'ranged',
    characteristics: {
      range: '24"',
      a: '10',
      bs: '3+',
      s: '4',
      ap: '0',
      d: '1',
      keywords: ''
    },
    count: 1,
    models_with_weapon: 1,
    ...overrides
  });

  describe('FNP Calculation', () => {
    it('should apply 6+ FNP correctly (reduces damage by ~16.67%)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3; // 3+
      const woundChance = 0.5; // 4+
      const baseDamage = 1;
      const targetToughness = 4;

      // Without FNP
      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);

      // With 6+ FNP (1/6 chance to ignore = ~16.67% damage reduction)
      const resultWith6FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 6);

      // Expected damage with FNP = damage without FNP × (1 - 1/6) = damage × (5/6)
      expect(resultWith6FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (5/6), 4);
      expect(resultWith6FNP.breakdown).toContain('FNP 6+');
    });

    it('should apply 5+ FNP correctly (reduces damage by ~33.33%)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);

      // With 5+ FNP (2/6 chance to ignore = ~33.33% damage reduction)
      const resultWith5FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 5);

      // Expected damage with FNP = damage × (1 - 2/6) = damage × (4/6)
      expect(resultWith5FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (4/6), 4);
      expect(resultWith5FNP.breakdown).toContain('FNP 5+');
    });

    it('should apply 4+ FNP correctly (reduces damage by 50%)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);

      // With 4+ FNP (3/6 chance to ignore = 50% damage reduction)
      const resultWith4FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 4);

      expect(resultWith4FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * 0.5, 4);
      expect(resultWith4FNP.breakdown).toContain('FNP 4+');
    });

    it('should apply 3+ FNP correctly (reduces damage by ~66.67%)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);

      // With 3+ FNP (4/6 chance to ignore = ~66.67% damage reduction)
      const resultWith3FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 3);

      expect(resultWith3FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (2/6), 4);
      expect(resultWith3FNP.breakdown).toContain('FNP 3+');
    });

    it('should apply 2+ FNP correctly (reduces damage by ~83.33%)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);

      // With 2+ FNP (5/6 chance to ignore = ~83.33% damage reduction)
      const resultWith2FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 2);

      expect(resultWith2FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (1/6), 4);
      expect(resultWith2FNP.breakdown).toContain('FNP 2+');
    });
  });

  describe('FNP with Mortal Wounds', () => {
    it('should apply FNP to mortal wounds from Devastating Wounds', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '10',
          bs: '3+',
          s: '4',
          ap: '0',
          d: '1',
          keywords: 'Devastating Wounds'
        }
      });
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);
      const resultWith5FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 5);

      // FNP should reduce total damage (including mortal wounds)
      expect(resultWith5FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (4/6), 4);
      expect(resultWith5FNP.breakdown).toContain('Devastating Wounds');
      expect(resultWith5FNP.breakdown).toContain('FNP 5+');
    });
  });

  describe('FNP with Multi-Damage Weapons', () => {
    it('should apply FNP to multi-damage weapons', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '5',
          bs: '3+',
          s: '8',
          ap: '-2',
          d: '3',
          keywords: ''
        }
      });
      const baseAttacks = 5;
      const hitChance = 2 / 3;
      const woundChance = 5 / 6; // S8 vs T4 = 2+
      const baseDamage = 3;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);
      const resultWith6FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 6);

      expect(resultWith6FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (5/6), 4);
      expect(resultNoFNP.totalDamage).toBeGreaterThan(0); // Ensure we're actually doing damage
    });
  });

  describe('Edge Cases', () => {
    it('should not apply FNP when targetFNP is undefined', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const result = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, undefined);

      expect(result.breakdown).not.toContain('FNP');
    });

    it('should not apply FNP when targetFNP is 0', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const result = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 0);

      expect(result.breakdown).not.toContain('FNP');
    });

    it('should not apply FNP for invalid values (> 6)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const result = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 7);

      expect(result.breakdown).not.toContain('FNP');
    });

    it('should not apply FNP for invalid values (< 2)', () => {
      const weapon = createBasicWeapon();
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const result = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 1);

      expect(result.breakdown).not.toContain('FNP');
    });
  });

  describe('FNP with Special Weapon Rules', () => {
    it('should apply FNP after Melta bonus damage', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '12"',
          a: '2',
          bs: '3+',
          s: '9',
          ap: '-4',
          d: '6',
          keywords: 'Melta 2'
        }
      });
      const baseAttacks = 2;
      const hitChance = 2 / 3;
      const woundChance = 5 / 6;
      const baseDamage = 6;
      const targetToughness = 4;

      // At optimal range with Melta
      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);
      const resultWith5FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 5);

      expect(resultWith5FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (4/6), 4);
      expect(resultWith5FNP.breakdown).toContain('Melta');
      expect(resultWith5FNP.breakdown).toContain('FNP 5+');
    });

    it('should apply FNP after Hazardous self-damage', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '6',
          bs: '3+',
          s: '5',
          ap: '-1',
          d: '2',
          keywords: 'Hazardous'
        }
      });
      const baseAttacks = 6;
      const hitChance = 2 / 3;
      const woundChance = 2 / 3; // S5 vs T4 = 3+
      const baseDamage = 2;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);
      const resultWith6FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 6);

      // FNP is applied after hazardous damage is subtracted
      expect(resultWith6FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (5/6), 4);
      expect(resultWith6FNP.breakdown).toContain('Hazardous');
      expect(resultWith6FNP.breakdown).toContain('FNP 6+');
    });

    it('should apply FNP to Lethal Hits damage', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '10',
          bs: '3+',
          s: '4',
          ap: '0',
          d: '1',
          keywords: 'Lethal Hits'
        }
      });
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true);
      const resultWith5FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, null, 0, 5);

      expect(resultWith5FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (4/6), 4);
      expect(resultWith5FNP.breakdown).toContain('Lethal Hits');
      expect(resultWith5FNP.breakdown).toContain('FNP 5+');
    });

    it('should apply FNP after saves', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '10',
          bs: '3+',
          s: '4',
          ap: '-1',
          d: '1',
          keywords: ''
        }
      });
      const baseAttacks = 10;
      const hitChance = 2 / 3;
      const woundChance = 0.5;
      const baseDamage = 1;
      const targetToughness = 4;
      const targetSave = '3+';
      const weaponAP = 1;

      const resultNoFNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, targetSave, weaponAP);
      const resultWith5FNP = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, targetSave, weaponAP, 5);

      expect(resultWith5FNP.totalDamage).toBeCloseTo(resultNoFNP.totalDamage * (4/6), 4);
      expect(resultWith5FNP.breakdown).toContain('Save');
      expect(resultWith5FNP.breakdown).toContain('FNP 5+');
    });
  });

  describe('Integration with Damage Calculation', () => {
    it('should correctly calculate full damage pipeline with FNP', () => {
      const weapon = createBasicWeapon({
        characteristics: {
          range: '24"',
          a: '10',
          bs: '3+',
          s: '4',
          ap: '-1',
          d: '2',
          keywords: 'Sustained Hits 1'
        }
      });
      const baseAttacks = 10;
      const hitChance = 2 / 3; // 3+ to hit
      const woundChance = 0.5; // 4+ to wound
      const baseDamage = 2;
      const targetToughness = 4;
      const targetSave = '3+';
      const weaponAP = 1;
      const targetFNP = 5;

      const result = applySpecialRules(weapon, baseAttacks, hitChance, woundChance, baseDamage, targetToughness, true, [], 1, false, targetSave, weaponAP, targetFNP);

      // Should have positive damage
      expect(result.totalDamage).toBeGreaterThan(0);

      // Should mention all relevant rules in breakdown
      expect(result.breakdown).toContain('Sustained Hits');
      expect(result.breakdown).toContain('Save');
      expect(result.breakdown).toContain('FNP 5+');

      // Verify breakdown shows damage before and after FNP
      const fnpMatch = result.breakdown.match(/FNP 5\+: ([\d.]+) -> ([\d.]+) damage/);
      expect(fnpMatch).toBeTruthy();

      if (fnpMatch) {
        const damageBeforeFNP = parseFloat(fnpMatch[1]);
        const damageAfterFNP = parseFloat(fnpMatch[2]);

        expect(damageAfterFNP).toBeCloseTo(damageBeforeFNP * (4/6), 2);
        expect(result.totalDamage).toBeCloseTo(damageAfterFNP, 2);
      }
    });
  });
});
