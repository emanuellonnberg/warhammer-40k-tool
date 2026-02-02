import { describe, it, expect, beforeEach } from 'vitest';
import { abilityParser } from '../src/simulation/ability-parser';
import type { Unit, Army } from '../src/types';

describe('Combat Sequencing Abilities', () => {
    // Clear cache before each test to prevent pollution
    beforeEach(() => {
        abilityParser.clearCache();
    });

    const makeUnit = (id: string): Unit => ({
        id,
        name: 'Test Unit',
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
        count: 1,
        weapons: []
    });

    const makeArmy = (abilities: Record<string, { name: string; description: string }>): Army => ({
        armyName: 'Test Army',
        faction: 'Test Faction',
        pointsTotal: 500,
        units: [],
        abilities
    });

    describe('Fights First Detection', () => {
        it('should detect Fights First ability', () => {
            const army = makeArmy({
                'fights-first': { name: 'Shock Assault', description: 'This unit has the Fights First ability.' }
            });
            const unit = { ...makeUnit('ff-1'), abilities: ['fights-first'] };

            expect(abilityParser.hasFightsFirst(unit, army)).toBe(true);
        });

        it('should detect "Fight First" variant', () => {
            const army = makeArmy({
                'fight-first': { name: 'Lightning Reflexes', description: 'This unit can Fight First in combat.' }
            });
            const unit = { ...makeUnit('ff-2'), abilities: ['fight-first'] };

            expect(abilityParser.hasFightsFirst(unit, army)).toBe(true);
        });

        it('should not detect Fights First when not present', () => {
            const army = makeArmy({
                'other-ability': { name: 'Other', description: 'Some other ability with no combat sequencing effects' }
            });
            const unit = { ...makeUnit('no-ff'), abilities: ['other-ability'] };

            expect(abilityParser.hasFightsFirst(unit, army)).toBe(false);
        });
    });

    describe('Fights Last Detection', () => {
        it('should detect Fights Last ability', () => {
            const army = makeArmy({
                'fights-last': { name: 'Slow to React', description: 'This unit has the Fights Last ability.' }
            });
            const unit = { ...makeUnit('fl-1'), abilities: ['fights-last'] };

            expect(abilityParser.hasFightsLast(unit, army)).toBe(true);
        });

        it('should detect "Fight Last" variant', () => {
            const army = makeArmy({
                'fight-last': { name: 'Cumbersome', description: 'This unit must Fight Last.' }
            });
            const unit = { ...makeUnit('fl-2'), abilities: ['fight-last'] };

            expect(abilityParser.hasFightsLast(unit, army)).toBe(true);
        });
    });

    describe('Combat Priority', () => {
        it('should correctly prioritize Fights First over normal units', () => {
            const armyFF = makeArmy({
                'blitz': { name: 'Blitz', description: 'Fights First ability in combat' }
            });
            const armyNormal = makeArmy({
                'standard': { name: 'Standard', description: 'Just a regular ability with no special rules' }
            });

            const fightsFirstUnit = { ...makeUnit('priority-ff'), abilities: ['blitz'] };
            const normalUnit = { ...makeUnit('priority-normal'), abilities: ['standard'] };

            expect(abilityParser.hasFightsFirst(fightsFirstUnit, armyFF)).toBe(true);
            expect(abilityParser.hasFightsFirst(normalUnit, armyNormal)).toBe(false);
        });

        it('should correctly identify Fights Last units', () => {
            const army = makeArmy({
                'sluggish': { name: 'Sluggish', description: 'This unit always Fights Last' }
            });

            const fightsLastUnit = { ...makeUnit('priority-fl'), abilities: ['sluggish'] };

            expect(abilityParser.hasFightsLast(fightsLastUnit, army)).toBe(true);
        });
    });
});
