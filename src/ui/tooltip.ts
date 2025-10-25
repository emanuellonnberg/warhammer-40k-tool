/**
 * Tooltip generation and initialization
 */

import type { Weapon } from '../types';
import { parseNumeric, parseDamage } from '../utils/numeric';
import { applySpecialRules } from '../rules/special-weapons';

/**
 * Generate tooltip content showing calculation breakdown
 * @param weapon - Weapon to analyze
 * @param targetToughness - Target's toughness value
 * @param useOvercharge - Whether to use overcharge mode
 * @param optimalRange - Whether at optimal range
 * @returns HTML-encoded tooltip text
 */
export function generateCalculationTooltip(
  weapon: Weapon,
  targetToughness: number,
  useOvercharge: boolean = false,
  optimalRange: boolean = true
): string {
  const chars = weapon.characteristics;

  let strength = parseNumeric(chars.s || "0");
  let attacks = parseNumeric(chars.a || "0");
  let damage = parseDamage(chars.d || "0");
  let ap = parseNumeric(chars.ap || "0");

  if (useOvercharge && weapon.overcharge_mode) {
    const overchargeChars = weapon.overcharge_mode.split(',').reduce((acc, curr) => {
      const [key, value] = curr.trim().split(':').map(s => s.trim());
      acc[key] = value;
      return acc;
    }, {} as { [key: string]: string });

    if (overchargeChars.s) strength = parseNumeric(overchargeChars.s);
    if (overchargeChars.d) damage = parseDamage(overchargeChars.d);
    if (overchargeChars.ap) ap = parseNumeric(overchargeChars.ap);
  }

  const keywords = chars.keywords || "";
  let hitChance = 1 / 2; // Default to 4+
  let hitDisplay = "";

  // Torrent weapons automatically hit
  if (keywords.toLowerCase().includes("torrent")) {
    hitChance = 1; // 100% hit chance
    hitDisplay = "Auto-hit (Torrent)";
  } else {
    // Check for BS (ranged) or WS (melee)
    const skill = chars.bs || chars.ws || "4+";
    hitDisplay = skill;
    if (skill === "2+") hitChance = 5 / 6;
    if (skill === "3+") hitChance = 2 / 3;
    if (skill === "4+") hitChance = 1 / 2;
    if (skill === "5+") hitChance = 1 / 3;
    if (skill === "6+") hitChance = 1 / 6;
  }

  let woundChance = 0;
  let woundRoll = "";
  if (strength >= targetToughness * 2) {
    woundChance = 5 / 6;
    woundRoll = "2+";
  } else if (strength > targetToughness) {
    woundChance = 2 / 3;
    woundRoll = "3+";
  } else if (strength === targetToughness) {
    woundChance = 1 / 2;
    woundRoll = "4+";
  } else if (strength * 2 <= targetToughness) {
    woundChance = 1 / 6;
    woundRoll = "6+";
  } else {
    woundChance = 1 / 3;
    woundRoll = "5+";
  }

  // Apply special rules
  const specialRules = applySpecialRules(weapon, attacks, hitChance, woundChance, damage, targetToughness, optimalRange);
  const expectedDamage = weapon.count * specialRules.totalDamage;

  let tooltipText = `Calculation Breakdown:&#10;${weapon.count} weapon(s) × ${attacks} attacks × ${(hitChance * 100).toFixed(1)}% hit (${hitDisplay}) × ${(woundChance * 100).toFixed(1)}% wound (${woundRoll}) × ${damage} damage`;

  if (specialRules.breakdown) {
    tooltipText += `&#10;Special Rules: ${specialRules.breakdown}`;
  }

  tooltipText += `&#10;= ${expectedDamage.toFixed(2)} expected damage&#10;&#10;Stats: S${strength} vs T${targetToughness}, AP${ap}, Damage ${chars.d || damage}${useOvercharge ? ' (Overcharged)' : ''}${optimalRange ? ' (Optimal Range)' : ' (Max Range)'}`;

  if (keywords.includes('torrent') || keywords.includes('Torrent')) {
    tooltipText += '&#10;Special: Torrent (Auto-hit)';
  }

  return tooltipText;
}

/**
 * Initialize tooltips from data attributes
 */
export function initializeTooltips(): void {
  document.querySelectorAll('.calculation-tooltip[data-tooltip]').forEach(element => {
    const tooltipText = element.getAttribute('data-tooltip');
    if (!tooltipText) return;

    // Create tooltip element
    const tooltipDiv = document.createElement('div');
    tooltipDiv.className = 'tooltip-content';
    tooltipDiv.textContent = tooltipText.replace(/&#10;/g, '\n');

    // Append to element
    element.appendChild(tooltipDiv);
  });
}
