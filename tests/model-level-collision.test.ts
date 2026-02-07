import { describe, it, expect, beforeEach } from 'vitest';
import { runSimpleEngagement } from '../src/simulation/simple-engagement';
import { createContainer, resetTerrainIdCounter } from '../src/simulation/terrain';
import { Army } from '../src/types';

function createSmallTestArmy(name: string): Army {
    return {
        armyName: name,
        faction: 'Test',
        pointsTotal: 100,
        units: [{
            id: `${name}-u1`,
            name: 'TestSquad',
            type: 'Infantry',
            count: 2,
            points: 100,
            stats: {
                move: '48',
                toughness: '4',
                save: '4+',
                wounds: '1',
                leadership: '7',
                objectiveControl: '2'
            },
            weapons: [{
                id: 'melee1',
                name: 'Sword',
                type: 'Melee',
                characteristics: { a: '10', range: 'Melee' },
                count: 1,
                models_with_weapon: 2
            }],
            rules: [],
            abilities: []
        }],
        rules: {},
        abilities: {}
    };
}

describe('Model-Level Collision', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
    });

    it('should allow the unit to flow around a pillar, with the blocked model stopping while others continue', () => {
        const armyA = createSmallTestArmy('Attacker');
        const armyB = createSmallTestArmy('Defender');

        // Pillar at x=0, y=1.5. x-bounds [-1, 1], y-bounds [0.5, 2.5]
        const pillar = createContainer(0, 1.5, true, 'Pillar');
        pillar.width = 2;
        pillar.height = 2;

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 1,
            terrain: [pillar],
            allowAdvance: true
        });

        console.log('Pillar Bounds:', {
            x: pillar.x, y: pillar.y,
            minX: pillar.x - pillar.width / 2, maxX: pillar.x + pillar.width / 2,
            minY: pillar.y - pillar.height / 2, maxY: pillar.y + pillar.height / 2
        });

        const finalPosA = result.positions.end.armyA[0];
        console.log('Attacker Final Position (Fluid):', finalPosA);

        // NEW BEHAVIOR: Unit center should move PAST the pillar (x=0) 
        // because the center and bottom models have a clear path.
        expect(finalPosA.x).toBeGreaterThan(0);

        // Verify models are still in coherency (distance <= 2")
        const m1 = finalPosA.models![0];
        const m2 = finalPosA.models![1];
        const dist = Math.sqrt((m1.x - m2.x) ** 2 + (m1.y - m2.y) ** 2);
        expect(dist).toBeLessThanOrEqual(2.05); // Tiny bit of float buffer
    });
});
