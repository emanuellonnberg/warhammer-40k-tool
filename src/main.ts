/**
 * Main entry point for Warhammer 40K Unit Efficiency Analyzer
 */

import type { Army } from './types';
import { displayAnalysisResults, setupWeaponModeToggles } from './ui';

/**
 * Main application function
 */
async function main() {
  try {
    // Get UI elements
    const toughnessSelect = document.getElementById('toughness') as HTMLSelectElement;
    const overchargeToggle = document.getElementById('overchargeToggle') as HTMLInputElement;
    const oneTimeWeaponsToggle = document.getElementById('oneTimeWeaponsToggle') as HTMLInputElement;
    const optimalRangeToggle = document.getElementById('optimalRangeToggle') as HTMLInputElement;
    const armyFileSelect = document.getElementById('armyFile') as HTMLSelectElement;
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;

    if (!toughnessSelect || !overchargeToggle || !oneTimeWeaponsToggle || !optimalRangeToggle || !armyFileSelect || !dropZone || !fileInput) {
      throw new Error('Could not find required UI elements');
    }

    let currentArmy: Army | null = null;
    let activeWeaponModes: Map<string, Map<string, number>> = new Map();

    /**
     * Load and parse army data from file or URL
     */
    async function loadArmyData(file: File | string): Promise<Army> {
      let armyData: string;

      if (typeof file === 'string') {
        // Load from predefined file
        const response = await fetch(file);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        armyData = await response.text();
      } else {
        // Load from uploaded file
        armyData = await file.text();
      }

      const army: Army = JSON.parse(armyData);
      return army;
    }

    /**
     * Update display with current settings
     */
    const updateDisplay = () => {
      if (currentArmy) {
        // Reset active weapon modes when updating display
        activeWeaponModes = new Map();
        displayAnalysisResults(
          currentArmy,
          parseInt(toughnessSelect.value),
          overchargeToggle.checked,
          activeWeaponModes,
          oneTimeWeaponsToggle.checked,
          optimalRangeToggle.checked
        );

        // Setup event handlers for weapon mode toggles
        setupWeaponModeToggles(
          currentArmy,
          parseInt(toughnessSelect.value),
          overchargeToggle.checked,
          activeWeaponModes,
          oneTimeWeaponsToggle.checked,
          optimalRangeToggle.checked
        );
      }
    };

    // Handle dropdown selection
    armyFileSelect.addEventListener('change', async () => {
      try {
        currentArmy = await loadArmyData(armyFileSelect.value);
        updateDisplay();
      } catch (error) {
        console.error('Error loading army file:', error);
        alert('Error loading army file. Please check the console for details.');
      }
    });

    // Handle drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === 'application/json' || file.name.endsWith('.json')) {
          try {
            currentArmy = await loadArmyData(file);
            updateDisplay();
          } catch (error) {
            console.error('Error loading dropped file:', error);
            alert('Error loading file. Please check the console for details.');
          }
        } else {
          alert('Please drop a JSON file.');
        }
      }
    });

    // Handle click to select file
    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        try {
          currentArmy = await loadArmyData(files[0]);
          updateDisplay();
        } catch (error) {
          console.error('Error loading selected file:', error);
          alert('Error loading file. Please check the console for details.');
        }
      }
    });

    // Add event listeners for analysis parameters
    toughnessSelect.addEventListener('change', updateDisplay);
    overchargeToggle.addEventListener('change', updateDisplay);
    oneTimeWeaponsToggle.addEventListener('change', updateDisplay);
    optimalRangeToggle.addEventListener('change', updateDisplay);

    // Load initial army data
    try {
      currentArmy = await loadArmyData(armyFileSelect.value);
      updateDisplay();
    } catch (error) {
      console.error('Error loading initial army data:', error);
      const resultsDiv = document.getElementById('analysis-results');
      if (resultsDiv) {
        resultsDiv.innerHTML = `
          <div class="alert alert-danger">
            <h4>Error loading army data</h4>
            <p>${error}</p>
            <p>Please check the browser console (F12) for more details.</p>
          </div>
        `;
      }
    }

  } catch (error) {
    console.error('Error initializing application:', error);
    const resultsDiv = document.getElementById('analysis-results');
    if (resultsDiv) {
      resultsDiv.innerHTML = `
        <div class="alert alert-danger">
          <h4>Error initializing application</h4>
          <p>${error}</p>
          <p>Please check the browser console (F12) for more details.</p>
        </div>
      `;
    }
  }
}

// Start the application when DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}
