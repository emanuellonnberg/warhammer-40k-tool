/**
 * UI display and rendering logic
 */

import type { Army, Unit, Weapon, SortColumn, SortDirection } from '../types';
import { calculateUnitDamage } from '../calculators/damage';
import { calculateUnitEfficiency } from '../calculators/efficiency';
import { calculateWeaponDamage } from '../calculators/damage';
import { getWeaponType, isOneTimeWeapon } from '../utils/weapon';
import { getEfficiencyClass } from '../utils/styling';
import { generateCalculationTooltip, initializeTooltips } from './tooltip';

// Global variables to track current sort state
let currentSortColumn: SortColumn = 'efficiency';
let currentSortDirection: SortDirection = 'desc';

/**
 * Display analysis results in the HTML
 */
export function displayAnalysisResults(
  army: Army,
  targetToughness: number,
  useOvercharge: boolean = false,
  activeWeaponModes?: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean = false,
  optimalRange: boolean = true
): void {
  const resultsDiv = document.getElementById('analysis-results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = '';

  // Create a map to store active weapon modes for each unit if not provided
  const weaponModes = activeWeaponModes || new Map<string, Map<string, number>>();

  // Sort units by current sorting criteria
  const sortedUnits = [...army.units].sort((a, b) => {
    let aValue, bValue;

    switch (currentSortColumn) {
      case 'name':
        aValue = a.name;
        bValue = b.name;
        return currentSortDirection === 'asc'
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      case 'points':
        aValue = a.points;
        bValue = b.points;
        break;
      case 'efficiency':
        aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
        bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
        break;
      case 'dpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).total / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).total / b.points;
        break;
      case 'rangeddpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).ranged / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).ranged / b.points;
        break;
      case 'meleedpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).melee / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).melee / b.points;
        break;
      case 'ranged':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).ranged;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).ranged;
        break;
      case 'melee':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).melee;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).melee;
        break;
      case 'pistol':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).pistol;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).pistol;
        break;
      case 'onetime':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange).onetime;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange).onetime;
        break;
      default:
        aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
        bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
    }

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return currentSortDirection === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    }

    return currentSortDirection === 'asc'
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number);
  });

  // Create summary table
  const summaryTable = createSummaryTable(sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange);
  resultsDiv.appendChild(summaryTable);

  // Create unit cards
  for (const unit of sortedUnits) {
    const unitCard = createUnitCard(unit, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, army);
    resultsDiv.appendChild(unitCard);
  }

  // Initialize tooltips for all elements with data-tooltip attribute
  initializeTooltips();
}

/**
 * Create summary table element
 */
function createSummaryTable(
  sortedUnits: Unit[],
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean
): HTMLElement {
  const summaryTable = document.createElement('div');
  summaryTable.className = 'card mb-4';
  summaryTable.innerHTML = `
    <div class="card-body">
      <h5 class="card-title">Unit Summary</h5>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th class="sortable" data-sort="name">Unit</th>
              <th class="sortable" data-sort="points">Points</th>
              <th class="sortable" data-sort="efficiency">Total D/Point</th>
              <th class="sortable" data-sort="rangeddpp">Ranged D/Point</th>
              <th class="sortable" data-sort="meleedpp">Melee D/Point</th>
              <th class="sortable" data-sort="ranged">Ranged</th>
              <th class="sortable" data-sort="melee">Melee</th>
              <th class="sortable" data-sort="pistol">Pistol</th>
              ${includeOneTimeWeapons ? '<th class="sortable" data-sort="onetime">One-Time</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${sortedUnits.map(unit => {
              const unitModes = new Map<string, number>();
              weaponModes.set(unit.id, unitModes);

              // Group weapons by base name
              const weaponGroups = new Map<string, Weapon[]>();
              unit.weapons.forEach(weapon => {
                const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
                if (!weaponGroups.has(baseName)) {
                  weaponGroups.set(baseName, []);
                }
                weaponGroups.get(baseName)!.push(weapon);
              });

              // Set initial active modes
              weaponGroups.forEach((weapons, baseName) => {
                if (weapons.length > 1) {
                  unitModes.set(baseName, 0);
                }
              });

              const efficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
              const damage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons, optimalRange);
              const damagePerPoint = damage.total / unit.points;
              const rangedDamagePerPoint = damage.ranged / unit.points;
              const meleeDamagePerPoint = damage.melee / unit.points;
              return `
                <tr data-unit-id="${unit.id}"
                    data-name="${unit.name}"
                    data-points="${unit.points}"
                    data-efficiency="${efficiency}"
                    data-dpp="${damagePerPoint}"
                    data-rangeddpp="${rangedDamagePerPoint}"
                    data-meleedpp="${meleeDamagePerPoint}"
                    data-ranged="${damage.ranged}"
                    data-melee="${damage.melee}"
                    data-pistol="${damage.pistol}"
                    ${includeOneTimeWeapons ? `data-onetime="${damage.onetime}"` : ''}>
                  <td><a href="#unit-${unit.id}" class="unit-link">${unit.name}</a></td>
                  <td>${unit.points}</td>
                  <td class="calculation-tooltip ${getEfficiencyClass(efficiency)}" data-tooltip="Total Damage per Point&#10;${damage.total.toFixed(1)} damage ÷ ${unit.points} points = ${efficiency.toFixed(3)}">
                    ${efficiency.toFixed(3)}
                  </td>
                  <td class="calculation-tooltip ${getEfficiencyClass(rangedDamagePerPoint)}" data-tooltip="Ranged Damage per Point&#10;${damage.ranged.toFixed(1)} ranged damage ÷ ${unit.points} points = ${rangedDamagePerPoint.toFixed(3)}">
                    ${rangedDamagePerPoint.toFixed(3)}
                  </td>
                  <td class="calculation-tooltip ${getEfficiencyClass(meleeDamagePerPoint)}" data-tooltip="Melee Damage per Point&#10;${damage.melee.toFixed(1)} melee damage ÷ ${unit.points} points = ${meleeDamagePerPoint.toFixed(3)}">
                    ${meleeDamagePerPoint.toFixed(3)}
                  </td>
                  <td>${damage.ranged.toFixed(1)}</td>
                  <td>${damage.melee.toFixed(1)}</td>
                  <td>${damage.pistol.toFixed(1)}</td>
                  ${includeOneTimeWeapons ? `<td>${damage.onetime.toFixed(1)}</td>` : ''}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Add sorting functionality
  const table = summaryTable.querySelector('table');
  if (table) {
    addTableSortHandlers(table);
  }

  return summaryTable;
}

/**
 * Add sorting handlers to table
 */
function addTableSortHandlers(table: HTMLTableElement): void {
  const headers = table.querySelectorAll('th.sortable');

  // Add sort indicators to headers based on current sort
  headers.forEach(header => {
    const sortBy = header.getAttribute('data-sort');
    if (sortBy === currentSortColumn) {
      header.setAttribute('data-direction', currentSortDirection);
      header.textContent = (header.textContent || '').replace(/[↑↓]$/, '') + (currentSortDirection === 'asc' ? ' ↑' : ' ↓');
    }
  });

  // Add click handlers
  headers.forEach(header => {
    header.addEventListener('click', () => {
      const sortBy = header.getAttribute('data-sort');
      if (!sortBy) return;

      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      // If already sorting by this column, toggle direction
      if (sortBy === currentSortColumn) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        // New column, default to descending for most columns and ascending for name
        currentSortColumn = sortBy as SortColumn;
        currentSortDirection = sortBy === 'name' ? 'asc' : 'desc';
      }

      // Update sort direction indicators
      headers.forEach(h => {
        h.textContent = (h.textContent || '').replace(/[↑↓]$/, '');
        h.removeAttribute('data-direction');
      });

      header.textContent = (header.textContent || '').replace(/[↑↓]$/, '') + (currentSortDirection === 'asc' ? ' ↑' : ' ↓');
      header.setAttribute('data-direction', currentSortDirection);

      // Sort rows
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort((a, b) => {
        const aValue = a.getAttribute(`data-${sortBy}`);
        const bValue = b.getAttribute(`data-${sortBy}`);

        if (!aValue || !bValue) return 0;

        if (sortBy === 'name') {
          return currentSortDirection === 'asc'
            ? String(aValue).localeCompare(String(bValue))
            : String(bValue).localeCompare(String(aValue));
        }

        const aNum = parseFloat(aValue);
        const bNum = parseFloat(bValue);

        return currentSortDirection === 'asc'
          ? aNum - bNum
          : bNum - aNum;
      });

      // Reorder rows
      rows.forEach(row => tbody.appendChild(row));
    });
  });
}

/**
 * Create unit card element
 */
function createUnitCard(
  unit: Unit,
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  army: Army
): HTMLElement {
  const unitEfficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange);
  const unitModes = weaponModes.get(unit.id);
  const unitDamage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons, optimalRange);
  const damagePerPoint = unitDamage.total / unit.points;
  const rangedDamagePerPoint = unitDamage.ranged / unit.points;
  const meleeDamagePerPoint = unitDamage.melee / unit.points;

  const unitCard = document.createElement('div');
  unitCard.className = 'card unit-card';
  unitCard.setAttribute('data-unit-id', unit.id);
  unitCard.id = `unit-${unit.id}`;

  // Group weapons by base name to handle standard/overcharge variants
  const weaponGroups = new Map<string, Weapon[]>();
  unit.weapons.forEach(weapon => {
    const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
    if (!weaponGroups.has(baseName)) {
      weaponGroups.set(baseName, []);
    }
    weaponGroups.get(baseName)!.push(weapon);
  });

  // Build weapon list HTML
  const weaponListHTML = Array.from(weaponGroups.entries()).map(([baseName, weapons], index) => {
    return buildWeaponHTML(baseName, weapons, index, unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, unitModes);
  }).join('');

  // Build weapon stats table HTML
  const weaponStatsHTML = Array.from(weaponGroups.entries()).map(([baseName, weapons]) => {
    return buildWeaponStatsHTML(baseName, weapons, includeOneTimeWeapons);
  }).join('');

  unitCard.innerHTML = `
    <div class="card-body">
      <h5 class="card-title">${unit.name}</h5>
      <p class="card-text">
        Points: ${unit.points}
      </p>
      <p class="card-text">
        Total Damage per Point:
        <span class="efficiency-value ${getEfficiencyClass(unitEfficiency)}">
          ${unitEfficiency.toFixed(3)}
        </span>
      </p>
      <p class="card-text">
        Total Damage:
        <span class="damage-value">
          ${unitDamage.total.toFixed(1)}
        </span>
        <br>
        <small class="text-muted">
          Ranged D/Point:
          <span class="efficiency-value ${getEfficiencyClass(rangedDamagePerPoint)}">
            ${rangedDamagePerPoint.toFixed(3)}
          </span>
          <br>
          Melee D/Point:
          <span class="efficiency-value ${getEfficiencyClass(meleeDamagePerPoint)}">
            ${meleeDamagePerPoint.toFixed(3)}
          </span>
        </small>
        <br>
        <small class="text-muted">
          Ranged: ${unitDamage.ranged.toFixed(1)} |
          Melee: ${unitDamage.melee.toFixed(1)} |
          Pistol: ${unitDamage.pistol.toFixed(1)}
          ${includeOneTimeWeapons && unitDamage.onetime > 0 ? `| One-Time: ${unitDamage.onetime.toFixed(1)}` : ''}
        </small>
      </p>
      <div class="weapon-list">
        <h6>Weapons:</h6>
        ${weaponListHTML}
      </div>
      <div class="weapon-details mt-3">
        <h6>Weapon Stats:</h6>
        <div class="table-responsive">
          <table class="table table-sm table-striped">
            <thead>
              <tr>
                <th>Weapon</th>
                <th>Range</th>
                <th>A</th>
                <th>BS</th>
                <th>S</th>
                <th>AP</th>
                <th>D</th>
                <th>Keywords</th>
              </tr>
            </thead>
            <tbody>
              ${weaponStatsHTML}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  return unitCard;
}

/**
 * Build weapon HTML for weapon list
 */
function buildWeaponHTML(
  baseName: string,
  weapons: Weapon[],
  index: number,
  unit: Unit,
  targetToughness: number,
  useOvercharge: boolean,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  unitModes?: Map<string, number>
): string {
  // Skip weapons that should be excluded based on settings
  if (!includeOneTimeWeapons && weapons.some(w => isOneTimeWeapon(w))) {
    return '';
  }

  const standardWeapon = weapons.find(w => w.name.includes('standard') || !w.name.includes('overcharge'));
  const overchargeWeapon = weapons.find(w => w.name.includes('overcharge'));

  if (standardWeapon && overchargeWeapon) {
    // Weapon has standard/overcharge modes
    const standardDamage = calculateWeaponDamage(standardWeapon, targetToughness, false, includeOneTimeWeapons, optimalRange);
    const overchargeDamage = calculateWeaponDamage(overchargeWeapon, targetToughness, true, includeOneTimeWeapons, optimalRange);
    const weaponType = getWeaponType(standardWeapon);
    const isOneTime = isOneTimeWeapon(standardWeapon);

    return `
      <div class="weapon-entry" data-weapon-type="overcharge" data-base-name="${baseName}">
        <p class="mb-1">
          ${baseName} (${standardWeapon.count})
          <span class="weapon-type ${weaponType}">[${weaponType}]</span>
          ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
          <br>
          <span class="${!useOvercharge ? 'active-mode' : 'inactive-mode'}">
            Standard:
            <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(standardDamage)}" data-tooltip="${generateCalculationTooltip(standardWeapon, targetToughness, false, optimalRange)}">
              ${standardDamage.toFixed(3)}
            </span>
            <span class="damage-value">
              (${standardDamage.toFixed(1)} dmg)
            </span>
          </span>
          <br>
          <span class="${useOvercharge ? 'active-mode' : 'inactive-mode'}">
            Overcharge:
            <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(overchargeDamage)}" data-tooltip="${generateCalculationTooltip(overchargeWeapon, targetToughness, true, optimalRange)}">
              ${overchargeDamage.toFixed(3)}
            </span>
            <span class="damage-value">
              (${overchargeDamage.toFixed(1)} dmg)
            </span>
          </span>
        </p>
      </div>
    `;
  } else if (weapons.length > 1) {
    // Weapon has multiple modes
    const weaponType = getWeaponType(weapons[0]);
    const activeMode = unitModes?.get(baseName) || 0;
    const isOneTime = isOneTimeWeapon(weapons[0]);
    const weaponId = `weapon-${unit.id}-${index}`;

    const modesHTML = weapons.map((weapon, modeIndex) => {
      const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange);
      const modeName = weapon.name.replace(baseName, '').replace(/^[ -]+/, '') || 'Mode ' + (modeIndex + 1);
      return `
        <span class="weapon-mode ${modeIndex === activeMode ? 'active-mode' : 'inactive-mode'}"
              data-mode-index="${modeIndex}">
          ${modeName}:
          <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(damage)}" data-tooltip="${generateCalculationTooltip(weapon, targetToughness, false, optimalRange)}">
            ${damage.toFixed(3)}
          </span>
          <span class="damage-value">
            (${damage.toFixed(1)} dmg)
          </span>
        </span>
      `;
    }).join('<br>');

    return `
      <div class="weapon-entry" data-weapon-type="multi" data-unit-id="${unit.id}" data-weapon-index="${index}" data-base-name="${baseName}">
        <p class="mb-1">
          ${baseName} (${weapons[0].count})
          <span class="weapon-type ${weaponType}">[${weaponType}]</span>
          ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
          <div class="form-check form-switch">
            <input class="form-check-input weapon-mode-toggle" type="checkbox"
                   id="${weaponId}" data-unit-id="${unit.id}" data-weapon-index="${index}"
                   ${activeMode === 1 ? 'checked' : ''}>
            <label class="form-check-label" for="${weaponId}">Toggle Mode</label>
          </div>
          <div class="weapon-modes">
            ${modesHTML}
          </div>
        </p>
      </div>
    `;
  } else {
    // Regular weapon
    const weapon = weapons[0];
    const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange);
    const weaponType = getWeaponType(weapon);
    const isOneTime = isOneTimeWeapon(weapon);

    return `
      <p class="mb-1">
        ${baseName} (${weapon.count})
        <span class="weapon-type ${weaponType}">[${weaponType}]</span>
        ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
        <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(damage)}" data-tooltip="${generateCalculationTooltip(weapon, targetToughness, false, optimalRange)}">
          ${damage.toFixed(3)}
        </span>
        <span class="damage-value">
          (${damage.toFixed(1)} dmg)
        </span>
      </p>
    `;
  }
}

/**
 * Build weapon stats table rows HTML
 */
function buildWeaponStatsHTML(baseName: string, weapons: Weapon[], includeOneTimeWeapons: boolean): string {
  // Skip weapons that should be excluded based on settings
  if (!includeOneTimeWeapons && weapons.some(w => isOneTimeWeapon(w))) {
    return '';
  }

  return weapons.map(weapon => {
    const chars = weapon.characteristics;
    const weaponType = getWeaponType(weapon);
    const isOneTime = isOneTimeWeapon(weapon);
    const modeName = weapon.name.includes(' - ') ? weapon.name.split(' - ')[1] : '';

    return `
      <tr>
        <td>
          ${baseName}${modeName ? ` (${modeName})` : ''}
          ${weapon.count > 1 ? ` (${weapon.count})` : ''}
          <span class="weapon-type ${weaponType}">[${weaponType}]</span>
          ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}
        </td>
        <td>${chars.range || '-'}</td>
        <td>${chars.a || '-'}</td>
        <td>${chars.bs || '-'}</td>
        <td>${chars.s || '-'}</td>
        <td>${chars.ap || '0'}</td>
        <td>${chars.d || '-'}</td>
        <td><small>${chars.keywords || ''}</small></td>
      </tr>
    `;
  }).join('');
}
