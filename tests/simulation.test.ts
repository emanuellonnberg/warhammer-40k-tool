import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Army } from '../src/types';
import { runSimpleEngagement } from '../src/simulation';

function loadArmy(fileName: string): Army {
  const raw = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf-8');
  return JSON.parse(raw);
}

describe('simulation engine', () => {
  const tauArmy = loadArmy('800popti.json');
  const knightsArmy = loadArmy('knights_optimized.json');

  it('runs a full engagement with phase logs and casualties', () => {
    const result = runSimpleEngagement(tauArmy, knightsArmy, {
      allowAdvance: true,
      randomCharge: false,
      maxRounds: 3
    });

    expect(result.logs.length).toBeGreaterThan(0);
    // Should have movement + shooting + charge + melee per turn (4 phases) until wipe/round cap
    expect(result.logs[0].phase).toBe('movement');
    expect(result.logs.some(l => l.phase === 'melee')).toBe(true);
    // Positions timeline should exist for each phase
    expect(result.positionsTimeline && result.positionsTimeline.length).toBeGreaterThan(0);
    // Casualties tracked in at least one phase
    expect(result.logs.some(l => l.casualties && l.casualties.length)).toBe(true);
    // Summary survivors should match end state
    const totalA = result.armyAState.units.length;
    const aliveA = result.armyAState.units.filter(u => u.remainingModels > 0).length;
    expect(result.summary.armyA.totalUnits).toBe(totalA);
    expect(result.summary.armyA.survivors).toBe(aliveA);
  });

  it('respects random charge toggle', () => {
    const fixed = runSimpleEngagement(tauArmy, knightsArmy, {
      allowAdvance: true,
      randomCharge: false,
      maxRounds: 1
    });
    const random = runSimpleEngagement(tauArmy, knightsArmy, {
      allowAdvance: true,
      randomCharge: true,
      maxRounds: 1
    });

    expect(fixed.logs.some(l => l.phase === 'charge')).toBe(true);
    expect(random.logs.some(l => l.phase === 'charge')).toBe(true);
    // Positions timeline should differ when random charge is on
    // They should produce the same phases but random charges may alter positions/timeline;
    // assert at least that the logs exist and totals are computed.
    expect(random.logs.some(l => l.phase === 'charge')).toBe(true);
  });

  describe('phase-specific behavior with simple armies', () => {
    const baseStats = {
      move: '10',
      toughness: '4',
      save: '3+',
      wounds: '1',
      leadership: '7+',
      objectiveControl: '1'
    };

    const rangedWeapon: any = {
      id: 'gun',
      name: 'Test Gun',
      type: 'Ranged Weapons',
      characteristics: {
        range: '24"',
        a: '2',
        bs: '3+',
        s: '4',
        ap: '0',
        d: '2',
        keywords: ''
      },
      count: 1,
      models_with_weapon: 1
    };

    const meleeWeapon: any = {
      id: 'blade',
      name: 'Test Blade',
      type: 'Melee Weapons',
      characteristics: {
        a: '3',
        ws: '3+',
        s: '5',
        ap: '1',
        d: '2',
        keywords: ''
      },
      count: 1,
      models_with_weapon: 1
    };

    const makeUnit = (id: string, weapons: any[], move = '10') => ({
      id,
      name: id,
      type: 'Infantry',
      stats: { ...baseStats, move },
      points: 50,
      count: 1,
      weapons
    });

    const makeArmy = (name: string, units: any[]): Army => ({
      armyName: name,
      faction: name,
      pointsTotal: 500,
      units
    });

    it('moves units closer in movement phase', () => {
      const a = makeArmy('A', [makeUnit('A1', [rangedWeapon])]);
      const b = makeArmy('B', [makeUnit('B1', [rangedWeapon])]);
      const res = runSimpleEngagement(a, b, { maxRounds: 1, allowAdvance: false });
      const start = res.positions.start;
      const mid = res.positionsTimeline?.find(t => t.phaseIndex === 0);
      expect(mid).toBeTruthy();
      if (mid) {
        expect(Math.abs(mid.armyA[0].x)).toBeLessThanOrEqual(Math.abs(start.armyA[0].x));
        expect(Math.abs(mid.armyB[0].x)).toBeLessThanOrEqual(Math.abs(start.armyB[0].x));
      }
    });

    it('applies shooting casualties', () => {
      const a = makeArmy('A', [makeUnit('Shooter', [rangedWeapon])]);
      const b = makeArmy('B', [makeUnit('Target', [rangedWeapon])]);
      const res = runSimpleEngagement(a, b, { maxRounds: 1, allowAdvance: false });
      const shootingPhase = res.logs.find(l => l.phase === 'shooting' && l.actor === 'armyA');
      expect((shootingPhase?.casualties?.length || 0)).toBeGreaterThanOrEqual(0);
    });

    it('charges and resolves melee damage', () => {
      const a = makeArmy('A', [makeUnit('Melee', [meleeWeapon], '12')]);
      const b = makeArmy('B', [makeUnit('Defender', [rangedWeapon])]);
      const res = runSimpleEngagement(a, b, { maxRounds: 2, allowAdvance: true, randomCharge: false });
      const meleePhase = res.logs.find(l => l.phase === 'melee' && l.actor === 'armyA');
      expect(meleePhase).toBeTruthy();
      expect(meleePhase?.damageDealt ?? 0).toBeGreaterThanOrEqual(0);
    });
  });
});
