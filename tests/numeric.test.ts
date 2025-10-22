/**
 * Tests for numeric parsing utilities
 */

import { describe, it, expect } from 'vitest';
import { parseNumeric, parseDamage } from '../src/utils/numeric';

describe('parseNumeric', () => {
  it('should parse regular numbers', () => {
    expect(parseNumeric('5')).toBe(5);
    expect(parseNumeric('10')).toBe(10);
    expect(parseNumeric('3.5')).toBe(3.5);
  });

  it('should parse D6 notation', () => {
    expect(parseNumeric('D6')).toBe(3.5);
    expect(parseNumeric('D6+2')).toBe(5.5);
    expect(parseNumeric('D6+1')).toBe(4.5);
  });

  it('should parse D3 notation', () => {
    expect(parseNumeric('D3')).toBe(2);
    expect(parseNumeric('D3+1')).toBe(3);
    expect(parseNumeric('D3+2')).toBe(4);
  });

  it('should return 0 for empty or invalid values', () => {
    expect(parseNumeric('')).toBe(0);
    expect(parseNumeric('invalid')).toBe(0);
  });
});

describe('parseDamage', () => {
  it('should parse damage values same as parseNumeric', () => {
    expect(parseDamage('5')).toBe(5);
    expect(parseDamage('D6')).toBe(3.5);
    expect(parseDamage('D3+1')).toBe(3);
  });
});
