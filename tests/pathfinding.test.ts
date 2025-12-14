import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateNavMesh,
  findPath,
  euclideanDistance,
  calculatePathDistance,
  getPointAlongPath,
  getMaxTravelPoint,
  resetWaypointIdCounter,
  type NavMesh,
  type PathResult,
} from '../src/simulation/pathfinding';
import {
  createRuins,
  createContainer,
  createWoods,
  createCrater,
  resetTerrainIdCounter,
  type TerrainFeature,
  type Point,
} from '../src/simulation/terrain';

describe('Pathfinding - Euclidean Distance', () => {
  it('should calculate correct distance for horizontal line', () => {
    const dist = euclideanDistance({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(dist).toBe(10);
  });

  it('should calculate correct distance for vertical line', () => {
    const dist = euclideanDistance({ x: 0, y: 0 }, { x: 0, y: 10 });
    expect(dist).toBe(10);
  });

  it('should calculate correct distance for diagonal', () => {
    const dist = euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 });
    expect(dist).toBe(5); // 3-4-5 triangle
  });

  it('should return 0 for same point', () => {
    const dist = euclideanDistance({ x: 5, y: 5 }, { x: 5, y: 5 });
    expect(dist).toBe(0);
  });
});

describe('Pathfinding - NavMesh Generation', () => {
  beforeEach(() => {
    resetWaypointIdCounter();
    resetTerrainIdCounter();
  });

  it('should create navmesh with correct bounds', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    expect(navMesh.bounds.minX).toBe(-22);
    expect(navMesh.bounds.maxX).toBe(22);
    expect(navMesh.bounds.minY).toBe(-30);
    expect(navMesh.bounds.maxY).toBe(30);
  });

  it('should create waypoints for blocking terrain corners', () => {
    const container = createContainer(0, 0, true);
    const terrain = [container];

    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    // Should have corner waypoints for the container
    const cornerWaypoints = Array.from(navMesh.waypoints.values())
      .filter(wp => wp.isCorner && wp.terrainId === container.id);

    expect(cornerWaypoints.length).toBe(4); // 4 corners
  });

  it('should add edge waypoints for navigation', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    // Should have edge waypoints
    expect(navMesh.waypoints.size).toBeGreaterThan(0);
  });

  it('should connect waypoints that have clear paths', () => {
    const container = createContainer(0, 0, true);
    const terrain = [container];

    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    // Each corner waypoint should have connections
    for (const wp of navMesh.waypoints.values()) {
      if (wp.isCorner) {
        expect(wp.connections.length).toBeGreaterThan(0);
      }
    }
  });

  it('should store terrain reference', () => {
    const ruins = createRuins(0, 0);
    const terrain = [ruins];

    const navMesh = generateNavMesh(terrain, 44, 60);

    expect(navMesh.terrain).toBe(terrain);
  });
});

describe('Pathfinding - Find Path (No Terrain)', () => {
  beforeEach(() => {
    resetWaypointIdCounter();
    resetTerrainIdCounter();
  });

  it('should find direct path when no terrain', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.path.length).toBe(2); // Just start and end
    expect(result.distance).toBeCloseTo(20);
  });

  it('should return correct path for diagonal movement', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.distance).toBeCloseTo(5);
  });
});

describe('Pathfinding - Find Path (With Terrain)', () => {
  beforeEach(() => {
    resetWaypointIdCounter();
    resetTerrainIdCounter();
  });

  it('should find path around impassable terrain', () => {
    const container = createContainer(0, 0, true);
    const terrain = [container];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    // Path should be longer than direct distance since it goes around
    expect(result.distance).toBeGreaterThan(20);
    // Path should have more than 2 points (has intermediate waypoints)
    expect(result.path.length).toBeGreaterThanOrEqual(2);
  });

  it('should calculate movement penalty for difficult terrain', () => {
    const woods = createWoods(0, 0, 6, 6);
    const terrain = [woods];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.movementPenalty).toBe(2); // -2" for difficult ground
  });

  it('should find path between points on same side of terrain', () => {
    const container = createContainer(0, 0, true);
    const terrain = [container];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    // Both points on left side - should be direct
    const result = findPath(
      { x: -15, y: 5 },
      { x: -15, y: -5 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.distance).toBeCloseTo(10);
  });

  it('should handle multiple terrain pieces', () => {
    const container1 = createContainer(-5, 0, true);
    const container2 = createContainer(5, 0, true);
    const terrain = [container1, container2];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    const result = findPath(
      { x: -15, y: 0 },
      { x: 15, y: 0 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    // Should find path between or around the containers
    expect(result.distance).toBeGreaterThan(30); // Longer than direct due to obstacles
  });
});

describe('Pathfinding - Path Distance Calculation', () => {
  it('should calculate distance for simple path', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    expect(calculatePathDistance(path)).toBe(10);
  });

  it('should calculate distance for multi-segment path', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 4 },
    ];

    expect(calculatePathDistance(path)).toBe(7); // 3 + 4
  });

  it('should return 0 for single point path', () => {
    const path: Point[] = [{ x: 0, y: 0 }];
    expect(calculatePathDistance(path)).toBe(0);
  });

  it('should return 0 for empty path', () => {
    const path: Point[] = [];
    expect(calculatePathDistance(path)).toBe(0);
  });
});

describe('Pathfinding - Get Point Along Path', () => {
  it('should return start point for distance 0', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    const point = getPointAlongPath(path, 0);
    expect(point.x).toBe(0);
    expect(point.y).toBe(0);
  });

  it('should return end point for distance >= path length', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    const point = getPointAlongPath(path, 15);
    expect(point.x).toBe(10);
    expect(point.y).toBe(0);
  });

  it('should interpolate along single segment', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    const point = getPointAlongPath(path, 5);
    expect(point.x).toBeCloseTo(5);
    expect(point.y).toBeCloseTo(0);
  });

  it('should interpolate across multiple segments', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];

    // 15 inches along path = 10 + 5 = (10, 5)
    const point = getPointAlongPath(path, 15);
    expect(point.x).toBeCloseTo(10);
    expect(point.y).toBeCloseTo(5);
  });

  it('should handle diagonal segments', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 3, y: 4 }, // 5 inch diagonal
    ];

    const point = getPointAlongPath(path, 2.5);
    expect(point.x).toBeCloseTo(1.5);
    expect(point.y).toBeCloseTo(2);
  });
});

describe('Pathfinding - Get Max Travel Point', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
  });

  it('should return end of path if within movement allowance', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
    ];
    const terrain: TerrainFeature[] = [];

    const result = getMaxTravelPoint(path, 10, terrain);

    expect(result.point.x).toBe(5);
    expect(result.point.y).toBe(0);
    expect(result.distanceTraveled).toBeCloseTo(5);
  });

  it('should stop at movement allowance if path is longer', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
    ];
    const terrain: TerrainFeature[] = [];

    const result = getMaxTravelPoint(path, 6, terrain);

    expect(result.point.x).toBeCloseTo(6);
    expect(result.point.y).toBe(0);
    expect(result.distanceTraveled).toBeCloseTo(6);
  });

  it('should account for movement penalty when calculating distance', () => {
    const woods = createWoods(5, 0, 4, 4);
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const terrain = [woods];

    const result = getMaxTravelPoint(path, 6, terrain);

    // With 2" penalty for difficult terrain, 6" movement allowance
    // should only get about 4" of actual movement
    expect(result.distanceTraveled).toBeLessThan(6);
  });

  it('should return path index correctly', () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
    ];
    const terrain: TerrainFeature[] = [];

    const result = getMaxTravelPoint(path, 7, terrain);

    expect(result.pathIndex).toBe(1); // Should be on second segment (5-10)
  });
});

describe('Pathfinding - Infantry vs Vehicle Movement', () => {
  beforeEach(() => {
    resetWaypointIdCounter();
    resetTerrainIdCounter();
  });

  it('should allow infantry through breachable terrain', () => {
    const ruins = createRuins(0, 0, 6, 6);
    const terrain = [ruins];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain,
      true,  // isInfantry
      false  // isLargeModel
    );

    expect(result.found).toBe(true);
    // Infantry can go through breachable ruins, so path is direct
    expect(result.distance).toBeCloseTo(20);
  });

  it('should block vehicle through breachable terrain', () => {
    const ruins = createRuins(0, 0, 6, 6);
    const terrain = [ruins];
    const navMesh = generateNavMesh(terrain, 44, 60, 1.5);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain,
      false, // not infantry
      false
    );

    // Vehicle should need to go around
    expect(result.found).toBe(true);
    expect(result.distance).toBeGreaterThan(20);
  });
});

describe('Pathfinding - Edge Cases', () => {
  beforeEach(() => {
    resetWaypointIdCounter();
    resetTerrainIdCounter();
  });

  it('should handle empty terrain array', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: -10, y: 0 },
      { x: 10, y: 0 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.distance).toBeCloseTo(20);
  });

  it('should handle start and end at same point', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.distance).toBe(0);
  });

  it('should handle path near battlefield edge', () => {
    const terrain: TerrainFeature[] = [];
    const navMesh = generateNavMesh(terrain, 44, 60);

    const result = findPath(
      { x: -20, y: 25 },
      { x: 20, y: 25 },
      navMesh,
      terrain
    );

    expect(result.found).toBe(true);
    expect(result.distance).toBeCloseTo(40);
  });
});
