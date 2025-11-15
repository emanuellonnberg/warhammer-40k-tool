function buildAbilitiesSection(unit: Unit, army: Army): string {
  const leaderRuleIdSet = new Set<string>();
  (unit.attachedLeaders || []).forEach(leader => {
    (leader.rules || []).forEach(id => leaderRuleIdSet.add(id));
    (leader.abilities || []).forEach(id => leaderRuleIdSet.add(id));
  });

  const baseRuleIds = [...(unit.rules || []), ...(unit.abilities || [])]
    .filter(id => !leaderRuleIdSet.has(id));
  const baseRules = renderRuleList(baseRuleIds, army);

  const leaderSections = (unit.attachedLeaders || [])
    .map(leader => {
      const leaderRuleIds = [...(leader.rules || []), ...(leader.abilities || [])];
      const leaderRulesHTML = renderRuleList(leaderRuleIds, army);
      if (!leaderRulesHTML) return '';
      return `
        <div class="mt-2 ps-3 border-start border-warning border-2">
          <div class="text-warning small fw-semibold mb-1">${leader.name}</div>
          ${leaderRulesHTML}
        </div>
      `;
    })
    .filter(Boolean)
    .join('');

  if (!baseRules && !leaderSections) {
    return '';
  }

  return `
    <div class="unit-abilities mb-3 p-3 border-start border-primary border-3 bg-light">
      <h6 class="text-primary mb-2">
        <i class="bi bi-lightning-charge-fill"></i> Abilities & Rules
      </h6>
      ${baseRules || '<div class="text-muted small">No native abilities listed.</div>'}
      ${leaderSections}
    </div>
  `;
}

function renderRuleList(ruleIds: string[], army: Army): string {
  if (!ruleIds || ruleIds.length === 0) return '';
  const rulesHTML = ruleIds
    .map(ruleId => {
      const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
      if (!rule || rule.hidden) return '';
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
    .filter(Boolean)
    .join('');

  return rulesHTML;
}
/**
 * UI display and rendering logic
 */

import type { Army, Unit, Weapon, SortColumn, SortDirection, RerollConfig, AttachmentMap } from '../types';
import { calculateUnitDamage } from '../calculators/damage';
import { calculateUnitEfficiency } from '../calculators/efficiency';
import { calculateWeaponDamage } from '../calculators/damage';
import { getWeaponType, isOneTimeWeapon } from '../utils/weapon';
import { getEfficiencyClass } from '../utils/styling';
import { generateCalculationTooltip, initializeTooltips } from './tooltip';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

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
 * Normalize unit names for comparison
 */
function normalizeUnitName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Determine if a unit name matches one of the leader's allowed options
 */
function matchesLeaderOption(unitName: string, leaderOptions?: string[]): boolean {
  if (!leaderOptions || leaderOptions.length === 0) return false;
  const normalizedName = normalizeUnitName(unitName);
  const unitWords = normalizedName.split(' ').filter(Boolean);
  const unitWordSet = new Set(unitWords);

  return leaderOptions.some(option => {
    const normalizedOption = normalizeUnitName(option);
    if (!normalizedOption) return false;
    if (normalizedOption === normalizedName) return true;

    if (normalizedOption.length >= 3 && normalizedName.includes(normalizedOption)) {
      return true;
    }

    const optionWords = normalizedOption.split(' ').filter(Boolean);
    if (optionWords.length === 1) {
      const word = optionWords[0];
      if (word.length >= 3 && unitWordSet.has(word)) {
        return true;
      }
    } else if (optionWords.length > 1) {
      const allMatch = optionWords.every(word => unitWordSet.has(word));
      if (allMatch) return true;
    }

    return false;
  });
}

/**
 * Get eligible host units for a leader based on their options and current roster
 */
function getEligibleLeaderTargets(leader: Unit, army: Army): Unit[] {
  if (!leader.isLeader || !leader.leaderOptions || leader.leaderOptions.length === 0) {
    return [];
  }
  return army.units.filter(unit =>
    unit.id !== leader.id &&
    !unit.isLeader &&
    matchesLeaderOption(unit.name, leader.leaderOptions)
  );
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
 * Extract Feel No Pain value from unit's abilities/rules
 * Returns numeric value like 5 for "5+" or null if no FNP
 */
function extractFeelNoPain(unit: Unit, army: Army): number | null {
  const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];

  for (const ruleId of allRuleIds) {
    const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
    if (!rule) continue;

    // Check if this is a Feel No Pain rule
    const nameLower = rule.name.toLowerCase();
    const descLower = rule.description.toLowerCase();

    if (nameLower.includes('feel no pain') || descLower.includes('feel no pain')) {
      // Try to extract the value from the name, e.g., "Feel No Pain (5+)"
      const nameMatch = rule.name.match(/\((\d+)\+/);
      if (nameMatch) {
        return parseInt(nameMatch[1]);
      }

      // Try to extract from description, e.g., "5+ Feel No Pain"
      const descMatch = rule.description.match(/(\d+)\+\s*feel no pain/i);
      if (descMatch) {
        return parseInt(descMatch[1]);
      }
    }
  }

  return null;
}

/**
 * Calculate effective wounds for a unit based on save characteristic
 * Better saves mean more effective wounds (harder to kill)
 * Now accounts for invulnerable saves (uses the better of armor or invuln)
 * Formula: Wounds × (1 / failure_rate)
 * Example: W10 with Sv3+ (fail on 1-2, 2/6 = 0.33) = 10 × 3 = 30 effective wounds
 */
function calculateEffectiveWounds(unit: Unit, army: Army): number {
  const wounds = parseInt(unit.stats.wounds) || 1;
  const armorSaveValue = parseInt(unit.stats.save.replace(/\+/g, '')) || 7;

  // Check for invulnerable save
  const invulnSaveStr = extractInvulnerableSave(unit, army);
  const invulnSaveValue = invulnSaveStr ? parseInt(invulnSaveStr.replace(/\+/g, '')) : 7;

  // Use the better save (lower number is better)
  const bestSaveValue = Math.min(armorSaveValue, invulnSaveValue);

  // Calculate save failure rate
  // Sv3+ means you fail on 1-2 (2/6), Sv5+ means you fail on 1-4 (4/6)
  const failureRate = (bestSaveValue - 1) / 6;

  // Avoid division by zero for theoretical 1+ save
  if (failureRate <= 0) return wounds * 6; // Effectively unkillable

  // Effective wounds = wounds / failure rate
  return wounds / failureRate;
}

/**
 * Get the effective toughness for a unit
 * Per 10th edition rules, when a leader is attached, the unit uses the bodyguard's toughness
 * This function returns the bodyguard's toughness (host unit's toughness) when leaders are attached
 */
function getEffectiveToughness(unit: Unit): { toughness: number; isBodyguardToughness: boolean; leaderNames: string[] } {
  const toughness = parseInt(unit.stats.toughness) || 1;
  const hasAttachedLeaders = unit.attachedLeaders && unit.attachedLeaders.length > 0;
  
  if (hasAttachedLeaders) {
    const leaderNames = unit.attachedLeaders!.map(l => l.name);
    // Per 10th edition: unit uses bodyguard's toughness when leader is attached
    return { toughness, isBodyguardToughness: true, leaderNames };
  }
  
  return { toughness, isBodyguardToughness: false, leaderNames: [] };
}

/**
 * Calculate survivability score combining wounds, toughness, save, and FNP
 * Higher score = more durable unit
 * Now includes Feel No Pain which adds significant survivability
 */
function calculateSurvivabilityScore(unit: Unit, army: Army): number {
  const effectiveWounds = calculateEffectiveWounds(unit, army);
  const { toughness } = getEffectiveToughness(unit);

  // Base survivability = effective wounds × toughness modifier
  // Toughness contributes to survivability (harder to wound)
  let survivability = effectiveWounds * (toughness / 4); // Normalized to T4

  // Apply Feel No Pain multiplier
  // FNP essentially multiplies effective wounds since it ignores wounds after failed saves
  const fnpValue = extractFeelNoPain(unit, army);
  if (fnpValue && fnpValue >= 2 && fnpValue <= 6) {
    // FNP X+ means you ignore (7-X)/6 of wounds
    // This multiplies survivability by 1/(1 - ignore_rate) = 6/(X-1)
    const fnpIgnoreRate = (7 - fnpValue) / 6;
    const fnpMultiplier = 1 / (1 - fnpIgnoreRate);
    survivability *= fnpMultiplier;
  }

  return survivability;
}

/**
 * Get maximum weapon range for a unit
 */
function getMaxWeaponRange(unit: Unit): number {
  if (!unit.weapons || unit.weapons.length === 0) return 0; // Melee only

  let maxRange = 0;
  for (const weapon of unit.weapons) {
    // Access range from characteristics object
    const rangeStr = weapon.characteristics?.range;
    if (!rangeStr) continue;

    // Parse numeric value from range string (e.g., "24\"" → 24, "Melee" → 0)
    const range = parseInt(rangeStr.replace(/[^0-9]/g, '')) || 0;
    if (range > maxRange) maxRange = range;
  }
  return maxRange;
}

/**
 * Get weighted average weapon range based on damage output
 * This gives a more accurate picture of a unit's effective range than just max range
 * Example: Unit with 10 damage at 48" and 40 damage at 24" → ~26" weighted average
 */
function getWeaponRangeWeightedByDamage(
  unit: Unit,
  targetToughness: number,
  useOvercharge: boolean,
  unitModes: Map<string, number> | undefined,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): number {
  if (!unit.weapons || unit.weapons.length === 0) return 0; // Melee only

  let totalWeightedRange = 0;
  let totalDamage = 0;

  for (const weapon of unit.weapons) {
    // Calculate damage for this weapon
    const damage = calculateWeaponDamage(
      weapon,
      targetToughness,
      useOvercharge,
      includeOneTimeWeapons,
      optimalRange,
      [],
      1,
      false,
      null,
      unit.unitModifiers,
      unit.unitRerolls,
      scenarioRerolls,
      targetFNP
    );

    // Skip weapons with no damage
    if (damage <= 0) continue;

    // Get range
    const rangeStr = weapon.characteristics?.range;
    if (!rangeStr) continue;

    // Parse numeric value from range string (e.g., "24\"" → 24, "Melee" → 0)
    const range = parseInt(rangeStr.replace(/[^0-9]/g, '')) || 0;

    // Add to weighted total
    totalWeightedRange += damage * range;
    totalDamage += damage;
  }

  // Return weighted average, or 0 if no ranged weapons
  return totalDamage > 0 ? totalWeightedRange / totalDamage : 0;
}

/**
 * Check if unit has a specific ability by name pattern
 */
function hasAbility(unit: Unit, army: Army, pattern: string): boolean {
  if (!unit.rules && !unit.abilities) return false;

  const allRuleIds = [...(unit.rules || []), ...(unit.abilities || [])];

  for (const ruleId of allRuleIds) {
    const rule = army.rules?.[ruleId] || army.abilities?.[ruleId];
    if (!rule) continue;

    const nameLower = rule.name.toLowerCase();
    const patternLower = pattern.toLowerCase();

    if (nameLower.includes(patternLower)) return true;
  }

  return false;
}

/**
 * Calculate range protection factor based on weapon ranges
 */
function getRangeProtectionFactor(maxRange: number): number {
  if (maxRange === 0) return 0.4;        // Melee only
  if (maxRange <= 12) return 0.6;        // Short range
  if (maxRange <= 24) return 1.0;        // Medium range (baseline)
  if (maxRange <= 36) return 1.5;        // Long range
  return 2.0;                             // Extreme range (37"+)
}

/**
 * Calculate movement speed bonus
 */
function getMovementFactor(moveValue: number): number {
  if (moveValue <= 6) return 1.0;        // Slow
  if (moveValue <= 10) return 1.1;       // Moderate
  if (moveValue <= 14) return 1.3;       // Fast
  return 1.5;                             // Very fast
}

/**
 * Calculate ability modifiers for tactical survivability
 */
function getAbilityModifiers(unit: Unit, army: Army): { factor: number; details: string[] } {
  let factor = 1.0;
  const details: string[] = [];

  // Deep Strike - massive survivability boost (bypass advance)
  if (hasAbility(unit, army, 'deep strike')) {
    factor *= 1.5;
    details.push('Deep Strike ×1.5');
  }

  // Infiltrators - good deployment advantage
  if (hasAbility(unit, army, 'infiltrator')) {
    factor *= 1.3;
    details.push('Infiltrators ×1.3');
  }

  // Stealth - harder to hit
  if (hasAbility(unit, army, 'stealth')) {
    factor *= 1.2;
    details.push('Stealth ×1.2');
  }

  // Minus to hit abilities (various names)
  if (hasAbility(unit, army, 'subtract 1') || hasAbility(unit, army, '-1 to hit')) {
    factor *= 1.2;
    details.push('-1 To Hit ×1.2');
  }

  // Smoke/Concealment abilities
  if (hasAbility(unit, army, 'smoke') || hasAbility(unit, army, 'concealment')) {
    factor *= 1.15;
    details.push('Smoke/Concealment ×1.15');
  }

  // Fade/Shadow abilities (like "Fade to Darkness")
  if (hasAbility(unit, army, 'fade') || hasAbility(unit, army, 'shadow')) {
    factor *= 1.25;
    details.push('Fade/Shadow ×1.25');
  }

  // Warp-based deployment (like "Hunters from the Warp", "Webway Strike")
  if (hasAbility(unit, army, 'warp') || hasAbility(unit, army, 'webway') ||
      hasAbility(unit, army, 'teleport')) {
    factor *= 1.4;
    details.push('Warp/Teleport Deployment ×1.4');
  }

  // Fly - better positioning
  if (hasAbility(unit, army, 'fly')) {
    factor *= 1.1;
    details.push('Fly ×1.1');
  }

  // Indirect Fire - can hide and shoot
  if (hasAbility(unit, army, 'indirect fire')) {
    factor *= 1.8;
    details.push('Indirect Fire ×1.8');
  }

  return { factor, details };
}

/**
 * Calculate tactical survivability accounting for range, movement, and abilities
 * Uses weighted average range by damage for more accurate positioning assessment
 */
function calculateTacticalSurvivability(
  unit: Unit,
  army: Army,
  targetToughness: number,
  useOvercharge: boolean,
  unitModes: Map<string, number> | undefined,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): {
  score: number;
  breakdown: {
    baseSurvivability: number;
    rangeProtection: number;
    movementFactor: number;
    abilityFactor: number;
    effectiveRange: number;
    moveValue: number;
    abilityDetails: string[];
  };
} {
  const baseSurvivability = calculateSurvivabilityScore(unit, army);

  // Use weighted average range based on damage output for more accurate assessment
  const effectiveRange = getWeaponRangeWeightedByDamage(
    unit,
    targetToughness,
    useOvercharge,
    unitModes,
    includeOneTimeWeapons,
    optimalRange,
    scenarioRerolls,
    targetFNP
  );

  const moveValue = parseInt(unit.stats.move.replace(/[^0-9]/g, '')) || 0;

  const rangeProtection = getRangeProtectionFactor(effectiveRange);
  const movementFactor = getMovementFactor(moveValue);
  const abilityMods = getAbilityModifiers(unit, army);

  const tacticalScore = baseSurvivability * rangeProtection * movementFactor * abilityMods.factor;

  return {
    score: tacticalScore,
    breakdown: {
      baseSurvivability,
      rangeProtection,
      movementFactor,
      abilityFactor: abilityMods.factor,
      effectiveRange,
      moveValue,
      abilityDetails: abilityMods.details
    }
  };
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
  targetFNP?: number,
  hasDefaultAttachments?: boolean,
  activeAttachments?: AttachmentMap
): void {
  const resultsDiv = document.getElementById('analysis-results');
  if (!resultsDiv) return;

  resultsDiv.innerHTML = '';

  // Create a map to store active weapon modes for each unit if not provided
  const weaponModes = activeWeaponModes || new Map<string, Map<string, number>>();

  const hiddenLeaderIds = new Set<string>();
  if (activeAttachments) {
    Object.values(activeAttachments).forEach(ids => {
      if (Array.isArray(ids)) {
        ids.forEach(id => hiddenLeaderIds.add(id));
      }
    });
  }

  const visibleUnits = army.units.filter(unit => !hiddenLeaderIds.has(unit.id));
  const armyForDisplay: Army = visibleUnits.length === army.units.length
    ? army
    : { ...army, units: visibleUnits };

  // Sort units by current sorting criteria
  const sortedUnits = [...visibleUnits].sort((a, b) => {
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

  // Create dashboard
  const dashboard = createDashboard(armyForDisplay, sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
  resultsDiv.appendChild(dashboard);

  // Create filter panel
  const filterPanel = createFilterPanel();
  resultsDiv.appendChild(filterPanel);

  if (hasDefaultAttachments) {
    const attachmentControls = createAttachmentControls();
    resultsDiv.appendChild(attachmentControls);
  }

  // Create visualization area
  const visualizationArea = createVisualizationArea(armyForDisplay, sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
  resultsDiv.appendChild(visualizationArea);

  // Create summary table
  const summaryTable = createSummaryTable(armyForDisplay, sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
  resultsDiv.appendChild(summaryTable);

  // Create unit cards
  const unitsContainer = document.createElement('div');
  unitsContainer.id = 'units-container';
  for (const unit of sortedUnits) {
    const unitCard = createUnitCard(unit, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, armyForDisplay, scenarioRerolls, targetFNP);
    unitsContainer.appendChild(unitCard);
  }
  resultsDiv.appendChild(unitsContainer);

  // Initialize tooltips for all elements with data-tooltip attribute
  initializeTooltips();

  // Setup filter event handlers
  setupFilterHandlers(armyForDisplay, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);

  // Setup leader attachment handlers
  setupLeaderAttachmentHandlers();
}

/**
 * Create filter panel for unit filtering
 */
function createFilterPanel(): HTMLElement {
  const filterPanel = document.createElement('div');
  filterPanel.className = 'card mb-4 filter-panel';
  filterPanel.innerHTML = `
    <div class="card-body">
      <h5 class="card-title">🔍 Filter Units</h5>
      <div class="row">
        <div class="col-md-6">
          <div class="mb-3">
            <label for="searchInput" class="form-label">Search by Name:</label>
            <input type="text" id="searchInput" class="form-control" placeholder="Type unit name...">
          </div>
        </div>
        <div class="col-md-6">
          <div class="mb-3">
            <label class="form-label">Points Range:</label>
            <div class="d-flex gap-2 align-items-center">
              <input type="number" id="minPoints" class="form-control" placeholder="Min" min="0" style="width: 100px;">
              <span>to</span>
              <input type="number" id="maxPoints" class="form-control" placeholder="Max" min="0" style="width: 100px;">
            </div>
          </div>
        </div>
      </div>
      <div class="row">
        <div class="col-md-6">
          <div class="mb-3">
            <label class="form-label">Efficiency Tier:</label>
            <div class="filter-checkboxes">
              <div class="form-check form-check-inline">
                <input class="form-check-input efficiency-filter" type="checkbox" id="filterHigh" value="high" checked>
                <label class="form-check-label high-efficiency" for="filterHigh">High (≥0.200)</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input efficiency-filter" type="checkbox" id="filterMedium" value="medium" checked>
                <label class="form-check-label medium-efficiency" for="filterMedium">Medium (0.100-0.199)</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input efficiency-filter" type="checkbox" id="filterLow" value="low" checked>
                <label class="form-check-label low-efficiency" for="filterLow">Low (<0.100)</label>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="mb-3">
            <label class="form-label">Weapon Type:</label>
            <div class="filter-checkboxes">
              <div class="form-check form-check-inline">
                <input class="form-check-input weapon-filter" type="checkbox" id="filterRanged" value="ranged" checked>
                <label class="form-check-label" for="filterRanged">Has Ranged</label>
              </div>
              <div class="form-check form-check-inline">
                <input class="form-check-input weapon-filter" type="checkbox" id="filterMelee" value="melee" checked>
                <label class="form-check-label" for="filterMelee">Has Melee</label>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="row">
        <div class="col-12">
          <button id="clearFilters" class="btn btn-sm btn-outline-secondary">Clear All Filters</button>
          <span id="filterCount" class="ms-3 text-muted"></span>
        </div>
      </div>
    </div>
  `;
  return filterPanel;
}

function createAttachmentControls(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card mb-4 attachment-controls-card';
  card.innerHTML = `
    <div class="card-body d-flex flex-wrap gap-3 align-items-center justify-content-between">
      <div>
        <h6 class="mb-1">Leader Attachments</h6>
        <p class="text-muted mb-0 small">
          This roster shipped with pre-attached leaders. Detach any unit to make the character visible again, or restore the roster default below.
        </p>
      </div>
      <button id="resetAttachmentsBtn" class="btn btn-outline-secondary btn-sm">
        Reset to Roster Defaults
      </button>
    </div>
  `;
  return card;
}

/**
 * Setup filter event handlers
 */
function setupFilterHandlers(
  army: Army,
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): void {
  const searchInput = document.getElementById('searchInput') as HTMLInputElement;
  const minPointsInput = document.getElementById('minPoints') as HTMLInputElement;
  const maxPointsInput = document.getElementById('maxPoints') as HTMLInputElement;
  const efficiencyFilters = document.querySelectorAll('.efficiency-filter') as NodeListOf<HTMLInputElement>;
  const weaponFilters = document.querySelectorAll('.weapon-filter') as NodeListOf<HTMLInputElement>;
  const clearButton = document.getElementById('clearFilters');

  if (!searchInput || !minPointsInput || !maxPointsInput || !clearButton) return;

  const applyFilters = () => {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const minPoints = minPointsInput.value ? parseInt(minPointsInput.value) : 0;
    const maxPoints = maxPointsInput.value ? parseInt(maxPointsInput.value) : Infinity;

    // Get selected efficiency tiers
    const selectedTiers = Array.from(efficiencyFilters)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    // Get selected weapon types
    const selectedWeaponTypes = Array.from(weaponFilters)
      .filter(cb => cb.checked)
      .map(cb => cb.value);

    // Filter units
    let visibleCount = 0;
    const tableRows = document.querySelectorAll('.table tbody tr.unit-row-clickable');
    const unitCards = document.querySelectorAll('.unit-card');

    tableRows.forEach((row, index) => {
      const unitName = (row as HTMLElement).dataset.name?.toLowerCase() || '';
      const unitPoints = parseInt((row as HTMLElement).dataset.points || '0');
      const unitEfficiency = parseFloat((row as HTMLElement).dataset.efficiency || '0');
      const rangedDamage = parseFloat((row as HTMLElement).dataset.ranged || '0');
      const meleeDamage = parseFloat((row as HTMLElement).dataset.melee || '0');

      // Apply search filter
      let visible = true;
      if (searchTerm && !unitName.includes(searchTerm)) {
        visible = false;
      }

      // Apply points range filter
      if (visible && (unitPoints < minPoints || unitPoints > maxPoints)) {
        visible = false;
      }

      // Apply efficiency filter
      if (visible && selectedTiers.length > 0) {
        const tier = unitEfficiency >= 0.200 ? 'high' : unitEfficiency >= 0.100 ? 'medium' : 'low';
        if (!selectedTiers.includes(tier)) {
          visible = false;
        }
      }

      // Apply weapon type filter
      if (visible && selectedWeaponTypes.length > 0) {
        const hasRanged = rangedDamage > 0;
        const hasMelee = meleeDamage > 0;
        const matchesFilter = selectedWeaponTypes.some(type => {
          if (type === 'ranged') return hasRanged;
          if (type === 'melee') return hasMelee;
          return false;
        });
        if (!matchesFilter) {
          visible = false;
        }
      }

      // Show/hide row and corresponding card
      (row as HTMLElement).style.display = visible ? '' : 'none';
      if (unitCards[index]) {
        (unitCards[index] as HTMLElement).style.display = visible ? '' : 'none';
      }

      if (visible) visibleCount++;
    });

    // Update filter count
    const filterCount = document.getElementById('filterCount');
    if (filterCount) {
      const totalCount = tableRows.length;
      filterCount.textContent = `Showing ${visibleCount} of ${totalCount} units`;
    }
  };

  // Add event listeners
  searchInput.addEventListener('input', applyFilters);
  minPointsInput.addEventListener('input', applyFilters);
  maxPointsInput.addEventListener('input', applyFilters);
  efficiencyFilters.forEach(cb => cb.addEventListener('change', applyFilters));
  weaponFilters.forEach(cb => cb.addEventListener('change', applyFilters));

  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    minPointsInput.value = '';
    maxPointsInput.value = '';
    efficiencyFilters.forEach(cb => cb.checked = true);
    weaponFilters.forEach(cb => cb.checked = true);
    applyFilters();
  });

  // Initial filter application
  applyFilters();
}

/**
 * Setup handlers for leader attach/detach controls
 */
function setupLeaderAttachmentHandlers(): void {
  const attachButtons = document.querySelectorAll<HTMLButtonElement>('.attach-leader-btn');
  attachButtons.forEach(button => {
    button.addEventListener('click', () => {
      const leaderId = button.dataset.leaderId;
      const container = button.closest('.leader-attachment-controls');
      const select = container?.querySelector('.leader-target-select') as HTMLSelectElement | null;
      const hostUnitId = select?.value;

      if (!leaderId) return;
      if (!hostUnitId) {
        alert('Select a unit from the list before attaching this leader.');
        return;
      }

      window.dispatchEvent(new CustomEvent('leader-attach', {
        detail: { leaderId, hostUnitId }
      }));
    });
  });

  const detachButtons = document.querySelectorAll<HTMLButtonElement>('.detach-leader-btn');
  detachButtons.forEach(button => {
    button.addEventListener('click', () => {
      const leaderId = button.dataset.leaderId;
      const hostUnitId = button.dataset.hostUnitId;
      if (!leaderId) return;

      window.dispatchEvent(new CustomEvent('leader-detach', {
        detail: { leaderId, hostUnitId }
      }));
    });
  });

  const resetButton = document.getElementById('resetAttachmentsBtn');
  if (resetButton) {
    resetButton.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('leader-reset-defaults'));
    });
  }
}

/**
 * Create visualization area with charts
 */
function createVisualizationArea(
  army: Army,
  sortedUnits: Unit[],
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): HTMLElement {
  const vizArea = document.createElement('div');
  vizArea.className = 'card mb-4 visualization-card';
  vizArea.innerHTML = `
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="card-title mb-0">📈 Visualizations</h5>
        <select id="chartTypeSelector" class="form-select" style="width: 200px;">
          <option value="damage-curve">Damage vs Toughness</option>
          <option value="dpp-bars">Efficiency (DPP) Bars</option>
        </select>
      </div>
      <div class="chart-container" style="position: relative; height: 400px;">
        <canvas id="mainChart"></canvas>
      </div>
    </div>
  `;

  // Initialize with damage curve chart
  setTimeout(() => {
    createDamageCurveChart(sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);

    // Setup chart type selector
    const selector = document.getElementById('chartTypeSelector') as HTMLSelectElement;
    if (selector) {
      selector.addEventListener('change', () => {
        const chartType = selector.value;
        if (chartType === 'damage-curve') {
          createDamageCurveChart(sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
        } else if (chartType === 'dpp-bars') {
          createDPPBarChart(sortedUnits, targetToughness, useOvercharge, weaponModes, includeOneTimeWeapons, optimalRange, scenarioRerolls, targetFNP);
        }
      });
    }
  }, 100);

  return vizArea;
}

/**
 * Create damage curve chart showing damage vs toughness
 */
let currentChart: Chart | null = null;

function createDamageCurveChart(
  units: Unit[],
  currentToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): void {
  const canvas = document.getElementById('mainChart') as HTMLCanvasElement;
  if (!canvas) return;

  // Destroy existing chart
  if (currentChart) {
    currentChart.destroy();
  }

  // Calculate damage for each unit across T3-T12
  const toughnessValues = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const colors = [
    '#1e88e5', '#43a047', '#fb8c00', '#e53935', '#7b1fa2',
    '#00897b', '#d81b60', '#5e35b1', '#3949ab', '#00acc1'
  ];

  const datasets = units.slice(0, 10).map((unit, index) => {
    const data = toughnessValues.map(t => {
      const damage = calculateUnitDamage(
        unit,
        t,
        useOvercharge,
        weaponModes.get(unit.id),
        includeOneTimeWeapons,
        optimalRange,
        [],
        1,
        false,
        null,
        scenarioRerolls,
        targetFNP
      );
      return damage.total;
    });

    return {
      label: unit.name,
      data,
      borderColor: colors[index % colors.length],
      backgroundColor: colors[index % colors.length] + '20',
      tension: 0.1,
      pointRadius: 4,
      pointHoverRadius: 6
    };
  });

  currentChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: toughnessValues.map(t => `T${t}`),
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: 'Damage Output vs Target Toughness',
          font: { size: 16, weight: 'bold' }
        },
        legend: {
          display: true,
          position: 'bottom'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Total Damage'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Target Toughness'
          }
        }
      },
      interaction: {
        mode: 'nearest',
        axis: 'x',
        intersect: false
      }
    }
  });
}

/**
 * Create DPP bar chart showing efficiency ranking
 */
function createDPPBarChart(
  units: Unit[],
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): void {
  const canvas = document.getElementById('mainChart') as HTMLCanvasElement;
  if (!canvas) return;

  // Destroy existing chart
  if (currentChart) {
    currentChart.destroy();
  }

  // Calculate DPP for each unit and sort
  const unitDPP = units.map(unit => {
    const damage = calculateUnitDamage(
      unit,
      targetToughness,
      useOvercharge,
      weaponModes.get(unit.id),
      includeOneTimeWeapons,
      optimalRange,
      [],
      1,
      false,
      null,
      scenarioRerolls,
      targetFNP
    );
    const dpp = damage.total / unit.points;
    return { name: unit.name, dpp, efficiency: dpp };
  }).sort((a, b) => b.dpp - a.dpp);

  // Color code by efficiency tier
  const backgroundColors = unitDPP.map(u => {
    if (u.efficiency >= 0.200) return '#43a047';  // High - green
    if (u.efficiency >= 0.100) return '#fb8c00';  // Medium - orange
    return '#e53935';  // Low - red
  });

  currentChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: unitDPP.map(u => u.name),
      datasets: [{
        label: 'Damage per Point (DPP)',
        data: unitDPP.map(u => u.dpp),
        backgroundColor: backgroundColors,
        borderWidth: 1
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: `Unit Efficiency (vs T${targetToughness})`,
          font: { size: 16, weight: 'bold' }
        },
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `DPP: ${context.parsed.x.toFixed(3)}`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Damage per Point'
          }
        }
      }
    }
  });
}

/**
 * Create dashboard element with army statistics
 */
function createDashboard(
  army: Army,
  sortedUnits: Unit[],
  targetToughness: number,
  useOvercharge: boolean,
  weaponModes: Map<string, Map<string, number>>,
  includeOneTimeWeapons: boolean,
  optimalRange: boolean,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
): HTMLElement {
  // Calculate army-level statistics
  // Calculate total points from units if pointsTotal is not set or is 0
  const totalPoints = army.pointsTotal || army.units.reduce((sum, unit) => sum + unit.points, 0);
  const unitCount = army.units.length;

  // Calculate DPP and total damage for each unit
  const unitStats = sortedUnits.map(unit => {
    const damage = calculateUnitDamage(
      unit,
      targetToughness,
      useOvercharge,
      weaponModes.get(unit.id),
      includeOneTimeWeapons,
      optimalRange,
      [],
      1,
      false,
      null,
      scenarioRerolls,
      targetFNP
    );
    const dpp = damage.total / unit.points;
    const efficiency = calculateUnitEfficiency(
      unit,
      targetToughness,
      useOvercharge,
      includeOneTimeWeapons,
      optimalRange,
      weaponModes.get(unit.id)
    );
    return {
      unit,
      damage: damage.total,
      dpp,
      efficiency
    };
  });

  // Calculate average DPP
  const totalDamage = unitStats.reduce((sum, stat) => sum + stat.damage, 0);
  const averageDPP = totalPoints > 0 ? totalDamage / totalPoints : 0;

  // Get top 3 performers
  const topPerformers = [...unitStats]
    .sort((a, b) => b.dpp - a.dpp)
    .slice(0, 3);

  // Calculate efficiency distribution
  const highEfficiency = unitStats.filter(s => s.efficiency >= 0.200).length;
  const mediumEfficiency = unitStats.filter(s => s.efficiency >= 0.100 && s.efficiency < 0.200).length;
  const lowEfficiency = unitStats.filter(s => s.efficiency < 0.100).length;

  const highPercent = unitCount > 0 ? ((highEfficiency / unitCount) * 100).toFixed(0) : '0';
  const mediumPercent = unitCount > 0 ? ((mediumEfficiency / unitCount) * 100).toFixed(0) : '0';
  const lowPercent = unitCount > 0 ? ((lowEfficiency / unitCount) * 100).toFixed(0) : '0';

  // Calculate mobility and survivability statistics
  const movementValues = sortedUnits.map(u => parseInt(u.stats.move.replace(/[^0-9]/g, '')) || 0);
  const averageMovement = movementValues.length > 0
    ? (movementValues.reduce((sum, m) => sum + m, 0) / movementValues.length).toFixed(1)
    : '0';

  const fastUnits = sortedUnits.filter(u => (parseInt(u.stats.move.replace(/[^0-9]/g, '')) || 0) >= 10).length;
  const slowUnits = sortedUnits.filter(u => (parseInt(u.stats.move.replace(/[^0-9]/g, '')) || 0) <= 6).length;

  const totalWounds = sortedUnits.reduce((sum, u) => sum + (parseInt(u.stats.wounds) || 0), 0);
  const toughnessValues = sortedUnits.map(u => parseInt(u.stats.toughness) || 0).sort((a, b) => a - b);
  const medianToughness = toughnessValues.length > 0
    ? toughnessValues[Math.floor(toughnessValues.length / 2)]
    : 0;

  const survivabilityStats = sortedUnits.map(u => ({
    unit: u,
    survivability: calculateSurvivabilityScore(u, army)
  }));

  const averageSurvivability = survivabilityStats.length > 0
    ? (survivabilityStats.reduce((sum, s) => sum + s.survivability, 0) / survivabilityStats.length).toFixed(1)
    : '0';

  const topSurvivors = [...survivabilityStats]
    .sort((a, b) => b.survivability - a.survivability)
    .slice(0, 3);

  const dashboard = document.createElement('div');
  dashboard.className = 'card mb-4 dashboard-card';
  dashboard.innerHTML = `
    <div class="card-body">
      <h5 class="card-title">📊 Army Dashboard</h5>
      <div class="row">
        <div class="col-md-6">
          <div class="dashboard-section">
            <h6 class="dashboard-subtitle">Army Overview</h6>
            <div class="dashboard-stats">
              <div class="dashboard-stat">
                <span class="stat-label">Faction:</span>
                <span class="stat-value">${army.faction}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Army Name:</span>
                <span class="stat-value">${army.armyName || 'Unnamed Army'}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Total Points:</span>
                <span class="stat-value">${totalPoints} pts</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Unit Count:</span>
                <span class="stat-value">${unitCount} unit${unitCount !== 1 ? 's' : ''}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Average DPP:</span>
                <span class="stat-value ${getEfficiencyClass(averageDPP)}">${isFinite(averageDPP) ? averageDPP.toFixed(3) : '0.000'}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Total Damage vs T${targetToughness}:</span>
                <span class="stat-value">${totalDamage.toFixed(1)}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="dashboard-section">
            <h6 class="dashboard-subtitle">Top Performers (vs T${targetToughness})</h6>
            <div class="top-performers">
              ${topPerformers.map((stat, index) => {
                const medal = ['🥇', '🥈', '🥉'][index];
                return `
                  <div class="top-performer-item">
                    <span class="performer-rank">${medal}</span>
                    <span class="performer-name">${stat.unit.name}</span>
                    <span class="performer-dpp ${getEfficiencyClass(stat.dpp)}">DPP: ${stat.dpp.toFixed(3)}</span>
                  </div>
                `;
              }).join('')}
            </div>

            <h6 class="dashboard-subtitle mt-3">Efficiency Distribution</h6>
            <div class="efficiency-distribution">
              <div class="efficiency-bar-item">
                <span class="efficiency-label high-efficiency">High (≥0.200):</span>
                <div class="efficiency-bar-container">
                  <div class="efficiency-bar high-efficiency-bar" style="width: ${highPercent}%"></div>
                </div>
                <span class="efficiency-count">${highEfficiency} unit${highEfficiency !== 1 ? 's' : ''} (${highPercent}%)</span>
              </div>
              <div class="efficiency-bar-item">
                <span class="efficiency-label medium-efficiency">Medium (0.100-0.199):</span>
                <div class="efficiency-bar-container">
                  <div class="efficiency-bar medium-efficiency-bar" style="width: ${mediumPercent}%"></div>
                </div>
                <span class="efficiency-count">${mediumEfficiency} unit${mediumEfficiency !== 1 ? 's' : ''} (${mediumPercent}%)</span>
              </div>
              <div class="efficiency-bar-item">
                <span class="efficiency-label low-efficiency">Low (<0.100):</span>
                <div class="efficiency-bar-container">
                  <div class="efficiency-bar low-efficiency-bar" style="width: ${lowPercent}%"></div>
                </div>
                <span class="efficiency-count">${lowEfficiency} unit${lowEfficiency !== 1 ? 's' : ''} (${lowPercent}%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="row mt-3">
        <div class="col-md-6">
          <div class="dashboard-section">
            <h6 class="dashboard-subtitle">⚡ Army Mobility</h6>
            <div class="dashboard-stats">
              <div class="dashboard-stat">
                <span class="stat-label">Average Movement:</span>
                <span class="stat-value">${averageMovement}"</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Fast Units (M≥10"):</span>
                <span class="stat-value">${fastUnits} unit${fastUnits !== 1 ? 's' : ''}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Slow Units (M≤6"):</span>
                <span class="stat-value">${slowUnits} unit${slowUnits !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6">
          <div class="dashboard-section">
            <h6 class="dashboard-subtitle">🛡️ Army Survivability</h6>
            <div class="dashboard-stats">
              <div class="dashboard-stat">
                <span class="stat-label">Total Wounds:</span>
                <span class="stat-value">${totalWounds} W</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Median Toughness:</span>
                <span class="stat-value">T${medianToughness}</span>
              </div>
              <div class="dashboard-stat">
                <span class="stat-label">Avg Survivability Score:</span>
                <span class="stat-value">${averageSurvivability}</span>
              </div>
            </div>
            <h6 class="dashboard-subtitle mt-3">Most Durable Units</h6>
            <div class="top-performers">
              ${topSurvivors.map((stat, index) => {
                const medal = ['🥇', '🥈', '🥉'][index];
                return `
                  <div class="top-performer-item">
                    <span class="performer-rank">${medal}</span>
                    <span class="performer-name">${stat.unit.name}</span>
                    <span class="performer-dpp">Surv: ${stat.survivability.toFixed(1)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return dashboard;
}

/**
 * Create summary table element
 */
function createSummaryTable(
  army: Army,
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
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h5 class="card-title mb-0">Unit Summary</h5>
        <button id="exportCSV" class="btn btn-sm btn-outline-primary">
          📊 Export CSV
        </button>
      </div>
      <div class="table-responsive">
        <table class="table table-sm">
          <thead>
            <tr>
              <th class="sortable" data-sort="name">Unit</th>
              <th class="sortable" data-sort="points">Points</th>
              <th class="sortable" data-sort="move" title="Movement">M</th>
              <th class="sortable" data-sort="toughness" title="Toughness">T</th>
              <th class="sortable" data-sort="save" title="Save">Sv</th>
              <th class="sortable" data-sort="wounds" title="Wounds">W</th>
              <th class="sortable" data-sort="survivability" title="Tactical Survivability (accounts for range, movement, and abilities)">Tact. Surv.</th>
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

              // Parse numeric values from stats for sorting
              const moveValue = parseInt(unit.stats.move.replace(/[^0-9]/g, '')) || 0;
              const { toughness: toughnessValue, isBodyguardToughness, leaderNames } = getEffectiveToughness(unit);
              const saveValue = parseInt(unit.stats.save.replace(/\+/g, '')) || 0;
              const woundsValue = parseInt(unit.stats.wounds) || 0;

              // Calculate survivability metrics
              const baseSurvivability = calculateSurvivabilityScore(unit, army);
              const effectiveWounds = calculateEffectiveWounds(unit, army);
              const tacticalSurv = calculateTacticalSurvivability(
                unit,
                army,
                targetToughness,
                useOvercharge,
                unitModes,
                includeOneTimeWeapons,
                optimalRange,
                scenarioRerolls,
                targetFNP
              );
              const survivability = tacticalSurv.score; // Use tactical for sorting

              const leaderBadge = leaderNames.length
                ? `<div class="text-muted small">Leaders: ${leaderNames.join(', ')}</div>`
                : '';

              // Build toughness tooltip note
              const toughnessNote = isBodyguardToughness
                ? `&#10;Note: Uses bodyguard's toughness (T${toughnessValue}) per 10th ed. rules`
                : '';

              return `
                <tr class="unit-row-clickable"
                    data-unit-id="${unit.id}"
                    data-name="${unit.name}"
                    data-points="${unit.points}"
                    data-move="${moveValue}"
                    data-toughness="${toughnessValue}"
                    data-save="${saveValue}"
                    data-wounds="${woundsValue}"
                    data-survivability="${survivability}"
                    data-efficiency="${efficiency}"
                    data-dpp="${damagePerPoint}"
                    data-rangeddpp="${rangedDamagePerPoint}"
                    data-meleedpp="${meleeDamagePerPoint}"
                    data-ranged="${damage.ranged}"
                    data-melee="${damage.melee}"
                    data-pistol="${damage.pistol}"
                    ${includeOneTimeWeapons ? `data-onetime="${damage.onetime}"` : ''}>
                  <td>
                    <a href="#unit-${unit.id}" class="unit-link">${unit.name}</a>
                    ${leaderBadge}
                  </td>
                  <td>${unit.points}</td>
                  <td>${unit.stats.move}</td>
                  <td class="${isBodyguardToughness ? 'calculation-tooltip' : ''}" ${isBodyguardToughness ? `data-tooltip="Toughness: ${unit.stats.toughness}${toughnessNote}"` : ''}>${unit.stats.toughness}</td>
                  <td>${unit.stats.save}</td>
                  <td>${unit.stats.wounds}</td>
                  <td class="calculation-tooltip" data-tooltip="Tactical Survivability: ${survivability.toFixed(1)}&#10;Base: ${baseSurvivability.toFixed(1)}&#10;Range: ×${tacticalSurv.breakdown.rangeProtection.toFixed(1)} (${tacticalSurv.breakdown.effectiveRange.toFixed(0)}\")&#10;Move: ×${tacticalSurv.breakdown.movementFactor.toFixed(1)}&#10;Abilities: ×${tacticalSurv.breakdown.abilityFactor.toFixed(2)}${toughnessNote}">
                    ${survivability.toFixed(1)}
                  </td>
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
    addRowClickHandlers(table);
  }

  // Add CSV export handler
  const exportButton = summaryTable.querySelector('#exportCSV');
  if (exportButton && table) {
    exportButton.addEventListener('click', () => exportTableToCSV(table, sortedUnits, targetToughness));
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
 * Add row click handlers to scroll to unit cards
 */
function addRowClickHandlers(table: HTMLTableElement): void {
  const rows = table.querySelectorAll('tbody tr.unit-row-clickable');

  rows.forEach(row => {
    (row as HTMLElement).style.cursor = 'pointer';

    row.addEventListener('click', () => {
      const unitId = (row as HTMLElement).dataset.unitId;
      if (unitId) {
        const unitCard = document.getElementById(`unit-${unitId}`);
        if (unitCard) {
          unitCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Add brief highlight effect
          unitCard.style.transition = 'box-shadow 0.3s ease';
          unitCard.style.boxShadow = '0 0 20px rgba(30, 136, 229, 0.5)';
          setTimeout(() => {
            unitCard.style.boxShadow = '';
          }, 1500);
        }
      }
    });
  });
}

/**
 * Export table data to CSV
 */
function exportTableToCSV(table: HTMLTableElement, units: Unit[], targetToughness: number): void {
  const rows: string[][] = [];

  // Add header row
  const headers: string[] = [];
  table.querySelectorAll('thead th').forEach(th => {
    const text = (th.textContent || '').replace(/[↑↓]/g, '').trim();
    headers.push(text);
  });
  rows.push(headers);

  // Add data rows (only visible ones)
  const visibleRows = Array.from(table.querySelectorAll('tbody tr')).filter(
    row => (row as HTMLElement).style.display !== 'none'
  );

  visibleRows.forEach(tr => {
    const cols: string[] = [];
    tr.querySelectorAll('td').forEach(td => {
      // Get text content, remove any HTML
      const text = (td.textContent || '').trim();
      cols.push(text);
    });
    rows.push(cols);
  });

  // Convert to CSV format
  const csvContent = rows.map(row =>
    row.map(cell => {
      // Escape quotes and wrap in quotes if contains comma
      const escaped = cell.replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    }).join(',')
  ).join('\n');

  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `40k-efficiency-T${targetToughness}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

  // Calculate survivability metrics
  const effectiveWounds = calculateEffectiveWounds(unit, army);
  const survivabilityScore = calculateSurvivabilityScore(unit, army);
  const tacticalSurv = calculateTacticalSurvivability(
    unit,
    army,
    targetToughness,
    useOvercharge,
    unitModes,
    includeOneTimeWeapons,
    optimalRange,
    scenarioRerolls,
    targetFNP
  );
  const { toughness: toughnessValue, isBodyguardToughness, leaderNames } = getEffectiveToughness(unit);
  const armorSaveValue = parseInt(unit.stats.save.replace(/\+/g, '')) || 7;
  const woundsValue = parseInt(unit.stats.wounds) || 1;

  // Get invuln save and FNP for tooltip
  const invulnSaveStr = extractInvulnerableSave(unit, army);
  const invulnSaveValue = invulnSaveStr ? parseInt(invulnSaveStr.replace(/\+/g, '')) : 7;
  const bestSaveValue = Math.min(armorSaveValue, invulnSaveValue);
  const usingInvuln = invulnSaveValue < armorSaveValue;
  const fnpValue = extractFeelNoPain(unit, army);

  // Build detailed tactical survivability tooltip
  const effectiveRange = tacticalSurv.breakdown.effectiveRange;
  const rangeCategory = effectiveRange === 0 ? 'Melee only' :
                       effectiveRange <= 12 ? 'Short' :
                       effectiveRange <= 24 ? 'Medium' :
                       effectiveRange <= 36 ? 'Long' : 'Extreme';

  const abilityLines = tacticalSurv.breakdown.abilityDetails.length > 0
    ? tacticalSurv.breakdown.abilityDetails.join(', ')
    : 'None';

  // Build save display for tooltip
  let tooltipSaveDisplay = `Sv${unit.stats.save}`;
  if (invulnSaveStr) {
    tooltipSaveDisplay += ` / Inv${invulnSaveStr}`;
    if (usingInvuln) {
      tooltipSaveDisplay += ' (using Invuln)';
    }
  }
  if (fnpValue) {
    tooltipSaveDisplay += ` + FNP${fnpValue}+`;
  }

  // Build toughness display with bodyguard note if applicable
  let toughnessDisplay = `T${toughnessValue}`;
  if (isBodyguardToughness) {
    toughnessDisplay += ` (Bodyguard's T, per 10th ed. rules)`;
  }

  const tacticalTooltip = `Tactical Survivability
Base: ${tacticalSurv.breakdown.baseSurvivability.toFixed(1)} (W${woundsValue} ${tooltipSaveDisplay} ${toughnessDisplay})
${isBodyguardToughness ? `Note: Unit uses bodyguard's toughness (T${toughnessValue}) when leader${leaderNames.length > 1 ? 's' : ''} attached (${leaderNames.join(', ')})` : ''}${isBodyguardToughness ? '\n' : ''}Range Protection: ${rangeCategory} ${effectiveRange.toFixed(0)}in (weighted avg) → x${tacticalSurv.breakdown.rangeProtection.toFixed(1)}
Movement Bonus: ${tacticalSurv.breakdown.moveValue}in → x${tacticalSurv.breakdown.movementFactor.toFixed(1)}
Ability Bonus: ${abilityLines} → x${tacticalSurv.breakdown.abilityFactor.toFixed(2)}
Total: ${tacticalSurv.score.toFixed(1)}`;

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

  const abilitiesHTML = buildAbilitiesSection(unit, army);

  const attachedLeadersHTML = buildAttachedLeadersSection(unit, army);
  const leaderControlsHTML = buildLeaderAttachmentControls(unit, army);

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
      <div class="survivability-section mb-3 p-2 border-start border-success border-2 bg-light">
        <h6 class="text-success mb-2">
          <i class="bi bi-shield-fill-check"></i> Survivability Metrics
        </h6>
        <div class="row">
          <div class="col-4">
            <small class="text-muted">Effective Wounds:</small>
            <div class="calculation-tooltip" data-tooltip="Effective Wounds&#10;${woundsValue} wounds ÷ save failure rate&#10;Using: ${usingInvuln ? invulnSaveStr + '+ invuln' : unit.stats.save + ' armor'}&#10;= ${effectiveWounds.toFixed(1)}">
              <strong class="text-success">${effectiveWounds.toFixed(1)}</strong>
            </div>
          </div>
          <div class="col-4">
            <small class="text-muted">Base Surv.:</small>
            <div class="calculation-tooltip" data-tooltip="Base Survivability&#10;Effective Wounds × (Toughness/4)${fnpValue ? ' × FNP' + fnpValue + '+ multiplier' : ''}&#10;${effectiveWounds.toFixed(1)} × (${toughnessValue}/4)${fnpValue ? ' × ' + (1 / (1 - (7 - fnpValue) / 6)).toFixed(2) : ''} = ${survivabilityScore.toFixed(1)}">
              <strong class="text-success">${survivabilityScore.toFixed(1)}</strong>
            </div>
          </div>
          <div class="col-4">
            <small class="text-muted">Tactical Surv.:</small>
            <div class="calculation-tooltip" data-tooltip="${tacticalTooltip.replace(/\n/g, '&#10;')}">
              <strong class="text-success fs-5">${tacticalSurv.score.toFixed(1)}</strong>
            </div>
          </div>
        </div>
      </div>
      <div class="unit-stats-table">
        <h6>Unit Stats:</h6>
        <table class="table table-sm table-bordered mb-3">
          <thead>
            <tr>
              <th>M</th>
              <th>T${isBodyguardToughness ? ' <span class="badge bg-info" title="Uses bodyguard\'s toughness per 10th ed. rules">BG</span>' : ''}</th>
              <th>${svHeader}</th>
              <th>W</th>
              <th>Ld</th>
              <th>OC</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${unit.stats.move}</td>
              <td class="${isBodyguardToughness ? 'calculation-tooltip' : ''}" ${isBodyguardToughness ? `data-tooltip="Toughness: ${unit.stats.toughness}&#10;Note: Uses bodyguard's toughness (T${toughnessValue}) per 10th ed. rules"` : ''}>${unit.stats.toughness}${isBodyguardToughness ? ' <small class="text-muted">(BG)</small>' : ''}</td>
              <td>${saveDisplay}</td>
              <td>${unit.stats.wounds}</td>
              <td>${unit.stats.leadership}</td>
              <td>${unit.stats.objectiveControl}</td>
            </tr>
          </tbody>
        </table>
      </div>
      ${attachedLeadersHTML}
      ${abilitiesHTML}
      ${leaderControlsHTML}
      <div class="weapon-list mt-3">
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
 * Build the attached leaders section for a unit card
 */
function buildAttachedLeadersSection(unit: Unit, army: Army): string {
  if (!unit.attachedLeaders || unit.attachedLeaders.length === 0) {
    return '';
  }

  const leaderCards = unit.attachedLeaders.map(leader => {
    const ruleNames = (leader.rules || [])
      .map(ruleId => army.rules?.[ruleId]?.name)
      .filter(Boolean)
      .slice(0, 3);
    const abilityNames = (leader.abilities || [])
      .map(abilityId => army.abilities?.[abilityId]?.name)
      .filter(Boolean)
      .slice(0, 3);

    const metadata = [
      `${leader.points} pts`,
      leader.stats?.wounds ? `${leader.stats.wounds} W` : null,
      leader.stats?.toughness ? `T${leader.stats.toughness}` : null
    ].filter(Boolean).join(' • ');

    const flavor = [
      ruleNames.length ? `Rules: ${ruleNames.join(', ')}` : null,
      abilityNames.length ? `Abilities: ${abilityNames.join(', ')}` : null
    ].filter(Boolean).join(' • ');

    return `
      <div class="attached-leader-pill d-flex justify-content-between align-items-center gap-2 mb-2 p-2 bg-white border rounded" data-host-unit-id="${unit.id}" data-leader-id="${leader.id}">
        <div>
          <strong>${leader.name}</strong>
          <div class="text-muted small">${metadata}</div>
          ${flavor ? `<div class="text-muted small">${flavor}</div>` : ''}
        </div>
        <button type="button" class="btn btn-sm btn-outline-danger detach-leader-btn" data-host-unit-id="${unit.id}" data-leader-id="${leader.id}">
          Detach
        </button>
      </div>
    `;
  }).join('');

  return `
    <div class="attached-leaders-section mb-3 p-3 border-start border-warning border-3 bg-light">
      <h6 class="text-warning mb-2"><i class="bi bi-person-fill-up"></i> Attached Leaders</h6>
      ${leaderCards}
    </div>
  `;
}

/**
 * Build leader attachment controls for leader units
 */
function buildLeaderAttachmentControls(unit: Unit, army: Army): string {
  if (!unit.isLeader) return '';
  const allowedTargets = unit.leaderOptions || [];
  const eligibleTargets = getEligibleLeaderTargets(unit, army);

  const optionsHTML = eligibleTargets.map(target => `
    <option value="${target.id}">
      ${target.name} (${target.points} pts)
    </option>
  `).join('');

  const allowedList = allowedTargets.length > 0
    ? allowedTargets.join(', ')
    : 'No units detected';

  return `
    <div class="leader-attachment-controls mb-3 p-3 border-start border-info border-3 bg-light" data-leader-id="${unit.id}">
      <h6 class="text-info mb-2">
        <i class="bi bi-person-plus-fill"></i> Leader Attachment
      </h6>
      <div class="d-flex gap-2 align-items-center mb-2 flex-wrap">
        <select class="form-select form-select-sm leader-target-select" data-leader-id="${unit.id}" ${eligibleTargets.length === 0 ? 'disabled' : ''}>
          <option value="">Select a unit...</option>
          ${optionsHTML}
        </select>
        <button type="button" class="btn btn-sm btn-primary attach-leader-btn" data-leader-id="${unit.id}" ${eligibleTargets.length === 0 ? 'disabled' : ''}>
          Attach
        </button>
      </div>
      <small class="text-muted d-block">Can lead: ${allowedList}</small>
      ${eligibleTargets.length === 0 ? '<div class="text-warning small mt-2">No eligible bodyguard units from this roster are currently available.</div>' : ''}
    </div>
  `;
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
    const standardDamage = calculateWeaponDamage(standardWeapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitModifiers, unit.unitRerolls, scenarioRerolls, targetFNP);
    const overchargeDamage = calculateWeaponDamage(overchargeWeapon, targetToughness, true, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitModifiers, unit.unitRerolls, scenarioRerolls, targetFNP);
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
      const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitModifiers, unit.unitRerolls, scenarioRerolls, targetFNP);
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
    const damage = calculateWeaponDamage(weapon, targetToughness, false, includeOneTimeWeapons, optimalRange, [], 1, false, null, unit.unitModifiers, unit.unitRerolls, scenarioRerolls, targetFNP);
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
