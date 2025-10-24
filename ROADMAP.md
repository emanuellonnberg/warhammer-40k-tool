# Warhammer 40K Unit Efficiency Analyzer - Roadmap

## Vision

Transform this tool from a damage calculator into a comprehensive tactical analysis platform that helps Warhammer 40K players make informed decisions about unit selection, army composition, and tactical deployment.

## Current Status

**Implemented Features:**
- ✅ Core damage calculations with hit/wound mechanics
- ✅ DPP (Damage Per Point) efficiency analysis
- ✅ Multiple weapon special rules (Rapid Fire, Melta, Blast, Torrent, Twin-Linked, Lance, Sustained Hits, Lethal Hits, Devastating Wounds, Anti-, Hazardous)
- ✅ Weapon mode toggling (overcharge, alternative firing modes)
- ✅ Interactive UI with sorting and filtering
- ✅ Custom army JSON upload
- ✅ Multi-target toughness analysis (T3-T8)

**Test Coverage:** Comprehensive unit tests for damage calculations and special rules

---

## Roadmap

### Priority 1: Critical Game Mechanics (High Impact)

These are essential 10th Edition mechanics that significantly affect combat calculations and are frequently used in the game.

#### 1.1 Re-roll Mechanics
**Status:** 🟢 Completed
**Effort:** Medium
**Impact:** High

**Description:**
Implement comprehensive re-roll mechanics that are extremely common in Warhammer 40K through abilities, stratagems, and weapon rules.

**Implementation Details:**
- Add `rerollHits`, `rerollWounds`, `rerollDamage` fields to `Weapon` interface
  - Support values: `"none"`, `"ones"`, `"all"`, `"failed"`
- Add `rerollHits`, `rerollWounds` to unit-level abilities
- Create `applyRerolls()` function in `src/calculators/damage.ts`
- Update probability calculations:
  - Re-roll 1s: `P = P_base + (1/6) * P_base`
  - Re-roll failed: `P = P_base + (1 - P_base) * P_base`
- Add UI toggles for common re-roll scenarios
- Add tooltips explaining re-roll impact on calculations

**Test Cases:**
- Re-roll 1s to hit with BS 3+
- Re-roll all failed wounds with S4 vs T4
- Re-roll damage rolls (for minimum damage weapons)
- Interaction with Twin-Linked (don't double-apply)

**Files to Modify:**
- `src/types/index.ts` - Add re-roll fields
- `src/calculators/damage.ts` - Implement re-roll logic
- `src/ui/controls.ts` - Add re-roll toggles
- `tests/calculators/damage.test.ts` - Add test coverage

---

#### 1.2 Feel No Pain (FNP) and Damage Mitigation
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** High

**Description:**
Add support for Feel No Pain (ignore wounds on X+) and other damage reduction mechanics that are critical for evaluating unit durability.

**Implementation Details:**
- Extend target profile to include:
  - `fnp: number` - Feel No Pain roll (e.g., 5 for 5+, 0 for none)
  - `damageReduction: number` - Flat damage reduction per attack
  - `maxDamagePerPhase: number` - Damage caps
- Apply FNP after save calculations: `finalDamage = damage * (1 - fnpChance)`
- Update damage calculations to account for damage reduction
- Add UI controls for target defensive abilities
- Show "expected casualties" accounting for FNP

**Test Cases:**
- 5+ FNP vs 1 damage weapons
- 4+ FNP vs D6 damage weapons
- Damage reduction (-1 damage minimum 1)
- Interaction with Devastating Wounds

**Files to Create/Modify:**
- `src/types/index.ts` - Add `TargetProfile` interface
- `src/calculators/damage.ts` - Apply FNP logic
- `src/ui/controls.ts` - Target profile configuration
- `src/ui/display.ts` - Show FNP impact in tooltips

---

#### 1.3 Additional Special Weapon Rules
**Status:** 🔴 Not Started
**Effort:** Medium-High
**Impact:** Medium-High

**Description:**
Implement remaining common weapon special rules to improve calculation accuracy.

**Rules to Implement:**

1. **Heavy** - -1 to hit when moving, +1 to hit when stationary
2. **Assault** - No penalty for advancing and shooting
3. **Precision** - Allocate wounds to character models
4. **Indirect Fire** - Ignore line of sight, penalties apply
5. **Ignores Cover** - Target cannot benefit from cover saves
6. **Psychic** - Special rules for psychic attacks
7. **Extra Attacks** - Additional attacks based on unit size or abilities

**Implementation Details:**
- Add weapon rule flags to `Weapon` interface
- Create rule-specific calculation modifiers
- Add combat state toggles (moving, stationary, advancing)
- Update `src/rules/special-weapons.ts` with new rules
- Add UI checkboxes for combat conditions

**Files to Modify:**
- `src/types/index.ts` - Add new weapon ability flags
- `src/rules/special-weapons.ts` - Implement rule logic
- `src/calculators/damage.ts` - Integrate new rules
- `src/ui/controls.ts` - Add combat state controls

---

#### 1.4 Cover and To-Hit Modifiers
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Medium

**Description:**
Add support for cover saves and hit modifiers that significantly impact damage calculations.

**Implementation Details:**
- Extend target profile with:
  - `inCover: boolean` - +1 to save when in cover
  - `stealth: boolean` - -1 to hit against this target
  - `hitModifier: number` - Custom hit roll modifier
- Apply modifiers to hit probability calculations
- Add cover save bonus to armor save calculations
- UI toggle for target in cover
- Show modified hit chances in tooltips

**Files to Modify:**
- `src/types/index.ts` - Add cover/modifier fields
- `src/calculators/damage.ts` - Apply modifiers
- `src/ui/controls.ts` - Cover toggle
- `src/ui/tooltip.ts` - Show modifier impact

---

### Priority 2: Enhanced User Experience (High Impact, Medium Effort)

#### 2.1 Visual Data Improvements
**Status:** 🔴 Not Started
**Effort:** High
**Impact:** High

**Description:**
Add charts, graphs, and visual representations to make data easier to understand at a glance.

**Features:**
- **Damage Curves** - Line chart showing damage output across T3-T12
- **DPP Comparison Bar Chart** - Visual unit efficiency comparison
- **Heatmap View** - Color-coded efficiency matrix (units × targets)
- **Weapon Breakdown Pie Chart** - Visual split of ranged/melee/one-time damage
- **Export Charts** - Save charts as PNG images

**Implementation Details:**
- Add charting library dependency (Chart.js or Recharts)
- Create `src/ui/charts.ts` module
- Add chart view toggle to switch between table/chart views
- Responsive chart sizing for mobile
- Color schemes matching Bootstrap theme

**Libraries to Consider:**
- Chart.js - Lightweight, good browser support
- Recharts - React-based, composable
- D3.js - Most powerful but steeper learning curve

**Files to Create:**
- `src/ui/charts.ts` - Chart generation logic
- `src/ui/visualization.ts` - Data transformation for charts

---

#### 2.2 Advanced Filtering and Search
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Medium-High

**Description:**
Make it easier to find specific units and filter by various criteria.

**Features:**
- **Search Bar** - Filter units by name (fuzzy search)
- **Role Filter** - HQ, Troops, Elites, Fast Attack, Heavy Support, etc.
- **Points Range Filter** - Slider to filter by points (e.g., 100-300 pts)
- **Weapon Type Filter** - Show only units with specific weapons
- **Efficiency Filter** - Show only high/medium/low efficiency units
- **Tag System** - Custom tags (anti-tank, anti-infantry, screening, etc.)

**Implementation Details:**
- Create `src/utils/filtering.ts` module
- Add filter state management
- Implement debounced search for performance
- Persist filter preferences in localStorage
- Add "Clear All Filters" button

**Files to Create/Modify:**
- `src/utils/filtering.ts` - Filter logic
- `src/ui/controls.ts` - Filter UI controls
- `src/ui/display.ts` - Apply filters to display

---

#### 2.3 Interactive Scenario Builder
**Status:** 🔴 Not Started
**Effort:** High
**Impact:** High

**Description:**
Allow users to configure detailed target profiles beyond just toughness value.

**Features:**
- **Custom Target Profiles**
  - Name (e.g., "Space Marine", "Guardsman", "Terminator")
  - Full characteristics (T, Sv, Inv, W, FNP)
  - Unit size (for Blast calculations)
  - Keywords (for Anti- rules)
  - Special rules (cover, stealth, etc.)
- **Combat Condition Toggles**
  - Charging/charged
  - Stationary/moving/advancing
  - In cover
  - Benefit of terrain
- **Scenario Presets**
  - Common target profiles (Marine, Guardian, Terminator, Tank, Monster)
  - Save to favorites
  - Export/import scenarios
- **Scenario Library**
  - Community-shared scenarios
  - Meta analysis (common tournament armies)

**Implementation Details:**
- Create `TargetProfile` interface with full characteristics
- Create `CombatScenario` interface combining profile + conditions
- Add scenario management UI (create/edit/delete/duplicate)
- Store scenarios in localStorage or IndexedDB
- Add preset scenarios in `src/data/scenarios.ts`

**Files to Create:**
- `src/types/scenario.ts` - Scenario interfaces
- `src/data/scenarios.ts` - Preset scenarios
- `src/ui/scenario-builder.ts` - Scenario UI
- `src/utils/storage.ts` - Scenario persistence

---

#### 2.4 Improved Mobile Experience
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Medium

**Description:**
Optimize the tool for tablet and mobile devices.

**Improvements:**
- Responsive table design (horizontal scroll, collapsible columns)
- Touch-optimized controls (larger tap targets)
- Collapsible unit cards (expand on tap)
- Mobile-friendly dropdowns and toggles
- Swipe gestures for navigation
- Reduced data display on small screens (prioritize key metrics)

**Implementation Details:**
- Audit current responsive breakpoints
- Improve Bootstrap grid usage
- Add mobile-specific CSS
- Test on various device sizes
- Add touch event handlers

**Files to Modify:**
- `styles.css` - Mobile-specific styles
- `src/ui/display.ts` - Responsive rendering
- `src/ui/controls.ts` - Touch-friendly controls

---

### Priority 3: Advanced Analysis Features (Medium-High Impact)

#### 3.1 Multi-Target Analysis
**Status:** 🔴 Not Started
**Effort:** High
**Impact:** High

**Description:**
Analyze unit performance across multiple target profiles simultaneously.

**Features:**
- Select multiple target profiles for comparison
- "Sweet Spot" analysis - what each unit is best at killing
- Versatility Score - performance variance across targets
- Optimal target identification
- Multi-target efficiency ranking

**Implementation Details:**
- Calculate damage against all selected targets
- Create versatility metric (inverse of variance)
- Identify and highlight optimal matchups
- Add multi-target view to unit cards
- Create comparative heatmap visualization

**Files to Create:**
- `src/calculators/multi-target.ts` - Multi-target analysis
- `src/ui/multi-target-view.ts` - Visualization

---

#### 3.2 Probability Distributions
**Status:** 🔴 Not Started
**Effort:** High
**Impact:** Medium-High

**Description:**
Show probability ranges instead of just average damage.

**Features:**
- Damage probability distribution (min/max/percentiles)
- "Chance to kill" specific models
- Confidence intervals (95%, 68%)
- Expected casualties vs unit sizes
- Reliability scoring (consistency of damage output)

**Implementation Details:**
- Implement Monte Carlo simulation (10,000+ iterations)
- Calculate damage distributions using convolution
- Add percentile calculations (5th, 50th, 95th)
- Show distributions as histograms or box plots
- Add "chance to kill X models" calculator

**Files to Create:**
- `src/calculators/probability.ts` - Distribution calculations
- `src/calculators/monte-carlo.ts` - Simulation engine
- `src/ui/probability-view.ts` - Distribution visualization

---

#### 3.3 Unit Synergy Analysis
**Status:** 🔴 Not Started
**Effort:** Very High
**Impact:** Medium

**Description:**
Identify units that work well together through buffs and abilities.

**Features:**
- Model aura abilities (re-rolls, +1 to hit, etc.)
- Buff stacking analysis
- Combo identification
- Force multiplier calculations
- Recommended unit pairings

**Implementation Details:**
- Add `abilities` field to units with aura effects
- Create ability effect system
- Calculate buffed vs unbuffed performance
- Identify optimal buff targets
- Show synergy scores

**Files to Create:**
- `src/types/abilities.ts` - Ability system
- `src/calculators/synergy.ts` - Synergy analysis
- `src/ui/synergy-view.ts` - Synergy visualization

---

#### 3.4 List Building Assistant
**Status:** 🔴 Not Started
**Effort:** Very High
**Impact:** High

**Description:**
Help players optimize army composition and identify list weaknesses.

**Features:**
- Suggest units to fill points gaps
- Identify role gaps (anti-tank, anti-infantry, screening)
- Budget optimizer (best units for remaining points)
- Meta analysis (counter common armies)
- Recommended purchases for new players

**Implementation Details:**
- Create unit role classification system
- Implement gap analysis algorithms
- Create recommendation engine
- Add meta army profiles
- Show list strength/weakness breakdown

**Files to Create:**
- `src/list-builder/classifier.ts` - Unit role classification
- `src/list-builder/optimizer.ts` - Optimization engine
- `src/list-builder/recommendations.ts` - Recommendation system
- `src/ui/list-builder.ts` - List builder UI

---

### Priority 4: Data Management & Quality of Life (Medium Impact)

#### 4.1 Army List Management
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Medium

**Features:**
- Save custom army lists to browser (localStorage/IndexedDB)
- Name and organize saved lists
- Edit lists directly in UI (add/remove/modify units)
- Export analysis to PDF/CSV/Excel
- Import from BattleScribe/Waha/New Recruit

**Files to Create:**
- `src/utils/storage.ts` - Persistence layer
- `src/utils/export.ts` - Export functionality
- `src/utils/import.ts` - Import parsers
- `src/ui/list-manager.ts` - List management UI

---

#### 4.2 Unit Database Improvements
**Status:** 🔴 Not Started
**Effort:** High
**Impact:** Medium

**Features:**
- Searchable unit encyclopedia
- Full unit stat cards
- Ability descriptions
- Links to official sources
- Community ratings and notes
- Version history (datasheet updates)

**Files to Create:**
- `src/data/unit-database.ts` - Centralized unit data
- `src/ui/unit-encyclopedia.ts` - Browse interface

---

#### 4.3 Comparison History
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Low-Medium

**Features:**
- Remember previous analyses
- Compare list versions
- Track meta changes over time
- Export comparison reports

**Files to Create:**
- `src/utils/history.ts` - History tracking
- `src/ui/history-view.ts` - History UI

---

### Priority 5: Combat Simulation (High Impact, High Effort)

#### 5.1 Turn-by-Turn Simulator
**Status:** 🔴 Not Started
**Effort:** Very High
**Impact:** High

**Description:**
Simulate complete combats with casualties and unit degradation.

**Features:**
- Multi-turn combat projection
- Account for model removal
- Unit degradation effects
- Monte Carlo simulation for probability ranges
- "Expected turns to wipe" calculations

**Implementation Details:**
- Create combat simulation engine
- Model casualty removal
- Account for morale and battleshock
- Show turn-by-turn breakdown
- Animate combat results

**Files to Create:**
- `src/simulator/combat-engine.ts` - Combat simulation
- `src/simulator/casualties.ts` - Model removal logic
- `src/ui/simulator.ts` - Simulation UI

---

#### 5.2 Mission-Based Analysis
**Status:** 🔴 Not Started
**Effort:** Very High
**Impact:** Medium-High

**Features:**
- Objective scoring potential
- Movement and positioning analysis
- OC (Objective Control) calculations
- Secondary objective tracking
- Mission-specific recommendations

**Files to Create:**
- `src/mission/objectives.ts` - Objective system
- `src/mission/scoring.ts` - Score calculations
- `src/ui/mission-view.ts` - Mission UI

---

### Priority 6: Performance & Technical (Low-Medium Impact)

#### 6.1 Performance Optimizations
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Low-Medium

**Improvements:**
- Lazy loading for large army lists
- Memoization of expensive calculations
- Web Workers for background calculations
- Virtual scrolling for long lists
- Progress indicators

**Files to Modify:**
- `src/calculators/damage.ts` - Add memoization
- `src/main.ts` - Add Web Worker support

---

#### 6.2 Testing & Quality
**Status:** 🟡 Partial
**Effort:** Medium
**Impact:** Low

**Improvements:**
- E2E tests (Playwright/Cypress)
- Visual regression testing
- Performance benchmarks
- Accessibility testing (WCAG compliance)
- More edge case coverage

---

#### 6.3 Developer Experience
**Status:** 🔴 Not Started
**Effort:** Medium
**Impact:** Low

**Improvements:**
- API documentation (JSDoc)
- Architecture diagrams
- Contributing guide
- Plugin system for custom rules
- Better error messages

---

### Quick Wins (Low Effort, Good Impact) ⚡

These can be implemented quickly and provide immediate value.

#### QW-1: Export/Share Features
**Status:** 🔴 Not Started
**Effort:** Low

**Features:**
- Share analysis via URL (encode data in query params)
- Copy results to clipboard (Discord/Reddit formatted)
- Screenshot generator
- Share image with embedded results

**Files to Create:**
- `src/utils/sharing.ts` - Share functionality
- `src/ui/share-button.ts` - Share UI

---

#### QW-2: Dark Mode
**Status:** 🔴 Not Started
**Effort:** Low

**Features:**
- Dark theme toggle
- Persist preference
- System preference detection
- Smooth transitions

**Files to Create:**
- `src/ui/theme.ts` - Theme management
- `styles-dark.css` - Dark theme styles

---

#### QW-3: Keyboard Shortcuts
**Status:** 🔴 Not Started
**Effort:** Low

**Features:**
- Navigate between units (J/K)
- Toggle settings (O/R/M)
- Quick search (/)
- Sort by columns (1-9)
- Help overlay (?)

**Files to Create:**
- `src/ui/keyboard.ts` - Keyboard handler

---

#### QW-4: Help & Tooltips
**Status:** 🟡 Partial
**Effort:** Low

**Improvements:**
- Explain calculations in plain language
- Rules reminder tooltips
- Interactive guided tour (Intro.js)
- FAQ section
- Video tutorials

**Files to Create:**
- `src/ui/help.ts` - Help system
- `src/ui/tour.ts` - Guided tour

---

#### QW-5: Better Error Handling
**Status:** 🔴 Not Started
**Effort:** Low

**Features:**
- Validation for uploaded JSON
- Clear error messages
- Fallback for missing data
- Debug mode

**Files to Modify:**
- `src/main.ts` - Global error handling
- All calculator files - Add validation

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Quick wins + critical missing mechanics

- ✅ QW-1: Export/Share Features
- ✅ QW-2: Dark Mode
- ✅ QW-3: Keyboard Shortcuts
- ✅ QW-4: Enhanced Help/Tooltips
- ✅ 1.1: Re-roll Mechanics
- ✅ 1.2: Feel No Pain

**Outcome:** Immediate user value + foundation for advanced features

---

### Phase 2: Core Mechanics (Weeks 3-6)
**Goal:** Complete game mechanics implementation

- ✅ 1.3: Additional Special Weapon Rules
- ✅ 1.4: Cover and To-Hit Modifiers
- ✅ 2.2: Advanced Filtering and Search
- ✅ 2.3: Interactive Scenario Builder

**Outcome:** Accurate combat calculations for all scenarios

---

### Phase 3: Analysis & Visualization (Weeks 7-12)
**Goal:** Enhanced insights and data presentation

- ✅ 2.1: Visual Data Improvements (Charts/Graphs)
- ✅ 3.1: Multi-Target Analysis
- ✅ 3.2: Probability Distributions
- ✅ 4.1: Army List Management

**Outcome:** Professional-grade analysis tool

---

### Phase 4: Advanced Features (Months 4-6)
**Goal:** Comprehensive tactical platform

- ✅ 2.4: Improved Mobile Experience
- ✅ 3.3: Unit Synergy Analysis
- ✅ 3.4: List Building Assistant
- ✅ 5.1: Turn-by-Turn Simulator

**Outcome:** Complete list building and tactical analysis suite

---

### Phase 5: Polish & Performance (Ongoing)
**Goal:** Refinement and optimization

- ✅ 4.2: Unit Database Improvements
- ✅ 5.2: Mission-Based Analysis
- ✅ 6.1: Performance Optimizations
- ✅ 6.2: Testing & Quality
- ✅ 6.3: Developer Experience

---

## Success Metrics

**User Engagement:**
- Active users per month
- Session duration
- Feature usage statistics
- Return visitor rate

**Technical Quality:**
- Test coverage >80%
- Page load time <2s
- Time to interactive <3s
- Zero critical bugs

**Community:**
- GitHub stars/forks
- Community contributions
- Issue resolution time
- Positive user feedback

---

## Contributing

This roadmap is a living document. If you'd like to contribute:

1. Check the roadmap for unstarted features
2. Create an issue to discuss implementation approach
3. Submit a PR with tests and documentation
4. Update this roadmap with implementation status

**Priority Legend:**
- 🔴 Not Started
- 🟡 In Progress
- 🟢 Completed
- ⏸️ Paused
- ❌ Cancelled

---

## Changelog

### 2025-10-24
- 🟢 Initial roadmap created
- Identified 24+ improvement areas
- Organized into 6 priority categories
- Defined 5-phase implementation plan
- 🟢 Completed Feature 1.1: Re-roll Mechanics
  - Implemented RerollType enum and RerollConfig interface
  - Created rerolls.ts calculator module with probability functions
  - Updated damage calculator to use new re-roll system
  - Maintained backward compatibility with Twin-Linked
  - Added 60 comprehensive tests (all passing)
  - Test coverage: 121/121 tests passing

---

*Last updated: 2025-10-24*
