/**
 * Utility functions for parsing numeric values from Warhammer 40K characteristics
 */

/**
 * Parse numeric values from strings including dice notation (D6, D3, etc.)
 * @param value - String value to parse (e.g., "5", "D6", "D6+2", "D3+1")
 * @returns Numeric value using averages for dice rolls
 */
export function parseNumeric(value: string): number {
  if (!value) return 0;

  // Handle D6+X format
  if (value.startsWith('D6')) {
    const plusPart = value.split('+')[1];
    if (plusPart) {
      // For D6+X, use average of D6 (3.5) plus the bonus
      return 3.5 + parseFloat(plusPart);
    }
    // For plain D6, use average of 3.5
    return 3.5;
  }

  // Handle D3+X format
  if (value.startsWith('D3')) {
    const plusPart = value.split('+')[1];
    if (plusPart) {
      // For D3+X, use average of D3 (2) plus the bonus
      return 2 + parseFloat(plusPart);
    }
    // For plain D3, use average of 2
    return 2;
  }

  // Handle regular numeric values
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse damage values including special cases
 * Currently same as parseNumeric but kept separate for future damage-specific logic
 * @param value - Damage value string
 * @returns Numeric damage value
 */
export function parseDamage(value: string): number {
  return parseNumeric(value);
}
