
import { describe, it, expect } from 'vitest';
import { checkCoherencyBroken, enforceCoherency } from '../src/simulation/simple-engagement';
import { UnitState } from '../src/simulation/types'; // Assuming types export UnitState

// Helper to create a minimal UnitState for testing
function createMockUnit(models: { x: number, y: number, alive: boolean }[]): UnitState {
    return {
        unit: { id: 'u1', name: 'TestUnit', stats: { movement: '6"' } } as any,
        remainingModels: models.filter(m => m.alive).length,
        modelPositions: models,
        position: { x: 0, y: 0 }, // Dummy center
        role: { primary: 'infantry' } as any,
        engaged: false,
        remainingWounds: models.length,
        baseRadius: 0.5,
    } as any;
}

describe('Coherency Hardening', () => {
    it('should identify a coherent unit as valid', () => {
        // 5 models in a tight line, 1" apart
        const models = [
            { x: 0, y: 0, alive: true },
            { x: 0, y: 1, alive: true },
            { x: 0, y: 2, alive: true },
            { x: 0, y: 3, alive: true },
            { x: 0, y: 4, alive: true },
        ];
        const unit = createMockUnit(models);
        expect(checkCoherencyBroken(unit)).toBe(false);
    });

    it('should identify a split unit (two groups far apart) as broken', () => {
        // 3 models at (0,0) and 3 models at (0, 20)
        const models = [
            { x: 0, y: 0, alive: true },
            { x: 0, y: 1, alive: true },
            { x: 0, y: 2, alive: true },
            // Gap of 18"
            { x: 0, y: 20, alive: true },
            { x: 0, y: 21, alive: true },
            { x: 0, y: 22, alive: true },
        ];
        const unit = createMockUnit(models);
        // Each group is internally coherent, but split from each other.
        // The span check should catch this.
        expect(checkCoherencyBroken(unit)).toBe(true);
    });

    it('should identify valid unit with one straggler as NOT broken (handled by normal enforce)', () => {
        // 4 models tight, 1 model just 2.5" away
        const models = [
            { x: 0, y: 0, alive: true },
            { x: 0, y: 1, alive: true },
            { x: 0, y: 2, alive: true },
            { x: 0, y: 3, alive: true },
            // Straggler at 5.5 (2.5 away from last)
            { x: 0, y: 5.5, alive: true },
        ];
        const unit = createMockUnit(models);

        // Isolate count: 1 model has 0 neighbors (assuming > 2.0 dist)
        // 1/5 = 20% < 30%. So distinct check fail.
        // Span check: Centroid at ~2. 
        // Furthest is 5.5. Dist is 3.5.
        // Max radius allowed: 4 + 5 = 9.
        // So this should be FALSE (not broken enough to force Reform).
        expect(checkCoherencyBroken(unit)).toBe(false);

        // However, enforceCoherency SHOULD move it.
        const moved = enforceCoherency(unit);
        expect(moved).toBe(true);
        // Check if straggler moved closer to center
        // Center of group is ~1.5. Straggler was at 5.5.
        // Should be pulled towards 1.5.
        expect(unit.modelPositions[4].y).toBeLessThan(5.5);
    });

    it('should identify scattered unit (many isolates) as broken', () => {
        // 5 models, all 3" apart
        const models = [
            { x: 0, y: 0, alive: true },
            { x: 0, y: 3, alive: true },
            { x: 0, y: 6, alive: true },
            { x: 0, y: 9, alive: true },
            { x: 0, y: 12, alive: true },
        ];
        const unit = createMockUnit(models);
        // All models have 0 neighbors < 2.0.
        // Isolate count = 5. 100% > 30%.
        expect(checkCoherencyBroken(unit)).toBe(true);
    });
});
