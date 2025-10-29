/**
 * Tests for roster converter functionality
 */

import { describe, it, expect } from 'vitest';
import { optimizeWarhammerRoster, calculateStats, parseXMLRoster } from '../src/converter';
import type { Army } from '../src/types';

describe('Roster Converter', () => {
  describe('optimizeWarhammerRoster', () => {
    it('should extract basic army information', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: []
          }],
          points: {
            total: 1000
          }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.armyName).toBe('Test Army');
      expect(result.pointsTotal).toBe(1000);
    });

    it('should handle missing army name', () => {
      const input = {
        roster: {
          forces: [{
            selections: []
          }],
          points: {
            total: 500
          }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.armyName).toBe('Unknown Army');
    });

    it('should extract faction from detachment selections', () => {
      const input = {
        name: 'T\'au Army',
        roster: {
          forces: [{
            selections: [{
              name: 'Detachment',
              type: 'upgrade',
              selections: [{
                name: 'Mont\'ka'
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.faction).toBe('Mont\'ka');
    });

    it('should handle missing faction gracefully', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: []
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.faction).toBe('Unknown Faction');
    });

    it('should extract global force rules', () => {
      const input = {
        name: 'T\'au Army',
        roster: {
          forces: [{
            rules: [{
              id: 'rule-123',
              name: 'For The Greater Good',
              description: 'Team work makes the dream work',
              hidden: false
            }],
            selections: []
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.rules).toBeDefined();
      expect(result.rules!['rule-123']).toEqual({
        id: 'rule-123',
        name: 'For The Greater Good',
        description: 'Team work makes the dream work',
        hidden: false
      });
    });

    it('should extract units with basic stats', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Crisis Battlesuit',
              type: 'unit',
              number: 3,
              categories: [{
                name: 'Vehicle',
                primary: true
              }],
              costs: [{
                name: 'pts',
                value: 150
              }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: []
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units).toHaveLength(1);
      expect(result.units[0].name).toBe('Crisis Battlesuit');
      expect(result.units[0].type).toBe('Vehicle');
      expect(result.units[0].points).toBe(150);
      expect(result.units[0].count).toBe(3);
      expect(result.units[0].stats).toEqual({
        move: '10"',
        toughness: '5',
        save: '3+',
        wounds: '5',
        leadership: '7+',
        objectiveControl: '2'
      });
    });

    it('should extract ranged weapons with characteristics', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Crisis Battlesuit',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Vehicle', primary: true }],
              costs: [{ name: 'pts', value: 150 }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: [{
                id: 'weapon-sel-1',
                name: 'Fusion Blaster',
                type: 'upgrade',
                number: 2,
                profiles: [{
                  id: 'weapon-1',
                  name: 'Fusion blaster',
                  typeName: 'Ranged Weapons',
                  characteristics: [
                    { name: 'Range', $text: '12"' },
                    { name: 'A', $text: '1' },
                    { name: 'BS', $text: '4+' },
                    { name: 'S', $text: '9' },
                    { name: 'AP', $text: '-4' },
                    { name: 'D', $text: 'D6' },
                    { name: 'Keywords', $text: 'Melta 2' }
                  ]
                }]
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].weapons).toHaveLength(1);
      const weapon = result.units[0].weapons[0];
      expect(weapon.name).toBe('Fusion blaster');
      expect(weapon.type).toBe('Ranged Weapons');
      expect(weapon.count).toBe(2);
      expect(weapon.characteristics).toEqual({
        range: '12"',
        a: '1',
        bs: '4+',
        s: '9',
        ap: '-4',
        d: 'D6',
        keywords: 'Melta 2'
      });
    });

    it('should extract melee weapons', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Space Marine',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Infantry', primary: true }],
              costs: [{ name: 'pts', value: 20 }],
              profiles: [{
                id: 'profile-1',
                name: 'Space Marine',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '6"' },
                  { name: 'T', $text: '4' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '2' },
                  { name: 'LD', $text: '6+' },
                  { name: 'OC', $text: '1' }
                ]
              }],
              selections: [{
                id: 'weapon-sel-1',
                name: 'Chainsword',
                type: 'upgrade',
                number: 1,
                profiles: [{
                  id: 'weapon-1',
                  name: 'Chainsword',
                  typeName: 'Melee Weapons',
                  characteristics: [
                    { name: 'Range', $text: 'Melee' },
                    { name: 'A', $text: '3' },
                    { name: 'WS', $text: '3+' },
                    { name: 'S', $text: '4' },
                    { name: 'AP', $text: '0' },
                    { name: 'D', $text: '1' }
                  ]
                }]
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].weapons).toHaveLength(1);
      const weapon = result.units[0].weapons[0];
      expect(weapon.name).toBe('Chainsword');
      expect(weapon.type).toBe('Melee Weapons');
    });

    it('should link overcharge weapon modes', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Crisis Battlesuit',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Vehicle', primary: true }],
              costs: [{ name: 'pts', value: 150 }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: [{
                id: 'weapon-sel-1',
                name: 'Plasma Rifle',
                type: 'upgrade',
                number: 1,
                profiles: [
                  {
                    id: 'weapon-standard',
                    name: '➤ Plasma rifle - standard',
                    typeName: 'Ranged Weapons',
                    characteristics: [
                      { name: 'Range', $text: '24"' },
                      { name: 'A', $text: '1' },
                      { name: 'BS', $text: '4+' },
                      { name: 'S', $text: '7' },
                      { name: 'AP', $text: '-2' },
                      { name: 'D', $text: '1' }
                    ]
                  },
                  {
                    id: 'weapon-overcharge',
                    name: '➤ Plasma rifle - overcharge',
                    typeName: 'Ranged Weapons',
                    characteristics: [
                      { name: 'Range', $text: '24"' },
                      { name: 'A', $text: '1' },
                      { name: 'BS', $text: '4+' },
                      { name: 'S', $text: '8' },
                      { name: 'AP', $text: '-3' },
                      { name: 'D', $text: '2' }
                    ]
                  }
                ]
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].weapons).toHaveLength(2);
      expect(result.units[0].linked_weapons).toBeDefined();
      expect(result.units[0].linked_weapons!['➤ Plasma rifle']).toEqual({
        standard: 'weapon-standard',
        overcharge: 'weapon-overcharge'
      });
    });

    it('should extract and centralize abilities', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Commander',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Infantry', primary: true }],
              costs: [{ name: 'pts', value: 100 }],
              profiles: [
                {
                  id: 'profile-1',
                  name: 'Commander',
                  typeName: 'Unit',
                  characteristics: [
                    { name: 'M', $text: '6"' },
                    { name: 'T', $text: '4' },
                    { name: 'SV', $text: '3+' },
                    { name: 'W', $text: '5' },
                    { name: 'LD', $text: '6+' },
                    { name: 'OC', $text: '1' }
                  ]
                },
                {
                  id: 'ability-1',
                  name: 'Leader',
                  typeName: 'Abilities',
                  characteristics: [
                    { name: 'Description', $text: 'This model can lead a unit' }
                  ]
                }
              ],
              selections: []
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.abilities).toBeDefined();
      expect(result.abilities!['ability-1']).toEqual({
        id: 'ability-1',
        name: 'Leader',
        description: 'This model can lead a unit'
      });
      expect(result.units[0].abilities).toContain('ability-1');
    });

    it('should extract and centralize rules', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Stealth Suit',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Infantry', primary: true }],
              costs: [{ name: 'pts', value: 75 }],
              profiles: [{
                id: 'profile-1',
                name: 'Stealth Suit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '8"' },
                  { name: 'T', $text: '4' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '2' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '1' }
                ]
              }],
              rules: [{
                id: 'rule-stealth',
                name: 'Stealth',
                description: '-1 to hit when targeted by ranged attacks',
                hidden: false
              }],
              selections: []
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.rules).toBeDefined();
      expect(result.rules!['rule-stealth']).toEqual({
        id: 'rule-stealth',
        name: 'Stealth',
        description: '-1 to hit when targeted by ranged attacks',
        hidden: false
      });
      expect(result.units[0].rules).toContain('rule-stealth');
    });

    it('should skip configuration entries', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [
              {
                id: 'config-1',
                name: 'Battle Size',
                type: 'configuration',
                selections: []
              },
              {
                id: 'unit-1',
                name: 'Crisis Battlesuit',
                type: 'unit',
                number: 1,
                categories: [{ name: 'Vehicle', primary: true }],
                costs: [{ name: 'pts', value: 150 }],
                profiles: [{
                  id: 'profile-1',
                  name: 'Crisis Battlesuit',
                  typeName: 'Unit',
                  characteristics: [
                    { name: 'M', $text: '10"' },
                    { name: 'T', $text: '5' },
                    { name: 'SV', $text: '3+' },
                    { name: 'W', $text: '5' },
                    { name: 'LD', $text: '7+' },
                    { name: 'OC', $text: '2' }
                  ]
                }],
                selections: []
              }
            ]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      // Should only have 1 unit (config entry skipped)
      expect(result.units).toHaveLength(1);
      expect(result.units[0].name).toBe('Crisis Battlesuit');
    });

    it('should handle weapon count from multiple models', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Crisis Battlesuits',
              type: 'unit',
              number: 3,
              categories: [{ name: 'Vehicle', primary: true }],
              costs: [{ name: 'pts', value: 450 }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: [{
                id: 'model-1',
                name: 'Crisis Battlesuit',
                type: 'model',
                number: 3,
                selections: [{
                  id: 'weapon-sel-1',
                  name: 'Burst Cannon',
                  type: 'upgrade',
                  number: 1,
                  profiles: [{
                    id: 'weapon-1',
                    name: 'Burst cannon',
                    typeName: 'Ranged Weapons',
                    characteristics: [
                      { name: 'Range', $text: '18"' },
                      { name: 'A', $text: '4' },
                      { name: 'BS', $text: '4+' },
                      { name: 'S', $text: '5' },
                      { name: 'AP', $text: '0' },
                      { name: 'D', $text: '1' }
                    ]
                  }]
                }]
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].weapons).toHaveLength(1);
      expect(result.units[0].weapons[0].count).toBe(1);
      // numberOfWeapons is 1, so only 1 model has this weapon in this selection context
      expect(result.units[0].weapons[0].models_with_weapon).toBe(1);
    });

    it('should correctly count models with special weapons (not all models)', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Tactical Squad',
              type: 'unit',
              number: 5,
              categories: [{ name: 'Infantry', primary: true }],
              costs: [{ name: 'pts', value: 100 }],
              profiles: [{
                id: 'profile-1',
                name: 'Tactical Marine',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '6"' },
                  { name: 'T', $text: '4' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '2' },
                  { name: 'LD', $text: '6+' },
                  { name: 'OC', $text: '1' }
                ]
              }],
              selections: [{
                id: 'weapon-sel-1',
                name: 'Plasma Gun',
                type: 'upgrade',
                number: 2,  // Only 2 models get plasma guns
                profiles: [{
                  id: 'weapon-1',
                  name: 'Plasma gun',
                  typeName: 'Ranged Weapons',
                  characteristics: [
                    { name: 'Range', $text: '24"' },
                    { name: 'A', $text: '1' },
                    { name: 'BS', $text: '3+' },
                    { name: 'S', $text: '7' },
                    { name: 'AP', $text: '-2' },
                    { name: 'D', $text: '1' }
                  ]
                }]
              }]
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].weapons).toHaveLength(1);
      expect(result.units[0].weapons[0].count).toBe(2);
      // Only 2 models have plasma guns (based on number=2), not all 5
      expect(result.units[0].weapons[0].models_with_weapon).toBe(2);
    });

    it('should handle missing points gracefully', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: []
          }]
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.pointsTotal).toBe(0);
    });

    it('should generate ID for units without one', () => {
      const input = {
        name: 'Test Army',
        roster: {
          forces: [{
            selections: [{
              name: 'Crisis Battlesuit',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Vehicle', primary: true }],
              costs: [{ name: 'pts', value: 150 }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: []
            }]
          }],
          points: { total: 1000 }
        }
      };

      const result = optimizeWarhammerRoster(input);

      expect(result.units[0].id).toBeDefined();
      expect(result.units[0].id).toBeTruthy();
    });
  });

  describe('calculateStats', () => {
    it('should calculate compression statistics', () => {
      const original = {
        name: 'Test Army with lots of repeated data and rules',
        roster: {
          forces: [{
            selections: [{
              id: 'unit-1',
              name: 'Crisis Battlesuit',
              type: 'unit',
              number: 1,
              categories: [{ name: 'Vehicle', primary: true }],
              costs: [{ name: 'pts', value: 150 }],
              profiles: [{
                id: 'profile-1',
                name: 'Crisis Battlesuit',
                typeName: 'Unit',
                characteristics: [
                  { name: 'M', $text: '10"' },
                  { name: 'T', $text: '5' },
                  { name: 'SV', $text: '3+' },
                  { name: 'W', $text: '5' },
                  { name: 'LD', $text: '7+' },
                  { name: 'OC', $text: '2' }
                ]
              }],
              selections: []
            }]
          }],
          points: { total: 1000 }
        }
      };

      const optimized = optimizeWarhammerRoster(original);
      const stats = calculateStats(original, optimized);

      expect(stats.originalSize).toBeGreaterThan(0);
      expect(stats.optimizedSize).toBeGreaterThan(0);
      expect(stats.optimizedSize).toBeLessThanOrEqual(stats.originalSize);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(1);
      expect(stats.spaceSaving).toBeGreaterThanOrEqual(0);
      expect(stats.spaceSaving).toBeLessThanOrEqual(100);
    });

    it('should calculate correct compression ratio', () => {
      const original = {
        name: 'Test',
        roster: {
          forces: [{ selections: [] }],
          points: { total: 1000 }
        }
      };

      const optimized = optimizeWarhammerRoster(original);
      const stats = calculateStats(original, optimized);

      const expectedRatio = stats.optimizedSize / stats.originalSize;
      expect(stats.compressionRatio).toBeCloseTo(expectedRatio, 5);
    });

    it('should calculate correct space saving percentage', () => {
      const original = {
        name: 'Test',
        roster: {
          forces: [{ selections: [] }],
          points: { total: 1000 }
        }
      };

      const optimized = optimizeWarhammerRoster(original);
      const stats = calculateStats(original, optimized);

      const expectedSaving = (1 - stats.compressionRatio) * 100;
      expect(stats.spaceSaving).toBeCloseTo(expectedSaving, 5);
    });
  });

  describe('parseXMLRoster', () => {
    it('should parse basic XML roster structure', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1" name="Test Army">
          <costs>
            <cost name="pts" typeId="points" value="1000"/>
          </costs>
          <forces>
            <force id="force-1" name="Primary Force">
              <selections/>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);

      expect(result.name).toBe('Test Army');
      expect(result.roster.points?.total).toBe(1000);
      expect(result.roster.forces).toHaveLength(1);
    });

    it('should parse XML roster with units', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1" name="T'au Army">
          <costs>
            <cost name="pts" typeId="points" value="500"/>
          </costs>
          <forces>
            <force id="force-1" name="Primary Force">
              <selections>
                <selection id="unit-1" name="Crisis Battlesuit" type="unit" number="1">
                  <costs>
                    <cost name="pts" typeId="points" value="150"/>
                  </costs>
                  <categories>
                    <category id="cat-1" name="Vehicle" primary="true"/>
                  </categories>
                  <profiles>
                    <profile id="profile-1" name="Crisis Battlesuit" typeName="Unit">
                      <characteristics>
                        <characteristic name="M">10"</characteristic>
                        <characteristic name="T">5</characteristic>
                        <characteristic name="SV">3+</characteristic>
                        <characteristic name="W">5</characteristic>
                        <characteristic name="LD">7+</characteristic>
                        <characteristic name="OC">2</characteristic>
                      </characteristics>
                    </profile>
                  </profiles>
                </selection>
              </selections>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);

      expect(result.name).toBe('T\'au Army');
      expect(result.roster.forces[0].selections).toHaveLength(1);
      expect(result.roster.forces[0].selections[0].name).toBe('Crisis Battlesuit');
      expect(result.roster.forces[0].selections[0].type).toBe('unit');
    });

    it('should parse XML roster with weapons', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1" name="Test Army">
          <costs>
            <cost name="pts" typeId="points" value="500"/>
          </costs>
          <forces>
            <force id="force-1" name="Primary Force">
              <selections>
                <selection id="unit-1" name="Crisis Battlesuit" type="unit" number="1">
                  <costs>
                    <cost name="pts" typeId="points" value="150"/>
                  </costs>
                  <categories>
                    <category id="cat-1" name="Vehicle" primary="true"/>
                  </categories>
                  <profiles>
                    <profile id="profile-1" name="Crisis Battlesuit" typeName="Unit">
                      <characteristics>
                        <characteristic name="M">10"</characteristic>
                        <characteristic name="T">5</characteristic>
                        <characteristic name="SV">3+</characteristic>
                        <characteristic name="W">5</characteristic>
                        <characteristic name="LD">7+</characteristic>
                        <characteristic name="OC">2</characteristic>
                      </characteristics>
                    </profile>
                  </profiles>
                  <selections>
                    <selection id="weapon-1" name="Fusion Blaster" type="upgrade" number="1">
                      <profiles>
                        <profile id="weapon-profile-1" name="Fusion blaster" typeName="Ranged Weapons">
                          <characteristics>
                            <characteristic name="Range">12"</characteristic>
                            <characteristic name="A">1</characteristic>
                            <characteristic name="BS">4+</characteristic>
                            <characteristic name="S">9</characteristic>
                            <characteristic name="AP">-4</characteristic>
                            <characteristic name="D">D6</characteristic>
                            <characteristic name="Keywords">Melta 2</characteristic>
                          </characteristics>
                        </profile>
                      </profiles>
                    </selection>
                  </selections>
                </selection>
              </selections>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);
      const optimized = optimizeWarhammerRoster(result);

      expect(optimized.units).toHaveLength(1);
      expect(optimized.units[0].weapons).toHaveLength(1);
      expect(optimized.units[0].weapons[0].name).toBe('Fusion blaster');
      expect(optimized.units[0].weapons[0].characteristics.range).toBe('12"');
    });

    it('should parse XML roster with rules', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1" name="Test Army">
          <costs>
            <cost name="pts" typeId="points" value="500"/>
          </costs>
          <forces>
            <force id="force-1" name="Primary Force">
              <rules>
                <rule id="rule-1" name="For The Greater Good" hidden="false">
                  <description>Team work makes the dream work</description>
                </rule>
              </rules>
              <selections>
                <selection id="unit-1" name="Crisis Battlesuit" type="unit" number="1">
                  <costs>
                    <cost name="pts" typeId="points" value="150"/>
                  </costs>
                  <categories>
                    <category id="cat-1" name="Vehicle" primary="true"/>
                  </categories>
                  <profiles>
                    <profile id="profile-1" name="Crisis Battlesuit" typeName="Unit">
                      <characteristics>
                        <characteristic name="M">10"</characteristic>
                        <characteristic name="T">5</characteristic>
                        <characteristic name="SV">3+</characteristic>
                        <characteristic name="W">5</characteristic>
                        <characteristic name="LD">7+</characteristic>
                        <characteristic name="OC">2</characteristic>
                      </characteristics>
                    </profile>
                  </profiles>
                </selection>
              </selections>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);
      const optimized = optimizeWarhammerRoster(result);

      expect(optimized.rules).toBeDefined();
      expect(optimized.rules!['rule-1']).toBeDefined();
      expect(optimized.rules!['rule-1'].name).toBe('For The Greater Good');
    });

    it('should handle missing XML attributes gracefully', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1">
          <forces>
            <force id="force-1">
              <selections/>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);

      expect(result.name).toBe('Unknown Army');
      expect(result.roster.points?.total).toBe(0);
    });

    it('should parse full XML roster and optimize', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <roster id="roster-1" name="Full Test Army">
          <costs>
            <cost name="pts" typeId="points" value="1000"/>
          </costs>
          <forces>
            <force id="force-1" name="Primary Force">
              <selections>
                <selection id="detachment" name="Detachment" type="upgrade">
                  <selections>
                    <selection id="det-1" name="Mont'ka" type="upgrade"/>
                  </selections>
                </selection>
                <selection id="unit-1" name="Crisis Battlesuits" type="unit" number="3">
                  <costs>
                    <cost name="pts" typeId="points" value="450"/>
                  </costs>
                  <categories>
                    <category id="cat-1" name="Vehicle" primary="true"/>
                  </categories>
                  <profiles>
                    <profile id="profile-1" name="Crisis Battlesuit" typeName="Unit">
                      <characteristics>
                        <characteristic name="M">10"</characteristic>
                        <characteristic name="T">5</characteristic>
                        <characteristic name="SV">3+</characteristic>
                        <characteristic name="W">5</characteristic>
                        <characteristic name="LD">7+</characteristic>
                        <characteristic name="OC">2</characteristic>
                      </characteristics>
                    </profile>
                  </profiles>
                </selection>
              </selections>
            </force>
          </forces>
        </roster>`;

      const result = parseXMLRoster(xml);
      const optimized = optimizeWarhammerRoster(result);

      expect(optimized.armyName).toBe('Full Test Army');
      expect(optimized.faction).toBe('Mont\'ka');
      expect(optimized.pointsTotal).toBe(1000);
      expect(optimized.units).toHaveLength(1);
      expect(optimized.units[0].name).toBe('Crisis Battlesuits');
      expect(optimized.units[0].count).toBe(3);
    });
  });
});
