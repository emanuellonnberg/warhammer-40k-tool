import { describe, it, expect } from 'vitest';
import { embarkUnit, disembarkUnit } from '../src/simulation/simple-engagement';
import { UnitState } from '../src/simulation/types';
import { Unit } from '../src/types';

function createMockUnit(id: string, x: number, y: number, role = 'utility'): UnitState {
    return {
        unit: { id, name: id, stats: { move: '6"' } } as Unit,
        remainingModels: 5,
        remainingWounds: 5,
        role: { primary: role } as any,
        position: { x, y },
        modelPositions: [{ x, y, alive: true }],
        baseSizeInches: 1,
        engaged: false,
        currentFormation: 'compact'
    };
}

describe('Transport Mechanics', () => {
    it('should allow embark if within 3 inches', () => {
        const infantry = createMockUnit('inf', 0, 0);
        const transport = createMockUnit('rhino', 2, 0, 'transport');

        const success = embarkUnit(infantry, transport);

        expect(success).toBe(true);
        expect(infantry.transportedBy).toBe('rhino');
        expect(transport.transportedUnitIds).toContain('inf');
        // Position should update to match transport (visual hiding)
        expect(infantry.position.x).toBe(2);
    });

    it('should deny embark if further than 3 inches', () => {
        const infantry = createMockUnit('inf', 0, 0);
        const transport = createMockUnit('rhino', 5, 0, 'transport');

        const success = embarkUnit(infantry, transport);

        expect(success).toBe(false);
        expect(infantry.transportedBy).toBeUndefined();
    });

    it('should disembark within 3 inches', () => {
        const infantry = createMockUnit('inf', 0, 0);
        const transport = createMockUnit('rhino', 10, 10, 'transport');

        // Setup state: inside
        infantry.transportedBy = 'rhino';
        transport.transportedUnitIds = ['inf'];
        infantry.position = { x: 10, y: 10 };
        infantry.modelPositions = [{ x: 10, y: 10, alive: true }];

        const success = disembarkUnit(infantry, transport);

        expect(success).toBe(true);
        expect(infantry.transportedBy).toBeUndefined();
        expect(transport.transportedUnitIds).not.toContain('inf');

        // Verify position change
        const dist = Math.sqrt(
            (infantry.position.x - transport.position.x) ** 2 +
            (infantry.position.y - transport.position.y) ** 2
        );
        expect(dist).toBeGreaterThan(0);
        expect(dist).toBeLessThanOrEqual(3.5); // 3" + some model formation variance
    });
});
