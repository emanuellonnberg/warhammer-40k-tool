# Movement-Aware Simulation Plan (from Core Rules scan)

Sources: `rules/core_rules.pdf`, `rules/quic_start_guide.pdf`, `rules/errata.pdf`.

## Key Movement/Phase Constraints to Model
- **Battle round phases (simplified):** Command (optional), Movement, Shooting, Charge + Fight. Turn order alternates by initiative.
- **Movement:**
  - Normal move: up to MV; cannot end within 1" (engagement) of enemy unless charging.
  - Advance: MV + D6; units that Advance cannot shoot unless they only have Assault weapons (or we globally disallow shooting after advance for now).
  - Engagement Range: 1"; models already in engagement cannot move except Fall Back.
  - Fall Back (optional later): leave engagement, no shooting/charging that turn.
  - No base overlap; infantry may pass through friendly infantry, otherwise block movement (keep simple collision-separation).
- **Shooting:**
  - Only if not Advanced (unless Assault flag).
  - Must be within weapon range; cannot shoot if within engagement (unless Pistol; optional later).
  - Each weapon/group fires once per phase; declare a single target per unit (later: per-weapon targeting).
- **Charge & Fight:**
  - Charge distance: 2D6" (expected 7"); must end within 1".
  - Units in engagement fight; pile-in optional later.
  - If no charge reach, skip fight for that pair.
- **Deaths:** Remove models as wounds deplete; units wiped stop acting in later phases/turns.

## Implementation Steps
1) **Phase loop:** Already multi-turn; ensure each turn has Movement → Shooting → Melee, and stop when an army is wiped. Expose max turn setting.
2) **Movement rules:**
   - Move each unit up to MV toward nearest valid enemy; respect a 1" no-go buffer unless charging.
   - Add Advance toggle (per turn or global) that adds D6 but blocks shooting (except Assault).
   - Add simple collision separation (no overlapping circles; infantry can pass-through flagged).
3) **Range checks per weapon:**
   - Require target within max weapon range before firing; skip if none in range.
   - Optionally, per-weapon-group targeting instead of single best target per unit.
4) **Charge step before melee:**
   - Compute charge reach (expected 7") plus Move already spent? Simpler: 7" dash from post-move position.
   - Only melee units in engagement range swing; otherwise no melee damage.
5) **UI stepping:**
   - Keep Prev/Next phase stepping, but show turn/phase labels and charge outcomes.
6) **Future fidelity:**
   - Implement pistols-in-engagement, Assault after Advance, Fall Back, and cover/LoS gates.
