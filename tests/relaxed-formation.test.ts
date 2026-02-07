import { describe, it, expect, beforeEach } from 'vitest';
import { runSimpleEngagement } from '../src/simulation/simple-engagement';
import { createContainer, resetTerrainIdCounter } from '../src/simulation/terrain';
import { Army } from '../src/types';

function createTestArmy(name: string): Army {
    return {
        armyName: name,
        faction: 'Test',
        pointsTotal: 100,
        units: [{
            id: `${name}-u1`,
            name: 'SkirmishSquad',
            type: 'Infantry',
            count: 3,
            points: 100,
            stats: { move: '10', toughness: '4', save: '4+', wounds: '1', leadership: '7', objectiveControl: '1' },
            weapons: [{
                id: 'pistol1', name: 'Pistol', type: 'Pistol',
                characteristics: { a: '2', range: '12', keywords: 'Pistol' },
                count: 1, models_with_weapon: 3
            }],
            rules: [],
            abilities: []
        }],
        rules: {},
        abilities: {}
    };
}

describe('Relaxed Formation Persistence', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
    });

    it('should maintain relative model positions when moving diagonally, preventing grid snap', () => {
        const armyA = createTestArmy('Attacker');
        const armyB = createTestArmy('Defender');

        // Setup: Place defender far away so attacker moves towards them
        // We want a simple move across open ground
        // We implicitly assume the unit starts in a standard formation.
        // The key is that after moving, it should NOT have snapped to a perfectly dense grid 
        // if it started slightly differently, OR it should just move each model naturally.

        // Actually, to test "persistence", we'd ideally want to start in a custom formation.
        // But since we can't easily inject a custom formation start without mocking, 
        // we'll rely on the fact that standard movement (without reform) calculates per-model.

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 1,
            terrain: [],
            allowAdvance: true
        });

        const startUnit = result.positions.start.armyA[0];
        const endUnit = result.positions.end.armyA[0];

        // Calculate relative offsets of models from the unit CENTROID at start
        // Note: unit.x/y might be formation anchor, but simulation updates it to centroid.
        // We must calculate centroid manually for start to ensure consistent comparison.
        const startModels = startUnit.models!;
        const startCentroid = startModels.reduce((acc, m) => ({ x: acc.x + m.x, y: acc.y + m.y }), { x: 0, y: 0 });
        startCentroid.x /= startModels.length;
        startCentroid.y /= startModels.length;

        const startOffsets = startModels.map(m => ({
            dx: m.x - startCentroid.x,
            dy: m.y - startCentroid.y
        }));

        // Calculate relative offsets at end (unit.x/y is already centroid after sim step)
        const endCenter = { x: endUnit.x, y: endUnit.y };
        const endOffsets = endUnit.models!.map(m => ({
            dx: m.x - endCenter.x,
            dy: m.y - endCenter.y
        }));

        console.log('Start Offsets:', startOffsets);
        console.log('End Offsets:', endOffsets);

        // In a "Rigid/Relaxed" move (translation only), the relative offsets should be 
        // VERY close to identical.
        // In a "Reform" move (grid snap), they would likely change significantly 
        // (especially if the move direction changed the "front" of the unit).

        // Compare offsets (allow small float error)
        for (let i = 0; i < startOffsets.length; i++) {
            const s = startOffsets[i];
            const e = endOffsets[i];
            const diffX = Math.abs(s.dx - e.dx);
            const diffY = Math.abs(s.dy - e.dy);

            // If reformUnit ran, it would likely re-orient the formation to face the target,
            // changing these offsets relative to the new "front".
            // If it's just translation, offsets remain identical.
            expect(diffX, `DiffX too high: ${diffX} (Start: ${s.dx}, End: ${e.dx})`).toBeLessThan(0.1);
            expect(diffY, `DiffY too high: ${diffY} (Start: ${s.dy}, End: ${e.dy})`).toBeLessThan(0.1);
        }
    });
});
