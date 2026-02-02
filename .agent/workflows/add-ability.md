---
description: How to add a new ability to the simulation
---

# Adding a New Ability

This workflow describes how to add a new ability (deployment, defensive, combat, or aura) to the simulation system.

## 1. Identify the Ability Type

Abilities fall into categories:
- **Deployment**: Scout, Infiltrator, Deep Strike
- **Defensive**: Stealth, Feel No Pain, Invulnerable Save
- **Combat**: Lethal Hits, Sustained Hits, Devastating Wounds
- **Aura**: Re-roll buffs within a range

## 2. Add Pattern to AbilityParser

Edit `src/simulation/ability-parser.ts`:

```typescript
// Add to ABILITY_PATTERNS
'ability-name': {
  pattern: /your regex pattern/i,
  category: 'deployment' | 'defensive' | 'combat' | 'aura',
  effect: 'effect-name',
  defaultValue: number // optional
}
```

## 3. Handle the Effect

In `ability-parser.ts`, add a case to `applyAbilityToCache()`:

```typescript
case 'effect-name':
  cache.yourNewFlag = true;
  cache.yourNewValue = ability.value || defaultValue;
  break;
```

## 4. Add Interface Fields

Add the new fields to the `ParsedUnitAbilities` interface in the same file.

## 5. Create Getter Methods

Add public methods to `AbilityParser` class:

```typescript
hasYourAbility(unit: Unit, army?: Army): boolean {
  return this.parseUnit(unit, army).yourNewFlag;
}
```

## 6. Integrate with Simulation

Depending on type:
- **Defensive**: Update `buildThreatMap()` in `planner.ts`
- **Aura**: Add to `ability-registry.ts` and update `getCombinedRerolls()`
- **Combat**: Update damage calculations in `dice-damage.ts`

## 7. Add Tests

Create tests in `tests/ability-parser.test.ts` or a new test file:

```typescript
it('should detect your ability', () => {
  const army = createArmy({
    'id': { name: 'Name', description: 'Your ability text' }
  });
  expect(abilityParser.hasYourAbility(unit, army)).toBe(true);
});
```

// turbo
## 8. Run Tests

```bash
npx vitest run tests/ability-parser.test.ts
```
