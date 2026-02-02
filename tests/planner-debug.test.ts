/**
 * Deep debug test for understanding why units might not move
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    createRuins,
    createContainer,
    resetTerrainIdCounter,
    type Point,
} from '../src/simulation/terrain';
import {
    generateNavMesh,
    resetWaypointIdCounter,
} from '../src/simulation/pathfinding';
import { planGreedyMovement, getStrategyWeights } from '../src/simulation/planner';
import type { UnitState, ObjectiveMarker, ArmyState } from '../src/simulation/types';
import type { Unit } from '../src/types';

function createMockUnit(id: string, move: string = '6'): Unit {
    return {
        id,
        name: `Test Unit ${id}`,
        type: 'Infantry',
        points: 100,
        models: [{ name: 'Model', baseSize: '28mm' }],
        stats: { move, WS: '3+', BS: '4+', S: '4', T: '4', W: '1', A: '2', Ld: '8', Sv: '3+' },
        weapons: [
            {
                name: 'Bolter',
                characteristics: {
                    range: '24',
                    attacks: '2',
                    BS: '3+',
                    S: '4',
                    AP: '0',
                    D: '1'
                }
            }
        ],
        abilities: []
    };
}

function createMockUnitState(unit: Unit, x: number, y: number): UnitState {
    return {
        unit,
        position: { x, y },
        remainingModels: 5,
        inReserves: false,
        health: Array(5).fill(1),
        morale: 5,
        role: { primary: 'mobile-firepower', secondary: [] },
        objectiveControl: 2,
        wounded: false,
        chargeThisRound: false,
        meleeEngagements: [],
        closedDoors: []
    };
}

function createMockArmyState(units: UnitState[], tag: 'armyA' | 'armyB' = 'armyA'): ArmyState {
    return {
        units,
        armyName: `Test ${tag}`,
        totalObjectiveControl: units.reduce((sum, u) => sum + u.objectiveControl, 0),
        totalVP: 0,
        morale: 100,
        tag
    } as ArmyState;
}

describe('Movement Debug - Planner Candidate Analysis', () => {
    beforeEach(() => {
        resetTerrainIdCounter();
        resetWaypointIdCounter();
    });

    it('should analyze why units choose to hold vs move', () => {
        const unit1 = createMockUnit('unit-1', '6');
        const unit2 = createMockUnit('unit-2', '6');
        const unitState1 = createMockUnitState(unit1, -20, 0);  // Army A starting position
        const unitState2 = createMockUnitState(unit2, -20, -7.5);
        const activeArmy = createMockArmyState([unitState1, unitState2], 'armyA');

        const enemyUnit = createMockUnit('enemy-1', '6');
        const enemyState = createMockUnitState(enemyUnit, 20, 0);  // Army B at right side
        const opponentArmy = createMockArmyState([enemyState], 'armyB');

        // Create objectives in the center
        const objectives: ObjectiveMarker[] = [
            { x: 0, y: 0, id: 'center' },
            { x: 0, y: 15, id: 'top' },
            { x: 0, y: -15, id: 'bottom' },
        ];

        // Plan movement WITHOUT terrain
        const resultNoTerrain = planGreedyMovement(
            activeArmy,
            opponentArmy,
            objectives,
            false, // no advance
            44,
            60,
            getStrategyWeights('greedy'),
            [], // no terrain
            undefined
        );

        console.log('\n=== MOVEMENT PLANNING DEBUG (No Terrain) ===');
        resultNoTerrain.movements.forEach(m => {
            const distance = Math.sqrt(
                (m.to.x - m.unit.position.x) ** 2 +
                (m.to.y - m.unit.position.y) ** 2
            );
            console.log(`Unit ${m.unit.unit.id}: (${m.unit.position.x}, ${m.unit.position.y}) -> (${m.to.x}, ${m.to.y})`);
            console.log(`  Distance: ${distance.toFixed(2)}"`);
            console.log(`  Path: ${m.path?.length ?? 0} waypoints`);
        });

        // Now with blocking terrain
        const terrain = [createContainer(0, 0, true, 'Center Block')];
        const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

        const resultWithTerrain = planGreedyMovement(
            activeArmy,
            opponentArmy,
            objectives,
            false,
            44,
            60,
            getStrategyWeights('greedy'),
            terrain,
            navMesh
        );

        console.log('\n=== MOVEMENT PLANNING DEBUG (With Terrain) ===');
        resultWithTerrain.movements.forEach(m => {
            const distance = Math.sqrt(
                (m.to.x - m.unit.position.x) ** 2 +
                (m.to.y - m.unit.position.y) ** 2
            );
            console.log(`Unit ${m.unit.unit.id}: (${m.unit.position.x}, ${m.unit.position.y}) -> (${m.to.x}, ${m.to.y})`);
            console.log(`  Distance: ${distance.toFixed(2)}"`);
            console.log(`  Path: ${m.path?.length ?? 0} waypoints`);
        });

        // Units should move even with terrain
        const noTerrainDistances = resultNoTerrain.movements.map(m =>
            Math.sqrt((m.to.x - m.unit.position.x) ** 2 + (m.to.y - m.unit.position.y) ** 2)
        );
        const withTerrainDistances = resultWithTerrain.movements.map(m =>
            Math.sqrt((m.to.x - m.unit.position.x) ** 2 + (m.to.y - m.unit.position.y) ** 2)
        );

        console.log('\nNo terrain distances:', noTerrainDistances);
        console.log('With terrain distances:', withTerrainDistances);

        // Both scenarios should have SOME movement
        const anyNoTerrainMove = noTerrainDistances.some(d => d > 0.1);
        const anyWithTerrainMove = withTerrainDistances.some(d => d > 0.1);

        expect(anyNoTerrainMove).toBe(true); // Should move without terrain
        expect(anyWithTerrainMove).toBe(true); // Should also move with terrain
    });

    it('should verify units move toward objectives', () => {
        const unit = createMockUnit('test-unit', '6');
        const unitState = createMockUnitState(unit, -20, 0);
        const activeArmy = createMockArmyState([unitState], 'armyA');

        const enemyUnit = createMockUnit('enemy', '6');
        const enemyState = createMockUnitState(enemyUnit, 20, 0);
        const opponentArmy = createMockArmyState([enemyState], 'armyB');

        const objectives: ObjectiveMarker[] = [
            { x: 0, y: 0, id: 'center' }, // Closest objective
        ];

        // Objective-focused strategy should move toward objective
        const result = planGreedyMovement(
            activeArmy,
            opponentArmy,
            objectives,
            false,
            44,
            60,
            getStrategyWeights('objective-focused'),
            [],
            undefined
        );

        const movement = result.movements[0];
        const distanceMoved = Math.sqrt(
            (movement.to.x - unitState.position.x) ** 2 +
            (movement.to.y - unitState.position.y) ** 2
        );

        console.log(`\nObjective-focused movement: ${distanceMoved.toFixed(2)}"`);
        console.log(`From: (${unitState.position.x}, ${unitState.position.y})`);
        console.log(`To: (${movement.to.x}, ${movement.to.y})`);

        // Unit should move its full 6" toward the objective
        expect(distanceMoved).toBeGreaterThan(5);
        expect(movement.to.x).toBeGreaterThan(unitState.position.x); // Should move right (toward x=0)
    });

    it('should test with aggressive strategy', () => {
        const unit = createMockUnit('test-unit', '6');
        const unitState = createMockUnitState(unit, -20, 0);
        const activeArmy = createMockArmyState([unitState], 'armyA');

        const enemyUnit = createMockUnit('enemy', '6');
        const enemyState = createMockUnitState(enemyUnit, 20, 0);
        const opponentArmy = createMockArmyState([enemyState], 'armyB');

        const objectives: ObjectiveMarker[] = [];

        // Aggressive strategy should still try to move
        const result = planGreedyMovement(
            activeArmy,
            opponentArmy,
            objectives,
            false,
            44,
            60,
            getStrategyWeights('aggressive'),
            [],
            undefined
        );

        const movement = result.movements[0];
        const distanceMoved = Math.sqrt(
            (movement.to.x - unitState.position.x) ** 2 +
            (movement.to.y - unitState.position.y) ** 2
        );

        console.log(`\nAggressive movement (no objectives): ${distanceMoved.toFixed(2)}"`);
        console.log(`From: (${unitState.position.x}, ${unitState.position.y})`);
        console.log(`To: (${movement.to.x}, ${movement.to.y})`);

        // Even without objectives, aggressive strategy should probably move
        // But if it holds, that's a valid behavior - let's just verify the planner runs
        expect(result.movements.length).toBe(1);
    });
});
