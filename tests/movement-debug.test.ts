/**
 * Debug tests for movement and terrain issues
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { runSimpleEngagement } from '../src/simulation';
import {
  createRuins,
  createContainer,
  resetTerrainIdCounter,
  isMovementBlocked,
  isPositionBlockedByTerrain,
  type Point,
} from '../src/simulation/terrain';
import {
  generateNavMesh,
  findPath,
  resetWaypointIdCounter,
} from '../src/simulation/pathfinding';
import { planGreedyMovement, getStrategyWeights, isUnitInfantry, isUnitLargeModel, getUnitBaseRadius } from '../src/simulation/planner';
import type { Army } from '../src/types';
import type { UnitState, ObjectiveMarker } from '../src/simulation/types';

// Helper: Create test army
function createTestArmy(name: string, unitCount: number = 2): Army {
  const units = [];
  for (let i = 0; i < unitCount; i++) {
    units.push({
      id: `${name}-unit-${i}`,
      name: `${name} Squad ${i + 1}`,
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
          id: `weapon-${i}`,
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
    });
  }

  return {
    armyName: name,
    faction: 'Test Faction',
    pointsTotal: unitCount * 100,
    units,
    rules: {},
    abilities: {},
  };
}

describe('Movement Debug - Core Terrain Blocking', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
    resetWaypointIdCounter();
  });

  it('should correctly detect when a path crosses impassable terrain', () => {
    const container = createContainer(0, 0, true); // 6x3 at origin
    const terrain = [container];

    // Direct path through the container
    const from: Point = { x: -10, y: 0 };
    const to: Point = { x: 10, y: 0 };

    const result = isMovementBlocked(from, to, terrain, true, false, 0);
    console.log('Path through container (no base radius):', result);
    expect(result.blocked).toBe(true);
    expect(result.blockedBy?.name).toBe('Container');
  });

  it('should correctly detect when a path with base radius crosses terrain', () => {
    const container = createContainer(0, 0, true); // 6x3 at origin
    const terrain = [container];

    // Path that goes near but not through the container
    const from: Point = { x: -10, y: 3 }; // Just above container (container is 3" wide on y-axis, centered at 0)
    const to: Point = { x: 10, y: 3 };

    // Without base radius - should be clear
    const resultNoBase = isMovementBlocked(from, to, terrain, true, false, 0);
    console.log('Path near container (no base):', resultNoBase);

    // With 1" base radius - should now be blocked (path goes within 1" of container edge)
    const resultWithBase = isMovementBlocked(from, to, terrain, true, false, 1);
    console.log('Path near container (1" base):', resultWithBase);

    // The container is at y=0, height=3, so top edge is at y=1.5
    // Path is at y=3, which is 1.5" from container edge
    // With 1" base radius, this should still be clear
    expect(resultWithBase.blocked).toBe(false);

    // Now try a path that's too close
    const closeFrom: Point = { x: -10, y: 2 };
    const closeTo: Point = { x: 10, y: 2 };
    const resultTooClose = isMovementBlocked(closeFrom, closeTo, terrain, true, false, 1);
    console.log('Path very near container (1" base, y=2):', resultTooClose);
    expect(resultTooClose.blocked).toBe(true);
  });

  it('should allow infantry through breachable terrain', () => {
    const ruins = createRuins(0, 0, 6, 6); // breachable, obscuring
    const terrain = [ruins];

    const from: Point = { x: -10, y: 0 };
    const to: Point = { x: 10, y: 0 };

    // Infantry with breachable trait - should pass through
    const resultInfantry = isMovementBlocked(from, to, terrain, true, false, 0);
    console.log('Infantry through breachable ruins:', resultInfantry);
    expect(resultInfantry.blocked).toBe(false);

    // Non-infantry - should be blocked by obscuring trait
    const resultVehicle = isMovementBlocked(from, to, terrain, false, false, 0);
    console.log('Vehicle through breachable ruins:', resultVehicle);
    expect(resultVehicle.blocked).toBe(true);
  });
});

describe('Movement Debug - Pathfinding Integration', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
    resetWaypointIdCounter();
  });

  it('should find path around impassable terrain', () => {
    const container = createContainer(0, 0, true);
    const terrain = [container];
    const navMesh = generateNavMesh(terrain, 48, 60, 1.5);

    const from: Point = { x: -10, y: 0 };
    const to: Point = { x: 10, y: 0 };

    const result = findPath(from, to, navMesh, terrain, true, false, 0.5);
    console.log('Pathfinding around container:', {
      found: result.found,
      pathLength: result.path.length,
      distance: result.distance,
      directDistance: 20,
    });

    expect(result.found).toBe(true);
    expect(result.distance).toBeGreaterThan(20); // Should be longer than direct path
    expect(result.path.length).toBeGreaterThan(2); // Should have intermediate waypoints
  });

  it('should find direct path when terrain is passable for unit type', () => {
    const ruins = createRuins(0, 0, 6, 6); // breachable
    const terrain = [ruins];
    const navMesh = generateNavMesh(terrain, 48, 60, 1.5);

    const from: Point = { x: -10, y: 0 };
    const to: Point = { x: 10, y: 0 };

    // Infantry can go through breachable ruins
    const result = findPath(from, to, navMesh, terrain, true, false, 0.5);
    console.log('Infantry path through ruins:', {
      found: result.found,
      distance: result.distance,
      pathLength: result.path.length,
    });

    expect(result.found).toBe(true);
    expect(result.distance).toBeCloseTo(20, 0); // Should be direct
  });
});

describe('Movement Debug - Full Simulation Movement', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
  });

  it('should show units actually moving during simulation', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain: [],
      allowAdvance: true,
    });

    // Check movement logs for actual movement
    const movementLogs = result.logs.filter(log => log.phase === 'movement');
    console.log('Movement logs:', movementLogs.map(log => ({
      description: log.description,
      movementCount: log.movementDetails?.length ?? 0,
    })));

    // There should be movement phases with movement details
    const hasMovement = movementLogs.some(log => 
      log.movementDetails && log.movementDetails.length > 0
    );
    
    if (!hasMovement) {
      console.warn('No movement details found in logs!');
    }

    // Check position changes
    const startPositions = result.positions.start;
    const endPositions = result.positions.end;

    console.log('Start positions A:', startPositions.armyA);
    console.log('End positions A:', endPositions.armyA);

    // Positions should have changed
    const positionChanged = startPositions.armyA.some((start, i) => {
      const end = endPositions.armyA[i];
      return start.x !== end.x || start.y !== end.y;
    });

    expect(positionChanged).toBe(true);
  });

  it('should show units avoiding terrain during simulation', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    // Large blocking terrain in center
    const terrain = [createContainer(0, 0, true, 'Center Block')];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain,
      allowAdvance: true,
    });

    // Check final positions - units should not be inside terrain
    const finalPositions = result.positions.end;
    const containerBounds = {
      minX: -3, maxX: 3,  // 6" wide container
      minY: -1.5, maxY: 1.5, // 3" tall container
    };

    console.log('Final positions A:', finalPositions.armyA);
    console.log('Final positions B:', finalPositions.armyB);

    const allUnits = [...finalPositions.armyA, ...finalPositions.armyB];
    allUnits.forEach(unit => {
      const isInsideTerrain = 
        unit.x >= containerBounds.minX && unit.x <= containerBounds.maxX &&
        unit.y >= containerBounds.minY && unit.y <= containerBounds.maxY;
      
      expect(isInsideTerrain).toBe(false);
    });

    // Check movement log for path information
    const movementLogs = result.logs.filter(log => 
      log.phase === 'movement' && 
      log.movementDetails && 
      log.movementDetails.length > 0
    );

    console.log('Movement details:', movementLogs.flatMap(log => 
      log.movementDetails?.map(m => ({
        unit: m.unitName,
        from: m.from,
        to: m.to,
        distance: m.distance,
      }))
    ));
  });

  it('should track why units might not be moving', () => {
    const armyA = createTestArmy('Army A', 1);
    const armyB = createTestArmy('Army B', 1);

    const terrain = [createContainer(0, 0, true)];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain,
      allowAdvance: false,
    });

    // Log all phases to understand flow
    result.logs.forEach(log => {
      console.log(`Phase: ${log.phase}, Turn: ${log.turn}, Actor: ${log.actor}`);
      console.log(`  Description: ${log.description}`);
      if (log.movementDetails) {
        console.log(`  Movements: ${log.movementDetails.length}`);
        log.movementDetails.forEach(m => {
          console.log(`    ${m.unitName}: (${m.from.x.toFixed(1)}, ${m.from.y.toFixed(1)}) -> (${m.to.x.toFixed(1)}, ${m.to.y.toFixed(1)}) = ${m.distance.toFixed(1)}"`);
        });
      }
    });
  });
});
