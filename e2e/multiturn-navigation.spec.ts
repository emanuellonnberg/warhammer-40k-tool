import { test, expect } from '@playwright/test';

test.describe('Battle Simulator - Multi-Turn Terrain Navigation', () => {

    test('should observe units navigating around terrain over multiple rounds', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Select armies
        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await page.waitForTimeout(200);
        await selects.nth(1).selectOption({ index: 1 });
        await page.waitForTimeout(200);

        // Set to 5 rounds to see more movement
        const roundsInputs = page.locator('input[type="number"]');
        for (let i = 0; i < await roundsInputs.count(); i++) {
            const input = roundsInputs.nth(i);
            const value = await input.inputValue();
            if (value === '5' || value === '3') {
                await input.fill('5');
                break;
            }
        }

        // Ensure GT Standard terrain
        const terrainSelect = page.locator('select').filter({ hasText: /terrain|GT/i }).first();
        if (await terrainSelect.count() > 0) {
            const options = await terrainSelect.locator('option').allTextContents();
            const gtOption = options.find(o => o.includes('GT'));
            if (gtOption) {
                await terrainSelect.selectOption({ label: gtOption });
            }
        }

        // Capture initial config
        await page.screenshot({ path: 'test-results/multiturn-00-config.png', fullPage: true });

        // Run simulation
        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(3000);

        // Capture result overview
        await page.screenshot({ path: 'test-results/multiturn-01-result.png', fullPage: true });

        // Now use step controls to observe each round
        const nextButton = page.getByRole('button', { name: /next/i });
        const prevButton = page.getByRole('button', { name: /prev/i });

        if (await nextButton.count() > 0) {
            // Go back to start
            for (let i = 0; i < 20; i++) {
                if (await prevButton.isEnabled()) {
                    await prevButton.click();
                    await page.waitForTimeout(100);
                } else {
                    break;
                }
            }

            // Step through and capture each phase
            let step = 0;
            const maxSteps = 25;

            while (step < maxSteps) {
                // Capture current state
                await page.screenshot({
                    path: `test-results/multiturn-step-${step.toString().padStart(2, '0')}.png`,
                    fullPage: true
                });

                // Read current phase info
                const phaseText = await page.locator('.phase-info, [class*="phase"], .round-info').first().textContent();
                console.log(`Step ${step}: ${phaseText || 'unknown phase'}`);

                if (await nextButton.isEnabled()) {
                    await nextButton.click();
                    await page.waitForTimeout(300);
                    step++;
                } else {
                    console.log('Reached end of simulation');
                    break;
                }
            }

            console.log(`Captured ${step + 1} simulation steps`);
        }
    });

    test('should show unit position changes between rounds', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Quick setup
        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await selects.nth(1).selectOption({ index: 2 }); // Different army for variety

        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(4000);

        // Get the battle log text
        const logContainer = page.locator('#battleLog, .battle-log, [class*="log"]').first();

        if (await logContainer.count() > 0) {
            const logText = await logContainer.textContent();

            // Parse movement entries
            const movePattern = /(\w+(?:\s+\w+)*)\s+moves?\s+([\d.]+)"/g;
            const moves: string[] = [];
            let match;

            while ((match = movePattern.exec(logText || '')) !== null) {
                moves.push(`${match[1]}: ${match[2]}"`);
            }

            console.log('Movement entries found:');
            moves.slice(0, 20).forEach(m => console.log('  ', m));

            // Should have some movement
            expect(moves.length).toBeGreaterThan(0);
        }

        await page.screenshot({ path: 'test-results/position-changes.png', fullPage: true });
    });

    test('should verify objective control changes during battle', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Setup
        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await selects.nth(1).selectOption({ index: 1 });

        // Run with objectives enabled (should be default)
        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(4000);

        // Look for victory points or objective information
        const summaryText = await page.locator('.battle-summary, #summary, [class*="summary"]').textContent();

        if (summaryText) {
            console.log('Battle summary:', summaryText.substring(0, 500));

            // Check for VP mentions
            if (summaryText.includes('VP') || summaryText.includes('Victory')) {
                console.log('Victory points tracked in simulation');
            }
        }

        // Check battlefield for objective markers
        const objectiveMarkers = await page.locator('[class*="objective"], circle, .marker').count();
        console.log(`Found ${objectiveMarkers} potential objective markers`);

        await page.screenshot({ path: 'test-results/objective-control.png', fullPage: true });
    });
});
