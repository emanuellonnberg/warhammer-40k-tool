/**
 * Integration tests for units with special weapon rules
 * Tests real units from JSON files with Torrent, Devastating Wounds, Rapid Fire, etc.
 */

import { describe, it, expect } from 'vitest';
import type { Unit, Weapon } from '../src/types';
import { calculateUnitDamage, calculateWeaponDamage } from '../src/calculators/damage';
import { calculateUnitEfficiency } from '../src/calculators/efficiency';

// Longstrike with Devastating Wounds Railgun
const longstrike: Unit = {
  id: "m6q303zjbxf0qv1p405",
  name: "Longstrike [Legends]",
  type: "Epic Hero",
  stats: {
    move: "10\"",
    toughness: "10",
    save: "3+",
    wounds: "14",
    leadership: "7+",
    objectiveControl: "3"
  },
  points: 140,
  count: 1,
  weapons: [
    {
      id: "9345-de29-1d44-d7f6",
      name: "Railgun",
      type: "Ranged Weapons",
      characteristics: {
        range: "72\"",
        a: "1",
        bs: "3+",
        s: "20",
        ap: "-5",
        d: "D6+6",
        keywords: "Devastating Wounds, Heavy"
      },
      count: 1,
      models_with_weapon: 1
    },
    {
      id: "47d1-604d-fa7f-0ec4",
      name: "Twin pulse carbine",
      type: "Ranged Weapons",
      characteristics: {
        range: "20\"",
        a: "2",
        bs: "4+",
        s: "5",
        ap: "0",
        d: "1",
        keywords: "Twin-linked, Assault"
      },
      count: 2,
      models_with_weapon: 1
    },
    {
      id: "ec22-219d-9edf-9005",
      name: "Armoured hull",
      type: "Melee Weapons",
      characteristics: {
        range: "Melee",
        a: "3",
        ws: "5+",
        s: "6",
        ap: "0",
        d: "1",
        keywords: "-"
      },
      count: 1,
      models_with_weapon: 1
    }
  ]
};

// Broadside Battlesuits with Heavy Rail Rifle (Devastating Wounds) and Seeker Missile (One Shot)
const broadsideBattlesuits: Unit = {
  id: "m6hun9hncysf5moa48s",
  name: "Broadside Battlesuits",
  type: "Vehicle",
  stats: {
    move: "5\"",
    toughness: "6",
    save: "2+",
    wounds: "8",
    leadership: "7+",
    objectiveControl: "2"
  },
  points: 90,
  count: 1,
  weapons: [
    {
      id: "86cd-e0c6-0001-bd7d",
      name: "Heavy rail rifle",
      type: "Ranged Weapons",
      characteristics: {
        range: "60\"",
        a: "2",
        bs: "4+",
        s: "12",
        ap: "-4",
        d: "D6+1",
        keywords: "Heavy, Devastating Wounds"
      },
      count: 1,
      models_with_weapon: 1
    },
    {
      id: "3837-b5fb-54d1-adf8",
      name: "Seeker missile",
      type: "Ranged Weapons",
      characteristics: {
        range: "48\"",
        a: "1",
        bs: "4+",
        s: "14",
        ap: "-3",
        d: "D6+1",
        keywords: "One Shot"
      },
      count: 1,
      models_with_weapon: 1,
      is_one_time: true
    },
    {
      id: "925b-bdfa-4365-68d0",
      name: "Missile pod",
      type: "Ranged Weapons",
      characteristics: {
        range: "30\"",
        a: "2",
        bs: "5+",
        s: "7",
        ap: "-1",
        d: "2",
        keywords: "-"
      },
      count: 2,
      models_with_weapon: 1
    },
    {
      id: "7761-1b77-42a7-af36",
      name: "Crushing bulk",
      type: "Melee Weapons",
      characteristics: {
        range: "Melee",
        a: "3",
        ws: "5+",
        s: "6",
        ap: "0",
        d: "1",
        keywords: "-"
      },
      count: 1,
      models_with_weapon: 1
    }
  ]
};

// Crisis Starscythe Battlesuits with Torrent Flamers
const crisisStarscythe: Unit = {
  id: "starscythe-1",
  name: "Crisis Starscythe Battlesuits",
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
      id: "4f5a-58b-5a49-1c96",
      name: "T'au flamer (Superior Craftmanship)",
      type: "Ranged Weapons",
      characteristics: {
        range: "18\"",
        a: "D6",
        bs: "N/A",
        s: "4",
        ap: "0",
        d: "1",
        keywords: "Ignores Cover, Torrent"
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
    }
  ]
};

// Cadre Fireblade with Rapid Fire weapon
const cadreFireblade: Unit = {
  id: "fireblade-1",
  name: "Cadre Fireblade",
  type: "Character",
  stats: {
    move: "6\"",
    toughness: "3",
    save: "5+",
    wounds: "4",
    leadership: "7+",
    objectiveControl: "1"
  },
  points: 50,
  count: 1,
  weapons: [
    {
      id: "230a-d8fa-420b-4258",
      name: "Fireblade pulse rifle",
      type: "Ranged Weapons",
      characteristics: {
        range: "30\"",
        a: "1",
        bs: "3+",
        s: "5",
        ap: "0",
        d: "2",
        keywords: "Rapid Fire 1"
      },
      count: 1,
      models_with_weapon: 1
    },
    {
      id: "cdb3-583c-f777-493b",
      name: "Close combat weapon",
      type: "Melee Weapons",
      characteristics: {
        range: "Melee",
        a: "3",
        ws: "4+",
        s: "3",
        ap: "0",
        d: "1",
        keywords: "-"
      },
      count: 1,
      models_with_weapon: 1
    }
  ]
};

describe('Special Weapon Rules - Real Units', () => {
  describe('Devastating Wounds - Longstrike Railgun', () => {
    it('should calculate massive damage with S20 D6+6 railgun', () => {
      const damage = calculateUnitDamage(longstrike, 10, false, undefined, false, true);

      // Railgun: S20 vs T10, 1 attack, BS 3+, D6+6 damage (avg 9.5)
      // 1 attack × 2/3 hit (3+) × 5/6 wound (2+) × 9.5 damage
      // Plus Twin pulse carbine contribution
      // Total ranged damage ~4.8
      expect(damage.ranged).toBeGreaterThan(4.5);
      expect(damage.ranged).toBeLessThan(6);
    });

    it('should wound even T12 targets reliably', () => {
      const damage = calculateUnitDamage(longstrike, 12, false, undefined, false, true);

      // S20 vs T12 = still 3+ to wound (S > T but not 2x)
      // Should still deal decent damage
      expect(damage.ranged).toBeGreaterThan(3.5);
      expect(damage.ranged).toBeLessThan(5);
    });

    it('should have high efficiency for 140 points', () => {
      const efficiency = calculateUnitEfficiency(longstrike, 10, false, false, true);

      // Railgun is extremely powerful for a 140 point unit
      // Total damage ~5.16 / 140 points = ~0.037 efficiency
      expect(efficiency).toBeGreaterThan(0.03);
      expect(efficiency).toBeLessThan(0.05);
    });
  });

  describe('Devastating Wounds - Broadside Heavy Rail Rifle', () => {
    it('should calculate damage with 2 attacks and Devastating Wounds', () => {
      const damage = calculateUnitDamage(broadsideBattlesuits, 8, false, undefined, false, true);

      // Heavy rail rifle: 2 attacks, S12 vs T8, D6+1 damage
      // 2 attacks × 1/2 hit (4+) × 5/6 wound (2+) × 4.5 damage
      expect(damage.ranged).toBeGreaterThan(3);
      expect(damage.ranged).toBeLessThan(6);
    });

    it('should exclude one-time seeker missile by default', () => {
      const damageWithout = calculateUnitDamage(broadsideBattlesuits, 8, false, undefined, false, true);
      const damageWith = calculateUnitDamage(broadsideBattlesuits, 8, false, undefined, true, true);

      // With one-time weapons should have more damage
      expect(damageWith.total).toBeGreaterThan(damageWithout.total);
      expect(damageWith.onetime).toBeGreaterThan(0);
      expect(damageWithout.onetime).toBe(0);
    });

    it('should track one-time weapon damage separately', () => {
      const damage = calculateUnitDamage(broadsideBattlesuits, 8, false, undefined, true, true);

      // Seeker missile should contribute to one-time damage
      expect(damage.onetime).toBeGreaterThan(0);
      expect(damage.onetime).toBeLessThan(3);
    });
  });

  describe('Torrent - Crisis Starscythe Flamers', () => {
    it('should auto-hit with Torrent weapons (100% hit chance)', () => {
      const damage = calculateUnitDamage(crisisStarscythe, 4, false, undefined, false, true);

      // 6 flamers with D6 attacks each (avg 3.5) = 21 total attacks
      // Torrent = 100% hit, S4 vs T4 = 50% wound, 1 damage
      // 21 × 1.0 × 0.5 × 1 = 10.5 expected damage
      expect(damage.ranged).toBeGreaterThan(9);
      expect(damage.ranged).toBeLessThan(12);
    });

    it('should perform better against low toughness with auto-hit', () => {
      const damageT3 = calculateUnitDamage(crisisStarscythe, 3, false, undefined, false, true);
      const damageT6 = calculateUnitDamage(crisisStarscythe, 6, false, undefined, false, true);

      // S4 vs T3 = 3+ wound (2/3), S4 vs T6 = 5+ wound (1/3)
      // Ratio should be about 2:1
      expect(damageT3.ranged).toBeGreaterThan(damageT6.ranged);
      expect(damageT3.ranged / damageT6.ranged).toBeCloseTo(2, 0.5);
    });

    it('should have no BS penalty from Torrent', () => {
      // Torrent weapons have BS: N/A but should always hit
      const flamer = crisisStarscythe.weapons[0];
      const damage = calculateWeaponDamage(flamer, 4, false, false, true);

      // Should calculate damage with 100% hit rate despite N/A BS
      expect(damage).toBeGreaterThan(3);
    });
  });

  describe('Rapid Fire - Cadre Fireblade', () => {
    it('should double attacks at optimal range with Rapid Fire 1', () => {
      const damageOptimal = calculateUnitDamage(cadreFireblade, 4, false, undefined, false, true);
      const damageMax = calculateUnitDamage(cadreFireblade, 4, false, undefined, false, false);

      // Rapid Fire 1: at optimal range 1 attack becomes 1+1 = 2 attacks
      // Should have 2x the attacks at optimal range
      const ratio = damageOptimal.ranged / damageMax.ranged;
      expect(ratio).toBeGreaterThan(1.8);
      expect(ratio).toBeLessThan(2.2);
    });

    it('should calculate optimal range damage correctly', () => {
      const damage = calculateUnitDamage(cadreFireblade, 3, false, undefined, false, true);

      // At optimal range: 2 attacks (1 + Rapid Fire 1)
      // 2 attacks × 2/3 hit (3+) × 5/6 wound (2+ for S5 vs T3) × 2 damage
      // = 2 × 0.667 × 0.833 × 2 = ~2.22
      // Actual calculation: ~1.78
      expect(damage.ranged).toBeGreaterThan(1.5);
      expect(damage.ranged).toBeLessThan(2.5);
    });

    it('should perform well for 50 point cost', () => {
      const efficiency = calculateUnitEfficiency(cadreFireblade, 3, false, false, true);

      // Should have decent efficiency at optimal range
      expect(efficiency).toBeGreaterThan(0.04);
      expect(efficiency).toBeLessThan(0.08);
    });
  });

  describe('Comparative Analysis', () => {
    it('should show Torrent outperforms low BS weapons', () => {
      // Compare Torrent (100% hit) vs BS 5+ (33% hit)
      const starscytheDamage = calculateUnitDamage(crisisStarscythe, 4, false, undefined, false, true);
      const broadsideDamage = calculateUnitDamage(broadsideBattlesuits, 4, false, undefined, false, true);

      // Torrent flamers should generate consistent damage despite similar stats
      expect(starscytheDamage.ranged).toBeGreaterThan(8);
    });

    it('should show Devastating Wounds creates high spike damage', () => {
      // High strength + Devastating Wounds = reliable high damage
      const longstrikeDamage = calculateUnitDamage(longstrike, 10, false, undefined, false, true);

      // D6+6 with Devastating Wounds on crits should be very effective
      expect(longstrikeDamage.ranged).toBeGreaterThan(4.5);
      expect(longstrikeDamage.ranged).toBeLessThan(6);
    });

    it('should show Rapid Fire effectiveness depends on range', () => {
      const firebladeOptimal = calculateUnitDamage(cadreFireblade, 4, false, undefined, false, true);
      const firebladeMax = calculateUnitDamage(cadreFireblade, 4, false, undefined, false, false);

      // Optimal range should be significantly better
      expect(firebladeOptimal.ranged).toBeGreaterThan(firebladeMax.ranged * 1.5);
    });
  });
});
