/**
 * Tooltip generation and initialization
 */

import type { Weapon, RerollConfig } from '../types';
import { parseNumeric, parseDamage } from '../utils/numeric';
import { applySpecialRules } from '../rules/special-weapons';
import { calculateHitChanceWithReroll, calculateWoundChanceWithReroll } from '../calculators/rerolls';

/**
 * Generate tooltip content showing calculation breakdown
 * @param weapon - Weapon to analyze
 * @param targetToughness - Target's toughness value
 * @param useOvercharge - Whether to use overcharge mode
 * @param optimalRange - Whether at optimal range
 * @param unitRerolls - Unit-wide re-rolls
 * @param scenarioRerolls - Scenario-based re-rolls
 * @param targetFNP - Target Feel No Pain value
 * @returns HTML-encoded tooltip text
 */
export function generateCalculationTooltip(
  weapon: Weapon,
  targetToughness: number,
  useOvercharge: boolean = false,
  optimalRange: boolean = true,
  unitRerolls?: RerollConfig,
  scenarioRerolls?: RerollConfig,
  targetFNP?: number
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
  let baseHitChance = 1 / 2;
  let hitDisplay = "";
  let hitSkill = 4;

  // Torrent weapons automatically hit
  if (keywords.toLowerCase().includes("torrent")) {
    hitChance = 1; // 100% hit chance
    baseHitChance = 1;
    hitDisplay = "Auto-hit (Torrent)";
  } else {
    const skillStr = chars.bs || chars.ws || "4+";
    const skillMatch = skillStr.match(/(\d+)\+/);
    hitSkill = skillMatch ? parseInt(skillMatch[1]) : 4;
    hitDisplay = `${hitSkill}+`;
    baseHitChance = (7 - hitSkill) / 6;

    // Apply re-rolls to hit chance
    hitChance = calculateHitChanceWithReroll(
      hitSkill,
      weapon.rerolls?.hits,
      unitRerolls?.hits,
      scenarioRerolls?.hits
    );
  }

  // Calculate base wound chance
  let baseWoundChance = 0;
  let woundRoll = "";
  if (strength >= targetToughness * 2) {
    baseWoundChance = 5 / 6;
    woundRoll = "2+";
  } else if (strength > targetToughness) {
    baseWoundChance = 2 / 3;
    woundRoll = "3+";
  } else if (strength === targetToughness) {
    baseWoundChance = 1 / 2;
    woundRoll = "4+";
  } else if (strength * 2 <= targetToughness) {
    baseWoundChance = 1 / 6;
    woundRoll = "6+";
  } else {
    baseWoundChance = 1 / 3;
    woundRoll = "5+";
  }

  // Apply re-rolls to wound chance (but not if Twin-Linked, as it's handled in applySpecialRules)
  const hasTwinLinked = keywords.toLowerCase().includes("twin-linked");
  const woundChance = calculateWoundChanceWithReroll(
    strength,
    targetToughness,
    hasTwinLinked ? undefined : weapon.rerolls?.wounds,
    hasTwinLinked ? undefined : unitRerolls?.wounds,
    hasTwinLinked ? undefined : scenarioRerolls?.wounds,
    0
  );

  // Apply special rules (including FNP)
  const specialRules = applySpecialRules(weapon, attacks, hitChance, woundChance, damage, targetToughness, optimalRange, [], 1, false, null, Math.abs(ap), targetFNP);
  const expectedDamage = weapon.count * specialRules.totalDamage;

  let tooltipText = `Calculation Breakdown:&#10;${weapon.count} weapon(s) × ${attacks} attacks`;

  // Show hit chance with re-roll info
  if (hitChance !== baseHitChance && !keywords.toLowerCase().includes("torrent")) {
    tooltipText += ` × ${(hitChance * 100).toFixed(1)}% hit (${hitDisplay}, ${(baseHitChance * 100).toFixed(1)}% → ${(hitChance * 100).toFixed(1)}% with re-rolls)`;
  } else {
    tooltipText += ` × ${(hitChance * 100).toFixed(1)}% hit (${hitDisplay})`;
  }

  // Show wound chance with re-roll info
  if (woundChance !== baseWoundChance) {
    tooltipText += ` × ${(woundChance * 100).toFixed(1)}% wound (${woundRoll}, ${(baseWoundChance * 100).toFixed(1)}% → ${(woundChance * 100).toFixed(1)}% with re-rolls)`;
  } else {
    tooltipText += ` × ${(woundChance * 100).toFixed(1)}% wound (${woundRoll})`;
  }

  tooltipText += ` × ${damage} damage`;

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
