import { describe, it, expect } from 'vitest';
import { generateNavMesh, NavMeshSet } from '../src/simulation/planner';
import { findPath } from '../src/simulation/pathfinding';
import { createRuins } from '../src/simulation/terrain';
import { TerrainFeature } from '../src/simulation/terrain';

describe('NavMesh - Unit Type Specific Pathfinding', () => {
    // Setup: Large Ruin in the center blocking the path
    // Unit at (0, 10), Target at (0, -10)
    // Ruin at (0, 0), Size 10x4
    const ruin = createRuins(0, 0, 10, 4);
    const terrain: TerrainFeature[] = [ruin];

    const width = 48;
    const height = 48;

    // Generate BOTH meshes
    const defaultMesh = generateNavMesh(terrain, width, height);
    const infantryMesh = generateNavMesh(terrain, width, height, 1.5, ['breachable']);

    const navMeshSet: NavMeshSet = {
        default: defaultMesh,
        infantry: infantryMesh
    };

    const start = { x: 0, y: 10 };
    const end = { x: 0, y: -10 };

    it('should force Vehicles to path AROUND the ruin (blocked by default mesh)', () => {
        // Vehicles use default mesh
        const result = findPath(start, end, defaultMesh, terrain, false, true, 2.5); // isInfantry=false

        // Direct path distance is 20
        const directDist = 20;

        expect(result.found).toBe(true);
        // Path should be significantly longer than direct, because it goes around
        // 10 wide ruin means at least 5 units lateral + clearance
        expect(result.distance).toBeGreaterThan(directDist + 5);

        // Check path points - should not go through (0,0)
        // We expect points with X deviation
        const xDeviation = result.path.some(p => Math.abs(p.x) > 4);
        expect(xDeviation).toBe(true);
    });

    it('should allow Infantry to path THROUGH the ruin (using infantry mesh)', () => {
        // Infantry use infantry mesh
        // Note: findPath itself doesn't select mesh, we must pass the right one
        const result = findPath(start, end, infantryMesh, terrain, true, false, 1.0); // isInfantry=true

        const directDist = 20;

        expect(result.found).toBe(true);

        // Path includes movement penalty through ruins, but geometric length is close to direct
        // findPath returns 'distance' which includes penalty? 
        // Let's check findPath implementation. It returns { distance: number, movementPenalty: number }
        // distance is usually geometric distance. 
        // Wait, pathDistance in planner.ts ADDS penalty.
        // findPath's distance property is GEOMETRIC distance of the path.

        expect(result.distance).toBeLessThan(directDist + 2); // Allow slight deviation for waypoints

        // Should NOT deviate significantly in X
        const xDeviation = result.path.some(p => Math.abs(p.x) > 4);
        expect(xDeviation).toBe(false);
    });
});
