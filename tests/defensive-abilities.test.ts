import { describe, it, expect, beforeEach } from 'vitest';
import { abilityParser } from '../src/simulation/ability-parser';
import type { Unit, Army } from '../src/types';

/**
 * Tests for defensive ability integration with tactical AI
 */

function createUnit(id: string, abilities: string[] = [], rules: string[] = []): Unit {
    return {
        id,
        name: `Test ${id}`,
        type: 'Infantry',
        stats: { move: '6', toughness: '4', save: '3+', wounds: '1', leadership: '7+', objectiveControl: '1' },
        points: 100,
        count: 10,
        weapons: [],
        abilities,
        rules
    };
}

function createArmy(abilities: Record<string, { name: string; description: string }> = {}): Army {
    return {
        armyName: 'Test',
        faction: 'Test',
        pointsTotal: 1000,
        units: [],
        rules: {},
        abilities: Object.fromEntries(Object.entries(abilities).map(([id, a]) => [id, { id, ...a }]))
    };
}

describe('Defensive Ability Integration', () => {
    beforeEach(() => {
        abilityParser.clearCache();
    });

    describe('Stealth Detection', () => {
        it('should detect stealth and return modifier', () => {
            const army = createArmy({ 'stealth': { name: 'Stealth', description: 'Subtract 1 from hit rolls.' } });
            const unit = createUnit('u1', ['stealth']);
            expect(abilityParser.hasStealth(unit, army)).toBe(true);
            expect(abilityParser.getStealthModifier(unit, army)).toBe(-1);
        });

        it('should not detect stealth on normal units', () => {
            const unit = createUnit('u2');
            expect(abilityParser.hasStealth(unit)).toBe(false);
        });
    });

    describe('Feel No Pain Detection', () => {
        it('should detect FNP 5+', () => {
            const army = createArmy({ 'fnp': { name: 'Disgustingly Resilient', description: 'Feel No Pain 5+' } });
            const unit = createUnit('u1', ['fnp']);
            expect(abilityParser.hasFeelNoPain(unit, army)).toBe(true);
            expect(abilityParser.getFeelNoPainValue(unit, army)).toBe(5);
        });

        it('should detect FNP 6+', () => {
            const army = createArmy({ 'fnp': { name: 'Resilience', description: 'This model has Feel No Pain 6+.' } });
            const unit = createUnit('u1', ['fnp']);
            expect(abilityParser.hasFeelNoPain(unit, army)).toBe(true);
            expect(abilityParser.getFeelNoPainValue(unit, army)).toBe(6);
        });
    });

    describe('Invulnerable Save Detection', () => {
        it('should detect 4+ invulnerable save', () => {
            const army = createArmy({ 'shield': { name: 'Storm Shield', description: '4+ invulnerable save' } });
            const unit = createUnit('u1', ['shield']);
            expect(abilityParser.hasInvulnerableSave(unit, army)).toBe(true);
            expect(abilityParser.getInvulnerableSaveValue(unit, army)).toBe(4);
        });

        it('should detect invulnerable with number before keyword', () => {
            const army = createArmy({ 'shield': { name: 'Rosarius', description: '4+ invulnerable' } });
            const unit = createUnit('u1', ['shield']);
            expect(abilityParser.hasInvulnerableSave(unit, army)).toBe(true);
            expect(abilityParser.getInvulnerableSaveValue(unit, army)).toBe(4);
        });
    });

    describe('Combined Defensive Abilities', () => {
        it('should detect multiple defensive abilities on one unit', () => {
            const army = createArmy({
                'stealth': { name: 'Shadow', description: 'This unit has Stealth.' },
                'fnp': { name: 'Daemonic', description: 'Feel No Pain 5+' },
                'invuln': { name: 'Daemonic Save', description: '5+ invulnerable' }
            });
            const unit = createUnit('u1', ['stealth', 'fnp', 'invuln']);

            expect(abilityParser.hasStealth(unit, army)).toBe(true);
            expect(abilityParser.hasFeelNoPain(unit, army)).toBe(true);
            expect(abilityParser.getFeelNoPainValue(unit, army)).toBe(5);
            expect(abilityParser.hasInvulnerableSave(unit, army)).toBe(true);
            expect(abilityParser.getInvulnerableSaveValue(unit, army)).toBe(5);
        });
    });
});
