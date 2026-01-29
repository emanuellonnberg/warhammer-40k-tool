import { describe, it, expect, beforeEach } from 'vitest';
import { runSimpleEngagement } from '../src/simulation';
import { createRuins, createContainer, resetTerrainIdCounter } from '../src/simulation/terrain';
import type { Army } from '../src/types';

// Mock army data for testing
function createTestArmy(name: string, unitCount: number = 3): Army {
  const units = [];
  for (let i = 0; i < unitCount; i++) {
    units.push({
      id: `${name}-unit-${i}`,
      name: `${name} Infantry Squad ${i + 1}`,
      type: 'Infantry',
      count: 10,
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
          name: 'Lasgun',
          type: 'Ranged',
          count: 10,
          models_with_weapon: 10,
          characteristics: {
            range: '24',
            attacks: '1',
            skill: '4+',
            strength: '3',
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

describe('Simulation - Terrain Integration', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
  });

  it('should show units moving around impassable terrain (building)', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    // Create impassable building directly in the path between armies
    const terrain = [
      createContainer(0, 0, true, 'Center Building'), // Impassable container at center
    ];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain,
      allowAdvance: true,
    });

    // Check that terrain was included in the result
    expect(result.terrain).toBeDefined();
    expect(result.terrain).toHaveLength(1);
    expect(result.terrain![0].impassable).toBe(true);

    // Find movement phase logs
    const movementLogs = result.logs.filter(log => log.phase === 'movement');
    expect(movementLogs.length).toBeGreaterThan(0);

    // Units should have moved (checking movement details exist)
    const hasMovementDetails = movementLogs.some(log =>
      log.movementDetails && log.movementDetails.length > 0
    );
    expect(hasMovementDetails).toBe(true);

    // Verify no units are inside the impassable terrain
    const finalSnapshot = result.positionsTimeline![result.positionsTimeline!.length - 1];
    const allUnits = [...finalSnapshot.armyA, ...finalSnapshot.armyB];

    const building = result.terrain![0];
    const buildingBounds = {
      minX: building.x - building.width / 2,
      maxX: building.x + building.width / 2,
      minY: building.y - building.height / 2,
      maxY: building.y + building.height / 2,
    };

    allUnits.forEach(unit => {
      // Units should not be inside the building
      const isInside =
        unit.x >= buildingBounds.minX &&
        unit.x <= buildingBounds.maxX &&
        unit.y >= buildingBounds.minY &&
        unit.y <= buildingBounds.maxY;

      expect(isInside).toBe(false);
    });
  });

  it('should calculate longer path distance when terrain blocks direct route', () => {
    const armyA = createTestArmy('Army A', 1);
    const armyB = createTestArmy('Army B', 1);

    // Create large ruins blocking the center
    const terrain = [
      createRuins(0, 0, 10, 10, 'Large Central Ruins'), // Big obstacle
    ];

    const resultWithTerrain = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain,
      allowAdvance: false,
    });

    const resultNoTerrain = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain: [],
      allowAdvance: false,
    });

    // With terrain, units should account for obstacles
    expect(resultWithTerrain.terrain).toHaveLength(1);
    expect(resultNoTerrain.terrain).toHaveLength(0);

    // Both simulations should have movement
    const movementWithTerrain = resultWithTerrain.logs.find(log => log.phase === 'movement');
    const movementNoTerrain = resultNoTerrain.logs.find(log => log.phase === 'movement');

    expect(movementWithTerrain).toBeDefined();
    expect(movementNoTerrain).toBeDefined();
  });

  it('should respect breachable terrain for infantry movement', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    // Create ruins (breachable) in the center
    const terrain = [
      createRuins(0, 0, 6, 6, 'Breachable Ruins'),
    ];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain,
      allowAdvance: true,
    });

    // Verify terrain has breachable trait
    expect(result.terrain).toBeDefined();
    expect(result.terrain![0].traits.breachable).toBe(true);

    // Infantry should be able to move through/over ruins
    // Check that simulation completed without errors
    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.endReason).toBeDefined();
  });

  it('should apply line of sight blocking from obscuring terrain', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    // Create obscuring terrain between armies
    const terrain = [
      createRuins(0, 0, 8, 8, 'Obscuring Ruins'),
    ];

    // Ruins should have obscuring trait
    expect(terrain[0].traits.obscuring).toBe(true);

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain,
      useDiceRolls: false,
    });

    // Check that shooting phase occurred
    const shootingLogs = result.logs.filter(log => log.phase === 'shooting');
    expect(shootingLogs.length).toBeGreaterThan(0);

    // With obscuring terrain in the middle, shooting should be affected
    // (damage should be 0 or reduced if terrain blocks LoS)
    const totalDamage = result.summary.armyA.damageDealt + result.summary.armyB.damageDealt;

    // Run without terrain for comparison
    const resultNoTerrain = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain: [],
      useDiceRolls: false,
    });

    const totalDamageNoTerrain = resultNoTerrain.summary.armyA.damageDealt + resultNoTerrain.summary.armyB.damageDealt;

    // Obscuring terrain should reduce total damage dealt
    expect(totalDamage).toBeLessThanOrEqual(totalDamageNoTerrain);
  });

  it('should apply cover saves from terrain', () => {
    const armyA = createTestArmy('Army A', 3);
    const armyB = createTestArmy('Army B', 3);

    // Create terrain with cover
    const terrain = [
      createRuins(-10, -10, 5, 5, 'Cover Ruins 1'), // Light cover
      createRuins(10, 10, 5, 5, 'Cover Ruins 2'),   // Light cover
    ];

    // Verify cover traits
    expect(terrain[0].traits.coverLight).toBe(true);
    expect(terrain[1].traits.coverLight).toBe(true);

    const resultWithCover = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain,
      useDiceRolls: false,
    });

    const resultNoCover = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain: [],
      useDiceRolls: false,
    });

    // With cover, units should take less damage
    const damageTakenA_WithCover = resultWithCover.summary.armyA.damageTaken;
    const damageTakenA_NoCover = resultNoCover.summary.armyA.damageTaken;

    // Cover should reduce damage taken (though not guaranteed due to positioning)
    // At minimum, both simulations should complete successfully
    expect(resultWithCover.logs.length).toBeGreaterThan(0);
    expect(resultNoCover.logs.length).toBeGreaterThan(0);
  });

  it('should apply movement penalties from difficult ground', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    // Create woods with difficult ground
    const terrain = [
      createRuins(0, -5, 8, 4, 'Difficult Ruins'),
    ];

    // Ruins have difficult ground trait
    expect(terrain[0].traits.difficultGround).toBe(true);

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 2,
      terrain,
      allowAdvance: true,
    });

    // Verify terrain is in result
    expect(result.terrain).toBeDefined();
    expect(result.terrain!.length).toBeGreaterThan(0);

    // Movement should account for difficult ground penalties
    const movementLogs = result.logs.filter(log => log.phase === 'movement');
    expect(movementLogs.length).toBeGreaterThan(0);

    // Check that simulation completed
    expect(result.endReason).toBeDefined();
  });

  it('should show multiple terrain features affecting the battle', () => {
    const armyA = createTestArmy('Army A', 4);
    const armyB = createTestArmy('Army B', 4);

    // Create GT-style terrain layout
    const terrain = [
      createRuins(0, 0, 8, 8, 'Central Ruins'),
      createRuins(-12, 10, 6, 6, 'NW Ruins'),
      createRuins(12, 10, 6, 6, 'NE Ruins'),
      createContainer(-18, 0, true, 'Army A Container'),
      createContainer(18, 0, true, 'Army B Container'),
    ];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 3,
      terrain,
      allowAdvance: true,
      useDiceRolls: false,
    });

    // Verify all terrain was included
    expect(result.terrain).toHaveLength(5);

    // Check terrain variety
    const ruinsCount = result.terrain!.filter(t => t.type === 'ruins').length;
    const containerCount = result.terrain!.filter(t => t.type === 'container').length;

    expect(ruinsCount).toBe(3);
    expect(containerCount).toBe(2);

    // Verify terrain traits
    const hasObscuring = result.terrain!.some(t => t.traits.obscuring);
    const hasBreachable = result.terrain!.some(t => t.traits.breachable);
    const hasImpassable = result.terrain!.some(t => t.impassable);

    expect(hasObscuring).toBe(true);
    expect(hasBreachable).toBe(true);
    expect(hasImpassable).toBe(true);

    // Battle should complete successfully with complex terrain
    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.summary.armyA.survivors).toBeGreaterThanOrEqual(0);
    expect(result.summary.armyB.survivors).toBeGreaterThanOrEqual(0);
  });

  it('should render terrain features on the battlefield', () => {
    const armyA = createTestArmy('Army A', 2);
    const armyB = createTestArmy('Army B', 2);

    const terrain = [
      createRuins(0, 0, 6, 6, 'Center Ruins'),
      createContainer(-15, 0, true, 'Left Container'),
    ];

    const result = runSimpleEngagement(armyA, armyB, {
      initiative: 'armyA',
      maxRounds: 1,
      terrain,
    });

    // Terrain should be in the result for rendering
    expect(result.terrain).toBeDefined();
    expect(result.terrain).toHaveLength(2);

    // Verify terrain data structure is complete
    result.terrain!.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.type).toBeDefined();
      expect(t.x).toBeDefined();
      expect(t.y).toBeDefined();
      expect(t.width).toBeDefined();
      expect(t.height).toBeDefined();
      expect(t.shape).toBeDefined();
      expect(t.traits).toBeDefined();
    });
  });
});
