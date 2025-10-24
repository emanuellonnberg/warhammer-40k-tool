/**
 * Event handlers and user interaction controls
 */

import type { Army, Unit, RerollConfig } from '../types';
import { calculateUnitDamage, calculateUnitEfficiency } from '../calculators';
import { getEfficiencyClass } from '../utils/styling';
import { displayAnalysisResults } from './display';

/**
 * Setup weapon mode toggle event handlers
 * @param army - Current army data
 * @param targetToughness - Target toughness value
 * @param useOvercharge - Whether overcharge is enabled
 * @param weaponModes - Map of weapon modes
 * @param includeOneTimeWeapons - Whether to include one-time weapons
 * @param optimalRange - Whether at optimal range
 * @param scenarioRerolls - Scenario-based re-rolls
 * @param targetFNP - Target Feel No Pain value
 */
export function setupWeaponModeToggles(
  army: Army,
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): void {
  document.querySelectorAll('.weapon-mode-toggle').forEach(toggle => {
    toggle.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      const unitId = target.dataset.unitId;
      const weaponIndex = parseInt(target.dataset.weaponIndex || '0');
      const weaponEntry = target.closest('.weapon-entry');

      if (!weaponEntry || !unitId) return;

      const baseName = weaponEntry.getAttribute('data-base-name');
      if (!baseName) return;

      const modes = Array.from(weaponEntry.querySelectorAll('.weapon-mode'));
      if (modes.length < 2) return;

      // Find the unit
      const unit = army.units.find(u => u.id === unitId);
      if (!unit) return;

      // Get unit modes
      const unitModes = weaponModes.get(unitId);
      if (!unitModes) return;

      // Update active mode
      const newMode = target.checked ? 1 : 0;
      unitModes.set(baseName, newMode);

      // Update visual state
      modes.forEach((mode, index) => {
        mode.classList.toggle('active-mode', index === newMode);
        mode.classList.toggle('inactive-mode', index !== newMode);
      });

      // Recalculate damage with updated modes
      const efficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
      const damage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP);
      const damagePerPoint = damage.total / unit.points;
      const rangedDamagePerPoint = damage.ranged / unit.points;
      const meleeDamagePerPoint = damage.melee / unit.points;

      // Update the unit's row in the summary table
      updateSummaryRow(unit, efficiency, damage, damagePerPoint, rangedDamagePerPoint, meleeDamagePerPoint, includeOneTimeWeapons);

      // Update the unit card
      updateUnitCard(unitId, efficiency, damage, damagePerPoint, rangedDamagePerPoint, meleeDamagePerPoint, includeOneTimeWeapons);
    });
  });
}

/**
 * Update summary table row for a unit
 */
function updateSummaryRow(
  unit: Unit,
  efficiency: number,
  damage: { total: number; ranged: number; melee: number; pistol: number; onetime: number },
  damagePerPoint: number,
  rangedDamagePerPoint: number,
  meleeDamagePerPoint: number,
  includeOneTimeWeapons: boolean
): void {
  const unitRow = document.querySelector(`tr[data-unit-id="${unit.id}"]`);
  if (unitRow) {
    unitRow.innerHTML = `
      <td><a href="#unit-${unit.id}" class="unit-link">${unit.name}</a></td>
      <td>${unit.points}</td>
      <td class="${getEfficiencyClass(efficiency)}">${efficiency.toFixed(3)}</td>
      <td class="${getEfficiencyClass(damagePerPoint)}">${damagePerPoint.toFixed(3)}</td>
      <td class="${getEfficiencyClass(rangedDamagePerPoint)}">${rangedDamagePerPoint.toFixed(3)}</td>
      <td class="${getEfficiencyClass(meleeDamagePerPoint)}">${meleeDamagePerPoint.toFixed(3)}</td>
      <td>${damage.ranged.toFixed(1)}</td>
      <td>${damage.melee.toFixed(1)}</td>
      <td>${damage.pistol.toFixed(1)}</td>
      ${includeOneTimeWeapons ? `<td>${damage.onetime.toFixed(1)}</td>` : ''}
    `;

    // Update data attributes for sorting
    unitRow.setAttribute('data-efficiency', efficiency.toString());
    unitRow.setAttribute('data-dpp', damagePerPoint.toString());
    unitRow.setAttribute('data-rangeddpp', rangedDamagePerPoint.toString());
    unitRow.setAttribute('data-meleedpp', meleeDamagePerPoint.toString());
    unitRow.setAttribute('data-ranged', damage.ranged.toString());
    unitRow.setAttribute('data-melee', damage.melee.toString());
    unitRow.setAttribute('data-pistol', damage.pistol.toString());
    if (includeOneTimeWeapons) {
      unitRow.setAttribute('data-onetime', damage.onetime.toString());
    }
  }
}

/**
 * Update unit card with new values
 */
function updateUnitCard(
  unitId: string,
  efficiency: number,
  damage: { total: number; ranged: number; melee: number; pistol: number; onetime: number },
  damagePerPoint: number,
  rangedDamagePerPoint: number,
  meleeDamagePerPoint: number,
  includeOneTimeWeapons: boolean = false
): void {
  const unitCard = document.querySelector(`.unit-card[data-unit-id="${unitId}"]`);
  if (!unitCard) return;

  // Update Total Damage per Point (efficiency)
  const totalDppSpan = unitCard.querySelector('[data-stat="total-dpp"]');
  if (totalDppSpan) {
    totalDppSpan.textContent = efficiency.toFixed(3);
    // Update efficiency class
    totalDppSpan.className = `efficiency-value ${getEfficiencyClass(efficiency)}`;
  }

  // Update Total Damage
  const totalDamageSpan = unitCard.querySelector('[data-stat="total-damage"]');
  if (totalDamageSpan) {
    totalDamageSpan.textContent = damage.total.toFixed(1);
  }

  // Update Ranged D/Point
  const rangedDppSpan = unitCard.querySelector('[data-stat="ranged-dpp"]');
  if (rangedDppSpan) {
    rangedDppSpan.textContent = rangedDamagePerPoint.toFixed(3);
    rangedDppSpan.className = `efficiency-value ${getEfficiencyClass(rangedDamagePerPoint)}`;
  }

  // Update Melee D/Point
  const meleeDppSpan = unitCard.querySelector('[data-stat="melee-dpp"]');
  if (meleeDppSpan) {
    meleeDppSpan.textContent = meleeDamagePerPoint.toFixed(3);
    meleeDppSpan.className = `efficiency-value ${getEfficiencyClass(meleeDamagePerPoint)}`;
  }

  // Update damage breakdown
  const damageBreakdown = unitCard.querySelector('[data-stat="damage-breakdown"]');
  if (damageBreakdown) {
    damageBreakdown.innerHTML = `
      Ranged: ${damage.ranged.toFixed(1)} |
      Melee: ${damage.melee.toFixed(1)} |
      Pistol: ${damage.pistol.toFixed(1)}
      ${includeOneTimeWeapons && damage.onetime > 0 ? `| One-Time: ${damage.onetime.toFixed(1)}` : ''}
    `;
  }
}
