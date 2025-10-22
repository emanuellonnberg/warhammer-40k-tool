/**
 * Integration tests using real army data from JSON files
 * These tests validate the entire calculation pipeline with actual game units
 */

import { describe, it, expect } from 'vitest';
import type { Army, Unit } from '../src/types';
import { calculateUnitDamage } from '../src/calculators/damage';
import { calculateUnitEfficiency } from '../src/calculators/efficiency';

// Real unit data from sunforges_opt.json
const crisisSunforgeBattlesuits: Unit = {
  id: "m6p6i0m4yi4ryuw6gsj",
  name: "Crisis Sunforge Battlesuits",
  type: "Vehicle",
  stats: {
    move: "10\"",
    toughness: "5",
    save: "3+",
    wounds: "5",
    leadership: "7+",
    objectiveControl: "2"
  },
  points: 150,
  count: 1,
  weapons: [
    {
      id: "4bc9-74b7-1e9c-8619",
      name: "Fusion blaster",
      type: "Ranged Weapons",
      characteristics: {
        range: "12\"",
        a: "1",
        bs: "4+",
        s: "9",
        ap: "-4",
        d: "D6",
        keywords: "Melta 2"
      },
      count: 6,
      models_with_weapon: 3
    },
    {
      id: "3bb9-f1fb-50ba-17b",
      name: "Battlesuit fists",
      type: "Melee Weapons",
      characteristics: {
        range: "Melee",
        a: "3",
        ws: "5+",
        s: "5",
        ap: "0",
        d: "1",
        keywords: "-"
      },
      count: 3,
      models_with_weapon: 3
    },
    {
      id: "bca7-e744-1c90-b631",
      name: "Twin pulse carbine",
      type: "Ranged Weapons",
      characteristics: {
        range: "20\"",
        a: "2",
        bs: "5+",
        s: "5",
        ap: "0",
        d: "1",
        keywords: "Assault, Twin-linked"
      },
      count: 2,
      models_with_weapon: 2
    }
  ]
};

describe('Integration Tests - Real Army Data', () => {
  describe('Crisis Sunforge Battlesuits', () => {
    it('should calculate fusion blaster damage at optimal range (Melta bonus)', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 8, false, undefined, false, true);

      // 6 Fusion blasters: S9 vs T8, Melta 2 at optimal range
      // 6 weapons × 1 attack × 1/2 hit (4+) × 5/6 wound (2+) × (3.5 + 2) damage (D6+Melta 2)
      // = 6 × 1 × 0.5 × 0.833 × 5.5 = ~13.75
      // But also includes 2 Twin pulse carbines which contribute additional damage
      expect(damage.ranged).toBeGreaterThan(11);
      expect(damage.ranged).toBeLessThan(13);
    });

    it('should calculate fusion blaster damage at max range (no Melta bonus)', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 8, false, undefined, false, false);

      // 6 Fusion blasters: S9 vs T8, no Melta bonus
      // 6 weapons × 1 attack × 1/2 hit (4+) × 5/6 wound (2+) × 3.5 damage (D6)
      // = 6 × 1 × 0.5 × 0.833 × 3.5 = ~8.75
      // But also includes 2 Twin pulse carbines which contribute additional damage
      expect(damage.ranged).toBeGreaterThan(7);
      expect(damage.ranged).toBeLessThan(9);
    });

    it('should calculate melee damage correctly', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 4, false, undefined, false, true);

      // 3 Battlesuit fists: S5 vs T4, 3 attacks each, WS 5+ (1/3 hit)
      // 3 weapons × 3 attacks × 1/3 hit (5+) × 2/3 wound (3+) × 1 damage
      // = 3 × 3 × 0.333 × 0.667 × 1 = ~2
      expect(damage.melee).toBeGreaterThan(1.8);
      expect(damage.melee).toBeLessThan(2.2);
    });

    it('should calculate efficiency (damage per point) against T8', () => {
      const efficiency = calculateUnitEfficiency(crisisSunforgeBattlesuits, 8, false, false, true);

      // Total damage ~14 / 150 points = ~0.093
      expect(efficiency).toBeGreaterThan(0.08);
      expect(efficiency).toBeLessThan(0.12);
    });

    it('should calculate total damage breakdown', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 6, false, undefined, false, true);

      // Should have ranged and melee damage
      expect(damage.total).toBeGreaterThan(0);
      expect(damage.ranged).toBeGreaterThan(0);
      expect(damage.melee).toBeGreaterThan(0);
      expect(damage.pistol).toBe(0); // No pistols in this unit

      // Total should equal sum of parts
      expect(damage.total).toBeCloseTo(damage.ranged + damage.melee, 0.1);
    });

    it('should handle high toughness targets (T12)', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 12, false, undefined, false, true);

      // S9 vs T12: still wounds on 5+ (S > T/2)
      // Should still do damage but less than vs T8
      expect(damage.ranged).toBeGreaterThan(0);
      expect(damage.ranged).toBeLessThan(10);
    });

    it('should handle low toughness targets (T3)', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 3, false, undefined, false, true);

      // S9 vs T3: wounds on 2+ (S >= T*2)
      // Should do maximum damage
      const damageVsT3 = calculateUnitDamage(crisisSunforgeBattlesuits, 3, false, undefined, false, true);
      const damageVsT8 = calculateUnitDamage(crisisSunforgeBattlesuits, 8, false, undefined, false, true);

      // Should do more damage vs T3 than T8
      expect(damageVsT3.ranged).toBeGreaterThan(damageVsT8.ranged);
    });
  });

  describe('Edge Cases with Real Data', () => {
    it('should handle BS 5+ correctly (worse hit chance)', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 4, false, undefined, false, true);

      // Twin pulse carbine has BS 5+ (33.3% hit chance)
      // Should contribute less damage than fusion blasters (BS 4+)
      expect(damage.ranged).toBeGreaterThan(0);
    });

    it('should separate weapon damage contributions', () => {
      const damage = calculateUnitDamage(crisisSunforgeBattlesuits, 6, false, undefined, false, true);

      // Fusion blasters should be the primary damage dealer
      // Melee should be secondary
      // Pistols should be zero (unit has ranged weapons, so pistols don't count)
      expect(damage.ranged).toBeGreaterThan(damage.melee);
      expect(damage.pistol).toBe(0);
    });
  });

  describe('Melta Special Rule Integration', () => {
    it('should double damage increase from Melta 2 at optimal range', () => {
      const damageOptimal = calculateUnitDamage(crisisSunforgeBattlesuits, 8, false, undefined, false, true);
      const damageMax = calculateUnitDamage(crisisSunforgeBattlesuits, 8, false, undefined, false, false);

      // Melta 2 adds 2 damage, so optimal should be significantly higher
      // D6 average is 3.5, with Melta 2 it becomes 5.5 (57% increase)
      const ratio = damageOptimal.ranged / damageMax.ranged;
      expect(ratio).toBeGreaterThan(1.5);
      expect(ratio).toBeLessThan(1.6);
    });
  });
});
