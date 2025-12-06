import { describe, it, expect } from 'vitest';
import { evaluateBattleState, recommendStrategy, explainStrategyChoice } from '../src/simulation/battle-evaluator';
import type { ArmyState, ObjectiveMarker } from '../src/simulation/types';
import type { Army } from '../src/types';

// Mock army for testing
function createMockArmy(tag: 'armyA' | 'armyB', points: number = 1000): ArmyState {
  return {
    army: {
      armyName: `Test ${tag}`,
      faction: 'Test',
      pointsTotal: points,
      units: [],
    },
    units: [
      {
        unit: {
          id: `unit-${tag}-1`,
          name: `Unit ${tag} 1`,
          type: 'Infantry',
          stats: {
            move: '6"',
            toughness: '4',
            save: '3+',
            wounds: '1',
            leadership: '7',
            objectiveControl: '2',
          },
          points: 100,
          count: 10,
          weapons: [],
        },
        remainingModels: 10,
        remainingWounds: 10,
        role: {
          primary: 'gunline' as any,
          optimalRange: 24,
          chargeThreat: 10,
        },
        position: { x: 10, y: 10 },
        engaged: false,
        modelPositions: [],
      },
    ],
    tag,
  };
}

function createMockObjective(x: number, y: number, controlled: 'armyA' | 'armyB' | 'contested'): ObjectiveMarker {
  return {
    id: `obj-${x}-${y}`,
    name: `Objective ${x},${y}`,
    x,
    y,
    controlledBy: controlled,
    scoringUnitsA: [],
    scoringUnitsB: [],
    levelOfControlA: controlled === 'armyA' ? 5 : 0,
    levelOfControlB: controlled === 'armyB' ? 5 : 0,
  };
}

describe('Adaptive Strategy Tests', () => {
  describe('evaluateBattleState', () => {
    it('should calculate winning state correctly', () => {
      const ourArmy = createMockArmy('armyA');
      const enemyArmy = createMockArmy('armyB');
      // Damage enemy army
      enemyArmy.units[0].remainingModels = 3; // 3/10 models left
      
      const objectives = [
        createMockObjective(24, 24, 'armyA'),
        createMockObjective(48, 48, 'armyA'),
      ];
      
      const state = evaluateBattleState(ourArmy, enemyArmy, objectives, 10, 5);
      
      expect(state.vpDifferential).toBe(5); // 10 - 5
      expect(state.strengthRatio).toBeGreaterThan(1); // Our army is stronger
      expect(state.objectivesControlled).toBe(2);
    });

    it('should calculate losing state correctly', () => {
      const ourArmy = createMockArmy('armyA');
      const enemyArmy = createMockArmy('armyB');
      // Damage our army
      ourArmy.units[0].remainingModels = 3; // 3/10 models left
      
      const objectives = [
        createMockObjective(24, 24, 'armyB'),
        createMockObjective(48, 48, 'contested'),
      ];
      
      const state = evaluateBattleState(ourArmy, enemyArmy, objectives, 2, 12);
      
      expect(state.vpDifferential).toBe(-10); // 2 - 12
      expect(state.strengthRatio).toBeLessThan(1); // Enemy army is stronger
      expect(state.objectivesControlled).toBe(0);
      expect(state.objectivesContested).toBe(1);
    });

    it('should detect units in danger', () => {
      const ourArmy = createMockArmy('armyA');
      const enemyArmy = createMockArmy('armyB');
      // Damage unit to below half
      ourArmy.units[0].remainingModels = 4; // 4/10 models (below half)
      
      const objectives: ObjectiveMarker[] = [];
      
      const state = evaluateBattleState(ourArmy, enemyArmy, objectives, 5, 5);
      
      expect(state.unitsInDanger).toBe(1);
    });
  });

  describe('recommendStrategy', () => {
    it('should recommend objective-focused in early game', () => {
      const state: any = {
        vpDifferential: 0,
        strengthRatio: 1.0,
        objectivesControlled: 0,
        unitsInDanger: 0,
      };
      
      const strategy = recommendStrategy(state, 1, 5);
      expect(strategy).toBe('objective-focused');
    });

    it('should recommend defensive when winning big', () => {
      const state: any = {
        vpDifferential: 12, // Big VP lead
        strengthRatio: 1.3, // Strong army
        objectivesControlled: 2,
        unitsInDanger: 0,
      };
      
      const strategy = recommendStrategy(state, 3, 5);
      expect(strategy).toBe('defensive');
    });

    it('should recommend aggressive when losing badly', () => {
      const state: any = {
        vpDifferential: -15, // Big VP deficit
        strengthRatio: 0.7, // Weak army
        objectivesControlled: 0,
        unitsInDanger: 1,
      };
      
      const strategy = recommendStrategy(state, 3, 5);
      expect(strategy).toBe('aggressive');
    });

    it('should recommend objective-focused when losing VPs but strong army', () => {
      const state: any = {
        vpDifferential: -8,
        strengthRatio: 1.2, // Strong army
        objectivesControlled: 0,
        unitsInDanger: 0,
      };
      
      const strategy = recommendStrategy(state, 3, 5);
      expect(strategy).toBe('objective-focused');
    });

    it('should recommend defensive when many units in danger', () => {
      const state: any = {
        vpDifferential: 3,
        strengthRatio: 0.9,
        objectivesControlled: 1,
        unitsInDanger: 6, // Lots of units below half strength
        totalUnits: 10, // Out of 10 total units
      };
      
      const strategy = recommendStrategy(state, 3, 5);
      expect(strategy).toBe('defensive');
    });

    it('should recommend strategy for late game winning scenario', () => {
      const state: any = {
        vpDifferential: 15, // Big lead
        strengthRatio: 1.1,
        objectivesControlled: 2,
        unitsInDanger: 0,
      };
      
      const strategy = recommendStrategy(state, 5, 5); // Last turn
      expect(strategy).toBe('defensive'); // Protect the lead
    });

    it('should recommend aggressive for late game losing scenario', () => {
      const state: any = {
        vpDifferential: -12, // Big deficit
        strengthRatio: 0.9,
        objectivesControlled: 0,
        unitsInDanger: 2,
      };
      
      const strategy = recommendStrategy(state, 5, 5); // Last turn
      expect(strategy).toBe('aggressive'); // Desperate push
    });

    it('should return null for balanced mid-game', () => {
      const state: any = {
        vpDifferential: 2, // Close game
        strengthRatio: 1.0, // Even strength
        objectivesControlled: 1,
        unitsInDanger: 1,
      };
      
      const strategy = recommendStrategy(state, 3, 5);
      expect(strategy).toBeNull(); // No change needed
    });
  });

  describe('explainStrategyChoice', () => {
    it('should explain early game choice', () => {
      const state: any = {
        vpDifferential: 0,
        strengthRatio: 1.0,
        unitsInDanger: 0,
      };
      
      const explanation = explainStrategyChoice(state, 'objective-focused', 1);
      expect(explanation).toContain('Early game');
    });

    it('should explain VP-based choice', () => {
      const state: any = {
        vpDifferential: 12,
        strengthRatio: 1.0,
        unitsInDanger: 0,
      };
      
      const explanation = explainStrategyChoice(state, 'defensive', 3);
      expect(explanation).toContain('VP lead');
      expect(explanation).toContain('+12');
    });

    it('should explain army advantage', () => {
      const state: any = {
        vpDifferential: 3,
        strengthRatio: 1.3,
        unitsInDanger: 0,
      };
      
      const explanation = explainStrategyChoice(state, 'aggressive', 3);
      expect(explanation).toContain('Army advantage');
    });

    it('should explain units in danger', () => {
      const state: any = {
        vpDifferential: 0,
        strengthRatio: 1.0,
        unitsInDanger: 3,
      };
      
      const explanation = explainStrategyChoice(state, 'defensive', 3);
      expect(explanation).toContain('units in danger');
    });
  });
});
