# Invulnerable Save Display Implementation

## Summary

Successfully moved Invulnerable Save display from the abilities list into the stats table. Invulnerable saves now appear inline with regular saves in the format `3+/4++` where `3+` is the regular save and `4++` is the invulnerable save.

## Changes Made

### 1. Added Helper Functions (`src/ui/display.ts`)

#### `extractInvulnerableSave(unit: Unit, army: Army): string | null`
- Extracts invulnerable save value from unit's abilities/rules
- Searches through all rule IDs in the unit
- Parses the value from rule names like "Invulnerable Save (4+)" or "Invulnerable Save (5+*)"
- Returns the save value (e.g., "4+") or null if no invulnerable save exists
- Also handles extraction from rule descriptions as fallback

#### `shouldHideRule(ruleName: string): boolean`
- Determines if a rule should be hidden from the abilities list
- Filters out weapon-specific rules (existing functionality)
- **NEW:** Filters out invulnerable save rules

### 2. Updated Stats Table Display (`src/ui/display.ts`)

Modified `createUnitCard()` function to:
- Extract invulnerable save before building the HTML
- Format the save display as `${regularSave}/${invulnSave}+` when invuln exists
- Display regular save normally when no invuln exists
- Updated the Sv column to use `saveDisplay` variable instead of `unit.stats.save`

Example output:
- **With invuln:** `3+/4++` (3+ regular save, 4+ invulnerable save)
- **Without invuln:** `3+` (just the regular save)

### 3. Updated Abilities Filtering (`src/ui/display.ts`)

Modified abilities section to:
- Use `shouldHideRule()` instead of just `isWeaponRule()`
- Prevents invulnerable save from appearing in the abilities list
- Maintains existing filtering for weapon-specific rules

### 4. Added CSS Enhancement (`index.html`)

Added styling to make the save column more prominent:
```css
.unit-stats-table td:nth-child(3) {
    font-weight: 500;
}
```

This gives the Sv column slightly more weight, making it stand out when it contains combined save values.

## Before vs After

### Before
**Stats Table:**
```
M    T   Sv   W   Ld   OC
10"  11  3+   28  6+   10
```

**Abilities List:**
- Code Chivalric: ...
- Macro-extinction Protocols: ...
- **Invulnerable Save (5+): This model has a 5+ invulnerable save.**
- Damaged: 1-10 Wounds Remaining: ...
- Atrapos' Duty (Bondsman): ...

### After
**Stats Table:**
```
M    T   Sv       W   Ld   OC
10"  11  3+/5++   28  6+   10
```

**Abilities List:**
- Code Chivalric: ...
- Macro-extinction Protocols: ...
- Damaged: 1-10 Wounds Remaining: ...
- Atrapos' Duty (Bondsman): ...

Note: "Invulnerable Save (5+)" no longer appears in the abilities list.

## Test Coverage

Added comprehensive test suite (`tests/invuln-save.test.ts`) with 6 tests:
1. ✓ Extract invulnerable save from unit abilities (e.g., "4+")
2. ✓ Extract invulnerable save with asterisk notation (e.g., "5+*")
3. ✓ Return null when no invulnerable save exists
4. ✓ Format save display correctly with invulnerable save (e.g., "3+/4++")
5. ✓ Format save display correctly without invulnerable save (e.g., "3+")
6. ✓ Hide invulnerable save from abilities list

All 143 tests pass (137 existing + 6 new).

## Implementation Notes

### Invulnerable Save Format
- Regular notation: "Invulnerable Save (4+)"
- With asterisk: "Invulnerable Save (5+*)" (indicates conditional invuln, e.g., ranged only)
- Both formats are correctly parsed and displayed

### Display Format
- The invulnerable save is shown with double plus signs: `4++`
- Format: `${regularSave}/${invulnSave}+`
- Example: A unit with 3+ save and 4+ invuln displays as: `3+/4++`

### Edge Cases Handled
- Units without invulnerable saves display normally
- Invulnerable save rules with asterisks are correctly parsed
- Invulnerable save values extracted from both name and description
- Missing or malformed invulnerable save data is handled gracefully

## Files Modified

1. `/home/user/warhammer-40k-tool/src/ui/display.ts` - Main implementation
2. `/home/user/warhammer-40k-tool/index.html` - CSS enhancement
3. `/home/user/warhammer-40k-tool/tests/invuln-save.test.ts` - Test suite (new file)

## Testing

Build: ✓ Successful
Tests: ✓ All 143 tests pass
TypeScript: ✓ No compilation errors

## Example Units with Invulnerable Saves

From `knights.json`:
- **Canis Rex:** Save 3+, Invuln 5+* → Displays as `3+/5++`
- **Cerastus Knight Atrapos:** Save 3+, Invuln 5+ → Displays as `3+/5++`

These units now show their invulnerable saves in the stats table instead of the abilities list.
