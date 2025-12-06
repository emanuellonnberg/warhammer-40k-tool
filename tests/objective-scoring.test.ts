import { describe, it, expect, beforeEach } from 'vitest';
import type { ObjectiveMarker, ArmyState, UnitInstance } from '../src/simulation/types';
import {
  updateObjectiveControl,
  calculateVictoryPoints,
  getObjectiveSummary,
  DEFAULT_OBJECTIVE_SCORING,
  type ObjectiveScoringConfig
} from '../src/simulation/objective-scoring';

// Helper to create test objective
function createTestObjective(
  id: number,
  x: number,
  y: number,
  priority: 'primary' | 'secondary' = 'secondary'
): ObjectiveMarker {
  return {
    id,
    name: `Objective ${id}`,
    x,
    y,
    priority,
    controlledBy: 'contested',
    levelOfControlA: 0,
    levelOfControlB: 0,
    heldByA: 0,
    heldByB: 0,
    vpRewardA: 0,
    vpRewardB: 0,
    scoringUnitsA: [],
    scoringUnitsB: []
  };
}

// Helper to create test unit
function createTestUnit(
  id: string,
  x: number,
  y: number,
  oc: number = 1,
  models: number = 5
): UnitInstance {
  return {
    id,
    unit: {
      id: id,
      name: `Unit ${id}`,
      points: 100,
      models: models,
      stats: {
        m: '6"',
        t: 4,
        sv: 3,
        w: 1,
        ld: 8,
        oc: oc.toString(),
        objectiveControl: oc.toString()
      }
    } as any,
    position: { x, y },
    remainingModels: models,
    weaponPool: [],
    invulnerableSave: 0,
    fnpSave: 0,
    battleShocked: false,
    unitType: 'infantry',
    inReserves: false,
    morale: models,
    controllingObjective: null
  };
}

// Helper to create test army state
function createTestArmyState(units: UnitInstance[]): ArmyState {
  return {
    id: 'test-army',
    name: 'Test Army',
    army: [] as any,
    units,
    cp: 0,
    losses: 0,
    commandPoints: 0,
    strategicPoints: 0,
    canUseStrategicReserves: false,
    canUseMarketplaceOfHopes: false
  };
}

describe('Objective Scoring System', () => {
  let objectives: ObjectiveMarker[];
  let stateA: ArmyState;
  let stateB: ArmyState;

  beforeEach(() => {
    // Create 5 test objectives: 2 primary, 3 secondary
    objectives = [
      createTestObjective(1, 24, 24, 'primary'),    // Deployment zone A
      createTestObjective(2, 24, 36, 'primary'),    // Deployment zone B
      createTestObjective(3, 24, 30, 'secondary'),  // Center
      createTestObjective(4, 12, 30, 'secondary'),  // Flank A
      createTestObjective(5, 36, 30, 'secondary')   // Flank B
    ];

    stateA = createTestArmyState([]);
    stateB = createTestArmyState([]);
  });

  describe('updateObjectiveControl', () => {
    it('should detect when no units control an objective', () => {
      stateA = createTestArmyState([]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].controlledBy).toBe('contested');
      expect(objectives[0].levelOfControlA).toBe(0);
      expect(objectives[0].levelOfControlB).toBe(0);
    });

    it('should calculate level of control correctly with OC values', () => {
      // Army A: 1 unit with OC 1 (1 model) + 1 unit with OC 2 (3 models) = 1 + 6 = 7
      stateA = createTestArmyState([
        createTestUnit('A1', 24, 24, 1, 1),
        createTestUnit('A2', 24, 24, 2, 3)
      ]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(7);
      expect(objectives[0].levelOfControlB).toBe(0);
      expect(objectives[0].controlledBy).toBe('armyA');
      expect(objectives[0].scoringUnitsA).toEqual(['Unit A1', 'Unit A2']);
    });

    it('should detect contested objectives when LOC is equal', () => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 1, 5)]);
      stateB = createTestArmyState([createTestUnit('B1', 24, 24, 1, 5)]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(5);
      expect(objectives[0].levelOfControlB).toBe(5);
      expect(objectives[0].controlledBy).toBe('contested');
    });

    it('should ignore battle-shocked units in control calculation', () => {
      const unitA = createTestUnit('A1', 24, 24, 2, 5);
      unitA.battleShocked = true;
      
      const unitB = createTestUnit('B1', 24, 24, 1, 3);

      stateA = createTestArmyState([unitA]);
      stateB = createTestArmyState([unitB]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(0); // Ignored
      expect(objectives[0].levelOfControlB).toBe(3);
      expect(objectives[0].controlledBy).toBe('armyB');
    });

    it('should ignore units in reserves', () => {
      const unitA = createTestUnit('A1', 24, 24, 2, 5);
      unitA.inReserves = true;

      stateA = createTestArmyState([unitA]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(0);
      expect(objectives[0].controlledBy).toBe('contested');
    });

    it('should ignore units with no models', () => {
      const unitA = createTestUnit('A1', 24, 24, 2, 5);
      unitA.remainingModels = 0;

      stateA = createTestArmyState([unitA]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(0);
      expect(objectives[0].controlledBy).toBe('contested');
    });

    it('should ignore units outside control range', () => {
      // Unit is 4 inches away horizontally (range is 3 inches)
      stateA = createTestArmyState([createTestUnit('A1', 28, 24, 1, 5)]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(0);
      expect(objectives[0].controlledBy).toBe('contested');
    });

    it('should update hold time when updateHoldTime is true', () => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 1, 5)]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, true);

      expect(objectives[0].controlledBy).toBe('armyA');
      expect(objectives[0].heldByA).toBe(1);
      expect(objectives[0].heldByB).toBe(0);

      // Second update - same controller
      updateObjectiveControl(objectives, stateA, stateB, true);

      expect(objectives[0].heldByA).toBe(2);
      expect(objectives[0].heldByB).toBe(0);

      // Third update - different controller
      stateB = createTestArmyState([createTestUnit('B1', 24, 24, 1, 10)]);

      updateObjectiveControl(objectives, stateA, stateB, true);

      expect(objectives[0].controlledBy).toBe('armyB');
      expect(objectives[0].heldByA).toBe(0);
      expect(objectives[0].heldByB).toBe(1);
    });

    it('should reset hold time on contested control', () => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 1, 5)]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, true);
      expect(objectives[0].heldByA).toBe(1);

      // Make it contested
      stateB = createTestArmyState([createTestUnit('B1', 24, 24, 1, 5)]);

      updateObjectiveControl(objectives, stateA, stateB, true);

      expect(objectives[0].controlledBy).toBe('contested');
      expect(objectives[0].heldByA).toBe(0);
      expect(objectives[0].heldByB).toBe(0);
    });
  });

  describe('calculateVictoryPoints', () => {
    beforeEach(() => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 2, 5)]);
      stateB = createTestArmyState([]);
      updateObjectiveControl(objectives, stateA, stateB, false);
    });

    it('should score VP for controlled objectives with default config', () => {
      const vp = calculateVictoryPoints(objectives);

      // Objective 1 is primary (5 VP), objectives 3, 4, 5 are secondary (3 VP each) = 14 VP
      expect(vp.armyA).toBeGreaterThan(0);
      expect(vp.armyB).toBe(0);
    });

    it('should award primary objective bonus', () => {
      objectives[0].controlledBy = 'armyA';
      objectives[2].controlledBy = 'armyB';

      const vp = calculateVictoryPoints(objectives);

      // A controls primary objective 1: 3 + 2 = 5 VP
      // B controls secondary objective 3: 3 VP
      expect(vp.armyA).toBe(5);
      expect(vp.armyB).toBe(3);
    });

    it('should not score for contested objectives', () => {
      objectives[0].controlledBy = 'contested';

      const vp = calculateVictoryPoints(objectives);

      expect(vp.armyA).toBe(0);
      expect(vp.armyB).toBe(0);
    });

    it('should respect hold time requirements', () => {
      objectives[0].controlledBy = 'armyA';
      objectives[0].heldByA = 1;

      const config: ObjectiveScoringConfig = {
        ...DEFAULT_OBJECTIVE_SCORING,
        holdTimerRequired: 2
      };

      const vp = calculateVictoryPoints(objectives, config);

      // Not held for 2 rounds yet, so no VP
      expect(vp.armyA).toBe(0);

      // Now held for 2 rounds
      objectives[0].heldByA = 2;
      const vp2 = calculateVictoryPoints(objectives, config);

      expect(vp2.armyA).toBe(5); // Primary + bonus
    });

    it('should handle multiple objectives controlled by different armies', () => {
      objectives[0].controlledBy = 'armyA'; // Primary: 5 VP
      objectives[1].controlledBy = 'armyB'; // Primary: 5 VP
      objectives[2].controlledBy = 'armyA'; // Secondary: 3 VP
      objectives[3].controlledBy = 'armyB'; // Secondary: 3 VP
      objectives[4].controlledBy = 'contested';

      const vp = calculateVictoryPoints(objectives);

      expect(vp.armyA).toBe(8); // 5 + 3
      expect(vp.armyB).toBe(8); // 5 + 3
    });

    it('should return 0 VP if endOfRoundScore is disabled', () => {
      objectives[0].controlledBy = 'armyA';

      const config: ObjectiveScoringConfig = {
        ...DEFAULT_OBJECTIVE_SCORING,
        endOfRoundScore: false
      };

      const vp = calculateVictoryPoints(objectives, config);

      expect(vp.armyA).toBe(0);
      expect(vp.armyB).toBe(0);
    });
  });

  describe('getObjectiveSummary', () => {
    it('should format objective summary correctly', () => {
      objectives[0].controlledBy = 'armyA';
      objectives[0].heldByA = 2;
      objectives[1].controlledBy = 'armyB';
      objectives[1].heldByB = 1;
      objectives[2].controlledBy = 'contested';

      const summary = getObjectiveSummary(objectives);

      expect(summary).toContain('Objective 1 [P]: A (h2');
      expect(summary).toContain('Objective 2 [P]: B (h1');
      expect(summary).toContain('Objective 3 [S]: Contested');
    });

    it('should handle all objectives contested', () => {
      const summary = getObjectiveSummary(objectives);

      expect(summary).toContain('Contested');
      expect(summary.split('|').length).toBe(5);
    });
  });

  describe('edge cases', () => {
    it('should handle units with OC 0', () => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 0, 5)]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(0);
      expect(objectives[0].scoringUnitsA).toEqual([]);
    });

    it('should calculate large OC correctly', () => {
      stateA = createTestArmyState([createTestUnit('A1', 24, 24, 5, 10)]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].levelOfControlA).toBe(50); // 5 OC * 10 models
    });

    it('should track multiple units controlling same objective', () => {
      stateA = createTestArmyState([
        createTestUnit('A1', 24, 24, 1, 5),
        createTestUnit('A2', 25, 24, 2, 3)
      ]);
      stateB = createTestArmyState([]);

      updateObjectiveControl(objectives, stateA, stateB, false);

      expect(objectives[0].scoringUnitsA).toContain('Unit A1');
      expect(objectives[0].scoringUnitsA).toContain('Unit A2');
      expect(objectives[0].levelOfControlA).toBe(11); // 1*5 + 2*3
    });
  });
});
