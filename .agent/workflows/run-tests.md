---
description: How to run and validate the test suite
---

# Running Tests

This workflow describes how to run tests for the simulation engine.

// turbo-all

## 1. Run All Tests

```bash
npx vitest run --exclude e2e
```

## 2. Run Specific Test File

```bash
npx vitest run tests/your-test.test.ts
```

## 3. Run Tests in Watch Mode

```bash
npx vitest --watch
```

## 4. Run Related Tests

Common test groupings:

### Ability Tests
```bash
npx vitest run tests/ability-parser.test.ts tests/aura-abilities.test.ts tests/defensive-abilities.test.ts
```

### Pathfinding/Movement Tests
```bash
npx vitest run tests/planner.test.ts tests/pathfinding.test.ts tests/terrain-pathfinding.test.ts
```

### Damage Calculation Tests
```bash
npx vitest run tests/damage.test.ts tests/calculators/rerolls.test.ts tests/calculators/fnp.test.ts
```

### Simulation Tests
```bash
npx vitest run tests/simulation.test.ts tests/simulation-terrain-integration.test.ts
```

## 5. Check Test Coverage

```bash
npx vitest run --coverage
```

## Expected Results

All tests should pass (currently 452+ tests across 34 files).
