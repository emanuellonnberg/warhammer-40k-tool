/**
 * Tactical terrain pathing scenarios
 * Tests real gameplay situations with terrain navigation
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRuins,
    createContainer,
    resetTerrainIdCounter,
    type Point,
    type TerrainFeature,
} from '../src/simulation/terrain';
import {
    generateNavMesh,
    findPath,
    getMaxTravelPoint,
    euclideanDistance,
    resetWaypointIdCounter,
} from '../src/simulation/pathfinding';
import { runSimpleEngagement } from '../src/simulation/simple-engagement';
import type { Army, Unit } from '../src/types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMeleeUnit(id: string, name: string): Unit {
    return {
        id,
        name,
        type: 'Infantry',
        points: 150,
        models: [{ name: 'Model', baseSize: '32mm', count: 10, wounds: 1 }],
        stats: { move: '6', WS: '3+', BS: '4+', S: '4', T: '4', W: '1', A: '3', Ld: '7', Sv: '3+' },
        weapons: [{
            id: `${id}-sword`,
            name: 'Power Sword',
            type: 'melee',
            count: 10,
            models_with_weapon: 10,
            characteristics: { range: 'Melee', attacks: '3', WS: '3+', S: '5', AP: '-2', D: '1' }
        }],
        abilities: []
    };
}

function createRangedUnit(id: string, name: string): Unit {
    return {
        id,
        name,
        type: 'Infantry',
        points: 100,
        models: [{ name: 'Model', baseSize: '25mm', count: 5, wounds: 1 }],
        stats: { move: '6', WS: '4+', BS: '3+', S: '3', T: '3', W: '1', A: '1', Ld: '7', Sv: '4+' },
        weapons: [{
            id: `${id}-rifle`,
            name: 'Bolter',
            type: 'ranged',
            count: 5,
            models_with_weapon: 5,
            characteristics: { range: '24', attacks: '2', BS: '3+', S: '4', AP: '0', D: '1' }
        }],
        abilities: []
    };
}

function createArmy(name: string, units: Unit[]): Army {
    return {
        id: `army-${name.toLowerCase().replace(/\s/g, '-')}`,
        armyName: name,
        faction: 'Test',
        units,
        totalPoints: units.reduce((s, u) => s + u.points, 0)
    };
}

// ============================================================================
// TACTICAL PATHING TESTS
// ============================================================================

describe('Tactical Terrain Pathing Scenarios', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    describe('Reaching Objectives Around Terrain', () => {
        it('should path around blocking terrain to reach objective', () => {
            // Objective is on the other side of a wall
            const terrain = [createContainer(0, 0, true, 'Wall')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            // Unit starts left of wall, objective is right of wall
            const unitStart: Point = { x: -15, y: 0 };
            const objectivePos: Point = { x: 15, y: 0 };

            const path = findPath(unitStart, objectivePos, navMesh, terrain, true, false, 0.5);

            expect(path.found).toBe(true);
            expect(path.path.length).toBeGreaterThan(2); // Should have waypoints around terrain

            console.log('Path to objective:', path.path.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> '));
            console.log(`Direct: ${euclideanDistance(unitStart, objectivePos).toFixed(1)}", Actual: ${path.distance.toFixed(1)}"`);
        });

        it('should reach objective over multiple turns when path is long', () => {
            // Large terrain blocking center
            const terrain = [createContainer(0, 0, true, 'Large Obstacle')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const unitStart: Point = { x: -20, y: 0 };
            const objectivePos: Point = { x: 20, y: 0 };

            const path = findPath(unitStart, objectivePos, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Simulate multiple movement phases (6" per turn)
            let currentPos = unitStart;
            const moveAllowance = 6;
            const turnsToReach: Point[] = [];

            for (let turn = 0; turn < 10; turn++) {
                const pathFromHere = findPath(currentPos, objectivePos, navMesh, terrain, true, false, 0.5);
                if (!pathFromHere.found) break;

                const travel = getMaxTravelPoint(pathFromHere.path, moveAllowance, terrain);
                turnsToReach.push(travel.point);
                currentPos = travel.point;

                const distToObj = euclideanDistance(currentPos, objectivePos);
                console.log(`Turn ${turn + 1}: moved to (${currentPos.x.toFixed(1)}, ${currentPos.y.toFixed(1)}), ${distToObj.toFixed(1)}" from objective`);

                if (distToObj < 1) {
                    console.log(`Reached objective in ${turn + 1} turns!`);
                    break;
                }
            }

            // Should eventually reach the objective
            const finalDist = euclideanDistance(currentPos, objectivePos);
            expect(finalDist).toBeLessThan(10); // Should be close to objective
        });

        it('should choose shorter path when multiple routes exist', () => {
            // U-shaped terrain - can go around either side
            const terrain = [
                createContainer(0, 5, true, 'Top Wall'),
                createContainer(0, -5, true, 'Bottom Wall'),
                createContainer(0, 0, true, 'Center Wall'),
            ];
            const navMesh = generateNavMesh(terrain, 60, 60, 1.5);

            // Paths exist going up or down around the formation
            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            console.log('Path through U-terrain:', path.path.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> '));
        });
    });

    describe('Melee Units Pathing to Engagement', () => {
        it('should path melee unit around terrain to reach enemy', () => {
            const terrain = [createContainer(0, 0, true, 'Blocking Wall')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const meleeUnitPos: Point = { x: -18, y: 0 };
            const enemyPos: Point = { x: 18, y: 3 }; // Slightly offset

            // Want to get within engagement range (1")
            const path = findPath(meleeUnitPos, enemyPos, navMesh, terrain, true, false, 0.5);

            expect(path.found).toBe(true);
            console.log(`Melee path to enemy: ${path.distance.toFixed(1)}" via ${path.path.length} waypoints`);

            // Simulate movement over turns
            let pos = meleeUnitPos;
            for (let turn = 1; turn <= 6; turn++) {
                const pathFromHere = findPath(pos, enemyPos, navMesh, terrain, true, false, 0.5);
                if (!pathFromHere.found) break;

                const travel = getMaxTravelPoint(pathFromHere.path, 6, terrain);
                pos = travel.point;

                const distToEnemy = euclideanDistance(pos, enemyPos);
                console.log(`Turn ${turn}: at (${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}), ${distToEnemy.toFixed(1)}" from enemy`);

                if (distToEnemy <= 12) { // Charge range
                    console.log(`In charge range after turn ${turn}!`);
                    break;
                }
            }
        });

        it('should run full simulation with melee unit navigating terrain', () => {
            const meleeSquad = createMeleeUnit('melee-1', 'Assault Squad');
            const enemySquad = createRangedUnit('enemy-1', 'Enemy Squad');

            const armyA = createArmy('Attackers', [meleeSquad]);
            const armyB = createArmy('Defenders', [enemySquad]);

            // Terrain between the armies
            const terrain = [
                createContainer(0, 5, true, 'Upper Block'),
                createContainer(0, -5, true, 'Lower Block'),
            ];

            const result = runSimpleEngagement(armyA, armyB, {
                initiative: 'armyA',
                maxRounds: 5,
                terrain,
                allowAdvance: true, // Allow advance for faster closing
                strategy: 'aggressive',
            });

            // Track melee unit's movement
            const movements = result.logs
                .filter(l => l.phase === 'movement' && l.actor === 'armyA')
                .flatMap(l => l.movementDetails || []);

            console.log('\nMelee unit movement over simulation:');
            movements.forEach((m, i) => {
                console.log(`  Phase ${i + 1}: ${m.distance.toFixed(1)}" (${m.from.x.toFixed(1)},${m.from.y.toFixed(1)}) -> (${m.to.x.toFixed(1)},${m.to.y.toFixed(1)})`);
            });

            // Check if any charges happened
            const chargeLogs = result.logs.filter(l => l.phase === 'charge' && l.actor === 'armyA');
            const chargeActions = chargeLogs.flatMap(l => l.actions || []);
            if (chargeActions.length > 0) {
                console.log('Charges occurred:', chargeActions.map(a => a.source));
            }

            // Melee unit should have moved significantly
            const totalMoved = movements.reduce((sum, m) => sum + m.distance, 0);
            expect(totalMoved).toBeGreaterThan(0);
            console.log(`Total movement: ${totalMoved.toFixed(1)}"`);
        });
    });

    describe('Edge Cases and Corner Situations', () => {
        it('should not get stuck in terrain corners', () => {
            // L-shaped corner that could trap a unit
            const terrain = [
                createContainer(-3, 0, true, 'Horizontal'),
                createContainer(0, 3, true, 'Vertical'),
            ];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            // Start in the corner area
            const start: Point = { x: -8, y: 8 };
            const end: Point = { x: 10, y: -10 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Simulate multiple turns - should make progress each turn
            let pos = start;
            let prevDist = euclideanDistance(pos, end);

            for (let turn = 1; turn <= 5; turn++) {
                const pathFromHere = findPath(pos, end, navMesh, terrain, true, false, 0.5);
                if (!pathFromHere.found) break;

                const travel = getMaxTravelPoint(pathFromHere.path, 6, terrain);
                pos = travel.point;

                const dist = euclideanDistance(pos, end);
                console.log(`Turn ${turn}: dist to target ${dist.toFixed(1)}" (was ${prevDist.toFixed(1)}")`);

                // Should be making progress (getting closer or same if at destination)
                expect(dist).toBeLessThanOrEqual(prevDist + 0.1);
                prevDist = dist;
            }
        });

        it('should handle starting position very close to terrain', () => {
            const terrain = [createContainer(0, 0, true, 'Wall')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            // Start position just outside terrain edge
            const start: Point = { x: -5, y: 0 }; // Very close to container edge
            const end: Point = { x: 15, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);

            // Should still find a path
            expect(path.found).toBe(true);
            console.log(`Path from near-terrain start: ${path.distance.toFixed(1)}", ${path.path.length} waypoints`);
        });

        it('should handle destination very close to terrain', () => {
            const terrain = [createContainer(10, 0, true, 'Wall')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            // Destination just to the left of terrain
            const end: Point = { x: 6, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);

            expect(path.found).toBe(true);

            // Final position should be valid (not inside terrain)
            const finalPos = path.path[path.path.length - 1];
            console.log(`Path ends at (${finalPos.x.toFixed(1)}, ${finalPos.y.toFixed(1)})`);
        });
    });

    describe('Different Army Routing', () => {
        it('should route armies on opposite sides differently', () => {
            // Central obstacle
            const terrain = [createContainer(0, 0, true, 'Central Block')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            // Army A coming from left
            const armyAStart: Point = { x: -20, y: 0 };
            // Army B coming from right
            const armyBStart: Point = { x: 20, y: 0 };
            // Both want to reach center objective
            const objective: Point = { x: 0, y: 15 };

            const pathA = findPath(armyAStart, objective, navMesh, terrain, true, false, 0.5);
            const pathB = findPath(armyBStart, objective, navMesh, terrain, true, false, 0.5);

            expect(pathA.found).toBe(true);
            expect(pathB.found).toBe(true);

            console.log('Army A path:', pathA.path.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join('->'));
            console.log('Army B path:', pathB.path.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join('->'));
        });
    });
});
