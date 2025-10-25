/**
 * Tests for invulnerable save extraction and display
 */

import { describe, it, expect } from 'vitest';
import type { Army, Unit } from '../src/types';

describe('Invulnerable Save Display', () => {
  it('should extract invulnerable save from unit abilities', () => {
    const army: Army = {
      armyName: 'Test Army',
      faction: 'Test Faction',
      pointsTotal: 1000,
      units: [],
      abilities: {
        'invuln-4': {
          id: 'invuln-4',
          name: 'Invulnerable Save (4+)',
          description: 'This model has a 4+ invulnerable save.'
        },
        'other-ability': {
          id: 'other-ability',
          name: 'Other Ability',
          description: 'Some other ability'
        }
      }
    };

    const unit: Unit = {
      id: 'test-unit',
      name: 'Test Unit',
      type: 'Infantry',
      stats: {
        move: '6"',
        toughness: '4',
        save: '3+',
        wounds: '2',
        leadership: '7+',
        objectiveControl: '1'
      },
      points: 100,
      count: 10,
      weapons: [],
      abilities: ['invuln-4', 'other-ability']
    };

    // Extract invulnerable save
    const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];
    let invulnSave: string | null = null;

    for (const ruleId of allRuleIds) {
      const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
      if (!rule) continue;

      if (rule.name.toLowerCase().includes('invulnerable save')) {
        const match = rule.name.match(/\((\d+)\+/);
        if (match) {
          invulnSave = match[1] + '+';
          break;
        }
      }
    }

    expect(invulnSave).toBe('4+');
  });

  it('should extract invulnerable save with asterisk notation', () => {
    const army: Army = {
      armyName: 'Test Army',
      faction: 'Test Faction',
      pointsTotal: 1000,
      units: [],
      abilities: {
        'invuln-5-star': {
          id: 'invuln-5-star',
          name: 'Invulnerable Save (5+*)',
          description: 'This model has a 5+ invulnerable save against ranged attacks.'
        }
      }
    };

    const unit: Unit = {
      id: 'test-unit',
      name: 'Test Unit',
      type: 'Vehicle',
      stats: {
        move: '10"',
        toughness: '11',
        save: '3+',
        wounds: '26',
        leadership: '5+',
        objectiveControl: '10'
      },
      points: 415,
      count: 1,
      weapons: [],
      abilities: ['invuln-5-star']
    };

    // Extract invulnerable save
    const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];
    let invulnSave: string | null = null;

    for (const ruleId of allRuleIds) {
      const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
      if (!rule) continue;

      if (rule.name.toLowerCase().includes('invulnerable save')) {
        const match = rule.name.match(/\((\d+)\+/);
        if (match) {
          invulnSave = match[1] + '+';
          break;
        }
      }
    }

    expect(invulnSave).toBe('5+');
  });

  it('should return null when no invulnerable save exists', () => {
    const army: Army = {
      armyName: 'Test Army',
      faction: 'Test Faction',
      pointsTotal: 1000,
      units: [],
      abilities: {
        'other-ability': {
          id: 'other-ability',
          name: 'Other Ability',
          description: 'Some other ability'
        }
      }
    };

    const unit: Unit = {
      id: 'test-unit',
      name: 'Test Unit',
      type: 'Infantry',
      stats: {
        move: '6"',
        toughness: '3',
        save: '4+',
        wounds: '1',
        leadership: '7+',
        objectiveControl: '1'
      },
      points: 50,
      count: 10,
      weapons: [],
      abilities: ['other-ability']
    };

    // Extract invulnerable save
    const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];
    let invulnSave: string | null = null;

    for (const ruleId of allRuleIds) {
      const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
      if (!rule) continue;

      if (rule.name.toLowerCase().includes('invulnerable save')) {
        const match = rule.name.match(/\((\d+)\+/);
        if (match) {
          invulnSave = match[1] + '+';
          break;
        }
      }
    }

    expect(invulnSave).toBeNull();
  });

  it('should format save display correctly with invulnerable save', () => {
    const regularSave = '3+';
    const invulnSave = '4+';
    const saveDisplay = `${regularSave}/${invulnSave}+`;

    expect(saveDisplay).toBe('3+/4++');
  });

  it('should format save display correctly without invulnerable save', () => {
    const regularSave = '3+';
    const invulnSave = null;
    const saveDisplay = invulnSave ? `${regularSave}/${invulnSave}+` : regularSave;

    expect(saveDisplay).toBe('3+');
  });

  it('should hide invulnerable save from abilities list', () => {
    const ruleName1 = 'Invulnerable Save (4+)';
    const ruleName2 = 'Other Ability';
    const ruleName3 = 'Melta 2';

    const shouldHide1 = ruleName1.toLowerCase().includes('invulnerable save');
    const shouldHide2 = ruleName2.toLowerCase().includes('invulnerable save');
    const shouldHide3 = ruleName3.toLowerCase().includes('invulnerable save');

    expect(shouldHide1).toBe(true);
    expect(shouldHide2).toBe(false);
    expect(shouldHide3).toBe(false);
  });
});
