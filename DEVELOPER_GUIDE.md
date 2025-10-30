# Warhammer 40K Unit Efficiency Analyzer - Developer Guide

**Last Updated:** 2025-10-30
**Version:** 2.0.0

This guide provides a comprehensive overview of the codebase architecture, design decisions, and implementation details to help new contributors and AI agents understand and work effectively with this project.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Concepts](#core-concepts)
4. [Module Breakdown](#module-breakdown)
5. [Data Flow](#data-flow)
6. [Key Algorithms](#key-algorithms)
7. [Testing Strategy](#testing-strategy)
8. [Adding New Features](#adding-new-features)
9. [Common Tasks](#common-tasks)
10. [Troubleshooting](#troubleshooting)

---

## Overview

### Purpose

This tool calculates expected damage output and efficiency (Damage Per Point) for Warhammer 40K 10th Edition units against various target profiles. It helps players:
- Compare unit effectiveness
- Optimize army composition
- Understand offensive capabilities
- Make informed tactical decisions

### Technology Stack

- **TypeScript**: Type-safe code with strict mode enabled
- **Vite**: Fast dev server with HMR (Hot Module Replacement)
- **Vitest**: Unit testing framework
- **Bootstrap 5**: Responsive UI framework
- **Chart.js**: Data visualization (dependency added, implementation pending)
- **fast-xml-parser**: XML parsing for .roz roster files

### Project Structure

```
warhammer-40k-tool/
├── src/                    # Source code
│   ├── calculators/        # Damage and efficiency calculation engines
│   ├── rules/              # Game rules implementation
│   ├── types/              # TypeScript type definitions
│   ├── ui/                 # User interface components
│   ├── utils/              # Utility functions
│   ├── converter.ts        # Roster converter
│   └── main.ts             # Application entry point
├── tests/                  # Test files (mirrors src/ structure)
├── docs/                   # Additional documentation
├── public/                 # Static assets (army JSON files)
├── index.html              # Main analysis tool
└── converter.html          # Roster converter page
```

---

## Architecture

### Design Principles

1. **Separation of Concerns**: Clear boundaries between calculation, UI, and data layers
2. **Functional Programming**: Pure functions for calculations enable easy testing
3. **Type Safety**: Leverage TypeScript for compile-time error catching
4. **Modularity**: Small, focused modules that do one thing well
5. **Testability**: All core logic is unit-testable

### Layered Architecture

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (UI Components: display, controls,     │
│   tooltips, event handlers)             │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Business Logic Layer              │
│  (Calculators: damage, efficiency,      │
│   rerolls, special weapon rules)        │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          Data Layer                     │
│  (Types, Army data, Unit data,          │
│   Weapon profiles)                      │
└─────────────────────────────────────────┘
```

---

## Core Concepts

### 1. Damage Calculation Pipeline

The tool calculates expected damage using probability theory and the Warhammer 40K 10th Edition combat sequence:

```
Attacks → Hit Roll → Wound Roll → Save Roll → Damage
```

Each step applies modifiers and special rules, calculating the expected value at each stage.

### 2. Efficiency Metrics

**Damage Per Point (DPP)** = Total Expected Damage / Unit Points Cost

This normalizes damage output by cost, allowing fair comparison between units of different points values.

### 3. Re-roll Mechanics

Re-rolls are one of the most impactful mechanics in Warhammer 40K. The tool supports:
- **Re-roll 1s**: Re-roll natural 1s only
- **Re-roll Failed**: Re-roll any failed roll
- **Re-roll All**: Re-roll any roll (treated as re-roll failed for optimal play)

**Priority System**: When multiple re-rolls are available, the best is automatically selected:
```
ALL > FAILED > ONES > NONE
```

This prevents illegal double re-rolls per game rules.

### 4. Special Weapon Rules

The tool implements numerous weapon special rules from the core rules:
- **Rapid Fire**: Extra attacks at half range or less
- **Melta**: Extra damage at half range or less
- **Twin-Linked**: Re-roll wound rolls
- **Sustained Hits**: Generate extra hits on critical hits (6s)
- **Lethal Hits**: Automatic wounds on critical hits
- **Devastating Wounds**: Mortal wounds on critical wounds (6s)
- **Anti-[KEYWORD]**: Better wound rolls against specific keywords
- **Torrent**: Automatic hits
- And more...

---

## Module Breakdown

### src/calculators/

#### damage.ts
**Purpose**: Core damage calculation engine

**Key Functions**:
- `calculateWeaponDamage()`: Main entry point for weapon damage calculation
- `calculateUnitDamage()`: Aggregates damage from all unit weapons
- `applySpecialRules()`: Applies weapon special abilities

**Important**: This module uses pure functions - same input always produces same output.

#### efficiency.ts
**Purpose**: Calculate efficiency metrics

**Key Functions**:
- `calculateUnitEfficiency()`: DPP calculation for a unit
- `calculateArmyEfficiency()`: Aggregate army-level metrics

#### rerolls.ts
**Purpose**: Re-roll probability calculations

**Key Functions**:
- `applyReroll(baseChance, rerollType)`: Apply re-roll modifier to probability
- `getBestReroll(...rerolls)`: Determine best available re-roll
- `calculateHitChanceWithReroll()`: Hit probability with re-rolls
- `calculateWoundChanceWithReroll()`: Wound probability with re-rolls

**Mathematics**:
```typescript
// Re-roll 1s: P × (7/6)
// Re-roll failed: P × (2 - P)
```

### src/rules/

#### special-weapons.ts
**Purpose**: Implementation of weapon special rules

**Structure**:
- Each special rule has a dedicated function
- Rules modify damage calculation parameters
- Rules are applied in correct order per game rules

**Adding New Rules**: See [Adding New Features](#adding-new-features)

### src/types/

#### index.ts
**Purpose**: TypeScript type definitions for the entire application

**Key Interfaces**:
```typescript
interface Army {
  armyName: string;
  faction: string;
  pointsTotal: number;
  units: Unit[];
  rules?: { [id: string]: Rule };
  abilities?: { [id: string]: Ability };
}

interface Unit {
  id: string;
  name: string;
  stats: UnitStats;
  points: number;
  weapons: Weapon[];
  unitRerolls?: RerollConfig;
  rules?: string[];
  abilities?: string[];
}

interface Weapon {
  id: string;
  name: string;
  type: string;  // "Ranged", "Melee", "Pistol"
  characteristics: { [key: string]: string };
  count: number;
  rerolls?: RerollConfig;
}

interface RerollConfig {
  hits?: RerollType;
  wounds?: RerollType;
  damage?: RerollType;
}

enum RerollType {
  NONE = "none",
  ONES = "ones",
  FAILED = "failed",
  ALL = "all"
}
```

### src/ui/

#### display.ts
**Purpose**: Rendering logic for UI components

**Key Functions**:
- `displayAnalysisResults()`: Main rendering function
- `createUnitCard()`: Generate detailed unit card HTML
- `createSummaryTable()`: Generate summary table
- `extractInvulnerableSave()`: Extract invuln save from abilities

**Best Practice**: Keep this module focused on rendering. Business logic belongs in calculators.

#### controls.ts
**Purpose**: Event handlers and user interactions

**Key Functions**:
- `setupWeaponModeToggles()`: Handle weapon mode switching
- `setupSortableTable()`: Handle column sorting
- `updateUnitCard()`: Update unit card after changes

#### tooltip.ts
**Purpose**: Generate detailed calculation tooltips

**Key Functions**:
- `generateWeaponTooltip()`: Create tooltip with damage breakdown
- Shows step-by-step calculations for transparency

### src/utils/

#### numeric.ts
**Purpose**: Parse game notation for numbers

**Key Functions**:
- `parseNumericValue()`: Parse "D6", "2D6", "D3+3", etc.
- Handles fixed values and dice notation

#### weapon.ts
**Purpose**: Weapon-related utilities

**Key Functions**:
- `getWeaponType()`: Determine weapon type (ranged, melee, pistol)
- `isOneTimeWeapon()`: Identify one-time use weapons

### src/converter.ts

**Purpose**: Convert BattleScribe roster files to optimized format

**Supported Formats**:
- BattleScribe JSON exports
- New Recruit XML (.roz) files

**Process**:
1. Parse input file (JSON or XML)
2. Extract units, weapons, abilities, rules
3. Normalize weapon characteristics
4. Generate optimized output format

---

## Data Flow

### Application Initialization

```
1. Load index.html
2. Execute main.ts
3. Setup event listeners (controls.ts)
4. Wait for army data selection
```

### Army Analysis Flow

```
User selects army
    ↓
Load army JSON from public/
    ↓
Parse army data (types validated)
    ↓
For each unit:
    ↓
    Calculate damage for each weapon
        ↓
        Apply special rules
        ↓
        Apply re-rolls
        ↓
        Sum weapon damage
    ↓
    Calculate efficiency (DPP)
    ↓
    Store results
    ↓
Sort units by selected metric
    ↓
Render summary table
    ↓
Render unit cards
    ↓
Setup interactions (toggles, tooltips)
```

### Damage Calculation Flow (Per Weapon)

```
parseNumericValue(attacks) → total attacks
    ↓
calculateHitChanceWithReroll(skill, rerolls)
    ↓
expected hits = attacks × hitChance
    ↓
applySpecialRules (Torrent, Sustained Hits, Lethal Hits)
    ↓
calculateWoundChanceWithReroll(S, T, rerolls)
    ↓
expected wounds = hits × woundChance
    ↓
applySpecialRules (Devastating Wounds, Anti-X)
    ↓
Calculate save failure chance
    ↓
Apply invulnerable save (better of armor/invuln)
    ↓
expected unsaved wounds = wounds × saveFailChance
    ↓
Apply Feel No Pain (FNP)
    ↓
parseNumericValue(damage) → expected damage per wound
    ↓
Apply Melta (if at optimal range)
    ↓
total damage = unsaved wounds × damage per wound
```

---

## Key Algorithms

### 1. Hit Chance Calculation

```typescript
// Base hit chance
const hitChance = (7 - skillValue) / 6;

// With re-roll 1s
const reroll1sChance = hitChance * (7 / 6);

// With re-roll failed
const rerollFailedChance = hitChance * (2 - hitChance);
```

**Explanation**:
- Skill 3+ means you succeed on 3, 4, 5, 6 = 4/6 = 66.67%
- Re-roll 1s: You get a second chance on 1/6 of rolls
- Re-roll failed: You get a second chance on all failures

### 2. Wound Chance Calculation

```typescript
let woundTarget: number;

if (strength >= toughness * 2) {
  woundTarget = 2;  // 2+ to wound
} else if (strength > toughness) {
  woundTarget = 3;  // 3+ to wound
} else if (strength === toughness) {
  woundTarget = 4;  // 4+ to wound
} else if (strength * 2 <= toughness) {
  woundTarget = 6;  // 6+ to wound
} else {
  woundTarget = 5;  // 5+ to wound
}

const woundChance = (7 - woundTarget) / 6;
```

**Per 10th Edition rules**.

### 3. Save Calculation with Invulnerable

```typescript
const modifiedSave = Math.min(7, targetSave - weaponAP);
const armorSaveChance = Math.max(0, (7 - modifiedSave) / 6);

const invulnSaveChance = targetInvuln
  ? (7 - targetInvuln) / 6
  : 0;

// Use better save
const bestSaveChance = Math.max(armorSaveChance, invulnSaveChance);
const unsavedChance = 1 - bestSaveChance;
```

### 4. Feel No Pain Application

```typescript
const fnpChance = targetFNP ? (7 - targetFNP) / 6 : 0;
const finalDamage = expectedDamage * (1 - fnpChance);
```

**Important**: FNP applies AFTER saves, per 10th Edition rules.

---

## Testing Strategy

### Test Structure

Tests mirror the source structure:
```
tests/
├── calculators/
│   ├── damage.test.ts
│   ├── efficiency.test.ts
│   └── rerolls.test.ts
├── invuln-save.test.ts
├── numeric.test.ts
└── special-weapons.test.ts
```

### Testing Philosophy

1. **Unit Tests**: Test individual functions in isolation
2. **Integration Tests**: Test complete calculation pipelines
3. **Edge Cases**: Test boundary conditions (0%, 100%, undefined values)
4. **Regression Tests**: Prevent bugs from reappearing

### Running Tests

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Type checking
npm run type-check
```

### Writing Good Tests

```typescript
describe('Feature Name', () => {
  describe('functionName', () => {
    it('should handle normal case', () => {
      const result = functionName(normalInput);
      expect(result).toBe(expectedOutput);
    });

    it('should handle edge case', () => {
      const result = functionName(edgeInput);
      expect(result).toBe(expectedOutput);
    });

    it('should throw on invalid input', () => {
      expect(() => functionName(invalidInput)).toThrow();
    });
  });
});
```

### Test Coverage Goals

- **Calculators**: >90% coverage (critical for accuracy)
- **Rules**: >80% coverage
- **UI**: Basic smoke tests (full E2E testing future work)
- **Utils**: >85% coverage

---

## Adding New Features

### Process Overview

1. **Plan**: Document in ROADMAP.md or create spec in docs/implementation/
2. **Types**: Add/update interfaces in src/types/
3. **Implementation**: Write core logic (calculators, rules)
4. **Tests**: Write comprehensive tests
5. **UI**: Add controls and display logic
6. **Documentation**: Update README, ROADMAP, and this guide
7. **Commit**: Create clear commit messages

### Example: Adding a New Special Weapon Rule

Let's add "Ignores Cover" as an example:

#### Step 1: Update Types (if needed)

```typescript
// src/types/index.ts
interface Weapon {
  // ... existing fields
  ignoresCover?: boolean;  // NEW
}
```

#### Step 2: Implement Rule

```typescript
// src/rules/special-weapons.ts

/**
 * Apply Ignores Cover rule
 * Weapon ignores cover bonuses to saves
 */
export function applyIgnoresCover(
  weapon: Weapon,
  baseSaveChance: number,
  targetInCover: boolean,
  targetSave: number
): number {
  if (!weapon.ignoresCover || !targetInCover) {
    return baseSaveChance;
  }

  // Recalculate save without +1 cover bonus
  const saveWithoutCover = (7 - (targetSave + 1)) / 6;
  return Math.max(baseSaveChance, saveWithoutCover);
}
```

#### Step 3: Integrate into Damage Calculator

```typescript
// src/calculators/damage.ts

// In calculateWeaponDamage function:
let saveChance = calculateBaseSaveChance(targetSave, weapon.ap);

// NEW: Apply ignores cover
if (weapon.ignoresCover && targetInCover) {
  saveChance = applyIgnoresCover(weapon, saveChance, targetInCover, targetSave);
}
```

#### Step 4: Write Tests

```typescript
// tests/special-weapons.test.ts

describe('Ignores Cover', () => {
  it('should ignore cover bonus to save', () => {
    const weapon: Weapon = {
      id: 'test',
      name: 'Test Gun',
      ignoresCover: true,
      // ... other required fields
    };

    const damage = calculateWeaponDamage(
      weapon,
      targetToughness: 4,
      targetSave: 3,
      targetInCover: true  // +1 to save
    );

    // Verify damage is higher than if cover applied
    // ... assertions
  });
});
```

#### Step 5: Update UI (if user-configurable)

```typescript
// src/ui/controls.ts

// Add checkbox for target in cover
const coverCheckbox = document.createElement('input');
coverCheckbox.type = 'checkbox';
coverCheckbox.id = 'target-in-cover';
// ... add to DOM, add event listener
```

#### Step 6: Update Documentation

- README.md: Add "Ignores Cover" to supported rules list
- ROADMAP.md: Mark feature as completed
- DEVELOPER_GUIDE.md: Update if architecture changed

---

## Common Tasks

### Task 1: Update Army Data

**Goal**: Add a new army list to the tool

**Steps**:
1. Export your BattleScribe roster as JSON or .roz
2. Open `converter.html` in browser
3. Drag and drop your roster file
4. Download converted file
5. Place in `public/` directory
6. Add to dropdown in `index.html`:
   ```html
   <option value="public/your_army.json">Your Army Name</option>
   ```

### Task 2: Fix a Calculation Bug

**Goal**: Correct an error in damage calculation

**Steps**:
1. **Reproduce**: Write a failing test case
   ```typescript
   it('should correctly calculate X', () => {
     const result = calculateX(input);
     expect(result).toBe(correctValue);
   });
   ```
2. **Identify**: Find the calculation error in src/calculators/
3. **Fix**: Correct the calculation
4. **Verify**: Run tests (`npm test`)
5. **Validate**: Test manually with a real army
6. **Document**: Update comments if calculation was unclear

### Task 3: Add a UI Enhancement

**Goal**: Improve user interface

**Steps**:
1. **Identify**: What needs improvement?
2. **Design**: Sketch or describe the change
3. **Implement**:
   - HTML changes in index.html
   - CSS in index.html `<style>` or separate file
   - JS/TS in src/ui/
4. **Test**: Manually verify in browser
5. **Responsive**: Test on different screen sizes
6. **Document**: Update README if user-facing change

### Task 4: Optimize Performance

**Goal**: Improve calculation or rendering speed

**Steps**:
1. **Profile**: Identify bottlenecks
   ```typescript
   console.time('calculation');
   // ... code to measure
   console.timeEnd('calculation');
   ```
2. **Optimize**:
   - Cache repeated calculations
   - Reduce DOM manipulations
   - Use more efficient algorithms
3. **Verify**: Ensure results haven't changed
4. **Measure**: Confirm improvement with profiling

---

## Troubleshooting

### Issue: Tests Failing After Changes

**Cause**: Changes broke existing functionality

**Solution**:
1. Read test failure messages carefully
2. Identify which test is failing
3. Check if test needs updating (expected behavior changed) or if code has a bug
4. Run single test for faster iteration:
   ```bash
   npm test -- damage.test.ts
   ```

### Issue: TypeScript Compilation Errors

**Cause**: Type mismatches or missing types

**Solution**:
1. Run type check: `npm run type-check`
2. Read error messages (they're usually helpful!)
3. Common fixes:
   - Add optional chaining: `obj?.prop`
   - Add type guards: `if (obj && 'prop' in obj)`
   - Update interface definitions
4. Don't use `any` as a quick fix - properly type the data

### Issue: UI Not Updating

**Cause**: Event listeners not working or DOM not updating

**Solution**:
1. Check browser console for errors
2. Verify event listeners are attached:
   ```typescript
   element.addEventListener('change', (e) => {
     console.log('Event fired', e);  // Debug log
     // ... handler code
   });
   ```
3. Ensure DOM elements exist before accessing
4. Check if you need to call render/update function

### Issue: Incorrect Damage Calculation

**Cause**: Misunderstood game rules or calculation error

**Solution**:
1. Compare with manual calculation
2. Add debug logging:
   ```typescript
   console.log('Attacks:', attacks);
   console.log('Hit chance:', hitChance);
   console.log('Expected hits:', expectedHits);
   // ... etc
   ```
3. Check special rules are applying correctly
4. Verify input data is correct (weapon stats, unit stats)
5. Reference the 10th Edition core rules

### Issue: Army JSON Won't Load

**Cause**: Malformed JSON or incorrect path

**Solution**:
1. Validate JSON: Use https://jsonlint.com/
2. Check file path in dropdown matches actual file location
3. Check browser console for fetch errors
4. Verify file is in `public/` directory
5. Try the roster converter to generate correct format

---

## Best Practices

### Code Style

1. **Naming Conventions**:
   - Functions: `camelCase` (e.g., `calculateDamage`)
   - Interfaces: `PascalCase` (e.g., `WeaponConfig`)
   - Constants: `UPPER_SNAKE_CASE` (e.g., `MAX_ATTACKS`)
   - Files: `kebab-case` (e.g., `special-weapons.ts`)

2. **Comments**:
   - Use JSDoc for public functions
   - Explain WHY, not WHAT (code should be self-explanatory)
   - Reference game rules where applicable

3. **Functions**:
   - Keep functions small and focused
   - Prefer pure functions for calculations
   - Avoid side effects in calculators

4. **Types**:
   - Use interfaces over `type` for object shapes
   - Avoid `any` - use `unknown` and type guards instead
   - Make fields optional only if they truly are optional

### Git Workflow

1. **Branch Naming**: `feature/feature-name` or `fix/bug-name`
2. **Commit Messages**:
   - Format: `Type: Brief description`
   - Types: `feat`, `fix`, `docs`, `refactor`, `test`
   - Example: `feat: Add Ignores Cover weapon rule`
3. **Pull Requests**:
   - Reference issues
   - Include test results
   - Update documentation

### Documentation

1. **Keep Updated**: Documentation is only useful if it's current
2. **Be Specific**: Vague docs are worse than no docs
3. **Examples**: Show, don't just tell
4. **Audience**: Write for someone new to the codebase

---

## Additional Resources

### Game Rules

- [Warhammer 40K 10th Edition Core Rules](https://www.warhammer-community.com/en-us/warhammer-40000-downloads/) - Official rules reference

### Development Tools

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)
- [Vite Documentation](https://vitejs.dev/)

### Project Documentation

- [README.md](./README.md) - Getting started and usage
- [ROADMAP.md](./ROADMAP.md) - Feature roadmap and priorities
- [docs/implementation/](./docs/implementation/) - Detailed implementation specs
- [INVULN_SAVE_IMPLEMENTATION.md](./INVULN_SAVE_IMPLEMENTATION.md) - Example implementation doc

---

## Contributing

We welcome contributions! Here's how to get started:

1. **Familiarize**: Read this guide and the README
2. **Explore**: Run the tool, read the code, run the tests
3. **Pick a Task**: Check ROADMAP.md for features marked 🔴 Not Started
4. **Discuss**: Open an issue to discuss your approach
5. **Implement**: Follow the patterns established in the codebase
6. **Test**: Write tests, ensure all tests pass
7. **Document**: Update docs as needed
8. **Submit**: Create a pull request

### For AI Agents

When working on this codebase:

1. **Read Before Writing**: Understand existing patterns before adding code
2. **Test Everything**: AI-generated code should have tests
3. **Follow Types**: Respect the TypeScript type system
4. **Be Conservative**: Don't refactor existing working code without good reason
5. **Document Decisions**: Explain any non-obvious choices
6. **Check Compatibility**: Ensure changes don't break existing features

---

## Version History

- **2.0.0** (2025-10-30): Added re-rolls, FNP, invuln saves, roster converter, tactical survivability
- **1.0.0** (Initial): Core damage calculation, special weapon rules, basic UI

---

## Contact & Support

- **Issues**: https://github.com/emanuellonnberg/warhammer-40k-tool/issues
- **Pull Requests**: https://github.com/emanuellonnberg/warhammer-40k-tool/pulls

---

*This developer guide is a living document. Please keep it updated as the project evolves.*
