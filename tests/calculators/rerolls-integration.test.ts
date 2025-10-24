/**
 * Integration tests for re-roll mechanics with damage calculations
 */

import { describe, it, expect } from 'vitest';
import type { Weapon, RerollConfig } from '../../src/types';
import { RerollType } from '../../src/types';
import { calculateWeaponDamage } from '../../src/calculators/damage';

describe('Damage Calculation with Re-rolls', () => {
  describe('Weapon-level re-rolls', () => {
    it('should calculate damage with weapon-level hit re-roll 1s', () => {
      const weapon: Weapon = {
        id: 'test-1',
        name: 'Test Gun with Re-roll 1s',
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
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.ONES
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // 10 attacks × (7/9) hit × (1/2) wound × 1 damage
      // = 10 × 0.7778 × 0.5 × 1 = 3.889
      expect(damage).toBeCloseTo(3.889, 2);
    });

    it('should calculate damage with weapon-level hit re-roll failed', () => {
      const weapon: Weapon = {
        id: 'test-2',
        name: 'Test Gun with Re-roll Failed',
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
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.FAILED
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // 10 attacks × (8/9) hit × (1/2) wound × 1 damage
      // = 10 × 0.8889 × 0.5 × 1 = 4.444
      expect(damage).toBeCloseTo(4.444, 2);
    });

    it('should calculate damage with weapon-level wound re-roll 1s', () => {
      const weapon: Weapon = {
        id: 'test-3',
        name: 'Test Gun with Wound Re-roll',
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
        models_with_weapon: 1,
        rerolls: {
          wounds: RerollType.ONES
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // 10 attacks × (2/3) hit × (7/12) wound × 1 damage
      // = 10 × 0.6667 × 0.5833 × 1 = 3.889
      expect(damage).toBeCloseTo(3.889, 2);
    });

    it('should calculate damage with both hit and wound re-rolls', () => {
      const weapon: Weapon = {
        id: 'test-4',
        name: 'Test Gun with Both Re-rolls',
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
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.ONES,
          wounds: RerollType.ONES
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // 10 attacks × (7/9) hit × (7/12) wound × 1 damage
      // = 10 × 0.7778 × 0.5833 × 1 = 4.537
      expect(damage).toBeCloseTo(4.537, 2);
    });
  });

  describe('Unit-level re-rolls', () => {
    it('should apply unit-level hit re-rolls', () => {
      const weapon: Weapon = {
        id: 'test-5',
        name: 'Test Gun',
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

      const unitRerolls: RerollConfig = {
        hits: RerollType.FAILED
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, unitRerolls);

      // 10 attacks × (8/9) hit × (1/2) wound × 1 damage
      // = 10 × 0.8889 × 0.5 × 1 = 4.444
      expect(damage).toBeCloseTo(4.444, 2);
    });

    it('should apply unit-level wound re-rolls', () => {
      const weapon: Weapon = {
        id: 'test-6',
        name: 'Test Gun',
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

      const unitRerolls: RerollConfig = {
        wounds: RerollType.FAILED
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, unitRerolls);

      // 10 attacks × (2/3) hit × (3/4) wound × 1 damage
      // = 10 × 0.6667 × 0.75 × 1 = 5.0
      expect(damage).toBeCloseTo(5.0, 2);
    });
  });

  describe('Scenario-level re-rolls', () => {
    it('should apply scenario-level re-rolls', () => {
      const weapon: Weapon = {
        id: 'test-7',
        name: 'Test Gun',
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

      const scenarioRerolls: RerollConfig = {
        hits: RerollType.ONES,
        wounds: RerollType.ONES
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, undefined, scenarioRerolls);

      // 10 attacks × (7/9) hit × (7/12) wound × 1 damage
      // = 10 × 0.7778 × 0.5833 × 1 = 4.537
      expect(damage).toBeCloseTo(4.537, 2);
    });
  });

  describe('Re-roll priority (no stacking)', () => {
    it('should not stack weapon and unit re-rolls - use best', () => {
      const weapon: Weapon = {
        id: 'test-8',
        name: 'Test Gun with Re-roll 1s',
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
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.ONES
        }
      };

      const unitRerolls: RerollConfig = {
        hits: RerollType.FAILED
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, unitRerolls);

      // Should use FAILED (better), not stack both
      // 10 attacks × (8/9) hit × (1/2) wound × 1 damage = 4.444
      expect(damage).toBeCloseTo(4.444, 2);

      // NOT: double re-roll which would be incorrect
    });

    it('should prioritize scenario re-roll over weapon re-roll', () => {
      const weapon: Weapon = {
        id: 'test-9',
        name: 'Test Gun',
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
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.ONES
        }
      };

      const scenarioRerolls: RerollConfig = {
        hits: RerollType.ALL
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, undefined, scenarioRerolls);

      // Should use ALL (same as FAILED) = 8/9
      // 10 attacks × (8/9) hit × (1/2) wound × 1 damage = 4.444
      expect(damage).toBeCloseTo(4.444, 2);
    });

    it('should use best from all three sources', () => {
      const weapon: Weapon = {
        id: 'test-10',
        name: 'Test Gun',
        type: 'Ranged Weapons',
        characteristics: {
          a: '10',
          bs: '4+',
          s: '4',
          ap: '0',
          d: '1',
          range: '24"',
          keywords: ''
        },
        count: 1,
        models_with_weapon: 1,
        rerolls: {
          hits: RerollType.ONES
        }
      };

      const unitRerolls: RerollConfig = {
        hits: RerollType.ONES
      };

      const scenarioRerolls: RerollConfig = {
        hits: RerollType.FAILED
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, unitRerolls, scenarioRerolls);

      // Should use FAILED (best of all three)
      // 10 attacks × (3/4) hit × (1/2) wound × 1 damage = 3.75
      expect(damage).toBeCloseTo(3.75, 2);
    });
  });

  describe('Twin-Linked compatibility', () => {
    it('should still handle Twin-Linked weapons correctly', () => {
      const weapon: Weapon = {
        id: 'test-11',
        name: 'Twin-Linked Gun',
        type: 'Ranged Weapons',
        characteristics: {
          a: '10',
          bs: '3+',
          s: '4',
          ap: '0',
          d: '1',
          range: '24"',
          keywords: 'Twin-Linked'
        },
        count: 1,
        models_with_weapon: 1
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // Twin-Linked provides re-roll wounds (failed)
      // 10 attacks × (2/3) hit × (3/4) wound × 1 damage
      // = 10 × 0.6667 × 0.75 × 1 = 5.0
      expect(damage).toBeCloseTo(5.0, 2);
    });

    it('should not stack Twin-Linked with other wound re-rolls', () => {
      const weapon: Weapon = {
        id: 'test-12',
        name: 'Twin-Linked Gun',
        type: 'Ranged Weapons',
        characteristics: {
          a: '10',
          bs: '3+',
          s: '4',
          ap: '0',
          d: '1',
          range: '24"',
          keywords: 'Twin-Linked'
        },
        count: 1,
        models_with_weapon: 1,
        rerolls: {
          wounds: RerollType.ONES // This should be ignored due to Twin-Linked
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // Twin-Linked takes precedence, weapon re-roll is ignored
      // Same as previous test: 5.0
      expect(damage).toBeCloseTo(5.0, 2);
    });
  });

  describe('Real-world scenarios', () => {
    it('should calculate Crisis Battlesuit Burst Cannon damage', () => {
      // Burst Cannon: A6, BS3+, S5, AP0, D1
      const weapon: Weapon = {
        id: 'burst-cannon',
        name: 'Burst Cannon',
        type: 'Ranged Weapons',
        characteristics: {
          a: '6',
          bs: '3+',
          s: '5',
          ap: '0',
          d: '1',
          range: '18"',
          keywords: ''
        },
        count: 3, // 3 Crisis suits with 1 burst cannon each
        models_with_weapon: 3
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // 18 attacks × (2/3) hit × (2/3) wound (S5 vs T4 = 3+) × 1 damage
      // = 18 × 0.6667 × 0.6667 × 1 = 8.0
      expect(damage).toBeCloseTo(8.0, 1);
    });

    it('should calculate Burst Cannon with Montka re-roll 1s to hit', () => {
      const weapon: Weapon = {
        id: 'burst-cannon-montka',
        name: 'Burst Cannon',
        type: 'Ranged Weapons',
        characteristics: {
          a: '6',
          bs: '3+',
          s: '5',
          ap: '0',
          d: '1',
          range: '18"',
          keywords: ''
        },
        count: 3,
        models_with_weapon: 3
      };

      const scenarioRerolls: RerollConfig = {
        hits: RerollType.ONES // Mont'ka ability
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true, [], 1, false, null, undefined, scenarioRerolls);

      // 18 attacks × (7/9) hit × (2/3) wound × 1 damage
      // = 18 × 0.7778 × 0.6667 × 1 = 9.333
      expect(damage).toBeCloseTo(9.333, 1);
    });

    it('should calculate high-strength weapon with re-rolls', () => {
      // Fusion Blaster: A1, BS3+, S8, AP-4, D6
      const weapon: Weapon = {
        id: 'fusion-blaster',
        name: 'Fusion Blaster',
        type: 'Ranged Weapons',
        characteristics: {
          a: '1',
          bs: '3+',
          s: '8',
          ap: '-4',
          d: '6',
          range: '12"',
          keywords: 'Melta 2'
        },
        count: 3,
        models_with_weapon: 3,
        rerolls: {
          hits: RerollType.ONES
        }
      };

      const damage = calculateWeaponDamage(weapon, 4, false, false, true);

      // With Melta at optimal range: damage becomes 8
      // 3 attacks × (7/9) hit × (5/6) wound (S8 vs T4 = 2+) × 8 damage
      // = 3 × 0.7778 × 0.8333 × 8 = 15.556
      expect(damage).toBeGreaterThan(15);
      expect(damage).toBeLessThan(17);
    });
  });
});
