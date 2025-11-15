import { describe, expect, it } from 'vitest';
import { applyLeaderAttachments, mergeLeaderIntoUnit } from '../src/utils/leader';
import type { Army, Unit, Weapon, UnitStats, AttachmentMap } from '../src/types';
import { RerollType } from '../src/types';

const defaultStats = (): UnitStats => ({
  move: '6"',
  toughness: '4',
  save: '3+',
  wounds: '2',
  leadership: '7+',
  objectiveControl: '1'
});

const createWeapon = (id: string, name: string): Weapon => ({
  id,
  name,
  type: 'Ranged Weapons',
  characteristics: {
    range: '24"',
    a: '2',
    bs: '3+',
    s: '4',
    ap: '0',
    d: '1',
    keywords: ''
  },
  count: 1,
  models_with_weapon: 1
});

const createUnit = (partial: Partial<Unit>): Unit => ({
  id: partial.id || 'unit',
  name: partial.name || 'Unit',
  type: partial.type || 'Infantry',
  stats: partial.stats || defaultStats(),
  points: partial.points ?? 100,
  count: partial.count ?? 1,
  weapons: partial.weapons || [createWeapon(`${partial.id || 'unit'}-w1`, `${partial.name || 'Unit'} Weapon`)],
  linked_weapons: partial.linked_weapons,
  unitRerolls: partial.unitRerolls,
  unitModifiers: partial.unitModifiers,
  rules: partial.rules,
  abilities: partial.abilities,
  isLeader: partial.isLeader,
  leaderOptions: partial.leaderOptions,
  attachedLeaders: partial.attachedLeaders,
  leaderAuraRerolls: partial.leaderAuraRerolls,
  leaderAuraModifiers: partial.leaderAuraModifiers
});

describe('leader attachment utilities', () => {
  it('merges leader data into a host unit via applyLeaderAttachments', () => {
    const host = createUnit({
      id: 'host',
      name: 'Battle Sisters Squad',
      points: 110
    });

    const leader = createUnit({
      id: 'leader',
      name: 'Canoness',
      points: 65,
      isLeader: true,
      leaderOptions: ['Battle Sisters Squad'],
      weapons: [createWeapon('leader-w1', 'Blessed Blade')],
      rules: ['rule-1'],
      abilities: ['ability-1']
    });

    const army: Army = {
      armyName: 'Test Army',
      faction: 'Adepta Sororitas',
      pointsTotal: 175,
      units: [host, leader],
      rules: {
        'rule-1': {
          id: 'rule-1',
          name: 'Righteous Fervor',
          description: ''
        }
      },
      abilities: {
        'ability-1': {
          id: 'ability-1',
          name: 'Devout Vows',
          description: ''
        }
      }
    };

    const attachments: AttachmentMap = {
      host: ['leader']
    };

    const result = applyLeaderAttachments(army, attachments);
    expect(result.units).toHaveLength(1);
    const mergedUnit = result.units[0];

    expect(mergedUnit.points).toBe(175);
    expect(mergedUnit.weapons.map(w => w.name)).toContain('Blessed Blade');
    expect(mergedUnit.attachedLeaders).toBeDefined();
    expect(mergedUnit.attachedLeaders?.[0].name).toBe('Canoness');
    expect(mergedUnit.rules).toContain('rule-1');
    expect(mergedUnit.abilities).toContain('ability-1');
  });

  it('mergeLeaderIntoUnit avoids duplicate rule entries', () => {
    const host = createUnit({
      id: 'host',
      rules: ['shared-rule'],
      abilities: ['shared-ability']
    });
    const leader = createUnit({
      id: 'leader',
      isLeader: true,
      leaderOptions: ['Unit'],
      rules: ['shared-rule', 'leader-rule'],
      abilities: ['shared-ability', 'leader-ability']
    });

    const merged = mergeLeaderIntoUnit(host, leader);
    expect(merged.rules).toEqual(['shared-rule', 'leader-rule']);
    expect(merged.abilities).toEqual(['shared-ability', 'leader-ability']);
    expect(merged.attachedLeaders).toHaveLength(1);
  });

  it('applies leader aura rerolls when attached', () => {
    const host = createUnit({ id: 'host' });
    const leader = createUnit({
      id: 'leader',
      isLeader: true,
      leaderOptions: ['Unit'],
      leaderAuraRerolls: { hits: RerollType.ONES }
    });

    const army: Army = {
      armyName: 'Test Army',
      faction: 'Generic',
      pointsTotal: 0,
      units: [host, leader]
    };

    const result = applyLeaderAttachments(army, { host: ['leader'] });
    const merged = result.units[0];
    expect(merged.unitRerolls?.hits).toBe(RerollType.ONES);
  });

  it('adds leader aura hit/wound modifiers to host unit', () => {
    const host = createUnit({
      id: 'host',
      unitModifiers: { hit: 1 }
    });
    const leader = createUnit({
      id: 'leader',
      isLeader: true,
      leaderOptions: ['Unit'],
      leaderAuraModifiers: { wound: 1 }
    });

    const merged = mergeLeaderIntoUnit(host, leader);
    expect(merged.unitModifiers).toEqual({ hit: 1, wound: 1 });
  });
});

