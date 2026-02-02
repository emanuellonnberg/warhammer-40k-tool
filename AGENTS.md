# Agent Instructions - Warhammer 40k Analysis Tool

## Project Overview
This is a Warhammer 40,000 10th Edition battle simulation and army analysis tool.

## Key Resources

### Rules Reference
- **Core Rules**: `rules/rules.md` - Complete 10th edition core rules
- **Mission Pack**: `rules/mission_pack_2025_2026_rules.md` - Current competitive mission rules

### 10th Edition Key Points
- **5 Phases only**: Command → Movement → Shooting → Charge → Fight
- **No Psychic Phase** - Psychic abilities are used during relevant phases
- **OC (Objective Control)** - Units have OC values for holding objectives
- **Stratagems** - CP-based tactical options (Command Re-roll, Overwatch, etc.)

## Project Structure

### Simulation Engine (`src/simulation/`)
| File | Purpose |
|------|---------|
| `simple-engagement.ts` | Main battle simulation engine |
| `planner.ts` | Tactical AI movement planning |
| `ability-parser.ts` | Centralized ability text parsing |
| `ability-registry.ts` | Structured ability definitions (auras, etc.) |
| `terrain.ts` | Terrain features and cover |
| `pathfinding.ts` | NavMesh-based pathfinding |
| `dice-damage.ts` | Dice-based damage calculations |

### Calculators (`src/calculators/`)
- `damage.ts` - Expected damage calculations
- `rerolls.ts` - Re-roll probability math

### Types (`src/types.ts`)
Core type definitions for Unit, Weapon, Army, etc.

## Testing
```bash
npm run test          # Run all tests
npx vitest run        # Run tests once
npx vitest --watch    # Watch mode
```

## Current Ability System Status

### ✅ Implemented
- Deployment abilities (Deep Strike, Scout, Infiltrator)
- Defensive abilities (Stealth, Feel No Pain, Invulnerable Saves)
- Combat abilities (Lethal Hits, Sustained Hits, Devastating Wounds)
- Aura abilities (Captain re-rolls, Lieutenant wound re-rolls)
- Leader attachments

### ⚠️ Partially Implemented
- Objective Secured / OC values
- Fights First/Last combat sequencing

### ❌ Not Yet Implemented
- Stratagems (Command Re-roll, Overwatch, etc.)
