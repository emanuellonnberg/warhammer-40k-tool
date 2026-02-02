import { describe, it, expect, beforeEach } from 'vitest';
import { AbilityParser, abilityParser } from '../src/simulation/ability-parser';
import type { Unit, Army } from '../src/types';

// Helper to create a minimal test unit
function createTestUnit(
    id: string,
    name: string,
    rules: string[] = [],
    abilities: string[] = []
): Unit {
    return {
        id,
        name,
        type: 'Infantry',
        stats: {
            move: '6',
            toughness: '4',
            save: '3+',
            wounds: '1',
            leadership: '7+',
            objectiveControl: '1'
        },
        points: 100,
        count: 10,
        weapons: [],
        rules,
        abilities
    };
}

// Helper to create a minimal test army with rule/ability definitions
function createTestArmy(
    rules: Record<string, { name: string; description: string }> = {},
    abilities: Record<string, { name: string; description: string }> = {}
): Army {
    return {
        armyName: 'Test Army',
        faction: 'Test',
        pointsTotal: 1000,
        units: [],
        rules: Object.fromEntries(
            Object.entries(rules).map(([id, r]) => [id, { id, ...r }])
        ),
        abilities: Object.fromEntries(
            Object.entries(abilities).map(([id, a]) => [id, { id, ...a }])
        )
    };
}

describe('AbilityParser', () => {
    let parser: AbilityParser;

    beforeEach(() => {
        parser = new AbilityParser();
    });

    describe('Deployment Abilities', () => {
        it('should detect Scout ability with distance', () => {
            const army = createTestArmy({}, {
                'scout-ability': { name: 'Scout 9"', description: 'This unit can make a 9" Scout move.' }
            });
            const unit = createTestUnit('u1', 'Rangers', [], ['scout-ability']);

            expect(parser.hasScout(unit, army)).toBe(true);
            expect(parser.getScoutDistance(unit, army)).toBe(9);
        });

        it('should detect Scout with default distance when no number specified', () => {
            const army = createTestArmy({}, {
                'scout-ability': { name: 'Scout', description: 'This unit has Scout.' }
            });
            const unit = createTestUnit('u1', 'Rangers', [], ['scout-ability']);

            expect(parser.hasScout(unit, army)).toBe(true);
            expect(parser.getScoutDistance(unit, army)).toBe(6);
        });

        it('should detect Infiltrator ability', () => {
            const army = createTestArmy({}, {
                'inf-ability': { name: 'Infiltrator', description: 'This unit can deploy anywhere.' }
            });
            const unit = createTestUnit('u1', 'Scouts', [], ['inf-ability']);

            expect(parser.hasInfiltrator(unit, army)).toBe(true);
        });

        it('should detect Deep Strike ability', () => {
            const army = createTestArmy({}, {
                'ds-ability': { name: 'Deep Strike', description: 'This unit can arrive from reserves.' }
            });
            const unit = createTestUnit('u1', 'Terminators', [], ['ds-ability']);

            expect(parser.hasDeepStrike(unit, army)).toBe(true);
        });

        it('should detect Deep Strike with space or without', () => {
            // Without space
            const army1 = createTestArmy({}, {
                'ds': { name: 'Deepstrike', description: 'Can deepstrike.' }
            });
            const unit1 = createTestUnit('u1', 'Test', [], ['ds']);
            expect(parser.hasDeepStrike(unit1, army1)).toBe(true);

            // With space
            parser.clearCache();
            const army2 = createTestArmy({}, {
                'ds': { name: 'Deep Strike', description: 'Can deep strike.' }
            });
            const unit2 = createTestUnit('u2', 'Test', [], ['ds']);
            expect(parser.hasDeepStrike(unit2, army2)).toBe(true);
        });
    });

    describe('Defensive Abilities', () => {
        it('should detect Stealth ability', () => {
            const army = createTestArmy({}, {
                'stealth': { name: 'Stealth', description: 'Subtract 1 from hit rolls targeting this unit.' }
            });
            const unit = createTestUnit('u1', 'Rangers', [], ['stealth']);

            expect(parser.hasStealth(unit, army)).toBe(true);
            expect(parser.getStealthModifier(unit, army)).toBe(-1);
        });

        it('should detect Feel No Pain ability with value', () => {
            const army = createTestArmy({}, {
                'fnp': { name: 'Feel No Pain 5+', description: 'This model has Feel No Pain 5+.' }
            });
            const unit = createTestUnit('u1', 'Plague Marines', [], ['fnp']);

            expect(parser.hasFeelNoPain(unit, army)).toBe(true);
            expect(parser.getFeelNoPainValue(unit, army)).toBe(5);
        });

        it('should detect Invulnerable Save', () => {
            const army = createTestArmy({}, {
                'invuln': { name: 'Storm Shield', description: 'This model has a 4+ invulnerable save.' }
            });
            const unit = createTestUnit('u1', 'Terminators', [], ['invuln']);

            expect(parser.hasInvulnerableSave(unit, army)).toBe(true);
            expect(parser.getInvulnerableSaveValue(unit, army)).toBe(4);
        });
    });

    describe('Movement Abilities', () => {
        it('should detect Fly keyword', () => {
            const army = createTestArmy({
                'fly': { name: 'Fly', description: 'This unit can Fly.' }
            });
            const unit = createTestUnit('u1', 'Jump Marines', ['fly']);

            expect(parser.canFly(unit, army)).toBe(true);
        });

        it('should detect Advance and Charge', () => {
            const army = createTestArmy({}, {
                'aa': { name: 'Assault Ramp', description: 'This unit can Advance and Charge.' }
            });
            const unit = createTestUnit('u1', 'Assault Marines', [], ['aa']);

            expect(parser.canAdvanceAndCharge(unit, army)).toBe(true);
        });
    });

    describe('Combat Abilities', () => {
        it('should detect re-roll hits', () => {
            const army = createTestArmy({}, {
                'rr': { name: 'Captain Aura', description: 'Re-roll hit rolls of 1.' }
            });
            const unit = createTestUnit('u1', 'Captain', [], ['rr']);

            const rerolls = parser.getRerolls(unit, army);
            expect(rerolls.hits).toBe('ones');
        });

        it('should detect +1 to hit modifier', () => {
            const army = createTestArmy({}, {
                'buff': { name: 'Marksman', description: 'Add +1 to hit rolls.' }
            });
            const unit = createTestUnit('u1', 'Sniper', [], ['buff']);

            const modifiers = parser.getModifiers(unit, army);
            expect(modifiers.hit).toBe(1);
        });
    });

    describe('Objective Abilities', () => {
        it('should detect Objective Secured', () => {
            const army = createTestArmy({
                'obsec': { name: 'Objective Secured', description: 'This unit has Objective Secured.' }
            });
            const unit = createTestUnit('u1', 'Tacticals', ['obsec']);

            expect(parser.hasObjectiveSecured(unit, army)).toBe(true);
        });
    });

    describe('Caching', () => {
        it('should cache parsed results', () => {
            const army = createTestArmy({}, {
                'scout': { name: 'Scout 6"', description: 'Scout move.' }
            });
            const unit = createTestUnit('u1', 'Rangers', [], ['scout']);

            // First parse
            const result1 = parser.parseUnit(unit, army);
            // Second parse should return same object (cached)
            const result2 = parser.parseUnit(unit, army);

            expect(result1).toBe(result2);
        });

        it('should clear cache', () => {
            const army = createTestArmy({}, {
                'scout': { name: 'Scout 6"', description: 'Scout move.' }
            });
            const unit = createTestUnit('u1', 'Rangers', [], ['scout']);

            const result1 = parser.parseUnit(unit, army);
            parser.clearCache();
            const result2 = parser.parseUnit(unit, army);

            // Should be different objects after cache clear
            expect(result1).not.toBe(result2);
            // But with same values
            expect(result1.hasScout).toBe(result2.hasScout);
        });
    });

    describe('Fallback (no army provided)', () => {
        it('should match against raw rule IDs when no army provided', () => {
            const unit = createTestUnit('u1', 'Test', ['scout', 'deep strike']);

            expect(parser.hasScout(unit)).toBe(true);
            expect(parser.hasDeepStrike(unit)).toBe(true);
        });
    });

    describe('Global singleton', () => {
        it('should provide a global parser instance', () => {
            const unit = createTestUnit('u1', 'Test', ['fly']);
            expect(abilityParser.canFly(unit)).toBe(true);
        });
    });
});
