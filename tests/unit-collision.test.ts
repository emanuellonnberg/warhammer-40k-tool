
import { describe, it, expect } from 'vitest';
import { applyUnitMovement, createUnitState } from '../src/simulation/simple-engagement';
import { UnitState } from '../src/simulation/types';

describe('applyUnitMovement Collision Logic', () => {
    it('should stop units from moving through enemy models', () => {
        // Create unit A slightly behind unit B
        // Unit A (Attacker) moving from (0, 0) to (0, 10)
        // Unit B (Enemey) at (0, 5)

        const unitA = createUnitState(
            {
                id: 'u1', name: 'Chargers', stats: { move: '10"' },
                weapons: []
            } as any,
            { primary: 'infantry' } as any,
            'armyA',
            0,
            48,
            0,
            0
        );

        const unitB = createUnitState(
            {
                id: 'u2', name: 'Blockers', stats: { move: '6"' },
                weapons: []
            } as any,
            { primary: 'infantry' } as any,
            'armyB',
            0,
            48,
            0,
            5
        );

        // Ensure unitB models are actually there
        // createUnitState places models around (0,5).
        // Let's assume compact formation.

        const enemyUnits: UnitState[] = [unitB];

        // Define move: Direct line to (0, 10)
        const to = { x: 0, y: 10 };
        const path = undefined; // Direct move

        applyUnitMovement(
            unitA,
            to,
            path,
            'compact',
            [], // No terrain
            { width: 48, height: 48 },
            true, // allow advance
            'armyA',
            enemyUnits
        );

        // Check finding position
        // If collision ignored: unitA should be at (0, 10).
        // If collision respected: unitA should be approx (0, 4) (stop before B).

        console.log(`Unit A started at (0,0), moved to (${unitA.position.x}, ${unitA.position.y})`);
        console.log(`Unit B is at (${unitB.position.x}, ${unitB.position.y})`);

        // Distance check
        const dx = unitA.position.x - unitB.position.x;
        const dy = unitA.position.y - unitB.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        console.log(`Final Dist: ${dist.toFixed(2)}`);

        // Assert that we did NOT move past the enemy
        expect(unitA.position.y).toBeLessThan(unitB.position.y);

        // Expect checking that they didn't overlap
        expect(dist).toBeGreaterThanOrEqual(1.0); // 1" separation min (Engagement Range / Base size)

        // Currently expecting this to FAIL (dist approx 5, passing through).
        // wait, if it moves to (0, 10), dist is 5.
        // B is at 5. A is at 10. Gap is 5.
        // It skipped RIGHT OVER B.

        // If models are physical, they should collide.
        // We model continuous movement in discrete steps?
        // simple-engagement breaks movement into segments?
        // `applyUnitMovement` handles direct move by... 
        // "Direct movement: independent validation"
        // It checks validity of start->end line?
        // `isMovementBlocked` only checks terrain.
        // So it will teleport from 0 to 10.

        // I want to verify that it detected the collision along the path.
    });
});
