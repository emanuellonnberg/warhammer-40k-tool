export { startingDistanceFromPoints, pickStartingDistance, DISTANCE_DEFAULTS } from './distance';
export { classifyUnitRole, classifyArmyRoles } from './role-classifier';
export { runSimpleEngagement } from './simple-engagement';
export * from './types';

// Terrain system exports
export * from './terrain';
export {
  generateNavMesh,
  findPath,
  euclideanDistance,
  calculatePathDistance,
  getPointAlongPath,
  getMaxTravelPoint,
  type NavMesh,
  type NavWaypoint,
  type PathResult,
} from './pathfinding';

// Planner exports (including terrain-aware planning)
export { planMovement, type PlannedMovement, type StrategyProfile } from './planner';
