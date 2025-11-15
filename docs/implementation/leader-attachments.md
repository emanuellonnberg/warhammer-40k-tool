# Leader Attachments Plan

## Goal

Add interactive support for Warhammer 40K 10th edition Leader units so users can attach eligible Leaders to bodyguard units inside the analyzer UI, see the combined profile, and detach them again. Combined units should aggregate weapons, points, rules, and abilities so downstream efficiency/damage calculations reflect the attachment accurately.

## Current State

- Army JSON (`parse_json.py`) exports each unit independently. Leader permissions (which units they can join) only exist as free‑text inside the `Leader` ability descriptions.
- The UI (`src/ui/display.ts`) renders each unit card separately; there is no concept of an attached unit or of unit composition state.
- Calculators operate on a `Unit` object and assume its weapons/abilities already capture any bonuses.

## High-Level Approach

1. **Branching** – work on `feature/leader-attachments` to isolate the feature until it is stable.
2. **Roster Export Enhancements** – enrich unit data when parsing roster JSON:
   - Detect `Leader` abilities and extract allowed unit names. Many BattleScribe exports format this as bullet points (`■ Unit Name`). We can split lines starting with `■` or hyphens and capture the plain text.
   - Store the structured list in a new field, e.g. `unit["leaderOptions"] = [...]`.
   - Tag leader units with `unit["isLeader"] = True` to simplify UI checks.
3. **Type Updates** – extend `src/types/index.ts`:
   - `interface Unit` gains optional `isLeader?: boolean`, `leaderOptions?: string[]`, and `attachedLeaders?: AttachedLeader[]`.
   - Introduce `interface LeaderAttachment { leaderId: string; mergedUnit: Unit; sourceUnitId: string; }` or similar to track state.
4. **Front-End State Model**
   - In `src/main.ts`, maintain a persistent `attachments` map keyed by host unit ID.
   - When attachment state changes, derive a fresh `Army` clone where:
     - Leaders assigned to hosts are removed from the top-level `army.units`.
     - Host units receive an `attachedLeaders` array with metadata (leader name/id, points, rules, weapons).
     - Host unit stats update: add leader points to host `points`, concatenate weapons (with deduped IDs), and merge `rules`/`abilities` arrays (unique per ID).
     - Optionally annotate derived data so we can reverse the merge when detaching (e.g., keep `baseUnit` references or store `originalUnits` map in memory rather than mutating fetched data in place).
5. **UI/UX Changes**
   - **Leader Card Controls**: If `unit.isLeader` is true and there are eligible targets present:
     - Render an “Attach to Unit” button opening a modal/dropdown listing filtered units from the current roster that appear in `leaderOptions` and are not already hosting that leader.
     - Provide search/filter in modal if list is long.
   - **Host Card Indicators**:
     - Display attached leaders as badges/pills with name + summary of their key buffs.
     - Include a “Detach” button per leader to remove the attachment.
     - Show combined points/weapon counts, but also a tooltip showing the base unit vs leader contribution for transparency.
   - **Split Button**: When a host has at least one attached leader, render a “Detach Leader(s)” control (either per leader or a general “Manage Leaders” button) to undo the merge.
6. **Calculations & Rules Propagation**
   - Since calculators already look at `unit.rules`, `unit.abilities`, `unit.weapons`, and `unit.points`, merging leader data into the host before passing it into `displayAnalysisResults` should automatically apply rules/abilities to the combined unit (meeting the “rules that affect the entire unit” requirement).
   - For abilities that confer rerolls (e.g., “While this model is leading a unit, you can re-roll hits”), we can add heuristics in `parse_json.py` to set `unit.unitRerolls` or structured modifiers when a leader has known keywords. This can be iteratively enhanced; initial scope can rely on textual rules merged into the host.
7. **Persistence & UX Considerations**
   - Store attachment choices in `localStorage` keyed by army file so a reload preserves the configuration.
   - Guard against invalid states (e.g., attaching a leader twice, or attaching when target unit isn’t present).
   - Provide user feedback (toast/alert) when an attachment is created or removed.
8. **Testing Strategy**
   - Add parser tests to ensure `leaderOptions` extraction works with representative ability text.
   - Add Vitest unit tests around a pure helper that merges a leader with a host unit to verify points, weapons, and rules merging.
   - Add integration/UI tests (where feasible) to simulate attaching/detaching via DOM events.

## Implementation Steps

1. **Preparation**
   - `git checkout -b feature/leader-attachments`
   - Ensure sample rosters in `public/` contain leader-capable units for manual testing.
2. **Parser Enhancements**
   - Implement helper `extract_leader_options(description: str) -> list[str]`.
   - While processing unit abilities in `parse_json.py`, set `unit["isLeader"]` and `unit["leaderOptions"]`.
   - Export these fields in all generated JSON files.
3. **Type & Data Layer Updates**
   - Update TypeScript interfaces and anywhere the new fields need defaults.
   - Add utility functions (e.g., `mergeLeaderIntoUnit(leader, host)` and `detachLeaderFromUnit(host, leaderId)` in `src/utils/leader.ts`).
4. **State Management**
   - Extend `main.ts` to maintain `currentAttachments` and derive a `displayArmy` before every render.
   - Ensure file uploads/reset actions clear or reconcile attachments cleanly.
5. **UI Components**
   - Create reusable modal or dropdown component under `src/ui/controls.ts` for selecting target units.
   - Update unit card rendering to include attachment controls, badges, and detach actions.
   - Hook into existing event listeners to trigger re-render when attachments change.
6. **Persistence & Feedback**
   - Save attachments per army key in `localStorage`.
   - Surface success/error alerts near the unit cards or via toast notifications to confirm user actions.
7. **Testing & Documentation**
   - Add tests as described above.
   - Update README or UI docs to explain how to use the feature.
   - Include screenshots/GIF (optional) showing attach/detach flow once implemented.
8. **Review & Merge**
   - Run `npm run test`, `npm run build`, and linting before opening PR.
   - Summarize changes referencing this plan when filing the pull request.

## Open Questions / Follow-ups

- Should attaching a leader automatically adjust survivability formulas beyond merged stats (e.g., enforce the “use bodyguard toughness” rule)? Initial implementation will rely on the host’s existing toughness; future work could model this explicitly.
- Leaders sometimes can join multiple different units simultaneously (rare). We assume one leader per host for now.
- Some army lists allow multiple characters to join the same host; the data structure should technically allow `attachedLeaders: LeaderAttachment[]`.

## Implementation Status (2025-11-14)

- **Parser** (`parse_json.py`): Leader abilities are now parsed into structured metadata. We detect `Leader` profiles, mark the originating unit with `isLeader`, and persist the bullet-listed bodyguard names in `leaderOptions`.
- **TS Converter** (`src/converter.ts`): Mirrors the Python parser logic so rosters optimized via the browser converter now emit `isLeader` and `leaderOptions`, keeping both pipelines consistent.
- **Default Attachments**: When Battlescribe files already embed characters within bodyguard units, both parsers capture that relationship and emit an `attachments` map plus per-leader `defaultHostId`. The UI consumes this to hide those leaders automatically until the user detaches them.
- **Types & Utilities** (`src/types/index.ts`, `src/utils/leader.ts`): `Unit` carries the new leader flags plus `attachedLeaders`. Helper functions (`mergeLeaderIntoUnit`, `applyLeaderAttachments`) deep-clone units, merge weapons/rules/abilities, and surface attached leader summaries for the UI.
- **State Management** (`src/main.ts`): Leader attachments live in an `AttachmentMap`, are persisted per army (name + faction) in `localStorage`, and are reapplied whenever an army is (re)loaded. Custom DOM events (`leader-attach`, `leader-detach`) keep the rendering pipeline decoupled from the UI controls.
- **UI/UX** (`src/ui/display.ts`): Leader cards now render inline controls with a filtered dropdown of eligible units plus an attach button. Host cards show attached leader pills (name, stat summary, detach button). Detach operations immediately split the unit, re-rendering the table and cards.
- **Remaining Work**:
  - Surface validation feedback inline (currently uses `alert`).
  - Expand tests (parser extraction, leader helper coverage) and add a short README section for end users.
  - Consider batching UI state so weapon mode toggles do not fully reset when attachments change.

Document Owner: _TBD_ (update when implementation starts)  
Last Updated: 2025-11-14

