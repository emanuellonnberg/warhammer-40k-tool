# Implementation Spec: Re-roll Mechanics

**Feature ID:** 1.1
**Priority:** High
**Effort:** Medium
**Status:** 🔴 Not Started
**Target Phase:** Phase 1

---

## Table of Contents
1. [Overview](#overview)
2. [Current State Analysis](#current-state-analysis)
3. [Game Rules Reference](#game-rules-reference)
4. [Proposed Design](#proposed-design)
5. [Data Model Changes](#data-model-changes)
6. [Algorithm & Mathematics](#algorithm--mathematics)
7. [Implementation Steps](#implementation-steps)
8. [Test Cases](#test-cases)
9. [UI/UX Changes](#uiux-changes)
10. [Validation Criteria](#validation-criteria)

---

## Overview

### Purpose
Implement comprehensive re-roll mechanics for hit rolls, wound rolls, and damage rolls. Re-rolls are one of the most common mechanics in Warhammer 40K 10th Edition, appearing in weapon rules, unit abilities, stratagems, and army-wide buffs.

### Why This Matters
- **Accuracy**: Re-rolls significantly impact damage calculations (often 15-30% increase)
- **Prevalence**: Most competitive units have some form of re-roll ability
- **Foundation**: Many other abilities build upon re-roll mechanics

### Success Criteria
- [ ] Support all common re-roll types (1s, failed, all)
- [ ] Accurate probability calculations for each type
- [ ] Apply at weapon, unit, and scenario levels
- [ ] No double-counting with existing Twin-Linked implementation
- [ ] UI controls for common re-roll scenarios
- [ ] Test coverage >90% for re-roll logic

---

## Current State Analysis

### What Exists
Looking at the current codebase:

**File: `src/types/index.ts`**
```typescript
export interface Weapon {
  name: string;
  count: number;
  attacks: string | number;
  skill: number; // BS or WS (2+ through 6+)
  strength: number;
  ap: number;
  damage: string | number;
  abilities?: string[];
  // ... other fields
}
```

**File: `src/rules/special-weapons.ts`**
- Already implements Twin-Linked (line ~150-170)
- Twin-Linked provides re-roll wounds
- Need to ensure no conflicts with new re-roll system

**File: `src/calculators/damage.ts`**
```typescript
// Current hit calculation (simplified)
const hitChance = calculateHitChance(weapon.skill);
const expectedHits = attacks * hitChance;

// Current wound calculation
const woundChance = calculateWoundChance(strength, toughness);
const expectedWounds = expectedHits * woundChance;
```

### What's Missing
- No generalized re-roll system
- No distinction between different re-roll types (1s vs failed vs all)
- No weapon-level re-roll configuration
- No UI controls for scenario-based re-rolls
- Re-roll damage not supported at all

### Technical Debt
- Twin-Linked is hardcoded - need to integrate with general re-roll system
- No abstraction for probability modifications

---

## Game Rules Reference

### Re-roll Types in Warhammer 40K 10th Edition

**1. Re-roll 1s**
- Only re-roll natural 1s on the dice
- Example: "Re-roll hit rolls of 1"
- Most common type

**2. Re-roll Failed Rolls**
- Re-roll any roll that failed the check
- Example: "Re-roll failed wound rolls"
- Depends on target number (e.g., 4+ to hit)

**3. Re-roll All Rolls**
- Re-roll any dice, even successes
- Example: "Re-roll hit rolls"
- Rare but powerful

**4. Re-roll Specific Values**
- Example: "Re-roll hit rolls of 1 and 2" (vs Stealth)
- Less common, can be added later

### Official Rules Interactions

**From Core Rules:**
> "You can never re-roll a dice more than once, regardless of the source of the re-roll."

This is critical - if a weapon has "re-roll 1s" and a unit has "re-roll failed," you only apply the better re-roll.

**Re-roll Stacking Priority:**
1. Re-roll all > Re-roll failed > Re-roll 1s
2. Apply the best available re-roll only

---

## Proposed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  Damage Calculator                   │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              calculateExpectedHits()                 │
│  - Get base hit chance                               │
│  - Determine best re-roll available                  │
│  - Apply re-roll modifier                            │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│           applyRerollToHitProbability()              │
│  - Calculate P(success) with re-roll                 │
└─────────────────────────────────────────────────────┘
```

### Design Principles

1. **Layered Re-rolls**: Support weapon-level, unit-level, and scenario-level re-rolls
2. **Best Available**: Automatically apply the best re-roll (no stacking)
3. **Type Safety**: Use TypeScript enums for re-roll types
4. **Testability**: Pure functions for probability calculations
5. **Backwards Compatible**: Don't break existing Twin-Linked logic

---

## Data Model Changes

### 1. Type Definitions

**File: `src/types/index.ts`**

Add new type definitions:

```typescript
/**
 * Types of re-roll mechanics in Warhammer 40K
 */
export enum RerollType {
  NONE = "none",           // No re-roll
  ONES = "ones",           // Re-roll 1s only
  FAILED = "failed",       // Re-roll failed rolls
  ALL = "all"              // Re-roll all rolls
}

/**
 * Re-roll configuration for a specific roll type
 */
export interface RerollConfig {
  hits?: RerollType;       // Re-roll for hit rolls
  wounds?: RerollType;     // Re-roll for wound rolls
  damage?: RerollType;     // Re-roll for damage rolls
}
```

### 2. Weapon Interface Extension

**File: `src/types/index.ts`**

```typescript
export interface Weapon {
  name: string;
  count: number;
  attacks: string | number;
  skill: number;
  strength: number;
  ap: number;
  damage: string | number;
  abilities?: string[];

  // NEW: Re-roll configuration
  rerolls?: RerollConfig;

  // Existing fields...
  modes?: WeaponMode[];
  isOneTime?: boolean;
}
```

### 3. Unit Interface Extension

**File: `src/types/index.ts`**

```typescript
export interface Unit {
  name: string;
  stats: UnitStats;
  weapons: Weapon[];
  points: number;

  // NEW: Unit-wide re-roll abilities
  unitRerolls?: RerollConfig;
}
```

### 4. Combat Scenario Configuration

**File: `src/types/index.ts`** (new section)

```typescript
/**
 * Combat scenario configuration including buffs and re-rolls
 */
export interface CombatScenario {
  targetToughness: number;
  targetSave: number;
  targetInvuln?: number;

  // NEW: Scenario-based re-rolls (from buffs, stratagems, etc.)
  scenarioRerolls?: RerollConfig;

  // Future: other scenario conditions
  optimalRange?: boolean;
  charging?: boolean;
}
```

---

## Algorithm & Mathematics

### Probability Theory

**Base Probability:**
For a d6 roll requiring X+:
```
P(success) = (7 - X) / 6
```

Example: 3+ to hit = (7-3)/6 = 4/6 = 66.67%

### Re-roll Probability Formulas

#### 1. Re-roll 1s

When you can re-roll 1s, you get a second chance only on natural 1s:

```
P(success with re-roll 1s) = P(not rolling 1) × P(success) + P(rolling 1) × P(success)
                            = (5/6) × P(success) + (1/6) × P(success)
                            = P(success) + (1/6) × P(success)
                            = P(success) × (1 + 1/6)
                            = P(success) × (7/6)
```

**Simplified Formula:**
```
P_reroll_1s = P_base × 7/6
```

**Example:** BS 3+ with re-roll 1s
- Base: 4/6 = 66.67%
- With re-roll: (4/6) × (7/6) = 28/36 = 77.78%
- Improvement: +11.11%

#### 2. Re-roll Failed

When you can re-roll all failed rolls:

```
P(success with re-roll failed) = P(success) + P(failure) × P(success)
                                = P(success) + (1 - P(success)) × P(success)
                                = P(success) × (2 - P(success))
```

**Simplified Formula:**
```
P_reroll_failed = P_base × (2 - P_base)
```

**Example:** BS 3+ with re-roll failed
- Base: 4/6 = 66.67%
- With re-roll: (4/6) × (2 - 4/6) = (4/6) × (8/6) = 32/36 = 88.89%
- Improvement: +22.22%

#### 3. Re-roll All

When you can re-roll any roll (even successes):

For optimal play, you'd only re-roll failures, so this equals re-roll failed:

```
P_reroll_all = P_reroll_failed = P_base × (2 - P_base)
```

#### 4. No Re-roll (Twin-Linked for Wounds)

Twin-Linked currently re-rolls wound rolls. We need to ensure it uses the re-roll failed formula.

### Lookup Table

For quick reference, here's a table of hit chances with re-rolls:

| Skill | Base   | Re-roll 1s | Re-roll Failed | Improvement (1s) | Improvement (Failed) |
|-------|--------|------------|----------------|------------------|---------------------|
| 2+    | 83.33% | 97.22%     | 97.22%         | +13.89%          | +13.89%             |
| 3+    | 66.67% | 77.78%     | 88.89%         | +11.11%          | +22.22%             |
| 4+    | 50.00% | 58.33%     | 75.00%         | +8.33%           | +25.00%             |
| 5+    | 33.33% | 38.89%     | 55.56%         | +5.56%           | +22.22%             |
| 6+    | 16.67% | 19.44%     | 30.56%         | +2.78%           | +13.89%             |

### Re-roll Priority Logic

When multiple re-rolls are available:

```typescript
function getBestReroll(rerolls: RerollType[]): RerollType {
  // Priority: ALL > FAILED > ONES > NONE
  if (rerolls.includes(RerollType.ALL)) return RerollType.ALL;
  if (rerolls.includes(RerollType.FAILED)) return RerollType.FAILED;
  if (rerolls.includes(RerollType.ONES)) return RerollType.ONES;
  return RerollType.NONE;
}
```

---

## Implementation Steps

### Step 1: Add Type Definitions
**File:** `src/types/index.ts`

1. Add `RerollType` enum
2. Add `RerollConfig` interface
3. Update `Weapon` interface with `rerolls?` field
4. Update `Unit` interface with `unitRerolls?` field
5. Add `CombatScenario` interface (if not exists)

### Step 2: Create Re-roll Calculator Module
**File:** `src/calculators/rerolls.ts` (new file)

```typescript
import { RerollType } from '../types';

/**
 * Calculate probability of success with re-roll applied
 * @param baseChance - Base probability of success (0-1)
 * @param rerollType - Type of re-roll available
 * @returns Modified probability with re-roll applied
 */
export function applyReroll(baseChance: number, rerollType: RerollType): number {
  switch (rerollType) {
    case RerollType.NONE:
      return baseChance;

    case RerollType.ONES:
      // P(success) × (7/6)
      // This accounts for the 1/6 chance to roll a 1 and re-roll it
      return baseChance * (7 / 6);

    case RerollType.FAILED:
    case RerollType.ALL:
      // P(success) × (2 - P(success))
      // Get a second chance on all failures
      return baseChance * (2 - baseChance);

    default:
      return baseChance;
  }
}

/**
 * Determine the best available re-roll from multiple sources
 * Priority: ALL > FAILED > ONES > NONE
 */
export function getBestReroll(...rerolls: (RerollType | undefined)[]): RerollType {
  const validRerolls = rerolls.filter((r): r is RerollType => r !== undefined);

  if (validRerolls.includes(RerollType.ALL)) return RerollType.ALL;
  if (validRerolls.includes(RerollType.FAILED)) return RerollType.FAILED;
  if (validRerolls.includes(RerollType.ONES)) return RerollType.ONES;
  return RerollType.NONE;
}

/**
 * Calculate hit probability with best available re-roll
 */
export function calculateHitChanceWithReroll(
  skill: number,
  weaponReroll?: RerollType,
  unitReroll?: RerollType,
  scenarioReroll?: RerollType
): number {
  const baseChance = (7 - skill) / 6;
  const bestReroll = getBestReroll(weaponReroll, unitReroll, scenarioReroll);
  return applyReroll(baseChance, bestReroll);
}

/**
 * Calculate wound probability with best available re-roll
 */
export function calculateWoundChanceWithReroll(
  strength: number,
  toughness: number,
  weaponReroll?: RerollType,
  unitReroll?: RerollType,
  scenarioReroll?: RerollType
): number {
  // Existing wound calculation logic
  let woundTarget: number;

  if (strength >= toughness * 2) {
    woundTarget = 2;
  } else if (strength > toughness) {
    woundTarget = 3;
  } else if (strength === toughness) {
    woundTarget = 4;
  } else if (strength * 2 <= toughness) {
    woundTarget = 6;
  } else {
    woundTarget = 5;
  }

  const baseChance = (7 - woundTarget) / 6;
  const bestReroll = getBestReroll(weaponReroll, unitReroll, scenarioReroll);
  return applyReroll(baseChance, bestReroll);
}
```

### Step 3: Update Damage Calculator
**File:** `src/calculators/damage.ts`

```typescript
import { applyReroll, calculateHitChanceWithReroll, calculateWoundChanceWithReroll } from './rerolls';

// Update calculateWeaponDamage function
export function calculateWeaponDamage(
  weapon: Weapon,
  targetToughness: number,
  // ... other params
  unitRerolls?: RerollConfig,
  scenarioRerolls?: RerollConfig
): number {
  // ... existing setup ...

  // OLD:
  // const hitChance = (7 - weapon.skill) / 6;

  // NEW:
  const hitChance = calculateHitChanceWithReroll(
    weapon.skill,
    weapon.rerolls?.hits,
    unitRerolls?.hits,
    scenarioRerolls?.hits
  );

  const expectedHits = totalAttacks * hitChance;

  // OLD:
  // const woundChance = calculateWoundChance(weapon.strength, targetToughness);

  // NEW:
  const woundChance = calculateWoundChanceWithReroll(
    weapon.strength,
    targetToughness,
    weapon.rerolls?.wounds,
    unitRerolls?.wounds,
    scenarioRerolls?.wounds
  );

  // ... rest of calculation ...
}
```

### Step 4: Handle Twin-Linked Migration
**File:** `src/rules/special-weapons.ts`

Update Twin-Linked to use the new re-roll system:

```typescript
// Find Twin-Linked logic (around line 150-170)
// OLD: Hardcoded wound re-roll calculation
// NEW: Set weapon.rerolls.wounds = RerollType.FAILED
```

### Step 5: Add UI Controls
**File:** `src/ui/controls.ts`

Add UI controls for scenario-level re-rolls:

```typescript
// Add to control panel
const rerollHitsSelect = document.createElement('select');
rerollHitsSelect.id = 'reroll-hits';
rerollHitsSelect.innerHTML = `
  <option value="none">No Re-rolls</option>
  <option value="ones">Re-roll 1s</option>
  <option value="failed">Re-roll Failed</option>
  <option value="all">Re-roll All</option>
`;

const rerollWoundsSelect = document.createElement('select');
rerollWoundsSelect.id = 'reroll-wounds';
// ... similar options
```

### Step 6: Update Display/Tooltips
**File:** `src/ui/tooltip.ts`

Update tooltips to show re-roll impact:

```typescript
// Show in tooltip:
// "Hit Chance: 66.67% → 88.89% (re-roll failed)"
// "Wound Chance: 50% (no re-roll)"
```

---

## Test Cases

### Unit Tests

**File:** `tests/calculators/rerolls.test.ts` (new file)

```typescript
import { describe, it, expect } from 'vitest';
import { applyReroll, getBestReroll, calculateHitChanceWithReroll } from '../src/calculators/rerolls';
import { RerollType } from '../src/types';

describe('Re-roll Mechanics', () => {
  describe('applyReroll', () => {
    it('should return base chance when no re-roll', () => {
      expect(applyReroll(0.5, RerollType.NONE)).toBe(0.5);
    });

    it('should calculate re-roll 1s correctly for BS 3+', () => {
      const baseChance = 4/6; // 66.67%
      const result = applyReroll(baseChance, RerollType.ONES);
      expect(result).toBeCloseTo(7/9, 5); // 77.78%
    });

    it('should calculate re-roll failed correctly for BS 3+', () => {
      const baseChance = 4/6; // 66.67%
      const result = applyReroll(baseChance, RerollType.FAILED);
      expect(result).toBeCloseTo(8/9, 5); // 88.89%
    });

    it('should calculate re-roll all correctly (same as failed)', () => {
      const baseChance = 0.5;
      const resultFailed = applyReroll(baseChance, RerollType.FAILED);
      const resultAll = applyReroll(baseChance, RerollType.ALL);
      expect(resultAll).toBe(resultFailed);
    });

    it('should handle edge cases', () => {
      // 100% chance
      expect(applyReroll(1, RerollType.FAILED)).toBe(1);

      // 0% chance (impossible roll like 7+ on d6)
      expect(applyReroll(0, RerollType.FAILED)).toBe(0);
    });
  });

  describe('getBestReroll', () => {
    it('should return NONE when no re-rolls available', () => {
      expect(getBestReroll()).toBe(RerollType.NONE);
      expect(getBestReroll(undefined, undefined)).toBe(RerollType.NONE);
    });

    it('should return ONES when only ones available', () => {
      expect(getBestReroll(RerollType.ONES)).toBe(RerollType.ONES);
    });

    it('should prioritize FAILED over ONES', () => {
      expect(getBestReroll(RerollType.ONES, RerollType.FAILED)).toBe(RerollType.FAILED);
    });

    it('should prioritize ALL over FAILED', () => {
      expect(getBestReroll(RerollType.FAILED, RerollType.ALL)).toBe(RerollType.ALL);
    });

    it('should handle mixed with undefined', () => {
      expect(getBestReroll(undefined, RerollType.ONES, undefined)).toBe(RerollType.ONES);
    });
  });

  describe('calculateHitChanceWithReroll', () => {
    it('should calculate BS 3+ with no re-roll', () => {
      const result = calculateHitChanceWithReroll(3);
      expect(result).toBeCloseTo(4/6, 5);
    });

    it('should calculate BS 3+ with weapon re-roll 1s', () => {
      const result = calculateHitChanceWithReroll(3, RerollType.ONES);
      expect(result).toBeCloseTo(7/9, 5);
    });

    it('should use best available re-roll', () => {
      // Weapon has re-roll 1s, unit has re-roll failed
      const result = calculateHitChanceWithReroll(
        3,
        RerollType.ONES,
        RerollType.FAILED
      );
      // Should use FAILED (better)
      expect(result).toBeCloseTo(8/9, 5);
    });
  });
});
```

### Integration Tests

**File:** `tests/calculators/damage.test.ts` (additions)

```typescript
describe('Damage Calculation with Re-rolls', () => {
  it('should calculate damage with weapon-level hit re-rolls', () => {
    const weapon: Weapon = {
      name: 'Test Gun',
      count: 1,
      attacks: 10,
      skill: 3,
      strength: 4,
      ap: 0,
      damage: 1,
      rerolls: {
        hits: RerollType.ONES
      }
    };

    const damage = calculateWeaponDamage(weapon, 4, 4, 0);

    // With re-roll 1s: 10 attacks × (7/9) hit × (4/6) wound × (4/6) save
    const expected = 10 * (7/9) * (4/6) * (4/6);
    expect(damage).toBeCloseTo(expected, 2);
  });

  it('should not stack re-rolls', () => {
    const weapon: Weapon = {
      name: 'Test Gun',
      count: 1,
      attacks: 10,
      skill: 3,
      strength: 4,
      ap: 0,
      damage: 1,
      rerolls: {
        hits: RerollType.ONES
      }
    };

    const unitRerolls: RerollConfig = {
      hits: RerollType.FAILED
    };

    const damage = calculateWeaponDamage(weapon, 4, 4, 0, {}, unitRerolls);

    // Should use FAILED (better), not stack both
    const expected = 10 * (8/9) * (4/6) * (4/6);
    expect(damage).toBeCloseTo(expected, 2);
  });
});
```

### Manual Test Cases

| Test Case | Weapon Config | Expected Behavior |
|-----------|---------------|-------------------|
| TC-1 | BS 3+, no re-rolls | 66.67% hit chance |
| TC-2 | BS 3+, re-roll 1s | 77.78% hit chance |
| TC-3 | BS 3+, re-roll failed | 88.89% hit chance |
| TC-4 | Weapon re-roll 1s + Unit re-roll failed | Use failed (88.89%) |
| TC-5 | Twin-Linked weapon | Re-roll wounds (should still work) |
| TC-6 | Re-roll damage (future) | Applied to damage rolls |

---

## UI/UX Changes

### 1. Control Panel Additions

Add re-roll controls to the main control panel:

```
┌─────────────────────────────────────────┐
│  Combat Scenario Controls               │
├─────────────────────────────────────────┤
│  Target Toughness: [T3 ▼]              │
│  Optimal Range: [ ] Enable              │
│  Overcharge: [ ] Enable                 │
│                                         │
│  ── Re-roll Modifiers ──                │
│  Re-roll Hit Rolls: [None ▼]           │
│                     [1s / Failed / All] │
│  Re-roll Wound Rolls: [None ▼]         │
│  Re-roll Damage Rolls: [None ▼]        │
└─────────────────────────────────────────┘
```

### 2. Unit Card Enhancements

Show re-roll info on unit cards:

```
┌─────────────────────────────────────────┐
│  Crisis Battlesuits                      │
│  Points: 150  |  Efficiency: ★★★         │
├─────────────────────────────────────────┤
│  Burst Cannon (×3)                       │
│  • Damage: 12.5 → 15.8 (+26%)           │
│  • Re-rolls: Wound rolls (Failed)       │
│    ↳ Twin-Linked                         │
└─────────────────────────────────────────┘
```

### 3. Tooltip Improvements

Enhanced tooltips showing re-roll calculations:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━
 Burst Cannon Breakdown
━━━━━━━━━━━━━━━━━━━━━━━━━━
 Attacks: 18
 Hit: 66.67% → 77.78% (+11%)
   ↳ Re-roll 1s (BS 3+)
 Wound: 66.67% → 88.89% (+22%)
   ↳ Re-roll failed (Twin-Linked)
 Save: 33.33% (4+ save, AP 0)

 Expected Damage: 15.8
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. Visual Indicators

Add icons/badges for re-roll sources:
- 🔄 = Re-roll available
- 🎯 = Re-roll 1s
- 🔁 = Re-roll failed
- ♻️ = Re-roll all

---

## Validation Criteria

### Functional Requirements
- [ ] Re-roll 1s formula: `P × (7/6)` implemented correctly
- [ ] Re-roll failed formula: `P × (2 - P)` implemented correctly
- [ ] Re-roll all treated as re-roll failed
- [ ] Best re-roll automatically selected (no stacking)
- [ ] Weapon-level re-rolls work
- [ ] Unit-level re-rolls work
- [ ] Scenario-level re-rolls work
- [ ] Twin-Linked migrated to new system
- [ ] UI controls functional and intuitive

### Testing Requirements
- [ ] Unit tests pass with >90% coverage
- [ ] Integration tests validate full calculation pipeline
- [ ] Manual testing confirms UI behavior
- [ ] Edge cases handled (0%, 100% probabilities)
- [ ] No regression in existing tests

### Performance Requirements
- [ ] No noticeable performance degradation
- [ ] Calculations remain real-time (<100ms)
- [ ] UI remains responsive

### Documentation Requirements
- [ ] Code comments explain re-roll formulas
- [ ] JSDoc comments on all public functions
- [ ] README updated with re-roll feature
- [ ] ROADMAP.md status updated to 🟢 Completed

---

## Implementation Checklist

### Phase 1: Foundation
- [ ] Create `src/calculators/rerolls.ts`
- [ ] Add `RerollType` enum to types
- [ ] Add `RerollConfig` interface to types
- [ ] Implement `applyReroll()` function
- [ ] Implement `getBestReroll()` function
- [ ] Write unit tests for re-roll logic

### Phase 2: Integration
- [ ] Update `Weapon` interface with `rerolls` field
- [ ] Update `Unit` interface with `unitRerolls` field
- [ ] Implement `calculateHitChanceWithReroll()`
- [ ] Implement `calculateWoundChanceWithReroll()`
- [ ] Update `calculateWeaponDamage()` to use new functions
- [ ] Migrate Twin-Linked to new system

### Phase 3: UI
- [ ] Add re-roll dropdown controls
- [ ] Add event handlers for re-roll changes
- [ ] Update tooltips to show re-roll impact
- [ ] Add visual indicators (icons/badges)
- [ ] Update unit cards to display re-roll info

### Phase 4: Testing & Polish
- [ ] Write integration tests
- [ ] Manual testing with real army data
- [ ] Performance testing
- [ ] Update documentation
- [ ] Update ROADMAP.md

---

## Risks & Mitigations

### Risk 1: Breaking Twin-Linked
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Write comprehensive tests before migration
- Test with existing army data that uses Twin-Linked
- Keep old logic temporarily for comparison

### Risk 2: Performance with Multiple Re-roll Checks
**Impact:** Low
**Probability:** Low
**Mitigation:**
- Profile calculation times
- Re-roll logic is simple math, should be fast
- Consider memoization if needed

### Risk 3: User Confusion with Re-roll Stacking
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Clear tooltips explaining which re-roll is active
- Show "best re-roll" in UI
- Documentation explaining stacking rules

---

## Future Enhancements

After initial implementation:

1. **Re-roll Specific Values** - "Re-roll 1s and 2s"
2. **Conditional Re-rolls** - "Re-roll vs INFANTRY"
3. **Re-roll Damage** - Fully implement damage re-rolls
4. **CP Cost Modeling** - Model stratagem CP costs
5. **Probability Distributions** - Show full probability curves

---

## References

- Warhammer 40K 10th Edition Core Rules (Re-roll section)
- Current codebase: `src/calculators/damage.ts`
- Current codebase: `src/rules/special-weapons.ts`
- ROADMAP.md - Feature 1.1

---

## Approval & Sign-off

**Author:** Claude
**Date:** 2025-10-24
**Status:** Ready for Implementation

---

*This document serves as the implementation template for all future features. Copy this structure for new implementation specs.*
