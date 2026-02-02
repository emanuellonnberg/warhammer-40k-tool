/**
 * Comprehensive terrain pathfinding tests
 * Tests complex pathing scenarios around and through terrain
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRuins,
    createContainer,
    createWoods,
    createHill,
    resetTerrainIdCounter,
    type Point,
    type TerrainFeature,
    isMovementBlocked,
} from '../src/simulation/terrain';
import {
    generateNavMesh,
    findPath,
    getMaxTravelPoint,
    euclideanDistance,
    resetWaypointIdCounter,
    type NavMesh,
} from '../src/simulation/pathfinding';
import { planGreedyMovement, getStrategyWeights, isUnitInfantry, isUnitLargeModel, getUnitBaseRadius } from '../src/simulation/planner';
import { runSimpleEngagement } from '../src/simulation/simple-engagement';
import type { UnitState, ObjectiveMarker, ArmyState } from '../src/simulation/types';
import type { Army, Unit } from '../src/types';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createInfantryUnit(id: string, name: string, move: string = '6'): Unit {
    return {
        id,
        name,
        type: 'Infantry',
        points: 100,
        models: [{ name: 'Model', baseSize: '28mm', count: 5, wounds: 1 }],
        stats: { move, WS: '3+', BS: '4+', S: '4', T: '4', W: '1', A: '2', Ld: '8', Sv: '3+' },
        weapons: [{
            id: `${id}-bolter`,
            name: 'Bolter',
            type: 'ranged',
            count: 5,
            models_with_weapon: 5,
            characteristics: { range: '24', attacks: '2', BS: '3+', S: '4', AP: '0', D: '1' }
        }],
        abilities: []
    };
}

function createVehicleUnit(id: string, name: string, move: string = '10'): Unit {
    return {
        id,
        name,
        type: 'Vehicle',
        points: 200,
        models: [{ name: 'Hull', baseSize: '120x92mm', count: 1, wounds: 14 }],
        stats: { move, WS: '4+', BS: '3+', S: '6', T: '10', W: '14', A: '3', Ld: '7', Sv: '3+' },
        weapons: [{
            id: `${id}-cannon`,
            name: 'Battle Cannon',
            type: 'ranged',
            count: 1,
            models_with_weapon: 1,
            characteristics: { range: '48', attacks: 'D6', BS: '3+', S: '10', AP: '-2', D: '3' }
        }],
        abilities: []
    };
}

function createTestArmy(name: string, units: Unit[]): Army {
    return {
        id: `army-${name}`,
        armyName: name,
        faction: 'Test Faction',
        units,
        totalPoints: units.reduce((sum, u) => sum + u.points, 0)
    };
}

// ============================================================================
// TERRAIN PATHING TESTS
// ============================================================================

describe('Terrain Pathfinding - Complex Scenarios', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    describe('Pathing Around Single Obstacles', () => {
        it('should path around a centered impassable container', () => {
            // Container in center blocking direct path
            const terrain = [createContainer(0, 0, true, 'Center Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };

            // Direct path should be blocked
            const blocked = isMovementBlocked(start, end, terrain, true, false, 0.5);
            expect(blocked.blocked).toBe(true);

            // But pathfinding should find a way around
            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);
            expect(path.path.length).toBeGreaterThan(2); // Should have waypoints

            console.log('Path around container:', path.path.map(p => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`).join(' -> '));
            console.log(`Direct distance: ${euclideanDistance(start, end).toFixed(1)}", Path distance: ${path.distance.toFixed(1)}"`);

            // Path should be longer than direct (went around)
            expect(path.distance).toBeGreaterThan(euclideanDistance(start, end));
        });

        it('should path around terrain offset to one side', () => {
            // Terrain above center
            const terrain = [createContainer(0, 8, true, 'Upper Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 5 };
            const end: Point = { x: 15, y: 5 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Path should go below the terrain (shorter route)
            const avgY = path.path.reduce((sum, p) => sum + p.y, 0) / path.path.length;
            console.log(`Terrain at y=8, Path avg y=${avgY.toFixed(1)} (should be lower to go around)`);
        });

        it('should find path even when terrain is very close to start', () => {
            const terrain = [createContainer(-10, 0, true, 'Close Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -18, y: 0 }; // Very close to terrain
            const end: Point = { x: 10, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);
            console.log('Path from near terrain:', path.path.length, 'waypoints');
        });
    });

    describe('Pathing Around Multiple Obstacles', () => {
        it('should navigate through a corridor of terrain', () => {
            // Create a corridor with terrain on both sides
            const terrain = [
                createContainer(-5, 10, true, 'Upper Left'),
                createContainer(-5, -10, true, 'Lower Left'),
                createContainer(5, 10, true, 'Upper Right'),
                createContainer(5, -10, true, 'Lower Right'),
            ];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -20, y: 0 };
            const end: Point = { x: 20, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Path should stay in the corridor (y close to 0)
            const maxYDeviation = Math.max(...path.path.map(p => Math.abs(p.y)));
            console.log(`Corridor path max Y deviation: ${maxYDeviation.toFixed(1)}"`);
            expect(maxYDeviation).toBeLessThan(8); // Should stay in corridor
        });

        it('should find path through GT Standard layout', () => {
            // Simulate GT Standard layout - multiple terrain pieces
            const terrain = [
                createRuins(-12, 0, 6, 4, 'Left Ruins'),
                createRuins(12, 0, 6, 4, 'Right Ruins'),
                createContainer(0, 12, true, 'Top Container'),
                createContainer(0, -12, true, 'Bottom Container'),
                createWoods(-8, 15, 4, 'Top Left Woods'),
                createWoods(8, -15, 4, 'Bottom Right Woods'),
            ];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            // Test diagonal crossing
            const start: Point = { x: -20, y: -20 };
            const end: Point = { x: 20, y: 20 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);
            console.log('GT layout diagonal path:', path.path.length, 'waypoints, distance:', path.distance.toFixed(1));
        });

        it('should handle L-shaped obstacle configuration', () => {
            // L-shaped obstacle
            const terrain = [
                createContainer(0, 5, true, 'L-Top'),
                createContainer(5, 0, true, 'L-Right'),
                createContainer(0, 0, true, 'L-Corner'),
            ];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -10, y: -10 };
            const end: Point = { x: 10, y: 10 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Should go around the L
            console.log('L-shaped obstacle path:', path.path.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' -> '));
        });
    });

    describe('Infantry vs Vehicle Pathing Differences', () => {
        it('should allow infantry through breachable ruins', () => {
            const ruins = createRuins(0, 0, 8, 6, 'Breachable Ruins');
            const terrain = [ruins];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };

            // Infantry should go through
            const infantryPath = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(infantryPath.found).toBe(true);
            console.log(`Infantry path through ruins: ${infantryPath.distance.toFixed(1)}" (direct: ${euclideanDistance(start, end).toFixed(1)}")`);

            // Vehicle should go around
            const vehiclePath = findPath(start, end, navMesh, terrain, false, true, 2.5);
            expect(vehiclePath.found).toBe(true);
            console.log(`Vehicle path around ruins: ${vehiclePath.distance.toFixed(1)}"`);

            // Vehicle path should be longer
            expect(vehiclePath.distance).toBeGreaterThan(infantryPath.distance);
        });

        it('should block large models on infantry-only terrain', () => {
            // Create terrain that blocks large models
            const terrain = [createRuins(0, 0, 8, 6, 'Infantry Only Ruins')];
            terrain[0].infantryOnly = true; // Mark as infantry-only

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };

            // Direct movement should be blocked for large models
            const vehicleBlocked = isMovementBlocked(start, end, terrain, false, true, 2.5);
            expect(vehicleBlocked.blocked).toBe(true);

            // But allowed for infantry
            const infantryBlocked = isMovementBlocked(start, end, terrain, true, false, 0.5);
            // Infantry goes through breachable ruins
            console.log('Infantry through infantry-only terrain:', infantryBlocked.blocked ? 'blocked' : 'allowed');
        });
    });

    describe('Base Size Collision Detection', () => {
        it('should account for base radius when pathing near terrain', () => {
            const terrain = [createContainer(0, 0, true, 'Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -10, y: 3 }; // Starting close to terrain edge
            const end: Point = { x: 10, y: 3 };

            // Small base should pass closer
            const smallBasePath = findPath(start, end, navMesh, terrain, true, false, 0.5);
            // Large base should need more clearance
            const largeBasePath = findPath(start, end, navMesh, terrain, false, true, 2.5);

            expect(smallBasePath.found).toBe(true);
            expect(largeBasePath.found).toBe(true);

            console.log(`Small base path: ${smallBasePath.distance.toFixed(1)}", Large base path: ${largeBasePath.distance.toFixed(1)}"`);
        });

        it('should detect when unit base would clip terrain', () => {
            const terrain = [createContainer(0, 0, true, 'Container')];

            // Point very close to terrain edge
            const nearEdge: Point = { x: -4, y: 0 }; // Container is ~6x6, so edge at x=-3
            const destination: Point = { x: 4, y: 0 };

            // With large base radius, should be blocked
            const largeBaseBlocked = isMovementBlocked(nearEdge, destination, terrain, false, true, 2.5);
            expect(largeBaseBlocked.blocked).toBe(true);
        });
    });

    describe('Movement Limit Enforcement', () => {
        it('should stop at movement allowance along path', () => {
            const terrain = [createContainer(0, 0, true, 'Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -20, y: 0 };
            const end: Point = { x: 20, y: 0 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Simulate 6" movement allowance
            const moveAllowance = 6;
            const maxTravel = getMaxTravelPoint(path.path, moveAllowance, terrain);

            console.log(`Full path: ${path.distance.toFixed(1)}", Movement: ${moveAllowance}", Traveled: ${maxTravel.distanceTraveled.toFixed(1)}"`);
            console.log(`Stopped at: (${maxTravel.point.x.toFixed(1)}, ${maxTravel.point.y.toFixed(1)})`);

            // Should not exceed movement allowance
            expect(maxTravel.distanceTraveled).toBeLessThanOrEqual(moveAllowance + 0.1);
            // Should use most of movement
            expect(maxTravel.distanceTraveled).toBeGreaterThan(moveAllowance * 0.9);
        });

        it('should correctly traverse multiple path segments within movement', () => {
            const terrain = [
                createContainer(-5, 5, true, 'Left'),
                createContainer(5, 5, true, 'Right'),
            ];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 10 };
            const end: Point = { x: 15, y: 10 };

            const path = findPath(start, end, navMesh, terrain, true, false, 0.5);
            expect(path.found).toBe(true);

            // Test with different movement allowances
            for (const mv of [6, 10, 15, 20]) {
                const travel = getMaxTravelPoint(path.path, mv, terrain);
                console.log(`Move ${mv}": traveled ${travel.distanceTraveled.toFixed(1)}", at segment ${travel.pathIndex}`);
                expect(travel.distanceTraveled).toBeLessThanOrEqual(mv + 0.1);
            }
        });
    });
});

describe('Full Simulation Terrain Movement', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    it('should show units pathing around center obstacle', () => {
        const infantry = createInfantryUnit('squad-1', 'Test Squad', '6');
        const armyA = createTestArmy('Army A', [infantry]);
        const armyB = createTestArmy('Army B', [createInfantryUnit('enemy-1', 'Enemy Squad', '6')]);

        const terrain = [createContainer(0, 0, true, 'Center Block')];

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 3,
            terrain,
            allowAdvance: false,
        });

        // Find movement logs
        const movementLogs = result.logs.filter(l => l.phase === 'movement');
        movementLogs.forEach(log => {
            if (log.movementDetails) {
                log.movementDetails.forEach(md => {
                    console.log(`${md.unitName}: moved ${md.distance.toFixed(1)}" from (${md.from.x.toFixed(1)}, ${md.from.y.toFixed(1)}) to (${md.to.x.toFixed(1)}, ${md.to.y.toFixed(1)})`);
                });
            }
        });

        // Units should have moved
        const totalMovement = movementLogs.reduce((sum, log) => {
            return sum + (log.movementDetails?.reduce((s, m) => s + m.distance, 0) || 0);
        }, 0);
        expect(totalMovement).toBeGreaterThan(0);
        console.log(`Total movement across ${result.logs.filter(l => l.phase === 'movement').length} movement phases: ${totalMovement.toFixed(1)}"`);
    });

    it('should show vehicle taking longer path around ruins', () => {
        const vehicle = createVehicleUnit('tank-1', 'Test Tank', '10');
        const infantry = createInfantryUnit('squad-1', 'Infantry Squad', '6');

        const armyA = createTestArmy('Army A', [vehicle, infantry]);
        const armyB = createTestArmy('Army B', [createInfantryUnit('enemy-1', 'Enemy Squad', '6')]);

        // Ruins that infantry can breach but vehicles must go around
        const terrain = [createRuins(0, 0, 10, 8, 'Center Ruins')];

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 2,
            terrain,
            allowAdvance: false,
        });

        // Check movement details
        const movementLogs = result.logs.filter(l => l.phase === 'movement' && l.actor === 'armyA');
        movementLogs.forEach(log => {
            if (log.movementDetails) {
                log.movementDetails.forEach(md => {
                    console.log(`${md.unitName}: ${md.distance.toFixed(1)}" (${md.from.x.toFixed(1)},${md.from.y.toFixed(1)}) -> (${md.to.x.toFixed(1)},${md.to.y.toFixed(1)})`);
                });
            }
        });
    });
});
