/**
 * Main entry point for Warhammer 40K Unit Efficiency Analyzer
 */

import type { Army, RerollConfig } from './types';
import { RerollType } from './types';
import { displayAnalysisResults, setupWeaponModeToggles } from './ui';

/**
 * Setup accordion state persistence
 */
function setupAccordionPersistence() {
  const accordionElement = document.getElementById('controlAccordion');
  if (!accordionElement) return;

  // Restore accordion state from localStorage
  const savedState = localStorage.getItem('accordionState');
  if (savedState) {
    try {
      const state = JSON.parse(savedState);
      Object.keys(state).forEach(id => {
        const collapseElement = document.getElementById(id);
        if (collapseElement) {
          if (state[id]) {
            collapseElement.classList.add('show');
            const button = document.querySelector(`[data-bs-target="#${id}"]`);
            if (button) {
              button.classList.remove('collapsed');
              button.setAttribute('aria-expanded', 'true');
            }
          } else {
            collapseElement.classList.remove('show');
            const button = document.querySelector(`[data-bs-target="#${id}"]`);
            if (button) {
              button.classList.add('collapsed');
              button.setAttribute('aria-expanded', 'false');
            }
          }
        }
      });
    } catch (e) {
      console.error('Failed to restore accordion state:', e);
    }
  }

  // Save accordion state when changed
  accordionElement.addEventListener('shown.bs.collapse', saveAccordionState);
  accordionElement.addEventListener('hidden.bs.collapse', saveAccordionState);
}

/**
 * Save accordion state to localStorage
 */
function saveAccordionState() {
  const state: { [key: string]: boolean } = {
    combatScenarioCollapse: document.getElementById('combatScenarioCollapse')?.classList.contains('show') || false,
    weaponOptionsCollapse: document.getElementById('weaponOptionsCollapse')?.classList.contains('show') || false,
    armySelectionCollapse: document.getElementById('armySelectionCollapse')?.classList.contains('show') || false
  };
  localStorage.setItem('accordionState', JSON.stringify(state));
}

/**
 * Main application function
 */
async function main() {
  try {
    // Setup accordion persistence
    setupAccordionPersistence();

    // Get UI elements
    const toughnessSelect = document.getElementById('toughness') as HTMLSelectElement;
    const overchargeToggle = document.getElementById('overchargeToggle') as HTMLInputElement;
    const oneTimeWeaponsToggle = document.getElementById('oneTimeWeaponsToggle') as HTMLInputElement;
    const optimalRangeToggle = document.getElementById('optimalRangeToggle') as HTMLInputElement;
    const rerollHitsSelect = document.getElementById('rerollHits') as HTMLSelectElement;
    const rerollWoundsSelect = document.getElementById('rerollWounds') as HTMLSelectElement;
    const targetFNPSelect = document.getElementById('targetFNP') as HTMLSelectElement;
    const armyFileSelect = document.getElementById('armyFile') as HTMLSelectElement;
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;

    if (!toughnessSelect || !overchargeToggle || !oneTimeWeaponsToggle || !optimalRangeToggle ||
        !rerollHitsSelect || !rerollWoundsSelect || !targetFNPSelect ||
        !armyFileSelect || !dropZone || !fileInput) {
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
     * @param resetModes - Whether to reset weapon mode toggles (true when loading new army)
     */
    const updateDisplay = (resetModes: boolean = false) => {
      if (currentArmy) {
        // Get scenario re-rolls from dropdowns
        const scenarioRerolls: RerollConfig = {
          hits: rerollHitsSelect.value as RerollType,
          wounds: rerollWoundsSelect.value as RerollType
        };

        // Get target FNP value
        const targetFNP = parseInt(targetFNPSelect.value) || undefined;

        // Reset weapon modes only when loading a new army
        if (resetModes) {
          activeWeaponModes.clear();
        }

        displayAnalysisResults(
          currentArmy,
          parseInt(toughnessSelect.value),
          overchargeToggle.checked,
          activeWeaponModes,
          oneTimeWeaponsToggle.checked,
          optimalRangeToggle.checked,
          scenarioRerolls,
          targetFNP
        );

        // Setup event handlers for weapon mode toggles
        setupWeaponModeToggles(
          currentArmy,
          parseInt(toughnessSelect.value),
          overchargeToggle.checked,
          activeWeaponModes,
          oneTimeWeaponsToggle.checked,
          optimalRangeToggle.checked,
          scenarioRerolls,
          targetFNP
        );
      }
    };

    // Handle dropdown selection
    armyFileSelect.addEventListener('change', async () => {
      try {
        currentArmy = await loadArmyData(armyFileSelect.value);
        updateDisplay(true); // Reset weapon modes when loading new army
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
            updateDisplay(true); // Reset weapon modes when loading new army
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
          updateDisplay(true); // Reset weapon modes when loading new army
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
    rerollHitsSelect.addEventListener('change', updateDisplay);
    rerollWoundsSelect.addEventListener('change', updateDisplay);
    targetFNPSelect.addEventListener('change', updateDisplay);

    // Load initial army data
    try {
      // Check if coming from converter with a converted army
      const urlParams = new URLSearchParams(window.location.search);
      const convertedArmyData = localStorage.getItem('convertedArmy');

      if (urlParams.get('from') === 'converter' && convertedArmyData) {
        // Load the converted army from localStorage
        currentArmy = JSON.parse(convertedArmyData);

        // Clear the localStorage after loading
        localStorage.removeItem('convertedArmy');

        // Clear URL parameters
        window.history.replaceState({}, '', window.location.pathname);

        // Show success message
        const resultsDiv = document.getElementById('analysis-results');
        if (resultsDiv) {
          resultsDiv.innerHTML = `
            <div class="alert alert-success alert-dismissible fade show" role="alert">
              <strong>Success!</strong> Your roster "${currentArmy.armyName}" has been loaded.
              <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
            </div>
          `;
        }
      } else {
        // Load default army from dropdown
        currentArmy = await loadArmyData(armyFileSelect.value);
      }

      updateDisplay(true); // Reset weapon modes on initial load
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
