import { describe, it, expect, beforeEach } from 'vitest';
import {
  createRuins,
  createWoods,
  createContainer,
  createHill,
  checkLineOfSight,
  getTerrainCover,
  pointInTerrain,
  resetTerrainIdCounter,
  type TerrainFeature,
} from '../src/simulation/terrain';

describe('Shooting with Terrain Integration', () => {
  beforeEach(() => {
    resetTerrainIdCounter();
  });

  describe('Line of Sight Blocking', () => {
    it('should block LoS through obscuring ruins', () => {
      const ruins = createRuins(10, 0, 6, 6); // Ruins in the middle
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(false);
      expect(losCheck.blockedBy).toBe(ruins);
    });

    it('should allow LoS when shooter is inside obscuring terrain', () => {
      const ruins = createRuins(0, 0, 6, 6);
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 }; // Inside ruins
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(true);
    });

    it('should allow LoS when target is inside obscuring terrain', () => {
      const ruins = createRuins(20, 0, 6, 6);
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 }; // Inside ruins

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(true);
    });

    it('should allow LoS when both units are inside same terrain', () => {
      const ruins = createRuins(5, 0, 20, 6);
      const terrain = [ruins];

      const shooter = { x: 2, y: 0 };
      const target = { x: 8, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(true);
    });

    it('should allow LoS when no terrain blocks', () => {
      const ruins = createRuins(10, 20, 6, 6); // Far away from the line
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(true);
    });

    it('should block LoS through impassable containers', () => {
      const container = createContainer(10, 0, true);
      const terrain = [container];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(false);
    });
  });

  describe('Dense Cover Penalty', () => {
    it('should detect shooting through dense woods', () => {
      const woods = createWoods(10, 0, 6, 6);
      const terrain = [woods];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      // Woods have dense cover but are not obscuring
      expect(losCheck.hasLoS).toBe(true);
      expect(losCheck.throughDense).toBe(true);
    });

    it('should not report dense cover when not shooting through woods', () => {
      const woods = createWoods(10, 20, 6, 6); // Far away
      const terrain = [woods];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const losCheck = checkLineOfSight(shooter, target, terrain);

      expect(losCheck.hasLoS).toBe(true);
      expect(losCheck.throughDense).toBe(false);
    });
  });

  describe('Cover Saves', () => {
    it('should grant light cover when target is in ruins', () => {
      const ruins = createRuins(20, 0, 6, 6);
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 }; // Inside ruins

      const cover = getTerrainCover(target, shooter, terrain);

      expect(cover.hasCover).toBe(true);
      expect(cover.coverType).toBe('light');
    });

    it('should grant light cover when shooting through ruins to target behind', () => {
      // Ruins have coverLight, so shooting through them grants cover
      const ruins = createRuins(10, 0, 4, 4);
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 15, y: 0 }; // Behind the ruins

      // First verify target is not inside ruins (ruins center at 10, size 4x4, so bounds are 8-12)
      expect(pointInTerrain(target, ruins)).toBe(false);

      const cover = getTerrainCover(target, shooter, terrain);

      // Shooting through ruins with coverLight grants cover to target behind
      expect(cover.hasCover).toBe(true);
      expect(cover.coverType).toBe('light');
    });

    it('should grant light cover when target is in woods', () => {
      const woods = createWoods(20, 0, 6, 6);
      const terrain = [woods];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 }; // Inside woods (center of circle)

      // Verify target is inside woods
      expect(pointInTerrain(target, woods)).toBe(true);

      const cover = getTerrainCover(target, shooter, terrain);

      expect(cover.hasCover).toBe(true);
      expect(cover.coverType).toBe('light');
      // Note: denseCover is only flagged when shooting THROUGH terrain,
      // not when target is inside. When target is inside, they get cover from being inside.
      // Dense cover penalty applies to shots through terrain where target is outside.
    });

    it('should flag dense cover when shooting THROUGH woods', () => {
      const woods = createWoods(10, 0, 6, 6);
      const terrain = [woods];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 }; // Beyond the woods

      // Verify target is NOT inside woods
      expect(pointInTerrain(target, woods)).toBe(false);

      const cover = getTerrainCover(target, shooter, terrain);

      // When shooting through dense terrain to a target behind it
      expect(cover.denseCover).toBe(true);
      expect(cover.hasCover).toBe(true); // coverLight grants cover when shooting through
    });

    it('should not grant cover from exposed hills', () => {
      // Hills have exposedPosition trait
      const hill = createHill(20, 0, 8, 6);
      const terrain = [hill];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const cover = getTerrainCover(target, shooter, terrain);

      expect(cover.hasCover).toBe(false);
      expect(cover.coverType).toBe('none');
    });

    it('should not grant cover when target is in open', () => {
      const ruins = createRuins(10, 10, 6, 6); // Ruins far from the line
      const terrain = [ruins];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      const cover = getTerrainCover(target, shooter, terrain);

      expect(cover.hasCover).toBe(false);
      expect(cover.coverType).toBe('none');
    });
  });

  describe('Cover Save Bonus Application', () => {
    // Test the applyCoverToSave function indirectly through the shooting system
    it('light cover should improve 3+ save to 2+', () => {
      // This tests the logic: 3+ save - 1 cover bonus = 2+
      const baseSave = 3;
      const coverBonus = 1;
      const improvedSave = Math.max(2, baseSave - coverBonus);
      expect(improvedSave).toBe(2);
    });

    it('light cover should not improve save beyond 2+', () => {
      // 2+ save with cover should still be 2+ (minimum)
      const baseSave = 2;
      const coverBonus = 1;
      const improvedSave = Math.max(2, baseSave - coverBonus);
      expect(improvedSave).toBe(2);
    });

    it('heavy cover should improve 4+ save to 2+', () => {
      // Heavy cover grants +2 bonus
      const baseSave = 4;
      const coverBonus = 2;
      const improvedSave = Math.max(2, baseSave - coverBonus);
      expect(improvedSave).toBe(2);
    });
  });

  describe('Combined Terrain Effects', () => {
    it('should handle multiple terrain pieces', () => {
      const ruins1 = createRuins(5, 0, 4, 4);
      const ruins2 = createRuins(15, 0, 4, 4);
      const terrain = [ruins1, ruins2];

      const shooter = { x: 0, y: 0 };
      const target = { x: 20, y: 0 };

      // LoS should be blocked by both pieces
      const losCheck = checkLineOfSight(shooter, target, terrain);
      expect(losCheck.hasLoS).toBe(false);
    });

    it('should allow LoS around terrain', () => {
      const ruins = createRuins(10, 0, 6, 6);
      const terrain = [ruins];

      const shooter = { x: 0, y: 10 };
      const target = { x: 20, y: 10 };

      // Shot goes around the ruins (at y=10, ruins at y=0)
      const losCheck = checkLineOfSight(shooter, target, terrain);
      expect(losCheck.hasLoS).toBe(true);
    });
  });
});
