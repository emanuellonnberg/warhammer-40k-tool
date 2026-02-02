/**
 * Focused debug test for terrain movement issues
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runSimpleEngagement } from '../src/simulation';
import {
    createRuins,
    createContainer,
    createGTLayout,
    resetTerrainIdCounter,
    isMovementBlocked,
    type Point,
} from '../src/simulation/terrain';
import type { Army } from '../src/types';

function createTestArmy(name: string): Army {
    return {
        armyName: name,
        faction: 'Test',
        pointsTotal: 200,
        units: [
            {
                id: `${name}-unit-1`,
                name: `${name} Squad 1`,
                type: 'Infantry',
                count: 5,
                points: 100,
                stats: {
                    move: '6',
                    toughness: '4',
                    save: '4+',
                    wounds: '1',
                    leadership: '7',
                    objectiveControl: '2',
                },
                weapons: [
                    {
                        id: `weapon-1`,
                        name: 'Bolter',
                        type: 'Ranged',
                        count: 5,
                        models_with_weapon: 5,
                        characteristics: {
                            range: '24',
                            attacks: '2',
                            skill: '3+',
                            strength: '4',
                            ap: '0',
                            damage: '1',
                        },
                    },
                ],
                rules: [],
                abilities: [],
            },
            {
                id: `${name}-unit-2`,
                name: `${name} Squad 2`,
                type: 'Infantry',
                count: 5,
                points: 100,
                stats: {
                    move: '6',
                    toughness: '4',
                    save: '4+',
                    wounds: '1',
                    leadership: '7',
                    objectiveControl: '2',
                },
                weapons: [
                    {
                        id: `weapon-2`,
                        name: 'Bolter',
                        type: 'Ranged',
                        count: 5,
                        models_with_weapon: 5,
                        characteristics: {
                            range: '24',
                            attacks: '2',
                            skill: '3+',
                            strength: '4',
                            ap: '0',
                            damage: '1',
                        },
                    },
                ],
                rules: [],
                abilities: [],
            },
        ],
        rules: {},
        abilities: {},
    };
}

describe('Terrain Movement Analysis', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
    });

    it('should compare movement with and without terrain', () => {
        const armyA = createTestArmy('Army A');
        const armyB = createTestArmy('Army B');

        // Run without terrain
        const noTerrainResult = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 2,
            terrain: [],
            allowAdvance: false,
            useDiceRolls: false,
        });

        // Run with blocking terrain in the center
        const terrain = [createContainer(0, 0, true, 'Center Block')];
        const withTerrainResult = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 2,
            terrain,
            allowAdvance: false,
            useDiceRolls: false,
        });

        console.log('\n=== NO TERRAIN ===');
        const noTerrainMovements = noTerrainResult.logs
            .filter(l => l.phase === 'movement' && l.movementDetails?.length)
            .flatMap(l => l.movementDetails!);

        noTerrainMovements.forEach(m => {
            console.log(`  ${m.unitName}: ${m.distance.toFixed(1)}"`);
        });

        console.log('\n=== WITH TERRAIN ===');
        const withTerrainMovements = withTerrainResult.logs
            .filter(l => l.phase === 'movement' && l.movementDetails?.length)
            .flatMap(l => l.movementDetails!);

        withTerrainMovements.forEach(m => {
            console.log(`  ${m.unitName}: ${m.distance.toFixed(1)}"`);
        });

        // Both should have movements
        expect(noTerrainMovements.length).toBeGreaterThan(0);
        expect(withTerrainMovements.length).toBeGreaterThan(0);
    });

    it('should analyze terrain layout impact on movement', () => {
        const armyA = createTestArmy('Army A');
        const armyB = createTestArmy('Army B');

        // Use GT layout
        const gtLayout = createGTLayout(44, 60);

        console.log('\n=== GT LAYOUT TERRAIN ===');
        gtLayout.features.forEach(t => {
            console.log(`  ${t.name}: ${t.type} at (${t.x}, ${t.y}), ${t.width}x${t.height}`);
            console.log(`    Traits: ${Object.entries(t.traits).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
            if (t.impassable) console.log('    IMPASSABLE');
        });

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 2,
            terrainLayout: gtLayout,
            allowAdvance: false,
            useDiceRolls: false,
        });

        console.log('\n=== MOVEMENT PHASES ===');
        result.logs
            .filter(l => l.phase === 'movement')
            .forEach(l => {
                console.log(`Turn ${l.turn} ${l.actor}: ${l.description.substring(0, 60)}...`);
                if (l.movementDetails?.length) {
                    l.movementDetails.forEach(m => {
                        console.log(`  ${m.unitName}: (${m.from.x.toFixed(1)},${m.from.y.toFixed(1)}) -> (${m.to.x.toFixed(1)},${m.to.y.toFixed(1)}) = ${m.distance.toFixed(1)}"`);
                    });
                }
            });

        // Check that no units ended up inside impassable terrain
        const impassableTerrain = result.terrain?.filter(t => t.impassable) || [];
        const finalPositions = [...result.positions.end.armyA, ...result.positions.end.armyB];

        impassableTerrain.forEach(terrain => {
            const bounds = {
                minX: terrain.x - terrain.width / 2,
                maxX: terrain.x + terrain.width / 2,
                minY: terrain.y - terrain.height / 2,
                maxY: terrain.y + terrain.height / 2,
            };

            finalPositions.forEach(unit => {
                const isInside =
                    unit.x >= bounds.minX && unit.x <= bounds.maxX &&
                    unit.y >= bounds.minY && unit.y <= bounds.maxY;

                if (isInside) {
                    console.error(`UNIT INSIDE TERRAIN: ${terrain.name} at (${unit.x}, ${unit.y})`);
                }
                expect(isInside).toBe(false);
            });
        });

        expect(result.logs.length).toBeGreaterThan(0);
    });

    it('should show if units get stuck at terrain', () => {
        const armyA = createTestArmy('Army A');
        const armyB = createTestArmy('Army B');

        // Large blocking terrain
        const terrain = [
            createContainer(0, 5, true, 'Upper Block'),
            createContainer(0, -5, true, 'Lower Block'),
            createContainer(0, 0, true, 'Center Block'),
        ];

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 3,
            terrain,
            allowAdvance: true,
            useDiceRolls: false,
        });

        console.log('\n=== MOVEMENT WITH MULTIPLE BLOCKING TERRAIN ===');

        // Track unit positions per turn
        result.positionsTimeline?.forEach((snapshot, i) => {
            if (snapshot.turn > 0) {
                console.log(`\nAfter turn ${snapshot.turn}, phase ${snapshot.actor}:`);
                snapshot.armyA.forEach(u => {
                    console.log(`  Army A - ${u.id}: (${u.x.toFixed(1)}, ${u.y.toFixed(1)})`);
                });
                snapshot.armyB.forEach(u => {
                    console.log(`  Army B - ${u.id}: (${u.x.toFixed(1)}, ${u.y.toFixed(1)})`);
                });
            }
        });

        // Check that units actually move between turns
        const timeline = result.positionsTimeline || [];
        if (timeline.length >= 2) {
            const firstMove = timeline.find(s => s.turn === 1 && s.actor === 'armyA');
            const lastMove = timeline[timeline.length - 1];

            if (firstMove && lastMove) {
                const armyAMoved = firstMove.armyA.some((start, i) => {
                    const end = lastMove.armyA[i];
                    return end && (Math.abs(start.x - end.x) > 0.1 || Math.abs(start.y - end.y) > 0.1);
                });

                console.log(`\nArmy A moved over simulation: ${armyAMoved}`);
                expect(armyAMoved).toBe(true);
            }
        }
    });
});
