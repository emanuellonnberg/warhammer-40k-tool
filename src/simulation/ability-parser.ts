/**
 * Centralized Ability Parser for Warhammer 40K simulation
 * 
 * Provides a single source of truth for detecting and parsing unit abilities,
 * replacing scattered string matching throughout the codebase.
 */

import type { Unit, Army, RerollConfig, AttackModifiers } from '../types';
import { RerollType } from '../types';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Categories of abilities in Warhammer 40K
 */
export type AbilityCategory =
    | 'deployment'    // Scout, Infiltrator, Deep Strike
    | 'defensive'     // Stealth, Feel No Pain, Invulnerable Save
    | 'combat'        // Re-rolls, +1 to hit/wound
    | 'movement'      // Fly, Advance and Charge
    | 'aura'          // Abilities that affect nearby units
    | 'objective';    // Objective Secured, etc.

/**
 * Parsed ability with structured data
 */
export interface ParsedAbility {
    name: string;
    category: AbilityCategory;
    effect: string;
    value?: number;           // Numeric value (e.g., 6 for Scout 6", 5+ for FNP)
    range?: number;           // Aura range in inches
    conditions?: string[];    // Conditions for the ability
    rawText: string;          // Original ability text
}

/**
 * Cached ability results for a unit
 */
export interface UnitAbilityCache {
    // Deployment
    hasScout: boolean;
    scoutDistance: number;
    hasInfiltrator: boolean;
    hasDeepStrike: boolean;

    // Defensive
    hasStealth: boolean;
    stealthModifier: number;
    hasFeelNoPain: boolean;
    feelNoPainValue: number;
    hasInvulnerableSave: boolean;
    invulnerableSaveValue: number;

    // Combat
    rerolls: RerollConfig;
    modifiers: AttackModifiers;

    // Movement
    canFly: boolean;
    canAdvanceAndCharge: boolean;
    canFallBackAndShoot: boolean;
    canFallBackAndCharge: boolean;

    // Objective
    hasObjectiveSecured: boolean;

    // Combat Sequencing
    hasFightsFirst: boolean;
    hasFightsLast: boolean;

    // All parsed abilities
    allAbilities: ParsedAbility[];
}

// ============================================================================
// ABILITY DEFINITIONS
// ============================================================================

/**
 * Known ability patterns and their effects
 */
const ABILITY_PATTERNS = {
    // Deployment abilities
    scout: {
        pattern: /scout\s*(\d+)?["\u201d]?/i,
        category: 'deployment' as AbilityCategory,
        effect: 'scout-move',
        defaultValue: 6
    },
    infiltrator: {
        pattern: /infiltrator/i,
        category: 'deployment' as AbilityCategory,
        effect: 'infiltrate'
    },
    deepStrike: {
        pattern: /deep\s*strike/i,
        category: 'deployment' as AbilityCategory,
        effect: 'deep-strike'
    },

    // Defensive abilities
    stealth: {
        pattern: /stealth|shadow|concealment|hard to hit/i,
        category: 'defensive' as AbilityCategory,
        effect: 'ranged-defense',
        defaultValue: -1
    },
    feelNoPain: {
        pattern: /feel no pain\s*(\d+)\+?/i,
        category: 'defensive' as AbilityCategory,
        effect: 'damage-reduction'
    },
    invulnerable: {
        pattern: /invulnerable\s*save?\s*(\d+)\+?|(\d+)\+?\s*invulnerable/i,
        category: 'defensive' as AbilityCategory,
        effect: 'invulnerable-save'
    },

    // Movement abilities
    fly: {
        pattern: /\bfly\b/i,
        category: 'movement' as AbilityCategory,
        effect: 'fly'
    },
    advanceAndCharge: {
        pattern: /advance\s*and\s*charge/i,
        category: 'movement' as AbilityCategory,
        effect: 'advance-and-charge'
    },
    fallBackAndShoot: {
        pattern: /fall\s*back\s*and\s*shoot/i,
        category: 'movement' as AbilityCategory,
        effect: 'fall-back-and-shoot'
    },
    fallBackAndCharge: {
        pattern: /fall\s*back\s*and\s*charge/i,
        category: 'movement' as AbilityCategory,
        effect: 'fall-back-and-charge'
    },

    // Combat abilities
    rerollHits: {
        pattern: /re-?roll\s*(all\s*)?(failed\s*)?(hit|to\s*hit)/i,
        category: 'combat' as AbilityCategory,
        effect: 'reroll-hits'
    },
    rerollWounds: {
        pattern: /re-?roll\s*(all\s*)?(failed\s*)?(wound|to\s*wound)/i,
        category: 'combat' as AbilityCategory,
        effect: 'reroll-wounds'
    },
    rerollOnes: {
        pattern: /re-?roll\s*(hit\s*)?rolls?\s*of\s*1/i,
        category: 'combat' as AbilityCategory,
        effect: 'reroll-ones'
    },
    plusOneToHit: {
        pattern: /\+1\s*to\s*hit/i,
        category: 'combat' as AbilityCategory,
        effect: 'plus-one-hit',
        defaultValue: 1
    },
    plusOneToWound: {
        pattern: /\+1\s*to\s*wound/i,
        category: 'combat' as AbilityCategory,
        effect: 'plus-one-wound',
        defaultValue: 1
    },

    objectiveSecured: {
        pattern: /objective\s*secured|ob\s*sec/i,
        category: 'objective' as AbilityCategory,
        effect: 'objective-secured'
    },

    // Combat Sequencing abilities
    fightsFirst: {
        pattern: /fights?\s*first/i,
        category: 'combat' as AbilityCategory,
        effect: 'fights-first'
    },
    fightsLast: {
        pattern: /fights?\s*last/i,
        category: 'combat' as AbilityCategory,
        effect: 'fights-last'
    }
};

// ============================================================================
// ABILITY PARSER CLASS
// ============================================================================

/**
 * Centralized ability parser for Warhammer 40K units
 */
export class AbilityParser {
    private cache = new Map<string, UnitAbilityCache>();

    /**
     * Get all ability text for a unit (rules + abilities)
     */
    static getAbilityText(unit: Unit, army?: Army): string[] {
        const texts: string[] = [];

        // Get rule texts
        for (const ruleId of unit.rules || []) {
            if (army?.rules?.[ruleId]) {
                const rule = army.rules[ruleId];
                texts.push(rule.name);
                texts.push(rule.description);
            } else if (typeof ruleId === 'string') {
                texts.push(ruleId);
            }
        }

        // Get ability texts
        for (const abilityId of unit.abilities || []) {
            if (army?.abilities?.[abilityId]) {
                const ability = army.abilities[abilityId];
                texts.push(ability.name);
                texts.push(ability.description);
            } else if (typeof abilityId === 'string') {
                texts.push(abilityId);
            }
        }

        return texts;
    }

    /**
     * Parse all abilities for a unit
     */
    parseUnit(unit: Unit, army?: Army): UnitAbilityCache {
        const cacheKey = `${unit.id}-${army?.armyName || 'no-army'}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        const texts = AbilityParser.getAbilityText(unit, army);
        const combinedText = texts.join(' ');

        const result: UnitAbilityCache = {
            // Deployment
            hasScout: false,
            scoutDistance: 0,
            hasInfiltrator: false,
            hasDeepStrike: false,

            // Defensive
            hasStealth: false,
            stealthModifier: 0,
            hasFeelNoPain: false,
            feelNoPainValue: 0,
            hasInvulnerableSave: false,
            invulnerableSaveValue: 0,

            // Combat
            rerolls: {},
            modifiers: {},

            // Movement  
            canFly: false,
            canAdvanceAndCharge: false,
            canFallBackAndShoot: false,
            canFallBackAndCharge: false,

            // Objective
            hasObjectiveSecured: false,

            // Combat Sequencing
            hasFightsFirst: false,
            hasFightsLast: false,

            allAbilities: []
        };

        // Parse each ability pattern
        for (const [name, def] of Object.entries(ABILITY_PATTERNS)) {
            const match = combinedText.match(def.pattern);
            if (match) {
                const parsed: ParsedAbility = {
                    name,
                    category: def.category,
                    effect: def.effect,
                    rawText: match[0]
                };

                // Extract numeric value if present (check both capture groups for patterns with alternation)
                if (match[1]) {
                    parsed.value = parseInt(match[1], 10);
                } else if (match[2]) {
                    parsed.value = parseInt(match[2], 10);
                } else if ('defaultValue' in def) {
                    parsed.value = def.defaultValue;
                }

                result.allAbilities.push(parsed);

                // Set specific flags
                this.applyAbilityToCache(name, parsed, result);
            }
        }

        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * Apply parsed ability to cache flags
     */
    private applyAbilityToCache(name: string, ability: ParsedAbility, cache: UnitAbilityCache): void {
        switch (name) {
            case 'scout':
                cache.hasScout = true;
                cache.scoutDistance = ability.value || 6;
                break;
            case 'infiltrator':
                cache.hasInfiltrator = true;
                break;
            case 'deepStrike':
                cache.hasDeepStrike = true;
                break;
            case 'stealth':
                cache.hasStealth = true;
                cache.stealthModifier = ability.value || -1;
                break;
            case 'feelNoPain':
                cache.hasFeelNoPain = true;
                cache.feelNoPainValue = ability.value || 6;
                break;
            case 'invulnerable':
                cache.hasInvulnerableSave = true;
                cache.invulnerableSaveValue = ability.value || 4;
                break;
            case 'fly':
                cache.canFly = true;
                break;
            case 'advanceAndCharge':
                cache.canAdvanceAndCharge = true;
                break;
            case 'fallBackAndShoot':
                cache.canFallBackAndShoot = true;
                break;
            case 'fallBackAndCharge':
                cache.canFallBackAndCharge = true;
                break;
            case 'rerollHits':
                cache.rerolls.hits = RerollType.FAILED;
                break;
            case 'rerollWounds':
                cache.rerolls.wounds = RerollType.FAILED;
                break;
            case 'rerollOnes':
                cache.rerolls.hits = RerollType.ONES;
                break;
            case 'plusOneToHit':
                cache.modifiers.hit = (cache.modifiers.hit || 0) + 1;
                break;
            case 'plusOneToWound':
                cache.modifiers.wound = (cache.modifiers.wound || 0) + 1;
                break;
            case 'objectiveSecured':
                cache.hasObjectiveSecured = true;
                break;
            case 'fightsFirst':
                cache.hasFightsFirst = true;
                break;
            case 'fightsLast':
                cache.hasFightsLast = true;
                break;
        }
    }

    /**
     * Clear the cache (useful for testing or when army data changes)
     */
    clearCache(): void {
        this.cache.clear();
    }

    // ============================================================================
    // CONVENIENCE METHODS
    // ============================================================================

    hasAbility(unit: Unit, army: Army | undefined, abilityName: string): boolean {
        const cache = this.parseUnit(unit, army);
        return cache.allAbilities.some(a => a.name === abilityName);
    }

    hasScout(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasScout;
    }

    getScoutDistance(unit: Unit, army?: Army): number {
        return this.parseUnit(unit, army).scoutDistance;
    }

    hasInfiltrator(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasInfiltrator;
    }

    hasDeepStrike(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasDeepStrike;
    }

    hasStealth(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasStealth;
    }

    getStealthModifier(unit: Unit, army?: Army): number {
        return this.parseUnit(unit, army).stealthModifier;
    }

    hasFeelNoPain(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasFeelNoPain;
    }

    getFeelNoPainValue(unit: Unit, army?: Army): number {
        return this.parseUnit(unit, army).feelNoPainValue;
    }

    hasInvulnerableSave(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasInvulnerableSave;
    }

    getInvulnerableSaveValue(unit: Unit, army?: Army): number {
        return this.parseUnit(unit, army).invulnerableSaveValue;
    }

    canFly(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).canFly;
    }

    canAdvanceAndCharge(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).canAdvanceAndCharge;
    }

    hasObjectiveSecured(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasObjectiveSecured;
    }

    getRerolls(unit: Unit, army?: Army): RerollConfig {
        return this.parseUnit(unit, army).rerolls;
    }

    getModifiers(unit: Unit, army?: Army): AttackModifiers {
        return this.parseUnit(unit, army).modifiers;
    }

    hasFightsFirst(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasFightsFirst;
    }

    hasFightsLast(unit: Unit, army?: Army): boolean {
        return this.parseUnit(unit, army).hasFightsLast;
    }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Global parser instance for convenience
 */
export const abilityParser = new AbilityParser();
