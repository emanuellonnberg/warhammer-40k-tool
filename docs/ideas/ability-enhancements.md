# Ability & Rules Enhancements Backlog

## High-Value Improvements (Status)

1. **Aura/Reroll/Hit Mod Detection** ✅ *(implemented in parsing + UI)*
   - Parse recurring phrasing (“While this model is leading a unit… re-roll hits”, “Add 1 to the Hit roll”) into structured metadata.
   - Feed those flags into calculators so unit damage automatically reflects granted rerolls and +/- to-hit/-to-wound buffs instead of relying solely on scenario dropdowns.
   - Pros: Makes leader buffs automatic, reduces user error, and improves accuracy for every damage calculation.
   - Cons: Requires natural-language heuristics that can fail on unusual wording, and needs ongoing maintenance as GW phrasing evolves.
   - Implementation approach:
     - Maintain a compact pattern table (regex + metadata) keyed by the phrases GW uses most (“each time a model in that unit makes an attack, you can re-roll the Hit roll”, “you can re-roll wound rolls of 1”, etc.). Each entry describes the reroll type (`hits: 'all'`, `wounds: 'ones'`, `damage: 'failed'`) and the scope (“this unit” vs “this model”).
     - When parsing ability descriptions, normalize the text (lowercase, remove smart quotes) and test against the pattern table. On matches, store structured reroll info (including a `patternId` for debugging) on the unit or leader.
     - During leader attachment, merge leader-provided rerolls into the host’s `unitRerolls` so calculators pick them up automatically.
     - Future phrases just require adding another pattern entry—no exhaustive ability catalog needed.

2. **Bodyguard Toughness Override** ⏳ *(not started)*
   - When a leader is attached, enforce the 10th-edition rule that the unit uses the bodyguard’s toughness for incoming attacks.
   - Surface the effective toughness in the survivability tooltip to make durability gains obvious.
   - Pros: Matches tabletop adjudication and highlights defensive gains from key leaders.
   - Cons: Needs reliable detection of which model’s toughness should apply; multi-leader edge cases can get tricky.

3. **Hazardous / One-Shot Modeling** ⏳ *(not started)*
   - Tag hazardous and one-shot weapons with dedicated booleans.
   - Simulate expected mortal wounds from Hazardous tests and optionally auto-exclude one-use weapons unless a toggle is enabled.
   - Pros: Communicates the true cost of Hazardous guns and keeps one-use wargear from skewing averages.
   - Cons: Adds UI toggles and explanation overhead; expected mortal wounds math may not match every playgroup’s expectations.

4. **Transport + Embarked Buffs** ⏳ *(not started)*
   - Detect Dedicated Transports and the units embarked within them.
   - Allow users to “embark” units in the UI so movement, protection, and shooting restrictions are reflected in the dashboard.
   - Pros: Helps list writers understand tempo and protection trade-offs without manual notes.
   - Cons: Requires new state management, UX for embark/disembark, and awareness of transport capacity limits.

5. **Detachment/Doctrine Toggles** ⏳ *(not started)*
   - Promote force-level rules (e.g., Gladius Task Force doctrines) into UI controls so players can enable/disable them per analysis.
   - Display active detachment effects on each unit card for clarity.
   - Pros: Makes global buffs discoverable and lets users simulate early/late-game doctrine swaps.
   - Cons: More configuration clutter and potential confusion if users forget to toggle them per phase.

6. **Command Point Economy** ⏳ *(not started)*
   - Parse faction abilities or enhancements that grant/refund CP.
   - Add a small CP flow widget summarizing baseline CP per round, refunds, and miracle-dice-to-CP conversions.
   - Pros: Offers strategic insight into stratagem budgets, especially for CP-hungry factions.
   - Cons: Hard to model dynamic CP generation (mission tacticals, opponent triggers), so outputs may feel approximate.

7. **Secondary/Mission Role Hints** ⏳ *(not started)*
   - Use keywords (Battleline, Deep Strike, Scout) to tag units with recommended mission roles (objective holders, action monkeys, strike teams).
   - Expose quick filters/pills on unit cards for these roles.
   - Pros: Helps players spot which slots handle primaries, actions, and skirmishing at a glance.
   - Cons: Keyword heuristics can misclassify edge cases; too many badges risk UI noise.

8. **Threat Profiling** ⏳ *(not started)*
   - Classify weapons as anti-vehicle, anti-infantry, etc., based on Strength/AP/Damage.
   - Show coverage charts so players can quickly spot matchup gaps.
   - Pros: Reveals army balance issues (e.g., lacks anti-T12) without deep manual analysis.
   - Cons: Requires nuanced thresholds (e.g., melta vs. 2W infantry) and may oversimplify mixed-loadout units.

9. **Attachment Export/Import** ✅ *(partially complete: roster defaults + reset button shipped; full export back into JSON still pending)*
   - Persist leader attachment choices back into the optimized JSON so sharing a tuned roster keeps its leader pairings without extra setup.
   - Provide a “Reset to roster defaults” button to drop back to the attachments embedded in the file.
   - Pros: Captures designer intent when sharing lists and now offers a one-click way to revert after experimentation.
   - Cons: Need versioning/compat rules so older analyzers ignore unknown fields, plus UX copy to explain overwriting local tweaks.

These items can be broken into individual stories as we prioritize. Let me know which ones to tackle first.*** End Patch*** End Patch

