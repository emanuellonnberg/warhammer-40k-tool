/**
 * Dice rolling utilities for battle simulation
 * Provides both deterministic (expected value) and random (actual dice rolls) modes
 */

/**
 * Roll a single D6
 */
export function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Roll multiple D6 and sum them
 */
export function rollMultipleD6(count: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += rollD6();
  }
  return total;
}

/**
 * Roll a dice test (e.g., hit on 3+, wound on 4+)
 * @param count - Number of dice to roll
 * @param target - Target value (e.g., 3 for "3+")
 * @returns Number of successes
 */
export function rollDiceTest(count: number, target: number): number {
  let successes = 0;
  for (let i = 0; i < count; i++) {
    if (rollD6() >= target) {
      successes++;
    }
  }
  return successes;
}

/**
 * Roll dice with re-rolls
 * @param count - Number of dice to roll
 * @param target - Target value to succeed
 * @param rerollOnes - Whether to re-roll 1s
 * @param rerollAll - Whether to re-roll all failures
 * @returns Number of successes
 */
export function rollDiceTestWithRerolls(
  count: number,
  target: number,
  rerollOnes: boolean = false,
  rerollAll: boolean = false
): number {
  let successes = 0;

  for (let i = 0; i < count; i++) {
    let roll = rollD6();

    // Check for re-roll conditions
    if ((rerollAll && roll < target) || (rerollOnes && roll === 1)) {
      roll = rollD6(); // Re-roll once
    }

    if (roll >= target) {
      successes++;
    }
  }

  return successes;
}

/**
 * Parse a damage characteristic (e.g., "1", "D3", "D6", "2D6")
 * @param damageStr - Damage string from weapon characteristics
 * @returns Actual damage rolled
 */
export function rollDamage(damageStr: string): number {
  const normalized = damageStr.trim().toUpperCase();

  // Simple number (e.g., "1", "2", "3")
  const simpleNumber = parseInt(normalized);
  if (!isNaN(simpleNumber)) {
    return simpleNumber;
  }

  // D3 damage
  if (normalized === 'D3') {
    return Math.floor(Math.random() * 3) + 1;
  }

  // D6 damage
  if (normalized === 'D6') {
    return rollD6();
  }

  // Multiple D6 (e.g., "2D6", "3D6")
  const multiDiceMatch = normalized.match(/^(\d+)D6$/);
  if (multiDiceMatch) {
    const count = parseInt(multiDiceMatch[1]);
    return rollMultipleD6(count);
  }

  // D6+N (e.g., "D6+2")
  const d6PlusMatch = normalized.match(/^D6\+(\d+)$/);
  if (d6PlusMatch) {
    return rollD6() + parseInt(d6PlusMatch[1]);
  }

  // Default to 1 if we can't parse
  console.warn(`Unable to parse damage string: "${damageStr}", defaulting to 1`);
  return 1;
}

/**
 * Parse attacks characteristic (e.g., "4", "D6", "2D6")
 * @param attacksStr - Attacks string from weapon characteristics
 * @returns Number of attacks
 */
export function rollAttacks(attacksStr: string): number {
  const normalized = attacksStr.trim().toUpperCase();

  // Simple number
  const simpleNumber = parseInt(normalized);
  if (!isNaN(simpleNumber)) {
    return simpleNumber;
  }

  // D3 attacks
  if (normalized === 'D3') {
    return Math.floor(Math.random() * 3) + 1;
  }

  // D6 attacks
  if (normalized === 'D6') {
    return rollD6();
  }

  // Multiple D6 (e.g., "2D6", "3D6")
  const multiDiceMatch = normalized.match(/^(\d+)D6$/);
  if (multiDiceMatch) {
    const count = parseInt(multiDiceMatch[1]);
    return rollMultipleD6(count);
  }

  // D6+N (e.g., "D6+2")
  const d6PlusMatch = normalized.match(/^D6\+(\d+)$/);
  if (d6PlusMatch) {
    return rollD6() + parseInt(d6PlusMatch[1]);
  }

  // Default to 1
  console.warn(`Unable to parse attacks string: "${attacksStr}", defaulting to 1`);
  return 1;
}

/**
 * Calculate expected value (for deterministic mode comparison)
 */
export function expectedValue(count: number, target: number): number {
  const probability = Math.max(0, (7 - target)) / 6;
  return count * probability;
}

/**
 * Calculate expected value with re-rolls
 */
export function expectedValueWithRerolls(
  count: number,
  target: number,
  rerollOnes: boolean = false,
  rerollAll: boolean = false
): number {
  const baseProb = Math.max(0, (7 - target)) / 6;

  if (rerollAll) {
    // Re-roll all failures: P(success) = P(first) + P(fail first) * P(second)
    return count * (baseProb + (1 - baseProb) * baseProb);
  }

  if (rerollOnes) {
    // Re-roll 1s: P(success) = P(not 1) * P(success | not 1) + P(1) * P(success on reroll)
    const probRoll1 = 1 / 6;
    return count * ((1 - probRoll1) * baseProb + probRoll1 * baseProb);
  }

  return count * baseProb;
}
