import { describe, it, expect } from 'vitest';
import {
    detectAuras,
    getAppliedAuraEffects,
    ABILITY_REGISTRY,
    getAbilityDefinition,
    registerAbility,
    type AuraAbility
} from '../src/simulation/ability-registry';
import { RerollType } from '../src/types';
import type { Unit } from '../src/types';

function createUnit(id: string, rules: string[] = [], abilities: string[] = []): Unit {
    return {
        id,
        name: `Unit ${id}`,
        type: 'Infantry',
        stats: { move: '6', toughness: '4', save: '3+', wounds: '2', leadership: '6+', objectiveControl: '1' },
        points: 100,
        count: 5,
        weapons: [],
        rules,
        abilities
    };
}

describe('Ability Registry', () => {
    describe('Registry Operations', () => {
        it('should have pre-defined abilities', () => {
            expect(ABILITY_REGISTRY.size).toBeGreaterThan(0);
            expect(getAbilityDefinition('rites-of-battle')).toBeDefined();
        });

        it('should allow registering new abilities', () => {
            registerAbility({
                id: 'test-ability',
                name: 'Test Ability',
                description: 'A test ability',
                effects: []
            });
            expect(getAbilityDefinition('test-ability')).toBeDefined();
        });
    });

    describe('Aura Detection', () => {
        it('should detect Captain re-roll 1s to hit aura', () => {
            const captain = createUnit('cap1', [], [
                'While a friendly unit is within 6" of this model, re-roll hit rolls of 1'
            ]);
            const auras = detectAuras(captain, { x: 10, y: 10 });

            // Find the hit reroll aura
            const hitRerollAura = auras.find(a => a.effect.type === 'reroll-hits');
            expect(hitRerollAura).toBeDefined();
            expect(hitRerollAura!.range).toBe(6);
            expect(hitRerollAura!.effect.rerollType).toBe(RerollType.ONES);
        });

        it('should detect Lieutenant re-roll 1s to wound aura', () => {
            const lt = createUnit('lt1', [], [
                'While a friendly unit is within 6" this model, re-roll wound rolls of 1'
            ]);
            const auras = detectAuras(lt, { x: 10, y: 10 });

            const woundRerollAura = auras.find(a => a.effect.type === 'reroll-wounds');
            expect(woundRerollAura).toBeDefined();
            expect(woundRerollAura!.effect.rerollType).toBe(RerollType.ONES);
        });

        it('should detect full re-roll hit aura', () => {
            const cm = createUnit('cm1', [], [
                'While a friendly CORE unit is within 6" you can re-roll the hit roll'
            ]);
            const auras = detectAuras(cm, { x: 10, y: 10 });

            const hitRerollAura = auras.find(a => a.effect.type === 'reroll-hits');
            expect(hitRerollAura).toBeDefined();
            expect(hitRerollAura!.effect.rerollType).toBe(RerollType.FAILED);
        });

        it('should detect cover aura', () => {
            const shroud = createUnit('s1', [], [
                'While a friendly unit is within 6" they have the benefit of cover'
            ]);
            const auras = detectAuras(shroud, { x: 10, y: 10 });

            const coverAura = auras.find(a => a.effect.type === 'cover');
            expect(coverAura).toBeDefined();
        });
    });

    describe('Aura Effect Application', () => {
        it('should apply aura effects to units in range', () => {
            const auras: AuraAbility[] = [{
                sourceUnitId: 'cap1',
                sourcePosition: { x: 10, y: 10 },
                range: 6,
                effect: {
                    type: 'reroll-hits',
                    rerollType: RerollType.ONES,
                    target: 'friendly',
                    range: 6,
                    phase: 'all'
                },
                abilityName: 'Rites of Battle'
            }];

            // Unit in range (distance = 5)
            const effectsInRange = getAppliedAuraEffects({ x: 15, y: 10 }, auras, true);
            expect(effectsInRange.hitRerolls).toBe(RerollType.ONES);
            expect(effectsInRange.sources).toContain('Rites of Battle');

            // Unit out of range (distance = 10)
            const effectsOutOfRange = getAppliedAuraEffects({ x: 20, y: 10 }, auras, true);
            expect(effectsOutOfRange.hitRerolls).toBeUndefined();
        });

        it('should not apply friendly auras to enemies', () => {
            const auras: AuraAbility[] = [{
                sourceUnitId: 'cap1',
                sourcePosition: { x: 10, y: 10 },
                range: 6,
                effect: {
                    type: 'reroll-hits',
                    rerollType: RerollType.ONES,
                    target: 'friendly',
                    range: 6,
                    phase: 'all'
                },
                abilityName: 'Rites of Battle'
            }];

            const effects = getAppliedAuraEffects({ x: 12, y: 10 }, auras, false);
            expect(effects.hitRerolls).toBeUndefined();
        });

        it('should stack modifier effects', () => {
            const auras: AuraAbility[] = [
                {
                    sourceUnitId: 'buff1',
                    sourcePosition: { x: 10, y: 10 },
                    range: 6,
                    effect: { type: 'modifier-hit', value: 1, target: 'friendly', range: 6, phase: 'all' },
                    abilityName: 'Buff 1'
                },
                {
                    sourceUnitId: 'buff2',
                    sourcePosition: { x: 10, y: 10 },
                    range: 6,
                    effect: { type: 'modifier-hit', value: 1, target: 'friendly', range: 6, phase: 'all' },
                    abilityName: 'Buff 2'
                }
            ];

            const effects = getAppliedAuraEffects({ x: 12, y: 10 }, auras, true);
            expect(effects.hitModifier).toBe(2);
        });

        it('should prefer full rerolls over ones', () => {
            const auras: AuraAbility[] = [
                {
                    sourceUnitId: 'cap1',
                    sourcePosition: { x: 10, y: 10 },
                    range: 6,
                    effect: { type: 'reroll-hits', rerollType: RerollType.ONES, target: 'friendly', range: 6, phase: 'all' },
                    abilityName: 'Captain'
                },
                {
                    sourceUnitId: 'cm1',
                    sourcePosition: { x: 10, y: 10 },
                    range: 6,
                    effect: { type: 'reroll-hits', rerollType: RerollType.FAILED, target: 'friendly', range: 6, phase: 'all' },
                    abilityName: 'Chapter Master'
                }
            ];

            const effects = getAppliedAuraEffects({ x: 12, y: 10 }, auras, true);
            expect(effects.hitRerolls).toBe(RerollType.FAILED);
        });
    });
});
