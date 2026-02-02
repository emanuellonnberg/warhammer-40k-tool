/**
 * Pathfinding system for Warhammer 40K simulation
 * Implements A* pathfinding with navigation mesh generation
 * for movement around terrain obstacles.
 */

import {
  TerrainFeature,
  Point,
  BoundingBox,
  getTerrainBounds,
  lineIntersectsTerrain,
  pointInTerrain,
  isMovementBlocked,
  getMovementPenalty,
  isPositionBlockedByTerrain,
} from './terrain';

// ============================================================================
// NAVIGATION MESH TYPES
// ============================================================================

/**
 * A waypoint in the navigation mesh
 */
export interface NavWaypoint {
  id: string;
  x: number;
  y: number;
  /** IDs of connected waypoints */
  connections: string[];
  /** Distance to each connected waypoint */
  distances: Map<string, number>;
  /** Whether this waypoint is at a terrain corner */
  isCorner: boolean;
  /** Terrain feature this waypoint is associated with (if corner) */
  terrainId?: string;
}

/**
 * Complete navigation mesh for a battlefield
 */
export interface NavMesh {
  waypoints: Map<string, NavWaypoint>;
  /** Bounding box of the battlefield */
  bounds: BoundingBox;
  /** Terrain features used to generate this mesh */
  terrain: TerrainFeature[];
  /** Clearance margin around obstacles */
  clearance: number;
}

/**
 * Result of a pathfinding query
 */
export interface PathResult {
  /** Whether a path was found */
  found: boolean;
  /** Ordered list of points to follow */
  path: Point[];
  /** Total path distance in inches */
  distance: number;
  /** Terrain features the path goes through (for difficult ground) */
  terrainCrossed: TerrainFeature[];
  /** Movement penalty from difficult terrain */
  movementPenalty: number;
}

// ============================================================================
// NAVIGATION MESH GENERATION
// ============================================================================

let waypointIdCounter = 0;

function generateWaypointId(): string {
  return `wp_${++waypointIdCounter}`;
}

/**
 * Reset waypoint ID counter (for testing)
 */
export function resetWaypointIdCounter(): void {
  waypointIdCounter = 0;
}

/**
 * Calculate Euclidean distance between two points
 */
export function euclideanDistance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Generate corner waypoints for a terrain feature
 * Adds clearance margin to allow units to navigate around
 */
function generateCornerWaypoints(
  terrain: TerrainFeature,
  clearance: number,
  ignoreTraits: string[] = []
): NavWaypoint[] {
  // Check if ignored
  if (ignoreTraits.length > 0 && ignoreTraits.some(tr => (terrain.traits as any)[tr])) {
    return [];
  }
  const waypoints: NavWaypoint[] = [];
  const bounds = getTerrainBounds(terrain);

  // For impassable terrain, create corner waypoints
  if (terrain.impassable || terrain.traits.obscuring) {
    const margin = clearance + 0.5; // Extra margin for safety

    // Four corners with clearance
    const corners = [
      { x: bounds.minX - margin, y: bounds.minY - margin }, // SW
      { x: bounds.maxX + margin, y: bounds.minY - margin }, // SE
      { x: bounds.maxX + margin, y: bounds.maxY + margin }, // NE
      { x: bounds.minX - margin, y: bounds.maxY + margin }, // NW
    ];

    for (const corner of corners) {
      waypoints.push({
        id: generateWaypointId(),
        x: corner.x,
        y: corner.y,
        connections: [],
        distances: new Map(),
        isCorner: true,
        terrainId: terrain.id,
      });
    }
  }

  return waypoints;
}

/**
 * Check if a straight line between two waypoints is clear of obstacles
 */
function isConnectionClear(
  from: Point,
  to: Point,
  terrain: TerrainFeature[],
  clearance: number,
  ignoreTraits: string[] = []
): boolean {
  for (const t of terrain) {
    if (ignoreTraits.length > 0 && ignoreTraits.some(tr => (t.traits as any)[tr])) continue;
    // Only check blocking terrain
    if (!t.impassable && !t.traits.obscuring) continue;

    // Expand bounds by clearance
    const expandedTerrain = {
      ...t,
      width: t.width + clearance * 2,
      height: t.height + clearance * 2,
      radius: t.radius ? t.radius + clearance : undefined,
    };

    if (lineIntersectsTerrain(from, to, expandedTerrain)) {
      return false;
    }
  }
  return true;
}

/**
 * Generate a navigation mesh from terrain features
 */
export function generateNavMesh(
  terrain: TerrainFeature[],
  battlefieldWidth: number,
  battlefieldHeight: number,
  clearance: number = 1.5, // Default 1.5" clearance for base sizes
  ignoreTraits: string[] = []
): NavMesh {
  const bounds: BoundingBox = {
    minX: -battlefieldWidth / 2,
    maxX: battlefieldWidth / 2,
    minY: -battlefieldHeight / 2,
    maxY: battlefieldHeight / 2,
  };

  const waypointsArray: NavWaypoint[] = [];

  // Generate corner waypoints for each terrain feature
  for (const t of terrain) {
    const corners = generateCornerWaypoints(t, clearance, ignoreTraits);

    // Filter out waypoints outside battlefield or inside other terrain
    for (const wp of corners) {
      if (wp.x < bounds.minX || wp.x > bounds.maxX) continue;
      if (wp.y < bounds.minY || wp.y > bounds.maxY) continue;

      // Check if inside another terrain feature
      let insideTerrain = false;
      for (const other of terrain) {
        if (other.id === t.id) continue;
        if (pointInTerrain({ x: wp.x, y: wp.y }, other)) {
          if (ignoreTraits.length > 0 && ignoreTraits.some(tr => (other.traits as any)[tr])) continue;
          insideTerrain = true;
          break;
        }
      }
      if (insideTerrain) continue;

      waypointsArray.push(wp);
    }
  }

  // Add edge waypoints for battlefield boundaries (useful for long paths)
  const edgeSpacing = 12; // Every 12 inches
  for (let x = bounds.minX + edgeSpacing; x < bounds.maxX; x += edgeSpacing) {
    waypointsArray.push({
      id: generateWaypointId(),
      x,
      y: bounds.minY + clearance,
      connections: [],
      distances: new Map(),
      isCorner: false,
    });
    waypointsArray.push({
      id: generateWaypointId(),
      x,
      y: bounds.maxY - clearance,
      connections: [],
      distances: new Map(),
      isCorner: false,
    });
  }

  // Build connections between waypoints
  for (let i = 0; i < waypointsArray.length; i++) {
    for (let j = i + 1; j < waypointsArray.length; j++) {
      const wpA = waypointsArray[i];
      const wpB = waypointsArray[j];

      // Check if connection is clear
      if (isConnectionClear({ x: wpA.x, y: wpA.y }, { x: wpB.x, y: wpB.y }, terrain, clearance / 2, ignoreTraits)) {
        const dist = euclideanDistance({ x: wpA.x, y: wpA.y }, { x: wpB.x, y: wpB.y });

        // Only connect if reasonably close (avoid very long connections)
        if (dist <= 30) {
          wpA.connections.push(wpB.id);
          wpA.distances.set(wpB.id, dist);
          wpB.connections.push(wpA.id);
          wpB.distances.set(wpA.id, dist);
        }
      }
    }
  }

  // Convert to Map
  const waypoints = new Map<string, NavWaypoint>();
  for (const wp of waypointsArray) {
    waypoints.set(wp.id, wp);
  }

  return {
    waypoints,
    bounds,
    terrain,
    clearance,
  };
}

// ============================================================================
// A* PATHFINDING
// ============================================================================

interface AStarNode {
  waypoint: NavWaypoint;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // g + h
  parent: AStarNode | null;
}

/**
 * Find a path between two points using A* algorithm
 * Now supports base radius for more accurate collision detection
 */
export function findPath(
  from: Point,
  to: Point,
  navMesh: NavMesh,
  terrain: TerrainFeature[],
  isInfantry: boolean = true,
  isLargeModel: boolean = false,
  baseRadius: number = 0
): PathResult {
  // First, check if direct path is possible
  const directBlocked = isMovementBlocked(from, to, terrain, isInfantry, isLargeModel, baseRadius);
  if (!directBlocked.blocked) {
    const directDist = euclideanDistance(from, to);
    const penalty = getMovementPenalty(from, to, terrain);
    return {
      found: true,
      path: [from, to],
      distance: directDist,
      terrainCrossed: [],
      movementPenalty: penalty,
    };
  }

  // Need to pathfind through NavMesh
  // Find nearest accessible waypoints to start and end
  const startWaypoints = findNearestAccessibleWaypoints(from, navMesh, terrain, 3, isInfantry, isLargeModel, baseRadius);
  const endWaypoints = findNearestAccessibleWaypoints(to, navMesh, terrain, 3, isInfantry, isLargeModel, baseRadius);

  if (startWaypoints.length === 0 || endWaypoints.length === 0) {
    // No accessible waypoints - return direct path (will be blocked but that's the best we can do)
    return {
      found: false,
      path: [from, to],
      distance: euclideanDistance(from, to),
      terrainCrossed: [],
      movementPenalty: 0,
    };
  }

  // Try A* from each start waypoint to each end waypoint
  let bestPath: Point[] | null = null;
  let bestDistance = Infinity;

  for (const startWp of startWaypoints) {
    for (const endWp of endWaypoints) {
      const result = aStarSearch(startWp, endWp, navMesh, to);

      if (result) {
        // Calculate total distance including start->firstWP and lastWP->end
        const startDist = euclideanDistance(from, { x: startWp.x, y: startWp.y });
        const endDist = euclideanDistance({ x: endWp.x, y: endWp.y }, to);
        const totalDist = startDist + result.distance + endDist;

        if (totalDist < bestDistance) {
          bestDistance = totalDist;
          bestPath = [from, ...result.path, to];
        }
      }
    }
  }

  if (bestPath) {
    // Calculate terrain crossed and penalties
    const terrainCrossed: TerrainFeature[] = [];
    let movementPenalty = 0;

    for (let i = 0; i < bestPath.length - 1; i++) {
      const penalty = getMovementPenalty(bestPath[i], bestPath[i + 1], terrain);
      movementPenalty += penalty;
    }

    return {
      found: true,
      path: bestPath,
      distance: bestDistance,
      terrainCrossed,
      movementPenalty,
    };
  }

  // No path found
  return {
    found: false,
    path: [from, to],
    distance: euclideanDistance(from, to),
    terrainCrossed: [],
    movementPenalty: 0,
  };
}

/**
 * Find nearest waypoints that can be accessed from a point
 * Now accepts unit type and base radius for accurate collision detection
 */
function findNearestAccessibleWaypoints(
  point: Point,
  navMesh: NavMesh,
  terrain: TerrainFeature[],
  count: number,
  isInfantry: boolean = true,
  isLargeModel: boolean = false,
  baseRadius: number = 0
): NavWaypoint[] {
  const candidates: { waypoint: NavWaypoint; distance: number }[] = [];

  for (const wp of navMesh.waypoints.values()) {
    // Check if the waypoint itself is accessible (not too close to terrain for this base size)
    // Use isPositionBlockedByTerrain which properly handles:
    // - Actual terrain shapes (circle vs rectangle)
    // - Infantry-only terrain
    // - Large model blocking terrain
    const wpBlocked = isPositionBlockedByTerrain(
      { x: wp.x, y: wp.y },
      baseRadius,
      terrain,
      isInfantry,
      isLargeModel
    );

    if (wpBlocked.blocked) continue;

    // Check if we can reach this waypoint directly
    const blocked = isMovementBlocked(point, { x: wp.x, y: wp.y }, terrain, isInfantry, isLargeModel, baseRadius);
    if (!blocked.blocked) {
      candidates.push({
        waypoint: wp,
        distance: euclideanDistance(point, { x: wp.x, y: wp.y }),
      });
    }
  }

  // Sort by distance and return top N
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates.slice(0, count).map(c => c.waypoint);
}

/**
 * A* search between two waypoints
 */
function aStarSearch(
  start: NavWaypoint,
  goal: NavWaypoint,
  navMesh: NavMesh,
  finalGoal: Point
): { path: Point[]; distance: number } | null {
  const openSet = new Map<string, AStarNode>();
  const closedSet = new Set<string>();

  const startNode: AStarNode = {
    waypoint: start,
    g: 0,
    h: euclideanDistance({ x: start.x, y: start.y }, { x: goal.x, y: goal.y }),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.g + startNode.h;

  openSet.set(start.id, startNode);

  while (openSet.size > 0) {
    // Find node with lowest f score
    let current: AStarNode | null = null;
    let lowestF = Infinity;

    for (const node of openSet.values()) {
      if (node.f < lowestF) {
        lowestF = node.f;
        current = node;
      }
    }

    if (!current) break;

    // Check if we reached the goal
    if (current.waypoint.id === goal.id) {
      return reconstructPath(current);
    }

    // Move current from open to closed
    openSet.delete(current.waypoint.id);
    closedSet.add(current.waypoint.id);

    // Explore neighbors
    for (const neighborId of current.waypoint.connections) {
      if (closedSet.has(neighborId)) continue;

      const neighbor = navMesh.waypoints.get(neighborId);
      if (!neighbor) continue;

      const edgeCost = current.waypoint.distances.get(neighborId) ||
        euclideanDistance({ x: current.waypoint.x, y: current.waypoint.y },
          { x: neighbor.x, y: neighbor.y });
      const tentativeG = current.g + edgeCost;

      const existingNode = openSet.get(neighborId);
      if (!existingNode || tentativeG < existingNode.g) {
        const h = euclideanDistance({ x: neighbor.x, y: neighbor.y }, finalGoal);
        const newNode: AStarNode = {
          waypoint: neighbor,
          g: tentativeG,
          h,
          f: tentativeG + h,
          parent: current,
        };
        openSet.set(neighborId, newNode);
      }
    }
  }

  // No path found
  return null;
}

/**
 * Reconstruct path from A* result
 */
function reconstructPath(node: AStarNode): { path: Point[]; distance: number } {
  const path: Point[] = [];
  let current: AStarNode | null = node;

  while (current) {
    path.unshift({ x: current.waypoint.x, y: current.waypoint.y });
    current = current.parent;
  }

  return {
    path,
    distance: node.g,
  };
}

// ============================================================================
// PATH UTILITIES
// ============================================================================

/**
 * Calculate total distance of a path
 */
export function calculatePathDistance(path: Point[]): number {
  let distance = 0;
  for (let i = 0; i < path.length - 1; i++) {
    distance += euclideanDistance(path[i], path[i + 1]);
  }
  return distance;
}

/**
 * Get the point along a path at a specific distance from the start
 */
export function getPointAlongPath(path: Point[], distance: number): Point {
  if (path.length === 0) return { x: 0, y: 0 };
  if (path.length === 1) return path[0];
  if (distance <= 0) return path[0];

  let traveled = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const segmentDist = euclideanDistance(path[i], path[i + 1]);

    if (traveled + segmentDist >= distance) {
      // Interpolate along this segment
      const remaining = distance - traveled;
      const t = remaining / segmentDist;
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * t,
        y: path[i].y + (path[i + 1].y - path[i].y) * t,
      };
    }

    traveled += segmentDist;
  }

  // Distance exceeds path length - return end point
  return path[path.length - 1];
}

/**
 * Simplify a path by removing unnecessary intermediate points
 * Uses Douglas-Peucker algorithm
 */
export function simplifyPath(
  path: Point[],
  terrain: TerrainFeature[],
  epsilon: number = 0.5
): Point[] {
  if (path.length <= 2) return path;

  // Find point with maximum distance from line between first and last
  let maxDist = 0;
  let maxIndex = 0;

  const first = path[0];
  const last = path[path.length - 1];

  for (let i = 1; i < path.length - 1; i++) {
    const dist = perpendicularDistance(path[i], first, last);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    const left = simplifyPath(path.slice(0, maxIndex + 1), terrain, epsilon);
    const right = simplifyPath(path.slice(maxIndex), terrain, epsilon);
    return [...left.slice(0, -1), ...right];
  }

  // Check if we can directly connect first to last
  const blocked = isMovementBlocked(first, last, terrain, true, false);
  if (!blocked.blocked) {
    return [first, last];
  }

  // Keep the path as-is if simplification would cause blocking
  return path;
}

/**
 * Calculate perpendicular distance from a point to a line segment
 */
function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;

  if (dx === 0 && dy === 0) {
    return euclideanDistance(point, lineStart);
  }

  const t = Math.max(0, Math.min(1,
    ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy)
  ));

  const projection = {
    x: lineStart.x + t * dx,
    y: lineStart.y + t * dy,
  };

  return euclideanDistance(point, projection);
}

/**
 * Calculate the effective movement distance needed to travel a path,
 * accounting for difficult terrain penalties
 */
export function getEffectivePathDistance(
  path: Point[],
  terrain: TerrainFeature[]
): number {
  let distance = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const segmentDist = euclideanDistance(path[i], path[i + 1]);
    const penalty = getMovementPenalty(path[i], path[i + 1], terrain);
    distance += segmentDist + penalty;
  }

  return distance;
}

/**
 * Find how far along a path a unit can travel with a given movement allowance
 */
export function getMaxTravelPoint(
  path: Point[],
  movementAllowance: number,
  terrain: TerrainFeature[]
): { point: Point; distanceTraveled: number; pathIndex: number } {
  if (path.length === 0) {
    return { point: { x: 0, y: 0 }, distanceTraveled: 0, pathIndex: 0 };
  }
  if (path.length === 1) {
    return { point: path[0], distanceTraveled: 0, pathIndex: 0 };
  }

  let traveled = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const segmentDist = euclideanDistance(path[i], path[i + 1]);
    const penalty = getMovementPenalty(path[i], path[i + 1], terrain);
    const effectiveCost = segmentDist + penalty;

    if (traveled + effectiveCost > movementAllowance) {
      // Can only partially complete this segment
      const remaining = movementAllowance - traveled;
      // Account for penalty in remaining distance
      const actualRemaining = Math.max(0, remaining - penalty);
      const t = actualRemaining / segmentDist;

      return {
        point: {
          x: path[i].x + (path[i + 1].x - path[i].x) * t,
          y: path[i].y + (path[i + 1].y - path[i].y) * t,
        },
        distanceTraveled: traveled + actualRemaining,
        pathIndex: i,
      };
    }

    traveled += segmentDist; // Only count actual distance traveled, not penalty
  }

  // Can reach end of path
  return {
    point: path[path.length - 1],
    distanceTraveled: calculatePathDistance(path),
    pathIndex: path.length - 1,
  };
}
