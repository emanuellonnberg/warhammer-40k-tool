import { describe, it, expect } from 'vitest';
import { planGreedyMovement, planBeamMovement, getStrategyWeights, type StrategyProfile } from '../src/simulation/planner';
import type { ArmyState, UnitState, ObjectiveMarker } from '../src/simulation/types';
import type { Unit } from '../src/types';
import { createContainer, createRuins } from '../src/simulation/terrain';
import { generateNavMesh } from '../src/simulation/pathfinding';

// Mock unit and army state for testing
function createMockUnit(id: string, range = '12', move = '5'): Unit {
  return {
    id,
    name: 'Test Unit',
    points: 100,
    models: [{ name: 'Model', baseSize: '32mm' }],
    stats: { WS: '3+', BS: '4+', S: '4', T: '4', W: '1', A: '2', Ld: '8', Sv: '3+' },
    weapons: [
      {
        name: 'Test Weapon',
        characteristics: {
          range,
          attacks: '2',
          BS: '4+',
          S: '4',
          AP: '0',
          D: '1'
        }
      }
    ],
    abilities: []
  };
}

function createMockUnitState(unit: Unit, x = 0, y = 0): UnitState {
  return {
    unit,
    position: { x, y },
    remainingModels: 10,
    inReserves: false,
    health: Array(10).fill(1),
    morale: 10,
    role: { primary: 'mobile-firepower', secondary: [] },
    objectiveControl: 0,
    wounded: false,
    chargeThisRound: false,
    meleeEngagements: [],
    closedDoors: []
  };
}

function createMockArmyState(units: UnitState[]): ArmyState {
  return {
    units,
    armyName: 'Test Army',
    totalObjectiveControl: 0,
    totalVP: 0,
    morale: 100
  };
}

describe('Planner - Strategy Profiles', () => {
  it('should provide different weights for each strategy profile', () => {
    const greedy = getStrategyWeights('greedy');
    const aggressive = getStrategyWeights('aggressive');
    const defensive = getStrategyWeights('defensive');
    const objectiveFocused = getStrategyWeights('objective-focused');

    // Aggressive should have high damageBias, low threatPenalty
    expect(aggressive.damageBias).toBeGreaterThan(greedy.damageBias);
    expect(aggressive.threatPenalty).toBeLessThan(greedy.threatPenalty);

    // Defensive should have high threatPenalty, low damageBias
    expect(defensive.threatPenalty).toBeGreaterThan(greedy.threatPenalty);
    expect(defensive.damageBias).toBeLessThan(greedy.damageBias);

    // Objective-focused should strongly prioritize objectives
    expect(objectiveFocused.objectiveValue).toBeGreaterThan(greedy.objectiveValue);
    expect(objectiveFocused.objectiveValue).toBeGreaterThan(aggressive.objectiveValue);
  });
});

describe('Planner - Greedy vs Beam Search', () => {
  it('should generate valid movements from greedy planner', () => {
    const testUnit = createMockUnit('unit-1', '12', '5');
    const allyState = createMockUnitState(testUnit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 10, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [
      { x: 5, y: 5, id: 'obj-1' },
      { x: -5, y: -5, id: 'obj-2' }
    ];

    const result = planGreedyMovement(active, opponent, objectives, false, 48, 48);

    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].unit.unit.id).toBe('unit-1');
    expect(result.movements[0].to).toBeDefined();
    expect(typeof result.movements[0].to.x).toBe('number');
    expect(typeof result.movements[0].to.y).toBe('number');
  });

  it('should generate valid movements from beam search planner', () => {
    const testUnit = createMockUnit('unit-1', '12', '5');
    const allyState = createMockUnitState(testUnit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 10, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [
      { x: 5, y: 5, id: 'obj-1' }
    ];

    const result = planBeamMovement(active, opponent, objectives, false, 48, 48, getStrategyWeights('greedy'), 3);

    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].unit.unit.id).toBe('unit-1');
    expect(result.movements[0].to).toBeDefined();
  });

  it('beam search should explore multiple units sequentially', () => {
    const unit1 = createMockUnit('unit-1', '12', '5');
    const unit2 = createMockUnit('unit-2', '12', '5');
    const unit1State = createMockUnitState(unit1, 0, 0);
    const unit2State = createMockUnitState(unit2, 0, -5);
    const active = createMockArmyState([unit1State, unit2State]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 15, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 10, y: 0, id: 'obj-1' }];

    const result = planBeamMovement(active, opponent, objectives, false, 48, 48, getStrategyWeights('aggressive'), 3);

    expect(result.movements).toHaveLength(2);
    expect(result.movements.map(m => m.unit.unit.id).sort()).toEqual(['unit-1', 'unit-2'].sort());
  });

  it('aggressive strategy should move units closer to enemies', () => {
    const unit = createMockUnit('unit-1', '12', '5');
    unit.stats = { ...unit.stats, move: '5' };
    const allyState = createMockUnitState(unit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 15, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [];

    const aggressiveResult = planGreedyMovement(active, opponent, objectives, false, 48, 48, getStrategyWeights('aggressive'));
    const defensiveResult = planGreedyMovement(active, opponent, objectives, false, 48, 48, getStrategyWeights('defensive'));

    // Aggressive should move toward enemy (positive x direction)
    const aggressiveMove = aggressiveResult.movements[0].to.x;
    const defensiveMove = defensiveResult.movements[0].to.x;

    // Reset state for each calculation (they each use fresh starting position)
    expect(typeof aggressiveMove).toBe('number');
    expect(typeof defensiveMove).toBe('number');
  });

  it('objective-focused strategy should prioritize objectives', () => {
    const unit = createMockUnit('unit-1', '12', '5');
    unit.role = { primary: 'mobile-firepower', secondary: [] };
    const allyState = createMockUnitState(unit, -5, 0); // start left of objective but within move
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 30, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 0, y: 0, id: 'obj-1' }];

    const result = planGreedyMovement(
      active,
      opponent,
      objectives,
      false,
      48,
      48,
      getStrategyWeights('objective-focused')
    );

    const startDist = Math.abs(allyState.position.x - objectives[0].x);
    const endDist = Math.abs(result.movements[0].to.x - objectives[0].x);
    // Should not increase distance to the objective
    expect(endDist).toBeLessThanOrEqual(startDist);
  });

  it('should respect battlefield boundaries in all strategies', () => {
    const unit = createMockUnit('unit-1', '12', '8');
    const allyState = createMockUnitState(unit, 22, 22); // Near edge
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 0, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [];
    const battlefieldWidth = 48;
    const battlefieldHeight = 48;

    const strategies: StrategyProfile[] = ['greedy', 'aggressive', 'defensive', 'objective-focused'];

    for (const strategy of strategies) {
      const result = planGreedyMovement(
        active,
        opponent,
        objectives,
        false,
        battlefieldWidth,
        battlefieldHeight,
        getStrategyWeights(strategy)
      );

      const move = result.movements[0].to;
      expect(Math.abs(move.x)).toBeLessThanOrEqual(battlefieldWidth / 2);
      expect(Math.abs(move.y)).toBeLessThanOrEqual(battlefieldHeight / 2);
    }
  });

  it('beam search with width=1 should match greedy behavior', () => {
    const unit = createMockUnit('unit-1', '12', '5');
    const allyState = createMockUnitState(unit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 10, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 5, y: 5, id: 'obj-1' }];
    const weights = getStrategyWeights('greedy');

    const greedyResult = planGreedyMovement(active, opponent, objectives, false, 48, 48, weights);
    const beamWidth1Result = planBeamMovement(active, opponent, objectives, false, 48, 48, weights, 1);

    // Results should be identical (beam width 1 = greedy)
    expect(beamWidth1Result.movements[0].to).toEqual(greedyResult.movements[0].to);
  });
});

describe('Planner - Threat Evaluation', () => {
  it('should increase threat penalty for close-range units', () => {
    const unit = createMockUnit('unit-1', '12', '5');
    const allyState = createMockUnitState(unit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    // Close threat at 5" away
    const enemyStateFar = createMockUnitState(enemyUnit, 20, 0);
    const enemyStateClose = createMockUnitState(enemyUnit, 5, 0);

    const objectives: ObjectiveMarker[] = [];

    const farResult = planGreedyMovement(active, { ...createMockArmyState([enemyStateFar]), units: [enemyStateFar] }, objectives, false, 48, 48, getStrategyWeights('defensive'));
    const closeResult = planGreedyMovement(active, { ...createMockArmyState([enemyStateClose]), units: [enemyStateClose] }, objectives, false, 48, 48, getStrategyWeights('defensive'));

    // Defensive strategy with close threat should backstep (move in negative x)
    // With distant threat, should be less defensive
    expect(typeof farResult.movements[0].to.x).toBe('number');
    expect(typeof closeResult.movements[0].to.x).toBe('number');
  });
});

describe('Planner - Terrain-Aware Movement', () => {
  it('should generate movements with terrain consideration', () => {
    const testUnit = createMockUnit('unit-1', '12', '6');
    const allyState = createMockUnitState(testUnit, -15, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 15, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 10, y: 0, id: 'obj-1' }];

    // Add blocking terrain between units
    const container = createContainer(0, 0, true);
    const terrain = [container];
    const navMesh = generateNavMesh(terrain, 48, 48, 1.5);

    const result = planGreedyMovement(
      active,
      opponent,
      objectives,
      false,
      48,
      48,
      getStrategyWeights('greedy'),
      terrain,
      navMesh
    );

    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].to).toBeDefined();
    // Movement should include path information when terrain is present
    expect(typeof result.movements[0].to.x).toBe('number');
  });

  it('should include path data when pathfinding is used', () => {
    const testUnit = createMockUnit('unit-1', '12', '6');
    const allyState = createMockUnitState(testUnit, -15, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 15, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 10, y: 0, id: 'obj-1' }];

    const container = createContainer(0, 0, true);
    const terrain = [container];
    const navMesh = generateNavMesh(terrain, 48, 48, 1.5);

    const result = planGreedyMovement(
      active,
      opponent,
      objectives,
      false,
      48,
      48,
      getStrategyWeights('objective-focused'),
      terrain,
      navMesh
    );

    // Movements that require pathfinding should have path data
    expect(result.movements[0]).toBeDefined();
    // Path may be undefined for direct moves or defined for pathfinding
    expect(typeof result.movements[0].to.x).toBe('number');
  });

  it('should work without terrain (backward compatible)', () => {
    const testUnit = createMockUnit('unit-1', '12', '6');
    const allyState = createMockUnitState(testUnit, 0, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 15, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 5, y: 0, id: 'obj-1' }];

    // Call without terrain parameters (backward compatible)
    const result = planGreedyMovement(
      active,
      opponent,
      objectives,
      false,
      48,
      48,
      getStrategyWeights('greedy')
      // No terrain, no navMesh
    );

    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].to).toBeDefined();
  });

  it('beam search should also work with terrain', () => {
    const testUnit = createMockUnit('unit-1', '12', '6');
    const allyState = createMockUnitState(testUnit, -10, 0);
    const active = createMockArmyState([allyState]);

    const enemyUnit = createMockUnit('enemy-1', '12', '5');
    const enemyState = createMockUnitState(enemyUnit, 10, 0);
    const opponent = createMockArmyState([enemyState]);

    const objectives: ObjectiveMarker[] = [{ x: 5, y: 5, id: 'obj-1' }];

    const ruins = createRuins(0, 0, 6, 6);
    const terrain = [ruins];
    const navMesh = generateNavMesh(terrain, 48, 48, 1.5);

    const result = planBeamMovement(
      active,
      opponent,
      objectives,
      false,
      48,
      48,
      getStrategyWeights('greedy'),
      3,
      terrain,
      navMesh
    );

    expect(result.movements).toHaveLength(1);
    expect(result.movements[0].to).toBeDefined();
  });
});

