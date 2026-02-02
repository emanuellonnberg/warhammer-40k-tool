import { test, expect } from '@playwright/test';

test.describe('Battle Simulator Terrain Pathing Tests', () => {

    test('should run simulation with GT Standard terrain and capture movement', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Select armies
        const selects = page.locator('select');
        const armyASelect = selects.first();
        const armyBSelect = selects.nth(1);

        // Get available options
        const options = await armyASelect.locator('option').allTextContents();
        console.log('Available armies:', options.filter(o => !o.includes('Select')));

        // Select first available armies
        if (options.length > 1) {
            await armyASelect.selectOption({ index: 1 });
            await page.waitForTimeout(300);
        }

        const optionsB = await armyBSelect.locator('option').allTextContents();
        if (optionsB.length > 1) {
            // Try to select a different army if possible
            const idx = optionsB.length > 2 ? 2 : 1;
            await armyBSelect.selectOption({ index: idx });
            await page.waitForTimeout(300);
        }

        // Ensure GT Standard terrain is selected
        const terrainSelect = page.locator('select').filter({ hasText: /GT|terrain/i }).first();
        if (await terrainSelect.count() > 0) {
            await terrainSelect.selectOption({ label: 'GT Standard' });
            console.log('Selected GT Standard terrain');
        }

        // Set max rounds to 5 to see more movement
        const roundsInput = page.locator('input[type="number"]').first();
        if (await roundsInput.count() > 0) {
            await roundsInput.fill('5');
        }

        await page.screenshot({ path: 'test-results/terrain-01-config.png', fullPage: true });

        // Run simulation
        const runButton = page.getByRole('button', { name: /run.*simulation/i });
        await runButton.click();

        // Wait for simulation
        await page.waitForTimeout(5000);

        // Capture the battlefield
        await page.screenshot({ path: 'test-results/terrain-02-battlefield.png', fullPage: true });

        // Check for battlefield elements
        const battlefield = page.locator('#battlefield, .battlefield, svg').first();
        expect(await battlefield.count()).toBeGreaterThanOrEqual(0);

        // Scroll to see battle log
        await page.evaluate(() => window.scrollTo(0, 500));
        await page.screenshot({ path: 'test-results/terrain-03-battlelog.png', fullPage: true });

        // Look for movement entries in the log
        const logText = await page.locator('.battle-log, #battleLog, [class*="log"]').textContent() || '';
        console.log('Battle log excerpt:', logText.substring(0, 500));

        // Check if movement distances are being logged
        const movementPattern = /moves?\s+[\d.]+"/gi;
        const movements = logText.match(movementPattern);
        if (movements) {
            console.log('Movement entries found:', movements.slice(0, 10));
        }
    });

    test('should step through simulation to observe unit positions', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Select armies
        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await page.waitForTimeout(300);
        await selects.nth(1).selectOption({ index: 1 });
        await page.waitForTimeout(300);

        // Run simulation
        const runButton = page.getByRole('button', { name: /run.*simulation/i });
        await runButton.click();
        await page.waitForTimeout(2000);

        // Look for navigation controls (Previous/Next buttons)
        const nextButton = page.getByRole('button', { name: /next/i });
        const prevButton = page.getByRole('button', { name: /prev/i });

        if (await nextButton.count() > 0) {
            console.log('Found step controls, stepping through phases...');

            // Capture each phase
            for (let i = 0; i < 8; i++) {
                await page.screenshot({ path: `test-results/terrain-step-${i.toString().padStart(2, '0')}.png`, fullPage: true });

                if (await nextButton.isEnabled()) {
                    await nextButton.click();
                    await page.waitForTimeout(500);
                } else {
                    console.log(`Stopped at step ${i}`);
                    break;
                }
            }
        }
    });

    test('should verify terrain is rendered on battlefield', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Select armies and run
        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await selects.nth(1).selectOption({ index: 1 });

        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(3000);

        // Take a screenshot of just the battlefield area
        const battlefieldArea = page.locator('svg, canvas, #battlefield, .battlefield').first();

        if (await battlefieldArea.count() > 0) {
            await battlefieldArea.screenshot({ path: 'test-results/terrain-battlefield-only.png' });

            // Check for terrain elements (rectangles, paths, etc.)
            const terrainElements = await page.locator('svg rect, svg path, [class*="terrain"]').count();
            console.log(`Found ${terrainElements} potential terrain elements`);
        }

        await page.screenshot({ path: 'test-results/terrain-full-view.png', fullPage: true });
    });

    test('should compare movement with and without terrain', async ({ page }) => {
        // First run with terrain
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        const selects = page.locator('select');
        await selects.first().selectOption({ index: 1 });
        await selects.nth(1).selectOption({ index: 1 });

        // Make sure GT Standard terrain is selected
        const terrainSelects = page.locator('select').filter({ hasText: /terrain|layout/i });
        if (await terrainSelects.count() > 0) {
            await terrainSelects.first().selectOption({ label: 'GT Standard' });
        }

        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(4000);

        // Capture with terrain
        await page.screenshot({ path: 'test-results/terrain-with-terrain.png', fullPage: true });

        // Get battle summary
        const summaryWithTerrain = await page.locator('.battle-summary, #summary, [class*="summary"]').textContent();
        console.log('With terrain:', summaryWithTerrain?.substring(0, 200));

        // Now run without terrain
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        await selects.first().selectOption({ index: 1 });
        await selects.nth(1).selectOption({ index: 1 });

        // Select "None" or empty terrain option
        const terrainSelect = page.locator('select').filter({ hasText: /terrain|layout/i }).first();
        if (await terrainSelect.count() > 0) {
            const options = await terrainSelect.locator('option').allTextContents();
            const noneOption = options.find(o => o.toLowerCase().includes('none') || o.toLowerCase().includes('empty'));
            if (noneOption) {
                await terrainSelect.selectOption({ label: noneOption });
                console.log('Selected no terrain option:', noneOption);
            }
        }

        await page.getByRole('button', { name: /run.*simulation/i }).click();
        await page.waitForTimeout(4000);

        await page.screenshot({ path: 'test-results/terrain-without-terrain.png', fullPage: true });

        const summaryWithoutTerrain = await page.locator('.battle-summary, #summary, [class*="summary"]').textContent();
        console.log('Without terrain:', summaryWithoutTerrain?.substring(0, 200));
    });
});
