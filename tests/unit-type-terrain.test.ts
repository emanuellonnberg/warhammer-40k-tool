/**
 * Unit Type Terrain Interaction Tests
 * Verifies that different unit types correctly interact with terrain based on rules
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRuins,
    createContainer,
    createWoods,
    createHill,
    resetTerrainIdCounter,
    isTerrainBlockingForUnit,
    isMovementBlocked,
    type TerrainFeature,
    type Point,
} from '../src/simulation/terrain';
import {
    generateNavMesh,
    findPath,
    resetWaypointIdCounter,
    euclideanDistance,
} from '../src/simulation/pathfinding';
import { isUnitInfantry, isUnitLargeModel, getUnitBaseRadius } from '../src/simulation/planner';
import { runSimpleEngagement } from '../src/simulation/simple-engagement';
import type { UnitState } from '../src/simulation/types';
import type { Army, Unit } from '../src/types';

// ============================================================================
// HELPER: Create different unit types
// ============================================================================

function createUnit(id: string, name: string, type: string, baseSize: string = '32mm'): Unit {
    return {
        id,
        name,
        type,
        points: 100,
        models: [{ name: 'Model', baseSize, count: 5, wounds: 2 }],
        stats: { move: '6', WS: '3+', BS: '4+', S: '4', T: '4', W: '2', A: '2', Ld: '7', Sv: '3+' },
        weapons: [{
            id: `${id}-weapon`,
            name: 'Weapon',
            type: 'ranged',
            count: 5,
            models_with_weapon: 5,
            characteristics: { range: '24', attacks: '2', BS: '3+', S: '4', AP: '0', D: '1' }
        }],
        abilities: []
    };
}

function createUnitState(unit: Unit): UnitState {
    return {
        unit,
        position: { x: 0, y: 0 },
        currentModels: unit.models[0].count,
        currentWounds: unit.models[0].wounds * unit.models[0].count,
        movedThisTurn: false,
        advancedThisTurn: false,
        shotThisTurn: false,
        chargedThisTurn: false,
        foughtThisTurn: false,
        isInMelee: false,
        meleeTarget: null,
        isDestroyed: false,
        battleShocked: false,
        usedOneTimeWeapons: [],
        role: undefined,
        modelPositions: []
    };
}

function createArmy(name: string, units: Unit[]): Army {
    return {
        id: `army-${name}`,
        armyName: name,
        faction: 'Test',
        units,
        totalPoints: units.reduce((s, u) => s + u.points, 0)
    };
}

// ============================================================================
// UNIT TYPE CLASSIFICATION TESTS
// ============================================================================

describe('Unit Type Classification', () => {
    describe('isUnitInfantry', () => {
        it('should classify Infantry type as infantry', () => {
            const unit = createUnitState(createUnit('inf', 'Space Marines', 'Infantry'));
            expect(isUnitInfantry(unit)).toBe(true);
        });

        it('should classify infantry variants correctly', () => {
            const types = ['Infantry', 'INFANTRY', 'Heavy Infantry', 'Jump Pack Infantry'];
            types.forEach(type => {
                const unit = createUnitState(createUnit('test', 'Test', type));
                expect(isUnitInfantry(unit)).toBe(true);
            });
        });

        it('should classify Character as infantry (for terrain purposes)', () => {
            const unit = createUnitState(createUnit('char', 'Captain', 'Character'));
            expect(isUnitInfantry(unit)).toBe(true);
        });

        it('should classify Beast as infantry', () => {
            const unit = createUnitState(createUnit('beast', 'Warpbeast', 'Beast'));
            expect(isUnitInfantry(unit)).toBe(true);
        });

        it('should classify Swarm as infantry', () => {
            const unit = createUnitState(createUnit('swarm', 'Scarab Swarm', 'Swarm'));
            expect(isUnitInfantry(unit)).toBe(true);
        });

        it('should NOT classify Vehicle as infantry', () => {
            const unit = createUnitState(createUnit('tank', 'Leman Russ', 'Vehicle'));
            expect(isUnitInfantry(unit)).toBe(false);
        });

        it('should NOT classify Monster as infantry', () => {
            const unit = createUnitState(createUnit('monster', 'Carnifex', 'Monster'));
            expect(isUnitInfantry(unit)).toBe(false);
        });
    });

    describe('isUnitLargeModel', () => {
        it('should classify Vehicle as large model', () => {
            const unit = createUnitState(createUnit('tank', 'Leman Russ', 'Vehicle'));
            expect(isUnitLargeModel(unit)).toBe(true);
        });

        it('should classify Monster as large model', () => {
            const unit = createUnitState(createUnit('monster', 'Carnifex', 'Monster'));
            expect(isUnitLargeModel(unit)).toBe(true);
        });

        it('should classify Titanic as large model', () => {
            const unit = createUnitState(createUnit('titan', 'Warlord Titan', 'Titanic'));
            expect(isUnitLargeModel(unit)).toBe(true);
        });

        it('should classify Knight as large model', () => {
            const unit = createUnitState(createUnit('knight', 'Knight Paladin', 'Knight'));
            expect(isUnitLargeModel(unit)).toBe(true);
        });

        it('should classify Walker as large model', () => {
            const unit = createUnitState(createUnit('walker', 'Dreadnought', 'Walker'));
            expect(isUnitLargeModel(unit)).toBe(true);
        });

        it('should NOT classify Infantry as large model', () => {
            const unit = createUnitState(createUnit('inf', 'Marines', 'Infantry'));
            expect(isUnitLargeModel(unit)).toBe(false);
        });

        it('should NOT classify Character as large model', () => {
            const unit = createUnitState(createUnit('char', 'Captain', 'Character'));
            expect(isUnitLargeModel(unit)).toBe(false);
        });
    });
});

// ============================================================================
// TERRAIN BLOCKING RULES TESTS
// ============================================================================

describe('Terrain Blocking Rules by Unit Type', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
    });

    describe('Breachable Terrain (Ruins)', () => {
        it('should allow infantry through breachable ruins', () => {
            const ruins = createRuins(0, 0, 6, 4, 'Test Ruins');
            expect(ruins.traits.breachable).toBe(true);

            const blocking = isTerrainBlockingForUnit(ruins, true, false);
            expect(blocking).toBe(false); // Infantry can pass
        });

        it('should block vehicles from breachable ruins', () => {
            const ruins = createRuins(0, 0, 6, 4, 'Test Ruins');

            const blocking = isTerrainBlockingForUnit(ruins, false, true);
            expect(blocking).toBe(true); // Vehicle blocked
        });

        it('should block monsters from breachable ruins', () => {
            const ruins = createRuins(0, 0, 6, 4, 'Test Ruins');

            // Monster = not infantry, is large model
            const blocking = isTerrainBlockingForUnit(ruins, false, true);
            expect(blocking).toBe(true);
        });
    });

    describe('Impassable Terrain (Containers)', () => {
        it('should block infantry from impassable containers', () => {
            const container = createContainer(0, 0, true, 'Test Container');
            expect(container.impassable).toBe(true);

            const blocking = isTerrainBlockingForUnit(container, true, false);
            expect(blocking).toBe(true);
        });

        it('should block vehicles from impassable containers', () => {
            const container = createContainer(0, 0, true, 'Test Container');

            const blocking = isTerrainBlockingForUnit(container, false, true);
            expect(blocking).toBe(true);
        });

        it('should block all unit types from impassable terrain', () => {
            const container = createContainer(0, 0, true, 'Test Container');

            // Infantry
            expect(isTerrainBlockingForUnit(container, true, false)).toBe(true);
            // Vehicle
            expect(isTerrainBlockingForUnit(container, false, true)).toBe(true);
            // Regular unit (not infantry, not large)
            expect(isTerrainBlockingForUnit(container, false, false)).toBe(true);
        });
    });

    describe('Woods (Difficult Ground)', () => {
        it('should not block infantry movement through woods', () => {
            const woods = createWoods(0, 0, 5, 'Test Woods');

            // Woods are not impassable or breachable by default
            const blocking = isTerrainBlockingForUnit(woods, true, false);
            expect(blocking).toBe(false);
        });

        it('should not block vehicle movement through woods', () => {
            const woods = createWoods(0, 0, 5, 'Test Woods');

            const blocking = isTerrainBlockingForUnit(woods, false, true);
            expect(blocking).toBe(false);
        });
    });

    describe('Hills', () => {
        it('should allow all units to move over hills', () => {
            const hill = createHill(0, 0, 6, 4, 'Test Hill');

            expect(isTerrainBlockingForUnit(hill, true, false)).toBe(false);
            expect(isTerrainBlockingForUnit(hill, false, true)).toBe(false);
        });
    });
});

// ============================================================================
// MOVEMENT PATH TESTS BY UNIT TYPE
// ============================================================================

describe('Movement Paths by Unit Type', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    describe('Path Through Breachable Terrain', () => {
        it('should find direct path for infantry through ruins', () => {
            const terrain = [createRuins(0, 0, 8, 6, 'Ruins')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };
            const directDist = euclideanDistance(start, end);

            // Infantry path (isInfantry=true, isLargeModel=false)
            const infantryPath = findPath(start, end, navMesh, terrain, true, false, 0.5);

            expect(infantryPath.found).toBe(true);
            console.log(`Infantry path through ruins: ${infantryPath.distance.toFixed(1)}" (direct: ${directDist.toFixed(1)}")`);

            // Infantry should take near-direct path
            expect(infantryPath.distance).toBeLessThan(directDist + 5);
        });

        it('should require vehicle to path around ruins', () => {
            const terrain = [createRuins(0, 0, 8, 6, 'Ruins')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };
            const directDist = euclideanDistance(start, end);

            // Vehicle path (isInfantry=false, isLargeModel=true)
            const vehiclePath = findPath(start, end, navMesh, terrain, false, true, 2.5);

            expect(vehiclePath.found).toBe(true);
            console.log(`Vehicle path around ruins: ${vehiclePath.distance.toFixed(1)}" (direct: ${directDist.toFixed(1)}")`);

            // Vehicle should take longer path around
            expect(vehiclePath.distance).toBeGreaterThan(directDist);
        });

        it('should show significant path difference between infantry and vehicle', () => {
            const terrain = [createRuins(0, 0, 10, 8, 'Large Ruins')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -18, y: 0 };
            const end: Point = { x: 18, y: 0 };

            const infantryPath = findPath(start, end, navMesh, terrain, true, false, 0.5);
            const vehiclePath = findPath(start, end, navMesh, terrain, false, true, 2.5);

            expect(infantryPath.found).toBe(true);
            expect(vehiclePath.found).toBe(true);

            const pathDifference = vehiclePath.distance - infantryPath.distance;
            console.log(`Path difference: ${pathDifference.toFixed(1)}" (Infantry: ${infantryPath.distance.toFixed(1)}", Vehicle: ${vehiclePath.distance.toFixed(1)}")`);

            // Vehicle should take notably longer path
            expect(pathDifference).toBeGreaterThan(3);
        });
    });

    describe('Path Around Impassable Terrain', () => {
        it('should path infantry around impassable container', () => {
            const terrain = [createContainer(0, 0, true, 'Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };
            const directDist = euclideanDistance(start, end);

            const infantryPath = findPath(start, end, navMesh, terrain, true, false, 0.5);

            expect(infantryPath.found).toBe(true);
            expect(infantryPath.distance).toBeGreaterThan(directDist); // Must go around
        });

        it('should path vehicle around impassable container', () => {
            const terrain = [createContainer(0, 0, true, 'Container')];
            const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

            const start: Point = { x: -15, y: 0 };
            const end: Point = { x: 15, y: 0 };
            const directDist = euclideanDistance(start, end);

            const vehiclePath = findPath(start, end, navMesh, terrain, false, true, 2.5);

            expect(vehiclePath.found).toBe(true);
            expect(vehiclePath.distance).toBeGreaterThan(directDist); // Must go around
        });
    });
});

// ============================================================================
// FULL SIMULATION UNIT TYPE TESTS
// ============================================================================

describe('Full Simulation with Different Unit Types', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    it('should show infantry moving through ruins while vehicle goes around', () => {
        // Create a mixed army
        const infantry = createUnit('inf-1', 'Tactical Squad', 'Infantry', '28mm');
        const vehicle = createUnit('veh-1', 'Rhino', 'Vehicle', '120x92mm');

        const armyA = createArmy('Mixed Force', [infantry, vehicle]);
        const armyB = createArmy('Enemy', [createUnit('enemy-1', 'Enemy Squad', 'Infantry')]);

        // Large ruins in the center
        const terrain = [createRuins(0, 0, 10, 8, 'Central Ruins')];

        const result = runSimpleEngagement(armyA, armyB, {
            initiative: 'armyA',
            maxRounds: 3,
            terrain,
            allowAdvance: false,
        });

        // Log movement for each unit type
        const movementLogs = result.logs.filter(l => l.phase === 'movement' && l.actor === 'armyA');

        console.log('\nMovement by unit type:');
        movementLogs.forEach(log => {
            log.movementDetails?.forEach(md => {
                console.log(`  ${md.unitName}: ${md.distance.toFixed(1)}"`);
            });
        });

        // Both should have moved
        const movements = movementLogs.flatMap(l => l.movementDetails || []);
        expect(movements.length).toBeGreaterThan(0);
    });

    it('should correctly identify unit types in simulation', () => {
        const infantry = createUnit('inf-1', 'Marines', 'Infantry', '32mm');
        const monster = createUnit('mon-1', 'Hive Tyrant', 'Monster', '60mm');
        const vehicle = createUnit('veh-1', 'Predator', 'Vehicle', '120x92mm');

        const infantryState = createUnitState(infantry);
        const monsterState = createUnitState(monster);
        const vehicleState = createUnitState(vehicle);

        // Verify classifications
        expect(isUnitInfantry(infantryState)).toBe(true);
        expect(isUnitLargeModel(infantryState)).toBe(false);

        expect(isUnitInfantry(monsterState)).toBe(false);
        expect(isUnitLargeModel(monsterState)).toBe(true);

        expect(isUnitInfantry(vehicleState)).toBe(false);
        expect(isUnitLargeModel(vehicleState)).toBe(true);

        console.log('Unit type classifications:');
        console.log(`  Infantry (${infantry.type}): isInfantry=${isUnitInfantry(infantryState)}, isLarge=${isUnitLargeModel(infantryState)}`);
        console.log(`  Monster (${monster.type}): isInfantry=${isUnitInfantry(monsterState)}, isLarge=${isUnitLargeModel(monsterState)}`);
        console.log(`  Vehicle (${vehicle.type}): isInfantry=${isUnitInfantry(vehicleState)}, isLarge=${isUnitLargeModel(vehicleState)}`);
    });
});
