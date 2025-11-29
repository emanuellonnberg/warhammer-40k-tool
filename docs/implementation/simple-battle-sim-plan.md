# Simple Battle Simulation Plan

Goal: seed a deterministic “move to optimal range, then shoot/fight once” simulator that reuses existing damage math and feels sensible at common point levels.

## Starting Distance Defaults
- 3000 pts: 30" gap (large games, deeper deployments).
- 2000 pts: 24" gap (standard Strike Force).
- 1000 pts: 18" gap (Incursion, faster contact).
- If the two armies differ in size, use the larger distance of their defaults to avoid cramming the bigger list.
- Allow a manual override in the UI; auto distance is the fallback.

## Core Flow (v0)
1) Load two armies (preloaded JSON or uploads) and compute their total points.
2) Pick starting distance via the defaults above (or user override); pick initiative (who shoots first).
3) Derive per-unit roles/optimal range (reuse planned role classifier): gunline/mobile firepower/melee missile/anvil/etc., plus their “optimal standoff” (e.g., half-range for Rapid Fire/Melta; charge distance for melee-first units).
4) Position units on a 1D line (distance scalar only). Each turn step: move each unit toward its goal range by its Move stat.
5) Shooting phase: any unit in range fires using existing `calculateWeaponDamage` with `optimalRange=true`; scale attacks by remaining models; include one-time toggle.
6) Charge/melee: units that can make the distance to base contact are treated as charging and apply melee profiles.
7) Casualty removal: assign damage to the opposing unit with lowest remaining wounds/OC first (simple rule); update remaining models.
8) Output: per-phase log (distance closed, damage dealt, casualties), and end-of-round summary of remaining models.

## Data Structures
- `ArmyState`: { army, remainingPoints, startingDistance, initiative }
- `UnitState`: { unit, remainingModels, remainingWoundsPool, role, position }
- `SimulationConfig`: { startingDistance, includeOneTimeWeapons, initiative, maxRounds (default 1) }
- `SimulationResult`: { phaseLogs, endState }

## Implementation Steps
1) Add a `startingDistanceFromPoints(totalPoints: number)` helper with the defaults above and a `pickStartingDistance(armyA, armyB, override?)` that returns `override ?? max(defaultA, defaultB)`.
2) Add a slim `role-classifier` to label roles and compute `optimalRange` per unit (standoff distance for shooting vs. charge distance for melee-first).
3) Build `simple-engagement` that:
   - Initializes `ArmyState` and `UnitState` arrays,
   - Runs a single “advance to optimal range then resolve shooting + melee” sequence,
   - Produces a concise `SimulationResult`.
4) UI: add a “Quick Sim” panel to select two armies, show inferred starting distance with an editable field, initiative toggle, include-one-time toggle, and render the result table/log.
5) (Optional next) Add multi-round loop and better casualty allocation; later integrate terrain/cover/stratagem toggles.
