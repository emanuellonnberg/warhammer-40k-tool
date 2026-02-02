---
description: How to look up Warhammer 40k 10th edition rules
---

# Rules Reference

This workflow describes how to find game rules in the repository.

## Available Rule Documents

| File | Contents |
|------|----------|
| `rules/rules.md` | Complete 10th edition core rules |
| `rules/mission_pack_2025_2026_rules.md` | Current competitive mission rules |

## 10th Edition Game Structure

### Phases (in order)
1. **Command Phase** - Battle-shock tests, Command abilities
2. **Movement Phase** - Normal moves, Advance, Fall Back
3. **Shooting Phase** - Ranged attacks
4. **Charge Phase** - Declare and roll charges
5. **Fight Phase** - Melee combat

**Note**: There is NO separate Psychic Phase in 10th edition. Psychic abilities are used during relevant phases.

## Key Rule Sections in `rules/rules.md`

Search for these sections:

### Core Concepts
- Engagement Range: `ENGAGEMENT RANGE`
- Unit Coherency: `UNIT COHERENCY`
- Visibility: `DETERMINING VISIBILITY`

### Movement
- Normal Moves: `NORMAL MOVE`
- Advance: `ADVANCE`
- Fall Back: `FALL BACK`

### Combat
- Hit Roll: `HIT ROLL`
- Wound Roll: `WOUND ROLL`
- Saving Throw: `SAVING THROW`
- Damage: `ALLOCATE DAMAGE`
- Feel No Pain: `FEEL NO PAIN`

### Terrain
- Cover: `COVER`
- Obscuring: `OBSCURING`
- Dense: `DENSE`

### Abilities
- Deadly Demise: `DEADLY DEMISE`
- Deep Strike: `DEEP STRIKE`
- Fights First: `FIGHTS FIRST`
- Infiltrators: `INFILTRATORS`
- Leader: `LEADER`
- Lone Operative: `LONE OPERATIVE`
- Scouts: `SCOUTS`
- Stealth: `STEALTH`

## Looking Up Specific Rules

To search for a rule:

```bash
# In PowerShell
Select-String -Path "rules\rules.md" -Pattern "KEYWORD" -Context 5,10
```

Or use grep in the codebase search.
