import { describe, it, expect } from 'vitest';
import { performCombatMove, reformUnit } from '../src/simulation/simple-engagement';
import { UnitState } from '../src/simulation/types';
import { Unit } from '../src/types';

function createMockUnit(id: string, count: number, x: number, y: number): UnitState {
    const models = [];
    for (let i = 0; i < count; i++) {
        models.push({ x: x + (i % 3), y: y + Math.floor(i / 3), alive: true, index: i });
    }

    return {
        unit: { id, name: 'Test', stats: { move: '6"' }, points: 100 } as Unit,
        remainingModels: count,
        remainingWounds: count,
        role: { primary: 'melee-missile', optimalRange: 1, chargeThreat: 12 },
        position: { x, y },
        engaged: false,
        modelPositions: models,
        baseSizeInches: 1,
        formationStrategy: 'compact'
    };
}

describe('Melee Combat Movement', () => {
    it('should pile-in 3 inches towards nearest enemy', () => {
        const attacker = createMockUnit('atk', 5, 0, 0); // At 0,0
        const defender = createMockUnit('def', 5, 10, 0); // At 10,0

        // Distance is roughly 10
        // performCombatMove should move attacker 3" closer -> 3,0
        performCombatMove(attacker, [defender]);

        // Check new position
        // The formation center should have moved ~3"
        expect(attacker.position.x).toBeCloseTo(3, 0);
        expect(attacker.formationStrategy).toBe('compact');
    });

    it('should not move more than 3 inches even if enemy is far', () => {
        const attacker = createMockUnit('atk', 5, 0, 0);
        const defender = createMockUnit('def', 5, 20, 0); // Far away

        performCombatMove(attacker, [defender]);

        // Still only 3"
        expect(attacker.position.x).toBeCloseTo(3, 0);
    });

    it('should move into contact if closer than 3 inches', () => {
        const attacker = createMockUnit('atk', 1, 0, 0);
        const defender = createMockUnit('def', 1, 2, 0); // 2" away

        performCombatMove(attacker, [defender]);

        // Should move ~2" to be in contact/close
        // If center moves to 2, they overlap.
        // It should move to distance 0? Or just move 2?
        // Logic says min(3, dist). Dist is 2. Moves 2.
        expect(attacker.position.x).toBeCloseTo(2, 0);
    });

    it('should target the nearest enemy among multiple', () => {
        const attacker = createMockUnit('atk', 1, 0, 0);
        const nearDef = createMockUnit('near', 1, 0, 5); // 5" North
        const farDef = createMockUnit('far', 1, 10, 0); // 10" East

        performCombatMove(attacker, [farDef, nearDef]);

        // Should move towards nearDef (North)
        expect(attacker.position.x).toBeCloseTo(0);
        expect(attacker.position.y).toBeCloseTo(3, 0); // Moved 3" Y
    });
});
