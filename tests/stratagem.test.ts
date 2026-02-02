import { describe, it, expect } from 'vitest';
import {
    getStratagem,
    getUniversalStratagems,
    getStratagemsByPhase,
    createInitialCPState,
    generateCP,
    canUseStratagem,
    useStratagem
} from '../src/simulation/stratagem-registry';

describe('Stratagem Registry', () => {
    describe('Universal Stratagems', () => {
        it('should have Command Re-roll available', () => {
            const reroll = getStratagem('command-reroll');
            expect(reroll).toBeDefined();
            expect(reroll?.cpCost).toBe(1);
            expect(reroll?.phases).toContain('any');
        });

        it('should have Fire Overwatch available', () => {
            const overwatch = getStratagem('fire-overwatch');
            expect(overwatch).toBeDefined();
            expect(overwatch?.cpCost).toBe(1);
            expect(overwatch?.phases).toContain('charge');
        });

        it('should have Counter-offensive available', () => {
            const counter = getStratagem('counter-offensive');
            expect(counter).toBeDefined();
            expect(counter?.cpCost).toBe(2);
            expect(counter?.phases).toContain('fight');
        });

        it('should return all universal stratagems', () => {
            const stratagems = getUniversalStratagems();
            expect(stratagems.length).toBeGreaterThanOrEqual(6);
            expect(stratagems.every(s => s.universal)).toBe(true);
        });
    });

    describe('Phase Filtering', () => {
        it('should return stratagems usable in fight phase', () => {
            const fightStratagems = getStratagemsByPhase('fight');
            expect(fightStratagems.length).toBeGreaterThanOrEqual(2); // Counter-offensive, Epic Challenge, Command Re-roll (any)
        });

        it('should include "any" phase stratagems in all phases', () => {
            const shootingStratagems = getStratagemsByPhase('shooting');
            const hasCommandReroll = shootingStratagems.some(s => s.id === 'command-reroll');
            expect(hasCommandReroll).toBe(true);
        });
    });

    describe('CP State Management', () => {
        it('should create initial CP state with 0 CP', () => {
            const state = createInitialCPState();
            expect(state.cpRemaining).toBe(0);
            expect(state.cpGenerated).toBe(0);
            expect(state.cpSpent).toBe(0);
            expect(state.stratagemUsage).toEqual([]);
        });

        it('should generate CP correctly', () => {
            let state = createInitialCPState();
            state = generateCP(state, 1);
            expect(state.cpRemaining).toBe(1);
            expect(state.cpGenerated).toBe(1);

            state = generateCP(state, 1);
            expect(state.cpRemaining).toBe(2);
            expect(state.cpGenerated).toBe(2);
        });
    });

    describe('Stratagem Usage Validation', () => {
        it('should allow using Command Re-roll with enough CP', () => {
            let state = createInitialCPState();
            state = generateCP(state, 1);

            const result = canUseStratagem(state, 'command-reroll', 'shooting', 1);
            expect(result.canUse).toBe(true);
        });

        it('should prevent stratagem use without enough CP', () => {
            const state = createInitialCPState(); // 0 CP

            const result = canUseStratagem(state, 'command-reroll', 'shooting', 1);
            expect(result.canUse).toBe(false);
            expect(result.reason).toContain('Not enough CP');
        });

        it('should prevent once-per-phase stratagem from being used twice', () => {
            let state = createInitialCPState();
            state = generateCP(state, 5); // Need 4 CP to use Counter-offensive twice

            // Use Counter-offensive
            state = useStratagem(state, 'counter-offensive', 'fight', 1, 'armyA');

            // Try to use again same phase
            const result = canUseStratagem(state, 'counter-offensive', 'fight', 1);
            expect(result.canUse).toBe(false);
            expect(result.reason).toContain('Already used this phase');
        });

        it('should allow once-per-phase stratagem in a new phase', () => {
            let state = createInitialCPState();
            state = generateCP(state, 3);

            // Use in fight phase
            state = useStratagem(state, 'epic-challenge', 'fight', 1, 'armyA');

            // Should be able to use in fight phase next turn
            const result = canUseStratagem(state, 'epic-challenge', 'fight', 2);
            expect(result.canUse).toBe(true);
        });

        it('should prevent stratagem use in wrong phase', () => {
            let state = createInitialCPState();
            state = generateCP(state, 1);

            // Fire Overwatch is only for charge phase
            const result = canUseStratagem(state, 'fire-overwatch', 'shooting', 1);
            expect(result.canUse).toBe(false);
            expect(result.reason).toContain('Cannot use in shooting phase');
        });
    });

    describe('Using Stratagems', () => {
        it('should spend CP when using a stratagem', () => {
            let state = createInitialCPState();
            state = generateCP(state, 2);

            state = useStratagem(state, 'command-reroll', 'shooting', 1, 'armyA');

            expect(state.cpRemaining).toBe(1);
            expect(state.cpSpent).toBe(1);
        });

        it('should track stratagem usage history', () => {
            let state = createInitialCPState();
            state = generateCP(state, 5);

            state = useStratagem(state, 'command-reroll', 'shooting', 1, 'armyA', 'unit-1');
            state = useStratagem(state, 'counter-offensive', 'fight', 1, 'armyB', 'unit-2');

            expect(state.stratagemUsage.length).toBe(2);
            expect(state.stratagemUsage[0].stratagemId).toBe('command-reroll');
            expect(state.stratagemUsage[1].stratagemId).toBe('counter-offensive');
        });
    });
});
