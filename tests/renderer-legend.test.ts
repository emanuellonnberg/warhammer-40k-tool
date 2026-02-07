
import { describe, it, expect } from 'vitest';
import { renderBattlefield } from '../src/sim-ui/battlefield-renderer';
import { SimulationResult } from '../src/simulation';

describe('Battlefield Renderer', () => {
    it('should include a legend in the output', () => {
        const mockResult: any = {
            winner: 'armyA',
            scoreA: 10,
            scoreB: 5,
            logs: [],
            positions: {
                start: {
                    armyA: [{ unitId: 'u1', name: 'Unit A', x: 0, y: 0, models: [], role: 'HQ' }] as any,
                    armyB: [{ unitId: 'u2', name: 'Unit B', x: 10, y: 10, models: [], role: 'Battleline' }] as any
                },
                end: {
                    armyA: [{ unitId: 'u1', name: 'Unit A', x: 0, y: 0, models: [], role: 'HQ' }] as any,
                    armyB: [{ unitId: 'u2', name: 'Unit B', x: 10, y: 10, models: [], role: 'Battleline' }] as any
                }
            },
            positionsTimeline: [],
            terrain: [],
            objectives: []
        };

        const html = renderBattlefield(mockResult);
        expect(html).toContain('Terrain:');
        expect(html).toContain('Ruins');
        expect(html).toContain('Roles:');
        expect(html).toContain('★ HQ');
    });
});
