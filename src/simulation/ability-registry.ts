/**
 * Ability Registry - Structured ability definitions for Warhammer 40K
 * 
 * Provides a centralized registry of ability effects, enabling:
 * - Consistent ability behavior across the codebase
 * - Easy extension with new abilities
 * - Aura effects that influence nearby units
 */

import type { Unit } from '../types';
import { RerollType } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Effect types that abilities can apply
 */
export type EffectType =
    | 'reroll-hits'
    | 'reroll-wounds'
    | 'modifier-hit'
    | 'modifier-wound'
    | 'modifier-save'
    | 'feel-no-pain'
    | 'invulnerable-save'
    | 'cover'
    | 'stealth';

/**
 * Target types for ability effects
 */
export type EffectTarget =
    | 'self'           // Only affects the unit with the ability
    | 'friendly'       // Affects friendly units
    | 'enemy'          // Affects enemy units
    | 'core'           // Affects CORE keyword units only
    | 'character'      // Affects CHARACTER keyword units only
    | 'infantry'       // Affects INFANTRY keyword units only
    | 'mounted'        // Affects MOUNTED keyword units only
    | 'all';           // Affects all units in range

/**
 * Structured ability definition
 */
export interface AbilityDefinition {
    id: string;
    name: string;
    description: string;
    effects: AbilityEffect[];
}

/**
 * A single effect from an ability
 */
export interface AbilityEffect {
    type: EffectType;
    value?: number;           // Modifier value (e.g., +1 to hit)
    rerollType?: RerollType;  // For reroll effects
    target: EffectTarget;     // Who this affects
    range?: number;           // Aura range in inches (undefined = unlimited/self)
    conditions?: string[];    // Additional conditions
    phase?: 'shooting' | 'fight' | 'all';  // When the effect applies
}

/**
 * Aura ability with computed effects
 */
export interface AuraAbility {
    sourceUnitId: string;
    sourcePosition: { x: number; y: number };
    range: number;
    effect: AbilityEffect;
    abilityName: string;
}

/**
 * Applied effects on a unit from auras
 */
export interface AppliedAuraEffects {
    hitRerolls?: RerollType;
    woundRerolls?: RerollType;
    hitModifier: number;
    woundModifier: number;
    saveModifier: number;
    hasCover: boolean;
    sources: string[];  // Names of abilities providing effects
}

// ============================================================================
// ABILITY REGISTRY
// ============================================================================

/**
 * Registry of known abilities and their effects
 * This is extensible - add new abilities here as needed
 */
export const ABILITY_REGISTRY: Map<string, AbilityDefinition> = new Map([
    // Captain-type auras
    ['rites-of-battle', {
        id: 'rites-of-battle',
        name: 'Rites of Battle',
        description: 'While a friendly unit is within 6" of this model, each time a model in that unit makes an attack, re-roll a hit roll of 1.',
        effects: [{
            type: 'reroll-hits',
            rerollType: RerollType.ONES,
            target: 'friendly',
            range: 6,
            phase: 'all'
        }]
    }],

    ['lieutenant-aura', {
        id: 'lieutenant-aura',
        name: 'Tactical Precision',
        description: 'While a friendly unit is within 6" of this model, each time a model in that unit makes an attack, re-roll a wound roll of 1.',
        effects: [{
            type: 'reroll-wounds',
            rerollType: RerollType.ONES,
            target: 'friendly',
            range: 6,
            phase: 'all'
        }]
    }],

    // Chapter Master / full reroll auras
    ['chapter-master-aura', {
        id: 'chapter-master-aura',
        name: 'Chapter Master',
        description: 'While a friendly unit is within 6" of this model, each time a model in that unit makes an attack, you can re-roll the hit roll.',
        effects: [{
            type: 'reroll-hits',
            rerollType: RerollType.FAILED,
            target: 'friendly',
            range: 6,
            phase: 'all'
        }]
    }],

    // Buff auras
    ['oath-of-moment', {
        id: 'oath-of-moment',
        name: 'Oath of Moment',
        description: '+1 to hit rolls against a selected target.',
        effects: [{
            type: 'modifier-hit',
            value: 1,
            target: 'self',
            phase: 'all'
        }]
    }],

    // Defensive auras
    ['light-cover-aura', {
        id: 'light-cover-aura',
        name: 'Shrouding',
        description: 'While a friendly unit is within 6" of this model, that unit has the benefit of cover.',
        effects: [{
            type: 'cover',
            target: 'friendly',
            range: 6,
            phase: 'all'
        }]
    }]
]);

// ============================================================================
// AURA DETECTION PATTERNS
// ============================================================================

/**
 * Patterns to detect aura abilities from text
 */
export const AURA_PATTERNS = [
    // Captain re-roll 1s to hit aura
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*re-?roll\s*(a\s*)?(hit\s*)?rolls?\s*(of\s*)?1/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'reroll-hits',
            rerollType: RerollType.ONES,
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    },
    // Lieutenant re-roll 1s to wound aura
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*re-?roll\s*(a\s*)?(wound\s*)?rolls?\s*(of\s*)?1/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'reroll-wounds',
            rerollType: RerollType.ONES,
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    },
    // Full re-roll hits aura
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*re-?roll\s*(the\s*)?hit\s*roll/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'reroll-hits',
            rerollType: RerollType.FAILED,
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    },
    // Full re-roll wounds aura  
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*re-?roll\s*(the\s*)?wound\s*roll/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'reroll-wounds',
            rerollType: RerollType.FAILED,
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    },
    // +1 to hit aura
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*\+1\s*to\s*hit/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'modifier-hit',
            value: 1,
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    },
    // Cover aura
    {
        pattern: /within\s*(\d+)["\u201d]?\s*.*(?:benefit\s*of\s*)?cover/i,
        effect: (match: RegExpMatchArray): AbilityEffect => ({
            type: 'cover',
            target: 'friendly',
            range: parseInt(match[1], 10),
            phase: 'all'
        })
    }
];

// ============================================================================
// AURA FUNCTIONS
// ============================================================================

/**
 * Detect auras from a unit's abilities
 */
export function detectAuras(unit: Unit, unitPosition: { x: number; y: number }): AuraAbility[] {
    const auras: AuraAbility[] = [];
    const detectedEffects = new Set<string>(); // Track to avoid duplicates

    // Check rules and abilities for aura patterns
    const texts = [
        ...(unit.rules || []).map(r => typeof r === 'string' ? r : ''),
        ...(unit.abilities || []).map(a => typeof a === 'string' ? a : '')
    ];

    const combinedText = texts.join(' ');

    for (const auraDef of AURA_PATTERNS) {
        const match = combinedText.match(auraDef.pattern);
        if (match) {
            const effect = auraDef.effect(match);

            // Create a key to track unique effect types
            const effectKey = `${effect.type}-${effect.rerollType || 'none'}`;

            // Skip if we already detected this effect type (avoid overlapping patterns)
            if (detectedEffects.has(effectKey)) continue;
            detectedEffects.add(effectKey);

            auras.push({
                sourceUnitId: unit.id,
                sourcePosition: unitPosition,
                range: effect.range || 6,
                effect,
                abilityName: match[0].substring(0, 30) + '...'
            });
        }
    }

    return auras;
}

/**
 * Calculate distance between two positions
 */
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Get aura effects applied to a unit at a given position
 */
export function getAppliedAuraEffects(
    unitPosition: { x: number; y: number },
    auras: AuraAbility[],
    isFriendly: boolean
): AppliedAuraEffects {
    const result: AppliedAuraEffects = {
        hitModifier: 0,
        woundModifier: 0,
        saveModifier: 0,
        hasCover: false,
        sources: []
    };

    for (const aura of auras) {
        const dist = distance(unitPosition, aura.sourcePosition);
        if (dist > aura.range) continue;

        // Check target compatibility
        const effect = aura.effect;
        if (effect.target === 'friendly' && !isFriendly) continue;
        if (effect.target === 'enemy' && isFriendly) continue;

        // Apply effect
        switch (effect.type) {
            case 'reroll-hits':
                // Take the better reroll (failed > ones)
                if (!result.hitRerolls || effect.rerollType === RerollType.FAILED) {
                    result.hitRerolls = effect.rerollType;
                }
                result.sources.push(aura.abilityName);
                break;

            case 'reroll-wounds':
                if (!result.woundRerolls || effect.rerollType === RerollType.FAILED) {
                    result.woundRerolls = effect.rerollType;
                }
                result.sources.push(aura.abilityName);
                break;

            case 'modifier-hit':
                result.hitModifier += effect.value || 0;
                result.sources.push(aura.abilityName);
                break;

            case 'modifier-wound':
                result.woundModifier += effect.value || 0;
                result.sources.push(aura.abilityName);
                break;

            case 'modifier-save':
                result.saveModifier += effect.value || 0;
                result.sources.push(aura.abilityName);
                break;

            case 'cover':
                result.hasCover = true;
                result.sources.push(aura.abilityName);
                break;
        }
    }

    return result;
}

/**
 * Get the ability definition from the registry by ID
 */
export function getAbilityDefinition(id: string): AbilityDefinition | undefined {
    return ABILITY_REGISTRY.get(id);
}

/**
 * Register a new ability definition
 */
export function registerAbility(ability: AbilityDefinition): void {
    ABILITY_REGISTRY.set(ability.id, ability);
}
