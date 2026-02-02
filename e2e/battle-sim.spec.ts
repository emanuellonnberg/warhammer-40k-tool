import { test, expect } from '@playwright/test';

test.describe('Battle Simulator Full Test', () => {
    test('should run complete simulation with armies and terrain', async ({ page }) => {
        // Navigate to the battle simulator
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Take initial screenshot
        await page.screenshot({ path: 'test-results/01-initial-page.png', fullPage: true });
        console.log('Step 1: Page loaded');

        // Check if there are any pre-existing saved armies in localStorage
        // Or select from dropdowns if they have options
        const armyADropdown = page.locator('#armyASelect, select[name="armyA"], .army-select').first();
        const armyBDropdown = page.locator('#armyBSelect, select[name="armyB"], .army-select').last();

        // Check what options are available in the dropdowns
        const armyAOptions = await page.locator('select').first().locator('option').allTextContents();
        console.log('Army A Options:', armyAOptions);

        // If there are stored armies, select them
        if (armyAOptions.length > 1) {
            await page.locator('select').first().selectOption({ index: 1 });
            await page.waitForTimeout(500);
            console.log('Selected first available army for Army A');
        }

        const armyBOptions = await page.locator('select').last().locator('option').allTextContents();
        if (armyBOptions.length > 1) {
            // Select a different option for Army B if possible
            const optionIndex = Math.min(armyBOptions.length - 1, 1);
            await page.locator('select').nth(1).selectOption({ index: optionIndex });
            await page.waitForTimeout(500);
            console.log('Selected army for Army B');
        }

        await page.screenshot({ path: 'test-results/02-armies-selected.png', fullPage: true });

        // Make sure GT Standard terrain is selected
        const terrainSelect = page.locator('select:has-text("GT"), [id*="terrain"], select').filter({ hasText: /terrain|GT|layout/i });
        if (await terrainSelect.count() > 0) {
            console.log('Found terrain selector');
        }

        // Look for the Run button and click it
        const runButton = page.getByRole('button', { name: /run|start|simulate/i });

        if (await runButton.count() > 0) {
            console.log('Found Run button, clicking...');
            await runButton.first().click();

            // Wait for simulation to complete - look for results or battlefield
            await page.waitForTimeout(5000);

            await page.screenshot({ path: 'test-results/03-after-simulation.png', fullPage: true });
            console.log('Simulation completed - screenshot saved');

            // Check if battlefield is now visible
            const battlefieldVisible = await page.locator('canvas, svg, .battlefield, #battlefield').count();
            console.log('Battlefield elements after simulation:', battlefieldVisible);

            // Scroll down if needed to see results
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
            await page.screenshot({ path: 'test-results/04-scrolled-results.png', fullPage: true });

            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await page.screenshot({ path: 'test-results/05-bottom-of-page.png', fullPage: true });
        } else {
            console.log('No run button found');
            await page.screenshot({ path: 'test-results/no-run-button-found.png', fullPage: true });
        }
    });

    test('should load sample army via drag and drop area', async ({ page }) => {
        await page.goto('http://localhost:3000/battle-sim.html');
        await page.waitForLoadState('networkidle');

        // Check the page structure
        const html = await page.content();

        // Log what controls exist
        const buttons = await page.locator('button').allTextContents();
        console.log('All buttons:', buttons);

        const selects = await page.locator('select').count();
        console.log('Number of select elements:', selects);

        const dropzones = await page.locator('[class*="drop"], [class*="drag"]').count();
        console.log('Number of dropzones:', dropzones);

        await page.screenshot({ path: 'test-results/page-structure.png', fullPage: true });
    });
});
