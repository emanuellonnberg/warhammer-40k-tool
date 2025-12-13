/**
 * Terrain system for Warhammer 40K simulation
 * Implements 10th Edition terrain rules including movement blocking,
 * cover saves, and line of sight.
 */

// ============================================================================
// TERRAIN TYPE DEFINITIONS
// ============================================================================

/**
 * Standard terrain types in Warhammer 40K 10th Edition
 */
export type TerrainType =
  | 'ruins'
  | 'woods'
  | 'crater'
  | 'barricade'
  | 'building'
  | 'container'
  | 'hills'
  | 'debris'
  | 'custom';

/**
 * Terrain traits from 10th Edition rules
 */
export interface TerrainTraits {
  /** Light cover: +1 to armor save */
  coverLight?: boolean;
  /** Heavy cover: +1 to armor save (stacks with light cover in some cases) */
  coverHeavy?: boolean;
  /** Obscuring: Blocks line of sight if target is not within terrain */
  obscuring?: boolean;
  /** Dense cover: -1 to hit when shooting through */
  denseCover?: boolean;
  /** Breachable: INFANTRY can move through walls */
  breachable?: boolean;
  /** Difficult ground: -2" to movement when moving over */
  difficultGround?: boolean;
  /** Unstable: Roll D6 when moving over, 1 = 1 mortal wound */
  unstable?: boolean;
  /** Exposed position: No cover benefit (e.g., hills) */
  exposedPosition?: boolean;
  /** Scalable: Models can climb/move over */
  scalable?: boolean;
  /** Defensible: Units inside fight first */
  defensible?: boolean;
}

/**
 * Shape types for terrain geometry
 */
export type TerrainShape = 'rectangle' | 'circle' | 'polygon';

/**
 * A point in 2D space
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Axis-aligned bounding box
 */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Complete terrain feature definition
 */
export interface TerrainFeature {
  id: string;
  name: string;
  type: TerrainType;

  // Position (center point)
  x: number;
  y: number;

  // Geometry - dimensions in inches
  width: number;   // X dimension
  height: number;  // Y dimension (depth on table)
  elevation?: number; // Height in inches for LoS purposes

  // Shape definition
  shape: TerrainShape;
  /** For polygon shapes, vertices relative to center */
  vertices?: Point[];
  /** For circle shapes, radius */
  radius?: number;

  // 10th Edition terrain traits
  traits: TerrainTraits;

  // Movement blocking
  /** Completely blocks all movement */
  impassable?: boolean;
  /** Blocks movement for non-INFANTRY */
  infantryOnly?: boolean;
  /** Blocks movement for VEHICLE/MONSTER */
  blocksLargeModels?: boolean;
}

/**
 * Terrain layout for a battlefield
 */
export interface TerrainLayout {
  name: string;
  description?: string;
  features: TerrainFeature[];
}

// ============================================================================
// GEOMETRY UTILITIES
// ============================================================================

/**
 * Get bounding box for a terrain feature
 */
export function getTerrainBounds(terrain: TerrainFeature): BoundingBox {
  if (terrain.shape === 'circle') {
    const r = terrain.radius || terrain.width / 2;
    return {
      minX: terrain.x - r,
      minY: terrain.y - r,
      maxX: terrain.x + r,
      maxY: terrain.y + r,
    };
  }

  if (terrain.shape === 'polygon' && terrain.vertices && terrain.vertices.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const v of terrain.vertices) {
      const absX = terrain.x + v.x;
      const absY = terrain.y + v.y;
      minX = Math.min(minX, absX);
      minY = Math.min(minY, absY);
      maxX = Math.max(maxX, absX);
      maxY = Math.max(maxY, absY);
    }
    return { minX, minY, maxX, maxY };
  }

  // Rectangle (default)
  const halfW = terrain.width / 2;
  const halfH = terrain.height / 2;
  return {
    minX: terrain.x - halfW,
    minY: terrain.y - halfH,
    maxX: terrain.x + halfW,
    maxY: terrain.y + halfH,
  };
}

/**
 * Check if a point is inside a terrain feature
 */
export function pointInTerrain(point: Point, terrain: TerrainFeature): boolean {
  if (terrain.shape === 'circle') {
    const r = terrain.radius || terrain.width / 2;
    const dx = point.x - terrain.x;
    const dy = point.y - terrain.y;
    return dx * dx + dy * dy <= r * r;
  }

  if (terrain.shape === 'polygon' && terrain.vertices && terrain.vertices.length > 2) {
    return pointInPolygon(point, terrain.vertices.map(v => ({
      x: terrain.x + v.x,
      y: terrain.y + v.y,
    })));
  }

  // Rectangle
  const bounds = getTerrainBounds(terrain);
  return (
    point.x >= bounds.minX &&
    point.x <= bounds.maxX &&
    point.y >= bounds.minY &&
    point.y <= bounds.maxY
  );
}

/**
 * Ray casting algorithm for point-in-polygon test
 */
function pointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a line segment intersects a terrain feature
 */
export function lineIntersectsTerrain(
  from: Point,
  to: Point,
  terrain: TerrainFeature
): boolean {
  // Quick bounding box check first
  const bounds = getTerrainBounds(terrain);
  if (!lineIntersectsAABB(from, to, bounds)) {
    return false;
  }

  if (terrain.shape === 'circle') {
    const r = terrain.radius || terrain.width / 2;
    return lineIntersectsCircle(from, to, { x: terrain.x, y: terrain.y }, r);
  }

  if (terrain.shape === 'polygon' && terrain.vertices && terrain.vertices.length > 2) {
    const absVertices = terrain.vertices.map(v => ({
      x: terrain.x + v.x,
      y: terrain.y + v.y,
    }));
    return lineIntersectsPolygon(from, to, absVertices);
  }

  // Rectangle - already passed AABB check
  return lineIntersectsRect(from, to, bounds);
}

/**
 * Check line-AABB intersection
 */
function lineIntersectsAABB(from: Point, to: Point, box: BoundingBox): boolean {
  // Check if line is completely outside box
  const minX = Math.min(from.x, to.x);
  const maxX = Math.max(from.x, to.x);
  const minY = Math.min(from.y, to.y);
  const maxY = Math.max(from.y, to.y);

  if (maxX < box.minX || minX > box.maxX) return false;
  if (maxY < box.minY || minY > box.maxY) return false;

  return true;
}

/**
 * Check line-circle intersection
 */
function lineIntersectsCircle(
  from: Point,
  to: Point,
  center: Point,
  radius: number
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const fx = from.x - center.x;
  const fy = from.y - center.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - radius * radius;

  let discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return false;

  discriminant = Math.sqrt(discriminant);

  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  // Check if intersection is within line segment
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

/**
 * Check line-rectangle intersection using separating axis theorem
 */
function lineIntersectsRect(from: Point, to: Point, box: BoundingBox): boolean {
  // Check if either endpoint is inside
  if (
    from.x >= box.minX && from.x <= box.maxX &&
    from.y >= box.minY && from.y <= box.maxY
  ) return true;
  if (
    to.x >= box.minX && to.x <= box.maxX &&
    to.y >= box.minY && to.y <= box.maxY
  ) return true;

  // Check intersection with each edge
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];

  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    if (lineSegmentsIntersect(from, to, corners[i], corners[j])) {
      return true;
    }
  }

  return false;
}

/**
 * Check line-polygon intersection
 */
function lineIntersectsPolygon(from: Point, to: Point, polygon: Point[]): boolean {
  // Check if either endpoint is inside
  if (pointInPolygon(from, polygon)) return true;
  if (pointInPolygon(to, polygon)) return true;

  // Check intersection with each edge
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (lineSegmentsIntersect(from, to, polygon[i], polygon[j])) {
      return true;
    }
  }

  return false;
}

/**
 * Check if two line segments intersect
 */
function lineSegmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const d1 = direction(b1, b2, a1);
  const d2 = direction(b1, b2, a2);
  const d3 = direction(a1, a2, b1);
  const d4 = direction(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(b1, b2, a1)) return true;
  if (d2 === 0 && onSegment(b1, b2, a2)) return true;
  if (d3 === 0 && onSegment(a1, a2, b1)) return true;
  if (d4 === 0 && onSegment(a1, a2, b2)) return true;

  return false;
}

function direction(p1: Point, p2: Point, p3: Point): number {
  return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
}

function onSegment(p1: Point, p2: Point, p: Point): boolean {
  return (
    Math.min(p1.x, p2.x) <= p.x &&
    p.x <= Math.max(p1.x, p2.x) &&
    Math.min(p1.y, p2.y) <= p.y &&
    p.y <= Math.max(p1.y, p2.y)
  );
}

// ============================================================================
// TERRAIN QUERY FUNCTIONS
// ============================================================================

/**
 * Check if movement between two points is blocked by any terrain
 */
export function isMovementBlocked(
  from: Point,
  to: Point,
  terrain: TerrainFeature[],
  isInfantry: boolean = true,
  isLargeModel: boolean = false
): { blocked: boolean; blockedBy?: TerrainFeature } {
  for (const t of terrain) {
    // Skip non-blocking terrain
    if (!t.impassable && !t.traits.obscuring) {
      // Check infantry-only terrain
      if (t.infantryOnly && !isInfantry) {
        if (lineIntersectsTerrain(from, to, t)) {
          return { blocked: true, blockedBy: t };
        }
      }
      // Check large model blocking
      if (t.blocksLargeModels && isLargeModel) {
        if (lineIntersectsTerrain(from, to, t)) {
          return { blocked: true, blockedBy: t };
        }
      }
      continue;
    }

    // Check if path crosses impassable/obscuring terrain
    if (lineIntersectsTerrain(from, to, t)) {
      // Breachable terrain allows infantry through
      if (t.traits.breachable && isInfantry) {
        continue;
      }
      return { blocked: true, blockedBy: t };
    }
  }

  return { blocked: false };
}

/**
 * Calculate movement cost penalty from terrain
 * Returns additional inches of movement required
 */
export function getMovementPenalty(
  from: Point,
  to: Point,
  terrain: TerrainFeature[]
): number {
  let penalty = 0;

  for (const t of terrain) {
    if (t.traits.difficultGround) {
      // Check if path crosses this terrain
      if (lineIntersectsTerrain(from, to, t)) {
        penalty += 2; // -2" movement in 10th edition
      }
    }
  }

  return penalty;
}

/**
 * Check if a unit at a position would receive cover
 */
export function getTerrainCover(
  position: Point,
  shooterPosition: Point,
  terrain: TerrainFeature[]
): { hasCover: boolean; coverType: 'none' | 'light' | 'heavy'; denseCover: boolean } {
  let hasCover = false;
  let isHeavy = false;
  let denseCover = false;

  for (const t of terrain) {
    // Skip exposed positions (hills)
    if (t.traits.exposedPosition) continue;

    // Check if target is within terrain
    const targetInTerrain = pointInTerrain(position, t);

    // Check if line of fire passes through terrain
    const throughTerrain = lineIntersectsTerrain(shooterPosition, position, t);

    if (targetInTerrain) {
      // Unit is inside terrain - gets cover
      if (t.traits.coverLight || t.traits.coverHeavy) {
        hasCover = true;
        if (t.traits.coverHeavy) {
          isHeavy = true;
        }
      }
    } else if (throughTerrain) {
      // Shooting through terrain
      if (t.traits.denseCover) {
        denseCover = true;
      }
      // Some terrain types grant cover when behind them
      if (t.traits.coverLight) {
        hasCover = true;
      }
    }
  }

  return {
    hasCover,
    coverType: hasCover ? (isHeavy ? 'heavy' : 'light') : 'none',
    denseCover,
  };
}

/**
 * Check line of sight between two positions
 * Returns whether LoS is blocked and by what
 */
export function checkLineOfSight(
  from: Point,
  to: Point,
  terrain: TerrainFeature[]
): { hasLoS: boolean; blockedBy?: TerrainFeature; throughDense: boolean } {
  let throughDense = false;

  for (const t of terrain) {
    // Only obscuring terrain blocks LoS
    if (!t.traits.obscuring) {
      // Check for dense cover penalty
      if (t.traits.denseCover && lineIntersectsTerrain(from, to, t)) {
        throughDense = true;
      }
      continue;
    }

    // Check if either model is within the terrain (can see out/in)
    const fromInTerrain = pointInTerrain(from, t);
    const toInTerrain = pointInTerrain(to, t);

    // If both are in the same terrain, they can see each other
    if (fromInTerrain && toInTerrain) continue;

    // If one is inside, they can see out (and be seen into)
    if (fromInTerrain || toInTerrain) continue;

    // Neither in terrain - check if LoS crosses it
    if (lineIntersectsTerrain(from, to, t)) {
      return { hasLoS: false, blockedBy: t, throughDense };
    }
  }

  return { hasLoS: true, throughDense };
}

// ============================================================================
// TERRAIN FACTORY FUNCTIONS
// ============================================================================

let terrainIdCounter = 0;

function generateTerrainId(): string {
  return `terrain_${++terrainIdCounter}`;
}

/**
 * Create standard ruins terrain
 */
export function createRuins(
  x: number,
  y: number,
  width: number = 6,
  height: number = 6,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Ruins',
    type: 'ruins',
    x,
    y,
    width,
    height,
    elevation: 6,
    shape: 'rectangle',
    traits: {
      coverLight: true,
      obscuring: true,
      breachable: true,
      defensible: true,
      scalable: true,
    },
    infantryOnly: false, // Infantry can move through via breachable
  };
}

/**
 * Create woods/forest terrain
 */
export function createWoods(
  x: number,
  y: number,
  width: number = 6,
  height: number = 6,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Woods',
    type: 'woods',
    x,
    y,
    width,
    height,
    elevation: 3,
    shape: 'circle',
    radius: Math.min(width, height) / 2,
    traits: {
      coverLight: true,
      denseCover: true,
      difficultGround: true,
    },
  };
}

/**
 * Create crater terrain
 */
export function createCrater(
  x: number,
  y: number,
  radius: number = 3,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Crater',
    type: 'crater',
    x,
    y,
    width: radius * 2,
    height: radius * 2,
    elevation: -1,
    shape: 'circle',
    radius,
    traits: {
      coverLight: true,
      difficultGround: true,
    },
  };
}

/**
 * Create shipping container terrain
 */
export function createContainer(
  x: number,
  y: number,
  horizontal: boolean = true,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Container',
    type: 'container',
    x,
    y,
    width: horizontal ? 6 : 3,
    height: horizontal ? 3 : 6,
    elevation: 3,
    shape: 'rectangle',
    traits: {
      coverHeavy: true,
      obscuring: true,
    },
    impassable: true,
  };
}

/**
 * Create barricade/wall terrain
 */
export function createBarricade(
  x: number,
  y: number,
  length: number = 6,
  horizontal: boolean = true,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Barricade',
    type: 'barricade',
    x,
    y,
    width: horizontal ? length : 1,
    height: horizontal ? 1 : length,
    elevation: 2,
    shape: 'rectangle',
    traits: {
      coverLight: true,
      defensible: true,
    },
  };
}

/**
 * Create hill terrain (elevated, no cover)
 */
export function createHill(
  x: number,
  y: number,
  width: number = 8,
  height: number = 6,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Hill',
    type: 'hills',
    x,
    y,
    width,
    height,
    elevation: 3,
    shape: 'circle',
    radius: Math.min(width, height) / 2,
    traits: {
      exposedPosition: true,
      scalable: true,
    },
  };
}

/**
 * Create debris/scatter terrain
 */
export function createDebris(
  x: number,
  y: number,
  width: number = 4,
  height: number = 4,
  name?: string
): TerrainFeature {
  return {
    id: generateTerrainId(),
    name: name || 'Debris',
    type: 'debris',
    x,
    y,
    width,
    height,
    elevation: 1,
    shape: 'rectangle',
    traits: {
      coverLight: true,
      difficultGround: true,
    },
  };
}

// ============================================================================
// TERRAIN LAYOUT PRESETS
// ============================================================================

/**
 * Create a GT-style terrain layout for Strike Force games
 * Standard competitive layout with balanced cover
 */
export function createGTLayout(
  battlefieldWidth: number = 44,
  battlefieldHeight: number = 60
): TerrainLayout {
  const halfW = battlefieldWidth / 2;
  const halfH = battlefieldHeight / 2;

  const features: TerrainFeature[] = [
    // Center piece - large ruins
    createRuins(0, 0, 8, 8, 'Central Ruins'),

    // Flanking ruins (left/right of center)
    createRuins(-12, 10, 6, 6, 'North-West Ruins'),
    createRuins(12, 10, 6, 6, 'North-East Ruins'),
    createRuins(-12, -10, 6, 6, 'South-West Ruins'),
    createRuins(12, -10, 6, 6, 'South-East Ruins'),

    // Deployment zone cover (Army A side - negative X)
    createRuins(-halfW + 8, 0, 5, 5, 'Army A Ruins'),
    createContainer(-halfW + 6, 12, true, 'Army A Container North'),
    createContainer(-halfW + 6, -12, true, 'Army A Container South'),

    // Deployment zone cover (Army B side - positive X)
    createRuins(halfW - 8, 0, 5, 5, 'Army B Ruins'),
    createContainer(halfW - 6, 12, true, 'Army B Container North'),
    createContainer(halfW - 6, -12, true, 'Army B Container South'),

    // Mid-field scatter
    createCrater(-6, 20, 2.5, 'North Crater'),
    createCrater(6, -20, 2.5, 'South Crater'),
    createDebris(0, 18, 3, 3, 'North Debris'),
    createDebris(0, -18, 3, 3, 'South Debris'),
  ];

  return {
    name: 'GT Standard',
    description: 'Standard GT-style competitive terrain layout',
    features,
  };
}

/**
 * Create a city fight / dense urban terrain layout
 */
export function createCityFightLayout(
  battlefieldWidth: number = 44,
  battlefieldHeight: number = 60
): TerrainLayout {
  const halfW = battlefieldWidth / 2;

  const features: TerrainFeature[] = [
    // Dense ruins throughout
    createRuins(0, 0, 7, 7, 'Central Building'),
    createRuins(-10, 0, 6, 6, 'West Building'),
    createRuins(10, 0, 6, 6, 'East Building'),

    createRuins(-8, 15, 5, 5, 'NW Building'),
    createRuins(8, 15, 5, 5, 'NE Building'),
    createRuins(-8, -15, 5, 5, 'SW Building'),
    createRuins(8, -15, 5, 5, 'SE Building'),

    // Deployment zone buildings
    createRuins(-halfW + 7, 8, 5, 5, 'Army A North'),
    createRuins(-halfW + 7, -8, 5, 5, 'Army A South'),
    createRuins(halfW - 7, 8, 5, 5, 'Army B North'),
    createRuins(halfW - 7, -8, 5, 5, 'Army B South'),

    // Street barricades
    createBarricade(-5, 8, 4, true, 'North Barricade'),
    createBarricade(5, -8, 4, true, 'South Barricade'),
    createBarricade(0, 22, 5, true, 'Far North Barricade'),
    createBarricade(0, -22, 5, true, 'Far South Barricade'),

    // Scatter debris
    createDebris(-15, 5, 3, 3, 'West Debris 1'),
    createDebris(15, -5, 3, 3, 'East Debris 1'),
    createDebris(-3, 25, 2, 2, 'North Debris'),
    createDebris(3, -25, 2, 2, 'South Debris'),
  ];

  return {
    name: 'City Fight',
    description: 'Dense urban terrain for close-quarters combat',
    features,
  };
}

/**
 * Create an open field with minimal terrain
 */
export function createOpenFieldLayout(
  battlefieldWidth: number = 44,
  battlefieldHeight: number = 60
): TerrainLayout {
  const halfW = battlefieldWidth / 2;

  const features: TerrainFeature[] = [
    // A few hills for elevated positions
    createHill(0, 0, 8, 6, 'Central Hill'),
    createHill(-12, 15, 6, 5, 'North Hill'),
    createHill(12, -15, 6, 5, 'South Hill'),

    // Deployment zone cover
    createCrater(-halfW + 10, 0, 3, 'Army A Crater'),
    createCrater(halfW - 10, 0, 3, 'Army B Crater'),

    // Scattered craters
    createCrater(-8, -10, 2.5, 'SW Crater'),
    createCrater(8, 10, 2.5, 'NE Crater'),

    // Light debris
    createDebris(-5, 20, 3, 2, 'North Debris'),
    createDebris(5, -20, 3, 2, 'South Debris'),
  ];

  return {
    name: 'Open Field',
    description: 'Sparse terrain favoring shooting armies',
    features,
  };
}

/**
 * Create an empty battlefield (no terrain)
 */
export function createNoTerrainLayout(): TerrainLayout {
  return {
    name: 'No Terrain',
    description: 'Empty battlefield with no terrain features',
    features: [],
  };
}

// Reset terrain ID counter (useful for testing)
export function resetTerrainIdCounter(): void {
  terrainIdCounter = 0;
}
