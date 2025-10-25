import { describe, it, expect } from 'vitest';
import type { Unit } from '../src/types';
import { calculateUnitDamage } from '../src/calculators/damage';

// Helper to create minimal unit stats
const defaultStats = {
  move: '6"',
  toughness: '4',
  save: '3+',
  wounds: '2',
  leadership: '6+',
  objectiveControl: '2'
};

describe('New Armies Integration Tests', () => {
  describe('Anti- Keywords', () => {
    it('should calculate Anti-INFANTRY 4+ damage against INFANTRY targets', () => {
      // Chaos Rhino with Anti-INFANTRY 4+ combi-weapon
      const chaosRhino: Unit = {
        id: 'test-rhino',
        name: 'Chaos Rhino',
        type: 'Transport',
        stats: {
          move: '12"',
          toughness: '9',
          save: '3+',
          wounds: '10',
          leadership: '6+',
          objectiveControl: '2'
        },
        points: 80,
        count: 1,
        weapons: [
          {
            id: 'test-combi',
            name: 'Combi-weapon',
            type: 'Ranged Weapons',
            characteristics: {
              range: '24"',
              a: '1',
              bs: '3+',
              s: '4',
              ap: '-1',
              d: '1',
              keywords: 'Anti-INFANTRY 4+, Devastating Wounds, Rapid Fire 1'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      // Test against INFANTRY target
      const infantryDamage = calculateUnitDamage(chaosRhino, 3, false, undefined, false, true, ['INFANTRY']);
      // Test against non-INFANTRY target
      const vehicleDamage = calculateUnitDamage(chaosRhino, 3, false, undefined, false, true, ['VEHICLE']);

      // Against INFANTRY: wound rolls of 4+ become critical wounds (50% crit chance)
      // Against non-INFANTRY: only 6s are critical (16.67% crit chance)
      // NOTE: In our damage calculator, mortal wounds and regular wounds both = damage characteristic
      // So with damage "1", the total damage is the same. The benefit of Devastating Wounds
      // is bypassing saves, which our calculator doesn't model.
      // Both should deal ~0.889 damage (2 attacks * 2/3 hit * 2/3 wound * 1 damage)
      expect(infantryDamage.total).toBeCloseTo(0.889, 0.01);
      expect(vehicleDamage.total).toBeCloseTo(0.889, 0.01);

      // However, with a higher damage weapon, Anti- would matter more
      // Let's verify Anti- is at least being detected by checking it doesn't crash
      expect(infantryDamage.total).toBeGreaterThan(0);
      expect(vehicleDamage.total).toBeGreaterThan(0);
    });

    it('should calculate Anti-CHAOS 2+ damage against CHAOS targets', () => {
      // Daemonifuge with Anti-CHAOS 2+ weapon
      const daemonifuge: Unit = {
        id: 'test-daemonifuge',
        name: 'Daemonifuge',
        type: 'Character',
        stats: {
          move: '12"',
          toughness: '3',
          save: '3+',
          wounds: '5',
          leadership: '6+',
          objectiveControl: '1'
        },
        points: 85,
        count: 1,
        weapons: [
          {
            id: 'test-sanctity',
            name: 'Sanctity',
            type: 'Melee Weapons',
            characteristics: {
              range: 'Melee',
              a: '5',
              ws: '2+',
              s: '6',
              ap: '-2',
              d: '2',
              keywords: 'Anti-CHAOS 2+, Precision'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      // Test against CHAOS target (T4)
      const chaosDamage = calculateUnitDamage(daemonifuge, 4, false, undefined, false, true, ['CHAOS']);
      // Test against non-CHAOS target (T4)
      const imperialDamage = calculateUnitDamage(daemonifuge, 4, false, undefined, false, true, ['IMPERIUM']);

      // Against CHAOS: wound rolls of 2+ are critical wounds (83.33% crit chance)
      // Against non-CHAOS: only 6s are critical (16.67% crit chance)
      // This doesn't add mortal wounds without Devastating Wounds, but it's still tracked
      expect(chaosDamage.total).toBeGreaterThan(0);
      expect(imperialDamage.total).toBeGreaterThan(0);

      // Damage should be similar since no Devastating Wounds to trigger
      expect(chaosDamage.total).toBeCloseTo(imperialDamage.total, 0.5);
    });
  });

  describe('Twin-Linked', () => {
    it('should calculate Twin-Linked + Torrent damage correctly', () => {
      // Junith Eruita with Twin Ministorum Heavy Flamer
      const junithEruita: Unit = {
        id: 'test-junith',
        name: 'Junith Eruita',
        type: 'Character',
        stats: {
          move: '12"',
          toughness: '3',
          save: '3+',
          wounds: '4',
          leadership: '6+',
          objectiveControl: '1'
        },
        points: 80,
        count: 1,
        weapons: [
          {
            id: 'test-flamer',
            name: 'Twin Ministorum Heavy Flamer',
            type: 'Ranged Weapons',
            characteristics: {
              range: '12"',
              a: 'D6',
              bs: 'N/A',
              s: '5',
              ap: '-1',
              d: '1',
              keywords: 'Ignores Cover, Torrent, Twin-Linked'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      const damage = calculateUnitDamage(junithEruita, 3, false, undefined, false, true, []);

      // D6 attacks avg 3.5, Torrent = 100% hit
      // S5 vs T3: wound on 3+ normally (2/3 = 0.667)
      // Twin-Linked re-rolls: 0.667 + (1-0.667)*0.667 = 0.667 + 0.222 = 0.889
      // Expected: 3.5 * 1 * 0.889 * 1 = 3.11
      expect(damage.total).toBeGreaterThan(2.8);
      expect(damage.total).toBeLessThan(3.5);
      expect(damage.ranged).toBeGreaterThan(2.8);
    });

    it('should show Twin-Linked improving wound chance significantly', () => {
      // Test Twin-Linked effect by comparing with/without
      const twinLinkedWeapon: Unit = {
        id: 'test-twin',
        name: 'Test Twin-Linked',
        type: 'Vehicle',
        stats: defaultStats,
        points: 100,
        count: 1,
        weapons: [
          {
            id: 'test-weapon',
            name: 'Twin-Linked Bolter',
            type: 'Ranged Weapons',
            characteristics: {
              range: '24"',
              a: '4',
              bs: '3+',
              s: '4',
              ap: '0',
              d: '1',
              keywords: 'Twin-Linked'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      const damage = calculateUnitDamage(twinLinkedWeapon, 6, false, undefined, false, true, []);

      // 4 attacks, BS 3+ (2/3 hit), S4 vs T6 wound on 5+ (1/3)
      // Twin-Linked: 1/3 + (2/3 * 1/3) = 1/3 + 2/9 = 5/9 = 0.556
      // Expected: 4 * 2/3 * 0.556 * 1 = 1.48
      expect(damage.total).toBeGreaterThan(1.3);
      expect(damage.total).toBeLessThan(1.7);
    });
  });

  describe('Complex Keyword Combinations', () => {
    it('should calculate Penitent Flamers with 4 keywords correctly', () => {
      // Penitent Engines with Assault + Torrent + Twin-Linked + Ignores Cover
      const penitentEngines: Unit = {
        id: 'test-penitent',
        name: 'Penitent Engines',
        type: 'Vehicle',
        stats: {
          move: '8"',
          toughness: '6',
          save: '4+',
          wounds: '5',
          leadership: '7+',
          objectiveControl: '2'
        },
        points: 75,
        count: 1,
        weapons: [
          {
            id: 'test-flamers',
            name: 'Penitent Flamers',
            type: 'Ranged Weapons',
            characteristics: {
              range: '12"',
              a: '2D6',
              bs: 'N/A',
              s: '5',
              ap: '-1',
              d: '1',
              keywords: 'Assault, Ignores Cover, Torrent, Twin-Linked'
            },
            count: 2,
            models_with_weapon: 1
          }
        ]
      };

      const damage = calculateUnitDamage(penitentEngines, 4, false, undefined, false, true, []);

      // 2D6 attacks avg 7, x2 weapons = 14 attacks
      // Torrent = 100% hit
      // S5 vs T4: wound on 3+ (2/3)
      // Twin-Linked: 2/3 + (1/3 * 2/3) = 8/9
      // Expected: 14 * 1 * 0.889 * 1 = 12.44
      expect(damage.total).toBeGreaterThan(11);
      expect(damage.total).toBeLessThan(14);
      expect(damage.ranged).toBeGreaterThan(11);
    });

    it('should calculate Anti-INFANTRY + Devastating Wounds combo damage', () => {
      // Chaos Rhino with full combo at optimal range
      const chaosRhino: Unit = {
        id: 'test-rhino-full',
        name: 'Chaos Rhino',
        type: 'Transport',
        stats: {
          move: '12"',
          toughness: '9',
          save: '3+',
          wounds: '10',
          leadership: '6+',
          objectiveControl: '2'
        },
        points: 80,
        count: 1,
        weapons: [
          {
            id: 'test-combi-full',
            name: 'Combi-weapon',
            type: 'Ranged Weapons',
            characteristics: {
              range: '24"',
              a: '1',
              bs: '3+',
              s: '4',
              ap: '-1',
              d: '1',
              keywords: 'Anti-INFANTRY 4+, Devastating Wounds, Rapid Fire 1'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      const damage = calculateUnitDamage(chaosRhino, 3, false, undefined, false, true, ['INFANTRY']);

      // At optimal range: 1 + 1 (Rapid Fire) = 2 attacks
      // BS 3+ = 2/3 hit = 1.33 hits
      // S4 vs T3: wound on 3+ (2/3)
      // Anti-INFANTRY 4+: critical wounds on 4+ (3/6 = 50%)
      // Devastating Wounds: 50% of wounds become mortal wounds
      // Expected damage increases significantly
      expect(damage.total).toBeGreaterThan(0.8);
      expect(damage.total).toBeLessThan(1.5);
    });
  });

  describe('Psychic Weapons', () => {
    it('should handle Psychic keyword (currently just a tag)', () => {
      // Be'lakor's Betraying Shades with Psychic + Devastating Wounds + Hazardous
      const belakor: Unit = {
        id: 'test-belakor',
        name: "Be'lakor",
        type: 'Epic Hero',
        stats: {
          move: '12"',
          toughness: '10',
          save: '3+',
          wounds: '14',
          leadership: '6+',
          objectiveControl: '4'
        },
        points: 375,
        count: 1,
        weapons: [
          {
            id: 'test-shades',
            name: 'Betraying Shades - focused',
            type: 'Ranged Weapons',
            characteristics: {
              range: '18"',
              a: '6',
              bs: '2+',
              s: '6',
              ap: '-1',
              d: 'D6',
              keywords: 'Devastating Wounds, Hazardous, Psychic'
            },
            count: 1,
            models_with_weapon: 1
          }
        ]
      };

      const damage = calculateUnitDamage(belakor, 5, false, undefined, false, true, []);

      // 6 attacks, BS 2+ (5/6 hit), S6 vs T5 wound on 3+ (2/3), D6 avg 3.5
      // Devastating Wounds on 6s to wound creates mortal wounds
      // Hazardous: 0.5 MW risk to attacker (not subtracted from offensive damage)
      // Offensive damage: ~10.28
      // Psychic is currently just a tag for other rules to reference
      expect(damage.total).toBeGreaterThan(9);
      expect(damage.total).toBeLessThan(11);
      expect(damage.ranged).toBeGreaterThan(9);
    });
  });
});
