/**
 * UI display and rendering logic
 */

import type { Army, Unit, Weapon, SortColumn, SortDirection, RerollConfig } from '../types';
import { calculateUnitDamage } from '../calculators/damage';
import { calculateUnitEfficiency } from '../calculators/efficiency';
import { calculateWeaponDamage } from '../calculators/damage';
import { getWeaponType, isOneTimeWeapon } from '../utils/weapon';
import { getEfficiencyClass } from '../utils/styling';
import { generateCalculationTooltip, initializeTooltips } from './tooltip';

/**
 * Weapon-specific rules that should not appear in the unit abilities section
 * These will be shown as tooltips on weapon keywords instead
 */
const WEAPON_RULES = new Set([
  'Melta',
  'Twin-linked',
  'Rapid Fire',
  'Assault',
  'Heavy',
  'Pistol',
  'Blast',
  'Torrent',
  'Sustained Hits',
  'Lethal Hits',
  'Devastating Wounds',
  'Anti-',
  'Hazardous',
  'Lance',
  'Precision',
  'Ignores Cover',
  'Extra Attacks',
  'One Shot',
  'Indirect Fire'
]);

/**
 * Check if a rule is a weapon-specific rule
 */
function isWeaponRule(ruleName: string): boolean {
  // Check exact matches first
  if (WEAPON_RULES.has(ruleName)) return true;

  // Check for rules that start with common weapon rule prefixes
  if (ruleName.startsWith('Melta ')) return true;
  if (ruleName.startsWith('Rapid Fire ')) return true;
  if (ruleName.startsWith('Sustained Hits ')) return true;
  if (ruleName.startsWith('Anti-')) return true;
  if (ruleName.startsWith('Deadly Demise')) return true;

  return false;
}

/**
 * Check if a rule should be hidden from the abilities list
 */
function shouldHideRule(ruleName: string): boolean {
  // Check if it's a weapon rule
  if (isWeaponRule(ruleName)) return true;

  // Check if it's invulnerable save
  if (ruleName.toLowerCase().includes('invulnerable save')) return true;

  return false;
}

/**
 * Extract invulnerable save value from unit's abilities/rules
 * Returns something like "4+" or null if no invuln
 */
function extractInvulnerableSave(unit: Unit, army: Army): string | null {
  const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];

  for (const ruleId of allRuleIds) {
    const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
    if (!rule) continue;

    // Check if this is an invulnerable save rule
    if (rule.name.toLowerCase().includes('invulnerable save')) {
      // Try to extract the value from the name, e.g., "Invulnerable Save (4+)" or "Invulnerable Save (4+*)"
      const match = rule.name.match(/\((\d+)\+/);
      if (match) {
        return match[1] + '+';
      }

      // Also try to extract from description
      const descMatch = rule.description.match(/(\d+)\+ invulnerable save/i);
      if (descMatch) {
        return descMatch[1] + '+';
      }
    }
  }

  return null;
}

/**
 * Find a rule that matches a weapon keyword
 */
function findRuleByKeyword(keyword: string, army: Army): any {
  if (!army.rules) return null;

  // Search through all rules to find one matching this keyword
  for (const ruleId in army.rules) {
    const rule = army.rules[ruleId];

    // Exact match
    if (rule.name === keyword) return rule;

    // Partial matches for rules with values (e.g., "Melta 2" matches "Melta")
    if (keyword.startsWith(rule.name + ' ')) return rule;

    // For Anti- rules
    if (keyword.startsWith('Anti-') && rule.name === 'Anti-') return rule;
  }

  return null;
}

/**
 * Escape HTML for use in attributes
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/"/g, '&quot;');
}

/**
 * Parse weapon keywords and add tooltips for known abilities
 */
function parseKeywordsWithTooltips(keywords: string, army: Army): string {
  if (!keywords || keywords === '-') return keywords;

  // Split by comma to get individual keywords
  const keywordList = keywords.split(',').map(k => k.trim());

  return keywordList.map(keyword => {
    // Try to find a matching rule in army.rules
    const matchingRule = findRuleByKeyword(keyword, army);

    if (matchingRule) {
      // Add tooltip with the rule description
      return `<span class="weapon-keyword" title="${escapeHtml(matchingRule.description)}">${keyword}</span>`;
    }

    return keyword;
  }).join(', ');
}

/**
 * Check if two weapons have identical characteristics
 */
function weaponsAreIdentical(w1: Weapon, w2: Weapon): boolean {
  const chars1 = w1.characteristics;
  const chars2 = w2.characteristics;

  // Compare all characteristics
  const keys = new Set([...Object.keys(chars1), ...Object.keys(chars2)]);
  for (const key of keys) {
    if (chars1[key] !== chars2[key]) {
      return false;
    }
  }

  // Also check if they have the same type
  return w1.type === w2.type;
}

/**
 * Combine identical weapons by summing their counts
 */
function combineIdenticalWeapons(weapons: Weapon[]): Weapon[] {
  if (weapons.length <= 1) return weapons;

  // Check if all weapons are identical
  const allIdentical = weapons.every(w => weaponsAreIdentical(w, weapons[0]));

  if (allIdentical) {
    // Combine into a single weapon with summed count and models_with_weapon
    const combined: Weapon = {
      ...weapons[0],
      count: weapons.reduce((sum, w) => sum + w.count, 0),
      models_with_weapon: weapons.reduce((sum, w) => sum + w.models_with_weapon, 0)
    };
    return [combined];
  }

  return weapons;
}

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
  optimalRange: boolean = true,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
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
        aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, weaponModes.get(a.id));
        bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, weaponModes.get(b.id));
        break;
      case 'dpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).total / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).total / b.points;
        break;
      case 'rangeddpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).ranged / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).ranged / b.points;
        break;
      case 'meleedpp':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).melee / a.points;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).melee / b.points;
        break;
      case 'ranged':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).ranged;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).ranged;
        break;
      case 'melee':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).melee;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).melee;
        break;
      case 'pistol':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).pistol;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).pistol;
        break;
      case 'onetime':
        aValue = calculateUnitDamage(a, targetToughness, useOvercharge, weaponModes.get(a.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).onetime;
        bValue = calculateUnitDamage(b, targetToughness, useOvercharge, weaponModes.get(b.id), includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP).onetime;
        break;
      default:
        aValue = calculateUnitEfficiency(a, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, weaponModes.get(a.id));
        bValue = calculateUnitEfficiency(b, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, weaponModes.get(b.id));
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
  const summaryTable = createSummaryTable(sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
  resultsDiv.appendChild(summaryTable);

  // Create unit cards
  for (const unit of sortedUnits) {
    const unitCard = createUnitCard(unit, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, army, scenarioRerolls, targetFNP);
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
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
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
              // Get existing unit modes or create new if not exists (preserves toggle states)
              let unitModes = weaponModes.get(unit.id);
              if (!unitModes) {
                unitModes = new Map<string, number>();
                weaponModes.set(unit.id, unitModes);
              }

              // Group weapons by base name
              const weaponGroups = new Map<string, Weapon[]>();
              unit.weapons.forEach(weapon => {
                const baseName = weapon.base_name || weapon.name.replace(' - standard', '').replace(' - overcharge', '');
                if (!weaponGroups.has(baseName)) {
                  weaponGroups.set(baseName, []);
                }
                weaponGroups.get(baseName)!.push(weapon);
              });

              // Combine identical weapons within each group
              weaponGroups.forEach((weapons, baseName) => {
                weaponGroups.set(baseName, combineIdenticalWeapons(weapons));
              });

              // Set initial active modes (only if not already set)
              weaponGroups.forEach((weapons, baseName) => {
                if (weapons.length > 1 && !unitModes!.has(baseName)) {
                  unitModes!.set(baseName, 0);
                }
              });

              const efficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, unitModes);
              const damage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP);
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
  army: Army,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): HTMLElement {
  const unitModes = weaponModes.get(unit.id);
  const unitEfficiency = calculateUnitEfficiency(unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, unitModes);
  const unitDamage = calculateUnitDamage(unit, targetToughness, useOvercharge, unitModes, includeOneTimeWeapons, optimalRange, [], 1, false, null, scenarioRerolls, targetFNP);
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

  // Combine identical weapons within each group
  weaponGroups.forEach((weapons, baseName) => {
    weaponGroups.set(baseName, combineIdenticalWeapons(weapons));
  });

  // Build weapon list HTML
  const weaponListHTML = Array.from(weaponGroups.entries()).map(([baseName, weapons], index) => {
    return buildWeaponHTML(baseName, weapons, index, unit, targetToughness, useOvercharge, includeOneTimeWeapons, optimalRange, unitModes, scenarioRerolls, targetFNP);
  }).join('');

  // Build weapon stats table HTML
  const weaponStatsHTML = Array.from(weaponGroups.entries()).map(([baseName, weapons]) => {
    return buildWeaponStatsHTML(baseName, weapons, includeOneTimeWeapons, army);
  }).join('');

  // Extract invulnerable save
  const invulnSave = extractInvulnerableSave(unit, army);
  const saveDisplay = invulnSave
    ? `${unit.stats.save}/${invulnSave}+`
    : unit.stats.save;
  const svHeader = invulnSave ? 'Sv/Inv.Sv' : 'Sv';

  // Build abilities and rules HTML (EXCLUDE weapon rules AND invulnerable save)
  let abilitiesHTML = '';
  if ((unit.rules && unit.rules.length > 0) || (unit.abilities && unit.abilities.length > 0)) {
    const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];
    const rulesHTML = allRuleIds
      .map(ruleId => {
        // Get rule/ability from army.rules or army.abilities object
        const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
        if (!rule || rule.hidden) return '';

        // Filter out weapon-specific rules AND invulnerable save
        if (shouldHideRule(rule.name)) return '';

        const isTruncated = rule.description.length > 150;
        const truncatedText = truncateText(rule.description, 150);

        return `
          <div class="ability-item mb-2 ${isTruncated ? 'expandable' : ''}" data-expanded="false">
            <strong>${rule.name}:</strong>
            <span class="ability-description text-muted small">
              <span class="truncated-text">${truncatedText}</span>
              ${isTruncated ? `<span class="full-text" style="display: none;">${rule.description}</span>` : ''}
            </span>
            ${isTruncated ? '<span class="expand-icon ms-1">▼</span>' : ''}
          </div>
        `;
      })
      .filter(html => html !== '')
      .join('');

    if (rulesHTML) {
      abilitiesHTML = `
        <div class="unit-abilities mb-3">
          <h6>Abilities & Rules:</h6>
          ${rulesHTML}
        </div>
      `;
    }
  }

  unitCard.innerHTML = `
    <div class="card-body">
      <h5 class="card-title">${unit.name}</h5>
      <p class="card-text">
        Points: ${unit.points}
      </p>
      <p class="card-text">
        Total Damage per Point:
        <span class="efficiency-value ${getEfficiencyClass(unitEfficiency)}" data-stat="total-dpp">
          ${unitEfficiency.toFixed(3)}
        </span>
      </p>
      <p class="card-text">
        Total Damage:
        <span class="damage-value" data-stat="total-damage">
          ${unitDamage.total.toFixed(1)}
        </span>
        <br>
        <small class="text-muted">
          Ranged D/Point:
          <span class="efficiency-value ${getEfficiencyClass(rangedDamagePerPoint)}" data-stat="ranged-dpp">
            ${rangedDamagePerPoint.toFixed(3)}
          </span>
          <br>
          Melee D/Point:
          <span class="efficiency-value ${getEfficiencyClass(meleeDamagePerPoint)}" data-stat="melee-dpp">
            ${meleeDamagePerPoint.toFixed(3)}
          </span>
        </small>
        <br>
        <small class="text-muted" data-stat="damage-breakdown">
          Ranged: ${unitDamage.ranged.toFixed(1)} |
          Melee: ${unitDamage.melee.toFixed(1)} |
          Pistol: ${unitDamage.pistol.toFixed(1)}
          ${includeOneTimeWeapons && unitDamage.onetime > 0 ? `| One-Time: ${unitDamage.onetime.toFixed(1)}` : ''}
        </small>
      </p>
      <div class="unit-stats-table">
        <h6>Unit Stats:</h6>
        <table class="table table-sm table-bordered mb-3">
          <thead>
            <tr>
              <th>M</th>
              <th>T</th>
              <th>${svHeader}</th>
              <th>W</th>
              <th>Ld</th>
              <th>OC</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${unit.stats.move}</td>
              <td>${unit.stats.toughness}</td>
              <td>${saveDisplay}</td>
              <td>${unit.stats.wounds}</td>
              <td>${unit.stats.leadership}</td>
              <td>${unit.stats.objectiveControl}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${abilitiesHTML}
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

  // Add click handlers for expandable abilities
  setupAbilityClickHandlers(unitCard);

  return unitCard;
}

/**
 * Setup click handlers for expandable abilities
 */
function setupAbilityClickHandlers(container: HTMLElement): void {
  const expandableItems = container.querySelectorAll('.ability-item.expandable');

  expandableItems.forEach(item => {
    item.addEventListener('click', () => {
      const expanded = item.getAttribute('data-expanded') === 'true';
      const truncatedText = item.querySelector('.truncated-text') as HTMLElement;
      const fullText = item.querySelector('.full-text') as HTMLElement;
      const expandIcon = item.querySelector('.expand-icon') as HTMLElement;

      if (expanded) {
        // Collapse
        truncatedText.style.display = '';
        fullText.style.display = 'none';
        expandIcon.textContent = '▼';
        item.setAttribute('data-expanded', 'false');
      } else {
        // Expand
        truncatedText.style.display = 'none';
        fullText.style.display = '';
        expandIcon.textContent = '▲';
        item.setAttribute('data-expanded', 'true');
      }
    });
  });
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
  unitModes?: Map<string, number>,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): string {
  // Skip weapons that should be excluded based on settings
  if (!includeOneTimeWeapons && weapons.some(w => isOneTimeWeapon(w))) {
    return '';
  }

  const standardWeapon = weapons.find(w => w.name.includes('standard') || !w.name.includes('overcharge'));
  const overchargeWeapon = weapons.find(w => w.name.includes('overcharge'));

  if (standardWeapon && overchargeWeapon) {
    // Weapon has standard/overcharge modes
    const standardDamage = calculateWeaponDamage(standardWeapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitRerolls, scenarioRerolls, targetFNP);
    const overchargeDamage = calculateWeaponDamage(overchargeWeapon, targetToughness, true, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitRerolls, scenarioRerolls, targetFNP);
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
            <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(standardDamage)}" data-tooltip="${generateCalculationTooltip(standardWeapon, targetToughness, false, optimalRange, unit.unitRerolls, scenarioRerolls, targetFNP)}">
              ${standardDamage.toFixed(3)}
            </span>
            <span class="damage-value">
              (${standardDamage.toFixed(1)} dmg)
            </span>
          </span>
          <br>
          <span class="${useOvercharge ? 'active-mode' : 'inactive-mode'}">
            Overcharge:
            <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(overchargeDamage)}" data-tooltip="${generateCalculationTooltip(overchargeWeapon, targetToughness, true, optimalRange, unit.unitRerolls, scenarioRerolls, targetFNP)}">
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
      const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitRerolls, scenarioRerolls, targetFNP);
      const modeName = weapon.name.replace(baseName, '').replace(/^[ -]+/, '') || 'Mode ' + (modeIndex + 1);
      return `
        <span class="weapon-mode ${modeIndex === activeMode ? 'active-mode' : 'inactive-mode'}"
              data-mode-index="${modeIndex}">
          ${modeName}:
          <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(damage)}" data-tooltip="${generateCalculationTooltip(weapon, targetToughness, false, optimalRange, unit.unitRerolls, scenarioRerolls, targetFNP)}">
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
    const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitRerolls, scenarioRerolls, targetFNP);
    const weaponType = getWeaponType(weapon);
    const isOneTime = isOneTimeWeapon(weapon);

    return `
      <p class="mb-1">
        ${baseName} (${weapon.count})
        <span class="weapon-type ${weaponType}">[${weaponType}]</span>
        ${isOneTime ? '<span class="one-time-weapon">[One-Time]</span>' : ''}:
        <span class="calculation-tooltip efficiency-value ${getEfficiencyClass(damage)}" data-tooltip="${generateCalculationTooltip(weapon, targetToughness, false, optimalRange, unit.unitRerolls, scenarioRerolls, targetFNP)}">
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
function buildWeaponStatsHTML(baseName: string, weapons: Weapon[], includeOneTimeWeapons: boolean, army: Army): string {
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
        <td>${chars.bs || chars.ws || '-'}</td>
        <td>${chars.s || '-'}</td>
        <td>${chars.ap || '0'}</td>
        <td>${chars.d || '-'}</td>
        <td><small>${parseKeywordsWithTooltips(chars.keywords || '', army)}</small></td>
      </tr>
    `;
  }).join('');
}

/**
 * Truncate text to a maximum length
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
