/**
 * Stratagem Registry - Core Stratagems for Warhammer 40K 10th Edition
 * 
 * Stratagems are tactical options that cost Command Points (CP) to use.
 * In 10th edition, players start with a base number of CP and gain more
 * during the Command Phase.
 */

// ============================================================================
// TYPES
// ============================================================================

export type StratagemPhase = 'any' | 'command' | 'movement' | 'shooting' | 'charge' | 'fight';

export type StratagemTrigger =
    | 'before-hit-roll'
    | 'after-hit-roll'
    | 'after-wound-roll'
    | 'after-save-roll'
    | 'before-damage'
    | 'phase-start'
    | 'phase-end'
    | 'when-targeted'
    | 'when-destroyed';

export interface Stratagem {
    id: string;
    name: string;
    cpCost: number;
    phases: StratagemPhase[];
    trigger: StratagemTrigger;
    description: string;
    /** Can this stratagem be used multiple times per phase */
    oncePerPhase?: boolean;
    /** Is this a universal stratagem available to all armies */
    universal: boolean;
}

export interface StratagemUsage {
    stratagemId: string;
    phase: StratagemPhase;
    turn: number;
    army: 'armyA' | 'armyB';
    targetUnitId?: string;
    success: boolean;
}

export interface CommandPointState {
    cpRemaining: number;
    cpGenerated: number;
    cpSpent: number;
    stratagemUsage: StratagemUsage[];
}

// ============================================================================
// UNIVERSAL STRATAGEMS
// ============================================================================

/**
 * Core Stratagems available to all armies in 10th edition
 */
export const UNIVERSAL_STRATAGEMS: Stratagem[] = [
    {
        id: 'command-reroll',
        name: 'Command Re-roll',
        cpCost: 1,
        phases: ['any'],
        trigger: 'after-hit-roll', // Can be used after any dice roll
        description: 'Re-roll one dice roll made for a model or unit from your army.',
        oncePerPhase: false, // Can be used multiple times (once per dice roll)
        universal: true
    },
    {
        id: 'epic-challenge',
        name: 'Epic Challenge',
        cpCost: 1,
        phases: ['fight'],
        trigger: 'phase-start',
        description: 'Select one Character in your army. Until the end of the phase, each time that model makes a melee attack that targets an enemy Character, add 1 to the Wound roll.',
        oncePerPhase: true,
        universal: true
    },
    {
        id: 'insane-bravery',
        name: 'Insane Bravery',
        cpCost: 1,
        phases: ['command'],
        trigger: 'after-save-roll',
        description: 'Select one unit from your army that is about to take a Battle-shock test. That test is automatically passed.',
        oncePerPhase: true,
        universal: true
    },
    {
        id: 'counter-offensive',
        name: 'Counter-offensive',
        cpCost: 2,
        phases: ['fight'],
        trigger: 'phase-start',
        description: 'Select one unit from your army that has not been selected to fight this phase. That unit fights next.',
        oncePerPhase: true,
        universal: true
    },
    {
        id: 'fire-overwatch',
        name: 'Fire Overwatch',
        cpCost: 1,
        phases: ['charge'],
        trigger: 'when-targeted',
        description: 'When an enemy unit declares a charge against one of your units, that unit can fire Overwatch at the charging unit.',
        oncePerPhase: true,
        universal: true
    },
    {
        id: 'heroic-intervention',
        name: 'Heroic Intervention',
        cpCost: 2,
        phases: ['charge'],
        trigger: 'phase-end',
        description: 'If at the end of the Charge phase any enemy units are within Engagement Range of one of your Character units, that Character can perform a Heroic Intervention.',
        oncePerPhase: true,
        universal: true
    }
];

// ============================================================================
// STRATAGEM REGISTRY
// ============================================================================

const stratagemMap = new Map<string, Stratagem>();

// Initialize with universal stratagems
UNIVERSAL_STRATAGEMS.forEach(s => stratagemMap.set(s.id, s));

/**
 * Get a stratagem by its ID
 */
export function getStratagem(id: string): Stratagem | undefined {
    return stratagemMap.get(id);
}

/**
 * Get all universal stratagems
 */
export function getUniversalStratagems(): Stratagem[] {
    return UNIVERSAL_STRATAGEMS;
}

/**
 * Get stratagems usable in a specific phase
 */
export function getStratagemsByPhase(phase: StratagemPhase): Stratagem[] {
    return UNIVERSAL_STRATAGEMS.filter(s =>
        s.phases.includes(phase) || s.phases.includes('any')
    );
}

// ============================================================================
// CP MANAGEMENT
// ============================================================================

/**
 * Create initial CP state for an army
 * In 10th edition, players typically start with 0 CP and gain CP during the Command Phase
 */
export function createInitialCPState(): CommandPointState {
    return {
        cpRemaining: 0,
        cpGenerated: 0,
        cpSpent: 0,
        stratagemUsage: []
    };
}

/**
 * Generate CP at the start of the Command Phase
 * In 10th edition, the player whose turn it is gains 1 CP
 */
export function generateCP(state: CommandPointState, amount: number = 1): CommandPointState {
    return {
        ...state,
        cpRemaining: state.cpRemaining + amount,
        cpGenerated: state.cpGenerated + amount
    };
}

/**
 * Check if a stratagem can be used (enough CP and not already used if once per phase)
 */
export function canUseStratagem(
    state: CommandPointState,
    stratagemId: string,
    currentPhase: StratagemPhase,
    currentTurn: number
): { canUse: boolean; reason?: string } {
    const stratagem = getStratagem(stratagemId);

    if (!stratagem) {
        return { canUse: false, reason: 'Unknown stratagem' };
    }

    if (state.cpRemaining < stratagem.cpCost) {
        return { canUse: false, reason: `Not enough CP (need ${stratagem.cpCost}, have ${state.cpRemaining})` };
    }

    if (!stratagem.phases.includes(currentPhase) && !stratagem.phases.includes('any')) {
        return { canUse: false, reason: `Cannot use in ${currentPhase} phase` };
    }

    if (stratagem.oncePerPhase) {
        const usedThisPhase = state.stratagemUsage.some(
            u => u.stratagemId === stratagemId && u.turn === currentTurn && u.phase === currentPhase
        );
        if (usedThisPhase) {
            return { canUse: false, reason: 'Already used this phase' };
        }
    }

    return { canUse: true };
}

/**
 * Use a stratagem, spending CP
 */
export function useStratagem(
    state: CommandPointState,
    stratagemId: string,
    phase: StratagemPhase,
    turn: number,
    army: 'armyA' | 'armyB',
    targetUnitId?: string
): CommandPointState {
    const stratagem = getStratagem(stratagemId);
    if (!stratagem) return state;

    return {
        ...state,
        cpRemaining: state.cpRemaining - stratagem.cpCost,
        cpSpent: state.cpSpent + stratagem.cpCost,
        stratagemUsage: [
            ...state.stratagemUsage,
            {
                stratagemId,
                phase,
                turn,
                army,
                targetUnitId,
                success: true
            }
        ]
    };
}
